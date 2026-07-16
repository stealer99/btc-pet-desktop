"use strict";
window.BtcPetConfig = Object.freeze({
  MOOD_ENTER_PCT: 0.12,
  MOOD_EXIT_PCT: 0.07,
  PRICE_WINDOW_MS: 65_000,
  MIN_MOOD_SAMPLES: 5,
  RENDER_INTERVAL_MS: 1_000,
  MAX_RECONNECT_MS: 30_000,
  TF_MS: Object.freeze({ "15m": 900_000, "1h": 3_600_000, "4h": 14_400_000 }),
  DEFAULTS: Object.freeze({
    priceSource: "bitget",
    candleTf: "4h",
    character: "il-wongeum",
    fxStyle: "loop",
    displayStyle: "pet",
    moodWindowMs: 65_000,
    moodPumpPct: 0.12,
    moodDumpPct: 0.12,
    moodExitPct: 0.07,
  }),
});
