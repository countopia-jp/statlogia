// =====================================================
// Statlogia - 数字の照合（ビルドのたびに動く）
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
import { getRoomData, dropped } from './room-engine.js';
import { getPopulationData } from './population.js';
import { getLivingData } from './living.js';
import { getIctData } from './ict.js';
import { getPriceLedgerData } from './price-ledger.js';
import { getEducationData } from './education.js';
import { getMuniPopulationData } from './muni-population.js';
import { getMuniMedicalData } from './muni-medical.js';
import { getMuniCultureData } from './muni-culture.js';
import { getMuniFinanceData } from './muni-finance.js';
import * as MH from './muni-housing.js';
import * as MCT from './muni-commute-time.js';
import * as MC from './muni-commute.js';
import * as MN from './muni-nursery.js';
import * as MD from './muni-daycare.js';
import * as ML from './muni-landuse.js';
import * as MM from './muni-migration.js';

const API = 'https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData';
const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);
const ok = (v) => typeof v === 'number' && Number.isFinite(v);
const appId = () => import.meta.env?.ESTAT_APP_ID || process.env.ESTAT_APP_ID;

// e-Stat から (表, コード, 地域) の値を年の名前ごとに取る → { 地域: { '2024年度': 値 } }
const _direct = new Map();
// 10-18 e-Stat が応答しないまま待ち続けてビルドが止まらないよう、1回の取得は90秒で打ち切る（3回まで取り直す）
async function fetchJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 90000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}
async function direct(table, code, areas) {
  const key = `${table}|${code}|${areas ? areas.join(',') : 'all'}`;
  if (_direct.has(key)) return _direct.get(key);
  // 社会生活統計指標の表（7〜8桁目が02）はコードに#が要る（窓口側で既に # 付きなら二重にしない。10-23 生活時間で判明）
  // 10-18 経済センサスなどの表は code が 'E|cat02=0|tab=158-2021' の形（room-engine.js の parseCode と同じ）
  const [c1, ...rest] = String(code).split('|');
  const extra = Object.fromEntries(rest.map((x) => x.split('=')));
  const params = { appId: appId(), lang: 'J', statsDataId: table, cdCat01: table.slice(6, 8) === '02' && !c1.startsWith('#') ? `#${c1}` : c1, metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' };
  for (const [n, x] of Object.entries(extra)) params[`cd${n[0].toUpperCase()}${n.slice(1)}`] = x;
  if (areas) params.cdArea = areas.join(',');
  let json = null;
  for (let i = 0; i < 3 && !json; i++) {
    try { json = await fetchJson(`${API}?${new URLSearchParams(params)}`); } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  const sd = json?.GET_STATS_DATA?.STATISTICAL_DATA;
  const out = {};
  if (sd) {
    const timeObj = asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
    const tName = Object.fromEntries(asArray(timeObj?.CLASS).map((c) => [c['@code'], c['@name']]));
    for (const v of asArray(sd.DATA_INF.VALUE)) {
      if (Object.entries(extra).some(([n2, x]) => v[`@${n2}`] !== undefined && v[`@${n2}`] !== x)) continue;
      const n = Number(String(v['$'] ?? '').replace(/,/g, ''));
      if (v['$'] === '' || v['$'] === '-' || v['$'] === 'X' || v['$'] === '***' || !Number.isFinite(n)) continue;
      (out[v['@area']] ??= {})[tName[v['@time']] || v['@time']] = n;
    }
  }
  _direct.set(key, out);
  return out;
}

// 照合の本体：rows＝[{ area, name, v }] を、表示年 year の e-Stat の値（scale 倍）とくらべる
function compare(res, label, table, code, year, rows, got, { decimals = 2, scale = 1, dashAsZero = false } = {}) {
  const tol = 0.5 * 10 ** -decimals + 1e-9; // サイト側は小数 decimals 桁（以上）に丸めてある
  for (const r of rows) {
    if (!ok(r.v)) continue;
    const e = got[r.area]?.[year];
    if (!ok(e)) {
      if (dashAsZero && r.v === 0) continue; // 「-」を0として出す窓口
      res.checked++;
      res.warnings.push(`${label}｜${r.name}：表示年（${year}）の値が e-Stat にありません（表示 ${r.v}、${table} ${code}）`);
      continue;
    }
    res.checked++;
    const want = e * scale;
    const diff = Math.abs(want - r.v);
    if (diff > tol && diff / Math.max(1, Math.abs(want)) > 1e-6) {
      res.errors.push(`${label}｜${r.name}：表示 ${r.v} ≠ e-Stat ${Number(want.toFixed(decimals + 2))}（${year}、${table} ${code}）`);
    }
  }
}


// 年の名前をそろえる（「2023」「2023年」「2023年度」を同じ年として探す）
const yearOf = (byYear, year) => {
  if (!byYear) return undefined;
  if (byYear[year] !== undefined) return byYear[year];
  const y = String(year).match(/\d{4}/)?.[0];
  const k = y && Object.keys(byYear).find((x) => x.startsWith(y));
  return k ? byYear[k] : undefined;
};

// 社会生活基本調査（2021年）の種類別行動者率：総数（男女計・人口集中地区の別なし）の行動者率だけ → { 地域: 値 }
const _act = new Map();
async function directActivity(statsId, cat03) {
  const key = `${statsId}|${cat03}`;
  if (_act.has(key)) return _act.get(key);
  const params = { appId: appId(), lang: 'J', statsDataId: statsId, cdTab: '202110A09B08', cdCat01: '0', cdCat02: '99000', cdCat03: cat03, metaGetFlg: 'N', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' };
  let json = null;
  for (let i = 0; i < 3 && !json; i++) {
    try { json = await fetchJson(`${API}?${new URLSearchParams(params)}`); } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  const out = {};
  for (const v of asArray(json?.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE)) {
    if (v['@tab'] !== '202110A09B08') continue;
    const n = Number(String(v['$'] ?? '').replace(/,/g, ''));
    if (Number.isFinite(n)) out[v['@area']] = n;
  }
  _act.set(key, out);
  return out;
}

// 家計調査（二人以上の世帯・品目別の年間支出）→ { 市: { 年の名前: 値 } }
const _kakei = new Map();
async function directKakei(code) {
  if (_kakei.has(code)) return _kakei.get(code);
  const params = { appId: appId(), lang: 'J', statsDataId: '0004023605', cdCat01: code, cdCat02: '03', metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' };
  let json = null;
  for (let i = 0; i < 3 && !json; i++) {
    try { json = await fetchJson(`${API}?${new URLSearchParams(params)}`); } catch { await new Promise((r) => setTimeout(r, 2000)); }
  }
  const sd = json?.GET_STATS_DATA?.STATISTICAL_DATA;
  const out = {};
  if (sd) {
    const timeObj = asArray(sd.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'time');
    const tName = Object.fromEntries(asArray(timeObj?.CLASS).map((c) => [c['@code'], c['@name']]));
    for (const v of asArray(sd.DATA_INF.VALUE)) {
      const n = Number(String(v['$'] ?? '').replace(/,/g, ''));
      if (Number.isFinite(n) && v['$'] !== '' && v['$'] !== '-') (out[v['@area']] ??= {})[tName[v['@time']] || v['@time']] = n;
    }
  }
  _kakei.set(code, out);
  return out;
}

// 展示の一覧（rows＝[{c, n, minutes}]）を、期待値 want(c) とくらべる
function compareRows(res, label, rows, want, { decimals = 1, expect = 0 } = {}) {
  const tol = 0.5 * 10 ** -decimals + 1e-9;
  if (expect && rows.length !== expect) res.warnings.push(`${label}：並んでいるのが${rows.length}件で、${expect}件そろっていません`);
  for (const r of rows) {
    if (!ok(r.minutes)) continue;
    res.checked++;
    const w = want(r);
    if (!ok(w)) { res.warnings.push(`${label}｜${r.n}：照合する値が e-Stat にありません（表示 ${r.minutes}）`); continue; }
    const diff = Math.abs(w - r.minutes);
    if (diff > tol && diff / Math.max(1, Math.abs(w)) > 1e-6) res.errors.push(`${label}｜${r.n}：表示 ${r.minutes} ≠ e-Stat ${Number(w.toFixed(decimals + 2))}`);
  }
}

// 町は全部を取り直すと重いので、決まった間隔で選んだ町だけ
const sampleTowns = (areas, n = 30) => {
  const list = areas.filter((a) => !a.x);
  const step = Math.max(1, Math.floor(list.length / n));
  return list.filter((_, i) => i % step === 0).slice(0, n);
};

export async function verifyAll() {
  const res = { generated: new Date().toISOString().slice(0, 10), checked: 0, errors: [], warnings: [], sets: [], dropped: [] };
  dropped.length = 0;
  const run = async (name, fn) => {
    const before = res.checked, e0 = res.errors.length;
    // e-Stat への接続が一時的に切れることがあるので、3回まで間をおいて取り直す。
    // それでも取れないときは「照合できなかった」として warnings に入れる（数字の食い違いではないので、ビルドは止めない）
    for (let i = 0; i < 3; i++) {
      res.checked = before; res.errors.length = e0;
      try { await fn(); break; } catch (err) {
        if (i < 2) { await new Promise((r) => setTimeout(r, 5000 * (i + 1))); continue; }
        res.warnings.push(`${name}：e-Stat につながらず照合できませんでした（${err.message}）`);
      }
    }
    res.sets.push({ name, checked: res.checked - before, errors: res.errors.length - e0 });
  };


  // 計算を通す指標：計算のもとになる数字を表示年で取り直し、同じ計算をしてくらべる
  const checkCalc = async (room, cfg, data, towns) => {
    const ind = data.indicators.find((i) => i.key === cfg.key);
    if (!ind) return;
    const last = ind.years.length - 1;
    const year = ind.yearLabels[last];
    const areaCodes = towns ? towns.map((a) => a.c) : null;
    const raws = {};
    for (const [t, c] of cfg.needs) raws[c] = await direct(t, c, areaCodes);
    const carry = cfg.carry || [];
    const areas = towns || data.areas;
    const tol = 0.5 * 10 ** -(ind.decimals ?? 0) + 1e-9;
    for (const a of areas) {
      const shown = (data.areas.find((x) => x.c === a.c) || a).v[cfg.key]?.[last];
      if (!ok(shown)) continue;
      const g = (code) => {
        const byYear = raws[code]?.[a.c] || {};
        if (carry.includes(code)) {
          const ys = Object.keys(byYear).filter((y) => y <= year).sort();
          return ys.length ? byYear[ys.at(-1)] : null;
        }
        const v = byYear[year];
        return v === undefined ? (room.dashAsZero ? 0 : null) : v;
      };
      let want = null;
      try { want = cfg.calc(g); } catch { want = null; }
      res.checked++;
      if (!ok(want)) { res.warnings.push(`${room.title}・${ind.label}｜${a.n}：表示年（${year}）の値から計算できません（表示 ${shown}）`); continue; }
      want *= cfg.scale ?? 1;
      const diff = Math.abs(want - shown);
      if (diff > tol && diff / Math.max(1, Math.abs(want)) > 1e-6) {
        res.errors.push(`${room.title}・${ind.label}｜${a.n}：表示 ${shown} ≠ 計算し直した値 ${Number(want.toFixed((ind.decimals ?? 0) + 2))}（${year}）`);
      }
    }
  };

  // 1) 共通エンジンの窓口：表とコードをそのまま出す指標と、計算を通す指標（もとの数字から計算し直す）
  for (const room of Object.values(ROOMS)) {
    await run(`窓口 ${room.title}`, async () => {
      const data = await getRoomData(room);
      const towns = room.scope === 'town' ? sampleTowns(data.areas) : null;
      // 10-18 人口あたり・特化係数のもとになる値の検算：総人口を e-Stat から取り直して照合し、全国の値の有無を確かめる
      if (data.pop) {
        const pt = room.scope === 'pref' ? '0000010101' : '0000020101';
        const gotPop = await direct(pt, 'A1101', towns ? towns.map((a) => a.c) : null);
        const popRows = (towns || data.areas).filter((a) => data.pop[a.c] !== undefined).map((a) => ({ area: a.c, name: a.n, v: data.pop[a.c] }));
        compare(res, `${room.title}・総人口（人口あたりの分母）`, pt, 'A1101', data.popYear, popRows, gotPop, { decimals: 0 });
        const cover = data.areas.filter((a) => !a.x && data.pop[a.c] > 0).length / data.areas.filter((a) => !a.x).length;
        if (cover < 0.95) res.warnings.push(`${room.title}：総人口のある地域が ${Math.round(cover * 100)}％ しかありません（人口あたりが欠ける地域があります）`);
      }
      for (const ind of data.indicators.filter((i) => i.lq)) {
        const nat = room.scope === 'pref' ? data.national?.[ind.key]?.at(-1) : data.nationalLatest?.[ind.key];
        if (!(nat > 0)) res.warnings.push(`${room.title}・${ind.label}：全国の割合が無いため、特化係数を出せません`);
      }
      for (const cfg of room.indicators) {
        if (cfg.calc || cfg.needs) { await checkCalc(room, cfg, data, towns); continue; }
        if (!cfg.table || !cfg.code) continue;
        const ind = data.indicators.find((i) => i.key === cfg.key);
        if (!ind) continue;
        const last = ind.years.length - 1;
        const year = ind.yearLabels[last];
        const areas = towns || data.areas;
        const got = await direct(cfg.table, cfg.code, towns ? towns.map((a) => a.c) : null);
        const rows = areas.map((a) => ({ area: a.c, name: a.n, v: (data.areas.find((x) => x.c === a.c) || a).v[cfg.key]?.[last] }));
        compare(res, `${room.title}・${ind.label}`, cfg.table, cfg.code, year, rows, got, { decimals: ind.decimals ?? 0, scale: cfg.scale ?? 1, dashAsZero: !!room.dashAsZero });
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
      // 項目ごとの年（値と年を組で持つ部品）があればそちらを、なければ全体の年を使う
      compare(res, `${name}・${key}`, table, code, data.indicators[i].year || year, towns.map((a) => ({ area: a.c, name: a.n, v: a.v[i] })), got, { decimals: 2 });
    }
  };
  await run('わが町の人口', async () => { const d = await getMuniPopulationData(); await townList('わが町の人口', d, [['総人口', '0000020101', 'A1101']], d.year); });
  await run('わが町の医療', async () => { const d = await getMuniMedicalData(); await townList('わが町の医療', d, [['病院', '0000020109', 'I5101'], ['一般診療所', '0000020109', 'I5102'], ['歯科診療所', '0000020109', 'I5103'], ['お医者さん', '0000020109', 'I6100']], d.medYear); });
  await run('わが町の図書館と公民館', async () => { const d = await getMuniCultureData(); await townList('わが町の図書館と公民館', d, [['図書館', '0000020107', 'G1401'], ['公民館', '0000020107', 'G1201']], d.culYear); });
  await run('わが町の財政と教育費', async () => { const d = await getMuniFinanceData(); await townList('わが町の財政と教育費', d, [['財政力指数', '0000020104', 'D2201']], d.year); });

  // 5) 手書きの町ページ：表示年の元の数字を取り直し、部品と同じ計算（INDICATORS の calc）をしてくらべる
  const townCalc = [
    ['わが町の住まい', MH.getMuniHousingData, MH.INDICATORS, '0000020108', ['H1100', 'H1101', 'H110202', 'H1310', 'H1320', 'H1403', 'H2130', 'H4104']],
    ['通勤に、どれだけかかるか', MCT.getMuniCommuteTimeData, MCT.INDICATORS, '0000020108', ['H740501', 'H740502', 'H740503', 'H740504']],
    ['通勤の足は、何か', MC.getMuniCommuteData, MC.INDICATORS, '0000020108', ['H7301', 'H730102', 'H730103', 'H730105']],
    ['保育所は、近いか', MN.getMuniNurseryData, MN.INDICATORS, '0000020108', ['H2905', 'H2906', 'H2907', 'H2908', 'H2909']],
    ['介護は、近いか', MD.getMuniDaycareData, MD.INDICATORS, '0000020108', ['H2915', 'H2916', 'H2917', 'H2918', 'H2919']],
    ['わが町の土地の使われ方', ML.getMuniLanduseData, ML.INDICATORS, '0000020108', ['H8104', 'H810401', 'H810402', 'H810403', 'H810404', 'H810405', 'H810406', 'H810407', 'H8101', 'H8103']],
    ['わが町の人の出入り', MM.getMuniMigrationData, MM.INDICATORS, '0000020101', ['A1101', 'A5101', 'A5102']],
  ];
  for (const [name, get, INDS, table, codes] of townCalc) {
    await run(name, async () => {
      const d = await get();
      const towns = sampleTowns(d.areas);
      const got = {};
      for (const c of codes) got[c] = await direct(table, c, towns.map((a) => a.c));
      for (const a of towns) {
        const v = {};
        for (const c of codes) { const x = yearOf(got[c][a.c], d.year); if (ok(x)) v[c] = x; }
        INDS.forEach((ind, i) => {
          const shown = a.v[i];
          if (!ok(shown) || !ind.calc) return;
          res.checked++;
          let want = null;
          try { want = ind.calc(v); } catch { want = null; }
          if (!ok(want)) { res.warnings.push(`${name}・${ind.key}｜${a.n}：表示年（${d.year}）の値から計算できません（表示 ${shown}）`); return; }
          if (Math.abs(want - shown) > 1e-6 * Math.max(1, Math.abs(want))) res.errors.push(`${name}・${ind.key}｜${a.n}：表示 ${shown} ≠ 計算し直した値 ${want}（${d.year}）`);
        });
      }
    });
  }

  res.dropped = dropped.slice();
  return res;
}
