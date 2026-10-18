// =====================================================
// Countopia Stats - 家計調査の品目を2つ取るモジュール（展示の共通部品用）
// src/lib/kakei-pair.js
//
// 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）
//   statsDataId: 0004023605（年次）、cdCat02: 03（二人以上の世帯・2000年～）
//   例：010110001 米／010120000 パン／011010010 緑茶／011020010 コーヒー
// 地域は県庁所在市＋政令指定都市の52市（都道府県では引けない）。「26100 京都市」のように
// コード付きで返るので先頭の数字を落とす。値は1世帯当たりの年間支出額（円）、最新年だけを使う。
// 戻り値は PairExhibit.astro の data の形：{ year, cityCount, national, rows, second, share, source }
//   share は a ÷ (a＋b) の割合（％）
// =====================================================
const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0004023605';
const KUBUN = '03';

const _cache = new Map();

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[kakei-pair.js] ESTAT_APP_ID が設定されていません');
  return appId;
}
async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[kakei-pair.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const cleanName = (s) => (s || '').trim().replace(/^\d+\s*/, '');
function toNumber(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') return null;
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

import { seKakei } from './sampling-error.js';

export async function getKakeiPair(codeA, codeB) {
  const key = `${codeA}-${codeB}`;
  if (_cache.has(key)) return _cache.get(key);

  const meta = (await apiGet('getMetaInfo', { statsDataId: STATS_ID })).GET_META_INFO;
  if (!meta || meta.RESULT.STATUS !== 0) throw new Error(`[kakei-pair.js] getMetaInfo失敗: ${meta?.RESULT?.ERROR_MSG || '不明'}`);
  const timeObj = asArray(meta.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  const times = asArray(timeObj?.CLASS).map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((x, y) => y.code.localeCompare(x.code)).slice(0, 3); // 最新年が空のときに備えて3年分

  const root = (await apiGet('getStatsData', {
    statsDataId: STATS_ID, cdCat01: `${codeA},${codeB}`, cdCat02: KUBUN, cdTime: times.map((t) => t.code).join(','),
    metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0',
  })).GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) throw new Error(`[kakei-pair.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  const sd = root.STATISTICAL_DATA;
  const areaObj = asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaName = new Map(asArray(areaObj?.CLASS).map((c) => [c['@code'], cleanName(c['@name'])]));

  const val = { [codeA]: new Map(), [codeB]: new Map() };
  for (const rec of asArray(sd.DATA_INF.VALUE)) {
    const v = toNumber(rec['$']);
    if (v === null || !val[rec['@cat01']]) continue;
    if (!val[rec['@cat01']].has(rec['@time'])) val[rec['@cat01']].set(rec['@time'], new Map());
    val[rec['@cat01']].get(rec['@time']).set(rec['@area'], v);
  }
  const latest = times.find((t) => val[codeA].get(t.code)?.size && val[codeB].get(t.code)?.size)?.code;
  if (!latest) throw new Error('[kakei-pair.js] 有効なデータが1件もありません');
  const mA = val[codeA].get(latest), mB = val[codeB].get(latest);
  const nat = [...areaName.entries()].find(([, n]) => n === '全国')?.[0];
  const listOf = (m) => [...m.entries()].filter(([c]) => c !== nat).map(([c, v]) => ({ c, n: areaName.get(c) || c, minutes: v })).sort((x, y) => y.minutes - x.minutes);
  const sh = new Map();
  for (const [c, x] of mA) { const y = mB.get(c); if (y !== undefined && x + y > 0) sh.set(c, (x / (x + y)) * 100); }

  const rows = listOf(mA);
  const out = {
    source: '政府統計の総合窓口(e-Stat) 家計調査 家計収支編 二人以上の世帯 品目分類（2025年改定）（総数：金額）（表番号0004023605）',
    year: times.find((t) => t.code === latest)?.name || null,
    cityCount: rows.length,
    national: mA.get(nat) ?? null,
    rows,
    second: { national: mB.get(nat) ?? null, rows: listOf(mB), se: seKakei(codeB) },
    se: seKakei(codeA), seKey: 'n', seKind: 'kakei',
    share: { national: sh.get(nat) ?? null, rows: listOf(sh) },
  };
  _cache.set(key, out);
  return out;
}
