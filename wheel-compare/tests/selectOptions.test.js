// 選択式（select）にした入力欄のテスト。
// 選択肢の範囲・刻み、初期値が選択肢に含まれること、＋／－ボタンの移動先、
// すべての選択肢が既存の入力チェックを通ること、index.html の欄の作りを確認する。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SELECT_OPTIONS,
  RIM_WIDTH_STEP_J,
  steppedValues,
  stepOptionIndex,
} from '../js/selectOptions.js';
import {
  INPUT_LIMITS,
  TIRE_INPUT_LIMITS,
  DEFAULT_INPUTS,
  validateWheelInput,
  validateTireFields,
  compareWheels,
} from '../js/calc.js';

const values = (field) => SELECT_OPTIONS[field].map((o) => Number(o.value));
const SELECT_FIELDS = ['rimWidthJ', 'tireWidth', 'tireAspect', 'tireRimInch'];

// ---------------------------------------------------------------
describe('選択肢の範囲と刻み', () => {
  test('steppedValues: 小数の刻みでも誤差なく並ぶ', () => {
    assert.deepEqual(steppedValues(2, 4, 0.5), [2, 2.5, 3, 3.5, 4]);
    assert.deepEqual(steppedValues(105, 135, 10), [105, 115, 125, 135]);
  });

  test('リム幅: 2.0〜20.0J、0.5J 刻み（37 個）、表示は小数 1 桁', () => {
    const v = values('rimWidthJ');
    assert.equal(RIM_WIDTH_STEP_J, 0.5);
    assert.equal(v.length, 37);
    assert.equal(v[0], 2);
    assert.equal(v.at(-1), 20);
    for (let i = 1; i < v.length; i++) assert.equal(v[i] - v[i - 1], 0.5);
    const labels = SELECT_OPTIONS.rimWidthJ.map((o) => o.label);
    assert.equal(labels[0], '2.0');
    assert.ok(labels.includes('7.0') && labels.includes('7.5'));
    assert.equal(labels.at(-1), '20.0');
    // 計算に渡す値は "7" / "7.5" のような数値の文字列
    assert.ok(SELECT_OPTIONS.rimWidthJ.some((o) => o.value === '7'));
    assert.ok(SELECT_OPTIONS.rimWidthJ.some((o) => o.value === '7.5'));
  });

  test('タイヤ幅: 105, 115, …, 405mm（表記サイズ、31 個）', () => {
    const v = values('tireWidth');
    assert.equal(v.length, 31);
    assert.equal(v[0], 105);
    assert.equal(v.at(-1), 405);
    for (const w of v) assert.equal(w % 10, 5, `${w}`);
    for (const w of [155, 165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315, 325]) {
      assert.ok(v.includes(w), `${w}`);
    }
  });

  test('扁平率: 5〜90%、5% 刻み（18 個）', () => {
    assert.deepEqual(values('tireAspect'), steppedValues(5, 90, 5));
    assert.equal(values('tireAspect').length, 18);
  });

  test('リム径: 7〜35 インチ、1 インチ刻み（29 個）', () => {
    assert.deepEqual(values('tireRimInch'), steppedValues(7, 35, 1));
    assert.equal(values('tireRimInch').length, 29);
  });

  test('選択肢の範囲は calc.js の入力範囲と一致する', () => {
    assert.equal(values('rimWidthJ')[0], INPUT_LIMITS.rimWidthJ.min);
    assert.equal(values('rimWidthJ').at(-1), INPUT_LIMITS.rimWidthJ.max);
    for (const [field, key] of [['tireWidth', 'width'], ['tireAspect', 'aspect'], ['tireRimInch', 'rimInch']]) {
      const lim = TIRE_INPUT_LIMITS[key];
      assert.equal(values(field)[0], lim.min, field);
      assert.equal(values(field).at(-1), lim.max, field);
    }
  });

  test('選択肢に重複がない', () => {
    for (const field of SELECT_FIELDS) {
      const v = SELECT_OPTIONS[field].map((o) => o.value);
      assert.equal(new Set(v).size, v.length, field);
    }
  });
});

// ---------------------------------------------------------------
describe('初期値', () => {
  test('現在・交換候補の初期値が、どの select にも選択肢として含まれる', () => {
    for (const group of ['current', 'candidate']) {
      for (const field of SELECT_FIELDS) {
        const value = String(DEFAULT_INPUTS[group][field]);
        assert.ok(SELECT_OPTIONS[field].some((o) => o.value === value), `${group}.${field} = ${value}`);
      }
    }
  });

  test('初期値: 現在 7.0J・交換候補 8.0J、タイヤは両方 205/50R17', () => {
    const label = (field, value) => SELECT_OPTIONS[field].find((o) => o.value === String(value)).label;
    assert.equal(label('rimWidthJ', DEFAULT_INPUTS.current.rimWidthJ), '7.0');
    assert.equal(label('rimWidthJ', DEFAULT_INPUTS.candidate.rimWidthJ), '8.0');
    for (const group of ['current', 'candidate']) {
      const d = DEFAULT_INPUTS[group];
      assert.deepEqual([d.tireWidth, d.tireAspect, d.tireRimInch], [205, 50, 17]);
    }
  });
});

