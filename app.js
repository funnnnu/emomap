"use strict";

// ---- 感情マスタ（設定画面から追加・削除可能。ログには絵文字とラベルのスナップショットを保存
//      するため、後からマスタを変更しても過去の記録は壊れない） ----
const DEFAULT_EMOTIONS = [
  { id: "happy",   emoji: "😊", label: "うれしい", color: "#f6c34c" },
  { id: "neutral", emoji: "😐", label: "ふつう",   color: "#9aa5b1" },
  { id: "sad",     emoji: "😔", label: "かなしい", color: "#5b8dd9" },
  { id: "angry",   emoji: "😡", label: "イライラ", color: "#e05a4e" },
  { id: "tired",   emoji: "😴", label: "つかれた", color: "#8e7cc3" },
];
const EXTRA_COLORS = ["#4caf7d", "#e08cc0", "#c9a15a", "#5bbcd9", "#a3b34c"];

const LS_EMOTIONS = "emomap_emotions";
const LS_LOGS = "emomap_logs";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// ---- storage ----
function loadEmotions() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_EMOTIONS));
    if (Array.isArray(v) && v.length) return v;
  } catch (e) {}
  return DEFAULT_EMOTIONS.slice();
}
function saveEmotions(list) { localStorage.setItem(LS_EMOTIONS, JSON.stringify(list)); }
function loadLogs() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_LOGS));
    if (Array.isArray(v)) return v;
  } catch (e) {}
  return [];
}
function saveLogs(logs) { localStorage.setItem(LS_LOGS, JSON.stringify(logs)); }

// ---- 位置（約1kmメッシュに丸めてから保持。生の緯度経度は保存しない） ----
function toMesh(lat, lon) {
  return { lat: Math.round(lat * 100) / 100, lon: Math.round(lon * 100) / 100 };
}
function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve(toMesh(p.coords.latitude, p.coords.longitude)),
      () => resolve(null),
      { timeout: 8000, maximumAge: 600000 }
    );
  });
}

// ---- 天気 (Open-Meteo) ----
function weatherCategory(code) {
  if (code === 0) return "快晴";
  if (code <= 2) return "晴れ";
  if (code === 3) return "曇り";
  if (code <= 48) return "霧";
  if (code <= 67 || (code >= 80 && code <= 82)) return "雨";
  if (code <= 77 || code === 85 || code === 86) return "雪";
  return "雷雨";
}
async function fetchWeather(mesh) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${mesh.lat}&longitude=${mesh.lon}&current=temperature_2m,weather_code,surface_pressure`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather fetch failed");
  const d = (await res.json()).current;
  return {
    weather: weatherCategory(d.weather_code),
    temp: d.temperature_2m,
    pressure: d.surface_pressure,
  };
}

// ---- 記録 ----
function record(emotion) {
  const logs = loadLogs();
  const log = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    emotionId: emotion.id,
    emoji: emotion.emoji,
    label: emotion.label,
    intensity: 2,
    ts: new Date().toISOString(),
    mesh: null,
    weather: null,
    temp: null,
    pressure: null,
  };
  logs.push(log);
  saveLogs(logs);
  renderTodayLogs();
  showToast(log);
  enrich(log.id);
}

async function enrich(logId) {
  const mesh = await getPosition();
  if (!mesh) return;
  let wx = null;
  try { wx = await fetchWeather(mesh); } catch (e) {}
  const logs = loadLogs();
  const log = logs.find((l) => l.id === logId);
  if (!log) return;
  log.mesh = mesh;
  if (wx) Object.assign(log, wx);
  saveLogs(logs);
  renderTodayLogs();
}

function setIntensity(logId, intensity) {
  const logs = loadLogs();
  const log = logs.find((l) => l.id === logId);
  if (!log) return;
  log.intensity = intensity;
  saveLogs(logs);
}

// ---- toast ----
let toastTimer = null;
function showToast(log) {
  const toast = document.getElementById("toast");
  toast.innerHTML = "";
  toast.append(`${log.emoji} 記録しました　強さ:`);
  [1, 2, 3].forEach((n) => {
    const b = document.createElement("button");
    b.textContent = n;
    if (n === log.intensity) b.classList.add("selected");
    b.onclick = () => {
      setIntensity(log.id, n);
      toast.querySelectorAll("button").forEach((x) => x.classList.remove("selected"));
      b.classList.add("selected");
    };
    toast.append(b);
  });
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 5000);
}

// ---- 記録画面 ----
function renderEmotionGrid() {
  const grid = document.getElementById("emotion-grid");
  grid.innerHTML = "";
  loadEmotions().forEach((em) => {
    const b = document.createElement("button");
    b.className = "emotion-btn";
    b.innerHTML = `<span class="emoji">${escapeHtml(em.emoji)}</span><span class="label">${escapeHtml(em.label)}</span>`;
    b.onclick = () => record(em);
    grid.append(b);
  });
}

function renderTodayLogs() {
  const box = document.getElementById("today-logs");
  const today = new Date().toDateString();
  const logs = loadLogs().filter((l) => new Date(l.ts).toDateString() === today).reverse();
  if (!logs.length) { box.innerHTML = ""; return; }
  box.innerHTML = "<h3>今日の記録</h3>";
  logs.forEach((l) => {
    const t = new Date(l.ts);
    const time = `${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;
    const wx = l.weather ? `${l.weather} ${l.temp}°C` : "";
    const div = document.createElement("div");
    div.className = "log-item";
    div.innerHTML = `<span>${escapeHtml(l.emoji)}</span><span>${escapeHtml(l.label)}</span><span class="meta">${time}<br>${wx}</span>`;
    box.append(div);
  });
}

