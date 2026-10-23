// 数字の照合を手元で単独に流す（結果は scripts/out/verify-data.txt にも出す）
import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const { verifyAll } = await import('../src/lib/verify-data.js');
const t0 = Date.now();
const res = await verifyAll();
const lines = [
  `照合 ${res.checked} 件、食い違い ${res.errors.length} 件、表示年の値なし ${res.warnings.length} 件（${Math.round((Date.now() - t0) / 1000)}秒）`,
  '', `== 外した指標（揃っている時点がない）：${res.dropped.length}件`,
  ...(res.dropped.length
    ? res.dropped.map((d) => `✗ ${d.room}/${d.key}「${d.label}」… 値がそろう最大 ${d.best} 地域／必要 ${d.need}（順位対象 ${d.rankCount}、カバー率 ${Math.round((d.best / d.rankCount) * 100)}%）`)
    : ['○ なし']),
  '', '== 範囲ごと', ...res.sets.map((s) => `${s.errors ? '✗' : '○'} ${s.name}：${s.checked}件${s.errors ? `、食い違い${s.errors}` : ''}`),
  '', '== 食い違い', ...res.errors, '', '== 表示年の値なし', ...res.warnings,
];
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/verify-data.txt', import.meta.url), lines.join('\n'));
console.log(lines.slice(0, 200).join('\n')); // 窓口は約60あるので、60行だと一覧の末尾が毎回切れていた
if (res.dropped.length) console.log(`\n⚠ 外した指標が ${res.dropped.length} 件あります。意図したものなら窓口に minCoverage と注記を、そうでなければコードか分母を見直してください。`);
if (res.warnings.length > 0) console.log(`…表示年の値なしの全件は scripts/out/verify-data.txt に`);
process.exit(res.errors.length ? 1 : 0);
