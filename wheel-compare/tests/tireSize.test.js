import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseTireSize, normalizeTireSize } from '../js/tireSize.js';

describe('parseTireSize: 正しい入力', () => {
  test('標準的な表記 215/45R17', () => {
    const r = parseTireSize('215/45R17');
    assert.equal(r.ok, true);
    assert.deepEqual(r.value, { width: 215, aspect: 45, rimInch: 17, normalized: '215/45R17' });
  });

  test('小文字の r', () => {
    const r = parseTireSize('215/45r17');
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '215/45R17');
  });

  test('前後の空白', () => {
    const r = parseTireSize('  215/45R17  ');
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '215/45R17');
  });

  test('途中の空白と小文字 r の組み合わせ', () => {
    const r = parseTireSize(' 215 / 45 r 17 ');
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '215/45R17');
  });

  test('全角数字・全角記号', () => {
    const r = parseTireSize('２１５／４５Ｒ１７');
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '215/45R17');
  });

  test('全角の小文字ｒと全角スペース', () => {
    const r = parseTireSize('　２１５／４５ｒ１７　');
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '215/45R17');
  });

  test('ZR 表記（225/40ZR18、小文字 zr）', () => {
    assert.equal(parseTireSize('225/40ZR18').value.normalized, '225/40R18');
    assert.equal(parseTireSize('225/40zr18').value.normalized, '225/40R18');
  });

  test('normalizeTireSize は空白除去・大文字化・半角化をする', () => {
    assert.equal(normalizeTireSize(' ２１５/45 r17 '), '215/45R17');
  });
});

describe('parseTireSize: 不正な入力', () => {
  const invalid = [
    ['空文字', ''],
    ['空白のみ', '   '],
    ['null', null],
    ['undefined', undefined],
    ['リム径なし', '215/45R'],
    ['扁平率なし', '215R17'],
    ['R なし', '215/4517'],
    ['区切りがハイフン', '215-45R17'],
    ['英字のみ', 'abc'],
    ['幅が2桁', '95/45R17'],
    ['扁平率が3桁', '215/455R17'],
    ['ロードインデックス付き（初期版は非対応）', '215/45R17 91W'],
    ['小数のリム径', '215/45R17.5'],
  ];
  for (const [label, input] of invalid) {
    test(`形式エラー: ${label}`, () => {
      const r = parseTireSize(input);
      assert.equal(r.ok, false);
      assert.equal(typeof r.error, 'string');
    });
  }

  test('範囲外: 幅 999mm', () => {
    const r = parseTireSize('999/45R17');
    assert.equal(r.ok, false);
    assert.match(r.error, /タイヤ幅/);
  });

  test('範囲外: 扁平率 10%', () => {
    const r = parseTireSize('215/10R17');
    assert.equal(r.ok, false);
    assert.match(r.error, /扁平率/);
  });

  test('範囲外: リム径 30インチ', () => {
    const r = parseTireSize('215/45R30');
    assert.equal(r.ok, false);
    assert.match(r.error, /リム径/);
  });
});
