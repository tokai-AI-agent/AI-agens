/**
 * ベースライン（現行travelAgent＝LLMが時刻も決める方式）の自動測定パイプライン。
 * アンカー方式(/plan/anchored)と同じリクエスト形式を受け取り、
 * 同じJSONL形式・同じ指標名でログを残す（同じ集計スクリプトで比較するため）。
 *
 * travelAgent自体には一切手を入れない（ベースライン＝現行システムそのまま）。
 * イベント開始時刻と移動時間はプロンプトで渡し（＝ベースラインの本来の姿）、
 * 出力Markdownをparse-markdown.tsで機械判定する。
 */
import type { Agent } from '@mastra/core/agent';
import type { PlanRequest } from '../schemas/plan';
import { judgeBaselineMarkdown } from './parse-markdown';
import {
  appendExperimentLog,
  type ExperimentLogRecord,
} from '../logging/experiment-log';

const MODEL_NAME = 'gemini-3.1-flash-lite';

export type BaselinePlanResponse = {
  markdown: string;
  aborted: false;
  notice: null;
  logRecord: ExperimentLogRecord;
  logFile: string;
};

function formatPurposes(purposes: string[]): string {
  return purposes.length > 0 ? purposes.join('、') : 'おまかせ（特に希望なし）';
}

/**
 * ベースライン用プロンプト。アンカー方式と違い、イベント開始時刻(HH:MM)と
 * 移動時間をそのままLLMに渡し、時刻の決定をすべてLLMに任せる（＝現行方式）。
 * 与える情報（イベント・直前滞在場所・移動時間・行動開始時刻）は
 * アンカー方式と同一にして、条件差が出ないようにする。
 */
export function buildBaselinePrompt(request: PlanRequest): string {
  const { conditions, anchor, travel, window: win, preEventSpotName } = request;
  return [
    '以下の条件に合う旅行プランを作成してください。',
    '',
    '## ユーザーの旅行条件',
    `- 出発地点: ${conditions.departure}`,
    `- 行先: ${conditions.destination}`,
    `- 日程: ${conditions.schedule}`,
    `- 予算: ${conditions.budget}`,
    `- 人数: ${conditions.people}`,
    `- 目的: ${formatPurposes(conditions.purposes)}`,
    '',
    '## 必ず守るべき予定（固定イベント）',
    `- ${anchor.dayIndex}日目に「${anchor.name}」（会場: ${anchor.venueAddress ?? '不明'}）が${anchor.startTime}に開始します。`,
    `- 開始時刻${anchor.startTime}は変更できません。プランにも開始時刻${anchor.startTime}のまま記載してください。`,
    `- イベントの滞在時間は${anchor.durationMinutes}分です。`,
    `- イベントの直前は「${preEventSpotName}」に滞在してください。「${preEventSpotName}」から会場までの移動時間は${travel.toEventMinutes}分です。`,
    `- この移動時間を必ず考慮し、イベント開始時刻に間に合うタイムラインにしてください。`,
    `- 「${preEventSpotName}」とイベントの間に他の予定を入れないでください。`,
    `- 1日の行動開始は${win.dayStart}以降にしてください。`,
    '',
    'プランはMarkdown形式で、モデルプランの各行は「- HH:MM - スポット名：一言コメント / 滞在目安：◯分 / 移動：◯分 / 住所：◯◯」の形式で書いてください。',
  ].join('\n');
}

export async function generateBaselinePlan(
  agent: Agent,
  request: PlanRequest,
): Promise<BaselinePlanResponse> {
  const prompt = buildBaselinePrompt(request);
  const result = (await agent.generate(prompt, { maxSteps: 12 })) as { text?: string };
  const markdown = result.text ?? '';
  if (!markdown.trim()) {
    throw new Error('ベースライン生成が空の出力を返しました');
  }

  const judge = judgeBaselineMarkdown(markdown, {
    anchor: {
      name: request.anchor.name,
      startTime: request.anchor.startTime,
      dayIndex: request.anchor.dayIndex,
    },
    travel: {
      toEventMinutes: request.travel.toEventMinutes,
      defaultMinutes: request.travel.defaultMinutes,
    },
    window: { dayStart: request.window.dayStart },
    eventMatchKeywords: request.eventMatchKeywords,
  });

  const logRecord: ExperimentLogRecord = {
    timestamp: new Date().toISOString(),
    runId: request.runId,
    settingLabel: request.settingLabel,
    model: MODEL_NAME,
    system: 'baseline',
    // ベースラインにヒント概念は無い。集計スクリプトのon/off分類上はすべてoff側に出る
    giveBudgetHint: false,
    conditions: {
      destination: request.conditions.destination,
      departure: request.conditions.departure,
      schedule: request.conditions.schedule,
    },
    anchor: {
      name: request.anchor.name,
      givenStartTime: request.anchor.startTime,
      dayIndex: request.anchor.dayIndex,
      durationMinutes: request.anchor.durationMinutes,
    },
    preEventSpotName: request.preEventSpotName,
    travel: request.travel,
    window: request.window,
    departureTime: judge.departureTime,
    departureForEventTime: judge.departureForEventTime,
    arrivalAtEventTime: judge.arrivalAtEventTime,
    madeItToEvent: judge.madeItToEvent,
    givenEventStart: request.anchor.startTime,
    renderedEventStart: judge.renderedEventStart,
    eventTimePreserved: judge.eventTimePreserved,
    gaps: judge.gaps,
    // ベースラインは単発生成（差し戻し機構なし）。成功した生成は一律first_pass
    retryOutcome: 'first_pass',
    violationsFirstAttempt: [],
    violationsSecondAttempt: null,
    removedItems: [],
    insertedItems: [],
    trimmedStay: null,
    aborted: false,
    parseInfo: judge.parseInfo,
  };

  const logFile = await appendExperimentLog(logRecord);

  return { markdown, aborted: false, notice: null, logRecord, logFile };
}
