const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020108';
// 住宅・土地統計調査ベースで5年に一度の調査のため、複数時点を確保するには広めに遡る必要がある
const RECENT_YEARS = 40;

const FETCH = ['H2905', 'H2906', 'H2907', 'H2908', 'H2909'];

// 時系列グラフに使う指標（「近い」率の計算に必要な全指標）
const SERIES_CODES = ['H2905', 'H2906', 'H2907', 'H2908', 'H2909'];

function sum(...xs) {
  let s = 0, any = false;
  for (const x of xs) { if (x != null) { s += x; any = true; } }
  return any ? s : null;
}
function pct(part, whole) {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}
const total = (v) => sum(v.H2905, v.H2906, v.H2907, v.H2908, v.H2909);

export const INDICATORS = [
  { key: '対象の世帯数',       unit: '世帯', kind: 'base', calc: (v) => total(v) },
  { key: '保育所が近い（500m未満）', unit: '％', kind: 'rate',
    calc: (v) => pct(sum(v.H2905, v.H2906, v.H2907), total(v)) },
  { key: '保育所が遠い（1000m以上）', unit: '％', kind: 'rate',
    calc: (v) => pct(v.H2909, total(v)) },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-nursery.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-nursery.js] API HTTP ${res.status}: ${path}`);
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
    throw new Error(`[muni-nursery.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-nursery.js] 時間軸メタが見つかりません');
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
    throw new Error(`[muni-nursery.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniNurseryData() {
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

    // 年度ごとにまとめて蓄積（5指標が揃う年度だけ後で「近い率」を計算する）
    if (!area.h[rec['@time']]) area.h[rec['@time']] = {};
    area.h[rec['@time']][cat] = num;

    // 最新値の採用（昇順ソートなので都度上書きすれば最後に残るのは最新）
    area.v[cat] = num;
  }

  let overallLatestCompleteTime = null;

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) => ind.calc(a.v));

      // 5指標（H2905〜H2909）すべてが揃っている年度だけを時系列対象にする
      const completeTimes = Object.keys(a.h)
        .filter((t) => SERIES_CODES.every((c) => a.h[t][c] !== undefined))
        .sort();

      const latestComplete = completeTimes[completeTimes.length - 1] || null;
      if (latestComplete && (!overallLatestCompleteTime || latestComplete > overallLatestCompleteTime)) {
        overallLatestCompleteTime = latestComplete;
      }

      const series = completeTimes.map((time) => {
        const snap = a.h[time];
        const near = pct(sum(snap.H2905, snap.H2906, snap.H2907), total(snap));
        return { year: timeNameByCode[time] || time, value: near };
      }).filter((pt) => pt.value !== null);

      return { c: a.c, n: a.n, x: a.x, v, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020108）',
    note: '最寄りの保育所までの距離帯別・普通世帯数から算出。「近い」は500m未満、「遠い」は1000m以上の世帯割合。政令指定都市の行政区と、特別区部計はランキング除外（選択には表示）。',
    year: overallLatestCompleteTime ? timeNameByCode[overallLatestCompleteTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    areas: areaList,
  };
  return _cache;
}