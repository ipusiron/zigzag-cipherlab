/* =========================
   Zigzag CipherLab – script
   画面の処理だけを持つ。計算は js/zz-core.js、文言は js/messages.js
   ========================= */

const ZZ = window.ZZCore;
const M = window.ZZMessages;
const t = (key, vars) => M.t(key, vars);
// 重複鍵の列の選択とシャッフルは予測不能な乱数（crypto.getRandomValues）で行う
const randomBytes = ZZ.cryptoBytes(window.crypto);
const chooser = ZZ.randomChooser(randomBytes);

// --- State ---
const state = {
  key: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  viz: ZZ.LAYOUT,   // 列の間隔・段の間隔などの定数（計算部と共有）
  enc: {
    lastPoints: [],   // [{x,y,idx,row,ch,i}] 直近の暗号化の点
    guidesHidden: false,
    selectedIndices: new Map(), // Map<"位置_文字", 選んだ列>（同じ平文は同じ折れ線になる）
    timer: null,
    stepIndex: 0,
  },
  dec: {
    timer: null,
    stepIndex: 0,
    points: [],       // ソート済み[{x,y}]
    guidesHidden: false,
  }
};

// --- Shortcuts ---
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

// --- Timers ---
function stopTimers(){
  const wasRunning = state.enc.timer !== null || state.dec.timer !== null;
  clearInterval(state.enc.timer); state.enc.timer = null;
  clearInterval(state.dec.timer); state.dec.timer = null;
  return wasRunning;
}

// --- Tabs ---
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    // 再生中のタイマーは止める（非表示のパネルの裏で描画と出力が進まないように）
    const wasRunning = stopTimers();
    $$('.tab').forEach(b=>{ b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    $$('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    $('#'+btn.dataset.tab).classList.add('active');
    if(wasRunning){ drawEncryptViz(); drawDecryptViz(); }
  });
});

// --- Notices ---
function showNotice(el, text){
  el.textContent = text;
  el.hidden = text === '';
}

// --- Key helpers ---
function setKey(newKey){
  state.key = newKey;
  // 更新：統計 & プレビュー
  const st = ZZ.keyStats(newKey);
  $('#statLen').textContent = st.len;
  $('#statDup').textContent = st.dup;
  $('#statMiss').textContent = st.miss;
  let notice = '';
  if(newKey.length === 0) notice = t('key.empty');
  else if(st.miss > 0) notice = t('key.missing', { letters: st.missing.join(' ') });
  showNotice($('#keyNotice'), notice);
  drawKeyPreview();
  // 他ビューワも鍵に合わせて更新（位置ごとの記録は、鍵の文字が変わった位置だけ選び直される）
  drawEncryptViz();
  drawDecryptViz();
}

// --- Layout helpers ---
const colX = ZZ.colX;
const rowY = ZZ.rowY;

// --- SVG helpers ---
function clearSVG(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
function elSVG(tag, attrs={}){
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const [k,v] of Object.entries(attrs)){ e.setAttribute(k, v); }
  return e;
}
function setViewBox(svg, vb){
  svg.setAttribute('viewBox', `0 0 ${vb.width} ${vb.height}`);
}

// --- Draw Key Guides (letters + dashed) ---
function drawKeyGuides(svg, key, height){
  // 文字列
  for(let i=0;i<key.length;i++){
    const x = colX(i);
    const t = elSVG('text', { x, y: state.viz.topY, class: 'key-letter', 'text-anchor':'middle' });
    t.textContent = key[i];
    svg.appendChild(t);
  }
  // 破線ガイド
  for(let i=0;i<key.length;i++){
    const x = colX(i);
    const line = elSVG('line', {
      x1: x, y1: state.viz.guideTopY, x2: x, y2: height-30, class: 'guide-line'
    });
    svg.appendChild(line);
  }
}

// --- Key preview ---
function drawKeyPreview(){
  const svg = $('#svgKeyPreview');
  clearSVG(svg);
  const vb = ZZ.viewBox(state.key.length, 0);
  setViewBox(svg, vb);
  drawKeyGuides(svg, state.key, vb.height);
}

// --- Draw polyline + points ---
function drawPolylineWithPoints(svg, points){
  if(points.length===0) return;
  // polyline
  const ptsStr = ZZ.pointsToText(points);
  const poly = elSVG('polyline', { points: ptsStr, class:'polyline' });
  svg.appendChild(poly);
  // points
  for(const p of points){
    const c = elSVG('circle', { cx:p.x, cy:p.y, r:4.2, class:'point' });
    svg.appendChild(c);
  }
  return {poly, ptsStr};
}

