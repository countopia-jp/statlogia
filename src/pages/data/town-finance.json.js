import { getMuniFinanceData } from '../../lib/muni-finance.js';

export async function GET() {
  const data = await getMuniFinanceData();
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
