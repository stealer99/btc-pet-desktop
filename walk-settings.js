"use strict";
// 산책 설정 창 (walk-settings.html). 모든 값은 setSetting 으로 저장 → main 이 산책 창에 setting-changed 로 전달
//   walkCompanyName / walkNeonTexts / walkNeonLamps / walkNeonAlerts / walkTownOrder / walkTownHidden / walkAlerts / walkNight / walkBubbles / walkDash
const $ = (id) => document.getElementById(id);
// 건물 이름표·기본 순서는 img/town/town.js (tools/build_assets.py 가 레시피 art-src/town/town.json 으로 생성)
const TOWN_BUILDINGS = Object.fromEntries(
  (window.BTCPET_TOWN_ORDER || Object.keys(window.BTCPET_TOWN || {}))
    .filter((id) => window.BTCPET_TOWN?.[id])
    .map((id) => [id, window.BTCPET_TOWN[id].label || id])
);
const CHARACTERS = window.BTCPET_CHARACTERS || {};
const statusTimers = {};
const flash = (id, text) => {
  $(id).textContent = text;
  clearTimeout(statusTimers[id]);
  statusTimers[id] = setTimeout(() => { $(id).textContent = ""; }, 1300);
};

let townOrder = Object.keys(TOWN_BUILDINGS);
let townHidden = [];
let alerts = [];
const now = { btc: null, usdt: null };

// ---- 건물 ----
function normalizeOrder(order) {
  const known = Object.keys(TOWN_BUILDINGS);
  const list = (Array.isArray(order) ? order : []).filter((id, i, arr) => known.includes(id) && arr.indexOf(id) === i);
  return [...list, ...known.filter((id) => !list.includes(id))];
}
function renderTown() {
  const box = $("townList");
  box.innerHTML = "";
  townOrder.forEach((id, i) => {
    const shown = !townHidden.includes(id);
    const row = document.createElement("div");
    row.className = `list-row${shown ? "" : " off"}`;
    row.innerHTML = `<label><input type="checkbox" ${shown ? "checked" : ""}> ${TOWN_BUILDINGS[id]}</label>
      <span class="row"><button class="btn mini" ${i === 0 ? "disabled" : ""} title="왼쪽으로">▲</button><button class="btn mini" ${i === townOrder.length - 1 ? "disabled" : ""} title="오른쪽으로">▼</button></span>`;
    row.querySelector("input").addEventListener("change", (e) => {
      townHidden = e.target.checked ? townHidden.filter((x) => x !== id) : [...townHidden, id];
      window.btcpet.setSetting("walkTownHidden", townHidden);
      renderTown();
      flash("townStatus", e.target.checked ? "보이기" : "숨김");
    });
    const [up, down] = row.querySelectorAll("button");
    const swap = (j) => {
      [townOrder[i], townOrder[j]] = [townOrder[j], townOrder[i]];
      window.btcpet.setSetting("walkTownOrder", townOrder);
      renderTown();
      flash("townStatus", "순서 변경");
    };
    up.addEventListener("click", () => swap(i - 1));
    down.addEventListener("click", () => swap(i + 1));
    box.appendChild(row);
  });
}

