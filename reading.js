/* ============================================================
   英语精读学习 · reading.js
   纯前端：localStorage 存储 + 免费公开接口（免密钥）
   - 词典：Free Dictionary API + 本地 words1800 兜底
   - 翻译：Google 翻译(免费 gtx 端点) + MyMemory 兜底
   - 朗读：Edge TTS 免费自然语音（WebSocket 直连）+ Web Speech 自动回退
   - OCR：Tesseract.js（CDN）
   功能：点词查词 / 释义弹窗 / 翻译对照 / 生词本 / 朗读跟读 / 文库保存 /
        编辑-阅读双模式 / 手动分段 / 排版优化 / 阅读打卡 / 长难句批注
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
let SETTINGS = loadJSON(K_SET, { accent: "en-US", rate: 1, pitch: 1, engine: "auto", useLLMForTranslation: false, llm: { base: "", key: "", model: "" } });

/* 当前正在阅读的文章（内存态） */
let CURRENT = null;          // {id,title,tags,notes,raw,paragraphs,createdAt,updatedAt,annotations}
let WORD_SPANS = [];         // [{el, off}] 供 TTS 高亮
let MODE = "read";           // read | edit
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
   编辑 / 阅读 模式切换
   ============================================================ */
function setMode(mode) {
  MODE = mode;
  const edit = mode === "edit";
  const ec = $("#editCard"), ac = $("#articleCard"), tc = $("#ttsCard");
  if (ec) ec.style.display = edit ? "block" : "none";
  if (ac) ac.style.display = edit ? "none" : "block";
  if (tc) tc.style.display = edit ? "none" : "block";
  const be = $("#btnModeEdit"), br = $("#btnModeRead");
  if (be) be.classList.toggle("active", edit);
  if (br) br.classList.toggle("active", !edit);
  if (edit) { const ea = $("#editArea"); if (ea && CURRENT) ea.value = CURRENT.paragraphs.join("\n"); }
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
  // 让浏览器先排版，再取实际宽高做边界保护
  const rect = pop.getBoundingClientRect();
  const pw = Math.min(rect.width || 300, window.innerWidth - 16);
  const ph = rect.height || 340;
  let left = x + 12, top = y + 12;
  if (left + pw > window.innerWidth - 8) left = Math.max(8, x - pw - 12);
  if (top + ph > window.innerHeight - 8) top = Math.max(8, y - ph - 12);
  if (left < 8) left = 8;
  pop.style.left = left + "px"; pop.style.top = top + "px";

  const sentence = sentencesInArticle(word)[0] || "";
  fetchDict(word).then(info => {
    $("#popPh").textContent = info.phonetic ? " /" + info.phonetic + "/　" + (SETTINGS.accent === "en-GB" ? "🇬🇧" : "🇺🇸") : "";
    $("#popPos").textContent = info.pos || "";
    $("#popPos").style.display = info.pos ? "inline-block" : "none";
    $("#popMean").textContent = info.meaning || "（未找到本地/在线释义）";
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
   TTS 朗读
   - 主引擎：Edge TTS（免费自然语音，WebSocket 直连）
   - 回退：浏览器 Web Speech（网络/跨域受限时自动启用）
   ============================================================ */
const EDGE_TOKEN = "6A5AA1D4EAFF4E9FB37E23C708FK444A";
const VOICE_LIST = {
  "en-US": [
    { id: "en-US-AriaNeural", label: "Aria 女声" },
    { id: "en-US-DavisNeural", label: "Davis 男声" },
    { id: "en-US-GuyNeural", label: "Guy 男声" },
    { id: "en-US-JennyNeural", label: "Jenny 女声" },
    { id: "en-US-JasonNeural", label: "Jason 男声" },
    { id: "en-US-SaraNeural", label: "Sara 女声" }
  ],
  "en-GB": [
    { id: "en-GB-RyanNeural", label: "Ryan 男声" },
    { id: "en-GB-SoniaNeural", label: "Sonia 女声" },
    { id: "en-GB-LibbyNeural", label: "Libby 女声" },
    { id: "en-GB-MaisieNeural", label: "Maisie 女声" },
    { id: "en-GB-ThomasNeural", label: "Thomas 男声" }
  ]
};
let WEBSPEECH_VOICES = [];
let WEBSPEECH_VOICES_LOADED = false; // true when getVoices() returns at least one voice
let WEBSPEECH_LOAD_FAILED = false;   // true when voices could not be loaded after timeout
let CURRENT_VOICE_MODE = "edge"; // 'edge' 或 'webspeech'，决定音色下拉展示哪类

function isWebSpeechForced() { return SETTINGS.engine === "webspeech"; }
function preferredEngine() { return isWebSpeechForced() ? "webspeech" : "auto"; }
function actualVoiceMode() {
  if (isWebSpeechForced() || TTS.engine === "webspeech" || TTS.fallbackToWebSpeech) return "webspeech";
  return "edge";
}
function setEngineFallback(fallback) {
  TTS.fallbackToWebSpeech = !!fallback;
  if (fallback && "speechSynthesis" in window) loadVoices();
  populateVoices();
  updateEngineUI();
}

function populateVoices() {
  const sel = $("#voiceSel"); if (!sel) return;
  const mode = actualVoiceMode();
  CURRENT_VOICE_MODE = mode;
  const acc = ($("#accentSel") && $("#accentSel").value) || SETTINGS.accent || "en-US";

  if (mode === "webspeech") {
    // 系统语音：按口音过滤，名字就是 label
    if (!WEBSPEECH_VOICES.length) {
      const hint = WEBSPEECH_LOAD_FAILED
        ? "当前浏览器未返回系统语音（建议换 Chrome/Edge/Safari）"
        : "系统语音加载中…";
      sel.innerHTML = '<option value="">' + hint + '</option>';
      sel.disabled = true; return;
    }
    let list = WEBSPEECH_VOICES.filter(v => (v.lang || "").toLowerCase().startsWith(acc.toLowerCase()));
    // 找不到精确口音时，回退到同一语系（en-US↔en-GB 互备）
    if (!list.length && acc.toLowerCase() === "en-us") list = WEBSPEECH_VOICES.filter(v => (v.lang || "").toLowerCase().startsWith("en-gb"));
    if (!list.length && acc.toLowerCase() === "en-gb") list = WEBSPEECH_VOICES.filter(v => (v.lang || "").toLowerCase().startsWith("en-us"));
    if (!list.length) list = WEBSPEECH_VOICES.filter(v => (v.lang || "").toLowerCase().startsWith("en"));
    if (!list.length) {
      sel.innerHTML = '<option value="">当前系统无英文语音</option>';
      sel.disabled = true; return;
    }
    sel.disabled = false;
    sel.innerHTML = list.map(v => '<option value="' + escapeHtml(v.voiceURI || v.name) + '">' + escapeHtml(v.name || v.lang) + "</option>").join("");
    if (SETTINGS.webSpeechVoice && list.some(v => (v.voiceURI || v.name) === SETTINGS.webSpeechVoice)) sel.value = SETTINGS.webSpeechVoice;
    else { sel.value = list[0].voiceURI || list[0].name; SETTINGS.webSpeechVoice = sel.value; }
  } else {
    // Edge 语音
    sel.disabled = false;
    const list = VOICE_LIST[acc] || VOICE_LIST["en-US"];
    sel.innerHTML = list.map(v => '<option value="' + v.id + '">' + v.label + "</option>").join("");
    if (SETTINGS.voice && list.some(v => v.id === SETTINGS.voice)) sel.value = SETTINGS.voice;
    else { sel.value = list[0].id; SETTINGS.voice = list[0].id; }
  }
  saveJSON(K_SET, SETTINGS);
  updateEngineUI();
}

function currentEdgeVoice() {
  const sel = $("#voiceSel");
  if (sel && sel.value && CURRENT_VOICE_MODE === "edge") return sel.value;
  return ($("#accentSel") && $("#accentSel").value === "en-GB") ? "en-GB-RyanNeural" : "en-US-AriaNeural";
}
function currentWebSpeechVoice() {
  const sel = $("#voiceSel");
  if (!sel || !sel.value || CURRENT_VOICE_MODE !== "webspeech") return null;
  return WEBSPEECH_VOICES.find(v => (v.voiceURI || v.name) === sel.value) || null;
}

/* Edge TTS 安全令牌（Sec-MS-GEC）：时间戳(Windows文件时) + 固定令牌 → SHA256 */
function generateSecMsGec() {
  const TOKEN = EDGE_TOKEN;
  let ticks = BigInt(Math.floor(Date.now() / 1000)) + 11644473600n;
  ticks -= ticks % 300n;          // 对齐到 5 分钟
  ticks = ticks * 10000000n;       // 秒 → 100 纳秒
  const strToHash = ticks.toString() + TOKEN;
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(strToHash))
    .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("").toUpperCase());
}
function rateToPct(rate) {
  const p = Math.round((parseFloat(rate) - 1) * 100);
  return (p >= 0 ? "+" : "") + p + "%";
}
function buildSSML(text, voice, ratePct, pitchPct) {
  const safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lang = voice.indexOf("en-GB") === 0 ? "en-GB" : "en-US";
  // pitchPct 如 +10%/-10%；Edge 支持相对音高
  const pitch = pitchPct || "+0Hz";
  return "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='" + lang + "'>" +
    "<voice name='" + voice + "'><prosody rate='" + ratePct + "' pitch='" + pitch + "' volume='+0%'>" + safe + "</prosody></voice></speak>";
}
function parseWsHeaders(str) {
  const i = str.indexOf("\r\n\r\n");
  const head = i < 0 ? str : str.slice(0, i);
  const body = i < 0 ? "" : str.slice(i + 4);
  const headers = {};
  head.split("\r\n").forEach(line => {
    const c = line.indexOf(":");
    if (c > 0) headers[line.slice(0, c).trim()] = line.slice(c + 1).trim();
  });
  return { headers, body };
}

/* 连接 Edge TTS，返回 {audioUrl, boundaries}（Promise） */
function edgeSynthesize(text) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket === "undefined" || !window.crypto || !crypto.subtle) { reject(new Error("环境不支持 Edge TTS")); return; }
    let settled = false;
    let timeout = null; // 提前声明，避免 finish 闭包在 setTimeout 之前访问触发 TDZ
    const finish = (ok, val) => { if (settled) return; settled = true; if (timeout) clearTimeout(timeout); if (ok) resolve(val); else reject(val); };
    generateSecMsGec().then(gec => {
      const connId = (crypto.randomUUID ? crypto.randomUUID() : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? "r" : (r & 0x3 | 0x8)).toString(16); }));
      const url = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
        "?TrustedClientToken=" + EDGE_TOKEN + "&Sec-MS-GEC=" + encodeURIComponent(gec) + "&Sec-MS-GEC-Version=1&ConnectionId=" + connId;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return finish(false, e); }
      ws.binaryType = "arraybuffer";
      const chunks = [];
      const boundaries = [];
      let ptr = 0;
      const ts = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const voice = currentEdgeVoice();
      const ratePct = rateToPct($("#rateRange") ? $("#rateRange").value : "1");
      const pitchVal = parseFloat($("#pitchRange") ? $("#pitchRange").value : "1") || 1;
      const pitchPct = (pitchVal === 1 ? "+0Hz" : (pitchVal > 1 ? "+" + Math.round((pitchVal - 1) * 100) + "%" : Math.round((pitchVal - 1) * 100) + "%"));
      let done = false;
      timeout = setTimeout(() => { try { if (ws.readyState === 1) ws.close(); } catch (_) {} finish(false, new Error("Edge TTS 超时（网络/跨域可能受限）")); }, 20000);

      ws.onopen = () => {
        try {
          ws.send("X-Timestamp:" + ts + "\r\nContent-Type:application/json\r\nPath:speech.config\r\n\r\n" +
            JSON.stringify({ context: { synthesis: { audio: { metadataOptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true }, outputFormat: "audio-24khz-48kbitrate-mono-mp3" } } } }));
          ws.send("X-RequestId:" + connId + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + ts + "\r\nPath:ssml\r\n\r\n" + buildSSML(text, voice, ratePct, pitchPct));
        } catch (e) { finish(false, e); }
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") {
          const { headers, body } = parseWsHeaders(ev.data);
          const path = (headers["Path"] || "").toLowerCase();
          if (path === "turn.end") { done = true; try { ws.close(); } catch (_) {} emit(); }
          else if (path === "audio.metadata") {
            try {
              const j = JSON.parse(body);
              if (j && j.Type === "WordBoundary" && j.Data) {
                const w = j.Data.text || "";
                const idx = text.indexOf(w, ptr);
                const ci = idx >= 0 ? idx : ptr;
                ptr = idx >= 0 ? idx + w.length : ptr + w.length;
                boundaries.push({ offsetSec: (j.Data.Offset || 0) / 1e7, charIndex: ci, text: w });
              }
            } catch (_) {}
          }
        } else {
          const buf = new Uint8Array(ev.data);
          if (buf.length < 2) return;
          const hl = (buf[0] << 8) | buf[1];
          chunks.push(buf.slice(2 + hl));
        }
      };
      ws.onerror = () => { if (!done) finish(false, new Error("Edge TTS 连接错误（网络/跨域可能受限）")); };
      ws.onclose = () => { if (!done) emit(); };
      function emit() {
        if (!chunks.length) { finish(false, new Error("Edge TTS 未返回音频")); return; }
        let total = 0; chunks.forEach(c => total += c.length);
        const out = new Uint8Array(total); let p = 0;
        chunks.forEach(c => { out.set(c, p); p += c.length; });
        const blob = new Blob([out], { type: "audio/mpeg" });
        finish(true, { audioUrl: URL.createObjectURL(blob), boundaries });
      }
    }).catch(e => finish(false, e));
  });
}

