const TARGET = 100;
const STORAGE_KEY = "dhikr-rewards-v2";
const DB_NAME = "dhikr-media";
const DB_STORE = "files";

const PHRASES = [
  {
    id: "subhanallah",
    short: "1",
    arabic: "سُبْحَانَ اللّٰهِ",
    translit: "Subhanallah",
  },
  {
    id: "alhamdulillah",
    short: "2",
    arabic: "الْحَمْدُ لِلّٰهِ",
    translit: "Alhamdulillah",
  },
  {
    id: "allahuakbar",
    short: "3",
    arabic: "اللّٰهُ أَكْبَرُ",
    translit: "Allahu Akbar",
  },
  {
    id: "tahlil",
    short: "4",
    arabic: "لَا إِلٰهَ إِلَّا اللّٰهُ",
    translit: "La ilaha illallah",
  },
];

const TEMPLATES = ["silk", "moonlight", "galaxy", "morning"];
const DEFAULT_COLORS = {
  bgMain: "#0a2f24",
  circle: "#2ecc8a",
};
const LEGACY_TEMPLATE_MAP = {
  soft: "silk",
  rays: "silk",
  stars: "galaxy",
  waves: "moonlight",
  aurora: "silk",
  mesh: "galaxy",
  dusk: "moonlight",
  minimal: "silk",
  oasis: "silk",
  velvet: "galaxy",
  mist: "morning",
  garden: "silk",
  dawn: "morning",
};
const CIRCUMFERENCE = 2 * Math.PI * 54;

const els = {
  steps: document.getElementById("steps"),
  meaning: document.getElementById("meaning"),
  arabic: document.getElementById("arabic"),
  translit: document.getElementById("translit"),
  count: document.getElementById("count"),
  hint: document.getElementById("hint"),
  counterBtn: document.getElementById("counterBtn"),
  ringProgress: document.getElementById("ringProgress"),
  stage: document.getElementById("stage"),
  rewardPanel: document.getElementById("rewardPanel"),
  rewardTitle: document.getElementById("rewardTitle"),
  rewardText: document.getElementById("rewardText"),
  nextBtn: document.getElementById("nextBtn"),
  completePanel: document.getElementById("completePanel"),
  completeList: document.getElementById("completeList"),
  againBtn: document.getElementById("againBtn"),
  resetBtn: document.getElementById("resetBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  closeSettings: document.getElementById("closeSettings"),
  settingsPanel: document.getElementById("settingsPanel"),
  settingsBackdrop: document.getElementById("settingsBackdrop"),
  langSelect: document.getElementById("langSelect"),
  langBtn: document.getElementById("langBtn"),
  langBtnLabel: document.getElementById("langBtnLabel"),
  langMenu: document.getElementById("langMenu"),
  bgColorMain: document.getElementById("bgColorMain"),
  circleColor: document.getElementById("circleColor"),
  resetColorsBtn: document.getElementById("resetColorsBtn"),
  templateGrid: document.getElementById("templateGrid"),
  ambient: document.getElementById("ambient"),
  bgImageInput: document.getElementById("bgImageInput"),
  clearBgImage: document.getElementById("clearBgImage"),
  bgLayer: document.getElementById("bgLayer"),
  confetti: document.getElementById("confetti"),
};

let state = loadState();
let audioCtx = null;
let confettiParticles = [];
let confettiRaf = null;
let objectUrls = new Map();
let dbPromise = null;

function defaultState() {
  return {
    active: 0,
    counts: PHRASES.map(() => 0),
    unlocked: PHRASES.map(() => false),
    lang: "sq",
    bgMain: DEFAULT_COLORS.bgMain,
    circle: DEFAULT_COLORS.circle,
    bgTemplate: "silk",
    hasBgImage: false,
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    const base = defaultState();
    return {
      ...base,
      ...parsed,
      counts: PHRASES.map((_, i) => Math.min(TARGET, Number(parsed.counts?.[i]) || 0)),
      unlocked: PHRASES.map((_, i) => Boolean(parsed.unlocked?.[i])),
      lang: ["sq", "en", "it"].includes(parsed.lang) ? parsed.lang : "sq",
      bgMain: isHex(parsed.bgMain) ? parsed.bgMain : DEFAULT_COLORS.bgMain,
      circle: isHex(parsed.circle) ? parsed.circle : (isHex(parsed.bgGlow) ? parsed.bgGlow : DEFAULT_COLORS.circle),
      bgTemplate: normalizeTemplate(parsed.bgTemplate),
    };
  } catch {
    return defaultState();
  }
}

function isHex(value) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function normalizeTemplate(value) {
  if (TEMPLATES.includes(value)) return value;
  if (LEGACY_TEMPLATE_MAP[value]) return LEGACY_TEMPLATE_MAP[value];
  return "silk";
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function shadeHex(hex, factor) {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function derivedBgColors(main) {
  return {
    deep: shadeHex(main, 0.55),
    glow: shadeHex(main, 1.35),
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbSet(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function revokeUrl(key) {
  const url = objectUrls.get(key);
  if (url) {
    URL.revokeObjectURL(url);
    objectUrls.delete(key);
  }
}

async function blobUrl(key) {
  const blob = await idbGet(key);
  if (!blob) return null;
  revokeUrl(key);
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}



function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playTap() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520 + state.active * 40, now);
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.08);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.14);
}

function playReward() {
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  });
}

