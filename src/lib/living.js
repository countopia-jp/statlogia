import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - 暮らしダッシュボード用データ取得モジュール
// src/lib/living.js
//
// 社会・人口統計体系 都道府県データ 基礎データ
//   F 労働  statsDataId: 0000010106（毎年）
//   H 居住  statsDataId: 0000010108（5年ごと）
//
// 調査周期が違うため、指標ごとに「値のある最新年度」を採用する。
// 最低賃金（F6501）のみ時系列（毎年データが取れるため）も保持する。
// appIdはCloudflare PagesのSecret「ESTAT_APP_ID」から取得。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

const TABLES = {
  labor: '0000010106',
  housing: '0000010108',
};

// 取得する指標。順番がJSONのv配列の順番になる
export const INDICATORS = [
  { code: 'F620215', table: 'labor', label: 'きまって支給する現金給与額（男）', group: 'wage', kind: 'value' },
  { code: 'F620216', table: 'labor', label: 'きまって支給する現金給与額（女）', group: 'wage', kind: 'value' },
  { code: 'F6501', table: 'labor', label: '地域別最低賃金', group: 'wage', kind: 'value' },
  { code: 'H410431', table: 'housing', label: '専用住宅の1畳当たり家賃（民営借家）', group: 'home', kind: 'value' },
  { code: 'H2130', table: 'housing', label: '1住宅当たり延べ面積', group: 'home', kind: 'value' },
  // 持ち家率の計算用（表示はしないが v 配列には入る）
  { code: 'H1310', table: 'housing', label: '持ち家数', group: 'home', kind: 'base' },
  { code: 'H1101', table: 'housing', label: '居住世帯あり住宅数', group: 'home', kind: 'base' },
];

// 計算で作る指標（v配列の末尾に INDICATORS の後ろへ続けて入る）
export const DERIVED = [
  {
    code: 'OWNRATE',
    label: '持ち家率',
    unit: '％',
    group: 'home',
    kind: 'derived',
    from: ['H1310', 'H1101'],
    calc: (own, total) => (total > 0 ? (own / total) * 100 : null),
  },
];

// 直近何年度ぶんを取得するか（住宅・土地統計は5年ごとなので広めに取る）
const RECENT_YEARS = 12;

// 時系列グラフに使う指標コード（最低賃金のみ。毎年調査のため12点きれいに取れる）
const SERIES_CODE = 'F6501';

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) {
    throw new Error('[living.js] ESTAT_APP_ID が設定されていません');
  }
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const url = `${API_BASE}/${path}?${qs.toString()}`;
  return await cachedJsonFetch(url);
}

function asArray(x) {
  return Array.isArray(x) ? x : [x];
}

// --- メタ情報：時間軸コード（新しい順）と指標の単位を取得 ---
async function fetchMeta(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[living.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const classObjs = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ);

  const timeObj = classObjs.find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[living.js] 時間軸メタが見つかりません(${statsDataId})`);
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));

  const catObj = classObjs.find((o) => o['@id'] === 'cat01');
  const units = {};
  if (catObj) {
    for (const c of asArray(catObj.CLASS)) {
      units[c['@code']] = c['@unit'] || null;
    }
  }
  return { times, units };
}

// --- 本体データ取得 ---
async function fetchStatsData(statsDataId, codes, timeCodes) {
  const params = {
    statsDataId,
    cdCat01: codes.join(','),
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
    throw new Error(`[living.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

// --- 地域メタから都道府県リストを組み立て（全国は除外） ---
function collectAreas(statData, areas) {
  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  if (!areaObj) return;
  for (const c of asArray(areaObj.CLASS)) {
    const code = c['@code'];
    const name = (c['@name'] || '').trim();
    // 全国（00000 等）は除外。都道府県のみ残す
    if (name === '全国' || /^0+$/.test(code)) continue;
    if (!areas.has(code)) areas.set(code, { c: code, n: name, v: {}, h: {} });
  }
}

// --- VALUEを走査して (地域×指標) の最新値と履歴を採取 ---
function collectValues(statData, areas, latestTimeByCat) {
  const valueList = asArray(statData.DATA_INF.VALUE);
  // 履歴を時系列順（古い→新しい）で積みたいので昇順ソート
  valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));

  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;

    // 時系列グラフ対象の指標だけ履歴を蓄積
    if (cat === SERIES_CODE) {
      if (!area.h[cat]) area.h[cat] = [];
      area.h[cat].push({ time: rec['@time'], value: num });
    }

    // 最新値の採用（昇順ソートなので都度上書きすれば最後に残るのは最新）
    area.v[cat] = num;
    if (!latestTimeByCat[cat] || rec['@time'] > latestTimeByCat[cat]) {
      latestTimeByCat[cat] = rec['@time'];
    }
  }
}

// --- メインエントリ ---
export async function getLivingData() {
  if (_cache) return _cache;

  const areas = new Map();
  const latestTimeByCat = {};
  const timeNameByCode = {};
  const unitByCat = {};

  for (const [key, statsDataId] of Object.entries(TABLES)) {
    const codes = INDICATORS.filter((i) => i.table === key).map((i) => i.code);
    if (codes.length === 0) continue;

    const { times, units } = await fetchMeta(statsDataId);
    Object.assign(unitByCat, units);
    const recentTimes = times.slice(0, RECENT_YEARS);
    for (const t of recentTimes) timeNameByCode[t.code] = t.name;

    const statData = await fetchStatsData(statsDataId, codes, recentTimes);
    collectAreas(statData, areas);
    collectValues(statData, areas, latestTimeByCat);
  }

  // 出力形状：v を INDICATORS順 ＋ DERIVED順 の配列に変換（欠損はnull）
  const areaList = [...areas.values()]
    .map((a) => {
      const base = INDICATORS.map((ind) => (a.v[ind.code] !== undefined ? a.v[ind.code] : null));
      const derived = DERIVED.map((d) => {
        const args = d.from.map((code) => (a.v[code] !== undefined ? a.v[code] : null));
        if (args.some((x) => x === null)) return null;
        const val = d.calc(...args);
        return Number.isFinite(val) ? Math.round(val * 10) / 10 : null;
      });
      // 最低賃金の時系列（年名に変換して昇順のまま）
      const series = (a.h[SERIES_CODE] || []).map((pt) => ({
        year: timeNameByCode[pt.time] || pt.time,
        value: pt.value,
      }));
      return { c: a.c, n: a.n, v: [...base, ...derived], series };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  const indicators = [
    ...INDICATORS.map((ind) => ({
      code: ind.code,
      label: ind.label,
      unit: unitByCat[ind.code] || null,
      group: ind.group,
      kind: ind.kind,
      year: timeNameByCode[latestTimeByCat[ind.code]] || null,
    })),
    ...DERIVED.map((d) => ({
      code: d.code,
      label: d.label,
      unit: d.unit,
      group: d.group,
      kind: d.kind,
      // 元指標のうち新しい方の年度を採用
      year:
        timeNameByCode[
          d.from
            .map((c) => latestTimeByCat[c])
            .filter(Boolean)
            .sort()
            .pop()
        ] || null,
    })),
  ];

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source:
      '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ（表番号0000010106・0000010108）',
    indicators,
    areas: areaList,
  };
  return _cache;
}