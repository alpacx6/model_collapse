console.log("game.js LOADED (Modified Version)");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const W = canvas.width, H = canvas.height;

const overlay = document.getElementById("cardOverlay");
const cardRow = document.getElementById("cardRow");
const cardTimerEl = document.getElementById("cardTimer");
const cardTitleEl = document.getElementById("cardTitle");

const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");

const dialogue = document.getElementById("dialogue");
const dlgNameEl = document.getElementById("dlgName");
const dlgRoleEl = document.getElementById("dlgRole");
const dlgTextEl = document.getElementById("dlgText");
const dlgNextEl = document.getElementById("dlgNext");
const dlgAutoBtn = document.getElementById("dlgAutoBtn");
const dlgSkipBtn = document.getElementById("dlgSkipBtn");
const dlgAvatar = document.getElementById("dlgAvatar");

const warnOverlay = document.getElementById("warnOverlay");

const ownedCardsEl = document.getElementById("ownedCards");
const uiStage = document.getElementById("stage");
const uiHp = document.getElementById("hp");
const uiMaxHp = document.getElementById("maxHp");
const uiO2 = document.getElementById("o2");
const uiMaxO2 = document.getElementById("maxO2");
const uiSeedInv = document.getElementById("seedInv");
const uiPlanted = document.getElementById("planted");
const uiTotal = document.getElementById("total");
const uiScore = document.getElementById("score");
const uiHint = document.getElementById("hint");

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function open(el){ el.classList.add("is-open"); }
function close(el){ el.classList.remove("is-open"); }
function setHint(msg){ uiHint.textContent = msg || ""; }

const seedImage = new Image();
const lastImage = new Image();

let running = false;
let lastT = 0;
let rafId = null;
let isEnding = false;

function stopLoop() {
  running = false;
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
}
function startLoop() {
  running = true;
  lastT = performance.now();
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(loop);
}

const held = new Set();
const pressed = new Set();
addEventListener("keydown", (e) => {
  const block = ["ArrowLeft","ArrowRight","ArrowUp"," ","KeyA","KeyD","KeyW","KeyE","KeyF","KeyQ","KeyR","ShiftLeft","ShiftRight"];
  if (block.includes(e.code)) e.preventDefault();
  if (!held.has(e.code)) pressed.add(e.code);
  held.add(e.code);
});
addEventListener("keyup", (e) => held.delete(e.code));

function wasPressed(code) {
  if (pressed.has(code)) { pressed.delete(code); return true; }
  return false;
}
function isHeld(code){ return held.has(code); }

const GRAV = 0.85;
const GROUND_Y = 440;

const platforms = [];
const hazards = [];
const seeds = [];
const plots = [];

const world = {
  camX: 0,
  length: 3600,
  maxSpeedBase:5.0,
  frictionNearGround: 0.84,
};

const player = {
  x: 120, y: 250, w: 40, h: 60,
  vx: 0, vy: -12,
  onGround: false,

  hp: 100,
  maxHpBase: 100,
  maxHpBonus: 0,

  o2: 50,
  maxO2Base: 50,
  maxO2Bonus: 0,

  seedInv: 0,
  planted: 0,
  score: 0,

  invulnMs: 0,
  jumpsMax: 1,
  extraJumpUsed: false,

  suffocatingMs: 0,
  plantCooldownMs: 0,
  waterCooldownMs: 0,

  image: new Image(),
  imgWidth: 30,
  imgHeight: 42,
  direction: 1,
};

function getMaxHp(){ return player.maxHpBase + player.maxHpBonus; }
function getMaxO2(){ return player.maxO2Base + player.maxO2Bonus; }

const SPEAKERS = {
  "주인공": { role:"OPERATOR", color:"#65ffb6", avatar:"images/operator.png" },
  "연구원1": { role:"LAB-01",  color:"#4aa3ff", avatar:"images/researcher1.png" },
  "연구원2": { role:"LAB-02",  color:"#c66bff", avatar:"r2.png" },
};

let dlgActive = false;
let dlgLines = [];
let dlgIdx = 0;
let dlgTyping = false;
let dlgAuto = false;
let dlgOnDone = () => {};
let typingTimer = null;
let autoTimer = null;

function setSpeakerUI(name){
  const s = SPEAKERS[name] || { role:"SYSTEM", color:"#cfe1ff", avatar:"?" };
  dlgNameEl.textContent = name || "???";
  dlgRoleEl.textContent = s.role;
  dlgNameEl.style.color = s.color;
  dlgAvatar.style.boxShadow = `0 12px 26px rgba(0,0,0,.35), 0 0 30px ${s.color}33`;
  dlgAvatar.style.borderColor = `${s.color}55`;
  dlgAvatar.src = s.avatar;
}

function setAutoBtn(){
  dlgAutoBtn.textContent = `AUTO: ${dlgAuto ? "ON" : "OFF"}`;
}

function openDialogue(lines, onDone){
  dlgActive = true;
  dlgLines = lines || [];
  dlgIdx = 0;
  dlgOnDone = onDone || (()=>{});
  dlgAuto = false;
  setAutoBtn();

  open(dialogue);
  showDialogueLine();
}

function closeDialogue(){
  dlgActive = false;
  dlgTyping = false;
  clearTimeout(typingTimer);
  clearTimeout(autoTimer);
  close(dialogue);
}

function typeText(full){
  dlgTyping = true;
  dlgTextEl.textContent = "";
  dlgNextEl.style.opacity = "0";

  const speed = 18;
  let i = 0;

  const step = () => {
    if (!dlgTyping) return;
    i++;
    dlgTextEl.textContent = full.slice(0, i);

    if (i >= full.length){
      dlgTyping = false;
      dlgNextEl.style.opacity = "1";

      if (dlgAuto){
        clearTimeout(autoTimer);
        autoTimer = setTimeout(()=>nextDialogue(), 520);
      }
      return;
    }
    typingTimer = setTimeout(step, speed);
  };
  step();
}

function showDialogueLine(){
  const line = dlgLines[dlgIdx];
  if (!line){
    closeDialogue();
    dlgOnDone();
    return;
  }
  setSpeakerUI(line.name);
  typeText(line.text || "");
}

function skipTyping(){
  if (!dlgTyping) return;
  dlgTyping = false;
  clearTimeout(typingTimer);
  const line = dlgLines[dlgIdx];
  dlgTextEl.textContent = line?.text || "";
  dlgNextEl.style.opacity = "1";
  if (dlgAuto){
    clearTimeout(autoTimer);
    autoTimer = setTimeout(()=>nextDialogue(), 420);
  }
}

function nextDialogue(){
  if (!dlgActive) return;
  if (dlgTyping){ skipTyping(); return; }
  dlgIdx++;
  showDialogueLine();
}

dlgAutoBtn.addEventListener("click", ()=>{
  dlgAuto = !dlgAuto;
  setAutoBtn();
  if (dlgAuto && !dlgTyping){
    clearTimeout(autoTimer);
    autoTimer = setTimeout(()=>nextDialogue(), 520);
  }
});
dlgSkipBtn.addEventListener("click", ()=>{
  if (!dlgActive) return;
  dlgTyping = false;
  clearTimeout(typingTimer);
  dlgIdx = dlgLines.length;
  showDialogueLine();
});

dialogue.addEventListener("click", ()=> nextDialogue());
addEventListener("keydown", (e)=>{
  if (!dlgActive) return;
  if (e.code === "Space") nextDialogue();
  if (e.code === "ShiftLeft" || e.code === "ShiftRight"){
    dlgAuto = !dlgAuto;
    setAutoBtn();
    if (dlgAuto && !dlgTyping){
      clearTimeout(autoTimer);
      autoTimer = setTimeout(()=>nextDialogue(), 520);
    }
  }
});

