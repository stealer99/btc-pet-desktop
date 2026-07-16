"use strict";
window.BtcPetDragController = class DragController {
  constructor(elements){this.down=null;this.moved=false;this.onDown=this.onDown.bind(this);this.onMove=this.onMove.bind(this);this.onUp=this.onUp.bind(this);this.reset=this.reset.bind(this);this.context=this.context.bind(this);for(const el of elements){el.addEventListener("mousedown",this.onDown);el.addEventListener("contextmenu",this.context);}window.addEventListener("mousemove",this.onMove);window.addEventListener("mouseup",this.onUp);window.addEventListener("blur",this.reset);}
  onDown(e){if(e.button!==0)return;this.down={x:e.screenX,y:e.screenY};this.moved=false;window.btcpet.dragStart(e.screenX,e.screenY);}
  onMove(e){if(!this.down)return;if(Math.abs(e.screenX-this.down.x)+Math.abs(e.screenY-this.down.y)>5)this.moved=true;if(this.moved)window.btcpet.dragMove(e.screenX,e.screenY);}
  onUp(e){if(e.button!==0)return;if(this.down&&!this.moved)window.btcpet.togglePanel();this.reset();}
  reset(){this.down=null;this.moved=false;}
  context(e){e.preventDefault();window.btcpet.petContextMenu();}
};
