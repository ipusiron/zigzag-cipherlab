import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { read, core } from './load.js';

const C = core();
const readme = read('README.md');
const readmeEn = read('README.en.md');
const html = read('index.html');
const ROOT = new URL('..', import.meta.url);
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

test('YAML メタデータの構造と値を保つ', () => {
  const block = readme.match(/^<!--\n---\n([\s\S]*?)\n---\n-->/);
  assert.ok(block, 'HTML コメントで囲んだ YAML がない');
  const yaml = block[1];
  assert.match(yaml, /^id: day072$/m);
  assert.match(yaml, /^slug: zigzag-cipherlab$/m);
  assert.match(yaml, /^repo_url: "https:\/\/github\.com\/ipusiron\/zigzag-cipherlab"$/m);
  assert.match(yaml, /^demo_url: "https:\/\/ipusiron\.github\.io\/zigzag-cipherlab\/"$/m);
  assert.match(yaml, /^hub: true$/m);
  assert.match(yaml, /^difficulty: \d$/m);
  // 配列はブロック形式（「- 」で始まる行）であること。フロー形式 [a, b] に書き換えない
  for (const key of ['category_ja', 'category_en', 'tags']) {
    const m = yaml.match(new RegExp(`^${key}:\\n((?:  - .+\\n)+)`, 'm'));
    assert.ok(m, `${key} がブロック形式でない`);
  }
});

test('README の例（HELLOWORLD の点と復号）がコードの出力と一致する', () => {
  const r = C.encrypt('HELLOWORLD', KEY);
  const text = C.pointsToText(r.points);
  assert.ok(readme.includes('`' + text + '`'), 'README に HELLOWORLD の点の列がない');
  assert.equal(C.decrypt(r.points, KEY).text, 'helloworld');
  // 1文字ずつの表（文字・列・点）
  const rows = [...readme.matchAll(/^\| ([A-Z]) \| (\d+) \| (\d+),(\d+) \|$/gm)];
  assert.equal(rows.length, 10, '1文字ずつの表が10行ない');
  rows.forEach(([, ch, idx, x, y], i) => {
    const p = r.points[i];
    assert.equal(ch, p.ch, `${i}行目の文字`);
    assert.equal(Number(idx), p.idx, `${i}行目の列`);
    assert.equal(Number(x), p.x, `${i}行目の x`);
    assert.equal(Number(y), p.y, `${i}行目の y`);
  });
});

test('README の座標の式と上限が計算部と一致する', () => {
  assert.ok(readme.includes(`x = ${C.LAYOUT.marginX} + ${C.LAYOUT.colGap} × 列番号`), '列の式がない');
  assert.ok(readme.includes(`y = ${C.LAYOUT.guideTopY} + ${C.LAYOUT.rowGap} × 段番号`), '段の式がない');
  const limits = {};
  for (const m of readme.matchAll(/^\| (鍵の長さ|平文の文字数|折れ線ポイントの数|折れ線ポイントの入力) \| ([\d,]+)(文字|点) \|/gm)) {
    limits[m[1]] = Number(m[2].replace(/,/g, ''));
  }
  assert.deepEqual(limits, {
    鍵の長さ: C.LIMITS.key,
    平文の文字数: C.LIMITS.letters,
    折れ線ポイントの数: C.LIMITS.points,
    折れ線ポイントの入力: C.LIMITS.rawPoints,
  });
});

test('README の例（逆順の鍵でアトバシュ）が両方の README にあり、コードの出力と一致する', () => {
  const rev = [...KEY].reverse().join('');
  const r = C.encrypt('HELLOWORLD', rev);
  const letters = C.columnLetters(C.columnSequence(r.points, 26).indices, 26);
  assert.equal(letters, 'SVOOLDLIOW');
  for (const [name, text] of [['README.md', readme], ['README.en.md', readmeEn]]) {
    assert.ok(text.includes('`' + rev + '`'), `${name} に逆順の鍵がない`);
    assert.ok(text.includes('`' + letters + '`'), `${name} にアトバシュの例がない`);
  }
});

