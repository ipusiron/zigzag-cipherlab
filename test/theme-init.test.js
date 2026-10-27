import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { read } from './load.js';

// theme-init.js を、保存値と OS 設定を差し替えた仮の window で動かし、<html> の data-theme を返す。
function run({ saved = null, prefersDark = false, storageThrows = false } = {}) {
  const attrs = {};
  const window = {
    localStorage: { getItem: () => { if (storageThrows) throw new Error('blocked'); return saved; } },
    matchMedia: () => ({ matches: prefersDark }),
    document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } } },
  };
  vm.runInNewContext(read('js/theme-init.js'), { window });
  return attrs['data-theme'];
}

test('保存値がなければ OS の設定に従う', () => {
  assert.equal(run({ prefersDark: true }), 'dark');
  assert.equal(run({ prefersDark: false }), 'light');
});

test('保存値（zigzag-theme）は OS の設定より優先する', () => {
  assert.equal(run({ saved: 'light', prefersDark: true }), 'light');
  assert.equal(run({ saved: 'dark', prefersDark: false }), 'dark');
});

test('想定外の保存値は無視して OS の設定に従う', () => {
  assert.equal(run({ saved: 'blue', prefersDark: true }), 'dark');
  assert.equal(run({ saved: 'blue', prefersDark: false }), 'light');
});

test('localStorage が使えなくても落ちず、OS の設定に従う', () => {
  assert.equal(run({ storageThrows: true, prefersDark: false }), 'light');
});

test('index.html の <head> で、stylesheet のあとに同期で読み込む', () => {
  const html = read('index.html');
  const head = html.slice(0, html.indexOf('</head>'));
  assert.ok(head.includes('<script src="js/theme-init.js"></script>'), '<head> に theme-init.js がない');
  assert.ok(head.indexOf('style.css') < head.indexOf('js/theme-init.js'));
});

test('保存キーは画面のスクリプトと同じ', () => {
  assert.ok(read('js/theme-init.js').includes("getItem('zigzag-theme')"));
  assert.ok(read('script.js').includes("setItem('zigzag-theme'"));
});
