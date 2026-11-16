// ホイール比較の計算モジュール。
// 画面（DOM）には一切触らず、「値を受け取って結果を返す」だけの関数を集めています。
//
// 座標の約束ごと:
//   ハブ取付面を 0mm とし、
//   「外側端」は 車体外側方向をプラス、
//   「内側端」は 車体内側方向をプラス として距離を表します。

import { parseTireSize } from './tireSize.js';
import { formatRange } from './format.js';

export const MM_PER_INCH = 25.4;

/**
 * 入力値として受け付ける範囲（＝計算できる範囲）。
 * 特殊なサイズも比較できるよう広めに取っている。
 * この範囲内であっても、装着可能・安全・合法であることを意味しない。
 */
export const INPUT_LIMITS = {
  rimWidthJ: { min: 2, max: 20 },        // リム幅 J
  offsetMm: { min: -150, max: 150 },     // オフセット mm
  clearanceMm: { min: -50, max: 300 },   // 現在のクリアランス mm（任意入力）
};

/**
 * タイヤサイズを 3 項目（幅 / 扁平率 / リム径）で入力するときの範囲と刻み。
 * 値は min から step 刻み（例: 幅は 105, 115, …, 405）。
 */
export const TIRE_INPUT_LIMITS = {
  width: { min: 105, max: 405, step: 10, unit: 'mm', label: 'タイヤ幅' },
  aspect: { min: 5, max: 90, step: 5, unit: '%', label: '扁平率' },
  rimInch: { min: 7, max: 35, step: 1, unit: 'インチ', label: 'リム径' },
};

/** 画面の初期値 */
export const DEFAULT_INPUTS = {
  current: { rimWidthJ: 7, offsetSign: '+', offsetAbs: 48, tireWidth: 205, tireAspect: 50, tireRimInch: 17 },
  candidate: { rimWidthJ: 8, offsetSign: '+', offsetAbs: 45, tireWidth: 205, tireAspect: 50, tireRimInch: 17 },
  clearance: { outerSign: '+', outerAbs: 20, innerSign: '+', innerAbs: 20 },
};

/** クリアランス判定のしきい値（mm） */
export const CLEARANCE_THRESHOLD_MM = 5;

/** クリアランス判定の結果コードと表示文言 */
export const CLEARANCE_LEVELS = {
  interference: '静止状態でも干渉または突出の可能性',
  verySmall: '非常に小さい',
  ok: '数値上の残量あり',
};

/** 理論実速度を表示するメーター表示速度（km/h） */
export const METER_SPEEDS = [40, 60, 100];

// ---------------------------------------------------------------
// 入力値の変換
// ---------------------------------------------------------------

/**
 * 画面の入力値（文字列や数値）を数値に変換する。
 * 全角数字・全角符号（＋ －）・数学用マイナス（−）にも対応。
 * @param {unknown} value
 * @returns {number | null} 未入力なら null、数値にできなければ NaN
 */
export function parseNumberInput(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;

  const text = String(value)
    .normalize('NFKC')            // "＋４８" → "+48"
    .replace(/[−‐-―ー]/g, '-') // −‐–— ー などをマイナスに
    .replace(/\s+/g, '');
  if (text === '') return null;

  // "48" "+48" "-10" "7.5" のような形だけを数値として認める
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(text)) return NaN;
  return Number(text);
}

// ---------------------------------------------------------------
// 基本計算
// ---------------------------------------------------------------

/** リム幅 J → mm */
export function rimWidthMm(rimWidthJ) {
  return rimWidthJ * MM_PER_INCH;
}

/**
 * ハブ取付面から見たホイール外側端・内側端の位置（リム幅の表記上の端）。
 * @param {number} rimWidthJ
 * @param {number} offsetMm
 * @returns {{ outer: number, inner: number }} outer: 外側方向へ mm / inner: 内側方向へ mm
 */
export function wheelEdges(rimWidthJ, offsetMm) {
  const half = rimWidthMm(rimWidthJ) / 2;
  return {
    outer: half - offsetMm,
    inner: half + offsetMm,
  };
}

/**
 * タイヤの理論外径（mm）
 * @param {{ width: number, aspect: number, rimInch: number }} tire
 */
export function tireOuterDiameter(tire) {
  const sidewall = tire.width * (tire.aspect / 100);
  return tire.rimInch * MM_PER_INCH + 2 * sidewall;
}

