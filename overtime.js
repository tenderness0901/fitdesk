/* ============================================================
   加班 & 加班费台账 · overtime.js
   纯前端：localStorage 存储，零依赖
   功能：薪资设置 / 录入表单 / 台账列表 / 统计看板 / 补贴扣款 /
         工资实发对比 / 月份锁定 / 导出备份
   ============================================================ */
"use strict";

/* ---------------- 基础工具 ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 1900);
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function pad2(n) { return String(n).padStart(2, "0"); }
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ---------------- 存储 ---------------- */
const K_OT = "fitdesk:overtime:records";
const K_SAL = "fitdesk:overtime:salaries";
const K_SET = "fitdesk:overtime:settings";
const K_ADJ = "fitdesk:overtime:adjusts";
const K_LOCK = "fitdesk:overtime:lockedMonths";
function loadJSON(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { toast("保存失败：" + e.message); } }

/* 默认设置 */
const DEFAULT_SETTINGS = {
  baseSalary: 0,
  otBaseSalary: 0, // 0 表示与基本工资相同
  workDays: 21.75,
  dailyHours: 8,
  multWeekday: 1.5,
  multRestday: 2,
  multHoliday: 3,
  roundEnable: 0,
  minHours: 0.5,
  roundRule: "half",
  taxThreshold: 5000,
  socialInsurance: 0,
  housingFund: 0
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS, loadJSON(K_SET, {}));
let RECORDS = loadJSON(K_OT, []);
let SALARIES = loadJSON(K_SAL, []);
let ADJUSTS = loadJSON(K_ADJ, []);
let LOCKED = loadJSON(K_LOCK, []);

/* 编辑状态 */
let EDITING_ID = null;

/* 补贴/扣款字段列表 */
const ALLOWANCE_KEYS = ["mealAllowance", "trafficAllowance", "fullAttendance", "housingAllowance", "otherAllowance"];
const DEDUCTION_KEYS = ["socialInsurance", "housingFund", "estimatedTax", "otherDeduction"];
const ADJ_LABELS = {
  mealAllowance: "餐补", trafficAllowance: "交通补贴", fullAttendance: "全勤",
  housingAllowance: "住房补贴", otherAllowance: "其他补贴",
  socialInsurance: "社保个人", housingFund: "公积金个人",
  estimatedTax: "预估个税", otherDeduction: "其他扣款"
};
const ADJ_ID_MAP = {
  mealAllowance: "adjMeal", trafficAllowance: "adjTraffic", fullAttendance: "adjFull",
  housingAllowance: "adjHousingAllow", otherAllowance: "adjOtherAllow",
  socialInsurance: "adjSocial", housingFund: "adjFund",
  estimatedTax: "adjTax", otherDeduction: "adjOtherDeduc"
};

/* ---------------- 类型映射 ---------------- */
const TYPE_MAP = {
  weekday:  { label: "工作日延时", tag: "weekday",  mult: () => SETTINGS.multWeekday,  paid: true },
  restday:  { label: "休息日",     tag: "restday",  mult: () => SETTINGS.multRestday,  paid: true },
  holiday:  { label: "法定节假日", tag: "holiday",  mult: () => SETTINGS.multHoliday,  paid: true },
  compoff:  { label: "调休",       tag: "compoff",  mult: () => 0,                     paid: false },
  free:     { label: "无偿加班",   tag: "free",     mult: () => 0,                     paid: false }
};

/* ============================================================
   核心计算
   ============================================================ */
function otBase() { return SETTINGS.otBaseSalary > 0 ? SETTINGS.otBaseSalary : (SETTINGS.baseSalary || 0); }
function hourlyRate() {
  const base = otBase();
  if (!base || !SETTINGS.workDays || !SETTINGS.dailyHours) return 0;
  return base / SETTINGS.workDays / SETTINGS.dailyHours;
}

function applyRounding(hours) {
  if (!SETTINGS.roundEnable) return hours;
  if (hours < SETTINGS.minHours) return 0;
  switch (SETTINGS.roundRule) {
    case "up":   return Math.ceil(hours);
    case "down": return Math.floor(hours);
    case "half": return Math.round(hours * 2) / 2;
    default:     return hours;
  }
}

/* 计算单条加班费 */
function calcPay(type, hours, manualPay) {
  if (manualPay !== undefined && manualPay !== null && manualPay !== "") return parseFloat(manualPay) || 0;
  const t = TYPE_MAP[type];
  if (!t || !t.paid) return 0;
  const rate = hourlyRate();
  const rounded = applyRounding(hours);
  return Math.round(rate * t.mult() * rounded * 100) / 100;
}

/* 时间差 → 小时（支持跨天） */
function timeDiff(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return Math.round(diff / 60 * 100) / 100;
}

/* ============================================================
   补贴扣款
   ============================================================ */
