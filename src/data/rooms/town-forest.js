// 閲覧室「わが町の森と土地」（市区町村・自然環境 B11xx）
const T = '0000020102';
const pct = (a, b) => (a === null || !b ? null : (a / b) * 100);
export const TOWN_FOREST = {
  id: 'town-forest',
  scope: 'town',
  path: '/town-forest/',
  description: '市区町村を選んで、町の面積・人が住める土地・森林の広さと割合を、全国と県内の順位でご覧いただける窓口。',
  title: 'わが町の森と土地',
  shelf: '空と大地',
  imageAlt: '丘の上から、森に囲まれた田畑と家並みを見下ろす家族の水彩画',
  lead: '町の広さのうち、人が住める土地はどれだけで、森はどれだけか。<br />市区町村を選んで、その町の土地の顔ぶれをご覧ください。',
  intro: [
    ['chiaki', 'ここは、わが町の森と土地の窓口だ。町の面積と、そのうち人が住める土地、森の広さを出そう。'],
    ['hitoha', '人が住める土地というのは、どういうことですか。'],
    ['chiaki', '町の面積から、森や原野、大きな湖や沼を除いた残りだ。田畑や家の建つ土地は、こちらに入る。'],
  ],
  hitoha: ['面積の大きな町でも、住める土地は小さいことがあるんですね。', '森の割合が9割を超える町もあるんですね。', '人口密度は、住める土地で割ったほうがよさそうですね。'],
  notes: [
    '面積はヘクタール（1ha＝100m四方）です。総面積は北方地域と竹島を除いています。',
    '「人が住める土地（可住地）」は、総面積から林野と主要な湖沼を除いた面積です。',
    '政令指定都市の区は、表には出しますが、順位には入れていません。',
  ],
  cross: [['/town-landuse/', 'わが町の土地の使われ方'], ['/nature/', '自然公園と植生'], ['/town-population/', 'わが町の人口']],
  indicators: [
    { key: 'area', label: '面積', table: T, code: 'B1101', decimals: 0, rankWord: '広い順' },
    { key: 'habitable', label: '人が住める土地', table: T, code: 'B1103', decimals: 0, rankWord: '広い順' },
    { key: 'habitableShare', label: '人が住める土地の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[T, 'B1103'], [T, 'B1101']], calc: (g) => pct(g('B1103'), g('B1101')) },
    { key: 'forest', label: '森林', table: T, code: 'B1106', decimals: 0, rankWord: '広い順' },
    { key: 'forestShare', label: '森林の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[T, 'B1106'], [T, 'B1101']], calc: (g) => pct(g('B1106'), g('B1101')) },
  ],
};
