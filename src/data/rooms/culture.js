// 閲覧室「文化施設」（都道府県・文化 G15xx・G16xx・G31xx・G41xx、施設は A1101 で割る）
const G = '0000010107';
const A = '0000010101';
const per = (a, pop, n) => (a === null || !pop ? null : (a / pop) * n);
const pop = [A, 'A1101'];
export const CULTURE = {
  id: 'culture',
  scope: 'pref',
  path: '/culture/',
  description: '都道府県を選んで、博物館や劇場・音楽堂、体育館などの施設の数と、重要文化財・史跡名勝天然記念物の件数をご覧いただける窓口。',
  title: '文化施設',
  shelf: '学びと文化',
  imageAlt: '秋の町を見下ろす公園に博物館と丸屋根の音楽ホール、体育館と運動場が並び、奥に古い塔と城跡が見える水彩画',
  lead: '博物館や劇場、体育館は、その県にどれだけあるのか。<br />国が指定した文化財の件数とあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、文化施設の窓口です。博物館や劇場、体育施設の数と、文化財の件数をお出しします。'],
    ['touko', 'わたくし、博物館なら上野で見たことがあるわ。'],
    ['kei', '上野の博物館は、今もあります。施設の数は人口10万人あたりに直してあります。文化財は、そのままの件数です。'],
  ],
  touko: [
    '博物館や劇場が、こんなにあるのね！',
    'わたくしの頃は、芝居小屋へ行くのが何よりの楽しみだったわ。',
    'お国の宝ものの数まで、分かるなんて。',
  ],
  notes: [
    '博物館・博物館類似施設・劇場、音楽堂等・社会体育施設は、文部科学省の社会教育調査によるものです（3年ごとの調査）。',
    '重要文化財と史跡名勝天然記念物は、国が指定した件数です。県や市町村が指定したものは含みません。',
    '人口あたりの値は、同じ年の総人口で割って計算しています。',
  ],
  cross: [['/town-culture/', 'わが町の図書館と公民館'], ['/education/', '学びの登記所'], ['/stay/', '宿と観光']],
  indicators: [
    { key: 'museums', label: '博物館（人口10万人あたり）', unit: '館', decimals: 2, rankWord: '多い順', needs: [[G, 'G1501'], pop], carry: ['A1101'], calc: (g) => per(g('G1501'), g('A1101'), 1e5) },
    { key: 'museumLike', label: '博物館に似た施設（人口10万人あたり）', unit: '施設', decimals: 2, rankWord: '多い順', needs: [[G, 'G1601'], pop], carry: ['A1101'], calc: (g) => per(g('G1601'), g('A1101'), 1e5) },
    { key: 'theaters', label: '劇場・音楽堂など（人口10万人あたり）', unit: '施設', decimals: 2, rankWord: '多い順', needs: [[G, 'G1604'], pop], carry: ['A1101'], calc: (g) => per(g('G1604'), g('A1101'), 1e5) },
    { key: 'sports', label: '体育館・運動場など（人口10万人あたり）', unit: '施設', decimals: 1, rankWord: '多い順', needs: [[G, 'G3102'], pop], carry: ['A1101'], calc: (g) => per(g('G3102'), g('A1101'), 1e5) },
    { key: 'treasures', label: '重要文化財', table: G, code: 'G4101', unit: '件', decimals: 0, rankWord: '多い順' },
    { key: 'monuments', label: '史跡名勝天然記念物', table: G, code: 'G4102', unit: '件', decimals: 0, rankWord: '多い順' },
  ],
};
