/* =========================
   Zigzag CipherLab – script
   ========================= */

// --- State ---
const state = {
  key: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  viz: {
    width: 1200,
    height: 600,
    marginX: 40,
    topY: 70,         // 鍵（文字）Y
    guideTopY: 100,   // 破線開始Y
    rowGap: 24,       // 段の間隔
    colGap: 40,       // 列の間隔
  },
  enc: {
    lastPoints: [],   // [{x,y}] 直近暗号化の座標群
    guidesHidden: false,
    selectedIndices: new Map(), // Map<plaintext_position, selected_key_index>
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

// --- Tabs ---
$$('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    $$('.tab').forEach(b=>b.classList.remove('active'));
    $$('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    $('#'+btn.dataset.tab).classList.add('active');
  });
});

// --- Key helpers ---
function normalizeKey(raw){
  // Sanitize input and limit length to prevent excessive processing
  if(typeof raw !== 'string') return '';
  const sanitized = raw.replace(/[^A-Za-z]/g,'').toUpperCase();
  return sanitized.length > 1000 ? sanitized.substring(0, 1000) : sanitized;
}
function keyStats(key){
  const len = key.length;
  const counts = {};
  for(const ch of key){ counts[ch]=(counts[ch]||0)+1; }
  const dup = Object.values(counts).filter(c=>c>1).reduce((a,b)=>a+(b-1),0);
  const set = new Set(key.split(''));
  const miss = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter(c=>!set.has(c)).length;
  return { len, dup, miss };
}
function setKey(newKey){
  state.key = newKey;
  state.enc.selectedIndices.clear(); // Clear cached positions when key changes
  // 更新：統計 & プレビュー
  const st = keyStats(newKey);
  $('#statLen').textContent = st.len;
  $('#statDup').textContent = st.dup;
  $('#statMiss').textContent = st.miss;
  drawKeyPreview();
  // 他ビューワも鍵に合わせて更新
  drawEncryptViz();
  drawDecryptViz();
}

// --- Layout helpers ---
function colX(idx){ return state.viz.marginX + idx*state.viz.colGap; }
function rowY(row){ return state.viz.guideTopY + row*state.viz.rowGap; }

// --- SVG helpers ---
function clearSVG(svg){ while(svg.firstChild) svg.removeChild(svg.firstChild); }
function elSVG(tag, attrs={}){
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for(const [k,v] of Object.entries(attrs)){ e.setAttribute(k, v); }
  return e;
}

// --- Draw Key Guides (letters + dashed) ---
function drawKeyGuides(svg, key, maxHeight){
  const height = maxHeight || state.viz.height;
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
  drawKeyGuides(svg, state.key);
}

// --- Find all indices of a character in the key ---
function findAllIndices(key, char){
  const indices = [];
  for(let i = 0; i < key.length; i++){
    if(key[i] === char) indices.push(i);
  }
  return indices;
}

// --- Map plaintext -> points (skip unknown) ---
function plaintextToPoints(plain, key){
  // Input validation and sanitization
  if(typeof plain !== 'string' || typeof key !== 'string') return [];
  if(plain.length > 10000) plain = plain.substring(0, 10000); // Limit length

  const P = plain.toUpperCase();
  let row = 0;
  const pts = [];

  // Create a unique key for each character position
  for(let i = 0; i < P.length; i++){
    const ch = P[i];
    if(!/[A-Z]/.test(ch)) continue;

    const indices = findAllIndices(key, ch);
    if(indices.length === 0) continue;

    // Use cached position if available, otherwise select randomly
    const cacheKey = `${i}_${ch}`;
    let idx;

    if(state.enc.selectedIndices.has(cacheKey)){
      idx = state.enc.selectedIndices.get(cacheKey);
      // Validate that the cached index is still valid
      if(key[idx] !== ch){
        // Key has changed, need to reselect
        idx = indices[Math.floor(Math.random() * indices.length)];
        state.enc.selectedIndices.set(cacheKey, idx);
      }
    } else {
      // First time seeing this position, randomly select
      idx = indices[Math.floor(Math.random() * indices.length)];
      state.enc.selectedIndices.set(cacheKey, idx);
    }

    const x = colX(idx);
    const y = rowY(row);
    pts.push({x,y});
    row += 1;
  }

  // Clean up old cached positions that are no longer needed
  const currentKeys = new Set();
  for(let i = 0; i < P.length; i++){
    if(/[A-Z]/.test(P[i])){
      currentKeys.add(`${i}_${P[i]}`);
    }
  }
  for(const key of state.enc.selectedIndices.keys()){
    if(!currentKeys.has(key)){
      state.enc.selectedIndices.delete(key);
    }
  }

  return pts;
}

