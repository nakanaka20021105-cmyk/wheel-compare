// 断面図（ホイール・タイヤ断面模式図）を描くモジュール。
//
// 計算は calc.js の結果（compareWheels().result）をそのまま使い、ここでは
//   1. buildDiagramModel(): mm → px の座標変換と配置を決める（DOM を使わない）
//   2. renderDiagram():     決まった図形を SVG 要素にする
// だけを行う。1 を DOM から切り離しているので、はみ出しの有無を Node.js でテストできる。
//
// 座標の約束ごと（mm、計算結果と同じ）:
//   x: ハブ取付面 = 0、車体外側がプラス
//   y: 地面 = 0、上がプラス
// 画面上の向き: 左 = 車体外側、右 = 車体内側。
//   計算上の x（外側がプラス）は変えず、mm → px の変換（px()）だけで左右を反転する。
// ハブ取付面は図の左右中央に置く。
// 現在と交換候補は同じ座標系・同じ縮尺で重ねて描く。
// 縮尺は縦横同じ（1:1）。小さな差は形を誇張せず、寸法線・中心線・ET 矢印・数値で示す。

import {
  formatSigned, formatNumber, formatOffset, roundTo,
  describeOuterEdgeChange, describeInnerEdgeChange,
} from './format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 図のレイアウト設定（px） */
export const LAYOUT = {
  minWidth: 320,
  maxWidth: 760,
  padding: 8,        // SVG の端からの余白
  fontSize: 13,
  dirRowY: 18,       // 「車体外側 / 車体内側」の行
  outerDimY: 56,     // 外側端の寸法線
  innerDimY: 94,     // 内側端の寸法線
  drawTop: 112,      // ホイールを描く領域の上端
  groundGap: 74,     // 地面から下のラベル3行分の高さ
  sidePaddingRatio: 0.06, // 横方向の表示範囲に足す余白（範囲の割合）
  labelBlockGap: 92, // 地面から「寸法ラベルの一覧」1 行目までの高さ（一覧表示のとき）
  labelBlockRow: 20, // 寸法ラベルの一覧の行の高さ
};

/**
 * タイヤ外径を描く高さの上限（px）。縦横 1:1 なので、図の高さはこの範囲で縮尺に合わせて決まる。
 * wide: 図の幅 520px 以上 / narrow: それ未満（スマホ幅）
 */
export const MAX_DRAW_HEIGHT = { wide: 600, narrow: 440 };

/** 図の縮尺の表示（縦横同じ縮尺） */
export const SCALE_LABEL = '縦横同一縮尺 1:1';

/** タイヤのサイドウォールの膨らみ（px）。模式なので、ほんの少しだけにする */
export const TIRE_BULGE_PX = 2.5;

/** リム中心線を、リムの上下端からはみ出させる長さ（px） */
export const CENTER_LINE_EXTEND = 8;

/** ハブ取付面の線と、リムの内側の面とのすき間（px） */
export const HUB_LINE_INSET = 3;

/** ハブ取付面の線を、タイヤの上端より上・地面より下へはみ出させる長さ（px） */
export const HUB_LINE_EXTEND = 10;

/** ホイール内側に置く寸法線（リム幅・ET）の行の間隔（px、最大値） */
const INNER_ROW_GAP = 40;

/** 寸法ラベルを横の空きに置くのに必要な、行の間隔の最小値（px。ET は2行書くため） */
const SIDE_LABEL_MIN_ROW_GAP = 36;

/** 横に置く寸法ラベルと、図形（タイヤ・フェンダー等の線）とのすき間（px） */
const SIDE_LABEL_GAP = 10;

/** ET 矢印の矢じりの大きさ（px、最大値） */
const ET_ARROW_HEAD = 8;

/**
 * リム幅のラベル。例: ('交換', 8, 203.2) → "交換 8J = 203.2 mm"
 */
