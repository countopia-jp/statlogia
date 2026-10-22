import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - 物価の帳場（消費者物価地域差指数・全分類）
// src/lib/price-ledger.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   statsDataId: 0000010103
//   C5701〜C5712 消費者物価地域差指数（総合・家賃を除く総合・10大費目）
//   全国平均=100。2013年から毎年（小売物価統計調査（構造編））
//
// 出力（/data/price-ledger.json）
//   years:      ['2013', … '2024']（12分類すべてで47県がそろう年だけ）
//   yearLabel:  最新年の表示名
//   categories: [{ code, label }]
//   areas:      [{ c, n, v: { C5701: [年ごとの値…], … } }]（years と同じ並び）
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010103';

export const CATEGORIES = [
  { code: 'C5701', label: '総合' },
  { code: 'C5702', label: '家賃を除く総合' },
  { code: 'C5703', label: '食料' },
  { code: 'C5704', label: '住居' },
  { code: 'C5705', label: '光熱・水道' },
  { code: 'C5706', label: '家具・家事用品' },
  { code: 'C5707', label: '被服及び履物' },
  { code: 'C5708', label: '保健医療' },
  { code: 'C5709', label: '交通・通信' },
  { code: 'C5710', label: '教育' },
  { code: 'C5711', label: '教養娯楽' },
  { code: 'C5712', label: '諸雑費' },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[price-ledger.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  return await cachedJsonFetch(`${API_BASE}/${path}?${qs.toString()}`);
}

function asArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

// 分類ごとに1リクエスト（まとめると取得上限で切り詰められることがあるため）
async function fetchOne(code) {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdCat01: code,
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[price-ledger.js] getStatsData失敗(${code}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const sd = root.STATISTICAL_DATA;
  const objs = asArray(sd.CLASS_INF.CLASS_OBJ);
  const areaNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'area')?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').trim();
  }
  const timeNames = {};
  for (const c of asArray(objs.find((o) => o['@id'] === 'time')?.CLASS)) {
    timeNames[c['@code']] = (c['@name'] || '').trim();
  }
  const byTime = {};
  for (const v of asArray(sd.DATA_INF.VALUE)) {
    if (v['@cat01'] !== code) continue;
    const num = Number(String(v['$'] ?? '').replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    (byTime[v['@time']] ??= {})[v['@area']] = num;
  }
  return { areaNames, timeNames, byTime };
}

export async function getPriceLedgerData() {
  if (_cache) return _cache;

  const results = {};
  for (const cat of CATEGORIES) results[cat.code] = await fetchOne(cat.code);

  const first = results[CATEGORIES[0].code];
  const prefCodes = Object.keys(first.areaNames).filter((c) => c !== '00000' && first.areaNames[c] && first.areaNames[c] !== '全国').sort();

  // 12分類すべてで47県がそろう時点だけを使う
  const timeCodes = Object.keys(first.byTime).sort().filter((t) =>
    CATEGORIES.every((cat) => {
      const row = results[cat.code].byTime[t] || {};
      return prefCodes.filter((p) => Number.isFinite(row[p])).length >= 47;
    })
  );
  if (timeCodes.length === 0) throw new Error('[price-ledger.js] 47県がそろう時点がありません');

  const areas = prefCodes.map((p) => ({
    c: p,
    n: first.areaNames[p],
    v: Object.fromEntries(CATEGORIES.map((cat) => [cat.code, timeCodes.map((t) => results[cat.code].byTime[t][p])])),
  }));
  if (areas.length !== 47) throw new Error(`[price-ledger.js] 都道府県が47ではありません(${areas.length})`);

  const lastTime = timeCodes[timeCodes.length - 1];
  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010103）',
    years: timeCodes.map((t) => t.slice(0, 4)),
    yearLabel: first.timeNames[lastTime] || lastTime.slice(0, 4) + '年',
    firstYear: timeCodes[0].slice(0, 4),
    categories: CATEGORIES,
    areas,
  };
  return _cache;
}
