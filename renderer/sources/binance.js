"use strict";
window.BtcPetSourceBinance = Object.freeze({
  ws: "wss://fstream.binance.com/ws/btcusdt@ticker",
  onOpen() {}, ping() {},
  parse(data) { const t = JSON.parse(data); return t.c ? { price: Number(t.c), changePct: Number(t.P) } : null; },
});
