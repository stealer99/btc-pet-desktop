"use strict";
// 산책 모드 캔버스 그리기: 작업표시줄 마을(건물·간판·전광판) + 출근개미 스프라이트
// - 에셋: img/walk/characters.js · img/town/town.js (tools/build_assets.py 가 레시피로 생성)
//   캐릭터·건물 이름을 코드에 박지 않는다: 건물 순서·이름표·간판(sign)·전광판 종류(board)는 town.js 메타에서 읽음
// - 크기 기준은 출근개미 키 ANT_PX(CSS px). 건물 높이 = heightUnits × ANT_PX × TOWN_SCALE
// - 모든 스프라이트 시트는 머리 폭 기준 같은 배율 → walk 시트 contentHeight 하나로 화면 배율 결정
// - 전광판은 그림 전광판이 너무 작아 코드로 BOARD_SCALE 배 크게 덮어 그린다
//   (테두리 색·두께는 town_slice.py 가 그림에서 측정한 screenFrameColor / screenFramePx)
// - 배치: 화면 왼쪽 구석에 건물을 붙여 모은다 (화면 전체에 흩어두면 가리는 곳이 여러 군데라 작업에 거슬림)
window.BtcPetWalkScene = class WalkScene {
  static ANT_PX = 72;
  // 건물 축소: 원래(집 2·회사 3·거래소 4배) 크기는 화면을 너무 가려 65% 로 줄임
  static TOWN_SCALE = 0.65;
  // 전광판은 건물만큼 줄이면 글씨가 안 읽혀서, 축소 전 150% 크기의 85% 를 유지하도록 역보정
  static BOARD_SCALE = (1.5 * 0.85) / 0.65;
  // 건물 기본 순서: town.js 의 BTCPET_TOWN_ORDER (없으면 목록 순서)
  static get TOWN_ORDER() { return window.BTCPET_TOWN_ORDER || Object.keys(window.BTCPET_TOWN || {}); }
  static TOWN_MARGIN = 12;                      // 화면 왼쪽 끝 여백
  static TOWN_GAP = 14;                         // 건물(전광판 포함) 사이 간격

  constructor(canvas, { character, town, townDir }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.setCharacter(character);
    this.town = {};
    for (const [name, meta] of Object.entries(town || {})) {
      const img = new Image();
      img.src = `${townDir}/${meta.image}`;
      let nightImg = null;
      if (meta.nightImage) { nightImg = new Image(); nightImg.src = `${townDir}/${meta.nightImage}`; }
      this.town[name] = { meta, img, nightImg };
    }
    this.night = false;                       // 밤 모드: 창문에 불 켜진 건물 그림 (tools/town_slice.py --night)
    this.companyName = "(주)개미상사";     // 간판 {company} (마을 설정의 회사 이름)
    this.exchangeName = "BITGET";             // 간판 {exchange} (시세 거래소)
    this.townSide = "left";                   // 마을 위치 프리셋 (설정 walkTownSide: 왼쪽/오른쪽 끝)
    this.townPos = null;                      // 끌어서 옮긴 위치 = 마을 중심 / 전체 폭 비율 (설정 walkTownPos). 있으면 프리셋보다 우선
    this.townOrder = [...WalkScene.TOWN_ORDER]; // 보이는 건물, 왼쪽→오른쪽 (설정 walkTownOrder·walkTownHidden)
    this.showTown = true;                     // 모니터 넘어다니기에서 마을이 없는 모니터 창은 false
    this.width = 0;
    this.height = 0;
  }

  // 캐릭터 교체: characters.js 의 한 항목 { dir, animations: { walk: meta, ... } }
  setCharacter(character) {
    this.sprites = {};
    for (const [name, meta] of Object.entries(character?.animations || {})) {
      const img = new Image();
      img.src = `${character.dir}/${meta.image}`;
      this.sprites[name] = { meta, img };
    }
    const ref = this.sprites.walk || Object.values(this.sprites)[0];
    this.view = ref ? WalkScene.ANT_PX / ref.meta.contentHeight : 1;   // 시트 px → CSS px (머리 폭 기준 같은 배율)
  }

  // 간판 글자: 레시피 sign 의 {company}·{exchange} 를 현재 값으로
  signLabel(meta) {
    if (!meta.signText) return "";
    return meta.signText.replace("{company}", this.companyName).replace("{exchange}", this.exchangeName);
  }

  // 전광판이 있는 건물 이름들 (board: btc / usdt), 보이는 순서대로
  boardBuildings(type) {
    return this.townOrder.filter((n) => this.town[n]?.meta.board === type);
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    const w = Math.round(this.width * dpr), h = Math.round(this.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  }

  // 개미 클릭 판정 사각형 (CSS px). 프레임 전체가 아니라 몸통 위주로 잡아 빈 곳 클릭을 줄인다
  antRect(ant) {
    const sp = this.sprites[ant.action];
    if (!sp) return null;
    const w = sp.meta.headWidth * this.view * 1.15;
    const h = WalkScene.ANT_PX;
    return { x: ant.x - w / 2, y: this.height - h, w, h };
  }

  draw({ ant, prices, flash, moving, townAlpha = 1, bubble = null }) {
    const { ctx } = this;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const ground = this.height;
    if (townAlpha >= 0.999) {
      for (const { name, cx } of this.layoutTown()) this.drawBuilding(name, cx, ground, prices, flash);
    } else {
      // 건물 위에 마우스가 있으면 건물만 반투명 (개미는 그대로).
      // 건물마다 알파를 주면 코드 전광판 아래 깔린 그림 속 작은 전광판이 비쳐 보이므로,
      // 마을 전체를 보조 캔버스에 불투명하게 그린 뒤 한 번에 반투명으로 얹는다
      const layer = this.townLayer();
      const lctx = layer.getContext("2d");
      const saved = this.ctx;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.clearRect(0, 0, this.width, this.height);
      lctx.imageSmoothingEnabled = true;
      lctx.imageSmoothingQuality = "high";
      this.ctx = lctx;
      for (const { name, cx } of this.layoutTown()) this.drawBuilding(name, cx, ground, prices, flash);
      this.ctx = saved;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = townAlpha;
      ctx.drawImage(layer, 0, 0);
      ctx.restore();
    }
    if (ant) this.drawAnt(ant, ground);      // 개미가 다른 모니터에 가 있으면 null
    if (ant && bubble) this.drawBubble(bubble.text, ant.x, bubble.alpha);
    if (moving) this.drawMoveOverlay(moving === "drag");
  }

  // 개미 머리 위 말풍선 (흰 둥근 상자 + 아래 꼬리). 화면 양끝에서 잘리지 않게 상자만 안쪽으로 민다
  drawBubble(text, antX, alpha = 1) {
    if (!text || alpha <= 0) return;
    const { ctx } = this;
    const px = 13, padX = 10, h = 26, tail = 7;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `700 ${px}px "Segoe UI", "Malgun Gothic", sans-serif`;
    const w = Math.min(240, ctx.measureText(text).width + padX * 2);
    const y = this.height - WalkScene.ANT_PX - h - tail - 2;
    const x = Math.max(4, Math.min(antX - w / 2, this.width - w - 4));
    const tx = Math.max(x + 12, Math.min(antX, x + w - 12));
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#1b2230";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 12);
    ctx.moveTo(tx - 6, y + h);
    ctx.lineTo(tx, y + h + tail);
    ctx.lineTo(tx + 6, y + h);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(tx - 5, y + h - 2, 10, 3);   // 상자와 꼬리 사이 테두리 선 지우기
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    this.text(text, x + w / 2, y + h / 2 + 0.5, w - padX * 2, px, 700, "#1b2230");
    ctx.restore();
  }

  // 반투명 마을용 보조 캔버스 (메인 캔버스와 같은 실제 픽셀 크기)
  townLayer() {
    if (!this._layer) this._layer = document.createElement("canvas");
    if (this._layer.width !== this.canvas.width || this._layer.height !== this.canvas.height) {
      this._layer.width = this.canvas.width;
      this._layer.height = this.canvas.height;
    }
    return this._layer;
  }

  // 건물 한 채의 화면 크기와 코드 전광판 사각형(건물 이미지 좌상단 기준). 전광판이 없으면 board = null
  geometry(meta) {
    const h = meta.heightUnits * WalkScene.ANT_PX * WalkScene.TOWN_SCALE;
    const k = h / meta.height;
    const w = meta.width * k;
    let board = null;
    if (meta.screen && meta.screenFrameColor) {
      const scr = meta.screen, bs = WalkScene.BOARD_SCALE;
      const t = (meta.screenFramePx || 20) * k * (bs / 1.5);          // 테두리도 전광판 크기에 비례
      const bw = scr.w * k * bs + t * 2, bh = scr.h * k * bs + t * 2;
      const x = (scr.x + scr.w / 2) * k - bw / 2;
      const y = (scr.y + scr.h) * k + t - bh;                         // 그림 전광판 바닥(다리 붙는 곳) 유지, 위·양옆으로 확장
      board = { x, y, w: bw, h: bh, t };
    }
    return { h, k, w, board };
  }

  // 구석(townSide: left/right)에 건물을 순서대로 붙여 놓는다. 전광판이 타워보다 넓으므로 둘 중 넓은 폭을 차지 폭으로 쓴다
  // 오른쪽이어도 집→회사→업비트→비트겟 순서는 유지하고 묶음 전체를 오른쪽 끝에 맞춘다
  layoutTown() {
    const out = [];
    let cursor = 0;
    for (const name of this.showTown ? this.townOrder : []) {
      const b = this.town[name];
      if (!b) continue;
      const g = this.geometry(b.meta);
      const half = Math.max(g.w, g.board ? g.board.w : 0) / 2;
      out.push({ name, cx: cursor + half });
      cursor += half * 2 + WalkScene.TOWN_GAP;
    }
    const total = Math.max(0, cursor - WalkScene.TOWN_GAP);
    const W = this.width, M = WalkScene.TOWN_MARGIN;
    let start = this.townSide === "right" ? W - M - total : M;
    if (Number.isFinite(this.townPos)) start = this.townPos * W - total / 2;
    start = Math.max(M, Math.min(start, W - M - total));              // 화면 밖으로 나가지 않게
    this.townExtent = { left: start, right: start + total };          // 산책 범위·옮기기 판정용 (CSS px)
    return out.map((o) => ({ ...o, cx: o.cx + start }));
  }

  // 개미가 다닐 수 있는 가로 구간 (설정 walkRange)
  //   full: 화면 전체 / half: 마을이 있는 쪽 절반 / town: 마을 묶음 양옆으로 개미 3마리 폭까지
  walkRange(range) {
    this.layoutTown();                        // townExtent 를 현재 폭·위치 기준으로 갱신
    const W = this.width, { left, right } = this.townExtent;
    if (range === "half") return (left + right) / 2 > W / 2 ? [W / 2, W] : [0, W / 2];
    if (range === "town") {
      const extra = WalkScene.ANT_PX * 3;
      return [Math.max(0, left - extra), Math.min(W, right + extra)];
    }
    return [0, W];
  }

  // 마을 옮기기 모드 표시: 점선 테두리 + 안내 문구
  drawMoveOverlay(dragging) {
    const { ctx } = this;
    const { left, right } = this.townExtent;
    const top = this.height - this.requiredHeight() - 4;
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = dragging ? "#ffd36b" : "rgba(255,255,255,0.9)";
    ctx.beginPath(); ctx.roundRect(left - 6, top, right - left + 12, this.height - top - 1, 8); ctx.stroke();
    ctx.restore();
    const label = dragging ? "놓으면 이 자리에 고정" : "↔ 끌어서 옮기기 · 바깥 클릭하면 취소";
    ctx.font = `700 12px "Segoe UI", "Malgun Gothic", sans-serif`;
    const w = ctx.measureText(label).width + 16;
    const cx = (left + right) / 2, y = Math.max(2, top - 22);
    ctx.fillStyle = "rgba(20,28,36,0.85)";
    ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, 20, 10); ctx.fill();
    this.text(label, cx, y + 10.5, w, 12, 700, "#ffffff");
  }

  townHit(x, y) {
    const e = this.townExtent;
    return !!e && e.right > e.left && x >= e.left - 6 && x <= e.right + 6 && y >= this.height - this.requiredHeight() - 6;
  }

  drawAnt(ant, ground) {
    const sp = this.sprites[ant.action];
    if (!sp || !sp.img.complete) return;
    const { meta, img } = sp;
    const { ctx } = this;
    const k = this.view;
    ctx.save();
    ctx.translate(ant.x, ground);
    if (ant.dir < 0) ctx.scale(-1, 1);          // 시트는 오른쪽을 본다 → 왼쪽 이동은 좌우 반전
    ctx.drawImage(img, ant.frame * meta.frameWidth, 0, meta.frameWidth, meta.frameHeight,
      -meta.anchorX * k, -meta.baselineY * k, meta.frameWidth * k, meta.frameHeight * k);
    ctx.restore();
  }

  drawBuilding(name, cx, ground, prices, flash) {
    const b = this.town[name];
    if (!b || !b.img.complete) return;
    const { meta } = b;
    const night = this.night && b.nightImg && b.nightImg.complete;
    const img = night ? b.nightImg : b.img;
    const { ctx } = this;
    const { h, k, w, board } = this.geometry(meta);
    const left = cx - w / 2, top = ground - h;
    ctx.drawImage(img, left, top, w, h);

    const signLabel = this.signLabel(meta);
    if (meta.sign && signLabel) {
      const s = { x: left + meta.sign.x * k, y: top + meta.sign.y * k, w: meta.sign.w * k, h: meta.sign.h * k };
      // 밤 그림은 간판도 어두워지므로 글자를 밝게
      this.text(signLabel, s.x + s.w / 2, s.y + s.h * 0.54, s.w * 0.86, s.h * 0.62, 700, night ? "#f3e6c4" : "#1f2a44");
    }

    if (board) {
      const { t } = board, bw = board.w, bh = board.h;
      const bx = left + board.x, by = top + board.y;
      const dim = night ? 0.55 : 1;           // 전광판 테두리도 밤 건물 톤에 맞춰 어둡게 (화면 글자는 그대로 밝게)
      const [r, g, bl] = meta.screenFrameColor.map((v) => Math.round(v * dim));
      ctx.lineJoin = "round";
      ctx.beginPath(); ctx.roundRect(bx, by, bw, bh, t * 0.9);
      ctx.fillStyle = `rgb(${r},${g},${bl})`; ctx.fill();
      ctx.lineWidth = Math.max(1, t * 0.3); ctx.strokeStyle = "#141c24"; ctx.stroke();
      const inner = { x: bx + t, y: by + t, w: bw - t * 2, h: bh - t * 2 };
      ctx.beginPath(); ctx.roundRect(inner.x, inner.y, inner.w, inner.h, t * 0.35);
      ctx.fillStyle = flash ? "#4a4632" : "#383635"; ctx.fill();
      ctx.lineWidth = Math.max(1, t * 0.22); ctx.stroke();
      const [line1, line2] = this.boardLines(meta.board, prices);
      const cx2 = inner.x + inner.w / 2;
      this.text(line1[0], cx2, inner.y + inner.h * 0.36, inner.w * 0.9, inner.h * 0.46, 700, line1[1]);
      this.text(line2[0], cx2, inner.y + inner.h * 0.76, inner.w * 0.9, inner.h * 0.32, 600, line2[1]);
    }
  }

  boardLines(board, p) {
    const UP = "#6dffa8", DOWN = "#ff7373", FLAT = "#f4f4f4", DIM = "#9aa0aa";
    const dirColor = (d) => (d > 0 ? UP : d < 0 ? DOWN : FLAT);
    const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
    if (board === "usdt") {
      return [
        p.usdt ? [`₮ ₩${p.usdt.toLocaleString("ko-KR")}`, dirColor(p.usdtDir)] : ["₮ ₩—", DIM],
        Number.isFinite(p.premium) ? [`테더 김프 ${pct(p.premium)}`, "#ffd36b"] : ["업비트 USDT", DIM],
      ];
    }
    return [
      p.btc ? [`₿ $${Math.round(p.btc).toLocaleString("en-US")}`, dirColor(p.btcDir)] : ["₿ $—", DIM],
      Number.isFinite(p.btcPct) ? [`24h ${p.btcPct >= 0 ? "▲" : "▼"} ${pct(p.btcPct)}`, p.btcPct >= 0 ? UP : DOWN] : ["BTC 선물", DIM],
    ];
  }

  // 최대 폭을 넘으면 글자 크기를 줄여 한 줄에 맞춘다
  text(str, x, y, maxW, px, weight, color) {
    const { ctx } = this;
    const font = (size) => `${weight} ${size}px "Segoe UI", "Malgun Gothic", sans-serif`;
    ctx.font = font(px);
    const w = ctx.measureText(str).width;
    if (w > maxW) ctx.font = font(Math.max(4, px * maxW / w));
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(str, x, y);
  }

  // 창 높이 계산용: 가장 높은 건물 + 전광판이 위로 튀어나온 높이 (CSS px)
  requiredHeight() {
    let max = WalkScene.ANT_PX;
    for (const name of this.showTown ? this.townOrder : []) {       // 보이는 건물 기준 (옮기기 테두리·마우스 판정 높이)
      if (!this.town[name]) continue;
      const { h, board } = this.geometry(this.town[name].meta);
      max = Math.max(max, h + (board ? Math.max(0, -board.y) : 0));
    }
    return Math.ceil(max);
  }
};
