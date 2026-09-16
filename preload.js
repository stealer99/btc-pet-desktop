const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("btcpet", {
  setTrayIcon: (dataUrl, tooltip) => ipcRenderer.send("tray-icon", dataUrl, tooltip),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  getVersion: () => ipcRenderer.invoke("get-version"),
  setSetting: (key, value) => ipcRenderer.send("set-setting", key, value),
  onSettingChanged: (cb) => ipcRenderer.on("setting-changed", (_e, k, v) => cb(k, v)),
  sendPrice: (data) => ipcRenderer.send("price", data),
  onPrice: (cb) => ipcRenderer.on("price", (_e, d) => cb(d)),
  openExternal: (url) => ipcRenderer.send("open-external", url),
  togglePanel: () => ipcRenderer.send("toggle-panel"),
  dragStart: (x, y) => ipcRenderer.send("drag-start", x, y),
  dragMove: (x, y) => ipcRenderer.send("drag-move", x, y),
  reportSize: (h) => ipcRenderer.send("panel-size", h),
  petContextMenu: () => ipcRenderer.send("pet-context-menu"),
  setInteractive: (on) => ipcRenderer.send("set-interactive", on),
  triggerPetTest: (action, fxStyle) => ipcRenderer.send("pet-test", { action, fxStyle }),
  onPetTest: (cb) => ipcRenderer.on("pet-test", (_e, payload) => cb(payload)),
  // v2 산책 모드
  walkSetInteractive: (on) => ipcRenderer.send("walk-interactive", on),
  walkCursor: () => ipcRenderer.invoke("walk-cursor"),   // 창 기준 커서 위치 (mouseleave 를 못 받는 경우 대비)
  onWalkMoveMode: (cb) => ipcRenderer.on("walk-move-mode", () => cb()),
  onWalkRole: (cb) => ipcRenderer.on("walk-role", (_e, role) => cb(role)),
  walkAntLeave: (info) => ipcRenderer.send("walk-ant-leave", info),
  walkSay: (msg) => ipcRenderer.send("walk-say", msg),
  onWalkSay: (cb) => ipcRenderer.on("walk-say", (_e, msg) => cb(msg)),
  openWalkSettings: () => ipcRenderer.send("open-walk-settings"),
});

// v2 산책 모드 해제 파일(.btcpet)을 펫·패널 창에 끌어다 놓으면 main 으로 넘긴다 (결과 안내는 main).
// 파일을 창에 떨어뜨렸을 때의 기본 동작(그 파일로 페이지 이동)도 여기서 막는다.
window.addEventListener("dragover", (e) => { e.preventDefault(); });
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  const file = [...(e.dataTransfer?.files || [])].find((f) => /\.btcpet$/i.test(f.name) && f.size <= 16 * 1024);
  if (!file) return;
  try { ipcRenderer.invoke("unlock-license-text", await file.text()); } catch (_) {}
});
