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
  '', '== 範囲ごと', ...res.sets.map((s) => `${s.errors ? '✗' : '○'} ${s.name}：${s.checked}件${s.errors ? `、食い違い${s.errors}` : ''}`),
  '', '== 食い違い', ...res.errors, '', '== 表示年の値なし', ...res.warnings,
];
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/verify-data.txt', import.meta.url), lines.join('\n'));
console.log(lines.slice(0, 60).join('\n'));
if (res.warnings.length > 0) console.log(`…表示年の値なしの全件は scripts/out/verify-data.txt に`);
process.exit(res.errors.length ? 1 : 0);
