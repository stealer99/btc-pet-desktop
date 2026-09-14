# v2 산책 모드 — 스프라이트 변환 파이프라인 (개발 도구, 앱 코드 변경 없음)

> **현재 방식은 레시피 + `tools/build_assets.py`** (tools/README.md, notes/V2_WALK_MODE_NOTES.md "제작 파이프라인").
> 아래는 출근개미를 처음 만들 때의 기록이라 경로가 옛날 것이다: `art-src/chulgeun` → `art-src/characters/chulgeun`,
> 출력 `img/walk/chulgeun/sprites.js` → `img/walk/characters.js`.

## 배경

- v2 "작업표시줄 산책" 모드는 CSS 모션이 아니라 **프레임 스프라이트**로 걷는다.
  첫 캐릭터는 신규 **출근개미**(`chulgeun`), 그림은 ChatGPT(Astra)로 격자 시트를 생성.
- AI 시트는 칸마다 캐릭터 위치·크기가 조금씩 어긋나고 배경이 단색 마젠타(노이즈 약간)라
  그대로는 못 쓴다 → 자르기·배경 제거·정렬을 자동화하는 도구가 필요.

## 추가한 것

1. `tools/sprite_slice.py` — 격자 시트 → 가로 시트 `{name}.png` + `{name}.json` + `sprites.js`
   - 크로마키: `m = min(R,B) - G`. 실측 배경 m≈244, 캐릭터 m<20 → `KEY_LO=25`, `KEY_HI=225` 사이만 반투명
   - 반투명 경계는 **역합성(unpremultiply)** 으로 마젠타 성분을 빼서 분홍 테두리 제거
   - 잡티: 가장 큰 덩어리 면적 2% 미만 제거 (scipy 없이 BFS)
   - 세로 정렬: 불투명 최하단 = 발 기준선 (걷기 중 한 발은 항상 땅) → 몸 위아래 흔들림은 보존됨
   - 가로 정렬: **머리 띠(bbox 높이 25~50%) 무게중심** → 다리·팔·배가 움직여도 머리 고정
   - 배율: 머리 폭을 `--head-width`(기본 140px)로 통일 → 동작 시트끼리 캐릭터 크기 일치
   - 리샘플은 `RGBa`(프리멀티플라이)로 해야 투명 경계가 안 더러워짐
   - anchorX = 프레임 가로 중앙 → 코드에서 좌우 반전해도 머리 위치 불변
2. `tools/walk-preview.html` — 작업표시줄 모형 위에서 시트를 나란히 재생·비교
   - 프레임 구성(8 / 윗줄 4 / 1·3·5·7), fps, 이동 속도, 캐릭터 키, 다크/라이트, 프레임 단위 이동, 겹쳐보기
   - file:// 로 열어도 되게 JSON fetch 대신 `<script>` 매니페스트 + canvas `drawImage`
     (CSS background-position 방식은 소수 배율에서 옆 프레임이 비칠 수 있어 사용 안 함)
3. 원본 그림 폴더 `art-src/chulgeun/` (turnaround, walk_cycle, walk_cycle2) / 변환 결과 `art-src/chulgeun/out/`

## 사용법

```powershell
python tools/sprite_slice.py art-src/chulgeun/chulgeun_ant_walk_cycle.png  --name walk_a --out art-src/chulgeun/out
python tools/sprite_slice.py art-src/chulgeun/chulgeun_ant_walk_cycle2.png --name walk_b --out art-src/chulgeun/out
start tools/walk-preview.html
```

## 걷기 확정값 (미리보기 비교 결과)

- 시트: **A** (`chulgeun_ant_walk_cycle.png` → `walk_a`). B 는 보류
- **8프레임 전체**, **10 fps**, 이동 **40 px/s**, 캐릭터 키 **72px**
- 크기를 바꾸면 발 미끄러짐 방지를 위해 이동 속도도 비례: 약 **0.56 × 캐릭터 키 / 초**

## MVP 4동작 변환 (확정 원본 → out/)

| 동작 | 원본 | 옵션 | 시작값 |
|---|---|---|---|
| walk | `chulgeun_ant_walk_cycle.png` | `--ground cell` | 10 fps · 40 px/s (확정) |
| idle | `chulgeun_ant_idle_cycle.png` | `--ground cell` | 6 fps · 제자리 |
| run (급등) | `chulgeun_ant_dash_knee_cycle.png` (팔 뒤로 뻗기 + 보폭↔무릎 올리기) | `--ground row` | **12 fps · 90 px/s (확정)** |
| trudge (급락) | `chulgeun_ant_trudge_cycle_v2.png` | `--ground cell` | 7 fps · 20 px/s |

- `--speed` 는 캐릭터 키 72px 기준값으로 meta 에 기록. 미리보기는 동작 전환·자동 시연·동작별 fps/속도 조절 지원
- 버린 원본: `walk_cycle2`(B), `run_cycle_v2`(더듬이 두 개가 하나로 합쳐짐),
  `run_cycle_v3`(팔이 다리 박자와 따로 놀아 6·8번에서 가슴 앞으로 순간이동)
