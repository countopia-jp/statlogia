// 閲覧室「工場とお店」（市区町村・経済基盤 C34xx・C35xx）
const C = '0000020103';
export const TOWN_SHOPS = {
  id: 'town-shops',
  scope: 'town',
  path: '/town-shops/',
  description: '市区町村を選んで、工場の数と出荷額、お店の数と売上を、全国と県内の順位でご覧いただける窓口。',
  title: '工場とお店',
  shelf: '町の商いと産業',
  imageAlt: '明るい町工場で部品を組み立てる人々と、開いた戸口の向こうに見える軽トラックと商店の水彩画',
  lead: 'この町には、工場がいくつあって、どれだけの品物を送り出しているのか。<br />お店の数と売上もあわせて、市区町村ごとにご覧ください。',
  intro: [
    ['chiaki', 'ここは、工場とお店の窓口だ。町の工場が1年に送り出す品物の額と、お店が1年に売り上げる額を引ける。'],
    ['hitoha', 'お店には、問屋も入るんですか。'],
    ['chiaki', '入る。問屋のような卸売業と、私たちが買い物をする小売業をあわせたのが「商業」だ。小売業だけの数字も出そう。'],
  ],
  hitoha: ['工場の出荷額が、町でけた違いなんですね。', '卸売業は、大きな町に集まるんですね。', '小売業だけで見ると、並びが変わりますね。'],
  notes: [
    '工場の数字は工業統計調査・経済センサスによる製造業の事業所の値です。調査の年によって、数える事業所の範囲（従業者の人数の下限）が違うことがあります。',
    'お店の数字は商業統計調査・経済センサスによる卸売業・小売業の値です。',
    '金額は億円にそろえています（元の表は百万円単位）。',
    '政令指定都市の区は、表には出しますが、順位には入れていません。',
  ],
  cross: [['/town-work/', 'わが町の仕事'], ['/prices/', '物価の帳場'], ['/town-population/', 'わが町の人口']],
  indicators: [
    { key: 'shipments', label: '製造品の出荷額', table: C, code: 'C3401', unit: '億円', scale: 0.01, decimals: 1, rankWord: '多い順' },
    { key: 'factories', label: '工場の数', table: C, code: 'C3403', decimals: 0, rankWord: '多い順' },
    { key: 'factoryWorkers', label: '工場で働く人', table: C, code: 'C3404', decimals: 0, rankWord: '多い順' },
    { key: 'sales', label: '商業の販売額（卸売＋小売）', table: C, code: 'C3501', unit: '億円', scale: 0.01, decimals: 1, rankWord: '多い順' },
    { key: 'retailSales', label: '小売業の販売額', table: C, code: 'C350102', unit: '億円', scale: 0.01, decimals: 1, rankWord: '多い順' },
    { key: 'shops', label: '小売店の数', table: C, code: 'C350202', decimals: 0, rankWord: '多い順' },
  ],
};
