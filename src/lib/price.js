// =====================================================
// Countopia Stats - 消費者物価地域差指数データ取得モジュール
// src/lib/price.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   statsDataId: 0000010103
//   C5701 消費者物価地域差指数（総合）  ※全国平均=100
//   C5703 消費者物価地域差指数（食料）
//   C5705 消費者物価地域差指数（光熱・水道）
//   C5710 消費者物価地域差指数（教育）
// 旧系統（C5201/C5301/C5601）は2007〜2013年度で更新停止のため使わない。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010103';

export const CODES = {
  total: 'C5701',
  food: 'C5703',
  heat: 'C5705',
  education: 'C5710',
};

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[price.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[price.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

export async function getPriceData() {
  if (_cache) return _cache;

  const json = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdCat01: `${CODES.total},${CODES.food},${CODES.heat},${CODES.education}`,
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[price.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const sd = root.STATISTICAL_DATA;
  const classObjs = asArray(sd.CLASS_INF.CLASS_OBJ);

  const areaNames = {};
  for (const c of asArray(classObjs.find((o) => o['@id'] === 'area')?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').trim();
  }
  const timeNames = {};
  for (const c of asArray(classObjs.find((o) => o['@id'] === 'time')?.CLASS)) {
    timeNames[c['@code']] = (c['@name'] || '').trim();
  }

  // 指標ごとに最新年を求め、その年の47都道府県だけを拾う
  const build = (code) => {
    const vals = asArray(sd.DATA_INF.VALUE).filter((v) => {
      if (v['@cat01'] !== code) return false;
      const raw = v['$'];
      return raw !== undefined && raw !== null && raw !== '' && raw !== '-' && raw !== '***' && raw !== 'X';
    });
    if (vals.length === 0) return { year: null, rows: [] };
    const latest = vals.map((v) => v['@time']).sort().pop();
    const rows = vals
      .filter((v) => v['@time'] === latest)
      .map((v) => ({ c: v['@area'], n: areaNames[v['@area']] || '', minutes: Number(v['$']) }))
      .filter((r) => r.n && r.n !== '全国' && Number.isFinite(r.minutes))
      .sort((a, b) => b.minutes - a.minutes);
    return { year: timeNames[latest] || latest, rows };
  };

  const total = build(CODES.total);
  const food = build(CODES.food);
  const heat = build(CODES.heat);
  const education = build(CODES.education);

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010103）',
    year: total.year,
    // 地域差指数は全国平均=100 が定義。加重再計算はしない
    national: 100,
    rows: total.rows,
    food,
    heat,
    education,
  };
  return _cache;
}