const INTRO_DIALOGUE = [
  { name:"주인공", text:"안녕하세요! 이번에 새로 파견된 로봇 조종사입니다!" },
  { name:"연구원1", text:"반가워! 이렇게 보니 또 새롭네." },
  { name:"연구원2", text:"거두절미하고.. 바로 프로젝트 시작하자." },
  { name:"연구원1", text:"얼마만에 보는 새로운 사람인데!. 좀 대화도 하고, 밥도 먹고.." },
  { name:"연구원2", text:"시간 없어. 지금도 오염은 전이되고 있다고." },
  { name:"연구원1", text:"에이.. 알았어. 그럼 갈까?" },
  { name:"주인공", text:"네..! 맡겨만 주세요!" },
  { name:"연구원2", text:"산소는 계속 줄어들고, 독성/가시 충돌은 즉시 손상으로 이어져." },
  { name:"연구원1", text:"로봇이지만 얘도 산소에 영향을 많이 받거든." },
  { name:"연구원2", text:"초록 링은 '심는 자리'야. 씨앗을 얻고 E로 심은 다음 F로 물을 주면 된다." },
  { name:"연구원1", text:"그리고 심은 자리 옆에 잠깐 있으면 산소가 조금 채워질거야!" },
  { name:"연구원2", text:"마지막으로 카드 선택이 중요해. 희귀도 높은 카드일수록 테두리가 강하게 빛날 거야. 네가 필요한 능력을 최우선으로 얻도록." },
  { name:"주인공", text:"카드라..신기하네요. 그럼 시작하겠습니다!" },
];

const END_DIALOGUE = [
  { name:"연구원1", text:"어때? 지구를 복구한 소감은." },
  { name:"주인공", text:"실감이 안 난달까요.. 그보다. 정말 아름답다고 생각해요." },
  { name:"연구원2", text:"이렇게 깨끗한 지구는 처음봐. 지구의 본모습을 보는 느낌이랄까." },
  { name:"연구원2", text:"그래도. 지구 재생 프로젝트는 끝나지 않았어." },
  { name:"주인공", text:"그럼요.! 아직 복구해야할게 산더미인걸요." },
  { name:"연구원1", text:"이미 로봇들은 제작해놨다고~!" },
  { name:"주인공", text:"바..바로 시작하는 건가요..?" },
  { name:"연구원2", text:"하하. 오늘은 감상하면서 쉬자." },
  { name:"주인공", text:"휴.. 다행이다." },
];

const LOADING_QUOTES = [
  "하루에 종이 한 장을 아껴쓰면, 4500그루의 나무를 지킬 수 있습니다.",
  "작은 녹색이 모여 숲이 됩니다.",
  "쓰레기는 사라지지 않습니다. 장소만 바뀔 뿐입니다.",
  "당신의 선택이 지구의 내일을 바꿉니다.",
  "오염은 빠르고, 회복은 느립니다. 그래서 지금이 중요합니다.",
];

async function showLoadingLine(){
  open(loading);
  loadingText.textContent = LOADING_QUOTES[Math.floor(Math.random()*LOADING_QUOTES.length)];
  await new Promise(r=>setTimeout(r, 1100));
  close(loading);
}

const RARITY = {
  common:    { name:"일반",      w:0.60, cls:"r-common" },
  rare:      { name:"레어",      w:0.27, cls:"r-rare" },
  epic:      { name:"희귀",      w:0.08, cls:"r-epic" },
  legendary: { name:"매우 희귀", w:0.05, cls:"r-legendary" },
};

const owned = new Map();
const pickedOnce = new Set();
const oneTimeUsed = new Set();

const upgrade = {
  hpTier: 0, speedTier: 0,
  oxygenBonus: 0,
  healHoldMs: 900,
  instantOxygen: false,
  periodicO2: false,
  periodicTimer: 0,
  shields: { poison:0, spike:0 },
  hasActivatable: false,
  activatableId: null,
};

const CARD_DEFS = [
  { id:"hp_15", rarity:"common", name:"체력 증가", emoji:"❤️", desc:"최대체력 +15", type:"hp", tier:1 },
  { id:"shield_poison", rarity:"common", name:"독성 보호막", emoji:"🟣", desc:"독성 1회 방어 (1회용)", type:"shield", kind:"poison", oneTime:true },
  { id:"shield_spike", rarity:"common", name:"가시 방패", emoji:"🛡️", desc:"가시 1회 방어 (1회용)", type:"shield", kind:"spike", oneTime:true },
  { id:"o2_plus3", rarity:"common", name:"산소 공급", emoji:"🌿", desc:"식물 O₂ 획득량 +3", type:"o2bonus", value:3 },
  { id:"speed_10", rarity:"common", name:"빠른 속도", emoji:"🏃", desc:"이동 속도 +10%", type:"speed", tier:1 },
  { id:"heal_fast", rarity:"common", name:"가속화", emoji:"⏱️", desc:"식물 옆 대기 시간이 0.5초로 감소", type:"healhold", ms:500 },

  { id:"hp_30", rarity:"rare", name:"체력 증가+", emoji:"💗", desc:"최대체력 +30 (업그레이드)", type:"hp", tier:2, requires:["hp_15"] },
  { id:"speed_20", rarity:"rare", name:"더 빠른 속도", emoji:"⚡", desc:"이동 속도 +20% (업그레이드)", type:"speed", tier:2, requires:["speed_10"] },
  { id:"o2_plus6", rarity:"rare", name:"더 많은 산소 공급", emoji:"🍃", desc:"식물 O₂ 획득량 +6 (업그레이드)", type:"o2bonus", value:6, requires:["o2_plus3"] },

  { id:"instant_o2", rarity:"epic", name:"슈퍼 가속화", emoji:"✨", desc:"식물에 물을 주면 즉시 O₂ 획득", type:"instant_o2" },
  { id:"spike_remove", rarity:"epic", name:"가시 제거기", emoji:"🧹", desc:"R키: 모든 가시 제거 (1회용)", type:"activate", act:"spike_remove", oneTime:true },
  { id:"poison_remove", rarity:"epic", name:"독성 제거기", emoji:"🧪", desc:"R키: 모든 독성 제거 (1회용)", type:"activate", act:"poison_remove", oneTime:true },
  { id:"o2_generator", rarity:"epic", name:"산소 공급기", emoji:"🔋", desc:"3초마다 O₂ +5", type:"periodic_o2" },
  { id:"speed_30", rarity:"epic", name:"매우 빠른 속도", emoji:"💨", desc:"이동 속도 +30% (업그레이드)", type:"speed", tier:3, requires:["speed_20"] },

  { id:"double_jump", rarity:"legendary", name:"더블 점프!", emoji:"🦘", desc:"공중 점프 1회 추가", type:"double_jump" },
];

function defById(id){ return CARD_DEFS.find(c=>c.id===id); }

function renderOwnedCards(){
  ownedCardsEl.innerHTML = "";
  const list = Array.from(owned.keys()).map(defById).filter(Boolean);
  for(const def of list){
    const st = owned.get(def.id);
    const suffix = def.oneTime ? (st?.usesLeft ? " (1회)" : " (소모)") : "";
    const item = document.createElement("div");
    item.className = "ownedCard";
    item.innerHTML = `<span class="emo">${def.emoji}</span>
      <span><b>${def.name}</b>${suffix}<br/>
      <span style="color:#9bb0d0;font-size:12px">${def.desc}</span></span>`;
    ownedCardsEl.appendChild(item);
  }
}

