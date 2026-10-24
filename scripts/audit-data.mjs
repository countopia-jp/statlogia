// =====================================================
// Statlogia - 指標ごとの台帳と検算（手元で単独に流す）
// scripts/audit-data.mjs
//
//   node scripts/audit-data.mjs
//
// 照合（verify-data）は「出している値が e-Stat と合っているか」しか見ない。
// 単位の取り違え、分母の取り違え、そもそも出せていない指標は原理的に素通りする。
// ここは「何を、どの表のどのコードから、どの単位で、どの年ぶん出しているか」を
// 指標ごとに1行で並べ、機械で検算できるものは NG として挙げる。
//
// 出力： scripts/out/audit-data.txt （読む用）
//        scripts/out/audit-data.tsv （表計算で開く用。1行＝1指標）
// =====================================================
import fs from 'node:fs';

for (const line of fs.readFileSync(new URL('../.env', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
  if (m) process.env[m[1]] ??= m[2].replace(/^['"]|['"]$/g, '');
}

const { ROOMS } = await import('../src/data/rooms/index.js');
const { getRoomData, ledger } = await import('../src/lib/room-engine.js');

// e-Stat の単位は全角混じり（円／ｍ2、ｈａ…）。窓口側は半角で書くので、くらべる前にそろえる
const NORM = [[/／/g, '/'], [/ｍ2|m2|㎡/g, '㎡'], [/ｍ3|m3|㎥/g, '㎥'], [/ｈａ/g, 'ha'], [/ｋｍ/g, 'km'],
              [/ｃｍ/g, 'cm'], [/ｍｍ/g, 'mm'], [/ｋ㎡|km2|ｋｍ2/g, '㎢'], [/[‐－−]/g, '-'], [/\s/g, '']];
const normUnit = (u) => NORM.reduce((x, [re, to]) => x.replace(re, to), String(u || ''));

// 単位の変換表。ここに載っている組み合わせは scale の値まで検算する
const SCALE = {
  '千円|万円': 0.1, '万円|千円': 10, '円|万円': 0.0001, '万円|円': 10000,
  '千円|円': 1000, '円|千円': 0.001, '百万円|億円': 0.01, '億円|百万円': 100,
  '百万円|万円': 100, '千円|百万円': 0.001, '千円|億円': 0.00001,
  '人|千人': 0.001, '千人|人': 1000, '人|万人': 0.0001, '万人|人': 10000,
  'ha|㎢': 0.01, '㎢|ha': 100, '㎡|ha': 0.0001, 'ha|㎡': 10000,
};

const t0 = Date.now();
// 窓口を指定して流すこともできる（例：node scripts/audit-data.mjs town-tax pref-finance）。指定なしで全部
const want = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const ids = want.length ? want.filter((id) => ROOMS[id]) : Object.keys(ROOMS);
for (const w of want) if (!ROOMS[w]) console.warn(`[audit] そんな窓口はありません：${w}`);
let done = 0;
for (const id of ids) {
  try {
    await getRoomData(ROOMS[id]);
  } catch (e) {
    console.warn(`[audit] ${id}: ${e.message}`);
  }
  done++;
  if (done % 10 === 0) process.stderr.write(`  ${done}/${ids.length} 窓口\n`);
}

const ng = [];      // 直すべきもの
const look = [];    // 人の目で見るもの
const pct = (x) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const num = (x) => (x === null || x === undefined ? '—' : String(Math.round(x * 100) / 100));

// 窓口ごとの最新年（打ち切られた項目を見つけるため）
const latestByRoom = {};
for (const L of ledger) {
  if (L.dropped || !L.years.length) continue;
  const y = Number(L.years[L.years.length - 1]);
  latestByRoom[L.room] = Math.max(latestByRoom[L.room] ?? 0, y);
}

for (const L of ledger) {
  const who = `${L.room}/${L.key}「${L.label}」`;

  if (L.dropped) {
    ng.push(`✗ ${who} 出せていない … 値がそろう最大 ${L.have}／必要 ${L.need}（順位対象 ${L.rankCount}、カバー率 ${pct(L.coverage)}）`);
    continue;
  }

  // 1) 単位と scale（コード1つ・計算なしの指標だけ。割合や比は単位が変わって当然なので見ない）
  if (L.needs.length === 1 && !L.calcCustom) {
    const from = normUnit(L.estat[L.needs[0][1]].unit);
    const to = normUnit(L.unit);
    const key = `${from}|${to}`;
    if (from && to && from === to && L.scale !== 1) {
      ng.push(`✗ ${who} 単位の取り違え … e-Stat も窓口も「${to}」なのに scale=${L.scale}`);
    } else if (key in SCALE && L.scale !== SCALE[key]) {
      ng.push(`✗ ${who} scale が合わない … 「${from}」→「${to}」なら ${SCALE[key]} のはずが ${L.scale}`);
    } else if (from && to && from !== to && L.scale === 1) {
      // 「ｇ/人日」→「g」のように、ラベルに条件が入っていて単位を短く書いただけ、ということが多い。
      // 機械では区別できないので、誤りと決めつけずに並べるだけにする
      look.push(`・${who} 単位の書き方が違う … e-Stat は「${from}」、窓口は「${to}」（scale=1）`);
    }
  }

  // 2) カバー率と minCoverage
  if (L.minCoverage !== null && L.minCoverage < 0.8 && L.coverage >= 0.95) {
    look.push(`・${who} minCoverage=${L.minCoverage} を下げているが、実際は ${pct(L.coverage)} そろっている。下げる必要がないかも`);
  }
  // 値のない地域が1割を超えるなら、どこに無いのかが読む人に伝わっている必要がある。
  // 窓口ぜんたいの注記（room.notes）に書いてあることも多いので、そちらも見る。
  // 書いてあるかどうかの判定は言葉の当てずっぽうなので、見つかったときは「人の目」に回して現物を並べる
  if (L.coverage !== null && L.coverage < 0.9) {
    const all = [L.note, ...(L.roomNotes || [])].join(' ');
    const said = /値が(出ません|ありません|あり?ません)|表に出(ない|ません)|対象になら|公表の対象外|秘匿|伏せ/.test(all);
    if (!said) {
      const ex = (L.missing || []).slice(0, 5).join('・');
      ng.push(`✗ ${who} 注記なし … ${pct(L.coverage)} の地域にしか値がない（${L.have}／${L.rankCount}）。どこに無いのかを注記に書く。例：${ex}`);
    } else {
      look.push(`・${who} 値のない地域が ${100 - Math.round(L.coverage * 100)}%（${L.rankCount - L.have}／${L.rankCount}）。注記：${[L.note, ...(L.roomNotes || [])].filter((x) => /値が|表に出|対象|秘匿|伏せ/.test(x)).join(' ／ ')}`);
    }
  }

  // 3) 新しい年が表にあるのに使えていない（カバー率で落ちた＝§27 の型）。
  //    窓口のなかで年がそろわないこと自体は正常（5年ごとの調査と毎年の調査が同居するため）。
  const y = Number(L.years[L.years.length - 1]);
  // 値がひとつも無い年（e-Stat が枠だけ先に出していて中身が「-」）は、使えなくて当たり前なので挙げない
  if (L.newerUnused && L.newerUnused.have > 0) {
    const u = L.newerUnused;
    const who2 = u.missing.length <= 6 ? `（無いのは ${u.missing.join('・')}）` : `（${u.missing.length}地域に無い）`;
    look.push(`・${who} 新しい年がもう少しで使える … ${u.year}年は ${u.have}／${L.rankCount}（必要 ${L.need}）${who2}。いまは ${y}年まで`);
  }

  // 4) 全国の値の出どころ（県の窓口）
  if (L.scope === 'pref' && L.national !== null && L.lastMin !== null) {
    const outside = L.national < L.lastMin || L.national > L.lastMax;
    if (outside && !L.nationalIsTotal && !L.nationalIsAvg) {
      ng.push(`✗ ${who} 全国の値がおかしい … 全国 ${num(L.national)} が47県の幅 ${num(L.lastMin)}〜${num(L.lastMax)} の外なのに、合計とも平均とも判定されていない`);
    }
    if (L.nationalIsTotal && (L.unit === '％' || L.unit === '倍' || L.unit === '歳')) {
      ng.push(`✗ ${who} 全国の値がおかしい … 単位が「${L.unit}」なのに47県の合計として扱われている`);
    }
  }

  // 5) carry（分母だけ別の年を拾う項目）
  // 国勢調査は5年に一度なので、基準の年との4年差までは「いちばん近い回」として正常。
  // 5年以上離れている（＝一回ぶん飛ばしている）か、地域によって拾う年がばらけているときだけ挙げる
  for (const [code, ys] of Object.entries(L.carryYears || {})) {
    if (!ys.length) continue;
    const base = Number(L.years[L.years.length - 1]);
    const gapMax = Math.max(...ys.map((y) => base - Number(y)));
    if (ys.length > 1 || gapMax >= 5) {
      look.push(`・${who} 分母の年 … ${code} は ${ys.join('・')}年（この指標の年は ${base}年）。注記：${L.note || '（なし）'}`);
    }
  }
}

// 人の目で見る一覧
const eyes = ledger.filter((L) => !L.dropped).map((L) => {
  const src = L.needs.map(([t, c]) => `${t}/${c}「${L.estat[c].name}」${L.estat[c].unit ? `(${L.estat[c].unit})` : ''}`).join(' ＋ ');
  return `${L.room}/${L.key}\n    窓口：「${L.label}」${L.unit}${L.scale !== 1 ? ` ×${L.scale}` : ''}\n    e-Stat：${src}`;
});

const spread = Object.entries(latestByRoom).map(([r, latest]) => {
  const ys = ledger.filter((L) => L.room === r && !L.dropped && L.years.length).map((L) => Number(L.years[L.years.length - 1]));
  return { r, latest, oldest: Math.min(...ys) };
}).filter((x) => x.latest - x.oldest >= 5);

const dashRooms = [...new Set(ledger.filter((L) => L.dashAsZero).map((L) => L.room))];

const rows = [
  ['窓口', '範囲', 'key', 'ラベル', '表番号', 'コード', 'e-Statの項目名', 'e-Statの単位', '窓口の単位', 'scale', '小数', '年', 'カバー率', 'minCoverage', '全国の出どころ', '全国値', '最小', '最大', '注記'].join('\t'),
  ...ledger.map((L) => [
    L.room, L.scope === 'pref' ? '県' : '市区町村', L.key, L.label,
    L.needs.map(([t]) => t).join(' '), L.needs.map(([, c]) => c).join(' '),
    L.needs.map(([, c]) => L.estat[c].name).join(' ＋ '),
    L.needs.map(([, c]) => L.estat[c].unit).join(' '),
    L.unit, L.scale, L.decimals,
    L.dropped ? '（出していない）' : (L.years.length > 1 ? `${L.years[0]}〜${L.years[L.years.length - 1]}` : L.years[0]),
    pct(L.coverage), L.minCoverage ?? '', L.natFrom ?? '', num(L.national), num(L.lastMin), num(L.lastMax),
    (L.note || '').replace(/\s+/g, ' '),
  ].join('\t')),
];

const lines = [
  `台帳 ${ledger.length} 指標（${ids.length} 窓口、${Math.round((Date.now() - t0) / 1000)}秒）`,
  `  出している ${ledger.filter((L) => !L.dropped).length} ／ 出せていない ${ledger.filter((L) => L.dropped).length}`,
  '',
  `== 直すもの：${ng.length}件`,
  ...(ng.length ? ng : ['○ なし']),
  '',
  `== 人の目で見るもの：${look.length}件`,
  ...(look.length ? look : ['○ なし']),
  '',
  `== 窓口のなかで年の開きが5年以上：${spread.length}件（5年ごとの調査と毎年の調査が同居しているだけなら正常）`,
  ...(spread.length ? spread.map((x) => `・${x.r} … ${x.oldest}年〜${x.latest}年`) : ['○ なし']),
  '',
  `== 「-」をゼロとみなしている窓口：${dashRooms.length}件（ゼロでよい根拠を注記に書けているか）`,
  ...(dashRooms.length ? dashRooms.map((r) => `・${r}`) : ['○ なし']),
  '',
  '== 窓口のラベルと e-Stat の項目名（意味が合っているか。ここは機械では分からない）',
  ...eyes,
];

fs.mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('./out/audit-data.txt', import.meta.url), lines.join('\n'));
fs.writeFileSync(new URL('./out/audit-data.tsv', import.meta.url), rows.join('\n'));
console.log(lines.slice(0, 160).join('\n'));
console.log(`\n…全文は scripts/out/audit-data.txt、表は scripts/out/audit-data.tsv に`);
process.exit(ng.length ? 1 : 0);
