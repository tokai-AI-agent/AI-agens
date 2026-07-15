/**
 * アンカー方式スケジューラ。
 * LLM・I/O・外部依存を含まない純関数のみで構成する（単体テストで正しさを示すため）。
 *
 * 時刻の割り当て方針:
 * - アンカー（イベント）の開始時刻は入力値のまま固定し、決して再計算しない
 * - アンカーより前のアイテムは、アンカー開始時刻から所与の移動時間・滞在時間で逆算する
 *   （直前アイテムの終了 = アンカー開始 − 移動時間、開始 = 終了 − 滞在時間、以降同様に遡る）
 * - アンカーより後のアイテムは、アンカー終了時刻から順方向に詰める
 * - アンカーの無い日は、1日の行動開始時刻(dayStart)から順方向に詰める
 *
 * この方式ではアイテム間の空白は構成上0になるため、余り時間は
 * 「dayStart〜最初の予定」の空白として現れる。この区間はギャップログには記録するが、
 * 検証(b)の判定対象にはしない（ベースライン実験が朝の埋まり具合を評価対象外と
 * しているため、評価範囲を揃える。(b)の対象は予定と予定の間、特にイベント直前の
 * 早着による待ち時間のみ）。
 */

export type SchedulerItem = {
  name: string;
  comment: string;
  stayMinutes: number;
  isEvent: boolean;
  type: 'spot' | 'meal' | 'event';
  address?: string;
  imageUrl?: string;
};

export type SchedulerDay = {
  dayIndex: number;
  items: SchedulerItem[];
};

export type SchedulerConfig = {
  anchor: {
    name: string;
    startTime: string; // HH:MM（固定値）
    durationMinutes: number;
    dayIndex: number;
    venueAddress?: string;
  };
  travel: {
    originLegMinutes: number; // 出発地点→旅行先（1日目の先頭・最終日の帰路）
    defaultMinutes: number; // スポット間
    toEventMinutes: number; // イベント直前の区間
  };
  window: {
    dayStart: string; // HH:MM
    dayEnd: string; // HH:MM（現状の検証では未使用）
  };
};

export type ScheduledItem = {
  kind: 'move' | 'activity' | 'event';
  moveRole?: 'origin-departure' | 'return';
  name: string;
  comment: string;
  startMinutes: number;
  endMinutes: number;
  stayMinutes: number;
  travelFromPrevMinutes: number;
  address?: string;
  imageUrl?: string;
};

export type ScheduledDayResult = {
  dayIndex: number;
  items: ScheduledItem[];
};

// 空白の発生場所を必ず記録する（ベースラインとの性質の違いを集計で区別するため）。
// from='DAY_START' は「行動開始可能時刻〜最初の予定」の空白。
// minutesが負の値は遅刻量（アンカーに間に合わない量）を意味する。
export type GapRecord = {
  day: number;
  from: string;
  to: string;
  minutes: number;
};

export type Violation =
  | {
      check: 'a';
      message: string;
      maxPreAnchorStayMinutes: number;
      currentPreAnchorStayMinutes: number;
      excessMinutes: number;
    }
  | { check: 'b'; message: string; gaps: GapRecord[] }
  | {
      check: 'c';
      message: string;
      kind: 'intruder' | 'missing_pre_event_spot' | 'pre_event_spot_after_event';
      intruders: string[];
    }
  | {
      check: 'structure';
      message: string;
      kind: 'missing_event' | 'duplicate_event' | 'event_on_wrong_day';
    };

export type ScheduleResult = {
  days: ScheduledDayResult[];
  gaps: GapRecord[];
  violations: Violation[]; // (a)(b)のみ。(c)/structureはvalidateDraftStructureが返す
  departureTime: string | null; // 1日目に出発地点を出る時刻
  departureForEventTime: string | null; // イベントへ向けて直前の場所を出る時刻
  arrivalAtEventTime: string | null;
  madeItToEvent: boolean | null; // アンカー日が構成に無い場合はnull
  maxPreAnchorStayMinutes: number | null; // 差し戻しフィードバック用（逆算した滞在合計の上限）
  currentPreAnchorStayMinutes: number | null;
};

export const MAX_GAP_MINUTES = 30;

export function parseHHMM(value: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) throw new Error(`時刻の形式が不正です: ${value}`);
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) throw new Error(`時刻の値が範囲外です: ${value}`);
  return hours * 60 + minutes;
}

