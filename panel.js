const $ = (id) => document.getElementById(id);

// 앱 버전 표시 (하드코딩 방지: 실제 패키지 버전을 main에서 받아온다)
if (window.btcpet.getVersion) {
  window.btcpet.getVersion()
    .then((v) => { const el = $("appver"); if (el && v) el.textContent = "desktop v" + v; })
    .catch(() => {});
}

function render(price, changePct, ts) {
  $("price").textContent = "$" + price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  const up = changePct >= 0;
  $("change").textContent = `${up ? "▲" : "▼"} ${Math.abs(changePct).toFixed(2)}% (24h)`;
  $("change").className = "num " + (up ? "up" : "down");
  if (ts) $("ts").textContent = new Date(ts).toLocaleTimeString("ko-KR");
}

// 저장된 최신값 즉시 표시


// 백그라운드가 갱신하면 실시간 반영
window.btcpet.onPrice(({ price, changePct, ts }) => {
  render(price, changePct, ts);
  if (candles.length) {
    const b = currentBoundary();
    if (lastBoundary === null) lastBoundary = b;
    if (b !== lastBoundary) {
      lastBoundary = b;
      const prevClose = candles[candles.length - 1].c;
      candles.push({ o: prevClose, h: Math.max(prevClose, price), l: Math.min(prevClose, price), c: price });
      if (candles.length > CANDLE_N) candles.shift();
    }
    const last = candles[candles.length - 1];
    last.c = price;
    if (price > last.h) last.h = price;
    if (price < last.l) last.l = price;
    drawChart();
  }
});

// 업비트 KRW-BTC + KRW-USDT 로 김프 계산
function setPct(id, v) {
  const el = $(id);
  el.textContent = (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
  el.className = "v num " + (v >= 0 ? "up" : "down");
}

(async () => {
  try {
    // 환율: 두나무 실시간 고시환율(하나은행 기준) 우선, 실패 시 er-api 폴백
    async function getUsdKrw() {
      // 1순위: 야후 실시간 시장환율 (역외 포함 24h 근접)
      try {
        const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/KRW=X?range=1d&interval=1m");
        const d = await r.json();
        const v = d?.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (v) return { v, src: "시장" };
      } catch (e) {}
      // 2순위: 두나무 고시환율 (하나은행)
      try {
        const r = await fetch("https://quotation-api-cdn.dunamu.com/v1/forex/recent?codes=FRX.KRWUSD");
        const d = await r.json();
        const v = d?.[0]?.basePrice;
        if (v) return { v, src: "고시" };
      } catch (e) {}
      // 3순위: er-api (일 1회)
      try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD");
        const d = await r.json();
        if (d?.rates?.KRW) return { v: d.rates.KRW, src: "보조" };
      } catch (e) {}
      return null;
    }

    const [upbitRes, bitgetRes, fxr] = await Promise.all([
      fetch("https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-USDT"),
      fetch("https://api.bitget.com/api/v2/spot/market/tickers?symbol=BTCUSDT"),
      getUsdKrw(),
    ]);
    const usdkrw = fxr?.v;
    const upbit = await upbitRes.json();
    const bitget = await bitgetRes.json();

    const krwBtc = upbit.find((t) => t.market === "KRW-BTC")?.trade_price;
    const krwUsdt = upbit.find((t) => t.market === "KRW-USDT")?.trade_price;
    const usdtBtc = parseFloat((Array.isArray(bitget.data) ? bitget.data[0] : bitget.data)?.lastPr);

    if (krwBtc) $("krw").textContent = "₩" + krwBtc.toLocaleString("ko-KR");
    if (krwUsdt) $("usdt").textContent = "₩" + krwUsdt.toLocaleString("ko-KR");
    if (usdkrw) $("fxinfo").textContent = "환율 ₩" + usdkrw.toLocaleString("ko-KR", { maximumFractionDigits: 1 }) + " · " + fxr.src;
    // 김치 프리미엄 (달러 환율 기준 - 김프 사이트들과 동일 기준)
    if (krwBtc && usdtBtc && usdkrw) {
      setPct("premium", (krwBtc / (usdtBtc * usdkrw) - 1) * 100);
    }
    // 테더 김프 (KRW-USDT vs 달러 환율)
    if (krwUsdt && usdkrw) {
      setPct("tetherPrem", (krwUsdt / usdkrw - 1) * 100);
    }
  } catch (e) {
    $("krw").textContent = "오류";
  }
})();



// 시세 소스 선택
const SRC_LABELS = { bitget: "BTC · Bitget Futures", binance: "BTC · Binance Futures", hyperliquid: "BTC · Hyperliquid Perp" };
window.btcpet.getSettings().then(({ priceSource }) => {
  const s = priceSource || "bitget";
  $("src").value = s;
  $("srcLabel").textContent = SRC_LABELS[s];
});
$("src").addEventListener("change", (e) => {
  window.btcpet.setSetting("priceSource", e.target.value);
  $("srcLabel").textContent = SRC_LABELS[e.target.value];
});

