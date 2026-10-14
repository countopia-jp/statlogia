// 閲覧室「消防と救急」（都道府県・安全 K11xx・K12xx・K21xx、人口あたりは A1101 で割る）
const K = '0000010111';
const A = '0000010101';
const per = (a, pop, n) => (a === null || !pop ? null : (a / pop) * n);
const pop = [A, 'A1101'];
export const FIRE_EMS = {
  id: 'fire-ems',
  scope: 'pref',
  path: '/fire-ems/',
  description: '都道府県を選んで、消防署や消防団、消防車・救急車の数、消火栓や防火水槽の数と、救急の出動、火事の件数を、人口あたりでご覧いただける窓口。',
  title: '消防と救急',
  shelf: '近くにあるもの',
  imageAlt: '夕方の町の消防署の車庫に消防車と救急車が並び、隊員が点検し、隣に火の見やぐらが立つ水彩画',
  lead: '火事や急病のとき、駆けつけてくれる人と車はどれだけあるのか。<br />消防と救急の数字を、人口あたりに直して都道府県ごとにご覧ください。',
  intro: [
    ['kei', 'こちらは、消防と救急の窓口です。消防署や消防団、救急車の数と、出動の回数をお出しします。'],
    ['touko', '人の多い県ほど、数も多くなるのではなくて？'],
    ['kei', 'ですから、人口10万人あたりに直してあります。大きな県も小さな県も、同じ物差しでくらべられます。'],
  ],
  touko: [
    '救急車？　呼べば来てくれる車があるの？',
    'わたくしの時代では、火の見やぐらで半鐘を鳴らすのよ。',
    '消防団の人の数まで、ちゃんと数えてあるのね。',
  ],
  notes: [
    '消防署・消防職員・消防団員・救急自動車・救急出動件数・出火件数は、総務省消防庁の調べによるものです（e-Stat 社会・人口統計体系）。',
    '人口あたりの値は、同じ年の総人口で割って計算しています。',
    '消防署の数は、消防本部と消防署をあわせた数です。出張所は含みません。',
    '消防水利は、消火栓・防火水槽・池や川など、火を消すために水をとれる場所の数です。消防吏員は、消防職員のうち階級をもつ人（消火・救急・救助などにあたる人）です。消防分団は、消防団の下で地域ごとに分かれた組です。',
  ],
  cross: [['/disaster/', '自然災害の帳場'], ['/town-medical/', 'わが町の医療'], ['/town-daycare/', '介護は近いか']],
  indicators: [
    { key: 'stations', label: '消防本部・署（人口10万人あたり）', unit: '署', decimals: 2, rankWord: '多い順', needs: [[K, 'K1101'], pop], carry: ['A1101'], calc: (g) => per(g('K1101'), g('A1101'), 1e5) },
    { key: 'staff', label: '消防職員（人口10万人あたり）', unit: '人', decimals: 1, rankWord: '多い順', needs: [[K, 'K1102'], pop], carry: ['A1101'], calc: (g) => per(g('K1102'), g('A1101'), 1e5) },
    { key: 'volunteers', label: '消防団員（人口10万人あたり）', unit: '人', decimals: 1, rankWord: '多い順', needs: [[K, 'K1105'], pop], carry: ['A1101'], calc: (g) => per(g('K1105'), g('A1101'), 1e5) },
    { key: 'ambulances', label: '救急自動車（人口10万人あたり）', unit: '台', decimals: 1, rankWord: '多い順', needs: [[K, 'K1209'], pop], carry: ['A1101'], calc: (g) => per(g('K1209'), g('A1101'), 1e5) },
    { key: 'emsCalls', label: '救急出動（人口1000人あたり）', unit: '件', decimals: 1, rankWord: '多い順', needs: [[K, 'K1210'], pop], carry: ['A1101'], calc: (g) => per(g('K1210'), g('A1101'), 1e3) },
    { key: 'pumps', label: '消防ポンプ自動車など（人口10万人あたり）', unit: '台', decimals: 1, rankWord: '多い順', needs: [[K, 'K1106'], pop], carry: ['A1101'], calc: (g) => per(g('K1106'), g('A1101'), 1e5) },
    { key: 'water', label: '消防水利（人口1000人あたり）', unit: '所', decimals: 1, rankWord: '多い順', needs: [[K, 'K1107'], pop], carry: ['A1101'], calc: (g) => per(g('K1107'), g('A1101'), 1e3) },
    { key: 'hydrants', label: '消火栓（人口1000人あたり）', unit: '所', decimals: 1, rankWord: '多い順', needs: [[K, 'K1108'], pop], carry: ['A1101'], calc: (g) => per(g('K1108'), g('A1101'), 1e3) },
    { key: 'tanks', label: '防火水槽（人口1000人あたり）', unit: '所', decimals: 1, rankWord: '多い順', needs: [[K, 'K1109'], pop], carry: ['A1101'], calc: (g) => per(g('K1109'), g('A1101'), 1e3) },
    { key: 'firefighters', label: '消防吏員（人口10万人あたり）', unit: '人', decimals: 1, rankWord: '多い順', needs: [[K, 'K1103'], pop], carry: ['A1101'], calc: (g) => per(g('K1103'), g('A1101'), 1e5) },
    { key: 'brigades', label: '消防分団（人口10万人あたり）', unit: '団', decimals: 1, rankWord: '多い順', needs: [[K, 'K110402'], pop], carry: ['A1101'], calc: (g) => per(g('K110402'), g('A1101'), 1e5) },
    { key: 'fires', label: '出火件数（人口10万人あたり）', unit: '件', decimals: 1, rankWord: '多い順', needs: [[K, 'K2101'], pop], carry: ['A1101'], calc: (g) => per(g('K2101'), g('A1101'), 1e5) },
    { key: 'buildingFires', label: '建物火災（人口10万人あたり）', unit: '件', decimals: 1, rankWord: '多い順', needs: [[K, 'K2102'], pop], carry: ['A1101'], calc: (g) => per(g('K2102'), g('A1101'), 1e5) },
  ],
};
