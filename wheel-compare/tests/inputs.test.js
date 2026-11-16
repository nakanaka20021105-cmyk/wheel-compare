// 入力 UI の形（タイヤ 3 項目・符号 + 絶対値）に対応した検証のテスト。
// 計算そのもの（外径・ホイール端・クリアランス）は calc.test.js でテストしている。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  TIRE_INPUT_LIMITS,
  DEFAULT_INPUTS,
  validateSteppedValue,
  validateTireFields,
  combineSignedInput,
  validateWheelInput,
  validateClearanceInput,
  compareWheels,
  tireOuterDiameter,
} from '../js/calc.js';
import { buildDiagramModel } from '../js/diagram.js';

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}

const tire = (width, aspect, rimInch) => ({ tireWidth: width, tireAspect: aspect, tireRimInch: rimInch });
const BASE = { rimWidthJ: 7, offsetSign: '+', offsetAbs: '48', ...tire(205, 50, 17) };

// ---------------------------------------------------------------
describe('タイヤサイズ（3 項目）', () => {
  test('タイヤ幅 105 / 205 / 405 は有効', () => {
    for (const w of [105, 205, 405]) {
      const r = validateTireFields(tire(w, 50, 17));
      assert.equal(r.ok, true, `${w}`);
      assert.equal(r.value.width, w);
    }
  });

  test('扁平率 5 / 50 / 90 は有効', () => {
    for (const a of [5, 50, 90]) assert.equal(validateTireFields(tire(205, a, 17)).ok, true, `${a}`);
  });

  test('リム径 7 / 17 / 35 は有効', () => {
    for (const d of [7, 17, 35]) assert.equal(validateTireFields(tire(205, 50, d)).ok, true, `${d}`);
  });

  test('文字列の入力も数値として扱い、表記をそろえる', () => {
    const r = validateTireFields(tire('205', '50', '17'));
    assert.equal(r.ok, true);
    assert.equal(r.value.normalized, '205/50R17');
  });

  test('範囲外はエラー（各項目）', () => {
    const cases = [
      [tire(95, 50, 17), 'tireWidth'], [tire(415, 50, 17), 'tireWidth'],
      [tire(205, 0, 17), 'tireAspect'], [tire(205, 95, 17), 'tireAspect'],
      [tire(205, 50, 6), 'tireRimInch'], [tire(205, 50, 36), 'tireRimInch'],
    ];
    for (const [input, field] of cases) {
      const r = validateTireFields(input);
      assert.equal(r.ok, false, JSON.stringify(input));
      assert.deepEqual(Object.keys(r.errors), [field]);
      assert.match(r.errors[field], /の範囲で入力してください/);
    }
  });

  test('刻みに合わない値はエラー（各項目）', () => {
    const cases = [
      [tire(200, 50, 17), 'tireWidth'], [tire(206, 50, 17), 'tireWidth'],
      [tire(205, 52, 17), 'tireAspect'], [tire(205, 47.5, 17), 'tireAspect'],
      [tire(205, 50, 17.5), 'tireRimInch'],
    ];
    for (const [input, field] of cases) {
      const r = validateTireFields(input);
      assert.equal(r.ok, false, JSON.stringify(input));
      assert.deepEqual(Object.keys(r.errors), [field]);
      assert.match(r.errors[field], /刻み/);
    }
  });

  test('未入力・数値でない値はエラー', () => {
    assert.match(validateTireFields(tire('', 50, 17)).errors.tireWidth, /入力してください/);
    assert.match(validateTireFields(tire(205, 'abc', 17)).errors.tireAspect, /数値/);
  });

  test('validateSteppedValue: 境界と刻み', () => {
    const lim = TIRE_INPUT_LIMITS.width;
    assert.equal(validateSteppedValue(105, lim), null);
    assert.equal(validateSteppedValue(405, lim), null);
    assert.ok(validateSteppedValue(104, lim));
    assert.ok(validateSteppedValue(110, lim));
  });

  test('3 項目の入力でも、従来の外径計算式で計算する', () => {
    const { ok, result } = compareWheels({
      current: { ...BASE, ...tire(215, 45, 17) },
      candidate: { rimWidthJ: 8, offsetSign: '+', offsetAbs: '45', ...tire(225, 40, 18) },
    });
    assert.equal(ok, true);
    assertClose(result.current.tireDiameterMm, 625.3);
    assertClose(result.candidate.tireDiameterMm, 637.2);
    assertClose(result.current.tireDiameterMm, tireOuterDiameter({ width: 215, aspect: 45, rimInch: 17 }));
    assert.equal(result.current.tire.normalized, '215/45R17');
  });

  test('文字列 "215/45R17" と 3 項目 215 / 45 R17 の結果は同じ', () => {
    const a = compareWheels({
      current: { rimWidthJ: 7, offsetMm: 48, tireSize: '215/45R17' },
      candidate: { rimWidthJ: 8, offsetMm: 45, tireSize: '225/40R18' },
    }).result;
    const b = compareWheels({
      current: { rimWidthJ: 7, offsetSign: '+', offsetAbs: 48, ...tire(215, 45, 17) },
      candidate: { rimWidthJ: 8, offsetSign: '+', offsetAbs: 45, ...tire(225, 40, 18) },
    }).result;
    for (const key of ['wheelOuterEdgeChangeMm', 'wheelInnerEdgeChangeMm', 'tireDiameterChangeMm', 'diameterRatio']) {
      assert.equal(a[key], b[key], key);
    }
  });

  test('compareWheels: タイヤのエラーは該当する欄（現在 / 交換候補）にだけ出る', () => {
    const r = compareWheels({ current: BASE, candidate: { ...BASE, ...tire(205, 52, 17) } });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors.current), []);
    assert.deepEqual(Object.keys(r.errors.candidate), ['tireAspect']);
  });
});

