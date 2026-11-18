// 「ご利用上の注意・免責事項」と、結果付近の短い注意書きのテスト（HTML の文言を確認する）。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLEARANCE_THRESHOLD_MM, CLEARANCE_LEVELS, judgeClearance } from '../js/calc.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const MAIN_JS = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

/** id で始まる要素から、対応する閉じタグまでを取り出す（入れ子のない section / details 用） */
function block(tag, id) {
  const start = HTML.indexOf(`<${tag} `, HTML.lastIndexOf('<', HTML.indexOf(`id="${id}"`)));
  assert.ok(start >= 0, `${tag}#${id} がない`);
  const end = HTML.indexOf(`</${tag}>`, start);
  return HTML.slice(start, end + tag.length + 3);
}

const SECTION = block('section', 'usage-notes');
const DETAILS = block('details', 'usage-details');
const OUTSIDE_DETAILS = SECTION.replace(DETAILS, '');

describe('ご利用上の注意（常に表示する部分）', () => {
  test('見出しと最重要の注意が、折りたたみの外にある', () => {
    assert.match(OUTSIDE_DETAILS, /<h2[^>]*>ご利用上の注意<\/h2>/);
    assert.ok(OUTSIDE_DETAILS.includes('本ツールの計算結果は参考値です。実際の装着可否、安全性、走行時の干渉、車検・保安基準への適合を保証するものではありません。'));
    assert.ok(OUTSIDE_DETAILS.includes('ホイールやタイヤの購入・交換・装着前には、必ず実車で寸法やクリアランスを確認してください。'));
  });

  test('詳細は details / summary で、初期状態は閉じている', () => {
    assert.match(DETAILS, /<summary>詳しい注意事項・免責事項を見る<\/summary>/);
    assert.doesNotMatch(DETAILS.slice(0, DETAILS.indexOf('>') + 1), /\sopen\b/, '初期状態で open になっていない');
    assert.doesNotMatch(DETAILS, /data-open-on-wide/, 'PC 幅で自動的に開かない');
  });
});

describe('詳しい注意事項・免責事項', () => {
  test('4 つの小見出しがある', () => {
    for (const h of ['計算値について', '本ツールで確認していない項目', 'クリアランス判定について', '最終確認について']) {
      assert.match(DETAILS, new RegExp(`<h3>${h}</h3>`), h);
    }
  });

  test('確認していない項目が 8 つすべてある', () => {
    for (const item of [
      'PCD・穴数・ハブ径',
      'ボルト・ナットの規格や座面形状',
      'タイヤのロードインデックス・速度記号・適正リム幅',
      'ブレーキキャリパーとホイールスポーク・ディスク面とのクリアランス',
      'サスペンション・アーム・インナーフェンダー等との走行時の干渉',
      '車高・キャンバー・アライメント等による位置変化',
      'フェンダー形状や車両の個体差',
      '車検および法令・保安基準への適合性',
    ]) assert.ok(DETAILS.includes(`<li>${item}</li>`), item);
  });

  test('計算値・最終確認・自己責任の文言がある', () => {
    for (const text of [
      '公称サイズをもとに計算しています',
      'メーカー・銘柄・装着するリム幅・空気圧・荷重・摩耗状態',
      '車両の個体差、車高、アライメント、キャンバー、サスペンションの状態',
      '走行時、操舵時、サスペンションの伸縮時などに生じる動的な変化は計算していません',
      '本ツールの計算結果だけで判断せず、必ず実車で各部の寸法やクリアランスを確認してください',
      'ハンドルを切った状態やサスペンションが動いた状態',
      '専門知識を持つ事業者・専門家へ確認してください',
      '利用者自身の判断と責任において行ってください',
    ]) assert.ok(DETAILS.includes(text), text);
  });

  test('クリアランス判定の 3 区分の説明があり、ラベルは計算側と同じ', () => {
    const rows = [
      ['0mm未満', 'interference', '干渉または突出の可能性'],
      ['0mm以上5mm以下', 'verySmall', '非常に小さい'],
      ['5mm超', 'ok', '数値上の残量あり'],
    ];
    for (const [range, level, text] of rows) {
      const re = new RegExp(`${range}：</span><span class="level level-${level}">${text}</span>`);
      assert.match(DETAILS, re, range);
      // 結果カードの表示（例:「静止状態でも干渉または突出の可能性」）と同じ言葉を使っている
      assert.ok(CLEARANCE_LEVELS[level].includes(text), `${level}: ${CLEARANCE_LEVELS[level]}`);
    }
    assert.ok(DETAILS.includes('安全性や車検・保安基準への適合を判定する基準ではありません'));
    assert.ok(DETAILS.includes('「数値上の残量あり」と表示された場合でも、実際の車両へ安全に装着できることや、走行中に干渉しないことを保証するものではありません。'));
  });

  test('説明の境目（0 / 5mm）が判定ロジックと一致する', () => {
    assert.equal(CLEARANCE_THRESHOLD_MM, 5);
    assert.equal(judgeClearance(-0.1), 'interference');
    assert.equal(judgeClearance(0), 'verySmall');
    assert.equal(judgeClearance(5), 'verySmall');
    assert.equal(judgeClearance(5.1), 'ok');
  });
});

describe('結果付近の短い注意書き（削除されていない）', () => {
  test('比較結果の中に、参考値であることとご利用上の注意へのリンクがある', () => {
    const results = block('section', 'results');
    assert.ok(results.includes('計算結果は公称サイズにもとづく理論上の参考値で、装着可否を保証するものではありません。'));
    assert.match(results, /<a href="#usage-notes">ご利用上の注意<\/a>/);
  });

  test('クリアランス結果の注意（理論値・静止状態）が残っている', () => {
    assert.ok(HTML.includes('タイヤ側面の位置は理論値です（実測値ではありません）。'));
    assert.ok(HTML.includes('静止状態での単純な引き算です。走行中（ハンドル操作・サスペンションの伸縮・荷重変化）の干渉や、法的な適合を保証するものではありません。'));
  });

  test('断面図の「実測ではない」注意と、入力範囲の注意が残っている', () => {
    assert.ok(HTML.includes('実測のタイヤ幅・形状・突出量ではありません。'));
    assert.ok(MAIN_JS.includes('この範囲は計算できる範囲であり、装着可能・安全・合法であることを意味しません。'));
  });

  test('参考値のタグ（外径差率・理論実速度）が残っている', () => {
    assert.match(HTML, /外径差率<span class="tag">参考値<\/span>/);
    assert.match(HTML, /理論実速度<span class="tag">参考値<\/span>/);
  });
});
