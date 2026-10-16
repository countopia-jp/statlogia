// 別館「働き方の帳場」（都道府県・労働 F11xx・F24xx・F21xx）
const F = '0000010106';
const A = '0000010101';
const per = (a, b, n) => (a === null || !b ? null : (a / b) * n);
const pct = (a, b) => (a === null || b === null || !b ? null : (a / b) * 100);
const EMP = [[F, 'F2409'], [F, 'F2410'], [F, 'F2411']];
const empShare = (code) => (g) => {
  const a = g('F2409'), b = g('F2410'), c = g('F2411');
  if (a === null || b === null || c === null || a + b + c === 0) return null;
  return (g(code) / (a + b + c)) * 100;
};
export const WORK_STYLE = {
  id: 'work-style',
  scope: 'pref',
  path: '/work-style/',
  annex: true,
  description: '都道府県を選んで、完全失業率・働いている人の割合・正社員とパートや派遣の割合・65歳以上で働く人の割合、ハローワークで仕事を探した人と就職した人の割合、高校新卒の求人倍率を、全国の順位と移りかわりでご覧いただける窓口。',
  title: '働き方の帳場',
  imageAlt: '朝の町の交差点で、出勤する勤め人、店の準備をする人、荷を積む若者、畑へ向かう人、登校を見守る警備員が行き交う水彩画',
  shelf: '町の出納帳',
  lead: '仕事を探している人は、どれだけいるのか。<br />正社員、パート、派遣。県ごとの働き方の内訳をご覧ください。',
  intro: [
    ['shiori', 'わたしたちBGも、毎朝満員の電車で役所へ通っているんですよ。こちらは働き方の帳場で、仕事についている人と探している人の割合、それに雇われ方の内訳をお出しします。'],
    ['shiori', '完全失業率は、働く意思があって仕事を探しているのに、仕事についていない人の割合なんです。家事や通学で働いていない人は、数に入りません。'],
  ],
  shiori: [
    '家事や通学で働いていない人は、完全失業者の欄には入らないんです。',
    '「雇用者」は、会社や役所に雇われて働いている人の欄なんですよ。',
    '求人倍率は、仕事を探す人ひとりに、求人がいくつあるかを表す数なんです。',
  ],
  notes: [
    '国勢調査によるもので、5年ごとの値です。',
    '完全失業率＝完全失業者÷労働力人口。労働力率＝労働力人口÷（労働力人口＋非労働力人口）。',
    '雇われ方の割合は、正規の職員・従業員、派遣社員、パート・アルバイト・その他の合計に対するものです（役員や自営業の人は入りません）。',
    '65歳以上で働く人の割合は、働いている人全体のうち65歳以上の人の割合です。',
    'ハローワークの数字は厚生労働省の職業安定業務統計（年度の合計）によるもので、民間の求人サイトや知り合いの紹介で決まった仕事は入りません。「新しく仕事を探し始めた人」は新規学卒者とパートタイムを除いた数です。高校新卒の求人倍率は、就職を希望する高校卒業予定者1人あたりの求人の数です。',
  ],
  cross: [['/town-work/', 'わが町の仕事'], ['/living/', '暮らしの見積所'], ['/pref-economy/', '県のふところ']],
  indicators: [
    { key: 'unemployment', label: '完全失業率', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F1107'], [F, 'F1101']], calc: (g) => pct(g('F1107'), g('F1101')) },
    { key: 'labor', label: '労働力率', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F1101'], [F, 'F1108']], calc: (g) => (g('F1101') === null || g('F1108') === null ? null : pct(g('F1101'), g('F1101') + g('F1108'))) },
    { key: 'laborWomen', label: '女性の労働力率', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F110102'], [F, 'F110802']], calc: (g) => (g('F110102') === null || g('F110802') === null ? null : pct(g('F110102'), g('F110102') + g('F110802'))) },
    { key: 'regular', label: '正規の職員・従業員の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: EMP, calc: empShare('F2409') },
    { key: 'partTime', label: 'パート・アルバイトなどの割合', unit: '％', decimals: 1, rankWord: '高い順', needs: EMP, calc: empShare('F2411') },
    { key: 'dispatch', label: '派遣社員の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: EMP, calc: empShare('F2410') },
    { key: 'elderly', label: '働く人のうち65歳以上の割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F2116'], [F, 'F1102']], calc: (g) => pct(g('F2116'), g('F1102')) },
    { key: 'workers', label: '働いている人', table: F, code: 'F1102', decimals: 0, rankWord: '多い順' },
    { key: 'newSeek', label: 'ハローワークで新しく仕事を探し始めた人（人口1000人あたり）', unit: '件', decimals: 1, rankWord: '多い順', needs: [[F, 'F3101'], [A, 'A1101']], carry: ['A1101'], calc: (g) => per(g('F3101'), g('A1101'), 1e3) },
    { key: 'placeRate', label: '仕事を探し始めた人のうち就職した割合', unit: '％', decimals: 1, rankWord: '高い順', needs: [[F, 'F3105'], [F, 'F3101']], calc: (g) => per(g('F3105'), g('F3101'), 100) },
    { key: 'hsRatio', label: '高校新卒の求人倍率', unit: '倍', decimals: 2, rankWord: '高い順', needs: [[F, 'F3312'], [F, 'F3302']], calc: (g) => per(g('F3312'), g('F3302'), 1) },
  ],
};
