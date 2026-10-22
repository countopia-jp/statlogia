import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - 教育予算・財政力データ取得モジュール
// src/lib/education-budget.js
//
// 社会・人口統計体系 都道府県データ 社会生活統計指標
//   D 行政基盤  statsDataId: 0000010204
//   E 教育     statsDataId: 0000010205
//
// 「自治体がどれだけ教育にお金をかけているか」を都道府県別に見る。
// 財政力指数（#D0110101）のみ時系列（毎年調査のため12点取れる）も保持する。
// appIdはCloudflare PagesのSecret「ESTAT_APP_ID」から取得。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const TABLES = {
  finance: '0000010204',
  education: '0000010205',
};

// 取得する指標。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: '#D0110101', table: 'finance', label: '財政力指数（都道府県財政）', group: 'finance', kind: 'value' },
  { code: '#D0331403', table: 'finance', label: '人口1人当たり教育費（都道府県・市町村財政合計）', group: 'finance', kind: 'value' },
  { code: '#D0331503', table: 'finance', label: '児童1人当たり公立小学校費', group: 'finance', kind: 'value' },
  { code: '#D0331603', table: 'finance', label: '生徒1人当たり公立中学校費', group: 'finance', kind: 'value' },
  { code: '#D0331703', table: 'finance', label: '生徒1人当たり公立高等学校費', group: 'finance', kind: 'value' },
  { code: '#D0332003', table: 'finance', label: '人口1人当たり社会教育費', group: 'finance', kind: 'value' },
  { code: '#E10102', table: 'education', label: '小学校教育費（児童1人当たり）', group: 'education', kind: 'value' },
  { code: '#E10103', table: 'education', label: '中学校教育費（生徒1人当たり）', group: 'education', kind: 'value' },
  { code: '#E10104', table: 'education', label: '高等学校教育費（生徒1人当たり）', group: 'education', kind: 'value' },
];

export const DERIVED = [];

const RECENT_YEARS = 12;

// 時系列グラフに使う指標コード（財政力指数のみ）
const SERIES_CODE = '#D0110101';

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[education-budget.js] ESTAT_APP_ID が設定されていません');
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
    throw new Error(`[education-budget.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);

  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[education-budget.js] 時間軸メタが見つかりません(${statsDataId})`);
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
    throw new Error(`[education-budget.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
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

export async function getEducationBudgetData() {
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
      // 財政力指数の時系列（年名に変換して昇順のまま）
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
    year: timeNameByCode[latestTimeByCat[ind.code]] || null,
  }));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 社会生活統計指標（表番号0000010204・0000010205）',
    note: '「人口1人当たり」「児童1人当たり」は、統計表の側ですでに割り算された指標をそのまま使っています。こちらで計算し直してはいません。財政の側（財政力指数・教育費・学校費）は都道府県と市町村の決算を合計した額で、県の支出だけではありません。教育の側の「1人当たり教育費」は別の統計から取っているため、財政の側の学校費とは数字が一致しません。',
    indicators,
    areas: areaList,
  };
  return _cache;
}