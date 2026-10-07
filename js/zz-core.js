// Zigzag CipherLab の計算部（DOM を使わない通常のスクリプト。globalThis.ZZCore に置く）
// ジグザグ暗号: 鍵（横一列の文字列）の中で平文の各文字が置かれた列を x、何文字目かを段 y にして点を打ち、
// 折れ線でつなぐ。折れ線（点の列）が暗号文。復号は点を y の順に並べ、x に最も近い列の文字を読む。
// 重複のある鍵では同じ文字の列が複数あるので1つを選ぶ。選び方（乱数源）は呼び出し側から渡す。
(function (root) {
  'use strict';

  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // 上限。鍵・平文（鍵にある文字の数）・点の数は同じ 1,000 にそろえる（暗号化した点を必ず復号できる）
  const LIMITS = Object.freeze({ key: 1000, letters: 1000, points: 1000, rawPoints: 50000 });

  // 図の寸法（viewBox の単位）。列の間隔 40、段の間隔 24。既定の 26 文字の鍵は幅 1200 に収まる
  const LAYOUT = Object.freeze({
    marginX: 40, topY: 70, guideTopY: 100, rowGap: 24, colGap: 40,
    minWidth: 1200, minHeight: 600, bottomPad: 80,
  });

  // 鍵の正規化: ASCII の英字だけを残して大文字にし、上限で切る
  function normalizeKey(raw) {
    if (typeof raw !== 'string') return '';
    const s = raw.replace(/[^A-Za-z]/g, '').toUpperCase();
    return s.length > LIMITS.key ? s.slice(0, LIMITS.key) : s;
  }

  // 鍵の統計: 長さ、重複の数（同じ文字の2つ目以降）、欠けている文字の数と一覧
  function keyStats(key) {
    const counts = new Map();
    for (const ch of key) counts.set(ch, (counts.get(ch) || 0) + 1);
    let dup = 0;
    for (const c of counts.values()) dup += c - 1;
    const missing = [...ALPHABET].filter((c) => !counts.has(c));
    return { len: key.length, dup, miss: missing.length, missing };
  }

  // 鍵の中で ch が置かれた列の番号をすべて返す
  function findAllIndices(key, ch) {
    const out = [];
    for (let i = 0; i < key.length; i++) if (key[i] === ch) out.push(i);
    return out;
  }

  const colX = (idx) => LAYOUT.marginX + idx * LAYOUT.colGap;
  const rowY = (row) => LAYOUT.guideTopY + row * LAYOUT.rowGap;

  // 図の寸法: 列数と段数から viewBox の幅と高さ。幅は鍵の長さに、高さは段数に合わせて広がる
  function viewBox(keyLen, rows) {
    const cols = Math.max(1, keyLen | 0);
    const width = Math.max(LAYOUT.minWidth, LAYOUT.marginX * 2 + (cols - 1) * LAYOUT.colGap);
    const height = rows > 0 ? Math.max(LAYOUT.minHeight, rowY(rows - 1) + LAYOUT.bottomPad) : LAYOUT.minHeight;
    return { width, height };
  }

  // 平文の下ごしらえ: ASCII の英字を大文字にし、鍵にある文字だけを平文の位置（コードポイント単位）つきで集める。
  // 鍵にない英字（missingLetters）、英字でも空白でもない文字の数（others）、上限で切ったか（truncated）も返す
  function prepare(plain, key) {
    const letters = [];
    const missing = [];
    let others = 0;
    let truncated = false;
    if (typeof plain !== 'string' || typeof key !== 'string') return { letters, missingLetters: missing, others, truncated };
    let i = 0;
    for (const ch of plain) {
      const up = /^[a-z]$/.test(ch) ? ch.toUpperCase() : ch;
      if (/^[A-Z]$/.test(up)) {
        if (key.includes(up)) {
          if (letters.length >= LIMITS.letters) truncated = true;
          else letters.push({ i, ch: up });
        } else {
          missing.push(up);
        }
      } else if (!/\s/.test(ch)) {
        others++;
      }
      i++;
    }
    return { letters, missingLetters: missing, others, truncated };
  }

  // 余りの偏りを除いて [0, n) の整数を1つ返す。bytesFn(count) は Uint8Array を返す乱数源。
  // n は 1..65536。2バイト（0..65535）のうち n の倍数の範囲に入らない値は捨てて引き直す（rejection sampling）
  function randomIndex(n, bytesFn) {
    if (!Number.isInteger(n) || n < 1 || n > 65536) throw new RangeError('n must be 1..65536');
    if (n === 1) return 0;
    const limit = Math.floor(65536 / n) * n;
    for (let guard = 0; guard < 10000; guard++) {
      const b = bytesFn(2);
      const v = b[0] * 256 + b[1];
      if (v < limit) return v % n;
    }
    throw new Error('randomIndex: too many rejections');
  }

  // crypto.getRandomValues を bytesFn の形にする（ブラウザー用）
  function cryptoBytes(cryptoObj) {
    const c = cryptoObj || (typeof root !== 'undefined' ? root.crypto : undefined);
    return (count) => c.getRandomValues(new Uint8Array(count));
  }

  // 列の選び方（chooser）: (候補の数, 平文の位置, 文字) → 0 以上 候補の数 未満の番号
  const firstChooser = () => 0;
  const randomChooser = (bytesFn) => (n) => randomIndex(n, bytesFn);
  // 同じ文字が出るたびに次の列へ回す（同音換字の「同じ文字に別の記号を順に当てる」慣習）。文字ごとの回数を持つ
  function cycleChooser() {
    const counters = new Map();
    return (n, i, ch) => {
      const c = counters.get(ch) || 0;
      counters.set(ch, c + 1);
      return c % n;
    };
  }
  const CHOOSER_IDS = Object.freeze(['random', 'cycle', 'first']);
  function makeChooser(id, bytesFn) {
    if (id === 'cycle') return cycleChooser();
    if (id === 'first') return firstChooser;
    if (id === 'random') return randomChooser(bytesFn);
    throw new RangeError(`unknown chooser: ${id}`);
  }

  // 平文の各文字に列を割り当てる。cache（Map）を渡すと、位置ごとに一度選んだ列を保つ（同じ平文は同じ折れ線）。
  // 鍵が変わって選んだ列の文字が違えば選び直す。平文から消えた位置の記録は捨てる
  function choosePositions(letters, key, chooser, cache) {
    const pick = chooser || firstChooser;
    const out = [];
    for (const { i, ch } of letters) {
      const k = `${i}_${ch}`;
      let idx = cache ? cache.get(k) : undefined;
      if (idx === undefined || key[idx] !== ch) {
        const indices = findAllIndices(key, ch);
        idx = indices.length === 1 ? indices[0] : indices[pick(indices.length, i, ch)];
        if (cache) cache.set(k, idx);
      }
      out.push(idx);
    }
    if (cache) {
      const keep = new Set(letters.map(({ i, ch }) => `${i}_${ch}`));
      for (const k of [...cache.keys()]) if (!keep.has(k)) cache.delete(k);
    }
    return out;
  }

  // 暗号化: 平文と鍵から点の列を作る。opts.chooser（列の選び方）と opts.cache（位置ごとの記録）は任意
  function encrypt(plain, key, opts) {
    const o = opts || {};
    const k = typeof key === 'string' ? key : '';
    const prep = prepare(plain, k);
    const idxs = choosePositions(prep.letters, k, o.chooser, o.cache);
    const points = prep.letters.map(({ i, ch }, row) => ({ x: colX(idxs[row]), y: rowY(row), idx: idxs[row], row, ch, i }));
    return {
      points,
      missingLetters: prep.missingLetters,
      others: prep.others,
      truncated: prep.truncated,
      viewBox: viewBox(k.length, points.length),
    };
  }

  // 点の列をテキストにする（x,y を空白で区切る。座標は整数に丸める）
  const pointsToText = (points) => points.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`).join(' ');

  // テキストから点の列を読む。誤りは code つきのオブジェクトで返す（文言は画面側が付ける）
  function parsePoints(raw) {
    const pts = [];
    const errors = [];
    if (typeof raw !== 'string') return { pts, errors: [{ code: 'type' }] };
    if (raw.length > LIMITS.rawPoints) return { pts, errors: [{ code: 'tooLong', max: LIMITS.rawPoints }] };
    const trimmed = raw.trim();
    if (trimmed === '') return { pts, errors };
    const tokens = trimmed.split(/\s+/);
    tokens.forEach((t, index) => {
      if (pts.length >= LIMITS.points) {
        if (!errors.some((e) => e.code === 'tooMany')) errors.push({ code: 'tooMany', max: LIMITS.points });
        return;
      }
      const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(t);
      if (!m) {
        errors.push({ code: 'format', token: t, position: index + 1 });
        return;
      }
      const x = Number(m[1]);
      const y = Number(m[2]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        errors.push({ code: 'number', token: t });
        return;
      }
      if (x < 0 || y < 0) {
        errors.push({ code: 'negative', token: t });
        return;
      }
      pts.push({ x, y });
    });
    return { pts, errors };
  }

  // x に最も近い列の番号。ちょうど中間なら手前（番号の小さい）列。鍵が空なら -1
  function nearestKeyIndex(x, keyLen) {
    if (!(keyLen > 0)) return -1;
    const idx = Math.ceil((x - LAYOUT.marginX) / LAYOUT.colGap - 0.5);
    return Math.min(keyLen - 1, Math.max(0, idx));
  }

  // 復号: 点を y の順（同じ y は入力順）に並べ、最も近い列の文字を小文字で読む
  function decrypt(points, key) {
    const k = typeof key === 'string' ? key : '';
    const sorted = points.map((p, order) => ({ x: p.x, y: p.y, order }))
      .sort((a, b) => a.y - b.y || a.order - b.order)
      .map((p) => {
        const idx = nearestKeyIndex(p.x, k.length);
        return { x: p.x, y: p.y, idx, ch: idx < 0 ? '' : k[idx].toLowerCase() };
      });
    return { sorted, text: sorted.map((p) => p.ch).join('') };
  }

  // 鍵の文字を並べ替える（Fisher–Yates。乱数源は注入）
  function shuffle(key, bytesFn) {
    const arr = [...key];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomIndex(i + 1, bytesFn);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.join('');
  }

  // 列ごとの点の数（折れ線が換字暗号の変装であることを見せる材料）
  function columnCounts(points, keyLen) {
    const counts = new Array(Math.max(0, keyLen | 0)).fill(0);
    for (const p of points) {
      const idx = nearestKeyIndex(p.x, keyLen);
      if (idx >= 0) counts[idx]++;
    }
    return counts;
  }

  // ---- 換字暗号の変装を見せる（解析）----
  // 点を y の順に並べ、各点が置かれた列の番号の列を返す（折れ線＝列番号の列＝換字暗号の暗号文）
  function columnSequence(points, keyLen) {
    const indices = decrypt(points, '').sorted.map((p) => nearestKeyIndex(p.x, keyLen)).filter((i) => i >= 0);
    return { indices, text: indices.join(' ') };
  }

  // 列番号を標準のアルファベット（A=0 … Z=25）に写す。26 列を超える鍵では写せないので null
  function columnLetters(indices, keyLen) {
    if (!(keyLen > 0) || keyLen > ALPHABET.length) return null;
    return indices.map((i) => ALPHABET[i]).join('');
  }

  // 平文の文字ごとの数（encrypt の点の ch から）
  function letterCounts(points) {
    const counts = {};
    for (const p of points) if (p.ch) counts[p.ch] = (counts[p.ch] || 0) + 1;
    return counts;
  }

  const FREQUENCY_ANALYZER = 'https://ipusiron.github.io/frequency-analyzer/';
  // Frequency Analyzer（Day009）へ渡すリンク（#text=。サーバーへ送られず、5,000 文字まで受け取る）
  const frequencyAnalyzerUrl = (text) => `${FREQUENCY_ANALYZER}#text=${encodeURIComponent(text)}`;

  // ---- 鍵なしで渡す暗号文 ----
  // 点だけを載せた共有リンク（鍵は含めない）。base はページの URL（? と # を除いたもの）
  const shareLink = (points, base) => `${base}#points=${encodeURIComponent(pointsToText(points))}`;

  // URL の # から points= を読む。無ければ null。壊れたパーセント符号化はそのまま返す（読み取りで形式の誤りになる）
  function readPointsFromHash(hash) {
    const m = /(?:^#|&)points=([^&]*)/.exec(hash || '');
    if (!m) return null;
    try {
      return decodeURIComponent(m[1].replace(/\+/g, '%20'));
    } catch (e) {
      return m[1];
    }
  }

  // # から points= を取り除いた残り（'' なら # を消してよい）
  function stripPointsFromHash(hash) {
    const rest = (hash || '').replace(/^#/, '').split('&').filter((p) => p && !/^points=/.test(p));
    return rest.length ? `#${rest.join('&')}` : '';
  }

  // SVG のテキスト（このツールの書き出し）から、最初の折れ線の points 属性を取り出す。無ければ null
  function pointsFromSvgText(svgText) {
    if (typeof svgText !== 'string') return null;
    const m = /<polyline\b[^>]*?\bpoints\s*=\s*"([^"]*)"/.exec(svgText) || /<polyline\b[^>]*?\bpoints\s*=\s*'([^']*)'/.exec(svgText);
    return m ? m[1].trim() : null;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // 単体の SVG 文書（ダウンロード用）。showKey が false なら鍵の文字と破線を一切含めない（折れ線と点だけが暗号文）
  function svgDocument(opts) {
    const o = opts || {};
    const key = typeof o.key === 'string' ? o.key : '';
    const points = Array.isArray(o.points) ? o.points : [];
    const vb = viewBox(key.length, points.length);
    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vb.width} ${vb.height}" width="${vb.width}" height="${vb.height}">`);
    parts.push('<style>');
    parts.push('.key-letter{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;fill:#1e293b;}');
    parts.push('.guide-line{stroke:#cbd5e1;stroke-width:1.2;stroke-dasharray:6 6;}');
    parts.push('.polyline{fill:none;stroke:#0ea5e9;stroke-width:2.5;}');
    parts.push('.point{fill:#10b981;stroke:#ffffff;stroke-width:1;}');
    parts.push('</style>');
    if (o.showKey) {
      parts.push('<g class="guides">');
      for (let i = 0; i < key.length; i++) {
        const x = colX(i);
        parts.push(`<text x="${x}" y="${LAYOUT.topY}" class="key-letter" text-anchor="middle">${esc(key[i])}</text>`);
        parts.push(`<line x1="${x}" y1="${LAYOUT.guideTopY}" x2="${x}" y2="${vb.height - 30}" class="guide-line"/>`);
      }
      parts.push('</g>');
    }
    if (points.length > 0) {
      parts.push(`<polyline points="${esc(pointsToText(points))}" class="polyline" fill="none"/>`);
      for (const p of points) parts.push(`<circle cx="${Math.round(p.x)}" cy="${Math.round(p.y)}" r="4.2" class="point"/>`);
    }
    parts.push('</svg>');
    return parts.join('\n');
  }

  root.ZZCore = {
    ALPHABET, LIMITS, LAYOUT, CHOOSER_IDS, FREQUENCY_ANALYZER,
    normalizeKey, keyStats, findAllIndices, colX, rowY, viewBox, prepare,
    randomIndex, cryptoBytes, firstChooser, randomChooser, cycleChooser, makeChooser, choosePositions, encrypt,
    pointsToText, parsePoints, nearestKeyIndex, decrypt, shuffle, columnCounts, svgDocument,
    columnSequence, columnLetters, letterCounts, frequencyAnalyzerUrl,
    shareLink, readPointsFromHash, stripPointsFromHash, pointsFromSvgText,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
