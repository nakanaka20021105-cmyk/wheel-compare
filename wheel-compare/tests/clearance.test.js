// クリアランス推定（タイヤ側面基準）と、0.1mm 単位の表示・判定の一致を検証するテスト。
//
// 期待値は次の定義から手計算した固定値（コードの式は使わない）:
//   タイヤ中心 = リム中心線（ハブ面から外側へ −ET）。リム幅には左右されない
//   タイヤ側面（ハブ面からの距離）: 外側 = 幅/2 − ET、内側 = 幅/2 + ET
//   タイヤ側面の変化: 外側 = −(ET差) + (幅差)/2（プラス = 外へ出る）
//                     内側 = +(ET差) + (幅差)/2（プラス = 内へ入る）
//   推定残量 = 現在のクリアランス − タイヤ側面の変化
//   判定は表示と同じ 0.1mm 単位の値で: 0 未満 = 干渉、0〜5 = 非常に小さい、5 超 = 残量あり
// ホイール端の位置変化（リム基準）は別の値として残っていることも確認する。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareWheels, judgeClearance, roundClearance, tireSides } from '../js/calc.js';
import { formatNumber, formatSigned, describeOuterEdgeChange, describeInnerEdgeChange } from '../js/format.js';

const close = (actual, expected, label = '') =>
  assert.ok(Math.abs(actual - expected) < 1e-9, `${label} expected ${expected}, got ${actual}`);

/** 画面と同じ形（select の文字列・符号 + 絶対値）で入力を作る */
function wheel(rimWidthJ, et, width, aspect = 50, rimInch = 17) {
  return {
    rimWidthJ: String(rimWidthJ),
    offsetSign: et < 0 ? '-' : '+',
    offsetAbs: String(Math.abs(et)),
    tireWidth: String(width), tireAspect: String(aspect), tireRimInch: String(rimInch),
  };
}
const side = (v) => (v === null ? { sign: '+', abs: '' } : { sign: v < 0 ? '-' : '+', abs: String(Math.abs(v)) });
function run(cur, cand, outer, inner) {
  const o = side(outer);
  const i = side(inner);
  const r = compareWheels({
    current: cur, candidate: cand,
    clearance: { outerSign: o.sign, outerAbs: o.abs, innerSign: i.sign, innerAbs: i.abs },
  });
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.result;
}

/**
 * 外側・内側それぞれの期待値を確認する
 * @param {object} r compareWheels の結果
 * @param {{ outerSide: number, innerSide: number, outer?: [number, string], inner?: [number, string] }} e
 *   outerSide / innerSide: タイヤ側面の変化、outer / inner: [推定残量, 判定]
 */
function expectClearance(r, e) {
  close(r.tireOuterSideChangeMm, e.outerSide, '外側のタイヤ側面の変化');
  close(r.tireInnerSideChangeMm, e.innerSide, '内側のタイヤ側面の変化');
  if (e.outer) {
    close(r.clearance.outer.remainingMm, e.outer[0], '外側の残量');
    assert.equal(r.clearance.outer.level, e.outer[1], '外側の判定');
  }
  if (e.inner) {
    close(r.clearance.inner.remainingMm, e.inner[0], '内側の残量');
    assert.equal(r.clearance.inner.level, e.inner[1], '内側の判定');
  }
}

// ---------------------------------------------------------------
describe('タイヤ側面の位置（公称幅が中心から左右均等に広がる理論値）', () => {
  test('tireSides: 205mm ET+45 → 外側 57.5 / 内側 147.5、225mm ET-20 → 外側 132.5 / 内側 92.5', () => {
    assert.deepEqual(tireSides(205, 45), { outer: 57.5, inner: 147.5 });
    assert.deepEqual(tireSides(225, -20), { outer: 132.5, inner: 92.5 });
    assert.deepEqual(tireSides(205, 0), { outer: 102.5, inner: 102.5 });
  });

  test('外側 + 内側 = 公称タイヤ幅（リム幅に関係なく）', () => {
    for (const j of [5, 7, 9.5]) {
      const r = run(wheel(j, 45, 215), wheel(j, 45, 215), null, null);
      close(r.current.tireSides.outer + r.current.tireSides.inner, 215, `${j}J`);
    }
  });
});

