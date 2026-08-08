// =====================================================
// Countopia Stats - 市区町村版 財政・教育費 取得モジュール
// src/lib/muni-finance.js
//   財政 : 市区町村データ 基礎データ 0000020104（# 不要）
//   人口 : 市区町村データ 基礎データ 0000020101（# 不要, A1101総人口）
//   教育費は総人口で割って「住民1人当たり円」に自作計算。財政力指数はそのまま。
//   地域の扱いは muni-population.js に準拠。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const FIN_ID = '0000020104';
const POP_ID = '0000020101';
const RECENT_YEARS = 12;

const FIN_FETCH = ['D2201', 'D320310', 'D3203102', 'D3203103', 'D3203104'];
const POP_FETCH = ['A1101'];

// 教育費(千円)×1000÷人口 = 1人当たり円
function perCapitaYen(sen, pop) {
  if (sen == null || pop == null || pop === 0) return null;
  return Math.round((sen * 1000) / pop);
}

export const INDICATORS = [
  { key: '財政力指数',           unit: '',   kind: 'fin',  code: 'D2201',
    calc: (f) => (f.D2201 != null ? Math.round(f.D2201 * 1000) / 1000 : null) },
  { key: '住民1人当たり教育費',  unit: '円', kind: 'calc',
    calc: (f, pop) => perCapitaYen(f.D320310, pop) },
  { key: '1人当たり小学校費',    unit: '円', kind: 'calc',
    calc: (f, pop) => perCapitaYen(f.D3203102, pop) },
  { key: '1人当たり中学校費',    unit: '円', kind: 'calc',
    calc: (f, pop) => perCapitaYen(f.D3203103, pop) },
  { key: '1人当たり高校費',      unit: '円', kind: 'calc',
    calc: (f, pop) => perCapitaYen(f.D3203104, pop) },
  { key: '総人口',               unit: '人', kind: 'pop',
    calc: (f, pop) => pop },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-finance.js] ESTAT_APP_ID が設定されていません');
  return appId;
}
async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-finance.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classifyArea(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchTimes(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-finance.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  return asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
}

async function fetchValues(statsDataId, codes, timeCodes) {
  const params = {
    statsDataId,
    cdCat01: codes.join(','),
    cdTime: timeCodes.map((t) => t.code).join(','),
    metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0',
  };
  const json = await apiGet('getStatsData', params);
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-finance.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

// area→{cat:value} を最新値で埋める。areasMap（コード→{c,n,x}）も同時に構築
function collect(statData, byArea, areasMap, latest) {
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  if (areaObj) {
    for (const c of asArray(areaObj.CLASS)) {
      const code = c['@code'];
      const name = (c['@name'] || '').trim();
      const kind = classifyArea(code, name);
      if (kind === 'exclude') continue;
      if (!areasMap.has(code)) areasMap.set(code, { c: code, n: name, x: kind === 'x' });
    }
  }
  const list = asArray(statData.DATA_INF.VALUE);
  list.sort((a, b) => b['@time'].localeCompare(a['@time']));
  for (const rec of list) {
    const area = rec['@area'];
    if (!areasMap.has(area)) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    byArea[area] = byArea[area] || {};
    if (byArea[area][cat] === undefined) {
      byArea[area][cat] = num;
      if (!latest.t || rec['@time'] > latest.t) latest.t = rec['@time'];
    }
  }
}

export async function getMuniFinanceData() {
  if (_cache) return _cache;

  const areasMap = new Map();
  const finByArea = {};
  const popByArea = {};
  const latestFin = { t: null };

  // 財政表
  const finTimes = (await fetchTimes(FIN_ID)).slice(0, RECENT_YEARS);
  const finTimeName = {};
  for (const t of finTimes) finTimeName[t.code] = t.name;
  const finData = await fetchValues(FIN_ID, FIN_FETCH, finTimes);
  collect(finData, finByArea, areasMap, latestFin);

  // 人口表（総人口だけ・突き合わせ用。areasMapには財政側の地域を優先）
  const popTimes = (await fetchTimes(POP_ID)).slice(0, RECENT_YEARS);
  const popData = await fetchValues(POP_ID, POP_FETCH, popTimes);
  const popAreasMap = new Map();
  const dummyLatest = { t: null };
  collect(popData, popByArea, popAreasMap, dummyLatest);

  const areaList = [...areasMap.values()]
    .map((a) => {
      const f = finByArea[a.c] || {};
      const pop = (popByArea[a.c] || {}).A1101 ?? null;
      const v = INDICATORS.map((ind) => ind.calc(f, pop));
      return { c: a.c, n: a.n, x: a.x, v };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（財政 表番号0000020104／人口 表番号0000020101）',
    note: '教育費・学校費は市町村財政の決算額を総人口で割った「住民1人当たり」。財政力指数は1に近いほど自前で財政をまかなえる。区・特別区部計はランキング除外（選択には表示）。',
    year: latestFin.t ? finTimeName[latestFin.t] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    areas: areaList,
  };
  return _cache;
}
