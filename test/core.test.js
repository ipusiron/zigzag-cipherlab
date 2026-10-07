import test from 'node:test';
import assert from 'node:assert/strict';
import { core, read } from './load.js';

const C = core();
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// 決定的な乱数源: 渡したバイト列を順に返す
const bytesFrom = (arr) => {
  let i = 0;
  return (count) => {
    const out = new Uint8Array(count);
    for (let k = 0; k < count; k++) out[k] = arr[i++ % arr.length];
    return out;
  };
};

// 決定的な擬似乱数（線形合同法）。テストの往復に使う
function lcg(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
}
const lcgBytes = (seed) => {
  const r = lcg(seed);
  return (count) => Uint8Array.from({ length: count }, () => Math.floor(r() * 256));
};

test('鍵の正規化: ASCII の英字だけを大文字で残し、1,000 文字で切る', () => {
  assert.equal(C.normalizeKey('abc XYZ 123 é ß'), 'ABCXYZ');
  assert.equal(C.normalizeKey(''), '');
  assert.equal(C.normalizeKey(null), '');
  assert.equal(C.normalizeKey('A'.repeat(1200)).length, 1000);
  assert.equal(C.LIMITS.key, 1000);
});

test('鍵の統計: 長さ・重複・欠落', () => {
  assert.deepEqual(C.keyStats(KEY), { len: 26, dup: 0, miss: 0, missing: [] });
  const s = C.keyStats('AAB');
  assert.equal(s.len, 3);
  assert.equal(s.dup, 1);
  assert.equal(s.miss, 24);
  assert.deepEqual(s.missing.slice(0, 3), ['C', 'D', 'E']);
  assert.deepEqual(C.keyStats(''), { len: 0, dup: 0, miss: 26, missing: [...KEY] });
  assert.equal(C.keyStats('AAAAB').dup, 3);
  assert.deepEqual(C.findAllIndices('AAAAB', 'A'), [0, 1, 2, 3]);
  assert.deepEqual(C.findAllIndices('AAAAB', 'Z'), []);
});

test('図の座標: 列は 40 + 40i、段は 100 + 24r。寸法は鍵の長さと段数に合わせて広がる', () => {
  assert.equal(C.colX(0), 40);
  assert.equal(C.colX(25), 1040);
  assert.equal(C.colX(51), 2080);
  assert.equal(C.rowY(0), 100);
  assert.equal(C.rowY(205), 5020);
  assert.deepEqual(C.viewBox(26, 10), { width: 1200, height: 600 });
  assert.deepEqual(C.viewBox(26, 0), { width: 1200, height: 600 });
  assert.deepEqual(C.viewBox(0, 0), { width: 1200, height: 600 });
  assert.equal(C.viewBox(52, 1).width, 2120, '52 文字の鍵は最後の列 2080 の右に余白 40');
  assert.equal(C.viewBox(26, 120).height, 3036, '120 文字の平文（現行の実測と同じ）');
  assert.equal(C.viewBox(1000, 1000).width, 40040);
  assert.equal(C.viewBox(1000, 1000).height, 24156);
});

test('既知解答: 既定の鍵で HELLOWORLD（改修前の出力と同じ）', () => {
  const r = C.encrypt('HELLOWORLD', KEY);
  assert.equal(C.pointsToText(r.points), '320,100 200,124 480,148 480,172 600,196 920,220 600,244 720,268 480,292 160,316');
  assert.deepEqual(r.points.map((p) => p.ch).join(''), 'HELLOWORLD');
  assert.deepEqual(r.points.map((p) => p.idx), [7, 4, 11, 11, 14, 22, 14, 17, 11, 3]);
  assert.equal(C.decrypt(r.points, KEY).text, 'helloworld');
  assert.deepEqual(r.missingLetters, []);
  assert.equal(r.others, 0);
  assert.equal(r.truncated, false);
  assert.deepEqual(r.viewBox, { width: 1200, height: 600 });
});

