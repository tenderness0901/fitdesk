/* ============================================================
 * FitDesk 共享存储核心（fitdesk-store.js）
 * ------------------------------------------------------------
 * 主工作台(index.html)与独立模块页(overtime.html / reading.html)
 * 部署在同源 GitHub Pages 下，共享同一份 localStorage(key: fitdesk:v1)。
 * 引入本文件后，加班台账 / 英语精读的数据统一收拢进 S.overtime / S.reading，
 * 从而被「自动备份(exportAll)」与「云同步(syncPush/pull)」一次覆盖。
 *
 * 关键约定：
 *  - 模块页保存时调用 persistOvertime() / persistReading()，它们会把子对象
 *    写回 S 并触发 save()(含 rotateBackup + schedulePush 云同步)。
 *  - 旧版独立键(fitdesk:overtime:* / fitdesk:reading:*)在首次加载时自动迁移进 S。
 *  - 本文件不定义 $ / toast / esc 等工具（由各页面自带），避免变量冲突。
 * ============================================================ */
const KEY = "fitdesk:v1";
const BAK_KEYS = ["fitdesk:v1:b0", "fitdesk:v1:b1", "fitdesk:v1:b2"];

function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function rotateBackup() {
  try {
    const cur = localStorage.getItem(KEY);
    if (!cur) return;
    const b0 = localStorage.getItem(BAK_KEYS[0]);
    const b1 = localStorage.getItem(BAK_KEYS[1]);
    if (b1) localStorage.setItem(BAK_KEYS[2], b1);
    if (b0) localStorage.setItem(BAK_KEYS[1], b0);
    localStorage.setItem(BAK_KEYS[0], cur);
  } catch (e) {}
}
function recoverFromBackup() {
  for (const k of BAK_KEYS) {
    try {
      const b = localStorage.getItem(k);
      if (!b) continue;
      const p = JSON.parse(b);
      if (p && typeof p === "object") { console.warn("FitDesk: 主数据损坏，已从本地备份恢复 ->", k); return p; }
    } catch (e) {}
  }
  return null;
}

/* 旧独立键 -> S.overtime / S.reading 的一次性迁移（首次打开新版时自动执行，迁移后删除旧键） */
function migrateOvertimeReading(s) {
  const O = {
    records: "fitdesk:overtime:records",
    salaries: "fitdesk:overtime:salaries",
    settings: "fitdesk:overtime:settings",
    adjusts: "fitdesk:overtime:adjusts",
    locked: "fitdesk:overtime:lockedMonths"
  };
  if (!s.overtime || !s.overtime.records) {
    const o = { records: [], salaries: [], settings: {}, adjusts: [], locked: [] };
    Object.keys(O).forEach(k => {
      const raw = localStorage.getItem(O[k]);
      if (raw) { try { o[k] = JSON.parse(raw); localStorage.removeItem(O[k]); } catch (e) {} }
    });
    // 补 updatedAt（合并按版本字段，旧记录缺失会导致平局覆盖）
    o.records = (o.records || []).map(r => (r && !r.updatedAt) ? Object.assign({}, r, { updatedAt: r.createdAt ? Date.parse(r.createdAt) : Date.now() }) : r);
    o.salaries = (o.salaries || []).map(r => (r && !r.updatedAt) ? Object.assign({}, r, { updatedAt: r.createdAt ? Date.parse(r.createdAt) : Date.now() }) : r);
    s.overtime = o;
  }
  const R = {
    lib: "fitdesk:reading:lib",
    vocab: "fitdesk:reading:vocab",
    checkins: "fitdesk:reading:checkin",
    settings: "fitdesk:reading:settings"
  };
  if (!s.reading || !s.reading.lib) {
    const r = { lib: [], vocab: [], checkins: [], settings: {} };
    Object.keys(R).forEach(k => {
      const raw = localStorage.getItem(R[k]);
      if (raw) { try { r[k] = JSON.parse(raw); localStorage.removeItem(R[k]); } catch (e) {} }
    });
    r.vocab = (r.vocab || []).map(v => (v && !v.updatedAt) ? Object.assign({}, v, { updatedAt: v.nextReview ? Date.parse(v.nextReview) : Date.now() }) : v);
    s.reading = r;
  }
  return s;
}