test('README の画像がすべて実在し、assets/ の PNG は README から参照されているものだけ', () => {
  const imgs = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  const local = imgs.filter((u) => !u.startsWith('http'));
  assert.ok(local.length >= 5, `画像の参照が ${local.length} 件しかない`);
  for (const rel of local) assert.ok(fs.existsSync(new URL(rel, ROOT)), `${rel} がない`);
  const pngs = fs.readdirSync(new URL('assets/', ROOT)).filter((f) => f.endsWith('.png'));
  for (const f of pngs) assert.ok(local.includes(`assets/${f}`), `assets/${f} が README から参照されていない`);
  // 1枚ごとにキャプション（> *…* の形）がある
  for (const rel of local) {
    const re = new RegExp(`!\\[[^\\]]*\\]\\(${rel.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\)\\s*\\n>\\s*\\*[^*]+\\*`);
    assert.match(readme, re, `${rel} のキャプションがない`);
  }
});

test('ディレクトリー構造に全ファイルが載っていて、全行に説明がある', () => {
  const tree = readme.match(/## 📁 ディレクトリー構造\n\n```\n([\s\S]*?)```/);
  assert.ok(tree, 'ディレクトリー構造がない');
  const lines = tree[1].trim().split('\n');
  for (const line of lines.slice(1)) assert.match(line, /# .+$/, `説明のない行: ${line}`);

  const skip = new Set(['.git', 'node_modules', '.claude']);
  const found = [];
  const walk = (dir, prefix) => {
    for (const entry of fs.readdirSync(new URL(dir, ROOT), { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const rel = prefix + entry.name;
      if (entry.isDirectory()) walk(`${dir}${entry.name}/`, `${rel}/`);
      else found.push(rel);
    }
  };
  walk('', '');
  for (const file of found) {
    const base = path.basename(file);
    assert.ok(lines.some((l) => l.includes(`${base} `)), `ツリーに ${file} がない`);
  }
  for (const line of lines.slice(1)) {
    const name = line.replace(/^[│├└─\s]+/, '').split(/\s+#/)[0].trim();
    if (!name || name.endsWith('/')) continue;
    assert.ok(found.some((f) => path.basename(f) === name), `ツリーの ${name} が実在しない`);
  }
});

test('シリーズ標準の見出しがそろっている', () => {
  for (const h of [
    '# Zigzag CipherLab - ジグザグ暗号ツール',
    '**Day072 - 生成AIで作るセキュリティツール100**',
    '## 🌐 デモページ',
    '## 📸 スクリーンショット',
    '## 🔐 ジグザグ暗号とは',
    '## ✨ 機能',
    '## 📖 使い方',
    '## 🔬 技術的な説明',
    '## 🎯 ユースケース',
    '## 🔒 セキュリティ',
    '## ⚠️ 注意',
    '## 🔗 参考・関連ツール',
    '## 📁 ディレクトリー構造',
    '## 🧪 テスト',
    '## 💻 動作環境',
    '## 📄 ライセンス',
    '## 🛠️ このツールについて',
  ]) {
    assert.ok(readme.includes(h), `${h} がない`);
  }
  assert.ok(readme.includes('https://akademeia.info/?page_id=42163'));
  assert.doesNotMatch(readme, /page_id=44607/);
});

test('関連ツールの名前は各 README の YAML の title どおり', () => {
  for (const name of ['Frequency Analyzer', 'RailFence CipherLab', 'Columnar CipherLab', 'Playfair CipherLab', 'DancingMen CipherLab', 'Pigpen CipherLab']) {
    assert.ok(readme.includes(name), `${name} がない`);
  }
  assert.doesNotMatch(readme, /Railfence CipherLab|Rail Fence CipherLab|Dancingmen CipherLab/);
});

test('座学と README の分類の用語がそろっている（多字換字・縦列転置式・同音換字。「唯一」「多表式になる」と書かない）', () => {
  for (const text of [html, readme]) {
    assert.ok(text.includes('多字換字式'), '多字換字式 がない');
    assert.ok(text.includes('縦列転置式暗号'), '縦列転置式暗号 がない');
    assert.ok(text.includes('同音換字'), '同音換字 がない');
    assert.doesNotMatch(text, /唯一の/);
    assert.doesNotMatch(text, /棚暗号/);
    assert.doesNotMatch(text, /多表式になる|多表式の特性/);
    assert.doesNotMatch(text, /幾何学的復元が必要/);
  }
  // プレイフェア・四方暗号を多表式に分類しない
  for (const name of ['プレイフェア暗号', '四方暗号']) {
    assert.doesNotMatch(html, new RegExp(`<td>${name}</td>\\s*<td>多表式</td>`));
    assert.doesNotMatch(readme, new RegExp(`\\| ${name} \\| 多表式 \\|`));
  }
});

// 表記のゆれ。README・index.html・文言の辞書をまとめて見る
const NG = [
  [/サーバ(?![ーイ])/, 'サーバー'],
  [/ユーザ(?![ー])/, 'ユーザー'],
  [/ブラウザ(?![ー])/, 'ブラウザー'],
  [/エディタ(?![ー])/, 'エディター'],
  [/パラメータ(?![ー])/, 'パラメーター'],
  [/フォルダ(?![ー])/, 'フォルダー'],
  [/リポジトリ(?![ー])/, 'リポジトリー'],
  [/ライブラリ(?![ー])/, 'ライブラリー'],
  [/ディレクトリ(?![ー])/, 'ディレクトリー'],
  [/インターフェース/, 'インターフェイス'],
  [/分かる|分かり|分から/, 'わかる'],
  [/全て/, 'すべて'],
  [/既に/, 'すでに'],
  [/[^。、]無い/, 'ない'],
  [/もっとも基本/, '最も基本'],
];

for (const file of ['README.md', 'index.html', 'js/messages.js']) {
  test(`${file} の表記をそろえる`, () => {
    const text = read(file);
    for (const [re, should] of NG) {
      const m = text.match(re);
      assert.equal(m, null, m ? `「${m[0]}」は「${should}」に（${file}）` : '');
    }
  });
}

test('README に過去の版との違いを書かない', () => {
  for (const re of [/改修前/, /以前は/, /初期の実装/, /旧バージョン/, /誤りだった/]) {
    assert.doesNotMatch(readme, re);
  }
});

// ---- 英語版の README（要約にせず、同じ節をそろえる）

test('日本語版と英語版で、見出しの数・順・階層がそろっている', () => {
  const levels = (text) => [...text.matchAll(/^(#{1,3}) /gm)].map((m) => m[1].length);
  const ja = levels(readme);
  const en = levels(readmeEn);
  assert.ok(ja.length >= 25, `見出しが ${ja.length} 個しかない`);
  assert.deepEqual(en, ja, `見出しの数か階層が違う（ja ${ja.length} / en ${en.length}）`);
});

test('英語版に日本語の本文が残っていない', () => {
  const body = readmeEn
    .split('\n')
    .filter((line) => !line.includes('README.md') && !line.includes('日本語'))
    .join('\n');
  const hits = [...body.matchAll(/[぀-ヿ一-鿿]+/g)].map((m) => m[0]);
  assert.deepEqual(hits, [], `日本語が残っている: ${hits.slice(0, 5).join(' / ')}`);
});

test('両方の README が互いにリンクし、YAML メタデータは日本語版だけに置く', () => {
  assert.match(readme, /^\[English\]\(README\.en\.md\) · 日本語$/m);
  assert.match(readmeEn, /^English · \[日本語\]\(README\.md\)$/m);
  assert.doesNotMatch(readmeEn, /^id: day072$/m);
  assert.ok(readmeEn.includes('**Day072 - 100 Security Tools with Generative AI**'));
  assert.ok(readmeEn.includes('https://akademeia.info/?page_id=42163'));
});

test('英語版の例・式・上限がコードの出力と一致する', () => {
  const r = C.encrypt('HELLOWORLD', KEY);
  assert.ok(readmeEn.includes('`' + C.pointsToText(r.points) + '`'));
  assert.ok(readmeEn.includes('`helloworld`'));
  const rows = [...readmeEn.matchAll(/^\| ([A-Z]) \| (\d+) \| (\d+),(\d+) \|$/gm)];
  assert.equal(rows.length, 10);
  rows.forEach(([, ch, idx, x, y], i) => {
    assert.equal(ch, r.points[i].ch);
    assert.equal(Number(idx), r.points[i].idx);
    assert.equal(Number(x), r.points[i].x);
    assert.equal(Number(y), r.points[i].y);
  });
  assert.ok(readmeEn.includes(`x = ${C.LAYOUT.marginX} + ${C.LAYOUT.colGap} × column`));
  assert.ok(readmeEn.includes(`y = ${C.LAYOUT.guideTopY} + ${C.LAYOUT.rowGap} × row`));
  const limits = {};
  for (const m of readmeEn.matchAll(/^\| (Key length|Plaintext length|Number of polyline points|Polyline points input) \| ([\d,]+) (letters|points|characters) \|/gm)) {
    limits[m[1]] = Number(m[2].replace(/,/g, ''));
  }
  assert.deepEqual(limits, {
    'Key length': C.LIMITS.key,
    'Plaintext length': C.LIMITS.letters,
    'Number of polyline points': C.LIMITS.points,
    'Polyline points input': C.LIMITS.rawPoints,
  });
});

test('英語版の画像は assets/en/ にあってすべて実在し、assets/en/ の PNG は英語版から参照されているものだけ', () => {
  const imgs = [...readmeEn.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]);
  const local = imgs.filter((u) => !u.startsWith('http'));
  assert.ok(local.length >= 5, `画像の参照が ${local.length} 件しかない`);
  for (const rel of local) {
    assert.ok(rel.startsWith('assets/en/'), `英語版は英語の画面を使う: ${rel}`);
    assert.ok(fs.existsSync(new URL(rel, ROOT)), `${rel} がない`);
  }
  const pngs = fs.readdirSync(new URL('assets/en/', ROOT)).filter((f) => f.endsWith('.png'));
  for (const f of pngs) assert.ok(local.includes(`assets/en/${f}`), `assets/en/${f} が英語版から参照されていない`);
});

test('英語版のディレクトリー構造にも全ファイルが載っていて、全行に説明がある', () => {
  const tree = readmeEn.match(/## 📁 Directory structure\n\n```\n([\s\S]*?)```/);
  assert.ok(tree, '英語版にディレクトリー構造がない');
  const lines = tree[1].trim().split('\n');
  for (const line of lines.slice(1)) assert.match(line, /# .+$/, `説明のない行: ${line}`);
  const jaTree = readme.match(/## 📁 ディレクトリー構造\n\n```\n([\s\S]*?)```/)[1].trim().split('\n');
  const names = (ls) => ls.map((l) => l.replace(/^[│├└─\s]+/, '').split(/\s+#/)[0].trim());
  assert.deepEqual(names(lines), names(jaTree), '日英のツリーのファイル名がそろっていない');
});

test('英語版の関連ツールの名前も YAML の title どおり', () => {
  for (const name of ['Frequency Analyzer', 'RailFence CipherLab', 'Columnar CipherLab', 'Playfair CipherLab', 'DancingMen CipherLab', 'Pigpen CipherLab']) {
    assert.ok(readmeEn.includes(name), `${name} がない`);
  }
});