test('下ごしらえ: 小文字は大文字に、鍵にない英字は missingLetters に、英字でも空白でもない文字は others に数える', () => {
  const p = C.prepare('héllo, wörld! 日本 ß', KEY);
  assert.equal(p.letters.map((l) => l.ch).join(''), 'HLLOWRLD');
  assert.deepEqual(p.letters.map((l) => l.i), [0, 2, 3, 4, 7, 9, 10, 11], '位置はコードポイント単位で元の平文の番号');
  assert.deepEqual(p.missingLetters, []);
  assert.equal(p.others, 7, 'é , ö ! 日 本 ß');
  const q = C.prepare('ABC XYZ', 'ABC');
  assert.deepEqual(q.missingLetters, ['X', 'Y', 'Z']);
  assert.equal(q.others, 0);
  assert.equal(C.prepare('😀A', KEY).letters[0].i, 1, 'サロゲートペアは1文字として数える');
  assert.deepEqual(C.prepare(null, KEY).letters, []);
  assert.deepEqual(C.prepare('ABC', null).letters, []);
});

test('上限: 鍵にある文字が 1,000 を超えた分は切って truncated を立てる', () => {
  const a = C.encrypt('A'.repeat(1000), KEY);
  assert.equal(a.points.length, 1000);
  assert.equal(a.truncated, false);
  const b = C.encrypt('A'.repeat(1001), KEY);
  assert.equal(b.points.length, 1000);
  assert.equal(b.truncated, true);
  const c = C.encrypt('A'.repeat(1001), 'B');
  assert.equal(c.points.length, 0);
  assert.equal(c.truncated, false, '鍵にない文字は上限に数えない');
  assert.equal(c.missingLetters.length, 1001);
  assert.equal(C.LIMITS.letters, C.LIMITS.points);
});

test('重複鍵: 列は chooser が選ぶ。候補が1つなら chooser を呼ばない', () => {
  const calls = [];
  const chooser = (n, i, ch) => {
    calls.push([n, i, ch]);
    return n - 1;
  };
  const r = C.encrypt('ABAB', 'AAAAB', { chooser });
  assert.deepEqual(r.points.map((p) => p.idx), [3, 4, 3, 4]);
  assert.deepEqual(calls, [[4, 0, 'A'], [4, 2, 'A']]);
  assert.deepEqual(C.encrypt('AAAA', 'AAAAB').points.map((p) => p.idx), [0, 0, 0, 0], '既定は最初の列');
});

test('位置ごとの記録（cache）: 同じ平文は同じ折れ線。鍵が変われば選び直し、消えた位置は捨てる', () => {
  const cache = new Map();
  const seq = [1, 3, 2, 0];
  let n = 0;
  const chooser = () => seq[n++ % seq.length];
  const a = C.encrypt('AAAA', 'AAAAB', { chooser, cache });
  assert.deepEqual(a.points.map((p) => p.idx), [1, 3, 2, 0]);
  const b = C.encrypt('AAAA', 'AAAAB', { chooser: () => 0, cache });
  assert.deepEqual(b.points.map((p) => p.idx), [1, 3, 2, 0], '記録があれば chooser を使わない');
  assert.equal(cache.size, 4);
  const c = C.encrypt('AA', 'AAAAB', { chooser: () => 0, cache });
  assert.deepEqual(c.points.map((p) => p.idx), [1, 3]);
  assert.equal(cache.size, 2, '消えた位置の記録は捨てる');
  const d = C.encrypt('AA', 'BAAAA', { chooser: () => 0, cache });
  assert.deepEqual(d.points.map((p) => p.idx), [1, 3], '記録の列がまだ同じ文字なら保つ');
  const e = C.encrypt('AA', 'BBBBA', { chooser: () => 0, cache });
  assert.deepEqual(e.points.map((p) => p.idx), [4, 4], '記録の列の文字が変わったら選び直す');
  // ステップ再生と通常描画が同じ記録を読む想定: 繰り返し文字でも位置ごとに別の列
  const cache2 = new Map();
  const f = C.encrypt('AAAA', 'AAAAB', { chooser: (k, i) => i % 4, cache: cache2 });
  assert.deepEqual(f.points.map((p) => p.idx), [0, 1, 2, 3]);
  assert.deepEqual([...cache2.keys()], ['0_A', '1_A', '2_A', '3_A']);
});

test('偏りのない整数: 2バイトから n の倍数の範囲だけを使い、範囲外は捨てて引き直す', () => {
  assert.equal(C.randomIndex(1, bytesFrom([255, 255])), 0);
  // n=3: limit = 65535。0xFFFF(65535) は捨て、次の 0x0005 → 5 % 3 = 2
  assert.equal(C.randomIndex(3, bytesFrom([255, 255, 0, 5])), 2);
  assert.equal(C.randomIndex(1000, bytesFrom([3, 232])), 0, '1000 % 1000');
  assert.equal(C.randomIndex(1000, bytesFrom([3, 233])), 1);
  assert.throws(() => C.randomIndex(0, bytesFrom([0])), RangeError);
  assert.throws(() => C.randomIndex(65537, bytesFrom([0])), RangeError);
  const bytes = lcgBytes(7);
  const seen = new Set();
  for (let k = 0; k < 5000; k++) {
    const v = C.randomIndex(26, bytes);
    assert.ok(v >= 0 && v < 26);
    seen.add(v);
  }
  assert.equal(seen.size, 26, '26 列すべてが出る');
});

