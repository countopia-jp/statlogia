// 閲覧室「わが町の世帯のかたち」（市区町村・人口世帯 A1xxx・A7xxx・A8xxx、国勢調査）
const A = '0000020101';
const per = (a, b, n) => (a === null || !b ? null : (a / b) * n);
const hh = [A, 'A710101'];
export const TOWN_HOUSEHOLDS = {
  id: 'town-households',
  scope: 'town',
  path: '/town-households/',
  description: '市区町村を選んで、ひとり暮らしの世帯や65歳以上のひとり暮らし・高齢の夫婦だけの世帯の割合、1世帯あたりの人数、年齢の真ん中、人口集中地区に住む人や外国人の割合をご覧いただける窓口。',
  title: 'わが町の世帯のかたち',
  shelf: '人と世帯',
  imageAlt: '夕暮れの住宅街で、明かりのともる窓に三世代で食卓を囲む家族、机に向かう若者、縁側でお茶を飲む老夫婦が見え、路地では近所の人が立ち話をしている水彩画',
  lead: 'わが町には、どんなかたちの家族が暮らしているのか。<br />世帯のかたちと人の年齢を、市区町村ごとにご覧ください。',
  intro: [
    ['hitoha', '先生、町にはどんな家族が住んでいるんですか。'],
    ['chiaki', 'ひとり暮らしの世帯や、65歳以上の人のひとり暮らし、高齢の夫婦だけの世帯が、一般世帯のうちどれだけかを出そう。1世帯あたりの人数と、町の人の年齢の真ん中も並べた。'],
  ],
  hitoha: ['ひとりで暮らす人が、こんなにいるんですね。', '年齢の真ん中（中央値）というのは、平均とは違うんですね。', '1世帯あたりの人数は、どの町も小さくなっているんですね。'],
  notes: [
    '国勢調査によるもので、5年ごとの値です。',
    '世帯の割合は、一般世帯（寮や病院・施設などに住む人の世帯を除いた世帯）に対するものです。高齢の夫婦だけの世帯は、夫が65歳以上・妻が60歳以上の夫婦だけの世帯です。',
    '年齢の真ん中（年齢中位数）は、町の人を年齢の順に並べたとき、ちょうど真ん中に来る人の年齢です。',
    '人口集中地区は、人口密度の高い地区が集まって5000人以上になる地区です。人口集中地区がない町は、表に出ません。',
  ],
  cross: [['/town-population/', 'わが町の人口'], ['/town-elderly/', 'わが町の老人ホーム'], ['/population/', '国勢の間']],
  indicators: [
    { key: 'single', label: 'ひとり暮らしの世帯の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[A, 'A810105'], hh], calc: (g) => per(g('A810105'), g('A710101'), 100) },
    { key: 'oldSingle', label: '65歳以上のひとり暮らしの世帯の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[A, 'A8301'], hh], calc: (g) => per(g('A8301'), g('A710101'), 100) },
    { key: 'oldCouple', label: '高齢の夫婦だけの世帯の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[A, 'A8201'], hh], calc: (g) => per(g('A8201'), g('A710101'), 100) },
    { key: 'nuclear', label: '核家族の世帯の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[A, 'A810102'], hh], calc: (g) => per(g('A810102'), g('A710101'), 100) },
    { key: 'size', label: '1世帯あたりの人数', unit: '人', decimals: 2, rankWord: '多い順', needs: [[A, 'A1101'], [A, 'A7101']], calc: (g) => per(g('A1101'), g('A7101'), 1) },
    { key: 'median', label: '年齢の真ん中（年齢中位数）', table: A, code: 'A1231', unit: '歳', decimals: 1, rankWord: '高い順' },
    { key: 'did', label: '人口集中地区に住む人の割合', unit: '％', decimals: 1, rankWord: '高い順', minCoverage: 0.3, needs: [[A, 'A1801'], [A, 'A1101']], calc: (g) => per(g('A1801'), g('A1101'), 100) },
    { key: 'foreign', label: '外国人の割合', unit: '％', decimals: 2, rankWord: '高い順', needs: [[A, 'A1700'], [A, 'A1101']], calc: (g) => per(g('A1700'), g('A1101'), 100) },
  ],
};
