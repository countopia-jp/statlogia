// =====================================================
// Countopia Stats - 展示の一覧
// src/data/exhibits.js
//
// 展示を1本作ったら、ここに1件足すだけ。
// 展示一覧・玄関のカード・出典一覧のページ名が、すべてここから作られる。
//
// スキーマ:
//   no     展示番号（表示に使う）
//   href   ページのパス
//   title  見出し
//   lead   一覧カードの説明文
//   place  所属する広場（time / housing / living）
// =====================================================

export const PLACES = {
  time: '時間の広場',
  housing: '住まいの広場',
  living: '暮らしの広場',
};

export const exhibits = [
  { no: 1, href: '/exhibits/sleep/', place: 'time',
    title: '日本一「眠らない県」はどこだ',
    lead: '睡眠時間の都道府県ランキング。1位と最下位の差は、1年でまる5日ぶん。' },
  { no: 2, href: '/exhibits/commute/', place: 'time',
    title: '日本一「通勤に時間がかかる」県はどこだ',
    lead: '通勤・通学時間のランキング。1位は意外な、あの県。' },
  { no: 3, href: '/exhibits/housework/', place: 'time',
    title: '家事時間の男女差、いちばん大きい県は',
    lead: '男女別の家事時間を47都道府県で比較。どの県でも見える、ひとつの景色。' },
  { no: 4, href: '/exhibits/hobby/', place: 'time',
    title: 'いちばん「趣味に生きる」県はどこだ',
    lead: '趣味・娯楽時間のランキング。1位はまさかの、あの都。' },
  { no: 5, href: '/exhibits/study/', place: 'time',
    title: '日本の大人は、1日何分学ぶのか',
    lead: '学習・自己啓発・訓練の時間を47都道府県で比較。趣味の時間とくらべると、その差は歴然。' },
  { no: 6, href: '/exhibits/vacancy/', place: 'housing',
    title: '日本一「空き家が多い」県はどこだ',
    lead: '総住宅数に占める空き家の割合を47都道府県で比較。誰も住んでいない家は、どれくらいあるのか。' },
  { no: 7, href: '/exhibits/cars/', place: 'living',
    title: '日本一の「クルマ社会」はどの県だ',
    lead: '二人以上の世帯の1世帯当たり自動車保有台数を47都道府県で比較。車は、地方の暮らしの必需品。' },
  { no: 8, href: '/exhibits/food/', place: 'living',
    title: '日本一の「外食の街」はどの県だ',
    lead: '人口千人当たりの飲食店数を47都道府県で比較。いちばん大きな街が、いちばん多いとは限りません。' },
  { no: 9, href: '/exhibits/day-night-ratio/', place: 'time',
    title: '日本一「昼に人が集まる」県はどこだ',
    lead: '昼夜間人口比率を47都道府県で比較。通勤・通学で、昼に人が増える県はどこか。' },
  { no: 10, href: '/exhibits/fishing/', place: 'living',
    title: '日本一「釣りをする」県はどこだ',
    lead: '過去1年間につりをした人の割合を47都道府県で比較。海の近さだけでは、決まらないようです。' },
  { no: 11, href: '/exhibits/pachinko/', place: 'living',
    title: '日本一「パチンコをする」県はどこだ',
    lead: '過去1年間にパチンコをした人の割合を47都道府県で比較。九州が上位に並ぶなか、沖縄だけが最下位。' },
  { no: 12, href: '/exhibits/price/', place: 'living',
    title: '日本一「物価が高い」県はどこだ',
    lead: '消費者物価地域差指数を47都道府県で比較。食べものだけを見ると、順番はすっかり変わります。' },
  { no: 13, href: '/exhibits/hiking/', place: 'living',
    title: '日本一「山を歩く」県はどこだ',
    lead: '過去1年間に登山やハイキングをした人の割合を47都道府県で比較。山の多い県が、上位とは限りません。' },
  { no: 14, href: '/exhibits/utility/', place: 'living',
    title: '日本一「電気やガスが高い」県はどこだ',
    lead: '光熱・水道の消費者物価地域差指数を47都道府県で比較。上と下の開きは、総合の何倍もあります。' },
  { no: 15, href: '/exhibits/reading/', place: 'living',
    title: '本とマンガ、日本一はどの県だ',
    lead: '過去1年間に本を読んだ人の割合を47都道府県で比較。マンガを見ると、また別の景色が現れます。' },
  { no: 16, href: '/exhibits/education-price/', place: 'living',
    title: '日本一「教育にお金がかかる」県はどこだ',
    lead: '教育の消費者物価地域差指数を47都道府県で比較。電気やガスとは、まるで逆の並びになります。' },
  { no: 17, href: '/exhibits/waste/', place: 'living',
    title: '日本一「ごみを出す」県はどこだ',
    lead: '1人が1日に出すごみの量を47都道府県で比較。全国の量は、この18年でずいぶん減りました。' },
  { no: 18, href: '/exhibits/sunshine/', place: 'living',
    title: '日本一「晴れる」県はどこだ',
    lead: '1年に日が差した時間を47都道府県で比較。「快晴の日」を数えると、順番は変わります。' },
  { no: 19, href: '/exhibits/gyoza/', place: 'living',
    title: '日本一「餃子が好き」な市はどこだ',
    lead: '1世帯が1年間にぎょうざへ使ったお金を52市で比較。四半世紀の推移を折れ線で追います。' },
  { no: 20, href: '/exhibits/board-games/', place: 'living',
    title: '将棋と囲碁、日本一はどの県だ',
    lead: '将棋を指した人の割合を47都道府県で比較。囲碁を数えると、一番の県が入れかわります。' },
];

// 出典一覧などで使う「パス→表示名」の辞書
export const exhibitNameOf = new Map(
  exhibits.map((e) => [e.href, `展示${String(e.no).padStart(2, '0')}　${e.title}`])
);