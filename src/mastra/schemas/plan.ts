import { z } from 'zod';

// HH:MM（24時間表記）。時刻はプログラム側だけが扱う値であり、
// LLMに渡すプロンプト・LLM出力スキーマには一切登場させない。
export const hhmmSchema = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'HH:MM形式で指定してください');

// アンカー＝プログラムが時刻を固定するイベント。startTimeはリクエストからスケジューラへ
// 直接渡り、LLMの入出力を経由しないため「勝手な書き換え」が構造上起こらない。
export const anchorSchema = z.object({
  name: z.string().min(1),
  venueAddress: z.string().optional(),
  startTime: hhmmSchema,
  durationMinutes: z.number().int().positive(),
  dayIndex: z.number().int().min(1).default(1),
});

// 所与の移動時間。評価実験では「LLMの推定」ではなく固定データとして与える
// （移動時間の推定誤差を排除し、逆算の正しさだけを測るため）。
export const travelTimesSchema = z.object({
  originLegMinutes: z.number().int().nonnegative(),
  defaultMinutes: z.number().int().nonnegative(),
  toEventMinutes: z.number().int().nonnegative(),
});

export const planRequestSchema = z.object({
  conditions: z.object({
    destination: z.string().min(1),
    departure: z.string().min(1),
    schedule: z.string().min(1),
    budget: z.string().default('指定なし'),
    people: z.string().default('指定なし'),
    purposes: z.array(z.string()).default([]),
  }),
  anchor: anchorSchema,
  // 検証(c)用：イベントの直前に滞在するとユーザーが指定した場所
  preEventSpotName: z.string().min(1),
  travel: travelTimesSchema,
  window: z
    .object({
      dayStart: hhmmSchema,
      dayEnd: hhmmSchema, // 現状の検証(a)(b)(c)では未使用。将来の拡張用に受け取っておく
    })
    .default({ dayStart: '09:00', dayEnd: '21:00' }),
  options: z
    .object({
      // 実験条件：イベント前に使える時間の目安（分数のみ・時刻は含まない）を
      // 初回プロンプトに入れるかどうか
      giveBudgetHint: z.boolean(),
      // 実験条件：1日あたりのアイテム数上限（イベント含む）。
      // ベースライン相当の「直前滞在場所→イベント」だけの行程には2を指定する。
      // 未指定ならエージェント既定（4〜7件）に任せる
      maxItemsPerDay: z.number().int().min(2).optional(),
    })
    .default({ giveBudgetHint: false }),
  // ベースライン自動判定用：イベント行の名前照合に失敗したときの補助キーワード
  // （例: ["花火"]。LLMがイベント名を言い換えた場合に拾う。アンカー方式では未使用）
  eventMatchKeywords: z.array(z.string()).optional(),
  // 実験集計用メタデータ。ログレコードにそのまま記録される
  runId: z.string().optional(),
  settingLabel: z.string().optional(),
});

export type PlanRequest = z.infer<typeof planRequestSchema>;

// ---- LLM出力（構成案）----
// 時刻(HH:MM)のフィールドを構文上持たないことがアンカー方式の要。
// stayMinutesは分数（数値）のみ。イベントはanchorIdのエコーだけを要求する。
export const draftItemSchema = z.object({
  type: z.enum(['spot', 'meal', 'event']),
  name: z.string(),
  comment: z.string(),
  stayMinutes: z.number(),
  address: z.string().optional(),
  imageUrl: z.string().optional(),
  anchorId: z.string().optional(),
});

export const itineraryDraftSchema = z.object({
  overview: z.object({
    theme: z.string(),
    comment: z.string(),
  }),
  days: z
    .array(
      z.object({
        dayIndex: z.number(),
        items: z.array(draftItemSchema).min(1),
      }),
    )
    .min(1),
  notes: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
});

export type ItineraryDraft = z.infer<typeof itineraryDraftSchema>;
export type DraftItem = z.infer<typeof draftItemSchema>;