// ---- 統計画面 ----
function emotionColor(log, emotions) {
  const em = emotions.find((e) => e.id === log.emotionId);
  return em ? em.color : "#aaa";
}

function groupBars(logs, keyFn, keys) {
  const emotions = loadEmotions();
  const groups = {};
  keys.forEach((k) => (groups[k] = {}));
  logs.forEach((l) => {
    const k = keyFn(l);
    if (k == null) return;
    if (!groups[k]) groups[k] = {};
    const g = groups[k];
    if (!g[l.emotionId]) g[l.emotionId] = { count: 0, log: l };
    g[l.emotionId].count++;
  });
  let html = "";
  for (const k of Object.keys(groups)) {
    const g = groups[k];
    const total = Object.values(g).reduce((s, v) => s + v.count, 0);
    if (!total) continue;
    let segs = "";
    for (const v of Object.values(g)) {
      const pct = (v.count / total) * 100;
      segs += `<div class="bar-seg" style="width:${pct}%;background:${emotionColor(v.log, emotions)}" title="${escapeHtml(v.log.emoji)}×${v.count}"></div>`;
    }
    html += `<div class="bar-row"><span class="bar-label">${escapeHtml(k)}</span><div class="bar-track">${segs}</div><span class="bar-count">${total}</span></div>`;
  }
  return html;
}