test('randomChooser と cryptoBytes の形', () => {
  const chooser = C.randomChooser(bytesFrom([0, 7]));
  assert.equal(chooser(4), 7 % 4);
  const fake = { getRandomValues: (arr) => arr.fill(9) };
  assert.deepEqual([...C.cryptoBytes(fake)(3)], [9, 9, 9]);
});

test('シャッフル: 同じ文字の並べ替え。乱数源が同じなら同じ結果', () => {
  const a = C.shuffle(KEY, lcgBytes(1));
  const b = C.shuffle(KEY, lcgBytes(1));
  assert.equal(a, b);
  assert.notEqual(a, KEY);
  assert.equal([...a].sort().join(''), KEY);
  assert.equal(C.shuffle('A', lcgBytes(1)), 'A');
  assert.equal(C.shuffle('', lcgBytes(1)), '');
});

test('点の読み取り: 形式・負の値・点の数の上限・長すぎる入力', () => {
  assert.deepEqual(C.parsePoints('40,100 80,124\n120.5,148'), {
    pts: [{ x: 40, y: 100 }, { x: 80, y: 124 }, { x: 120.5, y: 148 }],
    errors: [],
  });
  assert.deepEqual(C.parsePoints('   '), { pts: [], errors: [] });
  const bad = C.parsePoints('40,100 abc 2001,148 -5,172 60,196');
  assert.deepEqual(bad.pts, [{ x: 40, y: 100 }, { x: 2001, y: 148 }, { x: 60, y: 196 }], 'x が 2000 を超えても受け付ける');
  assert.deepEqual(bad.errors, [{ code: 'format', token: 'abc', position: 2 }, { code: 'negative', token: '-5,172' }]);
  const many = C.parsePoints(Array.from({ length: 1001 }, (_, i) => `40,${100 + 24 * i}`).join(' '));
  assert.equal(many.pts.length, 1000);
  assert.deepEqual(many.errors, [{ code: 'tooMany', max: 1000 }]);
  assert.deepEqual(C.parsePoints('x'.repeat(50001)).errors, [{ code: 'tooLong', max: 50000 }]);
  assert.deepEqual(C.parsePoints(42).errors, [{ code: 'type' }]);
  assert.deepEqual(C.parsePoints('1e3,5').errors[0].code, 'format');
});

test('最も近い列: ちょうど中間は手前の列。範囲外は端に寄せる。全数で素朴な探索と一致', () => {
  assert.equal(C.nearestKeyIndex(60, 26), 0, '40 と 80 の中間は手前');
  assert.equal(C.nearestKeyIndex(60.01, 26), 1);
  assert.equal(C.nearestKeyIndex(59.99, 26), 0);
  assert.equal(C.nearestKeyIndex(0, 26), 0);
  assert.equal(C.nearestKeyIndex(99999, 26), 25);
  assert.equal(C.nearestKeyIndex(100, 0), -1);
  const brute = (x, n) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(C.colX(i) - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };
  for (let x = -10; x <= 1300; x += 0.25) assert.equal(C.nearestKeyIndex(x, 26), brute(x, 26), String(x));
  for (let x = 0; x <= 2200; x += 0.5) assert.equal(C.nearestKeyIndex(x, 52), brute(x, 52), String(x));
});

test('復号: y の順に読む。同じ y は入力順。鍵が空なら何も読まない', () => {
  assert.equal(C.decrypt([{ x: 80, y: 124 }, { x: 40, y: 100 }], KEY).text, 'ab');
  assert.equal(C.decrypt([{ x: 40, y: 100 }, { x: 80, y: 100 }], KEY).text, 'ab');
  assert.equal(C.decrypt([{ x: 80, y: 100 }, { x: 40, y: 100 }], KEY).text, 'ba');
  assert.equal(C.decrypt([{ x: 40, y: 100 }], '').text, '');
  assert.deepEqual(C.decrypt([{ x: 60, y: 100 }], KEY).sorted, [{ x: 60, y: 100, idx: 0, ch: 'a' }]);
  assert.equal(C.decrypt([], KEY).text, '');
});

