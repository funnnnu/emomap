"use strict";

// ---- 記録は2次元連続値: mood(気分 -1..+1, 暗い..明るい) × cond(体調 -1..+1, わるい..よい) ----
const DAILY_LIMIT = 3;
const LS_LOGS = "emomap_logs";
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

// 旧絵文字ログ(emotionId)を2軸値に変換する移行テーブル
const LEGACY_MAP = {
  happy: { mood: 0.7, cond: 0.4 },
  neutral: { mood: 0, cond: 0 },
  sad: { mood: -0.7, cond: -0.2 },
  angry: { mood: -0.6, cond: 0.1 },
  tired: { mood: -0.2, cond: -0.7 },
};

function quadrant(mood, cond) {
  if (mood >= 0 && cond >= 0) return { emoji: "😊", label: "心も体も好調" };
  if (mood >= 0) return { emoji: "🤒", label: "気分はいいけど体しんどい" };
  if (cond >= 0) return { emoji: "😕", label: "体は元気、心は曇り" };
  return { emoji: "😖", label: "心も体もしんどい" };
}

// ---- storage ----
function loadLogs() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_LOGS));
    if (Array.isArray(v)) {
      // 旧形式ログの移行（mood未設定 & 既知のemotionId）
      v.forEach((l) => {
        if (l.mood == null && LEGACY_MAP[l.emotionId]) Object.assign(l, LEGACY_MAP[l.emotionId]);
      });
      return v.filter((l) => l.mood != null);
    }
  } catch (e) {}
  return [];
}
function saveLogs(logs) { localStorage.setItem(LS_LOGS, JSON.stringify(logs)); }
function todayLogs(logs) {
  const today = new Date().toDateString();
  return logs.filter((l) => new Date(l.ts).toDateString() === today);
}

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
  return { weather: weatherCategory(d.weather_code), temp: d.temperature_2m, pressure: d.surface_pressure };
}

// ---- 記録 ----
function record(mood, cond) {
  const logs = loadLogs();
  if (todayLogs(logs).length >= DAILY_LIMIT) { renderRecordScreen(); return; }
  const log = {
    id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
    mood: Math.round(mood * 100) / 100,
    cond: Math.round(cond * 100) / 100,
    ts: new Date().toISOString(),
    mesh: null, weather: null, temp: null, pressure: null,
  };
  logs.push(log);
  saveLogs(logs);
  renderRecordScreen();
  const q = quadrant(mood, cond);
  showToast(`${q.emoji} ${q.label}｜記録しました`);
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
  renderRecordScreen();
}

// ---- toast ----
let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById("toast");
  toast.textContent = text;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4000);
}

// ---- 記録画面 ----
function setupPad() {
  const pad = document.getElementById("mood-pad");
  pad.addEventListener("pointerdown", (ev) => {
    const r = pad.getBoundingClientRect();
    const mood = ((ev.clientX - r.left) / r.width) * 2 - 1;
    const cond = 1 - ((ev.clientY - r.top) / r.height) * 2;
    record(Math.max(-1, Math.min(1, mood)), Math.max(-1, Math.min(1, cond)));
  });
}

function renderRecordScreen() {
  const logs = loadLogs();
  const today = todayLogs(logs);
  const pad = document.getElementById("mood-pad");
  const limitMsg = document.getElementById("limit-msg");

  // 今日の記録を点で表示
  pad.querySelectorAll(".dot").forEach((d) => d.remove());
  today.forEach((l) => {
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.left = `${((l.mood + 1) / 2) * 100}%`;
    dot.style.top = `${((1 - l.cond) / 2) * 100}%`;
    pad.append(dot);
  });

  const remaining = DAILY_LIMIT - today.length;
  if (remaining <= 0) {
    pad.classList.add("disabled");
    limitMsg.textContent = "今日の記録は3回までです。また明日！";
  } else {
    pad.classList.remove("disabled");
    limitMsg.textContent = `今日はあと${remaining}回記録できます`;
  }

  const box = document.getElementById("today-logs");
  if (!today.length) { box.innerHTML = ""; return; }
  box.innerHTML = "<h3>今日の記録</h3>";
  today.slice().reverse().forEach((l) => {
    const t = new Date(l.ts);
    const time = `${t.getHours()}:${String(t.getMinutes()).padStart(2, "0")}`;
    const wx = l.weather ? `${l.weather} ${l.temp}°C` : "";
    const q = quadrant(l.mood, l.cond);
    const div = document.createElement("div");
    div.className = "log-item";
    div.innerHTML = `<span>${q.emoji}</span><span>気分 ${fmt(l.mood)} / 体調 ${fmt(l.cond)}</span><span class="meta">${time}<br>${wx}</span>`;
    box.append(div);
  });
}

function fmt(v) { return (v >= 0 ? "+" : "") + v.toFixed(1); }

// ---- 統計画面 ----
function avg(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }

// key別に平均気分・平均体調を出す
function groupAvg(logs, keyFn) {
  const groups = {};
  logs.forEach((l) => {
    const k = keyFn(l);
    if (k == null) return;
    (groups[k] = groups[k] || []).push(l);
  });
  return groups;
}

