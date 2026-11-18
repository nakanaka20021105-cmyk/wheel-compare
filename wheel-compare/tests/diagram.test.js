import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareWheels } from '../js/calc.js';
import { formatOffset } from '../js/format.js';
import {
  buildDiagramModel, estimateTextWidth, placeText, LAYOUT, MAX_DRAW_HEIGHT,
  TIRE_WIDTH_NOTE, SCALE_LABEL, formatRimWidthLabel, formatEtLabel,
} from '../js/diagram.js';

/** compareWheels の結果を取り出す（失敗したらテストを止める） */
function resultOf(input) {
  const r = compareWheels(input);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  return r.result;
}

const CASES = {
  '同一サイズ': {
    current: { rimWidthJ: 7, offsetMm: 48, tireSize: '215/45R17' },
    candidate: { rimWidthJ: 7, offsetMm: 48, tireSize: '215/45R17' },
  },
  '7J +48 → 8J +45': {
    current: { rimWidthJ: 7, offsetMm: 48, tireSize: '215/45R17' },
    candidate: { rimWidthJ: 8, offsetMm: 45, tireSize: '225/40R18' },
    clearance: { outerMm: 20, innerMm: 15 },
  },
  '負オフセット 9J -10 → 10J -20': {
    current: { rimWidthJ: 9, offsetMm: -10, tireSize: '245/40R18' },
    candidate: { rimWidthJ: 10, offsetMm: -20, tireSize: '255/35R18' },
    clearance: { outerMm: 5 },
  },
  '極端: 2J +150 → 20J -150（最大クリアランス）': {
    current: { rimWidthJ: 2, offsetMm: 150, tireSize: '135/80R13' },
    candidate: { rimWidthJ: 20, offsetMm: -150, tireSize: '355/25R24' },
    clearance: { outerMm: 300, innerMm: 300 },
  },
  '極端: 20J -150 → 2J +150（最小クリアランス）': {
    current: { rimWidthJ: 20, offsetMm: -150, tireSize: '355/90R24' },
    candidate: { rimWidthJ: 2, offsetMm: 150, tireSize: '125/20R10' },
    clearance: { outerMm: -50, innerMm: -50 },
  },
  '極端: 20J +150 → 20J -150': {
    current: { rimWidthJ: 20, offsetMm: 150, tireSize: '355/25R24' },
    candidate: { rimWidthJ: 20, offsetMm: -150, tireSize: '355/25R24' },
    clearance: { outerMm: 0, innerMm: 0 },
  },
};

const WIDTHS = [200, 320, 375, 640, 760, 1600];

describe('buildDiagramModel: はみ出しがない', () => {
  for (const [name, input] of Object.entries(CASES)) {
    for (const width of WIDTHS) {
      test(`${name} / 幅 ${width}px`, () => {
        const m = buildDiagramModel(resultOf(input), { width });
        const eps = 0.01;
        assert.ok(m.width >= LAYOUT.minWidth && m.width <= LAYOUT.maxWidth);

        for (const s of m.shapes) {
          if (s.type === 'rect' || s.type === 'path') {
            assert.ok(s.x >= -eps && s.x + s.width <= m.width + eps, `${s.type} x: ${s.className}`);
            assert.ok(s.y >= -eps && s.y + s.height <= m.height + eps, `${s.type} y: ${s.className}`);
            if (s.type === 'path') {
              assert.ok(!/NaN|Infinity/.test(s.d), `path d: ${s.className}`);
              // path の座標がすべて枠内にある（ベジェの制御点は膨らみ判定用なので除く）
              const nums = [...s.d.matchAll(/([MLZ])\s*(-?[\d.]+)?\s*(-?[\d.]+)?/g)]
                .filter((mm) => mm[1] !== 'Z').map((mm) => [Number(mm[2]), Number(mm[3])]);
              for (const [x, y] of nums) {
                assert.ok(x >= s.x - 0.1 && x <= s.x + s.width + 0.1, `path pt x: ${s.className}`);
                assert.ok(y >= s.y - 0.1 && y <= s.y + s.height + 0.1, `path pt y: ${s.className}`);
              }
            }
          } else if (s.type === 'line') {
            for (const x of [s.x1, s.x2]) assert.ok(x >= -eps && x <= m.width + eps, `line x: ${s.className}`);
            for (const y of [s.y1, s.y2]) assert.ok(y >= -eps && y <= m.height + eps, `line y: ${s.className}`);
          } else if (s.type === 'text') {
            const w = estimateTextWidth(s.text);
            assert.ok(s.x >= LAYOUT.padding - eps, `text left: ${s.text}`);
            assert.ok(s.x + w <= m.width - LAYOUT.padding + eps, `text right: ${s.text}`);
            // y は文字のベースライン。上に fontSize 分、下に少し余裕があること
            assert.ok(s.y - LAYOUT.fontSize >= 0 && s.y + 4 <= m.height, `text y: ${s.text}`);
          }
        }
      });
    }
  }
});

