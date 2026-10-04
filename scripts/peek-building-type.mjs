// 住宅の建て方（表0000010108）のcat01コード確認と試し取り
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,'')];}));
const APP = env.ESTAT_APP_ID;
const BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json/';
const TABLE = '0000010108';
const get = async (ep, p) => (await fetch(BASE+ep+'?'+new URLSearchParams({appId:APP,...p}))).json();

const meta = await get('getMetaInfo',{statsDataId:TABLE});
const objs = meta.GET_META_INFO.METADATA_INF.CLASS_INF.CLASS_OBJ;
const cat = [].concat(objs.find(o=>o['@id']==='cat01').CLASS);
const hit = cat.filter(c=>/一戸建|長屋|共同住宅|住宅数|住宅総数|居住世帯/.test(c['@name']));
console.log('--- 候補コード ---');
for (const c of hit) console.log(c['@code'], c['@name'], '[', c['@unit']||'', ']');

const codes = hit.map(c=>c['@code']).slice(0,12).join(',');
const d = await get('getStatsData',{statsDataId:TABLE,cdCat01:codes,cdArea:'00000,13000,27000,47000',metaGetFlg:'N'});
const vals = [].concat(d.GET_STATS_DATA.STATISTICAL_DATA.DATA_INF.VALUE);
const years = [...new Set(vals.map(v=>v['@time']))].sort();
console.log('--- 時点 ---', years.join(' '));
const last = years.at(-1);
console.log('--- 最新時点', last, '（全国/東京/大阪/沖縄）---');
for (const v of vals.filter(v=>v['@time']===last)) console.log(v['@cat01'], v['@area'], v['$']);