export function formatRimWidthLabel(who, rimWidthJ, rimWidthMm) {
  const j = Number.isInteger(rimWidthJ) ? String(rimWidthJ) : String(roundTo(rimWidthJ, 1));
  return `${who} ${j}J = ${formatNumber(rimWidthMm, 1)} mm`;
}

/** ET の位置関係の説明。例: 45 → "ハブ面が中心より外側" */
export function describeEt(offsetMm) {
  const r = roundTo(offsetMm, 1);
  if (r > 0) return 'ハブ面が中心より外側';
  if (r < 0) return 'ハブ面が中心より内側';
  return '中心線＝ハブ取付面';
}

/** ET の数値部分。例: ('交換', 45) → "交換 ET +45 mm" */
export function formatEtValue(who, offsetMm) {
  return `${who} ET ${formatOffset(offsetMm)} mm`;
}

/**
 * オフセット（ET）のラベル（1 行）。ハブ取付面がリム中心線のどちら側にあるかも書く。
 * 例: ('交換', 45) → "交換 ET +45 mm（ハブ面が中心より外側）"
 */
export function formatEtLabel(who, offsetMm) {
  return `${formatEtValue(who, offsetMm)}（${describeEt(offsetMm)}）`;
}

/** 図の中に必ず表示する注記（タイヤ幅は実測値ではない） */
export const TIRE_WIDTH_NOTE = '※ タイヤ幅は模式表示（実測幅ではありません）';


// ---------------------------------------------------------------
// 文字幅の見積もり（はみ出し防止用）
// ---------------------------------------------------------------

/**
 * 文字列の幅を少し大きめに見積もる。
 * 半角文字は 0.62 文字分、全角文字は 1 文字分として計算する。
 */
export function estimateTextWidth(text, fontSize = LAYOUT.fontSize) {
  let units = 0;
  for (const ch of text) {
    units += ch.charCodeAt(0) < 0x80 ? 0.62 : 1.0;
  }
  return units * fontSize;
}

/**
 * 文字を置く位置を決める。希望位置からはみ出す場合は内側へずらす。
 * @param {string} text
 * @param {number} x 希望位置
 * @param {'start' | 'middle' | 'end'} anchor x が文字のどこを指すか
 * @param {number} width SVG の幅
 * @returns {number} 文字の左端の x（text-anchor="start" で使う）
 */
export function placeText(text, x, anchor, width) {
  const w = estimateTextWidth(text);
  let left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
  const min = LAYOUT.padding;
  const max = width - LAYOUT.padding - w;
  left = Math.min(Math.max(left, min), Math.max(min, max));
  return left;
}

// ---------------------------------------------------------------
// SVG path の組み立て
// ---------------------------------------------------------------

/** 座標を path 用の文字列にする（小数1桁） */
const f = (n) => n.toFixed(1);

// ---------------------------------------------------------------
// 図のモデルを作る（DOM を使わない）
// ---------------------------------------------------------------

/**
 * @param {object} result compareWheels() の result
 * @param {{ width?: number }} options width: 図の幅（px）。画面幅に合わせる
 * @returns {{ width: number, height: number, scaleX: number, scaleY: number,
 *             scale: number, labelMode: 'side' | 'list',
 *             shapes: object[], description: string }}
 */