describe('buildDiagramModel: 同一座標系・同一縮尺', () => {
  test('リム幅とタイヤ外径の px が、現在・候補で共通の縮尺で mm に比例する', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const m = buildDiagramModel(r, { width: 640 });
    const find = (cls) => m.shapes.find((s) => s.className === cls);
    const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
    for (const [key, w] of [['current', r.current], ['candidate', r.candidate]]) {
      // ホイール（リム）の輪郭: 幅 = リム幅、高さ = リム径
      const rim = find(`d-${key}-outline`);
      close(rim.width, w.rimWidthMm * m.scaleX);
      close(rim.height, w.rimDiameterMm * m.scaleY);
      // タイヤ（模式）: 高さ = タイヤ外径
      const tire = find(`d-${key}-tire`);
      close(tire.height, w.tireDiameterMm * m.scaleY);
    }
  });

  test('ハブ取付面からの外側端（左）・内側端（右）の位置が計算結果と一致する', () => {
    const r = resultOf(CASES['負オフセット 9J -10 → 10J -20']);
    const m = buildDiagramModel(r, { width: 640 });
    const hub = m.shapes.find((s) => s.className === 'd-hub');
    for (const [key, w] of [['current', r.current], ['candidate', r.candidate]]) {
      const o = m.shapes.find((s) => s.className === `d-${key}-outline`);
      // 左 = 車体外側、右 = 車体内側
      assert.ok(Math.abs((hub.x1 - o.x) - w.edges.outer * m.scaleX) < 1e-6);
      assert.ok(Math.abs((o.x + o.width - hub.x1) - w.edges.inner * m.scaleX) < 1e-6);
    }
  });

  test('外側端・内側端の寸法線: 外側端は左、内側端は右にある', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const m = buildDiagramModel(r, { width: 640 });
    const hub = m.shapes.find((s) => s.className === 'd-hub').x1;
    const dims = m.shapes.filter((s) => s.className === 'd-dim' && s.y1 === s.y2);
    const outer = dims.find((s) => s.y1 === LAYOUT.outerDimY);
    const inner = dims.find((s) => s.y1 === LAYOUT.innerDimY);
    // 交換候補の外側端は 15.7mm 外側（= 左）へ出る
    assert.ok(Math.max(outer.x1, outer.x2) < hub);
    assert.ok(Math.abs((outer.x1 - outer.x2) - r.wheelOuterEdgeChangeMm * m.scaleX) < 1e-6);
    // 交換候補の内側端は 9.7mm 内側（= 右）へ入る
    assert.ok(Math.min(inner.x1, inner.x2) > hub);
    assert.ok(Math.abs((inner.x2 - inner.x1) - r.wheelInnerEdgeChangeMm * m.scaleX) < 1e-6);
  });

  test('寸法線はリムの端が基準で、タイヤの膨らみ（模式）は使わない', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const m = buildDiagramModel(r, { width: 640 });
    const outline = (key) => m.shapes.find((s) => s.className === `d-${key}-outline`);
    const tire = (key) => m.shapes.find((s) => s.className === `d-${key}-tire`);
    const dimXs = new Set(m.shapes.filter((s) => s.className === 'd-dim').flatMap((s) => [s.x1.toFixed(6), s.x2.toFixed(6)]));
    for (const key of ['current', 'candidate']) {
      const o = outline(key);
      assert.ok(dimXs.has(o.x.toFixed(6)), `inner edge: ${key}`);
      assert.ok(dimXs.has((o.x + o.width).toFixed(6)), `outer edge: ${key}`);
      // タイヤ（公称 215 / 225mm）はリム（7J = 177.8 / 8J = 203.2mm）より広いが、その端は寸法線に使われない
      const t = tire(key);
      assert.ok(t.width > o.width);
      assert.equal(dimXs.has(t.x.toFixed(6)), false);
      assert.equal(dimXs.has((t.x + t.width).toFixed(6)), false);
    }
  });

  test('タイヤ・リムを path で描き、ディスク（ブレーキに見える板）は描かない', () => {
    const m = buildDiagramModel(resultOf(CASES['7J +48 → 8J +45']));
    for (const key of ['current', 'candidate']) {
      for (const part of ['tire', 'rim', 'outline']) {
        const s = m.shapes.find((x) => x.className === `d-${key}-${part}`);
        assert.equal(s?.type, 'path', `${key}-${part}`);
      }
      assert.equal(m.shapes.some((x) => x.className === `d-${key}-disc`), false);
    }
  });

  test('タイヤの最大幅 = 公称タイヤ幅、中心 = リム中心線（すべてのケース・幅）', () => {
    for (const input of Object.values(CASES)) {
      for (const width of WIDTHS) {
        const r = resultOf(input);
        const m = buildDiagramModel(r, { width });
        const hub = m.shapes.find((s) => s.className === 'd-hub').x1;
        for (const [key, w] of [['current', r.current], ['candidate', r.candidate]]) {
          const o = m.shapes.find((s) => s.className === `d-${key}-outline`);
          const t = m.shapes.find((s) => s.className === `d-${key}-tire`);
          // タイヤ側面（理論値）の位置: 外側 = 左、内側 = 右
          const sideL = hub - w.tireSides.outer * m.scaleX;
          const sideR = hub + w.tireSides.inner * m.scaleX;
          assert.ok(Math.abs((sideR - sideL) - w.tire.width * m.scaleX) < 1e-9);
          // タイヤ中心とリム中心が一致（左右対称）
          assert.ok(Math.abs((sideL + sideR) / 2 - (o.x + o.width / 2)) < 1e-9);
          // 最大幅の点（ベジェの終点）が、タイヤ側面の位置にある（左右・上下とも）
          const ends = [...t.d.matchAll(/C(?:\s*-?[\d.]+\s+-?[\d.]+){2}\s*(-?[\d.]+)\s+(-?[\d.]+)/g)].map((mm) => Number(mm[1]));
          assert.equal(ends.filter((x) => Math.abs(x - sideL) <= 0.051).length, 2, `${key} left w${width}`);
          assert.equal(ends.filter((x) => Math.abs(x - sideR) <= 0.051).length, 2, `${key} right w${width}`);
          // 枠: 公称幅の範囲（リムより狭いときはリムの範囲まで）
          assert.ok(Math.abs(t.x - Math.min(sideL, o.x)) < 1e-9);
          assert.ok(Math.abs(t.x + t.width - Math.max(sideR, o.x + o.width)) < 1e-9);
        }
      }
    }
  });

  test('タイヤがリムより狭い（引っ張り）ときは、最大幅がリムより内側になる', () => {
    // 165mm のタイヤを 10J（254mm）に: 片側 44.5mm 内側
    const r = resultOf({
      current: { rimWidthJ: 10, offsetMm: 30, tireSize: '165/55R15' },
      candidate: { rimWidthJ: 10, offsetMm: 30, tireSize: '165/55R15' },
    });
    const m = buildDiagramModel(r, { width: 640 });
    const o = m.shapes.find((s) => s.className === 'd-current-outline');
    const hub = m.shapes.find((s) => s.className === 'd-hub').x1;
    const sideL = hub - r.current.tireSides.outer * m.scaleX;
    assert.ok(sideL > o.x);
    assert.ok(Math.abs((sideL - o.x) - 44.5 * m.scaleX) < 1e-6); // (254 − 165) / 2
  });

  test('フェンダー等・最寄り部品の線とタイヤ側面の間隔 = 入力したクリアランス', () => {
    const r = resultOf({ ...CASES['7J +48 → 8J +45'], clearance: { outerMm: 20, innerMm: 15 } });
    const m = buildDiagramModel(r, { width: 640 });
    const hub = m.shapes.find((s) => s.className === 'd-hub').x1;
    const fender = m.shapes.find((s) => s.className === 'd-fender').x1;
    const part = m.shapes.find((s) => s.className === 'd-part').x1;
    const curL = hub - r.current.tireSides.outer * m.scaleX;
    const curR = hub + r.current.tireSides.inner * m.scaleX;
    assert.ok(Math.abs((curL - fender) - 20 * m.scaleX) < 1e-9);
    assert.ok(Math.abs((part - curR) - 15 * m.scaleX) < 1e-9);
  });

  test('ハブ取付面は図の左右中央（すべてのケース・幅）', () => {
    for (const input of Object.values(CASES)) {
      for (const width of WIDTHS) {
        const m = buildDiagramModel(resultOf(input), { width });
        const hub = m.shapes.find((s) => s.className === 'd-hub');
        assert.ok(Math.abs(hub.x1 - m.width / 2) < 1e-9);
        assert.equal(hub.x1, hub.x2);
      }
    }
  });

  test('ハブ取付面の線は上下のリムの内側に収まる（タイヤ・リム・地面を貫通しない）', () => {
    for (const input of Object.values(CASES)) {
      for (const width of WIDTHS) {
        const m = buildDiagramModel(resultOf(input), { width });
        const hub = m.shapes.find((s) => s.className === 'd-hub');
        const top = Math.min(hub.y1, hub.y2);
        const bottom = Math.max(hub.y1, hub.y2);
        assert.ok(bottom > top);
        // リム（輪郭の枠）の上端・下端より内側。フランジとウェルの厚みぶん、さらに内側にある。
        // 2 本のリムが縦に重ならない極端な入力では、現在のホイールの内側に収める。
        const box = (key) => m.shapes.find((s) => s.className === `d-${key}-outline`);
        const cur = box('current');
        const cand = box('candidate');
        const overlap = Math.min(cur.y + cur.height, cand.y + cand.height) - Math.max(cur.y, cand.y);
        const keys = overlap > cur.height * 0.5 ? ['current', 'candidate'] : ['current'];
        for (const key of keys) {
          const o = box(key);
          assert.ok(top > o.y && bottom < o.y + o.height, `${key} w${width}`);
        }
        // タイヤの上端より上・地面より下にも、同じ横位置で短くはみ出す（タイヤ・地面とは交わらない）
        const ext = m.shapes.filter((s) => s.className === 'd-hub-ext');
        const ground = m.shapes.find((s) => s.className === 'd-ground').y1;
        const tireTop = Math.min(...['current', 'candidate'].map((k) => m.shapes.find((s) => s.className === `d-${k}-tire`).y));
        assert.equal(ext.length, 2);
        for (const e of ext) assert.equal(e.x1, hub.x1);
        const [above, below] = [...ext].sort((a, b) => a.y1 - b.y1);
        assert.ok(Math.max(above.y1, above.y2) < tireTop);
        assert.ok(Math.min(below.y1, below.y2) > ground);
      }
    }
  });

  test('タイヤの輪郭はベジェ曲線で、折れ線の頂点（Q の肩・尖った最大幅）を使わない', () => {
    const m = buildDiagramModel(resultOf(CASES['7J +48 → 8J +45']));
    for (const key of ['current', 'candidate']) {
      const t = m.shapes.find((s) => s.className === `d-${key}-tire`);
      assert.equal(/Q/.test(t.d), false);
      // 片側 2 本 × 左右 × 上下 = 8 本の 3 次ベジェ
      assert.equal((t.d.match(/C/g) || []).length, 8);
    }
  });

  test('縦横同一縮尺 1:1（すべてのケース・幅）', () => {
    for (const input of Object.values(CASES)) {
      for (const width of WIDTHS) {
        const r = resultOf(input);
        const m = buildDiagramModel(r, { width });
        assert.equal(m.scaleX, m.scaleY);
        assert.equal(m.scale, m.scaleX);
        // 1mm が縦横で同じ長さ: リムの輪郭の幅/高さの比 = リム幅/リム径
        const o = m.shapes.find((s) => s.className === 'd-current-outline');
        assert.ok(Math.abs(o.width / o.height - r.current.rimWidthMm / r.current.rimDiameterMm) < 1e-9);
        // タイヤ外径は MAX_DRAW_HEIGHT 以下の高さで描く
        const t = m.shapes.find((s) => s.className === 'd-current-tire');
        const limit = m.width < 520 ? MAX_DRAW_HEIGHT.narrow : MAX_DRAW_HEIGHT.wide;
        assert.ok(t.height <= limit + 1e-9);
      }
    }
  });

  test('横幅に余裕があれば、縦横同じ倍率のまま図を大きくする（PC 幅はスマホ幅より大きい縮尺）', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const pc = buildDiagramModel(r, { width: 760 });
    const sp = buildDiagramModel(r, { width: 340 });
    assert.ok(pc.scale > sp.scale);
    // PC 幅ではタイヤ外径が描画高さの上限いっぱいになる
    const t = pc.shapes.find((s) => s.className === 'd-candidate-tire');
    assert.ok(Math.abs(t.height - MAX_DRAW_HEIGHT.wide) < 1e-9);
  });

  test('2本とも地面（タイヤ下端）がそろっている', () => {
    const m = buildDiagramModel(resultOf(CASES['7J +48 → 8J +45']), { width: 640 });
    const ground = m.shapes.find((s) => s.className === 'd-ground');
    for (const cls of ['d-current-tire', 'd-candidate-tire']) {
      const o = m.shapes.find((s) => s.className === cls);
      assert.ok(Math.abs(o.y + o.height - ground.y1) < 1e-6);
    }
  });
});

