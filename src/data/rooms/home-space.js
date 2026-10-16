// 閲覧室「住まいの広さと近さ」（都道府県・居住 H21xx・H29xx・H35xx・H36xx、住宅・土地統計調査）
const H = '0000010108';
const share = (parts, all) => (g) => {
  const v = all.map((c) => g(c));
  if (v.some((x) => x === null)) return null;
  const t = v.reduce((a, b) => a + b, 0);
  return t ? (parts.reduce((a, c) => a + g(c), 0) / t) * 100 : null;
};
const NURSERY = ['H2900', 'H2901', 'H2902', 'H2903', 'H2904'];
const DAY = ['H2910', 'H2911', 'H2912', 'H2913', 'H2914'];
export const HOME_SPACE = {
  id: 'home-space',
  scope: 'pref',
  path: '/home-space/',
  description: '都道府県を選んで、1人あたりの家の広さや畳の数、持ち家と借家の部屋の数、敷地の広さ、保育所やデイサービスまでの近さをご覧いただける窓口。',
  title: '住まいの広さと近さ',
  shelf: '人と住まい',
  imageAlt: '',
  lead: '家の中は、1人あたりどのくらいの広さがあるのか。<br />近くの保育所やデイサービスまでの近さとあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['touko', 'わたくしの家は、六畳と八畳の座敷に、家族七人で寝ているのよ。いまの時代の家は、ひとりあたりどのくらいの広さがあるのかしら。'],
    ['kei', '1人あたりの延べ面積や畳の数、持ち家と借家の部屋の数をお出しします。保育所やデイサービスまで、近くにある家の割合も並べました。'],
  ],
  touko: [
    'ひとりあたりの畳の数まで、分かるのね。',
    '借家と持ち家で、部屋の数がちがうのね。',
    '保育所まで歩いて行ける家が、どれだけあるか分かるのね。',
  ],
  notes: [
    '総務省の住宅・土地統計調査によるものです（5年ごと）。人が住んでいる住宅について調べています。',
    '1人あたりの延べ面積と畳の数は、住宅に住む主世帯（その住宅のおもな世帯）の値です。畳の数は、居間や寝室など居住室の広さを畳に直したもので、台所やトイレ、廊下などは入りません。',
    '保育所やデイサービスまでの距離は、住宅から最も近い施設までの道のりではなく、まっすぐ測った距離です。',
  ],
  cross: [['/home-features/', '家のつくりと設備'], ['/living/', '暮らしの見積所'], ['/care-places/', '子どもと高齢者の施設']],
  indicators: [
    { key: 'areaPer', label: '1人あたりの延べ面積', table: H, code: 'H3671', unit: '㎡', decimals: 1, rankWord: '広い順' },
    { key: 'tatamiPer', label: '1人あたりの畳の数', table: H, code: 'H3524', unit: '畳', decimals: 2, rankWord: '多い順' },
    { key: 'roomsOwn', label: '持ち家の1住宅あたりの部屋数', table: H, code: 'H211010', unit: '室', decimals: 2, rankWord: '多い順' },
    { key: 'roomsRent', label: '借家の1住宅あたりの部屋数', table: H, code: 'H211020', unit: '室', decimals: 2, rankWord: '多い順' },
    { key: 'tatamiOwn', label: '持ち家の1住宅あたりの畳の数', table: H, code: 'H212010', unit: '畳', decimals: 1, rankWord: '多い順' },
    { key: 'tatamiRent', label: '借家の1住宅あたりの畳の数', table: H, code: 'H212020', unit: '畳', decimals: 1, rankWord: '多い順' },
    { key: 'site', label: '一戸建ての1住宅あたりの敷地面積', table: H, code: 'H214010', unit: '㎡', decimals: 0, rankWord: '広い順' },
    { key: 'nursery', label: '保育所まで500m未満の住宅の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: NURSERY.map((c) => [H, c]), calc: share(['H2900', 'H2901', 'H2902'], NURSERY) },
    { key: 'dayService', label: 'デイサービスまで500m未満の住宅の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: DAY.map((c) => [H, c]), calc: share(['H2910', 'H2911'], DAY) },
  ],
};
