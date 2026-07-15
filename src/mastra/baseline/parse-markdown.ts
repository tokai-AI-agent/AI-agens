/**
 * ベースライン（現行travelAgent）出力Markdownの自動判定。
 * LLMが時刻を自分で書くベースラインの出力から、アンカー方式と同じ指標
 * （間に合ったか・イベント時刻の改ざん・予定間の空白）を機械判定する。
 * LLM・I/Oを含まない純関数のみ（単体テストで判定ロジックの正しさを固定する）。
 *
 * 判定式（実験仕様の定義に従う）:
 * - 間に合ったか: LLMが書いた出発時刻 + 与えた移動時間(toEventMinutes) ≤ 与えたイベント開始時刻
 *   出発時刻は (1)イベント直前に明示的な移動行があればその時刻、
 *   (2)無ければ直前の予定の「開始時刻 + 滞在目安」
 * - 改ざん: 出力中のイベント行の時刻 ≠ 与えた固定値（イベント行が見つからない場合も false=保存されず）
 * - 空白: 次の予定の開始時刻 − (前の予定の開始 + 滞在目安 + 移動時間)。
 *   イベント直前の区間は与えた toEventMinutes、それ以外はLLM自身が書いた移動時間
 *   （無ければ与えた defaultMinutes）を使う。負の値は遅刻・重なりを意味する。
 *
 * 曖昧ケースの扱い（すべてベースラインに有利な方向に倒す）:
 * - 「約90分」「約1時間」→ 数値部分をそのまま使う（90 / 60）
 * - 「1時間30分」「1.5時間」→ 分に換算（90）
 * - 「60〜90分」のような範囲 → 小さい方（60）を採用
 * - 「電車30分＋徒歩5分」→ 分表記の合算（35）
 * - 滞在目安が読めない予定が絡む区間 → 空白の計算をスキップし、判定不能として記録
 *   （間に合い判定で直前予定の滞在が読めない場合は madeItToEvent: null）
 */
import { parseHHMM, formatHHMM, nameMatches, type GapRecord } from '../scheduler/timeline';

export type ParsedTimelineItem = {
  day: number;
  timeMinutes: number;
  timeText: string;
  title: string;
  isMoveLine: boolean;
  stayMinutes: number | null;
  travelMinutes: number | null; // LLM自身が書いた「移動」フィールド
  rawLine: string;
};

export type BaselineParseInfo = {
  timelineLineCount: number;
  eventLineFound: boolean;
  eventMatchedBy: 'name' | 'keyword' | null;
  departureSource: 'move-line' | 'prev-stay' | null;
  skippedGapJunctions: number; // 滞在目安が読めず空白を計算できなかった区間数
};

export type BaselineJudgeResult = {
  departureTime: string | null; // 1日目最初の行の時刻
  departureForEventTime: string | null;
  arrivalAtEventTime: string | null;
  madeItToEvent: boolean | null; // 判定不能（イベント行なし・滞在が読めない）はnull
  renderedEventStart: string | null;
  eventTimePreserved: boolean;
  gaps: GapRecord[];
  parseInfo: BaselineParseInfo;
};

// 「90分」「約1時間」「1時間30分」「1.5時間」「60〜90分」「電車30分＋徒歩5分」等を分に変換。
// 読めなければnull。範囲は小さい方（ベースラインに有利な解釈）。
export function parseDurationJp(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = text.trim();

  const minuteRange = s.match(/(\d+(?:\.\d+)?)\s*[〜~～-]\s*(\d+(?:\.\d+)?)\s*分/);
  if (minuteRange) return Math.round(Math.min(Number(minuteRange[1]), Number(minuteRange[2])));

  const hourRange = s.match(/(\d+(?:\.\d+)?)\s*[〜~～-]\s*(\d+(?:\.\d+)?)\s*時間/);
  if (hourRange) return Math.round(Math.min(Number(hourRange[1]), Number(hourRange[2])) * 60);

  const hours = s.match(/(\d+(?:\.\d+)?)\s*時間(?:\s*(\d+(?:\.\d+)?)\s*分)?/);
  if (hours) return Math.round(Number(hours[1]) * 60 + (hours[2] ? Number(hours[2]) : 0));

  const minuteMatches = [...s.matchAll(/(\d+(?:\.\d+)?)\s*分/g)];
  if (minuteMatches.length > 0) {
    return Math.round(minuteMatches.reduce((sum, m) => sum + Number(m[1]), 0));
  }

  const bare = s.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Math.round(Number(bare[1]));

  return null;
}

