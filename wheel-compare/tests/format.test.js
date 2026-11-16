import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  roundTo,
  formatNumber,
  formatSigned,
  describeOuterEdgeChange,
  describeInnerEdgeChange,
  formatOffset,
  formatRange,
} from '../js/format.js';

describe('roundTo', () => {
  test('5.95 → 6.0（小数誤差があっても四捨五入）', () => {
    assert.equal(roundTo(5.95, 1), 6);
    assert.equal(roundTo((637.2 - 625.3) / 2, 1), 6);
  });
  test('負の値も絶対値で四捨五入: -5.95 → -6.0', () => {
    assert.equal(roundTo(-5.95, 1), -6);
  });
  test('-0 にならない', () => {
    assert.ok(Object.is(roundTo(-0.01, 1), 0));
  });
});

describe('formatNumber / formatSigned', () => {
  test('formatNumber', () => {
    assert.equal(formatNumber(625.3), '625.3');
    assert.equal(formatNumber(101.9031, 1), '101.9');
    assert.equal(formatNumber(1.9031, 2), '1.90');
  });
  test('formatSigned', () => {
    assert.equal(formatSigned(15.7), '+15.7');
    assert.equal(formatSigned(-5.7), '-5.7');
    assert.equal(formatSigned(0), '±0.0');
    assert.equal(formatSigned(1e-12), '±0.0');
    assert.equal(formatSigned(-0.04), '±0.0');
    assert.equal(formatSigned(1.9031, 2), '+1.90');
  });
});

describe('変化の説明', () => {
  test('外側端', () => {
    assert.equal(describeOuterEdgeChange(15.7), '外側へ出る');
    assert.equal(describeOuterEdgeChange(-3), '内側へ引っ込む');
    assert.equal(describeOuterEdgeChange(0.01), '変化なし');
  });
  test('内側端', () => {
    assert.equal(describeInnerEdgeChange(9.7), '内側へ入る');
    assert.equal(describeInnerEdgeChange(-40), '外側へ離れる');
    assert.equal(describeInnerEdgeChange(0), '変化なし');
  });
});

describe('formatOffset', () => {
  test('符号付きで表示', () => {
    assert.equal(formatOffset(48), '+48');
    assert.equal(formatOffset(-10), '-10');
    assert.equal(formatOffset(0), '0');
    assert.equal(formatOffset(42.5), '+42.5');
  });
});

describe('formatRange', () => {
  test('最小値が負なら最大値に + を付ける', () => {
    assert.equal(formatRange({ min: -150, max: 150 }, 'mm'), '-150〜+150mm');
    assert.equal(formatRange({ min: -50, max: 300 }, 'mm'), '-50〜+300mm');
  });
  test('最小値が正なら + を付けない', () => {
    assert.equal(formatRange({ min: 2, max: 20 }, 'J'), '2〜20J');
  });
});
