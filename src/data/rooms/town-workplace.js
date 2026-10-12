// 閲覧室「働きに出る町・来る町」（市区町村・労働 F27xx・F28xx。国勢調査）
const F = '0000020106';
const pct = (a, b) => (a === null || b === null || !b ? null : (a / b) * 100);
const HOME = [[F, 'F2701'], [F, 'F2702'], [F, 'F2703']];
const homeShare = (code) => (g) => {
  const a = g('F2701'), b = g('F2702'), c = g('F2703');
  if (a === null || b === null || c === null || a + b + c === 0) return null;
  return (g(code) / (a + b + c)) * 100;
};
export const TOWN_WORKPLACE = {
  id: 'town-workplace',
  scope: 'town',
  path: '/town-workplace/',
  description: '市区町村を選んで、町に住んで働く人が町の中・県内のほかの町・ほかの県のどこで働いているかと、町の外から働きに来る人の割合をご覧いただける窓口。',
  title: '働きに出る町・来る町',
  shelf: 'わが町をくわしく',
  imageAlt: '川をはさんで手前に瓦屋根の住宅地、奥にビルと工場の町が広がり、鉄橋を渡る電車と、橋を自転車や徒歩で行き来する人々を描いた鳥瞰の水彩画',
  lead: 'この町に住む人は、どこへ働きに出ているのか。そして、どこから働きに来ているのか。<br />市区町村を選んで、人の行き来をご覧ください。',
  intro: [
    ['kei', 'こちらは、働きに出る町・来る町の窓口です。町に住んで働く人の仕事場がどこにあるかと、町へ働きに来る人の多さをお出しします。'],
    ['touko', '朝になると、町から人が出ていくの？'],
    ['kei', '町によっては、そうです。反対に、朝になると人が集まってくる町もあります。'],
  ],
  touko: [
    'よその町まで働きに行く人が、こんなにいるの？',
    '電車や車で通えるから、遠くても平気なのね。',
    'わたくしの頃は、歩いて行ける所で働くのがふつうだったわ。',
  ],
  notes: [
    '国勢調査によるもので、5年ごとの値です。',
    '「町の中で働く」「県内のほかの町で働く」「ほかの県で働く」の割合は、町に住んで働く人のうち、働く場所がわかっている人の合計に対するものです。',
    '「町の外から働きに来る人の割合」＝ほかの市区町村から通ってくる人÷その町で働く人（従業地による就業者）。',
    '政令指定都市の区は、表には出しますが、順位には入れていません。',
  ],
  cross: [['/town-commute/', '通勤の足は何か'], ['/town-commute-time/', '通勤に、どれだけかかるか'], ['/exhibits/day-night-ratio/', '展示「昼に人が集まる県」']],
  indicators: [
    { key: 'inTown', label: '町の中で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: HOME, calc: homeShare('F2701') },
    { key: 'inPref', label: '県内のほかの町で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: HOME, calc: homeShare('F2702') },
    { key: 'outPref', label: 'ほかの県で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: HOME, calc: homeShare('F2703') },
    { key: 'comeIn', label: '町の外から働きに来る人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F2803'], [F, 'F2801']], calc: (g) => pct(g('F2803'), g('F2801')) },
    { key: 'workHere', label: 'この町で働く人', table: F, code: 'F2801', unit: '人', decimals: 0, rankWord: '多い順' },
  ],
};
