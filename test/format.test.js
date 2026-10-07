import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

// 1行に詰め込んだ（minify した）ファイルを見つける。行数の下限も見る
const FILES = [
  { path: 'js/zz-core.js', maxLine: 160, minLines: 150 },
  { path: 'js/messages.js', maxLine: 360, minLines: 250 }, // 1行1文言なので長い行がある
  { path: 'js/i18n.js', maxLine: 160, minLines: 40 },
  { path: 'script.js', maxLine: 160, minLines: 400 },
  { path: 'style.css', maxLine: 160, minLines: 700 },
  { path: 'index.html', maxLine: 250, minLines: 280 },
  { path: 'test/core.test.js', maxLine: 170, minLines: 150 },
  { path: 'test/html.test.js', maxLine: 200, minLines: 50 },
  { path: 'test/contrast.test.js', maxLine: 160, minLines: 50 },
];

for (const f of FILES) {
  test(`${f.path} が1行に詰め込まれていない`, () => {
    const lines = read(f.path).split('\n').map((l) => l.replace(/\r$/, ''));
    const longest = lines.reduce((a, b) => (a.length > b.length ? a : b), '');
    assert.ok(longest.length <= f.maxLine, `最長 ${longest.length} 文字: ${longest.slice(0, 80)}…`);
    assert.ok(lines.length >= f.minLines, `${lines.length} 行しかない`);
  });
}

test('画面のスクリプトに日本語の文字列リテラルを残さない（文言は messages.js に集める）', () => {
  const js = read('script.js');
  const stripped = js
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
  const literals = [...stripped.matchAll(/(['"`])((?:(?!\1).)*)\1/g)]
    .map((m) => m[2])
    .filter((v) => /[　-ヿ一-鿿＀-￯]/.test(v));
  assert.deepEqual(literals, [], `日本語の文字列が残っている: ${literals.join(' / ')}`);
});

test('計算部は DOM を使わない。画面のスクリプトは計算部の関数で暗号化・復号する', () => {
  const core = read('js/zz-core.js');
  for (const token of ['document', 'window', 'localStorage', 'navigator']) {
    assert.equal(core.includes(token), false, `計算部に ${token} がある`);
  }
  const script = read('script.js');
  for (const fn of ['ZZ.encrypt(', 'ZZ.decrypt(', 'ZZ.parsePoints(', 'ZZ.pointsToText(', 'ZZ.svgDocument(', 'ZZ.shuffle(', 'ZZ.cryptoBytes(']) {
    assert.ok(script.includes(fn), `script.js が ${fn} を使っていない`);
  }
  assert.doesNotMatch(script, /Math\.random/);
  assert.doesNotMatch(script, /innerHTML|outerHTML|document\.write|eval\(/);
  assert.doesNotMatch(script, /setAttribute\('style'/);
});

test('改行コードは LF（リポジトリーの既定）', () => {
  for (const f of ['js/zz-core.js', 'js/messages.js', 'js/i18n.js', 'script.js', 'test/core.test.js']) {
    assert.equal(read(f).includes('\r'), false, `${f} に CR がある`);
  }
});