/**
 * メーター表示速度 → 理論上の実速度
 * @param {number} displaySpeed メーター表示（km/h）
 * @param {number} diameterRatio 交換候補の外径 / 現在の外径
 */
export function actualSpeed(displaySpeed, diameterRatio) {
  return displaySpeed * diameterRatio;
}

/**
 * 候補装着後のクリアランス残量の判定
 * @param {number} remainingMm
 * @returns {'interference' | 'verySmall' | 'ok'}
 */
export function judgeClearance(remainingMm) {
  if (remainingMm < 0) return 'interference';
  if (remainingMm <= CLEARANCE_THRESHOLD_MM) return 'verySmall';
  return 'ok';
}

// ---------------------------------------------------------------
// 入力検証
// ---------------------------------------------------------------

function validateRange(value, limits, label, unit, { required }) {
  if (value === null) {
    return required ? `${label}を入力してください` : null;
  }
  if (!Number.isFinite(value)) {
    return `${label}は数値で入力してください`;
  }
  if (value < limits.min || value > limits.max) {
    return `${label}は ${formatRange(limits, unit)} の範囲で入力してください`;
  }
  return null;
}

/**
 * 範囲と刻みのある値（タイヤ幅・扁平率・リム径）を検証する。
 * @param {number | null} value parseNumberInput() の結果
 * @param {{ min: number, max: number, step: number, unit: string, label: string }} lim
 * @returns {string | null} エラーメッセージ（問題なければ null）
 */
export function validateSteppedValue(value, lim) {
  if (value === null) return `${lim.label}を入力してください`;
  if (!Number.isFinite(value)) return `${lim.label}は数値で入力してください`;
  if (value < lim.min || value > lim.max) {
    return `${lim.label}は ${lim.min}〜${lim.max}${lim.unit} の範囲で入力してください`;
  }
  const k = (value - lim.min) / lim.step;
  if (Math.abs(k - Math.round(k)) > 1e-9) {
    return `${lim.label}は ${lim.step}${lim.unit}刻み（${lim.min}, ${lim.min + lim.step}, …, ${lim.max}）で入力してください`;
  }
  return null;
}

/**
 * 3 項目に分けたタイヤサイズ（幅 / 扁平率 / リム径）を検証する。
 * @param {{ tireWidth: unknown, tireAspect: unknown, tireRimInch: unknown }} input
 * @returns {{ ok: true, value: { width: number, aspect: number, rimInch: number, normalized: string } }
 *          | { ok: false, errors: Record<string, string> }}
 */
