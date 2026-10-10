// 別館「家計の帳場」（都道府県＝県庁所在市・家計 L3xxx・L4xxx）
const L = '0000010112';
export const HOUSEHOLD = {
  id: 'household',
  scope: 'pref',
  path: '/household/',
  annex: true,
  description: '都道府県（県庁所在市）を選んで、1か月の収入・可処分所得・消費支出と、食料・住居・光熱・教育・教養娯楽への支出、貯蓄の額をご覧いただける窓口。',
  title: '家計の帳場',
  shelf: '町の出納帳',
  lead: '世帯は、1か月にいくら受け取り、何にいくら使っているのか。<br />県庁所在市の家計簿を、県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、家計の帳場です。家計調査から、世帯の1か月の収入と支出をお出しします。'],
    ['touko', 'よその家の家計簿を、のぞいてもいいのかしら。'],
    ['kei', 'ご安心ください。協力してくださった多くの世帯の平均で、どこかの家のものではありません。'],
  ],
  notes: [
    '家計調査によるもので、その県の県庁所在市の値です（県全体の値ではありません）。調べる世帯の数が限られるため、年ごとの振れが大きいことがあります。',
    '実収入と可処分所得は、二人以上の世帯のうち勤め人の世帯（勤労者世帯）の1か月あたりの平均です。可処分所得＝実収入から税金や社会保険料を引いた額。',
    '消費支出とその内訳は、二人以上の世帯（勤め人以外の世帯も含む）の1か月あたりの平均です。',
    '貯蓄現在高は、全国家計構造調査（5年ごと）による二人以上の世帯の平均で、万円にそろえています（元の表は千円単位）。',
  ],
  cross: [['/prices/', '物価の帳場'], ['/living/', '暮らしの見積所'], ['/pref-economy/', '県のふところ']],
  indicators: [
    { key: 'income', label: '実収入（1か月）', table: L, code: 'L3110', decimals: 0, rankWord: '多い順' },
    { key: 'disposable', label: '可処分所得（1か月）', table: L, code: 'L3130', decimals: 0, rankWord: '多い順' },
    { key: 'spending', label: '消費支出（1か月）', table: L, code: 'L3221', decimals: 0, rankWord: '多い順' },
    { key: 'food', label: '食料費', table: L, code: 'L322101', decimals: 0, rankWord: '多い順' },
    { key: 'housing', label: '住居費', table: L, code: 'L322102', decimals: 0, rankWord: '多い順' },
    { key: 'utility', label: '光熱・水道費', table: L, code: 'L322103', decimals: 0, rankWord: '多い順' },
    { key: 'education', label: '教育費', table: L, code: 'L322108', decimals: 0, rankWord: '多い順' },
    { key: 'leisure', label: '教養娯楽費', table: L, code: 'L322109', decimals: 0, rankWord: '多い順' },
    { key: 'savings', label: '貯蓄現在高', table: L, code: 'L730101', unit: '万円', scale: 0.1, decimals: 0, rankWord: '多い順' },
  ],
};
