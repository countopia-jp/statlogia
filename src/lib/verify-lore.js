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