// 今の点を強調する丸
function drawStepMarker(svg, p){
  svg.appendChild(elSVG('circle', { cx:p.x, cy:p.y, r:5.2, class:'point step' }));
}

// --- Encrypt (current plaintext -> points) ---
function encryptCurrent(){
  const plain = $('#plainInput').value || '';
  return ZZ.encrypt(plain, state.key, { chooser, cache: state.enc.selectedIndices });
}

// 飛ばした文字・切った長さの知らせ
function showEncNotice(result){
  const plain = $('#plainInput').value || '';
  const parts = [];
  if(state.key.length === 0 && plain.trim() !== '') parts.push(t('key.empty'));
  if(result.truncated) parts.push(t('enc.truncated', { max: ZZ.LIMITS.letters }));
  const skipped = result.missingLetters.length + result.others;
  if(skipped > 0 && state.key.length > 0){
    const detail = [];
    if(result.missingLetters.length > 0){
      const letters = [...new Set(result.missingLetters)].sort().join(' ');
      detail.push(t('enc.skippedMissing', { letters }));
    }
    if(result.others > 0) detail.push(t('enc.skippedOthers', { count: result.others }));
    parts.push(t('enc.skipped', { count: skipped, detail: detail.join('、') }));
  }
  showNotice($('#encNotice'), parts.join(' '));
}

// --- Encrypt viz ---
function drawEncryptViz(){
  const svg = $('#svgEncrypt');
  clearSVG(svg);

  // plot polyline based on current plaintext
  const result = encryptCurrent();
  state.enc.lastPoints = result.points; // save
  setViewBox(svg, result.viewBox);

  // guides (conditionally hidden)
  const rootGroup = elSVG('g', { class: state.enc.guidesHidden ? 'hidden-guides': '' });
  svg.appendChild(rootGroup);
  drawKeyGuides(rootGroup, state.key, result.viewBox.height);

  drawPolylineWithPoints(svg, result.points);
  showEncNotice(result);
  return result;
}

// --- Decrypt viz ---
function drawDecryptViz(){
  const svg = $('#svgDecrypt');
  clearSVG(svg);

  const vb = ZZ.viewBox(state.key.length, state.dec.points.length);
  setViewBox(svg, vb);

  // draw guides conditionally based on toggle
  if(!state.dec.guidesHidden){
    drawKeyGuides(svg, state.key, vb.height);
  }

  // overlay existing dec points if any
  if(state.dec.points.length>0){
    drawPolylineWithPoints(svg, state.dec.points);
  }
}

// --- Export helpers ---
function flashExportMsg(text){
  $('#exportMsg').textContent = text;
  setTimeout(()=>$('#exportMsg').textContent='', 1400);
}

function copyTextToClipboard(text){
  const clip = navigator.clipboard;
  if(!clip){ flashExportMsg(t('copy.fail')); return; }
  clip.writeText(text).then(()=>flashExportMsg(t('copy.ok'))).catch(()=>flashExportMsg(t('copy.fail')));
}

