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
  - 모멘텀 60초 윈도우 자체 계산(mood와 독립). 임계값 ±0.5%/±2% (HANDOFF).
  - 전환 규칙: 상승계↔하락계 직행 금지 → idle(base) 0.3s 브릿지(`_bridging` 플래그로 보호).
  - dumpStrong 3s → despair 자동 승격 타이머. idle 30분(조정값 SLEEPY_MS) → sleepy.
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
