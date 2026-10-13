// =====================================================
// Countopia Stats - 趣味・娯楽の行動者率を2種類取るモジュール（展示の共通部品用）
// src/lib/activity-pair.js
//
// 社会生活基本調査 2021年
//   statsDataId: 0003456573（男女,趣味・娯楽の種類別行動者率(10歳以上)－全国，都道府県）
//   cat01=0（総数）、cat02=99000（総数）、tab=202110A09B08（行動者率）、cat03=種類（2桁）
//   スポーツの表 0003456409 も同じ軸なので第3引数で渡せる（例：19 ジョギング・マラソン／20 ウォーキング・軽い体操）
//   例：02 美術鑑賞／04 映画館での映画鑑賞／33 遊園地・動植物園・水族館などの見物／34 キャンプ
// 戻り値は PairExhibit.astro の data の形：{ year, national, rows, second: { national, rows }, source }
// =====================================================
const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0003456573'; // 趣味・娯楽。スポーツは 0003456409（軸は同じ：cat01男女・cat02人口集中地区・cat03種類）
const TABLE_NAME = { '0003456573': '趣味・娯楽', '0003456409': 'スポーツ' };
const TAB_RATE = '202110A09B08';

const _cache = new Map();

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[activity-pair.js] ESTAT_APP_ID が設定されていません');
  return appId;
}
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

// 種類ごとに1リクエスト（まとめると取得上限で切り詰められるため）
async function fetchOne(cat03, statsId) {
  const qs = new URLSearchParams({
    appId: getAppId(), lang: 'J', statsDataId: statsId, cdTab: TAB_RATE,
    cdCat01: '0', cdCat02: '99000', cdCat03: cat03,
    metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0',
  });
  const res = await fetch(`${API_BASE}/getStatsData?${qs.toString()}`);
  if (!res.ok) throw new Error(`[activity-pair.js] API HTTP ${res.status}`);
  const root = (await res.json()).GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) throw new Error(`[activity-pair.js] getStatsData失敗(cat03=${cat03}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  const sd = root.STATISTICAL_DATA;
  const areaObj = asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const names = Object.fromEntries(asArray(areaObj?.CLASS).map((c) => [c['@code'], (c['@name'] || '').trim()]));
  const rows = [];
  let national = null;
  for (const rec of asArray(sd.DATA_INF.VALUE)) {
    if (rec['@tab'] !== TAB_RATE) continue;
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    const n = names[rec['@area']] || '';
    if (n === '全国') { national = num; continue; }
    if (n) rows.push({ c: rec['@area'], n, minutes: num });
  }
  rows.sort((x, y) => y.minutes - x.minutes);
  if (rows.length !== 47) throw new Error(`[activity-pair.js] 47都道府県そろいません(cat03=${cat03}, ${rows.length}件)`);
  return { national, rows };
}

export async function getActivityPair(codeA, codeB, statsId = STATS_DATA_ID) {
  const key = `${statsId}-${codeA}-${codeB}`;
  if (_cache.has(key)) return _cache.get(key);
  const a = await fetchOne(codeA, statsId);
  const b = await fetchOne(codeB, statsId);
  const out = {
    source: `政府統計の総合窓口(e-Stat) 社会生活基本調査 2021年 ${TABLE_NAME[statsId] || ''}の種類別行動者率（表番号${statsId}）`,
    year: '2021年',
    national: a.national,
    rows: a.rows,
    second: b,
  };
  _cache.set(key, out);
  return out;
}
