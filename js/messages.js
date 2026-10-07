// 画面に出す文言（通常のスクリプト。globalThis.ZZMessages に置く）。{name} は値で埋める。
// 第1弾は日本語だけ。英語は日英対応の段階で同じキーで足す
(function (root) {
  'use strict';

  const ja = {
    'theme.toLight': 'ライトモードに切替',
    'theme.toDark': 'ダークモードに切替',
    'copy.ok': 'コピーしました。',
    'copy.fail': 'コピーに失敗しました。',
    'copy.empty': '出力できる折れ線がありません。',
    'enc.skipped': '{count}文字を飛ばしました（{detail}）。',
    'enc.skippedMissing': '鍵にない英字 {letters}',
    'enc.skippedOthers': '英字以外 {count}文字',
    'enc.skippedSep': '、',
    'enc.truncated': '鍵にある文字が{max}文字を超えたので、{max}文字目までを暗号化しました。',
    'key.empty': '鍵が空です。英字（A〜Z）を1文字以上入れてください。暗号化しても点は打たれません。',
    'key.missing': '鍵にない文字: {letters}（平文にあっても飛ばされます）',
    'dec.format': '不正な形式: "{token}"（{position}番目）',
    'dec.number': '無効な数値: "{token}"',
    'dec.negative': '負の座標は使えません: "{token}"',
    'dec.tooMany': '座標数が上限を超えています（最大{max}点）',
    'dec.tooLong': '入力が長すぎます（最大{max}文字）',
    'dec.type': '入力の形式が不正です',
    'dec.noSource': '暗号化タブに暗号文がありません',
    'dec.emptyKey': '鍵が空なので復号できません。鍵生成タブで鍵を設定してください。',
    'svg.fileWithKey': 'zigzag-cipher-with-key.svg',
    'svg.fileNoKey': 'zigzag-cipher.svg',
    'png.fileWithKey': 'zigzag-cipher-with-key.png',
    'png.fileNoKey': 'zigzag-cipher.png',
    'png.fail': 'PNGの書き出しに失敗しました。',
    'share.ok': '共有リンクをコピーしました（鍵は含まれません）。',
    'share.fail': '共有リンクのコピーに失敗しました。',
    'dec.noPolyline': 'SVGに折れ線（polyline）が見つかりません。このツールで書き出したSVGを選んでください。',
    'dec.loaded': 'SVGから{count}点を読み込みました。「復号」を押してください。',
    'dec.loadFail': 'ファイルを読み込めませんでした。',
    'dec.sharedLoaded': '共有リンクから{count}点を読み込みました。鍵を設定して「復号」を押してください。',
    'ana.noPoints': '暗号化タブに平文がありません。平文を入れると、ここに列番号の列が出ます。',
    'ana.tooManyColumns': '鍵が27列以上なので、標準のアルファベットには写せません。列番号の列をお使いください。',
    'ana.rowLetters': '平文の文字',
    'ana.rowColumns': '折れ線の列',
  };

  const MESSAGES = { ja };
  let lang = 'ja';

  function t(key, vars) {
    const table = MESSAGES[lang] || ja;
    let s = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : (ja[key] !== undefined ? ja[key] : key);
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  }

  const setLanguage = (l) => { lang = MESSAGES[l] ? l : 'ja'; };
  const getLanguage = () => lang;

  root.ZZMessages = { MESSAGES, t, setLanguage, getLanguage };
})(typeof globalThis !== 'undefined' ? globalThis : this);
