// 閲覧室「住まいの広さ」（都道府県・居住 H21xx・H35xx、住宅・土地統計調査）
const H = '0000010108';
export const HOME_SPACE = {
  id: 'home-space',
  scope: 'pref',
  path: '/home-space/',
  description: '都道府県を選んで、1人あたりの畳の数や、持ち家と借家の部屋の数と畳の数、一戸建ての敷地の広さをご覧いただける窓口。',
  title: '住まいの広さ',
  shelf: '住まいと土地',
  imageAlt: '庭のある二階建ての家を断面で見せた畳の部屋で家族が思い思いに過ごし、塀の向こうの集合住宅の一室では二人がダイニングで食事をしている水彩画',
  lead: '家の中は、1人あたりどのくらいの広さがあるのか。<br />持ち家と借家の広さとあわせて、都道府県ごとにご覧ください。',
  intro: [
    ['hitoha', '先生、1人あたりの畳の数は、どうやって出すんですか。'],
    ['chiaki', '住まいの広さを、住んでいる人の数で割る。持ち家・借家それぞれの部屋の数と畳の数も出そう。一戸建ての敷地の広さも並べた。'],
  ],
  hitoha: ['ひとりあたりの畳の数まで、分かるんですね。', '借家と持ち家で、部屋の数がちがうんですね。', '敷地の広さは、地方の県が大きいんでしょうか。'],
  notes: [
    '総務省の住宅・土地統計調査によるものです（5年ごと）。人が住んでいる住宅について調べています。',
    '1人あたりの畳の数は、住宅に住む主世帯（その住宅のおもな世帯）の値です。畳の数は、居間や寝室など居住室の広さを畳に直したもので、台所やトイレ、廊下などは入りません。',
  ],
  cross: [['/home-features/', '家のつくりと設備'], ['/living/', '暮らしの見積所'], ['/house-build/', '家の建ちかた']],
  indicators: [
    { key: 'tatamiPer', label: '1人あたりの畳の数', table: H, code: 'H3524', unit: '畳', decimals: 2, rankWord: '多い順' },
    { key: 'roomsOwn', label: '持ち家の1住宅あたりの部屋数', table: H, code: 'H211010', unit: '室', decimals: 2, rankWord: '多い順' },
    { key: 'roomsRent', label: '借家の1住宅あたりの部屋数', table: H, code: 'H211020', unit: '室', decimals: 2, rankWord: '多い順' },
    { key: 'tatamiOwn', label: '持ち家の1住宅あたりの畳の数', table: H, code: 'H212010', unit: '畳', decimals: 1, rankWord: '多い順' },
    { key: 'tatamiRent', label: '借家の1住宅あたりの畳の数', table: H, code: 'H212020', unit: '畳', decimals: 1, rankWord: '多い順' },
    { key: 'site', label: '一戸建ての1住宅あたりの敷地面積', table: H, code: 'H214010', unit: '㎡', decimals: 0, rankWord: '広い順' },
  ],
};
