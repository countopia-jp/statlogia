// =====================================================
// Countopia - 教育ダッシュボード用データ取得モジュール
// src/lib/education.js
//
// 社会・人口統計体系 市区町村データ 基礎データ E教育
// statsDataId: 0000020105
//
// ビルド時に1回だけAPIを叩き、education.json用の
// 整形済みデータを返す。appIdはCloudflare Pagesの
// Secret「ESTAT_APP_ID」から取得（クライアントには出ない）。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000020105';

// 取得する指標（cat01コード）。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: 'E1101', label: '幼稚園数', unit: '園', group: 'kindergarten', kind: 'count' },
  { code: 'E1501', label: '幼稚園在園者数', unit: '人', group: 'kindergarten', kind: 'students' },
  { code: 'E2101', label: '小学校数', unit: '校', group: 'elementary', kind: 'count' },
  { code: 'E2401', label: '小学校教員数', unit: '人', group: 'elementary', kind: 'teachers' },
  { code: 'E2501', label: '小学校児童数', unit: '人', group: 'elementary', kind: 'students' },
  { code: 'E3101', label: '中学校数', unit: '校', group: 'junior', kind: 'count' },
  { code: 'E3401', label: '中学校教員数', unit: '人', group: 'junior', kind: 'teachers' },
  { code: 'E3501', label: '中学校生徒数', unit: '人', group: 'junior', kind: 'students' },
  { code: 'E4101', label: '高等学校数', unit: '校', group: 'high', kind: 'count' },
  { code: 'E4501', label: '高等学校生徒数', unit: '人', group: 'high', kind: 'students' },
];

// 直近何年度ぶんを取得するか（指標ごとの収録年ズレへの保険）
const RECENT_YEARS = 3;

// ビルド内キャッシュ（estat.jsと同じ思想：同一ビルド中は1回だけ叩く）
let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[education.js] ESTAT_APP_ID が設定されていません');
  }
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`[education.js] API HTTP ${res.status}: ${path}`);
  }
  const json = await res.json();
  return json;
}

// --- メタ情報から時間軸コード一覧を取得（新しい順） ---
async function fetchTimeCodes() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_DATA_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[education.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = root.METADATA_INF.CLASS_INF.CLASS_OBJ;
  const timeObj = (Array.isArray(classObjs) ? classObjs : [classObjs]).find(
    (o) => o['@id'] === 'time'
  );
  if (!timeObj) throw new Error('[education.js] 時間軸メタが見つかりません');
  const items = Array.isArray(timeObj.CLASS) ? timeObj.CLASS : [timeObj.CLASS];
  // コード降順 = 新しい順
  return items
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
}

// --- 本体データ取得 ---
async function fetchStatsData(timeCodes) {
  const params = {
    statsDataId: STATS_DATA_ID,
    cdCat01: INDICATORS.map((i) => i.code).join(','),
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
    throw new Error(`[education.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

// --- 地域メタから市区町村リストを組み立て ---
function buildAreaIndex(statData) {
  const classObjs = statData.CLASS_INF.CLASS_OBJ;
  const areaObj = (Array.isArray(classObjs) ? classObjs : [classObjs]).find(
    (o) => o['@id'] === 'area'
  );
  const items = Array.isArray(areaObj.CLASS) ? areaObj.CLASS : [areaObj.CLASS];

  const areas = new Map();
  for (const c of items) {
    const code = c['@code'];
    // 5桁の市区町村コードのみ。全国(00000)・都道府県(XX000)は除外
    if (!/^\d{5}$/.test(code) || code.endsWith('000')) continue;

    const rawName = (c['@name'] || '').trim();
    // "北海道 札幌市" / "北海道 札幌市 中央区" 形式を分解
    const parts = rawName.split(/\s+/);
    const pref = parts[0];
    const name = parts.slice(1).join(' ') || rawName;

    const last3 = parseInt(code.slice(2), 10);
    const isTokyo = code.startsWith('13');
    // 政令市の区(101-199, 東京以外) と 東京の特別区部計(13100) はランキング除外
    // ※選択UIには残す。東京23区(13101-13123)はランキング対象
    const excludeFromRanking =
      (!isTokyo && last3 >= 101 && last3 <= 199) || code === '13100';

    areas.set(code, { c: code, p: pref, n: name, x: excludeFromRanking, v: {} });
  }
  return areas;
}

// --- メインエントリ ---
export async function getEducationData() {
  if (_cache) return _cache;

  const allTimes = await fetchTimeCodes();
  const recentTimes = allTimes.slice(0, RECENT_YEARS);
  const statData = await fetchStatsData(recentTimes);

  const areas = buildAreaIndex(statData);
  const timeNameByCode = Object.fromEntries(recentTimes.map((t) => [t.code, t.name]));

  // VALUEを走査：各(地域×指標)について最新年度の値を採用
  const values = statData.DATA_INF.VALUE;
  const valueList = Array.isArray(values) ? values : [values];
  // 指標ごとに「実際に採用された最新年度」を記録
  const latestTimeByCat = {};

  // timeコード降順で処理できるようソート（新しい値を先に入れて上書きしない）
  valueList.sort((a, b) => b['@time'].localeCompare(a['@time']));

  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (area.v[cat] === undefined) {
      area.v[cat] = num;
      if (!latestTimeByCat[cat] || rec['@time'] > latestTimeByCat[cat]) {
        latestTimeByCat[cat] = rec['@time'];
      }
    }
  }

  // 出力形状：v をINDICATORS順の配列に変換（欠損はnull）
  const areaList = [...areas.values()]
    .map((a) => ({
      c: a.c,
      p: a.p,
      n: a.n,
      x: a.x,
      v: INDICATORS.map((ind) => (a.v[ind.code] !== undefined ? a.v[ind.code] : null)),
    }))
    .sort((a, b) => a.c.localeCompare(b.c));

  const indicators = INDICATORS.map((ind) => ({
    code: ind.code,
    label: ind.label,
    unit: ind.unit,
    group: ind.group,
    kind: ind.kind,
    year: timeNameByCode[latestTimeByCat[ind.code]] || null,
  }));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020105）',
    indicators,
    areas: areaList,
  };
  return _cache;
}
