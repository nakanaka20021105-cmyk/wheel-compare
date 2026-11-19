// CarCalc Works のブランド favicon（SVG）のテスト。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = new URL('../', import.meta.url); // 公開されるフォルダ（GitHub Pages の /wheel-compare/）
const HTML = readFileSync(new URL('index.html', ROOT), 'utf8');
const HEAD = HTML.slice(HTML.indexOf('<head>'), HTML.indexOf('</head>'));
const FAVICON_PATH = 'assets/brand/carcalc-works-favicon.svg';
const SVG_URL = new URL(FAVICON_PATH, ROOT);

describe('favicon の link 要素', () => {
  test('SVG の favicon が 1 つだけ設定されている', () => {
    const links = HEAD.match(/<link rel="icon"[^>]*>/g) ?? [];
    assert.equal(links.length, 1);
    assert.equal(links[0], `<link rel="icon" href="${FAVICON_PATH}" type="image/svg+xml">`);
  });

  test('パスは CSS・JS と同じく index.html からの相対パス（/ や https:// で始まらない）', () => {
    const href = HEAD.match(/<link rel="icon" href="([^"]+)"/)[1];
    assert.doesNotMatch(href, /^(\/|https?:|\.\.\/)/);
    // CSS・JS も同じ書き方
    assert.match(HEAD, /<link rel="stylesheet" href="css\/style\.css">/);
    assert.match(HEAD, /<script type="module" src="js\/main\.js"><\/script>/);
  });

  test('リンク先のファイルが公開フォルダ（wheel-compare/）の中に存在する', () => {
    assert.ok(existsSync(SVG_URL), fileURLToPath(SVG_URL));
    // GitHub Pages は wheel-compare/ をそのまま公開するので、/wheel-compare/assets/brand/… で取得できる
    assert.ok(fileURLToPath(SVG_URL).replaceAll('\\', '/').endsWith(`wheel-compare/${FAVICON_PATH}`));
  });
});

describe('favicon の SVG ファイル', () => {
  const svg = readFileSync(SVG_URL, 'utf8');

  test('SVG で、正方形の viewBox（0 0 64 64）がある', () => {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64"/);
    assert.match(svg, /<\/svg>\s*$/);
  });

  test('外部リソース・フォント・スクリプトに依存していない', () => {
    // 名前空間宣言（xmlns）以外の URL がない
    const urls = [...svg.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0]);
    assert.deepEqual(urls, ['http://www.w3.org/2000/svg']);
    assert.doesNotMatch(svg, /<script|\son[a-z]+=|xlink:href|<image|<text|font-family|@import|<foreignObject/i);
    // url(#…) はファイル内のグラデーションだけ
    for (const m of svg.matchAll(/url\(([^)]+)\)/g)) assert.match(m[1], /^#/);
  });

  test('不要な metadata やコメントがない', () => {
    assert.doesNotMatch(svg, /<metadata|<!--|<\?xml|sodipodi|inkscape/i);
  });

  test('デザインの要素（ギヤ・白い中央・C）がそろっている', () => {
    assert.equal((svg.match(/<path /g) ?? []).length, 2, 'ギヤと C の 2 つ');
    assert.match(svg, /<circle cx="32" cy="33" r="19" fill="#fff"\/>/);
    assert.match(svg, /<linearGradient id="gear"/);
    assert.match(svg, /<linearGradient id="letter"/);
  });
});

describe('ほかの設定は変わっていない', () => {
  test('title・ブランド・meta description・OGP 基本情報', () => {
    assert.match(HEAD, /<title>ホイール・タイヤサイズ比較｜CarCalc Works<\/title>/);
    assert.match(HTML, /<p class="brand-name">CarCalc Works<\/p>/);
    assert.match(HEAD, /<meta name="description" content="ホイール・タイヤ交換時の/);
    assert.match(HEAD, /<meta property="og:site_name" content="CarCalc Works">/);
  });

  test('favicon を og:image に流用していない。canonical もまだない', () => {
    assert.doesNotMatch(HTML, /property="og:image/);
    assert.doesNotMatch(HTML, /rel="canonical"/);
  });
});
