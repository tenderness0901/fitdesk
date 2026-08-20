/* ============================================================
   FitDesk · 健身工作台  单页应用
   数据存浏览器 localStorage（key: fitdesk:v1）
   计算口径见 fitness-nutrition/references/FORMULAS.md
   ============================================================ */
"use strict";

const KEY = "fitdesk:v1";

// 本地版本历史：每次保存前把当前值滚入备份环(b0=最近)，主数据损坏时回退到最近一份有效备份
const BAK_KEYS = ["fitdesk:v1:b0", "fitdesk:v1:b1", "fitdesk:v1:b2"];
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

/* ---------- 运动 MET 参考表（Compendium of Physical Activities 近似） ---------- */
const EXERCISES = [
  { name: "跑步(慢跑 ~8km/h)", met: 8.3 },
  { name: "跑步(快跑 ~10km/h)", met: 9.8 },
  { name: "快走 ~6km/h", met: 4.3 },
  { name: "健走 ~5km/h", met: 3.5 },
  { name: "骑行(休闲)", met: 5.8 },
  { name: "骑行(中等强度)", met: 8.0 },
  { name: "动感单车", met: 8.5 },
  { name: "游泳(自由泳中等)", met: 6.0 },
  { name: "跳绳", met: 11.8 },
  { name: "力量训练(一般)", met: 3.5 },
  { name: "力量训练(高强度)", met: 6.0 },
  { name: "HIIT", met: 8.0 },
  { name: "椭圆机", met: 5.0 },
  { name: "划船机(中等)", met: 7.0 },
  { name: "爬楼机", met: 8.8 },
  { name: "瑜伽", met: 2.5 },
  { name: "普拉提", met: 3.0 },
  { name: "有氧操", met: 7.3 },
  { name: "篮球(比赛)", met: 6.5 },
  { name: "足球", met: 7.0 },
  { name: "羽毛球", met: 5.5 },
  { name: "网球", met: 7.3 },
  { name: "徒步/爬山", met: 6.0 },
  { name: "拉伸/泡沫轴", met: 2.0 },
];

/* ---------- 运动健身子模块专属动作预设（MET 估值，均取自 Compendium 近似区间） ---------- */
const FIT_PRESETS = {
  // 🩰 欧阳春晓芭杆训练：基础动作 + 周课表动作
  barre: [
    { name: "芭杆·热身与足尖", met: 3.0 },
    { name: "芭杆·plié 全蹲", met: 4.5 },
    { name: "芭杆·tendu 擦地", met: 4.0 },
    { name: "芭杆·passé 单腿控制", met: 4.0 },
    { name: "芭杆·小踢腿 frappé", met: 5.0 },
    { name: "芭杆·腹背核心", met: 3.5 },
    { name: "芭杆·拉伸放松", met: 2.5 },
    { name: "芭杆·沙漏腰", met: 4.0 },
    { name: "芭杆·下肢", met: 4.5 },
    { name: "芭杆·上肢", met: 3.5 },
    { name: "欧阳春晓芭杆跟练(全套)", met: 4.5 },
  ],
  // 🧘 欧阳春晓18天体态：18天课表，每天一个主动作
  posture: [
    { name: "体态·开肩美背", met: 3.0 },
    { name: "体态·改善假胯宽", met: 3.5 },
    { name: "体态·直角肩训练", met: 3.0 },
    { name: "体态·骨盆中立位", met: 3.0 },
    { name: "体态·脊柱伸展", met: 2.5 },
    { name: "体态·颈前伸矫正", met: 2.5 },
    { name: "体态·核心激活", met: 3.5 },
    { name: "体态·综合巩固(上)", met: 3.5 },
    { name: "体态·综合巩固(下)", met: 3.5 },
    { name: "体态·臀腿塑形", met: 3.5 },
    { name: "体态·腰腹收紧", met: 3.5 },
    { name: "体态·全身拉伸", met: 2.5 },
    { name: "体态·背部强化", met: 3.0 },
    { name: "体态·矫正进阶", met: 3.5 },
    { name: "体态·核心+臀腿", met: 3.5 },
    { name: "体态·肩颈深度放松", met: 2.5 },
    { name: "体态·全身综合", met: 3.5 },
    { name: "体态·巩固验收+拉伸", met: 3.0 },
  ],
  // 🏊 游泳：按泳姿拆分
  swim: [
    { name: "自由泳(中等)", met: 6.0 },
    { name: "自由泳(快速)", met: 9.5 },
    { name: "蛙泳", met: 7.0 },
    { name: "仰泳", met: 6.0 },
    { name: "蝶泳", met: 9.8 },
    { name: "水中行走/戏水", met: 2.5 },
  ],
  // 💃 舞蹈：街舞/JAZZ/K-POP/现代舞等舞种训练
  dance: [
    { name: "HipHop · 基本功律动", met: 4.5 },
    { name: "HipHop · 片段学习", met: 5.0 },
    { name: "JAZZ · 基本功", met: 3.5 },
    { name: "JAZZ · 片段学习", met: 4.0 },
    { name: "K-POP · 基本功", met: 4.0 },
    { name: "K-POP · 翻跳片段", met: 5.5 },
    { name: "Urban · 编舞学习", met: 5.0 },
    { name: "现代舞 · 基础练习", met: 3.0 },
    { name: "舞蹈 · 拉伸放松", met: 2.0 },
  ],
};
function fitExList(cat) {
  if (cat === "gym") return EXERCISES;
  return FIT_PRESETS[cat] || EXERCISES;
}

