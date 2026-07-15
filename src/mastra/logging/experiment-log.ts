/**
 * 評価実験用ログ。1回の生成＝1レコードをJSONL（1行1JSON）で追記する。
 * 50回×複数設定の集計を手作業なしで行うためのものなので、
 * 生成が成功しても失敗しても必ず1レコード残すこと（エラー時は retryOutcome: 'error'）。
 *
 * 出力先: 環境変数 EXPERIMENT_LOG_PATH があればそのパス、
 *         無ければ <カレントディレクトリ>/logs/experiment-log.jsonl
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { GapRecord, Violation } from '../scheduler/timeline';

export type RetryOutcome = 'first_pass' | 'retry_pass' | 'aborted' | 'error';

export type ExperimentLogRecord = {
  timestamp: string;
  runId?: string;
  settingLabel?: string;
  model: string;
  // どちらの方式の生成か（anchored=アンカー方式 / baseline=現行travelAgent）。
  // 過去のレコードには無いフィールドのため省略可能にしている
  system?: 'anchored' | 'baseline';
  giveBudgetHint: boolean;
  conditions: { destination: string; departure: string; schedule: string };
  anchor: { name: string; givenStartTime: string; dayIndex: number; durationMinutes: number };
  preEventSpotName: string;
  travel: { originLegMinutes: number; defaultMinutes: number; toEventMinutes: number };
  window: { dayStart: string; dayEnd: string };

  // ① 最終的な出発時刻と、イベント開始時刻に間に合ったか
  departureTime: string | null;
  departureForEventTime: string | null;
  arrivalAtEventTime: string | null;
  madeItToEvent: boolean | null;

  // ② イベント開始時刻が与えた固定値のまま出力されているか（最終Markdownの再パースで測定）
  givenEventStart: string;
  renderedEventStart: string | null;
  eventTimePreserved: boolean;

  // ③ 各予定間の空白時間（分・全区間・発生場所付き。負の値は遅刻量）
  gaps: GapRecord[];

  // ④ 差し戻しの結果
  retryOutcome: RetryOutcome;

  violationsFirstAttempt: Violation[];
  violationsSecondAttempt: Violation[] | null;
  removedItems: string[];
  insertedItems: string[];
  trimmedStay: { name: string; fromMinutes: number; toMinutes: number } | null;
  aborted: boolean;
  errorMessage?: string;
  // ベースライン自動判定のパース診断情報（判定不能の内訳を後から確認するため）
  parseInfo?: Record<string, unknown>;
};

// mastra devはサーバーのcwdをsrc/mastra/publicにして動かすため、cwd直下に置くと
// ログがソースツリー内に落ちてしまう。package.jsonを持つ最も近い祖先ディレクトリ
// （＝プロジェクトルート）を探して、その直下のlogs/に置く。
// .mastra配下のビルド成果物ディレクトリはpackage.jsonを持っていてもルートとみなさない。
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, 'package.json')) && !dir.includes(`${sep}.mastra${sep}`) && !dir.endsWith(`${sep}.mastra`)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return startDir;
    dir = parent;
  }
}

export function resolveLogPath(): string {
  const fromEnv = process.env.EXPERIMENT_LOG_PATH;
  if (fromEnv) return isAbsolute(fromEnv) ? fromEnv : resolve(process.cwd(), fromEnv);
  return resolve(findProjectRoot(process.cwd()), 'logs', 'experiment-log.jsonl');
}

export async function appendExperimentLog(record: ExperimentLogRecord): Promise<string> {
  const filePath = resolveLogPath();
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  return filePath;
}
