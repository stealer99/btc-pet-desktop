// BTC Pet Desktop - main process (v0.17.44-walk-beta)
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, dialog, powerMonitor } = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let overlayWin = null;
let panelWin = null;
let walkerWin = null;        // v2 산책 모드 창 (작업표시줄 위 투명 띠). 산책 모드일 때만 존재
let tray = null;

// v2 산책 모드 해제 파일(.btcpet) 검증용 공개키 (kid → PEM). v1 파일은 p1
const WALK_LICENSE_PUBLIC_KEYS = {
  p1: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAMEJP7pNiHx64qWGBD7sQ76bZDe8cDRkie5SWL7zfsrY=
-----END PUBLIC KEY-----`,
  b1: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAojxuyDzbMLVNPhaIXfVBRtwCgvKYf+uaTdql0Tx+UmM=
-----END PUBLIC KEY-----`,
};
const REVOKED_LICENSE_IDS = new Set([]);
const LICENSE_MAX_BYTES = 16 * 1024;
const WALK_STRIP_H = 230;    // 산책 띠 높이: 거래소 타워(72px × 4 × 마을 축소 0.65 ≈ 187) + 코드 전광판 튀어나옴(≈17) + 여유
let autoUpdater = null;      // electron-updater 인스턴스 (dev/모듈 미설치면 null)
let manualUpdateCheck = false; // 수동 "업데이트 확인" 진행 중 -> 결과 다이얼로그 표시 게이트
let declinedVersion = null;    // 자동 프롬프트에서 "나중에" 누른 버전 (자동 재알림 억제)

// ---- 설정 저장 (JSON) ----
const settingsPath = () => path.join(app.getPath("userData"), "settings.json");
let settings = {};
function loadSettings() {
  try { settings = JSON.parse(fs.readFileSync(settingsPath(), "utf8")); } catch (e) { settings = {}; }
}
function saveSettings() {
  try {
    const target = settingsPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(settings, null, 2), "utf8");
    fs.renameSync(tmp, target);
  } catch (error) {
    console.error("Failed to save settings", error);
  }
}
function broadcast(channel, ...args) {
  [overlayWin, panelWin, walkSettingsWin, ...allWalkerWins()].forEach((w) => {
    if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
  });
}

// ---- v2 산책 모드 해제 파일 ----
// v1: { type, v:1, feature, id, name, issuedAt, sig }
// v2: { type, v:2, kid, feature, id, name, tg, issuedAt, exp, sig }  (tg·exp 는 빈 문자열 가능, exp = 마지막 사용 가능일 YYYY-MM-DD)
const LICENSE_FIELDS = { 1: ["feature", "id", "name", "issuedAt"], 2: ["kid", "feature", "id", "name", "tg", "issuedAt", "exp"] };
const licenseMessage = (l) => ["btcpet-unlock", `v${l.v}`, ...LICENSE_FIELDS[l.v].map((k) => l[k])].join("\n");
const localDate = () => new Date().toLocaleDateString("sv-SE");   // YYYY-MM-DD (로컬)
function verifyWalkLicense(lic, today = localDate()) {
  try {
    if (!lic || lic.type !== "btcpet-unlock" || !LICENSE_FIELDS[lic.v] || lic.feature !== "walk") return false;
    const text = (f, required) => typeof f === "string" && f.length <= 200 && (!required || f.length > 0);
    if (![lic.id, lic.name, lic.issuedAt, lic.sig].every((f) => text(f, true))) return false;
    if (lic.v === 2 && !(text(lic.kid, true) && text(lic.tg) && text(lic.exp))) return false;
    if (lic.v === 2 && lic.exp && !(/^\d{4}-\d{2}-\d{2}$/.test(lic.exp) && today <= lic.exp)) return false;
    const key = WALK_LICENSE_PUBLIC_KEYS[lic.v === 1 ? "p1" : lic.kid];
    if (!key || REVOKED_LICENSE_IDS.has(lic.id)) return false;
    return crypto.verify(null, Buffer.from(licenseMessage(lic), "utf8"), key, Buffer.from(lic.sig, "base64"));
  } catch (_) {
    return false;
  }
}
const pickLicense = (l) => Object.fromEntries(["type", "v", ...LICENSE_FIELDS[l.v], "sig"].map((k) => [k, l[k]]));
// 저장된 해제 정보도 실행할 때마다(날짜가 바뀌면 다시) 검증한다
let walkUnlockedCache = null;
let walkUnlockedDate = null;
function isWalkUnlocked() {
  const today = localDate();
  if (walkUnlockedCache === null || walkUnlockedDate !== today) {
    walkUnlockedCache = verifyWalkLicense(settings.walkLicense, today);
    walkUnlockedDate = today;
  }
  return walkUnlockedCache;
}
// 산책을 쓸 수 없을 때 보여줄 스타일 = 산책으로 바꾸기 직전 스타일 (displayStyle 은 "walk" 로 남겨 새 파일을 넣으면 복귀)
const baseStyle = () => ((settings.displayStyle === "walk" ? settings.walkPrevStyle : settings.displayStyle) === "pill" ? "pill" : "pet");
function rememberPrevStyle(next) {
  if (next === "walk" && settings.displayStyle !== "walk") settings.walkPrevStyle = baseStyle();
}
// 켜 둔 채로 사용 기간이 끝나면 산책 전 스타일로 돌린다
function recheckWalkLicense() {
  if (settings.displayStyle === "walk" && !isWalkUnlocked() && allWalkerWins().length) {
    applyDisplayStyle();
    broadcast("setting-changed", "displayStyle", baseStyle());   // 오버레이 표시만 맞춘다 (저장값은 walk 유지)
    broadcast("setting-changed", "walkLicense", null);
  }
}

function applyLicenseText(text) {
  let lic = null;
  try { lic = JSON.parse(text); } catch (_) {}
  if (!verifyWalkLicense(lic)) {
    const expired = lic && lic.v === 2 && typeof lic.exp === "string" && lic.exp && localDate() > lic.exp;
    dialog.showMessageBox({ type: "warning", title: "BTC Pet",
      message: expired ? "사용 기간이 끝난 해제 파일이에요" : "올바른 해제 파일이 아니에요",
      detail: expired ? `${lic.exp} 까지 쓸 수 있는 파일이에요. 새 파일을 받아 주세요.` : "파일이 손상됐거나 BTC Pet 에서 발급한 파일이 아니에요.",
      buttons: ["확인"] });
    return false;
  }
  settings.walkLicense = pickLicense(lic);
  walkUnlockedCache = true;
  walkUnlockedDate = localDate();
  saveSettings();
  const { name } = lic;
  const exp = lic.v === 2 ? lic.exp : "";
  broadcast("setting-changed", "walkLicense", { name, exp });
  const alreadyWalk = isWalkMode();
  dialog.showMessageBox({
    type: "info", title: "BTC Pet",
    message: `🐜 ${name}님, 작업표시줄 산책 모드가 열렸어요`,
    detail: (exp ? `${exp} 까지 사용할 수 있어요.\n` : "") + "우클릭 메뉴 > 표시 스타일 > 작업표시줄 산책 (베타) 에서 언제든 켜고 끌 수 있어요.",
    buttons: alreadyWalk ? ["확인"] : ["지금 켜기", "나중에"], defaultId: 0, cancelId: alreadyWalk ? 0 : 1,
  }).then(({ response }) => { if (!alreadyWalk && response === 0) setDisplayStyle("walk"); });
  return true;
}

