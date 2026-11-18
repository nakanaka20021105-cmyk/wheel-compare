// 画面全体の司令塔。
// 1. 入力欄の値を読み取る
// 2. calc.js の compareWheels() で計算する
// 3. エラーまたは結果を画面に表示する
// 計算そのものは calc.js、表示用の文字列化は format.js に任せる。

import { compareWheels, INPUT_LIMITS, TIRE_INPUT_LIMITS, DEFAULT_INPUTS } from './calc.js';
import { buildDiagramModel, renderDiagram, SCALE_LABEL } from './diagram.js';
import {
  formatNumber,
  formatSigned,
  formatOffset,
  formatRange,
  describeOuterEdgeChange,
  describeInnerEdgeChange,
} from './format.js';
import { SELECT_OPTIONS, stepOptionIndex } from './selectOptions.js';

const form = document.getElementById('wheel-form');
/** すべての入力（符号のラジオボタン・選択式の select を含む） */
const inputs = form.querySelectorAll('input[data-group][data-field], select[data-group][data-field]');
/** 値の入力欄（エラー表示の対象。ラジオボタンは除く） */
const valueInputs = [...inputs].filter((input) => input.type !== 'radio');
/** 選択式の欄の横にある －／＋ ボタン */
const stepButtons = form.querySelectorAll('button[data-step-target]');
const diagramSvg = document.getElementById('diagram');
const diagramWrap = document.getElementById('diagram-wrap');

/** 最後に計算できた結果（画面幅が変わったときに図を描き直すため） */
let lastResult = null;

// ---------------------------------------------------------------
// 入力の読み取り
// ---------------------------------------------------------------

/**
 * すべての入力欄を読み取って、compareWheels() に渡す形にまとめる。
 * 例: { current: { rimWidthJ: "7", offsetSign: "+", offsetAbs: "48",
 *                  tireWidth: "205", tireAspect: "50", tireRimInch: "17" },
 *       candidate: {...}, clearance: { outerSign: "+", outerAbs: "20", ... } }
 * 値は文字列のまま渡す（符号付きの値への変換と検証は calc.js が行う）。
 */
function readInputs() {
  const values = { current: {}, candidate: {}, clearance: {} };
  for (const input of inputs) {
    if (input.type === 'radio' && !input.checked) continue;
    values[input.dataset.group][input.dataset.field] = input.value;
  }
  return values;
}

// ---------------------------------------------------------------
// 小さな DOM ヘルパー
// ---------------------------------------------------------------

function setText(id, text) {
  document.getElementById(id).textContent = text;
}

/** <tr><td>…</td>…</tr> を作る。cells は文字列の配列。先頭セルは th にする。 */
function createRow(cells) {
  const tr = document.createElement('tr');
  cells.forEach((text, index) => {
    const cell = document.createElement(index === 0 ? 'th' : 'td');
    if (index === 0) cell.scope = 'row';
    cell.textContent = text;
    tr.appendChild(cell);
  });
  return tr;
}

/** tbody の中身を rows で置き換える */
function fillTable(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  tbody.replaceChildren(...rows.map(createRow));
}

// ---------------------------------------------------------------
// エラー表示
// ---------------------------------------------------------------

/**
 * 各入力欄の下にエラーメッセージを出す（エラーがない欄は消す）。
 * data-error-key がある欄は、そのキーのエラーを表示する
 * （例: オフセットの数値欄 offsetAbs → 計算上の項目 offsetMm のエラー）。
 */
