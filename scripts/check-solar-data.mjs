import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
const get = async (ep, p) => (await fetch(BASE+ep+'?'+new URLSearchParams({appId:env.ESTAT_APP_ID,...p}))).json();
const d = await get('getStatsData',{statsDataId:'0000010108',cdCat01:'H1101,H2281,H2280,H2282',metaGetFlg:'Y'});
const sd = d.GET_STATS_DATA.STATISTICAL_DATA;
const areaCls = [].concat(sd.CLASS_INF.CLASS_OBJ.find(o=>o['@id']==='area').CLASS);
const name = Object.fromEntries(areaCls.map(c=>[c['@code'],c['@name'].replace(/^\d+_/,'')]));
const byTime = {};
for (const v of [].concat(sd.DATA_INF.VALUE)) { ((byTime[v['@time']] ??= {})[v['@area']] ??= {})[v['@cat01']] = Number(v['$']); }
console.log('--- 時点ごとの揃い具合（県数） ---');
for (const t of Object.keys(byTime).sort()) {
  const a = byTime[t]; const cnt = (c)=>Object.keys(a).filter(k=>k!=='00000' && a[k][c]>0).length;
  console.log(t.slice(0,4), 'H1101', cnt('H1101'), 'H2281太陽光', cnt('H2281'), 'H2280太陽熱', cnt('H2280'), 'H2282二重サッシ', cnt('H2282'));
}
const latest = Object.keys(byTime).sort().reverse().find(t=>Object.keys(byTime[t]).filter(k=>k!=='00000'&&byTime[t][k].H2281>0).length>=47);
console.log('--- 採用時点', latest, '---');
const a = byTime[latest];
const rows = Object.entries(a).map(([c,o])=>({c,n:name[c]||c,solar:o.H2281/o.H1101*100,heat:(o.H2280||0)/o.H1101*100,sash:(o.H2282||0)/o.H1101*100}));
const nat = rows.find(r=>r.c==='00000');
console.log('全国', nat && `太陽光${nat.solar.toFixed(1)} 太陽熱${nat.heat.toFixed(1)} 二重サッシ${nat.sash.toFixed(1)}`);
const pref = rows.filter(r=>r.c!=='00000');
const show=(t,k)=>{console.log('\n--- '+t+' ---'); [...pref].sort((x,y)=>y[k]-x[k]).forEach((r,i)=>console.log(String(i+1).padStart(2),r.n.padEnd(5,'　'),r[k].toFixed(1)));};
show('太陽光発電機器のある住宅の割合','solar');
const prev = Object.keys(byTime).sort().reverse().filter(t=>t!==latest).find(t=>Object.keys(byTime[t]).filter(k=>k!=='00000'&&byTime[t][k].H2281>0).length>=47);
if (prev) { const p = byTime[prev]['00000']; console.log('\n前回', prev.slice(0,4), '全国', (p.H2281/p.H1101*100).toFixed(1)); }
