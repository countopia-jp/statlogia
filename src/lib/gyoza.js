// =====================================================
// Countopia Stats - ぎょうざ支出額データ取得モジュール
// src/lib/gyoza.js
//
// 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）
//   statsDataId: 0004023605（年次）
//   cdCat01: 010920070（371 ぎょうざ）
//   cdCat02: 03（二人以上の世帯・2000年～）
//
// ※この表の地域は「都道府県庁所在市＋政令指定都市」の52市＋全国。
//   都道府県では引けない。社会・人口統計体系とは別系統の調査。
// ※地域名が「09201 宇都宮市」のようにコード付きで返るため、先頭の数字を落とす。
// ※値は1世帯当たりの年間支出額（円）。
//
// rows / national は他展示に合わせて {c, n, minutes} 形式（minutes=円/年）。
// series は時系列グラフ用（上位3市＋全国）。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0004023605';
const CODE = '010920070';
const KUBUN = '03';
const FROM_YEAR = 2000;   // cdCat02=03 は2000年以降

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[gyoza.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[gyoza.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// 「09201 宇都宮市」→「宇都宮市」
const cleanName = (s) => (s || '').trim().replace(/^\d+\s*/, '');

function toNumber(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[gyoza.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);
  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[gyoza.js] 時間軸メタが見つかりません');

  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .filter((t) => Number(t.code.slice(0, 4)) >= FROM_YEAR)
    .sort((a, b) => b.code.localeCompare(a.code));   // 新しい順

  return { times };
}

async function fetchStatsData(times) {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_ID,
    cdCat01: CODE,
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
    throw new Error(`[gyoza.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getGyozaData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const timeNameByCode = Object.fromEntries(times.map((t) => [t.code, t.name]));

  const statData = await fetchStatsData(times);

  // 地域名の対応表
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaName = new Map();
  for (const c of asArray(areaObj?.CLASS)) {
    areaName.set(c['@code'], cleanName(c['@name']));
  }

  // 値を 地域 × 年 に並べ直す
  const byArea = new Map();   // code -> Map(timeCode -> value)
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    const v = toNumber(rec['$']);
    if (v === null) continue;
    const a = rec['@area'];
    if (!byArea.has(a)) byArea.set(a, new Map());
    byArea.get(a).set(rec['@time'], v);
  }

  // 最新年 = 値が1つでも入っている最も新しい年
  const latestTime = times.find((t) => [...byArea.values()].some((m) => m.has(t.code)))?.code ?? null;
  if (!latestTime) throw new Error('[gyoza.js] 有効なデータが1件もありません');

  // 最新年の一覧
  const computed = [...byArea.entries()].map(([c, m]) => ({
    c,
    n: areaName.get(c) || c,
    minutes: m.get(latestTime) ?? null,
  }));

  const nationalEntry = computed.find((a) => a.n === '全国');
  const national = nationalEntry ? nationalEntry.minutes : null;

  const rows = computed
    .filter((a) => a !== nationalEntry && a.minutes !== null)
    .sort((a, b) => b.minutes - a.minutes);

  // 時系列（上位3市＋全国）。古い順に並べる
  const asc = [...times].reverse();
  const pickSeries = (entry) => ({
    name: entry.n,
    points: asc
      .map((t) => ({ year: timeNameByCode[t.code], value: byArea.get(entry.c)?.get(t.code) ?? null }))
      .filter((p) => p.value !== null),
  });

  const series = rows.slice(0, 3).map(pickSeries);
  if (nationalEntry) series.push(pickSeries(nationalEntry));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）（表番号0004023605）',
    note: '1世帯当たりの年間支出額（二人以上の世帯）。家計調査の対象は都道府県庁所在市と政令指定都市の52市で、都道府県別の数字はありません。浜松市の数字は2008年からです。それ以前は家計調査の対象に入っていませんでした。',
    year: timeNameByCode[latestTime] || null,
    cityCount: rows.length,
    national,
    rows,
    series,
  };
  return _cache;
}