function getAdjust(year, month) {
  const prefix = year + "-" + month;
  let a = ADJUSTS.find(x => x.month === prefix);
  if (!a) {
    a = { month: prefix };
    ALLOWANCE_KEYS.concat(DEDUCTION_KEYS).forEach(k => a[k] = 0);
  }
  return a;
}
function saveAdjust(a) {
  const idx = ADJUSTS.findIndex(x => x.month === a.month);
  if (idx >= 0) ADJUSTS[idx] = a;
  else ADJUSTS.push(a);
  saveJSON(K_ADJ, ADJUSTS);
}
function sumAllowance(a) { return ALLOWANCE_KEYS.reduce((s, k) => s + (parseFloat(a[k]) || 0), 0); }
function sumDeduction(a) { return DEDUCTION_KEYS.reduce((s, k) => s + (parseFloat(a[k]) || 0), 0); }

/* ============================================================
   月份锁定
   ============================================================ */
function isMonthLocked(year, month) { return LOCKED.includes(year + "-" + month); }
function toggleLockMonth(year, month) {
  const key = year + "-" + month;
  const idx = LOCKED.indexOf(key);
  if (idx >= 0) LOCKED.splice(idx, 1);
  else LOCKED.push(key);
  saveJSON(K_LOCK, LOCKED);
}

/* ============================================================
   设置
   ============================================================ */
function updateHourlyRateDisplay() {
  $("#setHourlyRate").value = "¥ " + hourlyRate().toFixed(2) + "/小时";
}

function openSettings() {
  $("#setBaseSalary").value = SETTINGS.baseSalary || "";
  $("#setOtBaseSalary").value = SETTINGS.otBaseSalary || "";
  $("#setWorkDays").value = SETTINGS.workDays;
  $("#setDailyHours").value = SETTINGS.dailyHours;
  $("#setMultWeekday").value = SETTINGS.multWeekday;
  $("#setMultRestday").value = SETTINGS.multRestday;
  $("#setMultHoliday").value = SETTINGS.multHoliday;
  $("#setRoundEnable").value = String(SETTINGS.roundEnable);
  $("#setMinHours").value = SETTINGS.minHours;
  $("#setRoundRule").value = SETTINGS.roundRule;
  $("#setTaxThreshold").value = SETTINGS.taxThreshold;
  $("#setSocial").value = SETTINGS.socialInsurance || "";
  $("#setFund").value = SETTINGS.housingFund || "";
  updateHourlyRateDisplay();
  $("#settingsStatus").textContent = "";
  openModal("#settingsModal");
}

function saveSettings() {
  SETTINGS.baseSalary = parseFloat($("#setBaseSalary").value) || 0;
  SETTINGS.otBaseSalary = parseFloat($("#setOtBaseSalary").value) || 0;
  SETTINGS.workDays = parseFloat($("#setWorkDays").value) || 21.75;
  SETTINGS.dailyHours = parseFloat($("#setDailyHours").value) || 8;
  SETTINGS.multWeekday = parseFloat($("#setMultWeekday").value) || 1.5;
  SETTINGS.multRestday = parseFloat($("#setMultRestday").value) || 2;
  SETTINGS.multHoliday = parseFloat($("#setMultHoliday").value) || 3;
  SETTINGS.roundEnable = parseInt($("#setRoundEnable").value) || 0;
  SETTINGS.minHours = parseFloat($("#setMinHours").value) || 0;
  SETTINGS.roundRule = $("#setRoundRule").value || "half";
  SETTINGS.taxThreshold = parseFloat($("#setTaxThreshold").value) || 5000;
  SETTINGS.socialInsurance = parseFloat($("#setSocial").value) || 0;
  SETTINGS.housingFund = parseFloat($("#setFund").value) || 0;
  saveJSON(K_SET, SETTINGS);
  updateHourlyRateDisplay();
  $("#settingsStatus").textContent = "✅ 设置已保存";
  renderAll();
  toast("设置已保存 ✓");
}

function resetSettings() {
  if (!confirm("恢复默认设置？当前设置将被覆盖。")) return;
  SETTINGS = Object.assign({}, DEFAULT_SETTINGS);
  saveJSON(K_SET, SETTINGS);
  openSettings();
  renderAll();
  toast("已恢复默认设置");
}

/* ============================================================
   录入表单
   ============================================================ */
function getFormHours() {
  const mode = $("#otMode").value;
  if (mode === "time") {
    return timeDiff($("#otStart").value, $("#otEnd").value);
  }
  return parseFloat($("#otHours").value) || 0;
}

function updateCalcPreview() {
  const type = $("#otType").value;
  const hours = getFormHours();
  const t = TYPE_MAP[type];
  if (!t) { $("#calcPreview").innerHTML = ""; return; }
  const rate = hourlyRate();
  if (!rate && t.paid) {
    $("#calcPreview").innerHTML = "⚠️ 请先在设置中填写工资基数，否则加班费为 ¥0";
    return;
  }
  const pay = calcPay(type, hours, null);
  const rounded = applyRounding(hours);
  const mult = t.mult();
  let html = "";
  if (t.paid) {
    html = "时薪 ¥" + rate.toFixed(2) + " × " + mult + "倍 × " + rounded + "h = ";
    if (SETTINGS.roundEnable && rounded !== hours) html += "<span class='cp-pay'>¥" + pay.toFixed(2) + "</span> <small>（取整后：" + rounded + "h）</small>";
    else html += "<span class='cp-pay'>¥" + pay.toFixed(2) + "</span>";
  } else {
    html = t.label + "，不计加班费。时长：" + hours + "h";
  }
  $("#calcPreview").innerHTML = html;
}

