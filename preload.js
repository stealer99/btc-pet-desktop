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
  triggerPetTest: (action, fxStyle) => ipcRenderer.send("pet-test", { action, fxStyle }),
  onPetTest: (cb) => ipcRenderer.on("pet-test", (_e, payload) => cb(payload)),
});
