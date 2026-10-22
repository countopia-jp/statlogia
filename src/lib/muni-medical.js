import { makeYearBook } from './year-pick.js';
import { cachedJsonFetch } from './estat-cache.js';
// =====================================================
// Statlogia - わが町の医療 データ取得モジュール
// src/lib/muni-medical.js
//
// 社会・人口統計体系 市区町村データ
//   I健康・医療：statsDataId 0000020109
//     I5101 病院数／I5102 一般診療所数／I5103 歯科診療所数
//     I5211 病院病床数／I6100 医師数／I6300 薬剤師数
//   人口：statsDataId 0000020101 の A1101（総人口）
//
// 【時点】医療は2022年、人口は2020年（国勢調査は5年ごとで2020が最新）。
//   **2年ずれるが避けられない。** ページの注記で明示すること。
//   病院・診療所・病床は2023年の値もあるが、医師・薬剤師が2022年までなので
//   **2022年に揃えている**（注記で言い訳するより、同じ年で並べるほうがよい）。
//
// 【要注意】一般診療所（I5102）は1606件で、ほかの指標（1917件）より311件少ない。
//   町村の3割弱に数字がない。ページ側で「この町の数字はありません」を出すこと。
//
// 【設計判断・2026-09-12】**人口10万人あたりではなく、実数で出す。**
//   一度は10万人あたりで作ったが、千代田区で一般診療所832施設／薬剤師7,828人という
//   現実離れした値が出た。夜間人口6.6万人に対して昼間人口が80万人超あるため。
//   逆に、隣の市の病院に通っている町は小さく出る。**医療圏は市区町村の境界と一致しない**ので、
//   人口で割るという見せ方がこの指標には合っていない。
//   実数なら「この町に病院がいくつあるか」に正しく答えられる。
//   人口は参考として残し、ページ側では使わない。
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID_MED = '0000020109';
const STATS_ID_POP = '0000020101';

// 医療は隔年のものがあるので広めに遡る
const RECENT_YEARS = 45;

const FETCH_MED = ['I5101', 'I5102', 'I5103', 'I5211', 'I6100', 'I6300'];

// 時系列グラフに使う指標
const SERIES_CODE = 'I6100';

const val = (v, code) => (v[code] === undefined ? null : v[code]);

export const INDICATORS = [
  { key: '病院', code: 'I5101', unit: '施設', kind: 'base', calc: (v) => val(v, 'I5101') },
  { key: '一般診療所', code: 'I5102', unit: '施設', kind: 'base', calc: (v) => val(v, 'I5102') },
  { key: '歯科診療所', code: 'I5103', unit: '施設', kind: 'base', calc: (v) => val(v, 'I5103') },
  { key: 'お医者さん', code: 'I6100', unit: '人', kind: 'base', calc: (v) => val(v, 'I6100') },
  { key: '薬剤師', code: 'I6300', unit: '人', kind: 'base', calc: (v) => val(v, 'I6300') },
  { key: '病院の病床数', code: 'I5211', unit: '床', kind: 'base', calc: (v) => val(v, 'I5211') },
];

let _cache = null;

function getAppId() {
  const appId = import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[muni-medical.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  return await cachedJsonFetch(`${API_BASE}/${path}?${qs.toString()}`);
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
    throw new Error(`[muni-medical.js] getMetaInfo失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const timeObj = asArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
  if (!timeObj) throw new Error(`[muni-medical.js] 時間軸メタが見つかりません(${statsDataId})`);
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
    throw new Error(`[muni-medical.js] getStatsData失敗(${statsDataId}): ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  return root.STATISTICAL_DATA;
}

export async function getMuniMedicalData() {
  if (_cache) return _cache;
  const book = makeYearBook(); // 項目ごとに、そろっている最新の年を決める

  const medTimes = (await fetchTimes(STATS_ID_MED)).slice(0, RECENT_YEARS);
  const popTimes = (await fetchTimes(STATS_ID_POP)).slice(0, 12);
  const timeName = {};
  for (const t of [...medTimes, ...popTimes]) timeName[t.code] = t.name;

  const areas = new Map();

  // 複数指標×全市区町村は1リクエストにまとめず、指標ごとに分けて取得する
  for (const code of FETCH_MED) {
    const statData = await fetchStatsData(STATS_ID_MED, [code], medTimes);

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
      book.add(rec['@cat01'], rec['@time'], rec['@area'], num); // 値と年を組で持つ
      if (!area.medYear || rec['@time'] > area.medYear) area.medYear = rec['@time'];
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

  const picked = Object.fromEntries(INDICATORS.map((i) => [i.code, book.pick(i.code)]));
  let medYear = null;
  let popYear = null;

  const areaList = [...areas.values()]
    .map((a) => {
      // 項目ごとに決めた年の値だけを出す（古い年の値を新しい年として見せない）
      const v = INDICATORS.map((ind) => book.at(ind.code, picked[ind.code], a.c));

      if (a.medYear && (!medYear || a.medYear > medYear)) medYear = a.medYear;
      if (a.popYear && (!popYear || a.popYear > popYear)) popYear = a.popYear;

      // 医師数の推移（人口で割らず、実数のまま見せる）
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
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 市区町村データ（表番号0000020109・0000020101）',
    note: 'その市区町村にある施設と人の数です。人口では割っていません。医療は市区町村の境をまたいで使われるため、となりの町の病院に通っている場合もあります。一般診療所は、数字のない市区町村があります。',
    medYear: (() => { const t = Object.values(picked).filter(Boolean).sort().at(-1); return t ? timeName[t] || t : null; })(),
    popYear: popYear ? timeName[popYear] || popYear : null,
    indicators: INDICATORS.map((i) => ({ key: i.key, unit: i.unit, kind: i.kind, decimal: !!i.decimal, year: picked[i.code] ? timeName[picked[i.code]] || picked[i.code] : null })),
    areas: areaList,
  };
  return _cache;
}
