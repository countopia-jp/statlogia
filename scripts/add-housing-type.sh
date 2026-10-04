#!/bin/bash
set -e
cd ~/Projects/countopia

cat > src/lib/housing-type.js <<'EOF'
// =====================================================
// Countopia Stats - 住宅の建て方（一戸建率・木造率）データ取得モジュール
// src/lib/housing-type.js
//
// 社会・人口統計体系 都道府県データ 基礎データ H居住
//   statsDataId: 0000010108（#プレフィックス不要）
//   H1101   居住世帯あり住宅数（分母。空き家などを除いた「人の住む家」）
//   H1401   一戸建住宅数
//   H140101 一戸建住宅数（木造）
// 原資料は住宅・土地統計調査（5年ごと）。値は百戸単位で丸められている。
//
// 出力：
//   rows     = 一戸建率（H1401 / H1101 ×100）。値キーは他展示と同じ minutes
//   wood     = 一戸建のうち木造の割合（H140101 / H1401 ×100）
// =====================================================

const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';
const STATS_DATA_ID = '0000010108';

export const CODES = {
  occupied: 'H1101',
  detached: 'H1401',
  detachedWood: 'H140101',
};

let _cache = null;

function getAppId() {
  const appId = import.meta.env.ESTAT_APP_ID || process.env.ESTAT_APP_ID;
  if (!appId) throw new Error('[housing-type.js] ESTAT_APP_ID が設定されていません');
  return appId;
}

async function apiGet(path, params) {
  const qs = new URLSearchParams({ appId: getAppId(), lang: 'J', ...params });
  const res = await fetch(`${API_BASE}/${path}?${qs.toString()}`);
  if (!res.ok) throw new Error(`[housing-type.js] API HTTP ${res.status}: ${path}`);
  return await res.json();
}

function asArray(x) {
  return Array.isArray(x) ? x : x ? [x] : [];
}

function toNum(raw) {
  if (raw === undefined || raw === null || raw === '' || raw === '-' || raw === '***' || raw === 'X') return null;
  const num = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(num) ? num : null;
}

// 3コード×48地域×全時点を1リクエストで取る（都道府県版なので上限には届かない）
async function fetchAll() {
  const json = await apiGet('getStatsData', {
    statsDataId: STATS_DATA_ID,
    cdCat01: Object.values(CODES).join(','),
    metaGetFlg: 'Y',
    cntGetFlg: 'N',
    annotationGetFlg: 'N',
    explanationGetFlg: 'N',
    replaceSpChars: '0',
  });
  const root = json.GET_STATS_DATA;
  if (!root || root.RESULT.STATUS !== 0) {
    throw new Error(`[housing-type.js] getStatsData失敗: ${root?.RESULT?.ERROR_MSG || '不明'}`);
  }
  const statData = root.STATISTICAL_DATA;

  const areaObj = asArray(statData.CLASS_INF.CLASS_OBJ).find((o) => o['@id'] === 'area');
  const areaNames = {};
  for (const c of asArray(areaObj?.CLASS)) {
    areaNames[c['@code']] = (c['@name'] || '').replace(/^\d+_/, '').trim();
  }

  // time → area → cat01 → 値
  const byTime = {};
  for (const rec of asArray(statData.DATA_INF.VALUE)) {
    const num = toNum(rec['$']);
    if (num === null) continue;
    const t = rec['@time'];
    const a = rec['@area'];
    ((byTime[t] ??= {})[a] ??= {})[rec['@cat01']] = num;
  }

  // 47都道府県すべてで3コードが揃う最新時点を採用
  const times = Object.keys(byTime).sort().reverse();
  let picked = null;
  for (const t of times) {
    const areas = byTime[t];
    const prefCodes = Object.keys(areas).filter((a) => a !== '00000');
    const complete = prefCodes.filter((a) => {
      const o = areas[a];
      return o[CODES.occupied] > 0 && o[CODES.detached] > 0 && o[CODES.detachedWood] !== undefined;
    });
    if (complete.length >= 47) { picked = t; break; }
  }
  if (!picked) throw new Error('[housing-type.js] 47都道府県が揃う時点がありません');

  const areas = byTime[picked];
  const detachedRows = [];
  const woodRows = [];
  let national = null;
  let woodNational = null;

  for (const [code, o] of Object.entries(areas)) {
    const name = areaNames[code] || '';
    if (!(o[CODES.occupied] > 0) || !(o[CODES.detached] > 0)) continue;
    const detachedRate = (o[CODES.detached] / o[CODES.occupied]) * 100;
    const woodRate = (o[CODES.detachedWood] / o[CODES.detached]) * 100;
    if (code === '00000' || name === '全国') {
      national = detachedRate;
      woodNational = woodRate;
      continue;
    }
    if (!name) continue;
    detachedRows.push({ c: code, n: name, minutes: detachedRate });
    woodRows.push({ c: code, n: name, minutes: woodRate });
  }
  detachedRows.sort((a, b) => b.minutes - a.minutes);
  woodRows.sort((a, b) => b.minutes - a.minutes);

  return {
    year: `${picked.slice(0, 4)}年`,
    national,
    rows: detachedRows,
    wood: { national: woodNational, rows: woodRows },
  };
}

