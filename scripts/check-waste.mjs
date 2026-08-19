process.env.ESTAT_APP_ID ||= (await import('node:fs')).default
  .readFileSync('.env', 'utf8').match(/ESTAT_APP_ID\s*=\s*(.+)/)[1].trim().replace(/^['"]|['"]$/g, '');
globalThis.import_meta_env = { ESTAT_APP_ID: process.env.ESTAT_APP_ID };

const src = (await import('node:fs')).default.readFileSync('src/lib/waste.js', 'utf8')
  .replace('import.meta.env.ESTAT_APP_ID', 'process.env.ESTAT_APP_ID');
(await import('node:fs')).default.writeFileSync('/tmp/waste-test.mjs', src);
const { getWasteData } = await import('/tmp/waste-test.mjs');

const d = await getWasteData();
console.log('年:', d.year, '全国:', d.national, d.unit);
console.log('1位:', d.rows[0].n, d.rows[0].minutes);
console.log('47位:', d.rows[46].n, d.rows[46].minutes);
console.log('県数:', d.rows.length);
console.log('リサイクル 全国:', d.recycle.national, '1位:', d.recycle.rows[0].n, d.recycle.rows[0].minutes);
console.log('相関:', d.corr.toFixed(3));
console.log('推移 最初:', d.trend[0], '最後:', d.trend[d.trend.length - 1]);
