// =====================================================
// Countopia Stats - 牛肉・豚肉の支出額データ取得モジュール
// src/lib/beef-pork.js
//
// 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）
//   statsDataId: 0004023605（年次）
//   cdCat01: 010310010（牛肉）／010310020（豚肉）
//   cdCat02: 03（二人以上の世帯・2000年～）
//
// ※この表の地域は「都道府県庁所在市＋政令指定都市」の52市＋全国。都道府県では引けない。
// ※地域名が「26100 京都市」のようにコード付きで返るため、先頭の数字を落とす。
// ※値は1世帯当たりの年間支出額（円）。最新年だけを使う。
//
// rows / national は他展示に合わせて {c, n, minutes} 形式（minutes=円/年）。
//   戻り値: { year, cityCount, national, rows（牛肉）, pork: { national, rows }, beefShare: { national, rows } }
//   beefShare は「牛肉＋豚肉のうち牛肉の割合（％）」。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0004023605';
const BEEF = '010310010';
const PORK = '010310020';
const KUBUN = '03';

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[beef-pork.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[beef-pork.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const cleanName = (s) => (s || '').trim().replace(/^\d+\s*/, '');

function toNumber(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchTimes() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[beef-pork.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[beef-pork.js] 時間軸メタが見つかりません');
  return asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code))   // 新しい順
    .slice(0, 3);                                    // 最新年が空のときに備えて3年分
}

async function fetchStatsData(times) {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_ID,
    cdCat01: `${BEEF},${PORK}`,
    cdCat02: KUBUN,
    cdTime: times.map((t) => t.code).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[beef-pork.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getBeefPorkData() {
  if (_cache) return _cache;

  const times = await fetchTimes();
  const timeNameByCode = Object.fromEntries(times.map((t) => [t.code, t.name]));
  const statData = await fetchStatsData(times);

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaName = new Map(asArray(areaObj?.CLASS).map((c) => [c['@code'], cleanName(c['@name'])]));

  // 品目 → 年 → 地域 → 値
  const val = { [BEEF]: new Map(), [PORK]: new Map() };
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    const v = toNumber(rec['$']);
    const item = rec['@cat01'];
    if (v === null || !val[item]) continue;
    if (!val[item].has(rec['@time'])) val[item].set(rec['@time'], new Map());
    val[item].get(rec['@time']).set(rec['@area'], v);
  }

  // 最新年 = 牛肉・豚肉の両方に値がある最も新しい年
  const latest = times.find((t) => val[BEEF].get(t.code)?.size && val[PORK].get(t.code)?.size)?.code;
  if (!latest) throw new Error('[beef-pork.js] 有効なデータが1件もありません');

  const beefMap = val[BEEF].get(latest);
  const porkMap = val[PORK].get(latest);
  const nationalCode = [...areaName.entries()].find(([, n]) => n === '全国')?.[0];

  const listOf = (map) =>
    [...map.entries()]
      .filter(([c]) => c !== nationalCode)
      .map(([c, v]) => ({ c, n: areaName.get(c) || c, minutes: v }))
      .sort((a, b) => b.minutes - a.minutes);

  const shareMap = new Map();
  for (const [c, b] of beefMap) {
    const p = porkMap.get(c);
    if (p === undefined || b + p === 0) continue;
    shareMap.set(c, (b / (b + p)) * 100);
  }

  const rows = listOf(beefMap);
  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）（表番号0004023605）',
    year: timeNameByCode[latest] || null,
    cityCount: rows.length,
    national: beefMap.get(nationalCode) ?? null,
    rows,
    pork: { national: porkMap.get(nationalCode) ?? null, rows: listOf(porkMap) },
    beefShare: { national: shareMap.get(nationalCode) ?? null, rows: listOf(shareMap) },
  };
  return _cache;
}
