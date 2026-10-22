import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - 学校の情報化ダッシュボード用データ取得モジュール
// src/lib/ict.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   E 教育  statsDataId: 0000010105
//
// 学校のICT整備を小中高3校種で。living.js と同じ型。
// 「教育用コンピュータ1台当たりの児童生徒数」は少ないほど整備が進んでいる
// （lowerIsBetter: true）。窓口側のランキングで昇順に使う。
// PC1台当たり児童数（小学校・E9401）のみ時系列も保持する。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const TABLES = {
  edu: '0000010105',
};

// 取得する指標。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: 'E9401', table: 'edu', label: '1台当たりの児童数（小学校）',   group: 'pc',    kind: 'value', lowerIsBetter: true },
  { code: 'E9402', table: 'edu', label: '1台当たりの生徒数（中学校）',   group: 'pc',    kind: 'value', lowerIsBetter: true },
  { code: 'E9403', table: 'edu', label: '1台当たりの生徒数（高等学校）', group: 'pc',    kind: 'value', lowerIsBetter: true },
  { code: 'E9404', table: 'edu', label: '1人あたりの学習用PC台数（小学校）',   group: 'pc1', kind: 'value' },
  { code: 'E9405', table: 'edu', label: '1人あたりの学習用PC台数（中学校）',   group: 'pc1', kind: 'value' },
  { code: 'E9406', table: 'edu', label: '1人あたりの学習用PC台数（高等学校）', group: 'pc1', kind: 'value' },
  { code: 'E9414', table: 'edu', label: '電子黒板整備率（小学校）',       group: 'board', kind: 'value' },
  { code: 'E9415', table: 'edu', label: '電子黒板整備率（中学校）',       group: 'board', kind: 'value' },
  { code: 'E9416', table: 'edu', label: '電子黒板整備率（高等学校）',     group: 'board', kind: 'value' },
  { code: 'E9417', table: 'edu', label: '大型提示装置の整備率（小学校）',   group: 'display', kind: 'value' },
  { code: 'E9418', table: 'edu', label: '大型提示装置の整備率（中学校）',   group: 'display', kind: 'value' },
  { code: 'E9419', table: 'edu', label: '大型提示装置の整備率（高等学校）', group: 'display', kind: 'value' },
  { code: 'E9421', table: 'edu', label: 'デジタル教科書整備率（小学校）',   group: 'text', kind: 'value' },
  { code: 'E9422', table: 'edu', label: 'デジタル教科書整備率（中学校）',   group: 'text', kind: 'value' },
  { code: 'E9423', table: 'edu', label: 'デジタル教科書整備率（高等学校）', group: 'text', kind: 'value' },
];

// 計算で作る指標は無し
export const DERIVED = [];

const RECENT_YEARS = 12;

// 時系列グラフに使う指標コード（PC1台当たり児童数・小学校のみ）
const SERIES_CODE = 'E9401';

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[ict.js] ESTAT_APP_ID が設定されていません');
  }
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  return await cachedJsonFetch(url);
}

function asArray(x) {
  return Array.isArray(x) ? x : [x];
}

async function fetchMeta(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[ict.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);

  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[ict.js] 時間軸メタが見つかりません(${statsDataId})`);
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
    throw new Error(`[ict.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

function collectAreas(statData, areas) {
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  if (!areaObj) return;
  for (const c of asArray(areaObj.CLASS)) {
    const code = c['@code'];
    const name = (c['@name'] || '').trim();
    if (name === '全国' || /^0+$/.test(code)) continue;
    if (!areas.has(code)) areas.set(code, { c: code, n: name, v: {}, h: {} });
  }
}

// --- VALUEを走査して (地域×指標) の最新値と履歴を採取 ---
function collectValues(statData, areas, latestTimeByCat) {
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
    if (!latestTimeByCat[cat] || rec['@time'] > latestTimeByCat[cat]) {
      latestTimeByCat[cat] = rec['@time'];
    }
  }
}

export async function getIctData() {
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
      // PC1台当たり児童数（小学校）の時系列（年名に変換して昇順のまま）
      const series = (a.h[SERIES_CODE] || []).map((pt) => ({
        year: timeNameByCode[pt.time] || pt.time,
        value: pt.value,
      }));
      return { c: a.c, n: a.n, v: base, series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  const indicators = INDICATORS.map((ind) => ({
    code: ind.code,
    label: ind.label,
    unit: unitByCat[ind.code] || null,
    group: ind.group,
    kind: ind.kind,
    lowerIsBetter: ind.lowerIsBetter || false,
    year: timeNameByCode[latestTimeByCat[ind.code]] || null,
  }));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010105）',
    indicators,
    areas: areaList,
  };
  return _cache;
}