// 봉 마감 강조 설정
window.btcpet.getSettings().then(({ candleTf }) => {
  $("ctf").value = candleTf || "4h";
});
$("ctf").addEventListener("change", (e) => {
  window.btcpet.setSetting("candleTf", e.target.value);
});

// ---- 미니 캔들차트 ----
const CANDLE_N = 48;
const CANDLE_FETCHERS = {
  bitget: async (tf) => {
    const g = { "15m": "15m", "1h": "1H", "4h": "4H", "1d": "1D" }[tf];
    const r = await fetch(`https://api.bitget.com/api/v2/mix/market/candles?symbol=BTCUSDT&productType=USDT-FUTURES&granularity=${g}&limit=${CANDLE_N}`);
    const d = await r.json();
    // [ts, o, h, l, c, ...] 오름차순
    return d.data.map((c) => ({ o: +c[1], h: +c[2], l: +c[3], c: +c[4] }));
  },
  binance: async (tf) => {
    const r = await fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${tf}&limit=${CANDLE_N}`);
    const d = await r.json();
    return d.map((c) => ({ o: +c[1], h: +c[2], l: +c[3], c: +c[4] }));
  },
  hyperliquid: async (tf) => {
    const ms = { "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000 }[tf];
    const r = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "candleSnapshot",
        req: { coin: "BTC", interval: tf, startTime: Date.now() - ms * CANDLE_N, endTime: Date.now() },
      }),
    });
    const d = await r.json();
    return d.map((c) => ({ o: +c.o, h: +c.h, l: +c.l, c: +c.c }));
  },
};

let candles = [];
let chartTf = "1h";

function drawChart() {
  const cv = $("chart");
  const ctx = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  if (!candles.length) return;

  const pad = 6;
  let lo = Infinity, hi = -Infinity;
  for (const k of candles) { if (k.l < lo) lo = k.l; if (k.h > hi) hi = k.h; }
  const span = hi - lo || 1;
  const y = (p) => pad + (1 - (p - lo) / span) * (H - pad * 2);
  const cw = (W - pad * 2) / candles.length;

  candles.forEach((k, i) => {
    const x = pad + i * cw + cw / 2;
    const up = k.c >= k.o;
    ctx.strokeStyle = ctx.fillStyle = up ? "#0ecb81" : "#f6465d";
    ctx.lineWidth = 1;
    // 심지
    ctx.beginPath();
    ctx.moveTo(x, y(k.h));
    ctx.lineTo(x, y(k.l));
    ctx.stroke();
    // 몸통
    const bw = Math.max(cw * 0.6, 1.5);
    const yo = y(k.o), yc = y(k.c);
    ctx.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(Math.abs(yc - yo), 1));
  });
}

async function loadChart() {
  try {
    const { priceSource } = await window.btcpet.getSettings();
    const src = priceSource || "bitget";
    candles = await CANDLE_FETCHERS[src](chartTf);
    lastBoundary = currentBoundary();
    drawChart();
  } catch (e) {}
}

document.querySelectorAll(".tf").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".tf").forEach((x) => x.classList.remove("active"));
    b.classList.add("active");
    chartTf = b.dataset.tf;
    lastBoundary = null;
    window.btcpet.setSetting("chartTf", chartTf);
    loadChart();
  });
});

// 실시간 틱으로 마지막 캔들 갱신 + 봉 경계에서 새 캔들 생성
const TF_MS_CHART = { "15m": 900000, "1h": 3600000, "4h": 14400000, "1d": 86400000 };
let lastBoundary = null;

function currentBoundary() {
  const step = TF_MS_CHART[chartTf];
  return Math.floor(Date.now() / step) * step;
}


// 소스 변경 시 차트도 다시
$("src").addEventListener("change", () => setTimeout(loadChart, 100));

// 저장된 타임프레임 복원 후 첫 로드
window.btcpet.getSettings().then(({ chartTf: saved }) => {
  if (saved && TF_MS_CHART[saved]) {
    chartTf = saved;
    document.querySelectorAll(".tf").forEach((x) => {
      x.classList.toggle("active", x.dataset.tf === saved);
    });
  }
  loadChart();
});

// 차트 클릭 -> 트레이딩뷰 해당 심볼
const TV_SYMBOLS = {
  bitget: "BITGET:BTCUSDT.P",
  binance: "BINANCE:BTCUSDT.P",
};
const TV_INTERVALS = { "15m": "15", "1h": "60", "4h": "240", "1d": "D" };
$("chart").addEventListener("click", async () => {
  const { priceSource } = await window.btcpet.getSettings();
  const src = priceSource || "bitget";
  const url = src === "hyperliquid"
    ? "https://app.hyperliquid.xyz/trade/BTC"
    : `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(TV_SYMBOLS[src])}&interval=${TV_INTERVALS[chartTf]}`;
  window.btcpet.openExternal(url);
});





// ---- 급등/급락 감지 설정 ----
const DETECT_DEFAULTS = { moodWindowSec: 65, moodPumpPct: 0.12, moodDumpPct: 0.12, moodExitPct: 0.07 };
const DETECT_PRESETS = {
  verySensitive: { label: "매우 민감", moodWindowSec: 30, moodPumpPct: 0.05, moodDumpPct: 0.05, moodExitPct: 0.03 },
  sensitive: { label: "민감", moodWindowSec: 60, moodPumpPct: 0.08, moodDumpPct: 0.08, moodExitPct: 0.05 },
  normal: { label: "보통", moodWindowSec: 65, moodPumpPct: 0.12, moodDumpPct: 0.12, moodExitPct: 0.07 },
  calm: { label: "둔감", moodWindowSec: 120, moodPumpPct: 0.20, moodDumpPct: 0.20, moodExitPct: 0.12 },
  veryCalm: { label: "매우 둔감", moodWindowSec: 300, moodPumpPct: 0.35, moodDumpPct: 0.35, moodExitPct: 0.20 },
};
let detectSaveTimer = null;
let detectAdvancedOpen = false;

function clampDetect(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function normalizeDetectSettings(raw) {
  const pump = clampDetect(raw.moodPumpPct, 0.01, 5, DETECT_DEFAULTS.moodPumpPct);
  const dump = clampDetect(raw.moodDumpPct, 0.01, 5, DETECT_DEFAULTS.moodDumpPct);
  let exit = clampDetect(raw.moodExitPct, 0, 4.99, DETECT_DEFAULTS.moodExitPct);
  exit = Math.min(exit, Math.max(0, Math.min(pump, dump) - 0.01));
  return {
    moodWindowSec: clampDetect(raw.moodWindowSec, 10, 600, DETECT_DEFAULTS.moodWindowSec),
    moodPumpPct: pump,
    moodDumpPct: dump,
    moodExitPct: exit,
  };
}

function sameDetectValues(a, b) {
  return Number(a.moodWindowSec) === Number(b.moodWindowSec)
    && Math.abs(Number(a.moodPumpPct) - Number(b.moodPumpPct)) < 0.0001
    && Math.abs(Number(a.moodDumpPct) - Number(b.moodDumpPct)) < 0.0001
    && Math.abs(Number(a.moodExitPct) - Number(b.moodExitPct)) < 0.0001;
}

function matchingPreset(values) {
  return Object.entries(DETECT_PRESETS).find(([, preset]) => sameDetectValues(values, preset))?.[0] || null;
}

function fillDetectSettings(values) {
  $("moodWindowSec").value = String(values.moodWindowSec);
  $("moodPumpPct").value = values.moodPumpPct.toFixed(2);
  $("moodDumpPct").value = values.moodDumpPct.toFixed(2);
  $("moodExitPct").value = values.moodExitPct.toFixed(2);
  const presetKey = matchingPreset(values);
  document.querySelectorAll(".preset-btn").forEach((button) => button.classList.toggle("active", button.dataset.preset === presetKey));
  const timeText = values.moodWindowSec < 60 ? `${values.moodWindowSec}초` : values.moodWindowSec === 60 ? "60초" : values.moodWindowSec === 65 ? "65초" : `${values.moodWindowSec / 60}분`;
  $("presetSummary").textContent = `${presetKey ? DETECT_PRESETS[presetKey].label : "사용자 설정"} · ${timeText} 기준 · 상승 +${values.moodPumpPct.toFixed(2)}% / 하락 -${values.moodDumpPct.toFixed(2)}%`;
}

function persistDetectSettings(values, statusText = "저장됨") {
  fillDetectSettings(values);
  Object.entries(values).forEach(([key, value]) => window.btcpet.setSetting(key, value));
  $("detectStatus").textContent = statusText;
  clearTimeout(detectSaveTimer);
  detectSaveTimer = setTimeout(() => { $("detectStatus").textContent = ""; }, 1200);
}

function saveDetectSettings() {
  persistDetectSettings(normalizeDetectSettings({
    moodWindowSec: $("moodWindowSec").value,
    moodPumpPct: $("moodPumpPct").value,
    moodDumpPct: $("moodDumpPct").value,
    moodExitPct: $("moodExitPct").value,
  }));
}

function setAdvancedOpen(open) {
  detectAdvancedOpen = !!open;
  $("detectAdvanced").hidden = !detectAdvancedOpen;
  $("advancedToggle").textContent = `${detectAdvancedOpen ? "▾" : "▸"} 고급 설정 직접 조절`;
  setTimeout(fitPanel, 0);
}

window.btcpet.getSettings().then((settings) => fillDetectSettings(normalizeDetectSettings(settings)));
document.querySelectorAll(".preset-btn").forEach((button) => {
  button.addEventListener("click", () => {
    const preset = DETECT_PRESETS[button.dataset.preset];
    if (!preset) return;
    persistDetectSettings(normalizeDetectSettings(preset), `${preset.label} 적용`);
  });
});
$("advancedToggle").addEventListener("click", () => setAdvancedOpen(!detectAdvancedOpen));
["moodWindowSec", "moodPumpPct", "moodDumpPct", "moodExitPct"].forEach((id) => {
  $(id).addEventListener("change", saveDetectSettings);
});

// ---- 개발자 이펙트 테스트 ----
let devLastMood = "pump";
let devFxStyle = "loop";

function setDeveloperMode(enabled) {
  const tools = $("devTools");
  tools.hidden = !enabled;
  if (enabled) {
    document.querySelectorAll(".fx-test").forEach((button) => {
      button.classList.toggle("active", button.dataset.fx === devFxStyle);
    });
  }
  setTimeout(fitPanel, 0);
}

function updateDevStatus(text) {
  $("devStatus").textContent = text;
}

window.btcpet.getSettings().then(({ developerMode, fxStyle }) => {
  devFxStyle = ["loop", "once", "v3"].includes(fxStyle) ? fxStyle : "loop";
  setDeveloperMode(!!developerMode);
});

window.btcpet.onSettingChanged((key, value) => {
  if (key === "developerMode") setDeveloperMode(!!value);
  if (key === "fxStyle" && ["loop", "once", "v3"].includes(value)) {
    devFxStyle = value;
    document.querySelectorAll(".fx-test").forEach((button) => {
      button.classList.toggle("active", button.dataset.fx === value);
    });
  }
});

document.querySelectorAll(".mood-test").forEach((button) => {
  button.addEventListener("click", () => {
    const action = button.dataset.action;
    if (action === "pump" || action === "dump") devLastMood = action;
    window.btcpet.triggerPetTest(action, devFxStyle);
    updateDevStatus(action === "candle" ? "봉 갱신 6초" : `${action.toUpperCase()} 5초`);
  });
});

document.querySelectorAll(".fx-test").forEach((button) => {
  button.addEventListener("click", () => {
    const fx = button.dataset.fx;
    devFxStyle = fx;
    window.btcpet.setSetting("fxStyle", fx);
    window.btcpet.triggerPetTest(devLastMood, fx);
    const labels = { loop: "캔들 3개", once: "단일 캔들", v3: "로켓/번개" };
    updateDevStatus(`${labels[fx]} · ${devLastMood.toUpperCase()}`);
  });
});

function showPanelView(view) {
  const settingsOpen = view === "settings";
  $("marketView").hidden = settingsOpen;
  $("settingsView").hidden = !settingsOpen;
  $("settingsBtn").style.visibility = settingsOpen ? "hidden" : "visible";
  setTimeout(fitPanel, 0);
}

$("settingsBtn").addEventListener("click", () => showPanelView("settings"));
$("settingsBack").addEventListener("click", () => showPanelView("market"));

document.getElementById("closeBtn").addEventListener("click", () => window.close());

// 내용 높이에 맞게 창 크기 조절
function fitPanel() {
  window.btcpet.reportSize(document.body.scrollHeight + 8);
}
window.addEventListener("load", () => setTimeout(fitPanel, 150));
setTimeout(fitPanel, 600);

// 가격 클릭 -> 거래소 선물 페이지 (북마크 대체)
const EXCHANGE_URLS = {
  bitget: "https://www.bitget.com/futures/usdt/BTCUSDT",
  binance: "https://www.binance.com/en/futures/BTCUSDT",
  hyperliquid: "https://app.hyperliquid.xyz/trade/BTC",
};
$("price").style.cursor = "pointer";
$("price").title = "거래소에서 열기";
$("price").addEventListener("click", async () => {
  const { priceSource } = await window.btcpet.getSettings();
  window.btcpet.openExternal(EXCHANGE_URLS[priceSource || "bitget"]);
});

// 도움말
$("helpBtn").addEventListener("click", () => { $("help").hidden = false; });
$("helpClose").addEventListener("click", () => { $("help").hidden = true; });

// 패널 투명도 슬라이더
window.btcpet.getSettings().then(({ panelOpacity }) => {
  $("opac").value = Math.round((panelOpacity ?? 1) * 100);
});
$("opac").addEventListener("input", (e) => {
  window.btcpet.setSetting("panelOpacity", e.target.value / 100);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!$("help").hidden) { $("help").hidden = true; return; }
    if (!$("settingsView").hidden) showPanelView("market");
  }
});
