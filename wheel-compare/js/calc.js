// ホイール比較の計算モジュール。
// 画面（DOM）には一切触らず、「値を受け取って結果を返す」だけの関数を集めています。
//
// 座標の約束ごと:
//   ハブ取付面を 0mm とし、
//   「外側端」は 車体外側方向をプラス、
//   「内側端」は 車体内側方向をプラス として距離を表します。
//
// 2 つの基準を使い分ける:
//   ホイール位置の変化 → リム基準（リム幅とオフセットから求めるリムの端）
//   クリアランスの推定 → タイヤ側面基準（公称タイヤ幅から求めるタイヤ側面の理論上の位置）

import { parseTireSize } from './tireSize.js';
import { formatRange, roundTo } from './format.js';

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

/**
 * 画面の初期値。
 * クリアランスは実車を測らないと分からないので、初期状態は未入力（空欄）にする。
 * 未入力は「値がない」状態で、0mm とは別物（未入力の側は計算・判定しない）。
 */
export const DEFAULT_INPUTS = {
  current: { rimWidthJ: 7, offsetSign: '+', offsetAbs: 48, tireWidth: 205, tireAspect: 50, tireRimInch: 17 },
  candidate: { rimWidthJ: 8, offsetSign: '+', offsetAbs: 45, tireWidth: 205, tireAspect: 50, tireRimInch: 17 },
  clearance: { outerSign: '+', outerAbs: '', innerSign: '+', innerAbs: '' },
};

/** クリアランス判定のしきい値（mm） */
export const CLEARANCE_THRESHOLD_MM = 5;

/** クリアランスの推定残量を表示・判定する桁数（小数 1 桁 = 0.1mm 単位） */
export const CLEARANCE_DIGITS = 1;

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
 * ハブ取付面から見たタイヤ側面の理論上の位置（公称タイヤ幅による理論値。実測値ではない）。
 * 公称タイヤ幅が、タイヤ中心（= リム中心線。ハブ面から外側へ −ET の位置）から
 * 左右均等に広がると仮定する。リム幅には左右されない。
 * @param {number} tireWidthMm 公称タイヤ幅
 * @param {number} offsetMm
 * @returns {{ outer: number, inner: number }} outer: 外側方向へ mm / inner: 内側方向へ mm
 */
