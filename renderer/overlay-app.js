"use strict";
(async()=>{
  const wrap=document.getElementById("wrap"),pill=document.getElementById("pill");
  const cfg={...window.BtcPetConfig.DEFAULTS};
  const mood=new window.BtcPetMoodController(wrap,cfg);
  const view=new window.BtcPetPriceView({pill,mood});
  const pyo=new window.BtcPetPyoluppy(wrap,cfg);
  const socket=new window.BtcPetSocketClient(()=>window.BtcPetSources[cfg.priceSource]||window.BtcPetSources.bitget,(p,c)=>{view.render(p,c);if(pyo.active)pyo.onPrice(p);});
  const candle=new window.BtcPetCandleScheduler(cfg,pill,()=>mood.hold("candle",6000));
  new window.BtcPetDragController([wrap,pill]);
  const hover=new window.BtcPetHoverActivate([wrap.querySelector(".pet"),pill]);
  const settings=await window.btcpet.getSettings();
  hover.setClickThrough(!!settings.clickThrough);
  if(window.BtcPetSources[settings.priceSource])cfg.priceSource=settings.priceSource;
  if(window.BtcPetConfig.TF_MS[settings.candleTf])cfg.candleTf=settings.candleTf;
  if(typeof settings.character==="string")cfg.character=settings.character;
  if(["loop","once","v3"].includes(settings.fxStyle))cfg.fxStyle=settings.fxStyle;
  if(["pet","pill"].includes(settings.displayStyle))cfg.displayStyle=settings.displayStyle;
  const clampNumber=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback;};
  cfg.moodWindowMs=clampNumber(settings.moodWindowSec,10,600,65)*1000;
  cfg.moodPumpPct=clampNumber(settings.moodPumpPct,0.01,5,0.12);
  cfg.moodDumpPct=clampNumber(settings.moodDumpPct,0.01,5,0.12);
  cfg.moodExitPct=clampNumber(settings.moodExitPct,0,4.99,0.07);
  const applyPetSize=(value)=>{
    const size=Number(value);
    const safeSize=Number.isFinite(size)?Math.min(110,Math.max(72,size)):90;
    document.documentElement.style.setProperty("--pet-user-scale",String(safeSize/90));
  };
  applyPetSize(settings.petSize);
  // 표루피는 전용 컨트롤러가 상태/글로우를 소유한다. engage 시 mood를 일시정지시켜
  // className 충돌을 막고, 다른 캐릭터로 바꾸면 disengage 후 mood를 복원한다.
  const applyCharacter=()=>{
    if(cfg.character==="il-pyoluppy"){mood.paused=true;pyo.engage();}
    else{pyo.disengage();mood.paused=false;mood.set(mood.current,{force:true});}
  };
  view.applyStyle(cfg);mood.set("idle",{force:true});applyCharacter();socket.connect();candle.schedule();
  window.btcpet.onSettingChanged((key,value)=>{
    if(key==="priceSource"&&window.BtcPetSources[value]){cfg.priceSource=value;mood.resetPrices();socket.restart();}
    if(key==="candleTf"&&window.BtcPetConfig.TF_MS[value]){cfg.candleTf=value;candle.schedule();}
    if(key==="character"&&typeof value==="string"){cfg.character=value;applyCharacter();}
    if(key==="fxStyle"&&["loop","once","v3"].includes(value)){cfg.fxStyle=value;if(pyo.active)pyo.refresh();else mood.set(mood.current,{force:true});}
    if(key==="displayStyle"&&["pet","pill"].includes(value)){cfg.displayStyle=value;view.applyStyle(cfg);}
    if(key==="petSize")applyPetSize(value);
    if(key==="clickThrough")hover.setClickThrough(value);
    if(key==="moodWindowSec"){cfg.moodWindowMs=clampNumber(value,10,600,65)*1000;mood.resetPrices();if(pyo.active)pyo.resetPrices();}
    if(key==="moodPumpPct"){cfg.moodPumpPct=clampNumber(value,0.01,5,0.12);mood.resetPrices();if(pyo.active)pyo.resetPrices();}
    if(key==="moodDumpPct"){cfg.moodDumpPct=clampNumber(value,0.01,5,0.12);mood.resetPrices();if(pyo.active)pyo.resetPrices();}
    if(key==="moodExitPct"){cfg.moodExitPct=clampNumber(value,0,4.99,0.07);mood.resetPrices();if(pyo.active)pyo.resetPrices();}
  });
  let devDisplayRestoreTimer=null;
  window.btcpet.onPetTest((payload)=>{
    const action=typeof payload==="string"?payload:payload?.action;
    const fxStyle=typeof payload==="object"?payload?.fxStyle:undefined;
    if(!["idle","pump","dump","candle"].includes(action))return;
    if(["loop","once","v3"].includes(fxStyle))cfg.fxStyle=fxStyle;

    // 개발자 테스트는 pill 표시 중에도 오버레이를 잠시 보여 준다.
    clearTimeout(devDisplayRestoreTimer);
    const wasPill=document.body.classList.contains("style-pill");
    if(wasPill)document.body.classList.remove("style-pill");

    // 표루피는 전용 컨트롤러가 테스트를 처리 (idle/pump/dump -> 고유 상태)
    if(pyo.active){
      pyo.test(action);
      if(wasPill)devDisplayRestoreTimer=setTimeout(()=>document.body.classList.add("style-pill"),action==="candle"?6100:5100);
      return;
    }

    // 동일 상태 재시험에서도 CSS animation이 처음부터 재생되도록 클래스를 한 프레임 비운다.
    wrap.className=`c-${cfg.character} m-idle`;
    void wrap.offsetWidth;
    mood.current="idle";
    mood.hold(action,action==="candle"?6000:5000);

    if(wasPill){
      devDisplayRestoreTimer=setTimeout(()=>document.body.classList.add("style-pill"),action==="candle"?6100:5100);
    }
  });
  window.addEventListener("beforeunload",()=>{clearTimeout(devDisplayRestoreTimer);socket.disconnect();candle.destroy();mood.destroy();});
})();
