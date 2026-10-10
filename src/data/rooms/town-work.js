// 閲覧室「わが町の仕事」（市区町村・労働 F22xx／経済基盤 C2107・C2207）
const F = '0000020106';
const C = '0000020103';
const share = (code) => (g) => {
  const a = g('F2201'), b = g('F2211'), c = g('F2221');
  if (a === null || b === null || c === null || a + b + c === 0) return null;
  return (g(code) / (a + b + c)) * 100;
};
const SECTORS = [[F, 'F2201'], [F, 'F2211'], [F, 'F2221']];
export const TOWN_WORK = {
  id: 'town-work',
  scope: 'town',
  path: '/town-work/',
  description: '市区町村を選んで、田畑や海の仕事・ものづくり・お店やサービスの仕事に就く人の割合と、事業所や働く人の数を、全国と県内の順位でご覧いただける窓口。',
  title: 'わが町の仕事',
  shelf: '仕事と産業',
  imageAlt: '田んぼで稲を刈る人、町工場で働く人、商店街の店先、川辺の漁船が一つの町に収まった鳥瞰の水彩画',
  lead: 'この町で働く人は、田畑や海、ものづくり、お店やサービスのどこにいるのか。<br />市区町村を選んで、町の仕事の顔ぶれをご覧ください。',
  intro: [
    ['kei', 'こちらは、わが町の仕事の窓口です。町に住んで働く人が、どの仕事に就いているかをお出しします。'],
    ['touko', '仕事の分けかたが、あるのね。'],
    ['kei', 'はい。田畑や山や海の仕事を第1次産業、ものづくりや工事を第2次産業、お店やサービスの仕事を第3次産業と呼びます。'],
  ],
  notes: [
    '産業別の就業者は国勢調査によるもので、その町に住んでいる人を、働いている産業で分けています（町の外へ働きに出ている人も含みます）。割合は、第1次・第2次・第3次産業の就業者の合計に対するものです（分類できない人を除きます）。',
    '事業所数と従業者数は経済センサスによるもので、その町にある民営の事業所と、そこで働く人の数です（町の外から通う人も含みます。国や自治体の事業所は入りません）。',
    '政令指定都市の区は、表には出しますが、順位には入れていません。',
  ],
  cross: [['/town-shops/', '工場とお店'], ['/town-commute/', '通勤の足は何か'], ['/town-population/', 'わが町の人口']],
  indicators: [
    { key: 'primary', label: '第1次産業で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: SECTORS, calc: share('F2201') },
    { key: 'secondary', label: '第2次産業で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: SECTORS, calc: share('F2211') },
    { key: 'tertiary', label: '第3次産業で働く人の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: SECTORS, calc: share('F2221') },
    { key: 'workers', label: '働いている人（町に住む人）', table: F, code: 'F1102', decimals: 0, rankWord: '多い順' },
    { key: 'offices', label: '町にある事業所（民営）', table: C, code: 'C2108', decimals: 0, rankWord: '多い順' },
    { key: 'employees', label: '町の事業所で働く人（民営）', table: C, code: 'C2208', decimals: 0, rankWord: '多い順' },
  ],
};