// 실행 인자(파일 더블클릭 → 설치 프로그램의 .btcpet 연결)로 넘어온 해제 파일 처리
function openLicenseFromArgv(argv) {
  const file = (argv || []).find((a) => typeof a === "string" && /\.btcpet$/i.test(a));
  if (!file) return false;
  try {
    if (fs.statSync(file).size > LICENSE_MAX_BYTES) throw new Error("too large");
    applyLicenseText(fs.readFileSync(file, "utf8"));
  } catch (_) {
    dialog.showMessageBox({ type: "warning", title: "BTC Pet", message: "해제 파일을 읽을 수 없어요", buttons: ["확인"] });
  }
  return true;
}

// 렌더러에는 해제 원문 대신 해제 여부·받는 사람 이름만 넘긴다
ipcMain.handle("get-settings", () => {
  const { walkLicense, ...rest } = settings;
  const on = isWalkUnlocked();
  return { ...rest, walkUnlocked: on, walkLicenseName: on ? walkLicense.name : null, walkLicenseExp: on && walkLicense.v === 2 ? walkLicense.exp : "" };
});
ipcMain.handle("get-version", () => app.getVersion()); // 패널 버전 표시용 (하드코딩 방지)
ipcMain.on("set-setting", (_e, key, value) => {
  if (typeof key !== "string" || key.length > 64) return;
  if (key === "walkLicense" || key === "walkUnlocked") return;             // 해제는 해제 파일로만
  if (key === "displayStyle" && value === "walk" && !isWalkUnlocked()) return;
  if (key === "displayStyle") rememberPrevStyle(value);
  settings[key] = value;
  saveSettings();
  if (key === "panelOpacity") {
    if (panelWin && !panelWin.isDestroyed()) panelWin.setOpacity(value);
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setOpacity(value);
  }
  broadcast("setting-changed", key, value);
  if (key === "displayStyle") applyDisplayStyle();
});
// 오버레이(WS 소유자)가 가격을 쏘면 패널·산책 창으로 중계 (산책 모드에서도 오버레이는 숨긴 채 WS 유지)
ipcMain.on("price", (_e, data) => {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("price", data);
  for (const w of allWalkerWins()) w.webContents.send("price", data);
  if (walkSettingsWin && !walkSettingsWin.isDestroyed()) walkSettingsWin.webContents.send("price", data);   // 알림 입력 참고용 현재가
});
// 펫·패널 창에 끌어다 놓은 해제 파일 내용 (preload 가 공통으로 받아 넘김)
ipcMain.handle("unlock-license-text", (_e, text) => {
  if (typeof text !== "string" || text.length > LICENSE_MAX_BYTES) return false;
  return applyLicenseText(text);
});
// 산책 창: 개미 위에 커서가 있을 때만 마우스를 받는다 (띠 전체가 클릭을 먹지 않게)
ipcMain.on("walk-interactive", (e, on) => {
  const win = allWalkerWins().find((w) => w.webContents === e.sender);
  if (!win) return;
  win.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on("open-external", (_e, url) => {
  try {
    const parsed = new URL(url);
    if (["https:", "http:"].includes(parsed.protocol)) shell.openExternal(parsed.toString());
  } catch (_) {}
});
ipcMain.on("toggle-panel", () => togglePanel());
ipcMain.on("pet-test", (_e, payload) => {
  const action = typeof payload === "string" ? payload : payload?.action;
  const fxStyle = typeof payload === "object" ? payload?.fxStyle : undefined;
  if (!["idle", "pump", "dump", "candle", "sleepy", "despair", "alert"].includes(action)) return;   // alert: 산책 모드 가격 알림 테스트 (펫 창은 무시)
  if (fxStyle !== undefined && !["loop", "once", "v3"].includes(fxStyle)) return;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("pet-test", { action, fxStyle });
  }
  for (const w of allWalkerWins()) w.webContents.send("pet-test", { action, fxStyle });
});
ipcMain.on("panel-size", (_e, h) => {
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.setContentSize(282, Math.min(Math.ceil(h), 700));
    if (panelAnchored && panelWin.isVisible()) anchorPanel();
  }
});
// 펫 창 드래그 (렌더러 마우스 좌표 기반)
let dragOffset = null;
// 투명 always-on-top 창은 전체화면 앱·모니터 절전·해상도 변경 등으로
//   ① 최상위(topmost)가 풀려 다른 창 뒤로 밀리거나
//   ② 화면에 그려진 픽셀을 잃어 "빈 창"(안 보임)으로 남을 수 있다(그림/좌표는 정상).
// 비용이 다른 두 함수로 나눠 처리한다.

// ① "뒤로 감" 대응: 최상위만 다시 선언한다. 창을 움직이지도 그리지도 포커스도
//    건드리지 않아 아주 싸다 → 짧은 주기(20초)로 돌려도 무해. 밀려나도 곧 앞으로 복귀.
function ensureOverlayOnTop() {
  if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) overlayWin.setAlwaysOnTop(true, "screen-saver");
  // 산책 창은 "floating" 단계: 일반 창보다는 위, 작업표시줄(시작 메뉴·알림 등 작업표시줄 쪽 창)보다는 아래.
  // "다른 창 위에 표시"를 끈 경우엔 최상위를 다시 걸지 않는다
  if (walkOnTop()) for (const w of allWalkerWins()) if (w.isVisible()) w.setAlwaysOnTop(true, "floating");
}

// ② "안 보임" 대응: 창을 잠깐 숨겼다 다시 보이게 해 강제로 다시 그리게 한다
//    (사용자가 수동으로 "펫 숨기기→보이기"로 복구하던 그 방법을 자동화).
//    showInactive 는 포커스를 뺏지 않아 작업 중인 창을 방해하지 않는다.
//    다시 보이게 한 뒤 최상위가 풀릴 수 있어 마지막에 재선언한다(순서 필수).
//    한 프레임 깜빡일 수 있어 "무언가 바뀐" 이벤트에서만 호출한다(상시 주기 호출 금지).
function recoverOverlay(reason) {
  if (dragOffset) return;              // 드래그 중이면 건드리지 않음
  // 산책 모드에선 오버레이가 숨겨져 있으므로 산책 창을 대신 복구한다
  const targets = [overlayWin, ...allWalkerWins()].filter((w) => w && !w.isDestroyed() && w.isVisible()); // 숨겨둔 창은 억지로 띄우지 않음
  if (!targets.length) return;
  for (const w of targets) {
    w.hide();
    w.showInactive();                  // 포커스 없이 다시 표시 → 강제로 다시 그리기
  }
  ensureOverlayOnTop();                // 표시 후 최상위 재선언 (순서 필수)
  logOverlayEvent("recover:" + (typeof reason === "string" ? reason : "?"));
}