function load() {
  let s;
  try { const raw = localStorage.getItem(KEY); if (raw) s = JSON.parse(raw); } catch (e) { s = null; }
  if (!s || typeof s !== "object") s = recoverFromBackup();
  if (!s || typeof s !== "object") s = { profile: null, exercises: [], foods: [], weights: [], resources: [], goals: [], reminds: [], checkins: [], trackers: [], english: [], pantry: [], word1800: { cards: {}, lastDay: "", newStudiedToday: 0 } };
  // 兼容旧数据
  s.checkins = (s.checkins || []).map(c => typeof c === "string" ? { date: c, cat: "gym" } : c);
  s.exercises = (s.exercises || []).map(e => e.cat ? e : { ...e, cat: "gym" });
  s.fitLinks = s.fitLinks || {};
  s.posturePlan = s.posturePlan || { startDate: todayStr(), completed: [] };
  s.antiMenu = s.antiMenu || null;
  s.word1800 = s.word1800 || { cards: {}, lastDay: "", newStudiedToday: 0 };
  s.sync = {
    owner: (s.sync && typeof s.sync === "object" && s.sync.owner) || "",
    repo: (s.sync && typeof s.sync === "object" && s.sync.repo) || "fitdesk-sync",
    token: (s.sync && typeof s.sync === "object" && s.sync.token) || "",
    pass: (s.sync && typeof s.sync === "object" && s.sync.pass) || "",
    auto: !!(s.sync && typeof s.sync === "object" && s.sync.auto)
  };
  s._tomb = s._tomb || {};
  // 收拢：旧独立键迁移进 S
  migrateOvertimeReading(s);
  return s;
}

let S = load();

