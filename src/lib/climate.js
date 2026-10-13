// src/lib/climate.js
// B自然環境（表番号 0000010102）の気候データ
//   B4108 日照時間（年間・単位:時間） … 1975〜2024。主軸。時系列はこちらだけ使う
//   B4104 快晴日数（年間・単位:日）   … 1975〜2020。47県そろう最新年は2018。
//                                       雲量の目視観測が終了しており、この系列は更新されない
//
// 全国(00000)の行は存在するが値が空なので、national は47県の単純平均を自分で出す。
// キー名は全展示共通の規約に合わせて 県名=n / 値=minutes。

const APP_ID = import.meta.env?.ESTAT_APP_ID;
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010102';

const CODE_SUN = 'B4108';
const CODE_CLEAR = 'B4104';

let _cache = null;

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
const isPref = (code) => /^\d{2}000$/.test(code) && code !== '00000';
const round1 = (n) => Math.round(n * 10) / 10;

async function apiGet(params) {
  const url = new URL(`${BASE}/getStatsData`);
  url.searchParams.set('appId', APP_ID);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`e-Stat HTTP ${res.status}`);
  const json = await res.json();
  const root = json.GET_STATS_DATA;
  if (root?.RESULT?.STATUS !== 0) {
    throw new Error(`e-Stat ${root?.RESULT?.STATUS}: ${root?.RESULT?.ERROR_MSG}`);
  }
  return root.STATISTICAL_DATA;
}

function nameMap(inf, id) {
  const obj = asArray(inf.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === id);
  const map = new Map();
  for (const c of asArray(obj?.CLASS)) map.set(c['@code'], c['@name']);
  return map;
}

// 47県そろう最新年のランキングを作る
function snapshot(records, prefName) {
  const byYear = new Map();
  for (const r of records) {
    if (!isPref(r.area) || !Number.isFinite(r.value)) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r);
  }
  const year = [...byYear.entries()]
    .filter(([, list]) => list.length >= 47)
    .map(([y]) => y)
    .sort()
    .pop();
  if (!year) return null;

  const rows = byYear
    .get(year)
    .sort((a, b) => b.value - a.value)
    .map((r) => ({ code: r.area, n: prefName.get(r.area) ?? r.area, minutes: r.value }));

  const national = round1(rows.reduce((s, r) => s + r.minutes, 0) / rows.length);
  return {
    year: Number(year),
    national,                 // 47県の単純平均。全国値は公表されていない
    nationalIsAverage: true,
    top: rows[0],
    bottom: rows[rows.length - 1],
    spread: round1(rows[0].minutes / rows[rows.length - 1].minutes),
    rows,
  };
}

// 47県平均の推移（日照時間だけに使う）
function makeTrend(records) {
  const byYear = new Map();
  for (const r of records) {
    if (!isPref(r.area) || !Number.isFinite(r.value)) continue;
    if (!byYear.has(r.year)) byYear.set(r.year, []);
    byYear.get(r.year).push(r.value);
  }
  return [...byYear.entries()]
    .filter(([, list]) => list.length >= 47)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([year, list]) => ({
      year: Number(year),
      minutes: round1(list.reduce((s, v) => s + v, 0) / list.length),
    }));
}

// 同値を同順位で返す（全展示共通の作法）
const rankIn = (rows, v) => rows.findIndex((r) => r.minutes === v) + 1;

function pearson(xs, ys) {
  const pairs = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pairs.length;
  if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n;
  const my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pairs) {
    const dx = x - mx, dy = y - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  return Math.round((sxy / Math.sqrt(sxx * syy)) * 1000) / 1000;
}

export async function getClimateData() {
  if (_cache) return _cache;

  const inf = await apiGet({
    statsDataId: STATS_DATA_ID,
    cdCat01: `${CODE_SUN},${CODE_CLEAR}`,
    limit: '100000',
  });

  const prefName = nameMap(inf, 'area');
  const all = asArray(inf.DATA_INF.VALUE).map((v) => ({
    code: v['@cat01'],
    area: v['@area'],
    year: String(v['@time']).slice(0, 4),
    value: Number(v.$),
  }));

  const sunRecords = all.filter((r) => r.code === CODE_SUN);
  const clearRecords = all.filter((r) => r.code === CODE_CLEAR);

  const sun = snapshot(sunRecords, prefName);
  const clear = snapshot(clearRecords, prefName);
  if (!sun || !clear) throw new Error('気候データの取得に失敗（47県そろう年が無い）');

  sun.trend = makeTrend(sunRecords);

  // 2つの数え方の突き合わせ。セリフを固定で書かないための材料
  const topN = 5;
  const sunTopCodes = sun.rows.slice(0, topN).map((r) => r.code);
  const clearTopCodes = clear.rows.slice(0, topN).map((r) => r.code);
  const sunLowCodes = sun.rows.slice(-topN).map((r) => r.code);
  const clearLowCodes = clear.rows.slice(-topN).map((r) => r.code);

  const pick = (codes) =>
    codes.map((c) => {
      const s = sun.rows.find((r) => r.code === c);
      const k = clear.rows.find((r) => r.code === c);
      return {
        code: c,
        n: s?.n ?? k?.n ?? c,
        sunRank: s ? rankIn(sun.rows, s.minutes) : null,
        clearRank: k ? rankIn(clear.rows, k.minutes) : null,
      };
    });

  const compare = {
    topN,
    bothTop: pick(sunTopCodes.filter((c) => clearTopCodes.includes(c))),
    bothLow: pick(sunLowCodes.filter((c) => clearLowCodes.includes(c))),
    sunTopInClear: rankIn(clear.rows, clear.rows.find((r) => r.code === sun.top.code)?.minutes),
    clearTopInSun: rankIn(sun.rows, sun.rows.find((r) => r.code === clear.top.code)?.minutes),
    sameWinner: sun.top.code === clear.top.code,
    correlation: pearson(
      sun.rows.map((r) => r.minutes),
      sun.rows.map((r) => clear.rows.find((c) => c.code === r.code)?.minutes ?? NaN)
    ),
  };

  _cache = {
    generated: new Date().toISOString(),
    year: sun.year,
    source: '総務省統計局「社会・人口統計体系（都道府県データ 基礎データ）」B 自然環境（表番号 0000010102）／原データは気象庁',
    sun: { ...sun, code: CODE_SUN, label: '日照時間', unit: '時間' },
    clear: { ...clear, code: CODE_CLEAR, label: '快晴日数', unit: '日', discontinued: true },
    compare,
  };
  return _cache;
}