"use strict";
// 표루피(pyoluppy) 전용 컨트롤러 — HANDOFF.md 스펙 이식.
// 기존 mood-controller(idle/pump/dump)로는 표현 못 하는 7상태 + 파생 타이머
// + 봉 발광 레이어를 담당한다. 표루피가 선택됐을 때만 engage()되어 wrap className과
// 글로우 div를 "소유"하며, 그동안 mood-controller는 paused로 className을 안 건드린다.
(() => {
  const WINDOW_MS = 65_000, MIN_SAMPLES = 5; // WINDOW_MS는 cfg.moodWindowMs 없을 때만 쓰는 fallback (앱 기본 65초)
  const BRIDGE_MS = 300, DESPAIR_MS = 3_000, SLEEPY_MS = 10 * 60 * 1000; // sleepy: 10분 연속 횡보 시(조정값)
  // 진입 임계는 앱 감도(cfg.moodPumpPct/DumpPct, 기본 0.12%)를 따른다 — 다른 펫과 동일하게 반응.
  // HANDOFF의 고정 0.5%/2%는 65초 모멘텀 기준으론 너무 둔감(빅 상승에도 안 깸)해서 폐기.
  const STRONG_MULT = 3.5;       // pumpStrong/dumpStrong = 진입 임계 × 이 배수 (0.12%→0.42%)
  const STRONG_EXIT_RATIO = 0.7; // strong 유지: 진입값 × 이 비율 밑으로 가야 pump/dump로 강등 (경계 깜빡임 방지)
  const WAKE_PCT = 0.05;         // sleepy는 이만큼 작은 변동에도 깸 (HANDOFF: "가격 움직이면 즉시 해제")

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
      const win = Number(this.cfg.moodWindowMs) || WINDOW_MS; // 앱 감도 윈도우와 동일
      this.buf.push({ t: now, p: price });
      while (this.buf.length && now - this.buf[0].t > win) this.buf.shift();
      if (this._bridging || now < this.holdUntil || this.buf.length < MIN_SAMPLES) return;
      const start = this.buf[0].p;
      if (!(start > 0)) return;
      this._applyMomentum(((price - start) / start) * 100);
    }

    // fxStyle 등 변경 시 현재 상태 재적용
    refresh() { if (this.active) this._setState(this.state, true); }

    // 감도(윈도우/임계) 변경 시 가격 버퍼를 비운다 — 다른 펫(mood.resetPrices)과 동일하게
    // 새 설정이 과도기 없이 즉시 깨끗하게 적용되도록.
    resetPrices() { this.buf = []; }

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

    // 앱 감도(enter) + 히스테리시스(exit)로 다른 펫과 동일하게 반응·유지.
    // 한번 pump/dump에 들면 모멘텀이 exit(기본 0.07%) 밑으로 갈 때까지 유지 -> 반응이 오래 보인다.
    _targetState(pct) {
      const pumpTh = Number(this.cfg.moodPumpPct) || 0.12;
      const dumpTh = Number(this.cfg.moodDumpPct) || 0.12;
      const exitCfg = Number(this.cfg.moodExitPct);
      const exit = Number.isFinite(exitCfg) ? exitCfg : 0.07;
      const upStrong = pumpTh * STRONG_MULT, downStrong = -dumpTh * STRONG_MULT;
      const upStrongExit = upStrong * STRONG_EXIT_RATIO, downStrongExit = downStrong * STRONG_EXIT_RATIO;
      const cur = this.state;
      // strong 상태는 진입값보다 낮은 exit-ratio 밑으로 가야 강등 -> 경계(0.42%) 깜빡임 방지
      if (cur === "pumpStrong") {
        if (pct >= upStrongExit) return "pumpStrong";
        if (pct > exit) return "pump";
      } else if (cur === "pump") {
        if (pct >= upStrong) return "pumpStrong";
        if (pct > exit) return "pump";
      } else if (cur === "dumpStrong") {
        if (pct <= downStrongExit) return "dumpStrong";
        if (pct < -exit) return "dump";
      } else if (cur === "despair") {
        if (pct <= downStrongExit) return "despair";           // 조건 유지되는 동안 지속
        if (pct < -exit) return "dump";
      } else if (cur === "dump") {
        if (pct <= downStrong) return "dumpStrong";
        if (pct < -exit) return "dump";
      }
      if (pct >= upStrong) return "pumpStrong";                // 신규 진입 (enter 임계)
      if (pct >= pumpTh) return "pump";
      if (pct <= downStrong) return "dumpStrong";
      if (pct <= -dumpTh) return "dump";
      return "idle";
    }

    _applyMomentum(pct) {
      const target = this._targetState(pct);
      if (this.state === "sleepy") {
        if (target !== "idle") { this._transition(target); return; }             // 진짜 변동 -> 해당 상태
        if (Math.abs(pct) >= WAKE_PCT) { this._setState("idle", true); return; } // 작은 움직임 -> idle로 깸
        return; // 완전 잠잠 -> 계속 수면
      }
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

      // 이미지 스왑 시 pop. entrance(아래서 점프 등장)는 평온/하락에서 pumpStrong으로
      // "처음" 튀어오를 때만 1회 — pump<->pumpStrong 재진입엔 재생 안 함(HANDOFF "최초 진입 1회").
      const anim = (this.state === "pumpStrong" && !UP.has(prev))
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