// ---- 가격 알림 ----
const fmt = (market, price) => (market === "btc" ? `$${price.toLocaleString("en-US")}` : `₩${price.toLocaleString("ko-KR")}`);
function renderAlerts() {
  const box = $("alertList");
  box.innerHTML = "";
  if (!alerts.length) { box.innerHTML = `<div class="empty">등록된 알림이 없어요</div>`; return; }
  for (const a of alerts) {
    const row = document.createElement("div");
    row.className = "list-row";
    const cur = now[a.market];
    const side = cur === null ? "" : a.price >= cur ? " · 돌파 대기 ▲" : " · 이탈 대기 ▼";
    row.innerHTML = `<span>${a.market === "btc" ? "₿" : "₮"} <b class="alert-price">${fmt(a.market, a.price)}</b><span style="color:#7f8aa3">${side}</span></span>
      <button class="btn mini" title="삭제">✕</button>`;
    row.querySelector("button").addEventListener("click", () => {
      alerts = alerts.filter((x) => x.id !== a.id);
      window.btcpet.setSetting("walkAlerts", alerts);
      renderAlerts();
      flash("alertStatus", "삭제");
    });
    box.appendChild(row);
  }
}
function addAlert() {
  const market = $("alertMarket").value;
  const price = Number($("alertPrice").value);
  if (!Number.isFinite(price) || price <= 0) { flash("alertStatus", "가격을 입력하세요"); return; }
  if (alerts.length >= 10) { flash("alertStatus", "최대 10개"); return; }
  alerts = [...alerts, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, market, price }];
  window.btcpet.setSetting("walkAlerts", alerts);
  $("alertPrice").value = "";
  renderAlerts();
  flash("alertStatus", "추가됨");
}
$("alertAdd").addEventListener("click", addAlert);
$("alertPrice").addEventListener("keydown", (e) => { if (e.key === "Enter") addAlert(); });
function renderPriceNow() {
  const parts = [];
  if (now.btc !== null) parts.push(`₿ $${Math.round(now.btc).toLocaleString("en-US")}`);
  if (now.usdt !== null) parts.push(`₮ ₩${now.usdt.toLocaleString("ko-KR")}`);
  $("priceNow").textContent = parts.length ? `현재가 ${parts.join(" · ")}` : "현재가 불러오는 중…";
}
window.btcpet.onPrice(({ price }) => {
  if (!Number.isFinite(price)) return;
  const first = now.btc === null;
  now.btc = price;
  renderPriceNow();
  if (first) renderAlerts();
});
// 테더 현재가: 산책 창의 웹소켓과 별개로 이 창에서 가볍게 조회 (30초마다)
async function loadUsdt() {
  try {
    const d = await (await fetch("https://api.upbit.com/v1/ticker?markets=KRW-USDT")).json();
    const v = Number(d?.[0]?.trade_price);
    if (Number.isFinite(v) && v > 0) { const first = now.usdt === null; now.usdt = v; renderPriceNow(); if (first) renderAlerts(); }
  } catch (_) {}
}
loadUsdt();
setInterval(loadUsdt, 30000);

// ---- 밤 모드 · 개미 ----
function renderNight(v) {
  document.querySelectorAll("#nightSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
}
document.querySelectorAll("#nightSeg button").forEach((b) => b.addEventListener("click", () => {
  window.btcpet.setSetting("walkNight", b.dataset.v);
  renderNight(b.dataset.v);
}));
$("bubbles").addEventListener("change", (e) => window.btcpet.setSetting("walkBubbles", e.target.checked));
$("dash").addEventListener("change", (e) => window.btcpet.setSetting("walkDash", e.target.checked));

// ---- 회사 이름 (입력 멈추고 0.4초 뒤 저장) ----
let nameTimer = null;
$("companyName").addEventListener("input", () => {
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => {
    const name = $("companyName").value.trim().slice(0, 10);
    window.btcpet.setSetting("walkCompanyName", name);
    flash("nameStatus", name ? "저장됨" : "기본 이름");
  }, 400);
});

