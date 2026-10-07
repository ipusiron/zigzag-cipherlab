import test from 'node:test';
import assert from 'node:assert/strict';
import { read, load } from './load.js';

const { MESSAGES, t, setLanguage, getLanguage } = load('js/messages.js').ZZMessages;
const I18N = load('js/i18n.js').ZZI18n;
const html = read('index.html');
const JAPANESE = new RegExp('[' + [[0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x9fff], [0xff00, 0xffef]]
  .map(([a, b]) => String.fromCharCode(a) + '-' + String.fromCharCode(b)).join('') + ']');

test('日本語と英語の辞書は同じキーを持ち、置き場所（{name}）もそろう', () => {
  const ja = Object.keys(MESSAGES.ja);
  assert.deepEqual(Object.keys(MESSAGES.en).sort(), [...ja].sort());
  const ph = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of ja) assert.equal(ph(MESSAGES.en[k]), ph(MESSAGES.ja[k]), k);
  assert.ok(ja.length >= 150, String(ja.length));
  // 同じキーを2回書くと後勝ちで黙って上書きされるので、辞書のソースで重複を数える
  const src = read('js/messages.js');
  for (const lang of ['ja', 'en']) {
    const block = src.slice(src.indexOf(`const ${lang} = {`), src.indexOf('};', src.indexOf(`const ${lang} = {`)));
    const keys = [...block.matchAll(/^\s+'([\w.]+)':/gm)].map((m) => m[1]);
    assert.equal(new Set(keys).size, keys.length, `${lang} に重複したキーがある`);
  }
});

test('英語の文言に日本語の文字がない（言語の切り替えボタンの「日本語」は例外）', () => {
  for (const [k, v] of Object.entries(MESSAGES.en)) {
    if (k === 'ui.langButton') continue;
    assert.doesNotMatch(v, JAPANESE, k);
  }
  assert.equal(MESSAGES.en['ui.langButton'], '日本語');
  assert.equal(MESSAGES.ja['ui.langButton'], 'EN');
});

test('index.html の data-i18n のキーは辞書にあり、書いた日本語は辞書の日本語と同じ', () => {
  const pairs = [...html.matchAll(/data-i18n="([\w.]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.ok(pairs.length >= 130, String(pairs.length));
  for (const [k, text] of pairs) {
    assert.ok(k in MESSAGES.ja, `辞書にないキー: ${k}`);
    assert.equal(text.trim(), MESSAGES.ja[k].trim(), k);
  }
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
    for (const part of m[1].split(';')) assert.ok(part.split(':')[1] in MESSAGES.ja, part);
  }
});

test('index.html の表示テキストは、コードと一部の固定語を除いて data-i18n で差し替わる', () => {
  const stripped = html
    .replace(/<pre>[\s\S]*?<\/pre>/g, '')
    .replace(/<code>[\s\S]*?<\/code>/g, '')
    .replace(/<[a-z0-9]+\b[^>]*\bdata-i18n="[\w.]+"[^>]*>[^<]*<\/[a-z0-9]+>/g, '')
    .replace(/\b(placeholder|aria-label|title)="[^"]*"/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  const lines = stripped.split('\n').filter((l) => JAPANESE.test(l));
  assert.deepEqual(lines, []);
});

test('t() は言語の辞書から引き、無いキーは日本語かキーそのものを返す。{name} を埋める', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('ui.tabKey'), 'Key');
  assert.equal(t('enc.skipped', { count: 2, detail: 'x' }), 'Skipped 2 characters (x).');
  assert.equal(t('nope.key'), 'nope.key');
  setLanguage('xx');
  assert.equal(getLanguage(), 'ja');
  assert.equal(t('ui.tabKey'), '鍵生成');
  assert.equal(t('dec.format', { token: 'abc', position: 2 }), '不正な形式: "abc"（2番目）');
});

test('初期の言語: ?lang= → 保存した選択 → ブラウザーの言語（日本語以外は英語）', () => {
  assert.equal(I18N.KEY, 'zigzag-cipherlab-lang');
  assert.equal(I18N.initialLanguage('?lang=en', 'ja', ['ja-JP']), 'en');
  assert.equal(I18N.initialLanguage('?x=1&lang=ja', 'en', ['en-US']), 'ja');
  assert.equal(I18N.initialLanguage('?lang=fr', null, ['ja-JP']), 'ja');
  assert.equal(I18N.initialLanguage('', 'en', ['ja-JP']), 'en');
  assert.equal(I18N.initialLanguage('', null, ['ja']), 'ja');
  assert.equal(I18N.initialLanguage('', null, ['fr-FR', 'ja']), 'en');
  assert.equal(I18N.initialLanguage('', 'xx', []), 'en');
});

test('script.js が出す動的な文言のキーがそろう', () => {
  const script = read('script.js');
  const used = new Set([...script.matchAll(/\bt\('([\w.]+)'\s*[,)]/g)].map((m) => m[1]));
  // 'dec.' + e.code の形で引くもの
  for (const code of ['format', 'number', 'negative', 'tooMany', 'tooLong', 'type', 'noSource', 'emptyKey', 'noPolyline', 'loaded', 'loadFail', 'sharedLoaded']) {
    used.add(`dec.${code}`);
  }
  for (const k of used) assert.ok(k in MESSAGES.ja && k in MESSAGES.en, `辞書にないキー: ${k}`);
  assert.ok(used.size >= 25, String(used.size));
});
