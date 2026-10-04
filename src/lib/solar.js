// =====================================================
// Countopia Stats - 太陽光発電機器のある住宅の割合 データ取得モジュール
// src/lib/solar.js
//
// 社会・人口統計体系 都道府県データ 基礎データ H居住
//   statsDataId: 0000010108（#プレフィックス不要）
//   H1101 居住世帯あり住宅数（分母）
//   H2281 太陽光を利用した発電機器のある住宅数
// 原資料は住宅・土地統計調査（5年ごと）。H2281は2008年から。値は百戸単位で丸め。
//
// 出力：rows＝割合（値キーは他展示と同じ minutes）、series＝全国値の推移
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010108';

export const CODES = {
  occupied: 'H1101',
  solar: 'H2281',
};

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[solar.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[solar.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

function toNum(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') return null;
  const num = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

async function fetchAll() {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdCat01: Object.values(CODES).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[solar.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const statData = root.STATISTICAL_DATA;

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaNames = {};
  for (const c of asArray(areaObj?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').replace(/^\d+_/, '').trim();
  }

  const byTime = {};
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    const num = toNum(rec['$']);
    if (num === null) continue;
    ((byTime[rec['@time']] ??= {})[rec['@area']] ??= {})[rec['@cat01']] = num;
  }

  const isComplete = (areas) =>
    Object.keys(areas).filter((a) => a !== '00000' && areas[a][CODES.occupied] > 0 && areas[a][CODES.solar] > 0).length >= 47;

  const times = Object.keys(byTime).sort();
  const completeTimes = times.filter((t) => isComplete(byTime[t]));
  if (completeTimes.length === 0) throw new Error('[solar.js] 47都道府県が揃う時点がありません');
  const picked = completeTimes[completeTimes.length - 1];

  // 全国値の推移（47県が揃う時点だけ）
  const series = completeTimes.map((t) => {
    const nat = byTime[t]['00000'];
    const v = nat && nat[CODES.occupied] > 0 ? (nat[CODES.solar] / nat[CODES.occupied]) * 100 : null;
    return { year: Number(t.slice(0, 4)), value: v };
  }).filter((s) => s.value !== null);

  const areas = byTime[picked];
  const rows = [];
  let national = null;
  for (const [code, o] of Object.entries(areas)) {
    const name = areaNames[code] || '';
    if (!(o[CODES.occupied] > 0)) continue;
    const rate = ((o[CODES.solar] || 0) / o[CODES.occupied]) * 100;
    if (code === '00000' || name === '全国') { national = rate; continue; }
    if (!name) continue;
    rows.push({ c: code, n: name, minutes: rate });
  }
  rows.sort((a, b) => b.minutes - a.minutes);

  return { year: `${picked.slice(0, 4)}年`, national, rows, series };
}

export async function getSolarData() {
  if (_cache) return _cache;
  const d = await fetchAll();
  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ H居住（表番号0000010108）。原資料は住宅・土地統計調査',
    year: d.year,
    national: d.national,
    rows: d.rows,
    series: d.series,
  };
  return _cache;
}