function isEligible(def){
  if (pickedOnce.has(def.id)) return false;
  if (owned.has(def.id)) return false;
  if (def.oneTime && oneTimeUsed.has(def.id)) return false;

  if (def.requires){
    for(const req of def.requires) if(!owned.has(req)) return false;
  }
  if (def.type==="hp" && upgrade.hpTier >= def.tier) return false;
  if (def.type==="speed" && upgrade.speedTier >= def.tier) return false;
  if (def.type==="o2bonus" && upgrade.oxygenBonus >= def.value) return false;
  if (def.type==="activate" && upgrade.hasActivatable) return false;

  return true;
}

function rollRarity(){
  const r = Math.random();
  let acc = 0;
  for (const k of ["common","rare","epic","legendary"]){
    acc += RARITY[k].w;
    if (r < acc) return k;
  }
  return "common";
}
function pickRandomCard(rarity){
  const pool = CARD_DEFS.filter(c=>c.rarity===rarity && isEligible(c));
  if (pool.length) return pool[Math.floor(Math.random()*pool.length)];
  for (const rr of ["legendary","epic","rare","common"]){
    const p2 = CARD_DEFS.filter(c=>c.rarity===rr && isEligible(c));
    if (p2.length) return p2[Math.floor(Math.random()*p2.length)];
  }
  return null;
}

function applyCardImmediate(def){
  if (def.type==="hp"){
    upgrade.hpTier = Math.max(upgrade.hpTier, def.tier);
    player.maxHpBonus = (upgrade.hpTier===2)? 30 : (upgrade.hpTier===1? 15 : 0);
    player.hp = clamp(player.hp, 0, getMaxHp());
  }
  if (def.type==="speed") upgrade.speedTier = Math.max(upgrade.speedTier, def.tier);
  if (def.type==="o2bonus") upgrade.oxygenBonus = Math.max(upgrade.oxygenBonus, def.value);
  if (def.type==="healhold") upgrade.healHoldMs = Math.min(upgrade.healHoldMs, def.ms);
  if (def.type==="instant_o2") upgrade.instantOxygen = true;
  if (def.type==="periodic_o2") upgrade.periodicO2 = true;
  if (def.type==="double_jump") player.jumpsMax = 2;
  if (def.type==="shield") upgrade.shields[def.kind] += 1;

  if (def.type==="activate"){
    upgrade.hasActivatable = true;
    upgrade.activatableId = def.id;
    setHint("사용형 카드 보유: R키로 발동");
  }
}

function addOwnedCard(id){
  const def = defById(id);
  if (!def) return;
  pickedOnce.add(id);
  owned.set(id, { usesLeft: def.oneTime ? 1 : 0 });
  applyCardImmediate(def);
  renderOwnedCards();
}

function useActivatableCard(){
  if (!upgrade.hasActivatable || !upgrade.activatableId) return;
  const id = upgrade.activatableId;
  const st = owned.get(id);
  if (!st || st.usesLeft <= 0 || oneTimeUsed.has(id)) return;
  const def = defById(id);
  if (!def) return;

  if (def.act === "spike_remove"){
    for (let i=hazards.length-1;i>=0;i--) if (hazards[i].kind==="spike") hazards.splice(i,1);
    setHint("✅ 가시 제거기 사용!");
  }
  if (def.act === "poison_remove"){
    for (let i=hazards.length-1;i>=0;i--) if (hazards[i].kind==="orb") hazards.splice(i,1);
    setHint("✅ 독성 제거기 사용!");
  }

  st.usesLeft = 0;
  oneTimeUsed.add(id);
  renderOwnedCards();
}

let cardPickActive = false;
let cardPickTimer = 0;
let cardOptions = [];
let stageReady = false;

function showCardPick(stageIndex){
  cardPickActive = true;
  cardPickTimer = 5.0;
  open(overlay);
  cardTitleEl.textContent = `스테이지 ${stageIndex+1} 시작 - 카드 선택`;

  const opts = [];
  let guard = 0;
  while (opts.length < 3 && guard++ < 80){
    const rar = rollRarity();
    const c = pickRandomCard(rar);
    if (!c) break;
    if (opts.some(x=>x.id===c.id)) continue;
    opts.push(c);
  }
  while (opts.length < 3){
    const c = pickRandomCard("common") || pickRandomCard("rare") || pickRandomCard("epic") || pickRandomCard("legendary");
    if (!c) break;
    if (opts.some(x=>x.id===c.id)) continue;
    opts.push(c);
  }
  cardOptions = opts;
  renderCardOptions();
}

function renderCardOptions(){
  cardRow.innerHTML = "";
  cardOptions.forEach((c, idx)=>{
    const div = document.createElement("div");
    div.className = `card ${RARITY[c.rarity].cls}`;
    div.innerHTML = `
      <div class="rarity">${RARITY[c.rarity].name} 카드</div>
      <div class="name">${c.name}</div>
      <div class="emoji">${c.emoji}</div>
      <div class="desc">${c.desc}</div>`;
    div.addEventListener("click", ()=>chooseCard(idx));
    cardRow.appendChild(div);
  });
}
function hideCardPick(){ cardPickActive = false; close(overlay); }
function chooseCard(idx){
  const chosen = cardOptions[idx];
  if (!chosen) return;
  addOwnedCard(chosen.id);
  hideCardPick();
  stageReady = true;
}
function autoChooseCard(){
  const idx = Math.floor(Math.random()*cardOptions.length);
  chooseCard(idx);
}

