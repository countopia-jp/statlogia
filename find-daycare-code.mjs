// =====================================================
// Countopia Stats - コード探索スクリプト
// find-daycare-code.mjs
//
// 統計表0000020108のメタ情報から、cat01（指標軸）のうち
// 指定キーワードを含むカテゴリ名とそのコードを一覧表示する。
// 実行: node find-daycare-code.mjs
// =====================================================

import { readFileSync } from 'node:fs';

// .env を自前で簡易パース（dotenvパッケージ不要）
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
  } catch (e) {
    // .env が無ければ何もしない（既に環境変数がセットされている場合もあるため）
  }
}
loadEnvFile();

const APP_ID = process.env.ESTAT_APP_ID;
if (!APP_ID) {
  console.error('ESTAT_APP_ID が設定されていません（.envを確認してください）');
  process.exit(1);
}

const STATS_ID = '0000020108';
const KEYWORDS = ['デイサービス', '老人', '介護', '福祉施設', '高齢者']; // 該当しそうなキーワードを複数用意

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
    for (const c of matched) {
      console.log(`${c['@code']}\t${c['@name']}`);
    }
  }

  console.log('\n--- 全件一覧（H29xx番台のみ抽出、距離帯系コードの可能性が高いもの）---');
  const h29 = classes.filter((c) => /^H29\d\d$/.test(c['@code']));
  for (const c of h29) {
    console.log(`${c['@code']}\t${c['@name']}`);
  }
}

main().catch((e) => {
  console.error('エラー:', e);
  process.exit(1);
});