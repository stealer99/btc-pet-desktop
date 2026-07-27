"use strict";
// 표루피(pyoluppy) 전용 컨트롤러 — HANDOFF.md 스펙 이식.
// 기존 mood-controller(idle/pump/dump)로는 표현 못 하는 7상태 + 파생 타이머
// + 봉 발광 레이어를 담당한다. 표루피가 선택됐을 때만 engage()되어 wrap className과
// 글로우 div를 "소유"하며, 그동안 mood-controller는 paused로 className을 안 건드린다.
(() => {
  const WINDOW_MS = 60_000, MIN_SAMPLES = 5;
  const BRIDGE_MS = 300, DESPAIR_MS = 3_000, SLEEPY_MS = 30 * 60 * 1000; // sleepy 30분(조정값)
  const TH = { pump: 0.5, pumpStrong: 2, dump: -0.5, dumpStrong: -2 };

  // [색, 중심x, 중심y, 폭, 높이, 회전deg] — 256px 원본 좌표 (HANDOFF 실측값)
  const GLOW = {
    idle:       { l: ["red",   28,  65, 44, 110, -10], r: ["green", 224,  93, 46, 100,  16] },
    pump:       { l: ["green", 25,  91, 50, 112, -22], r: ["green", 219,  61, 46, 110,  16] },
    pumpStrong: { l: ["green", 25,  91, 50, 112, -22], r: ["green", 219,  61, 46, 110,  16] },
    dump:       { l: ["red",   31,  54, 50, 112, -12], r: ["red",   230,  93, 54, 112,  22] },
    dumpStrong: { l: ["red",   31,  54, 50, 112, -12], r: ["red",   230,  93, 54, 112,  22] },
    despair:    { l: ["red",   58, 190, 34,  80, -25], r: ["red",   195, 190, 34,  80,  25] },
    sleepy:     { l: ["red",   63, 200, 38,  84, -38], r: ["green", 208, 215, 40,  70,  38] },
  };
  // 상태별 글로우 애니메이션 (HANDOFF: dump는 pump보다 강하게 — 의도된 비대칭)
  const GLOW_ANIM = {
    idle:       { anim: "py-glowPulse 2.6s ease-in-out infinite", blur: 13 },
    pump:       { anim: "py-glowPulse 1.1s ease-in-out infinite", blur: 13 },
    pumpStrong: { anim: "py-glowPulseHard 0.45s ease-in-out infinite", blur: 13 },
    dump:       { anim: "py-glowPulseMid 0.7s ease-in-out infinite", blur: 11 },
    dumpStrong: { anim: "py-glowPulseHard 0.45s ease-in-out infinite", blur: 13 },
    despair:    { anim: "none", blur: 13, fixed: 0.18 },
    sleepy:     { anim: "py-glowPulse 3.6s ease-in-out infinite", blur: 13, lo: 0.2, hi: 0.5 },
  };
  const UP = new Set(["pump", "pumpStrong"]);
  const DOWN = new Set(["dump", "dumpStrong", "despair"]);
  const family = (s) => (UP.has(s) ? "up" : DOWN.has(s) ? "down" : "neutral");
  const band = (pct) =>
    pct >= TH.pumpStrong ? "pumpStrong" :
    pct >= TH.pump ? "pump" :
    pct <= TH.dumpStrong ? "dumpStrong" :
    pct <= TH.dump ? "dump" : "idle";

  window.BtcPetPyoluppy = class Pyoluppy {
    constructor(wrap, cfg) {
      this.wrap = wrap; this.cfg = cfg;
      this.active = false;
      this.state = "idle";
      this.buf = [];
      this.holdUntil = 0;
      this._bridging = false;
      this._timers = { bridge: null, despair: null, sleepy: null, tilt: null, tiltEnd: null };
      this.glowL = null; this.glowR = null;
    }

    engage() {
      if (this.active) return;
      this.petEl = this.wrap.querySelector(".pet");
      this.bodyEl = this.wrap.querySelector(".body");
      if (!this.petEl || !this.bodyEl) return;
      // 글로우 div 2개 (캐릭터 이미지 위에 겹침)
      this.glowL = document.createElement("div");
      this.glowR = document.createElement("div");
      this.petEl.appendChild(this.glowL);
      this.petEl.appendChild(this.glowR);
      this.active = true;
      this.buf = [];
      this.state = "idle";
      this._setState("idle", true);
    }

    disengage() {
      if (!this.active) return;
      this.active = false;
      this._clearTimers();
      if (this.glowL) this.glowL.remove();
      if (this.glowR) this.glowR.remove();
      this.glowL = this.glowR = null;
      // 공유 DOM에 남긴 인라인 스타일 정리 (다른 캐릭터에 영향 금지)
      if (this.petEl) this.petEl.style.animation = "";
      if (this.bodyEl) { this.bodyEl.style.animation = ""; this.bodyEl.style.filter = ""; }
    }

    // 가격 틱마다 호출 (표루피 engage 상태일 때만)
    onPrice(price) {
      if (!this.active) return;
      const now = Date.now();
      this.buf.push({ t: now, p: price });
      while (this.buf.length && now - this.buf[0].t > WINDOW_MS) this.buf.shift();
      if (this._bridging || now < this.holdUntil || this.buf.length < MIN_SAMPLES) return;
      const start = this.buf[0].p;
      if (!(start > 0)) return;
      this._applyMomentum(((price - start) / start) * 100);
    }

    // fxStyle 등 변경 시 현재 상태 재적용
    refresh() { if (this.active) this._setState(this.state, true); }

    // 개발자 패널 테스트 훅
    test(action) {
      if (!this.active) return;
      const map = { idle: "idle", pump: "pumpStrong", dump: "dumpStrong" };
      const st = map[action];
      if (!st) return; // candle 등은 표루피에서 무시
      this.holdUntil = Date.now() + 5000; // 5초간 모멘텀 무시
      this._bridging = false;
      this._setState(st, true); // dumpStrong은 3초 뒤 despair로 자동 승격 (테스트 유용)
    }

    _applyMomentum(pct) {
      const raw = band(pct);
      if (this.state === "sleepy" && raw === "idle") return; // 움직임 없으면 계속 수면
      let target = raw;
      if (raw === "dumpStrong" && this.state === "despair") target = "despair"; // 조건 유지 중 지속
      this._transition(target);
    }

    _transition(target) {
      if (target === this.state) return;
      const cf = family(this.state), tf = family(target);
      // 상승계 <-> 하락계 직행 금지: idle(base) 0.3초 경유
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
      clearTimeout(this._timers.sleepy);
      clearTimeout(this._timers.tilt);
      this.state = state;
      this._render(prev);
      if (state === "dumpStrong") {
        this._timers.despair = setTimeout(() => this._setState("despair"), DESPAIR_MS);
      } else if (state === "idle") {
        this._scheduleIdleTilt();
        this._timers.sleepy = setTimeout(() => this._setState("sleepy"), SLEEPY_MS);
      }
    }

    _render(prev) {
      // className (fxStyle 유지)
      let cls = `c-il-pyoluppy py-${this.state}`;
      if (this.cfg.fxStyle === "once") cls += " fx-once";
      else if (this.cfg.fxStyle === "v3") cls += " fx-v3";
      this.wrap.className = cls;

      // 글로우 배치 + 애니메이션 (scale = 렌더px / 256)
      const petW = parseFloat(getComputedStyle(this.petEl).width) || 100;
      const scale = petW / 256;
      const g = GLOW[this.state], a = GLOW_ANIM[this.state];
      this._place(this.glowL, g.l, scale, a);
      this._place(this.glowR, g.r, scale, a);

      // 본체 이미지 스왑 시 pop / pumpStrong 최초 진입 시 entrance (한 번)
      const anim = (this.state === "pumpStrong" && prev !== "pumpStrong")
        ? "py-entrance 0.5s cubic-bezier(.2,1.4,.4,1)"
        : "py-pop 0.22s ease-out";
      this.petEl.style.animation = "none";
      void this.petEl.offsetWidth;
      this.petEl.style.animation = anim;
    }

    _place(el, spec, scale, a) {
      const [color, cx, cy, w, h, rot] = spec;
      el.className = `glow ${color}`;
      el.style.width = w * scale + "px";
      el.style.height = h * scale + "px";
      el.style.left = (cx - w / 2) * scale + "px";
      el.style.top = (cy - h / 2) * scale + "px";
      el.style.setProperty("--rot", rot + "deg");
      el.style.filter = `blur(${a.blur}px)`;
      el.style.setProperty("--lo", a.lo != null ? a.lo : 0.35);
      el.style.setProperty("--hi", a.hi != null ? a.hi : 0.85);
      if (a.fixed != null) { el.style.animation = "none"; el.style.opacity = a.fixed; }
      else { el.style.opacity = ""; el.style.animation = a.anim; }
    }

    _scheduleIdleTilt() {
      clearTimeout(this._timers.tilt);
      this._timers.tilt = setTimeout(() => this._idleTilt(), 8000 + Math.random() * 4000);
    }
    _idleTilt() {
      if (this.state !== "idle" || !this.bodyEl) return;
      this.bodyEl.style.animation = "py-idleTilt 0.7s ease-in-out";
      clearTimeout(this._timers.tiltEnd);
      this._timers.tiltEnd = setTimeout(() => {
        if (this.state === "idle" && this.bodyEl) this.bodyEl.style.animation = ""; // CSS sway 복귀
      }, 720);
      this._scheduleIdleTilt();
    }

    _clearTimers() {
      Object.values(this._timers).forEach((t) => clearTimeout(t));
      this._bridging = false;
    }
  };
})();