- 팔 흔들기는 AI가 프레임 순서를 자주 틀린다 → 달리기는 **팔 고정 자세**(뒤로 뻗기)로 해결
- `dash_cycle`: 8칸 모두 같은 다리가 앞(아랫줄이 윗줄 복사) → 한 발로 깡충 뛰는 느낌
- `dash_cycle_v2`: "먼 다리를 어둡게" 지시 → 색만 바뀌고 **실루엣은 동일**해 음영이 깜빡이는 느낌.
  프레임 순서 재배열(1,2,3,4,3,2 등)로도 "다리가 뒤로 가는" 느낌이 안 생김 → 폐기
- **해결(`dash_knee_cycle`)**: 다리 자세를 실루엣이 확 다른 두 종류(보폭 = 다리 벌림 / 무릎 올리기 =
  한 다리로 서고 무릎을 배 앞으로)로만 정의하고 **윗줄 4칸에 한 주기 전체**, 아랫줄은 반복 지시
  → AI의 "윗줄 복사" 습관이 오히려 안전해짐. 작게 보면 색보다 **실루엣 변화**가 움직임을 만든다
- 남은 한계: 자세가 4개뿐이라 약간 뚝딱거림. 사용자 판단으로 섞기(크로스페이드) 0% 그대로 확정.
  더 부드럽게 하려면 중간 자세 4장만 추가로 받아 끼워 넣는 방식(스크립트에 시트 합치기 기능 필요)
- dash 는 몸이 앞으로 기울어 원본 머리 폭이 약간 좁게 측정됨(228 vs 238) → 배율이 0.614 로
  다른 동작(≈0.59)보다 약 4% 커짐. 동작 전환 시 크기 튀면 `--head-width` 를 134 정도로 낮춰 보정

### AI 프롬프트 교훈
- **더듬이·넥타이 모양을 바꾸라는 지시는 붕괴를 부른다.** "넥타이가 뒤로 날림" → 넥타이 2개,
  "더듬이를 뒤로 넘김" → 더듬이 합쳐짐, "더듬이가 처짐" → 헤드폰처럼 보임
  → 프롬프트에 **FIXED PARTS**(더듬이 2개 분리 고정, 넥타이 1개 가슴 고정) 블록을 두고
  동작별로는 **자세·팔다리·표정만** 바꾼다 (CLAUDE.md 캐릭터 파이프라인 규칙과 같은 원리)
- 재생성 시 **문제 있던 결과물을 참고 이미지로 첨부하지 않는다** (결함이 따라옴)

## 작업표시줄 마을 (건물)

- 원본: `art-src/town/buildings.png`(2×2: 집·회사·가게형 거래소 2) — **집·회사만 사용**,
  `art-src/town/exchange_towers.png`(1×2: 타워형 업비트·비트겟). 가게형 거래소는 "편의점 같다"는 이유로 타워로 교체
- `tools/town_slice.py`: 칸별 트림 PNG + json. 캐릭터와 달리 **바닥 중앙 기준**, **리샘플 없음**,
  화면 크기는 `heightUnits`(출근개미 키 배수)로 코드가 결정 → 원본 해상도가 달라도 단위로 통일
  - 높이: 집 2 · 회사 3 · 거래소 4 (72px 기준 거래소 288px = 1080p 작업영역의 약 28%. 5배는 너무 가림)
  - 전광판 화면(무채색 어두운 회색 57,55,54)·간판(크림 253,246,228) 사각형 **자동 검출** → 코드가 글자 얹음.
    채움률 85%↑·가로:세로 2↑ 조건으로 집 벽 같은 넓은 면 오검출 방지
- AI 건물 프롬프트 규칙: **글자·로고·숫자 전부 금지, 간판/전광판은 비워서** 받는다
  (AI 글자 깨짐 + 공식 로고 상표 문제 회피, 거래소 교체 시 글자만 바꾸면 됨)
- 미리보기: 배치(화면 폭 10%·33%·64%·86%), 간판 글자, 가짜 시세 전광판, 건물 크기·아랫줄 토글, 화면 가림 % 표시
- 확인된 한계: 72px 기준 전광판 화면이 약 96×26px → **두 줄이면 아랫줄(%)이 7px 수준으로 너무 작음**
- 해결: **전광판은 코드로 덮어 그린다.** 그림 전광판의 가운데·바닥(다리 붙는 곳)을 유지한 채 위·양옆으로
  키움. 테두리 색·두께는 town_slice.py 가 그림에서 측정해 `screenFrameColor`/`screenFramePx` 로 기록
  → 170%에서 윗줄 약 17px · 아랫줄 약 12px. 사용자 비교 후 **150% 확정** (72px 기준)

## 불변사항 / 주의

- 앱 코드(main.js, renderer/, styles/)는 **변경 없음** → 버전 증가 없음.
- **빌드 포함 주의**: package.json 에 `build.files` 가 없어 현재 `tools/`, `art-src/` 도 설치 파일에 들어간다.
  v2 코드 작업 시작 시 `build.files` 에서 두 폴더를 제외할 것.
- AI 시트 규칙(프롬프트에 명시): 오른쪽 3/4면, 단색 `#FF00FF`, 격자선·글자 없음, 모든 칸 같은 크기·같은 발 높이.
  마젠타 계열(분홍 볼터치 등 R·B 높고 G 낮은 색)이 캐릭터에 들어가면 키잉에 먹힌다.
- 머리 띠 비율(25~50%)은 "더듬이 위 + 큰 머리" 체형 기준. 체형이 다른 캐릭터는 `HEAD_BAND` 재확인.
