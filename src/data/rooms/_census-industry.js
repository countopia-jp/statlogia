// 経済センサス‐活動調査（令和3年）の業種別の数を、閲覧室の窓口で使う形にそろえる部品
// 表 0004006321：産業（中分類）、経営組織別の民営事業所数・事業従事者数・純付加価値額（全国・都道府県）
// code は room-engine.js の parseCode の書き方（cat01｜cat02=経営組織 0総数｜tab=表章項目）
//
// 【除いているもの】中分類85「社会保険・社会福祉・介護事業」は全産業からも除く。
//   この分類には保険料を集めて給付する社会保険の事業団体が入り、その純付加価値額が本部のある東京に集まる
//   （東京の85は全国の78％、1人あたり約1億円）。そのままでは東京の全産業の額がふくらみ、
//   ほかの業種の割合がすべて小さく出るため。医療は83医療業＋84保健衛生で出す。
export const EC = '0004006321';
export const EC_SOURCE = '政府統計の総合窓口(e-Stat) 令和3年経済センサス‐活動調査 事業所に関する集計（表番号0004006321）';
const va = (c) => `${c}|cat02=0|tab=158-2021`; // 純付加価値額（百万円）
const wk = (c) => `${c}|cat02=0|tab=148-2021`; // 事業従事者数（人）
export const KIND = { va, wk };
// 窓口に出す業種：[キー, 名前, 足し合わせる cat01]
export const INDUSTRIES = [
  ['maker', '製造業', ['E']],
  ['trade', '卸売業・小売業', ['I']],
  ['medical', '医療業・保健衛生', ['83', '84']],
  ['build', '建設業', ['D']],
  ['it', '情報通信業', ['G']],
  ['pro', '学術研究・専門・技術サービス業', ['L']],
  ['fin', '金融業・保険業', ['J']],
  ['trans', '運輸業・郵便業', ['H']],
  ['estate', '不動産業・物品賃貸業', ['K']],
  ['food', '宿泊業・飲食サービス業', ['M']],
  ['life', '生活関連サービス業・娯楽業', ['N']],
  ['agri', '農林漁業', ['AB']],
];
const sum = (g, codes) => { let t = 0; for (const c of codes) { const v = g(c); if (v === null) return null; t += v; } return t; };
const ratio = (a, b, n) => (a === null || b === null || !b ? null : (a / b) * n);
// 全産業（公務と、中分類85を除く）
export const totalOf = (f) => ({ needs: [[EC, f('AR')], [EC, f('85')]], calc: (g) => { const a = g(f('AR')); const b = g(f('85')); return a === null || b === null ? null : a - b; } });
// 全産業に占める割合（％）
export const shareOf = (f, cats, key, label) => {
  const T = totalOf(f);
  return {
    key, label, unit: '％', decimals: 1, rankWord: '高い順',
    needs: [...cats.map((c) => [EC, f(c)]), ...T.needs],
    calc: (g) => ratio(sum(g, cats.map(f)), T.calc(g), 100),
  };
};
// 事業従事者1人あたりの純付加価値額（万円）＝ 百万円 ÷ 人 × 100
export const perHead = (cats, key, label) => {
  const tot = cats === 'total';
  const V = tot ? totalOf(va) : null;
  const W = tot ? totalOf(wk) : null;
  return {
    key, label, unit: '万円', decimals: 0, rankWord: '多い順', perCapita: false,
    needs: tot ? [...V.needs, ...W.needs] : [...cats.map((c) => [EC, va(c)]), ...cats.map((c) => [EC, wk(c)])],
    calc: (g) => (tot ? ratio(V.calc(g), W.calc(g), 100) : ratio(sum(g, cats.map(va)), sum(g, cats.map(wk)), 100)),
  };
};
