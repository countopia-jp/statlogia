import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - わが町の土地の使われ方 データ取得モジュール
// src/lib/muni-landuse.js
//
// 社会・人口統計体系 市区町村データ 基礎データ
//   statsDataId: 0000020108（都市計画法にもとづく用途地域。2023年）
//   H8104 用途地域面積（分母）
//   H810401 住居専用／H810402 住居／H810403 近隣商業／H810404 商業
//   H810405 準工業／H810406 工業／H810407 工業専用
//   H8101 都市計画区域指定面積／H8103 市街化区域面積
//
// 【確認済み】7分類の合計は H8104 と完全に一致する（千代田区・横浜市・日野町で検算）。
//   したがって割合の合計は100%になる。積み上げ棒がそのまま描ける。
// 【要注意】数字があるのは1679〜1742件。**政令指定都市の行政区には数字がない**
//   （横浜市は市の単位で集計）。特別区23区には数字がある。
//   行政区を選ぶとすべて「—」になるので、ページ側で注記を出すこと。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020108';
// 5年に一度の調査ではないが、複数時点を確保するため広めに遡る
const RECENT_YEARS = 40;

const FETCH = [
  'H8104', 'H810401', 'H810402', 'H810403', 'H810404',
  'H810405', 'H810406', 'H810407', 'H8101', 'H8103',
];

function pct(part, whole) {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
const val = (v, code) => (v[code] === undefined ? null : v[code]);

// 積み上げ棒の並び順＝住まい寄りから工業寄りへ
export const ZONES = [
  { key: '住居専用', code: 'H810401', color: '#4B5570' },
  { key: '住居', code: 'H810402', color: '#5a9367' },
  { key: '近隣商業', code: 'H810403', color: '#c08a3e' },
  { key: '商業', code: 'H810404', color: '#B3402A' },
  { key: '準工業', code: 'H810405', color: '#8a7a63' },
  { key: '工業', code: 'H810406', color: '#6b6157' },
  { key: '工業専用', code: 'H810407', color: '#4a453f' },
];

export const INDICATORS = [
  { key: '住居専用地域の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(val(v, 'H810401'), val(v, 'H8104')) },
  { key: '住居地域の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(val(v, 'H810402'), val(v, 'H8104')) },
  { key: '商業地域の割合', unit: '％', kind: 'rate',
    calc: (v) => {
      const a = val(v, 'H810403'), b = val(v, 'H810404');
      if (a == null && b == null) return null;
      return pct((a || 0) + (b || 0), val(v, 'H8104'));
    } },
  { key: '工業地域の割合', unit: '％', kind: 'rate',
    calc: (v) => {
      const a = val(v, 'H810405'), b = val(v, 'H810406'), c = val(v, 'H810407');
      if (a == null && b == null && c == null) return null;
      return pct((a || 0) + (b || 0) + (c || 0), val(v, 'H8104'));
    } },
  { key: '用途地域の面積', unit: 'ha', kind: 'base',
    calc: (v) => val(v, 'H8104') },
  { key: '市街化区域の面積', unit: 'ha', kind: 'base',
    calc: (v) => val(v, 'H8103') },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-landuse.js] ESTAT_APP_ID が設定されていません');
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
  // 東京の特別区（13101〜13123）は独立した自治体で、用途地域の数字もある
  if (/^131\d\d$/.test(code)) return 'rank';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-landuse.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-landuse.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(codes, timeCodes) {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_ID,
    cdCat01: codes.join(','),
    cdTime: timeCodes.map((t) => t.code).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-landuse.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniLanduseData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const areas = new Map();

  // 複数指標×全市区町村は1リクエストにまとめず、指標ごとに分けて取得する
  for (const code of FETCH) {
    const statData = await fetchStatsData([code], recentTimes);

    const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
    if (areaObj) {
      for (const c of asArray(areaObj.CLASS)) {
        const areaCode = c['@code'];
        const name = (c['@name'] || '').trim();
        const kind = classifyArea(areaCode, name);
        if (kind === 'exclude') continue;
        if (!areas.has(areaCode)) areas.set(areaCode, { c: areaCode, n: name, x: kind === 'x', v: {} });
      }
    }

    const valueList = asArray(statData.DATA_INF.VALUE);
    valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
    for (const rec of valueList) {
      const area = areas.get(rec['@area']);
      if (!area) continue;
      const raw = rec['$'];
      if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
      const num = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;
      // 時点の新しい順に上書きされるよう、昇順に処理して最後の値を採る
      area.v[rec['@cat01']] = num;
      area.year = timeNameByCode[rec['@time']] || rec['@time'];
    }
  }

  let latestYear = null;

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) => ind.calc(a.v));
      const total = val(a.v, 'H8104');
      const zones = ZONES.map((z) => ({
        key: z.key,
        color: z.color,
        value: pct(val(a.v, z.code), total),
      }));
      if (a.year && (!latestYear || a.year > latestYear)) latestYear = a.year;
      return { c: a.c, n: a.n, x: a.x, v, zones: zones.some((z) => z.value !== null) ? zones : [] };
    })
    .filter((a) => a.v.some((x) => x !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020108）',
    note: '用途地域は都市計画法にもとづいて定められた土地の区分です。割合は用途地域の面積に占めるもので、7つの区分の合計が100％になります。商業地域には近隣商業地域を、工業地域には準工業地域と工業専用地域を含めています。都市計画区域の定めがない市区町村と、政令指定都市の行政区には数字がありません（政令指定都市は市の単位で集計されています）。',
    year: latestYear,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    zoneKeys: ZONES.map((z) => ({ key: z.key, color: z.color })),
    areas: areaList,
  };
  return _cache;
}