export function formatHHMM(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    throw new Error(`時刻としてフォーマットできない値です: ${totalMinutes}`);
  }
  // 深夜0時を超えた場合は「24:30」のような表記を許す（日またぎの丸め誤りを防ぐ）
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// 名前の照合。表記ゆれ（空白・括弧・中点など）を吸収し、双方向の部分一致で判定する。
// フロントエンドのisRelevantTitleと同じ考え方（2文字以上の一致のみ有効）。
// 旧字体の揺れ（慶應/慶応など）で検証(c)が誤判定しないよう、代表的な字も正規化する。
function normalizeName(value: string): string {
  return value.replace(/[\s（）()「」『』・、。,.\-]/g, '').replace(/應/g, '応');
}

export function nameMatches(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na.length < 2 || nb.length < 2) return na === nb;
  return na.includes(nb) || nb.includes(na);
}

// 各アイテムへ到着するための移動時間（所与のデータ）を位置から決める。
// 先頭は1日目のみ出発地からの移動、イベントは専用の移動時間、それ以外はデフォルト。
function travelLegsFor(items: SchedulerItem[], isFirstDay: boolean, config: SchedulerConfig): number[] {
  return items.map((item, i) => {
    if (item.isEvent) return config.travel.toEventMinutes;
    if (i === 0) return isFirstDay ? config.travel.originLegMinutes : 0;
    return config.travel.defaultMinutes;
  });
}

/**
 * 構成案の順序に関する検証（LLM出力だけで判定できるため、時刻割り当ての前に行う）。
 * - structure: 固定イベントがアンカー日にちょうど1件あるか
 * - (c): ユーザー指定の「直前に滞在する場所」がイベントの直前にあり、間に他の予定が無いか
 */
export function validateDraftStructure(
  days: SchedulerDay[],
  config: { anchorName: string; anchorDayIndex: number; preEventSpotName: string },
): Violation[] {
  const violations: Violation[] = [];

  for (const day of days) {
    if (day.dayIndex === config.anchorDayIndex) continue;
    if (day.items.some(item => item.isEvent)) {
      violations.push({
        check: 'structure',
        kind: 'event_on_wrong_day',
        message: `固定イベントは${config.anchorDayIndex}日目にのみ入れてください`,
      });
    }
  }

  const anchorDay = days.find(day => day.dayIndex === config.anchorDayIndex);
  if (!anchorDay) {
    violations.push({
      check: 'structure',
      kind: 'missing_event',
      message: `${config.anchorDayIndex}日目の構成が存在せず、固定イベントを配置できません`,
    });
    return violations;
  }

  const eventIndexes = anchorDay.items
    .map((item, index) => (item.isEvent ? index : -1))
    .filter(index => index >= 0);

  if (eventIndexes.length === 0) {
    violations.push({
      check: 'structure',
      kind: 'missing_event',
      message: `固定イベント「${config.anchorName}」が構成に含まれていません`,
    });
    return violations;
  }
  if (eventIndexes.length > 1) {
    violations.push({
      check: 'structure',
      kind: 'duplicate_event',
      message: '固定イベントが複数含まれています（1件だけにしてください）',
    });
  }

  const k = eventIndexes[0];
  const matchIndexes = anchorDay.items
    .map((item, index) => (!item.isEvent && nameMatches(item.name, config.preEventSpotName) ? index : -1))
    .filter(index => index >= 0);

  if (matchIndexes.length === 0) {
    violations.push({
      check: 'c',
      kind: 'missing_pre_event_spot',
      message: `指定された直前滞在場所「${config.preEventSpotName}」が構成に含まれていません`,
      intruders: [],
    });
    return violations;
  }

  if (matchIndexes.includes(k - 1)) return violations; // 直前に配置されている → OK

  const before = matchIndexes.filter(index => index < k);
  if (before.length > 0) {
    const p = Math.max(...before);
    const intruders = anchorDay.items.slice(p + 1, k).map(item => item.name);
    violations.push({
      check: 'c',
      kind: 'intruder',
      message: `「${config.preEventSpotName}」とイベントの間に他の予定が入っています`,
      intruders,
    });
  } else {
    violations.push({
      check: 'c',
      kind: 'pre_event_spot_after_event',
      message: `「${config.preEventSpotName}」がイベントより後に配置されています`,
      intruders: [],
    });
  }
  return violations;
}

