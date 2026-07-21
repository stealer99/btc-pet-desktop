# 물타기 잔망루피 오마쥬 신판 교체 (v0.17.26)

## 배경 / 컨셉

물타기(비버)를 **피치핑크 비버 + 구명튜브** 신판으로 교체.
핵심은 dump 연출 — **이미지 1장이 아니라 2레이어**로 "겉은 태연, 속은 대참사"를 표현한다:

- **겉모습**: 앉은 미니(`multagi_dump_mini.png`), 선명하고 **정지**. 왼쪽 하단에 작게.
- **속마음**: 대성통곡 본체(`multagi_dump_soul.png`)가 미니 **뒤에서 제자리 페이드로 서서히** 드러남.

## 이미지 변경

- 신규: `multagi_base.png`, `multagi_pump.png`, `multagi_dump_mini.png`, `multagi_dump_soul.png`
- 삭제: 기존 `multagi_dump.png` (단일 dump 이미지, 신판에선 2레이어로 대체)

## 수정 (styles/illustrated-characters.css)

- `--ilsize` 81 → **90px** (신판 base 몸높이가 캔버스를 꽉 채우는 256 기준, 90px대 캐릭터와 균질).
  `--ilshift-x` 0 유지. **--pet-user-scale 과 혼용 금지 규칙 준수**.
- base/pump: 기존 방식 그대로 이미지 스왑.
- **dump `.body`(겉모습 미니)**: `multagi_dump_mini.png` + `background-size: 52% auto` +
  `background-position: -10px bottom`(본체보다 좌측으로 더 빼기, 튜닝값) +
  `transform: none`(전역 m-dump scaleY(0.95) 눌림 제거 → 미니 선명 유지).
- **dump `.pet::before`(속마음)**: `multagi_dump_soul.png`, `opacity:0`에서
  `mt-reveal 2s ease-in forwards`(→0.82) 후 `mt-linger 3.4s …2s infinite`(0.82↔0.75 미세 호흡).
- **dump `.pet::after`(분홍 무드 글로우)**: radial-gradient, `z-index:-1`, `blur(6px)`,
  `mt-mood 0.8s`로 페이드 인.
- **dump `.pet`**: `animation: none; filter: none;` — 미니는 미동 없이 앉아있고, 전역 dump의
  il-sob 증폭 + 붉은 drop-shadow 오라를 **제거**(무드 글로우가 대체).

## 레이어 순서 (확정)

뒤 → 앞: **무드 글로우(::after, z-index:-1)** → **속마음(::before, auto z-index)** → **미니(.body)**.
`::before` 는 자동 z-index라 트리 순서상 `.body` 보다 먼저 그려져 자연히 뒤에 온다(별도 z-index 불필요).
미니 PNG의 투명 영역으로 뒤의 속마음이 비쳐 보이는 구조.

## 불변사항 / 사용자 확정 스펙 (되돌리지 말 것)

- **속마음은 이동/스케일 금지 — 제자리 순수 페이드로만** 드러난다. (transform 애니메이션 넣지 말 것)
- dump 는 **2레이어 구조**가 정체성. 단일 이미지로 되돌리거나 미니에 모션을 넣지 말 것.
- 속마음 최대 불투명도 **0.82**, 붉은 오라 없음(분홍 글로우로 대체) — 사용자 확정.
- 키프레임 이름 `mt-reveal/mt-linger/mt-mood` 는 기존 `il-*`/`dg-*` 와 충돌 없음(신규 네임스페이스).
- `--ilsize: 90px` 는 이미지 기준 추정 보정 — 실제 화면에서 다른 캐릭터와 체감차 있으면 이 값만 미세 조정.
