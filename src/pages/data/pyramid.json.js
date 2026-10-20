// /data/pyramid.json（人口の形：全国と都道府県。ビルド時に出力）
import { getPyramidPrefs } from '../../lib/pyramid.js';
export async function GET() {
  const data = await getPyramidPrefs();
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
