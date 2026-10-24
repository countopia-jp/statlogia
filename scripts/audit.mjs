// =====================================================
// Statlogia - 点検（ビルド後の dist と src を突き合わせる）
// scripts/audit.mjs
//
// 10-25 Countopia から複製したままの展示向けの点検を捨て、窓口サイト向けに書き直した。
// 使い方： npm run build:quick のあと node scripts/audit.mjs
//          結果は audit-report.md にも書き出す
// =====================================================
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
const distPage = (href) => exists(`dist${href}index.html`) || exists(`dist${href.replace(/\/$/, '')}.html`);

if (!exists('dist/index.html')) { console.log('dist がありません。先に npm run build:quick を流してください。'); process.exit(1); }

const { ROOMS } = await import(path.join(ROOT, 'src/data/rooms/index.js'));
const { catalog } = await import(path.join(ROOT, 'src/data/catalog.js'));
const { news } = await import(path.join(ROOT, 'src/data/news.js'));
const { ROOM_NAMES, ROOM_COUNT } = await import(path.join(ROOT, 'src/data/page-names.js'));
const { CASES } = await import(path.join(ROOT, 'src/data/verify.js'));
const { HERO_POS } = await import(path.join(ROOT, 'src/data/hero-pos.js'));

// 1 窓口の登録とページ
sec('1 窓口（ROOMS ↔ dist ↔ 情報棟のカード ↔ ROOM_NAMES）');
const rooms = Object.values(ROOMS);
const dash = read('dist/dashboard/index.html');
const dashLinks = [...new Set([...dash.matchAll(/href="(\/[a-z0-9-]+\/)"/g)].map((m) => m[1]))];
for (const r of rooms) {
  if (!distPage(r.path)) ng(`${r.title}（${r.path}）のページが dist に無い`);
  if (!dashLinks.includes(r.path)) ng(`${r.title}（${r.path}）が情報棟の一覧に出ていない`);
  if (!ROOM_NAMES[r.path]) ng(`${r.path} が ROOM_NAMES に無い（出典一覧とたずね窓口に名前が出ない）`);
}
// 閲覧室の名前が付いていて ROOMS に無いもの＝手書きの窓口。見くらべ・読み解き・検証室は窓口ではない
const windowNames = Object.entries(ROOM_NAMES).filter(([, n]) => n.startsWith('閲覧室　')).map(([p]) => p);
const handmade = windowNames.filter((p) => !rooms.some((r) => r.path === p));
const others = Object.keys(ROOM_NAMES).filter((p) => !windowNames.includes(p));
for (const p of handmade.concat(others)) if (!distPage(p)) ng(`${p}（ROOM_NAMES にある）のページが dist に無い`);
ok(`共通エンジン ${rooms.length} 本、手書きの窓口 ${handmade.length} 本、窓口以外の部屋 ${others.length}、情報棟のカード ${dashLinks.filter((l) => ROOM_NAMES[l]).length} 本`);

// 2 件数表示
sec('2 件数の表示');
const idx = strip(read('dist/index.html'));
const mR = idx.match(/(\d+)\s*の窓口/);
out.push(`- 窓口: 玄関の表示 ${mR?.[1]} / ROOM_COUNT ${ROOM_COUNT} / 共通エンジン ${rooms.length} ＋ 手書き ${handmade.length} ＝ ${rooms.length + handmade.length}`);
if (mR && Number(mR[1]) !== ROOM_COUNT) ng('玄関の窓口数と ROOM_COUNT が合わない');
if (ROOM_COUNT !== rooms.length + handmade.length) ng(`ROOM_COUNT ${ROOM_COUNT} と 窓口の実体 ${rooms.length + handmade.length} が違う`);

// 3 catalog の usedIn
sec('3 catalog.js の usedIn');
const pub = catalog.filter((c) => c.status === 'published');
// 10-25 複製元（Countopia）の展示を指す usedIn が残っている。counts.js は除いて数えるので表示には出ないが、掃除の対象
const stale = pub.filter((c) => (c.usedIn || []).length && (c.usedIn || []).every((u) => u.startsWith('/exhibits/')));
for (const c of pub) { for (const u of (c.usedIn || []).filter((u) => !u.startsWith('/exhibits/'))) if (!distPage(u)) ng(`${c.key}: usedIn ${u} のページが dist に無い`); if (!(c.usedIn || []).length) warn(`${c.key}: published だが usedIn が空`); }
if (stale.length) warn(`複製元の展示しか指していない指標が ${stale.length} 件（この都市では行き先がない。例: ${stale.slice(0, 3).map((c) => c.key).join(', ')}）`);
ok(`published ${pub.length} 件（うちこの都市で使うのは ${pub.length - stale.length} 件）`);

// 4 出典一覧
sec('4 出典一覧 /sources/ の網羅');
const srcHtml = read('dist/sources/index.html');
for (const r of rooms) if (!srcHtml.includes(r.path)) warn(`/sources/ に ${r.path}（${r.title}）が出ていない（catalog の usedIn 漏れの可能性）`);

// 5 内部リンク切れ
sec('5 内部リンク切れ');
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

