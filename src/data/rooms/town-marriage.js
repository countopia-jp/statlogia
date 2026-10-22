// 閲覧室「わが町の結婚と離婚」（市区町村・人口 A9101 婚姻件数、A9201 離婚件数、A2101 住民基本台帳人口）
const A = '0000020101';
const per = (a, b, n) => (a === null || b === null || !b ? null : (a / b) * n);
export const TOWN_MARRIAGE = {
  id: 'town-marriage',
  scope: 'town',
  maxYears: 12,
  path: '/town-marriage/',
  description: '市区町村を選んで、1年の婚姻件数と離婚件数を人口1000人あたりに直した値と、その推移をご覧いただける窓口。',
  title: 'わが町の結婚と離婚',
  imageAlt: '役場の窓口の机に二枚の届出用紙、片方に小さな花束、ペンとはんこ、窓の外に春の町',
  shelf: '人と家族',
  lead: 'わが町では1年にどれだけの結婚があり、どれだけの離婚があるか。<br />人口1000人あたりに直して、市区町村ごとにご覧ください。',
  intro: [
    ['chiaki', 'ここはわが町の結婚と離婚の窓口だ。1年の婚姻届と離婚届の件数を、人口1000人あたりに直して出す。'],
    ['hitoha', '県の窓口では「婚姻率」でしたね。町だと、何か違いますか。'],
    ['chiaki', '中身は同じだが、町は数が小さい。小さな村の件数は年によって大きく揺れるから、一年の値だけで何かを言うのはやめたまえ。推移の折れ線をならして見るのだ。'],
  ],
  hitoha: ['若い人の多い町で、千人あたりの件数が多いんですね。', '一年の値だけだと、小さな町はほんとうに揺れますね。', '結婚が多い町と離婚が多い町は、だいたい重なるんですね。'],
  notes: [
    '人口動態統計によるもので、届け出た人の住所地で数えた1年の件数です。',
    '1000人あたりの値は、住民基本台帳の総人口（各年1月1日）で割っています。',
    '件数は年齢構成の影響を強く受けます。若い人の多い町ほど結婚も離婚も多く出やすく、件数の多い少ないがそのまま結婚のしやすさを表すわけではありません。',
    '人口の少ない町村では、1年の値が大きく揺れます。',
  ],
  cross: [['/life-family/', '人の一生と家族のかたち'], ['/town-households/', 'わが町の世帯のかたち'], ['/town-population/', 'わが町の人口']],
  indicators: [
    { key: 'marriagePer', label: '婚姻件数（人口1000人あたり）', unit: '件', decimals: 2, rankWord: '多い順', needs: [[A, 'A9101'], [A, 'A2101']], calc: (g) => per(g('A9101'), g('A2101'), 1000) },
    { key: 'divorcePer', label: '離婚件数（人口1000人あたり）', unit: '件', decimals: 2, rankWord: '多い順', needs: [[A, 'A9201'], [A, 'A2101']], calc: (g) => per(g('A9201'), g('A2101'), 1000) },
    { key: 'marriages', label: '婚姻件数', table: A, code: 'A9101', unit: '件', decimals: 0, rankWord: '多い順', perCapita: false },
    { key: 'divorces', label: '離婚件数', table: A, code: 'A9201', unit: '件', decimals: 0, rankWord: '多い順', perCapita: false },
  ],
};
