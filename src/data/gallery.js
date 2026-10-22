// =====================================================
// Statlogia - 日々のイラスト集（研究員ごと）
// src/data/gallery.js
// 画像は public/images/chara/ に置く。date は表示用（新しい順に並べる）。
// 絵を足したら、ここに一行足すだけでよい。
// =====================================================
export const PEOPLE = {
  chiaki: { name: '知秋', romaji: 'CHIAKI', role: '教授', title: '知秋の日々', lead: '研究室の外の知秋。数字のない時間の記録です。' },
  hitoha: { name: '一葉', romaji: 'HITOHA', role: '研究員（見習い）', title: '一葉の日々', lead: '白衣を脱いだ一葉。数字のない時間の記録です。' },
};

export const GALLERY = [
  { who: 'chiaki', file: 'duo-sushi.webp', w: 1376, h: 768, date: '2026-10-24', title: 'わさび山', caption: '回転寿司。皿の数より、わさびの量のほうが先に限界に来た。', talk: [['hitoha', '先生、わさびは薬味です。主食ではありません。'], ['chiaki', '比率の問題だ。一貫に一山、それがわたしの標準だ。'], ['hitoha', 'その標準、全国平均からどれだけ離れているか計算しましょうか。']] },
  { who: 'hitoha', file: 'duo-sushi-b.webp', w: 1376, h: 774, date: '2026-10-24', title: '隣の山は見ない', caption: '同じ店、同じ席。見てはいけないものは、見ないことにしている。', talk: [['chiaki', '君、さっきから皿が進んでいないな。'], ['hitoha', '隣の山が気になって。'], ['chiaki', '見なければよい。標本に入れなければ、存在しないのと同じだ。'], ['hitoha', '……先生、それ、お寿司のほうが薬味ですよね？']] },
  { who: 'chiaki', file: 'chiaki-ramen.webp', w: 1376, h: 768, date: '2026-10-23', title: '七味は多めで', caption: '町のラーメン屋。瓶が空になるまで振る。店主はもう何も言わない。', talk: [['hitoha', '先生、このごろ辛いものの統計ばかり引いていませんか。'], ['chiaki', '食の統計は重要だ。君こそ、甘味の表を引くときだけ口数が三倍になる。'], ['hitoha', '……あれは、データが豊富なので。']] },
  { who: 'chiaki', file: 'chiaki-fishing.webp', w: 1376, h: 768, date: '2026-10-23', title: '釣れない', caption: '川辺で半日。浮きは動かない。標本が小さいと結論は出ない、と言い張る。', talk: [['hitoha', '先生、ところで、おいくつなんですか。'], ['chiaki', '情報棟で調べたまえ。'], ['hitoha', '情報棟にあるのは県や町をまとめた数字だけで、個人の情報はないですよね。'], ['chiaki', 'うむ。だから分からん。']] },
  { who: 'hitoha', file: 'hitoha-cakeshop.webp', w: 1376, h: 768, date: '2026-10-23', title: 'ケーキ屋の前で', caption: 'フィナンシェは見当たらない。それでも、ショーケースの前からは動けない。', talk: [['chiaki', '君、ケーキ屋の前だと歩く速さが半分になるな。'], ['hitoha', '観察対象です。'], ['chiaki', '観察対象を、毎回箱で持ち帰るのかね。']] },
  { who: 'hitoha', file: 'hitoha-private.webp', w: 1376, h: 768, date: '2026-10-22', title: '休日の朝', caption: '眼鏡を外して、マグを両手で。読みかけの帳面は枕元に。' },
  { who: 'chiaki', file: 'chiaki-nap.webp', w: 1376, h: 774, date: '2026-10-22', title: '寝落ち', caption: '研究室のソファで。計算を回したまま、靴だけ脱いで。' },
  { who: 'hitoha', file: 'hitoha-nightnoodle.webp', w: 1376, h: 774, date: '2026-10-22', title: '夜食', caption: '寮の台所で。湯を注いで三分、その間に帳面を一ページ。' },
  { who: 'chiaki', file: 'chiaki-deskbar.webp', w: 1376, h: 774, date: '2026-10-22', title: '片手で昼食', caption: '三つの画面を見ながら、袋のまま。皿を出す時間が惜しい日。' },
  { who: 'chiaki', file: 'duo-cookie.webp', w: 1376, h: 774, date: '2026-10-25', title: 'あたりは一つ', caption: '一葉のクッキー缶。一枚だけ中身がわさび。', talk: [['hitoha', '先生、チョコクッキーです。どうぞ。'], ['hitoha', '……一つだけ、中身がわさびなんですけど。'], ['chiaki', 'なんだ。あたりが一つしかないのか。']] },
  { who: 'hitoha', file: 'duo-cookie-b.webp', w: 1376, h: 774, date: '2026-10-25', title: '一枚だけ', caption: 'クッキー缶に、わさび入りを一枚だけ忍ばせた。先生は一枚目で引いた。', talk: [['hitoha', 'わさび入りは二十枚に一枚ですよ。一枚目で引きますか、ふつう。'], ['chiaki', '確率二十分の一は、起きないという意味ではない。'], ['hitoha', '……先生、香りで探ってますよね？']] },
];

export const galleryOf = (who) => GALLERY.filter((g) => g.who === who).sort((a, b) => (a.date < b.date ? 1 : -1));