export async function getHousingTypeData() {
  if (_cache) return _cache;
  const d = await fetchAll();
  _cache = {
    generated: new Date().toISOString().slice(0, 10),
    source: '政府統計の総合窓口(e-Stat) 社会・人口統計体系 都道府県データ 基礎データ H居住（表番号0000010108）。原資料は住宅・土地統計調査',
    year: d.year,
    national: d.national,
    rows: d.rows,
    wood: d.wood,
  };
  return _cache;
}
EOF

mkdir -p src/pages/exhibits/housing-type
cat > src/pages/exhibits/housing-type/index.astro <<'EOF'
---
import BaseLayout from '../../../layouts/BaseLayout.astro';
import Talk from '../../../components/Talk.astro';
import { getHousingTypeData } from '../../../lib/housing-type.js';

const data = await getHousingTypeData();
const rows = data.rows;
const most = rows.slice(0, 5);
const least = rows.slice(-5).reverse();
const top = rows[0];
const bottom = rows[rows.length - 1];
const avg = data.national;
const maxMin = top.minutes;
const fmt = (v) => `${v.toFixed(1)}％`;
// 10軒のうち何軒か
const per10 = (v) => Math.round(v / 10);

// 同値の順位は値から引く
const rankOf = (v) => rows.findIndex((r) => r.minutes.toFixed(1) === v.toFixed(1)) + 1;

// 全国の一戸建率が半分を超えているか
const overHalf = avg >= 50;

// --- 後半：一戸建のうち木造の割合 ---
const wood = data.wood;
const wdRows = wood.rows;
const wdMost = wdRows.slice(0, 5);
const wdLeast = wdRows.slice(-5).reverse();
const wdMax = wdRows[0].minutes;
const wdTop = wdRows[0];
const wdBottom = wdRows[wdRows.length - 1];
const wdSecondLast = wdRows[wdRows.length - 2];
const wdRankOf = (v) => wdRows.findIndex((r) => r.minutes.toFixed(1) === v.toFixed(1)) + 1;

// 相互の順位（名前で引くので入れ替わっても壊れない）
const wdRankOfName = (name) => wdRows.findIndex((r) => r.n === name) + 1;
const dtRankOfName = (name) => rows.findIndex((r) => r.n === name) + 1;
const topWdRank = wdRankOfName(top.n);
const wdTopDtRank = dtRankOfName(wdTop.n);
const sameTop = top.n === wdTop.n;

// 両方の上位5に入る県
const topNames = most.map((r) => r.n);
const wdTopNames = wdMost.map((r) => r.n);
const bothTop = topNames.filter((n) => wdTopNames.includes(n));
const hasBothTop = bothTop.length > 0;