/**
 * 時刻割り当て本体。検証(a)(b)もここで行う。
 *
 * 検証(a)＝「イベント開始時刻に間に合うか」は、逆算方式では
 * 「逆算した行動開始時刻がdayStartより前になる」という形で現れる。
 * その場合もアンカーは動かさず、アンカー前のブロックを不足分だけ後ろへずらして
 * 出力時刻を成立させる（イベント直前の区間に負の空白＝遅刻量が現れる）。
 */
export function assignTimes(days: SchedulerDay[], config: SchedulerConfig): ScheduleResult {
  const dayStartMin = parseHHMM(config.window.dayStart);
  const anchorStartMin = parseHHMM(config.anchor.startTime);

  const scheduledDays: ScheduledDayResult[] = [];
  const gaps: GapRecord[] = [];
  const violations: Violation[] = [];

  let departureTime: string | null = null;
  let departureForEventTime: string | null = null;
  let arrivalAtEventTime: string | null = null;
  let madeItToEvent: boolean | null = null;
  let maxPreAnchorStayMinutes: number | null = null;
  let currentPreAnchorStayMinutes: number | null = null;

  const sorted = [...days].sort((a, b) => a.dayIndex - b.dayIndex);
  const lastDayIndex = sorted.length > 0 ? sorted[sorted.length - 1].dayIndex : 0;

  for (const day of sorted) {
    const isFirstDay = day.dayIndex === 1;
    const items = day.items;
    if (items.length === 0) continue;

    const legs = travelLegsFor(items, isFirstDay, config);
    const startTimes = new Array<number>(items.length).fill(0);
    const endTimes = new Array<number>(items.length).fill(0);

    const eventIdx = items.findIndex(item => item.isEvent);
    const isAnchorDay = day.dayIndex === config.anchor.dayIndex && eventIdx >= 0;

    if (isAnchorDay) {
      const k = eventIdx;
      // アンカーは入力値のまま固定（このモジュール内で再計算する経路は存在しない）
      startTimes[k] = anchorStartMin;
      endTimes[k] = anchorStartMin + config.anchor.durationMinutes;

      // 逆算：アンカーより前
      for (let i = k - 1; i >= 0; i--) {
        endTimes[i] = startTimes[i + 1] - legs[i + 1];
        startTimes[i] = endTimes[i] - items[i].stayMinutes;
      }
      // 順方向：アンカーより後
      for (let i = k + 1; i < items.length; i++) {
        startTimes[i] = endTimes[i - 1] + legs[i];
        endTimes[i] = startTimes[i] + items[i].stayMinutes;
      }

      // 行動を開始しなければならない時刻（1日目は出発地点を出る時刻に相当）
      const requiredDayStart = startTimes[0] - legs[0];
      const deficit = dayStartMin - requiredDayStart; // 正なら足りない＝間に合わない

      const preStaySum = items.slice(0, k).reduce((sum, item) => sum + item.stayMinutes, 0);
      const preTravelSum = legs.slice(0, k + 1).reduce((sum, leg) => sum + leg, 0);
      // 差し戻しフィードバック用：イベント前の滞在合計に使える上限（逆算値）
      const budget = anchorStartMin - dayStartMin - preTravelSum;
      maxPreAnchorStayMinutes = Math.max(0, budget);
      currentPreAnchorStayMinutes = preStaySum;

      if (deficit > 0) {
        violations.push({
          check: 'a',
          message: `イベント開始に間に合いません（${deficit}分不足）`,
          maxPreAnchorStayMinutes: Math.max(0, budget),
          currentPreAnchorStayMinutes: preStaySum,
          excessMinutes: deficit,
        });
        // 出力時刻を負にしないため、アンカー前のブロックだけを後ろへずらす。
        // アンカーは固定のままなので、遅刻量がイベント直前の負の空白として残る。
        for (let i = 0; i < k; i++) {
          startTimes[i] += deficit;
          endTimes[i] += deficit;
        }
      }

      const departPoint = k > 0 ? endTimes[k - 1] : Math.max(requiredDayStart, dayStartMin);
      const arrival = departPoint + legs[k];
      departureForEventTime = formatHHMM(departPoint);
      arrivalAtEventTime = formatHHMM(arrival);
      madeItToEvent = arrival <= anchorStartMin;
    } else {
      // アンカーの無い日：dayStartから順方向に詰める（空白は構成上0）
      let cursor = dayStartMin;
      for (let i = 0; i < items.length; i++) {
        startTimes[i] = cursor + legs[i];
        endTimes[i] = startTimes[i] + items[i].stayMinutes;
        cursor = endTimes[i];
      }
    }

    // 空白の記録（全区間・0も含む）。DAY_START側の空白もここで拾う。
    const firstMoveStart = startTimes[0] - legs[0];
    gaps.push({
      day: day.dayIndex,
      from: 'DAY_START',
      to: items[0].name,
      minutes: firstMoveStart - dayStartMin,
    });
    for (let i = 0; i < items.length - 1; i++) {
      gaps.push({
        day: day.dayIndex,
        from: items[i].name,
        to: items[i + 1].name,
        minutes: startTimes[i + 1] - (endTimes[i] + legs[i + 1]),
      });
    }

    if (isFirstDay) {
      departureTime = formatHHMM(firstMoveStart);
    }

    // 出力アイテム列の構築（1日目の先頭に出発移動、最終日の末尾に帰路移動を合成）
    const dayItems: ScheduledItem[] = [];
    if (isFirstDay && legs[0] > 0) {
      dayItems.push({
        kind: 'move',
        moveRole: 'origin-departure',
        name: '',
        comment: '',
        startMinutes: firstMoveStart,
        endMinutes: startTimes[0],
        stayMinutes: 0,
        travelFromPrevMinutes: legs[0],
      });
    }
    items.forEach((item, i) => {
      dayItems.push({
        kind: item.isEvent ? 'event' : 'activity',
        name: item.name,
        comment: item.comment,
        startMinutes: startTimes[i],
        endMinutes: endTimes[i],
        stayMinutes: item.isEvent ? config.anchor.durationMinutes : item.stayMinutes,
        travelFromPrevMinutes: legs[i],
        address: item.address,
        imageUrl: item.imageUrl,
      });
    });
    if (day.dayIndex === lastDayIndex && config.travel.originLegMinutes > 0) {
      const lastEnd = endTimes[items.length - 1];
      dayItems.push({
        kind: 'move',
        moveRole: 'return',
        name: '',
        comment: '',
        startMinutes: lastEnd,
        endMinutes: lastEnd + config.travel.originLegMinutes,
        stayMinutes: 0,
        travelFromPrevMinutes: config.travel.originLegMinutes,
      });
    }

    scheduledDays.push({ dayIndex: day.dayIndex, items: dayItems });
  }

  // 検証(b)：31分以上の空白（0〜30分は許容）。負の空白は遅刻であり(a)で扱う。
  // DAY_START〜最初の予定の空白は判定から除外する（ベースラインと評価範囲を揃える。
  // ログのgapsには全区間を残しているため、集計時に区別して扱える）。
  const bigGaps = gaps.filter(gap => gap.from !== 'DAY_START' && gap.minutes > MAX_GAP_MINUTES);
  if (bigGaps.length > 0) {
    violations.push({
      check: 'b',
      message: `予定の間に${MAX_GAP_MINUTES}分を超える空白があります`,
      gaps: bigGaps,
    });
  }

  return {
    days: scheduledDays,
    gaps,
    violations,
    departureTime,
    departureForEventTime,
    arrivalAtEventTime,
    madeItToEvent,
    maxPreAnchorStayMinutes,
    currentPreAnchorStayMinutes,
  };
}

