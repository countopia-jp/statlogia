const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020101';
const RECENT_YEARS = 40; // 国勢調査は5年に一度のため、12年では2点しか取れない。長めに遡って複数時点を確保する

const FETCH = ['A1101', 'A1301', 'A1302', 'A1303', 'A7101', 'A191007'];

export const INDICATORS = [
  { key: '総人口',           unit: '人',   kind: 'base', code: 'A1101' },
  { key: '高齢化率',         unit: '％',   kind: 'rate', calc: (v) => rate(v.A1303, v.A1101) },
  { key: '年少人口率',       unit: '％',   kind: 'rate', calc: (v) => rate(v.A1301, v.A1101) },
  { key: '生産年齢人口率',   unit: '％',   kind: 'rate', calc: (v) => rate(v.A1302, v.A1101) },
  { key: '世帯数',           unit: '世帯', kind: 'base', code: 'A7101' },
  { key: '2050年の推計人口', unit: '人',   kind: 'base', code: 'A191007' },
];

// 時系列グラフに使う指標コード（総人口のみ）
const SERIES_CODE = 'A1101';

function rate(a, b) {
  if (a == null || b == null || b === 0) return null;
  return Math.round((a / b) * 1000) / 10;
}

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-population.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-population.js] API HTTP ${res.status}: ${path}`);
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
    throw new Error(`[muni-population.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-population.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: FETCH.join(','),
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
    throw new Error(`[muni-population.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniPopulationData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const statData = await fetchStatsData(recentTimes);

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areas = new Map();
  if (areaObj) {
    for (const c of asArray(areaObj.CLASS)) {
      const code = c['@code'];
      const name = (c['@name'] || '').trim();
      const kind = classifyArea(code, name);
      if (kind === 'exclude') continue;
      if (!areas.has(code)) areas.set(code, { c: code, n: name, x: kind === 'x', v: {}, h: {} });
    }
  }

  let latestTime = null;
  const valueList = asArray(statData.DATA_INF.VALUE);
  // 履歴を時系列順（古い→新しい）で積みたいので昇順ソート
  valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;

    // 時系列グラフ対象の指標だけ履歴を蓄積
    if (cat === SERIES_CODE) {
      if (!area.h[cat]) area.h[cat] = [];
      area.h[cat].push({ time: rec['@time'], value: num });
    }

    // 最新値の採用（昇順ソートなので都度上書きすれば最後に残るのは最新）
    area.v[cat] = num;
    if (!latestTime || rec['@time'] > latestTime) latestTime = rec['@time'];
  }

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) =>
        ind.kind === 'base'
          ? (a.v[ind.code] !== undefined ? a.v[ind.code] : null)
          : ind.calc(a.v)
      );
      // 総人口の時系列（年名に変換して昇順のまま）
      const series = (a.h[SERIES_CODE] || []).map((pt) => ({
        year: timeNameByCode[pt.time] || pt.time,
        value: pt.value,
      }));
      return { c: a.c, n: a.n, x: a.x, v, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020101）',
    note: '高齢化率・年少人口率・生産年齢人口率は年齢別人口から算出。2050年は将来推計人口。政令指定都市の行政区と、特別区部計はランキング除外（選択には表示）。',
    year: latestTime ? timeNameByCode[latestTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    areas: areaList,
  };
  return _cache;
}