function clearForm() {
  $("#otDate").value = todayStr();
  $("#otType").value = "weekday";
  $("#otMode").value = "hours";
  $("#otHours").value = "";
  $("#otStart").value = "";
  $("#otEnd").value = "";
  $("#otNote").value = "";
  EDITING_ID = null;
  $("#formTitle").textContent = "➕ 新增加班记录";
  $("#btnAddOt").style.display = "";
  $("#btnSaveEdit").style.display = "none";
  $("#btnCancelEdit").style.display = "none";
  toggleFormMode();
  updateCalcPreview();
}

function toggleFormMode() {
  const mode = $("#otMode").value;
  $("#otHoursBox").style.display = mode === "hours" ? "" : "none";
  $("#otTimeBox").style.display = mode === "time" ? "" : "none";
  updateCalcPreview();
}

function checkMonthLocked(date) {
  const ym = date.slice(0, 7);
  if (isMonthLocked(ym.slice(0, 4), ym.slice(5, 7))) {
    toast("月份 " + ym + " 已锁定，请先解锁后再操作");
    return true;
  }
  return false;
}

function addRecord() {
  const date = $("#otDate").value;
  if (!date) { toast("请选择加班日期"); return; }
  if (checkMonthLocked(date)) return;
  const type = $("#otType").value;
  const hours = getFormHours();
  if (hours <= 0) { toast("加班时长必须大于 0"); return; }
  if (hours > 24) { toast("单次加班时长不能超过 24 小时"); return; }
  const note = $("#otNote").value.trim();
  const pay = calcPay(type, hours, null);
  const mode = $("#otMode").value;

  const rec = {
    id: uid(), date, type, hours: Math.round(hours * 100) / 100,
    startTime: mode === "time" ? $("#otStart").value : "",
    endTime: mode === "time" ? $("#otEnd").value : "",
    note, pay: Math.round(pay * 100) / 100,
    status: "pending", createdAt: new Date().toISOString()
  };
  RECORDS.unshift(rec);
  saveJSON(K_OT, RECORDS);
  clearForm();
  renderAll();
  toast("已添加加班记录 ✓");
}

function startEdit(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
  if (checkMonthLocked(rec.date)) return;
  EDITING_ID = id;
  $("#otDate").value = rec.date;
  $("#otType").value = rec.type;
  if (rec.startTime && rec.endTime) {
    $("#otMode").value = "time";
    $("#otStart").value = rec.startTime;
    $("#otEnd").value = rec.endTime;
  } else {
    $("#otMode").value = "hours";
    $("#otHours").value = rec.hours;
  }
  $("#otNote").value = rec.note || "";
  $("#formTitle").textContent = "✏️ 编辑加班记录";
  $("#btnAddOt").style.display = "none";
  $("#btnSaveEdit").style.display = "";
  $("#btnCancelEdit").style.display = "";
  toggleFormMode();
  updateCalcPreview();
  try { document.querySelector(".ov-wrap").scrollIntoView({ behavior: "smooth", block: "start" }); } catch(_) {}
}

function saveEdit() {
  if (!EDITING_ID) return;
  const rec = RECORDS.find(r => r.id === EDITING_ID);
  if (!rec) return;
  const date = $("#otDate").value;
  if (!date) { toast("请选择加班日期"); return; }
  if (checkMonthLocked(date)) return;
  const type = $("#otType").value;
  const hours = getFormHours();
  if (hours <= 0) { toast("加班时长必须大于 0"); return; }
  if (hours > 24) { toast("单次加班时长不能超过 24 小时"); return; }
  const mode = $("#otMode").value;
  rec.date = date;
  rec.type = type;
  rec.hours = Math.round(hours * 100) / 100;
  rec.startTime = mode === "time" ? $("#otStart").value : "";
  rec.endTime = mode === "time" ? $("#otEnd").value : "";
  rec.note = $("#otNote").value.trim();
  // 若之前手动修改过金额，编辑时保留手动金额；否则重新计算
  if (!rec.manualPay) rec.pay = calcPay(type, hours, null);
  saveJSON(K_OT, RECORDS);
  clearForm();
  renderAll();
  toast("记录已修改 ✓");
}

function deleteRecord(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
  if (checkMonthLocked(rec.date)) return;
  if (!confirm("确定删除这条加班记录？")) return;
  RECORDS = RECORDS.filter(r => r.id !== id);
  saveJSON(K_OT, RECORDS);
  renderAll();
  toast("已删除");
}

function toggleStatus(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
  if (checkMonthLocked(rec.date)) return;
  rec.status = rec.status === "pending" ? "settled" : "pending";
  saveJSON(K_OT, RECORDS);
  renderList();
}