let TTS = { state: "idle", engine: null, audio: null, curHi: null, boundaries: [], curBoundaryIdx: -1, reqId: 0, lastText: "", lastOpts: null, lastParagraphIdx: -1, fallbackToWebSpeech: false };
let TRANSLATION_CANCEL = false;
function shouldCancelTranslation() { return TRANSLATION_CANCEL; }
function cancelTranslation() { TRANSLATION_CANCEL = true; }
function clearHi() { if (TTS.curHi) { TTS.curHi.classList.remove("hl"); TTS.curHi = null; } }
function updateEngineUI() {
  const mode = actualVoiceMode();
  const forced = isWebSpeechForced();
  const hint = $("#engineHint");
  if (hint) {
    if (mode === "webspeech") {
      hint.textContent = forced
        ? "已强制使用浏览器内置朗读，音色下拉显示系统可用语音。"
        : "Edge TTS 当前不可用，已自动回退到浏览器内置朗读。";
    } else {
      hint.textContent = "当前使用 Edge TTS 自然语音。若网络受限失败，会自动回退为内置朗读。";
    }
  }
  const ttsEngine = $("#ttsEngine");
  if (ttsEngine) {
    if (mode === "webspeech") {
      ttsEngine.textContent = forced
        ? "🔊 引擎：浏览器内置朗读（强制）"
        : "🔊 引擎：浏览器内置朗读（Edge 回退）";
    } else {
      ttsEngine.textContent = "🔊 引擎：Edge TTS 自然语音";
    }
  }
}
function saveLLMSettings() {
  if (!SETTINGS.llm) SETTINGS.llm = {};
  SETTINGS.llm.base = ($("#llmBase").value || "").trim();
  SETTINGS.llm.key = ($("#llmKey").value || "").trim();
  SETTINGS.llm.model = ($("#llmModel").value || "").trim();
  saveJSON(K_SET, SETTINGS);
}

