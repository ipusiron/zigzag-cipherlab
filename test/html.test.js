import test from 'node:test';
import assert from 'node:assert/strict';
import { read } from './load.js';

const html = read('index.html');

test('CSP の meta があり、meta では効かない指定と unsafe-inline を書かない', () => {
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(csp, 'CSP の meta がない');
  assert.match(csp[1], /default-src 'self'/);
  assert.match(csp[1], /script-src 'self'/);
  assert.match(csp[1], /style-src 'self'/);
  assert.match(csp[1], /base-uri 'none'/);
  assert.match(csp[1], /form-action 'none'/);
  assert.match(csp[1], /connect-src 'none'/);
  assert.match(csp[1], /object-src 'none'/);
  assert.doesNotMatch(csp[1], /frame-ancestors/); // meta では効かない
  assert.doesNotMatch(csp[1], /unsafe-inline|unsafe-eval/);
  for (const name of ['X-Frame-Options', 'X-Content-Type-Options', 'X-XSS-Protection']) {
    assert.equal(html.includes(name), false, `${name} は meta では効かない`);
  }
});

test('referrer の meta と favicon の指定がある', () => {
  assert.match(html, /<meta name="referrer" content="no-referrer"/);
  assert.match(html, /<link rel="icon" href="data:,"/);
});

test('インラインのイベントハンドラーと style 属性がない', () => {
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=\s*"/i);
  assert.doesNotMatch(html, /javascript:/i);
});

test('スクリプトは計算部・文言・画面の順に読み込む', () => {
  const srcs = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepEqual(srcs, ['js/zz-core.js', 'js/zz-practice.js', 'js/messages.js', 'js/i18n.js', 'script.js']);
});

test('主要な要素の id がそろっている', () => {
  const ids = [
    'themeToggle', 'keyInput', 'btnKeyApply', 'btnKeyShuffle', 'btnKeyReset', 'statLen', 'statDup', 'statMiss', 'keyNotice', 'svgKeyPreview',
    'plainInput', 'encNotice', 'chkRealtime', 'chkShowKeyEnc', 'btnEncrypt', 'encryptedPoints', 'btnExportPoints', 'btnDownloadSVG', 'exportMsg',
    'btnEncClear', 'btnEncStepPlay', 'btnEncStepStop', 'svgEncrypt',
    'pointsInput', 'decErrorMsg', 'chkShowKeyDec', 'btnSyncFromEnc', 'btnDecode', 'decodedOutput', 'btnDecClear', 'btnDecStepPlay', 'btnDecStepStop',
    'svgDecrypt', 'about-basic', 'about-comparison', 'about-uniqueness',
    'dupMode', 'btnDownloadPNG', 'btnShareLink', 'btnLoadSvg', 'svgFile',
    'anaKeyLen', 'anaDup', 'anaPoints', 'anaNotice', 'anaIndices', 'anaLetters', 'btnAnaCopy', 'lnkFreq', 'anaMsg', 'svgAnalyze',
    'pracMode', 'pracSeed', 'btnPracRandom', 'btnPracStart', 'pracKeyLine', 'pracHints', 'btnHintFreq', 'btnHintTop', 'btnHintKey',
    'pracHintText', 'pracAnswer', 'btnPracCheck', 'btnPracReveal', 'pracResult', 'pracScore', 'pracTotal', 'svgPractice',
  ];
  for (const id of ids) assert.ok(html.includes(`id="${id}"`), `id="${id}" がない`);
});

test('タブとパネルが id で結ばれている（role・aria-controls・aria-labelledby）', () => {
  const re = new RegExp('<button class="tab[^"]*" id="tab-btn-(\\w+)" type="button" role="tab" '
    + 'data-tab="tab-(\\w+)"[^>]*aria-controls="tab-(\\w+)"', 'g');
  const tabs = [...html.matchAll(re)];
  assert.equal(tabs.length, 6);
  for (const [, btnKey, dataKey, panelKey] of tabs) {
    assert.equal(btnKey, dataKey);
    assert.equal(btnKey, panelKey);
    assert.ok(
      new RegExp(`<section id="tab-${panelKey}"[^>]*role="tabpanel"[^>]*aria-labelledby="tab-btn-${panelKey}"`).test(html),
      `tab-${panelKey} のパネルに aria-labelledby がない`,
    );
  }
  assert.match(html, /<nav class="tabs" role="tablist" aria-label="[^"]+"[^>]*>/);
});