// --- Adjust SVG height based on content ---
function adjustSVGHeight(svg, points){
  if(points.length === 0) {
    svg.setAttribute('viewBox', `0 0 ${state.viz.width} ${state.viz.height}`);
    return;
  }
  const maxY = Math.max(...points.map(p => p.y));
  const newHeight = Math.max(state.viz.height, maxY + 80); // Add padding
  svg.setAttribute('viewBox', `0 0 ${state.viz.width} ${newHeight}`);
}

// --- Draw polyline + points ---
function drawPolylineWithPoints(svg, points){
  if(points.length===0) return;
  // polyline
  const ptsStr = points.map(p=>`${p.x},${p.y}`).join(' ');
  const poly = elSVG('polyline', { points: ptsStr, class:'polyline' });
  svg.appendChild(poly);
  // points
  for(const p of points){
    const c = elSVG('circle', { cx:p.x, cy:p.y, r:4.2, class:'point' });
    svg.appendChild(c);
  }
  return {poly, ptsStr};
}

// --- Encrypt viz ---
function drawEncryptViz(){
  const svg = $('#svgEncrypt');
  clearSVG(svg);

  // plot polyline based on current plaintext
  const plain = $('#plainInput').value || '';
  const pts = plaintextToPoints(plain, state.key);
  state.enc.lastPoints = pts; // save

  // Adjust SVG height based on content
  adjustSVGHeight(svg, pts);
  const maxY = pts.length > 0 ? Math.max(...pts.map(p => p.y)) : 0;
  const svgHeight = Math.max(state.viz.height, maxY + 80);

  // guides (conditionally hidden)
  const rootGroup = elSVG('g', { class: state.enc.guidesHidden ? 'hidden-guides': '' });
  svg.appendChild(rootGroup);
  drawKeyGuides(rootGroup, state.key, svgHeight);

  drawPolylineWithPoints(svg, pts);
}

// --- Decrypt viz ---
function drawDecryptViz(){
  const svg = $('#svgDecrypt');
  clearSVG(svg);

  // Adjust SVG height based on content
  adjustSVGHeight(svg, state.dec.points);
  const maxY = state.dec.points.length > 0 ? Math.max(...state.dec.points.map(p => p.y)) : 0;
  const svgHeight = Math.max(state.viz.height, maxY + 80);

  // draw guides conditionally based on toggle
  if(!state.dec.guidesHidden){
    drawKeyGuides(svg, state.key, svgHeight);
  }

  // overlay existing dec points if any
  if(state.dec.points.length>0){
    const {poly} = drawPolylineWithPoints(svg, state.dec.points);
    if(poly) poly.setAttribute('stroke-dasharray','none');
  }
}

// --- Export helpers ---
function copyTextToClipboard(text){
  navigator.clipboard?.writeText(text).then(()=>{
    $('#exportMsg').textContent = 'コピーしました。';
    setTimeout(()=>$('#exportMsg').textContent='', 1400);
  }).catch(()=>{
    $('#exportMsg').textContent = 'コピーに失敗しました。';
    setTimeout(()=>$('#exportMsg').textContent='', 1400);
  });
}

