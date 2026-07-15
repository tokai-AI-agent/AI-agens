/**
 * 評価実験ランナー。
 * 設定ファイル（JSON）に並べた設定 × giveBudgetHintのon/off × 繰り返し回数で
 * POST /plan/anchored を順番に叩く。
 * 集計用データは1生成=1行のJSONLとしてサーバー側が追記する（このスクリプトは集計を持たない）。
 *
 * 使い方:
 *   npm run dev                                              # 別ターミナルでサーバーを起動しておく
 *   npm run experiment -- scripts/experiment-settings.example.json
 *   （または node scripts/run-experiment.ts <設定ファイル.json>）
 */
import { readFileSync } from 'node:fs';

type ExperimentSetting = {
  settingLabel: string;
  // /plan/anchored のリクエストボディ（options/runId/settingLabelはランナーが上書きする）
  request: Record<string, unknown>;
};

type ExperimentConfig = {
  baseUrl?: string; // 省略時 http://localhost:4111
  endpoint?: string; // 省略時 /plan/anchored（ベースライン測定は /plan/baseline を指定）
  repeat: number; // 各条件の繰り返し回数
  hintVariants?: boolean[]; // 省略時 [false, true]（giveBudgetHintのoff/on両方を回す）
  delayMs?: number; // リクエスト間隔（APIレート制限対策。省略時3000ms）
  maxAttemptsPerRun?: number; // 1試行あたりの最大送信回数（クォータエラー等の再試行。省略時3）
  retryDelayMs?: number; // 再試行前の待機時間（省略時60000ms）
  settings: ExperimentSetting[];
};

const configPath = process.argv[2];
if (!configPath) {
  console.error('使い方: node scripts/run-experiment.ts <設定ファイル.json>');
  process.exit(1);
}

// BOM付きUTF-8（PowerShellのSet-Content等が生成）でも読めるようにBOMを除去する
const config = JSON.parse(
  readFileSync(configPath, 'utf8').replace(/^﻿/, ''),
) as ExperimentConfig;
if (!Number.isInteger(config.repeat) || config.repeat < 1 || !Array.isArray(config.settings)) {
  console.error('設定ファイルには repeat（1以上の整数）と settings（配列）が必要です');
  process.exit(1);
}

const baseUrl = config.baseUrl ?? 'http://localhost:4111';
const endpoint = config.endpoint ?? '/plan/anchored';
const hintVariants = config.hintVariants ?? [false, true];
const delayMs = config.delayMs ?? 3000;
const maxAttemptsPerRun = config.maxAttemptsPerRun ?? 3;
const retryDelayMs = config.retryDelayMs ?? 60_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const outcomes: Record<string, number> = {};
let requestFailures = 0;
let logFile: string | undefined;

for (const setting of config.settings) {
  for (const hint of hintVariants) {
    for (let i = 1; i <= config.repeat; i++) {
      const runId = `${setting.settingLabel}_hint-${hint ? 'on' : 'off'}_${String(i).padStart(3, '0')}_${Date.now()}`;
      // 設定側のoptions（maxItemsPerDayなど）は残しつつ、giveBudgetHintだけを実験変数として上書きする
      const baseOptions =
        typeof setting.request.options === 'object' && setting.request.options !== null
          ? (setting.request.options as Record<string, unknown>)
          : {};
      const body = {
        ...setting.request,
        options: { ...baseOptions, giveBudgetHint: hint },
        runId,
        settingLabel: setting.settingLabel,
      };
      const label = `${setting.settingLabel} hint=${hint ? 'on' : 'off'} #${i}/${config.repeat}`;

      // クォータ超過などの一時的な失敗は、同一runIdのまま待って再送する。
      // 失敗のたびにサーバー側へerrorレコードが追記されるが、runIdが同じなので
      // 集計側（aggregate-log.ts）が最後のレコード＝最終結果だけを数える。
      for (let attempt = 1; attempt <= maxAttemptsPerRun; attempt++) {
        const attemptLabel = attempt > 1 ? `${label} (再試行${attempt}/${maxAttemptsPerRun})` : label;
        try {
          const res = await fetch(`${baseUrl}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            console.error(`[NG] ${attemptLabel}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
            if (attempt < maxAttemptsPerRun) {
              console.error(`     ${Math.round(retryDelayMs / 1000)}秒待って同一runIdで再試行します`);
              await sleep(retryDelayMs);
              continue;
            }
            // 最終試行も失敗：サーバー側の retryOutcome:'error' レコードが最終結果になる
            requestFailures += 1;
            outcomes.error = (outcomes.error ?? 0) + 1;
          } else {
            const data = (await res.json()) as {
              logRecord?: {
                retryOutcome?: string;
                madeItToEvent?: boolean | null;
                eventTimePreserved?: boolean;
              };
              logFile?: string;
            };
            const outcome = data.logRecord?.retryOutcome ?? 'unknown';
            outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
            logFile = data.logFile ?? logFile;
            console.log(
              `[OK] ${attemptLabel}: ${outcome} / madeIt=${data.logRecord?.madeItToEvent} / eventTimePreserved=${data.logRecord?.eventTimePreserved}`,
            );
          }
        } catch (error) {
          // fetch自体の失敗（サーバー未起動など）はサーバー側にレコードが残らない
          console.error(`[NG] ${attemptLabel}: リクエスト送信に失敗: ${String(error)}`);
          if (attempt < maxAttemptsPerRun) {
            await sleep(retryDelayMs);
            continue;
          }
          requestFailures += 1;
          console.error(`     全試行が失敗しました（この試行のレコードは欠落する可能性があります）`);
        }
        break;
      }

      await sleep(delayMs);
    }
  }
}

console.log('\n==== 実験完了 ====');
console.log('結果内訳:', outcomes);
if (logFile) console.log(`ログファイル: ${logFile}`);
if (requestFailures > 0) console.log(`リクエスト失敗: ${requestFailures}件（内容を確認してください）`);
