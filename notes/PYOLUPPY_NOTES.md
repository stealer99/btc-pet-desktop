# 표루피(pyoluppy) 21번째 캐릭터 — 풀 스펙 이식 (v0.17.31)

HANDOFF.md 스펙 그대로 이식. 기존 "이미지 3장 스왑 + CSS 모션" 규칙을 벗어나는
캐릭터라, **전용 컨트롤러로 격리**해 다른 20종과 공유 mood-controller를 안 건드린다.

## 왜 전용 컨트롤러인가

기존 mood-controller는 idle/pump/dump 3상태(±0.12%)뿐. 표루피는 7상태
(idle/pump/pumpStrong/dump/dumpStrong/despair/sleepy) + 파생 타이머 + 봉 발광 레이어가 필요.
그래서 `renderer/pyoluppy-controller.js`가 표루피 선택 시에만 engage되어 wrap className과
글로우 div를 **소유**하고, 그동안 mood-controller는 `paused`로 className을 안 건드린다.

## 파일별 변경

- **renderer/pyoluppy-controller.js** (신규): 상태머신 + 글로우 레이어 + dev 테스트 훅.
  - 모멘텀 65초 윈도우 자체 계산(mood와 독립). 임계값 ±0.5%/±2% (HANDOFF).
  - 전환 규칙: 상승계↔하락계 직행 금지 → idle(base) 0.3s 브릿지(`_bridging` 플래그로 보호).
  - dumpStrong 3s → despair 자동 승격 타이머. idle 10분 연속(조정값 SLEEPY_MS) → sleepy.
    (초기 30분은 실전에서 거의 안 떠서 10분으로 낮춤 — 새벽/주말 조용한 장에 실제로 뜨게)
  - 이미지 스왑 시 pop, pumpStrong 최초 진입 시 entrance(.pet에 1회, JS).
  - 봉 글로우 div 2개(.pet에 append). GLOW 좌표테이블(256px 실측) × scale(=petW/256)로 배치.
    상태별 색/애니(glowPulse/Mid/Hard)/blur/opacity 인라인 지정. dump가 pump보다 강함(의도).
  - idle 중 8~12초 랜덤 idleTilt 1회(JS로 .body 인라인 애니 잠깐 교체 후 CSS sway 복귀).
- **mood-controller.js**: `set()`에 `paused` 가드. paused여도 `current`는 계속 추적
  (disengage 시 복원용).
- **overlay-app.js**: pyo 인스턴스 + 가격 라우팅(engage 시 `pyo.onPrice`) + `applyCharacter()`
  (표루피 → mood.paused + pyo.engage / 그 외 → pyo.disengage + mood 복원) + 캐릭터/ fxStyle
  변경 연동 + dev 테스트(pump→pumpStrong, dump→dumpStrong) 라우팅.
- **illustrated-characters.css**: `.c-il-pyoluppy` 이미지 스왑 + py-* 본체 keyframe
  + 글로우 스타일/keyframe + reduced-motion. `--ilsize: 104px`.
- **overlay.html**: pyoluppy-controller.js include.
- **main.js**: 캐릭터 메뉴 "표루피 (야광봉 시그널맨)" value `il-pyoluppy`.
- CLAUDE.md 표/카운트(20→21), CSS 카운트 주석.

## 불변사항 / 주의 (HANDOFF 확정 사항)

- **글로우 좌표는 픽셀 실측값** — 임의 조정 금지. 필요 시 컨트롤러의 GLOW 테이블 숫자만 수정.
- **dump 글로우는 pump보다 강함**(0.7s/scale1.12/blur11)이 확정 사양. 대칭 금지.
- **이미지 재생성 금지**(포즈/디테일 붕괴로 기각됨). 원본 5장 유지.
- **격리 원칙**: 표루피 로직은 pyoluppy-controller.js에만. disengage 시 .pet/.body 인라인
  스타일(animation/filter) 정리 + 글로우 div 제거 → 다른 캐릭터 오염 금지 (공유 DOM이므로 필수).
- `--ilsize: 104px`는 추정 보정값. 글로우는 256px 기준이라 ilsize만 바꿔도 비율 유지됨.
- 표루피에는 봉 마감(candle) 전용 연출 없음 — mood.hold("candle")은 paused라 no-op(스펙에 없음).
- **미검증**: 실제 마우스/시세 동작(글로우 정렬, 상태 전환, despair/sleepy 타이머)은
  화면에서 육안 검수 필요. preview.html과 나란히 비교 권장.

## 후속: 반응 감도 수정 (v0.17.33)

- **증상**: 빅 상승이 나왔는데 표루피가 계속 sleepy(자고 있음).
- **원인**: HANDOFF의 고정 임계 pump 0.5% / strong 2% (65초 모멘텀 기준)가 너무 둔감.
  다른 펫은 앱 감도 0.12%로 반응하는데 표루피만 4배 둔감 → 완만한 상승은 65초 창에서
  0.5% 미만으로 보여 계속 idle → 30분 뒤 sleepy. 빅 상승이 와도 안 깸.
- **수정 (pyoluppy-controller.js)**:
  - 진입 임계를 **앱 감도(cfg.moodPumpPct/DumpPct, 기본 0.12%)** 에서 읽도록(`_band`).
    pump/dump는 다른 펫과 동일, pumpStrong/dumpStrong = 진입 임계 × 3.5(STRONG_MULT).
    → 사용자 감도 설정도 자동 반영됨(기존엔 무시했음).
  - sleepy는 작은 변동(|pct| ≥ WAKE_PCT 0.05%)에도 idle로 즉시 깸 (HANDOFF "가격 움직이면 즉시 해제").
