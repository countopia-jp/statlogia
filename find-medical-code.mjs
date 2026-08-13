// =====================================================
// Countopia Stats - コード探索スクリプト
// find-medical-code.mjs
//
// 統計表0000020108のcat01（指標軸）から、医療・生活施設への
// 距離帯系カテゴリを探す。キーワード一致＋cat01全件を表示。
// 実行: node find-medical-code.mjs
// =====================================================

import { readFileSync } from 'node:fs';

function loadEnvFile() {
  try {
    const text = readFileSync('.env', 'utf-8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch (e) {}
}
loadEnvFile();

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error('ESTAT_APP_ID が設定されていません（.envを確認してください）');
  process.exit(1);
}

const STATS_ID = '0000020108';
const KEYWORDS = ['医療', '病院', '診療所', '医院', 'クリニック', '薬局', '商店', 'スーパー', '小売', '郵便', '銀行', '金融', '駅', '交通'];
const API_BASE = 'https://api.e-stat.go.jp/rest/3.0/app/json';

async function main() {
  const qs = new URLSearchParams({ appId: APP_ID, lang: 'J', statsDataId: STATS_ID });
  const res = await fetch(`${API_BASE}/getMetaInfo?${qs.toString()}`);
  const json = await res.json();
  const root = json.GET_META_INFO;
  if (!root || root.RESULT.STATUS !== 0) {
    console.error('メタ情報取得失敗:', root?.RESULT?.ERROR_MSG || '不明なエラー');
    process.exit(1);
  }

  const classObjs = Array.isArray(root.METADATA_INF.CLASS_INF.CLASS_OBJ)
    ? root.METADATA_INF.CLASS_INF.CLASS_OBJ
    : [root.METADATA_INF.CLASS_INF.CLASS_OBJ];

  const cat01 = classObjs.find((o) => o['@id'] === 'cat01');
  if (!cat01) {
    console.error('cat01（指標軸）が見つかりませんでした');
    process.exit(1);
  }

  const classes = Array.isArray(cat01.CLASS) ? cat01.CLASS : [cat01.CLASS];

  console.log(`=== 統計表 ${STATS_ID} の指標一覧（全${classes.length}件）===\n`);

  console.log('--- キーワードに一致する候補 ---');
  const matched = classes.filter((c) =>
    KEYWORDS.some((kw) => (c['@name'] || '').includes(kw))
  );
  if (matched.length === 0) {
    console.log('（キーワードに一致するものは見つかりませんでした）');
  } else {
    for (const c of matched) console.log(`${c['@code']}\t${c['@name']}`);
  }

  console.log('\n--- cat01 全件一覧 ---');
  for (const c of classes) console.log(`${c['@code']}\t${c['@name']}`);
}

main().catch((e) => {
  console.error('エラー:', e);
  process.exit(1);
});
