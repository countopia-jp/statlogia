// =====================================================
// Countopia Stats - 市区町村版 人口の動き（社会増減）取得モジュール
// src/lib/muni-migration.js
//   社会・人口統計体系 市区町村データ 基礎データ A人口 0000020101（# 不要）
//   社会増減 = 転入(A5101) − 転出(A5102)。率は人口千人あたりで自作計算。
//   地域の扱いは muni-population.js に準拠。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000020101';
const RECENT_YEARS = 12;

const FETCH = ['A1101', 'A5101', 'A5102'];

export const INDICATORS = [
  { key: '総人口',       unit: '人',           kind: 'base', code: 'A1101' },
  { key: '転入者数',     unit: '人',           kind: 'base', code: 'A5101' },
  { key: '転出者数',     unit: '人',           kind: 'base', code: 'A5102' },
  { key: '社会増減',     unit: '人',           kind: 'rate', signed: true,
    calc: (v) => (v.A5101 != null && v.A5102 != null ? v.A5101 - v.A5102 : null) },
  { key: '社会増減率',   unit: '（千人あたり）', kind: 'rate', signed: true, decimal: true,
    calc: (v) => per1000(v.A5101 != null && v.A5102 != null ? v.A5101 - v.A5102 : null, v.A1101) },
];

function per1000(delta, pop) {
  if (delta == null || pop == null || pop === 0) return null;
  return Math.round((delta / pop) * 1000 * 10) / 10; // 千人あたり・小数1桁（符号つき）
}

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-migration.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-migration.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classifyArea(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchMeta() {
  const json = await apiGet('getMetaInfo', { statsDataId: STATS_ID });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-migration.js] getMetaInfo失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error('[muni-migration.js] 時間軸メタが見つかりません');
  const times = asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
  return { times };
}

async function fetchStatsData(timeCodes) {
  const params = {
    statsDataId: STATS_ID,
    cdCat01: FETCH.join(','),
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
    throw new Error(`[muni-migration.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniMigrationData() {
  if (_cache) return _cache;

  const { times } = await fetchMeta();
  const recentTimes = times.slice(0, RECENT_YEARS);
  const timeNameByCode = {};
  for (const t of recentTimes) timeNameByCode[t.code] = t.name;

  const statData = await fetchStatsData(recentTimes);

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areas = new Map();
  if (areaObj) {
    for (const c of asArray(areaObj.CLASS)) {
      const code = c['@code'];
      const name = (c['@name'] || '').trim();
      const kind = classifyArea(code, name);
      if (kind === 'exclude') continue;
      if (!areas.has(code)) areas.set(code, { c: code, n: name, x: kind === 'x', v: {} });
    }
  }

  let latestTime = null;
  const valueList = asArray(statData.DATA_INF.VALUE);
  valueList.sort((a, b) => b['@time'].localeCompare(a['@time']));
  for (const rec of valueList) {
    const area = areas.get(rec['@area']);
    if (!area) continue;
    const cat = rec['@cat01'];
    const raw = rec['$'];
    if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
    const num = Number(String(raw).replace(/,/g, ''));
    if (!Number.isFinite(num)) continue;
    if (area.v[cat] === undefined) {
      area.v[cat] = num;
      if (!latestTime || rec['@time'] > latestTime) latestTime = rec['@time'];
    }
  }

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) =>
        ind.kind === 'base'
          ? (a.v[ind.code] !== undefined ? a.v[ind.code] : null)
          : ind.calc(a.v)
      );
      return { c: a.c, n: a.n, x: a.x, v };
    })
    .filter((a) => a.v.some((val) => val !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ 基礎データ（表番号0000020101）',
    note: '社会増減＝転入者数−転出者数。率は人口千人あたり。日本人移動者ベース。区・特別区部計はランキング除外（選択には表示）。',
    year: latestTime ? timeNameByCode[latestTime] || null : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind, signed: !!i.signed, decimal: !!i.decimal })),
    areas: areaList,
  };
  return _cache;
}
