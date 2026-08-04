"use strict";
// 파라미(parami) 전용 컨트롤러 — notes/parami_HANDOFF.md 이식.
// 표루피와 격리 방식은 같으나 렌더링이 다르다:
//  - idle이 애니메이션 WebP(<img>로 자동 루프), 나머지는 PNG
//  - 상태 전환은 즉시 스왑 금지 → 순차 페이드(0.14s 아웃 → src 교체 → 0.14s 인)
//  - sleepy 없음(5상태: idle/pump/pumpStrong/dump/dumpStrong/despair)
//  - 하락 계열 keyframe에 scale(1.45) 줌 내장(임의 제거 금지)
// 다른 캐릭터의 background-image 스왑 방식과 섞이지 않도록, 전용 <img>를 .pet에 주입하고
// .c-il-parami .body 는 CSS로 숨긴다. il-parami 선택 시에만 engage.
(() => {
  const WINDOW_MS = 65_000, MIN_SAMPLES = 5;
  const BRIDGE_MS = 300, DESPAIR_MS = 3_000;
  const STRONG_MULT = 3.5, STRONG_EXIT_RATIO = 0.7; // 표루피와 동일: 앱 감도 기준 + 히스테리시스
  const FADE_MS = 140;                              // 0.14s 순차 페이드

  // <img> src는 overlay.html(루트) 기준이라 "../" 없이 img/il/... (CSS의 ../img/il과 다름)
  const IMG = {
    idle:       "img/il/parami_idle_dance.webp",
    pump:       "img/il/parami_pump.png",
    pumpStrong: "img/il/parami_pump.png",
    dump:       "img/il/parami_dump.png",
    dumpStrong: "img/il/parami_dump.png",
    despair:    "img/il/parami_despair.png",
  };
  const UP = new Set(["pump", "pumpStrong"]);
  const DOWN = new Set(["dump", "dumpStrong", "despair"]);
  const family = (s) => (UP.has(s) ? "up" : DOWN.has(s) ? "down" : "neutral");

  window.BtcPetParami = class Parami {
    constructor(wrap, cfg) {
      this.wrap = wrap; this.cfg = cfg;
      this.active = false;
      this.state = "idle";
      this.buf = [];
      this.holdUntil = 0;
      this._bridging = false;
      this._timers = { bridge: null, despair: null, fade: null, anim: null };
      this.img = null;
    }

    engage() {
      if (this.active) return;
      this.petEl = this.wrap.querySelector(".pet");
      if (!this.petEl) return;
      this.img = document.createElement("img");
      this.img.className = "parami-img";
      this.petEl.appendChild(this.img);
      this.active = true;
      this.buf = [];
      this.state = "idle";
      // 최초는 페이드 없이 idle 즉시 표시
      this.img.src = IMG.idle;
      this._setClass("idle");
      this._applyEntrance(undefined);
    }

    disengage() {
      if (!this.active) return;
      this.active = false;
      this._clearTimers();
      if (this.img) this.img.remove();
      this.img = null;
    }

    onPrice(price) {
      if (!this.active) return;
      const now = Date.now();
      const win = Number(this.cfg.moodWindowMs) || WINDOW_MS;
      this.buf.push({ t: now, p: price });
      while (this.buf.length && now - this.buf[0].t > win) this.buf.shift();
      if (this._bridging || now < this.holdUntil || this.buf.length < MIN_SAMPLES) return;
      const start = this.buf[0].p;
      if (!(start > 0)) return;
      this._applyMomentum(((price - start) / start) * 100);
    }

    resetPrices() { this.buf = []; }
    refresh() { if (this.active) this._setClass(this.state); } // fxStyle 변경 시 className만 재적용

    test(action) {
      if (!this.active) return;
      const map = { idle: "idle", pump: "pumpStrong", dump: "dumpStrong", despair: "despair" };
      const st = map[action];
      if (!st) return; // candle/sleepy 등은 파라미에서 무시(파라미엔 sleepy 없음)
      this.holdUntil = Date.now() + 5000;
      this._bridging = false;
      this._setState(st, true);
    }

    // 앱 감도(enter)+히스테리시스(exit). sleepy 없음.
    _targetState(pct) {
      const pumpTh = Number(this.cfg.moodPumpPct) || 0.12;
      const dumpTh = Number(this.cfg.moodDumpPct) || 0.12;
      const exitCfg = Number(this.cfg.moodExitPct);
      const exit = Number.isFinite(exitCfg) ? exitCfg : 0.07;
      const upStrong = pumpTh * STRONG_MULT, downStrong = -dumpTh * STRONG_MULT;
      const upStrongExit = upStrong * STRONG_EXIT_RATIO, downStrongExit = downStrong * STRONG_EXIT_RATIO;
      const cur = this.state;
      if (cur === "pumpStrong") { if (pct >= upStrongExit) return "pumpStrong"; if (pct > exit) return "pump"; }
      else if (cur === "pump") { if (pct >= upStrong) return "pumpStrong"; if (pct > exit) return "pump"; }
      else if (cur === "dumpStrong") { if (pct <= downStrongExit) return "dumpStrong"; if (pct < -exit) return "dump"; }
      else if (cur === "despair") { if (pct <= downStrongExit) return "despair"; if (pct < -exit) return "dump"; }
      else if (cur === "dump") { if (pct <= downStrong) return "dumpStrong"; if (pct < -exit) return "dump"; }
      if (pct >= upStrong) return "pumpStrong";
      if (pct >= pumpTh) return "pump";
      if (pct <= downStrong) return "dumpStrong";
      if (pct <= -dumpTh) return "dump";
      return "idle";
    }

    _applyMomentum(pct) { this._transition(this._targetState(pct)); }

    _transition(target) {
      if (target === this.state) return;
      const cf = family(this.state), tf = family(target);
      // 상승계 <-> 하락계 직행 금지: idle 0.3초 경유
      if (cf !== "neutral" && tf !== "neutral" && cf !== tf) {
        this._bridging = true;
        this._setState("idle");
        clearTimeout(this._timers.bridge);
        this._timers.bridge = setTimeout(() => { this._bridging = false; this._setState(target); }, BRIDGE_MS);
        return;
      }
      this._setState(target);
    }

    _setState(state, force = false) {
      if (!this.active) return;
      if (state === this.state && !force) return;
      const prev = this.state;
      clearTimeout(this._timers.despair);
      this.state = state;
      this._render(prev);
      if (state === "dumpStrong") {
        this._timers.despair = setTimeout(() => this._setState("despair"), DESPAIR_MS);
      }
    }

    // 순차 페이드: 아웃 → src 교체 + 클래스/애니 적용(스왑 후) → 인
    _render(prev) {
      const img = this.img;
      if (!img) return;
      img.style.transition = `opacity ${FADE_MS / 1000}s ease`;
      img.style.opacity = "0";
      clearTimeout(this._timers.fade);
      this._timers.fade = setTimeout(() => {
        if (!this.active || !this.img) return;
        this.img.src = IMG[this.state];
        this._setClass(this.state);        // 애니메이션 클래스는 스왑 후 적용(HANDOFF)
        this._applyEntrance(prev);         // pumpStrong 최초 진입 entrance 1회
        void this.img.offsetWidth;
        this.img.style.opacity = "1";
      }, FADE_MS + 10);
    }

    _setClass(state) {
      let cls = `c-il-parami prm-${state}`;
      if (this.cfg.fxStyle === "once") cls += " fx-once";
      else if (this.cfg.fxStyle === "v3") cls += " fx-v3";
      this.wrap.className = cls;
    }

    // pumpStrong으로 "처음"(비상승계에서) 진입할 때만 entrance 1회, 이후 CSS 루프 애니로 복귀.
    _applyEntrance(prev) {
      if (!this.img) return;
      clearTimeout(this._timers.anim);
      if (this.state === "pumpStrong" && prev !== undefined && !UP.has(prev)) {
        this.img.style.animation = "prm-entrance 0.5s cubic-bezier(.2,1.4,.4,1)";
        this._timers.anim = setTimeout(() => {
          if (this.state === "pumpStrong" && this.img) this.img.style.animation = "";
        }, 520);
      } else {
        this.img.style.animation = ""; // 상태별 CSS 클래스 애니메이션 사용
      }
    }

    _clearTimers() { Object.values(this._timers).forEach((t) => clearTimeout(t)); this._bridging = false; }
  };
})();
