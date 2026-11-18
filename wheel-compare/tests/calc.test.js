import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  rimWidthMm,
  wheelEdges,
  tireOuterDiameter,
  actualSpeed,
  judgeClearance,
  parseNumberInput,
  validateWheelInput,
  validateClearanceInput,
  compareWheels,
} from '../js/calc.js';

/** 小数の誤差を許して比較する */
function assertClose(actual, expected, tolerance = 1e-9, message) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${expected}, got ${actual}`,
  );
}

const W_7J_48 = { rimWidthJ: 7, offsetMm: 48, tireSize: '215/45R17' };
const W_8J_45 = { rimWidthJ: 8, offsetMm: 45, tireSize: '225/40R18' };

// ---------------------------------------------------------------
describe('基本計算', () => {
  test('rimWidthMm: 7J = 177.8mm, 8J = 203.2mm', () => {
    assertClose(rimWidthMm(7), 177.8);
    assertClose(rimWidthMm(8), 203.2);
  });

  test('wheelEdges: 7J +48 → 外側端 40.9mm / 内側端 136.9mm', () => {
    const e = wheelEdges(7, 48);
    assertClose(e.outer, 40.9);
    assertClose(e.inner, 136.9);
  });

  test('tireOuterDiameter: 215/45R17 = 625.3mm', () => {
    assertClose(tireOuterDiameter({ width: 215, aspect: 45, rimInch: 17 }), 625.3);
  });

  test('actualSpeed: 比率 1.02 で 100km/h 表示 → 102km/h', () => {
    assertClose(actualSpeed(100, 1.02), 102);
  });
});

// ---------------------------------------------------------------
describe('compareWheels: 7J +48 (215/45R17) → 8J +45 (225/40R18)', () => {
  const { ok, result } = compareWheels({ current: W_7J_48, candidate: W_8J_45 });

  test('計算が成功する', () => assert.equal(ok, true));

  test('ホイール外側端: +15.7mm（外へ）', () => {
    assertClose(result.wheelOuterEdgeChangeMm, 15.7);
  });

  test('ホイール内側端: +9.7mm（内へ）', () => {
    assertClose(result.wheelInnerEdgeChangeMm, 9.7);
  });

  test('タイヤ外径: 625.3 → 637.2mm（+11.9mm）', () => {
    assertClose(result.current.tireDiameterMm, 625.3);
    assertClose(result.candidate.tireDiameterMm, 637.2);
    assertClose(result.tireDiameterChangeMm, 11.9);
  });

  test('外径差率: 約 +1.90%', () => {
    assertClose(result.tireDiameterChangePercent, (637.2 / 625.3 - 1) * 100);
    assert.equal(result.tireDiameterChangePercent.toFixed(2), '1.90');
  });

  test('理論上の最低地上高変化: +5.95mm', () => {
    assertClose(result.groundClearanceChangeMm, 5.95);
  });

  test('メーター 40/60/100km/h 表示時の理論実速度', () => {
    const ratio = 637.2 / 625.3;
    assert.deepEqual(result.speedometer.map((s) => s.displayKmh), [40, 60, 100]);
    result.speedometer.forEach((s) => assertClose(s.actualKmh, s.displayKmh * ratio));
    assert.equal(result.speedometer[2].actualKmh.toFixed(1), '101.9');
  });

  test('クリアランス未入力なら計算しない', () => {
    assert.equal(result.clearance.outer, null);
    assert.equal(result.clearance.inner, null);
  });
});

// ---------------------------------------------------------------
describe('compareWheels: オフセットが負の値', () => {
  test('9J -10 → 10J -20: 外側端 +22.7mm / 内側端 +2.7mm', () => {
    const { ok, result } = compareWheels({
      current: { rimWidthJ: 9, offsetMm: -10, tireSize: '245/40R18' },
      candidate: { rimWidthJ: 10, offsetMm: -20, tireSize: '255/35R18' },
    });
    assert.equal(ok, true);
    // 現在: 外 114.3+10=124.3, 内 114.3-10=104.3
    // 候補: 外 127+20=147,     内 127-20=107
    assertClose(result.current.edges.outer, 124.3);
    assertClose(result.current.edges.inner, 104.3);
    assertClose(result.wheelOuterEdgeChangeMm, 22.7);
    assertClose(result.wheelInnerEdgeChangeMm, 2.7);
  });

  test('同じ 8J で +35 → -5: 外側端 +40mm / 内側端 -40mm（内側は離れる）', () => {
    const { result } = compareWheels({
      current: { rimWidthJ: 8, offsetMm: 35, tireSize: '225/45R17' },
      candidate: { rimWidthJ: 8, offsetMm: -5, tireSize: '225/45R17' },
    });
    assertClose(result.wheelOuterEdgeChangeMm, 40);
    assertClose(result.wheelInnerEdgeChangeMm, -40);
  });

  test('全角マイナス・数学用マイナスの文字列入力も負の値として扱う', () => {
    assert.equal(parseNumberInput('－１０'), -10);
    assert.equal(parseNumberInput('−10'), -10);
    assert.equal(parseNumberInput('-10'), -10);
    assert.equal(parseNumberInput('＋４８'), 48);
  });
});

// ---------------------------------------------------------------
describe('compareWheels: 新旧が同一サイズ', () => {
  const { ok, result } = compareWheels({
    current: W_7J_48,
    candidate: { ...W_7J_48 },
    clearance: { outerMm: 12, innerMm: 8 },
  });

  test('すべての変化量が 0', () => {
    assert.equal(ok, true);
    assert.equal(result.wheelOuterEdgeChangeMm, 0);
    assert.equal(result.wheelInnerEdgeChangeMm, 0);
    assert.equal(result.tireDiameterChangeMm, 0);
    assert.equal(result.tireDiameterChangePercent, 0);
    assert.equal(result.groundClearanceChangeMm, 0);
    assert.equal(result.diameterRatio, 1);
  });

  test('理論実速度 = メーター表示', () => {
    result.speedometer.forEach((s) => assert.equal(s.actualKmh, s.displayKmh));
  });

  test('クリアランス残量は現在と同じ', () => {
    assert.equal(result.clearance.outer.remainingMm, 12);
    assert.equal(result.clearance.inner.remainingMm, 8);
  });
});

// ---------------------------------------------------------------
describe('compareWheels: タイヤサイズの小文字 r と空白', () => {
  test('" 215/45r17 " と " 225 / 40 r18" で計算できる', () => {
    const { ok, result } = compareWheels({
      current: { ...W_7J_48, tireSize: ' 215/45r17 ' },
      candidate: { ...W_8J_45, tireSize: ' 225 / 40 r18' },
    });
    assert.equal(ok, true);
    assert.equal(result.current.tire.normalized, '215/45R17');
    assert.equal(result.candidate.tire.normalized, '225/40R18');
    assertClose(result.tireDiameterChangeMm, 11.9);
  });
});

// ---------------------------------------------------------------
describe('compareWheels: 不正なタイヤサイズ', () => {
  test('交換候補が "225/40-18" ならエラー（候補のタイヤ欄だけ）', () => {
    const r = compareWheels({
      current: W_7J_48,
      candidate: { ...W_8J_45, tireSize: '225/40-18' },
    });
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.errors.current), []);
    assert.deepEqual(Object.keys(r.errors.candidate), ['tireSize']);
  });

  test('現在のタイヤが空ならエラー', () => {
    const r = compareWheels({ current: { ...W_7J_48, tireSize: '' }, candidate: W_8J_45 });
    assert.equal(r.ok, false);
    assert.ok(r.errors.current.tireSize);
  });
});

// ---------------------------------------------------------------
describe('入力検証: 不正なリム幅', () => {
  const invalid = [
    ['0J', 0],
    ['負の値 -7J', -7],
    ['下限未満 1.5J', 1.5],
    ['下限をわずかに下回る 1.99J', 1.99],
    ['上限超え 20.5J', 20.5],
    ['上限をわずかに上回る 20.01J', 20.01],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['文字列 "abc"', 'abc'],
    ['文字列 "7J"（単位付き）', '7J'],
    ['未入力 ""', ''],
    ['未入力 null', null],
  ];
  for (const [label, value] of invalid) {
    test(`エラー: ${label}`, () => {
      const r = validateWheelInput({ ...W_7J_48, rimWidthJ: value });
      assert.equal(r.ok, false);
      assert.ok(r.errors.rimWidthJ, `rimWidthJ のエラーがあるべき: ${label}`);
    });
  }

  test('境界値 2J と 20J は有効', () => {
    assert.equal(validateWheelInput({ ...W_7J_48, rimWidthJ: 2 }).ok, true);
    assert.equal(validateWheelInput({ ...W_7J_48, rimWidthJ: 20 }).ok, true);
  });

  test('旧範囲外だった特殊サイズ 2.5J / 16J / 19.5J も計算できる', () => {
    for (const j of [2.5, 16, 19.5]) {
      assert.equal(validateWheelInput({ ...W_7J_48, rimWidthJ: j }).ok, true, `${j}J`);
    }
  });

  test('2J → 20J の比較: 外側端 +228.6mm / 内側端 +228.6mm（オフセット同一）', () => {
    const { ok, result } = compareWheels({
      current: { rimWidthJ: 2, offsetMm: 0, tireSize: '135/80R13' },
      candidate: { rimWidthJ: 20, offsetMm: 0, tireSize: '355/25R24' },
    });
    assert.equal(ok, true);
    // (20 - 2) × 25.4 / 2 = 228.6
    assertClose(result.wheelOuterEdgeChangeMm, 228.6);
    assertClose(result.wheelInnerEdgeChangeMm, 228.6);
  });

  test('文字列 "7.5" や全角 "７．５" は 7.5J として有効', () => {
    assert.equal(validateWheelInput({ ...W_7J_48, rimWidthJ: '7.5' }).value.rimWidthJ, 7.5);
    assert.equal(validateWheelInput({ ...W_7J_48, rimWidthJ: '７．５' }).value.rimWidthJ, 7.5);
  });
});

// ---------------------------------------------------------------
describe('入力検証: 極端なオフセット値', () => {
  const invalid = [
    ['+200mm', 200],
    ['-200mm', -200],
    ['+150.1mm', 150.1],
    ['-150.1mm', -150.1],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['NaN', NaN],
    ['文字列 "+48mm"（単位付き）', '+48mm'],
    ['未入力 ""', ''],
  ];
  for (const [label, value] of invalid) {
    test(`エラー: ${label}`, () => {
      const r = validateWheelInput({ ...W_7J_48, offsetMm: value });
      assert.equal(r.ok, false);
      assert.ok(r.errors.offsetMm, `offsetMm のエラーがあるべき: ${label}`);
    });
  }

  test('境界値 +150mm / -150mm / 0mm は有効', () => {
    assert.equal(validateWheelInput({ ...W_7J_48, offsetMm: 150 }).ok, true);
    assert.equal(validateWheelInput({ ...W_7J_48, offsetMm: -150 }).ok, true);
    assert.equal(validateWheelInput({ ...W_7J_48, offsetMm: 0 }).ok, true);
  });

  test('旧範囲外だった ±120mm も計算できる', () => {
    assert.equal(validateWheelInput({ ...W_7J_48, offsetMm: 120 }).ok, true);
    assert.equal(validateWheelInput({ ...W_7J_48, offsetMm: '-120' }).ok, true);
  });

  test('+150 → -150 の比較: 外側端 +300mm / 内側端 -300mm（同一リム幅）', () => {
    const { ok, result } = compareWheels({
      current: { rimWidthJ: 8, offsetMm: 150, tireSize: '225/45R17' },
      candidate: { rimWidthJ: 8, offsetMm: -150, tireSize: '225/45R17' },
    });
    assert.equal(ok, true);
    assertClose(result.wheelOuterEdgeChangeMm, 300);
    assertClose(result.wheelInnerEdgeChangeMm, -300);
  });

  test('エラーメッセージに新しい範囲が含まれる', () => {
    const r = validateWheelInput({ ...W_7J_48, rimWidthJ: 0, offsetMm: 151 });
    assert.match(r.errors.rimWidthJ, /2〜20J/);
    assert.match(r.errors.offsetMm, /-150〜\+150mm/);
  });

  test('compareWheels でもエラーになり、計算結果は返らない', () => {
    const r = compareWheels({ current: W_7J_48, candidate: { ...W_8J_45, offsetMm: 999 } });
    assert.equal(r.ok, false);
    assert.equal(r.result, undefined);
    assert.ok(r.errors.candidate.offsetMm);
  });

  test('複数の欄が不正なら、すべてのエラーをまとめて返す', () => {
    const r = validateWheelInput({ rimWidthJ: 0, offsetMm: 500, tireSize: 'xxx' });
    assert.deepEqual(Object.keys(r.errors).sort(), ['offsetMm', 'rimWidthJ', 'tireSize']);
  });
});

// ---------------------------------------------------------------
describe('クリアランス（任意入力）', () => {
  test('judgeClearance の境界値', () => {
    assert.equal(judgeClearance(-0.1), 'interference');
    assert.equal(judgeClearance(0), 'verySmall');
    assert.equal(judgeClearance(5), 'verySmall');
    assert.equal(judgeClearance(5.1), 'ok');
  });

  // タイヤ側面基準: 215 ET48 → 225 ET45
  //   外側: 59.5 → 67.5（+8 = ET -3 で +3、幅 +10 の半分で +5）
  //   内側: 155.5 → 157.5（+2 = ET -3 で -3、幅の半分で +5）
  test('7J+48 215 → 8J+45 225: 外側 13mm → 残 5.0mm（非常に小さい）、内側 15mm → 残 13.0mm（残量あり）', () => {
    const { result } = compareWheels({
      current: W_7J_48,
      candidate: W_8J_45,
      clearance: { outerMm: 13, innerMm: 15 },
    });
    assertClose(result.clearance.outer.remainingMm, 5);
    assert.equal(result.clearance.outer.level, 'verySmall');
    assert.equal(result.clearance.outer.label, '非常に小さい');
    assertClose(result.clearance.inner.remainingMm, 13);
    assert.equal(result.clearance.inner.level, 'ok');
    assert.equal(result.clearance.inner.label, '数値上の残量あり');
  });

  test('外側 5mm → 残 -3.0mm（干渉または突出の可能性）', () => {
    const { result } = compareWheels({
      current: W_7J_48,
      candidate: W_8J_45,
      clearance: { outerMm: 5 },
    });
    assertClose(result.clearance.outer.remainingMm, -3);
    assert.equal(result.clearance.outer.level, 'interference');
    assert.equal(result.clearance.outer.label, '静止状態でも干渉または突出の可能性');
  });

  test('片方だけ入力した場合、入力した側だけ計算する', () => {
    const { result } = compareWheels({
      current: W_7J_48,
      candidate: W_8J_45,
      clearance: { outerMm: '', innerMm: '30' },
    });
    assert.equal(result.clearance.outer, null);
    assertClose(result.clearance.inner.remainingMm, 28); // 30 − 2
  });

  test('内側が離れる変更（内側端が負の変化）では残量が増える', () => {
    const { result } = compareWheels({
      current: { rimWidthJ: 8, offsetMm: 35, tireSize: '225/45R17' },
      candidate: { rimWidthJ: 8, offsetMm: 25, tireSize: '225/45R17' },
      clearance: { innerMm: 10 },
    });
    assertClose(result.clearance.inner.remainingMm, 20);
  });

  test('不正なクリアランス値はエラー', () => {
    assert.equal(validateClearanceInput({ outerMm: 'abc' }).ok, false);
    assert.equal(validateClearanceInput({ innerMm: 1000 }).ok, false);
    assert.equal(validateClearanceInput({ outerMm: -100 }).ok, false);
    assert.equal(validateClearanceInput({}).ok, true);
  });
});

// ---------------------------------------------------------------
describe('図に使う派生値', () => {
  const { result } = compareWheels({
    current: W_7J_48,
    candidate: W_8J_45,
    clearance: { outerMm: 20, innerMm: 15 },
  });

  test('リム径(mm)と理論上の車軸の高さ', () => {
    assertClose(result.current.rimDiameterMm, 431.8);
    assertClose(result.candidate.rimDiameterMm, 457.2);
    assertClose(result.current.axleHeightMm, 312.65);
    assertClose(result.candidate.axleHeightMm, 318.6);
    // 車軸の高さの差 = 理論上の最低地上高変化
    assertClose(result.candidate.axleHeightMm - result.current.axleHeightMm, result.groundClearanceChangeMm);
  });

  test('フェンダー等の位置 = 現在のタイヤ側面（外側）59.5 + 20 = 79.5mm（ハブ面から外側へ）', () => {
    assertClose(result.current.tireSides.outer, 59.5); // 215/2 − 48
    assertClose(result.clearance.outer.positionMm, 79.5);
    // 候補のタイヤ側面からの距離 = 推定残量
    assertClose(result.clearance.outer.positionMm - result.candidate.tireSides.outer, result.clearance.outer.remainingMm);
  });

  test('最寄り部品の位置 = 現在のタイヤ側面（内側）155.5 + 15 = 170.5mm（ハブ面から内側へ）', () => {
    assertClose(result.current.tireSides.inner, 155.5); // 215/2 + 48
    assertClose(result.clearance.inner.positionMm, 170.5);
    assertClose(result.clearance.inner.positionMm - result.candidate.tireSides.inner, result.clearance.inner.remainingMm);
  });
});
