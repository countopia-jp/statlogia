// 2つの指標をくらべる展示（PairExhibit）の取り方。玄関の「いまの展示」で、新しい順に3つを出すのに使う
// kind: 'kakei'＝家計調査（市・円）／'act'＝社会生活基本調査の行動者率（県・％）
const SPORT = '0003456409';
export const EXHIBIT_PAIRS = {
  'coffee-tea': { kind: 'kakei', a: '011020010', b: '011010010', short: 'コーヒー' },
  'bread-rice': { kind: 'kakei', a: '010120000', b: '010110001', short: 'パン' },
  'movies-art': { kind: 'act', a: '04', b: '02', short: '映画館' },
  'camp-park': { kind: 'act', a: '34', b: '33', short: 'キャンプ' },
  'cake-manju': { kind: 'kakei', a: '010800050', b: '010800020', short: 'ケーキ' },
  'tuna-salmon': { kind: 'kakei', a: '010211010', b: '010211060', short: 'マグロ' },
  'spectator': { kind: 'act', a: '01', b: '03', short: 'スポーツ観戦' },
  'jogging-walking': { kind: 'act', a: '19', b: '20', stats: SPORT, short: 'ジョギング' },
  'concert': { kind: 'act', a: '06', b: '07', short: 'クラシック' },
  'table-tennis': { kind: 'act', a: '06', b: '08', stats: SPORT, short: '卓球' },
  'soba-ramen': { kind: 'kakei', a: '011211010', b: '011211020', short: 'そば・うどん' },
  'natto-tofu': { kind: 'kakei', a: '010530030', b: '010530010', short: '納豆' },
  'golf-bowling': { kind: 'act', a: '09', b: '13', stats: SPORT, short: 'ゴルフ' },
  'painting-pottery': { kind: 'act', a: '23', b: '24', short: '絵画・彫刻' },
  'sake-beer': { kind: 'kakei', a: '011100010', b: '011100030', short: '日本酒' },
  'senbei-chocolate': { kind: 'kakei', a: '010800090', b: '010800130', short: 'せんべい' },
};
