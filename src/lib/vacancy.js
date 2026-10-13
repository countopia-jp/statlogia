// =====================================================
// Countopia Stats - 空き家率データ取得モジュール
// src/lib/vacancy.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   H 居住  statsDataId: 0000010108（5年ごと）
//
// appIdはCloudflare PagesのSecret「ESTAT_APP_ID」から取得。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const TABLES = {
  housing: '0000010108',
};

// 取得する指標。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: 'H110202', table: 'housing', label: '空き家数', group: 'home', kind: 'base' },
  { code: 'H1100', table: 'housing', label: '総住宅数', group: 'home', kind: 'base' },
];

// 計算で作る指標
export const DERIVED = [
  {
    code: 'VACRATE',
    label: '空き家率',
    unit: '％',
    group: 'home',
    kind: 'derived',
    from: ['H110202', 'H1100'],
    calc: (vacant, total) => (total > 0 ? (vacant / total) * 100 : null),
  },
];

const RECENT_YEARS = 12;

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[vacancy.js] ESTAT_APP_ID が設定されていません');
  }
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[vacancy.js] API HTTP ${res.status}: ${path}`);
  }
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : [x];
}

async function fetchMeta(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[vacancy.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);

  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[vacancy.js] 時間軸メタが見つかりません(${statsDataId})`);
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));

  const catObj = classObjs.find((o) => o['@id'] === 'cat01');
  const units = {};
  if (catObj) {
    for (const c of asArray(catObj.CLASS)) {
      units[c['@code']] = c['@unit'] || null;
    }
  }
  return { times, units };
}

async function fetchStatsData(statsDataId, codes, timeCodes) {
  const params = {
    statsDataId,
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
    throw new Error(`[vacancy.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

function collectAreas(statData, areas) {
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  if (!areaObj) return;
  for (const c of asArray(areaObj.CLASS)) {
    const code = c['@code'];
    const name = (c['@name'] || '').trim();
    // 全国行(00000)や地方ブロックは除外し、都道府県だけをMapに入れる
    if (name === '全国' || /^0+$/.test(code)) continue;
    if (!areas.has(code)) areas.set(code, { c: code, n: name, v: {} });
  }
}

function collectValues(statData, areas, latestTimeByCat) {
  const valueList = asArray(statData.DATA_INF.VALUE);
  valueList.sort((a, b) => b['@time'].localeCompare(a['@time']));

  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (area.v[cat] === undefined) {
      area.v[cat] = num;
      if (!latestTimeByCat[cat] || rec['@time'] > latestTimeByCat[cat]) {
        latestTimeByCat[cat] = rec['@time'];
      }
    }
  }
}

export async function getVacancyData() {
  if (_cache) return _cache;

  const areas = new Map();
  const latestTimeByCat = {};
  const timeNameByCode = {};
  const unitByCat = {};

  for (const [key, statsDataId] of Object.entries(TABLES)) {
    const codes = INDICATORS.filter((i) => i.table === key).map((i) => i.code);
    if (codes.length === 0) continue;

    const { times, units } = await fetchMeta(statsDataId);
    Object.assign(unitByCat, units);
    const recentTimes = times.slice(0, RECENT_YEARS);
    for (const t of recentTimes) timeNameByCode[t.code] = t.name;

    const statData = await fetchStatsData(statsDataId, codes, recentTimes);
    collectAreas(statData, areas);
    collectValues(statData, areas, latestTimeByCat);
  }

  const areaList = [...areas.values()]
    .map((a) => {
      const derived = DERIVED.map((d) => {
        const args = d.from.map((code) => (a.v[code] !== undefined ? a.v[code] : null));
        if (args.some((x) => x === null)) return null;
        const val = d.calc(...args);
        return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
      });
      return { c: a.c, n: a.n, minutes: derived[0] };
    })
    .filter((a) => a.minutes !== null)
    .sort((a, b) => b.minutes - a.minutes);

  // 全国平均は「各県の率の単純平均」ではなく、全国の空き家数÷総住宅数（加重）で出す。
  // 都道府県データに全国行が無いため、表示中の47県の生値を合計して算出する
  // （＝住宅・土地統計調査の全国値に一致し、ランキングの県データとも整合する）。
  const [vacantCode, totalCode] = DERIVED[0].from;
  let sumVacant = 0;
  let sumTotal = 0;
  for (const a of areas.values()) {
    const vacant = a.v[vacantCode];
    const total = a.v[totalCode];
    if (Number.isFinite(vacant) && Number.isFinite(total)) {
      sumVacant += vacant;
      sumTotal += total;
    }
  }
  const national = sumTotal > 0 ? Math.round((sumVacant / sumTotal) * 1000) / 10 : null;

  const year =
    timeNameByCode[
      DERIVED[0].from
        .map((c) => latestTimeByCat[c])
        .filter(Boolean)
        .sort()
        .pop()
    ] || null;

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010108）',
    year,
    national,
    rows: areaList,
  };
  return _cache;
}