// 스테이지 정의
function baseStages10(){
  return [
    {
      name: "Stage 1 - 메마른 초입",
      length: 3600,
      bg: { skyTop:[255,190,120], skyBot:[220,140,80], haze:[90,55,20] },
      steps: [
        { x: 260, y: 370, w: 170, h: 24 }, { x: 520, y: 330, w: 140, h: 24 }, { x: 760, y: 290, w: 140, h: 24 },
        { x: 1040, y: 355, w: 220, h: 24 }, { x: 1360, y: 315, w: 160, h: 24 }, { x: 1620, y: 275, w: 160, h: 24 },
        { x: 1920, y: 345, w: 220, h: 24 }, { x: 2260, y: 305, w: 160, h: 24 }, { x: 2520, y: 265, w: 160, h: 24 },
        { x: 2820, y: 345, w: 240, h: 24 }, { x: 3180, y: 315, w: 180, h: 24 },
      ],
      spikes: [740, 1240, 2100, 3040],
      orbs: [{ x: 920, baseY: 240 }, { x: 1760, baseY: 220 }, { x: 3340, baseY: 210 }],
      seedXs: [560, 820, 1460, 1700, 2360, 2620, 3300],
    },
    {
      name: "Stage 2 - 말라버린 강줄기",
      length: 4000,
      bg: { skyTop:[210,180,160], skyBot:[165,140,120], haze:[75,60,45] },
      steps: [
        { x: 280, y: 365, w: 160, h: 24 }, { x: 560, y: 315, w: 140, h: 24 }, { x: 840, y: 270, w: 140, h: 24 },
        { x: 1140, y: 335, w: 220, h: 24 }, { x: 1480, y: 290, w: 160, h: 24 }, { x: 1760, y: 250, w: 160, h: 24 },
        { x: 2080, y: 330, w: 230, h: 24 }, { x: 2440, y: 285, w: 150, h: 24 }, { x: 2700, y: 240, w: 150, h: 24 },
        { x: 3040, y: 310, w: 240, h: 24 }, { x: 3440, y: 270, w: 190, h: 24 }, { x: 3740, y: 235, w: 170, h: 24 },
      ],
      spikes: [720, 1320, 2320, 3120, 3560],
      orbs: [{ x: 980, baseY: 220 }, { x: 1960, baseY: 210 }, { x: 3860, baseY: 205 }],
      seedXs: [620, 900, 1540, 1800, 2520, 2780, 3460, 3800],
    },
    {
      name: "Stage 3 - 독성 대기와 폐허",
      length: 4500,
      bg: { skyTop:[80,90,110], skyBot:[45,50,70], haze:[45,40,60] },
      steps: [
        { x: 260, y: 365, w: 160, h: 22 }, { x: 520, y: 325, w: 150, h: 22 }, { x: 780, y: 295, w: 150, h: 22 },
        { x: 1040, y: 335, w: 240, h: 22 }, { x: 1360, y: 305, w: 180, h: 22 }, { x: 1600, y: 280, w: 170, h: 22 },
        { x: 1840, y: 250, w: 180, h: 22 }, { x: 2100, y: 295, w: 240, h: 22 }, { x: 2440, y: 275, w: 160, h: 22 },
        { x: 2700, y: 250, w: 160, h: 22 }, { x: 2960, y: 300, w: 260, h: 22 }, { x: 3280, y: 275, w: 200, h: 22 },
        { x: 3560, y: 245, w: 190, h: 22 }, { x: 3860, y: 220, w: 170, h: 22 }, { x: 4100, y: 265, w: 240, h: 22 },
      ],
      spikes: [680, 1760, 2360, 3280, 3720, 4160],
      orbs: [{ x: 760, baseY: 210 }, { x: 2880, baseY: 185 }, { x: 4380, baseY: 200 }],
      seedXs: [640, 940, 1600, 1860, 2540, 2800, 3500, 3840, 4200],
    },
    {
      name: "Stage 4 - 모래폭풍 지대",
      length: 4800,
      bg: { skyTop:[180,150,120], skyBot:[110,80,55], haze:[95,70,40] },
      steps: [
        { x: 320, y: 350, w: 150, h: 22 }, { x: 650, y: 300, w: 120, h: 22 }, { x: 980, y: 250, w: 120, h: 22 },
        { x: 1260, y: 320, w: 200, h: 22 }, { x: 1600, y: 270, w: 150, h: 22 }, { x: 1900, y: 225, w: 140, h: 22 },
        { x: 2250, y: 310, w: 230, h: 22 }, { x: 2640, y: 260, w: 130, h: 22 }, { x: 2940, y: 215, w: 130, h: 22 },
        { x: 3260, y: 280, w: 240, h: 22 }, { x: 3650, y: 245, w: 170, h: 22 }, { x: 4020, y: 200, w: 150, h: 22 },
        { x: 4340, y: 260, w: 220, h: 22 }, { x: 4620, y: 250, w: 140, h: 22 },
      ],
      spikes: [760,1120,1480,1760,2100,2460,2860,3180,3520,3880,4280,4560],
      orbs: [{ x: 840, baseY: 205 }, { x: 1700, baseY: 190 }, { x: 2600, baseY: 180 }, { x: 3400, baseY: 190 }, { x: 4200, baseY: 200 }, { x: 4700, baseY: 210 }],
      seedXs: [700, 1000, 1680, 2050, 2750, 3000, 3650, 4050, 4400, 4700],
    },
    {
      name: "Stage 5 - 최심부: 붕괴한 연구지",
      length: 5200,
      bg: { skyTop:[60,70,90], skyBot:[20,20,35], haze:[40,30,50] },
      steps: [
        { x: 320, y: 355, w: 140, h: 20 }, { x: 640, y: 300, w: 115, h: 20 }, { x: 960, y: 245, w: 115, h: 20 },
        { x: 1280, y: 320, w: 190, h: 20 }, { x: 1620, y: 265, w: 135, h: 20 }, { x: 1920, y: 215, w: 130, h: 20 },
        { x: 2280, y: 305, w: 210, h: 20 }, { x: 2680, y: 255, w: 125, h: 20 }, { x: 2980, y: 205, w: 125, h: 20 },
        { x: 3320, y: 295, w: 230, h: 20 }, { x: 3720, y: 235, w: 160, h: 20 }, { x: 4080, y: 200, w: 140, h: 20 },
        { x: 4400, y: 280, w: 210, h: 20 }, { x: 4760, y: 235, w: 160, h: 20 }, { x: 5060, y: 205, w: 120, h: 20 },
      ],
      spikes: [720,900,1180,1500,1760,2060,2400,2600,2920,3160,3480,3700,4020,4300,4580,4880,5100],
      orbs: [{ x: 820, baseY: 200 }, { x: 1480, baseY: 185 }, { x: 2140, baseY: 175 }, { x: 2860, baseY: 170 }, { x: 3600, baseY: 180 }, { x: 4480, baseY: 190 }, { x: 5160, baseY: 205 }],
      seedXs: [780,1020,1600,1960,2700,3000,3720,4100,4420,4760,5100],
    },
    {
      name: "Stage 6 - 산성비 구간",
      length: 5500,
      bg: { skyTop:[52,62,82], skyBot:[12,12,27], haze:[35,25,45] },
      steps: [
        { x: 300, y: 350, w: 135, h: 20 }, { x: 620, y: 295, w: 110, h: 20 }, { x: 940, y: 240, w: 110, h: 20 },
        { x: 1260, y: 315, w: 185, h: 20 }, { x: 1600, y: 260, w: 130, h: 20 }, { x: 1900, y: 210, w: 125, h: 20 },
        { x: 2260, y: 300, w: 205, h: 20 }, { x: 2660, y: 250, w: 120, h: 20 }, { x: 2960, y: 200, w: 120, h: 20 },
        { x: 3300, y: 290, w: 225, h: 20 }, { x: 3700, y: 230, w: 155, h: 20 }, { x: 4060, y: 195, w: 135, h: 20 },
        { x: 4380, y: 275, w: 205, h: 20 }, { x: 4740, y: 230, w: 155, h: 20 }, { x: 5040, y: 200, w: 115, h: 20 },
        { x: 5300, y: 270, w: 160, h: 20 },
      ],
      spikes: [700,880,1160,1480,1740,2040,2380,2580,2900,3140,3460,3680,4000,4280,4560,4860,5080,5280],
      orbs: [{ x: 800, baseY: 195 }, { x: 1460, baseY: 180 }, { x: 2120, baseY: 170 }, { x: 2840, baseY: 165 }, { x: 3580, baseY: 175 }, { x: 4460, baseY: 185 }, { x: 5140, baseY: 200 }, { x: 5420, baseY: 210 }],
      seedXs: [760,1000,1580,1940,2680,2980,3700,4080,4400,4740,5080,5360],
    },
    {
      name: "Stage 7 - 심연의 균열",
      length: 5800,
      bg: { skyTop:[44,54,74], skyBot:[4,4,19], haze:[30,20,40] },
      steps: [
        { x: 280, y: 345, w: 130, h: 20 }, { x: 600, y: 290, w: 105, h: 20 }, { x: 920, y: 235, w: 105, h: 20 },
        { x: 1240, y: 310, w: 180, h: 20 }, { x: 1580, y: 255, w: 125, h: 20 }, { x: 1880, y: 205, w: 120, h: 20 },
        { x: 2240, y: 295, w: 200, h: 20 }, { x: 2640, y: 245, w: 115, h: 20 }, { x: 2940, y: 195, w: 115, h: 20 },
        { x: 3280, y: 285, w: 220, h: 20 }, { x: 3680, y: 225, w: 150, h: 20 }, { x: 4040, y: 190, w: 130, h: 20 },
        { x: 4360, y: 270, w: 200, h: 20 }, { x: 4720, y: 225, w: 150, h: 20 }, { x: 5020, y: 195, w: 110, h: 20 },
        { x: 5280, y: 265, w: 155, h: 20 }, { x: 5600, y: 235, w: 140, h: 20 },
      ],
      spikes: [680,860,1140,1460,1720,2020,2360,2560,2880,3120,3440,3660,3980,4260,4540,4840,5060,5260,5480],
      orbs: [{ x: 780, baseY: 190 }, { x: 1440, baseY: 175 }, { x: 2100, baseY: 165 }, { x: 2820, baseY: 160 }, { x: 3560, baseY: 170 }, { x: 4440, baseY: 180 }, { x: 5120, baseY: 195 }, { x: 5400, baseY: 205 }, { x: 5720, baseY: 215 }],
      seedXs: [740,980,1560,1920,2660,2960,3680,4060,4380,4720,5060,5340,5660],
    },
    {
      name: "Stage 8 - 파멸의 잔해",
      length: 6100,
      bg: { skyTop:[36,46,66], skyBot:[0,0,11], haze:[25,15,35] },
      steps: [
        { x: 260, y: 340, w: 125, h: 20 }, { x: 580, y: 285, w: 100, h: 20 }, { x: 900, y: 230, w: 100, h: 20 },
        { x: 1220, y: 305, w: 175, h: 20 }, { x: 1560, y: 250, w: 120, h: 20 }, { x: 1860, y: 200, w: 115, h: 20 },
        { x: 2220, y: 290, w: 195, h: 20 }, { x: 2620, y: 240, w: 110, h: 20 }, { x: 2920, y: 190, w: 110, h: 20 },
        { x: 3260, y: 280, w: 215, h: 20 }, { x: 3660, y: 220, w: 145, h: 20 }, { x: 4020, y: 185, w: 125, h: 20 },
        { x: 4340, y: 265, w: 195, h: 20 }, { x: 4700, y: 220, w: 145, h: 20 }, { x: 5000, y: 190, w: 105, h: 20 },
        { x: 5260, y: 260, w: 150, h: 20 }, { x: 5580, y: 230, w: 135, h: 20 }, { x: 5880, y: 200, w: 160, h: 20 },
      ],
      spikes: [660,840,1120,1440,1700,2000,2340,2540,2860,3100,3420,3640,3960,4240,4520,4820,5040,5240,5460,5780],
      orbs: [{ x: 760, baseY: 185 }, { x: 1420, baseY: 170 }, { x: 2080, baseY: 160 }, { x: 2800, baseY: 155 }, { x: 3540, baseY: 165 }, { x: 4420, baseY: 175 }, { x: 5100, baseY: 190 }, { x: 5380, baseY: 200 }, { x: 5700, baseY: 210 }, { x: 6020, baseY: 220 }],
      seedXs: [720,960,1540,1900,2640,2940,3660,4040,4360,4700,5040,5320,5640,5960],
    },
    {
      name: "Stage 9 - 종말의 경계",
      length: 6400,
      bg: { skyTop:[28,38,58], skyBot:[0,0,3], haze:[20,10,30] },
      steps: [
        { x: 240, y: 335, w: 120, h: 20 }, { x: 560, y: 280, w: 95, h: 20 }, { x: 880, y: 225, w: 95, h: 20 },
        { x: 1200, y: 300, w: 170, h: 20 }, { x: 1540, y: 245, w: 115, h: 20 }, { x: 1840, y: 195, w: 110, h: 20 },
        { x: 2200, y: 285, w: 190, h: 20 }, { x: 2600, y: 235, w: 105, h: 20 }, { x: 2900, y: 185, w: 105, h: 20 },
        { x: 3240, y: 275, w: 210, h: 20 }, { x: 3640, y: 215, w: 140, h: 20 }, { x: 4000, y: 180, w: 120, h: 20 },
        { x: 4320, y: 260, w: 190, h: 20 }, { x: 4680, y: 215, w: 140, h: 20 }, { x: 4980, y: 185, w: 100, h: 20 },
        { x: 5240, y: 255, w: 145, h: 20 }, { x: 5560, y: 225, w: 130, h: 20 }, { x: 5860, y: 195, w: 155, h: 20 },
        { x: 6160, y: 265, w: 180, h: 20 },
      ],
      spikes: [640,820,1100,1420,1680,1980,2320,2520,2840,3080,3400,3620,3940,4220,4500,4800,5020,5220,5440,5760,6060],
      orbs: [{ x: 740, baseY: 180 }, { x: 1400, baseY: 165 }, { x: 2060, baseY: 155 }, { x: 2780, baseY: 150 }, { x: 3520, baseY: 160 }, { x: 4400, baseY: 170 }, { x: 5080, baseY: 185 }, { x: 5360, baseY: 195 }, { x: 5680, baseY: 205 }, { x: 6000, baseY: 215 }, { x: 6320, baseY: 225 }],
      seedXs: [700,940,1520,1880,2620,2920,3640,4020,4340,4680,5020,5300,5620,5940,6240],
    },
    {
      name: "Stage 10 - 희망의 씨앗",
      length: 6700,
      bg: { skyTop:[20,30,50], skyBot:[0,0,0], haze:[15,5,25] },
      steps: [
        { x: 220, y: 330, w: 115, h: 20 }, { x: 540, y: 275, w: 90, h: 20 }, { x: 860, y: 220, w: 90, h: 20 },
        { x: 1180, y: 295, w: 165, h: 20 }, { x: 1520, y: 240, w: 110, h: 20 }, { x: 1820, y: 190, w: 105, h: 20 },
        { x: 2180, y: 280, w: 185, h: 20 }, { x: 2580, y: 230, w: 100, h: 20 }, { x: 2880, y: 180, w: 100, h: 20 },
        { x: 3220, y: 270, w: 205, h: 20 }, { x: 3620, y: 210, w: 135, h: 20 }, { x: 3980, y: 175, w: 115, h: 20 },
        { x: 4300, y: 255, w: 185, h: 20 }, { x: 4660, y: 210, w: 135, h: 20 }, { x: 4960, y: 180, w: 95, h: 20 },
        { x: 5220, y: 250, w: 140, h: 20 }, { x: 5540, y: 220, w: 125, h: 20 }, { x: 5840, y: 190, w: 150, h: 20 },
        { x: 6140, y: 260, w: 175, h: 20 }, { x: 6460, y: 230, w: 180, h: 20 },
      ],
      spikes: [620,800,1080,1400,1660,1960,2300,2500,2820,3060,3380,3600,3920,4200,4480,4780,5000,5200,5420,5740,6040,6340],
      orbs: [{ x: 720, baseY: 175 }, { x: 1380, baseY: 160 }, { x: 2040, baseY: 150 }, { x: 2760, baseY: 145 }, { x: 3500, baseY: 155 }, { x: 4380, baseY: 165 }, { x: 5060, baseY: 180 }, { x: 5340, baseY: 190 }, { x: 5660, baseY: 200 }, { x: 5980, baseY: 210 }, { x: 6300, baseY: 220 }, { x: 6620, baseY: 230 }],
      seedXs: [680,920,1500,1860,2600,2900,3620,4000,4320,4660,5000,5280,5600,5920,6220,6520],
    },
  ];
}

