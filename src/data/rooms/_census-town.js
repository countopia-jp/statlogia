// 経済センサス‐活動調査（令和3年）の市区町村版。表 0004006340（産業大分類×経営組織、全国・都道府県・市区町村）
// 市区町村の表は大分類しかないため、医療・福祉（P）は中の社会保険の事業団体を分けられない。
// そこで市区町村の窓口では、P を全産業からも除いて割合を出す（県の窓口は中分類の表で85だけを除いている）。
export const ECT = '0004006340';
export const ECT_SOURCE = '政府統計の総合窓口(e-Stat) 令和3年経済センサス‐活動調査 事業所に関する集計（表番号0004006340）';
export const vaT = (c) => `${c}|cat02=0|tab=158-2021`;
export const wkT = (c) => `${c}|cat02=0|tab=148-2021`;
export const TOWN_INDUSTRIES = [
  ['maker', '製造業', 'E'],
  ['trade', '卸売業・小売業', 'I'],
  ['build', '建設業', 'D'],
  ['trans', '運輸業・郵便業', 'H'],
  ['food', '宿泊業・飲食サービス業', 'M'],
  ['life', '生活関連サービス業・娯楽業', 'N'],
  ['estate', '不動産業・物品賃貸業', 'K'],
  ['pro', '学術研究・専門・技術サービス業', 'L'],
  ['fin', '金融業・保険業', 'J'],
  ['agri', '農林漁業', 'AB'],
];
const ratio = (a, b, n) => (a === null || b === null || !b ? null : (a / b) * n);
const totalT = (f) => ({ needs: [[ECT, f('AR')], [ECT, f('P')]], calc: (g) => { const a = g(f('AR')); const b = g(f('P')); return a === null || b === null ? null : a - b; } });
export const townTotal = totalT;
export const townShare = (c, key, label) => {
  const T = totalT(vaT);
  return { key, label, unit: '％', decimals: 1, rankWord: '高い順', needs: [[ECT, vaT(c)], ...T.needs], calc: (g) => ratio(g(vaT(c)), T.calc(g), 100) };
};
export const townPerHead = (c, key, label) => {
  if (c === 'total') {
    const V = totalT(vaT), W = totalT(wkT);
    return { key, label, unit: '万円', decimals: 0, rankWord: '多い順', perCapita: false, needs: [...V.needs, ...W.needs], calc: (g) => ratio(V.calc(g), W.calc(g), 100) };
  }
  return { key, label, unit: '万円', decimals: 0, rankWord: '多い順', perCapita: false, needs: [[ECT, vaT(c)], [ECT, wkT(c)]], calc: (g) => ratio(g(vaT(c)), g(wkT(c)), 100) };
};
