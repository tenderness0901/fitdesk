/* ============================================================
   英语精读学习 · reading.js
   纯前端：localStorage 存储 + 免费公开接口（免密钥）
   - 词典：Free Dictionary API + 本地 words1800 兜底
   - 翻译：Google 翻译(免费 gtx 端点) + MyMemory 兜底
   - 朗读：Web Speech API（英/美音、0.75-1.5x、逐词高亮）
   - OCR：Tesseract.js（CDN）
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
function escapeHtml(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function todayStr(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dateAdd(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function normW(w) { return w.toLowerCase().replace(/[^a-z]/g, ""); }

/* ---------------- 存储 ---------------- */
const K_LIB = "fitdesk:reading:lib", K_VOCAB = "fitdesk:reading:vocab",
  K_CHECK = "fitdesk:reading:checkin", K_SET = "fitdesk:reading:settings";
function loadJSON(key, def) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch (e) { return def; } }
function saveJSON(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { toast("保存失败：" + e.message); } }

let LIB = loadJSON(K_LIB, []);
let VOCAB = loadJSON(K_VOCAB, []);
let CHECKINS = loadJSON(K_CHECK, []);
let SETTINGS = loadJSON(K_SET, { accent: "en-US", rate: 1, llm: { base: "", key: "", model: "" } });

/* 当前正在阅读的文章（内存态） */
let CURRENT = null;          // {id,title,tags,notes,raw,paragraphs,createdAt,updatedAt,annotations}
let WORD_SPANS = [];         // [{el, off}] 供 TTS 高亮
const DICT_CACHE = {};       // 词典缓存

/* ---------------- 本地词库（words1800） ---------------- */
const LOCAL_DICT = {};
if (window.WORDS1800 && Array.isArray(window.WORDS1800)) {
  window.WORDS1800.forEach(o => { if (o.en) LOCAL_DICT[o.en.toLowerCase()] = o; });
}

/* ============================================================
   视图切换
   ============================================================ */
function showView(v) {
  $$(".rd-view").forEach(x => x.classList.remove("active"));
  $("#view" + v).classList.add("active");
  if (v === "Home") renderHome();
  window.scrollTo(0, 0);
}

/* ============================================================
   文章渲染（逐词 span + 批注高亮）
   ============================================================ */
