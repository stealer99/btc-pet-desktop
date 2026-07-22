"use strict";
// 클릭 통과(setIgnoreMouseEvents) 상태에서 펫/필 위에 일정 시간(dwell) 머무르면
// 창을 잠깐 상호작용 가능하게 깨운다. 스쳐 지나갈 땐 통과 유지 -> 빈 직사각형이
// 마우스를 삼키지 않으면서도, 펫에 올려두면 좌/우클릭(드래그·패널·메뉴)이 살아난다.
// main이 applyClickThrough에서 forward:true로 마우스 이동을 넘겨주므로,
// ignore 중에도 mousemove 히트테스트가 가능하다.
window.BtcPetHoverActivate = class HoverActivate {
  constructor(hitEls, { dwellMs = 500 } = {}) {
    this.hitEls = (hitEls || []).filter(Boolean);
    this.dwellMs = dwellMs;
    this.clickThrough = false; // 클릭 통과 모드일 때만 동작
    this.active = false;       // 우리가 깨워둔(상호작용) 상태인지
    this.timer = null;
    this._move = this._move.bind(this);
    this._leave = this._leave.bind(this);
    window.addEventListener("mousemove", this._move);
    // 상호작용 중 창을 벗어나면 즉시 다시 통과로 복귀 (직사각형 잔류 방지)
    document.addEventListener("mouseleave", this._leave);
  }

  setClickThrough(on) {
    on = !!on;
    if (on === this.clickThrough) return;
    this.clickThrough = on;
    // main이 applyClickThrough로 기본 ignore 상태를 리셋하므로 여기선 상태만 정리
    this._clearTimer();
    this.active = false;
  }

  _overAny(x, y) {
    const pad = 4;
    return this.hitEls.some((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return false; // 숨김(display:none) 무시
      return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    });
  }

  _move(e) {
    if (!this.clickThrough) return;
    if (this._overAny(e.clientX, e.clientY)) {
      if (this.active || this.timer) return;      // 이미 깨웠거나 대기 중
      this.timer = setTimeout(() => { this.timer = null; this._activate(); }, this.dwellMs);
    } else {
      this._clearTimer();
      if (this.active) this._deactivate();
    }
  }

  _leave() { if (!this.clickThrough) return; this._clearTimer(); if (this.active) this._deactivate(); }
  _clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; } }
  _activate() { this.active = true; window.btcpet.setInteractive(true); }
  _deactivate() { this.active = false; window.btcpet.setInteractive(false); }
};
