// 練習問題の計算部（通常のスクリプト。globalThis.ZZPractice に置く。js/zz-core.js のあとに読む）
// 問題番号ごとに同じ問題が出る（xorshift32）。2つのモード:
//   read  = 鍵つきで折れ線を読む（短い英文）
//   guess = 鍵なしで頻度から当てる（長い英文。ヒントは列の頻度 → 上位の列の文字 → 鍵）
(function (root) {
  'use strict';
  const ZZ = root.ZZCore;
  const QUIZ_MAX_SEED = 999999;
  const MODES = Object.freeze(['read', 'guess']);
  // 英語の文字の頻度の順（高い順）。ヒントで並べて見せる
  const ENGLISH_ORDER = 'ETAOINSHRDLUCMFWYPGBVKJXQZ';

  // 鍵つきで読む問題の例文（英語のことわざ・定番の例文。大文字・空白区切り）
  const SHORT_TEXTS = Object.freeze([
    'KNOWLEDGE IS POWER', 'TIME IS MONEY', 'PRACTICE MAKES PERFECT', 'BETTER LATE THAN NEVER', 'ACTIONS SPEAK LOUDER THAN WORDS',
    'THE EARLY BIRD CATCHES THE WORM', 'WHERE THERE IS A WILL THERE IS A WAY', 'HONESTY IS THE BEST POLICY', 'ALL THAT GLITTERS IS NOT GOLD',
    'A FRIEND IN NEED IS A FRIEND INDEED', 'LOOK BEFORE YOU LEAP', 'EASY COME EASY GO', 'NO NEWS IS GOOD NEWS', 'SLOW AND STEADY WINS THE RACE',
    'THE PEN IS MIGHTIER THAN THE SWORD', 'ROME WAS NOT BUILT IN A DAY', 'TWO HEADS ARE BETTER THAN ONE', 'WHEN IN ROME DO AS THE ROMANS DO',
    'BIRDS OF A FEATHER FLOCK TOGETHER', 'THE BEST THINGS IN LIFE ARE FREE', 'PRACTICE WHAT YOU PREACH', 'SEEING IS BELIEVING',
    'FORTUNE FAVORS THE BOLD', 'A PICTURE IS WORTH A THOUSAND WORDS', 'ATTACK AT DAWN', 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
  ]);

  // 鍵なしで当てる問題の例文（パブリックドメインの英文。頻度分析が効く長さ）
  const LONG_TEXTS = Object.freeze([
    'FOUR SCORE AND SEVEN YEARS AGO OUR FATHERS BROUGHT FORTH ON THIS CONTINENT A NEW NATION CONCEIVED IN LIBERTY '
      + 'AND DEDICATED TO THE PROPOSITION THAT ALL MEN ARE CREATED EQUAL',
    'GOVERNMENT OF THE PEOPLE BY THE PEOPLE FOR THE PEOPLE SHALL NOT PERISH FROM THE EARTH',
    'WE HOLD THESE TRUTHS TO BE SELF EVIDENT THAT ALL MEN ARE CREATED EQUAL THAT THEY ARE ENDOWED BY THEIR CREATOR '
      + 'WITH CERTAIN UNALIENABLE RIGHTS',
    'IT WAS THE BEST OF TIMES IT WAS THE WORST OF TIMES IT WAS THE AGE OF WISDOM IT WAS THE AGE OF FOOLISHNESS',
    'TO BE OR NOT TO BE THAT IS THE QUESTION WHETHER TIS NOBLER IN THE MIND TO SUFFER THE SLINGS AND ARROWS '
      + 'OF OUTRAGEOUS FORTUNE',
    'ALL THE WORLDS A STAGE AND ALL THE MEN AND WOMEN MERELY PLAYERS THEY HAVE THEIR EXITS AND THEIR ENTRANCES',
    'IT IS A TRUTH UNIVERSALLY ACKNOWLEDGED THAT A SINGLE MAN IN POSSESSION OF A GOOD FORTUNE MUST BE IN WANT OF A WIFE',
    'THE ONLY THING WE HAVE TO FEAR IS FEAR ITSELF NAMELESS UNREASONING UNJUSTIFIED TERROR WHICH PARALYZES NEEDED '
      + 'EFFORTS TO CONVERT RETREAT INTO ADVANCE',
    'THE WORLD WILL LITTLE NOTE NOR LONG REMEMBER WHAT WE SAY HERE BUT IT CAN NEVER FORGET WHAT THEY DID HERE',
    'CALL ME ISHMAEL SOME YEARS AGO NEVER MIND HOW LONG PRECISELY HAVING LITTLE OR NO MONEY IN MY PURSE '
      + 'AND NOTHING PARTICULAR TO INTEREST ME ON SHORE I THOUGHT I WOULD SAIL ABOUT A LITTLE AND SEE THE WATERY PART OF THE WORLD',
  ]);

  // 問題番号から決まる乱数（xorshift32。番号をかき混ぜてから使う。Day049 と同じ）
  function quizRandom(seed) {
    let s = (Math.imul(Number(seed) >>> 0, 2654435761) ^ 0x5bd1e995) >>> 0 || 1;
    const next = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    for (let i = 0; i < 4; i++) next();
    return next;
  }

  const isValidSeed = (seed) => Number.isInteger(seed) && seed >= 1 && seed <= QUIZ_MAX_SEED;

  // 26 文字の並べ替え（Fisher–Yates）。既定の並びのままにはしない
  function shuffledKey(rnd) {
    const arr = [...ZZ.ALPHABET];
    do {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
    } while (arr.join('') === ZZ.ALPHABET);
    return arr.join('');
  }

  // 問題を作る。同じモード・同じ番号なら同じ問題
  function makeQuiz(mode, seed) {
    if (!MODES.includes(mode)) throw new RangeError(`unknown mode: ${mode}`);
    if (!isValidSeed(seed)) throw new RangeError('seed must be 1..999999');
    const rnd = quizRandom(seed * 2 + (mode === 'guess' ? 1 : 0));
    const texts = mode === 'read' ? SHORT_TEXTS : LONG_TEXTS;
    const plain = texts[Math.floor(rnd() * texts.length)];
    const key = shuffledKey(rnd);
    const result = ZZ.encrypt(plain, key, { chooser: ZZ.firstChooser });
    const letters = plain.replace(/[^A-Z]/g, '');
    return { mode, seed, key, plain, letters, points: result.points.map((p) => ({ x: p.x, y: p.y })) };
  }

  // 答えの正規化: ASCII の英字だけを大文字で残す
  const normalizeAnswer = (s) => String(s || '').replace(/[^A-Za-z]/g, '').toUpperCase();

  // 答え合わせ。同じ位置で合っている文字の数も返す
  function checkAnswer(quiz, input) {
    const guess = normalizeAnswer(input);
    const total = quiz.letters.length;
    let matched = 0;
    for (let i = 0; i < Math.min(guess.length, total); i++) if (guess[i] === quiz.letters[i]) matched++;
    return { correct: guess === quiz.letters, matched, total, length: guess.length };
  }

  // ヒント1: 列ごとの点の数を多い順に（列番号は 0 始まり）
  function frequencyHint(quiz, limit) {
    const counts = ZZ.columnCounts(quiz.points, quiz.key.length);
    const ranked = counts.map((count, idx) => ({ idx, count })).filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count || a.idx - b.idx);
    return limit ? ranked.slice(0, limit) : ranked;
  }

  // ヒント2: 上位 n 列の文字（鍵の該当する文字を明かす）
  function revealHint(quiz, n) {
    return frequencyHint(quiz, n).map((c) => ({ ...c, letter: quiz.key[c.idx] }));
  }

  root.ZZPractice = {
    QUIZ_MAX_SEED, MODES, ENGLISH_ORDER, SHORT_TEXTS, LONG_TEXTS,
    quizRandom, isValidSeed, shuffledKey, makeQuiz, normalizeAnswer, checkAnswer, frequencyHint, revealHint,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