function tokenize(text) {
  const tokens = [], re = /[A-Za-z][A-Za-z'’\-]*/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) tokens.push({ type: "text", text: text.slice(last, m.index) });
    tokens.push({ type: "word", text: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
  return tokens;
}

function renderParagraph(P, annos, baseOff) {
  // 计算批注字符区间（取首次出现，去重叠）
  let ranges = (annos || []).map(a => { const i = P.indexOf(a.text); return i < 0 ? null : { s: i, e: i + a.text.length, id: a.id }; })
    .filter(Boolean).sort((x, y) => x.s - y.s);
  let lastEnd = -1;
  ranges = ranges.filter(r => { if (r.s < lastEnd) return false; lastEnd = r.e; return true; });
  const covering = (s, e) => ranges.find(r => s < r.e && e > r.s) || null;

  const tokens = tokenize(P); let pos = 0, html = "";
  for (const t of tokens) {
    const s = pos, e = pos + t.text.length; pos = e;
    const cov = covering(s, e);
    if (cov) {
      if (t.type === "word")
        html += `<mark class="rd-anno" data-aid="${cov.id}"><span class="w" data-w="${escapeHtml(t.text)}" data-off="${baseOff + s}">${escapeHtml(t.text)}</span></mark>`;
      else
        html += `<mark class="rd-anno" data-aid="${cov.id}">${escapeHtml(t.text)}</mark>`;
    } else {
      if (t.type === "word")
        html += `<span class="w" data-w="${escapeHtml(t.text)}" data-off="${baseOff + s}">${escapeHtml(t.text)}</span>`;
      else
        html += escapeHtml(t.text);
    }
  }
  return html;
}

function renderArticle() {
  const art = CURRENT; const paras = art.paragraphs;
  const box = $("#article"); box.innerHTML = "";
  let base = 0;
  paras.forEach((p, i) => {
    const el = document.createElement("p");
    el.className = "rd-para"; el.dataset.pi = i;
    el.innerHTML = renderParagraph(p, art.annotations.filter(a => a.para === i), base);
    box.appendChild(el);
    base += p.length + 1; // +1 对应 join('\n')
  });
  // 收集词 span 供 TTS 高亮
  WORD_SPANS = $$("#article .w").map(el => ({ el, off: parseInt(el.dataset.off || "0", 10) }));
  WORD_SPANS.sort((a, b) => a.off - b.off);
  markVocabWords();
}

function markVocabWords() {
  const set = new Set(VOCAB.map(v => normW(v.word)));
  $$("#article .w").forEach(el => { if (set.has(normW(el.dataset.w))) el.classList.add("vocab"); });
}

function getSpokenText() { return CURRENT.paragraphs.join("\n"); }

/* ============================================================
   点词查询（核心功能）
   ============================================================ */
function sentencesInArticle(word) {
  const n = normW(word); if (!n) return [];
  const out = []; const all = CURRENT.raw.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || [];
  for (const s of all) { if (normW(s).includes(n)) out.push(s.trim()); if (out.length >= 4) break; }
  return out;
}

async function fetchDict(word) {
  const lower = word.toLowerCase();
  if (DICT_CACHE[lower]) return DICT_CACHE[lower];
  const info = { word, phonetic: "", pos: "", meaning: "", synonyms: [], antonyms: [], examples: [] };
    const local = LOCAL_DICT[lower];
    if (local) { info.phonetic = local.ph || ""; info.meaning = local.zh || ""; const seg = (local.zh || "").split(/[，,]/)[0].trim(); info.pos = /^([a-z]+\.?\s*)+$/i.test(seg) ? seg : ""; }
  try {
    const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(lower));
    if (r.ok) {
      const data = await r.json();
      const entries = Array.isArray(data) ? data : [];
      const phs = [];
      entries.forEach(en => (en.phonetics || []).forEach(p => { if (p.text) phs.push(p.text); }));
      if (!info.phonetic && phs[0]) info.phonetic = phs[0];
      const defs = [];
      entries.forEach(en => (en.meanings || []).forEach(m => {
        const pos = m.partOfSpeech || "";
        (m.definitions || []).forEach(d => {
          defs.push((pos ? pos + ". " : "") + (d.definition || ""));
          if (d.example) info.examples.push(d.example);
          if (d.synonyms) info.synonyms.push(...d.synonyms);
          if (d.antonyms) info.antonyms.push(...d.antonyms);
        });
        if (m.synonyms) info.synonyms.push(...m.synonyms);
        if (m.antonyms) info.antonyms.push(...m.antonyms);
      }));
      // 仅在不含本地中文释义时，用英文释义兜底
      if (!info.meaning && defs.length) {
        info.meaning = defs.slice(0, 4).join("；");
        info.pos = entries[0] && entries[0].meanings && entries[0].meanings[0] ? entries[0].meanings[0].partOfSpeech : "";
      }
      info.synonyms = [...new Set(info.synonyms)].slice(0, 12);
      info.antonyms = [...new Set(info.antonyms)].slice(0, 8);
      info.examples = [...new Set(info.examples)].slice(0, 3);
    }
  } catch (e) { /* 离线或限流，使用本地兜底 */ }
  DICT_CACHE[lower] = info;
  return info;
}

function openWordPop(word, x, y, display) {
  const pop = $("#wordPop");
  $("#popWord").textContent = display || word;
  $("#popPh").textContent = "查询中…";
  $("#popPos").textContent = "";
  $("#popMean").textContent = "";
  $("#popExtra").innerHTML = '<div class="rd-pop-loading">正在加载释义与拓展…</div>';
  pop.style.display = "block";
  // 定位（避免溢出视口）
  const pw = 320, ph = 340;
  let left = x + 12, top = y + 12;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, x - pw - 12);
  if (top + ph > window.innerHeight - 8) top = Math.max(8, y - ph - 12);
  pop.style.left = left + "px"; pop.style.top = top + "px";

  const sentence = sentencesInArticle(word)[0] || "";
  fetchDict(word).then(info => {
    $("#popPh").textContent = info.phonetic ? " /" + info.phonetic + "/　" + (SETTINGS.accent === "en-GB" ? "🇬🇧" : "🇺🇸") : "";
    $("#popPos").textContent = info.pos || "";
    $("#popPos").style.display = info.pos ? "inline-block" : "none";
    $("#popMean").textContent = info.meaning || "（未找到本地/在线释义）";
    // 联想拓展
    let html = "";
    const artEx = sentencesInArticle(word);
    if (artEx.length) {
      const wEsc = escapeHtml(word);
      html += "<div><h5>📖 本篇例句</h5>" +
        artEx.slice(0, 3).map(s => '<div class="ex">' + escapeHtml(s).split(wEsc).join('<span class="hlw">' + wEsc + "</span>") + "</div>").join("") +
        "</div>";
    }
    if (info.synonyms.length) html += '<div><h5>🔗 近义词</h5><div class="chips">' + info.synonyms.map(w => '<span class="chip">' + escapeHtml(w) + "</span>").join("") + "</div></div>";
    if (info.antonyms.length) html += '<div><h5>⚡ 反义词</h5><div class="chips">' + info.antonyms.map(w => '<span class="chip">' + escapeHtml(w) + "</span>").join("") + "</div></div>";
    if (info.examples.length) html += "<div><h5>💡 词典例句</h5>" + info.examples.map(s => '<div class="ex">' + escapeHtml(s) + "</div>").join("") + "</div>";
    const forms = getWordForms(word);
    if (forms.length) html += '<div><h5>🌱 词形（本地词库）</h5><div class="chips">' + forms.map(f => '<span class="chip" title="' + escapeHtml(f.zh) + '">' + escapeHtml(f.form) + "</span>").join("") + "</div></div>";
    $("#popExtra").innerHTML = html || '<div class="hint">暂无拓展信息</div>';
  });
  // 暂存当前词，供发音/加生词本使用
  pop._word = word; pop._display = display || word; pop._sentence = sentence;
}

function getWordForms(word) {
  const base = word.toLowerCase();
  const cands = new Set();
  const add = (s) => { if (LOCAL_DICT[s]) cands.add(s); };
  add(base + "s"); add(base + "es"); add(base + "ed"); add(base + "ing");
  add(base + "ly"); add(base + "ness"); add(base.replace(/y$/, "i") + "es"); add(base.replace(/y$/, "i") + "ed");
  return [...cands].map(s => ({ form: s, zh: LOCAL_DICT[s].zh })).slice(0, 8);
}

function closeWordPop() { $("#wordPop").style.display = "none"; }

/* ============================================================
   TTS 朗读（Web Speech API）
   ============================================================ */
let VOICES = [];
function loadVoices() { try { VOICES = speechSynthesis.getVoices() || []; } catch (e) { VOICES = []; } }
if ("speechSynthesis" in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
function pickVoice(accent) { return VOICES.find(v => v.lang === accent) || VOICES.find(v => v.lang && v.lang.startsWith(accent.slice(0, 2))) || null; }

let TTS = { state: "idle", utt: null, curHi: null };
function clearHi() { if (TTS.curHi) { TTS.curHi.classList.remove("hl"); TTS.curHi = null; } }
function speakText(text, opts) {
  if (!("speechSynthesis" in window)) { toast("当前浏览器不支持语音朗读"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = parseFloat($("#rateRange").value || "1");
  const v = pickVoice($("#accentSel").value || SETTINGS.accent); if (v) u.voice = v;
  if (opts && opts.highlight) {
    u.onboundary = (ev) => {
      const ci = ev.charIndex || 0;
      let hit = null;
      for (const s of WORD_SPANS) { if (s.off <= ci) hit = s; else break; }
      if (hit && hit.el !== TTS.curHi) { clearHi(); hit.el.classList.add("hl"); TTS.curHi = hit.el; }
    };
    u.onend = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
    u.onerror = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
  }
  TTS.utt = u; TTS.state = "playing";
  speechSynthesis.speak(u);
}
function playArticle() {
  if (TTS.state === "playing") { speechSynthesis.pause(); TTS.state = "paused"; $("#btnPlay").textContent = "⏸ 继续"; return; }
  if (TTS.state === "paused") { speechSynthesis.resume(); TTS.state = "playing"; $("#btnPlay").textContent = "⏸ 暂停"; return; }
  $("#btnPlay").textContent = "⏸ 暂停";
  speakText(getSpokenText(), { highlight: true });
}
function stopTTS() { speechSynthesis.cancel(); clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; }
function speakWord(w) {
  if (!("speechSynthesis" in window)) { toast("当前浏览器不支持发音"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w);
  const v = pickVoice($("#accentSel").value || SETTINGS.accent); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function readSelection() {
  const sel = window.getSelection(); const txt = (sel && sel.toString() || "").trim();
  if (!txt) { toast("请先在文章中选中一段文字"); return; }
  stopTTS(); speakText(txt, { highlight: false });
}

/* ============================================================
   翻译（Google gtx 免费端点 + MyMemory 兜底）
   ============================================================ */
async function gtranslate(text) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&q=" + encodeURIComponent(text) + "&sl=en&tl=zh-CN&dt=t";
  const r = await fetch(url); if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  return (j[0] || []).map(x => x[0]).join("");
}
async function myMemory(text) {
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en|zh-CN";
  const r = await fetch(url); const j = await r.json();
  return (j.responseData && j.responseData.translatedText) || (j.responseData && j.responseData.translatedText) || "";
}
async function translate(text) {
  if (!text || !text.trim()) return "";
  try { return await gtranslate(text); }
  catch (e) { try { return await myMemory(text); } catch (e2) { return "（翻译服务暂不可用，请检查网络）"; } }
}
function splitChunks(text, max = 4000) {
  if (text.length <= max) return [text];
  const chunks = []; let cur = "";
  for (const p of text.split(/\n+/)) {
    if ((cur + "\n" + p).length > max) { if (cur) chunks.push(cur); cur = p; }
    else cur = cur ? cur + "\n" + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}
async function translateLong(text) {
  const chunks = splitChunks(text); const out = [];
  for (const c of chunks) out.push(await translate(c));
  return out.join("\n");
}

/* 主旨总结（提取式：每段首句）+ 长难句解析 */
function extractiveSummary() {
  const firsts = CURRENT.paragraphs.map(p => {
    const s = (p.match(/[^.!?]+[.!?]*/g) || [p])[0] || "";
    return s.trim();
  }).filter(Boolean);
  return firsts.join(" ");
}
function longSentences() {
  const all = (CURRENT.raw.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || []).map(s => s.trim());
  return all.filter(s => s.length > 100 || (s.match(/,/g) || []).length >= 3);
}
async function renderTranslationAndAI() {
  $("#trSummary").innerHTML = '<div class="rd-ai-loading">⏳ 正在翻译全文大意…</div>';
  $("#trPara").innerHTML = '<div class="rd-ai-loading">⏳ 正在生成逐段对照…</div>';
  $("#trAI").innerHTML = '<div class="rd-ai-loading">⏳ 正在生成主旨与长难句解析…</div>';

  // 全文大意
  const summaryZh = await translateLong(CURRENT.raw);
  $("#trSummary").innerHTML = '<div class="t">📝 全文大意（意译）</div>' + escapeHtml(summaryZh);

  // 逐段对照
  const blocks = await Promise.all(CURRENT.paragraphs.map(async p => {
    const zh = await translate(p);
    return '<div class="rd-tr-block"><div class="rd-tr-en">' + escapeHtml(p) + '</div><div class="rd-tr-zh">' + escapeHtml(zh) + "</div></div>";
  }));
  $("#trPara").innerHTML = blocks.join("");

  // 主旨 + 长难句
  const llm = SETTINGS.llm && SETTINGS.llm.base && SETTINGS.llm.key ? SETTINGS.llm : null;
  let mainIdea, longHtml;
  if (llm) {
    mainIdea = await llmChat("你是英语老师，请用中文用 3-5 句话概括下面英文文章的主旨，简洁、面向中文学习者。", CURRENT.raw);
  }
  if (!mainIdea) mainIdea = await translate(extractiveSummary());
  let ai = '<div class="rd-ai-card"><h4>🧠 主旨总结</h4><div class="ai-body">' + escapeHtml(mainIdea || "（无）") + "</div></div>";

  const longs = longSentences();
  if (longs.length) {
    const items = await Promise.all(longs.slice(0, 6).map(async s => {
      const zh = await translate(s);
      const clauses = s.split(/[,;]|\s(?:and|but|because|although|which|that|who|when|while)\s/i).map(c => c.trim()).filter(Boolean);
      const clauseHtml = clauses.length > 1 ? '<ul style="margin:4px 0 0 18px;font-size:13px;color:#55636f">' + clauses.map(c => "<li>" + escapeHtml(c) + "</li>").join("") + "</ul>" : "";
      return '<div class="rd-ai-card"><h4>📐 长难句</h4><div class="ai-body"><b>' + escapeHtml(s) + "</b>" + clauseHtml + "<div style='margin-top:6px;color:#33414f'>" + escapeHtml(zh) + "</div></div></div>";
    }));
    ai += items.join("");
  } else {
    ai += '<div class="rd-ai-card"><h4>📐 长难句</h4><div class="ai-body">本文未检测到明显长难句，继续保持～</div></div>';
  }
  $("#trAI").innerHTML = ai;
}

/* 可选 LLM 调用（OpenAI 兼容） */
async function llmChat(system, user) {
  try {
    const { base, key, model } = SETTINGS.llm;
    const r = await fetch(base.replace(/\/$/, "") + "/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + key },
      body: JSON.stringify({ model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 0.3 })
    });
    const j = await r.json();
    return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || null;
  } catch (e) { return null; }
}

/* ============================================================
   文库（文章保存 / 列表 / 打开 / 删除）
   ============================================================ */
function splitParagraphs(text) {
  return text.split(/\n+/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function startFromText(text) {
  const paras = splitParagraphs(text);
  if (!paras.length) { toast("没有可识别的英文段落"); return; }
  CURRENT = { id: null, title: "", tags: [], notes: "", raw: paras.join("\n"), paragraphs: paras, createdAt: todayStr(), updatedAt: todayStr(), annotations: [] };
  enterReader();
}
function enterReader() {
  $("#artTitle").value = CURRENT.title || "";
  $("#artTags").value = (CURRENT.tags || []).join(", ");
  $("#artNotes").value = CURRENT.notes || "";
  showView("Reader");
  renderArticle();
  renderAnnoList();
  renderTranslationAndAI();
}
function saveArticle() {
  if (!CURRENT) return;
  CURRENT.title = $("#artTitle").value.trim() || ("未命名文章 " + todayStr());
  CURRENT.tags = $("#artTags").value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
  CURRENT.notes = $("#artNotes").value;
  CURRENT.updatedAt = todayStr();
  if (!CURRENT.id) { CURRENT.id = uid(); CURRENT.createdAt = todayStr(); LIB.unshift(CURRENT); }
  else { const i = LIB.findIndex(a => a.id === CURRENT.id); if (i >= 0) LIB[i] = CURRENT; else LIB.unshift(CURRENT); }
  saveJSON(K_LIB, LIB);
  toast("已保存到文库 ✓");
}
function openArticle(id) {
  const a = LIB.find(x => x.id === id); if (!a) return;
  CURRENT = JSON.parse(JSON.stringify(a));
  if (!CURRENT.annotations) CURRENT.annotations = [];
  $$(".modal.show").forEach(m => m.classList.remove("show"));
  enterReader();
}
function deleteArticle(id) {
  if (!confirm("确定删除这篇文章？此操作不可撤销。")) return;
  LIB = LIB.filter(a => a.id !== id); saveJSON(K_LIB, LIB);
  if (CURRENT && CURRENT.id === id) CURRENT = null;
  renderHome(); renderLibList();
  toast("已删除");
}
function renderLibList() {
  const grid = $("#libGrid"); const kw = ($("#libSearch").value || "").toLowerCase();
  let list = LIB.slice();
  if (kw) list = list.filter(a => (a.title + " " + (a.tags || []).join(" ") + " " + a.raw).toLowerCase().includes(kw));
  if (!list.length) { grid.innerHTML = '<div class="rd-empty">文库还是空的，去导入第一篇英文吧～</div>'; return; }
  grid.innerHTML = list.map(a => {
    const prev = (a.raw || "").slice(0, 80).replace(/\n/g, " ");
    const tags = (a.tags || []).map(t => '<span class="lc-tag">' + escapeHtml(t) + "</span>").join("");
    return '<div class="rd-lib-card" data-id="' + a.id + '">' +
      '<div class="lc-title">' + escapeHtml(a.title || "未命名") + "</div>" +
      '<div class="lc-preview">' + escapeHtml(prev) + "</div>" +
      (tags ? '<div class="lc-tags">' + tags + "</div>" : "") +
      '<div class="lc-foot"><span>' + (a.updatedAt || "") + '</span>' +
      '<div class="lc-acts"><button class="btn" data-act="open" data-id="' + a.id + '">打开</button>' +
      '<button class="btn danger" data-act="del" data-id="' + a.id + '">删</button></div></div></div>';
  }).join("");
}

/* ============================================================
   生词本
   ============================================================ */
function addVocab(display, info, sentence) {
  const key = normW(display);
  if (VOCAB.find(v => normW(v.word) === key)) { toast("该词已在生词本"); return; }
  VOCAB.unshift({
    word: display, key, phonetic: (info && info.phonetic) || "", pos: (info && info.pos) || "",
    meaning: (info && info.meaning) || "", fromTitle: CURRENT ? (CURRENT.title || "未命名") : "",
    fromId: CURRENT && CURRENT.id ? CURRENT.id : "", sentence: sentence || "",
    addedAt: todayStr(), mastered: false, level: 0, nextReview: todayStr()
  });
  saveJSON(K_VOCAB, VOCAB); markVocabWords(); updateVocabDue();
  toast("已加入生词本 ⭐");
}
function renderVocabList() {
  const box = $("#vocabList"); const kw = ($("#vocabSearch").value || "").toLowerCase();
  let list = VOCAB.slice();
  if (kw) list = list.filter(v => v.word.toLowerCase().includes(kw));
  if (!list.length) { box.innerHTML = '<div class="rd-empty">生词本还是空的，点词即可加入。</div>'; return; }
  box.innerHTML = list.map(v => {
    const acts = '<button class="btn sm" data-v="speak" data-w="' + escapeHtml(v.word) + '">🔊</button>' +
      '<button class="btn sm" data-v="master" data-id="' + v.key + '">' + (v.mastered ? "↺ 复习中" : "✓ 掌握") + "</button>" +
      (v.fromId ? '<button class="btn sm" data-v="jump" data-id="' + v.fromId + '" data-s="' + escapeHtml(v.sentence) + '">跳转</button>' : "") +
      '<button class="btn sm danger" data-v="del" data-id="' + v.key + '">删</button>';
    return '<div class="vrow' + (v.mastered ? " mastered" : "") + '"><div class="v-main">' +
      '<div><span class="v-word">' + escapeHtml(v.word) + '</span><span class="v-ph">' + escapeHtml(v.phonetic) + "</span></div>" +
      '<div class="v-mean">' + escapeHtml(v.meaning) + "</div>" +
      '<div class="v-from">出自：《' + escapeHtml(v.fromTitle) + '》' + (v.sentence ? ' — “' + escapeHtml(v.sentence.slice(0, 60)) + '”' : "") + "</div></div>" +
      '<div class="v-acts">' + acts + "</div></div>";
  }).join("");
}
function updateVocabDue() {
  const due = VOCAB.filter(v => !v.mastered && v.nextReview <= todayStr()).length;
  const b = $("#vocabDue"); if (b) b.textContent = "待复习 " + due;
}
function reviewVocab() {
  const queue = VOCAB.filter(v => !v.mastered && v.nextReview <= todayStr());
  if (!queue.length) { toast("今天没有待复习的生词 🎉"); return; }
  let i = 0;
  const body = $("#reviewBody");
  function show() {
    if (i >= queue.length) { body.innerHTML = '<div class="rd-review-card"><div class="rv-word">🎉 复习完成！</div></div>'; return; }
    const v = queue[i];
    body.innerHTML = '<div class="rd-review-prog">进度 ' + (i + 1) + " / " + queue.length + '</div>' +
      '<div class="rd-review-card"><div class="rv-word">' + escapeHtml(v.word) + '</div>' +
      '<div class="rv-ph">' + escapeHtml(v.phonetic) + '</div>' +
      '<button class="btn sm" id="rvShow">显示答案</button>' +
      '<div class="rv-mean" id="rvMean" style="display:none">' + escapeHtml(v.meaning) + (v.sentence ? '<div style="font-size:13px;color:#667">“' + escapeHtml(v.sentence.slice(0, 80)) + '”</div>' : "") + "</div>" +
      '<div class="rv-acts" id="rvActs" style="display:none">' +
      '<button class="btn primary sm" id="rvKnow">认识 ✓</button>' +
      '<button class="btn sm" id="rvUnknown">不认识 ✗</button></div></div>';
    $("#rvShow").onclick = () => { $("#rvMean").style.display = "block"; $("#rvActs").style.display = "flex"; };
    $("#rvKnow").onclick = () => { v.level = Math.min(v.level + 1, 6); v.nextReview = todayStr(dateAdd(new Date(), [0, 1, 2, 4, 7, 15, 30][v.level])); saveJSON(K_VOCAB, VOCAB); i++; show(); };
    $("#rvUnknown").onclick = () => { v.level = 0; v.nextReview = todayStr(); saveJSON(K_VOCAB, VOCAB); i++; show(); };
  }
  show();
  openModal("#reviewModal");
}

/* ============================================================
   阅读打卡
   ============================================================ */
function doCheckin() {
  const t = todayStr();
  if (CHECKINS.includes(t)) { toast("今天已打卡"); return; }
  CHECKINS.push(t); saveJSON(K_CHECK, CHECKINS); renderCheckin(); toast("打卡成功 🔥");
}
function calcStreak() {
  const set = new Set(CHECKINS); let n = 0; let d = new Date();
  if (!set.has(todayStr(d))) { // 今天未打卡则从昨天往前
    d = dateAdd(d, -1);
  }
  while (set.has(todayStr(d))) { n++; d = dateAdd(d, -1); }
  return n;
}
function renderCheckin() {
  const set = new Set(CHECKINS);
  $("#streakNum").textContent = "🔥 连续 " + calcStreak() + " 天";
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const first = new Date(y, m, 1), startDow = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let html = ["日", "一", "二", "三", "四", "五", "六"].map(d => '<div class="cdow">' + d + "</div>").join("");
  for (let i = 0; i < startDow; i++) html += '<div class="cday out"></div>';
  for (let d = 1; d <= days; d++) {
    const ds = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const cls = "cday" + (set.has(ds) ? " done" : "") + (ds === todayStr() ? " today" : "");
    html += '<div class="' + cls + '" data-d="' + ds + '">' + d + "</div>";
  }
  $("#checkinCal").innerHTML = html;
  $("#checkinHint").textContent = "累计打卡 " + CHECKINS.length + " 天。点击日期可补卡。";
}

/* ============================================================
   批注（长难句划线 / 笔记）
   ============================================================ */
function addAnnoFromSelection() {
  const sel = window.getSelection(); const txt = (sel && sel.toString() || "").trim();
  if (!txt) { toast("请先选中要划线的句子"); return; }
  // 找到选中文本所属段落
  let para = -1;
  if (sel.anchorNode) { const p = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode).closest(".rd-para"); if (p) para = parseInt(p.dataset.pi, 10); }
  if (para < 0) { toast("请在文章正文中选中"); return; }
  if (CURRENT.paragraphs[para].indexOf(txt) < 0 && !CURRENT.paragraphs[para].includes(txt.slice(0, 20))) {
    // 跨段或不精确，放到所属段
  }
  const note = prompt("为这句批注写点笔记（可留空）：", "") || "";
  CURRENT.annotations.push({ id: uid(), text: txt, para, note, createdAt: todayStr() });
  sel.removeAllRanges();
  $("#selBar").style.display = "none";
  renderArticle(); renderAnnoList();
}
function renderAnnoList() {
  const box = $("#annoList"); const list = CURRENT ? CURRENT.annotations : [];
  if (!list.length) { box.innerHTML = '<div class="rd-empty">还没有批注。在文章中选中句子后点「🖍 划线批注」即可。</div>'; return; }
  box.innerHTML = list.map(a => '<div class="list-row"><div class="lr-main">' + escapeHtml(a.text.slice(0, 90)) +
    (a.note ? '<div class="lr-sub">📝 ' + escapeHtml(a.note) + "</div>" : "") + "</div>" +
    '<button class="del" data-aid="' + a.id + '">删</button></div>').join("");
}
function openAnnoNote(aid) {
  const a = CURRENT && CURRENT.annotations.find(x => x.id === aid);
  if (!a) return;
  const note = prompt("编辑批注笔记：", a.note || "");
  if (note === null) return;
  a.note = note; renderAnnoList();
}

/* ============================================================
   UI 辅助：模态框
   ============================================================ */
function openModal(sel) { const m = $(sel); if (m) m.classList.add("show"); }
function closeModal(sel) { const m = $(sel); if (m) m.classList.remove("show"); }

/* ============================================================
   首页渲染
   ============================================================ */
function renderHome() {
  const stats = [
    { v: LIB.length, l: "文库文章" },
    { v: VOCAB.length, l: "生词总数" },
    { v: CHECKINS.length, l: "打卡天数" }
  ];
  $("#homeStats").innerHTML = stats.map(s => '<div class="rd-stat"><div class="rs-v">' + s.v + '</div><div class="rs-l">' + s.l + "</div></div>").join("");
  renderLibList();
  updateVocabDue();
}

/* ============================================================
   OCR 多线路重试
   ============================================================ */
async function runOCRWithFallback(Tess, file, logger) {
  // 根据已加载的脚本版本推断基础 CDN，并准备回退
  const bases = [];
  const scripts = Array.from(document.querySelectorAll('script[src*="tesseract"]'));
  const loadedSrc = scripts.find(s => /tesseract(\.min)?\.js/.test(s.src))?.src || '';
  if (loadedSrc.includes('jsdelivr.net')) bases.push('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist');
  if (loadedSrc.includes('unpkg.com')) bases.push('https://unpkg.com/tesseract.js@5.1.1/dist');
  if (loadedSrc.includes('bootcdn.net')) bases.push('https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1');
  // 保底再试一遍常见 CDN
  bases.push('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist');
  bases.push('https://unpkg.com/tesseract.js@5.1.1/dist');
  bases.push('https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1');

  const langPath = 'https://tessdata.projectnaptha.com/4.0.0_best';
  const seen = new Set();
  let lastErr = null;
  for (const base of bases) {
    if (seen.has(base)) continue; seen.add(base);
    let worker;
    try {
      worker = await Tess.createWorker('eng', 1, {
        workerPath: base + '/worker.min.js',
        langPath: langPath,
        logger: logger,
        errorHandler: e => console.warn('OCR worker warn:', e)
      });
      const res = await worker.recognize(file);
      return res;
    } catch (e) {
      lastErr = e;
      console.warn('OCR 线路失败:', base, e.message);
    } finally {
      if (worker) try { await worker.terminate(); } catch (_) {}
    }
  }
  throw lastErr || new Error('所有 OCR 识别线路均不可用');
}

/* ============================================================
   事件绑定
   ============================================================ */
function bind() {
  // 导入 Tab 切换
  $$(".rd-tabs .subnav-btn").forEach(b => b.addEventListener("click", () => {
    $$(".rd-tabs .subnav-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    const t = b.dataset.tab;
    $("#tabPaste").style.display = t === "paste" ? "block" : "none";
    $("#tabOcr").style.display = t === "ocr" ? "block" : "none";
  }));
  // 粘贴字数
  $("#pasteArea").addEventListener("input", () => {
    const n = $("#pasteArea").value.trim().split(/\s+/).filter(Boolean).length;
    $("#pasteCount").textContent = n ? "约 " + n + " 词" : "";
  });
  $("#btnStartRead").addEventListener("click", () => {
    const t = $("#pasteArea").value;
    if (!t.trim()) { toast("请先粘贴英文文章"); return; }
    startFromText(t);
  });

  // OCR（带多 CDN 重试与显式 worker/lang 路径）
  $("#ocrFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    $("#ocrStatus").textContent = "⏳ 正在加载 OCR 引擎，请稍候…";
    try {
      const Tess = await Promise.race([
        (window._loadTesseractPromise || Promise.resolve(window.Tesseract)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("OCR 引擎加载超时")), 20000))
      ]);
      if (!Tess) throw new Error("OCR 引擎未加载（网络不可用）。可改用「粘贴文本」方式。");
      $("#ocrStatus").textContent = "⏳ 正在识别图片文字（首次需下载识别数据，约 10 MB，请稍候）…";

      const res = await runOCRWithFallback(Tess, f, (m) => {
        if (m.status === "recognizing text") $("#ocrStatus").textContent = "⏳ 识别中… " + Math.round((m.progress || 0) * 100) + "%";
        else if (m.status === "loading language traineddata") $("#ocrStatus").textContent = "⏳ 正在下载英文识别数据… " + Math.round((m.progress || 0) * 100) + "%";
      });
      $("#ocrResult").value = res.data.text;
      $("#ocrResult").style.display = "block"; $("#ocrActions").style.display = "flex";
      $("#ocrStatus").textContent = "✅ 识别完成，请检查并修改错字后导入。";
    } catch (err) {
      console.error(err);
      $("#ocrStatus").innerHTML = "❌ 识别失败：" + escapeHtml(err.message) +
        "<br/><small>建议：①切换网络后重试 ②改用上方「粘贴文本」导入</small>";
    }
    e.target.value = "";
  });
  $("#btnOcrImport").addEventListener("click", () => {
    const t = $("#ocrResult").value;
    if (!t.trim()) { toast("没有可导入的文字"); return; }
    startFromText(t);
  });

  // 顶栏
  $("#btnLib").addEventListener("click", () => { renderLibListM(); openModal("#libModal"); });
  $("#btnVocab").addEventListener("click", () => { renderVocabList(); updateVocabDue(); openModal("#vocabModal"); });
  $("#btnCheckin").addEventListener("click", () => { renderCheckin(); openModal("#checkinModal"); });
  $("#btnSettings").addEventListener("click", openSettings);

  // 精读页
  $("#btnBackHome").addEventListener("click", () => { if (CURRENT && !CURRENT.id) { if (!confirm("当前文章尚未保存，返回将丢失。确定？")) return; } showView("Home"); });
  $("#btnSaveArticle").addEventListener("click", saveArticle);
  $("#btnPlay").addEventListener("click", playArticle);
  $("#btnStop").addEventListener("click", stopTTS);
  $("#btnReadSel").addEventListener("click", readSelection);
  $("#rateRange").addEventListener("input", () => { $("#rateVal").textContent = parseFloat($("#rateRange").value).toFixed(2) + "x"; });
  $("#btnToggleTr").addEventListener("click", () => {
    const hide = $("#trPara").classList.toggle("hide-zh");
    $("#btnToggleTr").textContent = hide ? "显示译文" : "隐藏译文";
  });

  // 文库卡片点击
  $("#libGrid").addEventListener("click", (e) => {
    const card = e.target.closest(".rd-lib-card"); if (!card) return;
    const id = card.dataset.id; const actBtn = e.target.closest("button[data-act]");
    if (actBtn) { e.stopPropagation(); const a = actBtn.dataset.act; if (a === "del") deleteArticle(id); else openArticle(id); return; }
    openArticle(id);
  });
  $("#libSearch").addEventListener("input", renderLibList);

  // 文库弹窗列表
  $("#libListM").addEventListener("click", (e) => {
    const row = e.target.closest("[data-id]"); if (!row) return;
    openArticle(row.dataset.id);
  });
  $("#libSearchM").addEventListener("input", renderLibListM);

  // 生词本弹窗
  $("#btnReview").addEventListener("click", reviewVocab);
  $("#vocabSearch").addEventListener("input", renderVocabList);
  $("#vocabList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    const act = b.dataset.v, id = b.dataset.id, w = b.dataset.w;
    if (act === "speak") speakWord(w);
    else if (act === "del") { VOCAB = VOCAB.filter(v => v.key !== id); saveJSON(K_VOCAB, VOCAB); renderVocabList(); updateVocabDue(); markVocabWords(); }
    else if (act === "master") { const v = VOCAB.find(x => x.key === id); if (v) { v.mastered = !v.mastered; saveJSON(K_VOCAB, VOCAB); renderVocabList(); updateVocabDue(); } }
    else if (act === "jump") { openArticle(id); const s = b.dataset.s; setTimeout(() => { const m = $$("#article .rd-para").find(p => p.textContent.includes(s.slice(0, 20))); if (m) m.scrollIntoView({ behavior: "smooth", block: "center" }); }, 200); }
  });

  // 打卡
  $("#btnDoCheckin").addEventListener("click", doCheckin);
  $("#checkinCal").addEventListener("click", (e) => {
    const d = e.target.dataset.d; if (!d) return;
    if (CHECKINS.includes(d)) { CHECKINS = CHECKINS.filter(x => x !== d); toast("已取消 " + d + " 打卡"); }
    else { CHECKINS.push(d); toast("已补卡 " + d); }
    saveJSON(K_CHECK, CHECKINS); renderCheckin();
  });

  // 弹窗关闭
  $$("[data-close]").forEach(b => b.addEventListener("click", () => b.closest(".modal").classList.remove("show")));
  $$(".modal").forEach(m => m.addEventListener("click", (e) => { if (e.target === m) m.classList.remove("show"); }));

  // 文章点词 / 批注
  $("#article").addEventListener("click", (e) => {
    const w = e.target.closest(".w");
    if (w) { e.stopPropagation(); const r = w.getBoundingClientRect(); openWordPop(w.dataset.w, r.left + r.width / 2, r.top, w.textContent); return; }
    const mk = e.target.closest(".rd-anno");
    if (mk) { openAnnoNote(mk.dataset.aid); }
  });

  // 选词浮窗按钮
  $("#popClose").addEventListener("click", closeWordPop);
  $("#popSpeak").addEventListener("click", () => { const p = $("#wordPop"); if (p._word) speakWord(p._display || p._word); });
  $("#popAddVocab").addEventListener("click", () => {
    const p = $("#wordPop"); const info = DICT_CACHE[(p._word || "").toLowerCase()];
    addVocab(p._display || p._word, info, p._sentence);
    closeWordPop();
  });

  // 选中文本批注工具条
  document.addEventListener("mouseup", () => {
    setTimeout(() => {
      const sel = window.getSelection();
      const txt = (sel && sel.toString() || "").trim();
      const inArticle = sel && sel.anchorNode && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode).closest && (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode).closest(".rd-para");
      if (txt.length > 1 && inArticle && $("#viewReader").classList.contains("active")) {
        const r = sel.getRangeAt(0).getBoundingClientRect();
        const bar = $("#selBar"); bar.style.display = "block";
        bar.style.left = Math.min(r.left, window.innerWidth - 120) + "px";
        bar.style.top = (r.bottom + 6) + "px";
      } else { $("#selBar").style.display = "none"; }
    }, 10);
  });
  $("#selAnno").addEventListener("click", addAnnoFromSelection);

  // 批注列表删除
  $("#annoList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-aid]"); if (!b) return;
    CURRENT.annotations = CURRENT.annotations.filter(a => a.id !== b.dataset.aid);
    renderArticle(); renderAnnoList();
  });

  // 设置
  $("#setAccent").value = SETTINGS.accent || "en-US";
  $("#setRate").value = String(SETTINGS.rate || 1);
  $("#llmBase").value = (SETTINGS.llm && SETTINGS.llm.base) || "";
  $("#llmKey").value = (SETTINGS.llm && SETTINGS.llm.key) || "";
  $("#llmModel").value = (SETTINGS.llm && SETTINGS.llm.model) || "";
  $("#btnSettings").addEventListener("click", () => {}); // 已绑定上方
  $("#setAccent").addEventListener("change", () => { SETTINGS.accent = $("#setAccent").value; saveJSON(K_SET, SETTINGS); $("#accentSel").value = SETTINGS.accent; });
  $("#setRate").addEventListener("change", () => { SETTINGS.rate = parseFloat($("#setRate").value); saveJSON(K_SET, SETTINGS); $("#rateRange").value = SETTINGS.rate; $("#rateVal").textContent = SETTINGS.rate.toFixed(2) + "x"; });
  $("#btnExportData").addEventListener("click", exportData);
  $("#btnImportData").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", importData);
  $("#btnClearData").addEventListener("click", () => {
    if (!confirm("确定清空全部精读数据（文库/生词/打卡/设置）？此操作不可撤销。")) return;
    [K_LIB, K_VOCAB, K_CHECK, K_SET].forEach(k => localStorage.removeItem(k));
    LIB = []; VOCAB = []; CHECKINS = []; SETTINGS = { accent: "en-US", rate: 1, llm: { base: "", key: "", model: "" } };
    toast("已清空"); renderHome();
  });

  // 点击空白关闭浮窗
  document.addEventListener("click", (e) => {
    const pop = $("#wordPop");
    if (pop.style.display === "block" && !pop.contains(e.target) && !e.target.closest(".w")) pop.style.display = "none";
    const sb = $("#selBar");
    if (sb.style.display === "block" && !sb.contains(e.target)) sb.style.display = "none";
  });
}

