import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
const get = async (ep, p) => (await fetch(BASE+ep+'?'+new URLSearchParams({appId:env.ESTAT_APP_ID,...p}))).json();
const d = await get('getStatsData',{statsDataId:'0000010108',cdCat01:'H1101,H1401,H140101,H1402,H1403,H1404',cdTime:'2023100000',metaGetFlg:'Y'});
const sd = d.GET_STATS_DATA.STATISTICAL_DATA;
const areaCls = [].concat(sd.CLASS_INF.CLASS_OBJ.find(o=>o['@id']==='area').CLASS);
const name = Object.fromEntries(areaCls.map(c=>[c['@code'],c['@name'].replace(/^\d+_/,'')]));
const byArea = {};
for (const v of [].concat(sd.DATA_INF.VALUE)) { (byArea[v['@area']] ??= {})[v['@cat01']] = Number(v['$']); }
const rows = Object.entries(byArea).map(([code,o])=>({code,n:name[code]||code,
  total:o.H1101, detached:o.H1401/o.H1101*100, wood:o.H140101/o.H1401*100, apart:o.H1403/o.H1101*100, row:o.H1402/o.H1101*100,
  sumCheck:(o.H1401+o.H1402+o.H1403+(o.H1404||0))-o.H1101}));
const nat = rows.find(r=>r.code==='00000');
console.log('全国', nat && `一戸建${nat.detached.toFixed(1)} 木造${nat.wood.toFixed(1)} 共同${nat.apart.toFixed(1)} 長屋${nat.row.toFixed(1)} 検算差${nat.sumCheck}`);
const pref = rows.filter(r=>r.code!=='00000');
console.log('県数', pref.length, '検算差の最大', Math.max(...pref.map(r=>Math.abs(r.sumCheck))));
const show = (t,k)=>{console.log('\n--- '+t+' ---'); [...pref].sort((a,b)=>b[k]-a[k]).forEach((r,i)=>console.log(String(i+1).padStart(2),r.n.padEnd(5,'　'),r[k].toFixed(1)));};
show('一戸建率（居住世帯あり住宅に占める一戸建）','detached');
show('一戸建のうち木造の割合','wood');