// ---- 네온 전광판 문구 (board: neon 건물이 있을 때만, 입력 멈추고 0.6초 뒤 저장) ----
$("neonSection").hidden = !Object.values(window.BTCPET_TOWN || {}).some((b) => b && b.board === "neon");
const neonList = (text) => text.split(/\r?\n/).map((s) => s.trim().slice(0, 24)).filter(Boolean).slice(0, 10);
let neonTimer = null;
$("neonTexts").addEventListener("input", () => {
  clearTimeout(neonTimer);
  neonTimer = setTimeout(() => {
    const list = neonList($("neonTexts").value);
    window.btcpet.setSetting("walkNeonTexts", list);
    flash("neonStatus", list.length ? `${list.length}개 저장됨` : "기본 문구");
  }, 600);
});
function renderLamps(v) {
  document.querySelectorAll("#lampSeg button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
}
document.querySelectorAll("#lampSeg button").forEach((b) => b.addEventListener("click", () => {
  window.btcpet.setSetting("walkNeonLamps", b.dataset.v);
  renderLamps(b.dataset.v);
  flash("neonStatus", `전구 ${b.textContent}`);
}));
const NEON_ALERT_INPUTS = { candle4h: "neonCandle4h", candle1d: "neonCandle1d", price: "neonPrice", mood: "neonMood" };
let neonAlerts = {};
for (const [k, id] of Object.entries(NEON_ALERT_INPUTS)) {
  $(id).addEventListener("change", (e) => {
    neonAlerts = { ...neonAlerts, [k]: e.target.checked };
    window.btcpet.setSetting("walkNeonAlerts", neonAlerts);
    flash("neonStatus", e.target.checked ? "알림 켬" : "알림 끔");
  });
}

// ---- 초기값 + 다른 곳(가격 알림이 울려 지워짐 등)에서 바뀐 값 반영 ----
// ---- 캐릭터 (2명 이상일 때만 섹션 표시) ----
function renderCharacters(current) {
  const keys = Object.keys(CHARACTERS);
  $("charSection").hidden = keys.length < 2;
  const sel = $("character");
  sel.innerHTML = keys.map((k) => `<option value="${k}">${CHARACTERS[k].name}</option>`).join("");
  sel.value = CHARACTERS[current] ? current : keys[0] || "";
}
$("character").addEventListener("change", (e) => {
  window.btcpet.setSetting("walkCharacter", e.target.value);
  flash("charStatus", "바꿨어요");
});

window.btcpet.getSettings().then((s) => {
  renderCharacters(s.walkCharacter);
  $("companyName").value = typeof s.walkCompanyName === "string" ? s.walkCompanyName : "";
  $("neonTexts").value = Array.isArray(s.walkNeonTexts) ? s.walkNeonTexts.filter((x) => typeof x === "string").join("\n") : "";
  renderLamps(["blink", "on", "off"].includes(s.walkNeonLamps) ? s.walkNeonLamps : "blink");
  const na = s.walkNeonAlerts && typeof s.walkNeonAlerts === "object" ? s.walkNeonAlerts : {};
  neonAlerts = Object.fromEntries(Object.keys(NEON_ALERT_INPUTS).map((k) => [k, na[k] !== false]));
  for (const [k, id] of Object.entries(NEON_ALERT_INPUTS)) $(id).checked = neonAlerts[k];
  townOrder = normalizeOrder(s.walkTownOrder);
  townHidden = Array.isArray(s.walkTownHidden) ? s.walkTownHidden.filter((id) => TOWN_BUILDINGS[id]) : [];
  alerts = Array.isArray(s.walkAlerts) ? s.walkAlerts : [];
  renderNight(["auto", "day", "night"].includes(s.walkNight) ? s.walkNight : "auto");
  $("bubbles").checked = s.walkBubbles !== false;
  $("dash").checked = s.walkDash !== false;
  renderTown();
  renderAlerts();
});
window.btcpet.onSettingChanged((key, value) => {
  if (key === "walkAlerts") { alerts = Array.isArray(value) ? value : []; renderAlerts(); }
  if (key === "developerMode") $("devSection").hidden = !value;
  if (key === "walkCharacter") renderCharacters(value);
});

// ---- 테스트 (개발자 모드일 때만 표시) ----
// main 의 pet-test 로 모든 산책 창에 보내면 walker-app.js 가 급등·급락·봉 마감·가격 알림을 흉내 낸다
window.btcpet.getSettings().then((s) => { $("devSection").hidden = !s.developerMode; });
const TEST_LABELS = { pump: "급등", dump: "급락", idle: "평온", candle: "봉 마감", alert: "가격 알림" };
document.querySelectorAll("[data-test]").forEach((b) => b.addEventListener("click", () => {
  window.btcpet.triggerPetTest(b.dataset.test);
  flash("devStatus", `${TEST_LABELS[b.dataset.test]} 테스트`);
}));
window.addEventListener("keydown", (e) => { if (e.key === "Escape") window.close(); });
