// =====================================================
// Countopia Stats - 目的別の分析（読み解きの間）の設定
// src/data/analysis.js
//
// 総務省統計局『データ利活用実践ガイドブック EBPMのための』の PPDAC サイクル
//   Problem（問い）→ Plan（計画）→ Data（データ）→ Analysis（分析）→ Conclusion（結論）
// の順にページを組む。数字はすべて既存の窓口のデータ（/data/*.json）を画面で読む。
// 指標の書き方：
//   { id, src:'room', room:'窓口id', key:'項目key', short:'短い名前' }
//   { id, src:'std',  file:'population', code:'A1101', short }   … 前からある窓口のJSON（indicators[].code と areas[].v が同じ並び）
//   { id, src:'price', code:'C5701', short }                      … 消費者物価地域差指数（price-ledger.json）
//   note … 指標の注意（データの段に出す）
// 合算した総合点やランキングは作らない（県に点数をつけない）。
// =====================================================
export const THEMES = [
  {
    id: 'education',
    title: '教育を読み解く',
    kicker: 'EDUCATION',
    lead: '学校の大きさ、先生の数、かけているお金、学びの道具、卒業したあとの進路。県の教育のかたちを、一つの組で読み解きます。',
    question: 'この県の学校は、全国の中でどんなかたちをしているか。',
    subQuestions: [
      '学級や学校の大きさと、先生1人あたりの子どもの数は、全国と比べてどうか。',
      '子ども1人にかけている学校の費用は、学校の大きさとどう関係しているか。',
      '高校を出たあとの進路は、県内の大学の数とどう関係しているか。',
    ],
    indicators: [
      { id: 'classE', src: 'room', room: 'school-build', key: 'classE', short: '1学級あたりの児童数（小学校）' },
      { id: 'teacherE', src: 'room', room: 'school-build', key: 'teacherE', short: '先生1人あたりの児童数（小学校）' },
      { id: 'schoolE', src: 'room', room: 'school-build', key: 'schoolE', short: '1校あたりの児童数（小学校）' },
      { id: 'multiE', src: 'room', room: 'school-build', key: 'multiE', short: '複式学級の割合（公立小学校）' },
      { id: 'costE', src: 'std', file: 'education-budget', code: '#D0331503', short: '児童1人当たり公立小学校費', note: '地方財政の決算から計算した値です。施設の建て替えがあった年は大きく動きます。' },
      { id: 'costAll', src: 'std', file: 'education-budget', code: '#D0331403', short: '人口1人当たり教育費' },
      { id: 'pc', src: 'std', file: 'ict', code: 'E9404', short: '1人あたりの学習用PC台数（小学校）' },
      { id: 'univGo', src: 'room', room: 'after-school', key: 'univ', short: '高校卒業者の大学進学率' },
      { id: 'univLocal', src: 'room', room: 'after-school', key: 'univLocal', short: '地元の県の大学に入った人の割合' },
      { id: 'univN', src: 'room', room: 'colleges', key: 'univ', short: '大学の数（人口100万人あたり）' },
      { id: 'lend', src: 'room', room: 'library', key: 'lend', short: '図書館で借りた本（1人あたり）' },
      { id: 'fiscal', src: 'std', file: 'education-budget', code: '#D0110101', short: '財政力指数', note: '県の財政の余裕を示す指数（1に近いほど自前の税収でまかなえる）。教育の指標ではありませんが、費用を読むときの背景として置いています。' },
    ],
    pairs: [
      { x: 'schoolE', y: 'costE', why: '学校が小さい県ほど、子ども1人あたりの費用は大きくなるか。' },
      { x: 'classE', y: 'teacherE', why: '学級が大きい県ほど、先生1人あたりの子どもも多いか。' },
      { x: 'univN', y: 'univGo', why: '人口あたりの大学が多い県ほど、大学に進む人も多いか。' },
      { x: 'univN', y: 'univLocal', why: '大学が多い県ほど、地元の大学に入る人も多いか。' },
    ],
    trends: ['classE', 'teacherE', 'univGo'],
    cautions: [
      '学校の費用は、学校が小さい（子どもが少ない）県ほど1人あたりが大きくなりやすく、手厚さだけを表すものではありません。',
      '大学進学率は、県内の高校を出た人の進路です。県外の大学に進んだ人も含みます。',
    ],
    cannot: [
      'どの県の教育が「良い」か「悪い」かは、この組からは言えません。何を良しとするかは、数字の外の判断です。',
      '二つの項目がそろって動いていても、片方がもう片方の理由とは言えません（人口の少なさなど、別のものが両方を動かしていることがあります）。',
      '学力や子どもの満足度は、この組に入っていません。',
    ],
  },
  {
    id: 'living',
    title: '暮らしを読み解く',
    kicker: 'LIVING',
    lead: '稼ぎ、物価、家賃、家の広さ、家計のやりくり。県の暮らしの釣り合いを、一つの組で読み解きます。',
    question: 'この県の暮らしは、稼ぎと出ていくお金の釣り合いが、全国の中でどうなっているか。',
    subQuestions: [
      '給与の水準と、物価や家賃の水準は、そろって動いているか。',
      '家の広さや持ち家の多さは、家賃や土地の値段とどう関係しているか。',
      '家計の手取りのうち、どれだけを使っているか。',
    ],
    indicators: [
      { id: 'wageM', src: 'std', file: 'living', code: 'F620215', short: 'きまって支給する現金給与額（男）' },
      { id: 'wageF', src: 'std', file: 'living', code: 'F620216', short: 'きまって支給する現金給与額（女）' },
      { id: 'minWage', src: 'std', file: 'living', code: 'F6501', short: '地域別最低賃金' },
      { id: 'cpi', src: 'price', code: 'C5701', short: '物価の水準（総合・全国平均＝100）' },
      { id: 'cpiHouse', src: 'price', code: 'C5704', short: '物価の水準（住居・全国平均＝100）' },
      { id: 'rent', src: 'std', file: 'living', code: 'H410431', short: '1畳当たり家賃（民営借家）' },
      { id: 'land', src: 'room', room: 'land-price', key: 'residential', short: '住宅地の値段' },
      { id: 'own', src: 'std', file: 'living', code: 'OWNRATE', short: '持ち家率' },
      { id: 'tatami', src: 'room', room: 'home-space', key: 'tatamiPer', short: '1人あたりの畳の数' },
      { id: 'income', src: 'room', room: 'household', key: 'income', short: '実収入（勤労者世帯・1か月）', note: '家計調査の値で、県庁所在市の世帯の平均です。県全体の平均ではありません。' },
      { id: 'spend', src: 'room', room: 'household', key: 'spending', short: '消費支出（1か月）', note: '家計調査（県庁所在市）の値です。' },
      { id: 'propensity', src: 'room', room: 'household', key: 'propensity', short: '手取りのうち使った割合（平均消費性向）', note: '家計調査（県庁所在市）の値です。' },
    ],
    pairs: [
      { x: 'wageM', y: 'rent', why: '給与が高い県ほど、家賃も高いか。' },
      { x: 'wageM', y: 'cpi', why: '給与が高い県ほど、物価も高いか。' },
      { x: 'rent', y: 'own', why: '家賃が高い県ほど、持ち家は少ないか。' },
      { x: 'land', y: 'tatami', why: '土地が高い県ほど、1人あたりの家は狭いか。' },
    ],
    trends: ['land', 'income', 'spend'],
    cautions: [
      '物価の水準は「全国平均＝100」の指数で、円ではありません。',
      '家計の項目（実収入・消費支出・消費性向）は県庁所在市の世帯の値で、ほかの項目（県全体）と範囲がちがいます。',
      '給与は「きまって支給する現金給与額」で、賞与は含みません。',
    ],
    cannot: [
      'どの県が「暮らしやすい」かは、この組からは言えません。何を重く見るかで答えが変わり、点数にまとめると重みの付け方で順位がいくらでも動くからです。',
      '給与と物価がそろって高いことは分かっても、どちらがどちらの理由かは言えません。',
      '一人ひとりの暮らし向き（ばらつき）は、県の平均からは見えません。',
    ],
  },
];

export const PLANNED = [
  { title: '産業の稼ぐ力を読み解く', note: '地域経済分析システム（RESAS）の「稼ぐ力分析」にならい、産業ごとの付加価値額・従業者数・労働生産性の特化係数から、県の中核産業を見つけます。産業別のデータを新しく取り込むため、準備中です。' },
];