// 간헐 증상 추적용 로그: 드물게 오는 복구 트리거만 기록한다(20초 최상위 재선언 등
// 상시 동작은 기록 안 해 파일이 거의 안 자란다). userData/overlay-events.log — 언제든 지워도 됨.
// 항상 켜둔다: 증상이 언제 날지 몰라 개발자 모드 게이팅은 오히려 놓치기 쉬움.
function logOverlayEvent(kind) {
  try {
    fs.appendFileSync(
      path.join(app.getPath("userData"), "overlay-events.log"),
      `${new Date().toISOString()}\t${kind}\n`, "utf8"
    );
  } catch (_) {}
}
ipcMain.on("drag-start", (_e, x, y) => {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const [wx, wy] = overlayWin.getPosition();
  dragOffset = { dx: x - wx, dy: y - wy };
});
ipcMain.on("drag-move", (_e, x, y) => {
  if (!dragOffset) return;
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setPosition(Math.round(x - dragOffset.dx), Math.round(y - dragOffset.dy));
});
ipcMain.on("tray-icon", (_e, dataUrl, tooltip) => {
  if (!tray) return;
  const image = nativeImage.createFromDataURL(dataUrl);
  if (image.isEmpty()) return;
  tray.setImage(image);
  tray.setToolTip(tooltip);
});

function createOverlay() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const saved = settings.overlayBounds;
  overlayWin = new BrowserWindow({
    width: 180, height: 210,
    x: saved?.x ?? width - 200,
    y: Math.min(saved?.y ?? height - 230, height - 210),
    frame: false, transparent: true, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    // backgroundThrottling:false — 산책 모드에서 오버레이를 숨겨도 WS 재연결 타이머·시세 중계가 늦어지지 않게
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, backgroundThrottling: false },
  });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.setOpacity(settings.panelOpacity ?? 1);
  overlayWin.loadFile("overlay.html");
  overlayWin.on("closed", () => { overlayWin = null; dragOffset = null; });
  overlayWin.on("moved", () => {
    const [x, y] = overlayWin.getPosition();
    settings.overlayBounds = { x, y };
    saveSettings();
  });
  overlayWin.on("move", () => { // 따라다니기: 이동 중 실시간 재정렬
    if (settings.panelFollow && panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) anchorPanel();
  });
}

// ---- v2 산책 모드 창 ----
function isWalkMode() { return settings.displayStyle === "walk" && isWalkUnlocked(); }

const walkOnTop = () => settings.walkOnTop !== false;   // "마을을 다른 창 위에 표시" (기본 켬)

// 산책할 모니터: 메뉴에서 고른 모니터(settings.walkDisplayId) → 없으면(미선택·연결 해제) 오버레이(숨겨져 있어도
// 위치는 유지)가 있던 모니터 → 그것도 없으면 주 모니터
function walkDisplay() {
  const chosen = screen.getAllDisplays().find((d) => d.id === settings.walkDisplayId);
  if (chosen) return chosen;
  if (overlayWin && !overlayWin.isDestroyed()) {
    const [x, y] = overlayWin.getPosition();
    const [w, h] = overlayWin.getSize();
    return screen.getDisplayNearestPoint({ x: x + w / 2, y: y + h / 2 });
  }
  return screen.getPrimaryDisplay();
}
function walkWorkArea() {
  return walkDisplay().workArea;
}

function setWalkDisplay(id) {
  settings.walkDisplayId = id;
  saveSettings();
  antDisplayId = null;                         // 마을 모니터가 바뀌면 개미도 마을로 데려온다
  layoutWalker();
  if (isWalkMode() && panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) anchorPanel();
}

// 메뉴용 모니터 목록 (2대 이상일 때만). 왼쪽→오른쪽 순서로 번호를 붙인다
function walkDisplayMenu() {
  const displays = screen.getAllDisplays().slice().sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  if (displays.length < 2) return [];
  const primaryId = screen.getPrimaryDisplay().id;
  const currentId = walkDisplay().id;
  return [
    { label: "산책할 모니터 (마을)", submenu: displays.map((d, i) => ({
      label: `모니터 ${i + 1}${d.id === primaryId ? " (주 모니터)" : ""} · ${d.size.width}×${d.size.height}`,
      type: "radio", checked: d.id === currentId, click: () => setWalkDisplay(d.id),
    })) },
    { label: "개미가 모니터 넘어다니기", type: "checkbox", checked: walkCross(), click: (item) => setWalkCross(item.checked) },
  ];
}

// 창은 항상 작업영역 전체 폭. 투명한 부분은 아무것도 가리지 않고 클릭도 통과하므로 너비를 줄일 이유가 없고,
// 창 크기를 바꾸면 윈도우가 옛 프레임을 새 위치에 한 번 보여 줘 번쩍이므로 크기는 모니터가 바뀔 때만 바꾼다
function boundsForDisplay(display) {
  const wa = display.workArea;                 // 작업표시줄을 뺀 영역 → 띠 바닥 = 작업표시줄 윗선
  const height = Math.min(WALK_STRIP_H, wa.height);
  return { x: wa.x, y: wa.y + wa.height - height, width: wa.width, height };
}
function walkBounds() { return boundsForDisplay(walkDisplay()); }

// ---- 모니터 넘어다니기 ----
// 마을 모니터에는 walkerWin(마을+개미), 다른 모니터에는 개미 전용 창(walkSatellites)을 둔다.
// 개미는 antDisplayId 모니터의 창에만 있고, 가장자리에서 옆 모니터로 넘어갈 때 main 이 넘겨준다.
const walkSatellites = new Map();              // displayId → BrowserWindow
let antDisplayId = null;
const walkCross = () => settings.walkCrossMonitors === true;
const allWalkerWins = () => [walkerWin, ...walkSatellites.values()].filter((w) => w && !w.isDestroyed());

function walkWindowOf(displayId) {
  if (displayId === walkDisplay().id) return walkerWin && !walkerWin.isDestroyed() ? walkerWin : null;
  const w = walkSatellites.get(displayId);
  return w && !w.isDestroyed() ? w : null;
}
function displayIdOfWalker(win) {
  if (win && win === walkerWin) return walkDisplay().id;
  for (const [id, w] of walkSatellites) if (w === win) return id;
  return null;
}

