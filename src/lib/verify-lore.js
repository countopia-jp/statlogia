// =====================================================
// Statlogia - 検証室（言い伝えをデータで確かめる）の数字取り
// src/lib/verify-lore.js
//
// 題材ごとに e-Stat から必要な系列だけを取り、ページが読む形にそろえる。
// 取得は estat-cache.js を通す（手元のビルドは2回目からネットに出ない）。
// =====================================================
import { cachedJsonFetch } from './estat-cache.js';

const API = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function statsData(params) {
  const qs = new URLSearchParams({ appId: appId(), lang: 'J', ...params });
  const j = await cachedJsonFetch(`${API}/getStatsData?${qs}`);
  return asArray(j?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE);
}
const num = (s) => (s == null || s === '-' || s === '***' || s === 'X' ? null : Number(String(s).replace(/,/g, '')));

/** 丙午：全国の年次出生数（人口動態統計 上巻 年次別 出生数 総数、1899〜） */
export async function getHinoeumaData() {
  const v = await statsData({ statsDataId: '0003411595', cdCat01: '00100', limit: 500 });
  const series = v.map((x) => ({ year: Number(x['@time'].slice(0, 4)), value: num(x['$']) })).filter((d) => d.value != null).sort((a, b) => a.year - b.year);
  const by = Object.fromEntries(series.map((d) => [d.year, d.value]));
  const around = (y) => {
    const prev = by[y - 1], cur = by[y], next = by[y + 1];
    const base = (prev + next) / 2;
    return { year: y, prev, cur, next, dropPct: cur && base ? ((cur - base) / base) * 100 : null };
  };
  return {
    source: '厚生労働省「人口動態統計」上巻 年次別にみた出生数（e-Stat 表番号 0003411595）',
    series,
    y1906: around(1906),
    y1966: around(1966),
    next: 2026,
    latest: series[series.length - 1],
  };
}

/** 沖縄の長寿：都道府県別 平均余命（0歳）男女、1975〜（社会・人口統計体系 I1101/I1102） */
export async function getOkinawaData() {
  const v = await statsData({ statsDataId: '0000010109', cdCat01: 'I1101,I1102', limit: 2000 });
  const t = {};
  for (const x of v) {
    const code = x['@cat01'], area = x['@area'], y = x['@time'].slice(0, 4), val = num(x['$']);
    if (val == null) continue;
    ((t[code] ||= {})[y] ||= {})[area] = val;
  }
  const years = Object.keys(t.I1101 || {}).sort();
  const pick = (code, area) => years.map((y) => t[code]?.[y]?.[area] ?? null);
  // 各年の沖縄の順位（47県中、長い順）
  const rankOf = (code) => years.map((y) => {
    const row = Object.entries(t[code][y]).filter(([a]) => a !== '00000').sort((a, b) => b[1] - a[1]);
    const i = row.findIndex(([a]) => a === '47000');
    return i < 0 ? null : i + 1;
  });
  return {
    source: '厚生労働省「都道府県別生命表」（e-Stat 社会・人口統計体系 表番号 0000010109、I1101・I1102）',
    years,
    male: { okinawa: pick('I1101', '47000'), japan: pick('I1101', '00000'), rank: rankOf('I1101') },
    female: { okinawa: pick('I1102', '47000'), japan: pick('I1102', '00000'), rank: rankOf('I1102') },
  };
}

const PREF = Object.fromEntries(['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県']
  .map((n, i) => [String(i + 1).padStart(2, '0') + '000', n]));

/** 晴れの国おかやま：気象の4指標（社会・人口統計体系 B自然環境 表番号 0000010102）
 *  B4106 降水日数（年間）／B4108 日照時間（年間）／B4109 降水量（年間）／B4104 快晴日数（年間）
 *  ※全国(00000)の行はあるが値が空なので、47県の単純平均を自分で作る。
 *  ※快晴日数は雲の目視観測が2019〜2024年に順に終わったため、統計表が途中で止まっている。
 */
export async function getOkayamaData() {
  const SPECS = [
    { key: 'rainDays', code: 'B4106', label: '降水日数（年間）', unit: '日', dir: 'asc', word: '少ない順' },
    { key: 'sun', code: 'B4108', label: '日照時間（年間）', unit: '時間', dir: 'desc', word: '多い順' },
    { key: 'rain', code: 'B4109', label: '降水量（年間）', unit: 'mm', dir: 'asc', word: '少ない順' },
    { key: 'clear', code: 'B4104', label: '快晴日数（年間）', unit: '日', dir: 'desc', word: '多い順' },
  ];
  const v = await statsData({ statsDataId: '0000010102', cdCat01: SPECS.map((s) => s.code).join(','), limit: 100000 });
  const t = {};
  const names = {};
  for (const x of v) {
    const code = x['@cat01'], area = x['@area'], y = x['@time'].slice(0, 4), val = num(x['$']);
    if (val == null || area === '00000') continue;
    ((t[code] ||= {})[y] ||= {})[area] = val;
  }
  const OKAYAMA = '33000';
  const out = {};
  for (const s of SPECS) {
    const byYear = t[s.code] || {};
    // 47県そろう年だけを使う（観測の終わった年の半端な行を拾わない）
    const years = Object.keys(byYear).filter((y) => Object.keys(byYear[y]).length >= 47).sort();
    const last = years[years.length - 1];
    const row = last ? Object.entries(byYear[last]).sort((a, b) => (s.dir === 'desc' ? b[1] - a[1] : a[1] - b[1])) : [];
    const rank = row.findIndex(([a]) => a === OKAYAMA) + 1;
    const mean = (y) => { const vs = Object.values(byYear[y]); return vs.reduce((m, x2) => m + x2, 0) / vs.length; };
    out[s.key] = {
      label: s.label, unit: s.unit, word: s.word, year: last,
      value: last ? byYear[last][OKAYAMA] ?? null : null,
      rank: rank || null,
      top: row.slice(0, 5).map(([a, x2]) => ({ area: a, name: PREF[a] || a, v: x2 })),
      years,
      okayama: years.map((y) => byYear[y][OKAYAMA] ?? null),
      japan: years.map((y) => Math.round(mean(y) * 10) / 10),
    };
  }
  return {
    source: '気象庁の観測値（e-Stat 社会・人口統計体系 表番号 0000010102、B4106・B4108・B4109・B4104）',
    ...out,
  };
}
