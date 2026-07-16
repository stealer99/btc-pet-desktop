"use strict";
window.BtcPetSourceHyperliquid = Object.freeze({
  ws: "wss://api.hyperliquid.xyz/ws",
  onOpen(ws) { ws.send(JSON.stringify({ method: "subscribe", subscription: { type: "activeAssetCtx", coin: "BTC" } })); },
  ping(ws) { ws.send(JSON.stringify({ method: "ping" })); },
  parse(data) {
    const m = JSON.parse(data);
    if (m.channel !== "activeAssetCtx" || !m.data?.ctx) return null;
    const c = m.data.ctx; const price = Number(c.markPx); const prev = Number(c.prevDayPx);
    return { price, changePct: prev ? ((price - prev) / prev) * 100 : 0 };
  },
});