function signedBar(value, color) {
  const pct = Math.abs(value) * 50;
  const side = value >= 0 ? `left:50%` : `left:${50 - pct}%`;
  return `<div class="sbar-track"><div class="sbar-center"></div><div class="sbar-fill" style="${side};width:${pct}%;background:${color}"></div></div>`;
}

function avgCard(title, groups, order) {
  const keys = order ? order.filter((k) => groups[k]) : Object.keys(groups);
  if (!keys.length) return "";
  let rows = "";
  keys.forEach((k) => {
    const g = groups[k];
    rows += `<div class="avg-row"><span class="bar-label">${escapeHtml(k)}</span>` +
      `<div class="sbar-pair">${signedBar(avg(g.map((l) => l.mood)), "var(--mood-c)")}${signedBar(avg(g.map((l) => l.cond)), "var(--cond-c)")}</div>` +
      `<span class="bar-count">${g.length}</span></div>`;
  });
  return `<div class="stat-card"><h3>${title}</h3>${rows}</div>`;
}

// 「雨の日は気分が低め」のような影響インサイト
function insights(logs) {
  const out = [];
  const withWx = logs.filter((l) => l.weather);
  const rain = withWx.filter((l) => l.weather === "雨" || l.weather === "雷雨");
  const fine = withWx.filter((l) => l.weather === "快晴" || l.weather === "晴れ");
  if (rain.length >= 3 && fine.length >= 3) {
    const d = avg(rain.map((l) => l.mood)) - avg(fine.map((l) => l.mood));
    if (Math.abs(d) >= 0.15) out.push(`☔ 雨の日は晴れの日より気分が${d < 0 ? "低め" : "高め"}（${fmt(d)}）`);
  }
  const withP = logs.filter((l) => l.pressure != null);
  if (withP.length >= 6) {
    const sorted = withP.slice().sort((a, b) => a.pressure - b.pressure);
    const half = Math.floor(sorted.length / 2);
    const low = sorted.slice(0, half), high = sorted.slice(-half);
    const d = avg(low.map((l) => l.cond)) - avg(high.map((l) => l.cond));
    if (Math.abs(d) >= 0.15) out.push(`🌀 気圧が低い日は体調が${d < 0 ? "低め" : "高め"}（${fmt(d)}）`);
  }
  const withT = logs.filter((l) => l.temp != null);
  if (withT.length >= 6) {
    const sorted = withT.slice().sort((a, b) => a.temp - b.temp);
    const half = Math.floor(sorted.length / 2);
    const cold = sorted.slice(0, half), hot = sorted.slice(-half);
    const d = avg(hot.map((l) => l.mood)) - avg(cold.map((l) => l.mood));
    if (Math.abs(d) >= 0.15) out.push(`🌡️ 気温が高い日は気分が${d < 0 ? "低め" : "高め"}（${fmt(d)}）`);
  }
  return out;
}

function renderStats() {
  const box = document.getElementById("stats-content");
  const logs = loadLogs();
  if (!logs.length) {
    box.innerHTML = `<p class="empty">まだ記録がありません。<br>まずは今の気分をタップ！</p>`;
    return;
  }

  const summary =
    `<div class="stat-card"><h3>ぜんぶの記録（${logs.length}件）の平均</h3>` +
    `<div class="avg-row"><span class="bar-label">気分</span><div class="sbar-pair">${signedBar(avg(logs.map((l) => l.mood)), "var(--mood-c)")}</div><span class="bar-count">${fmt(avg(logs.map((l) => l.mood)))}</span></div>` +
    `<div class="avg-row"><span class="bar-label">体調</span><div class="sbar-pair">${signedBar(avg(logs.map((l) => l.cond)), "var(--cond-c)")}</div><span class="bar-count">${fmt(avg(logs.map((l) => l.cond)))}</span></div></div>`;

  const ins = insights(logs);
  const insHtml = ins.length
    ? `<div class="stat-card"><h3>あなたへの影響</h3>${ins.map((t) => `<p class="insight">${t}</p>`).join("")}</div>`
    : "";

  const byWeather = avgCard("天気べつ", groupAvg(logs, (l) => l.weather), ["快晴", "晴れ", "曇り", "霧", "雨", "雪", "雷雨"]);
  const byWeekday = avgCard("曜日べつ", groupAvg(logs, (l) => WEEKDAYS[new Date(l.ts).getDay()]), WEEKDAYS);
  const byHour = avgCard(
    "時間帯べつ",
    groupAvg(logs, (l) => { const h = new Date(l.ts).getHours(); return h < 6 ? "深夜" : h < 12 ? "午前" : h < 18 ? "午後" : "夜"; }),
    ["午前", "午後", "夜", "深夜"]
  );

  const legend = `<div class="legend"><span style="--c:var(--mood-c)">気分</span><span style="--c:var(--cond-c)">体調</span><span>バーは -1〜+1、中央が0</span></div>`;

  box.innerHTML = summary + insHtml + byWeather + byWeekday + byHour + legend;
}

// ---- 設定画面 ----
function setupSettings() {
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
    renderRecordScreen();
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
    };
  });
}

// ---- init ----
setupPad();
renderRecordScreen();
setupNav();
setupSettings();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
