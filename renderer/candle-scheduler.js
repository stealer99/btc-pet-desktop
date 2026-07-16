"use strict";
window.BtcPetCandleScheduler = class CandleScheduler {
  constructor(cfg,pill,onCandle){this.cfg=cfg;this.pill=pill;this.onCandle=onCandle;this.timer=null;}
  schedule(){clearTimeout(this.timer);const step=window.BtcPetConfig.TF_MS[this.cfg.candleTf];if(!step)return;const now=Date.now(),next=Math.ceil((now+1)/step)*step;this.timer=setTimeout(()=>{if(Date.now()-next<10000){if(this.cfg.displayStyle==="pill"){this.pill.style.animation="none";void this.pill.offsetWidth;this.pill.style.animation="pillflash 0.8s ease-in-out 6";}else this.onCandle();}this.schedule();},next-now+100);}
  destroy(){clearTimeout(this.timer);}
};
