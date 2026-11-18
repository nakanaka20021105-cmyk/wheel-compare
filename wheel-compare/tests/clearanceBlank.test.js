// クリアランスの「未入力」の扱いのテスト。
// 仕様: 初期状態は外側・内側とも未入力（空欄）。未入力はエラーにせず、その側は計算・判定しない。
//       未入力（値がない）と 0mm（有効な実測値）は区別する。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_INPUTS, compareWheels, validateClearanceInput } from '../js/calc.js';
import { buildDiagramModel } from '../js/diagram.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** 初期値（7J +48 → 8J +45、どちらも 205/50R17）に、クリアランスだけ差し替えて比較する */
function run(clearance) {
  return compareWheels({ ...DEFAULT_INPUTS, clearance: { ...DEFAULT_INPUTS.clearance, ...clearance } });
}

function okResult(clearance) {
  const r = run(clearance);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.result;
}

const hasClass = (model, className) => model.shapes.some((s) => s.className === className);

// 初期値ではタイヤ側面が 外側 +3mm（フェンダー等に近づく）/ 内側 -3mm（最寄り部品から離れる）動く
const OUTER_SIDE_CHANGE = 3;
const INNER_SIDE_CHANGE = -3;

describe('クリアランスの初期状態', () => {
  test('初期値は外側・内側とも空欄（0 ではない）', () => {
    assert.equal(DEFAULT_INPUTS.clearance.outerAbs, '');
    assert.equal(DEFAULT_INPUTS.clearance.innerAbs, '');
    assert.notEqual(DEFAULT_INPUTS.clearance.outerAbs, 0);
    assert.notEqual(DEFAULT_INPUTS.clearance.innerAbs, 0);
  });

  test('HTML の入力欄にも初期値を書いていない（再読み込みしても未入力から始まる）', () => {
    for (const id of ['clearance-outerAbs', 'clearance-innerAbs']) {
      const tag = HTML.match(new RegExp(`<input id="${id}"[^>]*>`))?.[0];
      assert.ok(tag, id);
      assert.match(tag, /\svalue=""/, `${id} は value="" であること`);
      assert.match(tag, /placeholder="未入力"/);
      assert.match(tag, /autocomplete="off"/, 'ブラウザが前回の値を復元しない');
    }
  });

  test('外側・内側とも未入力でもエラーにならず、どちらも計算しない', () => {
    const r = okResult({});
    assert.equal(r.clearance.outer, null);
    assert.equal(r.clearance.inner, null);
    // ホイール・タイヤの比較結果は通常どおり出る
    assert.ok(Math.abs(r.wheelOuterEdgeChangeMm - 15.7) < 1e-9);
  });

  test('未入力のとき、断面図にフェンダー等・最寄り部品の線を描かない', () => {
    const m = buildDiagramModel(okResult({}), { width: 640 });
    assert.equal(hasClass(m, 'd-fender'), false);
    assert.equal(hasClass(m, 'd-part'), false);
  });
});

describe('入力した側だけ計算・判定する', () => {
  test('外側だけ入力 → 外側だけ計算し、内側は null', () => {
    const r = okResult({ outerAbs: '20' });
    assert.equal(r.clearance.outer.remainingRoundedMm, 20 - OUTER_SIDE_CHANGE);
    assert.equal(r.clearance.outer.level, 'ok');
    assert.equal(r.clearance.inner, null);
    const m = buildDiagramModel(r, { width: 640 });
    assert.equal(hasClass(m, 'd-fender'), true);
    assert.equal(hasClass(m, 'd-part'), false);
  });

  test('内側だけ入力 → 内側だけ計算し、外側は null', () => {
    const r = okResult({ innerAbs: '4' });
    assert.equal(r.clearance.outer, null);
    assert.equal(r.clearance.inner.remainingRoundedMm, 4 - INNER_SIDE_CHANGE);
    assert.equal(r.clearance.inner.level, 'ok');
    const m = buildDiagramModel(r, { width: 640 });
    assert.equal(hasClass(m, 'd-fender'), false);
    assert.equal(hasClass(m, 'd-part'), true);
  });

  test('両方入力 → 両側とも計算する', () => {
    const r = okResult({ outerAbs: '7.5', innerAbs: '12.5' });
    assert.equal(r.clearance.outer.remainingRoundedMm, 4.5);
    assert.equal(r.clearance.outer.level, 'verySmall');
    assert.equal(r.clearance.inner.remainingRoundedMm, 15.5);
    assert.equal(r.clearance.inner.level, 'ok');
  });

  test('入力後に削除して空欄に戻すと、エラーにならず計算しない状態に戻る', () => {
    assert.ok(okResult({ outerAbs: '20', innerAbs: '20' }).clearance.outer);
    // 空文字・空白だけ・全角空白だけは、どれも「未入力」
    for (const blank of ['', ' ', '　', '\t']) {
      const r = okResult({ outerAbs: blank, innerAbs: blank });
      assert.equal(r.clearance.outer, null, JSON.stringify(blank));
      assert.equal(r.clearance.inner, null, JSON.stringify(blank));
    }
  });

  test('符号を − にしたまま空欄でも、未入力として扱う（エラーにしない）', () => {
    const r = okResult({ outerSign: '-', outerAbs: '', innerSign: '-', innerAbs: '' });
    assert.equal(r.clearance.outer, null);
    assert.equal(r.clearance.inner, null);
  });
});