function editPay(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
  if (checkMonthLocked(rec.date)) return;
  const v = prompt("修改本条加班费金额（元）：", rec.pay || 0);
  if (v === null) return;
  const pay = parseFloat(v);
  if (isNaN(pay) || pay < 0) { toast("请输入有效金额"); return; }
  rec.pay = Math.round(pay * 100) / 100;
  rec.manualPay = true;
  saveJSON(K_OT, RECORDS);
  renderAll();
  toast("加班费已修改");
}

/* ============================================================
   台账列表
   ============================================================ */
function getFilteredRecords() {
  let list = RECORDS.slice();
  const fm = $("#filterMonth").value;
  const ft = $("#filterType").value;
  const fs = $("#filterStatus").value;
  const fk = ($("#filterSearch").value || "").toLowerCase();
  if (fm) list = list.filter(r => r.date.slice(0, 7) === fm);
  if (ft) list = list.filter(r => r.type === ft);
  if (fs) list = list.filter(r => r.status === fs);
  if (fk) list = list.filter(r => (r.note || "").toLowerCase().includes(fk));
  return list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function renderList() {
  const list = getFilteredRecords();
  const box = $("#otList");
  if (!list.length) { box.innerHTML = '<div class="ov-empty">暂无加班记录，在上方添加第一条吧～</div>'; return; }
  box.innerHTML = list.map(r => {
    const t = TYPE_MAP[r.type] || { label: r.type, tag: "free", paid: false };
    const settled = r.status === "settled";
    const locked = isMonthLocked(r.date.slice(0, 4), r.date.slice(5, 7));
    const rowCls = "ov-row" + (settled ? " settled" : "") + (locked ? " locked" : "");
    const payHtml = t.paid
      ? '<span class="ov-r-pay">¥' + (r.pay || 0).toFixed(2) + '</span>'
      : '<span class="ov-r-pay unpaid">不计费</span>';
    const statusHtml = t.paid
      ? '<span class="ov-r-status ' + r.status + '">' + (settled ? "已结算" : "待结算") + "</span>"
      : "";
    const timeInfo = r.startTime && r.endTime ? ' ' + r.startTime + '-' + r.endTime : '';
    return '<div class="' + rowCls + '">' +
      '<span class="ov-r-date">' + escapeHtml(r.date) + (locked ? ' 🔒' : '') + "</span>" +
      '<span class="ov-r-tag ' + t.tag + '">' + escapeHtml(t.label) + "</span>" +
      '<span class="ov-r-hours">' + r.hours + "h" + timeInfo + "</span>" +
      payHtml + statusHtml +
      (r.note ? '<div class="ov-r-note">' + escapeHtml(r.note) + "</div>" : "") +
      '<div class="ov-r-acts">' +
      '<button class="btn sm" data-act="edit" data-id="' + r.id + '">编辑</button>' +
      (t.paid ? '<button class="btn sm" data-act="pay" data-id="' + r.id + '">改金额</button>' : "") +
      (t.paid ? '<button class="btn sm" data-act="status" data-id="' + r.id + '">' + (settled ? "↺ 待结算" : "✓ 已结算") + "</button>" : "") +
      '<button class="btn sm danger" data-act="del" data-id="' + r.id + '">删</button>' +
      "</div></div>";
  }).join("");
}

/* ============================================================
   统计看板
   ============================================================ */
function renderStatPeriodSel() {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y);
  $("#statYear").innerHTML = years.map(y => '<option value="' + y + '"' + (y === now.getFullYear() ? " selected" : "") + ">" + y + " 年</option>").join("");
  let mHtml = "";
  for (let m = 1; m <= 12; m++) mHtml += '<option value="' + pad2(m) + '"' + (m === now.getMonth() + 1 ? " selected" : "") + ">" + m + " 月</option>";
  $("#statMonth").innerHTML = mHtml;
}

/* 月度工资核算：基本工资 + 补贴 + 加班费 = 应发；应发 - 扣款 = 预估实发 */
function calcMonthSalary(year, month) {
  const prefix = year + "-" + month;
  const recs = RECORDS.filter(r => r.date.slice(0, 7) === prefix);
  let otHours = 0, otPay = 0, compoffHours = 0, freeHours = 0;
  for (const r of recs) {
    const t = TYPE_MAP[r.type]; if (!t) continue;
    if (t.paid) { otHours += r.hours; otPay += r.pay || 0; }
    else if (r.type === "compoff") compoffHours += r.hours;
    else if (r.type === "free") freeHours += r.hours;
  }
  const baseSalary = SETTINGS.baseSalary || 0;
  const adj = getAdjust(year, month);
  const allowance = sumAllowance(adj);
  const deduction = sumDeduction(adj);
  const gross = baseSalary + allowance + otPay;
  const net = gross - deduction;
  return { baseSalary, allowance, otPay, gross, deduction, net, otHours, compoffHours, freeHours };
}