describe('buildDiagramModel: 表示内容', () => {
  const textsOf = (m) => m.shapes.filter((s) => s.type === 'text').map((s) => s.text);

  test('方向・ハブ取付面・寸法のラベル（7J +48 → 8J +45）', () => {
    const texts = textsOf(buildDiagramModel(resultOf(CASES['7J +48 → 8J +45'])));
    assert.ok(texts.includes('← 車体外側'));
    assert.ok(texts.includes('車体内側 →'));
    assert.ok(texts.includes('ハブ取付面（0mm）'));
    assert.ok(texts.includes('外側端 +15.7mm（外側へ出る）'));
    assert.ok(texts.includes('内側端 +9.7mm（内側へ入る）'));
  });

  test('同一サイズでは ±0.0mm（変化なし）', () => {
    const texts = textsOf(buildDiagramModel(resultOf(CASES['同一サイズ'])));
    assert.ok(texts.includes('外側端 ±0.0mm（変化なし）'));
    assert.ok(texts.includes('内側端 ±0.0mm（変化なし）'));
  });

  test('クリアランス入力があるときだけフェンダー等・最寄り部品を描く', () => {
    const none = buildDiagramModel(resultOf(CASES['同一サイズ']));
    assert.equal(none.shapes.some((s) => s.className === 'd-fender'), false);
    assert.equal(none.shapes.some((s) => s.className === 'd-part'), false);

    const both = buildDiagramModel(resultOf(CASES['7J +48 → 8J +45']));
    assert.equal(both.shapes.filter((s) => s.className === 'd-fender').length, 1);
    assert.equal(both.shapes.filter((s) => s.className === 'd-part').length, 1);

    const outerOnly = buildDiagramModel(resultOf(CASES['負オフセット 9J -10 → 10J -20']));
    assert.equal(outerOnly.shapes.some((s) => s.className === 'd-fender'), true);
    assert.equal(outerOnly.shapes.some((s) => s.className === 'd-part'), false);
  });

  test('フェンダー等は左（ハブ面 − positionMm × 縮尺）、最寄り部品は右', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const m = buildDiagramModel(r);
    const hub = m.shapes.find((s) => s.className === 'd-hub');
    const fender = m.shapes.find((s) => s.className === 'd-fender');
    const part = m.shapes.find((s) => s.className === 'd-part');
    assert.ok(Math.abs(hub.x1 - fender.x1 - r.clearance.outer.positionMm * m.scaleX) < 1e-6);
    assert.ok(Math.abs(part.x1 - hub.x1 - r.clearance.inner.positionMm * m.scaleX) < 1e-6);
    // ラベルも線と同じ側（フェンダー等は左半分、最寄り部品は右半分。図の端では内側へずれることがある）
    const fl = m.shapes.find((s) => s.text === 'フェンダー等');
    const pl = m.shapes.find((s) => s.text === '最寄り部品');
    assert.ok(fl.x + estimateTextWidth(fl.text) <= hub.x1);
    assert.ok(pl.x >= hub.x1);
  });
});