// ---------------------------------------------------------------
describe('オフセット（符号 + 数値）', () => {
  const offsetOf = (sign, abs) => validateWheelInput({ ...BASE, offsetSign: sign, offsetAbs: abs });

  test('ET +45 → +45、ET -20 → -20', () => {
    assert.equal(offsetOf('+', '45').value.offsetMm, 45);
    assert.equal(offsetOf('-', '20').value.offsetMm, -20);
  });

  test('ET 0 は符号に関係なく 0（-0 にならない）', () => {
    assert.ok(Object.is(offsetOf('+', '0').value.offsetMm, 0));
    assert.ok(Object.is(offsetOf('-', '0').value.offsetMm, 0));
  });

  test('combineSignedInput', () => {
    assert.deepEqual(combineSignedInput('+', '48'), { value: 48 });
    assert.deepEqual(combineSignedInput('-', 20), { value: -20 });
    assert.deepEqual(combineSignedInput('-', ''), { value: null });
    assert.ok(Object.is(combineSignedInput('-', 0).value, 0));
    assert.deepEqual(combineSignedInput('-', '-5'), { error: 'negative' });
    assert.deepEqual(combineSignedInput('+', 'abc'), { error: 'number' });
    assert.deepEqual(combineSignedInput('x', '5'), { error: 'sign' });
  });

  test('範囲外・不正な数値はエラー（offsetMm の欄）', () => {
    for (const [sign, abs] of [['+', '151'], ['-', '151'], ['+', '-5'], ['+', 'abc'], ['+', '']]) {
      const r = offsetOf(sign, abs);
      assert.equal(r.ok, false, `${sign}${abs}`);
      assert.ok(r.errors.offsetMm, `${sign}${abs}`);
    }
    assert.match(offsetOf('+', '151').errors.offsetMm, /0〜150mm/);
  });

  test('境界 ±150 は有効', () => {
    assert.equal(offsetOf('+', '150').value.offsetMm, 150);
    assert.equal(offsetOf('-', '150').value.offsetMm, -150);
  });

  test('符号を切り替えると計算結果が変わる（+20 → -20 で外側端が 40mm 外へ）', () => {
    const run = (sign) => compareWheels({
      current: { ...BASE, rimWidthJ: 8, offsetSign: '+', offsetAbs: '45' },
      candidate: { ...BASE, rimWidthJ: 8, offsetSign: sign, offsetAbs: '20' },
    }).result;
    assertClose(run('+').wheelOuterEdgeChangeMm, 25);
    assertClose(run('-').wheelOuterEdgeChangeMm, 65);
  });

  test('断面図の ET 表示: +45 / 0（− を選んでも 0）/ -20', () => {
    const texts = (sign, abs) => {
      const r = compareWheels({
        current: { ...BASE, rimWidthJ: 8, offsetSign: '+', offsetAbs: '45' },
        candidate: { ...BASE, rimWidthJ: 8, offsetSign: sign, offsetAbs: abs },
      }).result;
      return buildDiagramModel(r, { width: 640 }).shapes.filter((s) => s.type === 'text').map((s) => s.text).join('\n');
    };
    assert.ok(texts('+', '45').includes('現在 ET +45 mm'));
    assert.ok(texts('-', '0').includes('交換 ET 0 mm'));
    assert.ok(texts('-', '20').includes('交換 ET -20 mm'));
  });
});