/* ---------- 欧阳春晓18天体态·完整20天课表（含+2加练） ---------- */
const POSTURE_NETDISK = "https://pan.baidu.com/s/1_ttDgYWAQEomooBn6bUs4A?pwd=Wb88";
const POSTURE_PLAN = [
  { day: 1, title: "足弓重建+臀肌主导启动", exercises: [
    { name: "导学：碎片健身方法论", type: "讲解", min: 5, kcal: 25 },
    { name: "12分钟下肢力线回正·黄金腰臀比体验", type: "跟练", min: 12, kcal: 60 },
    { name: "重建足弓初阶", type: "讲解", min: 4, kcal: 20 },
    { name: "屈髋塞胯臀肌启动", type: "讲解", min: 5, kcal: 25 },
    { name: "髋部力量提升", type: "讲解", min: 4, kcal: 20 },
    { name: "真空腹讲解", type: "讲解", min: 3, kcal: 15 },
  ]},
  { day: 2, title: "下肢力线回正+步态调整", exercises: [
    { name: "Day2 导学", type: "讲解", min: 4, kcal: 20 },
    { name: "下肢力线回正跟练", type: "跟练", min: 12, kcal: 55 },
    { name: "步态调整讲解", type: "讲解", min: 5, kcal: 20 },
  ]},
  { day: 3, title: "骨盆回正+核心激活", exercises: [
    { name: "骨盆评估讲解", type: "讲解", min: 5, kcal: 25 },
    { name: "骨盆回正跟练", type: "跟练", min: 10, kcal: 45 },
    { name: "核心激活初级", type: "讲解", min: 4, kcal: 20 },
    { name: "腹式呼吸训练", type: "跟练", min: 6, kcal: 25 },
  ]},
  { day: 4, title: "臀腿塑形+假胯宽改善", exercises: [
    { name: "臀肌发力讲解", type: "讲解", min: 4, kcal: 20 },
    { name: "假胯宽改善跟练", type: "跟练", min: 12, kcal: 55 },
    { name: "侧卧抬腿组合", type: "跟练", min: 8, kcal: 35 },
    { name: "拉伸放松", type: "讲解", min: 3, kcal: 15 },
  ]},
  { day: 5, title: "腰腹收紧+呼吸强化", exercises: [
    { name: "腰腹发力要点", type: "讲解", min: 5, kcal: 25 },
    { name: "腰腹收紧跟练", type: "跟练", min: 12, kcal: 50 },
    { name: "肋间呼吸", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 6, title: "上肢肩背+体态挺拔", exercises: [
    { name: "肩背评估讲解", type: "讲解", min: 4, kcal: 20 },
    { name: "开肩美背跟练", type: "跟练", min: 12, kcal: 55 },
    { name: "肩胛骨稳定", type: "讲解", min: 4, kcal: 20 },
    { name: "颈部拉伸", type: "跟练", min: 6, kcal: 30 },
    { name: "站姿挺拔训练", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 7, title: "休息日", rest: true },
  { day: 8, title: "足弓进阶+臀型雕刻", exercises: [
    { name: "足弓进阶讲解", type: "讲解", min: 5, kcal: 25 },
    { name: "臀型雕刻跟练", type: "跟练", min: 12, kcal: 60 },
    { name: "蚌式开合组合", type: "跟练", min: 8, kcal: 35 },
  ]},
  { day: 9, title: "骨盆稳定+核心进阶", exercises: [
    { name: "骨盆稳定讲解", type: "讲解", min: 4, kcal: 20 },
    { name: "死虫式进阶", type: "跟练", min: 8, kcal: 35 },
    { name: "鸟狗式训练", type: "跟练", min: 8, kcal: 35 },
    { name: "平板支撑变式", type: "跟练", min: 5, kcal: 30 },
    { name: "核心拉伸", type: "讲解", min: 4, kcal: 20 },
  ]},
  { day: 10, title: "臀腿燃脂+腿型改善", exercises: [
    { name: "腿型评估", type: "讲解", min: 4, kcal: 20 },
    { name: "臀腿燃脂跟练", type: "跟练", min: 14, kcal: 70 },
    { name: "小腿拉伸", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 11, title: "腰腹塑形+腰线雕刻", exercises: [
    { name: "腰线雕刻讲解", type: "讲解", min: 4, kcal: 20 },
    { name: "侧腰训练跟练", type: "跟练", min: 10, kcal: 50 },
    { name: "下腹收紧", type: "跟练", min: 10, kcal: 45 },
    { name: "腹斜肌激活", type: "跟练", min: 6, kcal: 30 },
    { name: "腹部拉伸", type: "讲解", min: 4, kcal: 20 },
  ]},
  { day: 12, title: "肩背强化+颈前伸矫正", exercises: [
    { name: "颈前伸成因", type: "讲解", min: 4, kcal: 20 },
    { name: "颈前伸矫正跟练", type: "跟练", min: 12, kcal: 50 },
    { name: "肩背强化训练", type: "跟练", min: 10, kcal: 40 },
  ]},
  { day: 13, title: "全身综合+体态巩固", exercises: [
    { name: "综合评估", type: "讲解", min: 4, kcal: 20 },
    { name: "全身综合跟练(上)", type: "跟练", min: 10, kcal: 50 },
    { name: "全身综合跟练(下)", type: "跟练", min: 10, kcal: 50 },
    { name: "体态自检", type: "讲解", min: 4, kcal: 20 },
    { name: "放松拉伸", type: "跟练", min: 6, kcal: 25 },
  ]},
  { day: 14, title: "休息日", rest: true },
  { day: 15, title: "腰臀比雕刻·整合训练", exercises: [
    { name: "腰臀比目标讲解", type: "讲解", min: 5, kcal: 25 },
    { name: "腰臀比雕刻跟练", type: "跟练", min: 12, kcal: 65 },
    { name: "臀冲组合", type: "跟练", min: 8, kcal: 40 },
    { name: "侧腰收紧", type: "跟练", min: 6, kcal: 30 },
  ]},
  { day: 16, title: "核心稳定+体态精修", exercises: [
    { name: "核心稳定讲解", type: "讲解", min: 4, kcal: 20 },
    { name: "核心稳定跟练", type: "跟练", min: 14, kcal: 65 },
    { name: "体态精修动作", type: "跟练", min: 8, kcal: 35 },
    { name: "拉伸", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 17, title: "上肢线条+薄背训练", exercises: [
    { name: "薄背原理讲解", type: "讲解", min: 5, kcal: 25 },
    { name: "薄背训练跟练", type: "跟练", min: 12, kcal: 60 },
    { name: "手臂线条", type: "跟练", min: 8, kcal: 35 },
    { name: "背部拉伸", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 18, title: "巩固验收+全身拉伸", exercises: [
    { name: "18天成果回顾", type: "讲解", min: 5, kcal: 25 },
    { name: "全套巩固跟练", type: "跟练", min: 15, kcal: 70 },
    { name: "全身深度拉伸", type: "跟练", min: 10, kcal: 40 },
    { name: "后续保持建议", type: "讲解", min: 4, kcal: 15 },
  ]},
  { day: 19, title: "加练：臀腿进阶", exercises: [
    { name: "加练导学", type: "讲解", min: 4, kcal: 20 },
    { name: "臀腿进阶跟练", type: "跟练", min: 14, kcal: 75 },
    { name: "臀推强化", type: "跟练", min: 8, kcal: 45 },
    { name: "腿部拉伸", type: "跟练", min: 6, kcal: 30 },
    { name: "放松", type: "讲解", min: 3, kcal: 15 },
  ], bonus: true },
  { day: 20, title: "加练：全身燃脂", exercises: [
    { name: "加练导学", type: "讲解", min: 4, kcal: 20 },
    { name: "全身燃脂跟练", type: "跟练", min: 14, kcal: 80 },
    { name: "核心轰炸", type: "跟练", min: 8, kcal: 40 },
    { name: "拉伸放松", type: "跟练", min: 6, kcal: 25 },
  ], bonus: true },
];
function postureDayData(dayNum) { return POSTURE_PLAN.find(d => d.day === dayNum); }
function postureDayTotals(day) {
  if (day.rest) return { min: 0, kcal: 0, count: 0 };
  return day.exercises.reduce((a, e) => ({ min: a.min + e.min, kcal: a.kcal + e.kcal, count: a.count + 1 }), { min: 0, kcal: 0, count: 0 });
}

/* ---------- 欧阳春晓18天体态课表状态 ---------- */
const POSTURE_DAYS = 20;
function posturePlan() {
  S.posturePlan = S.posturePlan || { startDate: todayStr(), completed: [] };
  return S.posturePlan;
}
function postureDayIndex() {
  const p = posturePlan();
  const start = new Date(p.startDate + "T00:00:00");
  const now = new Date();
  const diff = Math.floor((now - start) / (1000 * 60 * 60 * 24));
  return diff; // can be negative
}
function postureCurrentDay() {
  const idx = postureDayIndex();
  if (idx < 0 || idx >= POSTURE_DAYS) return null;
  return POSTURE_PLAN[idx];
}
function isPostureDone(dayNum, date = todayStr()) {
  return S.exercises.some(e => e.cat === "posture" && e.date === date && e.note && e.note.includes(`第${dayNum}天`));
}
function isPostureDayCompleted(dayNum) {
  return S.exercises.some(e => e.cat === "posture" && e.note && e.note.includes(`第${dayNum}天`));
}
function metOf(name) {
  const e = EXERCISES.find(x => x.name === name);
  if (e) return e.met;
  for (const k in FIT_PRESETS) { const p = FIT_PRESETS[k].find(x => x.name === name); if (p) return p.met; }
  return 0;
}

/* ---------- 状态 ---------- */
let S = load();

function load() {
  let s;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) { s = null; }
  if (!s || typeof s !== "object") s = recoverFromBackup();
  if (!s || typeof s !== "object") s = { profile: null, exercises: [], foods: [], weights: [], resources: [], goals: [], reminds: [], checkins: [], trackers: [], english: [], pantry: [], word1800: { cards: {}, lastDay: "", newStudiedToday: 0 } };
  // 兼容旧数据：打卡改为 {date,cat} 结构，运动记录补 cat 字段，新增各模块资源
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
  s._tomb = s._tomb || {}; // 墓碑表：id -> 删除时间(ms)，使删除可通过同步传播
  return s;
}
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
// ===== 按记录版本的同步合并 =====
// 核心：每条记录带 updatedAt(ms)，同 id 取较新者；删除用墓碑表(_tomb)传播。
function recTs(r) { return (r && r.updatedAt) || 0; }

// 同 id 两条记录取较新者；平局取未删除的，再平局取 local(a)
function pickRec(a, b) {
  if (!a) return b; if (!b) return a;
  const ta = recTs(a), tb = recTs(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (!!a._deleted !== !!b._deleted) return a._deleted ? b : a;
  return a;
}

// 按 id 版本合并两数组；无 id 的本地记录原样保留（不跨端去重，避免静默丢弃）
function mergeArrById(L, R) {
  const m = new Map();
  (L || []).forEach((x) => { if (x && x.id) m.set(x.id, x); });
  (R || []).forEach((x) => { if (x && x.id) m.set(x.id, pickRec(m.get(x.id), x)); });
  const noId = (L || []).filter((x) => x && !x.id);
  return [...m.values(), ...noId];
}

// 应用墓碑：删除时间晚于(等于)记录最后编辑时间的，视为已删除
function applyTomb(arr, tomb) {
  if (!Array.isArray(arr) || !tomb) return arr;
  return arr.filter((x) => !(x && x.id && tomb[x.id] && recTs(x) <= tomb[x.id]));
}

// 删除一条记录：物理移除 + 写入墓碑表（删除可通过同步传播）
function delRec(arr, id) {
  if (!Array.isArray(arr)) return;
  const i = arr.findIndex((x) => x && x.id === id);
  if (i < 0) return;
  const rec = arr[i];
  S._tomb = S._tomb || {};
  S._tomb[id] = Math.max(S._tomb[id] || 0, rec.updatedAt || Date.now());
  arr.splice(i, 1);
}

// 多端安全合并：按记录版本(updatedAt)合并，删除用墓碑传播；保留本机同步配置。
function mergeState(local, remote) {
  if (!remote || typeof remote !== "object") return local;
  const out = JSON.parse(JSON.stringify(local));
  const arrById = ["exercises", "foods", "weights", "resources", "goals", "reminds", "trackers", "english", "pantry"];
  arrById.forEach((f) => { out[f] = mergeArrById(local[f], remote[f]); });
  // 打卡按 date|cat 合并（无 id）
  const ck = new Map();
  (local.checkins || []).forEach((c) => ck.set((c.date || "") + "|" + (c.cat || ""), c));
  (remote.checkins || []).forEach((c) => ck.set((c.date || "") + "|" + (c.cat || ""), c));
  out.checkins = [...ck.values()];
  // fitLinks 按分类、按 id 版本合并
  const cats = new Set([...Object.keys(local.fitLinks || {}), ...Object.keys(remote.fitLinks || {})]);
  out.fitLinks = out.fitLinks || {};
  cats.forEach((cat) => { out.fitLinks[cat] = mergeArrById(local.fitLinks && local.fitLinks[cat], remote.fitLinks && remote.fitLinks[cat]); });
  // 合并墓碑表（取较大删除时间）
  const tomb = {};
  const allKeys = new Set([...Object.keys(local._tomb || {}), ...Object.keys(remote._tomb || {})]);
  allKeys.forEach((k) => { tomb[k] = Math.max((local._tomb && local._tomb[k]) || 0, (remote._tomb && remote._tomb[k]) || 0); });
  out._tomb = tomb;
  // 应用墓碑：已传播的删除从各数组合并结果中剔除
  arrById.forEach((f) => { out[f] = applyTomb(out[f], out._tomb); });
  cats.forEach((cat) => { if (out.fitLinks[cat]) out.fitLinks[cat] = applyTomb(out.fitLinks[cat], out._tomb); });
  // 对象字段仅当远端有值才覆盖
  ["profile", "posturePlan", "antiMenu"].forEach((f) => {
    if (remote[f] !== undefined && remote[f] !== null) out[f] = remote[f];
  });
  if (remote.word1800 && remote.word1800.cards) {
    out.word1800 = out.word1800 || { cards: {}, lastDay: "", newStudiedToday: 0 };
    const rc = remote.word1800.cards;
    Object.keys(rc).forEach((k) => {
      const L = out.word1800.cards[k], R = rc[k];
      if (!L) out.word1800.cards[k] = R;
      else out.word1800.cards[k] = {
        box: Math.max(L.box || 0, R.box || 0),
        due: (L.due && R.due) ? (L.due < R.due ? L.due : R.due) : (L.due || R.due),
        reps: Math.max(L.reps || 0, R.reps || 0)
      };
    });
  }
  out.sync = local.sync;
  return out;
}
function setSyncStatus(msg, ok) {
  const el = $("#syncStatus");
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
function _utf8ToB64(str) {
  try { return btoa(unescape(encodeURIComponent(str))); }
  catch (e) { return btoa(str); }
}
function _b64ToUtf8(str) {
  try { return decodeURIComponent(escape(atob(str))); }
  catch (e) { return atob(str); }
}
async function syncPush() {
  const cfg = S.sync; if (!cfg || !cfg.token || !cfg.owner || !cfg.repo) return;
  try {
    const space = await syncSpace(cfg.pass);
    const path = "data/" + space + ".json";
    const url = "https://api.github.com/repos/" + cfg.owner + "/" + cfg.repo + "/contents/" + path;
    let sha = null;
    try {
      const meta = await fetch(url, { headers: _ghHeaders(cfg.token) });
      if (meta.ok) { const m = await meta.json(); sha = m.sha; }
    } catch (e) {}
    const payload = JSON.stringify({ updatedAt: Date.now(), data: S });
    const r = await fetch(url, {
      method: "PUT",
      headers: _ghHeaders(cfg.token),
      body: JSON.stringify({ message: "FitDesk sync " + new Date().toISOString(), content: _utf8ToB64(payload), sha })
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err && err.message) || ("HTTP " + r.status));
    }
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
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error((err && err.message) || ("HTTP " + r.status));
    }
    const j = await r.json();
    const raw = _b64ToUtf8(j.content || "");
    const payload = raw ? JSON.parse(raw) : null;
    if (payload && payload.updatedAt && payload.updatedAt !== S._syncAt && payload.data) {
      S = mergeState(S, payload.data);
      S._syncAt = payload.updatedAt;
      localStorage.setItem(KEY, JSON.stringify(S));
      renderCurrent();
      setSyncStatus("已同步 · " + new Date(payload.updatedAt).toLocaleString("zh-CN"), true);
    } else {
      setSyncStatus("已是最新 · " + (payload && payload.updatedAt ? new Date(payload.updatedAt).toLocaleString("zh-CN") : ""), true);
    }
  } catch (e) { setSyncStatus("拉取失败：" + e.message, false); }
}
async function syncNow() {
  setSyncStatus("同步中…");
  await syncPull();
  await syncPush();
}

/* ---------- 工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function todayStr(d = new Date()) { return d.toISOString().slice(0, 10); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 1800);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

/* ---------- 计算（公式来源：FORMULAS.md） ---------- */
function calcBMI(weight, heightCm) {
  const h = heightCm / 100;
  return weight / (h * h);
}
function calcTDEE(p) {
  // Mifflin-St Jeor
  const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age + (p.sex === "M" ? 5 : -161);
  const mult = [1.2, 1.375, 1.55, 1.725, 1.9][p.activity - 1];
  return bmr * mult;
}
function calcMacros(tdee, goal) {
  // 减脂 -500 / 维持 0 / 增肌 +400
  const offset = goal === "cut" ? -500 : goal === "bulk" ? 400 : 0;
  const cal = tdee + offset;
  const split = goal === "cut" ? { p: 0.4, f: 0.3, c: 0.3 }
    : goal === "bulk" ? { p: 0.3, f: 0.25, c: 0.45 }
      : { p: 0.3, f: 0.3, c: 0.4 };
  return {
    cal: Math.round(cal),
    protein: Math.round((cal * split.p) / 4),
    fat: Math.round((cal * split.f) / 9),
    carbs: Math.round((cal * split.c) / 4),
  };
}
function estKcal(type, durationMin, weight) {
  const met = metOf(type);
  if (!met) return 0;
  return Math.round(met * weight * (durationMin / 60));
}

/* ---------- 导航 ---------- */
const MODULE_TITLES = { fitness: "运动健身", nutrition: "饮食营养", dashboard: "数据看板", resources: "外部资源库", goals: "目标与提醒", trackers: "上次记录", english: "英语学习", pantry: "食物入库", watermark: "图片去水印", backup: "备份同步" };
let currentModule = "fitness";
function renderCurrent() {
  if (currentModule === "fitness") renderFitness();
  else if (currentModule === "dashboard") renderDashboard();
  else if (currentModule === "trackers") renderTrackers();
  else if (currentModule === "english") renderEnglish();
  else if (currentModule === "pantry") renderPantry();
  else if (currentModule === "nutrition") renderNutrition();
}
const MAIN_TABS = ["fitness", "nutrition", "dashboard", "resources"];
function renderModule(m) {
  try {
    if (m === "fitness") renderFitness();
    else if (m === "dashboard") renderDashboard();
    else if (m === "trackers") renderTrackers();
    else if (m === "english") renderEnglish();
    else if (m === "pantry") renderPantry();
    else if (m === "nutrition") renderNutrition();
    else if (m === "watermark") setWmStatus("可上传图片，去除水印为纯本地处理，无需联网。");
  } catch (e) {
    console.error("renderModule(" + m + ") 出错:", e);
    const box = $("#m-" + m);
    if (box) box.innerHTML = '<div style="padding:24px;color:#ff4d4f">该模块渲染出错：' + (e && e.message ? e.message : e) + '</div>';
  }
}
function switchModule(m) {
  if (m === "reading") { window.location.href = "reading.html"; return; }
  if (m === "overtime") { window.location.href = "overtime.html"; return; }
  currentModule = m;
  $$(".nav-item").forEach(x => x.classList.remove("active"));
  $$(".tab-item").forEach(x => x.classList.remove("active"));
  const sb = $(`.nav-item[data-module="${m}"]`);
  if (sb) sb.classList.add("active");
  const tb = $(`.tab-item[data-module="${m}"]`);
  if (tb) tb.classList.add("active");
  $$(".module").forEach(x => x.classList.remove("active"));
  const mod = $("#m-" + m);
  if (mod) mod.classList.add("active");
  const title = $("#moduleTitle");
  if (title) title.textContent = MODULE_TITLES[m];
  renderModule(m);
}
function openMore() { const s = $("#moreSheet"), mk = $("#moreMask"); if (s) s.classList.add("show"); if (mk) mk.classList.add("show"); }
function closeMore() { const s = $("#moreSheet"), mk = $("#moreMask"); if (s) s.classList.remove("show"); if (mk) mk.classList.remove("show"); }
$$(".nav-item").forEach(b => b.addEventListener("click", () => { switchModule(b.dataset.module); closeMore(); }));
$$(".tab-item").forEach(b => { if (b.dataset.module) b.addEventListener("click", () => switchModule(b.dataset.module)); });
const moreBtn = $(".tab-item.more");
if (moreBtn) moreBtn.addEventListener("click", openMore);
const moreMask = $("#moreMask");
if (moreMask) moreMask.addEventListener("click", closeMore);
const moreClose = $("#moreClose");
if (moreClose) moreClose.addEventListener("click", closeMore);
$$(".more-item").forEach(b => b.addEventListener("click", () => { switchModule(b.dataset.module); closeMore(); }));

/* 手机端首页常用快捷入口（上次记录 / 食物入库） */
$$("#quickBar .quick-btn").forEach(b => b.addEventListener("click", () => { switchModule(b.dataset.module); closeMore(); }));

/* ============================================================
   运动健身（大模块，含 5 个子模块 + 总览）
   子模块：把杆 / 18天体态 / 游泳 / 健身 / 舞蹈设备
   每个子模块：打卡/补卡、当日/当月运动量、B站/网盘资源、记录
   总览：汇总所有子模块的消耗与打卡
   ============================================================ */
const FIT_CATS = [
  { id: "barre", name: "欧阳春晓芭杆训练", ico: "🩰" },
  { id: "posture", name: "欧阳春晓18天体态", ico: "🧘" },
  { id: "swim", name: "游泳", ico: "🏊" },
  { id: "gym", name: "健身", ico: "🏋️" },
  { id: "dance", name: "舞蹈", ico: "🎵" },
];
let currentFitCat = "all";
function fitCatName(cat) { return cat === "all" ? "全部" : (FIT_CATS.find(c => c.id === cat) || {}).name; }
function profileWeight() { return S.profile ? S.profile.weight : 65; }

function checkedDays(cat) {
  const set = new Set();
  S.checkins.forEach(c => { if (cat === "all" || c.cat === cat) set.add(c.date); });
  S.exercises.forEach(e => { if (cat === "all" || (e.cat || "gym") === cat) set.add(e.date); });
  return set;
}
function totKcal(cat, date) {
  return S.exercises.filter(e => (cat === "all" || (e.cat || "gym") === cat) && e.date === date)
    .reduce((a, e) => a + (e.kcal || 0), 0);
}
function catMonthKcal(cat, ym) {
  return S.exercises.filter(e => (cat === "all" || (e.cat || "gym") === cat) && (e.date || "").startsWith(ym))
    .reduce((a, e) => a + (e.kcal || 0), 0);
}
function catMonthDays(cat, ym) {
  return [...checkedDays(cat)].filter(x => x.startsWith(ym)).length;
}
function streak(cat) {
  const set = checkedDays(cat);
  let n = 0;
  const d = new Date();
  while (set.has(todayStr(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderFitness(cat) {
  if (cat) currentFitCat = cat;
  // 子导航
  const nav = $("#fitSubnav");
  nav.innerHTML = `<button class="subnav-btn ${currentFitCat === "all" ? "active" : ""}" data-fit="all">总览</button>` +
    FIT_CATS.map(c => `<button class="subnav-btn ${currentFitCat === c.id ? "active" : ""}" data-fit="${c.id}">${c.ico} ${c.name}</button>`).join("");
  // 主体
  const F = $("#fitBody");
  F.innerHTML = currentFitCat === "all" ? fitOverviewHTML() : fitCatHTML(currentFitCat);
  bindFit();
}

function fitOverviewHTML() {
  const ym = todayStr().slice(0, 7);
  const tk = totKcal("all", todayStr());
  const mk = catMonthKcal("all", ym);
  const md = catMonthDays("all", ym);
  const sum = FIT_CATS.map(c => `<div class="card stat">
      <div class="stat-label">${c.ico} ${c.name}</div>
      <div class="stat-value" style="font-size:16px">今日 ${totKcal(c.id, todayStr())}<small>kcal</small></div>
      <div class="lr-sub">本月 ${catMonthKcal(c.id, ym)} kcal · ${catMonthDays(c.id, ym)} 天</div>
    </div>`).join("");
  return `
   <div class="kpi-mini">
     <div class="card stat"><div class="stat-label">今日消耗</div><div class="stat-value">${tk}<small>kcal</small></div></div>
     <div class="card stat"><div class="stat-label">本月消耗</div><div class="stat-value">${mk}<small>kcal</small></div></div>
     <div class="card stat"><div class="stat-label">本月打卡</div><div class="stat-value">${md}<small>天</small></div></div>
   </div>
   <div class="hint">下方为各子模块的当日消耗、当月消耗与打卡天数；点上方模块进入单独打卡 / 记录 / 加视频。</div>
   <div class="grid-3 compact">${sum}</div>
   <div class="card" style="margin-bottom:14px">
     <div class="card-head"><h3>🔥 全部运动消耗总览</h3></div>
     <div class="grid-4" style="margin-bottom:14px">
       <div class="card stat"><div class="stat-label">今日消耗</div><div class="stat-value">${totKcal("all", todayStr())}<small>kcal</small></div></div>
       <div class="card stat"><div class="stat-label">本周消耗</div><div class="stat-value">${weekKcal("all")}<small>kcal</small></div></div>
       <div class="card stat"><div class="stat-label">本月消耗</div><div class="stat-value">${catMonthKcal("all", ym)}<small>kcal</small></div></div>
       <div class="card stat"><div class="stat-label">近30天</div><div class="stat-value">${daysKcal("all", 30)}<small>kcal</small></div></div>
     </div>
     <div style="height:220px"><canvas id="moduleKcalChart"></canvas></div>
   </div>
   <div class="grid-2">
     <div class="card">
       <div class="card-head" style="justify-content:space-between">
         <h3>打卡日历（全部）</h3>
         <div style="display:flex;align-items:center;gap:8px">
           <button class="btn ghost sm" id="calPrev">‹</button>
           <span id="calYM" style="font-size:13px;font-weight:700;color:var(--brand);min-width:72px;text-align:center"></span>
           <button class="btn ghost sm" id="calNext">›</button>
         </div>
       </div>
       <div class="cal" id="calendar"></div>
     </div>
     <div class="card"><div class="card-head"><h3>全部运动消耗记录</h3></div><div class="list" id="exerciseList"></div></div>
   </div>
   <script>
   (function renderModuleKcalChart(){
     if (typeof Chart === 'undefined') return;
     const ctx = document.getElementById('moduleKcalChart'); if (!ctx) return;
     if (charts.moduleKcal) { charts.moduleKcal.destroy(); }
     const data = FIT_CATS.map(c => ({ name: c.name, val: catMonthKcal(c.id, ym) })).filter(x => x.val > 0);
     const labels = data.map(x => x.name);
     const vals = data.map(x => x.val);
     const palette = ['#ff7a59', '#5c8dff', '#3ecf8e', '#ffb020', '#a259ff'];
     charts.moduleKcal = new Chart(ctx, {
       type: 'doughnut',
       data: { labels, datasets: [{ data: vals, backgroundColor: palette.slice(0, vals.length), borderWidth: 0 }] },
       options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: { size: 12 } } } } }
     });
   })();
   </script>`;
}

function posturePlanHTML() {
  const p = posturePlan();
  const idx = postureDayIndex(); // 0-based from startDate
  const currentDay = idx + 1; // 1-based
  const trainingDays = POSTURE_PLAN.filter(d => !d.rest && d.day <= 18).length; // 16
  const completedTraining = POSTURE_PLAN.filter(d => !d.rest && d.day <= 18 && isPostureDayCompleted(d.day)).length;
  const totalKcal = POSTURE_PLAN.filter(d => !d.rest).reduce((a, d) => a + postureDayTotals(d).kcal, 0);
  const grid = POSTURE_PLAN.map(d => {
    const t = postureDayTotals(d);
    const isToday = d.day === currentDay && idx >= 0 && idx < POSTURE_DAYS;
    const done = isPostureDayCompleted(d.day);
    const tag = d.bonus ? '<span class="pp-tag">加练</span>' : (d.rest ? '<span class="pp-tag" style="background:var(--muted)">休</span>' : '');
    const meta = d.rest ? '<div class="pp-rest">休息日</div>' : `<div class="pp-meta">${t.count}个训练</div><div class="pp-kcal">${t.kcal} kcal</div>`;
    return `<div class="pp-day ${isToday ? 'today' : ''} ${d.rest ? 'rest' : ''} ${done ? 'done' : ''}" data-pday="${d.day}">
      <div class="pp-num">Day ${d.day}${tag}</div>
      ${meta}
    </div>`;
  }).join("");
  return `
   <div class="card" style="margin-bottom:14px">
     <div class="card-head"><h3>🧘 欧阳春晓18天体态矫正 · 腰臀比雕刻</h3><span class="badge">百度网盘资源</span></div>
     <div class="kpi-mini">
       <div class="card stat"><div class="stat-label">总体进度</div><div class="stat-value">${completedTraining}<small>/ ${trainingDays} 训练日</small></div></div>
       <div class="card stat"><div class="stat-label">累计消耗</div><div class="stat-value">${totalKcal}<small>kcal</small></div></div>
       <div class="card stat"><div class="stat-label">训练日(含休息)</div><div class="stat-value">18<small>天</small></div></div>
     </div>
     <div class="pp-progress">
       <div class="goal"><div class="g-track"><div class="g-fill" style="width:${Math.round(completedTraining/trainingDays*100)}%"></div></div></div>
       <span style="white-space:nowrap;font-size:11px;color:var(--muted)">${Math.round(completedTraining/trainingDays*100)}%</span>
     </div>
     <p class="hint">点击每一天查看详细训练视频，再点击运动可播放百度网盘资源。</p>
     <div class="form row-2" style="margin-bottom:12px">
       <label>开始日期<input type="date" id="ppStart" value="${p.startDate}" /></label>
       <div style="display:flex;align-items:flex-end;gap:8px">
         <button class="btn" id="btnSetStart">设置开始日</button>
         <button class="btn ghost" id="btnResetPlan">重置进度</button>
       </div>
     </div>
     <div class="posture-plan">${grid}</div>
     <p class="hint">☁️ 所有视频来自百度网盘「18天体态矫正·腰臀比雕刻」合集，点训练动作即可跳转观看。</p>
   </div>`;
}

/* ---------- 体态训练日详情弹窗 ---------- */
function openPostureDayModal(dayNum) {
  const d = postureDayData(dayNum); if (!d) return;
  const t = postureDayTotals(d);
  const done = isPostureDone(dayNum);
  $("#postureDayTitle").textContent = `Day ${d.day} · ${d.title}`;
  const list = d.rest ? `<div class="empty">今天是休息日，让身体恢复一下 💤</div>`
    : d.exercises.map((e, i) => `
      <div class="pd-item" data-pday="${dayNum}" data-pex="${i}">
        <div class="pd-left">
          <div class="pd-name">${esc(e.name)}</div>
          <div class="pd-type">${e.type}</div>
        </div>
        <div class="pd-right">
          <span class="pd-min">⏱ ${e.min} min</span>
          <span class="pd-kcal">${e.kcal} kcal</span>
        </div>
      </div>`).join("");
  const checkBtn = d.rest ? "" : `<div class="pd-check"><button class="btn primary ${done ? 'ghost' : ''}" id="pdCheckBtn">${done ? '✓ 已打卡完成' : `✓ 打卡完成 (${t.min}min / ${t.kcal}kcal)`}</button></div>`;
  $("#postureDayBody").innerHTML = `
    <div class="pd-header">
      <span class="pd-pill">⏱ 总时长 ${t.min} min</span>
      <span class="pd-pill"><span class="fire">🔥</span> ${t.kcal} kcal</span>
      <span class="pd-pill">🎬 ${t.count} 个训练</span>
    </div>
    <div class="pd-list">${list}</div>
    ${checkBtn}`;
  openModal("#postureDayModal");
  // 绑定训练项点击 -> 视频弹窗
  $$("#postureDayBody .pd-item").forEach(el => el.addEventListener("click", () => {
    const idx = +el.dataset.pex; openPostureVideoModal(dayNum, idx);
  }));
  // 绑定打卡按钮
  const cb = $("#pdCheckBtn");
  if (cb) cb.addEventListener("click", () => { postureDayCheckin(dayNum); closeModal("#postureDayModal"); renderFitness("posture"); });
}

function openPostureVideoModal(dayNum, exIdx) {
  const d = postureDayData(dayNum); if (!d || d.rest) return;
  const e = d.exercises[exIdx]; if (!e) return;
  $("#postureVideoTitle").textContent = `Day${dayNum} · ${e.name}`;
  $("#postureVideoBody").innerHTML = `
    <div class="netdisk-player">
      <div class="nd-ico">🎬</div>
      <div class="nd-txt">百度网盘视频</div>
    </div>
    <div class="nd-meta">
      <span>⏱ ${e.min} min</span>
      <span>🔥 ${e.kcal} kcal</span>
      <span>📝 ${e.type}</span>
    </div>
    <div class="nd-actions">
      <button class="btn primary" id="pdOpenNetdisk">📂 打开百度网盘观看</button>
      <button class="btn" data-close>返回训练列表</button>
    </div>`;
  openModal("#postureVideoModal");
  $("#pdOpenNetdisk").addEventListener("click", () => window.open(POSTURE_NETDISK, "_blank", "noopener"));
}

function postureDayCheckin(dayNum) {
  const d = postureDayData(dayNum); if (!d || d.rest) return;
  const t = postureDayTotals(d);
  const date = todayStr();
  // 避免重复：同一天同一 day 只算一次
  if (isPostureDone(dayNum)) return;
  S.exercises.push({
    id: uid(), updatedAt: Date.now(), date, type: `体态·${d.title}`, duration: t.min, kcal: t.kcal,
    note: `第${dayNum}天`, makeup: false, cat: "posture"
  });
  if (!S.checkins.some(c => c.date === date && c.cat === "posture")) S.checkins.push({ date, cat: "posture" });
  if (!S.posturePlan.completed.includes(date)) S.posturePlan.completed.push(date);
  save(); toast(`Day ${dayNum} 打卡完成 ✓`);
}

/* ---------- 欧阳春晓芭杆训练周计划 ---------- */
const BARRE_WEEK = [
  { day: "周日", focus: "休息", rest: true },
  { day: "周一", focus: "芭杆沙漏腰", url: "https://b23.tv/Ur2hGN3" },
  { day: "周二", focus: "芭杆下肢", url: "https://b23.tv/F7q2A0o" },
  { day: "周三", focus: "芭杆沙漏腰", url: "https://b23.tv/Ur2hGN3" },
  { day: "周四", focus: "芭杆上肢", url: "https://b23.tv/YYyE3vl" },
  { day: "周五", focus: "芭杆沙漏腰", url: "https://b23.tv/Ur2hGN3" },
  { day: "周六", focus: "芭杆下肢", url: "https://b23.tv/F7q2A0o" },
];
function barreWeekPlanHTML() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const tStr = todayStr();
  const dow = ["日", "一", "二", "三", "四", "五", "六"];

  let cells = dow.map(d => `<div class="wp-dowhead">${d}</div>`).join("");
  for (let i = 0; i < first; i++) cells += `<div class="wp-day out"></div>`;
  for (let i = 1; i <= days; i++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const d = new Date(y, m, i).getDay();
    const w = BARRE_WEEK[d];
    const isToday = ds === tStr;
    const clickable = w.url ? 'clickable' : '';
    const dataUrl = w.url ? `data-burl="${w.url}"` : '';
    cells += `
      <div class="wp-day ${isToday ? 'today' : ''} ${w.rest ? 'rest' : ''} ${clickable}" ${dataUrl}>
        <div class="wp-date">${i}</div>
        <div class="wp-focus">${w.focus}</div>
        ${w.url ? '<div class="wp-play">▶ 看视频</div>' : ''}
      </div>`;
  }

  return `
   <div class="card" style="margin-bottom:14px">
     <div class="card-head"><h3>🩰 芭杆训练日历 · ${y}年${m + 1}月</h3><span class="badge">周一三五·沙漏腰 / 周二六·下肢 / 周四·上肢</span></div>
     <div class="week-plan barre-cal">
       ${cells}
     </div>
     <p class="hint">点训练日可直接打开对应 B站跟练视频，当日会橙色高亮。</p>
   </div>`;
}

/* 芭杆部位打卡次数：按运动记录/批量补卡里选的芭杆动作类型去重统计天数 */
function fitPartCount(cat, keyword) {
  const s = new Set();
  S.exercises.forEach(e => {
    if (e.cat === cat && e.type && e.type.includes(keyword)) s.add(e.date);
  });
  return s.size;
}

function fitCatHTML(cat) {
  const c = FIT_CATS.find(x => x.id === cat);
  const tk = totKcal(cat, todayStr());
  const done = checkedDays(cat).has(todayStr());
  const strk = streak(cat);
  const exOpts = fitExList(cat).map(e => `<option value="${e.name}">${e.name} (MET ${e.met})</option>`).join("");
  const planCard = cat === "posture" ? posturePlanHTML() : (cat === "barre" ? barreWeekPlanHTML() : "");
  const barreParts = cat === "barre" ? `
   <div class="grid-3" style="margin-bottom:14px">
     <div class="card stat" style="text-align:center">
       <div class="stat-label">芭杆·上肢</div>
       <div class="stat-value">${fitPartCount("barre", "上肢")}<small>次</small></div>
     </div>
     <div class="card stat" style="text-align:center">
       <div class="stat-label">芭杆·下肢</div>
       <div class="stat-value">${fitPartCount("barre", "下肢")}<small>次</small></div>
     </div>
     <div class="card stat" style="text-align:center">
       <div class="stat-label">芭杆·沙漏腰</div>
       <div class="stat-value">${fitPartCount("barre", "沙漏腰")}<small>次</small></div>
     </div>
   </div>
   <p class="hint" style="margin:-6px 0 14px">部位次数按「运动记录 / 批量补卡」中选择的芭杆动作类型统计（去重到天）；用顶部「打卡」按钮只记当天是否完成，不含部位。</p>` : "";
  return `
   <div class="kpi-mini">
     <div class="card stat"><div class="stat-label">今日打卡</div><div class="stat-value">${done ? 1 : 0}<small>次</small></div></div>
     <div class="card stat"><div class="stat-label">今日消耗</div><div class="stat-value">${tk}<small>kcal</small></div></div>
     <div class="card stat"><div class="stat-label">连续天数</div><div class="stat-value">${strk}<small>天</small></div></div>
   </div>
   ${barreParts}
   ${planCard}
   <div class="grid-2">
    <div class="card">
      <div class="card-head"><h3>${c.ico} ${c.name} · 打卡</h3></div>
      <p class="hint" id="checkinHint">${done ? "今天已打卡，继续加油 💪" : "点击打卡记录今天完成了「" + c.name + "」。" + (cat === "barre" || cat === "posture" ? "（欧阳春晓系列，建议按课表连续跟练）" : "")}</p>
      <div class="checkin-row" style="margin-top:6px">
        <button class="btn primary sm" id="btnCheckin">${done ? "✓ 今日已打卡" : "✓ 打卡"}</button>
        ${done ? `<button class="cancel-checkin" id="btnCancelCheckin">取消打卡</button>` : ""}
      </div>
      <div class="row-2" style="margin-bottom:6px">
        <label>补卡日期<input type="date" id="makeupDate" /></label>
        <button class="btn" id="btnMakeup" style="align-self:flex-end">补卡</button>
      </div>
      <div class="batch-makeup" style="margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)">
        <div class="stat-label" style="margin-bottom:6px">📅 历史批量补卡</div>
        <textarea id="batchDates" rows="3" placeholder="每行一个日期，例如：&#10;2026-06-29&#10;2026-06-30&#10;2026-07-02" style="width:100%;padding:8px;border:1px solid var(--line);border-radius:8px;font-size:13px;resize:vertical"></textarea>
        <label style="margin-top:8px">批量补卡动作
          <select id="batchType">${exOpts}</select>
        </label>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn" id="btnFillSample">填入图片示例</button>
          <button class="btn primary" id="btnBatchMakeup">一键补卡</button>
        </div>
      </div>
    </div>
     <div class="card">
       <div class="card-head"><h3>添加运动记录</h3><span class="badge" id="formModeBadge" style="display:none">补卡</span></div>
       <form id="exerciseForm" class="form">
         <label>日期 <span class="hint-inline">（选过去日期＝补卡）</span><input type="date" id="exDate" value="${todayStr()}" required /></label>
         <label>运动类型<select id="exType">${exOpts}</select></label>
         <div class="row-2">
           <label>时长(分钟)<input type="number" id="exDuration" min="1" value="30" required /></label>
           <label>消耗(kcal)<input type="number" id="exKcal" min="0" placeholder="自动估算" /></label>
         </div>
         <label>备注<input type="text" id="exNote" placeholder="如：状态不错 / 第5天" /></label>
         <button type="submit" class="btn primary">保存记录</button>
       </form>
     </div>
   </div>
   <div class="grid-2">
     <div class="card">
       <div class="card-head"><h3>本模块视频 / 资源</h3></div>
       <p class="hint">添加 B站 / 百度网盘链接，点开即看，不必切出去找。${cat === "barre" || cat === "posture" ? "建议把欧阳春晓对应合集放这里。" : ""}</p>
       <form id="fitLinkForm" class="form row-2">
         <label>名称<input type="text" id="flName" placeholder="如：芭杆跟练第3天" required /></label>
         <label>类型<select id="flType"><option value="bilibili">B站视频</option><option value="netdisk">百度网盘</option><option value="other">其他链接</option></select></label>
         <label style="grid-column:1/-1">链接(URL)<input type="url" id="flUrl" placeholder="https://..." required /></label>
         <button type="submit" class="btn primary" style="grid-column:1/-1">添加资源</button>
       </form>
       <div class="res-grid" id="fitLinkList"></div>
     </div>
     <div class="card">
      <div class="card-head" style="justify-content:space-between">
        <h3>打卡日历</h3>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="btn ghost sm" id="calPrev">‹</button>
          <span id="calYM" style="font-size:13px;font-weight:700;color:var(--brand);min-width:72px;text-align:center"></span>
          <button class="btn ghost sm" id="calNext">›</button>
        </div>
      </div>
      <div class="cal" id="calendar"></div>
    </div>
   </div>
   <div class="card"><div class="card-head"><h3>${c.name} · 记录</h3></div><div class="list" id="exerciseList"></div></div>`;
}

function bindFit() {
  // 子导航
  $$("#fitSubnav .subnav-btn").forEach(b => b.addEventListener("click", () => renderFitness(b.dataset.fit)));
  // 日历 + 记录列表
  renderCalendar(checkedDays(currentFitCat));
  renderExerciseList(currentFitCat);
  if (currentFitCat === "all") {
    // 总览页也要绑定日历翻页
    const prev = $("#calPrev"), next = $("#calNext");
    if (prev) prev.addEventListener("click", () => { calView.m--; if (calView.m < 0) { calView.m = 11; calView.y--; } renderCalendar(checkedDays("all")); });
    if (next) next.addEventListener("click", () => { calView.m++; if (calView.m > 11) { calView.m = 0; calView.y++; } renderCalendar(checkedDays("all")); });
    return;
  }
  // 打卡 / 取消打卡
  $("#btnCheckin").addEventListener("click", () => checkinCat(currentFitCat));
  const btnCancel = $("#btnCancelCheckin");
  if (btnCancel) btnCancel.addEventListener("click", () => cancelCheckin(currentFitCat));
  $("#btnMakeup").addEventListener("click", () => {
    const d = $("#makeupDate").value; if (!d) { toast("请选择补卡日期"); return; }
    checkinCat(currentFitCat, d, true);
  });
  // 运动记录表单
  const exForm = $("#exerciseForm");
  exForm.addEventListener("submit", e => { e.preventDefault(); saveEx(); });
  $("#exType").addEventListener("change", refreshExKcal);
  $("#exDuration").addEventListener("input", refreshExKcal);
  $("#exDate").addEventListener("change", () => {
    $("#formModeBadge").style.display = $("#exDate").value < todayStr() ? "inline-block" : "none";
  });
  refreshExKcal();
  // 资源表单
  $("#fitLinkForm").addEventListener("submit", e => { e.preventDefault(); saveFitLink(currentFitCat); });
  renderFitLinks(currentFitCat);
  // 日历翻页
  $("#calPrev").addEventListener("click", () => { calView.m--; if (calView.m < 0) { calView.m = 11; calView.y--; } renderCalendar(checkedDays(currentFitCat)); });
  $("#calNext").addEventListener("click", () => { calView.m++; if (calView.m > 11) { calView.m = 0; calView.y++; } renderCalendar(checkedDays(currentFitCat)); });
  // 批量补卡
  const btnFill = $("#btnFillSample");
  if (btnFill) {
    btnFill.addEventListener("click", () => {
      const sample = ["2026-06-29", "2026-06-30", "2026-07-02", "2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10", "2026-07-11", "2026-07-20", "2026-07-22", "2026-07-24"];
      $("#batchDates").value = sample.join("\n");
      // 默认选芭杆沙漏腰
      const opts = $$("#batchType option");
      opts.forEach(o => { if (o.textContent.includes("沙漏腰")) o.selected = true; });
    });
  }
  const btnBatch = $("#btnBatchMakeup");
  if (btnBatch) {
    btnBatch.addEventListener("click", () => {
      const raw = $("#batchDates").value;
      const type = $("#batchType").value;
      const dates = raw.split(/[\n,，\s]+/).map(s => s.trim()).filter(Boolean).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
      if (!dates.length) { toast("没有可识别的日期"); return; }
      const met = metOf(type);
      let count = 0;
      dates.forEach(d => {
        const exists = S.checkins.some(c => c.date === d && c.cat === currentFitCat);
        if (!exists) S.checkins.push({ date: d, cat: currentFitCat });
        const hasEx = S.exercises.some(e => e.date === d && e.cat === currentFitCat && e.type === type);
        if (!hasEx) {
          S.exercises.push({ id: uid(), updatedAt: Date.now(), date: d, type, duration: 30, kcal: Math.round(met * profileWeight() * 0.5), note: "批量补卡", makeup: true, cat: currentFitCat });
          count++;
        }
      });
      save(); toast(`已补卡 ${count} 天`);
      renderFitness(currentFitCat); refreshChips();
    });
  }
  // 18天体态计划：网格点击打开详情弹窗 + 初始化百度网盘资源
  if (currentFitCat === "posture") {
    seedPostureNetdiskLink();
    $$(".pp-day:not(.rest)").forEach(d => d.addEventListener("click", () => {
      openPostureDayModal(+d.dataset.pday);
    }));
    $("#btnSetStart").addEventListener("click", () => {
      const d = $("#ppStart").value; if (!d) { toast("请选择开始日期"); return; }
      S.posturePlan.startDate = d; save(); toast("开始日期已更新"); renderFitness("posture");
    });
    $("#btnResetPlan").addEventListener("click", () => {
      if (!confirm("确定要重置 18 天体态计划吗？进度将清空。")) return;
      S.posturePlan = { startDate: todayStr(), completed: [] }; save();
      toast("计划已重置"); renderFitness("posture");
    });
  }
  // 芭杆周课表：点击日历直接打开 B站视频 + 初始化三个合集资源
  if (currentFitCat === "barre") {
    seedBarreLinks();
    $$(".wp-day.clickable").forEach(d => d.addEventListener("click", () => {
      const u = d.dataset.burl; if (u) window.open(u, "_blank", "noopener");
    }));
  }
}

function seedBarreLinks() {
  S.fitLinks.barre = S.fitLinks.barre || [];
  const seeds = [
    { name: "芭杆·上肢 30分钟完整版", url: "https://b23.tv/YYyE3vl", type: "bilibili" },
    { name: "芭杆·下肢 30分钟完整版", url: "https://b23.tv/F7q2A0o", type: "bilibili" },
    { name: "芭杆·沙漏腰 30分钟完整版", url: "https://b23.tv/Ur2hGN3", type: "bilibili" },
  ];
  let changed = false;
  seeds.forEach(s => {
    if (!S.fitLinks.barre.some(r => r.url === s.url)) {
      S.fitLinks.barre.push({ id: uid(), updatedAt: Date.now(), ...s }); changed = true;
    }
  });
  if (changed) save();
}
function seedPostureNetdiskLink() {
  S.fitLinks.posture = S.fitLinks.posture || [];
  const seed = { name: "18天体态矫正·腰臀比雕刻（百度网盘）", url: POSTURE_NETDISK, type: "netdisk" };
  if (!S.fitLinks.posture.some(r => r.url === seed.url)) {
    S.fitLinks.posture.push({ id: uid(), updatedAt: Date.now(), ...seed }); save();
  }
}

function checkinCat(cat, date = todayStr(), makeup = false) {
  const exists = S.checkins.some(c => c.date === date && c.cat === cat);
  if (!exists) S.checkins.push({ date, cat });
  save();
  toast(makeup ? "已补卡 " + date : "已打卡 ✓");
  renderFitness(cat); refreshChips();
}
function cancelCheckin(cat, date = todayStr()) {
  S.checkins = S.checkins.filter(c => !(c.date === date && c.cat === cat));
  // 同时移除该模块当天通过「一键打卡」或普通打卡产生的运动记录（保留手动添加的运动记录？这里只移除空 type 或备注带「打卡」的记录，保守处理：仅移除 checkin）
  save();
  toast("已取消今日打卡");
  renderFitness(cat); refreshChips();
}
function saveEx() {
  const date = $("#exDate").value;
  const kcal = +$("#exKcal").value || estKcal($("#exType").value, +$("#exDuration").value, profileWeight());
  S.exercises.push({
    id: uid(), updatedAt: Date.now(), date, type: $("#exType").value, duration: +$("#exDuration").value,
    kcal, note: $("#exNote").value, makeup: date < todayStr(), cat: currentFitCat,
  });
  save(); toast("记录已保存");
  renderFitness(currentFitCat); refreshChips();
}
function saveFitLink(cat) {
  S.fitLinks[cat] = S.fitLinks[cat] || [];
  S.fitLinks[cat].push({ id: uid(), updatedAt: Date.now(), name: $("#flName").value, type: $("#flType").value, url: $("#flUrl").value });
  save(); toast("资源已添加");
  renderFitness(cat);
}
function refreshExKcal() {
  const t = $("#exType").value, dur = +$("#exDuration").value || 0;
  $("#exKcal").value = estKcal(t, dur, profileWeight()) || "";
}
let calView = { y: new Date().getFullYear(), m: new Date().getMonth() };
function renderCalendar(set, y, m) {
  const cal = $("#calendar"); if (!cal) return; cal.innerHTML = "";
  const yy = y ?? calView.y, mm = m ?? calView.m;
  const ymLabel = $("#calYM"); if (ymLabel) ymLabel.textContent = `${yy}-${String(mm + 1).padStart(2, "0")}`;
  const dow = ["日", "一", "二", "三", "四", "五", "六"];
  dow.forEach(x => { const e = document.createElement("div"); e.className = "cdow"; e.textContent = x; cal.appendChild(e); });
  const first = new Date(yy, mm, 1).getDay();
  const days = new Date(yy, mm + 1, 0).getDate();
  for (let i = 0; i < first; i++) { const e = document.createElement("div"); e.className = "cday out"; cal.appendChild(e); }
  const tStr = todayStr();
  for (let i = 1; i <= days; i++) {
    const ds = `${yy}-${String(mm + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const e = document.createElement("div");
    e.className = "cday" + (set.has(ds) ? " done" : "") + (ds === tStr ? " today" : "");
    const plan = calendarPlanHTML(ds);
    e.innerHTML = `<div class="cnum">${i}</div>${plan.html}`;
    if (plan.url) e.addEventListener("click", () => window.open(plan.url, "_blank", "noopener"));
    cal.appendChild(e);
  }
}

/* 根据当前子模块，在日历格子里显示当日训练安排 */
function calendarPlanHTML(ds) {
  const date = new Date(ds + "T00:00:00");
  // 欧阳春晓芭杆训练：按星期几显示课表 + B站链接
  if (currentFitCat === "barre") {
    const w = BARRE_WEEK[date.getDay()];
    if (w.rest) return { html: '<div class="cplan">休息</div>' };
    return { html: `<div class="cplan">${esc(w.focus)}</div><div class="cplay">▶ 看视频</div>`, url: w.url };
  }
  // 欧阳春晓18天体态：按开始日期偏移显示 Day X
  if (currentFitCat === "posture") {
    const p = posturePlan();
    const start = new Date(p.startDate + "T00:00:00");
    const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24));
    if (diff >= 0 && diff < POSTURE_DAYS) {
      const d = POSTURE_PLAN[diff];
      if (d.rest) return { html: '<div class="cplan">Day ' + d.day + '<br>休息</div>' };
      return { html: `<div class="cplan">Day ${d.day}<br>${esc(d.title)}</div>` };
    }
  }
  // 总览：显示当天打了卡的模块图标
  if (currentFitCat === "all") {
    const cats = FIT_CATS.filter(c => checkedDays(c.id).has(ds)).map(c => c.ico);
    if (cats.length) return { html: `<div class="cplan">${cats.join(" ")}</div>` };
  }
  return { html: "" };
}
function renderExerciseList(cat) {
  const box = $("#exerciseList"); if (!box) return;
  const list = (cat === "all" ? S.exercises : S.exercises.filter(e => (e.cat || "gym") === cat))
    .slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  if (!list.length) { box.innerHTML = `<div class="empty">还没有记录，添加一条试试。</div>`; return; }
  box.innerHTML = list.map(e => {
    const cname = e.cat ? (FIT_CATS.find(c => c.id === e.cat) || {}).name : "健身";
    const badge = cat === "all" ? ` <span class="tag-ok">${esc(cname)}</span>` : "";
    return `<div class="list-row">
      <div>
        <div class="lr-main">${esc(e.type)} ${e.makeup ? '<span class="badge">补卡</span>' : ''}${badge}</div>
        <div class="lr-sub">${e.date} · ${e.duration}分钟${e.note ? ' · ' + esc(e.note) : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="lr-kcal">${e.kcal} kcal</span>
        <button class="del" data-del-ex="${e.id}">✕</button>
      </div>
    </div>`;
  }).join("");
  $$("[data-del-ex]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.exercises, b.dataset.delEx); save(); renderFitness(currentFitCat); refreshChips();
  }));
}
function renderFitLinks(cat) {
  const box = $("#fitLinkList"); if (!box) return;
  const list = S.fitLinks[cat] || [];
  if (!list.length) { box.innerHTML = `<div class="empty">还没有该模块的资源链接。</div>`; return; }
  box.innerHTML = list.map(r => {
    let body = "";
    if (r.type === "bilibili" && bvid(r.url)) {
      body = `<button class="btn ghost sm play-toggle" data-play="${r.id}">▶ 播放视频</button>`;
    } else {
      const label = r.type === "netdisk" ? "打开百度网盘 ↗" : "打开链接 ↗";
      body = `<a class="btn ghost sm" href="${esc(r.url)}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<div class="res-card">
      <div class="rc-head"><div class="rc-name ${r.type === "bilibili" ? "res-type-bilibili" : ""}">${esc(r.name)}</div></div>
      <div class="rc-player" id="player-fit-${r.id}"></div>
      <div class="rc-actions">${body}<button class="del" data-del-fit="${r.id}">删除</button></div>
    </div>`;
  }).join("");
  $$(".play-toggle", box).forEach(b => b.addEventListener("click", () => {
    const r = list.find(x => x.id === b.dataset.play);
    $("#player-fit-" + r.id).innerHTML = `<iframe src="https://player.bilibili.com/player.html?bvid=${bvid(r.url)}&page=1&high_quality=1&danmaku=0&autoplay=0" allowfullscreen></iframe>`;
    b.remove();
  }));
  $$("[data-del-fit]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.fitLinks[cat] || (S.fitLinks[cat] = []), b.dataset.delFit);
    save(); renderFitLinks(cat);
  }));
}

/* ============================================================
   饮食营养
   ============================================================ */
function nutGoal() { return $("#nutGoalSel").value; }
function renderNutrition() {
  renderAntiMenu();
  const goal = nutGoal();
  let target = "--";
  if (S.profile) { target = calcMacros(calcTDEE(S.profile), goal).cal; }
  $("#nutTargetKcal").textContent = target;
  const date = todayStr();
  const day = S.foods.filter(f => f.date === date);
  const sum = day.reduce((a, f) => ({ k: a.k + f.kcal, p: a.p + (f.p || 0), c: a.c + (f.c || 0), f: a.f + (f.f || 0) }), { k: 0, p: 0, c: 0, f: 0 });
  $("#nutTodayKcal").textContent = sum.k;
  const bal = target === "--" ? "--" : (target - sum.k);
  $("#nutBalance").textContent = bal === "--" ? "--" : (bal >= 0 ? "缺口 " + bal : "盈余 " + (-bal));
  $("#nutBalance").style.color = bal === "--" ? "" : (bal >= 0 ? "var(--brand2)" : "var(--warn)");
  // 宏量条
  const mb = $("#macroBars");
  if (S.profile) {
    const m = calcMacros(calcTDEE(S.profile), goal);
    const rows = [["蛋白", sum.p, m.protein, "var(--brand)"], ["碳水", sum.c, m.carbs, "var(--brand3)"], ["脂肪", sum.f, m.fat, "#f59e0b"]];
    mb.innerHTML = rows.map(([n, v, t, c]) => {
      const pct = t ? Math.min(100, Math.round(v / t * 100)) : 0;
      return `<div class="mbar"><div class="ml">${n}</div><div class="mtrack"><div class="mfill" style="width:${pct}%;background:${c}"></div></div><div class="mv">${v}/${t}g</div></div>`;
    }).join("");
  } else { mb.innerHTML = `<div class="hint">先在「目标与提醒」填写身体数据，可自动算出目标热量与宏量。</div>`; }
  // 列表
  const box = $("#foodList");
  if (!day.length) { box.innerHTML = `<div class="empty">今天还没吃东西记录～</div>`; return; }
  box.innerHTML = day.map(f => `
    <div class="list-row">
      <div><div class="lr-main">${esc(f.name)}</div>
        <div class="lr-sub">${f.meal} · P${f.p} C${f.c} F${f.f} g</div></div>
      <div style="display:flex;align-items:center;gap:12px">
        <span class="lr-kcal">${f.kcal} kcal</span>
        <button class="del" data-del-food="${f.id}">✕</button>
      </div>
    </div>`).join("");
  $$("[data-del-food]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.foods, b.dataset.delFood); save(); renderNutrition();
  }));
}
$("#nutGoalSel").addEventListener("change", renderNutrition);
$("#foodForm").addEventListener("submit", e => {
  e.preventDefault();
  S.foods.push({
    id: uid(), updatedAt: Date.now(), date: $("#foodDate").value, meal: $("#foodMeal").value, name: $("#foodName").value,
    kcal: +$("#foodKcal").value, p: +$("#foodP").value || 0, c: +$("#foodC").value || 0, f: +$("#foodF").value || 0,
  });
  save(); toast("饮食已保存"); e.target.reset(); $("#foodDate").value = todayStr(); renderNutrition();
});

/* ============================================================
   抗炎一周菜单（应季平价 + 购物清单，手动刷新）
   ============================================================ */
const ANTI_SEASON_NOTE = {
  spring: "应季平价：菠菜、芦笋、豌豆、草莓、荠菜、春笋、樱桃萝卜",
  summer: "应季平价：冬瓜、秋葵、毛豆、丝瓜、番茄、黄瓜、蓝莓、火龙果、玉米",
  autumn: "应季平价：南瓜、莲藕、山药、银耳、梨、柚子、红薯、西兰花",
  winter: "应季平价：白萝卜、白菜、胡萝卜、橙子、柚子、大白菜、芹菜",
};
// 每个食谱：seasons 适用季节；items 购物项；tags 抗炎要点
const ANTI_RECIPES = {
  breakfast: [
    { title: "燕麦蓝莓碗", seasons: ["spring", "summer", "autumn"], tags: ["抗氧化", "益生菌"], items: [{ n: "燕麦", q: 40, u: "g", cat: "主食" }, { n: "无糖酸奶", q: 150, u: "g", cat: "乳制品" }, { n: "蓝莓", q: 1, u: "把", cat: "水果" }, { n: "核桃", q: 1, u: "勺", cat: "蛋白" }] },
    { title: "杂粮蛋粥", seasons: ["spring", "summer", "autumn", "winter"], tags: ["全谷物"], items: [{ n: "糙米/小米", q: 30, u: "g", cat: "主食" }, { n: "鸡蛋", q: 1, u: "个", cat: "蛋白" }, { n: "黄瓜", q: 1, u: "根", cat: "蔬菜" }] },
    { title: "菠菜虾仁燕麦", seasons: ["spring", "summer", "autumn"], tags: ["Omega-3"], items: [{ n: "燕麦", q: 40, u: "g", cat: "主食" }, { n: "菠菜", q: 50, u: "g", cat: "蔬菜" }, { n: "虾仁", q: 6, u: "只", cat: "蛋白" }, { n: "姜", q: 1, u: "片", cat: "调味" }] },
    { title: "红薯豆浆蛋", seasons: ["spring", "summer", "autumn", "winter"], tags: ["膳食纤维"], items: [{ n: "红薯", q: 150, u: "g", cat: "主食" }, { n: "无糖豆浆", q: 1, u: "杯", cat: "乳制品" }, { n: "鸡蛋", q: 1, u: "个", cat: "蛋白" }] },
    { title: "全麦蛋三明治", seasons: ["spring", "summer", "autumn", "winter"], tags: ["全谷物"], items: [{ n: "全麦面包", q: 2, u: "片", cat: "主食" }, { n: "鸡蛋", q: 1, u: "个", cat: "蛋白" }, { n: "番茄", q: 1, u: "片", cat: "蔬菜" }, { n: "黄瓜", q: 1, u: "片", cat: "蔬菜" }] },
    { title: "希腊酸奶果杯", seasons: ["spring", "summer", "autumn", "winter"], tags: ["益生菌", "Omega-3"], items: [{ n: "无糖酸奶", q: 150, u: "g", cat: "乳制品" }, { n: "香蕉", q: 1, u: "根", cat: "水果" }, { n: "亚麻籽", q: 1, u: "勺", cat: "其他" }] },
  ],
  lunch: [
    { title: "清蒸秋刀鱼+糙米饭+凉拌秋葵", seasons: ["summer", "autumn"], tags: ["Omega-3"], items: [{ n: "秋刀鱼", q: 1, u: "条", cat: "蛋白" }, { n: "糙米", q: 60, u: "g", cat: "主食" }, { n: "秋葵", q: 100, u: "g", cat: "蔬菜" }, { n: "姜", q: 1, u: "片", cat: "调味" }] },
    { title: "番茄豆腐煲+杂粮饭+白灼西兰花", seasons: ["spring", "summer", "autumn", "winter"], tags: ["抗氧化", "植物蛋白"], items: [{ n: "番茄", q: 1, u: "个", cat: "蔬菜" }, { n: "老豆腐", q: 150, u: "g", cat: "蛋白" }, { n: "糙米", q: 60, u: "g", cat: "主食" }, { n: "西兰花", q: 100, u: "g", cat: "蔬菜" }] },
    { title: "鸡胸蔬菜沙拉", seasons: ["spring", "summer", "autumn", "winter"], tags: ["高蛋白"], items: [{ n: "鸡胸肉", q: 120, u: "g", cat: "蛋白" }, { n: "西兰花", q: 80, u: "g", cat: "蔬菜" }, { n: "番茄", q: 1, u: "个", cat: "蔬菜" }, { n: "生菜", q: 50, u: "g", cat: "蔬菜" }, { n: "橄榄油", q: 1, u: "勺", cat: "调味" }] },
    { title: "鲭鱼味噌煮+糙米饭+蒸南瓜", seasons: ["summer", "autumn", "winter"], tags: ["Omega-3", "发酵"], items: [{ n: "鲭鱼", q: 1, u: "块", cat: "蛋白" }, { n: "味噌", q: 1, u: "勺", cat: "调味" }, { n: "糙米", q: 60, u: "g", cat: "主食" }, { n: "南瓜", q: 150, u: "g", cat: "主食" }] },
    { title: "毛豆炒虾仁+杂粮饭+冬瓜汤", seasons: ["summer"], tags: ["Omega-3", "植物蛋白"], items: [{ n: "毛豆", q: 100, u: "g", cat: "蛋白" }, { n: "虾仁", q: 8, u: "只", cat: "蛋白" }, { n: "糙米", q: 60, u: "g", cat: "主食" }, { n: "冬瓜", q: 200, u: "g", cat: "蔬菜" }] },
    { title: "豆腐菌菇汤+杂粮饭+清炒空心菜", seasons: ["spring", "summer", "autumn", "winter"], tags: ["植物蛋白"], items: [{ n: "老豆腐", q: 150, u: "g", cat: "蛋白" }, { n: "香菇", q: 50, u: "g", cat: "蔬菜" }, { n: "糙米", q: 60, u: "g", cat: "主食" }, { n: "空心菜", q: 150, u: "g", cat: "蔬菜" }] },
  ],
  dinner: [
    { title: "冬瓜虾仁汤+蒸山药+凉拌黄瓜", seasons: ["summer", "autumn"], tags: ["Omega-3"], items: [{ n: "冬瓜", q: 200, u: "g", cat: "蔬菜" }, { n: "虾仁", q: 6, u: "只", cat: "蛋白" }, { n: "山药", q: 150, u: "g", cat: "主食" }, { n: "黄瓜", q: 1, u: "根", cat: "蔬菜" }] },
    { title: "蒜蓉西兰花+清蒸鱼+杂粮饭", seasons: ["spring", "summer", "autumn", "winter"], tags: ["抗氧化"], items: [{ n: "西兰花", q: 150, u: "g", cat: "蔬菜" }, { n: "龙利鱼/巴沙鱼", q: 150, u: "g", cat: "蛋白" }, { n: "糙米", q: 50, u: "g", cat: "主食" }, { n: "蒜", q: 2, u: "瓣", cat: "调味" }] },
    { title: "番茄菌菇豆腐汤+蒸红薯", seasons: ["spring", "summer", "autumn", "winter"], tags: ["植物蛋白"], items: [{ n: "番茄", q: 1, u: "个", cat: "蔬菜" }, { n: "菌菇", q: 80, u: "g", cat: "蔬菜" }, { n: "嫩豆腐", q: 100, u: "g", cat: "蛋白" }, { n: "红薯", q: 150, u: "g", cat: "主食" }] },
    { title: "菠菜豆腐汤+蒸蛋+凉拌木耳", seasons: ["spring", "summer", "autumn", "winter"], tags: ["植物蛋白"], items: [{ n: "菠菜", q: 100, u: "g", cat: "蔬菜" }, { n: "嫩豆腐", q: 100, u: "g", cat: "蛋白" }, { n: "鸡蛋", q: 1, u: "个", cat: "蛋白" }, { n: "木耳", q: 30, u: "g", cat: "蔬菜" }] },
    { title: "味噌蔬菜汤+杂粮饭+凉拌海带", seasons: ["spring", "summer", "autumn", "winter"], tags: ["发酵", "碘"], items: [{ n: "味噌", q: 1, u: "勺", cat: "调味" }, { n: "海带", q: 50, u: "g", cat: "蔬菜" }, { n: "糙米", q: 50, u: "g", cat: "主食" }, { n: "嫩豆腐", q: 80, u: "g", cat: "蛋白" }] },
    { title: "清炒丝瓜+虾仁滑蛋+杂粮饭", seasons: ["summer"], tags: ["Omega-3"], items: [{ n: "丝瓜", q: 200, u: "g", cat: "蔬菜" }, { n: "虾仁", q: 6, u: "只", cat: "蛋白" }, { n: "鸡蛋", q: 1, u: "个", cat: "蛋白" }, { n: "糙米", q: 50, u: "g", cat: "主食" }] },
  ],
  snack: [
    { title: "蓝莓/草莓1小碗", seasons: ["spring", "summer"], tags: ["抗氧化"], items: [{ n: "蓝莓", q: 1, u: "把", cat: "水果" }] },
    { title: "苹果+核桃2颗", seasons: ["spring", "summer", "autumn", "winter"], tags: ["Omega-3"], items: [{ n: "苹果", q: 1, u: "个", cat: "水果" }, { n: "核桃", q: 2, u: "颗", cat: "蛋白" }] },
    { title: "无糖酸奶100g", seasons: ["spring", "summer", "autumn", "winter"], tags: ["益生菌"], items: [{ n: "无糖酸奶", q: 100, u: "g", cat: "乳制品" }] },
    { title: "香蕉1根", seasons: ["spring", "summer", "autumn", "winter"], tags: ["钾"], items: [{ n: "香蕉", q: 1, u: "根", cat: "水果" }] },
    { title: "煮毛豆1小碗", seasons: ["summer"], tags: ["植物蛋白"], items: [{ n: "毛豆", q: 100, u: "g", cat: "蛋白" }] },
    { title: "樱桃番茄1小碗", seasons: ["spring", "summer", "autumn", "winter"], tags: ["抗氧化"], items: [{ n: "番茄", q: 1, u: "个", cat: "蔬菜" }] },
  ],
};
const ANTI_CAT_ORDER = ["蔬菜", "蛋白", "主食", "水果", "乳制品", "调味", "其他"];
function seasonOf(d) { const m = d.getMonth() + 1; return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter"; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function pickPool(arr, season) { const f = arr.filter(r => r.seasons.includes(season)); return f.length ? f : arr; }
function mondayOf(d) { const x = new Date(d); const dow = x.getDay(); x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1)); x.setHours(0, 0, 0, 0); return x; }
function nextSaturday(from) { const x = new Date(from); let add = (6 - x.getDay()); if (add <= 0) add += 7; x.setDate(x.getDate() + add); x.setHours(0, 0, 0, 0); return x; }
function genAntiMenu() {
  const now = new Date();
  const mon = mondayOf(now);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const season = seasonOf(now);
  const labels = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
  const pools = {
    breakfast: shuffle(pickPool(ANTI_RECIPES.breakfast, season)),
    lunch: shuffle(pickPool(ANTI_RECIPES.lunch, season)),
    dinner: shuffle(pickPool(ANTI_RECIPES.dinner, season)),
    snack: shuffle(pickPool(ANTI_RECIPES.snack, season)),
  };
  const days = [];
  for (let i = 0; i < 7; i++) {
    const b = pools.breakfast[i % pools.breakfast.length];
    const l = pools.lunch[i % pools.lunch.length];
    const d = pools.dinner[i % pools.dinner.length];
    const s = pools.snack[i % pools.snack.length];
    const dateStr = todayStr(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i));
    const meals = {
      早餐: { title: b.title, items: b.items, tags: b.tags },
      午餐: { title: l.title, items: l.items, tags: l.tags },
      晚餐: { title: d.title, items: d.items, tags: d.tags },
      加餐: { title: s.title, items: s.items, tags: s.tags },
    };
    const tags = [...new Set([...b.tags, ...l.tags, ...d.tags, ...s.tags])];
    days.push({ label: labels[i], date: dateStr, meals, note: tags.join(" · ") });
  }
  const agg = {};
  days.forEach(day => Object.values(day.meals).forEach(m => m.items.forEach(it => {
    const k = it.n; if (!agg[k]) agg[k] = { name: it.n, qty: 0, unit: it.u, cat: it.cat, done: false };
    agg[k].qty += it.q;
  })));
  const list = Object.values(agg).map(x => ({ ...x, qty: Math.round(x.qty) }));
  return { weekStart: todayStr(mon), weekEnd: todayStr(sun), genDate: todayStr(now), season, days, list };
}
function renderAntiMenu() {
  if (!S.antiMenu) S.antiMenu = genAntiMenu();
  const m = S.antiMenu;
  const wk = $("#antiWeek");
  if (wk) {
    const ns = nextSaturday(new Date());
    const isSat = new Date().getDay() === 6;
    wk.textContent = `覆盖 ${m.weekStart} ~ ${m.weekEnd} ｜ ${isSat ? "🔔 今天周六，可刷新新菜单" : "下次刷新：" + todayStr(ns) + "(周六)"}`;
  }
  const body = $("#antiBody"); if (!body) return;
  const seasonNote = ANTI_SEASON_NOTE[m.season] || "";
  const dayCards = m.days.map(day => `
    <div class="anti-day">
      <div class="ad-head">${day.label}<span class="ad-date">${day.date.slice(5)}</span></div>
      ${["早餐", "午餐", "晚餐", "加餐"].map(meal => {
        const x = day.meals[meal];
        return `<div class="ad-meal"><span class="ad-meal-l">${meal}</span>
          <div class="ad-meal-body"><div class="ad-meal-t">${esc(x.title)}</div>
          <div class="ad-items">${x.items.map(it => `<span class="ad-item">${esc(it.n)} ${it.q}${it.u}</span>`).join("")}</div></div></div>`;
      }).join("")}
      <div class="ad-note">${esc(day.note)}</div>
    </div>`).join("");
  const grouped = ANTI_CAT_ORDER.map(cat => {
    const items = m.list.filter(x => x.cat === cat); if (!items.length) return "";
    return `<div class="ali-cat"><div class="ali-cat-h">${cat}</div>${items.map((it, idx) => {
      const gi = m.list.indexOf(it);
      return `<label class="ali-item ${it.done ? "done" : ""}"><input type="checkbox" data-anti-item="${gi}" ${it.done ? "checked" : ""}/>${esc(it.name)} <b>${it.qty}${it.unit}</b></label>`;
    }).join("")}</div>`;
  }).join("");
  body.innerHTML = `
    <div class="hint anti-note">🥬 ${esc(seasonNote)}　·　抗炎要点：深海鱼/坚果的 Omega-3、彩色蔬果抗氧化物、全谷物与发酵豆制品，少精制糖与油炸。</div>
    <div class="anti-grid">${dayCards}</div>
    <div class="anti-list"><h4>🛒 本周购物清单（点击可勾选）</h4>${grouped}</div>`;
  $$("[data-anti-item]", body).forEach(c => c.addEventListener("change", () => {
    const i = +c.dataset.antiItem; S.antiMenu.list[i].done = c.checked; save();
    c.closest(".ali-item").classList.toggle("done", c.checked);
  }));
}
$("#antiRefresh").addEventListener("click", () => {
  S.antiMenu = genAntiMenu(); save(); renderAntiMenu(); toast("已生成新一周抗炎菜单");
});


/* ============================================================
   数据看板
   ============================================================ */
let charts = {};
function renderDashboard() {
  const kpis = $("#kpiCards");
  const set = checkedDays("all");
  const ym = todayStr().slice(0, 7);
  const monthDays = [...set].filter(x => x.startsWith(ym)).length;
  const totalKcal = S.exercises.reduce((a, e) => a + (e.kcal || 0), 0);
  const last7 = S.exercises.filter(e => { const diff = (Date.now() - new Date(e.date)) / 864e5; return diff <= 7; }).reduce((a, e) => a + e.kcal, 0);
  const days30 = [...set].filter(x => { const diff = (Date.now() - new Date(x)) / 864e5; return diff <= 30; }).length;
  const lastW = S.weights.length ? S.weights[S.weights.length - 1].val : "--";
  kpis.innerHTML = [
    ["本月打卡", monthDays + " 天"], ["累计消耗", totalKcal + " kcal"], ["近7天消耗", last7 + " kcal"],
    ["近30天打卡", days30 + " 天"], ["最新体重", lastW + " kg"], ["累计运动", S.exercises.length + " 次"],
    ["资源数", S.resources.length], ["目标数", S.goals.length],
    ["追踪项", S.trackers.length], ["生词", S.english.length], ["库存", S.pantry.length],
  ].map(([t, v]) => `<div class="card stat" style="margin:0"><div class="stat-label">${t}</div><div class="stat-value" style="font-size:24px">${v}</div></div>`).join("");

  // 体重趋势
  const ws = [...S.weights].sort((a, b) => a.date.localeCompare(b.date));
  drawChart("chartWeight", "line", ws.map(w => w.date), ws.map(w => w.val), "体重 kg", "var(--brand2)");
  // 每周消耗
  const weeks = weekKcal();
  drawChart("chartWeek", "bar", weeks.labels, weeks.vals, "kcal", "var(--brand)");
  // 近30天打卡
  const ci = last30Checkin(set);
  drawChart("chartCheckin", "bar", ci.labels, ci.vals, "打卡(0/1)", "var(--brand3)");
}
function weekKcal(cat) {
  const map = {};
  S.exercises.forEach(e => {
    if (cat && cat !== "all" && (e.cat || "gym") !== cat) return;
    const d = new Date(e.date); const wk = getWeekKey(d);
    map[wk] = (map[wk] || 0) + (e.kcal || 0);
  });
  const keys = Object.keys(map).sort().slice(-8);
  // 带 cat 参数时返回「本周」消耗数值；无参数时返回近 8 周图表数据
  if (cat) return map[getWeekKey(new Date())] || 0;
  return { labels: keys, vals: keys.map(k => map[k]) };
}
function daysKcal(cat, n) {
  const base = new Date(); base.setDate(base.getDate() - n + 1);
  let sum = 0;
  S.exercises.forEach(e => {
    if (cat && cat !== "all" && (e.cat || "gym") !== cat) return;
    const d = new Date(e.date); if (d >= base) sum += (e.kcal || 0);
  });
  return sum;
}
function getWeekKey(d) {
  const tmp = new Date(d); const day = (tmp.getDay() + 6) % 7;
  tmp.setDate(tmp.getDate() - day); return tmp.toISOString().slice(0, 10);
}
function last30Checkin(set) {
  const labels = [], vals = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const s = todayStr(d);
    labels.push(s.slice(5)); vals.push(set.has(s) ? 1 : 0);
  }
  return { labels, vals };
}
function drawChart(id, type, labels, data, label, color) {
  if (charts[id]) charts[id].destroy();
  const ctx = $("#" + id); if (!ctx) return;
  charts[id] = new Chart(ctx, {
    type,
    data: { labels, datasets: [{ label, data, backgroundColor: color, borderColor: color, fill: type === "line", tension: .3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
  });
}

/* ============================================================
   外部资源库
   ============================================================ */
function bvid(url) {
  const m = url.match(/BV[0-9A-Za-z]+/i); return m ? m[0].toUpperCase() : null;
}
function renderResources() {
  const q = $("#resSearch").value.trim().toLowerCase();
  const box = $("#resGrid");
  let list = S.resources;
  if (q) list = list.filter(r => (r.name + r.tag).toLowerCase().includes(q));
  if (!list.length) { box.innerHTML = `<div class="empty">还没有资源，添加 B站 / 百度网盘 链接吧。</div>`; return; }
  box.innerHTML = list.map(r => {
    const tag = r.tag ? `<span class="rc-tag">${esc(r.tag)}</span>` : "";
    let body = "";
    if (r.type === "bilibili" && bvid(r.url)) {
      body = `<button class="btn ghost sm play-toggle" data-play="${r.id}">▶ 播放视频</button>`;
    } else {
      const label = r.type === "netdisk" ? "打开百度网盘 ↗" : "打开链接 ↗";
      body = `<a class="btn ghost sm" href="${esc(r.url)}" target="_blank" rel="noopener">${label}</a>`;
    }
    return `<div class="res-card">
      <div class="rc-head"><div class="rc-name ${r.type === "bilibili" ? "res-type-bilibili" : ""}">${esc(r.name)}</div>${tag}</div>
      <div class="rc-player" id="player-${r.id}"></div>
      <div class="rc-actions">${body}<button class="del" data-del-res="${r.id}">删除</button></div>
    </div>`;
  }).join("");
  $$(".play-toggle", box).forEach(b => b.addEventListener("click", () => {
    const r = S.resources.find(x => x.id === b.dataset.play);
    const p = $("#player-" + r.id);
    p.innerHTML = `<iframe src="https://player.bilibili.com/player.html?bvid=${bvid(r.url)}&page=1&high_quality=1&danmaku=0&autoplay=0" allowfullscreen></iframe>`;
    b.remove();
  }));
  $$("[data-del-res]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.resources, b.dataset.delRes); save(); renderResources(); renderDashboard();
  }));
}
$("#resSearch").addEventListener("input", renderResources);
$("#resForm").addEventListener("submit", e => {
  e.preventDefault();
  S.resources.push({ id: uid(), updatedAt: Date.now(), name: $("#resName").value, type: $("#resType").value, url: $("#resUrl").value, tag: $("#resTag").value });
  save(); toast("资源已添加"); e.target.reset(); renderResources(); renderDashboard();
});

/* ============================================================
   目标与提醒
   ============================================================ */
function renderProfileForm() {
  const p = S.profile;
  ["pSex", "pAge", "pHeight", "pWeight", "pActivity", "pSex2", "pAge2", "pH2", "pW2", "pAct2"].forEach(id => {
    const el = $("#" + id); if (!el) return;
  });
  if (p) {
    $("#pSex").value = p.sex; $("#pAge").value = p.age; $("#pHeight").value = p.height; $("#pWeight").value = p.weight; $("#pActivity").value = p.activity;
    $("#pSex2").value = p.sex; $("#pAge2").value = p.age; $("#pH2").value = p.height; $("#pW2").value = p.weight; $("#pAct2").value = p.activity;
  }
}
function applyProfile(p) {
  S.profile = p; save();
  const bmi = calcBMI(p.weight, p.height);
  const tdee = calcTDEE(p);
  const cat = bmi < 18.5 ? "偏瘦" : bmi < 25 ? "正常" : bmi < 30 ? "偏重" : "肥胖";
  const out = `<div class="co"><div class="t">BMI</div><div class="v">${bmi.toFixed(1)}</div><div class="s">${cat}（Quetelet）</div></div>
    <div class="co w"><div class="t">TDEE</div><div class="v">${Math.round(tdee)}</div><div class="s">kcal/天（Mifflin-St Jeor）</div></div>
    <div class="co l"><div class="t">维持热量</div><div class="v">${Math.round(tdee)}</div><div class="s">BMR≈${Math.round(tdee / [1.2, 1.375, 1.55, 1.725, 1.9][p.activity - 1])}</div></div>`;
  $("#calcOut").innerHTML = out; $("#calcOut2").innerHTML = out;
  refreshChips(); renderNutrition(); renderFitness();
  toast("已保存身体数据");
}
$("#profileForm").addEventListener("submit", e => {
  e.preventDefault();
  applyProfile({ sex: $("#pSex").value, age: +$("#pAge").value, height: +$("#pHeight").value, weight: +$("#pWeight").value, activity: +$("#pActivity").value });
});
$("#profileForm2").addEventListener("submit", e => {
  e.preventDefault();
  applyProfile({ sex: $("#pSex2").value, age: +$("#pAge2").value, height: +$("#pH2").value, weight: +$("#pW2").value, activity: +$("#pAct2").value });
  closeModal("#profileModal");
});

function renderWeights() {
  const box = $("#weightList");
  const list = [...S.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  if (!list.length) { box.innerHTML = `<div class="empty">记录体重后会在看板生成趋势图。</div>`; return; }
  box.innerHTML = list.map(w => `<div class="list-row"><div class="lr-main">${w.val} kg</div>
    <div style="display:flex;align-items:center;gap:12px"><span class="lr-sub">${w.date}</span><button class="del" data-del-w="${w.id}">✕</button></div></div>`).join("");
  $$("[data-del-w]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.weights, b.dataset.delW); save(); renderWeights(); renderDashboard();
  }));
}
$("#weightForm").addEventListener("submit", e => {
  e.preventDefault();
  S.weights.push({ id: uid(), updatedAt: Date.now(), date: $("#wDate").value, val: +$("#wVal").value });
  save(); toast("体重已记录"); e.target.reset(); $("#wDate").value = todayStr(); renderWeights(); renderDashboard();
});

function renderGoals() {
  const box = $("#goalList");
  if (!S.goals.length) { box.innerHTML = `<div class="empty">设定一个目标，比如「3个月减脂 5kg」。</div>`; return; }
  box.innerHTML = S.goals.map(g => {
    const pct = g.target ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
    const dl = g.deadline ? ` · 截止 ${g.deadline}` : "";
    return `<div class="goal">
      <div class="g-top"><div class="g-title">${esc(g.title)}</div>
        <button class="del" data-del-g="${g.id}">✕</button></div>
      <div class="g-track"><div class="g-fill" style="width:${pct}%"></div></div>
      <div class="g-meta">进度 ${g.current}/${g.target} (${pct}%)${dl}</div>
    </div>`;
  }).join("");
  $$("[data-del-g]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.goals, b.dataset.delG); save(); renderGoals(); renderDashboard();
  }));
}
$("#btnAddGoal").addEventListener("click", () => { $("#goalModalTitle").textContent = "新目标"; $("#goalForm").reset(); openModal("#goalModal"); });
$("#goalForm").addEventListener("submit", e => {
  e.preventDefault();
  S.goals.push({ id: uid(), updatedAt: Date.now(), title: $("#gTitle").value, type: $("#gType").value, target: +$("#gTarget").value, current: +$("#gCurrent").value || 0, deadline: $("#gDeadline").value });
  save(); toast("目标已保存"); closeModal("#goalModal"); renderGoals(); renderDashboard();
});

function renderReminds() {
  const box = $("#remindList");
  if (!S.reminds.length) { box.innerHTML = `<div class="empty">添加提醒事项，如「今晚睡前拉伸」。</div>`; return; }
  box.innerHTML = S.reminds.map(r => `<div class="list-row"><div class="lr-main">${esc(r.text)}</div>
    <button class="del" data-del-r="${r.id}">✕</button></div>`).join("");
  $$("[data-del-r]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.reminds, b.dataset.delR); save(); renderReminds();
  }));
}
$("#btnAddRemind").addEventListener("click", () => {
  const text = prompt("提醒内容："); if (!text) return;
  S.reminds.push({ id: uid(), updatedAt: Date.now(), text }); save(); renderReminds();
});

/* ============================================================
   顶栏 / 弹窗 / 其它
   ============================================================ */
function refreshChips() {
  if (S.profile) {
    $("#chipBmi").textContent = "BMI " + calcBMI(S.profile.weight, S.profile.height).toFixed(1);
    $("#chipTdee").textContent = "TDEE " + Math.round(calcTDEE(S.profile)) + " kcal";
  } else { $("#chipBmi").textContent = "BMI --"; $("#chipTdee").textContent = "TDEE --"; }
}
function openModal(sel) { $(sel).classList.add("show"); }
function closeModal(sel) { $(sel).classList.remove("show"); }
$$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest(".modal").classList.remove("show")));
$$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.remove("show"); }));
$("#btnProfile").addEventListener("click", () => openModal("#profileModal"));

$("#btnExport").addEventListener("click", exportAll);
$("#btnReset").addEventListener("click", () => {
  if (confirm("确定清空所有本地数据？此操作不可恢复（建议先导出备份）。")) {
    localStorage.removeItem(KEY); S = load(); boot(); toast("已清空");
  }
});

/* ============================================================
   上次记录（追踪某项上次做的时间 + 间隔提醒）
   ============================================================ */
function relTime(ts) {
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 1) return "刚刚"; if (h < 1) return m + " 分钟前";
  if (d < 1) return h + " 小时前"; if (d < 30) return d + " 天前";
  return Math.floor(d / 30) + " 个月前";
}
function renderTrackers() {
  const box = $("#trackList");
  if (!S.trackers.length) { box.innerHTML = `<div class="empty">添加一个追踪项，比如「吃维生素」「拖地」，随时记一次看间隔。</div>`; return; }
  box.innerHTML = S.trackers.map(t => {
    const last = t.logs.length ? t.logs[t.logs.length - 1] : null;
    let meta = last ? `上次：${new Date(last).toLocaleString("zh-CN")} · ${relTime(last)}` : "尚未记录";
    let tag = "";
    if (t.interval && last) {
      const days = (Date.now() - new Date(last).getTime()) / 864e5;
      if (days > t.interval) tag = `<span class="tag-over">已超期 ${Math.floor(days - t.interval)} 天</span>`;
      else if (days > t.interval * 0.8) tag = `<span class="tag-warn">快到 ${t.interval} 天</span>`;
      else tag = `<span class="tag-ok">正常</span>`;
    }
    return `<div class="track-row">
      <div class="tr-left"><div>
        <div class="tr-name">${esc(t.name)} ${tag}</div>
        <div class="tr-meta">${meta}${t.interval ? " · 间隔 " + t.interval + " 天" : ""}</div>
      </div></div>
      <div class="tr-actions">
        <input type="date" class="mini" id="trackDate-${t.id}" value="${todayStr()}" max="${todayStr()}">
        <button class="btn primary sm" data-log-date="${t.id}">指定日记一次</button>
        <button class="btn primary sm" data-log="${t.id}">记一次</button>
        ${t.logs.length ? `<button class="btn ghost sm" data-cancel="${t.id}">取消上次</button>` : ""}
        <button class="del" data-del-t="${t.id}">✕</button>
      </div>
    </div>`;
  }).join("");
  $$("[data-log]", box).forEach(b => b.addEventListener("click", () => {
    const t = S.trackers.find(x => x.id === b.dataset.log); t.logs.push(Date.now()); t.updatedAt = Date.now(); save(); renderTrackers();
  }));
  $$("[data-log-date]", box).forEach(b => b.addEventListener("click", () => {
    const t = S.trackers.find(x => x.id === b.dataset.logDate);
    const dateVal = $(`#trackDate-${t.id}`).value;
    if (!dateVal) { toast("请先选择日期"); return; }
    const now = new Date();
    const ts = new Date(`${dateVal}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`).getTime();
    t.logs.push(ts); t.updatedAt = Date.now(); save(); renderTrackers();
  }));
  $$("[data-cancel]", box).forEach(b => b.addEventListener("click", () => {
    const t = S.trackers.find(x => x.id === b.dataset.cancel);
    if (!t.logs.length) return;
    const removed = t.logs.pop();
    t.updatedAt = Date.now();
    save(); toast(`已取消 ${new Date(removed).toLocaleString("zh-CN")} 的记录`); renderTrackers();
  }));
  $$("[data-del-t]", box).forEach(b => b.addEventListener("click", () => {
    delRec(S.trackers, b.dataset.delT); save(); renderTrackers();
  }));
}
$("#trackForm").addEventListener("submit", e => {
  e.preventDefault();
  const iv = $("#trackInterval").value ? +$("#trackInterval").value : null;
  S.trackers.push({ id: uid(), updatedAt: Date.now(), name: $("#trackName").value, interval: iv, logs: [] });
  save(); toast("已添加"); e.target.reset(); renderTrackers();
});

/* ============================================================
   英语学习
   ============================================================ */
const DAILY = [
  ["The early bird catches the worm.", "早起的鸟儿有虫吃。"],
  ["Practice makes perfect.", "熟能生巧。"],
  ["Where there is a will, there is a way.", "有志者事竟成。"],
  ["Better late than never.", "迟做总比不做好。"],
  ["Actions speak louder than words.", "行动胜于言辞。"],
  ["A journey of a thousand miles begins with a single step.", "千里之行始于足下。"],
  ["Honesty is the best policy.", "诚实为上策。"],
  ["Knowledge is power.", "知识就是力量。"],
  ["Time is money.", "时间就是金钱。"],
  ["Health is wealth.", "健康就是财富。"],
  ["Don't put off until tomorrow what you can do today.", "今日事今日毕。"],
  ["When in Rome, do as the Romans do.", "入乡随俗。"],
];
function renderEnglish() {
  const dayIdx = Math.floor((Date.now() / 864e5)) % DAILY.length;
  $("#dailySentence").innerHTML = `<div class="d-en">${esc(DAILY[dayIdx][0])}</div><div class="d-zh">${esc(DAILY[dayIdx][1])}</div>`;
  const box = $("#wordList");
  if (!S.english.length) { box.innerHTML = `<div class="empty">添加生词开始积累。</div>`; return; }
  box.innerHTML = [...S.english].reverse().map(w => `<div class="list-row">
    <div><div class="lr-main">${esc(w.en)}</div><div class="lr-sub">${esc(w.zh)}</div></div>
    <button class="del" data-del-wd="${w.id}">✕</button></div>`).join("");
    $$("[data-del-wd]", box).forEach(b => b.addEventListener("click", () => {
      delRec(S.english, b.dataset.delWd); save(); renderEnglish();
    }));
  renderWord1800();
  }
$("#wordForm").addEventListener("submit", e => {
  e.preventDefault();
  S.english.push({ id: uid(), updatedAt: Date.now(), en: $("#wEn").value.trim(), zh: $("#wZh").value.trim(), box: 0 });
  save(); toast("已加入生词本"); e.target.reset(); renderEnglish();
});
let studyQ = [], studyI = 0;
$("#btnStudy").addEventListener("click", () => {
  if (!S.english.length) { $("#studyArea").innerHTML = `<div class="empty">生词本是空的。</div>`; return; }
  studyQ = [...S.english].sort(() => Math.random() - 0.5); studyI = 0; showStudy();
});
function showStudy() {
  if (studyI >= studyQ.length) { $("#studyArea").innerHTML = `<div class="empty">本轮背完啦 🎉 共 ${studyQ.length} 个词。</div>`; return; }
  const w = studyQ[studyI];
  $("#studyArea").innerHTML = `<div class="study-card">
    <div class="sc-en">${esc(w.en)}</div>
    <div class="sc-zh" id="scZh" style="display:none">${esc(w.zh)}</div>
    <div class="study-actions">
      <button class="btn" id="scShow">显示释义</button>
      <button class="btn primary" id="scKnow" style="display:none">认识</button>
      <button class="btn" id="scUnk" style="display:none">不认识</button>
    </div>
  </div>`;
  $("#scShow").onclick = () => { $("#scZh").style.display = "block"; $("#scKnow").style.display = ""; $("#scUnk").style.display = ""; $("#scShow").style.display = "none"; };
  $("#scKnow").onclick = () => { nextStudy(); };
  $("#scUnk").onclick = () => { w.box = (w.box || 0) + 1; save(); nextStudy(); };
}
function nextStudy() { studyI++; showStudy(); }

/* ============ 1800 高频单词（基于 PDF 词库，类背单词软件） ============ */
function w18EnsureDay() {
  const t = todayStr();
  if (S.word1800.lastDay !== t) { S.word1800.lastDay = t; S.word1800.newStudiedToday = 0; save(); }
}
function w18Stats() {
  const cards = S.word1800.cards, total = (window.WORDS1800 || []).length;
  let learned = 0, mastered = 0, due = 0; const t = todayStr();
  Object.keys(cards).forEach(k => { const c = cards[k]; if (!c) return; if (c.reps > 0) learned++; if ((c.box || 0) >= 4) mastered++; if (c.due && c.due <= t) due++; });
  return { total, learned, mastered, due };
}
function renderWord1800() {
  const box = $("#w18Area"); if (!box) return;
  const st = w18Stats();
  const prog = $("#w18Progress"); if (prog) prog.textContent = st.learned + "/" + st.total;
  const stat = $("#w18Stat"); if (stat) stat.innerHTML =
    `<span class="w18-chip">已学 <b>${st.learned}</b></span>` +
    `<span class="w18-chip">掌握 <b>${st.mastered}</b></span>` +
    `<span class="w18-chip">今日到期 <b>${st.due}</b></span>`;
  w18Browse();
}
function w18Browse() {
  const area = $("#w18Browse"); if (!area) return;
  const lv = $("#w18Level") ? $("#w18Level").value : "all";
  const kw = ($("#w18Search") ? $("#w18Search").value : "").trim().toLowerCase();
  const all = window.WORDS1800 || [];
  const list = all.map((w, i) => ({ w, i })).filter(o =>
    (lv === "all" || o.w.lv === lv) && (!kw || o.w.en.toLowerCase().includes(kw) || o.w.zh.toLowerCase().includes(kw)));
  if (!list.length) { area.innerHTML = `<div class="empty">没有匹配的单词。</div>`; return; }
  area.innerHTML = list.slice(0, 300).map(o => `<div class="w18-row">
      <div class="w18-r-main"><div class="w18-r-en">${esc(o.w.en)} <span class="w18-r-ph">[${esc(o.w.ph)}]</span></div><div class="w18-r-zh">${esc(o.w.zh)}</div></div>
      <button class="w18-spk" data-spk="${esc(o.w.en)}">🔊</button>
    </div>`).join("") + (list.length > 300 ? `<div class="hint">仅显示前 300 条，请用搜索缩小范围。</div>` : "");
  area.querySelectorAll("[data-spk]").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); speak(b.dataset.spk, "en-US"); }));
}
let w18q = [], w18i = 0, w18Retries = {};
const W18IVAL = [1, 2, 4, 7, 15, 30];
function addDaysStr(base, n) { const d = new Date(base + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function w18BuildQueue(reviewOnly) {
  const t = todayStr(), cards = S.word1800.cards, all = window.WORDS1800 || [];
  const review = [], fresh = [];
  all.forEach((w, i) => { const c = cards[i]; if (c && c.due && c.due <= t) review.push(i); else if (!c) fresh.push(i); });
  if (reviewOnly) return review;
  const NEW = 20;
  return review.concat(fresh.slice(0, NEW)).slice(0, 80);
}
function w18Start(reviewOnly) {
  w18EnsureDay();
  w18q = w18BuildQueue(reviewOnly); w18i = 0; w18Retries = {};
  const area = $("#w18CardArea");
  if (!w18q.length) { area.innerHTML = `<div class="empty">🎉 今日没有需要复习的词啦，去词库看看吧。</div>`; return; }
  w18Card();
}
function w18Card() {
  const area = $("#w18CardArea");
  if (w18i >= w18q.length) { area.innerHTML = `<div class="empty">🎉 本轮完成！共 ${w18q.length} 个词，明天继续～</div>`; return; }
  const idx = w18q[w18i], w = WORDS1800[idx];
  area.innerHTML = `<div class="w18-flash">
    <div class="w18-prog">${w18i + 1}/${w18q.length} · ${esc(w.lv)}级</div>
    <div class="w18-word">${esc(w.en)} <button class="w18-spk" id="w18SpkEn">🔊</button></div>
    <div class="w18-ph">[${esc(w.ph)}]</div>
    <div class="w18-zh" id="w18Zh" style="display:none">${esc(w.zh)} <button class="w18-spk" id="w18SpkZh">🔊</button></div>
    <div class="w18-btns" id="w18Btns">
      <button class="btn primary" id="w18Know">认识</button>
      <button class="btn" id="w18Show">显示释义</button>
      <button class="btn warn" id="w18Unk">不认识</button>
    </div>
    <button class="w18-exit" id="w18Exit">退出学习</button>
  </div>`;
  $("#w18SpkEn").onclick = () => speak(w.en, "en-US");
  $("#w18SpkZh").onclick = () => speak(w.zh, "zh-CN");
  $("#w18Show").onclick = () => { $("#w18Zh").style.display = "block"; };
  const revealThen = (grade) => {
    const zh = $("#w18Zh"); if (zh) zh.style.display = "block";
    const btns = $("#w18Btns"); if (!btns) return;
    btns.innerHTML = `<button class="btn primary" id="w18Next" style="flex:1">下一步 →</button>`;
    const nxt = $("#w18Next"); if (nxt) nxt.onclick = () => w18Answer(idx, grade);
  };
  $("#w18Know").onclick = () => revealThen(2);
  $("#w18Unk").onclick = () => revealThen(0);
  $("#w18Exit").onclick = () => { area.innerHTML = ""; };
}
function w18Answer(idx, grade) {
  const t = todayStr(), cards = S.word1800.cards;
  const wasNew = !cards[idx];
  let c = cards[idx] || { box: 0, due: t, reps: 0 };
  let retry = false;
  if (grade === 2) {
    c.box = Math.min((c.box || 0) + 1, 5);
  } else {
    c.box = 0;
    retry = true;
  }
  c.reps = (c.reps || 0) + 1;
  c.due = addDaysStr(t, grade === 2 ? W18IVAL[Math.min(c.box, W18IVAL.length - 1)] : 0);
  cards[idx] = c;
  if (wasNew) S.word1800.newStudiedToday = (S.word1800.newStudiedToday || 0) + 1;
  save();
  if (retry) {
    const r = (w18Retries[idx] || 0) + 1;
    w18Retries[idx] = r;
    if (r <= 2 && w18i + 2 < w18q.length) {
      w18q.splice(w18i + 2, 0, idx);
    }
  }
  w18i++;
  w18Card();
}
/* 语音朗读：预取 voices，规避安卓/iOS 静默失败 */
let _spkVoices = [];
function _spkLoadVoices() {
  try { _spkVoices = ("speechSynthesis" in window) ? (speechSynthesis.getVoices() || []) : []; }
  catch (e) { _spkVoices = []; }
}
function _spkPick(lang) {
  if (!_spkVoices.length) return null;
  const pref = (lang || "en-US").toLowerCase();
  let v = _spkVoices.find(x => x.lang && x.lang.toLowerCase() === pref);
  if (v) return v;
  const base = pref.split("-")[0];
  return _spkVoices.find(x => x.lang && x.lang.toLowerCase().startsWith(base)) || null;
}
if ("speechSynthesis" in window) {
  _spkLoadVoices();
  speechSynthesis.onvoiceschanged = _spkLoadVoices;
}

function speak(text, lang) {
  text = (text || "").trim();
  if (!text) return;
  if (!("speechSynthesis" in window)) { toast("当前浏览器不支持语音朗读，建议改用 Chrome 打开"); return; }
  try {
    const fire = () => {
      try {
        if (speechSynthesis.speaking) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang || "en-US"; u.rate = 0.9;
        const v = _spkPick(u.lang);
        if (v) u.voice = v;
        u.onerror = (e) => {
          const isZh = (lang || "en-US") !== "en-US";
          if (isZh && !v) toast("该设备可能缺少中文语音包，已用英文朗读");
          else toast("语音播放失败：" + ((e && e.error) || "未知"));
        };
        // iOS / 安卓：cancel 后紧接着 speak 可能被吞掉，延迟一帧再播放
        setTimeout(() => { try { speechSynthesis.speak(u); } catch (e2) { toast("语音播放异常"); } }, 60);
      } catch (e) { toast("语音播放异常"); }
    };
    // voices 未就绪时等待异步加载，避免静默失败
    if (!_spkVoices.length && typeof speechSynthesis.getVoices === "function") {
      _spkLoadVoices();
      if (!_spkVoices.length) {
        let waited = false;
        const once = () => { if (waited) return; waited = true; _spkLoadVoices(); fire(); };
        speechSynthesis.onvoiceschanged = once;
        speechSynthesis.getVoices(); // 触发异步加载
        setTimeout(() => { if (!_spkVoices.length) _spkLoadVoices(); fire(); }, 120); // 兜底
        return;
      }
    }
    fire();
  } catch (e) {}
}
$("#w18Study").addEventListener("click", () => w18Start(false));
$("#w18ReviewMode").addEventListener("click", () => w18Start(true));
if ($("#w18Level")) $("#w18Level").addEventListener("change", w18Browse);
if ($("#w18Search")) $("#w18Search").addEventListener("input", w18Browse);

/* ============================================================
   食物入库（升级版：保质期互斥、编辑、消耗、预警、筛选）
   ============================================================ */

/* 兼容旧数据：把旧 pantry 记录迁移到新结构 */
function migratePantry() {
  S.pantry.forEach(it => {
    if (!it.logs) it.logs = [];
    if (typeof it.qtyNum !== "number") {
      const m = String(it.qty || "").match(/^\s*(\d+(?:\.\d+)?)\s*(.*)$/);
      it.qtyNum = m ? parseFloat(m[1]) : 0;
      it.qtyUnit = m ? m[2].trim() || "份" : "份";
    }
    if (!it.qty) it.qty = (it.qtyNum || 0) + (it.qtyUnit || "");
    if (!it.consumed) it.consumed = 0;
    if (!it.buyDate && it.buy) it.buyDate = it.buy;
    if (!it.expDate && it.exp) it.expDate = it.exp;
    if (!it.storage) it.storage = "";
    if (!it.category) it.category = "";
    if (!it.createdAt) it.createdAt = it.updatedAt || Date.now();
    // 只有旧数据且无日志时补一条 create 日志
    if (!it.logs.length && it.createdAt) {
      it.logs.push({ action: "create", time: it.createdAt, qty: it.qtyNum || 0, note: "入库（旧数据迁移）" });
    }
  });
}

function pantryExpiry(it) {
  if (it.expDate) return it.expDate;
  if (it.shelfDays && it.buyDate) {
    const d = new Date(it.buyDate); d.setDate(d.getDate() + +it.shelfDays);
    return d.toISOString().slice(0, 10);
  }
  if (it.exp && it.buy) { // 旧数据兜底
    const d = new Date(it.buy); d.setDate(d.getDate() + +it.exp);
    return d.toISOString().slice(0, 10);
  }
  return null;
}
function pantryRemainDays(it) {
  const exp = pantryExpiry(it);
  if (!exp) return null;
  return Math.round((new Date(exp) - new Date(todayStr())) / 864e5);
}
function pantryStatus(it) {
  const r = pantryRemainDays(it);
  if (r === null) return { key: "none", label: "未设到期", cls: "" };
  if (r < 0) return { key: "over", label: "已过期", cls: "tag-over" };
  if (r <= 3) return { key: "danger", label: "临期", cls: "tag-danger" };
  if (r <= 15) return { key: "warn", label: "注意", cls: "tag-warn" };
  return { key: "ok", label: "正常", cls: "tag-ok" };
}
function pantryStock(it) {
  return Math.max(0, +(it.qtyNum || 0) - +(it.consumed || 0));
}
function pantryStockText(it) {
  const s = pantryStock(it);
  return (s % 1 === 0 ? s : s.toFixed(2)) + (it.qtyUnit || "");
}

/* 表单互斥：单选切换后自动反算 */
function setPantryMode(mode) {
  const shelfLabel = $("#pShelfLabel");
  const expLabel = $("#pExpLabel");
  const shelfIn = $("#pShelf");
  const expIn = $("#pExp");
  if (mode === "date") {
    shelfLabel.classList.add("disabled");
    expLabel.classList.remove("disabled");
    shelfIn.disabled = true;
    expIn.disabled = false;
    // 若已有保质期天数，自动反算到期日
    if (shelfIn.value && $("#pBuy").value) {
      const d = new Date($("#pBuy").value);
      d.setDate(d.getDate() + parseInt(shelfIn.value, 10));
      expIn.value = d.toISOString().slice(0, 10);
    }
  } else {
    shelfLabel.classList.remove("disabled");
    expLabel.classList.add("disabled");
    shelfIn.disabled = false;
    expIn.disabled = true;
    // 若已有到期日，自动反算天数
    if (expIn.value && $("#pBuy").value) {
      const a = new Date($("#pBuy").value), b = new Date(expIn.value);
      const days = Math.round((b - a) / 864e5);
      if (days > 0) shelfIn.value = days;
    }
  }
}
function bindPantryMode() {
  $("#pModeShelf").addEventListener("change", () => setPantryMode("shelf"));
  $("#pModeDate").addEventListener("change", () => setPantryMode("date"));
  $("#pBuy").addEventListener("change", () => {
    const mode = $("#pModeDate").checked ? "date" : "shelf";
    // 已有另一项时自动反算
    if (mode === "shelf" && $("#pExp").value) setPantryMode("date");
    else if (mode === "date" && $("#pShelf").value) setPantryMode("shelf");
    else setPantryMode(mode);
  });
  $("#pShelf").addEventListener("input", () => {
    if ($("#pModeShelf").checked && $("#pBuy").value && $("#pShelf").value) {
      const d = new Date($("#pBuy").value); d.setDate(d.getDate() + parseInt($("#pShelf").value, 10));
      $("#pExp").value = d.toISOString().slice(0, 10);
    }
  });
  $("#pExp").addEventListener("input", () => {
    if ($("#pModeDate").checked && $("#pBuy").value && $("#pExp").value) {
      const days = Math.round((new Date($("#pExp").value) - new Date($("#pBuy").value)) / 864e5);
      if (days > 0) $("#pShelf").value = days;
    }
  });
}
function showPantryError(msg) {
  const el = $("#pError");
  if (msg) { el.textContent = msg; el.style.display = "block"; }
  else el.style.display = "none";
}

/* 校验 */
function validatePantryForm(allowExpired) {
  showPantryError("");
  const name = $("#pName").value.trim();
  if (!name) return "请输入食品名称";
  const qtyNum = parseFloat($("#pQtyNum").value);
  if (isNaN(qtyNum) || qtyNum <= 0) return "数量必须大于 0";
  const unit = $("#pQtyUnit").value.trim();
  if (!unit) return "请选择或输入单位";
  const buy = $("#pBuy").value;
  if (!buy) return "请选择购买日期";
  const mode = $("#pModeDate").checked ? "date" : "shelf";
  let expDate = null, shelfDays = null;
  if (mode === "shelf") {
    const s = parseInt($("#pShelf").value, 10);
    if (isNaN(s) || s <= 0) return "保质期天数必须为正整数";
    shelfDays = s;
    const d = new Date(buy); d.setDate(d.getDate() + s);
    expDate = d.toISOString().slice(0, 10);
  } else {
    expDate = $("#pExp").value;
    if (!expDate) return "请选择到期日期";
    const d1 = new Date(buy), d2 = new Date(expDate);
    if (d2 < d1) return "购买日期不能晚于到期日期";
    shelfDays = Math.round((d2 - d1) / 864e5);
  }
  if (new Date(expDate) < new Date(todayStr()) && !allowExpired) {
    return "EXPIRED_CONFIRM";
  }
  return { name, qtyNum, unit, buy, expDate, shelfDays, storage: $("#pStorage").value.trim(), category: $("#pCategory").value.trim(), note: $("#pNote").value.trim() };
}

/* 收集/填充表单 */
function resetPantryForm() {
  $("#pantryForm").reset();
  $("#pId").value = "";
  $("#pBuy").value = todayStr();
  $("#pModeShelf").checked = true;
  $("#pSubmit").textContent = "入库";
  $("#pCancelEdit").style.display = "none";
  setPantryMode("shelf");
  showPantryError("");
}
function fillPantryForm(it) {
  $("#pId").value = it.id;
  $("#pName").value = it.name || "";
  $("#pQtyNum").value = it.qtyNum || "";
  $("#pQtyUnit").value = it.qtyUnit || "";
  $("#pBuy").value = it.buyDate || "";
  $("#pStorage").value = it.storage || "";
  $("#pCategory").value = it.category || "";
  $("#pNote").value = it.note || "";
  if (it.mode === "date") {
    $("#pModeDate").checked = true;
    $("#pExp").value = it.expDate || "";
    $("#pShelf").value = it.shelfDays || "";
  } else {
    $("#pModeShelf").checked = true;
    $("#pShelf").value = it.shelfDays || "";
    $("#pExp").value = it.expDate || "";
  }
  setPantryMode(it.mode === "date" ? "date" : "shelf");
  $("#pSubmit").textContent = "保存修改";
  $("#pCancelEdit").style.display = "inline-flex";
  showPantryError("");
  const formEl = $("#pantryForm");
  if (formEl && formEl.scrollIntoView) formEl.scrollIntoView({ behavior: "smooth" });
}

/* 编辑 */
function editPantry(id) {
  const it = S.pantry.find(x => x.id === id);
  if (!it) return;
  fillPantryForm(it);
}

/* 消耗出库 */
let _consumeTarget = null;
function openConsume(id) {
  const it = S.pantry.find(x => x.id === id);
  if (!it) return;
  _consumeTarget = it;
  const stock = pantryStock(it);
  $("#cInfo").textContent = `${esc(it.name)} 当前库存：${pantryStockText(it)}`;
  $("#cQty").value = stock % 1 === 0 ? stock : stock.toFixed(2);
  $("#cQty").max = stock;
  $("#cNote").value = "";
  $("#cError").style.display = "none";
  openModal("#consumeModal");
}
function doConsume(all) {
  if (!_consumeTarget) return;
  const it = _consumeTarget;
  const stock = pantryStock(it);
  let qty = all ? stock : parseFloat($("#cQty").value);
  if (isNaN(qty) || qty <= 0) { $("#cError").textContent = "消耗数量必须大于 0"; $("#cError").style.display = "block"; return; }
  if (qty > stock) { $("#cError").textContent = "消耗数量不能超过当前库存 " + pantryStockText(it); $("#cError").style.display = "block"; return; }
  it.consumed = +(it.consumed || 0) + qty;
  it.logs.push({ action: "consume", time: Date.now(), qty: qty, note: $("#cNote").value.trim() || (all ? "全部消耗" : "部分消耗") });
  it.updatedAt = Date.now();
  const remain = pantryStock(it);
  save(); renderPantry(); closeModal("#consumeModal");
  if (remain <= 0) {
    toast(`"${it.name}" 已用完，自动从库存移除`);
    setTimeout(() => { delRec(S.pantry, it.id); save(); renderPantry(); }, 400);
  } else {
    toast(`已消耗 ${qty}${it.qtyUnit}，剩余 ${pantryStockText(it)}`);
  }
}

/* 入库 / 保存 */
function submitPantry(e) {
  e.preventDefault();
  const v = validatePantryForm();
  if (v === "EXPIRED_CONFIRM") {
    if (!confirm("到期日期早于今天，确认要入库已经过期的食材吗？")) return;
    return submitPantryCore(true);
  }
  if (typeof v === "string") { showPantryError(v); return; }
  submitPantryCore(false);
}
function submitPantryCore(allowExpired) {
  const v = validatePantryForm(allowExpired);
  if (typeof v === "string") { showPantryError(v); return; }
  const editId = $("#pId").value;
  const now = Date.now();
  if (editId) {
    const it = S.pantry.find(x => x.id === editId);
    if (!it) return;
    const oldName = it.name;
    it.name = v.name; it.qtyNum = v.qtyNum; it.qtyUnit = v.unit;
    it.qty = v.qtyNum + v.unit;
    it.buyDate = v.buy; it.expDate = v.expDate; it.shelfDays = v.shelfDays; it.mode = $("#pModeDate").checked ? "date" : "shelf";
    it.storage = v.storage; it.category = v.category; it.note = v.note;
    it.updatedAt = now;
    it.logs.push({ action: "edit", time: now, qty: v.qtyNum, note: "编辑" });
    toast(`"${oldName}" 已更新`);
  } else {
    const rec = {
      id: uid(), createdAt: now, updatedAt: now,
      name: v.name, qtyNum: v.qtyNum, qtyUnit: v.unit, qty: v.qtyNum + v.unit,
      buyDate: v.buy, expDate: v.expDate, shelfDays: v.shelfDays, mode: $("#pModeDate").checked ? "date" : "shelf",
      storage: v.storage, category: v.category, note: v.note,
      consumed: 0,
      logs: [{ action: "create", time: now, qty: v.qtyNum, note: "入库" }]
    };
    S.pantry.push(rec);
    toast(`"${rec.name}" 已入库`);
  }
  save(); resetPantryForm(); renderPantry();
}

/* 删除 */
function deletePantry(id) {
  const it = S.pantry.find(x => x.id === id);
  if (!it || !confirm(`确定删除 "${it.name}" 吗？`)) return;
  delRec(S.pantry, id);
  save(); renderPantry(); toast(`"${it.name}" 已删除`);
}

/* 筛选/排序 */
function getPantryFilterOptions() {
  const storages = new Set(S.pantry.map(x => x.storage).filter(Boolean));
  const categories = new Set(S.pantry.map(x => x.category).filter(Boolean));
  return { storages, categories };
}
function applyPantryFilters() {
  const keyword = $("#pSearch").value.trim().toLowerCase();
  const sort = $("#pSort").value;
  const storage = $("#pFilterStorage").value;
  const category = $("#pFilterCategory").value;
  const status = $("#pFilterStatus").value;
  let list = S.pantry.slice();
  if (keyword) list = list.filter(x => (x.name || "").toLowerCase().includes(keyword));
  if (storage) list = list.filter(x => x.storage === storage);
  if (category) list = list.filter(x => x.category === category);
  if (status) list = list.filter(x => pantryStatus(x).key === status);
  list.sort((a, b) => {
    if (sort === "exp-asc") {
      const ra = pantryRemainDays(a) === null ? 1e9 : pantryRemainDays(a);
      const rb = pantryRemainDays(b) === null ? 1e9 : pantryRemainDays(b);
      return ra - rb;
    }
    if (sort === "add-desc") return (b.createdAt || 0) - (a.createdAt || 0);
    return (a.name || "").localeCompare(b.name || "");
  });
  return list;
}

/* 统计看板 */
function renderPantryStats() {
  const box = $("#pantryStats");
  const total = S.pantry.length;
  const over = S.pantry.filter(x => pantryStatus(x).key === "over").length;
  const danger = S.pantry.filter(x => pantryStatus(x).key === "danger").length;
  const warn = S.pantry.filter(x => pantryStatus(x).key === "warn").length;
  const ok = S.pantry.filter(x => pantryStatus(x).key === "ok").length;
  box.innerHTML = `
    <div class="card-head"><h3>库存概览</h3></div>
    <div class="pantry-kpi">
      <div class="pk-item"><div class="pk-v">${total}</div><div class="pk-l">总库存</div></div>
      <div class="pk-item ok"><div class="pk-v">${ok}</div><div class="pk-l">正常</div></div>
      <div class="pk-item warn"><div class="pk-v">${warn}</div><div class="pk-l">注意</div></div>
      <div class="pk-item danger"><div class="pk-v">${danger}</div><div class="pk-l">临期</div></div>
      <div class="pk-item over"><div class="pk-v">${over}</div><div class="pk-l">已过期</div></div>
    </div>`;
}

function renderPantry() {
  migratePantry(); // 每次渲染前确保兼容
  renderPantryStats();
  // 刷新筛选下拉选项
  const { storages, categories } = getPantryFilterOptions();
  const curStorage = $("#pFilterStorage").value;
  const curCategory = $("#pFilterCategory").value;
  $("#pFilterStorage").innerHTML = '<option value="">全部位置</option>' + [...storages].map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("#pFilterCategory").innerHTML = '<option value="">全部分类</option>' + [...categories].map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join("");
  $("#pFilterStorage").value = curStorage;
  $("#pFilterCategory").value = curCategory;

  const box = $("#pantryList");
  const list = applyPantryFilters();
  if (!list.length) {
    box.innerHTML = `<div class="empty">没有匹配的库存记录。</div>`;
    return;
  }
  box.innerHTML = list.map(it => {
    const st = pantryStatus(it);
    const exp = pantryExpiry(it);
    const remain = pantryRemainDays(it);
    const remainText = remain === null ? "" : (remain < 0 ? `已过期 ${Math.abs(remain)} 天` : `剩余 ${remain} 天`);
    return `<div class="pantry-row ${st.key}">
      <div class="pr-left">
        <div class="pr-name">${esc(it.name)} <span class="pr-tag ${st.cls}">${st.label}</span></div>
        <div class="pr-meta">
          <span>数量：${pantryStockText(it)}</span>
          <span>储存：${esc(it.storage || "—")}</span>
        </div>
        <div class="pr-meta">
          <span>到期：${exp || "—"}</span>
          <span class="${st.cls}">${remainText}</span>
          ${it.category ? `<span class="pr-cat">${esc(it.category)}</span>` : ""}
        </div>
        ${it.note ? `<div class="pr-note">${esc(it.note)}</div>` : ""}
      </div>
      <div class="pr-actions">
        <button class="btn sm" data-edit-p="${it.id}">编辑</button>
        <button class="btn sm" data-consume-p="${it.id}">消耗</button>
        <button class="del" data-del-p="${it.id}">✕</button>
      </div>
    </div>`;
  }).join("");
  $$("[data-edit-p]", box).forEach(b => b.addEventListener("click", () => editPantry(b.dataset.editP)));
  $$("[data-consume-p]", box).forEach(b => b.addEventListener("click", () => openConsume(b.dataset.consumeP)));
  $$("[data-del-p]", box).forEach(b => b.addEventListener("click", () => deletePantry(b.dataset.delP)));
}

/* 绑定 */
$("#pantryForm").addEventListener("submit", submitPantry);
$("#pCancelEdit").addEventListener("click", resetPantryForm);
$("#pSearch").addEventListener("input", renderPantry);
$("#pSort").addEventListener("change", renderPantry);
$("#pFilterStorage").addEventListener("change", renderPantry);
$("#pFilterCategory").addEventListener("change", renderPantry);
$("#pFilterStatus").addEventListener("change", renderPantry);
$("#btnConsumePart").addEventListener("click", () => doConsume(false));
$("#btnConsumeAll").addEventListener("click", () => doConsume(true));
$$('[data-close="#consumeModal"]').forEach(b => b.addEventListener("click", () => closeModal("#consumeModal")));
bindPantryMode();
$("#pBuy").value = todayStr();
setPantryMode("shelf");

// 把 pantry 测试/外部需要的函数挂到 window（不影响正常业务）
window.__pantry = { $, S, switchModule, setPantryMode, editPantry, openConsume, doConsume, pantryStatus, pantryStock, pantryExpiry, pantryRemainDays, deletePantry, renderPantry, validatePantryForm };

/* ============================================================
   图片去水印（纯 JS 本地处理）
   ============================================================ */
let _wmBusy = false;
function setWmStatus(t) { $("#wmStatus").textContent = t; }
// 纯 JS 扩散式修复：把被涂抹（白色）区域的像素用周围已知像素的均值逐步扩散填充，无需联网、无需外部引擎
// 在纯原图(baseCanvas) 上做修复，再刷新到显示画布。maskU8[i]=1 表示需要去除的区域。
function jsInpaint(maskU8, w, h) {
  const img = baseCtx.getImageData(0, 0, w, h);
  const data = img.data;
  const N = w * h;
  let curR = new Float32Array(N), curG = new Float32Array(N), curB = new Float32Array(N);
  let curK = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (maskU8[i]) { curK[i] = 0; }
    else { curK[i] = 1; curR[i] = data[i*4]; curG[i] = data[i*4+1]; curB[i] = data[i*4+2]; }
  }
  let nxtR = new Float32Array(N), nxtG = new Float32Array(N), nxtB = new Float32Array(N), nxtK = new Uint8Array(N);
  const passes = 120;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (curK[i]) { nxtR[i] = curR[i]; nxtG[i] = curG[i]; nxtB[i] = curB[i]; nxtK[i] = 1; continue; }
        let sr = 0, sg = 0, sb = 0, cnt = 0;
        // 8 邻域均值
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && curK[ny * w + nx]) {
              const j = ny * w + nx; sr += curR[j]; sg += curG[j]; sb += curB[j]; cnt++;
            }
          }
        }
        if (cnt > 0) { nxtR[i] = sr / cnt; nxtG[i] = sg / cnt; nxtB[i] = sb / cnt; nxtK[i] = 1; }
        else { nxtR[i] = curR[i]; nxtG[i] = curG[i]; nxtB[i] = curB[i]; nxtK[i] = 0; }
      }
    }
    let t;
    t = curR; curR = nxtR; nxtR = t;
    t = curG; curG = nxtG; nxtG = t;
    t = curB; curB = nxtB; nxtB = t;
    t = curK; curK = nxtK; nxtK = t;
  }
  for (let i = 0; i < N; i++) {
    if (!maskU8[i]) continue; // 只覆盖初始被涂抹（需修复）的像素
    data[i*4]   = Math.max(0, Math.min(255, Math.round(curR[i])));
    data[i*4+1] = Math.max(0, Math.min(255, Math.round(curG[i])));
    data[i*4+2] = Math.max(0, Math.min(255, Math.round(curB[i])));
    data[i*4+3] = 255;
  }
  baseCtx.putImageData(img, 0, 0);
  wmOverlay();
}
let wmLoaded = false, baseCanvas = document.createElement("canvas"), baseCtx = baseCanvas.getContext("2d"), maskCanvas = document.createElement("canvas"), mctx = maskCanvas.getContext("2d"), drawing = false, brushOn = true, lastX = 0, lastY = 0;
$("#wmFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const r = Math.min(1, 1000 / img.width);
    const w = Math.round(img.width * r), h = Math.round(img.height * r);
    $("#wmCanvas").width = w; $("#wmCanvas").height = h; maskCanvas.width = w; maskCanvas.height = h;
    mctx.fillStyle = "#000"; mctx.fillRect(0, 0, w, h);
    baseCanvas.width = w; baseCanvas.height = h; baseCtx.drawImage(img, 0, 0, w, h);
    $("#wmCanvas").getContext("2d").drawImage(img, 0, 0, w, h);
    wmLoaded = true; setWmStatus("图片已载入，在 watermark 区域涂抹后点「去除水印」。");
  };
  img.src = URL.createObjectURL(f);
});
function wmPos(e) {
  const rect = $("#wmCanvas").getBoundingClientRect();
  return [(e.clientX - rect.left) * $("#wmCanvas").width / rect.width, (e.clientY - rect.top) * $("#wmCanvas").height / rect.height];
}
function wmOverlay() {
  const ctx = $("#wmCanvas").getContext("2d");
  ctx.drawImage(baseCanvas, 0, 0);
  ctx.globalAlpha = 0.45; ctx.drawImage(maskCanvas, 0, 0); ctx.globalAlpha = 1;
}
function wmDraw(x, y) {
  mctx.strokeStyle = "#fff"; mctx.lineWidth = 18; mctx.lineCap = "round";
  mctx.beginPath(); mctx.moveTo(lastX, lastY); mctx.lineTo(x, y); mctx.stroke(); wmOverlay();
}
$("#wmCanvas").addEventListener("pointerdown", e => {
  if (!brushOn || !wmLoaded) return; drawing = true; [lastX, lastY] = wmPos(e); wmDraw(lastX, lastY); $("#wmCanvas").setPointerCapture(e.pointerId);
});
$("#wmCanvas").addEventListener("pointermove", e => { if (!drawing) return; const [x, y] = wmPos(e); wmDraw(x, y); });
$("#wmCanvas").addEventListener("pointerup", () => drawing = false);
$("#wmBrush").addEventListener("click", () => { brushOn = !brushOn; $("#wmBrush").textContent = "画笔：" + (brushOn ? "开" : "关"); });
  $("#wmClear").addEventListener("click", () => { if (!wmLoaded) return; mctx.fillStyle = "#000"; mctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height); wmOverlay(); });
