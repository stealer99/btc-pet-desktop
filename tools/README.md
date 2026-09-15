# tools — 산책 모드 그림 제작 도구 (설치 파일에는 포함되지 않음)

필요: Python 3 + `pip install pillow numpy`

## 새 캐릭터
```powershell
python tools/new_character.py cat "야근냥이" "a tired office-worker calico cat wearing a loose red tie" --fixed "two pointed ears; exactly ONE red tie"
```
1. `art-src/characters/cat/prompts/00~05_*.md` 순서대로 AI(Astra 등)에 넣고, 안내된 이름으로 저장
2. `python tools/build_assets.py --only cat` — 변환 + 품질 검사
3. `tools/walk-preview.html?char=cat` — 걷기·서있기·달리기·터덜터덜 확인, fps·속도는 `character.json` 에서 조정 후 2번 다시
4. 앱: 우클릭 메뉴 > 산책 캐릭터 (2명 이상일 때 표시) 또는 마을 설정 창

## 새 건물
```powershell
python tools/new_building.py cafe "☕ 카페" "a cozy coffee shop with a striped awning" --units 2.5 --sign "COFFEE"
python tools/new_building.py binance "🟨 바이낸스 타워" "a modern tower in yellow and black" --units 4 --sign "{exchange}" --board btc
```
1. `art-src/town/prompts/<key>.md` 를 AI 에 넣고 `art-src/town/<key>.png` 로 저장
2. `python tools/build_assets.py --town`
3. 앱: 마을 설정 창 건물 목록에 자동으로 나타남 (체크·순서 조정)

> 저장소에는 레시피가 쓰는 **확정 원본만** 올린다. 버린 시안은 로컬에 두고 `.gitignore` 에 추가 (`*.prompt.txt`·`art-src/buildings/` 는 이미 제외)

## 레시피
| 파일 | 내용 |
|---|---|
| `art-src/characters/<key>/character.json` | 동작별 `file` · `cols`/`rows` · `fps` · `speed`(키 72px 기준 px/s) · `ground`(cell/row) · `rowsRepeat` |
| `art-src/town/town.json` | `sheets`(파일·격자·칸별 건물) · `buildings`(label·units·sign·board·nightLamps·nightMaskFrom·noWindows) · `order` |

- `ground: "row"` — 두 발이 다 뜨는 프레임이 있는 동작(달리기). 줄마다 가장 낮은 발을 땅으로
- `rowsRepeat: true` — 윗줄을 아랫줄에 일부러 반복한 시트(서있기·무릎 달리기). "윗줄·아랫줄 같음" 경고를 끔
- `sign` — 고정 글자 또는 `{company}`(회사 이름 설정) · `{exchange}`(시세 거래소 이름)
- `board` — `btc`(BTC 가격 전광판) · `usdt`(테더 원화 가격 전광판). 급등·급락·가격 알림 때 개미가 이 건물로 달려감
  · `neon`(마을 설정 "네온 전광판" 문구를 네온 글자로, 은은한 깜빡임·긴 문구는 흐름). btc/usdt 와 달리 **그림 전광판 크기 그대로** 쓰므로 그림에서 크게 그린다
- `nightLamps` — 밤 버전에서 노란 전구(극장 간판식 테두리 전구 등)를 켜 둔다. `--board neon` 이면 자동으로 켜짐
- `nightMaskFrom` — 벽이 창문 색과 같아 밤 불빛이 벽까지 켜질 때, 같은 크기·모양 건물의 창문 위치를 빌림

## 품질 검사 경고 (build_assets.py)
| 경고 | 흔한 원인 → 대응 |
|---|---|
| 칸마다 캐릭터 크기가 달라요 | AI가 칸마다 크기를 다르게 그림 → 다시 뽑기 |
| 배경 마젠타가 남았어요 | 캐릭터에 분홍·보라색 → 색 바꿔 다시 뽑기 |
| 윗줄과 아랫줄 실루엣이 거의 같아요 | 반대 다리가 안 나옴 → 미리보기로 확인, 달리기면 `04_run.md` 의 무릎 올리기 방식 |
| 프레임끼리 모양 차이가 거의 없어요 | 움직임이 약함 → 미끄러지듯 보이면 다시 뽑기 |
| 전광판/간판 자리를 못 찾았어요 | 전광판은 어두운 회색 빈 화면, 간판은 크림색 빈 판이어야 함 |
| 밤 버전: 창문 인식 비율 이상 | 벽이 하늘색 → `nightMaskFrom` 또는 벽색 바꿔 다시 뽑기 / 창문 없는 건물은 `noWindows` |

실루엣 검사로는 팔이 튀는 문제 같은 건 못 잡는다 — 마지막 확인은 항상 미리보기로.

## 개별 도구
- `sprite_slice.py` — 격자 시트 1장 → 캐릭터 시트 (`slice_sheet()`)
- `town_slice.py` — 건물 시트 1장 → 건물들 + 밤 버전 (`slice_buildings()`)
- `walk-preview.html` — 동작·마을 미리보기 (`?char=` 또는 `?dir=`)
- `prompts/` — 프롬프트 템플릿 (교훈이 생기면 여기를 고치면 다음부터 반영)