describe('未入力と 0mm を区別する', () => {
  test('0mm を明示的に入力すると、有効な実測値として計算する', () => {
    for (const zero of ['0', '0.0', '０', 0]) {
      const r = okResult({ outerAbs: zero, innerAbs: zero });
      assert.notEqual(r.clearance.outer, null, `外側 ${JSON.stringify(zero)}`);
      assert.notEqual(r.clearance.inner, null, `内側 ${JSON.stringify(zero)}`);
      assert.equal(r.clearance.outer.currentMm, 0);
      // 0 − 3 = −3 → 干渉の可能性
      assert.equal(r.clearance.outer.remainingRoundedMm, -3);
      assert.equal(r.clearance.outer.level, 'interference');
      // 0 − (−3) = +3 → 非常に小さい
      assert.equal(r.clearance.inner.remainingRoundedMm, 3);
      assert.equal(r.clearance.inner.level, 'verySmall');
    }
  });

  test('− 符号の 0 も 0mm（−0 にならない）', () => {
    const r = okResult({ outerSign: '-', outerAbs: '0' });
    assert.ok(Object.is(r.clearance.outer.currentMm, 0) || r.clearance.outer.currentMm === 0);
    assert.equal(r.clearance.outer.remainingRoundedMm, -3);
  });

  test('validateClearanceInput: 空欄は null、0 は 0', () => {
    const blank = validateClearanceInput({ outerSign: '+', outerAbs: '', innerSign: '+', innerAbs: '' });
    assert.equal(blank.ok, true);
    assert.equal(blank.value.outerMm, null);
    assert.equal(blank.value.innerMm, null);
    const zero = validateClearanceInput({ outerSign: '+', outerAbs: '0', innerSign: '+', innerAbs: '0' });
    assert.equal(zero.ok, true);
    assert.equal(zero.value.outerMm, 0);
    assert.equal(zero.value.innerMm, 0);
  });
});

describe('マイナスのクリアランス', () => {
  test('外側 −5mm（すでにフェンダー等の位置を超えている）→ さらに外へ出るので干渉', () => {
    const r = okResult({ outerSign: '-', outerAbs: '5' });
    assert.equal(r.clearance.outer.currentMm, -5);
    assert.equal(r.clearance.outer.remainingRoundedMm, -8);
    assert.equal(r.clearance.outer.level, 'interference');
  });

  test('内側 −2mm → 内側のタイヤ側面が 3mm 離れるので +1mm（非常に小さい）', () => {
    const r = okResult({ innerSign: '-', innerAbs: '2' });
    assert.equal(r.clearance.inner.currentMm, -2);
    assert.equal(r.clearance.inner.remainingRoundedMm, 1);
    assert.equal(r.clearance.inner.level, 'verySmall');
  });

  test('マイナスの範囲外（−50 より小さい）はエラー', () => {
    const r = run({ outerSign: '-', outerAbs: '50.1' });
    assert.equal(r.ok, false);
    assert.ok(r.errors['clearance.outerMm'] ?? Object.values(r.errors).length > 0);
  });
});

describe('マイナスの説明文', () => {
  test('「基準位置」ではなく、フェンダー等・最寄り部品との関係で説明している', () => {
    assert.doesNotMatch(HTML, /基準位置を超えている/);
    assert.match(HTML, /− は、現在のタイヤ側面がすでにフェンダー等（内側は最寄り部品）の位置を超えている場合に使います。/);
  });
});