const STAGES = baseStages10();

let currentStageIndex = 0;

function syncHud(){
  uiStage.textContent = String(currentStageIndex+1);
  uiHp.textContent = String(Math.max(0, Math.floor(player.hp)));
  uiMaxHp.textContent = String(getMaxHp());
  uiO2.textContent = String(Math.max(0, Math.floor(player.o2)));
  uiMaxO2.textContent = String(getMaxO2());
  uiSeedInv.textContent = String(player.seedInv);
  uiPlanted.textContent = String(player.planted);
  uiTotal.textContent = String(plots.length);
  uiScore.textContent = String(player.score);
}

// [수정된 함수] 발판 높이를 감지해 반환하는 헬퍼 함수
function getSurfaceY(targetX) {
    let bestY = GROUND_Y;
    let foundPlatform = false;

    for (const p of platforms) {
        // 플랫폼의 가로 범위 안에 targetX가 들어오는지 확인
        // (약간의 오차 범위를 주어 가장자리에서도 인식되게 함)
        if (targetX >= p.x && targetX <= p.x + p.w) {
            // 여러 플랫폼이 겹칠 경우 가장 위에 있는(Y값이 작은) 플랫폼 선택
            if (p.y < bestY) {
                bestY = p.y;
                foundPlatform = true;
            }
        }
    }
    return bestY;
}

