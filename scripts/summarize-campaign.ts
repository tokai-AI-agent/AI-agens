/**
 * 全キャンペーン（易条件・H1・G1・G2）の最終集計。
 * 各ログファイルを横断し、設定×方式×ヒント別に評価指標をまとめて表示する。
 *
 * 使い方: node scripts/summarize-campaign.ts
 *
 * 集計ルール（aggregate-log.tsと同一）:
 * - 同一runIdの複数レコードは最終結果のみ採用（HTTPレベル再試行の重複排除）
 * - retryOutcome:'error' はインフラ障害の試行として有効試行から除外し、別列で数える
 * - 空白(b)判定はDAY_START区間を除く予定間のみ。負の空白は遅刻量
 */
import { readFileSync } from 'node:fs';

type GapRecord = { day: number; from: string; to: string; minutes: number };
type LogRecord = {
  runId?: string;
  settingLabel?: string;
  giveBudgetHint: boolean;
  madeItToEvent: boolean | null;
  eventTimePreserved: boolean;
  arrivalAtEventTime: string | null;
  givenEventStart: string;
  gaps: GapRecord[];
  retryOutcome: string;
};

type RowSpec = {
  name: string;
  file: string;
  label: string;
  hint: boolean | null; // nullなら両方まとめて（ベースライン用）
};

const ROWS: RowSpec[] = [
  { name: '易条件 baseline', file: 'logs/baseline-system-easy-50.jsonl', label: 'minatomirai-fireworks-baseline-system-easy', hint: null },
  { name: '易条件 anchored hint=off', file: 'logs/main-baseline-aligned-50x2-run2.jsonl', label: 'minatomirai-fireworks-baseline-aligned', hint: false },
  { name: '易条件 anchored hint=on', file: 'logs/main-baseline-aligned-50x2-run2.jsonl', label: 'minatomirai-fireworks-baseline-aligned', hint: true },
  { name: 'H1 baseline', file: 'logs/hard-h1.jsonl', label: 'h1-baseline', hint: null },
  { name: 'H1 anchored hint=off', file: 'logs/hard-h1.jsonl', label: 'h1-anchored', hint: false },
  { name: 'H1 anchored hint=on', file: 'logs/hard-h1.jsonl', label: 'h1-anchored', hint: true },
  { name: 'G1 baseline', file: 'logs/general-g1.jsonl', label: 'g1-baseline', hint: null },
  { name: 'G1 anchored hint=off', file: 'logs/general-g1.jsonl', label: 'g1-anchored', hint: false },
  { name: 'G2 baseline', file: 'logs/general-g2.jsonl', label: 'g2-baseline', hint: null },
  { name: 'G2 anchored hint=off', file: 'logs/general-g2.jsonl', label: 'g2-anchored', hint: false },
];

const toMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

function loadTrials(file: string, label: string, hint: boolean | null): LogRecord[] {
  const parsed = readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as LogRecord)
    .filter(r => r.settingLabel === label)
    .filter(r => hint === null || r.giveBudgetHint === hint);
  const byRunId = new Map<string, LogRecord>();
  const rest: LogRecord[] = [];
  for (const r of parsed) {
    if (r.runId) byRunId.set(r.runId, r);
    else rest.push(r);
  }
  return [...byRunId.values(), ...rest];
}

console.log(
  [
    '設定',
    '有効n',
    'infra_err',
    '間に合わず',
    '判定不能',
    '改ざん',
    '空白31分超',
    '最大遅刻',
    '空白非0区間/全区間',
    '空白最大',
    'first/retry/aborted',
  ].join('\t'),
);

for (const row of ROWS) {
  const trials = loadTrials(row.file, row.label, row.hint);
  const errors = trials.filter(r => r.retryOutcome === 'error');
  const valid = trials.filter(r => r.retryOutcome !== 'error');

  let notMadeIt = 0;
  let unjudgeable = 0;
  let tampered = 0;
  let bigGapRuns = 0;
  let maxLate = 0;
  const interGaps: number[] = [];
  const outcomes: Record<string, number> = {};

  for (const r of valid) {
    outcomes[r.retryOutcome] = (outcomes[r.retryOutcome] ?? 0) + 1;
    if (r.madeItToEvent === false) {
      notMadeIt += 1;
      if (r.arrivalAtEventTime) {
        maxLate = Math.max(maxLate, toMin(r.arrivalAtEventTime) - toMin(r.givenEventStart));
      }
    }
    if (r.madeItToEvent === null) unjudgeable += 1;
    if (!r.eventTimePreserved) tampered += 1;
    const inter = (r.gaps ?? []).filter(g => g.from !== 'DAY_START');
    if (inter.some(g => g.minutes > 30)) bigGapRuns += 1;
    for (const g of inter) interGaps.push(g.minutes);
  }

  const nonZero = interGaps.filter(v => v !== 0).length;
  const maxGap = interGaps.length > 0 ? Math.max(...interGaps) : 0;
  const oc = `${outcomes.first_pass ?? 0}/${outcomes.retry_pass ?? 0}/${outcomes.aborted ?? 0}`;

  console.log(
    [
      row.name,
      valid.length,
      errors.length,
      notMadeIt,
      unjudgeable,
      tampered,
      bigGapRuns,
      notMadeIt > 0 ? `+${maxLate}分` : '-',
      `${nonZero}/${interGaps.length}`,
      `${maxGap}分`,
      oc,
    ].join('\t'),
  );
}
