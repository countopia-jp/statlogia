// =====================================================
// Countopia Stats - 数字の照合（ビルドのたびに動く）
// src/lib/verify-data.js
//
// サイトに出す数字を、表示する「年」を指定して e-Stat から1件ずつ取り直し、同じ値かを確かめる。
// 部品（lib）の取り出し方に誤りがあれば、ここで必ず食い違う（2026-10-13 国勢の間の誤りを受けて導入）。
//   error   … 表示する年の e-Stat の値と、サイトの値が違う → ビルドを止める
//   warning … 表示する年の値が e-Stat にない（その地域だけ別の年の値を出している）→ 記録だけ
// 使い方：src/pages/data/check.json.js（ビルド中、部品のキャッシュをそのまま使う）、
//         scripts/verify-data.mjs（手元で単独に流す）
// =====================================================
import { ROOMS } from '../data/rooms/index.js';
import { getRoomData } from './room-engine.js';
import { getPopulationData } from './population.js';
import { getLivingData } from './living.js';
import { getIctData } from './ict.js';
import { getPriceLedgerData } from './price-ledger.js';
import { getEducationData } from './education.js';
import { getMuniPopulationData } from './muni-population.js';
import { getMuniMedicalData } from './muni-medical.js';
import { getMuniCultureData } from './muni-culture.js';
import { getMuniFinanceData } from './muni-finance.js';
import { getDayNightRatioData } from './day-night-ratio.js';

const API = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;