$("#wmRemove").addEventListener("click", () => {
  if (!wmLoaded) { setWmStatus("请先上传图片。"); return; }
  if (_wmBusy) return;
  _wmBusy = true;
  setWmStatus("正在修复（纯本地处理，无需联网）…");
  setTimeout(() => {
    try {
      const w = baseCanvas.width, h = baseCanvas.height;
      const mdata = mctx.getImageData(0, 0, w, h).data;
      const maskU8 = new Uint8Array(w * h);
      let total = 0;
      for (let i = 0; i < w * h; i++) {
        // maskCanvas 初始全黑，用户用白色画笔涂抹标记需要去除的区域
        if (mdata[i*4] > 128 && mdata[i*4+1] > 128 && mdata[i*4+2] > 128) { maskU8[i] = 1; total++; }
      }
      if (total === 0) { setWmStatus("未检测到涂抹区域，请先用白色画笔标出水印位置。"); _wmBusy = false; return; }
      jsInpaint(maskU8, w, h); // 在纯原图上修复，结果已刷新到显示画布
      mctx.fillStyle = "#000"; mctx.fillRect(0, 0, w, h); // 清除涂抹标记
      wmOverlay();
      setWmStatus("去水印完成，可点「下载结果」。");
    } catch (err) { setWmStatus("处理出错：" + err.message); }
    _wmBusy = false;
  }, 30);
});
$("#wmDownload").addEventListener("click", () => {
  if (!wmLoaded) { setWmStatus("请先上传并处理图片。"); return; }
  const a = document.createElement("a"); a.href = $("#wmCanvas").toDataURL("image/png"); a.download = "watermark-removed.png"; a.click();
});

