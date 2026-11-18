// 「はじめての方へ」（説明）と、文字を大きくしたときの入力欄の組み替え（CSS）のテスト。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');

/** <tag ... id="id"> から対応する閉じタグまで（同じタグが入れ子にならない要素用） */
function block(tag, id) {
  const open = HTML.indexOf(`id="${id}"`);
  assert.ok(open >= 0, `#${id} がない`);
  const start = HTML.lastIndexOf(`<${tag}`, open);
  const end = HTML.indexOf(`</${tag}>`, open);
  return HTML.slice(start, end + tag.length + 3);
}
const text = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');

const GUIDE = HTML.slice(HTML.indexOf('<section class="panel guide"'), HTML.indexOf('</section>', HTML.indexOf('<section class="panel guide"')));
const ABOUT = block('details', 'guide-about');
const NOTATION = block('details', 'guide-notation');
const HOWTO = block('details', 'guide-howto');
const CLEARANCE = block('details', 'guide-clearance');

describe('はじめての方へ: 構成', () => {
  test('h2 の下に 4 つの説明があり、見出しは h3（初期状態は閉じている）', () => {
    assert.match(GUIDE, /<h2 id="guide-heading">はじめての方へ<\/h2>/);
    for (const [d, title] of [[ABOUT, 'このツールについて'], [NOTATION, 'サイズ表記の読み方'], [HOWTO, '基本的な使い方'], [CLEARANCE, 'クリアランスの測り方']]) {
      assert.ok(GUIDE.includes(d), title);
      assert.match(d, new RegExp(`<summary><h3>${title}</h3></summary>`), title);
      assert.doesNotMatch(d.slice(0, d.indexOf('>') + 1), /\sopen\b/, `${title} は閉じている`);
    }
  });

  test('ヘッダーに 4 つの説明への案内リンクがある', () => {
    const header = HTML.slice(HTML.indexOf('<header'), HTML.indexOf('</header>'));
    for (const [id, label] of [['guide-about', 'このツールについて'], ['guide-notation', 'サイズ表記の読み方'], ['guide-howto', '基本的な使い方'], ['guide-clearance', 'クリアランスの測り方']]) {
      assert.match(header, new RegExp(`<a href="#${id}">${label}</a>`), label);
    }
  });

  test('クリアランス入力欄の説明から「測り方」へのリンクがある', () => {
    const fieldset = HTML.slice(HTML.indexOf('<fieldset class="clearance-fields">'), HTML.indexOf('</fieldset>'));
    assert.match(fieldset, /<a href="#guide-clearance">クリアランスの測り方を見る<\/a>/);
  });

  test('リンク先の折りたたみを開く処理がある（main.js）', () => {
    const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    assert.match(main, /closest\('details'\)/);
    assert.match(main, /hashchange/);
  });
});

describe('このツールについて', () => {
  test('ホイールはリム端、タイヤは公称幅から求めた側面位置で、基準が異なる', () => {
    const t = text(ABOUT);
    assert.ok(t.includes('ホイールとタイヤでは基準が異なります'));
    assert.ok(t.includes('リム幅とオフセット（インセット）から求めたリム端の位置を比較します'));
    assert.ok(t.includes('公称タイヤ幅をもとに、タイヤ中心から左右へ均等に広がるものとして求めた理論上のタイヤ側面位置'));
    assert.ok(t.includes('「ホイール端の変化」と「タイヤ側面の変化」は同じ値にならない場合があります'));
    assert.ok(t.includes('タイヤ側面の計算値は実測値ではありません'));
  });
});