function downloadSVG(svgEl, filename='zigzag.svg'){
  // Clone the SVG to avoid modifying the original
  const clonedSVG = svgEl.cloneNode(true);

  // Add explicit styles to ensure proper rendering in standalone SVG
  const styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  styleEl.textContent = `
    .key-letter { font-size: 18px; fill: #1e293b; opacity: 0.9; }
    .guide-line { stroke: #cbd5e1; stroke-width: 1.2; stroke-dasharray: 6 6; }
    .polyline { fill: none; stroke: #0ea5e9; stroke-width: 2.5; }
    .point { fill: #10b981; stroke: #ffffff; stroke-width: 1; }
    .point.step { fill: #ffd166; }
    .hidden-guides .key-letter,
    .hidden-guides .guide-line { display: none; }
  `;
  clonedSVG.insertBefore(styleEl, clonedSVG.firstChild);

  // Ensure all polylines have fill="none" explicitly set
  const polylines = clonedSVG.querySelectorAll('polyline');
  polylines.forEach(poly => {
    poly.setAttribute('fill', 'none');
  });

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(clonedSVG);
  const blob = new Blob([source], {type:'image/svg+xml;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// --- Parse points input with validation ---
function parsePointsInput(raw){
  const pts = [];
  const errors = [];

  // Input validation
  if(typeof raw !== 'string') return { pts, errors: ['Invalid input type'] };
  if(raw.length > 50000) return { pts, errors: ['Input too long (max 50,000 characters)'] };

  const tokens = raw.trim().split(/\s+/);

  if(raw.trim() === '') return { pts, errors };

  tokens.forEach((t, index) => {
    // Limit number of points to prevent excessive processing
    if(pts.length >= 1000) {
      errors.push('座標数が上限を超えています (最大1000点)');
      return;
    }

    const m = t.match(/^(-?\d+(\.\d+)?),(-?\d+(\.\d+)?)$/);
    if(!m) {
      errors.push(`不正な形式: "${t}" (位置: ${index + 1})`);
      return;
    }
    const x = parseFloat(m[1]);
    const y = parseFloat(m[3]);

    // Validate numbers are finite
    if(!isFinite(x) || !isFinite(y)) {
      errors.push(`無効な数値: "${t}"`);
      return;
    }

    // Validate reasonable ranges
    if(x < 0 || x > 2000 || y < 0 || y > 5000) {
      errors.push(`範囲外の値: "${t}" (x: 0-2000, y: 0-5000)`);
      return;
    }

    pts.push({x,y});
  });

  return { pts, errors };
}

// --- Show/hide error message ---
function showDecError(errors){
  const errorDiv = $('#decErrorMsg');
  if(errors.length === 0) {
    errorDiv.textContent = '';
    errorDiv.style.display = 'none';
  } else {
    errorDiv.textContent = errors.join(' / ');
    errorDiv.style.display = 'block';
  }
}

// --- Map x to nearest key column index ---
function nearestKeyIndex(x){
  let bestI = 0, bestD = Infinity;
  for(let i=0;i<state.key.length;i++){
    const cx = colX(i);
    const d = Math.abs(cx - x);
    if(d < bestD){ bestD = d; bestI = i; }
  }
  return bestI;
}

// --- Decode from points (sorted by y ascending) ---
function decodeFromPoints(points){
  if(points.length===0) return '';
  const sorted = [...points].sort((a,b)=>a.y - b.y);
  let out = '';
  for(const p of sorted){
    const idx = nearestKeyIndex(p.x);
    const ch = state.key[idx] ?? '';
    out += ch.toLowerCase(); // Convert to lowercase following classical cipher conventions
  }
  return out;
}

/* =========================
   Event wiring
   ========================= */

// --- Theme Management ---
function initTheme(){
  const savedTheme = localStorage.getItem('zigzag-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme){
  const toggle = $('#themeToggle');
  toggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  toggle.title = theme === 'dark' ? 'ライトモードに切替' : 'ダークモードに切替';
}

function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('zigzag-theme', newTheme);
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
        icon.textContent = '▶';
      } else {
        // 開く
        header.classList.add('active');
        content.classList.add('active');
        icon.textContent = '▼';
      }
    });
  });

  // 鍵生成
  $('#btnKeyApply').addEventListener('click', ()=>{
    const k = normalizeKey($('#keyInput').value);
    setKey(k);
  });
  $('#btnKeyShuffle').addEventListener('click', ()=>{
    const set = normalizeKey($('#keyInput').value || state.key);
    const arr = set.split('');
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]]=[arr[j],arr[i]];
    }
    const shuffled = arr.join('');
    $('#keyInput').value = shuffled;
    setKey(shuffled);
  });
  $('#btnKeyReset').addEventListener('click', ()=>{
    const def = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
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
    state.enc.guidesHidden = false;
    state.enc.selectedIndices.clear(); // Clear cached positions
    clearInterval(state.enc.timer);
    state.enc.timer = null;
    drawEncryptViz();
  });

  $('#btnEncrypt').addEventListener('click', ()=>{
    // Just display the encrypted points without hiding guides
    if(state.enc.lastPoints.length > 0) {
      const ptsStr = state.enc.lastPoints.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
      $('#encryptedPoints').value = ptsStr;
    } else {
      $('#encryptedPoints').value = '';
    }
  });

  // Toggle key visibility in encryption tab
  $('#chkShowKeyEnc').addEventListener('change', ()=>{
    state.enc.guidesHidden = !$('#chkShowKeyEnc').checked;
    drawEncryptViz();
  });

  $('#btnExportPoints').addEventListener('click', ()=>{
    const ptsStr = state.enc.lastPoints.map(p=>`${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    if(ptsStr.length===0){
      $('#exportMsg').textContent = '出力できる折れ線がありません。';
      setTimeout(()=>$('#exportMsg').textContent='', 1400);
      return;
    }
    copyTextToClipboard(ptsStr);
  });

  $('#btnDownloadSVG').addEventListener('click', ()=>{
    const svg = $('#svgEncrypt');
    downloadSVG(svg, 'zigzag-cipher.svg');
  });

  // 復号
  // Toggle key visibility in decryption tab
  $('#chkShowKeyDec').addEventListener('change', ()=>{
    state.dec.guidesHidden = !$('#chkShowKeyDec').checked;
    drawDecryptViz();
  });

  // Real-time point plotting
  $('#pointsInput').addEventListener('input', ()=>{
    const raw = $('#pointsInput').value || '';
    const { pts, errors } = parsePointsInput(raw);
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
    const raw = $('#pointsInput').value || '';
    const { pts, errors } = parsePointsInput(raw);

    if(errors.length > 0) {
      showDecError(errors);
      return;
    }

    if(pts.length === 0) {
      $('#decodedOutput').value = '';
      return;
    }

    state.dec.points = pts;
    drawDecryptViz();

    // Decode immediately
    const decoded = decodeFromPoints(pts);
    $('#decodedOutput').value = decoded;
  });

  // Sync from encryption tab
  $('#btnSyncFromEnc').addEventListener('click', ()=>{
    if(state.enc.lastPoints.length === 0) {
      showDecError(['暗号化タブに暗号文がありません']);
      setTimeout(() => showDecError([]), 2000);
      return;
    }

    // Convert points to string format
    const ptsStr = state.enc.lastPoints.map(p => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');
    $('#pointsInput').value = ptsStr;

    // Clear any errors and update visualization
    showDecError([]);
    state.dec.points = [...state.enc.lastPoints];
    drawDecryptViz();
  });

  // Encryption step playback
  $('#btnEncStepPlay').addEventListener('click', ()=>{
    if(state.enc.timer) return; // already running
    const plain = $('#plainInput').value || '';
    if(!plain) return;

    // Reset and start fresh animation
    state.enc.stepIndex = 0;
    const P = plain.toUpperCase();
    const validChars = [];

    // Collect valid characters
    for(const ch of P){
      if(/[A-Z]/.test(ch) && state.key.indexOf(ch) !== -1){
        validChars.push(ch);
      }
    }

    if(validChars.length === 0) return;

    // Clear current visualization
    const svg = $('#svgEncrypt');
    clearSVG(svg);

    // Draw guides
    const rootGroup = elSVG('g', { class: state.enc.guidesHidden ? 'hidden-guides': '' });
    svg.appendChild(rootGroup);
    const maxY = validChars.length * state.viz.rowGap + state.viz.guideTopY;
    const svgHeight = Math.max(state.viz.height, maxY + 80);
    adjustSVGHeight(svg, [{x:0, y:maxY}]);
    drawKeyGuides(rootGroup, state.key, svgHeight);

    // Animate step by step
    const animPts = [];
    state.enc.timer = setInterval(()=>{
      if(state.enc.stepIndex >= validChars.length){
        clearInterval(state.enc.timer);
        state.enc.timer = null;
        return;
      }

      // Get next point
      const ch = validChars[state.enc.stepIndex];
      const indices = findAllIndices(state.key, ch);
      const cacheKey = `${P.indexOf(ch)}_${ch}`;
      let idx;

      if(state.enc.selectedIndices.has(cacheKey)){
        idx = state.enc.selectedIndices.get(cacheKey);
      } else {
        idx = indices[Math.floor(Math.random() * indices.length)];
        state.enc.selectedIndices.set(cacheKey, idx);
      }

      const x = colX(idx);
      const y = rowY(state.enc.stepIndex);
      animPts.push({x, y});

      // Redraw with current points
      clearSVG(svg);
      const rootGroup2 = elSVG('g', { class: state.enc.guidesHidden ? 'hidden-guides': '' });
      svg.appendChild(rootGroup2);
      drawKeyGuides(rootGroup2, state.key, svgHeight);
      drawPolylineWithPoints(svg, animPts);

      // Highlight current point
      const circ = elSVG('circle', { cx:x, cy:y, r:5.2, class:'point step' });
      svg.appendChild(circ);

      state.enc.stepIndex++;
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
    const { pts, errors } = parsePointsInput(raw);

    if(errors.length > 0) {
      showDecError(errors);
      return;
    }

    if(pts.length === 0) return;

    // Sort points by Y coordinate for proper decryption order
    const sortedPts = [...pts].sort((a,b) => a.y - b.y);
    state.dec.points = sortedPts;

    // Clear current visualization and prepare for animation
    const svg = $('#svgDecrypt');
    clearSVG(svg);

    // Draw guides if enabled
    const maxY = sortedPts.length > 0 ? Math.max(...sortedPts.map(p => p.y)) : 0;
    const svgHeight = Math.max(state.viz.height, maxY + 80);
    adjustSVGHeight(svg, sortedPts);

    if(!state.dec.guidesHidden){
      drawKeyGuides(svg, state.key, svgHeight);
    }

    // Reset animation state
    state.dec.stepIndex = 0;
    $('#decodedOutput').value = '';

    // Animate step by step
    const animPts = [];
    state.dec.timer = setInterval(()=>{
      if(state.dec.stepIndex >= sortedPts.length){
        clearInterval(state.dec.timer);
        state.dec.timer = null;
        return;
      }

      const p = sortedPts[state.dec.stepIndex];
      animPts.push(p);

      // Redraw with current points
      clearSVG(svg);
      if(!state.dec.guidesHidden){
        drawKeyGuides(svg, state.key, svgHeight);
      }

      // Draw partial polyline up to current point
      if(animPts.length > 0){
        const {poly} = drawPolylineWithPoints(svg, animPts);
        if(poly) poly.setAttribute('stroke-dasharray','none');
      }

      // Highlight current point
      const circ = elSVG('circle', { cx:p.x, cy:p.y, r:5.2, class:'point step' });
      svg.appendChild(circ);

      // Map to nearest column and decode
      const idx = nearestKeyIndex(p.x);
      const ch = state.key[idx] ?? '';
      $('#decodedOutput').value += ch.toLowerCase();

      state.dec.stepIndex++;
    }, 300);
  });

  $('#btnDecStepStop').addEventListener('click', ()=>{
    clearInterval(state.dec.timer); state.dec.timer=null;
    drawDecryptViz();
  });
});
