// =====================================================
// Countopia Stats - 住宅の建て方（一戸建率・木造率）データ取得モジュール
// src/lib/housing-type.js
//
// 社会・人口統計体系 都道府県データ 基礎データ H居住
//   statsDataId: 0000010108（#プレフィックス不要）
//   H1101   居住世帯あり住宅数（分母。空き家などを除いた「人の住む家」）
//   H1401   一戸建住宅数
//   H140101 一戸建住宅数（木造）
// 原資料は住宅・土地統計調査（5年ごと）。値は百戸単位で丸められている。
//
// 出力：
//   rows     = 一戸建率（H1401 / H1101 ×100）。値キーは他展示と同じ minutes
//   wood     = 一戸建のうち木造の割合（H140101 / H1401 ×100）
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010108';

export const CODES = {
  occupied: 'H1101',
  detached: 'H1401',
  detachedWood: 'H140101',
};

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[housing-type.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[housing-type.js] API HTTP ${res.status}: ${path}`);
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

// 3コード×48地域×全時点を1リクエストで取る（都道府県版なので上限には届かない）
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
    throw new Error(`[housing-type.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const statData = root.STATISTICAL_DATA;

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaNames = {};
  for (const c of asArray(areaObj?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').replace(/^\d+_/, '').trim();
  }

  // time → area → cat01 → 値
  const byTime = {};
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    const num = toNum(rec['$']);
    if (num === null) continue;
    const t = rec['@time'];
    const a = rec['@area'];
    ((byTime[t] ??= {})[a] ??= {})[rec['@cat01']] = num;
  }

  // 47都道府県すべてで3コードが揃う最新時点を採用
  const times = Object.keys(byTime).sort().reverse();
  let picked = null;
  for (const t of times) {
    const areas = byTime[t];
    const prefCodes = Object.keys(areas).filter((a) => a !== '00000');
    const complete = prefCodes.filter((a) => {
      const o = areas[a];
      return o[CODES.occupied] > 0 && o[CODES.detached] > 0 && o[CODES.detachedWood] !== undefined;
    });
    if (complete.length >= 47) { picked = t; break; }
  }
  if (!picked) throw new Error('[housing-type.js] 47都道府県が揃う時点がありません');

  const areas = byTime[picked];
  const detachedRows = [];
  const woodRows = [];
  let national = null;
  let woodNational = null;

  for (const [code, o] of Object.entries(areas)) {
    const name = areaNames[code] || '';
    if (!(o[CODES.occupied] > 0) || !(o[CODES.detached] > 0)) continue;
    const detachedRate = (o[CODES.detached] / o[CODES.occupied]) * 100;
    const woodRate = (o[CODES.detachedWood] / o[CODES.detached]) * 100;
    if (code === '00000' || name === '全国') {
      national = detachedRate;
      woodNational = woodRate;
      continue;
    }
    if (!name) continue;
    detachedRows.push({ c: code, n: name, minutes: detachedRate });
    woodRows.push({ c: code, n: name, minutes: woodRate });
  }
  detachedRows.sort((a, b) => b.minutes - a.minutes);
  woodRows.sort((a, b) => b.minutes - a.minutes);

  return {
    year: `${picked.slice(0, 4)}年`,
    national,
    rows: detachedRows,
    wood: { national: woodNational, rows: woodRows },
  };
}

export async function getHousingTypeData() {
  if (_cache) return _cache;
  const d = await fetchAll();
  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ H居住（表番号0000010108）。原資料は住宅・土地統計調査',
    year: d.year,
    national: d.national,
    rows: d.rows,
    wood: d.wood,
  };
  return _cache;
}
