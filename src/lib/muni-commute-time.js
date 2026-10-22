import { cachedJsonFetch } from './estat-cache.js';
const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020108';
// 国勢調査ベースで5年に一度のため、複数時点を確保するには広めに遡る必要がある
const RECENT_YEARS = 40;

// 通勤時間別の雇用者世帯数。総数(H7405)は使わない。
//   H740501 30分未満 / H740502 30分〜1時間 / H740503 1時間〜1時間30分 / H740504 1時間30分以上
// ※4区分の合計は総数より少ない（差は「不詳」）。割合の分母は必ず4区分の合計を使う。
const BANDS = ['H740501', 'H740502', 'H740503', 'H740504'];
const FETCH = BANDS;

// 「その時点の数字がそろっている」と判定するのに使う指標。
// ※この項目は現状どの市区町村も1時点しか無いため、推移グラフは持たない
const SERIES_CODES = BANDS;

function sum(...xs) {
  let s = 0, any = false;
  for (const x of xs) { if (x != null) { s += x; any = true; } }
  return any ? s : null;
}
function pct(part, whole) {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
// 4区分の合計＝この窓口での分母
const total = (v) => sum(v.H740501, v.H740502, v.H740503, v.H740504);

export const INDICATORS = [
  { key: '通勤時間のわかる世帯数', unit: '世帯', kind: 'base', calc: (v) => total(v) },
  { key: '30分未満の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(v.H740501, total(v)) },
  { key: '1時間以上の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(sum(v.H740503, v.H740504), total(v)) },
  { key: '1時間30分以上の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(v.H740504, total(v)) },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-commute-time.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  return await cachedJsonFetch(`${API_BASE}/${path}?${qs.toString()}`);
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classifyArea(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  // 東京の特別区（13101〜13123）は政令市の行政区と違い独立した自治体なので、ランキングに含める
  if (/^131\d\d$/.test(code)) return 'rank';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-commute-time.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-commute-time.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(codes, timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: codes.join(','),
    cdTime: timeCodes.map((t) => t.code).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  };
  const json = await apiGet('getStatsData', params);
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-commute-time.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniCommuteTimeData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const areas = new Map();

  // 複数指標×全市区町村は1リクエストにまとめず、指標ごとに分けて取得する
  // （muni-migration.js/muni-finance.js/muni-daycare.js/muni-commute.jsと同じ教訓）
  for (const code of FETCH) {
    const statData = await fetchStatsData([code], recentTimes);

    const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
    if (areaObj) {
      for (const c of asArray(areaObj.CLASS)) {
        const areaCode = c['@code'];
        const name = (c['@name'] || '').trim();
        const kind = classifyArea(areaCode, name);
        if (kind === 'exclude') continue;
        if (!areas.has(areaCode)) areas.set(areaCode, { c: areaCode, n: name, x: kind === 'x', v: {}, h: {} });
      }
    }

    const valueList = asArray(statData.DATA_INF.VALUE);
    valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
    for (const rec of valueList) {
      const area = areas.get(rec['@area']);
      if (!area) continue;
      const cat = rec['@cat01'];
      const raw = rec['$'];
      if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
      const num = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;

      if (!area.h[rec['@time']]) area.h[rec['@time']] = {};
      area.h[rec['@time']][cat] = num;
      area.v[cat] = num;
    }
  }

  let overallLatestCompleteTime = null;

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) => ind.calc(a.v));

      const completeTimes = Object.keys(a.h)
        .filter((t) => SERIES_CODES.every((c) => a.h[t][c] !== undefined))
        .sort();

      const latestComplete = completeTimes[completeTimes.length - 1] || null;
      if (latestComplete && (!overallLatestCompleteTime || latestComplete > overallLatestCompleteTime)) {
        overallLatestCompleteTime = latestComplete;
      }

      return { c: a.c, n: a.n, x: a.x, v };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020108）',
    note: '雇用者のいる世帯を、通勤時間の長さで4つに分けた割合です。もとの統計には通勤時間が「不詳」の世帯があり、4区分の合計は総数と一致しません。ここでは4区分の合計を分母にしているため、4つの割合を足すと100％になります。数字は住宅・土地統計調査にもとづくため、5年ごとの更新です。この項目は市と区にはほぼ揃っていますが、町村では数字のあるところが限られます。数字のない自治体は、選択にもランキングにも出てきません。政令指定都市の行政区と、特別区部計はランキング除外（選択には表示）。',
    year: overallLatestCompleteTime ? timeNameByCode[overallLatestCompleteTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    areas: areaList,
  };
  return _cache;
}