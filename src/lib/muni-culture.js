// =====================================================
// Countopia Stats - わが町の図書館と公民館 データ取得モジュール
// src/lib/muni-culture.js
//
// 社会・人口統計体系 市区町村データ
//   G文化・スポーツ：statsDataId 0000020107
//     G1401 図書館数／G1201 公民館数（市区町村版にあるのはこの2つだけ）
//   人口：statsDataId 0000020101 の A1101（総人口）
//
// 【時点】施設は2021年度（社会教育調査・3年おき、1995〜2021の11時点）、人口は2020年。
//   1年ずれる。ページの注記で明示すること。
// 【揃い】市787・特別区23・町743・村183が全部ある（欠測なし）。ゼロの自治体は2割ほど。
//
// 【設計判断・2026-09-27】実数を主に、図書館だけ「1館あたりの人口（何人に1館か）」を添える。
//   一度「人口10万人あたり」で作ったが、人口3.4万の市に1館で「2.9館」と出て読みにくかった。
//   図書館・公民館は自治体が自前で置く施設なので、医療と違って人口あたりに意味がある。
//   ただし公民館は分館・地区公民館の数え方が自治体で違う（上田市257など）ので人口あたりにしない。
//   推移グラフは公民館（減っていく様子）。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID_CUL = '0000020107';
const STATS_ID_POP = '0000020101';

// 3年おきなので広めに遡る（1995〜2021の11時点）
const RECENT_YEARS = 12;

const FETCH_CUL = ['G1401', 'G1201'];

// 時系列グラフに使う指標
const SERIES_CODE = 'G1201';

const val = (v, code) => (v[code] === undefined ? null : v[code]);

export const INDICATORS = [
  { key: '図書館', unit: '館', kind: 'base', calc: (v) => val(v, 'G1401') },
  { key: '公民館', unit: '館', kind: 'base', calc: (v) => val(v, 'G1201') },
  { key: '図書館1館あたりの人口', unit: '人', kind: 'per', calc: (v, pop) => (val(v, 'G1401') === null || !pop || val(v, 'G1401') === 0 ? null : pop / val(v, 'G1401')) },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-culture.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[muni-culture.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

function classifyArea(code, name) {
  const nm = (name || '').trim();
  if (code === '00000' || nm === '全国') return 'exclude';
  if (/^\d{2}000$/.test(code)) return 'exclude';
  if (/（旧|\(旧/.test(nm)) return 'exclude';
  if (code === '13100') return 'x';
  // 東京の特別区（13101〜13123）は独立した自治体なのでランキングに含める
  if (/^131\d\d$/.test(code)) return 'rank';
  if (/^\d{2}1\d\d$/.test(code) && !code.endsWith('100')) return 'x';
  return 'rank';
}

async function fetchTimes(statsDataId) {
  const json = await apiGet('getMetaInfo', { statsDataId });
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-culture.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[muni-culture.js] 時間軸メタが見つかりません(${statsDataId})`);
  return asArray(timeObj.CLASS)
    .map((c) => ({ code: c['@code'], name: c['@name'] }))
    .sort((a, b) => b.code.localeCompare(a.code));
}

async function fetchStatsData(statsDataId, codes, timeCodes) {
  const json = await apiGet('getStatsData', {
    statsDataId,
    cdCat01: codes.join(','),
    cdTime: timeCodes.map((t) => t.code).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[muni-culture.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniCultureData() {
  if (_cache) return _cache;

  const culTimes = (await fetchTimes(STATS_ID_CUL)).slice(0, RECENT_YEARS);
  const popTimes = (await fetchTimes(STATS_ID_POP)).slice(0, 12);
  const timeName = {};
  for (const t of [...culTimes, ...popTimes]) timeName[t.code] = t.name;

  const areas = new Map();

  // 複数指標×全市区町村は1リクエストにまとめず、指標ごとに分けて取得する
  for (const code of FETCH_CUL) {
    const statData = await fetchStatsData(STATS_ID_CUL, [code], culTimes);

    const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
    if (areaObj) {
      for (const c of asArray(areaObj.CLASS)) {
        const areaCode = c['@code'];
        const name = (c['@name'] || '').trim();
        const kind = classifyArea(areaCode, name);
        if (kind === 'exclude') continue;
        if (!areas.has(areaCode)) {
          areas.set(areaCode, { c: areaCode, n: name, x: kind === 'x', v: {}, h: {}, pop: null });
        }
      }
    }

    const valueList = asArray(statData.DATA_INF.VALUE);
    valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
    for (const rec of valueList) {
      const area = areas.get(rec['@area']);
      if (!area) continue;
      const raw = rec['$'];
      if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
      const num = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;

      if (!area.h[rec['@time']]) area.h[rec['@time']] = {};
      area.h[rec['@time']][rec['@cat01']] = num;
      // 時点の昇順に処理しているので、最後に入った値＝最新
      area.v[rec['@cat01']] = num;
      if (!area.culYear || rec['@time'] > area.culYear) area.culYear = rec['@time'];
    }
  }

  // 人口（別表）
  {
    const statData = await fetchStatsData(STATS_ID_POP, ['A1101'], popTimes);
    const valueList = asArray(statData.DATA_INF.VALUE);
    valueList.sort((a, b) => a['@time'].localeCompare(b['@time']));
    for (const rec of valueList) {
      const area = areas.get(rec['@area']);
      if (!area) continue;
      const raw = rec['$'];
      if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') continue;
      const num = Number(String(raw).replace(/,/g, ''));
      if (!Number.isFinite(num)) continue;
      area.pop = num;
      area.popYear = rec['@time'];
    }
  }

  let culYear = null;
  let popYear = null;

  const areaList = [...areas.values()]
    .map((a) => {
      const v = INDICATORS.map((ind) => ind.calc(a.v, a.pop));

      if (a.culYear && (!culYear || a.culYear > culYear)) culYear = a.culYear;
      if (a.popYear && (!popYear || a.popYear > popYear)) popYear = a.popYear;

      // 公民館数の推移（実数のまま見せる）
      const series = Object.keys(a.h)
        .filter((t) => a.h[t][SERIES_CODE] !== undefined)
        .sort()
        .map((t) => ({ year: timeName[t] || t, value: a.h[t][SERIES_CODE] }));

      return { c: a.c, n: a.n, x: a.x, v, pop: a.pop, series };
    })
    .filter((a) => a.v.some((x) => x !== null))
    .sort((a, b) => a.c.localeCompare(b.c));

  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ（表番号0000020107・0000020101）',
    note: '図書館と公民館は、その市区町村にある数です。公民館は分館や地区公民館の数え方が自治体によって違うため、多い少ないをそのまま比べられないことがあります。図書館1館あたりの人口は、2020年の人口を図書館の数で割ったものです。',
    culYear: culYear ? timeName[culYear] || culYear : null,
    popYear: popYear ? timeName[popYear] || popYear : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind, decimal: !!i.decimal })),
    areas: areaList,
  };
  return _cache;
}
