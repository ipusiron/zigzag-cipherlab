import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const css = read('style.css');

// style.css の :root と [data-theme="light"] から、CSS 変数の色を読む
function readVars(selector) {
  const block = css.match(new RegExp(`${selector}\\{([^}]*)\\}`));
  assert.ok(block, `${selector} の定義が見つからない`);
  const vars = {};
  for (const m of block[1].matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) vars[m[1]] = m[2];
  return vars;
}

function toRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

// WCAG 2.2 の相対輝度
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// 半透明の面を下地に重ねる（強調行 accent 10%、危険ボタンの背景 #ff6b6b 10%）
const mix = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));

// 画面で実際に重なる組（文字 → 背景）
const PAIRS = [
  ['text', 'bg'], ['text', 'card'], ['text', 'panel'], ['text', 'btn'],
  ['muted', 'card'], ['muted', 'panel'], ['muted', 'bg'],
  ['on-primary', 'accent'],
  ['low', 'card'], ['medium', 'card'], ['high', 'card'],
  ['low', 'panel'], ['danger', 'panel'], ['danger', 'card'],
  ['accent-text', 'card'], ['accent-text', 'bg'], ['accent-text', 'panel'],
];

const dark = readVars(':root');
const light = { ...dark, ...readVars('\\[data-theme="light"\\]') };

for (const [name, vars] of [['ダーク', dark], ['ライト', light]]) {
  test(`${name}の文字と背景が 4.5:1 以上`, () => {
    for (const [fg, bg] of PAIRS) {
      assert.ok(vars[fg], `--${fg} がない`);
      assert.ok(vars[bg], `--${bg} がない`);
      const r = ratio(toRgb(vars[fg]), toRgb(vars[bg]));
      assert.ok(r >= 4.5, `${name}: --${fg} on --${bg} = ${r.toFixed(2)}:1`);
    }
  });

  test(`${name}の半透明の面の上の文字も 4.5:1 以上（強調行・危険ボタン）`, () => {
    const card = toRgb(vars.card);
    const highlight = mix(toRgb(vars.accent), card, 0.1);
    for (const fg of ['text', 'accent-text', 'low', 'medium', 'high']) {
      const r = ratio(toRgb(vars[fg]), highlight);
      assert.ok(r >= 4.5, `${name}: --${fg} on 強調行 = ${r.toFixed(2)}:1`);
    }
    const dangerBg = mix([255, 107, 107], toRgb(vars.panel), 0.1);
    const r = ratio(toRgb(vars.danger), dangerBg);
    assert.ok(r >= 4.5, `${name}: --danger on 危険ボタン = ${r.toFixed(2)}:1`);
  });
}

test('主要な色をハードコードせず変数で指す（アクティブなタブ・主ボタン・難易度・強調行・コピーの知らせ）', () => {
  assert.match(css, /\.tab\.active\{[^}]*color:var\(--on-primary\)/);
  assert.match(css, /\.btn\.primary\{[^}]*color:var\(--on-primary\)/);
  assert.match(css, /\.difficulty-low\{[^}]*color:var\(--low\)/);
  assert.match(css, /\.difficulty-medium\{[^}]*color:var\(--medium\)/);
  assert.match(css, /\.difficulty-high\{[^}]*color:var\(--high\)/);
  assert.match(css, /\.highlight-row td:first-child\{[^}]*color:var\(--accent-text\)/);
  assert.match(css, /\.msg\{color:var\(--low\)\}/);
  assert.doesNotMatch(css, /color:#0[57]1[23]23/); // 旧の直書き #051323 / #07121e
});

test('アコーディオンの見出しのボタンは文字色を継承させず、変数で指す（ダークで黒くならない）', () => {
  assert.match(css, /\.accordion-header\{[^}]*color:var\(--text\)/);
  assert.match(css, /\.accordion-header\{[^}]*font:inherit/);
  assert.match(css, /\.theme-toggle\{[^}]*color:var\(--text\)/);
});

test('アコーディオンの中身に高さの上限を置かない（grid の 0fr/1fr で開閉）', () => {
  assert.doesNotMatch(css, /max-height:\s*2000px/);
  assert.match(css, /\.accordion-content\{[^}]*grid-template-rows:0fr/);
  assert.match(css, /\.accordion-content\.active\{[^}]*grid-template-rows:1fr/);
});

test('入力欄の文字は16px以上（iOS が勝手に拡大しない）。狭い画面でも小さくしない', () => {
  const sizes = [...css.matchAll(/\.textarea\{([^}]*)\}/g)]
    .map((m) => m[1].match(/font-size:\s*(\d+)px/))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  assert.ok(sizes.length >= 1, '.textarea に font-size の指定がない');
  for (const s of sizes) assert.ok(s >= 16, `font-size ${s}px`);
});

test('リンクの色は本文の背景に対して読める色（--accent-text）を使う', () => {
  assert.match(css, /^a\{color:var\(--accent-text\)\}/m);
});

test('図の枠の高さは変数で持ち、狭い画面の指定が基本の指定に負けない', () => {
  assert.match(css, /\.viz-wrap\{[^}]*max-height:var\(--viz-max\)/);
  assert.ok((css.match(/--viz-max:\d+px/g) || []).length >= 4);
});

test('図は枠の中でスクロールし、固定の高さで縮めない', () => {
  assert.match(css, /\.viz-wrap\{[^}]*overflow:auto/);
  assert.doesNotMatch(css, /\.viz\{[^}]*height:\s*\d+px/);
});

test('ヘッダーのタイトルは中央（3列の grid）', () => {
  assert.match(css, /\.header-content\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /\.header-title\{[^}]*text-align:center/);
});

test('フォーカスが見える。動きを減らす設定を尊重する。hidden 属性が効く', () => {
  assert.match(css, /:focus-visible\{[^}]*outline:3px solid var\(--accent\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\[hidden\]\{display:none !important\}/);
});
