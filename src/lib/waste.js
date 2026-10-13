// =====================================================
// 展示17「日本一ごみを出す県はどこだ」
// H5610 1人1日当たりごみ排出量 / H5614 ごみのリサイクル率
// 出典：一般廃棄物処理事業実態調査（環境省）を社会・人口統計体系が収録
// =====================================================
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_ID = '0000010108';
const CODES = { waste: 'H5610', recycle: 'H5614' };

const asArray = (x) => (Array.isArray(x) ? x : x ? [x] : []);

let cache = null;

export async function getWasteData() {
  if (cache) return cache;

  const appId = import.meta.env?.ESTAT_APP_ID;
  if (!appId) throw new Error('ESTAT_APP_ID が設定されていません');

  const qs = new URLSearchParams({
    appId, lang: 'J', statsDataId: STATS_ID,
    cdCat01: Object.values(CODES).join(','),
    metaGetFlg: 'Y', cntGetFlg: 'N', limit: '10000',
  });
  const res = await fetch(`${BASE}/getStatsData?${qs.toString()}`);
  const root = (await res.json()).GET_STATS_DATA;
  if (root.RESULT.STATUS !== 0) throw new Error(root.RESULT.ERROR_MSG);

  const inf = root.STATISTICAL_DATA;
  const cls = asArray(inf.CLASS_INF.CLASS_OBJ);
  const nameMap = (id) => {
    const o = cls.find((c) => c['@id'] === id);
    return new Map(asArray(o?.CLASS).map((c) => [c['@code'], c['@name']]));
  };
  const areaName = nameMap('area');
  const timeName = nameMap('time');
  const values = asArray(inf.DATA_INF.VALUE);

  const times = [...new Set(values.map((v) => v['@time']))].sort();
  const latest = times[times.length - 1];
  const year = (timeName.get(latest) || latest).replace(/年度?$/, '');

  const isPref = (a) => /^\d{5}$/.test(a) && a.endsWith('000') && a !== '00000';

  const pick = (code, time) =>
    values
      .filter((v) => v['@cat01'] === code && v['@time'] === time && isPref(v['@area']))
      .map((v) => ({ n: areaName.get(v['@area']), minutes: Number(v.$) }))
      .filter((r) => Number.isFinite(r.minutes));

  const national = (code, time) => {
    const v = values.find(
      (x) => x['@cat01'] === code && x['@time'] === time && x['@area'] === '00000'
    );
    return v ? Number(v.$) : null;
  };

  const rows = pick(CODES.waste, latest).sort((a, b) => b.minutes - a.minutes);
  const recycleRows = pick(CODES.recycle, latest).sort((a, b) => b.minutes - a.minutes);

  const trend = times
    .map((t) => ({
      year: (timeName.get(t) || t).replace(/年度?$/, ''),
      waste: national(CODES.waste, t),
      recycle: national(CODES.recycle, t),
    }))
    .filter((r) => Number.isFinite(r.waste));

  const recycleBy = new Map(recycleRows.map((r) => [r.n, r.minutes]));
  const pairs = rows
    .map((r) => [r.minutes, recycleBy.get(r.n)])
    .filter(([, y]) => Number.isFinite(y));
  const corr = pearson(pairs.map((p) => p[0]), pairs.map((p) => p[1]));

  cache = {
    year,
    source: '総務省統計局「社会・人口統計体系 都道府県データ」（原データ：環境省「一般廃棄物処理事業実態調査」）',
    unit: 'g',
    rows,
    national: national(CODES.waste, latest),
    max: rows[0].minutes,
    min: rows[rows.length - 1].minutes,
    recycle: {
      rows: recycleRows,
      national: national(CODES.recycle, latest),
      max: recycleRows[0].minutes,
      min: recycleRows[recycleRows.length - 1].minutes,
    },
    corr,
    trend,
  };
  return cache;
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx, b = ys[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}