// 閲覧室「空の帳場」（都道府県・自然環境 B41xx 気候）
// 気象官署（原則として県庁所在地）の観測値。全国の行は空なので47都道府県の平均を出す。
// 快晴日数B4104・曇天日数B4105は雲量の目視観測が2019〜2024年に順次終わったため使わない。
const T = '0000010102';
export const SKY = {
  id: 'sky',
  scope: 'pref',
  maxYears: 50,
  path: '/sky/',
  description: '都道府県を選んで、気温・降水・雪・日照・湿度を、全国の順位と1975年からの移りかわりでご覧いただける窓口。',
  title: '空の帳場',
  shelf: '空と大地',
  lead: '気温、雨、雪、日差し、湿り気。<br />あなたの県の空模様を、50年ちかい記録とともにご覧ください。',
  intro: [
    ['kei', 'こちらは空の帳場です。気温・雨・雪・日照・湿度を、県ごとに引けます。'],
    ['touko', '空の様子まで、数えてあるの？'],
    ['kei', 'はい。気象台が毎日はかった記録を、1年分まとめた数字です。ただし、はかっている場所は原則として県庁所在地の1か所です。'],
  ],
  notes: [
    '気象庁の気象官署（原則として県庁所在地）の観測値で、県全体の値ではありません。',
    '「全国」の欄は、47都道府県の値を単純に平均したものです。',
    '快晴日数・曇天日数は、雲の目視観測が2019〜2024年に順に終わったため、載せていません。雪日数は2018年度まで、最深積雪は2007年度までしか統計表に載っていないため、雪日数だけを2018年度の値で載せています。',
  ],
  cross: [['/exhibits/sunshine/', '日本一「晴れる」県はどこだ'], ['/exhibits/snow-ground/', 'スキーとグラウンドゴルフ、日本一はどの県だ'], ['/exhibits/solar/', '日本一「太陽光発電の家」県はどこだ']],
  indicators: [
    { key: 'temp', label: '年平均気温', table: T, code: 'B4101', decimals: 1, rankWord: '高い順' },
    { key: 'tmax', label: 'いちばん暑い月の最高気温', table: T, code: 'B4102', decimals: 1, rankWord: '高い順', note: '日最高気温の月平均のうち、いちばん高い月の値' },
    { key: 'tmin', label: 'いちばん寒い月の最低気温', table: T, code: 'B4103', decimals: 1, rankWord: '高い順', note: '日最低気温の月平均のうち、いちばん低い月の値' },
    { key: 'sun', label: '日照時間（年間）', table: T, code: 'B4108', decimals: 0, rankWord: '長い順' },
    { key: 'rainDays', label: '降水日数（年間）', table: T, code: 'B4106', decimals: 0 },
    { key: 'rain', label: '降水量（年間）', table: T, code: 'B4109', decimals: 0 },
    { key: 'snowDays', label: '雪日数（年間）', table: T, code: 'B4107', decimals: 0, note: '統計表に載っている最後の年（2018年度）の値' },
    { key: 'humid', label: '年平均湿度', table: T, code: 'B4111', decimals: 0, rankWord: '高い順' },
  ],
};