test('往復: 長い鍵（1,000 文字）・長い平文（1,000 文字）でも、暗号化した点のテキストを読み戻して復号できる', () => {
  const longKey = 'A'.repeat(999) + 'B';
  const r = C.encrypt('B', longKey);
  assert.equal(C.pointsToText(r.points), '40000,100');
  const back = C.parsePoints(C.pointsToText(r.points));
  assert.deepEqual(back.errors, []);
  assert.equal(C.decrypt(back.pts, longKey).text, 'b');
  const longPlain = C.encrypt('Q'.repeat(1000), KEY);
  const back2 = C.parsePoints(C.pointsToText(longPlain.points));
  assert.deepEqual(back2.errors, []);
  assert.equal(C.decrypt(back2.pts, KEY).text, 'q'.repeat(1000));
  assert.equal(C.pointsToText(longPlain.points.slice(-1)), '680,24076');
});

test('往復（乱数の鍵と平文、200 回）: 鍵にある文字だけが小文字で戻る', () => {
  const rnd = lcg(2026);
  const pickChar = () => String.fromCharCode(65 + Math.floor(rnd() * 26));
  for (let trial = 0; trial < 200; trial++) {
    const keyLen = 1 + Math.floor(rnd() * 60);
    const key = Array.from({ length: keyLen }, pickChar).join('');
    const plainLen = Math.floor(rnd() * 80);
    const plain = Array.from({ length: plainLen }, () => (rnd() < 0.15 ? ' ' : rnd() < 0.5 ? pickChar().toLowerCase() : pickChar())).join('');
    const expected = [...plain.toUpperCase()].filter((c) => key.includes(c)).join('').toLowerCase();
    const r = C.encrypt(plain, key, { chooser: C.randomChooser(lcgBytes(trial + 1)) });
    const back = C.parsePoints(C.pointsToText(r.points));
    assert.deepEqual(back.errors, []);
    assert.equal(C.decrypt(back.pts, key).text, expected, `trial ${trial}: key=${key} plain=${plain}`);
    for (const p of r.points) assert.equal(key[p.idx], p.ch);
  }
});

test('列ごとの点の数', () => {
  const r = C.encrypt('HELLOWORLD', KEY);
  const counts = C.columnCounts(r.points, 26);
  assert.equal(counts.length, 26);
  assert.equal(counts[11], 3, 'L');
  assert.equal(counts[14], 2, 'O');
  assert.equal(counts.reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(C.columnCounts([{ x: 40, y: 100 }], 0), []);
});

test('SVG 文書: 鍵を隠すと鍵の文字も破線も含めない。寸法は鍵と段数に合わせる', () => {
  const r = C.encrypt('SECRET', KEY);
  const hidden = C.svgDocument({ key: KEY, points: r.points, showKey: false });
  assert.ok(hidden.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 600" width="1200" height="600">'));
  assert.equal(hidden.includes('<text'), false);
  assert.equal(hidden.includes('<line'), false);
  assert.equal(hidden.includes('class="guides"'), false);
  assert.equal(hidden.includes('key-letter{'), true, 'スタイルの定義だけは残ってよい（文字がない）');
  assert.ok(hidden.includes(`<polyline points="${C.pointsToText(r.points)}"`));
  assert.equal((hidden.match(/<circle /g) || []).length, 6);
  const shown = C.svgDocument({ key: KEY, points: r.points, showKey: true });
  assert.equal((shown.match(/<text /g) || []).length, 26);
  assert.equal((shown.match(/<line /g) || []).length, 26);
  assert.ok(shown.includes('>A</text>'));
  const wide = C.svgDocument({ key: 'A'.repeat(52), points: [], showKey: true });
  assert.ok(wide.includes('viewBox="0 0 2120 600"'));
  assert.equal(wide.includes('<polyline'), false);
  assert.equal(C.svgDocument({}).includes('<polyline'), false);
});

test('zz-core.js に DOM・危険な書き込みがない', () => {
  const src = read('js/zz-core.js');
  for (const token of ['document', 'window', 'localStorage', 'navigator', 'innerHTML', 'eval(']) {
    assert.equal(src.includes(token), false, `計算部に ${token} がある`);
  }
  assert.doesNotMatch(src, /Math\.random/);
});