// display 의 side(left/right) 쪽에 딱 붙어 있고(2px 이내) 세로로 겹치는 모니터 중 산책 창이 있는 곳
function crossTarget(display, side) {
  const b = display.bounds;
  return screen.getAllDisplays().find((d) => {
    if (d.id === display.id || !walkWindowOf(d.id)) return false;
    const e = d.bounds;
    const vOverlap = Math.min(b.y + b.height, e.y + e.height) - Math.max(b.y, e.y) > 0;
    const touching = side === "right" ? Math.abs(e.x - (b.x + b.width)) <= 2 : Math.abs(e.x + e.width - b.x) <= 2;
    return vOverlap && touching;
  }) || null;
}

function createWalkerWindow(bounds) {
  const win = new BrowserWindow({
    ...bounds,
    frame: false, transparent: true, resizable: false, movable: false,
    alwaysOnTop: walkOnTop(), skipTaskbar: true, hasShadow: false,
    focusable: false,                          // 개미를 눌러도 작업 중인 창의 포커스를 뺏지 않게
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, backgroundThrottling: false },
  });
  if (walkOnTop()) win.setAlwaysOnTop(true, "floating");
  win.setIgnoreMouseEvents(true, { forward: true }); // 기본 통과, 개미 위에서만 walk-interactive 로 받음
  win.loadFile("walker.html");
  win.webContents.on("did-finish-load", () => sendWalkRoles());   // 로드 전에 보낸 역할은 사라지므로 로드 후 다시
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) { win.showInactive(); ensureOverlayOnTop(); }
  });
  return win;
}

function createWalker() {
  const win = createWalkerWindow(walkBounds());
  walkerWin = win;
  win.on("closed", () => { if (walkerWin === win) walkerWin = null; });
}

// 각 산책 창에 역할 전달: 마을 모니터인지, 개미가 있는지, 어느 쪽으로 넘어갈 수 있는지, (넘어온 직후면) 들어온 방향
function sendWalkRoles(enter = null) {
  const home = walkDisplay();
  for (const d of screen.getAllDisplays()) {
    const w = walkWindowOf(d.id);
    if (!w) continue;
    w.webContents.send("walk-role", {
      home: d.id === home.id,
      hasAnt: d.id === antDisplayId,
      canCross: { left: walkCross() && !!crossTarget(d, "left"), right: walkCross() && !!crossTarget(d, "right") },
      enter: enter && enter.displayId === d.id ? { side: enter.side, action: enter.action } : null,
    });
  }
}

// 모니터 구성·설정에 맞춰 창들을 만들고/지우고/자리 맞춤
function layoutWalker() {
  if (!isWalkMode()) return;
  const home = walkDisplay();
  const others = walkCross() ? screen.getAllDisplays().filter((d) => d.id !== home.id) : [];
  for (const [id, w] of walkSatellites) {
    if (!others.some((d) => d.id === id)) { if (!w.isDestroyed()) w.destroy(); walkSatellites.delete(id); }
  }
  for (const d of others) {
    const w = walkSatellites.get(d.id);
    if (w && !w.isDestroyed()) { w.setBounds(boundsForDisplay(d)); continue; }
    const nw = createWalkerWindow(boundsForDisplay(d));
    walkSatellites.set(d.id, nw);
    nw.on("closed", () => { if (walkSatellites.get(d.id) === nw) walkSatellites.delete(d.id); });
  }
  if (walkerWin && !walkerWin.isDestroyed()) walkerWin.setBounds(walkBounds());
  if (!walkWindowOf(antDisplayId)) antDisplayId = home.id;   // 개미가 있던 모니터가 없어지면 마을로
  sendWalkRoles();
}

function setWalkCross(on) {
  settings.walkCrossMonitors = !!on;
  saveSettings();
  layoutWalker();
}

// 렌더러: 개미가 가장자리에서 옆 모니터로 넘어가겠다고 알림
ipcMain.on("walk-ant-leave", (e, info) => {
  const fromId = displayIdOfWalker(BrowserWindow.fromWebContents(e.sender));
  if (fromId === null || fromId !== antDisplayId) return;
  const side = info?.side === "left" ? "left" : "right";
  const from = screen.getAllDisplays().find((d) => d.id === fromId);
  const target = walkCross() && from ? crossTarget(from, side) : null;
  if (!target) { sendWalkRoles(); return; }   // 넘어갈 곳이 없으면 원래 창이 개미를 다시 받는다
  antDisplayId = target.id;
  const action = ["walk", "run", "trudge", "idle"].includes(info?.action) ? info.action : "walk";
  sendWalkRoles({ displayId: target.id, side: side === "right" ? "left" : "right", action });
});

// 마을 창에서 생긴 말풍선(가격 알림·봉 마감)을 개미가 있는 모니터 창으로 전달
ipcMain.on("walk-say", (e, msg) => {
  if (!allWalkerWins().some((w) => w.webContents === e.sender)) return;
  if (!msg || typeof msg.text !== "string") return;
  const w = walkWindowOf(antDisplayId);
  if (w) w.webContents.send("walk-say", { text: msg.text.slice(0, 40), ms: Math.min(10000, Number(msg.ms) || 3200) });
});

// 산책 캐릭터 메뉴 (img/walk/characters.json — tools/build_assets.py 가 생성). 2명 이상일 때만 표시
function walkCharacterMenu() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(path.join(__dirname, "img", "walk", "characters.json"), "utf8")); } catch (_) {}
  if (!Array.isArray(list) || list.length < 2) return [];
  const current = list.some((c) => c.key === settings.walkCharacter) ? settings.walkCharacter : list[0].key;
  return [{ label: "산책 캐릭터", submenu: list.map((c) => ({
    label: c.name, type: "radio", checked: c.key === current,
    click: () => { settings.walkCharacter = c.key; saveSettings(); broadcast("setting-changed", "walkCharacter", c.key); },
  })) }];
}