describe('buildDiagramModel: リム幅・リム中心線・ET', () => {
  const find = (m, cls) => m.shapes.filter((s) => s.className === cls);
  const hubX = (m) => m.shapes.find((s) => s.className === 'd-hub').x1;

  test('リム幅の寸法線: 長さ = リム幅 × 縮尺、両端 = リムの端', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const m = buildDiagramModel(r, { width: 640 });
    for (const [key, w] of [['current', r.current], ['candidate', r.candidate]]) {
      const [dim] = find(m, `d-${key}-dim d-rimw`);
      const o = m.shapes.find((s) => s.className === `d-${key}-outline`);
      assert.ok(Math.abs(Math.abs(dim.x2 - dim.x1) - w.rimWidthMm * m.scaleX) < 1e-6);
      assert.ok(Math.abs(Math.min(dim.x1, dim.x2) - o.x) < 1e-6);
    }
    const texts = m.shapes.filter((s) => s.type === 'text').map((s) => s.text);
    assert.ok(texts.includes('現在 7J = 177.8 mm'));
    assert.ok(texts.includes('交換 8J = 203.2 mm'));
  });

  test('リム中心線: ハブ面から -ET の位置、リムの中央', () => {
    for (const input of Object.values(CASES)) {
      const r = resultOf(input);
      const m = buildDiagramModel(r, { width: 640 });
      for (const [key, w] of [['current', r.current], ['candidate', r.candidate]]) {
        const [c] = find(m, `d-${key}-center`);
        const o = m.shapes.find((s) => s.className === `d-${key}-outline`);
        // ET がプラスなら中心線はハブ面より車体内側（右）
        assert.ok(Math.abs(c.x1 - (hubX(m) + w.offsetMm * m.scaleX)) < 1e-6);
        assert.ok(Math.abs(c.x1 - (o.x + o.width / 2)) < 1e-6);
      }
    }
  });

  test('ET 寸法線: 中心線 → ハブ面。プラスは外側（左）向き、マイナスは内側（右）向き、0 は線なし', () => {
    const check = (input, key, expectedDir) => {
      const r = resultOf(input);
      const m = buildDiagramModel(r, { width: 640 });
      const w = r[key];
      const et = find(m, `d-${key}-dim d-et`);
      if (expectedDir === 0) {
        assert.equal(et.length, 0);
        return;
      }
      assert.equal(et.length, 1);
      const [s] = et;
      // 始点 = 中心線、終点 = ハブ面
      assert.ok(Math.abs(s.x1 - (hubX(m) + w.offsetMm * m.scaleX)) < 1e-6);
      assert.ok(Math.abs(s.x2 - hubX(m)) < 1e-6);
      assert.equal(Math.sign(s.x2 - s.x1), expectedDir);
      assert.ok(Math.abs(Math.abs(s.x2 - s.x1) - Math.abs(w.offsetMm) * m.scaleX) < 1e-6);
    };
    check(CASES['7J +48 → 8J +45'], 'candidate', -1);
    check(CASES['負オフセット 9J -10 → 10J -20'], 'current', 1);
    check({
      current: { rimWidthJ: 8, offsetMm: 0, tireSize: '225/40R18' },
      candidate: { rimWidthJ: 8, offsetMm: 0, tireSize: '225/40R18' },
    }, 'current', 0);
  });

  test('ラベルの書式', () => {
    assert.equal(formatRimWidthLabel('交換', 8, 203.2), '交換 8J = 203.2 mm');
    assert.equal(formatRimWidthLabel('現在', 7.5, 190.5), '現在 7.5J = 190.5 mm');
    assert.equal(formatEtLabel('交換', 45), '交換 ET +45 mm（ハブ面が中心より外側）');
    assert.equal(formatEtLabel('現在', -10), '現在 ET -10 mm（ハブ面が中心より内側）');
    assert.equal(formatEtLabel('現在', 0), '現在 ET 0 mm（中心線＝ハブ取付面）');
  });
});