// ---------------------------------------------------------------
describe('クリアランス推定（タイヤ側面基準）: タイヤ幅・オフセット・リム幅の変更', () => {
  test('タイヤ幅もオフセットも同じ（205、ET45）: 側面は動かず、残量は現在と同じ', () => {
    const r = run(wheel(7, 45, 205), wheel(7, 45, 205), 20, 15);
    expectClearance(r, { outerSide: 0, innerSide: 0, outer: [20, 'ok'], inner: [15, 'ok'] });
  });

  test('タイヤ幅だけ 205 → 225: 外側・内側とも 10mm 広がる（20mm の半分ずつ）', () => {
    // 外側 57.5 → 67.5（+10）、内側 147.5 → 157.5（+10）
    const r = run(wheel(7, 45, 205), wheel(7, 45, 225), 20, 12);
    expectClearance(r, { outerSide: 10, innerSide: 10, outer: [10, 'ok'], inner: [2, 'verySmall'] });
    close(r.candidate.tireSides.outer, 67.5);
    close(r.candidate.tireSides.inner, 157.5);
    // ホイール端（リム基準）は変わらない
    assert.equal(r.wheelOuterEdgeChangeMm, 0);
    assert.equal(r.wheelInnerEdgeChangeMm, 0);
  });

  test('タイヤ幅だけ 225 → 205: 外側・内側とも 10mm 狭まる（残量が増える）', () => {
    const r = run(wheel(7, 45, 225), wheel(7, 45, 205), 20, 0);
    expectClearance(r, { outerSide: -10, innerSide: -10, outer: [30, 'ok'], inner: [10, 'ok'] });
    assert.equal(describeOuterEdgeChange(r.tireOuterSideChangeMm), '内側へ引っ込む');
    assert.equal(describeInnerEdgeChange(r.tireInnerSideChangeMm), '外側へ離れる');
  });

  test('オフセットだけ ET45 → ET35（タイヤ中心が外側へ 10mm）: 外側 +10 で減り、内側 -10 で増える', () => {
    const r = run(wheel(8, 45, 205), wheel(8, 35, 205), 20, 20);
    expectClearance(r, { outerSide: 10, innerSide: -10, outer: [10, 'ok'], inner: [30, 'ok'] });
    assert.equal(describeOuterEdgeChange(r.tireOuterSideChangeMm), '外側へ出る');
  });

  test('オフセットだけ ET35 → ET45（タイヤ中心が内側へ 10mm）: 外側 -10 で増え、内側 +10 で減る', () => {
    const r = run(wheel(8, 35, 205), wheel(8, 45, 205), 20, 8);
    expectClearance(r, { outerSide: -10, innerSide: 10, outer: [30, 'ok'], inner: [-2, 'interference'] });
    assert.equal(describeInnerEdgeChange(r.tireInnerSideChangeMm), '内側へ入る');
  });

  test('オフセットがマイナスへ ET+10 → ET-20（中心が外側へ 30mm）: 外側 +30 / 内側 -30', () => {
    const r = run(wheel(9, 10, 255), wheel(9, -20, 255), 40, 5);
    expectClearance(r, { outerSide: 30, innerSide: -30, outer: [10, 'ok'], inner: [35, 'ok'] });
  });

  test('タイヤ幅とオフセットを同時に 205 ET45 → 225 ET35: 外側 +20（中心 +10・幅 +10）/ 内側 0（中心 -10・幅 +10）', () => {
    // 外側 57.5 → 77.5、内側 147.5 → 147.5
    const r = run(wheel(8, 45, 205), wheel(8, 35, 225), 20, 20);
    expectClearance(r, { outerSide: 20, innerSide: 0, outer: [0, 'verySmall'], inner: [20, 'ok'] });
  });

  test('狭くして内側へ 225 ET35 → 205 ET45: 外側 -20（中心 -10・幅 -10）/ 内側 0（中心 +10・幅 -10）', () => {
    const r = run(wheel(8, 35, 225), wheel(8, 45, 205), 3, 3);
    expectClearance(r, { outerSide: -20, innerSide: 0, outer: [23, 'ok'], inner: [3, 'verySmall'] });
  });

  test('幅を広げて外側へ 215 ET48 → 245 ET40: 外側 +23（+8 +15）/ 内側 +7（-8 +15）', () => {
    // 外側 59.5 → 82.5、内側 155.5 → 162.5
    const r = run(wheel(7.5, 48, 215, 45, 17), wheel(8.5, 40, 245, 40, 18), 25, 7);
    expectClearance(r, { outerSide: 23, innerSide: 7, outer: [2, 'verySmall'], inner: [0, 'verySmall'] });
  });

  test('リム幅だけ 7J → 9J（ET40、205）: タイヤ側面は変わらない（ホイール端は +25.4 ずつ）', () => {
    const r = run(wheel(7, 40, 205), wheel(9, 40, 205), 20, 20);
    expectClearance(r, { outerSide: 0, innerSide: 0, outer: [20, 'ok'], inner: [20, 'ok'] });
    close(r.wheelOuterEdgeChangeMm, 25.4);
    close(r.wheelInnerEdgeChangeMm, 25.4);
  });

  test('すべて変更 7J ET45 205/50R17 → 8.5J ET38 235/40R18: 外側 +22 / 内側 +8（ホイール端は +26.05 / +12.05）', () => {
    // タイヤ側面: 外側 57.5 → 79.5、内側 147.5 → 155.5
    // リム端: 外側 43.9 → 69.95、内側 133.9 → 145.95
    const r = run(wheel(7, 45, 205, 50, 17), wheel(8.5, 38, 235, 40, 18), 30, 10);
    expectClearance(r, { outerSide: 22, innerSide: 8, outer: [8, 'ok'], inner: [2, 'verySmall'] });
    close(r.wheelOuterEdgeChangeMm, 26.05);
    close(r.wheelInnerEdgeChangeMm, 12.05);
  });

  test('画面の例 7.0J ET45 → 8.0J ET35（205/50R17）: ホイール端 +22.7 / +2.7、タイヤ側面 +10 / -10', () => {
    const r = run(wheel(7, 45, 205), wheel(8, 35, 205), 20, 20);
    close(r.wheelOuterEdgeChangeMm, 22.7);
    close(r.wheelInnerEdgeChangeMm, 2.7);
    expectClearance(r, { outerSide: 10, innerSide: -10, outer: [10, 'ok'], inner: [30, 'ok'] });
    // 図に使う位置: 現在のタイヤ側面 + クリアランス
    close(r.clearance.outer.positionMm, 77.5);
    close(r.clearance.inner.positionMm, 167.5);
  });

  test('外側・内側クリアランス 0mm: 側面が動かなければ「非常に小さい」、近づけば干渉、離れれば残量あり', () => {
    const same = run(wheel(7, 45, 205), wheel(7, 45, 205), 0, 0);
    expectClearance(same, { outerSide: 0, innerSide: 0, outer: [0, 'verySmall'], inner: [0, 'verySmall'] });
    const wider = run(wheel(7, 45, 205), wheel(7, 45, 215), 0, 0); // 両側 +5
    expectClearance(wider, { outerSide: 5, innerSide: 5, outer: [-5, 'interference'], inner: [-5, 'interference'] });
    const outward = run(wheel(7, 45, 205), wheel(7, 30, 205), 0, 0); // 外 +15 / 内 -15
    expectClearance(outward, { outerSide: 15, innerSide: -15, outer: [-15, 'interference'], inner: [15, 'ok'] });
  });
});

