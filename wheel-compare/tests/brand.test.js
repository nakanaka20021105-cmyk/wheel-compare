// サイトのブランド（CarCalc Works）・ページ名・メタ情報・フッターのテスト（HTML の内容を確認する）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const HEAD = HTML.slice(HTML.indexOf('<head>'), HTML.indexOf('</head>'));
const HEADER = HTML.slice(HTML.indexOf('<header'), HTML.indexOf('</header>'));
const FOOTER = HTML.slice(HTML.indexOf('<footer'), HTML.indexOf('</footer>'));

const DESCRIPTION = 'ホイール・タイヤ交換時の外側・内側位置、タイヤ外径、クリアランス、速度差などを比較できる無料計算ツール。現在のサイズと交換候補を入力して、数値と断面図で変化を確認できます。';
const ISSUES_URL = 'https://github.com/nakanaka20021105-cmyk/wheel-compare/issues';

const count = (re) => (HTML.match(re) ?? []).length;
const meta = (attr, name) => HEAD.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`))?.[1];

describe('ブランドとページ名', () => {
  test('ヘッダーに CarCalc Works とタグラインがあり、h1 はツール名', () => {
    assert.match(HEADER, /<p class="brand-name">CarCalc Works<\/p>/);
    assert.match(HEADER, /<p class="brand-tagline">クルマの計算を、ひとつの場所で。<\/p>/);
    assert.match(HEADER, /<h1>ホイール・タイヤサイズ比較<\/h1>/);
    assert.equal(count(/<h1[\s>]/g), 1, 'h1 は 1 つだけ');
    // ブランド → h1 の順
    assert.ok(HEADER.indexOf('CarCalc Works') < HEADER.indexOf('<h1>'));
  });

  test('ページの説明と「はじめての方へ」の案内がある', () => {
    assert.ok(HEADER.includes('現在と交換候補を比較して、ホイール・タイヤの位置、外径、クリアランスの変化を数値と断面図で確認できます。'));
    assert.match(HEADER, /<p class="guide-links">はじめての方へ：/);
  });

  test('以前の名称（ホイール比較／ホイール＆オフセット比較）が画面・タイトルに残っていない', () => {
    assert.doesNotMatch(HTML, /ホイール＆オフセット比較/);
    assert.doesNotMatch(HTML, /<title>ホイール比較<\/title>/);
  });
});

describe('title・meta description', () => {
  test('title は「ホイール・タイヤサイズ比較｜CarCalc Works」で 1 つだけ', () => {
    assert.equal(count(/<title>/g), 1);
    assert.match(HEAD, /<title>ホイール・タイヤサイズ比較｜CarCalc Works<\/title>/);
  });

  test('meta description は指定の文で 1 つだけ', () => {
    assert.equal(count(/<meta name="description"/g), 1);
    assert.equal(meta('name', 'description'), DESCRIPTION);
  });
});

describe('OGP', () => {
  test('基本情報（title / description / type / site_name / locale）がある', () => {
    assert.equal(meta('property', 'og:title'), 'ホイール・タイヤサイズ比較｜CarCalc Works');
    assert.equal(meta('property', 'og:description'), DESCRIPTION);
    assert.equal(meta('property', 'og:type'), 'website');
    assert.equal(meta('property', 'og:site_name'), 'CarCalc Works');
    assert.equal(meta('property', 'og:locale'), 'ja_JP');
  });

  test('独自ドメイン確定前なので og:url・og:image・canonical はまだない', () => {
    assert.doesNotMatch(HTML, /property="og:url"/);
    assert.doesNotMatch(HTML, /property="og:image/);
    assert.doesNotMatch(HTML, /rel="canonical"/);
    // favicon は tests/favicon.test.js で確認する
  });
});

describe('フッター', () => {
  test('main の後にフッターがあり、ブランド・タグライン・Version 1.0 を表示する', () => {
    assert.equal(count(/<footer[\s>]/g), 1);
    assert.ok(HTML.indexOf('</main>') < HTML.indexOf('<footer'));
    assert.match(FOOTER, /<p class="brand-name">CarCalc Works<\/p>/);
    assert.match(FOOTER, /<p class="brand-tagline">クルマの計算を、ひとつの場所で。<\/p>/);
    assert.match(FOOTER, /Version 1\.0/);
  });

  test('「不具合の報告・ご意見」は、このリポジトリの GitHub Issues へのリンク', () => {
    assert.ok(FOOTER.includes(`<a href="${ISSUES_URL}">不具合の報告・ご意見</a>`));
  });

  test('個人情報（メールアドレス・電話番号）を載せていない', () => {
    assert.doesNotMatch(FOOTER, /mailto:|@[a-z0-9.-]+\.[a-z]{2,}|tel:/i);
  });
});

describe('既存の説明欄が残っている', () => {
  test('「はじめての方へ」と「ご利用上の注意」', () => {
    assert.match(HTML, /<h2 id="guide-heading">はじめての方へ<\/h2>/);
    assert.match(HTML, /<h2 id="usage-notes-heading">ご利用上の注意<\/h2>/);
    assert.ok(HTML.includes('本ツールの計算結果は参考値です。'));
  });
});
