// 計算ロジックの独立検証（Ver.1.0 公開前）。
// 期待値はコードの式を使わず、次の定義から手計算した数値をそのまま書いている。
//   リム幅(mm) = J × 25.4、ハブ取付面からの位置（外側・内側とも正の距離）:
//     外側端 = リム幅/2 − ET、内側端 = リム幅/2 + ET
//   変化量: 外側端 プラス = 外へ出る / 内側端 プラス = 内へ入る
//   サイドウォール高さ = 幅 × 扁平率 / 100、タイヤ外径 = リム径 × 25.4 + サイドウォール × 2
//   最低地上高変化 = 外径差 / 2
//   クリアランスはタイヤ側面基準（clearance.test.js で詳しく検証）:
//     推定残量 = 現在のクリアランス − タイヤ側面の変化量
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareWheels } from '../js/calc.js';
import {
  formatNumber, formatSigned, describeOuterEdgeChange, describeInnerEdgeChange,
} from '../js/format.js';

const close = (actual, expected, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label} expected ${expected}, got ${actual}`);

/** 画面と同じ形（select の文字列・符号 + 絶対値）で入力を作る */
function wheel(rimWidthJ, et, width, aspect, rimInch) {
  return {
    rimWidthJ: String(rimWidthJ),
    offsetSign: et < 0 ? '-' : '+',
    offsetAbs: String(Math.abs(et)),
    tireWidth: String(width), tireAspect: String(aspect), tireRimInch: String(rimInch),
  };
}
function clearance(outer, inner) {
  const side = (v) => (v === null ? { sign: '+', abs: '' } : { sign: v < 0 ? '-' : '+', abs: String(Math.abs(v)) });
  const o = side(outer);
  const i = side(inner);
  return { outerSign: o.sign, outerAbs: o.abs, innerSign: i.sign, innerAbs: i.abs };
}
function run(cur, cand, clr = clearance(null, null)) {
  const r = compareWheels({ current: cur, candidate: cand, clearance: clr });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.result;
}

// ---------------------------------------------------------------
describe('検証: ホイール位置（リム幅 × 25.4、外側端・内側端の変化と符号）', () => {
  test('画面の例 7.0J ET45 → 8.0J ET35（205/50R17）: 外側端 +22.7mm / 内側端 +2.7mm', () => {
    // 7J = 177.8mm（半分 88.9）、8J = 203.2mm（半分 101.6）
    // 外側端 43.9 → 66.6（+22.7）、内側端 133.9 → 136.6（+2.7）
    const r = run(wheel(7, 45, 205, 50, 17), wheel(8, 35, 205, 50, 17));
    close(r.current.rimWidthMm, 177.8);
    close(r.candidate.rimWidthMm, 203.2);
    close(r.current.edges.outer, 43.9);
    close(r.current.edges.inner, 133.9);
    close(r.candidate.edges.outer, 66.6);
    close(r.candidate.edges.inner, 136.6);
    close(r.wheelOuterEdgeChangeMm, 22.7);
    close(r.wheelInnerEdgeChangeMm, 2.7);
    // 画面の表示文言
    assert.equal(formatSigned(r.wheelOuterEdgeChangeMm), '+22.7');
    assert.equal(describeOuterEdgeChange(r.wheelOuterEdgeChangeMm), '外側へ出る');
    assert.equal(formatSigned(r.wheelInnerEdgeChangeMm), '+2.7');
    assert.equal(describeInnerEdgeChange(r.wheelInnerEdgeChangeMm), '内側へ入る');
  });

  test('オフセットだけ増加 8J ET35 → ET45: 外側端 -10（引っ込む）/ 内側端 +10（入る）', () => {
    const r = run(wheel(8, 35, 205, 50, 17), wheel(8, 45, 205, 50, 17));
    close(r.wheelOuterEdgeChangeMm, -10);
    close(r.wheelInnerEdgeChangeMm, 10);
    assert.equal(describeOuterEdgeChange(r.wheelOuterEdgeChangeMm), '内側へ引っ込む');
    assert.equal(describeInnerEdgeChange(r.wheelInnerEdgeChangeMm), '内側へ入る');
  });

  test('オフセットだけ減少（マイナスへ）9J ET+10 → ET-20: 外側端 +30 / 内側端 -30（離れる）', () => {
    const r = run(wheel(9, 10, 205, 50, 17), wheel(9, -20, 205, 50, 17));
    close(r.wheelOuterEdgeChangeMm, 30);
    close(r.wheelInnerEdgeChangeMm, -30);
    assert.equal(describeOuterEdgeChange(r.wheelOuterEdgeChangeMm), '外側へ出る');
    assert.equal(describeInnerEdgeChange(r.wheelInnerEdgeChangeMm), '外側へ離れる');
  });

  test('リム幅だけ変更 7J → 9J（ET40）: 2J = 50.8mm を左右に半分ずつ、外側端・内側端とも +25.4', () => {
    const r = run(wheel(7, 40, 205, 50, 17), wheel(9, 40, 205, 50, 17));
    close(r.wheelOuterEdgeChangeMm, 25.4);
    close(r.wheelInnerEdgeChangeMm, 25.4);
  });

  test('両方変更 7.5J ET48 → 8.5J ET30: 外側端 +30.7 / 内側端 -5.3', () => {
    // 7.5J 半分 95.25、8.5J 半分 107.95（+12.7）。ET -18 → 外側 +18 / 内側 -18
    const r = run(wheel(7.5, 48, 205, 50, 17), wheel(8.5, 30, 205, 50, 17));
    close(r.wheelOuterEdgeChangeMm, 30.7);
    close(r.wheelInnerEdgeChangeMm, -5.3);
  });

  test('ET 0 同士・同一サイズ: すべて 0、表示は ±0.0 と「変化なし」', () => {
    const r = run(wheel(8, 0, 205, 50, 17), wheel(8, 0, 205, 50, 17));
    close(r.current.edges.outer, 101.6);
    close(r.current.edges.inner, 101.6);
    for (const k of ['wheelOuterEdgeChangeMm', 'wheelInnerEdgeChangeMm', 'tireDiameterChangeMm', 'tireDiameterChangePercent', 'groundClearanceChangeMm']) {
      assert.equal(r[k], 0, k);
    }
    assert.equal(formatSigned(r.wheelOuterEdgeChangeMm), '±0.0');
    assert.equal(describeOuterEdgeChange(r.wheelOuterEdgeChangeMm), '変化なし');
  });

  test('極端な値 2J ET+150 → 20J ET-150: 外側端 +528.6 / 内側端 -71.4（外側端がハブ面より内側でも計算できる）', () => {
    // 2J 半分 25.4: 外側 -124.6 / 内側 175.4。20J 半分 254: 外側 404 / 内側 104
    const r = run(wheel(2, 150, 205, 50, 17), wheel(20, -150, 205, 50, 17));
    close(r.current.edges.outer, -124.6);
    close(r.candidate.edges.outer, 404);
    close(r.wheelOuterEdgeChangeMm, 528.6);
    close(r.wheelInnerEdgeChangeMm, -71.4);
  });

  test('外側端の変化 + 内側端の変化 = リム幅の変化（ET に関係なく成り立つ）', () => {
    for (const [j1, e1, j2, e2] of [[7, 45, 8, 35], [6.5, -12, 10, 33], [12, 0, 4.5, 77]]) {
      const r = run(wheel(j1, e1, 205, 50, 17), wheel(j2, e2, 205, 50, 17));
      close(r.wheelOuterEdgeChangeMm + r.wheelInnerEdgeChangeMm, (j2 - j1) * 25.4, `${j1}J→${j2}J`);
      close(r.wheelOuterEdgeChangeMm - r.wheelInnerEdgeChangeMm, -2 * (e2 - e1), `ET${e1}→ET${e2}`);
    }
  });
});

// ---------------------------------------------------------------
describe('検証: タイヤ外径・外径差率・最低地上高・理論実速度', () => {
  test('205/50R17: サイドウォール 102.5、外径 431.8 + 205 = 636.8mm', () => {
    const r = run(wheel(7, 45, 205, 50, 17), wheel(7, 45, 205, 50, 17));
    close(r.current.rimDiameterMm, 431.8);
    close(r.current.tireDiameterMm, 636.8);
  });

  test('205/50R17 → 225/45R18: 外径 636.8 → 659.7（+22.9）、+3.5961%、地上高 +11.45、100km/h → 103.596km/h', () => {
    // 225 × 0.45 = 101.25、18 × 25.4 = 457.2 → 457.2 + 202.5 = 659.7
    const r = run(wheel(7, 45, 205, 50, 17), wheel(7.5, 45, 225, 45, 18));
    close(r.candidate.tireDiameterMm, 659.7);
    close(r.tireDiameterChangeMm, 22.9);
    close(r.tireDiameterChangePercent, (22.9 / 636.8) * 100); // 3.59610552…%
    assert.equal(formatSigned(r.tireDiameterChangePercent, 2), '+3.60');
    close(r.groundClearanceChangeMm, 11.45);
    close(r.speedometer.find((s) => s.displayKmh === 100).actualKmh, 100 * 659.7 / 636.8);
    assert.equal(formatNumber(r.speedometer.find((s) => s.displayKmh === 100).actualKmh), '103.6');
    assert.equal(formatNumber(r.speedometer.find((s) => s.displayKmh === 40).actualKmh), '41.4');
  });

  test('小径化 225/45R18 → 205/55R16: 外径 659.7 → 631.9（-27.8）、地上高 -13.9（マイナス）', () => {
    // 205 × 0.55 = 112.75、16 × 25.4 = 406.4 → 406.4 + 225.5 = 631.9
    const r = run(wheel(8, 45, 225, 45, 18), wheel(7, 45, 205, 55, 16));
    close(r.candidate.tireDiameterMm, 631.9);
    close(r.tireDiameterChangeMm, -27.8);
    close(r.groundClearanceChangeMm, -13.9);
    assert.ok(r.tireDiameterChangePercent < 0);
    assert.ok(r.speedometer.every((s) => s.actualKmh < s.displayKmh));
  });

  test('タイヤ幅だけ 205 → 225（50R17）: 外径 +20（サイドウォール +10 × 2）、ホイール位置は変わらない', () => {
    const r = run(wheel(7, 45, 205, 50, 17), wheel(7, 45, 225, 50, 17));
    close(r.candidate.tireDiameterMm, 656.8);
    close(r.tireDiameterChangeMm, 20);
    close(r.groundClearanceChangeMm, 10);
    assert.equal(r.wheelOuterEdgeChangeMm, 0);
    assert.equal(r.wheelInnerEdgeChangeMm, 0);
  });

  test('扁平率だけ 50 → 45（205R17）: 外径 616.3（-20.5）、-3.2192%、地上高 -10.25', () => {
    const r = run(wheel(7, 45, 205, 50, 17), wheel(7, 45, 205, 45, 17));
    close(r.candidate.tireDiameterMm, 616.3);
    close(r.tireDiameterChangeMm, -20.5);
    close(r.tireDiameterChangePercent, (-20.5 / 636.8) * 100);
    close(r.groundClearanceChangeMm, -10.25);
  });

  test('リム径だけ 17 → 18（205/50）: 外径 +25.4、地上高 +12.7', () => {
    const r = run(wheel(7, 45, 205, 50, 17), wheel(7, 45, 205, 50, 18));
    close(r.candidate.tireDiameterMm, 662.2);
    close(r.tireDiameterChangeMm, 25.4);
    close(r.groundClearanceChangeMm, 12.7);
  });
});

// ---------------------------------------------------------------
describe('検証: 異常値・全範囲で NaN / Infinity / -0 が出ない', () => {
  test('引数なし・空の入力でも例外にならず、エラーを返す', () => {
    assert.equal(compareWheels().ok, false);
    assert.equal(compareWheels({ current: {}, candidate: {} }).ok, false);
    assert.equal(compareWheels({ current: undefined, candidate: null ?? undefined }).ok, false);
  });

  test('NaN / Infinity / undefined / 文字列は計算せずエラーにする', () => {
    const bad = [NaN, Infinity, -Infinity, undefined, 'Infinity', 'NaN', '1e3', '7J', ''];
    for (const v of bad) {
      const r = compareWheels({ current: { ...wheel(7, 45, 205, 50, 17), rimWidthJ: v }, candidate: wheel(8, 35, 205, 50, 17) });
      assert.equal(r.ok, false, String(v));
      const r2 = compareWheels({ current: wheel(7, 45, 205, 50, 17), candidate: { ...wheel(8, 35, 205, 50, 17), offsetAbs: v } });
      assert.equal(r2.ok, false, `offset ${String(v)}`);
      const r3 = compareWheels({ current: wheel(7, 45, 205, 50, 17), candidate: { ...wheel(8, 35, 205, 50, 17), tireAspect: v } });
      assert.equal(r3.ok, false, `aspect ${String(v)}`);
    }
  });

  test('リム幅・ET・タイヤの全範囲の組み合わせで、結果がすべて有限の数値', () => {
    const rims = [2, 2.5, 7, 13.5, 20];
    const ets = [-150, -1, 0, 1, 150];
    const tires = [[105, 5, 7], [205, 50, 17], [405, 90, 35], [305, 25, 22]];
    for (const j of rims) for (const e of ets) for (const [w, a, d] of tires) {
      const r = run(wheel(7, 45, 205, 50, 17), wheel(j, e, w, a, d), clearance(300, -50));
      const nums = [
        r.wheelOuterEdgeChangeMm, r.wheelInnerEdgeChangeMm, r.tireDiameterChangeMm,
        r.tireDiameterChangePercent, r.groundClearanceChangeMm, r.diameterRatio,
        ...r.speedometer.map((s) => s.actualKmh),
        r.clearance.outer.remainingMm, r.clearance.inner.remainingMm,
        r.clearance.outer.positionMm, r.clearance.inner.positionMm,
      ];
      for (const n of nums) assert.ok(Number.isFinite(n), `${j}J ${e} ${w}/${a}R${d}: ${n}`);
      assert.ok(r.candidate.tireDiameterMm > 0);
      for (const s of [formatSigned(r.wheelOuterEdgeChangeMm), formatSigned(r.groundClearanceChangeMm), formatNumber(r.clearance.outer.remainingMm)]) {
        assert.doesNotMatch(s, /NaN|Infinity|^-0\.0$/, s);
      }
    }
  });
});
