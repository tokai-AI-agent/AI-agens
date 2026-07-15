/**
 * アンカー方式パイプラインの統括。
 *
 * ① 条件からプロンプトを組み立てる（時刻HH:MMは一切渡さない）
 * ② LLMが時刻を含まない構成案JSONを出力する
 * ③ 構成検証（(c)順序・イベント配置）→ スケジューラが逆算で時刻割り当て → 検証(a)(b)
 * ④ 違反があれば、構成への制約（分数・順序のみ）をフィードバックして1回だけ差し戻す
 * ⑤ それでも違反が残れば打ち切り：アイテム削除で強制成立させ、通知を付けて返す
 * ⑥ 現行Markdown形式にレンダリングし、評価実験用ログを1レコード追記する
 */
import type { Agent } from '@mastra/core/agent';
import {
  itineraryDraftSchema,
  type ItineraryDraft,
  type PlanRequest,
} from '../schemas/plan';
import {
  assignTimes,
  forceFit,
  parseHHMM,
  validateDraftStructure,
  type ScheduleResult,
  type SchedulerConfig,
  type SchedulerDay,
  type Violation,
} from '../scheduler/timeline';
import {
  ABORT_NOTICE,
  extractRenderedEventStart,
  renderPlanMarkdown,
} from '../render/markdown';
import {
  appendExperimentLog,
  type ExperimentLogRecord,
  type RetryOutcome,
} from '../logging/experiment-log';

export const ANCHOR_ID = 'anchor-1';
const MODEL_NAME = 'gemini-3.1-flash-lite';

export type AnchoredPlanResponse = {
  markdown: string;
  aborted: boolean;
  notice: string | null;
  logRecord: ExperimentLogRecord;
  logFile: string;
};

function toSchedulerConfig(request: PlanRequest): SchedulerConfig {
  return {
    anchor: {
      name: request.anchor.name,
      startTime: request.anchor.startTime,
      durationMinutes: request.anchor.durationMinutes,
      dayIndex: request.anchor.dayIndex,
      venueAddress: request.anchor.venueAddress,
    },
    travel: request.travel,
    window: request.window,
  };
}

// LLMの構成案をスケジューラ入力に変換する。イベント判定はtype/anchorIdのどちらでも
// 拾う（LLMがどちらか一方しか付けない場合への防御）。
function draftToSchedulerDays(draft: ItineraryDraft): SchedulerDay[] {
  return draft.days.map(day => ({
    dayIndex: Math.round(day.dayIndex),
    items: day.items.map(item => {
      const isEvent = item.type === 'event' || item.anchorId === ANCHOR_ID;
      return {
        name: item.name,
        comment: item.comment,
        stayMinutes: Math.max(0, Math.round(item.stayMinutes)),
        isEvent,
        type: isEvent ? ('event' as const) : item.type === 'meal' ? ('meal' as const) : ('spot' as const),
        address: item.address,
        imageUrl: item.imageUrl,
      };
    }),
  }));
}

function formatPurposes(purposes: string[]): string {
  return purposes.length > 0 ? purposes.join('、') : 'おまかせ（特に希望なし）';
}

export function buildInitialPrompt(request: PlanRequest): string {
  const { conditions, anchor, travel, window, preEventSpotName, options } = request;

  const lines = [
    '以下の条件で旅行プランの「構成案」を作成してください。時刻（HH:MM）は書かないでください。',
    '',
    '## 旅行条件',
    `- 出発地点: ${conditions.departure}`,
    `- 行先: ${conditions.destination}`,
    `- 日程: ${conditions.schedule}`,
    `- 予算: ${conditions.budget}`,
    `- 人数: ${conditions.people}`,
    `- 目的: ${formatPurposes(conditions.purposes)}`,
    '',
    '## 固定イベント（必ず含める予定）',
    `- イベント名: ${anchor.name}`,
    `- 会場住所: ${anchor.venueAddress ?? '不明'}`,
    `- 開催日: ${anchor.dayIndex}日目`,
    `- 滞在時間: ${anchor.durationMinutes}分`,
    `- anchorId: "${ANCHOR_ID}"`,
    `このイベントは type:"event"、anchorId:"${ANCHOR_ID}" として${anchor.dayIndex}日目にちょうど1件だけ入れてください。`,
    '開始時刻はプログラム側が管理するため、あなたは時刻を扱いません。',
    '',
    '## 直前滞在の指定',
    `イベントの直前には必ず「${preEventSpotName}」に滞在する構成にし、`,
    `「${preEventSpotName}」とイベントの間に他の予定を入れないでください。`,
  ];

  if (options.maxItemsPerDay !== undefined) {
    // 実験条件：行程のボリュームを統制する（ベースライン相当のシンプルな行程を作らせる）
    lines.push(
      '',
      '## 行程のボリューム',
      `- 1日のアイテム数はイベントを含めて${options.maxItemsPerDay}件以内にしてください。`,
      '- 指定された直前滞在場所と固定イベントを優先し、それ以外の予定はこの上限の範囲でのみ入れてください。',
    );
  }

  if (options.giveBudgetHint) {
    // 実験条件ヒント：渡すのは分数のみ。時刻（HH:MM）はここにも絶対に入れない。
    const availableMinutes = parseHHMM(anchor.startTime) - parseHHMM(window.dayStart);
    lines.push(
      '',
      '## 時間の目安（分数）',
      `イベント当日は、1日の行動開始からイベント開始までに使える時間が合計${availableMinutes}分です。`,
      `この中には移動時間も含まれます（出発地点からの移動${travel.originLegMinutes}分※1日目のみ、` +
        `スポット間の移動 各${travel.defaultMinutes}分、イベント会場への移動${travel.toEventMinutes}分）。`,
      'イベントより前に置く予定の滞在時間（stayMinutes）の合計は、移動時間を差し引いた範囲に収めてください。',
    );
  }

  return lines.join('\n');
}

