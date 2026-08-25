// =====================================================
// /muni-finance/（町の台所事情）の退役を適用するスクリプト
// scripts/apply-muni-finance-retire.mjs
//
//   使い方:  node scripts/apply-muni-finance-retire.mjs
//
//   コミットもプッシュもしない。適用後に git diff で目視してから
//   自分でコミットすること。
//
//   すべての置換は「アンカー文字列がちょうど1回あるか」を確認してから
//   実行する。1回でなければ、その時点で中断して何も書き換えない。
// =====================================================

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = execSync('git rev-parse --show-toplevel').toString().trim();
const p = (rel) => path.join(ROOT, rel);

const changes = [];
const log = [];

function fail(msg) {
  console.error('\n[中断] ' + msg);
  console.error('ファイルは1つも書き換えていません。');
  process.exit(1);
}

function read(rel) {
  const f = p(rel);
  if (!fs.existsSync(f)) fail(`${rel} が見つかりません。`);
  return fs.readFileSync(f, 'utf8');
}

function replaceOnce(text, oldStr, newStr, label) {
  const n = text.split(oldStr).length - 1;
  if (n !== 1) fail(`${label}：アンカーが ${n} 箇所で見つかりました（1箇所であるべき）。\n--- 探した文字列 ---\n${oldStr}`);
  log.push('  ' + label);
  return text.replace(oldStr, newStr);
}

function editEntry(text, key, oldStr, newStr, label) {
  const keyAnchor = `key: '${key}',`;
  const n = text.split(keyAnchor).length - 1;
  if (n !== 1) fail(`${label}：key '${key}' が ${n} 箇所で見つかりました（1箇所であるべき）。`);
  const at = text.indexOf(keyAnchor);
  const start = text.lastIndexOf('\n  {\n', at);
  const end = text.indexOf('\n  },\n', at);
  if (start < 0 || end < 0) fail(`${label}：key '${key}' のエントリ境界を特定できません。`);
  const block = text.slice(start, end);
  const m = block.split(oldStr).length - 1;
  if (m !== 1) fail(`${label}：'${key}' の中で置換対象が ${m} 箇所（1箇所であるべき）。`);
  log.push('  ' + label);
  return text.slice(0, start) + block.replace(oldStr, newStr) + text.slice(end);
}

// 1. src/pages/muni-finance/ の削除
const PAGE_DIR = p('src/pages/muni-finance');
if (!fs.existsSync(PAGE_DIR)) fail('src/pages/muni-finance/ が見つかりません。すでに適用済みの可能性があります。');
log.push('1. src/pages/muni-finance/ を削除');

// 2. public/_redirects
const REDIRECTS = p('public/_redirects');
const REDIRECT_LINE = '/muni-finance/ /town-finance/ 301\n';
let redirectsBody;
if (fs.existsSync(REDIRECTS)) {
  const cur = fs.readFileSync(REDIRECTS, 'utf8');
  if (cur.includes('/muni-finance/')) fail('public/_redirects にすでに /muni-finance/ の行があります。');
  redirectsBody = cur.endsWith('\n') ? cur + REDIRECT_LINE : cur + '\n' + REDIRECT_LINE;
  log.push('2. public/_redirects に1行追記');
} else {
  redirectsBody = REDIRECT_LINE;
  log.push('2. public/_redirects を新規作成');
}
changes.push(['public/_redirects', redirectsBody]);

// 3. 玄関の閲覧室カードを差し替え
let index = read('src/pages/index.astro');
index = replaceOnce(
  index,
  `        <a class="card" href="/muni-finance/">
          <h3>町の台所事情</h3>
          <p>財政力指数、実質収支比率、経常収支比率。あなたの町の「懐具合」を、数字でご覧ください。</p>
          <span class="c-place">閲覧室</span>
        </a>`,
  `        <a class="card" href="/town-finance/">
          <h3>わが町の財政と教育費</h3>
          <p>財政力指数と、住民ひとり当たりの教育費。あなたの町の「懐具合」と、子どもにかけているお金を、数字でご覧ください。</p>
          <span class="c-place">閲覧室</span>
        </a>`,
  '3. 玄関の閲覧室カードを /town-finance/ へ',
);
changes.push(['src/pages/index.astro', index]);