// ---------------------------------------------------------------
describe('－／＋ ボタンの移動先（stepOptionIndex）', () => {
  test('1 つ前・1 つ後ろへ動く', () => {
    assert.equal(stepOptionIndex(37, 10, -1), 9);
    assert.equal(stepOptionIndex(37, 10, 1), 11);
  });

  test('端では止まる（一周しない）', () => {
    assert.equal(stepOptionIndex(37, 0, -1), 0);
    assert.equal(stepOptionIndex(37, 36, 1), 36);
  });

  test('未選択（-1）なら、－ は先頭・＋ は末尾', () => {
    assert.equal(stepOptionIndex(5, -1, -1), 0);
    assert.equal(stepOptionIndex(5, -1, 1), 4);
  });

  test('選択肢がなければ -1', () => {
    assert.equal(stepOptionIndex(0, 0, 1), -1);
  });

  test('リム幅 7.0J で ＋ を押すと 7.5J、－ を押すと 6.5J', () => {
    const opts = SELECT_OPTIONS.rimWidthJ;
    const i = opts.findIndex((o) => o.value === '7');
    assert.equal(opts[stepOptionIndex(opts.length, i, 1)].value, '7.5');
    assert.equal(opts[stepOptionIndex(opts.length, i, -1)].value, '6.5');
  });

  test('タイヤ幅 205 で ＋ を押すと 215、扁平率 50 で － を押すと 45', () => {
    const w = SELECT_OPTIONS.tireWidth;
    assert.equal(w[stepOptionIndex(w.length, w.findIndex((o) => o.value === '205'), 1)].value, '215');
    const a = SELECT_OPTIONS.tireAspect;
    assert.equal(a[stepOptionIndex(a.length, a.findIndex((o) => o.value === '50'), -1)].value, '45');
  });
});

// ---------------------------------------------------------------
describe('select の値で既存の計算がそのまま動く', () => {
  const BASE = { offsetSign: '+', offsetAbs: '48', tireWidth: '205', tireAspect: '50', tireRimInch: '17' };

  test('すべてのリム幅の選択肢が入力チェックを通る', () => {
    for (const { value } of SELECT_OPTIONS.rimWidthJ) {
      const r = validateWheelInput({ ...BASE, rimWidthJ: value });
      assert.equal(r.ok, true, value);
      assert.equal(r.value.rimWidthJ, Number(value));
    }
  });

  test('すべてのタイヤ幅・扁平率・リム径の選択肢が入力チェックを通る', () => {
    for (const field of ['tireWidth', 'tireAspect', 'tireRimInch']) {
      for (const { value } of SELECT_OPTIONS[field]) {
        const r = validateTireFields({ tireWidth: '205', tireAspect: '50', tireRimInch: '17', [field]: value });
        assert.equal(r.ok, true, `${field}=${value}`);
      }
    }
  });

  test('select の文字列の値でも、数値で渡したときと同じ結果になる', () => {
    const fromSelect = compareWheels({
      current: { ...BASE, rimWidthJ: '7', tireWidth: '215', tireAspect: '45', tireRimInch: '17' },
      candidate: { ...BASE, rimWidthJ: '8.5', offsetAbs: '45', tireWidth: '225', tireAspect: '40', tireRimInch: '18' },
    });
    const fromNumber = compareWheels({
      current: { ...BASE, rimWidthJ: 7, tireWidth: 215, tireAspect: 45, tireRimInch: 17 },
      candidate: { ...BASE, rimWidthJ: 8.5, offsetAbs: 45, tireWidth: 225, tireAspect: 40, tireRimInch: 18 },
    });
    assert.equal(fromSelect.ok, true);
    assert.deepEqual(fromSelect.result, fromNumber.result);
  });
});

// ---------------------------------------------------------------
describe('index.html の入力欄', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  test('リム幅・タイヤ幅・扁平率・リム径は、現在・交換候補とも select', () => {
    for (const group of ['current', 'candidate']) {
      for (const field of SELECT_FIELDS) {
        const re = new RegExp(`<select id="${group}-${field}" data-group="${group}" data-field="${field}"`);
        assert.match(html, re, `${group}-${field}`);
        assert.doesNotMatch(html, new RegExp(`<input id="${group}-${field}"`), `${group}-${field}`);
      }
    }
  });

  test('各 select に －／＋ ボタンが 1 つずつあり、type="button"（フォーム送信しない）', () => {
    for (const group of ['current', 'candidate']) {
      for (const field of SELECT_FIELDS) {
        const id = `${group}-${field}`;
        for (const step of ['-1', '1']) {
          const re = new RegExp(`<button type="button" class="step-btn" data-step-target="${id}" data-step="${step}" aria-label="[^"]+">`, 'g');
          assert.equal(html.match(re)?.length, 1, `${id} ${step}`);
        }
      }
    }
  });

  test('オフセットとクリアランスは数値の直接入力 ＋ 符号（＋／－）のまま', () => {
    for (const id of ['current-offsetAbs', 'candidate-offsetAbs', 'clearance-outerAbs', 'clearance-innerAbs']) {
      assert.match(html, new RegExp(`<input id="${id}"[^>]*\\s+type="text"`), id);
    }
    for (const name of ['current-offsetSign', 'candidate-offsetSign', 'clearance-outerSign', 'clearance-innerSign']) {
      assert.equal(html.match(new RegExp(`type="radio" id="${name}-(plus|minus)"`, 'g'))?.length, 2, name);
    }
  });

  test('すべての select にラベルとエラー表示欄がある', () => {
    for (const group of ['current', 'candidate']) {
      for (const field of SELECT_FIELDS) {
        const id = `${group}-${field}`;
        assert.match(html, new RegExp(`<label class="visually-hidden" for="${id}">`), id);
        assert.match(html, new RegExp(`<p class="error" id="${id}-error"></p>`), id);
      }
    }
  });
});
