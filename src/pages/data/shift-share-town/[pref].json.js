// /data/shift-share-town/<県コード>.json（市区町村のシフトシェア分析用。ビルド時に47ファイル出力）
import { getShiftShareTownPref } from '../../../lib/shift-share.js';
export function getStaticPaths() {
  return Array.from({ length: 47 }, (_, i) => ({ params: { pref: String(i + 1).padStart(2, '0') + '000' } }));
}
export async function GET({ params }) {
  const data = await getShiftShareTownPref(params.pref);
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}