function langLabel(code) {
  return { sq: "Shqip", en: "English", it: "Italiano" }[code] || "Shqip";
}

function syncLangUi() {
  els.langSelect.value = state.lang;
  els.langBtnLabel.textContent = langLabel(state.lang);
  els.langMenu.querySelectorAll("[data-lang]").forEach((item) => {
    item.setAttribute("aria-selected", item.dataset.lang === state.lang ? "true" : "false");
  });
}

function setLanguage(lang) {
  state.lang = lang;
  saveState();
  syncLangUi();
  closeLangMenu();
  applyI18n();
  renderTemplates();
  showPhrase();
}

function openLangMenu() {
  els.langMenu.hidden = false;
  els.langBtn.setAttribute("aria-expanded", "true");
}

function closeLangMenu() {
  els.langMenu.hidden = true;
  els.langBtn.setAttribute("aria-expanded", "false");
}

function applyI18n() {
  const lang = state.lang;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n, lang);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml, lang);
  });
  syncLangUi();
  els.resetBtn.title = t("resetConfirm", lang);
  els.settingsBtn.setAttribute("aria-label", t("settingsTitle", lang));
}

function applyBackground() {
  const template = normalizeTemplate(state.bgTemplate);
  state.bgTemplate = template;
  const derived = derivedBgColors(state.bgMain);

  document.documentElement.style.setProperty("--bg-mid", state.bgMain);
  document.documentElement.style.setProperty("--bg-deep", derived.deep);
  document.documentElement.style.setProperty("--bg-glow", derived.glow);
  document.documentElement.style.setProperty("--circle", state.circle);
  document.documentElement.style.setProperty("--accent", state.circle);
  document.body.dataset.template = template;
  els.ambient.dataset.template = template;

  els.bgColorMain.value = state.bgMain;
  els.circleColor.value = state.circle;

  els.templateGrid.querySelectorAll(".template-card").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.id === template);
  });

  if (state.hasBgImage) {
    blobUrl("bg-image").then((url) => {
      if (!url) {
        els.bgLayer.style.backgroundImage = "";
        return;
      }
      els.bgLayer.style.backgroundImage = `url("${url}")`;
      document.body.classList.add("has-bg-image");
    });
  } else {
    els.bgLayer.style.backgroundImage = "";
    document.body.classList.remove("has-bg-image");
  }
}

function renderTemplates() {
  const names = t("templates", state.lang) || I18N.en.templates;
  els.templateGrid.innerHTML = TEMPLATES.map((id) => {
    const label = names[id] || id;
    return `<button type="button" class="template-card ${id === state.bgTemplate ? "active" : ""}" data-id="${id}">
      <span class="template-preview" data-preview="${id}"></span>
      <span>${label}</span>
    </button>`;
  }).join("");
}


