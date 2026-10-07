import test from 'node:test';
import assert from 'node:assert/strict';
import { core, load, read } from './load.js';

const C = core();
const P = load('js/zz-practice.js').ZZPractice;
const KEY = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

test('例文は大文字の英字と空白だけ。短い例文は 40 文字以下、長い例文は 60 文字以上', () => {
  for (const s of [...P.SHORT_TEXTS, ...P.LONG_TEXTS]) assert.match(s, /^[A-Z ]+$/, s);
  for (const s of P.SHORT_TEXTS) assert.ok(s.replace(/ /g, '').length <= 40, s);
  for (const s of P.LONG_TEXTS) assert.ok(s.replace(/ /g, '').length >= 60, s);
  assert.ok(P.SHORT_TEXTS.length >= 20);
  assert.ok(P.LONG_TEXTS.length >= 8);
  assert.equal(new Set(P.SHORT_TEXTS).size, P.SHORT_TEXTS.length);
  assert.equal(new Set(P.LONG_TEXTS).size, P.LONG_TEXTS.length);
  assert.equal(P.ENGLISH_ORDER.length, 26);
  assert.equal([...P.ENGLISH_ORDER].sort().join(''), KEY);
});

test('問題番号ごとに同じ問題。モードが違えば別の問題。鍵は 26 文字の並べ替えで既定の並びではない', () => {
  const a = P.makeQuiz('read', 1);
  const b = P.makeQuiz('read', 1);
  assert.deepEqual(a, b);
  assert.equal(a.mode, 'read');
  assert.equal(a.seed, 1);
  assert.equal([...a.key].sort().join(''), KEY);
  assert.notEqual(a.key, KEY);
  assert.ok(P.SHORT_TEXTS.includes(a.plain));
  assert.equal(a.letters, a.plain.replace(/ /g, ''));
  assert.equal(a.points.length, a.letters.length);
  const g = P.makeQuiz('guess', 1);
  assert.ok(P.LONG_TEXTS.includes(g.plain));
  assert.notEqual(g.key, a.key);
  assert.notEqual(P.makeQuiz('read', 2).key, a.key);
  assert.throws(() => P.makeQuiz('nope', 1), RangeError);
  assert.throws(() => P.makeQuiz('read', 0), RangeError);
  assert.throws(() => P.makeQuiz('read', 1000000), RangeError);
  assert.throws(() => P.makeQuiz('read', 1.5), RangeError);
  assert.ok(P.isValidSeed(999999) && !P.isValidSeed('1') && !P.isValidSeed(-1));
});

test('問題の点は、その鍵で復号すると平文の文字に戻る（番号 1〜300、両モード）', () => {
  const plains = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    for (const mode of P.MODES) {
      const q = P.makeQuiz(mode, seed);
      assert.equal(C.decrypt(q.points, q.key).text, q.letters.toLowerCase(), `${mode} ${seed}`);
      assert.equal(new Set(q.key).size, 26, `${mode} ${seed}: 鍵に重複`);
      plains.add(q.plain);
    }
  }
  assert.ok(plains.size >= 25, `例文の出方が偏っている: ${plains.size}`);
});

test('答え合わせ: 英字だけを大文字で比べ、同じ位置で合っている文字を数える', () => {
  const q = P.makeQuiz('read', 1);
  assert.deepEqual(P.checkAnswer(q, q.plain.toLowerCase()), { correct: true, matched: q.letters.length, total: q.letters.length, length: q.letters.length });
  assert.equal(P.checkAnswer(q, q.plain.split('').join(' ')).correct, true, '空白はどこにあってもよい');
  assert.equal(P.checkAnswer(q, q.plain + '!').correct, true, '記号は無視');
  assert.equal(P.checkAnswer(q, q.plain + 'X').correct, false, '余分な文字は不正解');
  const partial = P.checkAnswer(q, q.letters.slice(0, 3));
  assert.deepEqual([partial.correct, partial.matched, partial.length], [false, 3, 3]);
  assert.deepEqual(P.checkAnswer(q, '').matched, 0);
  assert.equal(P.normalizeAnswer('héllo, wörld!'), 'HLLOWRLD');
});

test('ヒント: 列の頻度は多い順（同数は列番号順）、上位の列の文字は鍵の文字', () => {
  const q = P.makeQuiz('guess', 7);
  const ranked = P.frequencyHint(q);
  assert.equal(ranked.reduce((a, c) => a + c.count, 0), q.letters.length);
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].count > ranked[i].count || (ranked[i - 1].count === ranked[i].count && ranked[i - 1].idx < ranked[i].idx));
  }
  const top3 = P.revealHint(q, 3);
  assert.equal(top3.length, 3);
  for (const h of top3) {
    assert.equal(h.letter, q.key[h.idx]);
    assert.equal(h.count, (q.letters.match(new RegExp(h.letter, 'g')) || []).length, `${h.letter} の数`);
  }
  assert.deepEqual(P.frequencyHint(q, 2), ranked.slice(0, 2));
  // 既定の鍵で HELLOWORLD なら L(11)=3、O(14)=2 が上位
  const fake = { key: KEY, letters: 'HELLOWORLD', points: C.encrypt('HELLOWORLD', KEY).points };
  assert.deepEqual(P.frequencyHint(fake, 2), [{ idx: 11, count: 3 }, { idx: 14, count: 2 }]);
  assert.deepEqual(P.revealHint(fake, 1), [{ idx: 11, count: 3, letter: 'L' }]);
});

test('長い例文は英語らしい頻度（最も多い文字が E・T・A・O のどれか）で、ヒントが効く', () => {
  for (const s of P.LONG_TEXTS) {
    const counts = {};
    for (const ch of s.replace(/ /g, '')) counts[ch] = (counts[ch] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    assert.ok('ETAO'.includes(top), `${s.slice(0, 30)}…: 最多は ${top}`);
  }
});

test('zz-practice.js は DOM を使わず、乱数は問題番号から決める', () => {
  const src = read('js/zz-practice.js');
  for (const token of ['document', 'window', 'localStorage', 'navigator', 'Math.random', 'innerHTML']) {
    assert.equal(src.includes(token), false, `${token} がある`);
  }
  const r1 = P.quizRandom(5);
  const r2 = P.quizRandom(5);
  assert.equal(r1(), r2());
  assert.notEqual(P.quizRandom(5)(), P.quizRandom(6)());
});