// 移動・出発・到着など「予定」ではない行の判定（フロントエンドのisNonSpotLineに準拠しつつ、
// 「◯◯へ移動」「会場へ向かう」も移動行として扱う）
function isMoveTitle(title: string): boolean {
  return (
    /(出発|到着|帰宅|帰路|解散|チェックイン|チェックアウト)/.test(title) ||
    /移動/.test(title) ||
    /向か(う|い)/.test(title)
  );
}

// 「 / 」区切りのメタ情報から指定フィールドの値を取り出す（例: 滞在目安、移動）
function extractField(segments: string[], fieldName: string): string | null {
  for (const segment of segments) {
    const match = segment.match(new RegExp(`^${fieldName}[：:]?\\s*(.*)$`));
    if (match) return match[1].trim() || null;
  }
  return null;
}

export function parseTimeline(markdown: string): ParsedTimelineItem[] {
  const lines = markdown
    .replace(/^```markdown\s*/im, '')
    .replace(/```\s*$/m, '')
    .split('\n');

  const items: ParsedTimelineItem[] = [];
  let currentDay = 1;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    const dayHeader = trimmed.match(/^#{2,4}\s*(\d+)\s*日目/);
    if (dayHeader) {
      currentDay = Number(dayHeader[1]);
      continue;
    }

    const timeline = trimmed.match(/^-\s*(\d{1,2}:\d{2})\s*[-−–]\s*(.+)$/);
    if (!timeline) continue;

    const timeText = timeline[1];
    let timeMinutes: number;
    try {
      timeMinutes = parseHHMM(timeText);
    } catch {
      continue; // 25:99 のような不正時刻の行はタイムラインとして扱わない
    }

    const segments = timeline[2].split(/\s*\/\s*/);
    const title = segments[0].split(/[:：]/)[0].trim();

    items.push({
      day: currentDay,
      timeMinutes,
      timeText,
      title,
      isMoveLine: isMoveTitle(title),
      stayMinutes: parseDurationJp(extractField(segments, '滞在目安')),
      travelMinutes: parseDurationJp(extractField(segments, '移動')),
      rawLine: trimmed,
    });
  }

  return items;
}

export type BaselineJudgeConfig = {
  anchor: { name: string; startTime: string; dayIndex: number };
  travel: { toEventMinutes: number; defaultMinutes: number };
  window: { dayStart: string };
  // イベント行の名前照合に失敗したときの補助キーワード（例: ["花火"]）。
  // nameMatchesを先に試し、だめならタイトルにキーワードを含む最初の予定行を採用する
  eventMatchKeywords?: string[];
};

