/* ============================================================
   加班 & 加班费台账 · overtime.js
   纯前端：localStorage 存储，零依赖
   功能：全局设置 / 录入表单 / 台账列表 / 统计看板 / 工资实发对比 / 导出备份
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
function loadJSON(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { toast("保存失败：" + e.message); } }

/* 默认设置 */
const DEFAULT_SETTINGS = {
  baseSalary: 0,
  workDays: 21.75,
  dailyHours: 8,
  multWeekday: 1.5,
  multRestday: 2,
  multHoliday: 3,
  roundEnable: 0,
  minHours: 0.5,
  roundRule: "half"
};

let SETTINGS = Object.assign({}, DEFAULT_SETTINGS, loadJSON(K_SET, {}));
let RECORDS = loadJSON(K_OT, []);
let SALARIES = loadJSON(K_SAL, []);

/* 编辑状态 */
let EDITING_ID = null;

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
function hourlyRate() {
  if (!SETTINGS.baseSalary || !SETTINGS.workDays || !SETTINGS.dailyHours) return 0;
  return SETTINGS.baseSalary / SETTINGS.workDays / SETTINGS.dailyHours;
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

/* 时间差 → 小时 */
function timeDiff(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60; // 跨日
  return Math.round(diff / 60 * 100) / 100; // 保留 2 位
}

/* ============================================================
   设置
   ============================================================ */
function updateHourlyRateDisplay() {
  $("#setHourlyRate").value = "¥ " + hourlyRate().toFixed(2) + "/小时";
}

function openSettings() {
  $("#setBaseSalary").value = SETTINGS.baseSalary || "";
  $("#setWorkDays").value = SETTINGS.workDays;
  $("#setDailyHours").value = SETTINGS.dailyHours;
  $("#setMultWeekday").value = SETTINGS.multWeekday;
  $("#setMultRestday").value = SETTINGS.multRestday;
  $("#setMultHoliday").value = SETTINGS.multHoliday;
  $("#setRoundEnable").value = String(SETTINGS.roundEnable);
  $("#setMinHours").value = SETTINGS.minHours;
  $("#setRoundRule").value = SETTINGS.roundRule;
  updateHourlyRateDisplay();
  $("#settingsStatus").textContent = "";
  openModal("#settingsModal");
}

function saveSettings() {
  SETTINGS.baseSalary = parseFloat($("#setBaseSalary").value) || 0;
  SETTINGS.workDays = parseFloat($("#setWorkDays").value) || 21.75;
  SETTINGS.dailyHours = parseFloat($("#setDailyHours").value) || 8;
  SETTINGS.multWeekday = parseFloat($("#setMultWeekday").value) || 1.5;
  SETTINGS.multRestday = parseFloat($("#setMultRestday").value) || 2;
  SETTINGS.multHoliday = parseFloat($("#setMultHoliday").value) || 3;
  SETTINGS.roundEnable = parseInt($("#setRoundEnable").value) || 0;
  SETTINGS.minHours = parseFloat($("#setMinHours").value) || 0;
  SETTINGS.roundRule = $("#setRoundRule").value || "half";
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
    $("#calcPreview").innerHTML = "⚠️ 请先在设置中填写月基本工资，否则加班费为 ¥0";
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

function addRecord() {
  const date = $("#otDate").value;
  if (!date) { toast("请选择加班日期"); return; }
  const type = $("#otType").value;
  const hours = getFormHours();
  if (hours <= 0) { toast("加班时长必须大于 0"); return; }
  if (hours > 24) { toast("单次加班时长不能超过 24 小时"); return; }
  const note = $("#otNote").value.trim();
  const pay = calcPay(type, hours, null);

  const rec = {
    id: uid(), date, type, hours: Math.round(hours * 100) / 100,
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
  EDITING_ID = id;
  $("#otDate").value = rec.date;
  $("#otType").value = rec.type;
  $("#otMode").value = "hours";
  $("#otHours").value = rec.hours;
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
  const type = $("#otType").value;
  const hours = getFormHours();
  if (hours <= 0) { toast("加班时长必须大于 0"); return; }
  if (hours > 24) { toast("单次加班时长不能超过 24 小时"); return; }
  rec.date = date;
  rec.type = type;
  rec.hours = Math.round(hours * 100) / 100;
  rec.note = $("#otNote").value.trim();
  // 如果之前没有手动改过金额，就重新算；否则保留
  rec.pay = calcPay(type, hours, null);
  saveJSON(K_OT, RECORDS);
  clearForm();
  renderAll();
  toast("记录已修改 ✓");
}

function deleteRecord(id) {
  if (!confirm("确定删除这条加班记录？")) return;
  RECORDS = RECORDS.filter(r => r.id !== id);
  saveJSON(K_OT, RECORDS);
  renderAll();
  toast("已删除");
}

function toggleStatus(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
  rec.status = rec.status === "pending" ? "settled" : "pending";
  saveJSON(K_OT, RECORDS);
  renderList();
}

function editPay(id) {
  const rec = RECORDS.find(r => r.id === id);
  if (!rec) return;
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
  const fs = ($("#filterSearch").value || "").toLowerCase();
  if (fm) list = list.filter(r => r.date.slice(0, 7) === fm);
  if (ft) list = list.filter(r => r.type === ft);
  if (fs) list = list.filter(r => (r.note || "").toLowerCase().includes(fs));
  return list.sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function renderList() {
  const list = getFilteredRecords();
  const box = $("#otList");
  if (!list.length) { box.innerHTML = '<div class="ov-empty">暂无加班记录，在上方添加第一条吧～</div>'; return; }
  box.innerHTML = list.map(r => {
    const t = TYPE_MAP[r.type] || { label: r.type, tag: "free", paid: false };
    const payHtml = t.paid
      ? '<span class="ov-r-pay">¥' + (r.pay || 0).toFixed(2) + '</span>'
      : '<span class="ov-r-pay unpaid">不计费</span>';
    const statusHtml = t.paid
      ? '<span class="ov-r-status ' + r.status + '">' + (r.status === "settled" ? "已结算" : "待结算") + "</span>"
      : "";
    return '<div class="ov-row">' +
      '<span class="ov-r-date">' + escapeHtml(r.date) + "</span>" +
      '<span class="ov-r-tag ' + t.tag + '">' + escapeHtml(t.label) + "</span>" +
      '<span class="ov-r-hours">' + r.hours + "h</span>" +
      payHtml + statusHtml +
      (r.note ? '<div class="ov-r-note">' + escapeHtml(r.note) + "</div>" : "") +
      '<div class="ov-r-acts">' +
      '<button class="btn sm" data-act="edit" data-id="' + r.id + '">编辑</button>' +
      (t.paid ? '<button class="btn sm" data-act="pay" data-id="' + r.id + '">改金额</button>' : "") +
      (t.paid ? '<button class="btn sm" data-act="status" data-id="' + r.id + '">' + (r.status === "settled" ? "↺ 待结算" : "✓ 已结算") + "</button>" : "") +
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

function renderMonthStats() {
  const y = $("#statYear").value;
  const m = $("#statMonth").value;
  const prefix = y + "-" + m;
  const recs = RECORDS.filter(r => r.date.slice(0, 7) === prefix);

  // 按类型汇总
  const byType = {};
  for (const t of Object.keys(TYPE_MAP)) byType[t] = { hours: 0, pay: 0, count: 0 };
  let totalHours = 0, totalPay = 0;
  let compoffHours = 0, freeHours = 0;

  for (const r of recs) {
    const t = TYPE_MAP[r.type]; if (!t) continue;
    byType[r.type].hours += r.hours;
    byType[r.type].pay += r.pay || 0;
    byType[r.type].count++;
    if (t.paid) { totalHours += r.hours; totalPay += r.pay || 0; }
    else if (r.type === "compoff") compoffHours += r.hours;
    else if (r.type === "free") freeHours += r.hours;
  }

  const baseSalary = SETTINGS.baseSalary || 0;
  const estTotal = baseSalary + totalPay;

  // KPI
  const kpi = [
    { v: totalHours.toFixed(1) + "h", l: "加班总时长", sub: "（计费）" },
    { v: "¥" + totalPay.toFixed(0), l: "加班费合计", sub: "（预估）" },
    { v: "¥" + estTotal.toFixed(0), l: "当月预估应发", sub: "基本工资+加班费" }
  ];
  $("#monthKpi").innerHTML = kpi.map(s => '<div class="ov-stat"><div class="rs-v">' + s.v + '</div><div class="rs-l">' + s.l + '</div><div class="rs-sub">' + (s.sub || "") + "</div></div>").join("");

  // 分类明细
  const maxHours = Math.max(1, ...Object.values(byType).map(v => v.hours));
  let bdHtml = "";
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
  if (compoffHours || freeHours) {
    bdHtml += '<div class="ov-bd-row" style="background:var(--bg)">' +
      '<span class="ov-bd-hours" style="min-width:90px">调休：' + compoffHours.toFixed(1) + "h</span>" +
      '<span class="ov-bd-hours">无偿：' + freeHours.toFixed(1) + "h</span>" +
      '<span class="ov-bd-pay" style="color:var(--muted)">不计加班费</span></div>';
  }
  if (!bdHtml) bdHtml = '<div class="ov-empty">当月无加班记录</div>';
  $("#monthBreakdown").innerHTML = bdHtml;
}

function renderYearStats() {
  const y = $("#statYear").value;
  const recs = RECORDS.filter(r => r.date.slice(0, 4) === y);

  let totalHours = 0, totalPay = 0;
  let compoffHours = 0, freeHours = 0;
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const mp = y + "-" + pad2(m);
    const mr = recs.filter(r => r.date.slice(0, 7) === mp);
    let mh = 0, mp2 = 0, ch = 0, fh = 0;
    for (const r of mr) {
      const t = TYPE_MAP[r.type]; if (!t) continue;
      if (t.paid) { mh += r.hours; mp2 += r.pay || 0; }
      else if (r.type === "compoff") ch += r.hours;
      else if (r.type === "free") fh += r.hours;
    }
    monthly.push({ m, hours: mh, pay: mp2, compoff: ch, free: fh });
    totalHours += mh; totalPay += mp2;
    compoffHours += ch; freeHours += fh;
  }

  const kpi = [
    { v: totalHours.toFixed(1) + "h", l: "全年加班时长", sub: "（计费）" },
    { v: "¥" + totalPay.toFixed(0), l: "全年加班费", sub: "（预估）" },
    { v: (compoffHours + freeHours).toFixed(0) + "h", l: "调休+无偿", sub: compoffHours.toFixed(0) + "h / " + freeHours.toFixed(0) + "h" }
  ];
  $("#yearKpi").innerHTML = kpi.map(s => '<div class="ov-stat"><div class="rs-v">' + s.v + '</div><div class="rs-l">' + s.l + '</div><div class="rs-sub">' + (s.sub || "") + "</div></div>").join("");

  // 月度表格
  let rows = "";
  for (const mo of monthly) {
    if (mo.hours === 0 && mo.compoff === 0 && mo.free === 0) continue;
    rows += "<tr><td class='mt-month'>" + mo.m + " 月</td>" +
      "<td>" + mo.hours.toFixed(1) + "h</td>" +
      "<td>" + mo.compoff.toFixed(1) + "h</td>" +
      "<td>" + mo.free.toFixed(1) + "h</td>" +
      "<td class='mt-pay'>¥" + mo.pay.toFixed(2) + "</td></tr>";
  }
  if (!rows) rows = '<tr><td colspan="5" style="text-align:center;color:var(--muted)">全年无加班记录</td></tr>';
  rows += '<tr class="mt-total"><td>合计</td><td>' + totalHours.toFixed(1) + "h</td>" +
    "<td>" + compoffHours.toFixed(1) + "h</td><td>" + freeHours.toFixed(1) + "h</td>" +
    '<td class="mt-pay">¥' + totalPay.toFixed(2) + "</td></tr>";
  $("#yearMonthlyTable").innerHTML = '<table><thead><tr><th>月份</th><th>计费时长</th><th>调休</th><th>无偿</th><th>加班费</th></tr></thead><tbody>' + rows + "</tbody></table>";
}

function showStatView(view) {
  $("#statMonthView").style.display = view === "month" ? "" : "none";
  $("#statYearView").style.display = view === "year" ? "" : "none";
  if (view === "month") renderMonthStats();
  else renderYearStats();
}

/* ============================================================
   工资实发对比
   ============================================================ */
function renderSalaryList() {
  const box = $("#salaryList");
  if (!SALARIES.length) { box.innerHTML = '<div class="ov-empty">暂无工资录入记录。点击「录入工资」开始记录每月实发。</div>'; return; }
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
  const prefix = year + "-" + month;
  const recs = RECORDS.filter(r => r.date.slice(0, 7) === prefix);
  let pay = 0;
  for (const r of recs) { const t = TYPE_MAP[r.type]; if (t && t.paid) pay += r.pay || 0; }
  return (SETTINGS.baseSalary || 0) + pay;
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
      $("#salaryModalTitle").textContent = "✏️ 编辑工资";
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
  $("#salPreview").innerHTML = "预估应发：¥" + est.toFixed(2) + "　→　差额：" + diffStr;
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
    // 同年月去重
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
  lines.push("【全局设置】");
  lines.push("月基本工资：¥" + (SETTINGS.baseSalary || 0));
  lines.push("计薪天数：" + SETTINGS.workDays + " 天");
  lines.push("每日工时：" + SETTINGS.dailyHours + " 小时");
  lines.push("基础时薪：¥" + hourlyRate().toFixed(2) + "/小时");
  lines.push("倍率：工作日" + SETTINGS.multWeekday + " / 休息日" + SETTINGS.multRestday + " / 节假日" + SETTINGS.multHoliday);
  lines.push("");

  lines.push("【加班记录】（共 " + RECORDS.length + " 条）");
  const sorted = RECORDS.slice().sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    const t = TYPE_MAP[r.type] || { label: r.type, paid: false };
    const payStr = t.paid ? "¥" + (r.pay || 0).toFixed(2) : "不计费";
    const stStr = t.paid ? " [" + (r.status === "settled" ? "已结算" : "待结算") + "]" : "";
    lines.push(r.date + " | " + t.label + " | " + r.hours + "h | " + payStr + stStr + (r.note ? " | " + r.note : ""));
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
  const data = { settings: SETTINGS, records: RECORDS, salaries: SALARIES, exportedAt: new Date().toISOString() };
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
  // 台账筛选的月份下拉
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
}

/* ============================================================
   事件绑定
   ============================================================ */
function bind() {
  // 设置
  $("#btnOvSettings").addEventListener("click", openSettings);
  $("#btnSaveSettings").addEventListener("click", saveSettings);
  $("#btnResetSettings").addEventListener("click", resetSettings);
  ["#setBaseSalary", "#setWorkDays", "#setDailyHours"].forEach(s => {
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
  $("#filterSearch").addEventListener("input", renderList);

  // 统计
  $("#btnStatMonth").addEventListener("click", () => showStatView("month"));
  $("#btnStatYear").addEventListener("click", () => showStatView("year"));
  $("#statYear").addEventListener("change", () => {
    if ($("#statMonthView").style.display !== "none") renderMonthStats();
    else renderYearStats();
  });
  $("#statMonth").addEventListener("change", renderMonthStats);

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