function buildStage(stageIndex){
  const S = STAGES[stageIndex];
  world.length = S.length;
  world.camX = 0;

  platforms.length = 0;
  hazards.length = 0;
  seeds.length = 0;
  plots.length = 0;

  platforms.push({ x:0, y:GROUND_Y, w:world.length, h:120, type:"ground" });
  (S.steps||[]).forEach(s => platforms.push({ ...s, type:"rock" }));

  (S.spikes||[]).forEach(x => hazards.push({ x, y:GROUND_Y-18, w:46, h:18, kind:"spike" }));
  (S.orbs||[]).forEach(o => hazards.push({ x:o.x, y:o.baseY, baseY:o.baseY, w:34, h:34, kind:"orb", t:0 }));

  // [수정됨] 씨앗과 심는 자리를 배치할 때 발판 높이를 고려함
  (S.seedXs||[]).forEach((sx) => {
    // 1. 씨앗 위치 계산
    // 씨앗의 중심점(sx+9) 아래에 있는 발판 높이를 찾음
    const seedSurfaceY = getSurfaceY(sx + 9);
    // 발판 위로 35px 띄워서 배치 (겹침 방지)
    seeds.push({ x:sx, y: seedSurfaceY - 35, w:24, h:24, taken:false });

    // 2. 심는 자리(Plot) 위치 계산
    const plotX = sx + 90;
    // 심는 자리 중심점(plotX+14) 아래에 있는 발판 높이를 찾음
    const plotSurfaceY = getSurfaceY(plotX + 14);
    
    plots.push({
      x: plotX, 
      y: plotSurfaceY - 18, // 발판 바로 위에 붙임
      w: 28, h: 18,
      planted:false, watered:false, o2Given:false, holdMs:0, plantMs:0,
    });
  });

  syncHud();
}

function resetPlayerForStage(keepScore=true){
  player.x = 120; player.y = 250;
  player.vx = 0; player.vy = 0;
  player.onGround = false;

  player.hp = getMaxHp();
  player.o2 = getMaxO2();
  player.seedInv = 0;
  player.planted = 0;
  if (!keepScore) player.score = 0;

  player.invulnMs = 0;
  player.extraJumpUsed = false;
  player.suffocatingMs = 0;

  warnOverlay.classList.remove("is-on");
  syncHud();
}

async function beginStage(stageIndex, withCardPick=true){
  currentStageIndex = stageIndex;
  buildStage(currentStageIndex);
  resetPlayerForStage(true);

  stageReady = false;
  if (withCardPick) showCardPick(currentStageIndex);
  else stageReady = true;
}

async function restartStageNoCard(){
  hideCardPick();
  stageReady = false;
  await showLoadingLine();
  buildStage(currentStageIndex);
  resetPlayerForStage(true);
  stageReady = true;
  if (!running) startLoop();
}

async function goNextStage(){
  const next = currentStageIndex + 1;
  stageReady = false;
  await showLoadingLine();
  await beginStage(next, true);
  if (!running) startLoop();
}

function resetAllGameState(){
  owned.clear();
  pickedOnce.clear();
  oneTimeUsed.clear();

  upgrade.hpTier = 0;
  upgrade.speedTier = 0;
  upgrade.oxygenBonus = 0;
  upgrade.healHoldMs = 900;
  upgrade.instantOxygen = false;
  upgrade.periodicO2 = false;
  upgrade.periodicTimer = 0;
  upgrade.shields.poison = 0;
  upgrade.shields.spike = 0;
  upgrade.hasActivatable = false;
  upgrade.activatableId = null;

  player.maxHpBonus = 0;
  player.jumpsMax = 1;
  player.score = 0;

  renderOwnedCards();
}

function getSpeedMultiplier(){
  if (upgrade.speedTier === 3) return 1.30;
  if (upgrade.speedTier === 2) return 1.20;
  if (upgrade.speedTier === 1) return 1.10;
  return 1.00;
}


// 게임 루프 및 업데이트
function loop(t){
  if (!running) return;
  const dt = Math.min(32, t - lastT);
  lastT = t;

  if (cardPickActive){
    cardPickTimer -= dt/1000;
    cardTimerEl.textContent = Math.max(0, cardPickTimer).toFixed(1);
    if (cardPickTimer <= 0) autoChooseCard();
    render();
    rafId = requestAnimationFrame(loop);
    pressed.clear();
    return;
  }

  if (!stageReady){
    render();
    rafId = requestAnimationFrame(loop);
    pressed.clear();
    return;
  }

  if (dlgActive){
    render();
    rafId = requestAnimationFrame(loop);
    pressed.clear();
    return;
  }

  update(dt);
  render();
  rafId = requestAnimationFrame(loop);
  pressed.clear();
}

