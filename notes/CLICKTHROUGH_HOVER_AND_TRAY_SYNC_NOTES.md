# 클릭 통과 호버 활성 + 트레이 메뉴 동기화 (v0.17.28)

## 문제 (사용자 지적 2건)

1. **클릭 통과 시 우클릭도 죽음** — `setIgnoreMouseEvents(true)`는 좌/우 클릭을
   모두 무시해서, 통과 모드에선 펫 우클릭 메뉴조차 못 열어 설정을 되돌릴 수 없었다.
2. **펫 메뉴 ↔ 트레이 메뉴 상태 불일치** — 트레이는 `setContextMenu(buildMenu())`로
   **시작 시점의 스냅샷**을 박아둬서, 이후 설정을 바꿔도 트레이 메뉴의 체크/라디오가
   갱신되지 않았다. 펫 메뉴는 매번 새로 빌드라 최신 → 둘이 어긋남.

## 수정

### ② 트레이 동기화 (main.js createTray)
- `tray.setContextMenu(...)`(고정 스냅샷) **제거**. `tray.on("right-click", () =>
  tray.popUpContextMenu(buildMenu()))`만 유지 → 우클릭마다 현재 settings로 새로 빌드.
  펫 메뉴(`ipcMain.on("pet-context-menu")`)와 동일 소스라 항상 동기.
- setContextMenu + right-click 핸들러 병존으로 인한 중복/충돌 소지도 제거.

### ① 클릭 통과 호버 활성 (dwell)
Electron 클릭 통과는 **창 단위 전부-아니면-전무**라 "좌클릭만 통과 + 우클릭만 활성"을
같은 픽셀에서 버튼별로 나눌 수 없다. 그래서 `forward:true`(이미 설정됨)로 넘어오는
마우스 이동을 히트테스트해 **dwell(기본 500ms) 후 창 전체를 잠깐 상호작용 가능**하게 한다.

- **renderer/hover-activate.js** (신규): `BtcPetHoverActivate([.pet, #pill], {dwellMs:500})`.
  clickThrough일 때만 동작. 펫/필 rect 위에 dwell 머물면 `setInteractive(true)`,
  벗어나거나 창 밖(mouseleave)이면 `setInteractive(false)`. display:none 요소(rect 0)는 무시.
- **preload.js**: `setInteractive(on)` 노출.
- **main.js**: `ipcMain.on("set-interactive")` → `setIgnoreMouseEvents(!on, {forward:true})`.
  단 `settings.clickThrough`가 아닐 때의 늦은 메시지는 무시(항상 상호작용 유지).
- **main.js 메뉴**: 클릭통과 토글 시 `broadcast("setting-changed","clickThrough",...)` 추가
  (렌더러가 dwell 로직 on/off를 알도록). 라벨도 "펫에 잠깐 올리면 조작 가능"으로 안내.
- **overlay-app.js**: hover 인스턴스 생성 + 초기 clickThrough 반영 + setting-changed 연동.

## 불변사항 / 주의

- **dwell 기본 500ms** (hover-activate.js 상수). 스쳐 지나갈 땐 통과 유지가 핵심 —
  값을 너무 낮추면 지나가다 창이 마우스를 삼키는 옛 문제로 회귀.
- 활성 판정 기준은 **펫(.pet)/필(#pill) rect** 이지 창 전체(#wrap 180x216)가 아니다.
  전체로 잡으면 빈 직사각형이 다시 마우스를 삼킴 — 반드시 실제 캐릭터 영역 기준.
- `set-interactive`는 **clickThrough 모드에서만** 유효(main 가드). 통과 꺼진 일반 모드는
  항상 상호작용이라 렌더러 dwell 로직이 개입하면 안 됨.
- 통과 상호작용은 "펫 위에서는 좌클릭이 통과 대신 펫에 먹힘"이 의도된 트레이드오프
  (Electron 제약상 버튼별 분리 불가). 빈 영역 통과는 그대로 유지됨.
- 엣지: ignore+forward 상태에서 dwell 대기 중 창 밖으로 빠르게 나가면 타이머가
  그대로 발화해 잠깐 활성될 수 있음(무해, 다음 이동에서 재평가). mouseleave로 최대한 방어.

## 후속: 드래그 중 끊김 수정 (v0.17.29)

- **증상**: 통과 모드에서 펫을 깨운 뒤 드래그하면 이동 중 뚝 끊김.
- **원인**: 창이 커서를 따라오는 데 미세 지연이 있어, 빠른 드래그 시 커서가 순간
  펫 rect 밖으로 나감 → `_move`가 "벗어남"으로 판정 → `setInteractive(false)` →
  창이 다시 마우스 무시 → drag-controller의 mousemove/mouseup 유실로 드래그 중단.
- **수정 (hover-activate.js)**: `held` 플래그 추가. mousedown(통과 모드)에서 true,
  mouseup/blur에서 false. `_move`·`_leave`는 `held`면 **비활성화를 보류** →
  드래그 내내 상호작용 유지. mouseup 시 커서가 펫 밖이면 그때 비활성화.
- **불변사항**: 드래그를 "시작"하려면 여전히 dwell 500ms로 먼저 깨워야 함(설계).
  held는 이미 깨운 뒤의 드래그가 끊기지 않게만 보장한다.