/* ============================================================
   备份与同步（导出/导入，本地优先）
   ============================================================ */
function exportAll() {
  const blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "fitdesk-backup-" + todayStr() + ".json"; a.click();
  localStorage.setItem("fitdesk:backupAt", new Date().toLocaleString("zh-CN"));
  $("#bkLast").innerHTML = `<div class="hint">上次备份：${localStorage.getItem("fitdesk:backupAt") || "—"}</div>`;
  toast("已导出备份");
}
$("#bkExport").addEventListener("click", exportAll);
$("#bkCopy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(S)); toast("备份文本已复制"); }
  catch { setBk("复制失败，可改用「下载完整备份」。"); }
});
function setBk(t) { $("#bkStatus").textContent = t; }
$("#bkImport").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => { try { restoreData(JSON.parse(rd.result)); } catch (err) { setBk("文件解析失败：" + err.message); } };
  rd.readAsText(f);
});
$("#bkPaste").addEventListener("click", () => {
  const t = prompt("粘贴此前复制的备份文本："); if (!t) return;
  try { restoreData(JSON.parse(t)); } catch (err) { setBk("解析失败：" + err.message); }
});
function restoreData(obj) {
  if (!confirm("恢复将覆盖本机当前数据，确定继续？")) return;
  // 仅恢复已知字段，避免脏数据
  const keys = ["profile", "exercises", "foods", "weights", "resources", "goals", "reminds", "checkins", "trackers", "english", "pantry", "fitLinks", "posturePlan", "antiMenu", "word1800"];
  keys.forEach(k => { if (k in obj) S[k] = obj[k]; });
  save(); boot(); toast("已恢复数据"); setBk("恢复成功。");
}

