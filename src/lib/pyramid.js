import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - 人口の形（人口ピラミッド）用のデータ
// src/lib/pyramid.js → /data/pyramid.json（全国・都道府県）・/data/pyramid-town/<県コード>.json（市区町村）
//
// 令和2年国勢調査 人口等基本集計 表 0003445139
//   「男女，年齢（各歳），国籍総数か日本人別人口－全国，都道府県，市区町村」
//   cat01=0（国籍総数）、cat02=1男・2女、cat03=001（0歳）〜101（100歳以上）。年齢不詳は使わない
// 各歳を5歳ごと（0〜4歳 … 95〜99歳、100歳以上）の21階級にまとめる。
// 地域は lvArea=1-6（全国・都道府県・市区町村・政令市の区）。7 は平成12年当時の旧市町村なので取らない。
// =====================================================
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
export const PYR_GROUPS = [...Array.from({ length: 20 }, (_, i) => `${i * 5}〜${i * 5 + 4}歳`), '100歳以上'];
const groupOf = (code) => { const age = Number(code) - 1; return age >= 100 ? 20 : Math.floor(age / 5); };
async function getPage(params) {
  const qs = new URLSearchParams({ appId: appId(), lang: 'J', metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0', ...params });
  let last;
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 180000);
    try {
      const j = await cachedJsonFetch(`${API}?${qs}`, { signal: ctl.signal });
      const st = j.GET_STATS_DATA?.RESULT?.STATUS;
      if (st !== 0 && st !== 1) throw new Error(j.GET_STATS_DATA?.RESULT?.ERROR_MSG || 'e-Stat');
      return j.GET_STATS_DATA.STATISTICAL_DATA;
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 3000 * (i + 1))); } finally { clearTimeout(t); }
  }
  throw new Error(`[pyramid] e-Stat から取れませんでした: ${last?.message || last}`);
}
let cache = null;
export async function getPyramidData() {
  if (cache) return cache;
  const base = { statsDataId: '0003445139', cdCat01: '0', cdCat02: '1,2', cdCat03From: '001', cdCat03To: '101', lvArea: '1-6', limit: '100000' };
  const areas = {};
  let start = 1;
  for (let guard = 0; guard < 20 && start; guard++) {
    const D = await getPage({ ...base, startPosition: String(start) });
    if (guard === 0) {
      const o = asArray(D.CLASS_INF?.CLASS_OBJ).find((x) => x['@id'] === 'area');
      for (const c of asArray(o?.CLASS)) {
        const lv = Number(c['@level']);
        if (lv >= 1 && lv <= 6) areas[c['@code']] = { c: c['@code'], n: String(c['@name']).trim(), lv, m: Array(21).fill(0), f: Array(21).fill(0) };
      }
    }
    for (const v of asArray(D.DATA_INF?.VALUE)) {
      const a = areas[v['@area']];
      const n = Number(String(v['$']).replace(/,/g, ''));
      if (!a || !Number.isFinite(n)) continue;
      (v['@cat02'] === '1' ? a.m : a.f)[groupOf(v['@cat03'])] += n;
    }
    start = Number(D.RESULT_INF?.NEXT_KEY) || 0;
  }
  const list = Object.values(areas);
  if (!list.find((a) => a.c === '00000')) throw new Error('[pyramid] 全国の値がありません');
  cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 令和2年国勢調査 人口等基本集計「男女，年齢（各歳），国籍総数か日本人別人口」（表番号0003445139）',
    year: '2020年',
    groups: PYR_GROUPS,
    areas: list,
  };
  return cache;
}

// 全国と都道府県だけ（/data/pyramid.json）
export async function getPyramidPrefs() {
  const d = await getPyramidData();
  return { generated: d.generated, source: d.source, year: d.year, groups: d.groups, areas: d.areas.filter((a) => a.lv <= 2).map(({ c, n, m, f }) => ({ c, n, m, f })) };
}
// ある県の市区町村（/data/pyramid-town/<県コード>.json）。全国と県も入れて、重ねて比べられるようにする
export async function getPyramidTownPref(pref) {
  const d = await getPyramidData();
  const p2 = pref.slice(0, 2);
  const pick = ({ c, n, m, f, lv }) => ({ c, n, m, f, ...(lv === 5 ? { ward: true } : {}) });
  return {
    generated: d.generated, source: d.source, year: d.year, groups: d.groups,
    nat: pick(d.areas.find((a) => a.c === '00000')),
    pref: pick(d.areas.find((a) => a.c === p2 + '000')),
    towns: d.areas.filter((a) => a.lv >= 4 && a.c.slice(0, 2) === p2).map(pick),
  };
}
