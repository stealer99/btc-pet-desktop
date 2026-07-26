# 투명 펫 창 컴포지팅 소실 자동 복구 (v0.17.26)

## 증상 / 진단

- 펫이 **가끔 안 보인다**. 그런데:
  - 우클릭 메뉴로 **"펫 숨기기 → 보이기"** 하면 **원래 자리에 그대로 다시 보인다**.
  - **패널은 항상 멀쩡**하다.
- 이 조합이 원인을 특정한다:
  - "원래 자리에 다시 보임" → **좌표는 정상**. 화면 밖으로 나간 게 아니다(멀티모니터 오프스크린 가설은 탈락).
  - `hide()`→`show()` 로 복구됨 → **투명 always-on-top 창의 컴포지팅 픽셀만 소실**됐다가
    재표시 시 강제로 다시 그려지는(recomposite) 현상.
  - 패널은 열 때마다 새로 `show()` 되는 창이라 항상 갓 그려짐. 펫은 상주 창이라 한 번 깨지면
    빈 채로 남는다.
- 유발 시점(Windows DWM이 픽셀을 잃는 상황): **전체화면 독점 게임/영상 종료, 디스플레이 절전→복귀,
  화면 잠금/해제, 해상도·배율 변경, GPU 리셋** 직후.
- 그림·좌표·CSS 는 전부 정상이었다(캐릭터 렌더링은 결정적: base 이미지는 어떤 무드에서도 항상 존재,
  m-candle 도 base + flip 모션으로 표시). → **렌더러가 아니라 창(main) 레벨 문제**.

## 수정 (main.js)

1. `require("electron")` 구조분해에 **`powerMonitor`** 추가.
2. **`repaintOverlay()`** 신설 — 사용자가 수동으로 하던 "숨겼다 켜기"를 자동화:
   - 보이는 상태이고 드래그 중이 아닐 때만 동작(`overlayWin.isVisible()`, `dragOffset` 가드).
   - `setAlwaysOnTop(true, "screen-saver")` 로 최상위 레벨 재선언.
   - **위치 1px 넛지**: `setPosition(x+1,y)` → `setPosition(x,y)`. DWM 재컴포지팅을 유발하되
     **보이지 않고 포커스도 뺏지 않는다**(setPosition은 창 활성화를 유발하지 않음).
     → hide/show 방식보다 깜빡임·포커스 도둑질이 없어 상주 위젯에 적합.
3. 트리거 훅(`app.whenReady` 안):
   - `powerMonitor.on("resume")` — 절전 복귀
   - `powerMonitor.on("unlock-screen")` — 화면 잠금 해제
   - `screen.on("display-metrics-changed")` — 해상도/배율/모니터 변경
   - **킵얼라이브 `setInterval(repaintOverlay, 3분)`** — 전체화면 게임처럼 **이벤트가 오지 않는**
     경우 대비. 넛지가 무비용이라 상시 켜둠.
4. **넛지 좌표 오염 방지**: `overlayProgramMove` 플래그 추가. `overlayWin.on("moved")` 는 이 플래그가
   서 있으면 `settings.overlayBounds` 저장을 건너뛴다(패널의 `programMove` 와 동일 패턴, 50ms 후 해제).

## 불변사항 / 주의

- **좌표는 절대 바꾸지 않는다** — 넛지는 항상 원위치로 복귀(+1 후 즉시 원복). 사용자가 맞춰둔 위치 보존.
- `moved` 저장 가드 필수: 이게 없으면 3분마다 넛지가 `overlayBounds` 를 덮어써 settings.json 에
  불필요한 쓰기가 발생한다. `overlayProgramMove` 로 차단.
- 드래그 중(`dragOffset` 존재) repaint 스킵 — 렌더러발 `setPosition` 과 충돌하면 펫이 튄다.
- `powerMonitor` 는 **app ready 이후에만** 사용 가능 → 훅을 `whenReady` 안에 둠.
- `display-metrics-changed` 는 (event, display, changedMetrics) 인자를 주지만 repaintOverlay 는
  인자를 쓰지 않는다(단순 리페인트). 향후 화면 축소로 펫이 실제 오프스크린이 되는 케이스까지 다루려면
  이 훅에서 **workArea 재클램프**를 추가하면 된다(현재 범위 밖 — 사용자 증상은 좌표 정상이었음).