export function judgeBaselineMarkdown(
  markdown: string,
  config: BaselineJudgeConfig,
): BaselineJudgeResult {
  const items = parseTimeline(markdown);
  const givenStartMin = parseHHMM(config.anchor.startTime);
  const dayStartMin = parseHHMM(config.window.dayStart);

  const parseInfo: BaselineParseInfo = {
    timelineLineCount: items.length,
    eventLineFound: false,
    eventMatchedBy: null,
    departureSource: null,
    skippedGapJunctions: 0,
  };

  // ---- イベント行の特定（移動行は除外。名前一致を優先し、キーワードは補助） ----
  const dayItems = items.filter(item => item.day === config.anchor.dayIndex);
  const candidates = dayItems.filter(item => !item.isMoveLine);
  let eventItem =
    candidates.find(item => nameMatches(item.title, config.anchor.name)) ?? null;
  if (eventItem) {
    parseInfo.eventMatchedBy = 'name';
  } else if (config.eventMatchKeywords && config.eventMatchKeywords.length > 0) {
    eventItem =
      candidates.find(item =>
        config.eventMatchKeywords!.some(keyword => item.title.includes(keyword)),
      ) ?? null;
    if (eventItem) parseInfo.eventMatchedBy = 'keyword';
  }
  parseInfo.eventLineFound = eventItem !== null;

  // ---- 改ざん判定（イベント行が無い場合は「保存されなかった」としてfalse） ----
  const renderedEventStart = eventItem ? eventItem.timeText : null;
  const eventTimePreserved =
    eventItem !== null && eventItem.timeMinutes === givenStartMin;

  // ---- 出発時刻と間に合い判定 ----
  let departureForEventMin: number | null = null;
  if (eventItem) {
    const k = dayItems.indexOf(eventItem);
    const prev = k > 0 ? dayItems[k - 1] : null;
    if (prev?.isMoveLine) {
      // イベント直前に明示的な移動行 → LLMが書いた出発時刻そのもの
      departureForEventMin = prev.timeMinutes;
      parseInfo.departureSource = 'move-line';
    } else if (prev && prev.stayMinutes !== null) {
      departureForEventMin = prev.timeMinutes + prev.stayMinutes;
      parseInfo.departureSource = 'prev-stay';
    }
    // prevが無い／滞在目安が読めない場合はnullのまま（判定不能）
  }

  const arrivalMin =
    departureForEventMin !== null
      ? departureForEventMin + config.travel.toEventMinutes
      : null;
  const madeItToEvent = arrivalMin !== null ? arrivalMin <= givenStartMin : null;

  // ---- 空白の計算（全日・全区間。予定＝移動行以外の行） ----
  const gaps: GapRecord[] = [];
  const days = [...new Set(items.map(item => item.day))].sort((a, b) => a - b);
  for (const day of days) {
    const inDay = items.filter(item => item.day === day);
    const activities = inDay.filter(item => !item.isMoveLine);
    if (inDay.length === 0) continue;

    // DAY_START→最初の行（移動行含む）。アンカー方式のログと同じく記録のみの区間
    gaps.push({
      day,
      from: 'DAY_START',
      to: inDay[0].title,
      minutes: inDay[0].timeMinutes - dayStartMin,
    });

    for (let i = 0; i < activities.length - 1; i++) {
      const current = activities[i];
      const next = activities[i + 1];

      // イベント直前の区間（最重要）は、間に合い判定と同じ「出発時刻＋与えた移動時間」で
      // 到着を求め、イベント行の時刻とのずれを空白とする。明示的な移動行がある場合、
      // 直前予定の終了〜移動行の間の待ちは前の場所での滞在延長とみなして数えない
      // （ベースラインに有利な解釈）。出発時刻が特定できないときだけスキップする
      if (eventItem !== null && next === eventItem) {
        if (departureForEventMin !== null) {
          gaps.push({
            day,
            from: current.title,
            to: next.title,
            minutes:
              next.timeMinutes - (departureForEventMin + config.travel.toEventMinutes),
          });
        } else {
          parseInfo.skippedGapJunctions += 1;
        }
        continue;
      }

      if (current.stayMinutes === null) {
        parseInfo.skippedGapJunctions += 1;
        continue; // 滞在目安が読めず終了時刻を出せない区間はスキップ（件数を記録）
      }

      // 移動時間: 間に挟まった移動行 → 次の予定の「移動」フィールド → 与えたデフォルト
      const movesBetween = inDay.filter(
        item =>
          item.isMoveLine &&
          item.timeMinutes >= current.timeMinutes &&
          item.timeMinutes <= next.timeMinutes,
      );
      const moveDuration = movesBetween
        .map(item => item.travelMinutes)
        .find(value => value !== null);
      const travel = moveDuration ?? next.travelMinutes ?? config.travel.defaultMinutes;

      gaps.push({
        day,
        from: current.title,
        to: next.title,
        minutes: next.timeMinutes - (current.timeMinutes + current.stayMinutes + travel),
      });
    }
  }

  const firstDayItems = items.filter(item => item.day === 1);

  return {
    departureTime: firstDayItems.length > 0 ? firstDayItems[0].timeText : null,
    departureForEventTime:
      departureForEventMin !== null ? formatHHMM(departureForEventMin) : null,
    arrivalAtEventTime: arrivalMin !== null ? formatHHMM(arrivalMin) : null,
    madeItToEvent,
    renderedEventStart,
    eventTimePreserved,
    gaps,
    parseInfo,
  };
}
