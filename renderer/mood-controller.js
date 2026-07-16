"use strict";
window.BtcPetMoodController = class MoodController {
  constructor(wrap, cfg) {
    this.wrap = wrap;
    this.cfg = cfg;
    this.priceBuf = [];
    this.holdUntil = 0;
    this.releaseTimer = null;
    this.current = "idle";
  }

  className(mood) {
    const classes = [`c-${this.cfg.character}`, `m-${mood}`];
    if (this.cfg.fxStyle === "once") classes.push("fx-once");
    if (this.cfg.fxStyle === "v3") classes.push("fx-v3");
    return classes.join(" ");
  }

  set(mood, { force = false } = {}) {
    const className = this.className(mood);
    if (!force && this.current === mood && this.wrap.className === className) return;
    this.current = mood;
    this.wrap.className = className;
  }

  getThresholds() {
    const defaults = window.BtcPetConfig;
    const pump = Number(this.cfg.moodPumpPct);
    const dump = Number(this.cfg.moodDumpPct);
    const exit = Number(this.cfg.moodExitPct);
    return {
      pump: Number.isFinite(pump) ? pump : defaults.MOOD_ENTER_PCT,
      dump: Number.isFinite(dump) ? dump : defaults.MOOD_ENTER_PCT,
      exit: Number.isFinite(exit) ? exit : defaults.MOOD_EXIT_PCT,
    };
  }

  resolve(pct) {
    const { pump, dump, exit } = this.getThresholds();
    if (this.current === "pump") return pct < exit ? "idle" : "pump";
    if (this.current === "dump") return pct > -exit ? "idle" : "dump";
    if (pct >= pump) return "pump";
    if (pct <= -dump) return "dump";
    return "idle";
  }

  update(price) {
    const now = Date.now();
    const configuredWindow = Number(this.cfg.moodWindowMs);
    const windowMs = Number.isFinite(configuredWindow)
      ? configuredWindow
      : window.BtcPetConfig.PRICE_WINDOW_MS;

    this.priceBuf.push({ t: now, p: price });
    while (this.priceBuf.length && now - this.priceBuf[0].t > windowMs) this.priceBuf.shift();
    if (now < this.holdUntil || this.priceBuf.length < window.BtcPetConfig.MIN_MOOD_SAMPLES) return;

    const start = this.priceBuf[0].p;
    if (!Number.isFinite(start) || start <= 0) return;
    this.set(this.resolve(((price - start) / start) * 100));
  }

  hold(mood, ms) {
    clearTimeout(this.releaseTimer);
    this.holdUntil = Date.now() + ms;
    this.set(mood, { force: true });
    this.releaseTimer = setTimeout(() => {
      this.holdUntil = 0;
      this.set("idle", { force: true });
    }, ms);
  }

  resetPrices() { this.priceBuf = []; }
  destroy() { clearTimeout(this.releaseTimer); }
};
