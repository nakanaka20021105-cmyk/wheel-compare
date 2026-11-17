// 選択式（select）の入力欄に並べる選択肢を作るモジュール。
// 画面（DOM）には触らず、選択肢の一覧と「＋／－ボタンで何番目に移るか」だけを決める。
// 範囲は calc.js の定数から作るので、入力チェックの範囲と選択肢がずれない。

import { INPUT_LIMITS, TIRE_INPUT_LIMITS } from './calc.js';

/** リム幅の選択肢の刻み（J） */
export const RIM_WIDTH_STEP_J = 0.5;

/**
 * min から max まで step 刻みの数値の一覧。小数の誤差（7.000000001 など）が出ないよう丸める。
 * @returns {number[]}
 */
export function steppedValues(min, max, step) {
  const count = Math.round((max - min) / step);
  return Array.from({ length: count + 1 }, (_, i) => Math.round((min + i * step) * 1000) / 1000);
}

/**
 * select の選択肢。value は計算に渡す文字列、label は画面に出す文字列。
 * 単位は項目名の横に出すので、label には付けない。
 * @type {Record<'rimWidthJ' | 'tireWidth' | 'tireAspect' | 'tireRimInch', { value: string, label: string }[]>}
 */
export const SELECT_OPTIONS = {
  // リム幅: 2.0〜20.0J、0.5J 刻み（表示は 7.0 / 7.5 のように小数 1 桁）
  rimWidthJ: steppedValues(INPUT_LIMITS.rimWidthJ.min, INPUT_LIMITS.rimWidthJ.max, RIM_WIDTH_STEP_J)
    .map((v) => ({ value: String(v), label: v.toFixed(1) })),
  // タイヤ幅: 表記上のサイズ 105, 115, …, 405mm（10mm 刻みで末尾が 5）
  tireWidth: toOptions(TIRE_INPUT_LIMITS.width),
  // 扁平率: 5〜90%、5% 刻み
  tireAspect: toOptions(TIRE_INPUT_LIMITS.aspect),
  // リム径: 7〜35 インチ、1 インチ刻み
  tireRimInch: toOptions(TIRE_INPUT_LIMITS.rimInch),
};

function toOptions({ min, max, step }) {
  return steppedValues(min, max, step).map((v) => ({ value: String(v), label: String(v) }));
}

/**
 * ＋／－ボタンを押したときに選ぶ選択肢の番号。端では止まる（一周しない）。
 * @param {number} length 選択肢の数
 * @param {number} index 今の番号（未選択なら -1）
 * @param {number} delta -1（－ボタン）または +1（＋ボタン）
 */
export function stepOptionIndex(length, index, delta) {
  if (length <= 0) return -1;
  if (index < 0) return delta < 0 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, index + delta));
}
