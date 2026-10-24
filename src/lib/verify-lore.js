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

/** 丙午：全国の年次出生数・性比（人口動態統計 上巻、表 0003411595、1899〜）と、
 *  人工妊娠中絶件数（衛生行政報告例 付表、表 0004026934、1955〜2001）。
 *
 *  ■ 1966年の谷が「産む年をずらした」ものだと言うには、中絶が増えていないことを示す必要がある。
 *     伝聞ではなく件数そのものを取ってくる。
 *  ■ 1906年は、性比の偏りから「丙午生まれの女児を前後の年に届けた」跡が出る。
 *     ただしその規模は谷のごく一部で、残りは産み控えか日露戦争（1904-05）の影響かを
 *     この数字では分けられない。規模を出して、言えるところまでで止める。
 */
const RATIO_BASE_YEARS = [1899, 1900, 1901, 1902, 1903, 1904, 1908, 1909, 1910, 1911, 1912, 1913];

export async function getHinoeumaData() {
  const v = await statsData({ statsDataId: '0003411595', cdCat01: '00100,00110,00120,00140', limit: 1000 });
  const t = {};
  for (const x of v) {
    const code = x['@cat01'], y = Number(x['@time'].slice(0, 4)), val = num(x['$']);
    ((t[code] ||= {})[y]) = val;
  }
  const total = t['00100'] || {}, girls = t['00120'] || {}, ratio = t['00140'] || {};

  const series = Object.keys(total).map(Number).filter((y) => total[y] != null).sort((a, b) => a - b)
    .map((y) => ({ year: y, value: total[y] }));

  const around = (y) => {
    const prev = total[y - 1], cur = total[y], next = total[y + 1];
    const base = (prev + next) / 2;
    return { year: y, prev, cur, next, base, gap: base - cur, dropPct: cur && base ? ((cur - base) / base) * 100 : null };
  };
  const y1906 = around(1906), y1966 = around(1966);

  // 一年だけの落ち込みが大きい年（前後の平均との比）
  const worst = [];
  for (const y of Object.keys(total).map(Number).sort((a, b) => a - b)) {
    if (total[y - 1] && total[y] && total[y + 1]) {
      const b = (total[y - 1] + total[y + 1]) / 2;
      worst.push({ year: y, pct: ((total[y] - b) / b) * 100 });
    }
  }
  worst.sort((a, b) => a.pct - b.pct);

  // 性比の偏りから、届け出の年を動かした女児の数を見積もる
  const have = RATIO_BASE_YEARS.filter((y) => ratio[y] != null);
  const normalRatio = have.reduce((m, y) => m + ratio[y], 0) / have.length;
  const girlsIf = (y) => total[y] / (1 + normalRatio / 100);
  const moved1906 = Math.round(girlsIf(1906) - girls[1906]);
  const excess1905 = Math.round(girls[1905] - girlsIf(1905));
  const excess1907 = Math.round(girls[1907] - girlsIf(1907));
  const shift = {
    normalRatio: Math.round(normalRatio * 100) / 100,
    moved1906, excess1905, excess1907,
    sharePct: Math.round((moved1906 / y1906.gap) * 1000) / 10,
    ratio1905: ratio[1905], ratio1906: ratio[1906], ratio1907: ratio[1907],
    // 性比が記録のなかで何番目か
    ratioRankHigh: Object.keys(ratio).filter((y) => ratio[y] != null).sort((a, b) => ratio[b] - ratio[a]).indexOf('1906') + 1,
    ratioYears: Object.keys(ratio).filter((y) => ratio[y] != null).length,
  };

  // 人工妊娠中絶件数（総数）。1966年に増えていないことを数字で示すため
  let abortion = null;
  try {
    const av = await statsData({ statsDataId: '0004026934', cdCat01: '000000', limit: 200 });
    const by = {};
    for (const x of av) by[Number(String(x['@time']).slice(0, 4))] = num(x['$']);
    if (by[1965] && by[1966] && by[1967]) {
      abortion = {
        y1960: by[1960], y1965: by[1965], y1966: by[1966], y1967: by[1967], y1970: by[1970],
        pct6665: Math.round(((by[1966] - by[1965]) / by[1965]) * 1000) / 10,
        source: '厚生労働省「衛生行政報告例」付表 人工妊娠中絶件数（e-Stat 表番号 0004026934）',
      };
    }
  } catch { abortion = null; }

  return {
    source: '厚生労働省「人口動態統計」上巻 年次別にみた出生数・出生性比（e-Stat 表番号 0003411595）',
    series, y1906, y1966, worst: worst.slice(0, 5), shift, abortion,
    ratio, girls,
    thisOne: 2026,
    latest: series[series.length - 1],
  };
}