// 4-5. catalog.js
let catalog = read('src/data/catalog.js');

catalog = replaceOnce(
  catalog,
  '// ---------- D 財政（市区町村・町の台所事情） ----------',
  '// ---------- D 財政・教育費（市区町村・わが町の財政と教育費） ----------',
  '4-1. D体系の見出しコメントを修正',
);

catalog = editEntry(
  catalog,
  'fiscal-index-muni',
  `usedIn: ['/muni-finance/'],`,
  `usedIn: ['/town-finance/'],`,
  '4-2. fiscal-index-muni の usedIn を /town-finance/ へ',
);

for (const [key, label] of [
  ['real-balance-ratio', '実質収支比率'],
  ['current-balance-ratio', '経常収支比率'],
  ['real-debt-ratio', '実質公債費比率'],
  ['future-burden-ratio', '将来負担比率'],
  ['standard-fiscal-scale', '標準財政規模'],
]) {
  catalog = editEntry(
    catalog,
    key,
    `    status: 'published',\n    usedIn: ['/muni-finance/'],`,
    `    status: 'candidate',\n    usedIn: [],`,
    `4-3. ${label}（${key}）を candidate へ`,
  );
}

const NEW_ENTRIES = [
  ['education-cost-per-capita', '住民1人当たり教育費', 'D320310', '教育費'],
  ['primary-school-cost-per-capita', '1人当たり小学校費', 'D3203102', '小学校費'],
  ['junior-school-cost-per-capita', '1人当たり中学校費', 'D3203103', '中学校費'],
  ['high-school-cost-per-capita', '1人当たり高校費', 'D3203104', '高校費'],
]
  .map(([key, label, code, name]) =>
    `  {
    key: '${key}',
    label: '${label}',
    category: 'finance',
    system: 'D',
    scope: 'muni',
    statsDataId: { muni: '0000020104' },
    fetchMode: 'derived',
    deriveFrom: ['${code}', 'A1101'],
    deriveNote: '${code}（${name}・千円）×1000÷A1101（総人口）',
    unit: '円',
    direction: 'neutral',
    points: 12,
    status: 'published',
    usedIn: ['/town-finance/'],
  },
`)
  .join('');

catalog = replaceOnce(
  catalog,
  '  // ---------- L 家計・暮らし（展示系） ----------',
  NEW_ENTRIES + '\n  // ---------- L 家計・暮らし（展示系） ----------',
  '5. 教育費4指標を catalog に追加',
);
changes.push(['src/data/catalog.js', catalog]);

// 6. /sources/ の ROOM_NAMES から削除
let sources = read('src/pages/sources/index.astro');
sources = replaceOnce(
  sources,
  `  '/muni-finance/': '閲覧室　町の台所事情',\n`,
  '',
  '6. ROOM_NAMES から /muni-finance/ を削除',
);
changes.push(['src/pages/sources/index.astro', sources]);

// 7. news.js は記事を残し href だけ外す
let news = read('src/data/news.js');
news = replaceOnce(
  news,
  `    href: '/muni-finance/',\n`,
  '',
  '7. 瓦版の href を外す（記事は残す）',
);
changes.push(['src/data/news.js', news]);

// 全チェック通過。書き込む
fs.rmSync(PAGE_DIR, { recursive: true, force: true });
for (const [rel, body] of changes) fs.writeFileSync(p(rel), body, 'utf8');

console.log('\n適用しました：');
for (const l of log) console.log(l);

const rest = execSync(
  `cd ${JSON.stringify(ROOT)} && grep -rn "muni-finance" src public 2>/dev/null || true`,
).toString().trim();

console.log('\n--- 残っている muni-finance の参照 ---');
console.log(rest || '（なし）');
console.log('\n※ src/lib/muni-finance.js と public/_redirects は残って正しい。');