export type ForceFitResult = {
  days: SchedulerDay[];
  removedItems: string[];
  insertedItems: string[];
  trimmedStay: { name: string; fromMinutes: number; toMinutes: number } | null;
};

/**
 * 打ち切り時の強制成立処理。差し戻し後も検証を通らない構成を、
 * アイテムの削除（と最後の手段としての滞在短縮）で機械的に成立させる。
 * - structure違反：イベントを正しい日に1件だけにする（無ければ補完挿入）
 * - (c)違反：直前滞在場所とイベントの間のアイテムを削除（場所自体が無ければ補完挿入）
 * - (a)違反：アンカー前のアイテムを（直前滞在場所以外から）先頭から順に削除。
 *   それでも収まらなければ直前滞在場所の滞在を上限まで短縮する
 * - (b)違反：削除では埋まらないためここでは扱わない（通知付きでそのまま出力）
 */
export function forceFit(
  days: SchedulerDay[],
  config: SchedulerConfig,
  preEventSpotName: string,
): ForceFitResult {
  const result: SchedulerDay[] = days.map(day => ({
    dayIndex: day.dayIndex,
    items: day.items.map(item => ({ ...item })),
  }));
  const removedItems: string[] = [];
  const insertedItems: string[] = [];
  let trimmedStay: ForceFitResult['trimmedStay'] = null;

  // 1. アンカー日以外のイベントを削除
  for (const day of result) {
    if (day.dayIndex === config.anchor.dayIndex) continue;
    for (const item of day.items.filter(i => i.isEvent)) {
      removedItems.push(item.name);
    }
    day.items = day.items.filter(item => !item.isEvent);
  }

  // 2. アンカー日にイベントをちょうど1件にする
  let anchorDay = result.find(day => day.dayIndex === config.anchor.dayIndex);
  if (!anchorDay) {
    anchorDay = { dayIndex: config.anchor.dayIndex, items: [] };
    result.push(anchorDay);
    result.sort((a, b) => a.dayIndex - b.dayIndex);
  }
  const eventItems = anchorDay.items.filter(item => item.isEvent);
  if (eventItems.length === 0) {
    anchorDay.items.push({
      name: config.anchor.name,
      comment: '固定イベント（プログラムにより補完）',
      stayMinutes: config.anchor.durationMinutes,
      isEvent: true,
      type: 'event',
      address: config.anchor.venueAddress,
    });
    insertedItems.push(config.anchor.name);
  } else if (eventItems.length > 1) {
    let kept = false;
    anchorDay.items = anchorDay.items.filter(item => {
      if (!item.isEvent) return true;
      if (!kept) {
        kept = true;
        return true;
      }
      removedItems.push(item.name);
      return false;
    });
  }

  // 3. 直前滞在場所をイベントの直前に置く
  const eventIndex = () => anchorDay!.items.findIndex(item => item.isEvent);
  let k = eventIndex();
  let p = anchorDay.items.findIndex(
    item => !item.isEvent && nameMatches(item.name, preEventSpotName),
  );
  if (p < 0) {
    anchorDay.items.splice(k, 0, {
      name: preEventSpotName,
      comment: 'ユーザー指定の直前滞在場所（プログラムにより補完）',
      stayMinutes: 60,
      isEvent: false,
      type: 'spot',
    });
    insertedItems.push(preEventSpotName);
  } else if (p > k) {
    // イベントより後にある → イベント直前へ移動
    const [spot] = anchorDay.items.splice(p, 1);
    k = eventIndex();
    anchorDay.items.splice(k, 0, spot);
  } else if (p < k - 1) {
    // 間に挟まったアイテムを削除
    const intruders = anchorDay.items.slice(p + 1, k);
    for (const item of intruders) removedItems.push(item.name);
    anchorDay.items.splice(p + 1, k - (p + 1));
  }

  // 4. (a)の解消：滞在合計が逆算上限に収まるまで削除→最後は滞在短縮
  const isFirstDay = anchorDay.dayIndex === 1;
  const dayStartMin = parseHHMM(config.window.dayStart);
  const anchorStartMin = parseHHMM(config.anchor.startTime);

  const budgetAndStay = () => {
    const k2 = eventIndex();
    const legs = travelLegsFor(anchorDay!.items, isFirstDay, config);
    const preTravelSum = legs.slice(0, k2 + 1).reduce((sum, leg) => sum + leg, 0);
    const preStaySum = anchorDay!.items
      .slice(0, k2)
      .reduce((sum, item) => sum + item.stayMinutes, 0);
    return { k: k2, budget: anchorStartMin - dayStartMin - preTravelSum, staySum: preStaySum };
  };

  let state = budgetAndStay();
  while (state.staySum > state.budget) {
    const removableIndex = anchorDay.items.findIndex(
      (item, index) =>
        index < state.k && !item.isEvent && !nameMatches(item.name, preEventSpotName),
    );
    if (removableIndex >= 0) {
      removedItems.push(anchorDay.items[removableIndex].name);
      anchorDay.items.splice(removableIndex, 1);
      state = budgetAndStay();
      continue;
    }
    // 削除できるアイテムが残っていない → 直前滞在場所の滞在を上限まで短縮
    const spotIndex = anchorDay.items.findIndex(
      (item, index) => index < state.k && !item.isEvent,
    );
    if (spotIndex >= 0) {
      const spot = anchorDay.items[spotIndex];
      const newStay = Math.max(0, state.budget);
      if (newStay < spot.stayMinutes) {
        trimmedStay = { name: spot.name, fromMinutes: spot.stayMinutes, toMinutes: newStay };
        spot.stayMinutes = newStay;
      }
    }
    break; // budget自体が負（物理的に不可能な入力）の場合もここで打ち切る
  }

  return { days: result, removedItems, insertedItems, trimmedStay };
}