function update(dt){
  if (wasPressed("KeyQ")) { restartStageNoCard(); return; }
  if (wasPressed("KeyR")) useActivatableCard();

  if (upgrade.periodicO2){
    upgrade.periodicTimer += dt;
    if (upgrade.periodicTimer >= 3000){
      upgrade.periodicTimer -= 3000;
      player.o2 = clamp(player.o2 + 5, 0, getMaxO2());
      player.score += 10;
    }
  }

  player.o2 -= (2.0 * dt / 1000);
  if (player.o2 < 0) player.o2 = 0;

  const isSuffocating = (player.o2 <= 0.01);
  if (isSuffocating){
    player.suffocatingMs += dt;
    warnOverlay.classList.add("is-on");
    if (player.suffocatingMs > 900 && Math.floor(performance.now()/900)%2===0){
      setHint("O₂가 0입니다. 식물로 산소를 회복하세요!");
    }
    if (player.suffocatingMs > 1000){
      player.hp = clamp(player.hp - 1, 0, getMaxHp());
      player.suffocatingMs = 0; // 리셋해서 서서히
    }
  } else {
    player.suffocatingMs = 0;
    warnOverlay.classList.remove("is-on");
  }

  const left  = isHeld("ArrowLeft") || isHeld("KeyA");
  const right = isHeld("ArrowRight") || isHeld("KeyD");
  const jumpPressed  = wasPressed("Space") || wasPressed("ArrowUp") || wasPressed("KeyW");
  const plantPressed = wasPressed("KeyE");
  const waterPressed = wasPressed("KeyF");

  if (left) player.direction = -1;
  if (right) player.direction = 1;

  const accelBase = 1.65;
  const maxSpd = world.maxSpeedBase * getSpeedMultiplier();

  const suffMul = isSuffocating ? 0.72 : 1.00;

  if (left) player.vx -= accelBase * suffMul;
  if (right) player.vx += accelBase * suffMul;

  const nearGround = player.y + player.h > 390;
  player.vx *= nearGround ? world.frictionNearGround : 0.90;
  player.vx = clamp(player.vx, -maxSpd*suffMul, maxSpd*suffMul);

  if (jumpPressed){
    if (player.onGround){
      player.vy = -15.8;
      player.onGround = false;
      player.extraJumpUsed = false;
    } else if (player.jumpsMax >= 2 && !player.extraJumpUsed){
      player.vy = -15.0;
      player.extraJumpUsed = true;
    }
  }

  player.vy += GRAV;
  player.vy = clamp(player.vy, -30, 20);

  player.x += player.vx;
  player.y += player.vy;
  player.x = clamp(player.x, 0, world.length - player.w);

  player.onGround = false;
  for (const p of platforms){
    const rP = { x:p.x, y:p.y, w:p.w, h:p.h };
    const r  = { x:player.x, y:player.y, w:player.w, h:player.h };
    if (overlap(r, rP)){
      const prevY = player.y - player.vy;
      if (prevY + player.h <= p.y + 8 && player.vy >= 0){
        player.y = p.y - player.h;
        player.vy = 0;
        player.onGround = true;
        player.extraJumpUsed = false;
      } else if (prevY >= p.y + p.h - 8 && player.vy < 0){
        player.y = p.y + p.h;
        player.vy = 0;
      } else {
        if (player.vx > 0) player.x = p.x - player.w;
        if (player.vx < 0) player.x = p.x + p.w;
        player.vx *= 0.2;
      }
    }
  }

  for (const s of seeds){
    if (s.taken) continue;
    if (overlap({x:player.x,y:player.y,w:player.w,h:player.h}, {x:s.x,y:s.y,w:s.w,h:s.h})){
      s.taken = true;
      player.seedInv += 1;
      player.score += 120 + currentStageIndex * 25;
      setHint("씨앗 획득! 심는 자리에서 E로 심기");
    }
  }

  if (plantPressed && player.plantCooldownMs <= 0){
    for (const pl of plots){
      if (pl.planted) continue;
      const near = overlap(
        {x:player.x,y:player.y,w:player.w,h:player.h},
        {x:pl.x-14,y:pl.y-28,w:pl.w+28,h:pl.h+56}
      );
      if (!near) continue;

      if (player.seedInv > 0){
        pl.planted = true;
        pl.watered = false;
        pl.o2Given = false;
        pl.holdMs = 0;
        pl.plantMs = 0;

        player.seedInv -= 1;
        player.planted += 1;
        player.score += 260 + currentStageIndex * 35;
        setHint("🌱 심기 완료! 이제 F로 물을 주세요.");
        player.plantCooldownMs = 1000; // 1초 텀
      } else setHint("씨앗이 부족합니다.");
      break;
    }
  }

  if (waterPressed && player.waterCooldownMs <= 0){
    for (const pl of plots){
      if (!pl.planted || pl.watered || pl.plantMs <= 800) continue;

      const near = overlap(
        {x:player.x,y:player.y,w:player.w,h:player.h},
        {x:pl.x-18,y:pl.y-36,w:pl.w+36,h:pl.h+72}
      );
      if (!near) continue;

      pl.watered = true;
      pl.holdMs = 0;

      if (upgrade.instantOxygen && !pl.o2Given){
        const gain = 10 + upgrade.oxygenBonus;
        player.o2 = clamp(player.o2 + gain, 0, getMaxO2());
        pl.o2Given = true;
        player.score += 80;
        setHint(`✨ 즉시 O₂ +${gain}!`);
      } else setHint("💧 물 주기 완료! 식물 옆에 잠깐 머물면 O₂를 얻습니다.");
      player.waterCooldownMs = 1000; // 0.5초 텀
      break;
    }
  }

  if (player.invulnMs > 0) player.invulnMs -= dt;
  player.plantCooldownMs -= dt;
  if (player.plantCooldownMs < 0) player.plantCooldownMs = 0;
  player.waterCooldownMs -= dt;
  if (player.waterCooldownMs < 0) player.waterCooldownMs = 0;

  for (const pl of plots){
    if (pl.planted && !pl.watered){
      pl.plantMs += dt;
    }
  }

  for (const h of hazards){
    if (h.kind === "orb"){
      const speedMul = 1 + currentStageIndex*0.18;
      const amp = 16 + currentStageIndex*5;
      h.t += dt * 0.0042 * speedMul;
      h.y = h.baseY + Math.sin(h.t) * amp;
    }

    if (player.invulnMs <= 0){
      if (overlap({x:player.x,y:player.y,w:player.w,h:player.h}, {x:h.x,y:h.y,w:h.w,h:h.h})){

        if (h.kind==="orb" && upgrade.shields.poison > 0){
          upgrade.shields.poison -= 1;
          const st = owned.get("shield_poison");
          if (st && st.usesLeft > 0){ st.usesLeft = 0; oneTimeUsed.add("shield_poison"); renderOwnedCards(); }
          setHint("🟣 독성 보호막 발동!");
          player.invulnMs = 450;
          continue;
        }
        if (h.kind==="spike" && upgrade.shields.spike > 0){
          upgrade.shields.spike -= 1;
          const st = owned.get("shield_spike");
          if (st && st.usesLeft > 0){ st.usesLeft = 0; oneTimeUsed.add("shield_spike"); renderOwnedCards(); }
          setHint("🛡️ 가시 방패 발동!");
          player.invulnMs = 450;
          continue;
        }

        const dmg = (h.kind==="spike") ? (18 + currentStageIndex*3) : (12 + currentStageIndex*3);
        player.hp -= dmg;
        player.invulnMs = 650;
        player.vx += (player.x < h.x) ? -5 : 5;
        player.vy = -6;
      }
    }
  }

  if (player.hp <= 0){
    player.hp = 0;
    stopLoop();
    openDialogue(
      [
        { name:"연구원2", text:"믿어도 되겠지?" },
        { name:"연구원1", text:"다시 가보자!" },
        { name:"주인공", text:"집중하겠습니다..!" },
      ],
      () => restartStageNoCard()
    );
    syncHud();
    return;
  }

  world.camX = clamp(player.x - W*0.35, 0, world.length - W);

  for (const pl of plots){
    if (!pl.planted) continue;
    if (!pl.watered) { pl.holdMs = 0; continue; }
    if (pl.o2Given) continue;

    const nearPlant = overlap(
      {x:player.x,y:player.y,w:player.w,h:player.h},
      {x:pl.x-22,y:pl.y-48,w:pl.w+44,h:pl.h+96}
    );

    if (nearPlant){
      pl.holdMs += dt;
      if (pl.holdMs >= 300){
        const gain = 10 + upgrade.oxygenBonus;
        player.o2 = clamp(player.o2 + gain, 0, getMaxO2());
        player.score += 60;
        pl.o2Given = true;
        pl.holdMs = 0;
        setHint(`O₂ +${gain} (식물)`);
      }
    } else pl.holdMs = 0;
  }

  if (player.planted >= plots.length){
    stopLoop();
    if (currentStageIndex < STAGES.length - 1){
      openDialogue(
        [
          { name:"연구원1", text:`${STAGES[currentStageIndex].name} 정화 작업 완료! 산소 농도가 정상적으로 증가하고 있어!` },
          { name:"연구원2", text:"그럼 다음 구간으로 이동한다." },
          { name:"주인공", text:"이동 준비 하겠습니다!" },
        ],
        async () => { await goNextStage(); }
      );
    } else {
      isEnding = true;
      openDialogue(END_DIALOGUE, () => {
        openDialogue(
          [{ name:"주인공", text:`임무 종료. Score: ${player.score}  하하...다시 시작할까요?` }],
          async () => {
            isEnding = false;
            resetAllGameState();
            await runIntroAndStart();
          }
        );
      });
    }
    syncHud();
    return;
  }

  syncHud();
}

// 렌더링 함수
function drawPulseRing(cx, cy, baseR, t, strokeA, strokeB){
  const p = (Math.sin(t) + 1)/2;
  const r = baseR + p*6;
  ctx.save();
  ctx.globalAlpha = 0.78 - p*0.25;
  ctx.strokeStyle = strokeA;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = strokeB;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r-6, 0, Math.PI*2); ctx.stroke();
  ctx.restore();
}
function drawTextTag(x, y, text){
  ctx.save();
  ctx.font = "12px system-ui";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  const w = ctx.measureText(text).width + 10;
  ctx.fillRect(x-5, y-14, w, 16);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillText(text, x, y-2);
  ctx.restore();
}