/* ---------- 云同步（GitHub 私有仓库，完全免费） ---------- */
function fillSyncForm() {
  if (!$("#syncOwner")) return;
  $("#syncOwner").value = S.sync.owner || "";
  if ($("#syncRepo")) $("#syncRepo").value = S.sync.repo || "fitdesk-sync";
  if ($("#syncToken")) $("#syncToken").value = S.sync.token || "";
  $("#syncPass").value = S.sync.pass || "";
  $("#syncAuto").checked = !!S.sync.auto;
  const la = S._syncAt ? new Date(S._syncAt).toLocaleString("zh-CN") : "尚未同步";
  setSyncStatus(S.sync.token && S.sync.owner ? ("GitHub已配置 · 上次：" + la) : "未配置，使用本机本地存储");
}
$("#syncSave").addEventListener("click", () => {
  S.sync = {
    owner: $("#syncOwner").value.trim(),
    repo: $("#syncRepo") ? ($("#syncRepo").value.trim() || "fitdesk-sync") : "fitdesk-sync",
    token: $("#syncToken") ? $("#syncToken").value.trim() : "",
    pass: $("#syncPass").value.trim(),
    auto: $("#syncAuto").checked
  };
  save(); fillSyncForm();
  if (S.sync.token && S.sync.owner && S.sync.repo) { syncNow(); toast("同步设置已保存"); }
  else { setSyncStatus("已保存（未启用同步）"); toast("同步设置已保存"); }
});
$("#syncNow").addEventListener("click", syncNow);
setInterval(() => { if (S.sync && S.sync.auto && S.sync.token && S.sync.owner && S.sync.repo) syncPull(); }, 15000);

