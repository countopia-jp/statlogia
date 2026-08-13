const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020108';
// 国勢調査ベースで5年に一度のため、複数時点を確保するには広めに遡る必要がある
const RECENT_YEARS = 40;

// 分母：自宅外通勤・通学者総数(H7301)
// 分子：鉄道・電車(H730102)、乗合バス(H730103)、自家用車(H730105)
const FETCH = ['H7301', 'H730102', 'H730103', 'H730105'];

// 時系列グラフに使う指標（「自家用車割合」の計算に必要な全指標）
const SERIES_CODES = ['H7301', 'H730105'];

function sum(...xs) {
  let s = 0, any = false;
  for (const x of xs) { if (x != null) { s += x; any = true; } }
  return any ? s : null;
}
function pct(part, whole) {
  if (part == null || whole == null || whole === 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export const INDICATORS = [
  { key: '自宅外通勤・通学者数', unit: '人', kind: 'base', calc: (v) => v.H7301 ?? null },
  { key: '自家用車の割合',       unit: '％', kind: 'rate',
    calc: (v) => pct(v.H730105, v.H7301) },
  { key: '公共交通の割合（鉄道・バス）', unit: '％', kind: 'rate',
    calc: (v) => pct(sum(v.H730102, v.H730103), v.H7301) },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-commute.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-commute.js] API HTTP ${res.status}: ${path}`);
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

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-commute.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-commute.js] 時間軸メタが見つかりません');
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
    throw new Error(`[muni-commute.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniCommuteData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const areas = new Map();

  // muni-migration.js/muni-finance.js/muni-daycare.jsと同じ教訓：複数指標×全市区町村は
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
        const car = pct(snap.H730105, snap.H7301);
        return { year: timeNameByCode[time] || time, value: car };
      }).filter((pt) => pt.value !== null);

      return { c: a.c, n: a.n, x: a.x, v, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020108）',
    note: '自宅外通勤・通学者数に占める、主な交通手段別の割合。「自家用車」は自家用車利用者、「公共交通」は鉄道・電車＋乗合バス利用者の割合。複数の交通手段を使う人がいるため、各割合の合計は100％になりません。区・特別区部計はランキング除外（選択には表示）。',
    year: overallLatestCompleteTime ? timeNameByCode[overallLatestCompleteTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind })),
    areas: areaList,
  };
  return _cache;
}