function render(){
  if (isEnding){
    ctx.clearRect(0,0,W,H);
    const imgAspect = lastImage.width / lastImage.height;
    const canvasAspect = W / H;
    let drawWidth, drawHeight, x, y;
    if (imgAspect > canvasAspect) {
      drawHeight = H;
      drawWidth = H * imgAspect;
      x = (W - drawWidth) / 2;
      y = 0;
    } else {
      drawWidth = W;
      drawHeight = W / imgAspect;
      x = 0;
      y = (H - drawHeight) / 2;
    }
    ctx.drawImage(lastImage, x, y, drawWidth, drawHeight);
    return;
  }

  ctx.clearRect(0,0,W,H);
  const S = STAGES[currentStageIndex] || STAGES[0];

  const g = ctx.createLinearGradient(0,0,0,H*0.6);
  g.addColorStop(0, `rgba(${S.bg.skyTop[0]},${S.bg.skyTop[1]},${S.bg.skyTop[2]},0.42)`);
  g.addColorStop(1, `rgba(${S.bg.skyBot[0]},${S.bg.skyBot[1]},${S.bg.skyBot[2]},0.28)`);
  ctx.fillStyle = g;
  ctx.fillRect(0,0,W,H);

  ctx.fillStyle = `rgba(${S.bg.haze[0]},${S.bg.haze[1]},${S.bg.haze[2]},0.24)`;
  ctx.fillRect(0,H*0.48,W,H*0.52);

  if (player.o2 <= 0.01){
    ctx.fillStyle = "rgba(10,0,0,0.12)";
    ctx.fillRect(0,0,W,H);
  }

  ctx.save();
  ctx.translate(-world.camX, 0);

  for (const p of platforms){
    if (p.type==="ground"){
      ctx.fillStyle = "rgba(120,78,35,0.65)";
      ctx.fillRect(p.x,p.y,p.w,p.h);
    } else {
      ctx.fillStyle = currentStageIndex < 2 ? "rgba(140,95,48,0.72)" : "rgba(95,100,120,0.55)";
      ctx.fillRect(p.x,p.y,p.w,p.h);
      ctx.strokeStyle="rgba(0,0,0,0.22)";
      ctx.strokeRect(p.x,p.y,p.w,p.h);
    }
  }

  for (const s of seeds){
    if (s.taken) continue;
    ctx.drawImage(seedImage, s.x, s.y, s.w, s.h);
  }

  const time = performance.now()*0.004;
  for (const pl of plots){
    ctx.fillStyle="rgba(20,16,10,0.65)";
    ctx.fillRect(pl.x, pl.y, pl.w, pl.h);

    const cx = pl.x + pl.w/2;
    const cy = pl.y + pl.h/2;

    if (!pl.planted){
      drawPulseRing(cx, cy, 16, time, "rgba(120,255,180,0.95)", "rgba(255,255,255,0.35)");
      ctx.strokeStyle="rgba(120,255,180,0.9)";
      ctx.lineWidth=2;
      ctx.beginPath();
      ctx.moveTo(cx-6, cy); ctx.lineTo(cx+6, cy);
      ctx.moveTo(cx, cy-6); ctx.lineTo(cx, cy+6);
      ctx.stroke();
    } else {
      if (!pl.watered){
        drawPulseRing(cx, cy, 18, time+0.6, "rgba(255,230,140,0.95)", "rgba(255,255,255,0.20)");
        drawTextTag(pl.x-10, pl.y-12, "WATER (F)");
        if (pl.plantMs > 0 && pl.plantMs < 800){
          const timeLeft = ((800 - pl.plantMs) / 1000).toFixed(1);
          ctx.fillStyle = "white";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${timeLeft}s`, cx, pl.y - 35);
        }
      } else if (!pl.o2Given){
        drawPulseRing(cx, cy, 18, time+1.0, "rgba(255,170,90,0.95)", "rgba(120,255,180,0.22)");
        drawTextTag(pl.x-10, pl.y-12, "HOLD…");
        if (pl.holdMs > 0){
          const timeLeft = ((800 - pl.holdMs) / 1000).toFixed(1);
          ctx.fillStyle = "white";
          ctx.font = "12px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${timeLeft}s`, cx, pl.y - 35);
        }
      }

      ctx.strokeStyle="rgba(120,255,160,0.95)";
      ctx.lineWidth=3;
      ctx.beginPath();
      ctx.moveTo(cx, pl.y+16);
      ctx.lineTo(cx, pl.y+4);
      ctx.stroke();

      ctx.fillStyle="rgba(120,255,160,0.9)";
      ctx.beginPath();
      ctx.ellipse(cx-4, pl.y+6, 6, 3, -0.4, 0, Math.PI*2);
      ctx.ellipse(cx+6, pl.y+6, 6, 3,  0.4, 0, Math.PI*2);
      ctx.fill();
    }

    if (!pl.planted){
      const near = overlap(
        {x:player.x,y:player.y,w:player.w,h:player.h},
        {x:pl.x-14,y:pl.y-28,w:pl.w+28,h:pl.h+56}
      );
      if (near){
        ctx.fillStyle="rgba(255,255,255,0.85)";
        ctx.font="14px system-ui";
        ctx.fillText(player.seedInv>0 ? "E: 심기" : "씨앗 필요", pl.x-12, pl.y-10);
      }
    }
  }

  for (const h of hazards){
    if (h.kind==="spike"){
      ctx.fillStyle="rgba(255,90,90,0.85)";
      ctx.beginPath();
      ctx.moveTo(h.x, h.y+h.h);
      ctx.lineTo(h.x+h.w/2, h.y);
      ctx.lineTo(h.x+h.w, h.y+h.h);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle="rgba(170,90,255,0.78)";
      ctx.beginPath();
      ctx.arc(h.x+h.w/2, h.y+h.h/2, h.w/2, 0, Math.PI*2);
      ctx.fill();
      ctx.strokeStyle="rgba(255,255,255,0.22)";
      ctx.stroke();
    }
  }

  const blink = player.invulnMs > 0 && Math.floor(performance.now()/80)%2===0;
  ctx.globalAlpha = blink ? 0.35 : 1;
  const aspect = player.imgWidth / player.imgHeight;
  let dWidth, dHeight;
  if (aspect > player.w / player.h) {
    dWidth = player.w;
    dHeight = player.w / aspect;
  } else {
    dHeight = player.h;
    dWidth = player.h * aspect;
  }
  const dx = player.x + (player.w - dWidth) / 2;
  const dy = player.y + (player.h - dHeight) / 2;
  ctx.save();
  ctx.translate(dx + dWidth / 2, dy + dHeight / 2);
  ctx.scale(player.direction, 1);
  ctx.drawImage(player.image, -dWidth / 2, -dHeight / 2, dWidth, dHeight);
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// 게임 시작
async function runIntroAndStart(){
  resetAllGameState();
  openDialogue(INTRO_DIALOGUE, async () => {
    await showLoadingLine();
    await beginStage(0, true);
    setHint("←/→ 이동, Space 점프, E 심기, F 물주기, Q 재시작, R 카드발동, Shift AUTO");
    renderOwnedCards();
    if (!running) startLoop();
  });
}

(function boot(){
  close(overlay);
  close(loading);
  close(dialogue);

  player.image.src = "robot.png";
  player.image.onload = () => {
    player.imgWidth = player.image.width;
    player.imgHeight = player.image.height;
    render();
  };

  seedImage.src = "seed.png";
  seedImage.onload = () => {
    render();
  };

  lastImage.src = "last.png";

  openDialogue(
    [
      { name:"연구원1", text:"접속 확인했어! 프로젝트 'Plant Back Earth' 준비 완료~" },
      { name:"연구원2", text:"슬슬 올 때가 됐는데." },
    ],
    async () => { await runIntroAndStart(); }
  );

  render();
  renderOwnedCards();
})();