function renderMonthStats() {
  const y = $("#statYear").value;
  const m = $("#statMonth").value;
  const prefix = y + "-" + m;
  $("#monthLabel").textContent = prefix;
  const locked = isMonthLocked(y, m);
  $("#btnLockMonth").textContent = locked ? "🔓 解锁当月" : "🔒 锁定当月";

  const s = calcMonthSalary(y, m);

  // KPI
  const kpi = [
    { v: s.otHours.toFixed(1) + "h", l: "加班总时长", sub: "（计费）" },
    { v: "¥" + s.gross.toFixed(0), l: "应发合计", sub: "工资+补贴+加班" },
    { v: "¥" + s.net.toFixed(0), l: "预估实发工资", sub: "扣除五险一金/个税" }
  ];
  $("#monthKpi").innerHTML = kpi.map(item => '<div class="ov-stat"><div class="rs-v">' + item.v + '</div><div class="rs-l">' + item.l + '</div><div class="rs-sub">' + (item.sub || "") + "</div></div>").join("");

  // 分类明细
  const byType = {};
  for (const t of Object.keys(TYPE_MAP)) byType[t] = { hours: 0, pay: 0, count: 0 };
  for (const r of RECORDS.filter(x => x.date.slice(0, 7) === prefix)) {
    const t = TYPE_MAP[r.type]; if (!t) continue;
    byType[r.type].hours += r.hours;
    byType[r.type].pay += r.pay || 0;
    byType[r.type].count++;
  }
  const maxHours = Math.max(1, ...Object.values(byType).map(v => v.hours));
  let bdHtml = '<div class="ov-salary-detail">' +
    '<div class="sd-row"><span>基本工资</span><span>¥' + s.baseSalary.toFixed(2) + "</span></div>" +
    '<div class="sd-row"><span>补贴合计</span><span>¥' + s.allowance.toFixed(2) + "</span></div>" +
    '<div class="sd-row"><span>加班费合计</span><span>¥' + s.otPay.toFixed(2) + "</span></div>" +
    '<div class="sd-row total"><span>应发合计</span><span>¥' + s.gross.toFixed(2) + "</span></div>" +
    '<div class="sd-row deduct"><span>扣减合计（社保/公积金/个税/其他）</span><span>-¥' + s.deduction.toFixed(2) + "</span></div>" +
    '<div class="sd-row total"><span>预估实发工资</span><span>¥' + s.net.toFixed(2) + "</span></div>" +
    "</div>";

  for (const [key, t] of Object.entries(TYPE_MAP)) {
    const v = byType[key];
    if (v.count === 0) continue;
    const pct = Math.round(v.hours / maxHours * 100);
    const payStr = t.paid ? "¥" + v.pay.toFixed(2) : "不计费";
    bdHtml += '<div class="ov-bd-row">' +
      '<span class="ov-bd-tag ov-r-tag ' + t.tag + '">' + escapeHtml(t.label) + "</span>" +
      '<span class="ov-bd-hours">' + v.hours.toFixed(1) + "h / " + v.count + " 次</span>" +
      '<div class="ov-bd-bar"><div class="ov-bd-bar-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="ov-bd-pay">' + payStr + "</span></div>";
  }
  if (s.compoffHours || s.freeHours) {
    bdHtml += '<div class="ov-bd-row" style="background:var(--bg)">' +
      '<span class="ov-bd-hours" style="min-width:90px">调休：' + s.compoffHours.toFixed(1) + "h</span>" +
      '<span class="ov-bd-hours">无偿：' + s.freeHours.toFixed(1) + "h</span>" +
      '<span class="ov-bd-pay" style="color:var(--muted)">不计加班费</span></div>';
  }
  $("#monthBreakdown").innerHTML = bdHtml;
}

function renderYearStats() {
  const y = $("#statYear").value;
  let totalBase = 0, totalAllowance = 0, totalOtPay = 0, totalDeduction = 0, totalNet = 0;
  let totalHours = 0, compoffHours = 0, freeHours = 0;
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const s = calcMonthSalary(y, pad2(m));
    monthly.push({ m, ...s });
    totalBase += s.baseSalary;
    totalAllowance += s.allowance;
    totalOtPay += s.otPay;
    totalDeduction += s.deduction;
    totalNet += s.net;
    totalHours += s.otHours;
    compoffHours += s.compoffHours;
    freeHours += s.freeHours;
  }

  const kpi = [
    { v: "¥" + totalBase.toFixed(0), l: "全年基本工资", sub: "" },
    { v: "¥" + totalAllowance.toFixed(0), l: "全年补贴", sub: "" },
    { v: "¥" + totalOtPay.toFixed(0), l: "全年加班费", sub: totalHours.toFixed(1) + "h" }
  ];
  $("#yearKpi").innerHTML = kpi.map(s => '<div class="ov-stat"><div class="rs-v">' + s.v + '</div><div class="rs-l">' + s.l + '</div><div class="rs-sub">' + (s.sub || "") + "</div></div>").join("");

  let rows = "";
  for (const mo of monthly) {
    if (mo.otHours === 0 && mo.compoffHours === 0 && mo.freeHours === 0 && mo.allowance === 0 && mo.deduction === 0) continue;
    rows += "<tr><td class='mt-month'>" + mo.m + " 月</td>" +
      "<td>" + mo.baseSalary.toFixed(0) + "</td>" +
      "<td>" + mo.allowance.toFixed(0) + "</td>" +
      "<td>" + mo.otPay.toFixed(0) + "</td>" +
      "<td>" + mo.gross.toFixed(0) + "</td>" +
      "<td>" + mo.deduction.toFixed(0) + "</td>" +
      "<td class='mt-pay'>" + mo.net.toFixed(0) + "</td></tr>";
  }
  if (!rows) rows = '<tr><td colspan="7" style="text-align:center;color:var(--muted)">全年无记录</td></tr>';
  rows += '<tr class="mt-total"><td>合计</td><td>' + totalBase.toFixed(0) + "</td>" +
    "<td>" + totalAllowance.toFixed(0) + "</td><td>" + totalOtPay.toFixed(0) + "</td>" +
    "<td>" + (totalBase + totalAllowance + totalOtPay).toFixed(0) + "</td>" +
    "<td>" + totalDeduction.toFixed(0) + "</td>" +
    '<td class="mt-pay">' + totalNet.toFixed(0) + "</td></tr>";
  $("#yearMonthlyTable").innerHTML = '<table><thead><tr><th>月份</th><th>基本工资</th><th>补贴</th><th>加班费</th><th>应发</th><th>扣减</th><th>预估实发</th></tr></thead><tbody>' + rows + "</tbody></table>";
}

