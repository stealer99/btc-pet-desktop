"use strict";
// 산책 모드 업비트 전광판용 시세: KRW-USDT 실시간(웹소켓) + 달러 환율(REST, 5분 주기) → 테더 김프
// - 패널(panel.js)은 30초 REST 폴링이라 상시 표시 전광판에선 숫자가 굳어 보여 웹소켓을 쓴다
// - 재연결은 socket-client.js 와 같은 방식: generation 카운터 + 지수 백오프 + 지터
// - 업비트는 무통신 120초면 끊으므로 60초마다 PING 텍스트를 보낸다
window.BtcPetUpbitFeed = class UpbitFeed {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.sock = null;
    this.generation = 0;
    this.attempt = 0;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.fxTimer = null;
    this.state = { usdt: null, fx: null, premium: null };
  }

  start() {
    this.connect();
    this.loadTicker();
    this.loadFx();
    this.fxTimer = setInterval(() => this.loadFx(), 5 * 60 * 1000);
  }

  stop() {
    this.disconnect();
    clearInterval(this.fxTimer);
    this.fxTimer = null;
  }

  disconnect() {
    this.generation += 1;
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    this.pingTimer = this.reconnectTimer = null;
    const old = this.sock;
    this.sock = null;
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; try { old.close(); } catch (_) {} }
  }

  emit() {
    const { usdt, fx } = this.state;
    this.state.premium = usdt && fx ? (usdt / fx - 1) * 100 : null;
    this.onUpdate({ ...this.state });
  }

  setUsdt(price) {
    if (!Number.isFinite(price) || price <= 0) return;
    this.state.usdt = price;
    this.emit();
  }

  connect() {
    this.disconnect();
    const gen = this.generation;
    const ws = new WebSocket("wss://api.upbit.com/websocket/v1");
    ws.binaryType = "arraybuffer";
    this.sock = ws;
    ws.onopen = () => {
      if (gen !== this.generation) return;
      this.attempt = 0;
      ws.send(JSON.stringify([{ ticket: `btcpet-walk-${Date.now()}` }, { type: "ticker", codes: ["KRW-USDT"] }]));
      this.pingTimer = setInterval(() => { if (ws.readyState === WebSocket.OPEN) try { ws.send("PING"); } catch (_) {} }, 60000);
    };
    ws.onmessage = (event) => {
      if (gen !== this.generation) return;
      try {
        const text = typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data);
        const m = JSON.parse(text);
        if (m.code === "KRW-USDT") this.setUsdt(Number(m.trade_price));
      } catch (_) {}
    };
    ws.onerror = () => { try { ws.close(); } catch (_) {} };
    ws.onclose = () => {
      if (gen !== this.generation) return;
      this.sock = null;
      clearInterval(this.pingTimer);
      const delay = Math.min(1000 * 2 ** this.attempt, window.BtcPetConfig.MAX_RECONNECT_MS) + Math.floor(Math.random() * 500);
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => { if (gen === this.generation) this.connect(); }, delay);
    };
  }

  // 웹소켓 첫 체결 전에도 바로 값이 보이게 REST 로 한 번 채운다
  async loadTicker() {
    try {
      const r = await fetch("https://api.upbit.com/v1/ticker?markets=KRW-USDT");
      const d = await r.json();
      if (this.state.usdt === null) this.setUsdt(Number(d?.[0]?.trade_price));
    } catch (_) {}
  }

  // 환율 우선순위는 panel.js 와 동일 (야후 시장 → 두나무 고시 → er-api)
  async loadFx() {
    const tries = [
      async () => (await (await fetch("https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1m")).json())?.chart?.result?.[0]?.meta?.regularMarketPrice,
      async () => (await (await fetch("https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD")).json())?.[0]?.basePrice,
      async () => (await (await fetch("https://open.er-api.com/v6/latest/USD")).json())?.rates?.KRW,
    ];
    for (const t of tries) {
      try {
        const v = Number(await t());
        if (Number.isFinite(v) && v > 0) { this.state.fx = v; this.emit(); return; }
      } catch (_) {}
    }
  }
};
