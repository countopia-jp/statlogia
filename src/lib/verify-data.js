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
import { getVacancyData } from './vacancy.js';
import { getCarData } from './cars.js';
import { getFoodData } from './food.js';
import { getSolarData } from './solar.js';
import { getHousingTypeData } from './housing-type.js';
import { getWasteData } from './waste.js';
import { getPriceData } from './price.js';
import { getClimateData } from './climate.js';
import { getKaraokeData } from './karaoke.js';
import { getBoardGamesData } from './board-games.js';
import { getGardeningData } from './gardening.js';
import { getJapaneseArtsData } from './japanese-arts.js';
import { getGamesCraftsData } from './games-crafts.js';
import { getBudoData } from './budo.js';
import { getBallGamesData } from './ball-games.js';
import { getHikingData } from './hiking.js';
import { getFishingData } from './fishing.js';
import { getPachinkoData } from './pachinko.js';
import { getReadingData } from './reading.js';
import { getSnowGroundData } from './snow-ground.js';
import { getActivityPair } from './activity-pair.js';
import { getKakeiPair } from './kakei-pair.js';
import { getGyozaData } from './gyoza.js';
import { getBeefPorkData } from './beef-pork.js';
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
async function direct(table, code, areas) {
  const key = `${table}|${code}|${areas ? areas.join(',') : 'all'}`;
  if (_direct.has(key)) return _direct.get(key);
  // 社会生活統計指標の表（7〜8桁目が02）はコードに#が要る
  const params = { appId: appId(), lang: 'J', statsDataId: table, cdCat01: table.slice(6, 8) === '02' ? `#${code}` : code, metaGetFlg: 'Y', cntGetFlg: 'N', annotationGetFlg: 'N', explanationGetFlg: 'N', replaceSpChars: '0' };
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
  const json = await (await fetch(`${API}?${new URLSearchParams(params)}`)).json();
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
  const json = await (await fetch(`${API}?${new URLSearchParams(params)}`)).json();
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
  const res = { generated: new Date().toISOString().slice(0, 10), checked: 0, errors: [], warnings: [], sets: [] };
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
      // 項目ごとの年（値と年を組で持つ部品）があればそちらを、なければ全体の年を使う
      compare(res, `${name}・${key}`, table, code, data.indicators[i].year || year, towns.map((a) => ({ area: a.c, name: a.n, v: a.v[i] })), got, { decimals: 2 });
    }
  };
  await run('わが町の人口', async () => { const d = await getMuniPopulationData(); await townList('わが町の人口', d, [['総人口', '0000020101', 'A1101']], d.year); });
  await run('わが町の医療', async () => { const d = await getMuniMedicalData(); await townList('わが町の医療', d, [['病院', '0000020109', 'I5101'], ['一般診療所', '0000020109', 'I5102'], ['歯科診療所', '0000020109', 'I5103'], ['お医者さん', '0000020109', 'I6100']], d.medYear); });
  await run('わが町の図書館と公民館', async () => { const d = await getMuniCultureData(); await townList('わが町の図書館と公民館', d, [['図書館', '0000020107', 'G1401'], ['公民館', '0000020107', 'G1201']], d.culYear); });
  await run('わが町の財政と教育費', async () => { const d = await getMuniFinanceData(); await townList('わが町の財政と教育費', d, [['財政力指数', '0000020104', 'D2201']], d.year); });

  // 4) 展示の部品
  // 4-1) 社会生活基本調査の行動者率（2021年、1時点だけ）
  const HOBBY = '0003456573', SPORT = '0003456409';
  const act = [
    ['展示 カラオケと楽器', getKaraokeData, HOBBY, [['rows', '12'], ['instrument', '09']]],
    ['展示 将棋と囲碁', getBoardGamesData, HOBBY, [['rows', '30'], ['go', '29']]],
    ['展示 庭いじりと日曜大工', getGardeningData, HOBBY, [['rows', '21'], ['diy', '22']]],
    ['展示 書道・華道・茶道', getJapaneseArtsData, HOBBY, [['rows', '15'], ['kado', '16'], ['sado', '17']]],
    ['展示 ゲームと手芸', getGamesCraftsData, HOBBY, [['rows', '32'], ['crafts', '19']]],
    ['展示 本とマンガ', getReadingData, HOBBY, [['rows', '27'], ['manga', '28']]],
    ['展示 パチンコ', getPachinkoData, HOBBY, [['rows', '31']]],
    ['展示 柔道と剣道', getBudoData, SPORT, [['rows', '11'], ['kendo', '12']]],
    ['展示 野球とサッカー', getBallGamesData, SPORT, [['rows', '01'], ['soccer', '05']]],
    ['展示 山歩き', getHikingData, SPORT, [['rows', '17']]],
    ['展示 釣り', getFishingData, SPORT, [['rows', '14']]],
    ['展示 スキーとグラウンドゴルフ', getSnowGroundData, SPORT, [['rows', '16'], ['ground', '10']]],
    ['展示33 映画館と美術館', () => getActivityPair('04', '02'), HOBBY, [['rows', '04'], ['second', '02']]],
    ['展示34 キャンプと遊園地', () => getActivityPair('34', '33'), HOBBY, [['rows', '34'], ['second', '33']]],
    ['展示37 スポーツ観戦と演劇', () => getActivityPair('01', '03'), HOBBY, [['rows', '01'], ['second', '03']]],
    ['展示38 ジョギングとウォーキング', () => getActivityPair('19', '20', SPORT), SPORT, [['rows', '19'], ['second', '20']]],
    ['展示39 コンサート', () => getActivityPair('06', '07'), HOBBY, [['rows', '06'], ['second', '07']]],
    ['展示40 卓球とバドミントン', () => getActivityPair('06', '08', SPORT), SPORT, [['rows', '06'], ['second', '08']]],
  ];
  for (const [name, get, statsId, parts] of act) {
    await run(name, async () => {
      const d = await get();
      for (const [k, cat03] of parts) {
        const rows = k === 'rows' ? d.rows : d[k]?.rows || [];
        const got = await directActivity(statsId, cat03);
        compareRows(res, `${name}（${cat03}）`, rows, (r) => got[r.c], { decimals: 1, expect: 47 });
      }
    });
  }

  // 4-2) 家計調査（市）
  const kakei = [
    ['展示 餃子', getGyozaData, [['rows', '010920070']]],
    ['展示30 牛肉と豚肉', getBeefPorkData, [['rows', '010310010'], ['pork', '010310020']]],
    ['展示31 コーヒーと緑茶', () => getKakeiPair('011020010', '011010010'), [['rows', '011020010'], ['second', '011010010']]],
    ['展示32 パンとお米', () => getKakeiPair('010120000', '010110001'), [['rows', '010120000'], ['second', '010110001']]],
    ['展示35 ケーキとまんじゅう', () => getKakeiPair('010800050', '010800020'), [['rows', '010800050'], ['second', '010800020']]],
    ['展示36 マグロとサケ', () => getKakeiPair('010211010', '010211060'), [['rows', '010211010'], ['second', '010211060']]],
    ['展示41 そば・うどんとラーメン', () => getKakeiPair('011211010', '011211020'), [['rows', '011211010'], ['second', '011211020']]],
    ['展示42 納豆と豆腐', () => getKakeiPair('010530030', '010530010'), [['rows', '010530030'], ['second', '010530010']]],
  ];
  for (const [name, get, parts] of kakei) {
    await run(name, async () => {
      const d = await get();
      for (const [k, code] of parts) {
        const rows = k === 'rows' ? d.rows : d[k]?.rows || [];
        const got = await directKakei(code);
        compareRows(res, `${name}（${code}・${d.year}）`, rows, (r) => yearOf(got[r.c], d.year), { decimals: 0 });
      }
    });
  }

  // 4-3) 社会・人口統計体系の展示
  const pct = (a, b) => (ok(a) && ok(b) && b > 0 ? (a / b) * 100 : null);
  await run('展示 空き家', async () => {
    const d = await getVacancyData();
    const v = await direct('0000010108', 'H110202', null), t = await direct('0000010108', 'H1100', null);
    compareRows(res, `展示 空き家（${d.year}）`, d.rows, (r) => pct(yearOf(v[r.c], d.year), yearOf(t[r.c], d.year)), { decimals: 1, expect: 47 });
  });
  await run('展示 太陽光発電の家', async () => {
    const d = await getSolarData();
    const s = await direct('0000010108', 'H2281', null), o = await direct('0000010108', 'H1101', null);
    compareRows(res, `展示 太陽光発電の家（${d.year}）`, d.rows, (r) => pct(yearOf(s[r.c], d.year), yearOf(o[r.c], d.year)), { decimals: 1, expect: 47 });
  });
  await run('展示 一戸建てと木の家', async () => {
    const d = await getHousingTypeData();
    const h = await direct('0000010108', 'H1401', null), o = await direct('0000010108', 'H1101', null), w = await direct('0000010108', 'H140101', null);
    compareRows(res, `展示 一戸建て（${d.year}）`, d.rows, (r) => pct(yearOf(h[r.c], d.year), yearOf(o[r.c], d.year)), { decimals: 1, expect: 47 });
    compareRows(res, `展示 木の家（${d.year}）`, d.wood.rows, (r) => pct(yearOf(w[r.c], d.year), yearOf(h[r.c], d.year)), { decimals: 1, expect: 47 });
  });
  await run('展示 物価', async () => {
    const d = await getPriceData();
    for (const [k, code] of [['rows', 'C5701'], ['food', 'C5703'], ['heat', 'C5705'], ['education', 'C5710']]) {
      const part = k === 'rows' ? { year: d.year, rows: d.rows } : d[k];
      const got = await direct('0000010103', code, null);
      compareRows(res, `展示 物価 ${code}（${part.year}）`, part.rows, (r) => yearOf(got[r.c], part.year), { decimals: 1, expect: 47 });
    }
  });
  await run('展示 外食の街', async () => {
    const d = await getFoodData();
    const got = await direct('0000010208', 'H06130', null);
    compareRows(res, `展示 外食の街（${d.year}）`, d.rows, (r) => yearOf(got[r.c], d.year), { decimals: 1, expect: 47 });
  });
  await run('展示 車', async () => {
    const d = await getCarData();
    const got = await direct('0000010212', 'L03607', null);
    compareRows(res, `展示 車（${d.year}）`, d.rows, (r) => { const v = yearOf(got[r.c], d.year); return ok(v) ? Math.round((v / 1000) * 100) / 100 : null; }, { decimals: 2, expect: 47 });
  });
  await run('展示 ごみ', async () => {
    const d = await getWasteData();
    const pop = await getPopulationData();
    const codeOf = Object.fromEntries(pop.areas.map((a) => [a.n, a.c]));
    const w = await direct('0000010108', 'H5610', null), rc = await direct('0000010108', 'H5614', null);
    compareRows(res, `展示 ごみ（${d.year}）`, d.rows.map((r) => ({ ...r, c: codeOf[r.n] })), (r) => yearOf(w[r.c], d.year), { decimals: 0, expect: 47 });
    compareRows(res, `展示 リサイクル（${d.year}）`, d.recycle.rows.map((r) => ({ ...r, c: codeOf[r.n] })), (r) => yearOf(rc[r.c], d.year), { decimals: 1, expect: 47 });
  });
  await run('展示 日照と快晴', async () => {
    const d = await getClimateData();
    for (const [k, code] of [['sun', 'B4108'], ['clear', 'B4104']]) {
      const got = await direct('0000010102', code, null);
      compareRows(res, `展示 ${d[k].label}（${d[k].year}）`, d[k].rows.map((r) => ({ ...r, c: r.c || r.code })), (r) => yearOf(got[r.c], d[k].year), { decimals: 1, expect: 47 });
    }
  });

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

  return res;
}