function showStatView(view) {
  $("#statMonthView").style.display = view === "month" ? "" : "none";
  $("#statYearView").style.display = view === "year" ? "" : "none";
  if (view === "month") renderMonthStats();
  else renderYearStats();
}

/* ============================================================
   补贴扣款 UI
   ============================================================ */
function renderAdjustInputs() {
  const y = $("#statYear").value;
  const m = $("#statMonth").value;
  $("#adjustMonthLabel").textContent = y + "-" + m;
  const a = getAdjust(y, m);
  ALLOWANCE_KEYS.concat(DEDUCTION_KEYS).forEach(k => {
    const el = $("#" + ADJ_ID_MAP[k]);
    if (el) el.value = a[k] || "";
  });
}

function saveAdjustForm() {
  const y = $("#statYear").value;
  const m = $("#statMonth").value;
  const a = getAdjust(y, m);
  ALLOWANCE_KEYS.concat(DEDUCTION_KEYS).forEach(k => {
    const el = $("#" + ADJ_ID_MAP[k]);
    if (el) a[k] = parseFloat(el.value) || 0;
  });
  saveAdjust(a);
  renderAll();
  toast("当月补贴扣款已保存 ✓");
}

/* ============================================================
   工资实发对比
   ============================================================ */
function renderSalaryList() {
  const box = $("#salaryList");
  if (!SALARIES.length) { box.innerHTML = '<div class="ov-empty">暂无工资录入记录。点击「录入实发工资」开始记录每月实发。</div>'; return; }
  const list = SALARIES.slice().sort((a, b) => (b.year + b.month).localeCompare(a.year + a.month));
  box.innerHTML = list.map(s => {
    const est = estimateMonthPay(s.year, s.month);
    const diff = s.actual - est;
    const diffStr = diff >= 0 ? "+" + diff.toFixed(2) : diff.toFixed(2);
    const diffCls = diff >= 0 ? "pos" : "neg";
    return '<div class="ov-sal-row">' +
      '<span class="ov-sal-month">' + s.year + "-" + s.month + "</span>" +
      '<span class="ov-sal-est">预估：<b>¥' + est.toFixed(2) + "</b></span>" +
      '<span class="ov-sal-act">实发：¥' + s.actual.toFixed(2) + "</span>" +
      '<span class="ov-sal-diff ' + diffCls + '">差额：' + diffStr + "</span>" +
      (s.diffNote ? '<div class="ov-sal-note">' + escapeHtml(s.diffNote) + "</div>" : "") +
      '<div class="ov-sal-acts">' +
      '<button class="btn sm" data-sal-act="edit" data-id="' + s.id + '">编辑</button>' +
      '<button class="btn sm danger" data-sal-act="del" data-id="' + s.id + '">删</button>' +
      "</div></div>";
  }).join("");
}

function estimateMonthPay(year, month) {
  const s = calcMonthSalary(year, month);
  return s.net;
}

function openSalaryModal(id) {
  const now = new Date();
  const years = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) years.push(y);
  $("#salYear").innerHTML = years.map(y => '<option value="' + y + '"' + (y === now.getFullYear() ? " selected" : "") + ">" + y + " 年</option>").join("");
  let mHtml = "";
  for (let m = 1; m <= 12; m++) mHtml += '<option value="' + pad2(m) + '"' + (m === now.getMonth() + 1 ? " selected" : "") + ">" + m + " 月</option>";
  $("#salMonth").innerHTML = mHtml;

  if (id) {
    const s = SALARIES.find(x => x.id === id);
    if (s) {
      $("#salYear").value = s.year;
      $("#salMonth").value = s.month;
      $("#salActual").value = s.actual;
      $("#salDiffNote").value = s.diffNote || "";
      $("#salaryModalTitle").textContent = "✏️ 编辑工资实发";
      $("#btnSaveSalary").dataset.editId = id;
    }
  } else {
    $("#salActual").value = "";
    $("#salDiffNote").value = "";
    $("#salaryModalTitle").textContent = "💰 录入工资实发";
    delete $("#btnSaveSalary").dataset.editId;
  }
  updateSalPreview();
  openModal("#salaryModal");
}