describe('サイズ表記の読み方', () => {
  test('ホイール 17 × 7J +48 の説明', () => {
    const t = text(NOTATION);
    assert.ok(t.includes('17 × 7J +48'));
    assert.ok(t.includes('17：リム径（インチ）'));
    assert.ok(t.includes('7J：リム幅（インチ）'));
    assert.ok(t.includes('+48：オフセット（インセット）（mm）'));
    assert.ok(t.includes('オフセットの数値を小さくするとホイールは外側へ、数値を大きくすると内側へ移動します'));
  });

  test('タイヤ 205/50R17 の説明', () => {
    const t = text(NOTATION);
    assert.ok(t.includes('205/50R17'));
    for (const s of ['205：公称タイヤ幅（mm）', '50：扁平率（%）', 'R：ラジアル構造', '17：装着するリム径（インチ）']) {
      assert.ok(t.includes(s), s);
    }
  });

  test('「オフセット（インセット）」と併記している', () => {
    assert.ok(text(ABOUT).includes('オフセット（インセット）'));
    assert.ok(text(NOTATION).includes('オフセット（インセット）'));
  });
});

describe('基本的な使い方', () => {
  test('5 つの手順が番号付きリスト（ol）で並ぶ', () => {
    const ol = HOWTO.slice(HOWTO.indexOf('<ol'), HOWTO.indexOf('</ol>'));
    const steps = [...ol.matchAll(/<h4>([^<]+)<\/h4>/g)].map((m) => m[1]);
    assert.deepEqual(steps, ['現在のサイズを入力', '交換候補のサイズを入力', '比較結果を確認', '断面図で位置関係を確認', '必要に応じてクリアランスを入力']);
  });

  test('クリアランスは任意で、測定していなければ空欄でよい', () => {
    assert.ok(text(HOWTO).includes('クリアランスは任意入力です。測定していない場合は、空欄のままで構いません。'));
  });
});

describe('クリアランスの測り方', () => {
  test('リム端ではなく、現在のタイヤ側面から測る', () => {
    const t = text(CLEARANCE);
    assert.ok(t.includes('現在装着しているタイヤの側面を基準に測定してください'));
    assert.ok(t.includes('ホイールのリム端からの距離ではありません'));
  });

  test('外側と内側の測り方と、＋／− の使い分け', () => {
    const t = text(CLEARANCE);
    assert.match(CLEARANCE, /<h4>外側クリアランス<\/h4>/);
    assert.match(CLEARANCE, /<h4>内側クリアランス<\/h4>/);
    assert.ok(t.includes('現在のタイヤ外側の側面から、フェンダーなど外側で最も近い基準位置までの距離を測ります'));
    assert.ok(t.includes('現在のタイヤ内側の側面から、サスペンションや車体側部品など、内側で最も近い部品までの距離を測ります'));
    assert.ok(t.includes('隙間がある場合は「＋」、現在のタイヤ側面がすでに基準位置を超えている場合は「−」'));
    assert.ok(t.includes('隙間がある場合は「＋」、タイヤ側面が基準とする部品位置を超えている場合は「−」'));
  });

  test('静止状態の値であることと、ご利用上の注意・免責事項への案内', () => {
    const t = text(CLEARANCE);
    assert.ok(t.includes('ここで測定するクリアランスは静止状態での値です'));
    assert.match(CLEARANCE, /「<a href="#usage-details">ご利用上の注意・免責事項<\/a>」を確認してください/);
    assert.ok(HTML.includes('id="usage-details"'), 'リンク先が存在する');
  });
});

describe('文字を大きくしたときの入力欄（CSS）', () => {
  test('入力欄 1 つ分をコンテナにして、幅を文字の大きさ（em）で判定する', () => {
    assert.match(CSS, /\.compare-grid > \.cell, \.clearance-grid > \.cell \{ container-type: inline-size; \}/);
    for (const q of ['9.8em', '8.8em', '7.8em']) assert.ok(CSS.includes(`@container (max-width: ${q})`), q);
  });

  test('いちばん狭い段階では、値を上の段・ボタンを下の段に組み替える', () => {
    const q = CSS.slice(CSS.indexOf('@container (max-width: 7.8em)'));
    assert.match(q, /grid-template-areas: "value value" "minus plus"/);
    assert.match(q, /\.signed-input \{ flex-wrap: wrap; \}/);
  });

  test('画面幅（px）だけで判定していた旧ルールは残っていない', () => {
    assert.doesNotMatch(CSS, /@media \(max-width: 399px\)/);
    assert.doesNotMatch(CSS, /@media \(max-width: 359px\)/);
  });
});
