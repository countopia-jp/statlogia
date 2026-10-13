// =====================================================
// Countopia Stats - わが町の住まい データ取得モジュール
// src/lib/muni-housing.js
//
// 社会・人口統計体系 市区町村データ 基礎データ
//   statsDataId: 0000020108（住宅・土地統計調査ベース／5年ごと）
//   H1100 総住宅数／H1101 居住世帯あり住宅数／H110202 空き家数
//   H1310 持ち家数／H1320 借家数／H1403 共同住宅数
//   H2130 1住宅当たり延べ面積／H4104 専用住宅の1畳当たり家賃
//
// 【要注意】H4104（家賃）は市792・区198のみで、町村は0件。
//   ほかの7指標は市792・区198・町238・村6の計1235件。
//   家賃のランキングは「数字のある○○市区中」と書くこと。
// 【要注意】空き家率の分母は総住宅数H1100（居住世帯あり住宅数ではない）。
//   展示06の空き家率と定義を揃えている。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020108';
// 5年に一度の調査のため、複数時点を確保するには広めに遡る必要がある
const RECENT_YEARS = 40;

const FETCH = ['H1100', 'H1101', 'H110202', 'H1310', 'H1320', 'H1403', 'H2130', 'H4104'];

// 時系列グラフ（空き家率）に必要な指標
const SERIES_CODES = ['H1100', 'H110202'];

function pct(part, whole) {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
const val = (v, code) => (v[code] === undefined ? null : v[code]);

export const INDICATORS = [
  { key: '空き家率', unit: '％', kind: 'rate',
    calc: (v) => pct(val(v, 'H110202'), val(v, 'H1100')) },
  { key: '持ち家率', unit: '％', kind: 'rate',
    calc: (v) => pct(val(v, 'H1310'), val(v, 'H1101')) },
  { key: '共同住宅の割合', unit: '％', kind: 'rate',
    calc: (v) => pct(val(v, 'H1403'), val(v, 'H1101')) },
  { key: '1住宅当たり延べ面積', unit: '㎡', kind: 'value', decimal: true,
    calc: (v) => val(v, 'H2130') },
  { key: '借家の数', unit: '戸', kind: 'base',
    calc: (v) => val(v, 'H1320') },
  { key: '1畳当たり家賃', unit: '円', kind: 'value',
    calc: (v) => val(v, 'H4104') },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-housing.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-housing.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
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
    throw new Error(`[muni-housing.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-housing.js] 時間軸メタが見つかりません');
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
    throw new Error(`[muni-housing.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniHousingData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const areas = new Map();

  // muni-migration.js/muni-finance.jsと同じ教訓：複数指標×全市区町村は
  // 1リクエストにまとめず、指標ごとに分けて取得する（e-Statの取得上限対策）
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

      const series = completeTimes.map((time) => {
        const snap = a.h[time];
        return { year: timeNameByCode[time] || time, value: pct(snap.H110202, snap.H1100) };
      }).filter((pt) => pt.value !== null);

      return { c: a.c, n: a.n, x: a.x, v, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020108）',
    note: '空き家率は総住宅数に占める空き家数、持ち家率と共同住宅の割合は居住世帯あり住宅数に占める割合です。1畳当たり家賃は専用住宅のもので、公営・公社等の借家も含みます（都道府県版の民営借家の家賃とは別の数字です）。家賃は市と区にのみ数字があり、町村には数字がありません。政令指定都市の行政区と、特別区部計はランキング除外（選択には表示）。',
    year: overallLatestCompleteTime ? timeNameByCode[overallLatestCompleteTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind, decimal: !!i.decimal })),
    areas: areaList,
  };
  return _cache;
}