// 検証違反を「構成への制約」に変換する。時刻そのものは渡さず、分数と順序だけを伝える。
export function buildFeedback(violations: Violation[], request: PlanRequest): string[] {
  const feedback: string[] = [];
  for (const violation of violations) {
    switch (violation.check) {
      case 'a':
        feedback.push(
          `イベントより前に置く予定の滞在時間（stayMinutes）の合計を${violation.maxPreAnchorStayMinutes}分以内にしてください` +
            `（前回の構成は合計${violation.currentPreAnchorStayMinutes}分で、${violation.excessMinutes}分超過していました）。`,
        );
        break;
      case 'b': {
        const worst = Math.max(...violation.gaps.map(gap => gap.minutes));
        feedback.push(
          `予定と予定の間の空白が大きすぎます（最大${worst}分。許容は30分以内）。` +
            '空白が出ないよう、前後の予定の滞在時間（stayMinutes）を調整してください。',
        );
        break;
      }
      case 'c':
        if (violation.kind === 'intruder') {
          feedback.push(
            `「${request.preEventSpotName}」とイベント「${request.anchor.name}」の間に` +
              `他の予定（${violation.intruders.join('、')}）を入れないでください。`,
          );
        } else if (violation.kind === 'missing_pre_event_spot') {
          feedback.push(
            `イベント「${request.anchor.name}」の直前に「${request.preEventSpotName}」への滞在を必ず入れてください。`,
          );
        } else {
          feedback.push(
            `「${request.preEventSpotName}」はイベント「${request.anchor.name}」より前（直前）に配置してください。`,
          );
        }
        break;
      case 'structure':
        if (violation.kind === 'missing_event') {
          feedback.push(
            `固定イベント「${request.anchor.name}」を${request.anchor.dayIndex}日目に ` +
              `type:"event"、anchorId:"${ANCHOR_ID}" として必ず1件入れてください。`,
          );
        } else if (violation.kind === 'duplicate_event') {
          feedback.push('固定イベントは1件だけにしてください。');
        } else {
          feedback.push(`固定イベントは${request.anchor.dayIndex}日目にのみ入れてください。`);
        }
        break;
    }
  }
  return feedback;
}

export function buildRetryPrompt(
  initialPrompt: string,
  previousDraft: ItineraryDraft,
  violations: Violation[],
  request: PlanRequest,
): string {
  return [
    initialPrompt,
    '',
    '## やり直しの指示',
    '先ほど出力した構成案は、次の制約を満たしていませんでした。同じ旅行条件のまま構成案を作り直してください。',
    ...buildFeedback(violations, request).map(item => `- ${item}`),
    '',
    '## 前回の構成案（参考）',
    '```json',
    JSON.stringify(previousDraft, null, 2),
    '```',
  ].join('\n');
}

async function generateDraft(agent: Agent, prompt: string): Promise<ItineraryDraft> {
  // structuredOutputはツール（tavily-search）と併用できる構造化出力。
  // スキーマに時刻フィールドが存在しないため、LLMが時刻を出力する経路がない。
  const result = (await agent.generate(prompt, {
    structuredOutput: { schema: itineraryDraftSchema, errorStrategy: 'strict' },
    maxSteps: 12,
  })) as { object?: unknown };

  const parsed = itineraryDraftSchema.safeParse(result.object);
  if (!parsed.success) {
    throw new Error(`構成案のスキーマ検証に失敗しました: ${parsed.error.message}`);
  }
  return parsed.data;
}

type Evaluation = {
  days: SchedulerDay[];
  schedule: ScheduleResult;
  violations: Violation[];
};