describe('buildDiagramModel: 寸法ラベルの配置', () => {
  const textBox = (s) => ({ x1: s.x, x2: s.x + estimateTextWidth(s.text), y1: s.y - LAYOUT.fontSize, y2: s.y + 3 });
  const hit = (a, b) => a.x1 < b.x2 - 0.01 && b.x1 < a.x2 - 0.01 && a.y1 < b.y2 - 0.01 && b.y1 < a.y2 - 0.01;
  const EXTRA = {
    'ET +45 → ET 0': {
      current: { rimWidthJ: 8, offsetMm: 45, tireSize: '225/40R18' },
      candidate: { rimWidthJ: 8, offsetMm: 0, tireSize: '225/40R18' },
      clearance: { outerMm: 20, innerMm: 15 },
    },
    'ET +45 → ET -20': {
      current: { rimWidthJ: 8, offsetMm: 45, tireSize: '225/40R18' },
      candidate: { rimWidthJ: 9.5, offsetMm: -20, tireSize: '245/40R18' },
      clearance: { outerMm: 20, innerMm: 15 },
    },
  };
  const ALL = { ...CASES, ...EXTRA };

  test('文字同士が重ならず、タイヤ・リムの上にも文字を置かない（すべてのケース・幅）', () => {
    for (const [name, input] of Object.entries(ALL)) {
      for (const width of WIDTHS) {
        const m = buildDiagramModel(resultOf(input), { width });
        const texts = m.shapes.filter((s) => s.type === 'text');
        const boxes = m.shapes.filter((s) => s.type === 'path');
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            assert.equal(hit(textBox(texts[i]), textBox(texts[j])), false,
              `${name} w${width}: "${texts[i].text}" と "${texts[j].text}"`);
          }
          for (const p of boxes) {
            const pb = { x1: p.x, x2: p.x + p.width, y1: p.y, y2: p.y + p.height };
            assert.equal(hit(textBox(texts[i]), pb), false, `${name} w${width}: "${texts[i].text}" が ${p.className} に重なる`);
          }
        }
      }
    }
  });

  test('リム幅・ET のラベルを必ず描く（横に置くか、図の下に一覧で置く）', () => {
    for (const input of Object.values(ALL)) {
      for (const width of WIDTHS) {
        const r = resultOf(input);
        const m = buildDiagramModel(r, { width });
        const texts = m.shapes.filter((s) => s.type === 'text').map((s) => s.text).join('\n');
        assert.ok(texts.includes(formatRimWidthLabel('現在', r.current.rimWidthJ, r.current.rimWidthMm)));
        assert.ok(texts.includes(formatRimWidthLabel('交換', r.candidate.rimWidthJ, r.candidate.rimWidthMm)));
        assert.ok(texts.includes(`現在 ET ${formatOffset(r.current.offsetMm)} mm`));
        assert.ok(texts.includes(`交換 ET ${formatOffset(r.candidate.offsetMm)} mm`));
      }
    }
  });

  test('PC 幅では横の空きに、スマホ幅では図の下に一覧で置く（7J +48 → 8J +45）', () => {
    const r = resultOf(CASES['7J +48 → 8J +45']);
    const pc = buildDiagramModel(r, { width: 760 });
    assert.equal(pc.labelMode, 'side');
    // 横に置くときは、同じ高さの寸法線まで引出線を引く
    assert.equal(pc.shapes.filter((s) => /-leader$/.test(s.className)).length, 4);
    const sp = buildDiagramModel(r, { width: 340 });
    assert.equal(sp.labelMode, 'list');
    const ground = sp.shapes.find((s) => s.className === 'd-ground').y1;
    const et = sp.shapes.find((s) => s.type === 'text' && s.text.startsWith('交換 ET'));
    assert.ok(et.y > ground);
  });
});

