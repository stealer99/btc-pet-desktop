"use strict";
window.BtcPetSourceBitget = Object.freeze({
  ws: "wss://ws.bitget.com/v2/ws/public",
  onOpen(ws) { ws.send(JSON.stringify({ op: "subscribe", args: [{ instType: "USDT-FUTURES", channel: "ticker", instId: "BTCUSDT" }] })); },
  ping(ws) { ws.send("ping"); },
  parse(data) {
    if (data === "pong") return null;
    const m = JSON.parse(data);
    if (m.arg?.channel !== "ticker" || !m.data?.length) return null;
    const t = m.data[0];
    return { price: Number(t.lastPr), changePct: Number(t.change24h) * 100 };
  },
});
