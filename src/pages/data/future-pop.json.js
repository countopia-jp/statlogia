// /data/future-pop.json（これからの人口の見込み：全国・都道府県・市区町村。ビルド時に出力）
import { getFuturePopData } from '../../lib/future-pop.js';
export async function GET() {
  const data = await getFuturePopData();
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
