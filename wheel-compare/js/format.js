// 計算結果を画面表示用の文字列にする関数。
// DOM には触らないので、Node.js のテストで確認できる。

/**
 * 小数点以下 digits 桁で四捨五入する（負の値も絶対値で四捨五入する）。
 * 例: roundTo(5.95, 1) → 6.0 / roundTo(-5.95, 1) → -6.0
 */
export function roundTo(value, digits = 1) {
  const factor = 10 ** digits;
  const rounded = (Math.sign(value) * Math.round(Math.abs(value) * factor + 1e-9)) / factor;
  return rounded === 0 ? 0 : rounded; // -0 を 0 にする
}

/** 符号なしの数値表示。例: 625.3 → "625.3" */
export function formatNumber(value, digits = 1) {
  return roundTo(value, digits).toFixed(digits);
}

/** 符号付きの数値表示。例: 15.7 → "+15.7" / -5.7 → "-5.7" / 0 → "±0.0" */
export function formatSigned(value, digits = 1) {
  const r = roundTo(value, digits);
  if (r === 0) return `±${(0).toFixed(digits)}`;
  return `${r > 0 ? '+' : '-'}${Math.abs(r).toFixed(digits)}`;
}

/** ホイール外側端の変化の説明（丸めた後の値で判断する） */
export function describeOuterEdgeChange(mm, digits = 1) {
  const r = roundTo(mm, digits);
  if (r > 0) return '外側へ出る';
  if (r < 0) return '内側へ引っ込む';
  return '変化なし';
}

/** ホイール内側端の変化の説明（丸めた後の値で判断する） */
export function describeInnerEdgeChange(mm, digits = 1) {
  const r = roundTo(mm, digits);
  if (r > 0) return '内側へ入る';
  if (r < 0) return '外側へ離れる';
  return '変化なし';
}

/** オフセットの表示。例: 48 → "+48" / -10 → "-10" / 0 → "0" */
export function formatOffset(mm) {
  const r = roundTo(mm, 1);
  const text = Number.isInteger(r) ? String(Math.abs(r)) : Math.abs(r).toFixed(1);
  if (r === 0) return '0';
  return `${r > 0 ? '+' : '-'}${text}`;
}

/**
 * 入力範囲の表示。最小値が負のときは、最大値に + を付けて符号をそろえる。
 * 例: { min: -150, max: 150 }, 'mm' → "-150〜+150mm" / { min: 2, max: 20 }, 'J' → "2〜20J"
 */
export function formatRange(limits, unit = '') {
  const max = limits.min < 0 && limits.max > 0 ? `+${limits.max}` : `${limits.max}`;
  return `${limits.min}〜${max}${unit}`;
}