// ---- 산책 설정 창 (마을 이름·건물·가격 알림·밤 모드·말풍선·질주) ----
// 산책 모드에선 패널을 쓰지 않으므로 우클릭 메뉴 "마을 설정…" 으로 여는 별도 창
let walkSettingsWin = null;
function openWalkSettings() {
  if (walkSettingsWin && !walkSettingsWin.isDestroyed()) { walkSettingsWin.show(); walkSettingsWin.focus(); return; }
  walkSettingsWin = new BrowserWindow({
    width: 400, height: 860, minWidth: 360, minHeight: 480, title: "BTC Pet 마을 설정",
    resizable: true, maximizable: false, fullscreenable: false, autoHideMenuBar: true,
    backgroundColor: "#12151c", icon: path.join(__dirname, "icon.ico"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  walkSettingsWin.setMenu(null);
  walkSettingsWin.loadFile("walk-settings.html");
  walkSettingsWin.on("closed", () => { walkSettingsWin = null; });
}
ipcMain.on("open-walk-settings", () => { if (isWalkUnlocked()) openWalkSettings(); });

function setWalkOnTop(on) {
  settings.walkOnTop = !!on;
  saveSettings();
  for (const w of allWalkerWins()) {
    if (on) w.setAlwaysOnTop(true, "floating"); else w.setAlwaysOnTop(false);
  }
}

// 표시 스타일 반영: 산책 모드면 산책 창을 띄우고 오버레이는 숨긴다(오버레이 WS·트레이는 계속 동작)
function applyDisplayStyle() {
  if (isWalkMode()) {
    if (!walkerWin || walkerWin.isDestroyed()) createWalker();
    layoutWalker();
    if (overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible()) overlayWin.hide();
  } else {
    for (const w of allWalkerWins()) w.destroy();
    walkSatellites.clear();
    antDisplayId = null;
    if (overlayWin && !overlayWin.isDestroyed() && !overlayWin.isVisible()) overlayWin.showInactive();
  }
}

function setDisplayStyle(style) {
  if (style === "walk" && !isWalkUnlocked()) return;
  rememberPrevStyle(style);
  settings.displayStyle = style;
  saveSettings();
  broadcast("setting-changed", "displayStyle", style);
  applyDisplayStyle();
}

// 마을 좌우 위치. 패널은 마을 반대편 아래에 뜨므로 열려 있으면 다시 맞춘다
function setWalkTownSide(side) {
  settings.walkTownSide = side === "right" ? "right" : "left";
  delete settings.walkTownPos;               // 끝으로 보내기는 끌어서 옮긴 위치를 지운다
  saveSettings();
  broadcast("setting-changed", "walkTownPos", null);
  broadcast("setting-changed", "walkTownSide", settings.walkTownSide);
  if (isWalkMode() && panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) anchorPanel();
}
// 마을이 화면 오른쪽 절반에 있는지 (끌어서 옮긴 위치가 있으면 그 기준, 없으면 좌/우 프리셋)
const townOnRight = () => (Number.isFinite(settings.walkTownPos) ? settings.walkTownPos > 0.5 : settings.walkTownSide === "right");

// 개미 산책 범위: town(마을 주변) / half(마을 쪽 절반) / full(화면 전체)
function setWalkRange(range) {
  settings.walkRange = ["town", "half"].includes(range) ? range : "full";
  saveSettings();
  broadcast("setting-changed", "walkRange", settings.walkRange);
}

function createPanel() {
  panelWin = new BrowserWindow({
    width: 282, height: 560,
    frame: false, resizable: false, show: false,
    transparent: true, hasShadow: true,
    alwaysOnTop: true, skipTaskbar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  panelWin.loadFile("panel.html");
  panelWin.setOpacity(settings.panelOpacity ?? 1);
  panelWin.on("closed", () => { panelWin = null; });
  panelWin.on("close", (e) => { // X/close()는 숨기기로 (파괴 방지)
    if (!app.isQuitting) { e.preventDefault(); panelWin.hide(); }
  });
  panelWin.on("blur", () => { // 고정 시엔 유지
    if (settings.panelPinned) return;
    panelWin.hide();
    panelBlurHiddenAt = Date.now();
  });
  panelWin.on("moved", () => {
    if (programMove) return;
    const [x, y] = panelWin.getPosition();
    settings.panelPos = { x, y };
    saveSettings();
    panelAnchored = false;
  });
}

let panelAnchored = true;    // 사용자가 옮기기 전까지 펫에 붙어다님
let programMove = false;     // setPosition에 의한 moved 이벤트 무시용
let panelBlurHiddenAt = 0;   // 트레이 아이콘을 눌러 닫을 때: 클릭 순간 blur 로 먼저 숨고 → click 이 다시 여는 것 방지

function anchorPanel() {
  if (!panelWin || panelWin.isDestroyed()) return;
  // 산책 모드: 개미 클릭으로는 안 열리고(트레이·메뉴로만) 오버레이도 숨겨져 있으므로
  // 트레이 아이콘 바로 위에 띄운다. 아이콘 위치를 못 얻으면(숨은 아이콘 영역 등) 마을 반대편 아래 구석
  if (isWalkMode()) {
    const [pw, ph] = panelWin.getContentSize();
    const tb = tray && !tray.isDestroyed() ? tray.getBounds() : null;
    const hasTray = tb && tb.width > 0 && tb.height > 0;
    const wa = hasTray
      ? screen.getDisplayNearestPoint({ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }).workArea
      : walkWorkArea();
    let px = hasTray ? tb.x + tb.width / 2 - pw / 2
      : townOnRight() ? wa.x + 8 : wa.x + wa.width - pw - 8;
    px = Math.min(Math.max(px, wa.x + 8), wa.x + wa.width - pw - 8);
    const py = Math.max(wa.y + 8, wa.y + wa.height - ph - 8);
    programMove = true;
    panelWin.setPosition(Math.round(px), Math.round(py));
    setTimeout(() => { programMove = false; }, 50);
    return;
  }
  if (!overlayWin || overlayWin.isDestroyed()) return;
  const [ox, oy] = overlayWin.getPosition();
  const [ow, overlayH] = overlayWin.getSize();
  const [pw, ph] = panelWin.getContentSize();
  // 펫이 있는 모니터 기준으로 클램프 (멀티모니터 지원)
  const wa = screen.getDisplayNearestPoint({ x: ox + ow / 2, y: oy + overlayH / 2 }).workArea;
  let px = ox - pw - 8;                       // 기본: 펫 왼쪽
  if (px < wa.x + 8) px = ox + ow + 8;        // 왼쪽 공간 없으면 오른쪽에
  px = Math.min(Math.max(px, wa.x + 8), wa.x + wa.width - pw - 8);
  const py = Math.min(Math.max((oy + overlayH) - ph, wa.y + 8), wa.y + wa.height - ph - 8);
  programMove = true;
  panelWin.setPosition(Math.round(px), Math.round(py));
  setTimeout(() => { programMove = false; }, 50);
}

function togglePanel() {
  if (!panelWin || panelWin.isDestroyed()) createPanel();
  if (panelWin.isVisible()) { panelWin.hide(); return; }
  if (settings.panelPos && !settings.panelFollow && !isWalkMode()) { // 산책 모드는 항상 트레이 근처
    programMove = true;
    panelWin.setPosition(settings.panelPos.x, settings.panelPos.y);
    setTimeout(() => { programMove = false; }, 50);
    panelAnchored = false;
  } else {
    anchorPanel();
    panelAnchored = true;
  }
  panelWin.show();
  panelWin.focus();
}

const EXCHANGE_URLS = {
  bitget: "https://www.bitget.com/futures/usdt/BTCUSDT",
  binance: "https://www.binance.com/en/futures/BTCUSDT",
  hyperliquid: "https://app.hyperliquid.xyz/trade/BTC",
};

function applyClickThrough() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setIgnoreMouseEvents(!!settings.clickThrough, { forward: true });
}

// 클릭 통과 중 렌더러의 dwell 판정으로 펫을 잠깐 상호작용 가능하게 깨우기.
// 통과 모드가 아닐 때의 늦은 메시지는 무시(항상 상호작용 유지).
ipcMain.on("set-interactive", (_e, on) => {
  if (!overlayWin || overlayWin.isDestroyed() || !settings.clickThrough) return;
  overlayWin.setIgnoreMouseEvents(!on, { forward: true });
});

function buildMenu() {
  // 지금 표시 중인 모드에 쓰이는 항목만 보여 준다 (walk / pet / pill)
  const mode = isWalkMode() ? "walk" : baseStyle();
  const walk = mode === "walk", overlayShown = !walk, petShown = mode === "pet";
  return Menu.buildFromTemplate([
    { label: "패널 열기/닫기", click: togglePanel },
    { label: "거래소에서 열기", click: () => shell.openExternal(EXCHANGE_URLS[settings.priceSource] || EXCHANGE_URLS.bitget) },
    ...(overlayShown ? [{ label: "패널 항상 표시", type: "checkbox", checked: !!settings.panelPinned,
      click: (item) => {
        settings.panelPinned = item.checked; saveSettings();
        if (item.checked) { if (!panelWin || panelWin.isDestroyed() || !panelWin.isVisible()) togglePanel(); }
      } },
    { label: "패널 펫에 붙여다니기", type: "checkbox", checked: !!settings.panelFollow,
      click: (item) => {
        settings.panelFollow = item.checked; saveSettings();
        if (item.checked && panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) anchorPanel();
      } },
    { label: "패널 위치 초기화 (펫 옆으로)", click: () => { delete settings.panelPos; saveSettings(); } }] : []),
    { label: "표시 스타일", submenu: [
      { label: "펫", type: "radio", checked: !isWalkMode() && baseStyle() === "pet",
        click: () => setDisplayStyle("pet") },
      { label: "기본형 (심플)", type: "radio", checked: !isWalkMode() && baseStyle() === "pill",
        click: () => setDisplayStyle("pill") },
      // v2: 해제된 경우에만 노출
      ...(isWalkUnlocked() ? [{ label: "작업표시줄 산책 (베타)", type: "radio", checked: isWalkMode(),
        click: () => setDisplayStyle("walk") }] : []),
    ]},
    ...(walk ? [{ label: "마을 설정… (이름·건물·가격 알림·밤 모드)", click: openWalkSettings },
    ...walkCharacterMenu(),
    { label: "마을 위치", submenu: [
      { label: "끌어서 옮기기…", enabled: !!walkerWin && !walkerWin.isDestroyed(),
        click: () => { if (walkerWin && !walkerWin.isDestroyed()) walkerWin.webContents.send("walk-move-mode"); } },
      { type: "separator" },
      { label: "왼쪽 끝으로", click: () => setWalkTownSide("left") },
      { label: "오른쪽 끝으로 (알림 팝업과 겹칠 수 있음)", click: () => setWalkTownSide("right") },
    ]},
    { label: "산책 범위", submenu: [
      { label: "마을 주변만", type: "radio", checked: settings.walkRange === "town", click: () => setWalkRange("town") },
      { label: "마을 쪽 화면 절반", type: "radio", checked: settings.walkRange === "half", click: () => setWalkRange("half") },
      { label: "화면 전체", type: "radio", checked: !["town", "half"].includes(settings.walkRange), click: () => setWalkRange("full") },
    ]},
    ...walkDisplayMenu(),
    { label: "마을을 다른 창 위에 표시", type: "checkbox", checked: walkOnTop(), click: (item) => setWalkOnTop(item.checked) }] : []),
    ...(petShown ? [{ label: "캐릭터", submenu: [
      { label: "원금이 (동전)", type: "radio", checked: (settings.character || "il-wongeum") === "il-wongeum",
        click: () => { settings.character = "il-wongeum"; saveSettings(); broadcast("setting-changed", "character", "il-wongeum"); } },
      { label: "유동이 (슬라임)", type: "radio", checked: (settings.character) === "il-yudong",
        click: () => { settings.character = "il-yudong"; saveSettings(); broadcast("setting-changed", "character", "il-yudong"); } },
      { label: "알고 (로봇)", type: "radio", checked: (settings.character) === "il-algo",
        click: () => { settings.character = "il-algo"; saveSettings(); broadcast("setting-changed", "character", "il-algo"); } },
      { label: "청산이 (고스트)", type: "radio", checked: (settings.character) === "il-cheongsan",
        click: () => { settings.character = "il-cheongsan"; saveSettings(); broadcast("setting-changed", "character", "il-cheongsan"); } },
      { label: "호재 (핑크)", type: "radio", checked: (settings.character) === "il-hojae",
        click: () => { settings.character = "il-hojae"; saveSettings(); broadcast("setting-changed", "character", "il-hojae"); } },
      { label: "뚠뚠이 (개미)", type: "radio", checked: (settings.character) === "il-ttun",
        click: () => { settings.character = "il-ttun"; saveSettings(); broadcast("setting-changed", "character", "il-ttun"); } },
      { label: "익절이 (다람쥐)", type: "radio", checked: (settings.character) === "il-ikjeol",
        click: () => { settings.character = "il-ikjeol"; saveSettings(); broadcast("setting-changed", "character", "il-ikjeol"); } },
      { label: "손절이 (선인장)", type: "radio", checked: (settings.character) === "il-sonjeol",
        click: () => { settings.character = "il-sonjeol"; saveSettings(); broadcast("setting-changed", "character", "il-sonjeol"); } },
      { label: "숏충이 (박쥐)", type: "radio", checked: (settings.character) === "il-shorty",
        click: () => { settings.character = "il-shorty"; saveSettings(); broadcast("setting-changed", "character", "il-shorty"); } },
      { label: "롱충이 (시바견)", type: "radio", checked: (settings.character) === "il-longy",
        click: () => { settings.character = "il-longy"; saveSettings(); broadcast("setting-changed", "character", "il-longy"); } },
      { label: "물타기 (비버)", type: "radio", checked: (settings.character) === "il-multagi",
        click: () => { settings.character = "il-multagi"; saveSettings(); broadcast("setting-changed", "character", "il-multagi"); } },
      { label: "김프 (풍선복어)", type: "radio", checked: (settings.character) === "il-kimp",
        click: () => { settings.character = "il-kimp"; saveSettings(); broadcast("setting-changed", "character", "il-kimp"); } },
      { label: "불장 (불꽃 도깨비)", type: "radio", checked: (settings.character) === "il-buljang",
        click: () => { settings.character = "il-buljang"; saveSettings(); broadcast("setting-changed", "character", "il-buljang"); } },
      { label: "약손이 (간호사 문어)", type: "radio", checked: (settings.character) === "il-yakson",
        click: () => { settings.character = "il-yakson"; saveSettings(); broadcast("setting-changed", "character", "il-yakson"); } },
      { label: "가즈아 (공룡)", type: "radio", checked: (settings.character) === "il-gazua",
        click: () => { settings.character = "il-gazua"; saveSettings(); broadcast("setting-changed", "character", "il-gazua"); } },
      { label: "횡보 (개구리)", type: "radio", checked: (settings.character) === "il-hoengbo",
        click: () => { settings.character = "il-hoengbo"; saveSettings(); broadcast("setting-changed", "character", "il-hoengbo"); } },
      { label: "뽕식 (역베팅 개미)", type: "radio", checked: (settings.character) === "il-ppongsik",
        click: () => { settings.character = "il-ppongsik"; saveSettings(); broadcast("setting-changed", "character", "il-ppongsik"); } },
      { label: "매집이 (세력볼)", type: "radio", checked: (settings.character) === "il-maejip",
        click: () => { settings.character = "il-maejip"; saveSettings(); broadcast("setting-changed", "character", "il-maejip"); } },
      { label: "떡상이 (아기용)", type: "radio", checked: (settings.character) === "il-ddeoksang",
        click: () => { settings.character = "il-ddeoksang"; saveSettings(); broadcast("setting-changed", "character", "il-ddeoksang"); } },
      { label: "존버 (바위)", type: "radio", checked: (settings.character) === "il-jonber",
        click: () => { settings.character = "il-jonber"; saveSettings(); broadcast("setting-changed", "character", "il-jonber"); } },
      { label: "표루피 (야광봉 시그널맨)", type: "radio", checked: (settings.character) === "il-pyoluppy",
        click: () => { settings.character = "il-pyoluppy"; saveSettings(); broadcast("setting-changed", "character", "il-pyoluppy"); } },
      { label: "파라미 (파라파라 방파제 소녀)", type: "radio", checked: (settings.character) === "il-parami",
        click: () => { settings.character = "il-parami"; saveSettings(); broadcast("setting-changed", "character", "il-parami"); } },
    ]},
    { label: "펫 크기", submenu: [
      { label: "작게 (72px)", type: "radio", checked: (settings.petSize || 90) === 72,
        click: () => { settings.petSize = 72; saveSettings(); broadcast("setting-changed", "petSize", 72); } },
      { label: "보통 (90px)", type: "radio", checked: (settings.petSize || 90) === 90,
        click: () => { settings.petSize = 90; saveSettings(); broadcast("setting-changed", "petSize", 90); } },
      { label: "크게 (110px)", type: "radio", checked: (settings.petSize || 90) === 110,
        click: () => { settings.petSize = 110; saveSettings(); broadcast("setting-changed", "petSize", 110); } },
    ]},
    { label: "차트 이펙트", submenu: [
      { label: "캔들 3개 흐름", type: "radio", checked: (settings.fxStyle || "loop") === "loop",
        click: () => { settings.fxStyle = "loop"; saveSettings(); broadcast("setting-changed", "fxStyle", "loop"); } },
      { label: "단일 캔들 쑤욱", type: "radio", checked: settings.fxStyle === "once",
        click: () => { settings.fxStyle = "once"; saveSettings(); broadcast("setting-changed", "fxStyle", "once"); } },
      { label: "긴박 모드 (로켓/번개)", type: "radio", checked: settings.fxStyle === "v3",
        click: () => { settings.fxStyle = "v3"; saveSettings(); broadcast("setting-changed", "fxStyle", "v3"); } },
    ]}] : []),
    { label: "개발자 모드", type: "checkbox", checked: !!settings.developerMode,
      click: (item) => {
        settings.developerMode = item.checked; saveSettings();
        broadcast("setting-changed", "developerMode", item.checked);
        if (!item.checked) return;
        // 테스트 버튼이 있는 곳을 연다: 산책 모드는 마을 설정 창(패널을 쓰지 않음), 펫 모드는 패널
        if (isWalkMode()) openWalkSettings();
        else if (panelWin && !panelWin.isDestroyed() && !panelWin.isVisible()) togglePanel();
      } },
    { label: walk ? "개미·마을 보이기/숨기기" : "펫 보이기/숨기기", click: () => {
      if (isWalkMode()) {                                              // 산책 모드면 모든 산책 창(모니터별)을 함께
        const show = !(walkerWin && !walkerWin.isDestroyed() && walkerWin.isVisible());
        for (const w of allWalkerWins()) show ? w.showInactive() : w.hide();
        if (show) ensureOverlayOnTop();
      } else if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.isVisible() ? overlayWin.hide() : overlayWin.show();
      }
    } },
    { label: `${walk ? "개미·마을" : "펫"} 새로고침 (안 보이거나 뒤에 있을 때)`, click: () => recoverOverlay("manual") },
    ...(overlayShown ? [{ label: "클릭 통과 켜기 (펫에 잠깐 올리면 조작 가능)", type: "checkbox", checked: !!settings.clickThrough,
      click: (item) => { settings.clickThrough = item.checked; saveSettings(); applyClickThrough(); broadcast("setting-changed", "clickThrough", item.checked); } }] : []),
    { label: "부팅 시 자동 실행", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: "separator" },
    { label: "업데이트 확인", click: checkForUpdatesManual },
    { label: `버전 ${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: "종료", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

ipcMain.on("pet-context-menu", (e) => {
  buildMenu().popup({ window: BrowserWindow.fromWebContents(e.sender) || overlayWin }); // 산책 창에서도 호출
});

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("BTC Pet");
  tray.on("click", () => {
    // 패널이 열린 채 아이콘을 누르면 blur 로 먼저 숨는다 → 그 직후 click 이 다시 열지 않게 무시
    if (Date.now() - panelBlurHiddenAt < 300) return;
    togglePanel();
  });
  // setContextMenu(고정 스냅샷)는 쓰지 않는다 — 우클릭마다 새로 빌드해야
  // 펫 우클릭 메뉴와 체크/라디오 상태가 항상 동기화된다.
  tray.on("right-click", () => tray.popUpContextMenu(buildMenu()));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit(); // 이미 실행 중 -> 새 인스턴스 즉시 종료
} else {
  app.on("second-instance", (_e, argv) => {
    // 실행 중에 .btcpet 해제 파일을 더블클릭하면 새 인스턴스는 바로 종료되고 인자만 여기로 온다
    if (app.isReady() && openLicenseFromArgv(argv)) return;
    // 중복 실행 시도 시 기존 펫을 앞으로 (산책 모드면 숨겨둔 오버레이 대신 산책 창)
    if (isWalkMode()) {
      for (const w of allWalkerWins()) w.showInactive();
      ensureOverlayOnTop();
    } else if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.show();
      overlayWin.moveTop();
    }
  });
}

// GitHub 릴리스 본문(info.releaseNotes)을 다이얼로그용 평문으로 정리.
// 문자열/배열({version,note}) 모두 대응, HTML 태그·엔티티 제거, 길이 제한.
function formatReleaseNotes(info) {
  let notes = info && info.releaseNotes;
  if (Array.isArray(notes)) notes = notes.map((n) => (n && n.note) || "").join("\n");
  if (typeof notes !== "string") return "";
  const text = notes
    .replace(/<[^>]+>/g, "")          // HTML 태그 제거
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\r/g, "").replace(/\n{3,}/g, "\n\n")
    .trim();
  const MAX = 800; // 다이얼로그가 지나치게 길어지지 않게
  return text.length > MAX ? text.slice(0, MAX) + "…" : text;
}

// ── 자동 업데이트 (GitHub Releases: stealer99/btc-pet-desktop) ──
function setupAutoUpdate() {
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch (e) { autoUpdater = null; return; } // 모듈 미설치(dev 등)면 조용히 스킵
  autoUpdater.autoDownload = false; // 사용자 동의 후에만 다운로드 (묻고 받기)

  // 새 버전 발견 -> 다운로드 전에 사용자에게 물어본다.
  autoUpdater.on("update-available", (info) => {
    // 자동 체크에서 이미 "나중에" 누른 버전이면 조용히 (수동 확인은 항상 물어봄)
    if (!manualUpdateCheck && declinedVersion === info.version) return;
    manualUpdateCheck = false;
    const notes = formatReleaseNotes(info);
    dialog.showMessageBox({
      type: "info",
      title: "BTC Pet 업데이트",
      message: `새 버전 ${info.version} 이 있습니다`,
      detail: (notes ? `[이번 변경 내용]\n${notes}\n\n` : "") +
        "지금 업데이트하시겠습니까? 내려받은 뒤 재시작 시점은 다시 확인합니다.",
      buttons: ["업데이트", "나중에"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        declinedVersion = null;
        autoUpdater.downloadUpdate().catch(() => {}); // 실패는 error 이벤트에서 안내
      } else {
        declinedVersion = info.version; // 이 버전은 자동 재알림 억제
      }
    });
  });

  // 최신 상태: 자동 체크는 침묵, 수동 체크만 "이미 최신" 안내.
  autoUpdater.on("update-not-available", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: "info",
      title: "BTC Pet 업데이트",
      message: "이미 최신 버전입니다",
      detail: `현재 버전 ${app.getVersion()}`,
      buttons: ["확인"],
    });
  });

  // 다운로드 완료 -> 재시작(설치) 시점을 다시 물어본다.
  autoUpdater.on("update-downloaded", (info) => {
    const notes = formatReleaseNotes(info);
    dialog.showMessageBox({
      type: "info",
      title: "BTC Pet 업데이트",
      message: `새 버전 ${info.version} 이 준비됐습니다`,
      detail: (notes ? `[이번 변경 내용]\n${notes}\n\n` : "") +
        "지금 재시작하면 바로 적용됩니다.",
      buttons: ["지금 재시작", "나중에 (종료 시 자동 적용)"],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) { app.isQuitting = true; autoUpdater.quitAndInstall(); }
    });
  });

  // 네트워크 실패 등: 자동 체크는 침묵, 수동 체크만 실패 안내.
  autoUpdater.on("error", () => {
    if (!manualUpdateCheck) return;
    manualUpdateCheck = false;
    dialog.showMessageBox({
      type: "warning",
      title: "BTC Pet 업데이트",
      message: "업데이트 확인에 실패했습니다",
      detail: "네트워크 상태를 확인한 뒤 잠시 후 다시 시도해 주세요.",
      buttons: ["확인"],
    });
  });

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 15000);               // 시작 15초 후 (부팅 부하 회피)
  setInterval(check, 4 * 60 * 60 * 1000); // 이후 4시간마다
}

// 메뉴에서 호출하는 수동 업데이트 확인. 결과는 위 이벤트 핸들러가 다이얼로그로 안내.
function checkForUpdatesManual() {
  if (!autoUpdater) { // dev/모듈 미설치 환경
    dialog.showMessageBox({
      type: "info",
      title: "BTC Pet 업데이트",
      message: "개발 환경에서는 업데이트를 확인할 수 없습니다",
      detail: `현재 버전 ${app.getVersion()}`,
      buttons: ["확인"],
    });
    return;
  }
  manualUpdateCheck = true;
  autoUpdater.checkForUpdates().catch(() => {}); // 실패는 error 이벤트에서 안내
}

app.whenReady().then(() => {
  setupAutoUpdate();
  loadSettings();
  walkUnlockedCache = null;                // 설정을 읽은 뒤 해제 상태를 다시 확인
  if ("walkUnlocked" in settings) { delete settings.walkUnlocked; saveSettings(); } // 개발 중 쓰던 옛 해제값 정리
  createOverlay();
  createPanel();
  createTray();
  applyClickThrough();
  applyDisplayStyle();                     // 저장된 표시 스타일이 산책(해제됨)이면 산책 창으로 시작
  openLicenseFromArgv(process.argv);       // .btcpet 파일 더블클릭으로 앱이 새로 켜진 경우
  if (settings.panelPinned) setTimeout(() => togglePanel(), 900);
  setInterval(recheckWalkLicense, 10 * 60 * 1000);

  // 투명 펫 창 상태 소실 대응 (함수 정의 참고)
  //  · 뒤로 밀림: 20초마다 최상위 재선언 — 싸고 깜빡임 없음
  setInterval(ensureOverlayOnTop, 20 * 1000);
  //  · 안 보임: 시스템이 상태 변화를 알려줄 때만 hide→show 복구 (평상시 깜빡임 0)
  powerMonitor.on("resume", () => recoverOverlay("resume"));            // 절전에서 복귀
  powerMonitor.on("unlock-screen", () => recoverOverlay("unlock"));     // 화면 잠금 해제
  screen.on("display-metrics-changed", () => { layoutWalker(); recoverOverlay("display"); }); // 해상도/모니터 변경 (전체화면 게임 종료 포함) — 산책 띠는 새 작업영역에 다시 맞춤
  // 모니터 연결/해제: 고른 모니터가 빠지면 walkDisplay() 가 오버레이 모니터 → 주 모니터로 자동 대체
  screen.on("display-added", () => layoutWalker());
  screen.on("display-removed", () => layoutWalker());
});
app.on("window-all-closed", (e) => e.preventDefault());