/* 高亮：根据字符偏移定位当前单词 span */
function highlightAtChar(ci) {
  let hit = null;
  for (const s of WORD_SPANS) { if (s.off <= ci) hit = s; else break; }
  if (hit && hit.el !== TTS.curHi) { clearHi(); hit.el.classList.add("hl"); TTS.curHi = hit.el; }
}

/* 入口：朗读（主 Edge，回退 Web Speech） */
async function speakText(text, opts) {
  opts = opts || {};
  const reqId = opts.reqId || 0;
  TTS.lastText = text; TTS.lastOpts = opts; TTS.lastParagraphIdx = opts.paragraphIdx ?? -1;
  // 强制内置朗读 或 超长文本 / 环境不支持 → 走内置
  if (isWebSpeechForced() || text.length > 5000 || typeof WebSocket === "undefined" || !window.crypto || !crypto.subtle) {
    return speakTextWebSpeech(text, opts);
  }
  // 每次新播放先尝试 Edge，重置回退标记
  TTS.fallbackToWebSpeech = false;
  updateEngineUI();
  try {
    if (opts.highlight) await playArticleEdge(reqId);
    else {
      const d = await edgeSynthesize(text);
      if (reqId && TTS.reqId !== reqId) return;
      TTS.engine = "edge"; TTS.fallbackToWebSpeech = false; TTS.audio = new Audio(d.audioUrl);
      TTS.audio.onended = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
      TTS.audio.onerror = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
      await TTS.audio.play(); TTS.state = "playing";
    }
  } catch (e) {
    console.warn("Edge TTS 不可用，回退内置朗读：", e.message);
    if (reqId && TTS.reqId !== reqId) return;
    // 标记回退、刷新 UI（音色下拉切系统语音）、再用内置朗读
    setEngineFallback(true);
    toast("Edge TTS 当前不可用，已切换为内置朗读");
    speakTextWebSpeech(text, opts);
  }
}

/* 切换音色/口音/语速后，若正在朗读则停止并用新设置重新朗读 */
function restartTTSIfPlaying() {
  if (TTS.state !== "playing" || !TTS.lastText) return;
  stopTTS();
  // 短暂延迟，让 stop 完成
  setTimeout(() => { TTS.reqId++; speakText(TTS.lastText, Object.assign({}, TTS.lastOpts, { reqId: TTS.reqId })); }, 80);
}

async function playArticleEdge(reqId) {
  const data = await edgeSynthesize(getSpokenText());
  if (reqId && TTS.reqId !== reqId) { try { URL.revokeObjectURL(data.audioUrl); } catch (_) {} return; }
  TTS.engine = "edge"; TTS.fallbackToWebSpeech = false; TTS.audio = new Audio(data.audioUrl);
  TTS.boundaries = data.boundaries.slice().sort((a, b) => a.offsetSec - b.offsetSec);
  TTS.curBoundaryIdx = -1;
  const audio = TTS.audio;
  audio.onended = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
  audio.onerror = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
  audio.ontimeupdate = () => {
    const t = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < TTS.boundaries.length; i++) { if (TTS.boundaries[i].offsetSec <= t) idx = i; else break; }
    if (idx >= 0 && idx !== TTS.curBoundaryIdx) { TTS.curBoundaryIdx = idx; highlightAtChar(TTS.boundaries[idx].charIndex); }
  };
  await audio.play(); TTS.state = "playing";
}

