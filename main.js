// BTC Pet Desktop - main process (v0.17.23-update-release-notes)
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, screen, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let overlayWin = null;
let panelWin = null;
let tray = null;
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
  [overlayWin, panelWin].forEach((w) => {
    if (w && !w.isDestroyed()) w.webContents.send(channel, ...args);
  });
}

ipcMain.handle("get-settings", () => settings);
ipcMain.on("set-setting", (_e, key, value) => {
  if (typeof key !== "string" || key.length > 64) return;
  settings[key] = value;
  saveSettings();
  if (key === "panelOpacity") {
    if (panelWin && !panelWin.isDestroyed()) panelWin.setOpacity(value);
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setOpacity(value);
  }
  broadcast("setting-changed", key, value);
});
// 오버레이(WS 소유자)가 가격을 쏘면 패널로 중계
ipcMain.on("price", (_e, data) => {
  if (panelWin && !panelWin.isDestroyed()) panelWin.webContents.send("price", data);
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
  if (!["idle", "pump", "dump", "candle"].includes(action)) return;
  if (fxStyle !== undefined && !["loop", "once", "v3"].includes(fxStyle)) return;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send("pet-test", { action, fxStyle });
  }
});
ipcMain.on("panel-size", (_e, h) => {
  if (panelWin && !panelWin.isDestroyed()) {
    panelWin.setContentSize(282, Math.min(Math.ceil(h), 700));
    if (panelAnchored && panelWin.isVisible()) anchorPanel();
  }
});
// 펫 창 드래그 (렌더러 마우스 좌표 기반)
let dragOffset = null;
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
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
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
  panelWin.on("blur", () => { if (!settings.panelPinned) panelWin.hide(); }); // 고정 시엔 유지
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

function anchorPanel() {
  if (!overlayWin || overlayWin.isDestroyed() || !panelWin || panelWin.isDestroyed()) return;
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
  if (settings.panelPos && !settings.panelFollow) {
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

function buildMenu() {
  return Menu.buildFromTemplate([
    { label: "패널 열기/닫기", click: togglePanel },
    { label: "거래소에서 열기", click: () => shell.openExternal(EXCHANGE_URLS[settings.priceSource] || EXCHANGE_URLS.bitget) },
    { label: "패널 항상 표시", type: "checkbox", checked: !!settings.panelPinned,
      click: (item) => {
        settings.panelPinned = item.checked; saveSettings();
        if (item.checked) { if (!panelWin || panelWin.isDestroyed() || !panelWin.isVisible()) togglePanel(); }
      } },
    { label: "패널 펫에 붙여다니기", type: "checkbox", checked: !!settings.panelFollow,
      click: (item) => {
        settings.panelFollow = item.checked; saveSettings();
        if (item.checked && panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) anchorPanel();
      } },
    { label: "패널 위치 초기화 (펫 옆으로)", click: () => { delete settings.panelPos; saveSettings(); } },
    { label: "표시 스타일", submenu: [
      { label: "펫", type: "radio", checked: (settings.displayStyle || "pet") === "pet",
        click: () => { settings.displayStyle = "pet"; saveSettings(); broadcast("setting-changed", "displayStyle", "pet"); } },
      { label: "기본형 (심플)", type: "radio", checked: settings.displayStyle === "pill",
        click: () => { settings.displayStyle = "pill"; saveSettings(); broadcast("setting-changed", "displayStyle", "pill"); } },
    ]},
    { label: "캐릭터", submenu: [
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
      { label: "존버 (바위)", type: "radio", checked: (settings.character) === "il-jonber",
        click: () => { settings.character = "il-jonber"; saveSettings(); broadcast("setting-changed", "character", "il-jonber"); } },
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
    ]},
    { label: "개발자 모드", type: "checkbox", checked: !!settings.developerMode,
      click: (item) => {
        settings.developerMode = item.checked; saveSettings();
        broadcast("setting-changed", "developerMode", item.checked);
        if (item.checked && panelWin && !panelWin.isDestroyed() && !panelWin.isVisible()) togglePanel();
      } },
    { label: "펫 보이기/숨기기", click: () => { if (overlayWin && !overlayWin.isDestroyed()) (overlayWin.isVisible() ? overlayWin.hide() : overlayWin.show()); } },
    { label: "클릭 통과 켜기", type: "checkbox", checked: !!settings.clickThrough,
      click: (item) => { settings.clickThrough = item.checked; saveSettings(); applyClickThrough(); } },
    { label: "부팅 시 자동 실행", type: "checkbox", checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }) },
    { type: "separator" },
    { label: "업데이트 확인", click: checkForUpdatesManual },
    { label: `버전 ${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: "종료", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
}

ipcMain.on("pet-context-menu", () => {
  buildMenu().popup({ window: overlayWin });
});

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setToolTip("BTC Pet");
  tray.on("click", togglePanel);
  tray.setContextMenu(buildMenu());
  tray.on("right-click", () => tray.popUpContextMenu(buildMenu()));
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit(); // 이미 실행 중 -> 새 인스턴스 즉시 종료
} else {
  app.on("second-instance", () => {
    // 중복 실행 시도 시 기존 펫을 앞으로
    if (overlayWin && !overlayWin.isDestroyed()) {
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
  createOverlay();
  createPanel();
  createTray();
  applyClickThrough();
  if (settings.panelPinned) setTimeout(() => togglePanel(), 900);
});
app.on("window-all-closed", (e) => e.preventDefault());