// ---------------------------------------------------------------
describe('0.1mm 単位の表示と判定の一致', () => {
  const shown = (c) => formatNumber(c.remainingRoundedMm);
  /**
   * 内部の残量 mm を、画面と同じ手順（0.1mm に丸めた同一の値で表示・判定）で処理する。
   * 入力は小数第 1 位までなので、0.04mm のような残量は入力からは作れない。
   * ここでは丸め・判定の処理そのものを、計算誤差や将来の変更に備えて確認する。
   */
  const at = (mm) => {
    const remainingRoundedMm = roundClearance(mm);
    return { remainingMm: mm, remainingRoundedMm, level: judgeClearance(remainingRoundedMm) };
  };

  const cases = [
    // [入力（= 内部の残量）, 画面の表示, 判定]
    [0, '0.0', 'verySmall'],
    [0.04, '0.0', 'verySmall'],    // 丸めると 0.0 になる正の微小値
    [0.01, '0.0', 'verySmall'],
    [-0.04, '0.0', 'verySmall'],   // 丸めると 0.0 になる負の微小値（「0.0」なのに干渉にはしない）
    [-0.01, '0.0', 'verySmall'],
    [-0.05, '-0.1', 'interference'],
    [-0.1, '-0.1', 'interference'],
    [0.05, '0.1', 'verySmall'],
    [4.95, '5.0', 'verySmall'],    // 丸めると 5.0 になる 5mm 前後の値
    [4.99, '5.0', 'verySmall'],
    [5, '5.0', 'verySmall'],
    [5.01, '5.0', 'verySmall'],
    [5.04, '5.0', 'verySmall'],    // 修正前は「5.0」表示なのに「残量あり」だった
    [5.05, '5.1', 'ok'],           // 丸めると 5.1 になる値
    [5.1, '5.1', 'ok'],
    [5.14, '5.1', 'ok'],
  ];
  for (const [mm, text, level] of cases) {
    test(`残量 ${mm}mm → 表示「${text}」・判定 ${level}`, () => {
      const c = at(mm);
      close(c.remainingMm, mm, '内部の値は丸めない');
      assert.equal(shown(c), text);
      assert.equal(c.level, level);
    });
  }

  test('計算誤差: 7J ET45.7 → ET40.1、外側 5.6mm は残量ちょうど 0（内部 -1.8e-15）→「0.0」「非常に小さい」', () => {
    const r = run(wheel(7, 45.7, 205), wheel(7, 40.1, 205), 5.6, 10.6);
    assert.notEqual(r.clearance.outer.remainingMm, 0); // 内部の値は誤差を含んだまま（丸めない）
    assert.equal(shown(r.clearance.outer), '0.0');
    assert.equal(r.clearance.outer.level, 'verySmall');
  });

  test('既定の例 7J+48 → 8J+45（205）: 外側の側面 +3 なので、外側 3.0mm → 残量 0 →「0.0」「非常に小さい」', () => {
    const r = run(wheel(7, 48, 205), wheel(8, 45, 205), 3, null); // 外側側面 +3
    assert.equal(shown(r.clearance.outer), '0.0');
    assert.equal(r.clearance.outer.level, 'verySmall');
  });

  test('roundClearance と judgeClearance: 丸めた値で判定する', () => {
    assert.equal(roundClearance(-3.552713678800501e-15), 0);
    assert.equal(roundClearance(5.000000000000007), 5);
    assert.equal(roundClearance(-0.04), 0); // -0 にならない
    assert.ok(Object.is(roundClearance(-0.04), 0));
    assert.equal(judgeClearance(roundClearance(-0.04)), 'verySmall');
    assert.equal(judgeClearance(roundClearance(5.04)), 'verySmall');
    assert.equal(judgeClearance(roundClearance(5.05)), 'ok');
  });

  test('多数の入力で、画面の表示（0.1mm）から決めた判定と実際の判定が必ず一致する', () => {
    const fromText = (text) => {
      const v = Number(text);
      return v < 0 ? 'interference' : v <= 5 ? 'verySmall' : 'ok';
    };
    let count = 0;
    for (const [e1, e2] of [[45, 35], [45.7, 40.1], [48.3, 45.1], [-12.3, 3.1], [0, 0]]) {
      for (const [w1, w2] of [[205, 205], [205, 225], [245, 195]]) {
        for (let i = -30; i <= 300; i++) {
          const mm = i / 10; // 0.1mm 刻みの入力
          const r = run(wheel(7, e1, w1), wheel(8, e2, w2), mm, mm);
          for (const s of [r.clearance.outer, r.clearance.inner]) {
            const text = formatNumber(s.remainingRoundedMm);
            assert.notEqual(text, '-0.0');
            assert.equal(s.level, fromText(text), `ET${e1}→${e2} ${w1}→${w2} c=${mm} 表示 ${text}`);
            // 入力が 0.1mm 単位なら、内部の残量は 0.1mm 単位の値（＋ごく小さな計算誤差）だけ
            assert.ok(Math.abs(s.remainingMm - s.remainingRoundedMm) < 1e-9, `${s.remainingMm}`);
            count++;
          }
        }
      }
    }
    assert.ok(count > 9000);
  });

  test('入力は小数第 1 位まで: 0.1mm 単位なら計算、2 桁以上はエラー（丸めない）', () => {
    const errorsOf = (outerAbs, offsetAbs = '35') => compareWheels({
      current: wheel(7, 45, 205),
      candidate: { ...wheel(8, 35, 205), offsetAbs },
      clearance: { outerSign: '+', outerAbs, innerSign: '+', innerAbs: '' },
    });
    for (const ok of ['20', '20.5', '0.1', '０．３', '300']) assert.equal(errorsOf(ok).ok, true, ok);
    for (const bad of ['20.55', '0.04', '5.04', '4.95']) {
      const r = errorsOf(bad);
      assert.equal(r.ok, false, bad);
      assert.match(r.errors.clearance.outerMm, /小数第1位まで/);
    }
    for (const bad of ['35.25', '0.05']) {
      const r = errorsOf('20', bad);
      assert.equal(r.ok, false, bad);
      assert.match(r.errors.candidate.offsetMm, /小数第1位まで/);
    }
    // 符号付き 1 欄の形（offsetMm / outerMm）でも同じ
    assert.equal(compareWheels({
      current: { rimWidthJ: 7, offsetMm: 45.25, tireSize: '205/50R17' },
      candidate: { rimWidthJ: 8, offsetMm: 35, tireSize: '205/50R17' },
    }).ok, false);
    assert.equal(compareWheels({
      current: { rimWidthJ: 7, offsetMm: 45.2, tireSize: '205/50R17' },
      candidate: { rimWidthJ: 8, offsetMm: 35, tireSize: '205/50R17' },
      clearance: { outerMm: 20.07 },
    }).ok, false);
  });

  test('画面のカードと同じ書式: 残量・タイヤ側面の移動', () => {
    const r = run(wheel(7, 45, 205), wheel(8, 35, 225), 20, 20);
    assert.equal(formatNumber(r.clearance.outer.remainingRoundedMm), '0.0');
    assert.equal(formatSigned(r.clearance.outer.sideChangeMm), '+20.0');
    assert.equal(describeOuterEdgeChange(r.clearance.outer.sideChangeMm), '外側へ出る');
    assert.equal(formatSigned(r.clearance.inner.sideChangeMm), '±0.0');
    assert.equal(describeInnerEdgeChange(r.clearance.inner.sideChangeMm), '変化なし');
  });
});