// e-Stat から (表, コード, 地域) の値を年の名前ごとに取る → { 地域: { '2024年度': 値 } }
const _direct = new Map();
async function direct(table, code, areas) {
  const key = `${table}|${code}|${areas ? areas.join(',') : 'all'}`;
  if (_direct.has(key)) return _direct.get(key);
  const params = { appId: appId(), lang: 'J', statsDataId: table, cdCat01: table.slice(4, 6) === '02' ? `#${code}` : code, metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' };
  if (areas) params.cdArea = areas.join(',');
  let json = null;
  for (let i = 0; i < 3 && !json; i++) {
    try { json = await (await fetch(`${API}?${new URLSearchParams(params)}`)).json(); } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  const sd = json?.GET_STATS_DATA?.STATISTICAL_DATA;
  const out = {};
  if (sd) {
    const timeObj = asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
    const tName = Object.fromEntries(asArray(timeObj?.CLASS).map((c) => [c['@code'], c['@name']]));
    for (const v of asArray(sd.DATA_INF.VALUE)) {
      const n = Number(String(v['$'] ?? '').replace(/,/g, ''));
      if (v['$'] === '' || v['$'] === '-' || v['$'] === 'X' || v['$'] === '***' || !Number.isFinite(n)) continue;
      (out[v['@area']] ??= {})[tName[v['@time']] || v['@time']] = n;
    }
  }
  _direct.set(key, out);
  return out;
}

// 照合の本体：rows＝[{ area, name, v }] を、表示年 year の e-Stat の値（scale 倍）とくらべる
function compare(res, label, table, code, year, rows, got, { decimals = 2, scale = 1 } = {}) {
  const tol = Math.max(0.5 * 10 ** -decimals, 1e-9) + 1e-9;
  for (const r of rows) {
    if (!ok(r.v)) continue;
    res.checked++;
    const e = got[r.area]?.[year];
    if (!ok(e)) {
      res.warnings.push(`${label}｜${r.name}：表示年（${year}）の値が e-Stat にありません（表示 ${r.v}、${table} ${code}）`);
      continue;
    }
    const want = e * scale;
    if (Math.abs(want - r.v) > tol * Math.max(1, scale < 1 ? 1 : 1) && Math.abs(want - r.v) / Math.max(1, Math.abs(want)) > 1e-6) {
      res.errors.push(`${label}｜${r.name}：表示 ${r.v} ≠ e-Stat ${Number(want.toFixed(decimals + 2))}（${year}、${table} ${code}）`);
    }
  }
}

// 町は全部を取り直すと重いので、決まった間隔で選んだ町だけ
const sampleTowns = (areas, n = 30) => {
  const list = areas.filter((a) => !a.x);
  const step = Math.max(1, Math.floor(list.length / n));
  return list.filter((_, i) => i % step === 0).slice(0, n);
};

export async function verifyAll() {
  const res = { generated: new Date().toISOString().slice(0, 10), checked: 0, errors: [], warnings: [], sets: [] };
  const run = async (name, fn) => {
    const before = res.checked, e0 = res.errors.length;
    try { await fn(); } catch (err) { res.errors.push(`${name}：照合の途中で失敗しました（${err.message}）`); }
    res.sets.push({ name, checked: res.checked - before, errors: res.errors.length - e0 });
  };

  // 1) 共通エンジンの窓口：計算を通さない指標（表とコードをそのまま出すもの）
  for (const room of Object.values(ROOMS)) {
    await run(`窓口 ${room.title}`, async () => {
      const data = await getRoomData(room);
      const towns = room.scope === 'town' ? sampleTowns(data.areas) : null;
      for (const cfg of room.indicators) {
        if (cfg.calc || cfg.needs || !cfg.table || !cfg.code) continue;
        const ind = data.indicators.find((i) => i.key === cfg.key);
        if (!ind) continue;
        const last = ind.years.length - 1;
        const year = ind.yearLabels[last];
        const areas = towns || data.areas;
        const got = await direct(cfg.table, cfg.code, towns ? towns.map((a) => a.c) : null);
        const rows = areas.map((a) => ({ area: a.c, name: a.n, v: (data.areas.find((x) => x.c === a.c) || a).v[cfg.key]?.[last] }));
        compare(res, `${room.title}・${ind.label}`, cfg.table, cfg.code, year, rows, got, { decimals: ind.decimals ?? 0, scale: cfg.scale ?? 1 });
      }
    });
  }

  // 2) 手書きの都道府県ページ（indicators[].code と areas[].v が同じ並び、年は indicators[].year）
  const prefList = async (name, data, tableOf) => {
    for (const [i, ind] of data.indicators.entries()) {
      const table = tableOf(ind.code);
      if (!table) continue; // 計算で作った項目（持ち家率など）
      const got = await direct(table, ind.code, null);
      compare(res, `${name}・${ind.label}`, table, ind.code, ind.year, data.areas.map((a) => ({ area: a.c, name: a.n, v: a.v[i] })), got, { decimals: 3 });
    }
  };
  await run('国勢の間', async () => prefList('国勢の間', await getPopulationData(), () => '0000010101'));
  await run('暮らしの見積所', async () => prefList('暮らしの見積所', await getLivingData(), (c) => (c.startsWith('F') ? '0000010106' : c.startsWith('H') ? '0000010108' : null)));
  await run('情報化の帳場', async () => prefList('情報化の帳場', await getIctData(), () => '0000010105'));
  await run('物価の帳場', async () => {
    const d = await getPriceLedgerData();
    for (const cat of d.categories) {
      const got = await direct('0000010103', cat.code, null);
      compare(res, `物価の帳場・${cat.label}`, '0000010103', cat.code, d.yearLabel, d.areas.map((a) => ({ area: a.c, name: a.n, v: (a.v[cat.code] || []).at(-1) })), got, { decimals: 1 });
    }
  });
  await run('展示09 昼夜間人口比率', async () => {
    const d = await getDayNightRatioData();
    const got = await direct('0000010101', 'A6108', null);
    compare(res, '展示09・昼夜間人口比率', '0000010101', 'A6108', d.year, d.rows.map((r) => ({ area: r.c, name: r.n, v: r.minutes })), got, { decimals: 1 });
  });

  // 3) 手書きの市区町村ページ（選んだ町だけ）
  await run('学びの登記所', async () => {
    const d = await getEducationData();
    const towns = sampleTowns(d.areas);
    for (const [i, ind] of d.indicators.entries()) {
      const got = await direct('0000020105', ind.code, towns.map((a) => a.c));
      compare(res, `学びの登記所・${ind.label}`, '0000020105', ind.code, ind.year, towns.map((a) => ({ area: a.c, name: `${a.p} ${a.n}`, v: a.v[i] })), got, { decimals: 0 });
    }
  });
  const townList = async (name, data, items, year) => {
    const towns = sampleTowns(data.areas);
    for (const [key, table, code] of items) {
      const i = data.indicators.findIndex((x) => x.key === key);
      if (i < 0) continue;
      const got = await direct(table, code, towns.map((a) => a.c));
      compare(res, `${name}・${key}`, table, code, year, towns.map((a) => ({ area: a.c, name: a.n, v: a.v[i] })), got, { decimals: 2 });
    }
  };
  await run('わが町の人口', async () => { const d = await getMuniPopulationData(); await townList('わが町の人口', d, [['総人口', '0000020101', 'A1101']], d.year); });
  await run('わが町の医療', async () => { const d = await getMuniMedicalData(); await townList('わが町の医療', d, [['病院', '0000020109', 'I5101'], ['一般診療所', '0000020109', 'I5102'], ['歯科診療所', '0000020109', 'I5103'], ['お医者さん', '0000020109', 'I6100']], d.medYear); });
  await run('わが町の図書館と公民館', async () => { const d = await getMuniCultureData(); await townList('わが町の図書館と公民館', d, [['図書館', '0000020107', 'G1401'], ['公民館', '0000020107', 'G1201']], d.culYear); });
  await run('わが町の財政と教育費', async () => { const d = await getMuniFinanceData(); await townList('わが町の財政と教育費', d, [['財政力指数', '0000020104', 'D2201']], d.year); });

  return res;
}