function renderSteps() {
  els.steps.innerHTML = PHRASES.map((phrase, i) => {
    const done = state.unlocked[i] || state.counts[i] >= TARGET;
    const active = i === state.active;
    const classes = ["step", active ? "active" : "", done ? "done" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="${classes}" data-index="${i}" aria-current="${active ? "true" : "false"}">
      ${phrase.short}<span>${state.counts[i]}</span>
    </button>`;
  }).join("");
}

function setRing(count) {
  const progress = Math.min(count / TARGET, 1);
  els.ringProgress.style.strokeDasharray = String(CIRCUMFERENCE);
  els.ringProgress.style.strokeDashoffset = String(CIRCUMFERENCE * (1 - progress));
}



function showPhrase() {
  const lang = state.lang;
  const pack = I18N[lang] || I18N.en;
  const phrase = PHRASES[state.active];
  const count = state.counts[state.active];

  document.body.className = `theme-${state.active}${state.hasBgImage ? " has-bg-image" : ""}`;
  applyBackground();

  els.meaning.textContent = pack.meanings[state.active];
  els.arabic.textContent = phrase.arabic;
  els.translit.textContent = phrase.translit;
  els.count.textContent = String(count);
  setRing(count);

  const done = count >= TARGET;
  els.counterBtn.disabled = done;
  if (done) {
    els.hint.hidden = false;
    els.hint.textContent = t("hintDone", lang);
  } else {
    els.hint.hidden = true;
    els.hint.textContent = "";
  }

  els.stage.hidden = false;
  els.completePanel.hidden = true;

  if (done && state.unlocked[state.active]) {
    showReward(false);
  } else {
    els.rewardPanel.hidden = true;
  }

  renderSteps();
}

function showReward(celebrate) {
  const lang = state.lang;
  const pack = I18N[lang] || I18N.en;
  const phrase = PHRASES[state.active];
  const i = state.active;

  els.rewardTitle.textContent = `${phrase.translit} × ${TARGET}`;
  els.rewardText.textContent = pack.rewards[i];
  els.rewardPanel.hidden = false;

  const allDone = state.unlocked.every(Boolean);
  const nextIncomplete = state.unlocked.findIndex((u) => !u);
  if (allDone) els.nextBtn.textContent = t("seeAll", lang);
  else if (nextIncomplete === state.active) els.nextBtn.textContent = t("keepCounting", lang);
  else els.nextBtn.textContent = t("nextPhrase", lang);

  if (celebrate) {
    playReward();
    burstConfetti();
  }
}

function showComplete() {
  const lang = state.lang;
  const pack = I18N[lang] || I18N.en;
  els.stage.hidden = true;
  els.rewardPanel.hidden = true;
  els.completePanel.hidden = false;
  els.completeList.innerHTML = PHRASES.map(
    (p, i) => `<li><strong>${p.translit}</strong>${pack.rewards[i]}</li>`
  ).join("");
  applyI18n();
  burstConfetti(true);
  playReward();
}

function allUnlocked() {
  return state.unlocked.every(Boolean);
}

function onCount() {
  const i = state.active;
  if (state.counts[i] >= TARGET) return;

  state.counts[i] += 1;
  els.count.textContent = String(state.counts[i]);
  setRing(state.counts[i]);
  els.counterBtn.classList.remove("pulse");
  void els.counterBtn.offsetWidth;
  els.counterBtn.classList.add("pulse");
  playTap();
  renderSteps();

  if (state.counts[i] >= TARGET) {
    state.unlocked[i] = true;
    els.counterBtn.disabled = true;
    els.hint.hidden = false;
    els.hint.textContent = t("hintDone", state.lang);
    saveState();
    showReward(true);
    return;
  }

  saveState();
}

function selectPhrase(index) {
  state.active = index;
  saveState();
  showPhrase();
}

function goNext() {
  if (allUnlocked()) {
    showComplete();
    return;
  }
  const next = state.unlocked.findIndex((u) => !u);
  state.active = next === -1 ? state.active : next;
  saveState();
  showPhrase();
}

function resetAll() {
  if (!confirm(t("resetConfirm", state.lang))) return;
  const keep = {
    lang: state.lang,
    bgMain: state.bgMain,
    circle: state.circle,
    bgTemplate: state.bgTemplate,
    hasBgImage: state.hasBgImage,
  };
  state = { ...defaultState(), ...keep };
  saveState();
  showPhrase();
}

function openSettings() {
  els.settingsPanel.hidden = false;
  els.settingsBackdrop.hidden = false;
  document.body.classList.add("settings-open");
  closeLangMenu();
  renderTemplates();
}

function closeSettings() {
  els.settingsPanel.hidden = true;
  els.settingsBackdrop.hidden = true;
  document.body.classList.remove("settings-open");
}

async function onBgImage(file) {
  if (!file || !file.type.startsWith("image/")) return;
  await idbSet("bg-image", file);
  state.hasBgImage = true;
  saveState();
  applyBackground();
}

async function clearBgImage() {
  await idbDel("bg-image");
  revokeUrl("bg-image");
  state.hasBgImage = false;
  saveState();
  applyBackground();
}



function burstConfetti(big = false) {
  const canvas = els.confetti;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ["#2ecc8a", "#e2b84a", "#5bb8ef", "#c4b5fd", "#f3f0e6"];
  const count = big ? 90 : 55;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight * 0.35;

  confettiParticles = Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    return {
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      g: 0.14 + Math.random() * 0.08,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
      decay: 0.008 + Math.random() * 0.01,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
    };
  });

  if (confettiRaf) cancelAnimationFrame(confettiRaf);

  function frame() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of confettiParticles) {
      if (p.life <= 0) continue;
      alive = true;
      p.vy += p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= p.decay;
      ctx.save();
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (alive) confettiRaf = requestAnimationFrame(frame);
    else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      confettiRaf = null;
    }
  }

  frame();
}

els.counterBtn.addEventListener("click", onCount);
els.nextBtn.addEventListener("click", goNext);
els.againBtn.addEventListener("click", () => {
  const keep = {
    lang: state.lang,
    bgMain: state.bgMain,
    circle: state.circle,
    bgTemplate: state.bgTemplate,
    hasBgImage: state.hasBgImage,
  };
  state = { ...defaultState(), ...keep, counts: PHRASES.map(() => 0), unlocked: PHRASES.map(() => false) };
  saveState();
  showPhrase();
});
els.resetBtn.addEventListener("click", resetAll);
els.settingsBtn.addEventListener("click", openSettings);
els.closeSettings.addEventListener("click", closeSettings);
els.settingsBackdrop.addEventListener("click", closeSettings);
els.langBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (els.langMenu.hidden) openLangMenu();
  else closeLangMenu();
});
els.langMenu.addEventListener("click", (e) => {
  e.stopPropagation();
  const item = e.target.closest("[data-lang]");
  if (!item) return;
  setLanguage(item.dataset.lang);
});
document.addEventListener("click", () => closeLangMenu());
els.langSelect.addEventListener("change", () => {
  setLanguage(els.langSelect.value);
});
els.bgColorMain.addEventListener("input", () => {
  state.bgMain = els.bgColorMain.value;
  saveState();
  applyBackground();
});
els.circleColor.addEventListener("input", () => {
  state.circle = els.circleColor.value;
  saveState();
  applyBackground();
});
els.resetColorsBtn.addEventListener("click", () => {
  state.bgMain = DEFAULT_COLORS.bgMain;
  state.circle = DEFAULT_COLORS.circle;
  saveState();
  applyBackground();
});
els.templateGrid.addEventListener("click", (e) => {
  const btn = e.target.closest(".template-card");
  if (!btn) return;
  state.bgTemplate = btn.dataset.id;
  saveState();
  applyBackground();
  renderTemplates();
});
els.bgImageInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  onBgImage(file);
  e.target.value = "";
});
els.clearBgImage.addEventListener("click", clearBgImage);
els.steps.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-index]");
  if (!btn) return;
  selectPhrase(Number(btn.dataset.index));
});

document.getElementById("targetLabel").textContent = String(TARGET);
renderTemplates();
applyI18n();
els.ringProgress.style.strokeDasharray = String(CIRCUMFERENCE);
applyBackground();
showPhrase();