describe('文字の配置', () => {
  test('estimateTextWidth: 半角は 0.62 文字、全角は 1 文字分', () => {
    assert.equal(estimateTextWidth('ab', 10), 12.4);
    assert.equal(estimateTextWidth('車体', 10), 20);
  });

  test('placeText: 右端からはみ出す文字は内側へずらす', () => {
    const w = estimateTextWidth('外側端 +15.7mm');
    const left = placeText('外側端 +15.7mm', 630, 'middle', 640);
    assert.ok(left + w <= 640 - LAYOUT.padding + 1e-9);
  });

  test('placeText: 左端からはみ出す文字は内側へずらす', () => {
    assert.equal(placeText('最寄り部品', 5, 'end', 640), LAYOUT.padding);
  });
});

describe('図の注記と縮尺表示', () => {
  test('すべてのケースで「タイヤ幅は模式表示」の注記を図の中に描く', () => {
    for (const input of Object.values(CASES)) {
      for (const width of WIDTHS) {
        const m = buildDiagramModel(resultOf(input), { width });
        assert.ok(m.shapes.some((s) => s.type === 'text' && s.text === TIRE_WIDTH_NOTE));
      }
    }
  });

  test('ホイール（リム）の輪郭はタイヤより後に描く（前面に出る）', () => {
    const m = buildDiagramModel(resultOf(CASES['7J +48 → 8J +45']));
    const idx = (cls) => m.shapes.findIndex((s) => s.className === cls);
    assert.ok(idx('d-current-outline') > idx('d-candidate-tire'));
    assert.ok(idx('d-candidate-outline') > idx('d-candidate-rim'));
  });

  test('縮尺の表示は「縦横同一縮尺 1:1」', () => {
    assert.equal(SCALE_LABEL, '縦横同一縮尺 1:1');
  });
});