export function validateTireFields(input = {}) {
  const fields = [
    ['tireWidth', 'width'],
    ['tireAspect', 'aspect'],
    ['tireRimInch', 'rimInch'],
  ];
  const errors = {};
  const value = {};
  for (const [field, key] of fields) {
    const n = parseNumberInput(input[field]);
    const error = validateSteppedValue(n, TIRE_INPUT_LIMITS[key]);
    if (error) errors[field] = error;
    else value[key] = n;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  value.normalized = `${value.width}/${value.aspect}R${value.rimInch}`;
  return { ok: true, value };
}

/**
 * 「符号（+ / -）」と「絶対値」の入力を、符号付きの数値にする。
 * 数値が 0 のときは、符号に関係なく 0（-0 にはしない）。
 * @param {unknown} sign '+' または '-'
 * @param {unknown} absInput 絶対値の入力（文字列や数値）
 * @returns {{ value: number | null } | { error: 'number' | 'negative' | 'sign' }}
 *   value: 符号付きの数値。未入力なら null
 */
export function combineSignedInput(sign, absInput) {
  if (sign !== '+' && sign !== '-') return { error: 'sign' };
  const abs = parseNumberInput(absInput);
  if (abs === null) return { value: null };
  if (!Number.isFinite(abs)) return { error: 'number' };
  if (abs < 0) return { error: 'negative' };
  const value = sign === '-' ? -abs : abs;
  return { value: value === 0 ? 0 : value };
}

/**
 * 符号 + 絶対値の入力を検証して、符号付きの値にする。
 * 範囲は符号付きの値の範囲（limits）で判定し、メッセージは絶対値の範囲で伝える。
 * @returns {{ value: number | null } | { error: string }}
 */
function validateSignedInput(sign, absInput, limits, label, { required }) {
  const r = combineSignedInput(sign, absInput);
  const plusMax = Math.max(limits.max, 0);
  const minusMax = Math.max(-limits.min, 0);
  const rangeText = plusMax === minusMax
    ? `0〜${plusMax}mm`
    : `＋ のとき 0〜${plusMax}mm、− のとき 0〜${minusMax}mm`;
  if ('error' in r) {
    if (r.error === 'negative') return { error: `${label}の数値は 0 以上で入力し、符号は ＋／− で選んでください` };
    if (r.error === 'sign') return { error: `${label}の符号を ＋／− で選んでください` };
    return { error: `${label}は数値で入力してください` };
  }
  if (r.value === null) return required ? { error: `${label}を入力してください` } : { value: null };
  if (r.value < limits.min || r.value > limits.max) {
    return { error: `${label}は ${rangeText} の範囲で入力してください` };
  }
  return { value: r.value };
}

/**
 * ホイール1本分（現在 or 交換候補）の入力を検証・変換する。
 * オフセットは offsetMm（符号付き 1 欄）か、offsetSign + offsetAbs（符号 + 絶対値）で受け取る。
 * タイヤは tireSize（"215/45R17" の文字列）か、tireWidth / tireAspect / tireRimInch（3 項目）で受け取る。
 * どちらの形でも、計算に使う値（offsetMm・tire）は同じ形にそろえる。
 * @param {{ rimWidthJ: unknown, offsetMm?: unknown, offsetSign?: unknown, offsetAbs?: unknown,
 *           tireSize?: unknown, tireWidth?: unknown, tireAspect?: unknown, tireRimInch?: unknown }} input
 * @returns {{ ok: true, value: { rimWidthJ: number, offsetMm: number, tire: object } }
 *          | { ok: false, errors: Record<string, string> }}
 */
export function validateWheelInput(input = {}) {
  const errors = {};

  const rimWidthJ = parseNumberInput(input.rimWidthJ);
  const rimError = validateRange(rimWidthJ, INPUT_LIMITS.rimWidthJ, 'リム幅', 'J', { required: true });
  if (rimError) errors.rimWidthJ = rimError;

  let offsetMm = null;
  if ('offsetAbs' in input || 'offsetSign' in input) {
    const r = validateSignedInput(input.offsetSign, input.offsetAbs, INPUT_LIMITS.offsetMm, 'オフセット', { required: true });
    if ('error' in r) errors.offsetMm = r.error;
    else offsetMm = r.value;
  } else {
    offsetMm = parseNumberInput(input.offsetMm);
    const offsetError = validateRange(offsetMm, INPUT_LIMITS.offsetMm, 'オフセット', 'mm', { required: true });
    if (offsetError) errors.offsetMm = offsetError;
  }

  let tire = null;
  if ('tireWidth' in input || 'tireAspect' in input || 'tireRimInch' in input) {
    const t = validateTireFields(input);
    if (t.ok) tire = t.value;
    else Object.assign(errors, t.errors);
  } else {
    const t = parseTireSize(input.tireSize);
    if (t.ok) tire = t.value;
    else errors.tireSize = t.error;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { rimWidthJ, offsetMm, tire } };
}

/**
 * 任意入力のクリアランスを検証・変換する。
 * 各側は outerMm（符号付き 1 欄）か、outerSign + outerAbs（符号 + 絶対値）で受け取る（内側も同様）。
 * マイナスは「現在の状態ですでに基準位置を超えている」ことを表す。
 * @param {{ outerMm?: unknown, innerMm?: unknown, outerSign?: unknown, outerAbs?: unknown,
 *           innerSign?: unknown, innerAbs?: unknown }} input
 * @returns {{ ok: true, value: { outerMm: number | null, innerMm: number | null } }
 *          | { ok: false, errors: Record<string, string> }}
 */
export function validateClearanceInput(input = {}) {
  const errors = {};
  const value = {};
  for (const [side, label] of [['outer', '外側クリアランス'], ['inner', '内側クリアランス']]) {
    const key = `${side}Mm`;
    if (`${side}Abs` in input || `${side}Sign` in input) {
      const r = validateSignedInput(input[`${side}Sign`], input[`${side}Abs`], INPUT_LIMITS.clearanceMm, label, { required: false });
      if ('error' in r) errors[key] = r.error;
      else value[key] = r.value;
    } else {
      const n = parseNumberInput(input[key]);
      const error = validateRange(n, INPUT_LIMITS.clearanceMm, label, 'mm', { required: false });
      if (error) errors[key] = error;
      else value[key] = n;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { outerMm: value.outerMm, innerMm: value.innerMm } };
}

// ---------------------------------------------------------------
// まとめて比較
// ---------------------------------------------------------------

/**
 * @param {number | null} currentMm 現在のクリアランス
 * @param {number} changeMm ホイール端の変化量（部品に近づく方向がプラス）
 * @param {number} currentEdgeMm 現在のホイール端の位置（ハブ取付面から）
 */
function clearanceResult(currentMm, changeMm, currentEdgeMm) {
  if (currentMm === null) return null; // 未入力なら計算しない
  const remainingMm = currentMm - changeMm;
  const level = judgeClearance(remainingMm);
  return {
    currentMm,
    remainingMm,
    level,
    label: CLEARANCE_LEVELS[level],
    // フェンダー等（外側）／最寄り部品（内側）の位置。ハブ取付面からの距離（図で使う）
    positionMm: currentEdgeMm + currentMm,
  };
}

/** ホイール1本分の、表示や図に使う派生値をまとめる */
function wheelDetails(wheel) {
  const tireDiameterMm = tireOuterDiameter(wheel.tire);
  return {
    ...wheel,
    rimWidthMm: rimWidthMm(wheel.rimWidthJ),
    rimDiameterMm: wheel.tire.rimInch * MM_PER_INCH,
    edges: wheelEdges(wheel.rimWidthJ, wheel.offsetMm),
    tireDiameterMm,
    // 理論上の車軸の高さ（地面から）＝ タイヤ外径の半分
    axleHeightMm: tireDiameterMm / 2,
  };
}

/**
 * 現在と交換候補を比較する。
 * 値の丸めは行わない（表示側で丸める）。
 *
 * @param {{
 *   current: { rimWidthJ: unknown, offsetMm: unknown, tireSize: unknown },
 *   candidate: { rimWidthJ: unknown, offsetMm: unknown, tireSize: unknown },
 *   clearance?: { outerMm?: unknown, innerMm?: unknown },
 * }} input
 * @returns {{ ok: true, result: object } | { ok: false, errors: object }}
 */
export function compareWheels({ current, candidate, clearance = {} } = {}) {
  const cur = validateWheelInput(current);
  const cand = validateWheelInput(candidate);
  const clr = validateClearanceInput(clearance);

  if (!cur.ok || !cand.ok || !clr.ok) {
    return {
      ok: false,
      errors: {
        current: cur.ok ? {} : cur.errors,
        candidate: cand.ok ? {} : cand.errors,
        clearance: clr.ok ? {} : clr.errors,
      },
    };
  }

  const c = wheelDetails(cur.value);
  const n = wheelDetails(cand.value);

  // ホイール外側端・内側端の変化
  const outerChangeMm = n.edges.outer - c.edges.outer; // プラス = 外へ出る
  const innerChangeMm = n.edges.inner - c.edges.inner; // プラス = 内へ入る

  // タイヤ外径
  const curDiameter = c.tireDiameterMm;
  const newDiameter = n.tireDiameterMm;
  const diameterRatio = newDiameter / curDiameter;

  return {
    ok: true,
    result: {
      current: c,
      candidate: n,
      wheelOuterEdgeChangeMm: outerChangeMm,
      wheelInnerEdgeChangeMm: innerChangeMm,
      tireDiameterChangeMm: newDiameter - curDiameter,
      tireDiameterChangePercent: (diameterRatio - 1) * 100,
      // 理論上の最低地上高変化 = 半径の差
      groundClearanceChangeMm: (newDiameter - curDiameter) / 2,
      diameterRatio,
      speedometer: METER_SPEEDS.map((display) => ({
        displayKmh: display,
        actualKmh: actualSpeed(display, diameterRatio),
      })),
      clearance: {
        outer: clearanceResult(clr.value.outerMm, outerChangeMm, c.edges.outer),
        inner: clearanceResult(clr.value.innerMm, innerChangeMm, c.edges.inner),
      },
    },
  };
}