- 킵얼라이브 주기(3분)는 상수 하나(`3 * 60 * 1000`)로, 부담되면 늘리거나 제거 가능.
- 배포 시 버전 증가 필수 — 0.17.25 → 0.17.26. release-notes.md 도 갱신함.

## 후속 버그: 넛지가 topmost를 떨어뜨림 (repaintOverlay 순서 수정)

### 증상
- 리페인트 도입 후 펫이 **최상단에 안 뜨는** 문제 발생. 시작 직후엔 멀쩡하다가 첫 킵얼라이브
  (3분)가 돌고 나면 다른 창 뒤로 감.

### 원인
- Windows에서 `setPosition`(내부적으로 `SetWindowPos`)이 창의 **topmost(항상 위) 플래그를
  떨어뜨릴 수 있다.** 기존 `repaintOverlay` 는 `setAlwaysOnTop(true)` → `setPosition` 순서라,
  **최상위를 켜자마자 이동이 도로 꺼버렸다.**

### 수정
- 순서를 뒤집음: **넛지(setPosition ×2) 먼저 → `setAlwaysOnTop(true, "screen-saver")` 를 맨 마지막**에.
  이동으로 재컴포지팅은 하되, 마지막에 최상위를 다시 세워 유지되게 함.

### 불변사항
- **repaintOverlay 안에서 `setAlwaysOnTop` 은 항상 setPosition 뒤에 와야 한다.** 순서를 되돌리면
  최상단 유지가 다시 깨진다. (같은 이유로 향후 setBounds/이동 코드를 넣을 때도 topmost 재선언은 뒤에.)

## 재설계: 1px 이동(넛지) 폐기 → 증상별 2함수 분리

### 배경
- 자동복구(0.17.27)가 있는데도 **가끔** "안 보임 / 뒤로 감"이 계속 발생.
- 원인 재정리:
  - 1px 이동(넛지)은 **추측한 복구법**이라 "안 보임"을 못 살리는 경우가 있었다. 사용자가 실제로
    성공을 확인한 건 **"펫 숨기기→보이기"(hide→show)** 뿐.
  - 복구 트리거가 `절전복귀/잠금해제/해상도변경/3분` 뿐이라, 주범인 "전체화면 앱이 앞에 옴"은
    **이벤트가 안 와서** 최대 3분 지연 → "가끔"으로 체감.
- 진단 근거(설정/환경): `displayStyle=pill`, `clickThrough` 없음(꺼짐 → 클릭통과 기능 무관 확정),
  overlayBounds=(2286,1075)는 **주 모니터**(2560폭) 안 → off-screen 아님. 남는 원인은 투명
  always-on-top 창의 상태 소실뿐.

### 수정 (main.js)
- `repaintOverlay()` + `overlayProgramMove` 플래그(및 moved 가드) **전부 제거**. "넛지" 용어도 폐기.
- **증상별로 비용이 다른 2함수로 분리**:
  1. `ensureOverlayOnTop()` — `setAlwaysOnTop(true, "screen-saver")` 한 줄만. 창을 움직이지도
     그리지도 포커스도 안 건드려 무비용. **20초 주기**(`setInterval`)로 상시 → "뒤로 감" 해결.
  2. `recoverOverlay()` — `hide()` → `showInactive()` → `ensureOverlayOnTop()`. 사용자가 검증한
     hide→show 복구를 자동화. `showInactive` 로 **포커스 안 뺏음**. 한 프레임 깜빡일 수 있어
     **이벤트에서만**(resume / unlock-screen / display-metrics-changed) 호출 → 평상시 깜빡임 0.
     (전체화면 게임 종료는 대개 화면모드 변경으로 display-metrics-changed 가 떠서 여기서 잡힘.)

### 불변사항 / 주의
- **`recoverOverlay` 는 절대 주기 타이머로 돌리지 않는다.** hide/show 는 깜빡임이 있어 상시 호출하면
  과잉 처치가 된다. 오직 "상태가 바뀐" 이벤트에서만.
- `recoverOverlay` 안에서 topmost 재선언은 **show 뒤**에(순서 필수). `!isVisible()` 이면 사용자가
  숨긴 것이므로 억지로 띄우지 않는다. 드래그 중(`dragOffset`)이면 스킵.
- 이벤트가 없는 희귀 "안 보임"(예: 화면모드 변경 없는 전체화면 오버레이) 케이스가 실제로 확인되면,
  그때 `recoverOverlay` 를 **긴 주기(60~90초)** 안전망으로만 추가 검토(처음부터 넣지 않음 — 깜빡임 최소화 우선).