function renderStats() {
  const box = document.getElementById("stats-content");
  const logs = loadLogs();
  if (!logs.length) {
    box.innerHTML = `<p class="empty">まだ記録がありません。<br>まずは今の気分をタップ！</p>`;
    return;
  }
  const emotions = loadEmotions();

  // 感情ごとの合計
  const totals = {};
  logs.forEach((l) => {
    if (!totals[l.emotionId]) totals[l.emotionId] = { count: 0, log: l };
    totals[l.emotionId].count++;
  });
  const max = Math.max(...Object.values(totals).map((v) => v.count));
  let totalHtml = "";
  Object.values(totals)
    .sort((a, b) => b.count - a.count)
    .forEach((v) => {
      const pct = (v.count / max) * 100;
      totalHtml += `<div class="bar-row"><span class="bar-label">${escapeHtml(v.log.emoji)} ${escapeHtml(v.log.label)}</span><div class="bar-track"><div class="bar-seg" style="width:${pct}%;background:${emotionColor(v.log, emotions)}"></div></div><span class="bar-count">${v.count}</span></div>`;
    });

  const weatherHtml = groupBars(logs, (l) => l.weather, []);
  const weekdayHtml = groupBars(logs, (l) => WEEKDAYS[new Date(l.ts).getDay()], WEEKDAYS);
  const hourHtml = groupBars(
    logs,
    (l) => {
      const h = new Date(l.ts).getHours();
      return h < 6 ? "深夜" : h < 12 ? "午前" : h < 18 ? "午後" : "夜";
    },
    ["午前", "午後", "夜", "深夜"]
  );

  const legend = emotions
    .map((e) => `<span style="--c:${e.color}">${escapeHtml(e.emoji)} ${escapeHtml(e.label)}</span>`)
    .join("");

  box.innerHTML =
    `<div class="stat-card"><h3>ぜんぶの記録（${logs.length}件）</h3>${totalHtml}</div>` +
    (weatherHtml ? `<div class="stat-card"><h3>天気べつ</h3>${weatherHtml}</div>` : "") +
    `<div class="stat-card"><h3>曜日べつ</h3>${weekdayHtml}</div>` +
    `<div class="stat-card"><h3>時間帯べつ</h3>${hourHtml}</div>` +
    `<div class="legend">${legend}</div>`;
}

// ---- 設定画面 ----
function renderSettings() {
  const list = document.getElementById("emotion-list");
  const emotions = loadEmotions();
  list.innerHTML = "";
  emotions.forEach((em, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="emoji">${escapeHtml(em.emoji)}</span><span>${escapeHtml(em.label)}</span>`;
    const del = document.createElement("button");
    del.textContent = "削除";
    del.className = "danger-outline";
    del.onclick = () => {
      if (emotions.length <= 2) { alert("感情は2つ以上必要です"); return; }
      emotions.splice(i, 1);
      saveEmotions(emotions);
      renderSettings();
      renderEmotionGrid();
    };
    li.append(del);
    list.append(li);
  });
}

function setupSettings() {
  document.getElementById("emotion-add-form").onsubmit = (ev) => {
    ev.preventDefault();
    const emoji = document.getElementById("new-emoji").value.trim();
    const label = document.getElementById("new-label").value.trim();
    if (!emoji || !label) return;
    const emotions = loadEmotions();
    emotions.push({
      id: "c" + Date.now(),
      emoji,
      label,
      color: EXTRA_COLORS[emotions.length % EXTRA_COLORS.length],
    });
    saveEmotions(emotions);
    ev.target.reset();
    renderSettings();
    renderEmotionGrid();
  };
  document.getElementById("reset-emotions").onclick = () => {
    if (!confirm("感情セットを初期状態に戻しますか？（記録は消えません）")) return;
    saveEmotions(DEFAULT_EMOTIONS.slice());
    renderSettings();
    renderEmotionGrid();
  };
  document.getElementById("export-logs").onclick = () => {
    const blob = new Blob([localStorage.getItem(LS_LOGS) || "[]"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "emomap-logs.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  document.getElementById("delete-all-logs").onclick = () => {
    if (!confirm("すべての記録を削除します。よろしいですか？")) return;
    saveLogs([]);
    renderTodayLogs();
  };
}

// ---- util ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---- nav ----
function setupNav() {
  document.querySelectorAll("nav button").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("nav button").forEach((x) => x.classList.remove("active"));
      document.querySelectorAll(".screen").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      document.getElementById(b.dataset.screen).classList.add("active");
      if (b.dataset.screen === "screen-stats") renderStats();
      if (b.dataset.screen === "screen-settings") renderSettings();
    };
  });
}

// ---- init ----
renderEmotionGrid();
renderTodayLogs();
setupNav();
setupSettings();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
