// =====================================================
// Countopia Stats - カラオケ・楽器の演奏 行動者率データ取得モジュール
// src/lib/karaoke.js
//
// 社会生活基本調査 2021年
//   statsDataId: 0003456573（男女,趣味・娯楽の種類別行動者率(10歳以上)－全国，都道府県）
//   cat03=12（カラオケ）、cat03=09（楽器の演奏）
//   cat01=0（総数）、cat02=99000（総数）、tab=202110A09B08（行動者率）
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const STATS_DATA_ID = '0003456573';
const TAB_RATE = '202110A09B08';
const CAT_SEX_TOTAL = '0';
const CAT_DID_TOTAL = '99000';

export const CODES = {
  karaoke: '12',
  instrument: '09',
};

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[karaoke.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[karaoke.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

// 種目ごとに1リクエスト。まとめて取ると取得上限で切り詰められるため分ける
async function fetchOne(cat03) {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdTab: TAB_RATE,
    cdCat01: CAT_SEX_TOTAL,
    cdCat02: CAT_DID_TOTAL,
    cdCat03: cat03,
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[karaoke.js] getStatsData失敗(cat03=${cat03}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const statData = root.STATISTICAL_DATA;

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaNames = {};
  for (const c of asArray(areaObj?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').trim();
  }

  const rows = [];
  let national = null;
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    // 行動者率以外（行動者数・平均時間など）が混ざることがあるので、必ず確認する
    if (rec['@tab'] !== TAB_RATE) continue;
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;

    const code = rec['@area'];
    const name = areaNames[code] || '';
    if (name === '全国') { national = num; continue; }
    if (!name) continue;
    rows.push({ c: code, n: name, minutes: num });
  }
  rows.sort((a, b) => b.minutes - a.minutes);

  if (rows.length !== 47) {
    throw new Error(`[karaoke.js] 47都道府県そろいません(cat03=${cat03}, ${rows.length}件)`);
  }

  return { national, rows };
}

export async function getKaraokeData() {
  if (_cache) return _cache;

  const karaoke = await fetchOne(CODES.karaoke);
  const instrument = await fetchOne(CODES.instrument);

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会生活基本調査 2021年（表番号0003456573）',
    year: '2021年',
    national: karaoke.national,
    rows: karaoke.rows,
    instrument,
  };
  return _cache;
}
