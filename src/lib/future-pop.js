// =====================================================
// Countopia Stats - これからの人口の見込み（将来推計人口）
// src/lib/future-pop.js → /data/future-pop.json
//
// 社会・人口統計体系の「将来推計人口」A191002（2025年）〜A191007（2050年）。国立社会保障・人口問題研究所の推計。
// 表には平成30年推計（時間軸2017）と令和5年推計（時間軸2023）が入っているので、いちばん新しい推計の版だけを使う。
// 起点は2020年の国勢調査人口（A1101 の2020年の値）。
//   都道府県・全国：0000010101、市区町村：0000020101
// =====================================================
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
const CODES = ['A191002', 'A191003', 'A191004', 'A191005', 'A191006', 'A191007'];
export const FUTURE_YEARS = [2020, 2025, 2030, 2035, 2040, 2045, 2050];
async function get(params) {
  const qs = new URLSearchParams({ appId: appId(), lang: 'J', metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0', ...params });
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const j = await (await fetch(`${API}?${qs}`)).json();
      const st = j.GET_STATS_DATA?.RESULT?.STATUS;
      if (st !== 0 && st !== 1) throw new Error(j.GET_STATS_DATA?.RESULT?.ERROR_MSG || 'e-Stat');
      return j.GET_STATS_DATA.STATISTICAL_DATA;
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 3000 * (i + 1))); }
  }
  throw new Error(`[future-pop] e-Stat から取れませんでした: ${last?.message || last}`);
}
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
async function table(statsDataId) {
  const out = {};
  let names = {};
  const base = await get({ statsDataId, cdCat01: 'A1101', cdTime: '2020100000' });
  for (const c of asArray(asArray(base.CLASS_INF?.CLASS_OBJ).find((o) => o['@id'] === 'area')?.CLASS)) names[c['@code']] = String(c['@name']).trim();
  for (const v of asArray(base.DATA_INF?.VALUE)) { const n = num(v['$']); if (n !== null) (out[v['@area']] ??= { v: Array(7).fill(null) }).v[0] = n; }
  const vintages = new Set();
  for (const [i, code] of CODES.entries()) {
    const D = await get({ statsDataId, cdCat01: code });
    const byTime = {};
    for (const v of asArray(D.DATA_INF?.VALUE)) (byTime[v['@time']] ??= []).push(v);
    const latest = Object.keys(byTime).sort().pop();
    if (!latest) continue;
    vintages.add(latest);
    for (const v of byTime[latest]) { const n = num(v['$']); if (n !== null && out[v['@area']]) out[v['@area']].v[i + 1] = n; }
  }
  for (const [c, o] of Object.entries(out)) o.n = names[c] || c;
  return { out, vintages: [...vintages] };
}
let cache = null;
export async function getFuturePopData() {
  if (cache) return cache;
  const P = await table('0000010101');
  const T = await table('0000020101');
  const areas = {};
  for (const src of [P.out, T.out]) for (const [c, o] of Object.entries(src)) if (o.v.slice(1).some((x) => x !== null) && o.v[0]) areas[c] = { n: o.n, v: o.v };
  if (!areas['00000']) throw new Error('[future-pop] 全国の値がありません');
  const vin = [...new Set([...P.vintages, ...T.vintages])].sort().pop();
  cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系（将来推計人口＝国立社会保障・人口問題研究所「日本の地域別将来推計人口」、2020年＝国勢調査）',
    vintage: vin && vin.startsWith('2023') ? '令和5年推計' : `${vin?.slice(0, 4)}年の推計`,
    years: FUTURE_YEARS,
    areas,
  };
  return cache;
}
