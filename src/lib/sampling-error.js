// =====================================================
// Statlogia - 標本調査の「誤差の幅」の目安
// src/lib/sampling-error.js
//
// 数字のもとは src/data/sampling-error.json（総務省統計局の公表資料から作った控え）
//  ・社会生活基本調査（令和3年）：都道府県別の標準誤差率（％）
//      調査票A 第7表 スポーツ・第8表 趣味・娯楽の種類別行動者数（e-Stat の cat03 と同じ番号）
//      第13表 行動の種類別総平均時間（週全体、総数・男・女）
//      https://www.stat.go.jp/data/shakai/2021/gosa.html
//    行動者率は行動者数を人口で割った値で、人口は別の推計にそろえてあるため、
//    行動者数の標準誤差率をそのまま行動者率の目安に使う
//  ・家計調査（令和5年 標本設計）：品目ごとの変動係数（全国、第3表）と市ごとの集計世帯数（第2-1表）
//      https://www.stat.go.jp/data/kakei/hyohon2023.html
//    市ごとの標準誤差率は公表されていないので、統計局の参考資料（変動係数を用いて推計した
//    標準誤差率）の近似式  標準誤差率 ≒ 1.3 × 変動係数 ÷ √集計世帯数  で求める。
//    年平均は12か月分なので集計世帯数は月平均の12倍。市ごとの品目の変動係数は公表されていないので、
//    全国の品目の変動係数に、その品目が入る分類（小分類か中分類）の「市の変動係数÷全国の変動係数」
//    （第2-1表）を掛けて市の値とする。全国について計算すると公表値とほぼ一致する
//
// 幅は「値 ± 1.96 × 標準誤差」（95％の目安）
// 作り直し：統計局のExcel（2021gosaA007/A008/A013、hyohon2023 の 2-1・3）から
//   ~/gosa/py/build_se.py で src/data/sampling-error.json を書き出す（家計は使う品目コードだけ）
// =====================================================
import SE from '../data/sampling-error.json' with { type: 'json' };

const Z = 1.96;

// 社会生活基本調査の行動者率：statsId（0003456409 スポーツ／0003456573 趣味・娯楽）と cat03
// 戻り値は 地域コード（01000 など）→ 標準誤差率（％）
export function seActivity(statsId, cat03) {
  const m = SE.shakai.act[statsId]?.[cat03];
  if (!m) throw new Error(`[sampling-error.js] 標準誤差率がありません: ${statsId} ${cat03}`);
  return m;
}

const PREF_NAMES = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
const clean = (s) => String(s || '').replace(/^\d+_?\s*/, '').trim();

// 社会生活基本調査の総平均時間：行動の名前（「睡眠」「家事」など）と男女（total/male/female）
// 戻り値は 県名 → 標準誤差率（％）
export function seTime(activityWord, sex = 'total') {
  const key = Object.keys(SE.shakai.time).find((k) => k.includes(activityWord) && !k.includes('除く'));
  const m = key && SE.shakai.time[key][sex];
  if (!m) throw new Error(`[sampling-error.js] 標準誤差率がありません: ${activityWord} ${sex}`);
  const out = {};
  PREF_NAMES.forEach((n, i) => { out[n] = m[String(i + 1).padStart(2, '0') + '000']; });
  return out;
}

// 家計調査の品目（2025年改定の cat01 コード）：戻り値は 市の名前 → 標準誤差率（％）
export function seKakei(code) {
  const cv = SE.kakei.cv[code];
  if (cv === undefined) throw new Error(`[sampling-error.js] 変動係数がありません: ${code}`);
  const out = {};
  const ratio = SE.kakei.cityRatio[code] || {};
  for (const [city, n] of Object.entries(SE.kakei.cityMonthly)) out[city] = (1.3 * cv * (ratio[city] ?? 1)) / Math.sqrt(12 * n);
  return out;
}

// 閲覧室（別館）の家計の窓口：県＝県庁所在市の値。市ごとの変動係数（第2-1表）が公表されている行
// （二人以上の世帯の消費支出と10大費目、勤労者世帯の実収入・可処分所得）は、その市の変動係数をそのまま使う
// 戻り値は 県コード（01000 など）→ 標準誤差率（％）
const CAPITALS = ['札幌市', '青森市', '盛岡市', '仙台市', '秋田市', '山形市', '福島市', '水戸市', '宇都宮市', '前橋市', 'さいたま市', '千葉市', '東京都区部', '横浜市', '新潟市', '富山市', '金沢市', '福井市', '甲府市', '長野市', '岐阜市', '静岡市', '名古屋市', '津市', '大津市', '京都市', '大阪市', '神戸市', '奈良市', '和歌山市', '鳥取市', '松江市', '岡山市', '広島市', '山口市', '徳島市', '高松市', '松山市', '高知市', '福岡市', '佐賀市', '長崎市', '熊本市', '大分市', '宮崎市', '鹿児島市', '那覇市'];
export function seKakeiCapital(row) {
  const cv = SE.kakei.cityRows?.[row];
  if (!cv) throw new Error(`[sampling-error.js] 市の変動係数がありません: ${row}`);
  const kinro = row === 'income' || row === 'disposable';
  const nOf = kinro ? SE.kakei.cityMonthlyKinro : SE.kakei.cityMonthly;
  const out = {};
  CAPITALS.forEach((city, i) => {
    const c = cv[city], n = nOf[city];
    if (typeof c === 'number' && n > 0) out[String(i + 1).padStart(2, '0') + '000'] = Math.round(((1.3 * c) / Math.sqrt(12 * n)) * 100) / 100;
  });
  return out;
}

// 窓口の指標に付ける se 指定（['kakei', 行] か [表, 項目, 年]）から、県コード→標準誤差率と対象の年を返す
export function seForRoom(spec) {
  if (spec[0] === 'kakei') return { y: null, r: seKakeiCapital(spec[1]) };
  return { y: spec[2], r: seActivity(spec[0], spec[1]) };
}

// rows（{c, n, minutes}）と標準誤差率の表から、行ごとの幅を足して返す
// key は 'c'（地域コードで引く）か 'n'（名前で引く）。名前が pref のときは pref も見る
export function withBands(rows, rates, key = 'c') {
  return (rows || []).map((r) => {
    const k = key === 'n' ? clean(r.n ?? r.pref) : r.c;
    const v = r.minutes;
    const rate = rates[k];
    if (rate === undefined || rate === null || !Number.isFinite(v)) return { ...r, n: r.n ?? clean(r.pref), rate: null, lo: null, hi: null };
    const half = (Z * rate * v) / 100;
    return { ...r, n: r.n ?? clean(r.pref), rate, lo: v - half, hi: v + half };
  });
}

export const SE_SOURCES = {
  shakai: '標準誤差率は総務省統計局「令和3年社会生活基本調査」の公表値（調査票A 第7・8・13表）',
  kakei: '市ごとの標準誤差率は公表されていないため、総務省統計局「家計調査 標本設計の概要（令和5年）」の品目ごとの変動係数（全国、市ごとの分類の変動係数で補正）と市ごとの集計世帯数から、統計局の近似式（標準誤差率≒1.3×変動係数÷√集計世帯数）で出した目安',
};