test('アコーディオンは見出しの中のボタン（button の中に h2 を入れない）で、aria-expanded と aria-controls がある', () => {
  assert.doesNotMatch(html, /<button[^>]*>\s*<h2/);
  const re = new RegExp('<h2 class="accordion-title">\\s*<button class="accordion-header[^"]*" type="button" '
    + 'data-target="([\\w-]+)" aria-expanded="(true|false)" aria-controls="([\\w-]+)">', 'g');
  const headers = [...html.matchAll(re)];
  assert.equal(headers.length, 3);
  for (const [, target, , controls] of headers) {
    assert.equal(target, controls);
    assert.ok(html.includes(`<div class="accordion-content${target === 'about-basic' ? ' active' : ''}" id="${target}">`), target);
  }
  assert.equal((html.match(/class="accordion-inner"/g) || []).length, 3);
});

test('図は viz-wrap の中にあり、読み上げ用の名前がある', () => {
  const re = new RegExp('<div class="viz-wrap">\\s*<svg id="(\\w+)" class="viz" viewBox="0 0 1200 600" '
    + 'width="1200" height="600" role="img" aria-label="[^"]+" data-i18n-attr="aria-label:[\\w.]+"></svg>', 'g');
  const svgs = [...html.matchAll(re)];
  assert.deepEqual(svgs.map((m) => m[1]), ['svgKeyPreview', 'svgEncrypt', 'svgDecrypt', 'svgPractice']);
  assert.match(html, /<div class="viz-wrap">\s*<svg id="svgAnalyze" class="viz" viewBox="0 0 1200 440" width="1200" height="440" role="img" aria-label="[^"]+"[^>]*>/);
});

test('ボタンは type="button"、知らせの要素は aria-live', () => {
  for (const m of html.matchAll(/<button [^>]*>/g)) assert.match(m[0], /type="button"/, m[0]);
  for (const id of ['keyNotice', 'encNotice', 'decErrorMsg', 'exportMsg', 'anaNotice', 'anaMsg', 'pracKeyLine', 'pracHintText', 'pracResult']) {
    assert.ok(new RegExp(`id="${id}"[^>]*aria-live="polite"`).test(html), `${id} に aria-live がない`);
  }
});

test('noscript と viewport と lang がある', () => {
  assert.match(html, /<html lang="ja">/);
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1"/);
  assert.match(html, /<noscript>/);
});

test('外部への読み込みがない（同一オリジンだけ）。外部リンクに rel="noopener noreferrer"', () => {
  const urls = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  for (const u of urls) assert.ok(u.startsWith('https://github.com/') || u.startsWith('https://ipusiron.github.io/'), u);
  // 解析タブの Frequency Analyzer へのリンク（新しいタブで開く。鍵は渡さない）
  assert.match(html, /<a id="lnkFreq" class="btn primary link-btn" href="https:\/\/ipusiron\.github\.io\/frequency-analyzer\/" target="_blank" rel="noopener noreferrer"[^>]*>/);
  assert.doesNotMatch(html, /<link[^>]+href="https?:\/\//);
  assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//);
  for (const m of html.matchAll(/<a [^>]*href="https?:\/\/[^"]+"[^>]*>/g)) assert.match(m[0], /rel="noopener noreferrer"/, m[0]);
});

test('重複鍵の選び方の select は計算部の id と同じ値を持つ', () => {
  const values = [...html.matchAll(/<option value="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(values, ['random', 'cycle', 'first', 'read', 'guess']);
  assert.match(html, /<input id="pracSeed" class="input-number" type="number" min="1" max="999999" step="1" value="1" \/>/);
  assert.match(html, /<select id="dupMode" class="select">/);
  assert.match(html, /<input type="file" id="svgFile" accept="\.svg,image\/svg\+xml" hidden \/>/);
});

test('リード文は現行の仕様（「鍵を表示」を OFF にすると折れ線だけになる）', () => {
  assert.match(html, /「鍵を表示」をOFFにすると、折れ線だけが暗号文になります/);
  assert.doesNotMatch(html, /「暗号化」で鍵と破線を隠すと/);
});

test('テーマと言語のボタンに読み上げ用の名前があり、title も辞書から入る', () => {
  assert.match(html, /<button id="langToggle" class="lang-toggle" type="button" data-i18n="ui\.langButton" data-i18n-attr="aria-label:ui\.langLabel">/);
  assert.match(html, /<button id="themeToggle" class="theme-toggle" type="button" data-i18n-attr="aria-label:theme\.toLight">/);
  assert.match(html, /<title data-i18n="ui\.docTitle">/);
});
