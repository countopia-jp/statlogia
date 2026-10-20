// /data/pyramid-town/<県コード>.json（人口の形：その県の市区町村。ビルド時に47ファイル出力）
import { getPyramidTownPref } from '../../../lib/pyramid.js';
export function getStaticPaths() {
  return Array.from({ length: 47 }, (_, i) => ({ params: { pref: String(i + 1).padStart(2, '0') + '000' } }));
}
export async function GET({ params }) {
  const data = await getPyramidTownPref(params.pref);
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
