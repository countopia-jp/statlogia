import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
const get = async (ep, p) => (await fetch(BASE+ep+'?'+new URLSearchParams({appId:env.ESTAT_APP_ID,lang:'J',...p}))).json();
const ID = '0003456573', TAB = '202110A09B08';
const meta = await get('getMetaInfo',{statsDataId:ID});
const objs = [].concat(meta.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ);
const cat03 = [].concat(objs.find(o=>o['@id']==='cat03').CLASS);
console.log('--- 趣味・娯楽の種類（cat03）---');
for (const c of cat03) console.log(c['@code'], c['@name']);
const pick = cat03.filter(c=>/カラオケ|楽器|邦楽|洋楽|演奏/.test(c['@name']));
for (const c of pick) {
  const d = await get('getStatsData',{statsDataId:ID,cdTab:TAB,cdCat01:'0',cdCat02:'99000',cdCat03:c['@code'],metaGetFlg:'Y',cntGetFlg:'N'});
  const sd = d.GET_STATS_DATA.STATISTICAL_DATA;
  const area = [].concat(sd.CLASS_INF.CLASS_OBJ.find(o=>o['@id']==='area').CLASS);
  const nm = Object.fromEntries(area.map(a=>[a['@code'],a['@name'].trim()]));
  const rows = [].concat(sd.DATA_INF.VALUE).filter(v=>v['@tab']===TAB).map(v=>({n:nm[v['@area']],v:Number(v['$'])})).filter(r=>Number.isFinite(r.v));
  const nat = rows.find(r=>r.n==='全国'); const pref = rows.filter(r=>r.n!=='全国').sort((a,b)=>b.v-a.v);
  console.log(`\n=== ${c['@code']} ${c['@name']}  全国 ${nat?.v}  県数 ${pref.length} ===`);
  pref.forEach((r,i)=>console.log(String(i+1).padStart(2), r.n.padEnd(5,'　'), r.v.toFixed(1)));
}
