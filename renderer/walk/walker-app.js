"use strict";
// 산책 모드(작업표시줄 마을) 오케스트레이터 — walker.html
// - 창: main.js 가 작업영역 하단에 모니터 폭만큼 까는 투명 띠. 기본은 클릭 통과(forward:true)라
//   mousemove 는 계속 들어온다 → 개미 위에 있을 때만 walkSetInteractive(true)
// - BTC 시세: WebSocket 은 여전히 오버레이(숨김 상태)가 소유하고 main 이 "price" 로 중계
//   (시세 소스 설정·트레이 아이콘을 v1 과 공유)
// - 무드: mood-controller.js 를 그대로 재사용(더미 div). 오버레이와 같은 1초 간격으로만 update
// - 업비트 전광판: upbit-feed.js (KRW-USDT 웹소켓 + 환율)
(async () => {
  const canvas = document.getElementById("scene");
  // 캐릭터 목록(img/walk/characters.js). 설정 walkCharacter 가 없거나 지워진 캐릭터면 첫 번째
  const CHARACTERS = window.BTCPET_CHARACTERS || {};
  const pickCharacter = (key) => CHARACTERS[key] || Object.values(CHARACTERS)[0];
  const scene = new window.BtcPetWalkScene(canvas, {
    character: pickCharacter(null), town: window.BTCPET_TOWN, townDir: "img/town",
  });
  const behavior = new window.BtcPetWalkBehavior(scene.sprites, window.BtcPetWalkScene.ANT_PX);

  // ---- 역할 (모니터 넘어다니기) ----
  // main 이 walk-role 로 알려 준다: home(마을 모니터 창인지), hasAnt(지금 개미가 이 창에 있는지),
  // canCross(left/right 로 옆 모니터 넘어가기 가능), enter(방금 넘어왔으면 들어온 쪽·동작).
  // 역할을 받기 전에는 아무것도 그리지 않는다(마을 없는 모니터 창에 마을·개미가 잠깐 보이는 것 방지)
  let role = window.btcpet.onWalkRole ? { home: false, hasAnt: false, canCross: {} } : { home: true, hasAnt: true, canCross: {} };
  scene.showTown = role.home;
  let lastEnterAt = 0;
  let nightCheckedAt = 0;                   // 밤 판정 시각 (설정이 바뀌면 0 으로 → 다음 프레임에 바로 재판정)

  // ---- 말풍선 ----
  // 무드가 바뀔 때·거래소 도착·봉 마감·개미 클릭·가끔 혼잣말·가격 알림 때 개미 머리 위에 잠깐 띄운다.
  // 개미가 다른 모니터 창에 가 있으면 main 을 거쳐 그 창에 띄운다(walk-say)
  const LINES = {
    pump: ["가즈아!!", "떡상이다!", "퇴사각?!", "매수 가즈아!"],
    dump: ["물렸다…", "존버…", "출근해야지…", "손절각…"],
    calm: ["휴…", "평화롭다", "횡보 중…"],
    arrivePump: ["전광판 보러 왔다!", "불장이다!!"],
    arriveDump: ["아… 전광판 보기 싫다", "내 코인…"],
    click: ["출근 중…", "월급날 언제냐", "오늘도 존버", "코인 확인 중…", "점심 뭐 먹지"],
    night: ["야근 중…", "졸리다…", "새벽 코인…"],
    candle: ["봉 마감!", "새 봉이다!"],
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  let bubble = null;                        // { text, start, until }
  const say = (text, ms = 3200) => {
    const now = performance.now();
    bubble = { text, start: now, until: now + ms };
  };
  const sayWhereAnt = (text, ms) => {
    if (role.hasAnt) say(text, ms);
    else window.btcpet.walkSay?.({ text, ms });
  };
  window.btcpet.onWalkSay?.((m) => { if (role.hasAnt && m && typeof m.text === "string") say(m.text.slice(0, 40), Number(m.ms) || 3200); });
  const bubbleState = (now) => {
    if (!bubble) return null;
    if (now > bubble.until) { bubble = null; return null; }
    return { text: bubble.text, alpha: Math.max(0, Math.min(1, (now - bubble.start) / 150, (bubble.until - now) / 250)) };
  };

  // ---- 설정 (감지 민감도는 overlay-app.js 와 같은 규칙으로 클램프) ----
  const cfg = { ...window.BtcPetConfig.DEFAULTS };
  const clampNumber = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };
  const mood = new window.BtcPetMoodController(document.createElement("div"), cfg);
  const SIGN_BY_SOURCE = { bitget: "BITGET", binance: "BINANCE", hyperliquid: "HYPERLIQUID" };
  let walkRange = "full";                   // 산책 범위 (town / half / full)
  let townOrderSetting = [];                // 건물 순서 설정 (패널 "산책 마을")
  let townHiddenSetting = [];               // 숨긴 건물
  let nightMode = "auto";                   // 밤 모드: auto(19~6시) / day / night
  let bubblesOn = true;                     // 개미 말풍선 (가격 알림 말풍선은 끄지 않음)
  let dashOn = true;                        // 급등·급락 때 거래소로 질주
  let alerts = [];                          // 가격 알림 [{id, market: "btc"|"usdt", price}]
  const applySetting = (key, value) => {
    if (key === "priceSource" && window.BtcPetSources[value]) {
      cfg.priceSource = value;
      scene.exchangeName = SIGN_BY_SOURCE[value] || "BITGET";      // 간판 {exchange}: 전광판 가격과 간판 거래소를 일치시킨다
      mood.resetPrices();
    }
    if (key === "candleTf" && window.BtcPetConfig.TF_MS[value]) { cfg.candleTf = value; candle.schedule(); }
    if (key === "walkTownSide") scene.townSide = value === "right" ? "right" : "left";
    if (key === "walkTownPos") scene.townPos = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null;
    if (key === "walkCompanyName") {
      const name = typeof value === "string" ? value.trim().slice(0, 10) : "";
      scene.companyName = name || "(주)개미상사";
    }
    if (key === "walkTownOrder" || key === "walkTownHidden") {
      if (key === "walkTownOrder") townOrderSetting = Array.isArray(value) ? value : [];
      if (key === "walkTownHidden") townHiddenSetting = Array.isArray(value) ? value : [];
      const known = window.BtcPetWalkScene.TOWN_ORDER;
      const order = townOrderSetting.filter((id, i, a) => known.includes(id) && a.indexOf(id) === i);
      scene.townOrder = [...order, ...known.filter((id) => !order.includes(id))].filter((id) => !townHiddenSetting.includes(id));
    }
    if (key === "walkCharacter" && CHARACTERS[value]) {
      scene.setCharacter(CHARACTERS[value]);
      behavior.sprites = scene.sprites;
    }
    if (key === "walkRange") walkRange = ["town", "half", "full"].includes(value) ? value : "full";
    if (key === "walkNight") { nightMode = ["auto", "day", "night"].includes(value) ? value : "auto"; nightCheckedAt = 0; }
    if (key === "walkBubbles") bubblesOn = value !== false;
    if (key === "walkDash") dashOn = value !== false;
    if (key === "walkAlerts") {
      alerts = (Array.isArray(value) ? value : []).filter((a) => a && ["btc", "usdt"].includes(a.market) && Number.isFinite(a.price) && a.price > 0);
    }
    if (key === "moodWindowSec") { cfg.moodWindowMs = clampNumber(value, 10, 600, 65) * 1000; mood.resetPrices(); }
    if (key === "moodPumpPct") { cfg.moodPumpPct = clampNumber(value, 0.01, 5, 0.12); mood.resetPrices(); }
    if (key === "moodDumpPct") { cfg.moodDumpPct = clampNumber(value, 0.01, 5, 0.12); mood.resetPrices(); }
    if (key === "moodExitPct") { cfg.moodExitPct = clampNumber(value, 0, 4.99, 0.07); mood.resetPrices(); }
  };

  // ---- 봉 마감: 전광판 6초 번쩍 (CandleScheduler 는 displayStyle 이 pill 이 아니면 onCandle 호출) ----
  let flashUntil = 0;
  cfg.displayStyle = "walk";
  const candle = new window.BtcPetCandleScheduler(cfg, document.createElement("div"), () => {
    flashUntil = performance.now() + 6000;
    if (role.home && bubblesOn) sayWhereAnt(pick(LINES.candle));   // 창이 여러 개여도 마을 창에서 한 번만
  });

  const settings = await window.btcpet.getSettings();
  ["priceSource", "candleTf", "walkCharacter", "walkTownSide", "walkTownPos", "walkRange", "walkCompanyName", "walkTownOrder", "walkTownHidden", "walkNight", "walkBubbles", "walkDash", "walkAlerts", "moodWindowSec", "moodPumpPct", "moodDumpPct", "moodExitPct"].forEach((k) => {
    if (settings[k] !== undefined) applySetting(k, settings[k]);
  });
  candle.schedule();
  window.btcpet.onSettingChanged(applySetting);

  // ---- 거래소 질주 ----
  // 급등·급락이 시작되면(또는 가격 알림) 개미가 거래소 타워 앞으로 달려가 전광판을 본다. 마을 창에 개미가 있을 때만
  const DASH_STAY_MS = 6000;
  const towerX = (names) => {
    const spots = scene.layoutTown();
    for (const n of names) { const spot = spots.find((b) => b.name === n); if (spot) return spot.cx; }
    return null;
  };
  const dashTo = (names) => {
    if (!dashOn || !role.home || !role.hasAnt || behavior.x === null) return false;
    const x = towerX(names);
    if (x === null) return false;
    const [minX, maxX] = scene.walkRange(walkRange);
    const margin = window.BtcPetWalkScene.ANT_PX * 0.6;
    const gx = Math.max(minX + margin, Math.min(maxX - margin, x));   // 산책 범위 밖이면 범위 끝까지만
    const runSpeed = scene.sprites.run?.meta.speed || 90;
    behavior.setGoal(gx, (Math.abs(gx - behavior.x) / runSpeed) * 1000 + DASH_STAY_MS);
    return true;
  };
  let dashMood = null;                      // 도착 말풍선 고르기용 (pump/dump)
  const onMoodEvent = (m) => {
    if (m === "pump" || m === "dump") {
      if (bubblesOn && role.hasAnt) say(pick(LINES[m]));
      dashMood = m;
      dashTo([...scene.boardBuildings("btc"), ...scene.boardBuildings("usdt")]);   // BTC 전광판 건물 우선, 없으면 테더
    } else {
      behavior.clearGoal();
      if (bubblesOn && role.hasAnt && Math.random() < 0.4) say(pick(LINES.calm));
    }
  };

  // ---- 가격 알림 ----
  // 마을 창만 검사(업비트 테더 시세는 마을 창에만 있음). 직전 값과 지금 값 사이로 목표 가격을 지나가면 한 번 울리고 지운다
  const lastSeen = { btc: null, usdt: null };
  const checkAlerts = (market, price) => {
    const prev = lastSeen[market];
    lastSeen[market] = price;
    if (!role.home || prev === null || !alerts.length) return;
    const hit = alerts.filter((a) => a.market === market && ((prev < a.price && price >= a.price) || (prev > a.price && price <= a.price)));
    if (!hit.length) return;
    alerts = alerts.filter((a) => !hit.includes(a));
    window.btcpet.setSetting("walkAlerts", alerts);
    for (const a of hit) {
      const up = price >= a.price;
      const label = market === "btc" ? `₿ $${a.price.toLocaleString("en-US")}` : `₮ ₩${a.price.toLocaleString("ko-KR")}`;
      sayWhereAnt(`🔔 ${label} ${up ? "돌파!" : "이탈…"}`, 6000);
      flashUntil = performance.now() + 6000;
      dashMood = up ? "pump" : "dump";
      const btc = scene.boardBuildings("btc"), usdt = scene.boardBuildings("usdt");
      dashTo(market === "btc" ? [...btc, ...usdt] : [...usdt, ...btc]);   // 알린 시세의 전광판 건물로
    }
  };

  // ---- 시세 ----
  const prices = { btc: null, btcPct: null, btcDir: 0, usdt: null, usdtDir: 0, premium: null };
  let lastMoodAt = 0;
  window.btcpet.onPrice(({ price, changePct }) => {
    if (!Number.isFinite(price)) return;
    if (prices.btc !== null && price !== prices.btc) prices.btcDir = Math.sign(price - prices.btc);
    prices.btc = price;
    prices.btcPct = Number.isFinite(changePct) ? changePct : prices.btcPct;
    const now = Date.now();
    if (now - lastMoodAt >= window.BtcPetConfig.RENDER_INTERVAL_MS) { lastMoodAt = now; mood.update(price); }
    checkAlerts("btc", price);
  });
  const upbit = new window.BtcPetUpbitFeed(({ usdt, premium }) => {
    if (prices.usdt !== null && usdt !== prices.usdt) prices.usdtDir = Math.sign(usdt - prices.usdt);
    prices.usdt = usdt;
    prices.premium = premium;
    checkAlerts("usdt", usdt);
  });
  let upbitStarted = false;
  const startUpbitIfHome = () => { if (role.home && !upbitStarted) { upbitStarted = true; upbit.start(); } };
  startUpbitIfHome();
  window.btcpet.onWalkRole?.((r) => {
    if (!r || typeof r !== "object") return;
    role = { home: !!r.home, hasAnt: !!r.hasAnt, canCross: r.canCross || {} };
    scene.showTown = role.home;
    startUpbitIfHome();
    if (role.hasAnt && r.enter) {
      const [minX, maxX] = scene.walkRange(role.home ? walkRange : "full");
      behavior.enter(r.enter.side, r.enter.action, minX, maxX);
      lastEnterAt = performance.now();
    }
    if (!role.hasAnt) { behavior.exiting = null; behavior.leaving = null; }
  });

  // ---- 개발자 테스트 (패널 개발자 모드 버튼) ----
  window.btcpet.onPetTest((payload) => {
    const action = typeof payload === "string" ? payload : payload?.action;
    if (action === "pump" || action === "dump") onMoodEvent(action);   // 질주·말풍선까지 확인할 수 있게
    else if (action === "idle") { onMoodEvent("idle"); behavior.force("idle", 5000); }
    else if (action === "candle") {         // 전광판·말풍선은 마을 창에서만 (창이 여러 개면 중복 방지)
      if (!role.home) return;
      flashUntil = performance.now() + 6000;
      if (bubblesOn) sayWhereAnt(pick(LINES.candle));
    } else if (action === "alert") {        // 가격 알림 흉내: 현재가를 천 달러 단위로 반올림한 가격 돌파
      if (!role.home) return;
      const level = prices.btc ? Math.round(prices.btc / 1000) * 1000 : 70000;
      sayWhereAnt(`🔔 ₿ $${level.toLocaleString("en-US")} 돌파! (테스트)`, 6000);
      flashUntil = performance.now() + 6000;
      dashMood = "pump";
      dashTo([...scene.boardBuildings("btc"), ...scene.boardBuildings("usdt")]);
    }
  });

  // ---- 마우스: 개미 위에서만 창을 상호작용 가능하게 ----
  // 산책 모드에선 개미 클릭으로 패널을 열지 않는다(작업 화면을 가림). 패널은 트레이 클릭·우클릭 메뉴로 연다
  const mouse = { x: -1, y: -1, inside: false };
  let interactive = false;
  const inAnt = (clientX, y) => {
    if (!role.hasAnt) return false;
    const x = clientX;
    const r = scene.antRect({ action: behavior.action, x: behavior.x ?? -9999 });
    const pad = 4;
    return !!r && x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;
  };
  const setInteractive = (on) => {
    if (on === interactive) return;
    interactive = on;
    window.btcpet.walkSetInteractive(on);
    if (!move.on) canvas.style.cursor = on ? "pointer" : "default";   // 개미 클릭 = 말풍선
  };
  // ---- 마을 옮기기 모드 (우클릭 메뉴 > 마을 위치 > 끌어서 옮기기) ----
  // 켜져 있는 동안은 창 전체가 마우스를 받고 마을을 가로로 끌 수 있다.
  // 놓으면 위치 저장 후 종료, 마을 바깥 클릭 또는 30초 무동작이면 옮기지 않고 종료.
  const move = { on: false, drag: null, until: 0 };
  const townCenter = () => (scene.townExtent.left + scene.townExtent.right) / 2;
  const endMove = () => {
    move.on = false;
    move.drag = null;
    canvas.style.cursor = "default";
    interactive = null;                       // setInteractive 가 같은 값이면 무시하므로 반드시 다시 보내게 초기화
    setInteractive(mouse.inside && inAnt(mouse.x, mouse.y));
  };
  window.btcpet.onWalkMoveMode(() => {
    if (!role.home) return;
    move.on = true;
    move.drag = null;
    move.until = performance.now() + 30000;
    setInteractive(true);
  });
  const finishDrag = () => {
    if (!move.drag) return;
    scene.layoutTown();                       // 끈 뒤 한 번도 안 그려졌어도 최신 위치(화면 밖 클램프 포함)로 계산
    window.btcpet.setSetting("walkTownPos", townCenter() / scene.width);   // 화면 폭 대비 비율로 저장
    endMove();
  };

  window.addEventListener("mousemove", (e) => {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.inside = true;
    if (move.on) {
      if (move.drag) {
        scene.townPos = (move.drag.startCenter + (e.clientX - move.drag.startX)) / scene.width;
        move.until = performance.now() + 30000;
      }
      canvas.style.cursor = move.drag ? "grabbing" : scene.townHit(e.clientX, e.clientY) ? "grab" : "default";
      return;
    }
    setInteractive(inAnt(e.clientX, e.clientY));
  });
  let antDown = null;
  window.addEventListener("mousedown", (e) => {
    if (!move.on && e.button === 0 && inAnt(e.clientX, e.clientY)) antDown = { x: e.screenX, y: e.screenY };
    if (!move.on || e.button !== 0) return;
    scene.layoutTown();                       // 판정·시작 위치를 최신 배치 기준으로
    if (scene.townHit(e.clientX, e.clientY)) move.drag = { startX: e.clientX, startCenter: townCenter() };
    else endMove();                           // 마을 바깥 클릭 = 취소
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button !== 0) return;
    if (antDown && Math.abs(e.screenX - antDown.x) + Math.abs(e.screenY - antDown.y) <= 5) {
      const lines = scene.night ? [...LINES.click, ...LINES.night] : LINES.click;
      say(prices.btc && Math.random() < 0.3 ? `지금 ₿ $${Math.round(prices.btc).toLocaleString("en-US")}` : pick(lines));
    }
    antDown = null;
    finishDrag();
  });
  document.addEventListener("mouseleave", () => {
    mouse.inside = false;
    if (move.on) { finishDrag(); return; }    // 끄는 중 창 밖으로 나가면 그 자리에서 고정
    setInteractive(false);
  });
  window.addEventListener("contextmenu", (e) => {
    if (!inAnt(e.clientX, e.clientY)) return;
    e.preventDefault();
    window.btcpet.petContextMenu();
  });

  // ---- 건물 위에 마우스를 올리면 건물을 반투명하게 (뒤에 있는 창 내용을 보며 클릭할 수 있게) ----
  // 창은 기본 클릭 통과 + forward 라 마우스 이동은 들어온다. 옮기기 모드에선 끄고, 부드럽게 전환한다
  const TOWN_HOVER_ALPHA = 0.18;
  let townAlpha = 1;
  const updateTownAlpha = (dt) => {
    const over = !move.on && mouse.inside && scene.townHit(mouse.x, mouse.y);
    const target = over ? TOWN_HOVER_ALPHA : 1;
    townAlpha += (target - townAlpha) * Math.min(1, dt * 12);   // 약 0.15초에 걸쳐 전환
    return townAlpha;
  };

  // ---- 그리기 루프 ----
  window.addEventListener("resize", () => scene.resize());
  scene.resize();
  let last = performance.now();
  let prevMood = mood.current;
  let nextChatterAt = performance.now() + 60000;
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const hovered = mouse.inside && inAnt(mouse.x, mouse.y);
    const rangeKey = role.home ? walkRange : "full";          // 마을 없는 모니터는 화면 전체
    const [minX, maxX] = scene.walkRange(rangeKey);
    if (mood.current !== prevMood) { prevMood = mood.current; onMoodEvent(mood.current); }
    if (!nightCheckedAt || now - nightCheckedAt > 10000) {   // 밤 판정은 10초마다
      nightCheckedAt = now;
      const h = new Date().getHours();
      scene.night = nightMode === "night" || (nightMode === "auto" && (h >= 19 || h < 6));
    }
    if (role.hasAnt) {
      behavior.update(dt, {
        mood: mood.current, hovered, minX, maxX,
        // 가장자리에 닿았을 때: 넘어갈 수 있고(옆 모니터·화면 전체 범위), 막 넘어온 지 5초 지났으면 절반 확률로 넘어간다
        canLeave: (side) => rangeKey === "full" && !behavior.goal && !!role.canCross[side] && now - lastEnterAt > 5000 && Math.random() < 0.5,
      });
      if (behavior.arrived) {
        behavior.arrived = false;
        if (bubblesOn && dashMood) say(pick(dashMood === "pump" ? LINES.arrivePump : LINES.arriveDump));
      }
      // 가끔 혼잣말 (1.5~4분마다, 말풍선이 없고 마우스를 올려두지 않았을 때)
      if (now > nextChatterAt) {
        nextChatterAt = now + (90 + Math.random() * 150) * 1000;
        if (bubblesOn && !bubble && !hovered) say(pick(scene.night ? LINES.night : LINES.click));
      }
      if (behavior.leaving) {
        window.btcpet.walkAntLeave?.({ side: behavior.leaving, action: behavior.action });
        role.hasAnt = false;                // main 이 거절하면 hasAnt:true 역할이 다시 와서 이 창으로 돌아온다
        behavior.leaving = null;
      }
    }
    if (move.on) {
      if (!move.drag && now > move.until) endMove();
    } else if (interactive && !hovered) {
      // 개미가 걸어서 커서 밑을 벗어나면 mousemove 없이도 통과로 되돌린다 (빈 곳이 클릭을 먹지 않게)
      setInteractive(false);
    }
    scene.draw({
      ant: role.hasAnt ? { action: behavior.action, frame: behavior.frame(), x: behavior.x, dir: behavior.dir } : null,
      prices,
      flash: now < flashUntil && Math.floor(now / 400) % 2 === 0,
      moving: move.on ? (move.drag ? "drag" : "idle") : null,
      townAlpha: updateTownAlpha(dt),
      bubble: bubbleState(now),
    });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  window.addEventListener("beforeunload", () => { upbit.stop(); candle.destroy(); mood.destroy(); });
})();