/* Web Speech 回退实现 */
function loadVoices() {
  try {
    const list = speechSynthesis.getVoices() || [];
    WEBSPEECH_VOICES = list;
    if (list.length) WEBSPEECH_VOICES_LOADED = true;
    populateVoices();
    updateEngineUI();
  } catch (e) {
    WEBSPEECH_VOICES = [];
    WEBSPEECH_LOAD_FAILED = true;
    populateVoices();
  }
}
if ("speechSynthesis" in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
  // 部分内置浏览器（如微信 X5）有 speechSynthesis 但永远不会返回音色列表，
  // 超过 3.5 秒仍为空则给出明确提示，避免用户一直看到"加载中…"
  setTimeout(() => {
    if (!WEBSPEECH_VOICES_LOADED) {
      WEBSPEECH_LOAD_FAILED = true;
      populateVoices();
    }
  }, 3500);
} else {
  WEBSPEECH_LOAD_FAILED = true;
}
function pickVoice(accent) {
  const chosen = currentWebSpeechVoice();
  if (chosen) return chosen;
  const exact = WEBSPEECH_VOICES.find(v => v.lang === accent);
  if (exact) return exact;
  const primary = accent.slice(0, 2).toLowerCase();
  return WEBSPEECH_VOICES.find(v => (v.lang || "").toLowerCase().startsWith(primary)) ||
         WEBSPEECH_VOICES.find(v => (v.lang || "").toLowerCase().startsWith("en")) || null;
}

