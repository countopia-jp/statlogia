// 閲覧室「自然公園と植生」（都道府県・自然環境 B1108・B21xx・B31xx）
const T = '0000010102';
const pct = (a, b) => (a === null || !b ? null : (a / b) * 100);
export const NATURE = {
  id: 'nature',
  scope: 'pref',
  path: '/nature/',
  description: '都道府県を選んで、国立公園・国定公園・県立自然公園の広さと、自然のままの植生が残る割合をご覧いただける窓口。',
  title: '自然公園と植生',
  shelf: '空と大地',
  imageAlt: '高い山並みを背に、湿原の木道を歩くハイカーたちの水彩画',
  lead: '国立公園や国定公園は、県の広さのどれだけを占めるか。<br />手つかずの自然がどれだけ残っているかも、あわせてご覧ください。',
  intro: [
    ['kei', 'こちらは自然公園と植生の窓口です。国立公園・国定公園・県立の自然公園の広さと、自然のままの植生がどれだけ残っているかを引けます。'],
    ['touko', '植生というのは、草や木のこと？'],
    ['kei', 'はい。その土地に生えている草木の様子です。人の手の入りかたで1から10に分けて、9と10が「自然のまま」にあたります。'],
  ],
  touko: [
    '国立公園？　お国が山や海を守っているのね。',
    '自然の様子まで、帳面になっているなんて。',
    'いつか、この景色を見に行きたいわ。',
  ],
  notes: [
    '自然公園は、国立公園・国定公園・都道府県立自然公園をあわせた面積です。自然公園の割合は、県の総面積（北方地域と竹島を除く）で割ったものです。',
    '植生自然度は環境省の自然環境保全基礎調査によるもので、9は自然林など、10は自然草原などを指します。調べた年が限られるため、移りかわりは出ないことがあります。',
  ],
  cross: [['/sky/', '空の帳場'], ['/town-forest/', 'わが町の森と土地'], ['/exhibits/hiking/', '日本一「山を歩く」県はどこだ']],
  indicators: [
    { key: 'parkShare', label: '自然公園の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[T, 'B2101'], [T, 'B1101']], carry: ['B1101'], calc: (g) => pct(g('B2101'), g('B1101')) },
    { key: 'park', label: '自然公園の面積', table: T, code: 'B2101', decimals: 0, rankWord: '広い順' },
    { key: 'national', label: '国立公園の面積', table: T, code: 'B2104', decimals: 0, rankWord: '広い順' },
    { key: 'quasi', label: '国定公園の面積', table: T, code: 'B2105', decimals: 0, rankWord: '広い順' },
    { key: 'prefPark', label: '県立自然公園の面積', table: T, code: 'B2103', decimals: 0, rankWord: '広い順' },
    { key: 'reserve', label: '自然環境保全地域の面積', table: T, code: 'B1108', decimals: 0, rankWord: '広い順' },
    { key: 'wild', label: '自然のままの植生の割合（自然度9・10）', unit: '％', decimals: 1, note: '1997年度までの調査による値', rankWord: '高い順', needs: [[T, 'B3109'], [T, 'B3110']], calc: (g) => (g('B3109') === null || g('B3110') === null ? null : g('B3109') + g('B3110')) },
  ],
};