// 単体の SVG を書き出す。鍵を隠しているときは鍵の文字と破線を含めない（折れ線と点だけが暗号文）
function downloadSVG(){
  const showKey = !state.enc.guidesHidden;
  const source = ZZ.svgDocument({ key: state.key, points: state.enc.lastPoints, showKey });
  const blob = new Blob([source], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = t(showKey ? 'svg.fileWithKey' : 'svg.fileNoKey'); a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
}

// --- Show/hide error message ---
function showDecError(errors){
  const errorDiv = $('#decErrorMsg');
  const text = errors.map(e => t('dec.' + e.code, e)).join(' / ');
  showNotice(errorDiv, text);
}

/* =========================
   Event wiring
   ========================= */

// --- Theme Management ---
function readSavedTheme(){
  try { return localStorage.getItem('zigzag-theme'); } catch(e){ return null; }
}
function saveTheme(theme){
  try { localStorage.setItem('zigzag-theme', theme); } catch(e){ /* 保存できなくても切り替えは効く */ }
}

function initTheme(){
  const savedTheme = readSavedTheme();
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : (prefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme){
  const toggle = $('#themeToggle');
  toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  const label = theme === 'dark' ? t('theme.toLight') : t('theme.toDark');
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  saveTheme(newTheme);
  updateThemeIcon(newTheme);
}

// 初期化
document.addEventListener('DOMContentLoaded', ()=>{
  // テーマ初期化
  initTheme();

  // 初期キー統計 & プレビュー
  setKey(state.key);

  // テーマ切替
  $('#themeToggle').addEventListener('click', toggleTheme);

  // アコーディオン機能
  $$('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const target = header.dataset.target;
      const content = $('#' + target);
      const icon = header.querySelector('.accordion-icon');

      // 現在の状態を取得
      const isActive = header.classList.contains('active');

      if(isActive) {
        // 閉じる
        header.classList.remove('active');
        content.classList.remove('active');
        header.setAttribute('aria-expanded', 'false');
        icon.textContent = '▶';
      } else {
        // 開く
        header.classList.add('active');
        content.classList.add('active');
        header.setAttribute('aria-expanded', 'true');
        icon.textContent = '▼';
      }
    });
  });

  // 鍵生成
  $('#btnKeyApply').addEventListener('click', ()=>{
    const k = ZZ.normalizeKey($('#keyInput').value);
    $('#keyInput').value = k;
    setKey(k);
  });
  $('#btnKeyShuffle').addEventListener('click', ()=>{
    const set = ZZ.normalizeKey($('#keyInput').value || state.key);
    const shuffled = ZZ.shuffle(set, randomBytes);
    $('#keyInput').value = shuffled;
    setKey(shuffled);
  });
  $('#btnKeyReset').addEventListener('click', ()=>{
    const def = ZZ.ALPHABET;
    $('#keyInput').value = def;
    setKey(def);
  });

  // 暗号化
  const redrawEnc = ()=>drawEncryptViz();
  $('#plainInput').addEventListener('input', ()=>{
    if($('#chkRealtime').checked) redrawEnc();
  });
  $('#chkRealtime').addEventListener('change', ()=>{ if($('#chkRealtime').checked) redrawEnc(); });

  $('#btnEncClear').addEventListener('click', ()=>{
    $('#plainInput').value = '';
    $('#encryptedPoints').value = '';
    state.enc.selectedIndices.clear(); // Clear cached positions
    clearInterval(state.enc.timer);
    state.enc.timer = null;
    drawEncryptViz();
  });

  $('#btnEncrypt').addEventListener('click', ()=>{
    // 今の平文で点を作り直してから出す（リアルタイム描画が OFF でも古い点を出さない）
    clearInterval(state.enc.timer); state.enc.timer = null;
    const result = drawEncryptViz();
    $('#encryptedPoints').value = ZZ.pointsToText(result.points);
  });

  // Toggle key visibility in encryption tab
  $('#chkShowKeyEnc').addEventListener('change', ()=>{
    state.enc.guidesHidden = !$('#chkShowKeyEnc').checked;
    clearInterval(state.enc.timer); state.enc.timer = null;
    drawEncryptViz();
  });

  $('#btnExportPoints').addEventListener('click', ()=>{
    const ptsStr = ZZ.pointsToText(state.enc.lastPoints);
    if(ptsStr.length===0){
      flashExportMsg(t('copy.empty'));
      return;
    }
    copyTextToClipboard(ptsStr);
  });

  $('#btnDownloadSVG').addEventListener('click', ()=>{
    downloadSVG();
  });

  // 復号
  // Toggle key visibility in decryption tab
  $('#chkShowKeyDec').addEventListener('change', ()=>{
    state.dec.guidesHidden = !$('#chkShowKeyDec').checked;
    clearInterval(state.dec.timer); state.dec.timer = null;
    drawDecryptViz();
  });

  // Real-time point plotting
  $('#pointsInput').addEventListener('input', ()=>{
    const raw = $('#pointsInput').value || '';
    const { pts, errors } = ZZ.parsePoints(raw);
    showDecError(errors);

    if(errors.length === 0) {
      state.dec.points = pts;
      drawDecryptViz();
    }
  });


  $('#btnDecClear').addEventListener('click', ()=>{
    state.dec.points = [];
    $('#pointsInput').value = '';
    $('#decodedOutput').value = '';
    showDecError([]);
    clearInterval(state.dec.timer); state.dec.timer=null;
    drawDecryptViz();
  });

  // Decode button - immediately decode without animation
  $('#btnDecode').addEventListener('click', ()=>{
    clearInterval(state.dec.timer); state.dec.timer=null;
    const raw = $('#pointsInput').value || '';
    const { pts, errors } = ZZ.parsePoints(raw);

    if(errors.length > 0) {
      showDecError(errors);
      return;
    }
    if(pts.length > 0 && state.key.length === 0) {
      showDecError([{ code: 'emptyKey' }]);
      return;
    }
    showDecError([]);

    if(pts.length === 0) {
      state.dec.points = [];
      $('#decodedOutput').value = '';
      drawDecryptViz();
      return;
    }

    state.dec.points = pts;
    drawDecryptViz();

    // Decode immediately
    $('#decodedOutput').value = ZZ.decrypt(pts, state.key).text;
  });

  // Sync from encryption tab（今の平文で点を作り直してから渡す）
  $('#btnSyncFromEnc').addEventListener('click', ()=>{
    clearInterval(state.enc.timer); state.enc.timer = null;
    clearInterval(state.dec.timer); state.dec.timer = null;
    const result = drawEncryptViz();
    if(result.points.length === 0) {
      showDecError([{ code: 'noSource' }]);
      setTimeout(() => showDecError([]), 2000);
      return;
    }

    // Convert points to string format
    $('#pointsInput').value = ZZ.pointsToText(result.points);
    $('#encryptedPoints').value = $('#pointsInput').value;

    // Clear any errors and update visualization
    showDecError([]);
    state.dec.points = result.points.map(p => ({ x: p.x, y: p.y }));
    $('#decodedOutput').value = '';
    drawDecryptViz();
  });

  // Encryption step playback（通常描画と同じ点を1つずつ見せる）
  $('#btnEncStepPlay').addEventListener('click', ()=>{
    if(state.enc.timer) return; // already running
    const result = drawEncryptViz();
    const pts = result.points;
    if(pts.length === 0) return;

    const svg = $('#svgEncrypt');
    const drawUpTo = (count) => {
      clearSVG(svg);
      const rootGroup = elSVG('g', { class: state.enc.guidesHidden ? 'hidden-guides': '' });
      svg.appendChild(rootGroup);
      drawKeyGuides(rootGroup, state.key, result.viewBox.height);
      drawPolylineWithPoints(svg, pts.slice(0, count));
      if(count > 0) drawStepMarker(svg, pts[count - 1]);
    };

    state.enc.stepIndex = 0;
    drawUpTo(0);
    state.enc.timer = setInterval(()=>{
      state.enc.stepIndex++;
      drawUpTo(state.enc.stepIndex);
      if(state.enc.stepIndex >= pts.length){
        clearInterval(state.enc.timer);
        state.enc.timer = null;
      }
    }, 300);
  });

  $('#btnEncStepStop').addEventListener('click', ()=>{
    clearInterval(state.enc.timer);
    state.enc.timer = null;
    drawEncryptViz();
  });

  // Decryption step playback
  $('#btnDecStepPlay').addEventListener('click', ()=>{
    if(state.dec.timer) return; // already running
    const raw = $('#pointsInput').value || '';
    const { pts, errors } = ZZ.parsePoints(raw);

    if(errors.length > 0) {
      showDecError(errors);
      return;
    }
    if(pts.length === 0) return;
    if(state.key.length === 0) {
      showDecError([{ code: 'emptyKey' }]);
      return;
    }
    showDecError([]);

    // Sort points by Y coordinate for proper decryption order
    const decoded = ZZ.decrypt(pts, state.key);
    const sortedPts = decoded.sorted;
    state.dec.points = sortedPts.map(p => ({ x: p.x, y: p.y }));

    const svg = $('#svgDecrypt');
    const vb = ZZ.viewBox(state.key.length, sortedPts.length);
    const drawUpTo = (count) => {
      clearSVG(svg);
      setViewBox(svg, vb);
      if(!state.dec.guidesHidden) drawKeyGuides(svg, state.key, vb.height);
      drawPolylineWithPoints(svg, sortedPts.slice(0, count));
      if(count > 0) drawStepMarker(svg, sortedPts[count - 1]);
      $('#decodedOutput').value = decoded.text.slice(0, count);
    };

    // Reset animation state
    state.dec.stepIndex = 0;
    drawUpTo(0);

    // Animate step by step
    state.dec.timer = setInterval(()=>{
      state.dec.stepIndex++;
      drawUpTo(state.dec.stepIndex);
      if(state.dec.stepIndex >= sortedPts.length){
        clearInterval(state.dec.timer);
        state.dec.timer = null;
      }
    }, 300);
  });

  $('#btnDecStepStop').addEventListener('click', ()=>{
    clearInterval(state.dec.timer); state.dec.timer=null;
    drawDecryptViz();
  });
});