// 片方では上位10、もう片方では下位10に入る「入れかわる県」
const dtTop10 = rows.slice(0, 10).map((r) => r.n);
const dtLow10 = rows.slice(-10).map((r) => r.n);
const wdTop10 = wdRows.slice(0, 10).map((r) => r.n);
const wdLow10 = wdRows.slice(-10).map((r) => r.n);
const swapA = dtTop10.filter((n) => wdLow10.includes(n));
const swapB = wdTop10.filter((n) => dtLow10.includes(n));
const hasSwap = swapA.length > 0 || swapB.length > 0;
const swapDtHigh = swapA.length > 0;
const swapName = swapDtHigh ? swapA[0] : (swapB[0] || '');
const swapDtRank = hasSwap ? dtRankOfName(swapName) : 0;
const swapWdRank = hasSwap ? wdRankOfName(swapName) : 0;

// 最下位ひとり旅：最下位と46位の差が極端に大きいときだけ出す
const lonerGap = wdSecondLast.minutes - wdBottom.minutes;
const loner = lonerGap >= 30;
// 46県が収まる幅（最下位を除く）
const wdSpread = wdTop.minutes - wdSecondLast.minutes;

// 見出しの接続詞：一番が違い、上位5の重なりが2県以下なら「ところが」、似ていれば「こんどは」
const twist = !sameTop && bothTop.length <= 2;
---
<BaseLayout title="一戸建てと木の家の割合｜Countopia Stats" description="都道府県別・住まいに占める一戸建ての割合と、一戸建てのうち木造の割合。一戸建てと木の家、日本一はどの県か。" backHref="/exhibits/" backLabel="展示一覧">
  <main>
    <section class="exhibit">
      <div class="sec-head">
        <span class="no">EXHIBIT 27</span>
        <h1>一戸建てと木の家、日本一はどの県だ</h1>
        <p class="sub">暮らしの広場｜住まいの建て方（{data.year}）</p>
      </div>

      <Talk speaker="kei">27番目の展示は「住まいの建て方」です。人の住んでいる家のうち、一戸建てがどのくらいあるか。全国では{fmt(avg)}、10軒に{per10(avg)}軒ほどです。</Talk>
      <Talk speaker="touko">わたくしの頃は、家といえばたいてい一戸建てでしたわ。長屋もありましたけれど。</Talk>
      <Talk speaker="kei">今は{overHalf ? '半分より少し多いくらい' : '半分を切るくらい'}です。そして、県によって開きがあります。</Talk>

      <div class="highlight">
        <div class="card card--hot">
          <span class="seal" aria-hidden="true"><b>最多</b></span>
          <span class="label">一戸建ての割合がいちばん高い</span>
          <strong>{top.n}</strong>
          <span class="num">{fmt(top.minutes)}</span>
        </div>
        <div class="card card--cool">
          <span class="seal" aria-hidden="true"><b>最少</b></span>
          <span class="label">一戸建ての割合がいちばん低い</span>
          <strong>{bottom.n}</strong>
          <span class="num">{fmt(bottom.minutes)}</span>
        </div>
      </div>

      <h2>一戸建ての割合が高い県 TOP5</h2>
      <ol class="rank">
        {most.map((r) => (
          <li>
            <span class="pos">{rankOf(r.minutes)}</span>
            <span class="pref">{r.n}</span>
            <span class="bar" style={`--w:${(r.minutes / maxMin) * 100}%`}></span>
            <span class="min">{fmt(r.minutes)}</span>
          </li>
        ))}
      </ol>

      <Talk speaker="touko">{top.n}は10軒のうち{per10(top.minutes)}軒が一戸建てなのね。{bottom.n}は{per10(bottom.minutes)}軒ほど。</Talk>
      <Talk speaker="kei">はい。いちばん高い県と低い県で、{(top.minutes - bottom.minutes).toFixed(1)}ポイントの開きがあります。</Talk>

      <h2>一戸建ての割合が低い県 TOP5</h2>
      <ol class="rank low">
        {least.map((r, i) => (
          <li>
            <span class="pos">{i + 1}</span>
            <span class="pref">{r.n}</span>
            <span class="bar" style={`--w:${(r.minutes / maxMin) * 100}%`}></span>
            <span class="min">{fmt(r.minutes)}</span>
          </li>
        ))}
      </ol>

      <details class="all">
        <summary>47都道府県すべてを見る（高い順）</summary>
        <ol>
          {rows.map((r) => <li>{r.n}　{fmt(r.minutes)}</li>)}
        </ol>
      </details>

      <h2>{twist ? "ところが" : "こんどは"}、木の家を数えると</h2>

      <Talk speaker="touko">一戸建てといえば木の家でしょう。今もそうなの。</Talk>
      <Talk speaker="kei">一戸建てのうち木造の割合は、全国で{fmt(wood.national)}。10軒に{per10(wood.national)}軒です。{sameTop ? 'いちばん高い県は一戸建ての割合と同じでした。' : 'いちばん高い県は入れかわります。'}</Talk>

      <h2>木造の割合が高い県 TOP5</h2>
      <ol class="rank wd">
        {wdMost.map((r) => (
          <li>
            <span class="pos">{wdRankOf(r.minutes)}</span>
            <span class="pref">{r.n}</span>
            <span class="bar" style={`--w:${(r.minutes / wdMax) * 100}%`}></span>
            <span class="min">{fmt(r.minutes)}</span>
          </li>
        ))}
      </ol>

      <h2>木造の割合が低い県 TOP5</h2>
      <ol class="rank low">
        {wdLeast.map((r, i) => (
          <li>
            <span class="pos">{i + 1}</span>
            <span class="pref">{r.n}</span>
            <span class="bar" style={`--w:${(r.minutes / wdMax) * 100}%`}></span>
            <span class="min">{fmt(r.minutes)}</span>
          </li>
        ))}
      </ol>

      {loner && (
        <Talk speaker="touko">あら、{wdBottom.n}だけ、まるで別の数字ねえ。</Talk>
      )}
      {loner && (
        <Talk speaker="kei">はい。{wdBottom.n}の一戸建ては、木造が100軒に{Math.round(wdBottom.minutes)}軒。次に低い{wdSecondLast.n}でも{fmt(wdSecondLast.minutes)}ですから、一つだけ大きく離れています。残りの46県は{fmt(wdSecondLast.minutes)}から{fmt(wdTop.minutes)}まで、{wdSpread.toFixed(1)}ポイントの幅に収まっています。</Talk>
      )}

      <Talk speaker="touko">一戸建てで一番だった{top.n}は、木造では何番目なの。</Talk>
      <Talk speaker="kei">{sameTop ? `${top.n}が、どちらも一番です。` : `${topWdRank}番目です。かわりに木造で一番なのは${wdTop.n}で、こちらは一戸建ての割合では${wdTopDtRank}番目でした。`}</Talk>

      <details class="all">
        <summary>木造の割合も47都道府県すべてを見る（高い順）</summary>
        <ol>
          {wdRows.map((r) => <li>{r.n}　{fmt(r.minutes)}</li>)}
        </ol>
      </details>

      {hasBothTop && (
        <Talk speaker="kei">上位5県のうち、{bothTop.join('と')}は一戸建ての割合と木造の割合の両方に入っています。</Talk>
      )}
      {hasSwap && (
        <Talk speaker="touko">{swapName}は{swapDtHigh ? `一戸建ての割合では${swapDtRank}番目なのに、木造では${swapWdRank}番目まで下がる` : `木造では${swapWdRank}番目なのに、一戸建ての割合では${swapDtRank}番目まで下がる`}のね。</Talk>
      )}
      {hasSwap && (
        <Talk speaker="kei">はい。一戸建てが多いことと、その一戸建てが木でできていることは、別の数字です。</Talk>
      )}

      <p class="note">「一戸建ての割合」は、人の住んでいる住宅（居住世帯のある住宅。空き家や建築中の家は含みません）のうち、一戸建てが占める割合です。残りは共同住宅（アパート・マンション）と長屋建などで、共同住宅の割合はおおむね一戸建ての裏返しになります。「木造の割合」は、一戸建てのうち木造（防火木造を含む）が占める割合です。住宅・土地統計調査は5年ごとに行われ、戸数は百戸単位に丸められているため、小数第1位の差は丸めの範囲と考えてください。同じ値の県が複数あるときは、同じ順位として並べています。</p>

      <p class="cross">あわせて読む：<a href="/exhibits/vacancy/">日本一「空き家」県はどこだ</a>｜<a href="/exhibits/utility/">光熱・水道、日本一はどの県だ</a>｜<a href="/how-to-read/rate-and-count/">割合だけ見ると、消えるもの</a></p>

      <div class="source">
        <p>出典：{data.source}</p>
        <p>このサービスは、政府統計総合窓口(e-Stat)のAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。</p>
      </div>
    </section>
  </main>
