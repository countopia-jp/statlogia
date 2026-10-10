// 閲覧室「田畑と海」（都道府県・経済基盤 C31xx）
const C = '0000010103';
export const FARM_SEA = {
  id: 'farm-sea',
  scope: 'pref',
  path: '/farm-sea/',
  description: '都道府県を選んで、農業と漁業で生み出される額、田と畑の広さ、耕作放棄地、漁獲量と養殖の量をご覧いただける窓口。',
  title: '田畑と海',
  shelf: '仕事と産業',
  dashAsZero: true,
  lead: '田んぼと畑はどれだけあって、そこからどれだけのものが生まれるのか。<br />海や川でとれる魚の量とあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、田畑と海の窓口です。農業と海の漁業が1年に生み出す額と、田畑の広さ、海でとれる魚や貝の量をお出しします。'],
    ['touko', '耕作放棄地というのは、何かしら。'],
    ['kei', '前は作物を育てていたのに、この1年以上作っておらず、この先数年のうちにまた作るつもりもない田畑のことです。'],
  ],
  notes: [
    '農業産出額・海の漁業・養殖業の産出額は、その県でとれたものを額にしたものです。億円にそろえています（元の表は百万円単位）。',
    '耕作放棄地は農林業センサスによるもので、調べた年が限られます。',
    '漁業の3項目は海の値で、川や湖の漁業は入りません。海のない県は0としています。',
  ],
  cross: [['/town-work/', 'わが町の仕事'], ['/town-forest/', 'わが町の森と土地'], ['/exhibits/fishing/', '日本一「釣りをする」県はどこだ']],
  indicators: [
    { key: 'farmOutput', label: '農業産出額', table: C, code: 'C3101', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'farmland', label: '耕地面積', table: C, code: 'C3107', decimals: 0, rankWord: '広い順' },
    { key: 'paddy', label: '田の面積', table: C, code: 'C310701', decimals: 0, rankWord: '広い順' },
    { key: 'field', label: '畑の面積', table: C, code: 'C310702', decimals: 0, rankWord: '広い順' },
    { key: 'abandoned', label: '耕作放棄地の面積', table: C, code: 'C3109', decimals: 0, rankWord: '広い順' },
    { key: 'fishOutput', label: '海の漁業・養殖業の産出額', table: C, code: 'C31201', unit: '億円', scale: 0.01, decimals: 0, rankWord: '多い順' },
    { key: 'catch', label: '海の漁獲量', table: C, code: 'C312101', decimals: 0, rankWord: '多い順' },
    { key: 'farmed', label: '海の養殖の収獲量', table: C, code: 'C3122', decimals: 0, rankWord: '多い順' },
  ],
};
