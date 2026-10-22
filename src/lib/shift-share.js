import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - シフトシェア分析用のデータ（都道府県・事業従事者数・業種大分類）
// src/lib/shift-share.js → /data/shift-share.json
//
// 経済センサス‐活動調査の2時点（平成28年＝2016年6月1日、令和3年＝2021年6月1日）の
// 民営事業所の事業従事者数を、産業大分類ごとに県別にそろえて出す。
//   平成28年：表 0003218722（cat01 経営組織 000総数、cat02 産業、tab 817 事業従事者数）
//   令和3年 ：表 0004006321（cat01 産業、cat02 0総数、tab 148-2021 事業従事者数）
// 分解の計算（全国成長・産業構成・地域特殊）はページの側で行う。
// =====================================================
const API = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
const PREFS = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0') + '000');
// [記号, 名前, 平成28年の産業コード]
export const SS_INDUSTRIES = [
  ['AB', '農林漁業', '00020'], ['C', '鉱業・採石業・砂利採取業', '00810'], ['D', '建設業', '01220'], ['E', '製造業', '01490'],
  ['F', '電気・ガス・熱供給・水道業', '09500'], ['G', '情報通信業', '09650'], ['H', '運輸業・郵便業', '10120'], ['I', '卸売業・小売業', '10540'],
  ['J', '金融業・保険業', '13500'], ['K', '不動産業・物品賃貸業', '13820'], ['L', '学術研究・専門・技術サービス業', '14330'], ['M', '宿泊業・飲食サービス業', '15140'],
  ['N', '生活関連サービス業・娯楽業', '15750'], ['O', '教育・学習支援業', '16890'], ['P', '医療・福祉', '17570'], ['Q', '複合サービス事業', '18300'], ['R', 'サービス業（他に分類されないもの）', '18480'],
];
async function get(params) {
  const qs = new URLSearchParams({ appId: appId(), lang: 'J', metaGetFlg: 'N', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0', ...params });
  let last;
  for (let i = 0; i < 3; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 120000);
    try {
      const j = await cachedJsonFetch(`${API}?${qs}`, { signal: ctl.signal });
      if (j.GET_STATS_DATA?.RESULT?.STATUS !== 0) throw new Error(j.GET_STATS_DATA?.RESULT?.ERROR_MSG || 'e-Stat');
      return asArray(j.GET_STATS_DATA.STATISTICAL_DATA?.DATA_INF?.VALUE);
    } catch (e) { last = e; await new Promise((s) => setTimeout(s, 3000 * (i + 1))); } finally { clearTimeout(t); }
  }
  throw new Error(`[shift-share] e-Stat から取れませんでした: ${last?.message || last}`);
}
const num = (v) => { const n = Number(String(v ?? '').replace(/,/g, '')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
let cache = null;
export async function getShiftShareData() {
  if (cache) return cache;
  const v0 = await get({ statsDataId: '0003218722', cdCat01: '000', cdTab: '817', cdArea: PREFS.join(',') });
  const v1 = await get({ statsDataId: '0004006321', cdCat02: '0', cdTab: '148-2021', cdArea: PREFS.join(',') });
  const e0 = {}, e1 = {};
  for (const v of v0) (e0[v['@area']] ??= {})[v['@cat02']] = num(v['$']);
  for (const v of v1) if (v['@tab'] === '148-2021' && v['@cat02'] === '0') (e1[v['@area']] ??= {})[v['@cat01']] = num(v['$']);
  const areas = PREFS.map((c) => ({
    c,
    e0: SS_INDUSTRIES.map(([, , h]) => e0[c]?.[h] ?? null),
    e1: SS_INDUSTRIES.map(([k]) => e1[c]?.[k] ?? null),
  }));
  cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 平成28年・令和3年経済センサス‐活動調査 事業所に関する集計（表番号0003218722・0004006321）',
    y0: '2016年', y1: '2021年',
    industries: SS_INDUSTRIES.map(([k, n]) => ({ k, n })),
    areas,
  };
  return cache;
}

// ---- 市区町村版（/data/shift-share-town/<県コード>.json） ----
// 同じ2つの表の市区町村の行。県と同じく事業従事者数・産業大分類17業種。
// 秘匿（X）などで値の無い業種は null のまま出し、ページの側で分解から外す。
// 2016年と2021年のあいだに市制施行でコードが変わった町は、2016年のコードで引く。
const CODE_2016 = { '04216': '04423', '40231': '40305' }; // 富谷市（富谷町）、那珂川市（那珂川町）
let townCache = null;
async function areaNames(statsDataId) {
  const qs = new URLSearchParams({ appId: appId(), lang: 'J', statsDataId });
  const j = await cachedJsonFetch(`https://api.e-stat.go.jp/rest/3.0/app/json/getMetaInfo?${qs}`);
  const o = asArray(j.GET_META_INFO?.METADATA_INF?.CLASS_INF?.CLASS_OBJ).find((x) => x['@id'] === 'area');
  return Object.fromEntries(asArray(o?.CLASS).map((c) => [c['@code'], String(c['@name']).trim()]));
}
export async function getShiftShareTownData() {
  if (townCache) return townCache;
  const raw0 = await get({ statsDataId: '0003218722', cdCat01: '000', cdTab: '817' });
  const raw1 = await get({ statsDataId: '0004006340', cdCat02: '0', cdTab: '148-2021' });
  const names = await areaNames('0004006340');
  const e0 = {}, e1 = {};
  for (const v of raw0) (e0[v['@area']] ??= {})[v['@cat02']] = num(v['$']);
  for (const v of raw1) if (v['@tab'] === '148-2021' && v['@cat02'] === '0') (e1[v['@area']] ??= {})[v['@cat01']] = num(v['$']);
  townCache = { e0, e1, names };
  return townCache;
}
export async function getShiftShareTownPref(pref) {
  const { e0, e1, names } = await getShiftShareTownData();
  const p2 = pref.slice(0, 2);
  const towns = Object.keys(e1).filter((c) => c.slice(0, 2) === p2 && !c.endsWith('000')).sort();
  const out = [];
  for (const c of towns) {
    const old = e0[c] ? c : CODE_2016[c];
    if (!old || !e0[old]) continue;
    out.push({
      c, n: names[c] || c,
      e0: SS_INDUSTRIES.map(([, , h]) => e0[old]?.[h] ?? null),
      e1: SS_INDUSTRIES.map(([k]) => e1[c]?.[k] ?? null),
    });
  }
  return {
    source: '政府統計の総合窓口(e-Stat) 平成28年・令和3年経済センサス‐活動調査 事業所に関する集計（表番号0003218722・0004006340）',
    y0: '2016年', y1: '2021年', pref,
    industries: SS_INDUSTRIES.map(([k, n]) => ({ k, n })),
    towns: out,
  };
}