function showFieldErrors(errors) {
  for (const input of valueInputs) {
    const { group, field } = input.dataset;
    const key = input.dataset.errorKey || field;
    const message = errors?.[group]?.[key] ?? '';
    setText(`${group}-${key}-error`, message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
}

// ---------------------------------------------------------------
// 結果表示
// ---------------------------------------------------------------

/** 数値と単位を分けて表示する（単位は小さめの文字） */
function setValueWithUnit(id, value, unit) {
  const el = document.getElementById(id);
  const small = document.createElement('span');
  small.className = 'unit-small';
  small.textContent = unit;
  el.replaceChildren(document.createTextNode(value), small);
}

/**
 * クリアランス1件分のカードを作る（タイヤ側面基準）。
 * 推定残量は、判定に使ったのと同じ 0.1mm 単位の値（remainingRoundedMm）を表示する。
 * @param {(mm: number) => string} describeSide タイヤ側面の動きの説明（外側へ出る など）
 */
function createClearanceCard(title, c, describeSide) {
  const card = document.createElement('div');
  card.className = 'card';

  const dt = document.createElement('dt');
  dt.textContent = title;

  const value = document.createElement('dd');
  value.className = 'card-value';
  value.textContent = `${formatNumber(c.remainingRoundedMm)}`;
  const unit = document.createElement('span');
  unit.className = 'unit-small';
  unit.textContent = 'mm（推定残量）';
  value.appendChild(unit);

  const sub = document.createElement('dd');
  sub.className = 'card-sub';
  sub.textContent = `現在 ${formatNumber(c.currentMm)} mm、タイヤ側面 ${formatSigned(c.sideChangeMm)} mm`
    + `（${describeSide(c.sideChangeMm)}）`;

  const level = document.createElement('dd');
  const badge = document.createElement('span');
  badge.className = `level level-${c.level}`;
  badge.textContent = c.label;
  level.appendChild(badge);

  card.append(dt, value, sub, level);
  return card;
}

function renderResult(r) {
  // 重要な結果（カード）
  setValueWithUnit('r-outer-edge', formatSigned(r.wheelOuterEdgeChangeMm), 'mm');
  setText('r-outer-edge-sub', describeOuterEdgeChange(r.wheelOuterEdgeChangeMm));
  setValueWithUnit('r-inner-edge', formatSigned(r.wheelInnerEdgeChangeMm), 'mm');
  setText('r-inner-edge-sub', describeInnerEdgeChange(r.wheelInnerEdgeChangeMm));
  setValueWithUnit('r-diameter-percent', formatSigned(r.tireDiameterChangePercent, 2), '%');
  setText(
    'r-diameter',
    `外径 ${formatNumber(r.current.tireDiameterMm)} → ${formatNumber(r.candidate.tireDiameterMm)} mm`
      + `（${formatSigned(r.tireDiameterChangeMm)}）`,
  );
  setValueWithUnit('r-ground-clearance', formatSigned(r.groundClearanceChangeMm), 'mm');

  // メーター（詳細）
  fillTable(
    'r-speedometer',
    r.speedometer.map((s) => [
      `${s.displayKmh} km/h`,
      `${formatNumber(s.actualKmh)} km/h`,
      `${formatSigned(s.actualKmh - s.displayKmh)} km/h`,
    ]),
  );

  // クリアランス（入力された項目だけ）
  const cards = [];
  if (r.clearance.outer) {
    cards.push(createClearanceCard('外側（タイヤ側面 → フェンダー等）', r.clearance.outer, describeOuterEdgeChange));
  }
  if (r.clearance.inner) {
    cards.push(createClearanceCard('内側（タイヤ側面 → 最寄り部品）', r.clearance.inner, describeInnerEdgeChange));
  }
  document.getElementById('r-clearance-section').hidden = cards.length === 0;
  document.getElementById('r-clearance').replaceChildren(...cards);

  // 計算に使った値（入力がどう解釈されたかの確認用）
  const cur = r.current;
  const cand = r.candidate;
  fillTable('r-details', [
    ['ホイール', `${cur.rimWidthJ}J ${formatOffset(cur.offsetMm)}`, `${cand.rimWidthJ}J ${formatOffset(cand.offsetMm)}`],
    ['リム幅', `${formatNumber(cur.rimWidthMm)} mm`, `${formatNumber(cand.rimWidthMm)} mm`],
    ['ホイール外側端（ハブ面から外側へ）', `${formatNumber(cur.edges.outer)} mm`, `${formatNumber(cand.edges.outer)} mm`],
    ['ホイール内側端（ハブ面から内側へ）', `${formatNumber(cur.edges.inner)} mm`, `${formatNumber(cand.edges.inner)} mm`],
    ['タイヤサイズ', cur.tire.normalized, cand.tire.normalized],
    ['タイヤ側面 外側（ハブ面から外側へ・理論値）', `${formatNumber(cur.tireSides.outer)} mm`, `${formatNumber(cand.tireSides.outer)} mm`],
    ['タイヤ側面 内側（ハブ面から内側へ・理論値）', `${formatNumber(cur.tireSides.inner)} mm`, `${formatNumber(cand.tireSides.inner)} mm`],
    ['タイヤ外径（理論値）', `${formatNumber(cur.tireDiameterMm)} mm`, `${formatNumber(cand.tireDiameterMm)} mm`],
  ]);
}

// ---------------------------------------------------------------
// 断面図
// ---------------------------------------------------------------

/** 図を描く。幅は表示枠の実際の幅に合わせる（文字が小さくなりすぎないように） */
function drawDiagram(result) {
  const width = diagramWrap.clientWidth || 640;
  const model = buildDiagramModel(result, { width });
  renderDiagram(diagramSvg, model);
  document.getElementById('diagram-scale-badge').textContent = SCALE_LABEL;
  setText(
    'diagram-scale-note',
    '縦横同じ縮尺（1:1）で、実際のプロポーションのまま表示しています（現在・交換候補とも同じ座標系）。'
      + '小さな差は形を誇張せず、寸法線・中心線・ET矢印・数値で示しています。',
  );
  document.getElementById('legend-fender').hidden = !result.clearance.outer;
  document.getElementById('legend-part').hidden = !result.clearance.inner;
}

// ---------------------------------------------------------------
// 入力が変わるたびに呼ばれる処理
// ---------------------------------------------------------------

function update() {
  const values = readInputs();
  updateStepButtons();
  showTireSummary(values);
  const outcome = compareWheels(values);

  showFieldErrors(outcome.ok ? null : outcome.errors);

  document.getElementById('results-error').hidden = outcome.ok;
  document.getElementById('results-body').hidden = !outcome.ok;
  document.getElementById('diagram-section').hidden = !outcome.ok;
  document.getElementById('details-section').hidden = !outcome.ok;

  if (outcome.ok) {
    lastResult = outcome.result;
    renderResult(outcome.result);
    drawDiagram(outcome.result);
  }
}

/** 入力範囲の説明文を calc.js の定数から作る（数値を二重管理しないため） */
function showInputRangeNote() {
  const { rimWidthJ, offsetMm, clearanceMm } = INPUT_LIMITS;
  const t = TIRE_INPUT_LIMITS;
  const tireRange = (l) => `${l.min}〜${l.max}${l.unit}（${l.step}${l.unit}刻み）`;
  setText(
    'input-range-note',
    `計算できる範囲: リム幅 ${formatRange(rimWidthJ, 'J')}（0.5J刻み）、`
      + `オフセット ${formatRange(offsetMm, 'mm')}（0.1mm単位）、`
      + `タイヤ幅 ${tireRange(t.width)}、扁平率 ${tireRange(t.aspect)}、リム径 ${tireRange(t.rimInch)}、`
      + `クリアランス ${formatRange(clearanceMm, 'mm')}（0.1mm単位）。`
      + 'この範囲は計算できる範囲であり、装着可能・安全・合法であることを意味しません。',
  );
}

// ---------------------------------------------------------------
// 選択式の欄（リム幅・タイヤ幅・扁平率・リム径）
// ---------------------------------------------------------------

/** select に選択肢を入れる（選択肢は selectOptions.js で calc.js の範囲から作る） */
function fillSelectOptions() {
  for (const select of form.querySelectorAll('select[data-field]')) {
    const options = SELECT_OPTIONS[select.dataset.field];
    if (!options) continue;
    select.replaceChildren(...options.map(({ value, label }) => new Option(label, value)));
  }
}

/** －／＋ ボタン: 選択肢を 1 つ前／後ろへ動かし、手で選んだときと同じ change イベントを出す */
function onStepButtonClick(event) {
  const button = event.target.closest('button[data-step-target]');
  if (!button) return;
  const select = document.getElementById(button.dataset.stepTarget);
  const next = stepOptionIndex(select.options.length, select.selectedIndex, Number(button.dataset.step));
  if (next === select.selectedIndex) return;
  select.selectedIndex = next;
  select.dispatchEvent(new Event('change', { bubbles: true })); // → update() で即時に再計算
}

/** 端の選択肢を選んでいるときは、それ以上進めないボタンを押せなくする */
function updateStepButtons() {
  for (const button of stepButtons) {
    const select = document.getElementById(button.dataset.stepTarget);
    const last = select.options.length - 1;
    button.disabled = Number(button.dataset.step) < 0
      ? select.selectedIndex <= 0
      : select.selectedIndex >= last;
  }
}

/** 選んだタイヤサイズを「205/50R17」の形で表示する（確認用） */
function showTireSummary(values) {
  for (const group of ['current', 'candidate']) {
    const v = values[group];
    setText(`${group}-tire-summary`, `${v.tireWidth}/${v.tireAspect}R${v.tireRimInch}`);
  }
}

// "input" イベントは 1文字入力するたびに発生する → 即時に再計算
// （符号のラジオボタンも切り替えた時点で input / change が発生する）
form.addEventListener('input', update);
form.addEventListener('change', update);
// Enter キーでページが再読み込みされないようにする
form.addEventListener('submit', (event) => event.preventDefault());
form.addEventListener('click', onStepButtonClick);
// 画面幅が変わったら図だけ描き直す
window.addEventListener('resize', () => {
  if (lastResult && !document.getElementById('diagram-section').hidden) drawDiagram(lastResult);
});

/** PC など広い画面では「詳細」を最初から開いておく（スマホでは閉じて情報量を減らす） */
function openDetailsOnWideScreen() {
  if (window.matchMedia('(min-width: 960px)').matches) {
    for (const d of document.querySelectorAll('details[data-open-on-wide]')) d.open = true;
  }
}

/**
 * 初期値を calc.js の DEFAULT_INPUTS から入れる（HTML の value と二重管理しないため）。
 * 符号はラジオボタンの checked、それ以外は value に入れる
 * （select は同じ value の選択肢が選ばれる。例: リム幅 7 → 「7.0」）。
 */
function applyDefaults() {
  for (const input of inputs) {
    const value = DEFAULT_INPUTS[input.dataset.group]?.[input.dataset.field];
    if (value === undefined) continue;
    if (input.type === 'radio') input.checked = input.value === value;
    else input.value = String(value);
  }
}

fillSelectOptions();
applyDefaults();
showInputRangeNote();
openDetailsOnWideScreen();
update();