function evaluateDraft(draft: ItineraryDraft, request: PlanRequest): Evaluation {
  const days = draftToSchedulerDays(draft);
  const structural = validateDraftStructure(days, {
    anchorName: request.anchor.name,
    anchorDayIndex: request.anchor.dayIndex,
    preEventSpotName: request.preEventSpotName,
  });
  const schedule = assignTimes(days, toSchedulerConfig(request));
  return { days, schedule, violations: [...structural, ...schedule.violations] };
}

export async function generateAnchoredPlan(
  agent: Agent,
  request: PlanRequest,
): Promise<AnchoredPlanResponse> {
  const config = toSchedulerConfig(request);
  const initialPrompt = buildInitialPrompt(request);

  const draft1 = await generateDraft(agent, initialPrompt);
  const eval1 = evaluateDraft(draft1, request);

  let finalDraft = draft1;
  let finalSchedule = eval1.schedule;
  let retryOutcome: RetryOutcome = 'first_pass';
  let violationsSecondAttempt: Violation[] | null = null;
  let removedItems: string[] = [];
  let insertedItems: string[] = [];
  let trimmedStay: ExperimentLogRecord['trimmedStay'] = null;
  let aborted = false;

  if (eval1.violations.length > 0) {
    // 差し戻し（1回のみ）。時刻は渡さず、構成への制約だけをフィードバックする。
    const retryPrompt = buildRetryPrompt(initialPrompt, draft1, eval1.violations, request);
    const draft2 = await generateDraft(agent, retryPrompt);
    const eval2 = evaluateDraft(draft2, request);
    violationsSecondAttempt = eval2.violations;
    finalDraft = draft2;

    if (eval2.violations.length === 0) {
      retryOutcome = 'retry_pass';
      finalSchedule = eval2.schedule;
    } else {
      // 打ち切り：収まらないアイテムを削除して強制成立させる
      aborted = true;
      retryOutcome = 'aborted';
      const fitted = forceFit(eval2.days, config, request.preEventSpotName);
      removedItems = fitted.removedItems;
      insertedItems = fitted.insertedItems;
      trimmedStay = fitted.trimmedStay;
      finalSchedule = assignTimes(fitted.days, config);
    }
  }

  const markdown = renderPlanMarkdown({
    conditions: request.conditions,
    travel: request.travel,
    overview: finalDraft.overview,
    days: finalSchedule.days,
    notes: finalDraft.notes ?? [],
    sources: finalDraft.sources ?? [],
    aborted,
  });

  // ログ項目②は最終Markdownを再パースして測定する（エンドツーエンドの確認）
  const renderedEventStart = extractRenderedEventStart(markdown, request.anchor.name);
  const eventTimePreserved =
    renderedEventStart !== null &&
    parseHHMM(renderedEventStart) === parseHHMM(request.anchor.startTime);

  const logRecord: ExperimentLogRecord = {
    timestamp: new Date().toISOString(),
    runId: request.runId,
    settingLabel: request.settingLabel,
    model: MODEL_NAME,
    system: 'anchored',
    giveBudgetHint: request.options.giveBudgetHint,
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
    departureTime: finalSchedule.departureTime,
    departureForEventTime: finalSchedule.departureForEventTime,
    arrivalAtEventTime: finalSchedule.arrivalAtEventTime,
    madeItToEvent: finalSchedule.madeItToEvent,
    givenEventStart: request.anchor.startTime,
    renderedEventStart,
    eventTimePreserved,
    gaps: finalSchedule.gaps,
    retryOutcome,
    violationsFirstAttempt: eval1.violations,
    violationsSecondAttempt,
    removedItems,
    insertedItems,
    trimmedStay,
    aborted,
  };

  const logFile = await appendExperimentLog(logRecord);

  return {
    markdown,
    aborted,
    notice: aborted ? ABORT_NOTICE : null,
    logRecord,
    logFile,
  };
}

/**
 * 生成が例外で失敗した場合でも実験の1試行を欠測にしないためのレコード。
 * ルートハンドラのcatch節から呼ばれる。
 */
export function buildErrorLogRecord(
  request: PlanRequest,
  error: unknown,
  system: 'anchored' | 'baseline' = 'anchored',
): ExperimentLogRecord {
  return {
    timestamp: new Date().toISOString(),
    runId: request.runId,
    settingLabel: request.settingLabel,
    model: MODEL_NAME,
    system,
    giveBudgetHint: request.options.giveBudgetHint,
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
    departureTime: null,
    departureForEventTime: null,
    arrivalAtEventTime: null,
    madeItToEvent: null,
    givenEventStart: request.anchor.startTime,
    renderedEventStart: null,
    eventTimePreserved: false,
    gaps: [],
    retryOutcome: 'error',
    violationsFirstAttempt: [],
    violationsSecondAttempt: null,
    removedItems: [],
    insertedItems: [],
    trimmedStay: null,
    aborted: false,
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}
