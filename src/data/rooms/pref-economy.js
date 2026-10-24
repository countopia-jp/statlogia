// 別館「県のふところ」（都道府県・経済基盤 県民経済計算 C112x・C122x、平成27年基準）
const C = '0000010103';
const pct = (a, b) => (a === null || b === null || !b ? null : (a / b) * 100);
export const PREF_ECONOMY = {
  id: 'pref-economy',
  scope: 'pref',
  path: '/pref-economy/',
  description: '都道府県を選んで、県内総生産・県民所得・1人当たり県民所得と、その内訳（雇用者報酬・企業所得・財産所得）、産業の割合をご覧いただける窓口。',
  title: '県のふところ',
  imageAlt: '田畑と果樹園、川沿いの工場と物流倉庫、駅前のビル街、クレーンの並ぶ港までをひとつながりに見渡す県の鳥瞰図の水彩画',
  shelf: '県の経済',
  lead: 'その県で1年に生み出されたものの値打ちは、どれだけか。<br />県民所得とその内訳を、都道府県ごとにご覧ください。',
  intro: [
    ['chiaki', 'ここは県のふところの窓口だ。県のなかで1年に生み出された値打ちと、それが所得としてどう分かれるかを出そう。'],
    ['hitoha', '県民所得というのは、給料のことですか。'],
    ['chiaki', '給料（雇用者報酬）だけではない。会社のもうけ（企業所得）や、預金の利子や家賃などの財産所得も合わせたものだ。'],
  ],
  hitoha: ['県民所得は、一人ひとりの手取りとは違うんですね。', '企業所得の割合が大きい県があるんですね。', '1人あたりに直すと、並びが変わりますね。'],
  notes: [
    '県民経済計算（平成27年基準）によるもので、年度の値です。金額は億円にそろえています（元の表は百万円単位）。',
    '1人当たり県民所得は、県民所得を県の人口で割ったもので、1人ひとりの給与の平均ではありません。',
    '産業の割合は、県内総生産に占める各産業の生産額の割合です。',
  ],
  cross: [['/work-style/', '働き方の帳場'], ['/household/', '家計の帳場'], ['/town-shops/', '工場とお店']],
  indicators: [
    { key: 'gdp', label: '県内総生産', table: C, code: 'C1121', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'income', label: '県民所得', table: C, code: 'C1221', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'perCapita', label: '1人当たり県民所得', table: C, code: 'C122101', unit: '万円', scale: 0.1, decimals: 1, rankWord: '多い順' },
    { key: 'wages', label: '雇用者報酬', table: C, code: 'C1222', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'corp', label: '企業所得', table: C, code: 'C1224', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'property', label: '財産所得', table: C, code: 'C1223', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'manufShare', label: '県内総生産のうち製造業の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[C, 'C112206'], [C, 'C1121']], calc: (g) => pct(g('C112206'), g('C1121')) },
    { key: 'primaryShare', label: '県内総生産のうち農林水産業の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[C, 'C112201'], [C, 'C1121']], calc: (g) => pct(g('C112201'), g('C1121')) },
  ],
};
