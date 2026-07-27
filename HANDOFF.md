# 표루피 — 캐릭터 이식 핸드오프

btc-pet-desktop(Electron)의 신규 캐릭터. 야광봉 든 표루피가 BTC 시세에 따라 봉을 흔드는 컨셉.
이 문서 하나로 이식 가능하도록 전체 스펙을 담았다. `preview.html`이 동작 레퍼런스(단일 파일, 브라우저에서 열면 됨).

## 파일 구성

```
signalman/
├── HANDOFF.md          # 이 문서
├── preview.html        # 동작 레퍼런스 (이미지 base64 내장, 그대로 실행 가능)
└── assets/
    ├── pyoluppy_base.png     # 256×256 RGBA, 횡보 (빨강+초록 봉 하나씩)
    ├── pyoluppy_pump.png     # 상승 (초록 봉 2개, 점프)
    ├── pyoluppy_dump.png     # 하락 (빨강 봉 2개, 격노)
    ├── pyoluppy_despair.png  # 절망 (봉 내리고 빛 꺼짐) — 급락 지속 시
    └── pyoluppy_sleepy.png   # 졸음 (차렷 자세, zzz) — 장기 횡보 시
```

원본 3장(base/pump/dump)은 기존 소스, 절망/졸음 2장은 AI 편집으로 신규 제작 후
배경 투명화·그림자 제거·256px 리사이즈 완료. 추가 후처리 불필요.

## 상태 머신

가격 변동률(%) 기준. 기존 캐릭터들과 동일한 트리거 체계를 쓰되, 이 캐릭터 고유의
파생 상태 2개(절망, 졸음)가 있다.

| 상태 | 이미지 | 트리거 | 비고 |
|---|---|---|---|
| idle | 01_base | -0.5% ~ +0.5% | 기본 |
| pump | 02_pump | +0.5% ~ +2% | |
| pumpStrong | 02_pump | +2% 이상 | 이미지 동일, 애니만 강화 |
| dump | 03_dump | -0.5% ~ -2% | |
| dumpStrong | 03_dump | -2% 이하 | 진입 3초 후 → despair 자동 전환 |
| despair | 04_despair | dumpStrong 3초 경과 후 | dumpStrong 조건 유지되는 동안 지속 |
| sleepy | 05_sleepy | idle 30분 이상 지속 (권장값, 조정 가능) | 가격 움직이면 즉시 해제 |

### 전환 규칙

1. **상승계(pump/pumpStrong) ↔ 하락계(dump/dumpStrong/despair) 직행 금지.**
   반드시 idle(01_base)을 0.3초 경유한다. 연출 의도: 봉을 바꿔 드는 시간.
2. 모든 이미지 스왑 시 `pop` 애니메이션(scale 0.9 → 1.0, 0.22s ease-out) 1회.
3. pumpStrong 최초 진입 시 `entrance`(화면 아래 +120px에서 점프 등장, 0.5s,
   cubic-bezier(.2,1.4,.4,1)) 1회 재생 후 루프 시작.
4. dumpStrong: shakeHard 3초 → 04_despair로 스왑 + despair 애니 + 글로우 dim.
5. despair 상태에서 반등(+0.5% 이상) 시: idle 경유 → pump. (기존 규칙 1 적용)

## 캐릭터 본체 애니메이션 (CSS keyframes)

```css
@keyframes sway      { 0%,100% { transform: translateX(-3px); } 50% { transform: translateX(3px); } }
@keyframes idleTilt  { 0%,100% { transform: rotate(0); } 45% { transform: rotate(-5deg); } }
@keyframes bounce    { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px) rotate(2deg); } }
@keyframes bounceBig { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-14px) scale(1.05); } }
@keyframes shake     { 0% { transform: translateX(-5px) rotate(-2deg); } 50% { transform: translateX(5px) rotate(2deg); } 100% { transform: translateX(-5px) rotate(-2deg); } }
@keyframes shakeHard { 0% { transform: translateX(-8px); } 50% { transform: translateX(8px); } 100% { transform: translateX(-8px); } }
@keyframes droop     { 0%,100% { transform: translateY(4px) rotate(-1deg); } 50% { transform: translateY(6px) rotate(1deg); } }
@keyframes doze      { 0%,100% { transform: rotate(-1.5deg) translateY(0); } 50% { transform: rotate(1.5deg) translateY(2px); } }
@keyframes pop       { 0% { transform: scale(.9); } 100% { transform: scale(1); } }
@keyframes entrance  { 0% { transform: translateY(120px); opacity: 0; } 100% { transform: translateY(0); opacity: 1; } }
```

| 상태 | keyframe | duration | 부가 효과 |
|---|---|---|---|
| idle | sway | 2.4s infinite | 8~12초 랜덤 간격으로 idleTilt(0.7s) 1회 끼워넣기 |
| pump | bounce | 0.55s infinite | |
| pumpStrong | bounceBig | 0.34s infinite | `drop-shadow(0 0 10px rgba(74,222,128,.75))` |
| dump | shake | 0.32s infinite | |
| dumpStrong | shakeHard | 0.15s infinite | `drop-shadow(0 0 10px rgba(248,113,113,.8))` |
| despair | droop | 3.4s infinite | |
| sleepy | doze | 3.8s infinite | |

`prefers-reduced-motion: reduce`일 때 전부 `animation: none`.

## 봉 발광 레이어 (핵심 연출)

캐릭터 이미지 위에 글로우 div 2개(좌/우 봉)를 겹쳐 펄스시킨다.
`mix-blend-mode: screen`, `border-radius: 50%`, 기본 `blur(13px)`.