- **불변사항**: HANDOFF의 고정 0.5%/2%는 실측 모멘텀에 안 맞아 폐기. 감도는 앱 설정을 따른다.
  65초 모멘텀 특성상 "이미 끝난 상승"(현재 가격 평평)은 여전히 idle — 이건 모든 펫 공통(모멘텀 기반).

## 후속: 히스테리시스 추가 — 반응이 다른 펫보다 덜 보이던 문제 (v0.17.34)

- **증상**: 감도 임계를 맞췄는데도 상승/하락 반응이 다른 캐릭터보다 "덜 보이는" 느낌.
- **원인**: mood-controller(다른 펫)는 enter(0.12%)/exit(0.07%) **히스테리시스**로 한번 pump에
  들면 모멘텀이 exit 밑으로 갈 때까지 pump를 **유지**한다. 표루피는 하드 임계뿐이라 모멘텀이
  0.12% 밑으로 내려가는 즉시 idle로 튕겨 → 반응이 짧고 덜 보였음.
- **수정 (pyoluppy-controller.js)**: `_band` → `_targetState`로 교체. 현재 상태를 보고
  상승계/하락계에 있으면 `exit`(cfg.moodExitPct, 기본 0.07%)까지 유지, 그 아래로 가야 idle.
  strong은 진입 임계 × 3.5. 모멘텀 윈도우도 `cfg.moodWindowMs`(앱 감도 윈도우)로 통일.
  → 이제 진입 임계·유지 구간·윈도우 모두 다른 펫과 동일. 사용자 감도 설정도 그대로 반영.

## 후속: 2단계(strong) 경계 다듬기 (v0.17.35)

- 2단계 pumpStrong 진입 = 0.42%(0.12×3.5, 65초). 20배 기준 ~8% 손익 → "긴박" 반응으로 적절, 유지.
- **① entrance 반복 버그**: pump↔pumpStrong을 오갈 때마다 "아래서 점프 등장(entrance)"이 재생돼
  0.42% 근처에서 튀어 보임. HANDOFF "최초 진입 1회" 위반. → entrance는 **상승계가 아닌 상태
  (idle/하락/sleepy)에서 pumpStrong으로 처음 튀어오를 때만** 재생(`!UP.has(prev)`), pump→strong
  재진입은 pop만.
- **② strong 경계 히스테리시스**: `STRONG_EXIT_RATIO 0.7` — strong 진입은 0.42%, 강등은
  0.42%×0.7≈0.29% 밑으로 가야 pump로. 경계 깜빡임(→entrance 반복) 원인 제거.
- 불변사항: strong 배수 3.5(0.42%)는 사용자 확정(레버리지 체감 기준). exit-ratio 0.7은 깜빡임
  방지용 튜닝값.

## 후속: sleepy 자세 변경 — 서서 조는 → 엎드려 자기 (v0.17.37)

- **에셋**: `pyoluppy_sleepy.png` 교체(봉을 바닥에 내려놓고 엎드려 자는 자세, 256px 하단정렬).
- **doze 애니메이션**: 누운 자세라 좌우 로킹(rotate)은 어색 → **하단 기준 호흡(스쿼시)** 로 교체.
  `@keyframes py-doze { 0%,100%{scaleY(1) scaleX(1)} 50%{scaleY(1.05) scaleX(0.985)} }`, **3.2s**.
  부풀 때 가로 0.985로 살짝 눌리는 스쿼시가 핵심 — 진짜 호흡하는 볼륨감. (scaleY만이면 너무 미묘)
  `.py-sleepy .body`에 `transform-origin: 50% 100%`(하단 기준) **필수** — 아래에서 부풀어야 자연스러움.
- **GLOW sleepy 좌표**: 봉이 세로가 아니라 바닥에 수평으로 놓임 →
  `l:['red',90,218,115,24,-4], r:['green',79,231,108,18,-4]` (넓고 낮은 수평 바).
- HANDOFF.md도 doze keyframe·sleepy 테이블(3.2s)·GLOW sleepy 좌표 동기화.
- 불변사항: sleepy 트리거(10분 횡보)·다른 상태·GLOW_ANIM(faint pulse)은 변경 없음.
  좌표·스쿼시 값은 256px 실측/사용자 확정 — 임의 조정 금지, 테이블 숫자만 수정.

### 개발자 모드 sleepy/despair 테스트 버튼 (0.17.37 동봉)

- sleepy(10분)·despair(dumpStrong 3초)는 실시간으로 띄우기 어려워 dev 패널에서 확인 불가였음.
- panel.html mood-test 그리드에 **Sleepy* / Despair*** 버튼 추가(＊=표루피 전용). 핸들러가
  `data-action` 범용이라 panel.js 수정 불필요.
- 액션 허용: main.js pet-test 검증 + overlay-app onPetTest 검증에 sleepy/despair 추가,
  pyo.test map에 sleepy→sleepy / despair→despair (holdUntil 5초로 모멘텀 무시하며 표시).
- **표루피 전용 가드**: overlay-app에서 pyo.active 아니면 sleepy/despair 무시 — 다른 캐릭터에
  bogus `m-sleepy` 클래스 안 붙게(candle이 표루피에서 no-op인 것과 대칭).
