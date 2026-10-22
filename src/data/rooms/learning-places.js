// 閲覧室「学びの場と集い」（都道府県・文化 G13xx・G16xx・G21xx・G52xx・G61xx。人口は A1101、65歳以上は A1303）
const G = '0000010107';
const A = '0000010101';
const per = (a, b, n) => (a === null || !b ? null : (a / b) * n);
const pop = [A, 'A1101'];
const old = [A, 'A1303'];
export const LEARNING_PLACES = {
  id: 'learning-places',
  scope: 'pref',
  path: '/learning-places/',
  description: '都道府県を選んで、公民館に似た施設や青少年教育施設の数、子ども・大人・高齢者向けの講座の数、NPO法人の数、老人クラブに入っている人の割合をご覧いただける窓口。',
  title: '学びの場と集い',
  shelf: '学校と学び',
  imageAlt: '縁側を開け放した木造の公民館で、和室ではお年寄りが編み物や囲碁を楽しみ、広間では大人たちが長机で講座を聞き、庭先では子どもたちが工作をしている水彩画',
  lead: '学校を出たあとも、人はどこで学び、集まっているのか。<br />講座や集いの場の数を、都道府県ごとにご覧ください。',
  intro: [
    ['hitoha', '先生、大人になってからも学ぶ場所というのは、どんなところですか。'],
    ['chiaki', '公民館に似た施設や青少年教育施設の数、子ども・大人・高齢者向けの講座の数を人口あたりで出そう。NPO法人の数と、老人クラブに入っている人の割合も並べた。'],
  ],
  hitoha: ['講座の数まで、県ごとに数えてあるんですね。', '老人クラブの加入率は、県でずいぶん違うんですね。', 'NPOの数は、人口あたりで見ると並びが変わりそうです。'],
  notes: [
    '施設と講座は、文部科学省の社会教育調査によるものです（3年ごとの調査）。講座は、教育委員会や公民館などが開いた学級・講座の数です。',
    'NPO法人は、認証を受けた特定非営利活動法人の数です。老人クラブの会員の割合は、会員数を65歳以上の人口で割った値です。',
    '人口あたりの値は、同じ年の人口で割って計算しています。',
  ],
  cross: [['/culture/', '文化施設'], ['/town-culture/', 'わが町の図書館と公民館'], ['/volunteer/', 'ボランティア']],
  indicators: [
    { key: 'hallLike', label: '公民館に似た施設（人口10万人あたり）', unit: '施設', decimals: 2, rankWord: '多い順', needs: [[G, 'G1301'], pop], carry: ['A1101'], calc: (g) => per(g('G1301'), g('A1101'), 1e5) },
    { key: 'youthPlace', label: '青少年教育施設（人口10万人あたり）', unit: '施設', decimals: 2, rankWord: '多い順', needs: [[G, 'G1602'], pop], carry: ['A1101'], calc: (g) => per(g('G1602'), g('A1101'), 1e5) },
    { key: 'hallJoin', label: '公民館の集まりに参加した延べ人数（人口100人あたり）', unit: '人', decimals: 1, rankWord: '多い順', needs: [[G, 'G1205'], pop], carry: ['A1101'], calc: (g) => per(g('G1205'), g('A1101'), 100) },
    { key: 'youthCourse', label: '子ども・若者向けの講座（人口10万人あたり）', unit: '講座', decimals: 1, rankWord: '多い順', needs: [[G, 'G2101'], pop], carry: ['A1101'], calc: (g) => per(g('G2101'), g('A1101'), 1e5) },
    { key: 'adultCourse', label: '大人向けの講座（人口10万人あたり）', unit: '講座', decimals: 1, rankWord: '多い順', needs: [[G, 'G2102'], pop], carry: ['A1101'], calc: (g) => per(g('G2102'), g('A1101'), 1e5) },
    { key: 'elderCourse', label: '高齢者向けの講座（65歳以上1万人あたり）', unit: '講座', decimals: 1, rankWord: '多い順', needs: [[G, 'G2104'], old], carry: ['A1303'], calc: (g) => per(g('G2104'), g('A1303'), 1e4) },
    { key: 'npo', label: 'NPO法人（人口10万人あたり）', unit: '法人', decimals: 1, rankWord: '多い順', needs: [[G, 'G6120'], pop], carry: ['A1101'], calc: (g) => per(g('G6120'), g('A1101'), 1e5) },
    { key: 'oldClub', label: '老人クラブに入っている人の割合（65歳以上）', unit: '％', decimals: 1, rankWord: '高い順', needs: [[G, 'G5202'], old], carry: ['A1303'], calc: (g) => per(g('G5202'), g('A1303'), 100) },
  ],
};