function speakTextWebSpeech(text, opts) {
  if (!("speechSynthesis" in window)) { toast("当前浏览器不支持语音朗读"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = parseFloat($("#rateRange") ? $("#rateRange").value : "1") || 1;
  u.pitch = parseFloat($("#pitchRange") ? $("#pitchRange").value : "1") || 1;
  const accent = $("#accentSel") ? $("#accentSel").value : SETTINGS.accent;
  const v = pickVoice(accent); if (v) u.voice = v;
  if (opts && opts.highlight) {
    u.onboundary = (ev) => {
      const ci = ev.charIndex || 0;
      let hit = null;
      for (const s of WORD_SPANS) { if (s.off <= ci) hit = s; else break; }
      if (hit && hit.el !== TTS.curHi) { clearHi(); hit.el.classList.add("hl"); TTS.curHi = hit.el; }
    };
    u.onend = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
    u.onerror = () => { clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
  } else {
    u.onend = () => { TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; };
  }
  TTS.engine = "webspeech"; TTS.state = "playing";
  speechSynthesis.speak(u);
}

function playArticle() {
  if (TTS.state === "playing") { pauseTTS(); return; }
  if (TTS.state === "paused") { resumeTTS(); return; }
  $("#btnPlay").textContent = "⏸ 暂停";
  TTS.state = "playing"; TTS.reqId++;
  speakText(getSpokenText(), { highlight: true, reqId: TTS.reqId });
}
function pauseTTS() {
  if (TTS.engine === "edge" && TTS.audio) { TTS.audio.pause(); TTS.state = "paused"; $("#btnPlay").textContent = "⏸ 继续"; }
  else if (TTS.engine === "webspeech") { speechSynthesis.pause(); TTS.state = "paused"; $("#btnPlay").textContent = "⏸ 继续"; }
}
function resumeTTS() {
  if (TTS.engine === "edge" && TTS.audio) { TTS.audio.play(); TTS.state = "playing"; $("#btnPlay").textContent = "⏸ 暂停"; }
  else if (TTS.engine === "webspeech") { speechSynthesis.resume(); TTS.state = "playing"; $("#btnPlay").textContent = "⏸ 暂停"; }
}
function stopTTS() {
  if (TTS.engine === "edge" && TTS.audio) { try { TTS.audio.pause(); } catch (_) {} TTS.audio = null; }
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  clearHi(); TTS.state = "idle"; $("#btnPlay").textContent = "▶ 朗读"; TTS.reqId++;
}

/* 单词发音（优先 Edge TTS） */
async function speakWord(w) {
  if (typeof WebSocket === "undefined" || !window.crypto || !crypto.subtle || w.length > 200) { speakWordWebSpeech(w); return; }
  try {
    const d = await edgeSynthesize(w);
    const a = new Audio(d.audioUrl); TTS.engine = "edge"; TTS.audio = a;
    a.onended = () => { TTS.audio = null; };
    await a.play();
  } catch (e) { speakWordWebSpeech(w); }
}
function speakWordWebSpeech(w) {
  if (!("speechSynthesis" in window)) { toast("当前浏览器不支持发音"); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(w);
  const v = pickVoice($("#accentSel") ? $("#accentSel").value : SETTINGS.accent); if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function readSelection() {
  const sel = window.getSelection(); const txt = (sel && sel.toString() || "").trim();
  if (!txt) { toast("请先在文章中选中一段文字"); return; }
  stopTTS(); TTS.reqId++; speakText(txt, { highlight: false, reqId: TTS.reqId });
}

/* ============================================================
   翻译（多源回退：Google gtx / LibreTranslate 公开镜像 / MyMemory）
   ============================================================ */
async function fetchWithTimeout(url, opts = {}, ms = 10000) {
  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  let t;
  try {
    if (ctrl) {
      t = setTimeout(() => ctrl.abort(), ms);
      opts = Object.assign({}, opts, { signal: ctrl.signal });
    }
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error("http " + r.status);
    return r;
  } finally {
    if (t) clearTimeout(t);
  }
}
async function gtranslate(text) {
  const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" + encodeURIComponent(text);
  const r = await fetchWithTimeout(url, {}, 8000);
  const j = await r.json();
  if (!Array.isArray(j) || !j[0]) throw new Error("invalid response");
  return j[0].map(x => x[0]).join("");
}
async function myMemoryTranslate(text) {
  const url = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en|zh-CN";
  const r = await fetchWithTimeout(url, {}, 8000);
  const j = await r.json();
  if (j.quotaFinished) throw new Error("quota finished");
  const txt = j.responseData && j.responseData.translatedText;
  if (!txt || /^(\[|\{)?\s*$/.test(txt)) throw new Error("empty translation");
  if (String(txt).toLowerCase() === String(text).toLowerCase() && /[\u4e00-\u9fa5]/.test(text) === false) {
    // 英文返回原样，大概率没翻译成功，但不一定是失败，继续用
  }
  return txt;
}
async function libreTranslate(base, text) {
  const r = await fetchWithTimeout(base.replace(/\/$/, "") + "/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ q: text, source: "en", target: "zh", format: "text" })
  }, 12000);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  if (!j.translatedText) throw new Error("empty");
  return j.translatedText;
}

const LIBRE_MIRRORS = [
  "https://libretranslate.de",
  "https://translate.terraprint.co",
  "https://trans.zillyhuhn.com",
  "https://libretranslate.eownerdead.dedyn.io",
  "https://translate.fortytwo-it.com",
  "https://translate.api.skitzen.com",
  "https://lt.vern.cc"
];

const TRANSLATE_PROVIDERS = [
  { name: "google", maxLen: 4000, fn: gtranslate },
  ...LIBRE_MIRRORS.map(u => ({ name: "libre-" + u.replace(/^https:\/\//, "").split(".")[0], maxLen: 1500, fn: t => libreTranslate(u, t) })),
  { name: "mymemory", maxLen: 500, fn: myMemoryTranslate }
];

function splitBySentences(text, maxLen = 4000) {
  // 按句子切分再合并成不超过 maxLen 的块
  const sents = text.split(/(?<=[.!?。！？]\s*)/).filter(s => s.trim());
  const chunks = []; let cur = "";
  for (const s of sents) {
    if ((cur + s).length > maxLen && cur) { chunks.push(cur); cur = s; }
    else cur += s;
  }
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : (text ? [text] : []);
}
async function translateOneProvider(text, provider) {
  if (text.length > provider.maxLen) throw new Error("chunk too long for " + provider.name);
  return await provider.fn(text);
}
async function translateAny(text, style) {
  if (!text || !text.trim()) return "";
  // 优先 LLM（若用户开启且已配置）
  if (SETTINGS.useLLMForTranslation && llmAvailable()) {
    try {
      const res = await llmTranslate(text, style);
      if (res) return res;
    } catch (e) { console.warn("LLM 翻译失败，回退免费源", e); }
  }
  let lastErr = "无可用翻译源";
  for (const p of TRANSLATE_PROVIDERS) {
    if (text.length > p.maxLen) continue;
    try {
      const res = await translateOneProvider(text, p);
      if (res && res.trim()) return res.trim();
    } catch (e) {
      lastErr = p.name + ": " + (e.message || e);
      console.warn("翻译源失败", p.name, e.message);
    }
  }
  // 如果文本太长导致全部跳过，拆小后再试（主要是 MyMemory 只能 500 字符）
  if (text.length > 500) {
    const small = splitBySentences(text, 480);
    const parts = [];
    for (const c of small) {
      parts.push(await translateAny(c, style));
      await new Promise(r => setTimeout(r, 120));
    }
    return parts.filter(Boolean).join("\n");
  }
  throw new Error(lastErr);
}
async function translate(text) {
  try { return await translateAny(text); }
  catch (e) { console.warn("翻译失败", e); return "（翻译服务暂不可用，请检查网络）"; }
}
async function translateLong(text) {
  if (SETTINGS.useLLMForTranslation && llmAvailable()) {
    // LLM 一般可处理较长文本，先整段翻译；失败再拆段
    try { return await llmTranslate(text, "summary"); }
    catch (e) { console.warn("LLM 长文翻译失败，拆段回退", e); }
  }
  const chunks = splitBySentences(text, 1500); // 优先适配 LibreTranslate
  const out = [];
  for (const c of chunks) {
    out.push(await translate(c));
    await new Promise(r => setTimeout(r, 120));
  }
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
function trErrorHtml(e, label) {
  const msg = e && e.message;
  if (msg === "CANCELLED") return '<div class="rd-ai-loading">⏹ 已取消' + label + '加载 <button class="btn sm btn-reload-tr">重新加载</button></div>';
  if (msg === "TIMEOUT") return '<div class="rd-ai-loading">⏱ ' + label + '加载超时 <button class="btn sm btn-reload-tr">重新加载</button></div>';
  return '<div class="rd-ai-loading">⚠️ ' + label + '加载失败：' + escapeHtml(msg || "未知错误") + ' <button class="btn sm btn-reload-tr">重新加载</button></div>';
}

async function renderTranslationAndAI() {
  TRANSLATION_CANCEL = false;
  const loading = (msg) => '<div class="rd-ai-loading">⏳ ' + msg + ' <button class="btn sm btn-cancel-tr">取消</button></div>';
  $("#trSummary").innerHTML = loading("正在翻译全文大意…");
  $("#trPara").innerHTML = loading("正在生成逐段对照…");
  $("#trAI").innerHTML = loading("正在生成主旨与长难句解析…");
  $$(".btn-cancel-tr").forEach(b => b.addEventListener("click", cancelTranslation));

  const overallTimeout = 45000; // 45 秒整体超时
  const startTime = Date.now();
  function checkTimeout() {
    if (TRANSLATION_CANCEL) throw new Error("CANCELLED");
    if (Date.now() - startTime > overallTimeout) throw new Error("TIMEOUT");
  }

  try {
    checkTimeout();
    const summaryZh = await translateLong(CURRENT.raw);
    checkTimeout();
    $("#trSummary").innerHTML = '<div class="t">📝 全文大意（意译）</div>' + escapeHtml(summaryZh);
  } catch (e) {
    $("#trSummary").innerHTML = trErrorHtml(e, "全文大意");
  }

  try {
    const blocks = [];
    for (const p of CURRENT.paragraphs) {
      checkTimeout();
      const zh = await translateAny(p, "paragraph");
      blocks.push('<div class="rd-tr-block"><div class="rd-tr-en">' + escapeHtml(p) + '</div><div class="rd-tr-zh">' + escapeHtml(zh) + "</div></div>");
      await new Promise(r => setTimeout(r, 120));
    }
    $("#trPara").innerHTML = blocks.join("");
  } catch (e) {
    $("#trPara").innerHTML = trErrorHtml(e, "逐段对照");
  }

  try {
    checkTimeout();
    let mainIdea;
    if (llmAvailable()) {
      try { mainIdea = await llmChat("你是英语老师，请用中文用 3-5 句话概括下面英文文章的主旨，简洁、面向中文学习者。", CURRENT.raw); } catch (_) {}
    }
    if (!mainIdea) mainIdea = await translate(extractiveSummary());
    let ai = '<div class="rd-ai-card"><h4>🧠 主旨总结</h4><div class="ai-body">' + escapeHtml(mainIdea || "（无）") + "</div></div>";

    const longs = longSentences();
    if (longs.length) {
      const items = [];
      for (const s of longs.slice(0, 6)) {
        checkTimeout();
        let zh = "（翻译失败）";
        if (llmAvailable()) {
          try { zh = await llmChat("请把下面这个长难句翻译成中文，并简要说明句子结构（主谓宾/从句等），用 1-2 句话。", s) || "（翻译失败）"; } catch (_) {}
        } else {
          zh = await translate(s);
        }
        items.push('<div class="rd-ai-card"><h4>📐 长难句</h4><div class="ai-body"><b>' + escapeHtml(s) + "</b><div style='margin-top:6px;color:#33414f'>" + escapeHtml(zh) + "</div></div></div>");
        await new Promise(r => setTimeout(r, 80));
      }
    ai += items.join("");
  } else {
    ai += '<div class="rd-ai-card"><h4>📐 长难句</h4><div class="ai-body">本文未检测到明显长难句，继续保持～</div></div>';
  }
    $("#trAI").innerHTML = ai;
  } catch (e) {
    $("#trAI").innerHTML = trErrorHtml(e, "主旨与长难句解析");
  }
}

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
async function llmTranslate(text, style) {
  if (!text || !text.trim()) return "";
  const prompt = style === "paragraph"
    ? "你是专业翻译。请将下面的英文段落翻译成自然流畅的中文，只返回译文，不解释。"
    : "你是专业翻译。请将下面的英文翻译成自然流畅的中文，只返回译文，不解释。";
  const res = await llmChat(prompt, text);
  return (res || "").trim();
}
function llmAvailable() {
  return !!(SETTINGS.llm && SETTINGS.llm.base && SETTINGS.llm.key && SETTINGS.llm.model);
}

/* ============================================================
   文库（文章保存 / 列表 / 打开 / 删除）
   ============================================================ */
function splitParagraphs(text) {
  // 保留原有换行：每行即一个段落，不自动合并；空行忽略
  return text.split(/\n/).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function startFromText(text, editFirst) {
  const paras = splitParagraphs(text);
  if (!paras.length) { toast("没有可识别的英文段落"); return; }
  CURRENT = { id: null, title: "", tags: [], notes: "", raw: paras.join("\n"), paragraphs: paras, createdAt: todayStr(), updatedAt: todayStr(), annotations: [] };
  $("#artTitle").value = ""; $("#artTags").value = ""; $("#artNotes").value = "";
  showView("Reader");
  if (editFirst) setMode("edit");
  else enterReader();
}
function enterReader() {
  setMode("read");
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
  if (!set.has(todayStr(d))) { d = dateAdd(d, -1); }
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
  let para = -1;
  if (sel.anchorNode) { const p = (sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode).closest(".rd-para"); if (p) para = parseInt(p.dataset.pi, 10); }
  if (para < 0) { toast("请在文章正文中选中"); return; }
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

/* 带超时的 Promise 包装 */
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(label + " 超时"));
    }, ms);
    promise.then(
      v => { if (!settled) { settled = true; clearTimeout(t); resolve(v); } },
      e => { if (!settled) { settled = true; clearTimeout(t); reject(e); } }
    );
  });
}

/* ============================================================
   图片预处理：限制尺寸、统一为 JPEG，提升 OCR 稳定性
   ============================================================ */
function preprocessImage(file, maxSide = 2000, quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) { reject(new Error("请选择图片文件")); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (Math.max(w, h) > maxSide) {
        const scale = maxSide / Math.max(w, h);
        w = Math.round(w * scale); h = Math.round(h * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext("2d");
      // 纯白背景，避免透明 PNG 出现黑底
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (!blob) reject(new Error("图片预处理失败"));
        else resolve({ blob, width: w, height: h });
      }, "image/jpeg", quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("无法读取图片")); };
    img.src = url;
  });
}

/* ============================================================
   OCR 多线路重试
   - workerPath: 国内常被墙，jsDelivr/unpkg 镜像回退
   - langPath: 训练数据下载，国内慢；优先 jsDelivr GitHub 镜像
   - 每条线路带独立超时，卡住自动切换，避免永远 0%
   ============================================================ */
async function runOCRWithFallback(Tess, file, logger) {
  const bases = [];
  const scripts = Array.from(document.querySelectorAll('script[src*="tesseract"]'));
  const loadedSrc = scripts.find(s => /tesseract(\.min)?\.js/.test(s.src))?.src || '';
  if (loadedSrc.includes('jsdelivr.net')) bases.push('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist');
  if (loadedSrc.includes('unpkg.com')) bases.push('https://unpkg.com/tesseract.js@5.1.1/dist');
  if (loadedSrc.includes('bootcdn.net')) bases.push('https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1');
  bases.push('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist');
  bases.push('https://unpkg.com/tesseract.js@5.1.1/dist');
  bases.push('https://cdn.bootcdn.net/ajax/libs/tesseract.js/5.1.1');

  // 多 langPath 镜像：eng.traineddata (~10MB best / ~4MB 精简)
  // 注意：langPath 是目录，tesseract 会拼接 `${langPath}/eng.traineddata[.gz]`，
  // 因此不能在这里加 ?cacheBust=1，否则会被当成路径的一部分导致 404。
  const langPaths = [
    'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best',     // jsDelivr GH 镜像（国内较稳）
    'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0',          // 同上，精简版
    'https://cdn.jsdelivr.net/npm/tesseract-data@4.0.0/4.0.0_best',        // 备用 npm 镜像
    'https://tessdata.projectnaptha.com/4.0.0_best',                       // 官方主源
    'https://tessdata.projectnaptha.com/4.0.0'
  ];

  const seen = new Set();
  let lastErr = null;
  let attempts = 0;
  outer:
  for (const base of bases) {
    if (seen.has(base)) continue; seen.add(base);
    for (const langPath of langPaths) {
      let worker;
      attempts++;
      try {
        worker = await withTimeout(
          Tess.createWorker('eng', 1, {
            workerPath: base + '/worker.min.js',
            langPath: langPath,
            logger: logger,
            errorHandler: e => console.warn('OCR worker warn:', e)
          }),
          18000,
          '加载 OCR 引擎/语言包'
        );
        const res = await withTimeout(worker.recognize(file), 60000, '识别图片');
        await worker.terminate();
        return res;
      } catch (e) {
        lastErr = e;
        console.warn('OCR 线路失败(base=' + base + ', lang=' + langPath + '):', e.message);
        // 超时或训练数据相关失败 → 继续尝试下一个 langPath；worker 加载失败 → 换 base
        const msg = String(e.message || '');
        const isLangIssue = /traineddata|language|fetch|network|timeout|CORS|load|Failed to fetch|creating|worker/i.test(msg);
        if (!isLangIssue) continue outer;
      } finally {
        if (worker) try { await worker.terminate(); } catch (_) {}
      }
    }
  }
  const detail = attempts ? '已尝试 ' + attempts + ' 条线路均不可用' : '没有可用的 OCR 线路';
  throw lastErr || new Error(detail + '（请检查网络、换张更清晰的图片，或改用「粘贴文本」）');
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
  $("#pasteArea").addEventListener("input", () => {
    const n = $("#pasteArea").value.trim().split(/\s+/).filter(Boolean).length;
    $("#pasteCount").textContent = n ? "约 " + n + " 词" : "";
  });
  $("#btnStartRead").addEventListener("click", () => {
    const t = $("#pasteArea").value;
    if (!t.trim()) { toast("请先粘贴英文文章"); return; }
    startFromText(t, false);
  });

  // OCR（带多 CDN 重试与显式 worker/lang 路径）
  let lastOcrFile = null;
  async function doOCR(file) {
    $("#ocrStatus").textContent = "⏳ 正在读取并压缩图片…";
    $("#btnOcrRetry").style.display = "none";
    let processed;
    try {
      processed = await preprocessImage(file);
      $("#ocrStatus").textContent = "⏳ 正在加载 OCR 引擎，请稍候…";
    } catch (pe) {
      $("#ocrStatus").innerHTML = "❌ 图片读取失败：" + escapeHtml(pe.message) + "<br/><small>建议换一张图片，或使用「粘贴文本」导入。</small>";
      return;
    }
    try {
      const Tess = await Promise.race([
        (window._loadTesseractPromise || Promise.resolve(window.Tesseract)),
        new Promise((_, reject) => setTimeout(() => reject(new Error("OCR 引擎加载超时")), 20000))
      ]);
      if (!Tess) throw new Error("OCR 引擎未加载（网络不可用）。可改用「粘贴文本」方式。");
      $("#ocrStatus").textContent = "⏳ 正在识别图片文字（首次需下载识别数据，约 10 MB，请稍候）…";
      const res = await runOCRWithFallback(Tess, processed.blob, (m) => {
        if (m.status === "recognizing text") $("#ocrStatus").textContent = "⏳ 识别中… " + Math.round((m.progress || 0) * 100) + "%";
        else if (m.status === "loading language traineddata") $("#ocrStatus").textContent = "⏳ 正在下载英文识别数据… " + Math.round((m.progress || 0) * 100) + "%";
        else if (m.status === "loading tesseract core") $("#ocrStatus").textContent = "⏳ 正在加载 OCR 核心… " + Math.round((m.progress || 0) * 100) + "%";
      });
      $("#ocrResult").value = res.data.text;
      $("#ocrResult").style.display = "block"; $("#ocrActions").style.display = "flex";
      $("#btnOcrRetry").style.display = "none";
      $("#ocrStatus").textContent = "✅ 识别完成，请检查并修改错字后导入。";
    } catch (err) {
      console.error(err);
      $("#ocrStatus").innerHTML = "❌ 识别失败：" + escapeHtml(err.message) +
        "<br/><small>建议：①点击「重新识别」再试 ②切换网络 ③换一张文字清晰、光线充足的图片 ④改用「粘贴文本」导入</small>";
      $("#btnOcrRetry").style.display = "inline-flex";
    }
  }
  $("#ocrFile").addEventListener("change", async (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    lastOcrFile = f;
    await doOCR(f);
    e.target.value = "";
  });
  $("#btnOcrRetry").addEventListener("click", () => { if (lastOcrFile) doOCR(lastOcrFile); });
  // OCR 识别完成后 → 进入编辑预览（校对/分段），不直接进只读
  $("#btnOcrImport").addEventListener("click", () => {
    const t = $("#ocrResult").value;
    if (!t.trim()) { toast("没有可导入的文字"); return; }
    startFromText(t, true);
  });

  // 顶栏
  $("#btnLib").addEventListener("click", () => { renderLibListM(); openModal("#libModal"); });
  $("#btnVocab").addEventListener("click", () => { renderVocabList(); updateVocabDue(); openModal("#vocabModal"); });
  $("#btnCheckin").addEventListener("click", () => { renderCheckin(); openModal("#checkinModal"); });
  $("#btnSettings").addEventListener("click", openSettings);

  // 精读页：模式切换
  $("#btnModeRead").addEventListener("click", () => { if (!CURRENT) { toast("请先导入文章"); return; } setMode("read"); renderArticle(); });
  $("#btnModeEdit").addEventListener("click", () => { if (!CURRENT) { toast("请先导入文章"); return; } setMode("edit"); });
  $("#btnSplitPara").addEventListener("click", () => {
    const ta = $("#editArea"); const s = ta.selectionStart, e = ta.selectionEnd; const v = ta.value;
    ta.value = v.slice(0, s) + "\n" + v.slice(e);
    const pos = s + 1; ta.focus(); ta.setSelectionRange(pos, pos);
  });
  $("#btnSaveEdit").addEventListener("click", () => {
    const paras = splitParagraphs($("#editArea").value);
    if (!paras.length) { toast("没有可保存的文字"); return; }
    CURRENT.paragraphs = paras; CURRENT.raw = paras.join("\n");
    enterReader();
  });
  $("#btnCancelEdit").addEventListener("click", () => { setMode("read"); renderArticle(); });

  // 精读页：保存 / 朗读
  $("#btnBackHome").addEventListener("click", () => { if (CURRENT && !CURRENT.id) { if (!confirm("当前文章尚未保存，返回将丢失。确定？")) return; } showView("Home"); });
  $("#btnSaveArticle").addEventListener("click", saveArticle);
  $("#btnPlay").addEventListener("click", playArticle);
  $("#btnStop").addEventListener("click", stopTTS);
  $("#btnReadSel").addEventListener("click", readSelection);
  $("#accentSel").addEventListener("change", () => {
    SETTINGS.accent = $("#accentSel").value;
    saveJSON(K_SET, SETTINGS);
    populateVoices();
    restartTTSIfPlaying();
    // 同步设置弹窗中的口音下拉
    const setAccent = $("#setAccent"); if (setAccent) setAccent.value = SETTINGS.accent;
  });
  $("#voiceSel").addEventListener("change", () => {
    if (actualVoiceMode() === "webspeech") SETTINGS.webSpeechVoice = $("#voiceSel").value;
    else SETTINGS.voice = $("#voiceSel").value;
    saveJSON(K_SET, SETTINGS);
    restartTTSIfPlaying();
  });
  $("#rateRange").addEventListener("input", () => {
    $("#rateVal").textContent = parseFloat($("#rateRange").value).toFixed(2) + "x";
    SETTINGS.rate = parseFloat($("#rateRange").value);
    saveJSON(K_SET, SETTINGS);
    restartTTSIfPlaying();
  });
  $("#pitchRange").addEventListener("input", () => {
    $("#pitchVal").textContent = parseFloat($("#pitchRange").value).toFixed(1);
    SETTINGS.pitch = parseFloat($("#pitchRange").value);
    saveJSON(K_SET, SETTINGS);
    restartTTSIfPlaying();
  });
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
  $("#setPitch").value = String(SETTINGS.pitch || 1);
  $("#setEngine").value = SETTINGS.engine || "auto";
  $("#useLLMForTranslation").checked = !!SETTINGS.useLLMForTranslation;
  $("#llmBase").value = (SETTINGS.llm && SETTINGS.llm.base) || "";
  $("#llmKey").value = (SETTINGS.llm && SETTINGS.llm.key) || "";
  $("#llmModel").value = (SETTINGS.llm && SETTINGS.llm.model) || "";
  populateVoices();
  updateEngineUI();
  $("#setAccent").addEventListener("change", () => { SETTINGS.accent = $("#setAccent").value; saveJSON(K_SET, SETTINGS); $("#accentSel").value = SETTINGS.accent; populateVoices(); restartTTSIfPlaying(); });
  $("#setRate").addEventListener("change", () => { SETTINGS.rate = parseFloat($("#setRate").value); saveJSON(K_SET, SETTINGS); $("#rateRange").value = SETTINGS.rate; $("#rateVal").textContent = SETTINGS.rate.toFixed(2) + "x"; restartTTSIfPlaying(); });
  $("#setPitch").addEventListener("change", () => { SETTINGS.pitch = parseFloat($("#setPitch").value); saveJSON(K_SET, SETTINGS); $("#pitchRange").value = SETTINGS.pitch; $("#pitchVal").textContent = SETTINGS.pitch.toFixed(1); restartTTSIfPlaying(); });
  $("#setEngine").addEventListener("change", () => {
    SETTINGS.engine = $("#setEngine").value || "auto";
    saveJSON(K_SET, SETTINGS);
    // 切回自动模式时清除本次会话的回退标记
    if (SETTINGS.engine === "auto") TTS.fallbackToWebSpeech = false;
    populateVoices();
    updateEngineUI();
    // 引擎改变时，如果正在朗读则重新以新引擎朗读
    if (TTS.state === "playing" && TTS.lastText) { stopTTS(); setTimeout(() => { TTS.reqId++; speakText(TTS.lastText, Object.assign({}, TTS.lastOpts, { reqId: TTS.reqId })); }, 80); }
  });
  $$("#llmBase, #llmKey, #llmModel").forEach(el => el.addEventListener("input", saveLLMSettings));
  $("#useLLMForTranslation").addEventListener("change", () => { SETTINGS.useLLMForTranslation = $("#useLLMForTranslation").checked; saveJSON(K_SET, SETTINGS); });
  $("#btnExportData").addEventListener("click", exportData);
  $("#btnImportData").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", importData);
  $("#btnClearData").addEventListener("click", () => {
    if (!confirm("确定清空全部精读数据（文库/生词/打卡/设置）？此操作不可撤销。")) return;
    [K_LIB, K_VOCAB, K_CHECK, K_SET].forEach(k => localStorage.removeItem(k));
    LIB = []; VOCAB = []; CHECKINS = []; SETTINGS = { accent: "en-US", rate: 1, engine: "auto", useLLMForTranslation: false, llm: { base: "", key: "", model: "" } };
    toast("已清空"); renderHome();
  });

  // 点击空白关闭浮窗 / 翻译重载按钮委托
  document.addEventListener("click", (e) => {
    const pop = $("#wordPop");
    if (pop.style.display === "block" && !pop.contains(e.target) && !e.target.closest(".w")) pop.style.display = "none";
    const sb = $("#selBar");
    if (sb.style.display === "block" && !sb.contains(e.target)) sb.style.display = "none";
    if (e.target.closest(".btn-reload-tr")) { e.preventDefault(); renderTranslationAndAI(); }
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
  $("#pitchRange").value = SETTINGS.pitch || 1;
  $("#pitchVal").textContent = (SETTINGS.pitch || 1).toFixed(1);
  populateVoices();
  // 如果保存过音色且在当前口音列表内则恢复，否则 populateVoices 已设置默认值
  if (SETTINGS.voice) { const sel = $("#voiceSel"); if (sel && [...sel.options].some(o => o.value === SETTINGS.voice)) sel.value = SETTINGS.voice; }
  showView("Home");
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