function updateSalPreview() {
  const y = $("#salYear").value;
  const m = $("#salMonth").value;
  const est = estimateMonthPay(y, m);
  const act = parseFloat($("#salActual").value) || 0;
  const diff = act - est;
  const diffStr = diff >= 0 ? "+" + diff.toFixed(2) : diff.toFixed(2);
  $("#salPreview").innerHTML = "预估实发：¥" + est.toFixed(2) + "　→　差额：" + diffStr;
}

function saveSalary() {
  const year = $("#salYear").value;
  const month = $("#salMonth").value;
  const actual = parseFloat($("#salActual").value);
  if (isNaN(actual) || actual < 0) { toast("请输入有效金额"); return; }
  const diffNote = $("#salDiffNote").value.trim();
  const editId = $("#btnSaveSalary").dataset.editId;

  if (editId) {
    const s = SALARIES.find(x => x.id === editId);
    if (s) { s.year = year; s.month = month; s.actual = actual; s.diffNote = diffNote; }
  } else {
    const exist = SALARIES.find(s => s.year === year && s.month === month);
    if (exist) {
      exist.actual = actual; exist.diffNote = diffNote;
    } else {
      SALARIES.push({ id: uid(), year, month, actual, diffNote, createdAt: new Date().toISOString() });
    }
  }
  saveJSON(K_SAL, SALARIES);
  closeModal("#salaryModal");
  renderSalaryList();
  toast("工资已保存 ✓");
}

function deleteSalary(id) {
  if (!confirm("确定删除这条工资记录？")) return;
  SALARIES = SALARIES.filter(s => s.id !== id);
  saveJSON(K_SAL, SALARIES);
  renderSalaryList();
  toast("已删除");
}

/* ============================================================
   导出 / 备份
   ============================================================ */
function exportData() {
  const lines = [];
  lines.push("===== 加班台账导出 =====");
  lines.push("导出时间：" + new Date().toLocaleString("zh-CN"));
  lines.push("");
  lines.push("【薪资设置】");
  lines.push("月基本工资：¥" + (SETTINGS.baseSalary || 0));
  lines.push("加班核算基数：¥" + otBase().toFixed(2) + (SETTINGS.otBaseSalary > 0 ? "（与基本工资不同）" : "（同基本工资）"));
  lines.push("计薪天数：" + SETTINGS.workDays + " 天");
  lines.push("每日工时：" + SETTINGS.dailyHours + " 小时");
  lines.push("基础时薪：¥" + hourlyRate().toFixed(2) + "/小时");
  lines.push("个税起征点：¥" + SETTINGS.taxThreshold);
  lines.push("社保个人：¥" + SETTINGS.socialInsurance + " / 公积金个人：¥" + SETTINGS.housingFund);
  lines.push("倍率：工作日" + SETTINGS.multWeekday + " / 休息日" + SETTINGS.multRestday + " / 节假日" + SETTINGS.multHoliday);
  lines.push("");

  lines.push("【加班记录】（共 " + RECORDS.length + " 条）");
  const sorted = RECORDS.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    const t = TYPE_MAP[r.type] || { label: r.type, paid: false };
    const payStr = t.paid ? "¥" + (r.pay || 0).toFixed(2) : "不计费";
    const stStr = t.paid ? " [" + (r.status === "settled" ? "已结算" : "待结算") + "]" : "";
    const timeStr = r.startTime && r.endTime ? " " + r.startTime + "-" + r.endTime : "";
    lines.push(r.date + " | " + t.label + " | " + r.hours + "h" + timeStr + " | " + payStr + stStr + (r.note ? " | " + r.note : ""));
  }
  lines.push("");

  lines.push("【月度补贴扣款】");
  const adjSorted = ADJUSTS.slice().sort((a, b) => b.month.localeCompare(a.month));
  for (const a of adjSorted) {
    const items = [];
    ALLOWANCE_KEYS.forEach(k => { if (a[k]) items.push(ADJ_LABELS[k] + " ¥" + a[k]); });
    DEDUCTION_KEYS.forEach(k => { if (a[k]) items.push(ADJ_LABELS[k] + " -¥" + a[k]); });
    lines.push(a.month + " | " + (items.length ? items.join(" / ") : "无"));
  }
  lines.push("");

  lines.push("【工资实发对比】（共 " + SALARIES.length + " 条）");
  const sSorted = SALARIES.slice().sort((a, b) => (a.year + a.month).localeCompare(b.year + b.month));
  for (const s of sSorted) {
    const est = estimateMonthPay(s.year, s.month);
    const diff = s.actual - est;
    lines.push(s.year + "-" + s.month + " | 预估 ¥" + est.toFixed(2) + " | 实发 ¥" + s.actual.toFixed(2) + " | 差额 " + (diff >= 0 ? "+" : "") + diff.toFixed(2) + (s.diffNote ? " | " + s.diffNote : ""));
  }

  const text = lines.join("\n");
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "加班台账-" + todayStr() + ".txt";
  a.click();
  toast("已导出台账备份 ✓");
}

