import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const out = [];
const sec = (t) => out.push(`\n## ${t}`);
const ng = (m) => out.push(`- NG ${m}`);
const warn = (m) => out.push(`- 要確認 ${m}`);
const ok = (m) => out.push(`- OK ${m}`);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const walk = (dir, ext) => { const r = []; (function w(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) w(p); else if (!ext || p.endsWith(ext)) r.push(p); } })(path.join(ROOT, dir)); return r.map((p) => path.relative(ROOT, p)); };
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

const { exhibits, PLACES } = await import(path.join(ROOT, 'src/data/exhibits.js'));
const { catalog } = await import(path.join(ROOT, 'src/data/catalog.js'));
const { news } = await import(path.join(ROOT, 'src/data/news.js'));
const PREFS = '北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');

// 1・2 展示番号の三点一致／広場名
sec('1・2 展示番号・広場名（ページ ↔ exhibits.js ↔ ディレクトリ）');
const dirs = fs.readdirSync(path.join(ROOT, 'src/pages/exhibits'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
for (const d of dirs) {
  const page = read(`src/pages/exhibits/${d}/index.astro`);
  const m = page.match(/EXHIBIT (\d+)/); const no = m ? Number(m[1]) : null;
  const ex = exhibits.find((e) => e.href === `/exhibits/${d}/`);
  if (!ex) { ng(`${d}: exhibits.js に登録なし（一覧・件数に出ない）`); continue; }
  if (no !== ex.no) ng(`${d}: ページ EXHIBIT ${no} ≠ exhibits.js no:${ex.no}`);
  const sub = page.match(/class="sub">([^<]*)/); const place = sub ? sub[1].split('｜')[0].trim() : '';
  if (place !== PLACES[ex.place]) ng(`${d}: 小見出し「${place}」≠ exhibits.js「${PLACES[ex.place]}」`);
}
for (const e of exhibits) if (!dirs.includes(e.href.split('/')[2])) ng(`exhibits.js no:${e.no} ${e.href} のディレクトリが無い`);
const nos = exhibits.map((e) => e.no).sort((a, b) => a - b);
for (let i = 1; i < nos.length; i++) if (nos[i] !== nos[i - 1] + 1) ng(`展示番号が飛んでいる: ${nos[i - 1]} → ${nos[i]}`);
ok(`展示 ${dirs.length} ディレクトリ／exhibits.js ${exhibits.length} 件`);

// 3 件数表示
sec('3 玄関の件数表示');
const idx = strip(read('dist/index.html'));
const mE = idx.match(/全(\d+)展示/), mW = idx.match(/全(\d+)窓口/), mI = idx.match(/(\d+) 指標/);
const pub = catalog.filter((c) => c.status === 'published').length;
const rooms = fs.readdirSync(path.join(ROOT, 'dist')).filter((d) => /^town-|^education$|^education-budget$|^ict$|^living$|^population$/.test(d));
const dashCards = (read('dist/dashboard/index.html').match(/href="\/(town-[a-z-]+|education|education-budget|ict|living|population)\/"/g) || []).map((s) => s.match(/"\/([^"]+)\/"/)[1]);
const dashSet = [...new Set(dashCards)];
out.push(`- 展示: 表示 ${mE?.[1]} / exhibits.js ${exhibits.length}`);
out.push(`- 窓口: 表示 ${mW?.[1]} / dashboard のカード ${dashSet.length}（${dashSet.join(', ')}）/ dist の窓口ディレクトリ ${rooms.length}`);
out.push(`- 指標: 表示 ${mI?.[1]} / catalog published ${pub}`);
if (mE && Number(mE[1]) !== exhibits.length) ng('展示の件数表示が合わない');
if (mW && Number(mW[1]) !== dashSet.length) warn(`窓口の件数表示（手書き ${mW[1]}）と閲覧室一覧のカード数（${dashSet.length}）が違う`);
if (mI && Number(mI[1]) !== pub) ng('指標の件数表示が合わない');

// 4 catalog
sec('4 catalog.js');
const distPage = (href) => exists(`dist${href}index.html`) || exists(`dist${href.replace(/\/$/, '')}.html`);
for (const c of catalog) {
  if (c.status === 'published') { for (const u of c.usedIn || []) if (!distPage(u)) ng(`${c.key}: usedIn ${u} のページが dist に無い`); if (!(c.usedIn || []).length) warn(`${c.key}: published だが usedIn が空`); }
}
const cands = catalog.filter((c) => c.status !== 'published');
out.push(`- published ${pub} 件、candidate ${cands.length} 件（${cands.map((c) => c.key).join(', ')}）`);
// 表番号 ↔ lib
const libIds = {}; for (const f of walk('src/lib', '.js')) { const s = read(f); const ids = [...s.matchAll(/'(000\d{7}|0003\d{6})'/g)].map((m) => m[1]); if (ids.length) libIds[f] = [...new Set(ids)]; }
const catIds = new Set(catalog.flatMap((c) => Object.values(c.statsDataId || {}).filter(Boolean)));
for (const [f, ids] of Object.entries(libIds)) for (const id of ids) if (!catIds.has(id)) warn(`${f} の表番号 ${id} は catalog のどのエントリにも無い`);

// 5 出典一覧
sec('5 出典一覧 /sources/ の網羅');
const src = read('src/pages/sources/index.astro');
const roomNames = [...src.matchAll(/'(\/[a-z-]+\/)':/g)].map((m) => m[1]);
for (const r of dashSet) if (!roomNames.includes(`/${r}/`)) ng(`ROOM_NAMES に /${r}/ が無い`);
for (const r of ['town-finance', 'town-migration', 'education-budget']) if (!roomNames.includes(`/${r}/`)) warn(`ROOM_NAMES に別館の /${r}/ が無い`);
const srcHtml = read('dist/sources/index.html');
for (const e of exhibits) if (!srcHtml.includes(e.href)) warn(`/sources/ に ${e.href}（展示${e.no}）へのリンクが無い（catalog の usedIn 漏れの可能性）`);

// 6 内部リンク切れ（dist 全ページ）
sec('6 内部リンク切れ');
const htmls = walk('dist', '.html');
const broken = {};
for (const h of htmls) {
  const s = read(h);
  for (const m of s.matchAll(/href="(\/[^"#?]*)/g)) {
    const u = m[1]; if (u.startsWith('/_astro') || u.startsWith('/images') || /\.(xml|txt|json|svg|png|webp|ico|css|js)$/.test(u)) continue;
    if (!distPage(u.endsWith('/') ? u : u + '/') && !exists(`dist${u}`)) (broken[u] ??= []).push(h);
  }
}
for (const [u, pages] of Object.entries(broken)) ng(`${u} → 無い（${pages.length}ページ: ${pages.slice(0, 3).join(', ')}${pages.length > 3 ? ' …' : ''}）`);
if (!Object.keys(broken).length) ok(`${htmls.length} ページのサイト内リンクはすべて実在`);

// 7 瓦版
sec('7 瓦版 news.js');
for (const n of news) if (n.href && !distPage(n.href.split('#')[0])) ng(`${n.date} ${n.title}: href ${n.href} が無い`);
for (let i = 1; i < news.length; i++) if (news[i].date > news[i - 1].date) ng(`日付が昇順になっている: ${news[i - 1].date} の次が ${news[i].date}`);
ok(`${news.length} 件`);

// 8・9・10・11 壊れやすい書き方
sec('8 <style> 内のHTMLタグ');
const astros = walk('src/pages', '.astro').concat(walk('src/components', '.astro'), walk('src/layouts', '.astro'));
for (const f of astros) { const s = read(f); for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) { const bad = m[1].match(/^\s*<[a-zA-Z][^\n]*/m); if (bad) ng(`${f}: ${bad[0].trim().slice(0, 60)}`); } }
sec('9 テンプレート内の < 比較（CompilerError の種）');
for (const f of astros) { const s = read(f); const fm = s.indexOf('---', 3); const body = fm > 0 ? s.slice(fm + 3) : s; const tpl = body.split('<style')[0].replace(/<script[\s\S]*?<\/script>/g, ''); for (const m of tpl.matchAll(/\{[^{}]*?(<=|\s<\s)[^{}]*?\}/g)) ng(`${f}: ${m[0].slice(0, 70)}`); }
sec('10 <img> と CSS の対応・alt');
for (const f of astros) { const s = read(f); for (const m of s.matchAll(/<img\s[^>]*>/g)) { const t = m[0]; const cls = (t.match(/class="([^"]+)"/) || [])[1]; const alt = t.match(/alt="([^"]*)"/) || (/alt=\{/.test(t) ? ['', 'x'] : null); if (!alt) ng(`${f}: alt 属性なし ${t.slice(0, 60)}`); else if (alt[1] === '' && !/aria-hidden/.test(t)) warn(`${f}: alt が空 ${t.slice(0, 60)}`); if (cls) for (const c of cls.split(/\s+/)) if (!s.includes(`.${c}{`) && !s.includes(`.${c} {`) && !s.includes(`.${c},`) && !read('src/styles/global.css').includes(`.${c}`)) warn(`${f}: <img class="${c}"> に対応するCSSが見当たらない`); } }
sec('11 .cards のメディアクエリ');
for (const f of astros) { const s = read(f); if (/\.cards\s*\{[^}]*grid/.test(s)) { const has900 = /max-width:\s*900px/.test(s), has600 = /max-width:\s*600px/.test(s); if (!has900 || !has600) ng(`${f}: .cards に ${!has900 ? '900px ' : ''}${!has600 ? '600px' : ''} のメディアクエリが無い`); } }

// 12 {i+1} と同率、13 件数、14 NaN
sec('12 下位ランキングの {i+1} と同率');
for (const d of dirs) {
  const s = read(`src/pages/exhibits/${d}/index.astro`); const html = read(`dist/exhibits/${d}/index.html`);
  const usesI = /class="rank low">[\s\S]*?\{i \+ 1\}/.test(s);
  for (const m of html.matchAll(/<ol class="rank low[^"]*">([\s\S]*?)<\/ol>/g)) {
    const items = [...m[1].matchAll(/<span class="pos">([^<]*)<\/span>[\s\S]*?<span class="min">([^<]*)<\/span>/g)].map((x) => [x[1], x[2]]);
    for (let i = 1; i < items.length; i++) if (items[i][1] === items[i - 1][1] && items[i][0] !== items[i - 1][0]) warn(`${d}: 下位リストで同値 ${items[i][1]} が ${items[i - 1][0]} と ${items[i][0]} の別順位で表示${usesI ? '（{i+1} 仕様）' : ''}`);
  }
}
sec('13 全件リストの件数・14 NaN/undefined');
for (const d of dirs) {
  const html = read(`dist/exhibits/${d}/index.html`);
  for (const m of html.matchAll(/<details class="all">[\s\S]*?<summary>([^<]*)<\/summary>\s*<ol>([\s\S]*?)<\/ol>/g)) { const n = (m[2].match(/<li>/g) || []).length; if (n !== 47 && d !== 'gyoza') warn(`${d}: 「${m[1]}」が ${n} 件（47でない）`); }
}
for (const h of htmls) { const t = strip(read(h)); for (const w of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (t.includes(w)) ng(`${h}: 本文に「${w}」`); }
ok('チェック済み');

// 15 年次
sec('15 各展示の年次表示（最新か目視用）');
for (const d of dirs) { const t = strip(read(`dist/exhibits/${d}/index.html`)); const sub = t.match(/EXHIBIT \d+\s*[^｜]*?｜([^。]{0,60}?（[^）]*）)/); out.push(`- ${d}: ${sub ? sub[1].replace(/\s+/g, '') : '（小見出しに年次なし）'}`); }

// 16 分母の定義
sec('16 derived 指標の分母（codeNote）');
for (const c of catalog) if (c.fetchMode === 'derived') out.push(`- ${c.key}: ${c.codeNote || c.code}`);

// 17 本文の固定数字・県名
sec('17 セリフ・本文に固定で書かれた数字・県名（自動更新で壊れる候補）');
for (const d of dirs) {
  const s = read(`src/pages/exhibits/${d}/index.astro`);
  const hits = [];
  for (const m of s.matchAll(/<Talk[^>]*>([\s\S]*?)<\/Talk>|<p class="note">([\s\S]*?)<\/p>/g)) {
    const raw = (m[1] ?? m[2]).replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '').replace(/\{[^}]*\}/g, '');
    const nums = raw.match(/[0-9０-９][0-9０-９,.]*/g) || []; const prefs = PREFS.filter((p) => raw.includes(p));
    if (nums.length || prefs.length) hits.push(`「${raw.replace(/\s+/g, '').slice(0, 50)}…」 ← ${[...nums, ...prefs].join(' / ')}`);
  }
  if (hits.length) { out.push(`- **${d}**`); for (const h of hits) out.push(`  - ${h}`); }
}

// 27 クロスリンクの相互性・28 玄関カード
sec('27 クロスリンク（A→Bはあるが B→A が無い）');
const cross = {};
for (const d of dirs) { const html = read(`dist/exhibits/${d}/index.html`); const m = html.match(/<p class="cross"[^>]*>([\s\S]*?)<\/p>/); cross[`/exhibits/${d}/`] = m ? [...m[1].matchAll(/href="([^"]+)"/g)].map((x) => x[1]) : []; }
for (const [a, links] of Object.entries(cross)) { if (!links.length) warn(`${a}: あわせて読む が無い`); for (const b of links) if (cross[b] && !cross[b].includes(a)) out.push(`- ${a} → ${b} はあるが逆が無い`); }
sec('28 玄関カード・展望塔のリンク先');
const cards = [...read('src/pages/index.astro').matchAll(/class="card pc" href="([^"]+)"/g)].map((m) => m[1]);
const latest = [...exhibits].sort((a, b) => b.no - a.no).slice(0, 3).map((e) => e.href).reverse();
out.push(`- 玄関カード: ${cards.join(' ')}`); if (cards.join() !== latest.join()) warn(`最新3本は ${latest.join(' ')}`);
const tower = [...read('dist/tower/index.html').matchAll(/class="gauge" href="([^"]+)"/g)].map((m) => m[1]);
for (const t of tower) if (!distPage(t)) ng(`展望塔の計器 ${t} が無い`);
ok(`展望塔の計器 ${tower.length} 枠`);

fs.writeFileSync(path.join(ROOT, 'audit-report.md'), `# Countopia 監査レポート（${new Date().toISOString().slice(0, 10)}）\n` + out.join('\n') + '\n');
console.log(out.join('\n'));
