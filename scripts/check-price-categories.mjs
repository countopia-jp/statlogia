import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
const get = async (ep, p) => (await fetch(BASE+ep+'?'+new URLSearchParams({appId:env.ESTAT_APP_ID,lang:'J',...p}))).json();
const ID = '0000010103';
const meta = await get('getMetaInfo',{statsDataId:ID});
const objs = [].concat(meta.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ);
const cat01 = [].concat(objs.find(o=>o['@id']==='cat01').CLASS);
const codes = cat01.filter(c=>/^C57\d\d/.test(c['@code']));
console.log('--- C57系の分類 ---');
for (const c of codes) console.log(c['@code'], c['@name'], c['@unit']||'');
const timeObj = objs.find(o=>o['@id']==='time');
console.log('\n--- 表全体の時点数 ---', [].concat(timeObj.CLASS).length);
const all = {};
for (const c of codes) {
  const d = await get('getStatsData',{statsDataId:ID,cdCat01:c['@code'],metaGetFlg:'N',cntGetFlg:'N'});
  const vals = [].concat(d.GET_STATS_DATA?.STATISTICAL_DATA?.DATA_INF?.VALUE || []);
  const byTime = {};
  for (const v of vals) { const n = Number(v['$']); if (!Number.isFinite(n)) continue; (byTime[v['@time']] ??= {})[v['@area']] = n; }
  const times = Object.keys(byTime).sort();
  const full = times.filter(t => Object.keys(byTime[t]).filter(a=>a!=='00000').length >= 47);
  console.log(`\n=== ${c['@code']} ${c['@name']} ===`);
  console.log('47県そろう年:', full.map(t=>t.slice(0,4)).join(' '));
  const last = full[full.length-1];
  if (last) {
    const rows = Object.entries(byTime[last]).filter(([a])=>a!=='00000').sort((x,y)=>y[1]-x[1]);
    console.log(`最新${last.slice(0,4)} 全国`, byTime[last]['00000'], '上位', rows.slice(0,3).map(([a,v])=>a+':'+v).join(' '), '下位', rows.slice(-3).map(([a,v])=>a+':'+v).join(' '));
  }
  all[c['@code']] = full.length;
}
console.log('\n--- 時点数まとめ ---', all);
