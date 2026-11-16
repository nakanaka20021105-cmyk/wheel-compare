// タイヤサイズ文字列（例: "215/45R17"）を解析するモジュール。
// 画面（DOM）には一切触らない「純粋関数」だけを置いています。

/** 許可するタイヤサイズの範囲（これを外れたら入力ミスとみなす） */
export const TIRE_LIMITS = {
  width: { min: 125, max: 355 },      // 断面幅 mm
  aspect: { min: 20, max: 90 },       // 扁平率 %
  rimInch: { min: 10, max: 24 },      // リム径 インチ
};

/**
 * 入力文字列を正規化する。
 * - 全角英数字・全角記号を半角に（NFKC 正規化）
 * - 前後と途中の空白を削除
 * - 英字を大文字に（r → R, zr → ZR）
 * @param {string} text
 * @returns {string}
 */
export function normalizeTireSize(text) {
  return String(text)
    .normalize('NFKC')    // "２１５／４５Ｒ１７" → "215/45R17"
    .replace(/\s+/g, '')  // 空白をすべて削除
    .toUpperCase();
}

// 例: 215/45R17, 225/40ZR18
//   (\d{3})  断面幅（3桁）
//   (\d{2})  扁平率（2桁）
//   Z?R      ラジアル（ZR 表記も許可）
//   (\d{2})  リム径（2桁）
const TIRE_PATTERN = /^(\d{3})\/(\d{2})Z?R(\d{2})$/;

/**
 * タイヤサイズ文字列を解析する。
 * @param {string} text 例: "215/45R17"
 * @returns {{ ok: true, value: { width: number, aspect: number, rimInch: number, normalized: string } }
 *          | { ok: false, error: string }}
 */
export function parseTireSize(text) {
  if (text === null || text === undefined || String(text).trim() === '') {
    return { ok: false, error: 'タイヤサイズを入力してください（例: 215/45R17）' };
  }

  const normalized = normalizeTireSize(text);
  const match = normalized.match(TIRE_PATTERN);
  if (!match) {
    return { ok: false, error: 'タイヤサイズの形式が正しくありません（例: 215/45R17）' };
  }

  const width = Number(match[1]);
  const aspect = Number(match[2]);
  const rimInch = Number(match[3]);

  const { width: w, aspect: a, rimInch: r } = TIRE_LIMITS;
  if (width < w.min || width > w.max) {
    return { ok: false, error: `タイヤ幅は ${w.min}〜${w.max}mm の範囲で入力してください` };
  }
  if (aspect < a.min || aspect > a.max) {
    return { ok: false, error: `扁平率は ${a.min}〜${a.max}% の範囲で入力してください` };
  }
  if (rimInch < r.min || rimInch > r.max) {
    return { ok: false, error: `リム径は ${r.min}〜${r.max}インチ の範囲で入力してください` };
  }

  return {
    ok: true,
    value: { width, aspect, rimInch, normalized: `${width}/${aspect}R${rimInch}` },
  };
}