export function buildDiagramModel(result, { width = 640 } = {}) {
  const W = Math.round(Math.min(Math.max(width, LAYOUT.minWidth), LAYOUT.maxWidth));
  const drawLeft = LAYOUT.padding;
  const drawRight = W - LAYOUT.padding;
  const drawWidth = drawRight - drawLeft;
  const maxDrawHeight = W < 520 ? MAX_DRAW_HEIGHT.narrow : MAX_DRAW_HEIGHT.wide;

  const cur = result.current;
  const cand = result.candidate;
  const fender = result.clearance.outer; // null なら未入力
  const part = result.clearance.inner;

  // --- 表示範囲（mm）: ハブ取付面（0mm）を図の左右中央に置く -----------
  // ハブ面から最も遠いもの（ホイールの端・フェンダー等・最寄り部品）までの距離で、
  // 左右同じ幅の表示範囲にする。オフセットはこの中央の線から読む。
  const xs = [
    cur.edges.outer, -cur.edges.inner,
    cand.edges.outer, -cand.edges.inner,
  ];
  if (fender) xs.push(fender.positionMm);
  if (part) xs.push(-part.positionMm); // 内側は x がマイナス方向
  const halfSpan = Math.max(...xs.map(Math.abs));
  const sidePad = Math.max(halfSpan * 2 * LAYOUT.sidePaddingRatio, 10);
  const viewHalfX = halfSpan + sidePad;
  const viewSpanX = viewHalfX * 2;
  const viewSpanY = Math.max(cur.tireDiameterMm, cand.tireDiameterMm);

  // 縮尺（px / mm）。縦横同じ（1:1）。
  //   横は表示範囲が図の幅に収まる縮尺、縦はタイヤ外径が maxDrawHeight に収まる縮尺の、
  //   小さい方を縦横の両方に使う。図の高さはこの縮尺に合わせて決める
  //   （横幅に余裕があれば、縦横同じ倍率のまま図全体を大きくする）。
  const scale = Math.min(drawWidth / viewSpanX, maxDrawHeight / viewSpanY);
  const scaleX = scale;
  const scaleY = scale;
  const groundY = LAYOUT.drawTop + viewSpanY * scale;
  const baseH = Math.ceil(groundY + LAYOUT.groundGap);

  const originX = drawLeft + drawWidth / 2; // ハブ取付面 = 図の左右中央

  // mm → px（横）。車体外側（x がプラス）を画面の左に描くため、ここで向きを反転する。
  const px = (xMm) => originX - xMm * scaleX;
  const py = (yMm) => groundY - yMm * scaleY;   // mm → px（縦）

  const shapes = [];
  const line = (x1, y1, x2, y2, className) => shapes.push({ type: 'line', x1, y1, x2, y2, className });
  const text = (content, x, y, anchor, className) => {
    shapes.push({ type: 'text', x: placeText(content, x, anchor, W), y, text: content, className });
  };

  // path: d は描画用、x/y/width/height は図形を囲む枠（テスト・はみ出し確認用）
  const path = (d, box, className) => shapes.push({ type: 'path', d, ...box, className });

  // --- ホイール（主役）とタイヤ（外径を示す模式表示） ------------------
  // 車軸を通る縦の面で切った断面を描く。
  //   タイヤ: 上下2つの断面。外径（高さ）は計算値どおり。サイドウォールの膨らみは
  //           見た目だけの模式で、突出量の判定・寸法線には使わない。
  //   リム:   リム幅 × リム径の範囲内に、フランジとくぼみ（ウェル）を持つ断面で描く。
  //           外側端・内側端は計算値どおり（寸法線の基準）。
  // ハブ取付面は位置の基準線としてだけ描き、ディスクやブレーキの形は描かない。
  const wheelShapes = (w, prefix) => {
    const outerX = px(w.edges.outer);   // 画面の左側
    const innerX = px(-w.edges.inner);  // 画面の右側
    const x1 = Math.min(outerX, innerX);
    const x2 = Math.max(outerX, innerX);
    const tire = { x1, x2, yb: py(0), yt: py(w.tireDiameterMm) };
    const rimHalf = w.rimDiameterMm / 2;
    const rim = { x1, x2, yb: py(w.axleHeightMm - rimHalf), yt: py(w.axleHeightMm + rimHalf) };
    const axleY = py(w.axleHeightMm);
    return { prefix, outerX, innerX, tire, rim, axleY, ...wheelPaths(tire, rim, axleY) };
  };

  const wheelPaths = (tire, rim, axleY) => {
    const L = rim.x1;
    const R = rim.x2;
    const rw = R - L;
    const rimRadiusPx = axleY - rim.yt;

    // リム断面の寸法（px）。比率で決める模式形状
    const fh = Math.min(Math.max(17.5 * scaleY, 6), rimRadiusPx * 0.15); // フランジの高さ
    const wd = fh * 0.9;                                        // ウェルの深さ
    const th = Math.max(Math.min(5 * scaleY, fh * 0.45), 1.5);  // リムの板厚
    const seatW = rw * 0.22;                                    // ビードシートの長さ
    const slope = rw * 0.06;                                    // ウェルへの傾斜
    const ft = Math.min(Math.max(rw * 0.04, 2), seatW * 0.5);   // フランジの厚さ
    const lip = Math.min(ft / 2, fh / 2);                       // フランジ上端の丸み

    // a: 断面の位置からタイヤ中心（車軸）へ向かう向き（上側断面は +1、下側は -1）
    // フランジは上端を丸め、タイヤのビードを両側から抱える形にする。
    const rimSection = (yIn, a) => {
      const y = (t) => yIn + a * t;
      const p = (x, t) => `${f(x)} ${f(y(t))}`;
      return [
        `M${p(L, fh + th)}`, `L${p(L, lip)}`, `Q${p(L, 0)} ${p(L + ft / 2, 0)}`,
        `Q${p(L + ft, 0)} ${p(L + ft, lip)}`, `L${p(L + ft, fh)}`, `L${p(L + seatW, fh)}`,
        `L${p(L + seatW + slope, fh + wd)}`, `L${p(R - seatW - slope, fh + wd)}`,
        `L${p(R - seatW, fh)}`, `L${p(R - ft, fh)}`, `L${p(R - ft, lip)}`,
        `Q${p(R - ft, 0)} ${p(R - ft / 2, 0)}`, `Q${p(R, 0)} ${p(R, lip)}`,
        `L${p(R, fh + th)}`, `L${p(R - seatW, fh + th)}`, `L${p(R - seatW - slope, fh + wd + th)}`,
        `L${p(L + seatW + slope, fh + wd + th)}`, `L${p(L + seatW, fh + th)}`, 'Z',
      ].join(' ');
    };
    const rimD = `${rimSection(rim.yt, 1)} ${rimSection(rim.yb, -1)}`;
    const rimBox = { x: L, y: rim.yt, width: rw, height: rim.yb - rim.yt };

    // タイヤ断面（模式）。現在・交換候補とも同じ生成ルール。
    //   ビード: フランジの内側（L + ft）から、まっすぐ立ち上がって始まる
    //   サイドウォール: ビード → 最大幅 → 肩 を 2 本の 3 次ベジェでつなぐ。
    //     最大幅の点では接線を縦にそろえ、尖らず丸く膨らむ（最大 TIRE_BULGE_PX）。
    //   ショルダー: 縦の接線から横の接線へ滑らかに曲がり、平らなトレッドへつながる。
    // 膨らみは見た目だけで、寸法線・判定には使わない。
    const bulge = Math.max(0, Math.min(TIRE_BULGE_PX, L - drawLeft, drawRight - R));
    const tireSection = (yIn, yOut) => {
      const h = yOut - yIn;                 // 符号付き（上側断面はマイナス）
      const dir = Math.sign(h);
      const r = Math.min(Math.abs(h) * 0.3, rw * 0.12); // 肩の丸み（トレッドの端）
      const yBead = yIn - dir * fh;         // ビードはフランジの内側、ビードシートまで入る
      const yMax = yIn + h * 0.45;          // サイドウォールの最大幅の高さ
      const xBead = L + ft;
      const xMax = L - bulge;
      const xTread = L + r;
      const mirror = (x) => L + R - x;      // 右側（車体内側）は左右対称
      // 左側: ビード → 最大幅（縦の接線）
      const s1 = [[xBead, yIn + h * 0.2], [xMax, yMax - h * 0.2], [xMax, yMax]];
      // 左側: 最大幅 → 肩 → トレッド（縦の接線 → 横の接線）
      const s2 = [[xMax, yMax + (yOut - yMax) * 0.55], [xTread - r * 0.55, yOut], [xTread, yOut]];
      const c = (pts) => `C${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ')}`;
      const m = (pts) => pts.map(([x, y]) => [mirror(x), y]);
      // 右側は同じ曲線を逆向きにたどる（制御点の順を入れ替える）
      const s2r = m([[xMax, yMax + (yOut - yMax) * 0.55], [xMax, yMax]]);
      const s2rev = [[mirror(xTread - r * 0.55), yOut], s2r[0], s2r[1]];
      const s1rev = [[mirror(xMax), yMax - h * 0.2], [mirror(xBead), yIn + h * 0.2], [mirror(xBead), yIn]];
      return [
        `M${f(xBead)} ${f(yBead)}`, `L${f(xBead)} ${f(yIn)}`,
        c(s1), c(s2),
        `L${f(mirror(xTread))} ${f(yOut)}`,
        c(s2rev), c(s1rev),
        `L${f(mirror(xBead))} ${f(yBead)}`, 'Z',
      ].join(' ');
    };
    const tireD = `${tireSection(rim.yt, tire.yt)} ${tireSection(rim.yb, tire.yb)}`;
    const tireBox = { x: L - bulge, y: tire.yt, width: rw + 2 * bulge, height: tire.yb - tire.yt };

    // 寸法線の行を置ける「ホイールの内側の空き」の上下端
    const innerTop = rim.yt + fh + wd + th;
    const innerBottom = rim.yb - fh - wd - th;

    return { tireD, tireBox, rimD, rimBox, innerTop, innerBottom, flangeTop: fh + th };
  };

  const curW = wheelShapes(cur, 'current');
  const candW = wheelShapes(cand, 'candidate');
  const wheels = [[curW, cur, '現在'], [candW, cand, '交換']];

  // 1. タイヤ（模式・薄く）  2. リムの塗り  3. リムの輪郭（現在の破線を最前面に）
  for (const w of [curW, candW]) path(w.tireD, w.tireBox, `d-${w.prefix}-tire`);
  for (const w of [curW, candW]) path(w.rimD, w.rimBox, `d-${w.prefix}-rim`);
  for (const w of [candW, curW]) path(w.rimD, w.rimBox, `d-${w.prefix}-outline`);

  // --- リム中心線（リム幅の中央 = ハブ面から -ET の位置） ----------------
  const centerX = (w) => px(-w.offsetMm);
  for (const [sh, w] of wheels) {
    line(centerX(w), sh.rim.yt - CENTER_LINE_EXTEND, centerX(w), sh.rim.yb + CENTER_LINE_EXTEND, `d-${sh.prefix}-center`);
  }

  // --- ホイールの内側の空き（ハブ取付面の線・リム幅/ET の寸法線を置く範囲） ----
  // 2 本のリムの内側が重なる範囲。リム径の差が極端で重ならないときは、現在のホイールの内側を使う。
  const innerSpace = (() => {
    const t = Math.max(curW.innerTop, candW.innerTop);
    const b = Math.min(curW.innerBottom, candW.innerBottom);
    const minHeight = HUB_LINE_INSET * 2 + 10;
    return b - t >= minHeight ? { top: t, bottom: b } : { top: curW.innerTop, bottom: curW.innerBottom };
  })();

  // --- 地面とハブ取付面（0mm の基準線） --------------------------------
  // 上下のリムの内側に 1 本、タイヤの上端より上と地面より下に短い線を描く。
  // タイヤ・リムの上では線を切り、ホイールの部品ではなく位置の基準だと分かるようにする。
  line(drawLeft, groundY, drawRight, groundY, 'd-ground');
  const hubX = px(0);
  const tireTop = Math.min(curW.tire.yt, candW.tire.yt);
  line(hubX, innerSpace.top + HUB_LINE_INSET, hubX, innerSpace.bottom - HUB_LINE_INSET, 'd-hub');
  line(hubX, tireTop - HUB_LINE_EXTEND - 3, hubX, tireTop - 3, 'd-hub-ext');
  line(hubX, groundY + 3, hubX, groundY + 3 + HUB_LINE_EXTEND, 'd-hub-ext');
  text('ハブ取付面（0mm）', hubX, groundY + 26, 'middle', 'd-label d-hub-label');

  // --- フェンダー等（車体外側 = 左）・最寄り部品（車体内側 = 右） ---------
  if (fender) {
    const x = px(fender.positionMm);
    line(x, LAYOUT.drawTop, x, groundY, 'd-fender');
    text('フェンダー等', x - 4, groundY + 44, 'end', 'd-label d-fender-label');
  }
  if (part) {
    const x = px(-part.positionMm);
    line(x, LAYOUT.drawTop, x, groundY, 'd-part');
    text('最寄り部品', x + 4, groundY + 44, 'start', 'd-label d-part-label');
  }

  // --- 寸法線（外側端・内側端の変化量） ------------------------------
  const dimension = (xCur, xCand, rowY, label) => {
    // 補助線（各ホイール（リム）の上端から寸法線まで）
    line(xCur, rowY, xCur, curW.rim.yt, 'd-dim-ext');
    line(xCand, rowY, xCand, candW.rim.yt, 'd-dim-ext');
    // 寸法線と両端の目盛り
    line(xCur, rowY, xCand, rowY, 'd-dim');
    line(xCur, rowY - 5, xCur, rowY + 5, 'd-dim');
    line(xCand, rowY - 5, xCand, rowY + 5, 'd-dim');
    text(label, (xCur + xCand) / 2, rowY - 8, 'middle', 'd-label d-dim-label');
  };
  const outerChange = result.wheelOuterEdgeChangeMm;
  const innerChange = result.wheelInnerEdgeChangeMm;
  dimension(
    curW.outerX, candW.outerX, LAYOUT.outerDimY,
    `外側端 ${formatSigned(outerChange)}mm（${describeOuterEdgeChange(outerChange)}）`,
  );
  dimension(
    curW.innerX, candW.innerX, LAYOUT.innerDimY,
    `内側端 ${formatSigned(innerChange)}mm（${describeInnerEdgeChange(innerChange)}）`,
  );

  // --- リム幅・ET の寸法線（線はホイールの内側の実際の位置に置く） -----------
  // 行の順: 交換リム幅 → 現在リム幅 → 交換 ET → 現在 ET。
  const { top, bottom } = innerSpace;
  const rowGap = Math.max(Math.min(INNER_ROW_GAP, (bottom - top - 12) / 3), 0);
  const rowsTop = (top + bottom) / 2 - (rowGap * 3) / 2;
  const rowY = (i) => rowsTop + rowGap * i;

  /** 文字の説明つきで、各寸法線を描いた結果（ラベルの置き場所を決めるのに使う） */
  const labels = [];

  const rimWidthDim = ([sh, w, who], y) => {
    const cls = `d-${sh.prefix}`;
    const { x1, x2 } = sh.rim;
    // 補助線（リム端のフランジ裏側から寸法線まで）
    line(x1, sh.rim.yt + sh.flangeTop, x1, y, `${cls}-ext`);
    line(x2, sh.rim.yt + sh.flangeTop, x2, y, `${cls}-ext`);
    line(x1, y, x2, y, `${cls}-dim d-rimw`);
    line(x1, y - 5, x1, y + 5, `${cls}-dim`);
    line(x2, y - 5, x2, y + 5, `${cls}-dim`);
    labels.push({
      kind: 'rimw', cls, y, left: x1, right: x2,
      main: formatRimWidthLabel(who, w.rimWidthJ, w.rimWidthMm),
      oneLine: formatRimWidthLabel(who, w.rimWidthJ, w.rimWidthMm),
    });
  };

  const etDim = ([sh, w, who], y) => {
    const cls = `d-${sh.prefix}`;
    const xc = centerX(w);
    line(xc, y - 6, xc, y + 6, `${cls}-dim d-et-tick`); // 中心線側の目盛り
    if (roundTo(w.offsetMm, 1) !== 0) {
      // 中心線 → ハブ取付面 の矢印（矢じりはハブ面側）
      line(xc, y, hubX, y, `${cls}-dim d-et`);
      const dir = Math.sign(hubX - xc);
      const head = Math.min(ET_ARROW_HEAD, Math.abs(hubX - xc) * 0.6);
      line(hubX, y, hubX - dir * head, y - head * 0.55, `${cls}-dim d-et-head`);
      line(hubX, y, hubX - dir * head, y + head * 0.55, `${cls}-dim d-et-head`);
    }
    labels.push({
      kind: 'et', cls, y, left: Math.min(xc, hubX), right: Math.max(xc, hubX),
      main: formatEtValue(who, w.offsetMm),
      sub: `（${describeEt(w.offsetMm)}）`,
      oneLine: formatEtLabel(who, w.offsetMm),
    });
  };

  rimWidthDim(wheels[1], rowY(0));
  rimWidthDim(wheels[0], rowY(1));
  etDim(wheels[1], rowY(2));
  etDim(wheels[0], rowY(3));

  // --- 寸法ラベルの置き場所 -------------------------------------------
  // 文字でホイール・タイヤを隠さないよう、ラベルはホイールの外に置く。
  //   side: 車体外側（左）か車体内側（右）の、空いている広い方へ並べ、
  //         同じ高さの寸法線まで細い引出線でつなぐ（PC 幅など、横に余裕があるとき）
  //   list: 横に余裕がないとき（スマホ幅など）は、図の下に一覧で並べる。
  //         各行の先頭に、図中の線と同じ色・形の見本を付ける。
  const obstacleXs = [curW.tireBox.x, candW.tireBox.x,
    curW.tireBox.x + curW.tireBox.width, candW.tireBox.x + candW.tireBox.width];
  if (fender) obstacleXs.push(px(fender.positionMm));
  if (part) obstacleXs.push(px(-part.positionMm));
  const leftLimit = Math.min(...obstacleXs) - SIDE_LABEL_GAP;   // ここより左が空き
  const rightLimit = Math.max(...obstacleXs) + SIDE_LABEL_GAP;  // ここより右が空き
  const freeLeft = leftLimit - drawLeft;
  const freeRight = drawRight - rightLimit;
  const needWidth = Math.max(...labels.flatMap((l) => [l.main, l.sub].filter(Boolean).map((s) => estimateTextWidth(s))));
  const side = freeLeft >= freeRight ? 'left' : 'right';
  const labelMode = rowGap >= SIDE_LABEL_MIN_ROW_GAP && Math.max(freeLeft, freeRight) >= needWidth ? 'side' : 'list';

  let H = baseH;
  if (labelMode === 'side') {
    for (const l of labels) {
      const mainCls = `d-label ${l.kind === 'et' ? 'd-et-label' : 'd-rimw-label'} ${l.cls}-label`;
      if (side === 'left') {
        // 文字は leftLimit に右寄せ。引出線は文字の右端から寸法線の左端まで
        line(leftLimit + 3, l.y, l.left, l.y, `${l.cls}-leader`);
        text(l.main, leftLimit, l.y + 4, 'end', mainCls);
        if (l.sub) text(l.sub, leftLimit, l.y + 21, 'end', `d-label d-et-sub ${l.cls}-label`);
      } else {
        line(l.right, l.y, rightLimit - 3, l.y, `${l.cls}-leader`);
        text(l.main, rightLimit, l.y + 4, 'start', mainCls);
        if (l.sub) text(l.sub, rightLimit, l.y + 21, 'start', `d-label d-et-sub ${l.cls}-label`);
      }
    }
  } else {
    const rowTop = groundY + LAYOUT.labelBlockGap;
    labels.forEach((l, i) => {
      const y = rowTop + LAYOUT.labelBlockRow * i;
      const mid = y - 4;
      const x0 = drawLeft;
      const x1 = drawLeft + 20;
      // 見本: リム幅 = 両端に目盛りのある線、ET = 矢印
      const sample = `${l.cls}-dim d-sample${l.kind === 'et' ? ' d-sample-et' : ''}`;
      line(x0, mid, x1, mid, sample);
      if (l.kind === 'et') {
        line(x1, mid, x1 - 6, mid - 3.5, sample);
        line(x1, mid, x1 - 6, mid + 3.5, sample);
      } else {
        line(x0, mid - 4, x0, mid + 4, sample);
        line(x1, mid - 4, x1, mid + 4, sample);
      }
      text(l.oneLine, x1 + 6, y, 'start', `d-label ${l.kind === 'et' ? 'd-et-label' : 'd-rimw-label'} ${l.cls}-label`);
    });
    H = rowTop + LAYOUT.labelBlockRow * (labels.length - 1) + 12;
  }

  // --- タイヤ幅の注記（図だけ見ても分かるように、図の中に入れる） -------
  text(TIRE_WIDTH_NOTE, drawLeft, groundY + 66, 'start', 'd-label d-tire-note');

  // --- 方向（左 = 車体外側、右 = 車体内側） ------------------------------
  text('← 車体外側', drawLeft, LAYOUT.dirRowY, 'start', 'd-label d-dir');
  text('車体内側 →', drawRight, LAYOUT.dirRowY, 'end', 'd-label d-dir');

  const description =
    `断面図（左が車体外側、右が車体内側）: ホイール外側端 ${formatSigned(outerChange)}mm、内側端 ${formatSigned(innerChange)}mm、`
    + `タイヤ外径 ${formatSigned(result.tireDiameterChangeMm)}mm の変化。`
    + `リム幅 現在 ${formatRimWidthLabel('', cur.rimWidthJ, cur.rimWidthMm).trim()}、`
    + `交換 ${formatRimWidthLabel('', cand.rimWidthJ, cand.rimWidthMm).trim()}。`
    + `オフセット 現在 ET ${formatOffset(cur.offsetMm)}mm、交換 ET ${formatOffset(cand.offsetMm)}mm。`
    + (fender ? 'フェンダー等の位置を表示。' : '')
    + (part ? '最寄り部品の位置を表示。' : '');

  return { width: W, height: H, scale, scaleX, scaleY, labelMode, shapes, description };
}

// ---------------------------------------------------------------
// SVG に描く（DOM を使う）
// ---------------------------------------------------------------

/**
 * @param {SVGSVGElement} svg 描画先の <svg>
 * @param {ReturnType<typeof buildDiagramModel>} model
 */
export function renderDiagram(svg, model) {
  svg.setAttribute('viewBox', `0 0 ${model.width} ${model.height}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', model.description);

  const nodes = model.shapes.map((s) => {
    const el = document.createElementNS(SVG_NS, s.type);
    el.setAttribute('class', s.className);
    if (s.type === 'path') {
      el.setAttribute('d', s.d);
    } else if (s.type === 'rect') {
      for (const key of ['x', 'y', 'width', 'height']) el.setAttribute(key, s[key].toFixed(1));
    } else if (s.type === 'line') {
      for (const key of ['x1', 'y1', 'x2', 'y2']) el.setAttribute(key, s[key].toFixed(1));
    } else if (s.type === 'text') {
      el.setAttribute('x', s.x.toFixed(1));
      el.setAttribute('y', s.y.toFixed(1));
      el.textContent = s.text;
    }
    return el;
  });

  svg.replaceChildren(...nodes);
}