function exportJSON() {
  const data = { settings: SETTINGS, records: RECORDS, salaries: SALARIES, adjusts: ADJUSTS, locked: LOCKED, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "fitdesk-overtime-" + todayStr() + ".json";
  a.click();
  toast("已导出 JSON 备份");
}

/* ============================================================
   筛选器
   ============================================================ */
function populateMonthFilters() {
  const months = [...new Set(RECORDS.map(r => r.date.slice(0, 7)))].sort().reverse();
  const cur = $("#filterMonth").value;
  $("#filterMonth").innerHTML = '<option value="">全部月份</option>' +
    months.map(m => '<option value="' + m + '">' + m + "</option>").join("");
  if (cur && months.includes(cur)) $("#filterMonth").value = cur;
}

/* ============================================================
   UI 辅助：模态框
   ============================================================ */
function openModal(sel) { const m = $(sel); if (m) m.classList.add("show"); }
function closeModal(sel) { const m = $(sel); if (m) m.classList.remove("show"); }

/* ============================================================
   渲染入口
   ============================================================ */
function renderAll() {
  populateMonthFilters();
  renderList();
  renderMonthStats();
  renderSalaryList();
  renderAdjustInputs();
}

/* ============================================================
   事件绑定
   ============================================================ */
function bind() {
  // 设置
  $("#btnOvSettings").addEventListener("click", openSettings);
  $("#btnSaveSettings").addEventListener("click", saveSettings);
  $("#btnResetSettings").addEventListener("click", resetSettings);
  ["#setBaseSalary", "#setOtBaseSalary", "#setWorkDays", "#setDailyHours"].forEach(s => {
    $(s).addEventListener("input", updateHourlyRateDisplay);
  });

  // 表单
  $("#otDate").value = todayStr();
  $("#otMode").addEventListener("change", toggleFormMode);
  $("#otType").addEventListener("change", updateCalcPreview);
  $("#otHours").addEventListener("input", updateCalcPreview);
  $("#otStart").addEventListener("input", updateCalcPreview);
  $("#otEnd").addEventListener("input", updateCalcPreview);
  $("#btnAddOt").addEventListener("click", addRecord);
  $("#btnSaveEdit").addEventListener("click", saveEdit);
  $("#btnCancelEdit").addEventListener("click", clearForm);

  // 台账列表事件委托
  $("#otList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-act]"); if (!b) return;
    const id = b.dataset.id;
    const act = b.dataset.act;
    if (act === "edit") startEdit(id);
    else if (act === "del") deleteRecord(id);
    else if (act === "status") toggleStatus(id);
    else if (act === "pay") editPay(id);
  });

  // 筛选
  $("#filterMonth").addEventListener("change", renderList);
  $("#filterType").addEventListener("change", renderList);
  $("#filterStatus").addEventListener("change", renderList);
  $("#filterSearch").addEventListener("input", renderList);

  // 统计
  $("#btnStatMonth").addEventListener("click", () => showStatView("month"));
  $("#btnStatYear").addEventListener("click", () => showStatView("year"));
  $("#statYear").addEventListener("change", () => {
    renderAdjustInputs();
    if ($("#statMonthView").style.display !== "none") renderMonthStats();
    else renderYearStats();
  });
  $("#statMonth").addEventListener("change", () => {
    renderAdjustInputs();
    renderMonthStats();
  });
  $("#btnLockMonth").addEventListener("click", () => {
    toggleLockMonth($("#statYear").value, $("#statMonth").value);
    renderMonthStats();
    renderList();
    toast(isMonthLocked($("#statYear").value, $("#statMonth").value) ? "月份已锁定" : "月份已解锁");
  });

  // 补贴扣款
  ALLOWANCE_KEYS.concat(DEDUCTION_KEYS).forEach(k => {
    const el = $("#" + ADJ_ID_MAP[k]);
    if (el) el.addEventListener("input", () => { /* 实时？不，点保存 */ });
  });
  $("#btnSaveAdjust").addEventListener("click", saveAdjustForm);

  // 工资
  $("#btnAddSalary").addEventListener("click", () => openSalaryModal());
  $("#salYear").addEventListener("change", updateSalPreview);
  $("#salMonth").addEventListener("change", updateSalPreview);
  $("#salActual").addEventListener("input", updateSalPreview);
  $("#btnSaveSalary").addEventListener("click", saveSalary);
  $("#salaryList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sal-act]"); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.salAct === "edit") openSalaryModal(id);
    else if (b.dataset.salAct === "del") deleteSalary(id);
  });

  // 导出
  $("#btnExport").addEventListener("click", exportData);

  // 弹窗关闭
  $$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest(".modal").classList.remove("show")));
  $$(".modal").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("show"); }));
}

/* ---------------- 初始化 ---------------- */
function init() {
  bind();
  renderStatPeriodSel();
  clearForm();
  showStatView("month");
  renderAll();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
