// 閲覧室「宿と観光」（都道府県・文化 G71xx／経済基盤 C38xx）
const G = '0000010107';
const C = '0000010103';
const pct = (a, b) => (a === null || !b ? null : (a / b) * 100);
export const STAY = {
  id: 'stay',
  scope: 'pref',
  path: '/stay/',
  description: '都道府県を選んで、旅館やホテルに泊まった人の延べ数、外国から来た人の宿泊、客室の埋まりぐあい、宿の数と客室数をご覧いただける窓口。',
  title: '宿と観光',
  shelf: '仕事と産業',
  imageAlt: '川沿いの温泉街を、浴衣姿や荷物を持った旅行者が歩く水彩画',
  lead: '1年のあいだに、のべ何人がその県の宿に泊まったのか。<br />宿の数や客室の埋まりぐあいとあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、宿と観光の窓口です。旅館やホテルに泊まった人の数と、宿の数をお出しします。'],
    ['touko', '「延べ」というのは、どう数えるの？'],
    ['kei', '1人が2泊すれば2と数えます。同じ人が何度泊まっても、そのたびに数えます。'],
  ],
  touko: [
    '外国からのお客さまが、こんなに泊まっているの？',
    '宿の部屋がどれだけ埋まっているかまで、分かるのね。',
    'わたくしの時代では、旅は一生に何度もない楽しみなのよ。',
  ],
  notes: [
    '宿泊者数・客室稼働率・定員稼働率は観光庁の宿泊旅行統計調査によるものです。',
    '旅館・リゾートホテル・ビジネスホテル・シティホテルの割合は、延べ宿泊者数のうち、それぞれの宿に泊まった延べ人数の割合です。このほかに簡易宿所や会社・団体の宿泊所などがあるので、4つを足しても100％にはなりません。',
    '定員稼働率は、泊まれる人数のうち実際に泊まった人の割合、客室稼働率は、客室のうち使われた部屋の割合です。',
    '宿の数と客室数は、旅館業の許可を受けた施設の数です（衛生行政報告例）。「旅館・ホテル」は旅館とホテルをあわせた数です。',
  ],
  cross: [['/farm-sea/', '田畑と海'], ['/nature/', '自然公園と植生'], ['/town-work/', 'わが町の仕事']],
  indicators: [
    { key: 'guests', label: '延べ宿泊者数', table: G, code: 'G7101', decimals: 0, rankWord: '多い順' },
    { key: 'outside', label: '県外から来た人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710102'], [G, 'G7101']], calc: (g) => pct(g('G710102'), g('G7101')) },
    { key: 'foreign', label: '外国人の延べ宿泊者数', table: G, code: 'G7102', decimals: 0, rankWord: '多い順' },
    { key: 'foreignShare', label: '外国人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G7102'], [G, 'G7101']], calc: (g) => pct(g('G7102'), g('G7101')) },
    { key: 'occupancy', label: '客室稼働率', table: G, code: 'G7105', decimals: 1, rankWord: '高い順' },
    { key: 'ryokan', label: '旅館に泊まった人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710103'], [G, 'G7101']], calc: (g) => pct(g('G710103'), g('G7101')) },
    { key: 'resort', label: 'リゾートホテルに泊まった人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710104'], [G, 'G7101']], calc: (g) => pct(g('G710104'), g('G7101')) },
    { key: 'business', label: 'ビジネスホテルに泊まった人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710105'], [G, 'G7101']], calc: (g) => pct(g('G710105'), g('G7101')) },
    { key: 'city', label: 'シティホテルに泊まった人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710106'], [G, 'G7101']], calc: (g) => pct(g('G710106'), g('G7101')) },
    { key: 'capacity', label: '定員稼働率', table: G, code: 'G7104', decimals: 1, rankWord: '高い順' },
    { key: 'inns', label: '旅館・ホテルの数', table: C, code: 'C3801', decimals: 0, rankWord: '多い順' },
    { key: 'rooms', label: '旅館・ホテルの客室数', table: C, code: 'C3802', decimals: 0, rankWord: '多い順' },
    { key: 'simple', label: '簡易宿所の数', table: C, code: 'C3805', decimals: 0, rankWord: '多い順' },
  ],
};