// 6 瓦版
sec('6 掲示板 news.js');
for (const n of news) if (n.href && n.href.startsWith('/') && !distPage(n.href.split('#')[0])) ng(`${n.date} ${n.title}: href ${n.href} が無い`);
for (let i = 1; i < news.length; i++) if (news[i].date > news[i - 1].date) ng(`日付が昇順になっている: ${news[i - 1].date} の次が ${news[i].date}`);
ok(`${news.length} 件`);

// 7 壊れやすい書き方
const astros = walk('src/pages', '.astro').concat(walk('src/components', '.astro'), walk('src/layouts', '.astro'));
sec('7 <style> 内のHTMLタグ・テンプレート内の < 比較・img の alt');
for (const f of astros) { const s = read(f); for (const m of s.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) { const bad = m[1].match(/^\s*<[a-zA-Z][^\n]*/m); if (bad) ng(`${f}: <style> 内にタグ ${bad[0].trim().slice(0, 60)}`); } }
for (const f of astros) { const s = read(f); const fm = s.indexOf('---', 3); const body = fm > 0 ? s.slice(fm + 3) : s; const tpl = body.split('<style')[0].replace(/<script[\s\S]*?<\/script>/g, ''); for (const m of tpl.matchAll(/\{[^{}]*?(<=|\s<\s)[^{}]*?\}/g)) ng(`${f}: テンプレート内の < 比較 ${m[0].slice(0, 70)}`); }
for (const f of astros) { const s = read(f); for (const m of s.matchAll(/<img\s[^>]*>/g)) { const t = m[0]; const alt = t.match(/alt="([^"]*)"/) || (/alt=\{/.test(t) ? ['', 'x'] : null); if (!alt) ng(`${f}: alt 属性なし ${t.slice(0, 60)}`); else if (alt[1] === '' && !/aria-hidden/.test(t)) warn(`${f}: alt が空 ${t.slice(0, 60)}`); } }
ok('チェック済み');

// 8 本文に出てはいけない語
sec('8 NaN・undefined・null');
let dirty = 0;
for (const h of htmls) { const t = strip(read(h)); for (const w of ['NaN', 'undefined', 'null', 'Infinity', '[object']) if (t.includes(w)) { ng(`${h}: 本文に「${w}」`); dirty++; } }
if (!dirty) ok('なし');

// 9 扉絵
sec('9 扉絵（大小の対・実在・hero-pos の登録）');
for (const f of astros) {
  if (f.endsWith('HeroFig.astro')) continue; // 使い方の説明に書いた例（xxx-large.webp）を拾わない
  const s = read(f);
  for (const m of s.matchAll(/src="(\/images\/icon\/([a-z0-9-]+)-large\.webp)"/g)) {
    if (!exists(`public${m[1]}`)) warn(`${f}: 扉絵 ${m[1]} が無い（題だけで出る）`);
    else if (!exists(`public/images/icon/${m[2]}-thumb.webp`)) warn(`${m[2]}: large はあるが thumb が無い`);
    if (!HERO_POS[m[2]]) warn(`${m[2]}: hero-pos.js に行が無い（既定の t で出る）`);
  }
}
const lecture = fs.readdirSync(path.join(ROOT, 'src/pages/how-to-read'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
const noArt = lecture.filter((s) => !exists(`public/images/icon/${s}-large.webp`));
out.push(`- 講義室 ${lecture.length} 本、扉絵なし ${noArt.length}${noArt.length ? '（' + noArt.join(', ') + '）' : ''}`);

// 10 検証室の決まり
sec('10 検証室（判定を一覧と description に出さない）');
const vIdx = read('dist/verify/index.html');
const words = ['本当', '半分本当', '数字では分からない'];
for (const c of CASES) {
  if (!distPage(`/verify/${c.id}/`)) { ng(`CASE ${c.id} のページが dist に無い`); continue; }
  const page = read(`dist/verify/${c.id}/index.html`);
  const desc = (page.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
  for (const w of words) if (desc.includes(w)) ng(`${c.id}: description に判定の語「${w}」が入っている`);
}
// 部屋の説明文には三段階の紹介として出てよい。見るのは案件の札（.vf-cases）の中だけ
const caseList = (vIdx.match(/<(?:ol|ul|div)[^>]*class="vf-cases"[\s\S]*?<\/(?:ol|ul|div)>/) || [''])[0];
for (const w of words) if (strip(caseList).includes(w)) ng(`検証室の案件の札に判定の語「${w}」が出ている`);
ok(`${CASES.length} 本`);

// 11 公開まわり
sec('11 canonical・og:url・sitemap');
let badHost = 0;
for (const h of htmls) {
  const s = read(h);
  for (const m of s.matchAll(/<(?:link rel="canonical" href|meta property="og:url" content)="([^"]+)"/g)) {
    if (!m[1].startsWith('https://statlogia.com')) { ng(`${h}: ${m[1]}`); badHost++; }
  }
}
if (!badHost) ok('canonical と og:url はすべて statlogia.com');
if (!exists('dist/sitemap-index.xml')) ng('sitemap-index.xml が dist に無い');
if (!exists('dist/robots.txt')) warn('robots.txt が dist に無い');

fs.writeFileSync(path.join(ROOT, 'audit-report.md'), `# Statlogia 点検（${new Date().toISOString().slice(0, 10)}）\n` + out.join('\n') + '\n');
console.log(out.join('\n'));