export function tireSides(tireWidthMm, offsetMm) {
  const half = tireWidthMm / 2;
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
 * 候補装着後のクリアランス残量の判定。
 * 画面に表示するのと同じ 0.1mm 単位の値（roundClearance() の結果）を渡す。
 * 表示が「5.0」なら必ず「非常に小さい」、「0.0」なら必ず「非常に小さい」になる。
 * @param {number} roundedMm 0.1mm 単位に丸めた推定残量
 * @returns {'interference' | 'verySmall' | 'ok'}
 */
export function judgeClearance(roundedMm) {
  if (roundedMm < 0) return 'interference';
  if (roundedMm <= CLEARANCE_THRESHOLD_MM) return 'verySmall';
  return 'ok';
}

/**
 * 推定残量を表示・判定用に 0.1mm 単位へ丸める。
 * 浮動小数点の誤差（例: 本来 0 の残量が −3.6e-15 になる）もこの丸めで取り除かれるので、
 * 判定の前に別の誤差補正はしない。内部の計算値（remainingMm）は丸めずに残す。
 * @param {number} remainingMm
 */
export function roundClearance(remainingMm) {
  return roundTo(remainingMm, CLEARANCE_DIGITS);
}

// ---------------------------------------------------------------
// 入力検証
// ---------------------------------------------------------------

/** オフセット・クリアランスの入力で使える小数の桁数（0.1mm 単位） */
export const INPUT_DECIMALS_MM = 1;

/**
 * 小数第 digits 位までの値か（例: digits = 1 なら 45.5 は可、45.55 は不可）。
 * 45.5 × 10 = 455.00000000000006 のような計算誤差は許す。
 */
export function hasAtMostDecimals(value, digits) {
  const scaled = value * 10 ** digits;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

function decimalsError(label) {
  return `${label}は小数第${INPUT_DECIMALS_MM}位まで（0.1mm 単位）で入力してください`;
}

function validateRange(value, limits, label, unit, { required, decimals }) {
  if (value === null) {
    return required ? `${label}を入力してください` : null;
  }
  if (!Number.isFinite(value)) {
    return `${label}は数値で入力してください`;
  }
  if (value < limits.min || value > limits.max) {
    return `${label}は ${formatRange(limits, unit)} の範囲で入力してください`;
  }
  if (decimals !== undefined && !hasAtMostDecimals(value, decimals)) {
    return decimalsError(label);
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
  // 小数は第 1 位まで（0.1mm 単位）。2 桁以上は勝手に丸めずエラーにする
  if (!hasAtMostDecimals(r.value, INPUT_DECIMALS_MM)) {
    return { error: decimalsError(label) };
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
    const offsetError = validateRange(offsetMm, INPUT_LIMITS.offsetMm, 'オフセット', 'mm', {
      required: true, decimals: INPUT_DECIMALS_MM,
    });
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
 * マイナスは「現在のタイヤ側面がすでにフェンダー等（内側は最寄り部品）の位置を超えている」ことを表す。
 * 空欄・未指定は未入力（null）として扱い、エラーにしない。0 は有効な実測値。
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
      const error = validateRange(n, INPUT_LIMITS.clearanceMm, label, 'mm', {
        required: false, decimals: INPUT_DECIMALS_MM,
      });
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
 * 現在のクリアランス（タイヤ側面基準）から、交換候補装着後の推定残量を求める。
 * @param {number | null} currentMm 現在のクリアランス（現在のタイヤ側面から部品まで）
 * @param {number} sideChangeMm タイヤ側面の変化量（部品に近づく方向がプラス）
 * @param {number} currentSideMm 現在のタイヤ側面の位置（ハブ取付面から）
 */
function clearanceResult(currentMm, sideChangeMm, currentSideMm) {
  if (currentMm === null) return null; // 未入力なら計算しない
  const remainingMm = currentMm - sideChangeMm;      // 内部計算値（丸めない）
  const remainingRoundedMm = roundClearance(remainingMm); // 表示・判定に使う同一の値
  const level = judgeClearance(remainingRoundedMm);
  return {
    currentMm,
    sideChangeMm,
    remainingMm,
    remainingRoundedMm,
    level,
    label: CLEARANCE_LEVELS[level],
    // フェンダー等（外側）／最寄り部品（内側）の位置。ハブ取付面からの距離（図で使う）
    // = 現在のタイヤ側面（理論値）＋ 現在のクリアランス
    positionMm: currentSideMm + currentMm,
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
    // タイヤ側面の理論上の位置（公称幅がタイヤ中心から左右均等に広がると仮定）
    tireSides: tireSides(wheel.tire.width, wheel.offsetMm),
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

  // タイヤ側面（理論値）の変化。クリアランスの推定に使う
  //   外側: −(ET差) + (タイヤ幅差)/2  プラス = 外へ出る（フェンダー等に近づく）
  //   内側: +(ET差) + (タイヤ幅差)/2  プラス = 内へ入る（最寄り部品に近づく）
  const tireOuterSideChangeMm = n.tireSides.outer - c.tireSides.outer;
  const tireInnerSideChangeMm = n.tireSides.inner - c.tireSides.inner;

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
      tireOuterSideChangeMm,
      tireInnerSideChangeMm,
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
        outer: clearanceResult(clr.value.outerMm, tireOuterSideChangeMm, c.tireSides.outer),
        inner: clearanceResult(clr.value.innerMm, tireInnerSideChangeMm, c.tireSides.inner),
      },
    },
  };
}