// ---------------------------------------------------------------
describe('クリアランス（符号 + 数値）', () => {
  const clr = (outerSign, outerAbs, innerSign = '+', innerAbs = '20') =>
    validateClearanceInput({ outerSign, outerAbs, innerSign, innerAbs });

  test('+20 / 0 / -20', () => {
    assert.equal(clr('+', '20').value.outerMm, 20);
    assert.ok(Object.is(clr('-', '0').value.outerMm, 0));
    assert.equal(clr('-', '20').value.outerMm, -20);
  });

  test('数値が空ならその側は計算しない（null）', () => {
    assert.equal(clr('+', '').value.outerMm, null);
  });

  test('範囲外はエラー（+ は 0〜300mm、− は 0〜50mm）', () => {
    for (const [sign, abs] of [['+', '301'], ['-', '51'], ['+', '-1'], ['+', 'x']]) {
      const r = clr(sign, abs);
      assert.equal(r.ok, false, `${sign}${abs}`);
      assert.ok(r.errors.outerMm);
    }
    assert.match(clr('-', '51').errors.outerMm, /− のとき 0〜50mm/);
    assert.equal(clr('-', '50').ok, true);
    assert.equal(clr('+', '300').ok, true);
  });

  test('7J+48 → 8J+45: 外側 +20 → 残 4.3 / 0 → 残 -15.7 / -20 → 残 -35.7（判定基準は従来どおり）', () => {
    const run = (sign, abs) => compareWheels({
      current: { ...BASE, ...tire(215, 45, 17) },
      candidate: { rimWidthJ: 8, offsetSign: '+', offsetAbs: '45', ...tire(225, 40, 18) },
      clearance: { outerSign: sign, outerAbs: abs, innerSign: '+', innerAbs: '20' },
    }).result.clearance.outer;
    assertClose(run('+', '20').remainingMm, 4.3);
    assert.equal(run('+', '20').level, 'verySmall');
    assertClose(run('+', '0').remainingMm, -15.7);
    assert.equal(run('+', '0').level, 'interference');
    assertClose(run('-', '20').remainingMm, -35.7);
    // フェンダー等の位置 = 現在の外側端 + クリアランス（マイナスなら現在の外側端より内側）
    assertClose(run('-', '20').positionMm, 40.9 - 20);
  });
});

// ---------------------------------------------------------------
describe('初期値', () => {
  test('現在・交換候補とも 205/50R17、クリアランス外側・内側とも +20mm', () => {
    for (const g of ['current', 'candidate']) {
      const d = DEFAULT_INPUTS[g];
      assert.deepEqual([d.tireWidth, d.tireAspect, d.tireRimInch], [205, 50, 17]);
      assert.equal(d.offsetSign, '+');
    }
    assert.deepEqual(DEFAULT_INPUTS.clearance, { outerSign: '+', outerAbs: 20, innerSign: '+', innerAbs: 20 });
  });

  test('リム幅・オフセットは従来の初期値（7J +48 / 8J +45）', () => {
    assert.equal(DEFAULT_INPUTS.current.rimWidthJ, 7);
    assert.equal(DEFAULT_INPUTS.current.offsetAbs, 48);
    assert.equal(DEFAULT_INPUTS.candidate.rimWidthJ, 8);
    assert.equal(DEFAULT_INPUTS.candidate.offsetAbs, 45);
  });

  test('初期値のまま計算でき、クリアランスも両側計算される', () => {
    const r = compareWheels(DEFAULT_INPUTS);
    assert.equal(r.ok, true);
    assertClose(r.result.wheelOuterEdgeChangeMm, 15.7);
    assertClose(r.result.wheelInnerEdgeChangeMm, 9.7);
    assert.equal(r.result.tireDiameterChangeMm, 0);
    assertClose(r.result.clearance.outer.remainingMm, 4.3);
    assertClose(r.result.clearance.inner.remainingMm, 10.3);
  });
});
