# 떡상이(ddeoksang) 20번째 캐릭터 추가 (v0.17.25)

## 서사

"여의주만 얻으면 승천한다" — 아기용(龍). **급등 = 승천**(위로 부유 상승),
**급락 = 물속 입수**(가격 HUD를 수면으로 활용해 그 뒤로 잠김).

## 수정

- 이미지: `img/il/ddeoksang_{base,pump,dump}.png` (사용자 제공, 256px 규격).
- `styles/illustrated-characters.css`:
  - `--ilsize: 96px` 보정 (체감 96px 내외), `--ilshift-x: 0`. **두 변수 혼용 금지 규칙 준수**
    — 크기는 --ilsize 로만, --pet-user-scale 은 건드리지 않음.
  - 이미지 3종 참조 + 컨셉 모션(파일 말미 매집이 블록 다음).
  - **pump 승천**: `.pet` `dg-rise 2.6s ease-in-out infinite` + `drop-shadow(0 0 12px rgba(247,197,49,0.55))`
    (금색 여의주 오라). 표준 il-jump/녹색 그림자를 오버라이드.
  - **dump 입수(2단)**: `.pet` `dg-sink 1.4s ease-in forwards, dg-bob 3s ease-in-out 1.4s infinite`
    + `drop-shadow(0 0 9px rgba(90,160,210,0.45))`, `.body { transform:none }`.
    dg-sink(forwards)가 36px 지점에서 멈춘 뒤 지연 시작된 dg-bob(같은 시작점 36px)이 이어받아 물속 부유.
- `main.js` 캐릭터 메뉴: "떡상이 (아기용)" 라디오, value `il-ddeoksang`, **매집이 다음** 위치.
- CLAUDE.md 표/카운트(19→20종), CSS 카운트 주석(18→20종) 갱신.

## 불변사항 / 주의

- **⚠ 컨벤션 5번의 의도적 예외**: dump 입수 애니메이션은 "하강 성분"을 크게(최대 +41px) 넣어
  캐릭터가 가격 HUD(z-index 30) **뒤로 잠기게** 만든다. 이는 "수면 아래 입수"라는 서사를 위한
  **의도된 연출**이며, 다른 캐릭터의 il-sob 재기준 원칙(진동 중심 0 유지)과 다르다.
  → 향후 이 캐릭터의 dump 오프셋을 "겹침 버그"로 오인해 되돌리지 말 것.
- 무대 기준선(58px)·HUD 위치·z-index 층위 자체는 건드리지 않았다. 잠김은 오직 떡상이 dump
  키프레임의 translateY 값으로만 구현 — 전역 레이아웃 불변.
- pump 키프레임의 25%/75% 스텝은 rotate 미지정(사용자 스펙 그대로) — 회전값이 보간되어 부드럽게 흔들림.
- 키프레임 이름 `dg-rise/dg-sink/dg-bob` 은 기존 `il-*` 와 충돌 없음(신규 네임스페이스).
- 뽕식·존버처럼 base만 있는 게 아니라 **base/pump/dump 3종 모두 존재** — 표정 스왑 정상 동작.
