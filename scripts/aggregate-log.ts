/**
 * 実験ログ（JSONL）の集計。評価指標を giveBudgetHint の on/off 別に数える。
 * 集計指標:
 *   - イベントに間に合わなかった回数（madeItToEvent=false）
 *   - イベント開始時刻が改ざんされた回数（eventTimePreserved=false）
 *   - 予定間（DAY_START区間を除く）の空白が31分以上あった回数
 *   - 差し戻しの内訳（first_pass / retry_pass / aborted / error）
 *
 * 使い方: node scripts/aggregate-log.ts <ログファイル.jsonl> [settingLabel]
 *   settingLabelを指定すると、そのラベルのレコードだけを集計する。
 */
import { readFileSync } from 'node:fs';

type GapRecord = { day: number; from: string; to: string; minutes: number };

type LogRecord = {
  runId?: string;
  settingLabel?: string;
  giveBudgetHint: boolean;
  madeItToEvent: boolean | null;
  eventTimePreserved: boolean;
  gaps: GapRecord[];
  retryOutcome: string;
};

const path = process.argv[2];
if (!path) {
  console.error('使い方: node scripts/aggregate-log.ts <ログファイル.jsonl> [settingLabel]');
  process.exit(1);
}
const labelFilter = process.argv[3];

const parsed = readFileSync(path, 'utf8')
  .split('\n')
  .map(line => line.trim())
  .filter(Boolean)
  .map(line => JSON.parse(line) as LogRecord)
  .filter(record => !labelFilter || record.settingLabel === labelFilter);

// 同一runIdの複数レコードは、ランナーがクォータエラー等で同一試行を再送したもの。
// 1試行=1レコードとして数えるため、最後のレコード（最終結果）だけを残す。
const byRunId = new Map<string, LogRecord>();
const withoutRunId: LogRecord[] = [];
for (const record of parsed) {
  if (record.runId) {
    byRunId.set(record.runId, record);
  } else {
    withoutRunId.push(record);
  }
}
const records = [...byRunId.values(), ...withoutRunId];
const dedupedCount = parsed.length - records.length;

function summarize(subset: LogRecord[]) {
  const outcomes: Record<string, number> = {};
  let notMadeIt = 0;
  let madeItUnjudgeable = 0; // madeItToEvent=null（イベント行なし・滞在目安が読めない等）
  let tampered = 0;
  let bigInterItemGap = 0;
  const interItemGaps: number[] = [];

  for (const record of subset) {
    outcomes[record.retryOutcome] = (outcomes[record.retryOutcome] ?? 0) + 1;
    // エラー試行は成立したプランが存在しないため、プラン品質の指標からは除外する
    // （件数自体はoutcomesのerrorとして分母に見える）
    if (record.retryOutcome === 'error') continue;

    if (record.madeItToEvent === false) notMadeIt += 1;
    if (record.madeItToEvent === null) madeItUnjudgeable += 1;
    if (!record.eventTimePreserved) tampered += 1;

    const inter = (record.gaps ?? []).filter(gap => gap.from !== 'DAY_START');
    if (inter.some(gap => gap.minutes > 30)) bigInterItemGap += 1;
    for (const gap of inter) interItemGaps.push(gap.minutes);
  }

  return {
    n: subset.length,
    notMadeIt,
    madeItUnjudgeable,
    tampered,
    bigInterItemGap,
    outcomes,
    interItemGaps,
  };
}

for (const hint of [false, true]) {
  const subset = records.filter(record => record.giveBudgetHint === hint);
  const s = summarize(subset);
  console.log(`\n== giveBudgetHint: ${hint ? 'on' : 'off'} (n=${s.n}) ==`);
  console.log(`イベントに間に合わなかった回数 (madeItToEvent=false): ${s.notMadeIt}`);
  if (s.madeItUnjudgeable > 0) {
    console.log(`間に合い判定が不能だった回数 (madeItToEvent=null): ${s.madeItUnjudgeable}`);
  }
  console.log(`イベント開始時刻が改ざんされた回数 (eventTimePreserved=false): ${s.tampered}`);
  console.log(`予定間空白が31分以上あった回数: ${s.bigInterItemGap}`);
  console.log(`差し戻し内訳: ${JSON.stringify(s.outcomes)}`);
  if (s.interItemGaps.length > 0) {
    const max = Math.max(...s.interItemGaps);
    const min = Math.min(...s.interItemGaps);
    const nonZero = s.interItemGaps.filter(v => v !== 0).length;
    console.log(
      `予定間空白の分布: 区間数=${s.interItemGaps.length}, 0分以外=${nonZero}, 最小=${min}分, 最大=${max}分`,
    );
  }
}

console.log(
  `\n対象試行数: ${records.length}${labelFilter ? `（settingLabel=${labelFilter}）` : ''}` +
    (dedupedCount > 0 ? `（再試行による重複${dedupedCount}レコードは最終結果のみ採用）` : ''),
);