```css
.glow.red   { background: radial-gradient(ellipse, rgba(255,80,80,.95), rgba(255,80,80,0) 70%); }
.glow.green { background: radial-gradient(ellipse, rgba(90,255,140,.95), rgba(90,255,140,0) 70%); }

@keyframes glowPulse     { 0%,100% { opacity: var(--lo,.35); } 50% { opacity: var(--hi,.85); } }
@keyframes glowPulseMid  { 0%,100% { opacity: .5; transform: scale(1) rotate(var(--rot)); }
                           50%     { opacity: 1;  transform: scale(1.12) rotate(var(--rot)); } }
@keyframes glowPulseHard { 0%,100% { opacity: .55; transform: scale(1) rotate(var(--rot)); }
                           50%     { opacity: 1;   transform: scale(1.25) rotate(var(--rot)); } }
```

| 상태 | 애니메이션 | 비고 |
|---|---|---|
| idle | glowPulse 2.6s | 느긋한 숨쉬기 |
| pump | glowPulse 1.1s | |
| dump | glowPulseMid 0.7s + blur 11px | 상승보다 다급·응축된 느낌 (의도된 비대칭) |
| pumpStrong / dumpStrong | glowPulseHard 0.45s | 최강 |
| despair | 고정 opacity 0.18, 펄스 없음 | 봉 빛 꺼진 설정 |
| sleepy | glowPulse 3.6s, --lo:.2 --hi:.5 | 희미한 잔광 |

### 봉 좌표 테이블 (이미지 픽셀 분석 실측값)

**256px 원본 좌표 기준.** 렌더 크기가 다르면 `scale = 렌더px / 256` 곱해서 배치.
포맷: `[색, 중심x, 중심y, 폭, 높이, 회전deg]`

```js
const GLOW = {
  idle:       { l: ['red',   28,  65, 44, 110, -10], r: ['green', 224,  93, 46, 100,  16] },
  pump:       { l: ['green', 25,  91, 50, 112, -22], r: ['green', 219,  61, 46, 110,  16] },
  pumpStrong: { l: ['green', 25,  91, 50, 112, -22], r: ['green', 219,  61, 46, 110,  16] },
  dump:       { l: ['red',   31,  54, 50, 112, -12], r: ['red',   230,  93, 54, 112,  22] },
  dumpStrong: { l: ['red',   31,  54, 50, 112, -12], r: ['red',   230,  93, 54, 112,  22] },
  despair:    { l: ['red',   58, 190, 34,  80, -25], r: ['red',   195, 190, 34,  80,  25] },
  sleepy:     { l: ['red',   63, 200, 38,  84, -38], r: ['green', 208, 215, 40,  70,  38] },
};
```

배치 로직 (preview.html의 `place()` 그대로):

```js
el.style.width  = w * scale + 'px';
el.style.height = h * scale + 'px';
el.style.left   = (cx - w / 2) * scale + 'px';
el.style.top    = (cy - h / 2) * scale + 'px';
el.style.setProperty('--rot', rot + 'deg');
```

주의: 글로우 div는 캐릭터 이미지와 **같은 래퍼 안**에 두고, 본체 transform 애니메이션은
래퍼가 아니라 **img에만** 걸어야 함... 이 아니라 preview 기준으로는 본체 keyframe이 img에,
pop/entrance성 래퍼 효과가 wrap에 걸려 있음. 글로우가 캐릭터 움직임(shake 등)을 따라가게
하려면 글로우를 img와 함께 움직이는 내부 컨테이너로 묶는 개선 여지 있음 — preview에서는
글로우가 wrap 고정이라 shake 시 봉과 미세하게 어긋나는데, 흔들림 폭(±5~8px)이 작아 실사용
크기에서는 티가 안 나는 수준. 신경 쓰이면 구조 변경 검토.

## btc-pet-desktop 통합 체크리스트

- [ ] 기존 캐릭터 등록 포맷(캐릭터 목록/매니페스트)에 "표루피" 추가 — 기존 20종 구조 참고
- [ ] assets 5장을 프로젝트 캐릭터 리소스 경로로 복사
- [ ] 상태 머신: 기존 가격 변동률 판정 로직에 위 임계값 매핑
- [ ] 이 캐릭터 고유 로직 2개 구현:
  - dumpStrong 3초 타이머 → despair 전환 (상태 이탈 시 타이머 클리어 필수)
  - idle 지속시간 트래킹 → sleepy 전환 (30분 권장, 설정값으로 빼기)
- [ ] pump↔dump 브릿지(0.3s base 경유) — 기존 캐릭터에 이 개념이 없다면 이 캐릭터 전용 훅으로
- [ ] 글로우 레이어: 캐릭터 렌더 컴포넌트에 div 2개 + GLOW 테이블. 기존 캐릭터에 없는
      요소이므로 옵셔널 필드(예: `glowLayers`)로 설계하면 다른 캐릭터에 영향 없음
- [ ] reduced-motion 대응 유지
- [ ] preview.html과 나란히 놓고 육안 비교로 검수

## 튜닝 노트 (확정된 사용자 피드백)

- dump 글로우는 pump보다 **강하게**가 확정 사양 (0.7s/scale1.12/blur11 vs 1.1s). 대칭으로 맞추지 말 것.
- 글로우 위치는 눈대중 배치 → 어긋남 피드백 → 픽셀 분석 실측으로 확정된 값. 임의 조정 금지,
  조정 필요 시 GLOW 테이블 숫자만 수정.
- 이미지 스타일 통일을 위한 재생성은 시도했다가 기각됨(포즈/디테일 붕괴). 원본 유지가 확정.