function renderLibListM() {
  const kw = ($("#libSearchM").value || "").toLowerCase();
  let list = LIB.slice();
  if (kw) list = list.filter(a => (a.title + " " + (a.tags || []).join(" ") + " " + a.raw).toLowerCase().includes(kw));
  const box = $("#libListM");
  if (!list.length) { box.innerHTML = '<div class="rd-empty">文库为空</div>'; return; }
  box.innerHTML = list.map(a => '<div class="list-row" data-id="' + a.id + '" style="cursor:pointer"><div class="lr-main">' + escapeHtml(a.title || "未命名") +
    '<div class="lr-sub">' + (a.tags || []).map(t => "#" + escapeHtml(t)).join(" ") + " · " + (a.updatedAt || "") + "</div></div>" +
    '<button class="del" data-act="del" data-id="' + a.id + '">删</button></div>').join("");
  box.querySelectorAll("button[data-act=del]").forEach(b => b.addEventListener("click", (e) => { e.stopPropagation(); deleteArticle(b.dataset.id); renderLibListM(); }));
}

function openSettings() {
  $("#settingsStatus").textContent = "";
  openModal("#settingsModal");
}
function exportData() {
  const data = { lib: LIB, vocab: VOCAB, checkins: CHECKINS, settings: SETTINGS, exportedAt: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "fitdesk-reading-" + todayStr() + ".json"; a.click();
  toast("已导出精读数据");
}
function importData(e) {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const d = JSON.parse(rd.result);
      if (d.lib) LIB = d.lib; if (d.vocab) VOCAB = d.vocab; if (d.checkins) CHECKINS = d.checkins;
      if (d.settings) SETTINGS = d.settings;
      saveJSON(K_LIB, LIB); saveJSON(K_VOCAB, VOCAB); saveJSON(K_CHECK, CHECKINS); saveJSON(K_SET, SETTINGS);
      toast("导入成功 ✓"); renderHome();
    } catch (err) { toast("导入失败：" + err.message); }
  };
  rd.readAsText(f);
}

/* ---------------- 初始化 ---------------- */
function init() {
  bind();
  $("#accentSel").value = SETTINGS.accent || "en-US";
  $("#rateRange").value = SETTINGS.rate || 1;
  $("#rateVal").textContent = (SETTINGS.rate || 1).toFixed(2) + "x";
  showView("Home");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
