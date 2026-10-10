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
  lead: '1年のあいだに、のべ何人がその県の宿に泊まったのか。<br />宿の数や客室の埋まりぐあいとあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、宿と観光の窓口です。旅館やホテルに泊まった人の数と、宿の数をお出しします。'],
    ['touko', '「延べ」というのは、どう数えるの？'],
    ['kei', '1人が2泊すれば2と数えます。同じ人が何度泊まっても、そのたびに数えます。'],
  ],
  notes: [
    '宿泊者数・客室稼働率は観光庁の宿泊旅行統計調査によるものです。',
    '宿の数と客室数は、旅館業法で届け出のある施設の数です（衛生行政報告例）。「旅館・ホテル」は2018年度から旅館とホテルをまとめて数えています。',
  ],
  cross: [['/farm-sea/', '田畑と海'], ['/nature/', '自然公園と植生'], ['/town-work/', 'わが町の仕事']],
  indicators: [
    { key: 'guests', label: '延べ宿泊者数', table: G, code: 'G7101', decimals: 0, rankWord: '多い順' },
    { key: 'outside', label: '県外から来た人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G710102'], [G, 'G7101']], calc: (g) => pct(g('G710102'), g('G7101')) },
    { key: 'foreign', label: '外国人の延べ宿泊者数', table: G, code: 'G7102', decimals: 0, rankWord: '多い順' },
    { key: 'foreignShare', label: '外国人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G7102'], [G, 'G7101']], calc: (g) => pct(g('G7102'), g('G7101')) },
    { key: 'occupancy', label: '客室稼働率', table: G, code: 'G7105', decimals: 1, rankWord: '高い順' },
    { key: 'inns', label: '旅館・ホテルの数', table: C, code: 'C3801', decimals: 0, rankWord: '多い順' },
    { key: 'rooms', label: '旅館・ホテルの客室数', table: C, code: 'C3802', decimals: 0, rankWord: '多い順' },
    { key: 'simple', label: '簡易宿所の数', table: C, code: 'C3805', decimals: 0, rankWord: '多い順' },
  ],
};
