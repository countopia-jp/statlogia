import fs from 'node:fs';
for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}
const { ROOMS } = await import('../src/data/rooms/index.js');
const { getRoomData } = await import('../src/lib/room-engine.js');
const want = process.argv.slice(2);
const out = [];
for (const id of Object.keys(ROOMS)) {
  if (want.length && !want.includes(id)) continue;
  const t0 = Date.now();
  const d = await getRoomData(ROOMS[id]);
  out.push(`\n===== ${id}（${d.scope}）地域${d.areas.length}  ${((Date.now() - t0) / 1000).toFixed(1)}秒  JSON ${(JSON.stringify(d).length / 1024).toFixed(0)}KB =====`);
  for (const ind of d.indicators) {
    const L = ind.years.length - 1;
    const rows = d.areas.filter((a) => !a.x && a.v[ind.key][L] !== null).map((a) => [a.n, a.v[ind.key][L]]).sort((x, y) => y[1] - x[1]);
    const nat = d.national ? d.national[ind.key][L] : null;
    out.push(`- ${ind.key} ${ind.label} [${ind.unit}] 年:${ind.years[0]}〜${ind.years[L]}（${ind.years.length}時点, 最新=${ind.yearLabels[L]}） 値あり${rows.length}${d.national ? ` ${d.nationalIsAvg[ind.key] ? '平均' : '全国'}=${nat}` : ''}`);
    out.push(`    上位 ${rows.slice(0, 5).map(([n, v]) => n + ':' + v).join(' ')}`);
    out.push(`    下位 ${rows.slice(-5).map(([n, v]) => n + ':' + v).join(' ')}`);
  }
}
fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/try-rooms.txt', import.meta.url), out.join('\n'));
console.log(out.join('\n'));
