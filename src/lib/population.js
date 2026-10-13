// =====================================================
// Countopia Stats - 定番統計（人口・世帯）データ取得モジュール
// src/lib/population.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   A 人口・世帯  statsDataId: 0000010101（毎年）
//
// appIdはCloudflare PagesのSecret「ESTAT_APP_ID」から取得。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const TABLES = {
  population: '0000010101',
};

// 取得する指標。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: 'A1101', table: 'population', label: '総人口', group: 'pop', kind: 'value' },
  { code: 'A1306', table: 'population', label: '65歳以上人口割合（高齢化率）', group: 'pop', kind: 'value' },
  { code: 'A1304', table: 'population', label: '15歳未満人口割合（年少人口率）', group: 'pop', kind: 'value' },
  { code: 'A192003', table: 'population', label: '人口増減率', group: 'pop', kind: 'value' },
  { code: 'A7101', table: 'population', label: '世帯数', group: 'household', kind: 'value' },
  { code: 'A710211', table: 'population', label: '一般世帯平均人員数', group: 'household', kind: 'value' },
  { code: 'A4103', table: 'population', label: '合計特殊出生率', group: 'birth', kind: 'value' },
  { code: 'A9121', table: 'population', label: '婚姻率（人口千人当たり）', group: 'birth', kind: 'value' },
];

// 計算で作る指標（今回はなし）
export const DERIVED = [];

// 直近何年度ぶんを取得するか
const RECENT_YEARS = 12;

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[population.js] ESTAT_APP_ID が設定されていません');
  }
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[population.js] API HTTP ${res.status}: ${path}`);
  }
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : [x];
}

// --- メタ情報：時間軸コード（新しい順）と指標の単位を取得 ---
async function fetchMeta(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[population.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);

  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[population.js] 時間軸メタが見つかりません(${statsDataId})`);
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

// --- 本体データ取得 ---
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
    throw new Error(`[population.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

// --- 地域メタから都道府県リストを組み立て（全国は除外） ---
function collectAreas(statData, areas) {
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  if (!areaObj) return;
  for (const c of asArray(areaObj.CLASS)) {
    const code = c['@code'];
    const name = (c['@name'] || '').trim();
    if (name === '全国' || /^0+$/.test(code)) continue;
    if (!areas.has(code)) areas.set(code, { c: code, n: name, v: {} });
  }
}

// --- VALUEを走査して (地域×指標) の最新値と履歴を採取 ---
function collectValues(statData, areas, latestTimeByCat) {
  const valueList = asArray(statData.DATA_INF.VALUE);
  valueList.sort((a, b) => a['@time'].localeCompare(b['@time'])); // 昇順（古い→新しい）

  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;

    // 履歴に追加（時系列順）
    if (!area.h) area.h = {};
    if (!area.h[cat]) area.h[cat] = [];
    area.h[cat].push({ time: rec['@time'], value: num });

    // 最新値の更新：昇順に並べてあるので、地域ごとに上書きすれば最後に残るのが最新
    // （2026-10-13 修正。以前は「全地域で共通の最新年より新しいときだけ」上書きしていたため、
    //   最初の地域（北海道）以外は一番古い年の値のまま残っていた）
    area.v[cat] = num;
    if (rec['@time'] > (latestTimeByCat[cat] || '')) latestTimeByCat[cat] = rec['@time'];
  }
}

// --- メインエントリ ---
export async function getPopulationData() {
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
      const base = INDICATORS.map((ind) => (a.v[ind.code] !== undefined ? a.v[ind.code] : null));
      // A1101（総人口）の時系列のみ抽出（年名に変換）
      const totalSeries = (a.h?.A1101 || [])
        .map((pt) => ({ year: timeNameByCode[pt.time] || pt.time, value: pt.value }));
      return { c: a.c, n: a.n, v: base, series: totalSeries };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  const indicators = INDICATORS.map((ind) => ({
    code: ind.code,
    label: ind.label,
    unit: unitByCat[ind.code] || null,
    group: ind.group,
    kind: ind.kind,
    year: timeNameByCode[latestTimeByCat[ind.code]] || null,
  }));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010101）',
    indicators,
    areas: areaList,
  };
  return _cache;
}