</BaseLayout>
<style>
.exhibit{padding:56px 0 80px;max-width:720px;margin:0 auto}
.sec-head .no{font-family:"IBM Plex Mono",monospace;font-size:.72rem;letter-spacing:.3em;color:var(--stamp)}
h1{font-family:"Shippori Mincho",serif;font-weight:800;font-size:clamp(1.5rem,4vw,2.2rem);margin-top:8px}
.sub{color:var(--ink-soft);font-size:.85rem;margin-top:6px;margin-bottom:28px}
h2{font-family:"Shippori Mincho",serif;font-size:1.15rem;margin:40px 0 16px;border-left:4px solid var(--stamp);padding-left:12px}
.highlight{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:28px 0}
@media(max-width:560px){.highlight{grid-template-columns:1fr}}
.card{position:relative;border:1px solid var(--line);border-radius:12px;padding:20px;background:#fff;display:flex;flex-direction:column;gap:4px;align-items:flex-start}
.card .label{font-size:.72rem;letter-spacing:.2em;color:var(--ink-soft)}
.card strong{font-family:"Shippori Mincho",serif;font-size:1.9rem;line-height:1.2}
.card .num{font-family:"IBM Plex Mono",monospace;font-weight:600;font-size:1.1rem}
.card--hot .num{color:#b23a2f}
.card--cool .num{color:#2d6a4f}
.seal{
  position:absolute;top:12px;right:14px;width:48px;height:48px;
  border:2px solid currentColor;border-radius:50%;
  display:flex;align-items:center;justify-content:center;gap:1px;
  transform:rotate(-12deg);opacity:.55;
  font-family:"Shippori Mincho",serif;
}
.seal b{font-size:.8rem;line-height:1;letter-spacing:.06em}
.card--hot .seal{color:#b23a2f}
.card--cool .seal{color:#2d6a4f}
.rank{list-style:none;padding:0;display:flex;flex-direction:column;gap:10px}
.rank li{display:grid;grid-template-columns:2em 6.5em 1fr auto;align-items:center;gap:10px}
.rank .pos{font-family:"IBM Plex Mono",monospace;color:var(--stamp);font-weight:600}
.rank .bar{height:10px;border-radius:99px;background:var(--stamp);width:var(--w);opacity:.85;min-width:8px}
.rank.low .bar{background:#3a6b52}
.rank.wd .bar{background:#8a6a3e}
.rank .min{font-family:"IBM Plex Mono",monospace;font-size:.85rem;color:var(--ink-soft)}
.all{margin:32px 0}
.all summary{cursor:pointer;color:var(--stamp);font-size:.9rem}
.all ol{columns:2;margin-top:14px;font-size:.9rem;color:var(--ink-soft)}
@media(max-width:560px){.all ol{columns:1}}
.note{margin-top:28px;font-size:.85rem;color:var(--ink-soft);line-height:1.9}
.cross{margin-top:36px;font-size:.9rem}
.cross a{color:var(--stamp)}
.source{margin-top:48px;padding-top:20px;border-top:1px solid var(--line);font-size:.75rem;color:var(--ink-soft);line-height:1.8}
</style>
EOF

node - <<'EOF'
const fs = require('fs');

let ex = fs.readFileSync('src/data/exhibits.js', 'utf8');
if (!ex.includes('/exhibits/housing-type/')) {
  const placeMatch = ex.match(/href: '\/exhibits\/vacancy\/', place: '([a-z-]+)'/);
  const place = placeMatch ? placeMatch[1] : 'living';
  const entry = `  { no: 27, href: '/exhibits/housing-type/', place: '${place}',
    title: '一戸建てと木の家、日本一はどの県だ',
    lead: '住まいに占める一戸建ての割合と、一戸建てのうち木造の割合を47都道府県で比較。木の家の割合は、一県だけ大きく離れています。' },
`;
  ex = ex.replace(/(\{ no: 26, href: '\/exhibits\/budo\/'[\s\S]*?\},\n)/, `$1${entry}`);
  fs.writeFileSync('src/data/exhibits.js', ex);
  console.log('exhibits.js: 展示27を追加（place=' + place + '）');
} else {
  console.log('exhibits.js: すでに追加済み');
}

let cat = fs.readFileSync('src/data/catalog.js', 'utf8');
if (!cat.includes("'detached-rate'")) {
  const vIdx = cat.lastIndexOf("usedIn: ['/exhibits/budo/']");
  const before = vIdx > 0 ? cat.slice(Math.max(0, vIdx - 600), vIdx) : '';
  const dirAll = [...before.matchAll(/direction: '([a-z]+)'/g)];
  const direction = dirAll.length ? dirAll[dirAll.length - 1][1] : 'high';
  const entries = `  {
    key: 'detached-rate',
    label: '一戸建ての割合（居住世帯あり住宅に占める）',
    category: 'housing',
    system: 'H',
    scope: 'pref',
    statsDataId: { pref: '0000010108' },
    fetchMode: 'derived',
    code: 'H1401/H1101',
    codeNote: 'H1401 一戸建住宅数 ÷ H1101 居住世帯あり住宅数 ×100',
    unit: '％',
    direction: '${direction}',
    points: 1,
    status: 'published',
    usedIn: ['/exhibits/housing-type/'],
  },
  {
    key: 'detached-wood-rate',
    label: '一戸建てのうち木造の割合',
    category: 'housing',
    system: 'H',
    scope: 'pref',
    statsDataId: { pref: '0000010108' },
    fetchMode: 'derived',
    code: 'H140101/H1401',
    codeNote: 'H140101 一戸建住宅数（木造） ÷ H1401 一戸建住宅数 ×100',
    unit: '％',
    direction: '${direction}',
    points: 1,
    status: 'published',
    usedIn: ['/exhibits/housing-type/'],
  },
`;
  const anchor = "    usedIn: ['/exhibits/budo/'],\n  },\n";
  const idx = cat.lastIndexOf(anchor);
  if (idx < 0) throw new Error('catalog.js: budoの末尾エントリが見つかりません');
  cat = cat.slice(0, idx + anchor.length) + entries + cat.slice(idx + anchor.length);
  fs.writeFileSync('src/data/catalog.js', cat);
  console.log('catalog.js: 2指標を追加（direction=' + direction + '）');
} else {
  console.log('catalog.js: すでに追加済み');
}

let news = fs.readFileSync('src/data/news.js', 'utf8');
if (!news.includes('/exhibits/housing-type/')) {
  const item = ` {
    date: '${new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })}',
    title: '展示に「一戸建てと木の家、日本一はどの県だ」を追加しました',
    text: '住まいに占める一戸建ての割合と、一戸建てのうち木造の割合を47都道府県で比較。木の家の割合は、一県だけ大きく離れていました。',
    href: '/exhibits/housing-type/',
  },
`;
  news = news.replace('export const news = [\n', 'export const news = [\n' + item);
  fs.writeFileSync('src/data/news.js', news);
  console.log('news.js: 瓦版に1件追加');
} else {
  console.log('news.js: すでに追加済み');
}
EOF

echo "--- 確認 ---"
grep -n "EXHIBIT 27" src/pages/exhibits/housing-type/index.astro
grep -n "no: 27" src/data/exhibits.js
grep -n "detached-rate\|detached-wood-rate" src/data/catalog.js
grep -n "housing-type" src/data/news.js
tail -1 src/pages/exhibits/housing-type/index.astro