function save() { rotateBackup(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { console.error("FitDesk save failed", e); } schedulePush(); }
let _pushTimer = null;
function schedulePush() {
  if (!S.sync || !S.sync.auto || !S.sync.token || !S.sync.owner || !S.sync.repo) return;
  clearTimeout(_pushTimer);
  _pushTimer = setTimeout(syncNow, 1000);
}
async function syncSpace(pass) {
  const d = new TextEncoder().encode(pass || "default");
  const h = await crypto.subtle.digest("SHA-256", d);
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function recTs(r) { return (r && r.updatedAt) || 0; }
function pickRec(a, b) {
  if (!a) return b; if (!b) return a;
  const ta = recTs(a), tb = recTs(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (!!a._deleted !== !!b._deleted) return a._deleted ? b : a;
  return a;
}
function mergeArrById(L, R) {
  const m = new Map();
  (L || []).forEach(x => { if (x && x.id) m.set(x.id, x); });
  (R || []).forEach(x => { if (x && x.id) m.set(x.id, pickRec(m.get(x.id), x)); });
  const noId = (L || []).filter(x => x && !x.id);
  return [...m.values(), ...noId];
}
function mergeArrByKey(L, R, key) {
  const m = new Map();
  (L || []).forEach(x => { if (x && x[key]) m.set(x[key], x); });
  (R || []).forEach(x => { if (x && x[key]) m.set(x[key], pickRec(m.get(x[key]), x)); });
  const noKey = (L || []).filter(x => x && !x[key]);
  return [...m.values(), ...noKey];
}
function applyTomb(arr, tomb) {
  if (!Array.isArray(arr) || !tomb) return arr;
  return arr.filter(x => !(x && x.id && tomb[x.id] && recTs(x) <= tomb[x.id]));
}
function delRec(arr, id) {
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex(x => x && x.id === id);
  if (i < 0) return;
  const rec = arr[i];
  S._tomb = S._tomb || {};
  S._tomb[id] = Math.max(S._tomb[id] || 0, rec.updatedAt || Date.now());
  arr.splice(i, 1);
}
function mergeOvertime(L, R) {
  L = L || {}; R = R || {};
  return {
    records: mergeArrById(L.records, R.records),
    salaries: mergeArrById(L.salaries, R.salaries),
    adjusts: mergeArrByKey(L.adjusts, R.adjusts, "month"),
    locked: [...new Set([...(L.locked || []), ...(R.locked || [])])],
    settings: (R.settings && Object.keys(R.settings).length) ? R.settings : (L.settings || {})
  };
}
function mergeReading(L, R) {
  L = L || {}; R = R || {};
  return {
    lib: mergeArrById(L.lib, R.lib),
    vocab: mergeArrByKey(L.vocab, R.vocab, "key"),
    checkins: [...new Set([...(L.checkins || []), ...(R.checkins || [])])],
    settings: (R.settings && Object.keys(R.settings).length) ? R.settings : (L.settings || {})
  };
}
function mergeState(local, remote) {
  if (!remote || typeof remote !== "object") return local;
  const out = JSON.parse(JSON.stringify(local));
  const arrById = ["exercises", "foods", "weights", "resources", "goals", "reminds", "trackers", "english", "pantry"];
  arrById.forEach(f => { out[f] = mergeArrById(local[f], remote[f]); });
  const ck = new Map();
  (local.checkins || []).forEach(c => ck.set((c.date || "") + "|" + (c.cat || ""), c));
  (remote.checkins || []).forEach(c => ck.set((c.date || "") + "|" + (c.cat || ""), c));
  out.checkins = [...ck.values()];
  const cats = new Set([...Object.keys(local.fitLinks || {}), ...Object.keys(remote.fitLinks || {})]);
  out.fitLinks = out.fitLinks || {};
  cats.forEach(cat => { out.fitLinks[cat] = mergeArrById(local.fitLinks && local.fitLinks[cat], remote.fitLinks && remote.fitLinks[cat]); });
  const tomb = {};
  const allKeys = new Set([...Object.keys(local._tomb || {}), ...Object.keys(remote._tomb || {})]);
  allKeys.forEach(k => { tomb[k] = Math.max((local._tomb && local._tomb[k]) || 0, (remote._tomb && remote._tomb[k]) || 0); });
  out._tomb = tomb;
  arrById.forEach(f => { out[f] = applyTomb(out[f], out._tomb); });
  cats.forEach(cat => { if (out.fitLinks[cat]) out.fitLinks[cat] = applyTomb(out.fitLinks[cat], out._tomb); });
  ["profile", "posturePlan", "antiMenu"].forEach(f => { if (remote[f] !== undefined && remote[f] !== null) out[f] = remote[f]; });
  if (remote.word1800 && remote.word1800.cards) {
    out.word1800 = out.word1800 || { cards: {}, lastDay: "", newStudiedToday: 0 };
    const rc = remote.word1800.cards;
    Object.keys(rc).forEach(k => {
      const L = out.word1800.cards[k], R = rc[k];
      if (!L) out.word1800.cards[k] = R;
      else out.word1800.cards[k] = {
        box: Math.max(L.box || 0, R.box || 0),
        due: (L.due && R.due) ? (L.due < R.due ? L.due : R.due) : (L.due || R.due),
        reps: Math.max(L.reps || 0, R.reps || 0)
      };
    });
  }
  // ===== 收拢模块：overtime / reading 细粒度合并 =====
  out.overtime = mergeOvertime(local.overtime, remote.overtime);
  out.reading = mergeReading(local.reading, remote.reading);
  out.sync = local.sync;
  return out;
}
function setSyncStatus(msg, ok) {
  const el = document.getElementById("syncStatus");
  if (!el) return;
  el.textContent = msg;
  el.style.color = ok === undefined ? "var(--muted)" : (ok ? "var(--brand2)" : "var(--warn)");
}
function _ghHeaders(token) {
  return {
    "Authorization": "token " + token,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json"
  };
}
function _utf8ToB64(str) { try { return btoa(unescape(encodeURIComponent(str))); } catch (e) { return btoa(str); } }
function _b64ToUtf8(str) { try { return decodeURIComponent(escape(atob(str))); } catch (e) { return atob(str); } }
async function syncPush() {
  const cfg = S.sync; if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) return;
  try {
    const space = await syncSpace(cfg.pass);
    const path = "data/" + space + ".json";
    const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;
    let sha = null;
    try { const meta = await fetch(url, { headers: _ghHeaders(cfg.token) }); if (meta.ok) { const m = await meta.json(); sha = m.sha; } } catch (e) {}
    const payload = JSON.stringify({ updatedAt: Date.now(), data: S });
    const r = await fetch(url, {
      method: "PUT",
      headers: _ghHeaders(cfg.token),
      body: JSON.stringify({ message: "FitDesk sync " + new Date().toISOString(), content: _utf8ToB64(payload), sha })
    });
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error((err && err.message) || ("HTTP " + r.status)); }
    S._syncAt = Date.now();
    localStorage.setItem(KEY, JSON.stringify(S));
    setSyncStatus("已上传 · " + new Date(S._syncAt).toLocaleString("zh-CN"), true);
  } catch (e) { setSyncStatus("上传失败：" + e.message, false); }
}
async function syncPull() {
  const cfg = S.sync; if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) return;
  try {
    const space = await syncSpace(cfg.pass);
    const path = "data/" + space + ".json";
    const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;
    const r = await fetch(url, { headers: _ghHeaders(cfg.token) });
    if (r.status === 404) { setSyncStatus("云端暂无数据，点「立即同步」上传首次数据", true); return; }
    if (!r.ok) { const err = await r.json().catch(() => ({})); throw new Error((err && err.message) || ("HTTP " + r.status)); }
    const j = await r.json();
    const raw = _b64ToUtf8(j.content || "");
    const payload = raw ? JSON.parse(raw) : null;
    if (payload && payload.updatedAt && payload.updatedAt !== S._syncAt && payload.data) {
      S = mergeState(S, payload.data);
      S._syncAt = payload.updatedAt;
      localStorage.setItem(KEY, JSON.stringify(S));
      if (typeof renderCurrent === "function") renderCurrent();
      setSyncStatus("已同步 · " + new Date(payload.updatedAt).toLocaleString("zh-CN"), true);
    } else {
      setSyncStatus("已是最新 · " + (payload && payload.updatedAt ? new Date(payload.updatedAt).toLocaleString("zh-CN") : ""), true);
    }
  } catch (e) { setSyncStatus("拉取失败：" + e.message, false); }
}
async function syncNow() { setSyncStatus("同步中…"); await syncPull(); await syncPush(); }

/* 模块持久化辅助：把子对象写回 S 并触发保存 + 云同步 */
function persistOvertime() {
  S.overtime = {
    records: (typeof RECORDS !== "undefined" ? RECORDS : []),
    salaries: (typeof SALARIES !== "undefined" ? SALARIES : []),
    settings: (typeof SETTINGS !== "undefined" ? SETTINGS : {}),
    adjusts: (typeof ADJUSTS !== "undefined" ? ADJUSTS : []),
    locked: (typeof LOCKED !== "undefined" ? LOCKED : [])
  };
  save();
}
function persistReading() {
  S.reading = {
    lib: (typeof LIB !== "undefined" ? LIB : []),
    vocab: (typeof VOCAB !== "undefined" ? VOCAB : []),
    checkins: (typeof CHECKINS !== "undefined" ? CHECKINS : []),
    settings: (typeof SETTINGS !== "undefined" ? SETTINGS : {})
  };
  save();
}
