// =====================================================
// Countopia Stats - 昼夜間人口比率データ取得モジュール
// src/lib/day-night-ratio.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   statsDataId: 0000010101
//   指標コード A6108  昼夜間人口比率 [％]
//   ※基礎データのため # プレフィックス不要。
//   昼夜間人口比率＝昼間人口÷夜間人口×100。100を超えると、
//   通勤・通学で人が「流入」している県。100未満だと人が「流出」している県。
//
// rows/national は他展示に合わせて {c,n,minutes} 形式（minutes=％）。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000010101';
const CODE = 'A6108';
const RECENT_YEARS = 12;

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[day-night-ratio.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[day-night-ratio.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[day-night-ratio.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);
  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[day-night-ratio.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: CODE,
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
    throw new Error(`[day-night-ratio.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getDayNightRatioData() {
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
      if (!areas.has(code)) areas.set(code, { c: code, n: name, value: undefined });
    }
  }

  let latestTime = null;
  const valueList = asArray(statData.DATA_INF.VALUE);
  valueList.sort((a, b) => b['@time'].localeCompare(a['@time']));
  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (area.value === undefined) {
      area.value = num;
      if (!latestTime || rec['@time'] > latestTime) latestTime = rec['@time'];
    }
  }

  // 昼夜間人口比率（％、小数1桁）
  const round1 = (v) => (v === undefined ? null : Math.round(v * 10) / 10);

  const computed = [...areas.values()].map((a) => ({ c: a.c, n: a.n, minutes: round1(a.value) }));

  const nationalEntry = computed.find((a) => /^0+$/.test(a.c) || a.n === '全国');
  let national = nationalEntry ? nationalEntry.minutes : null;

  const rows = computed
    .filter((a) => a !== nationalEntry && a.minutes !== null)
    .sort((a, b) => b.minutes - a.minutes);

  if (national === null && rows.length) {
    national = Math.round((rows.reduce((s, r) => s + r.minutes, 0) / rows.length) * 10) / 10;
  }

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010101）',
    note: '昼夜間人口比率＝昼間人口÷夜間人口×100。通勤・通学による人口の流入出を示す。100を超えると昼間に人が集まる県、100未満だと昼間に人が出ていく県。',
    year: latestTime ? timeNameByCode[latestTime] || null : null,
    national,
    rows,
  };
  return _cache;
}