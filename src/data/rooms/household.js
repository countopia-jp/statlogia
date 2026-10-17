// 別館「家計の帳場」（都道府県＝県庁所在市・家計 L3xxx・L4xxx）
const L = '0000010112';
export const HOUSEHOLD = {
  id: 'household',
  scope: 'pref',
  path: '/household/',
  annex: true,
  description: '都道府県（県庁所在市）を選んで、1か月の収入・可処分所得・消費支出と、食料・住居・光熱・教育・教養娯楽などへの支出をご覧いただける窓口。',
  title: '家計の帳場',
  imageAlt: '夜の台所のテーブルで、電卓を手に家計簿をつける母親と、のぞき込む父親の水彩画',
  shelf: '暮らしの台帳',
  lead: '世帯は、1か月にいくら受け取り、何にいくら使っているのか。<br />県庁所在市の家計簿を、県ごとにご覧ください。',
  intro: [
    ['shiori', 'こちらは家計の帳場です。家計調査の帳票なら、わたしの係にも回ってきますよ。世帯の1か月の収入と支出をお出ししますね。'],
    ['shiori', 'まず「収入」と「支出」の欄を分けて見ると、読みやすいんです。ここにあるのは、協力してくださった多くの世帯の平均で、どこかひとつの家のものではありません。'],
  ],
  shiori: [
    '「消費支出」は、食べ物や住まい、光熱など、暮らしに使ったお金の合計なんです。',
    '税金や社会保険料は、暮らしに使うお金とは別の欄で数えるんですよ。',
    '平均消費性向は、手取りのうち、どれだけを暮らしに使ったかの割合なんです。',
  ],
  notes: [
    '家計調査によるもので、その県の県庁所在市の値です（県全体の値ではありません）。調べる世帯の数が限られるため、年ごとの振れが大きいことがあります。',
    '実収入と可処分所得は、二人以上の世帯のうち勤め人の世帯（勤労者世帯）の1か月あたりの平均です。可処分所得＝実収入から税金や社会保険料を引いた額。平均消費性向は、勤労者世帯の消費支出を可処分所得で割った値です。',
    '消費支出とその内訳は、二人以上の世帯（勤め人以外の世帯も含む）の1か月あたりの平均です。',
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
    { key: 'furniture', label: '家具・家事用品費', table: L, code: 'L322104', decimals: 0, rankWord: '多い順' },
    { key: 'clothes', label: '被服及び履物費', table: L, code: 'L322105', decimals: 0, rankWord: '多い順' },
    { key: 'medical', label: '保健医療費', table: L, code: 'L322106', decimals: 0, rankWord: '多い順' },
    { key: 'transport', label: '交通・通信費', table: L, code: 'L322107', decimals: 0, rankWord: '多い順' },
    { key: 'other', label: 'その他の消費支出', table: L, code: 'L322110', decimals: 0, rankWord: '多い順' },
    { key: 'propensity', label: '手取りのうち使った割合（平均消費性向）', unit: '％', decimals: 1, rankWord: '高い順', needs: [[L, 'L3211'], [L, 'L3130']], calc: (g) => (g('L3211') === null || !g('L3130') ? null : (g('L3211') / g('L3130')) * 100) },
  ],
};