/* ---------- 初始化 ---------- */
function boot() {
  try {
    const exDate = $("#exDate"); if (exDate) exDate.value = todayStr();
    const foodDate = $("#foodDate"); if (foodDate) foodDate.value = todayStr();
    const wDate = $("#wDate"); if (wDate) wDate.value = todayStr();
    renderProfileForm();
    if (S.profile) { const out = $("#calcOut"); const bmi = calcBMI(S.profile.weight, S.profile.height); const tdee = calcTDEE(S.profile); const cat = bmi < 18.5 ? "偏瘦" : bmi < 25 ? "正常" : bmi < 30 ? "偏重" : "肥胖";
      out.innerHTML = `<div class="co"><div class="t">BMI</div><div class="v">${bmi.toFixed(1)}</div><div class="s">${cat}</div></div><div class="co w"><div class="t">TDEE</div><div class="v">${Math.round(tdee)}</div><div class="s">kcal/天</div></div><div class="co l"><div class="t">维持</div><div class="v">${Math.round(tdee)}</div><div class="s">kcal/天</div></div>`; }
  } catch (e) { console.error("boot init 出错:", e); }
  const safe = (f) => { try { f(); } catch (e) { console.error("初始渲染出错:", e); } };
  safe(renderFitness); safe(renderNutrition); safe(renderResources); safe(renderWeights);
  safe(renderGoals); safe(renderReminds); safe(refreshChips); safe(renderTrackers);
  safe(renderEnglish); safe(renderPantry);
  try {
    const ba = localStorage.getItem("fitdesk:backupAt"); if (ba) $("#bkLast").innerHTML = `<div class="hint">上次备份：${ba}</div>`;
    fillSyncForm();
  } catch (e) { console.error("boot tail 出错:", e); }
}
boot();
