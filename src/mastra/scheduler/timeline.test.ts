import { describe, it, expect } from 'vitest';
import {
  assignTimes,
  validateDraftStructure,
  forceFit,
  parseHHMM,
  formatHHMM,
  nameMatches,
  type SchedulerConfig,
  type SchedulerItem,
  type SchedulerDay,
} from './timeline';

// テスト共通設定：
// dayStart 09:00 (540) / アンカー 18:00 (1080) / 出発移動120分・スポット間15分・イベント直前30分
// → イベント前に使える時間 = 1080 - 540 = 540分、
//   3アイテム構成（スポット2＋イベント）の移動合計 = 120 + 15 + 30 = 165分、
//   滞在合計の上限（逆算値）= 540 - 165 = 375分
const config: SchedulerConfig = {
  anchor: {
    name: '祇園祭 宵山',
    startTime: '18:00',
    durationMinutes: 120,
    dayIndex: 1,
    venueAddress: '京都市下京区四条通',
  },
  travel: { originLegMinutes: 120, defaultMinutes: 15, toEventMinutes: 30 },
  window: { dayStart: '09:00', dayEnd: '21:00' },
};

const PRE_EVENT_SPOT = '錦市場';

function spot(name: string, stayMinutes: number): SchedulerItem {
  return { name, comment: 'テスト', stayMinutes, isEvent: false, type: 'spot' };
}

function eventItem(name = '祇園祭 宵山', stayMinutes = 0): SchedulerItem {
  return { name, comment: 'テスト', stayMinutes, isEvent: true, type: 'event' };
}

function day1(items: SchedulerItem[]): SchedulerDay[] {
  return [{ dayIndex: 1, items }];
}

describe('parseHHMM / formatHHMM', () => {
  it('HH:MMを分に変換し、分をHH:MMに戻せる', () => {
    expect(parseHHMM('09:05')).toBe(545);
    expect(parseHHMM('18:00')).toBe(1080);
    expect(formatHHMM(545)).toBe('09:05');
    expect(formatHHMM(1080)).toBe('18:00');
  });

  it('深夜0時を超える時刻は24時以降の表記にする（丸め誤りを防ぐ）', () => {
    expect(formatHHMM(1470)).toBe('24:30');
  });

  it('不正な形式・負の値はエラーにする', () => {
    expect(() => parseHHMM('9時')).toThrow();
    expect(() => parseHHMM('25:00')).toThrow();
    expect(() => formatHHMM(-10)).toThrow();
  });
});

describe('assignTimes: 逆算による時刻割り当て', () => {
  it('アンカーから逆算し、すべての予定が正しい時刻に置かれる（滞在合計＝上限ちょうど）', () => {
    // 滞在 270 + 105 = 375分 = 上限ちょうど → 出発は dayStart ぴったりになるはず
    const days = day1([spot('清水寺', 270), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = assignTimes(days, config);

    expect(result.violations).toEqual([]);

    // イベント: 18:00-20:00（固定値のまま）
    const items = result.days[0].items;
    const scheduledEvent = items.find(item => item.kind === 'event')!;
    expect(formatHHMM(scheduledEvent.startMinutes)).toBe('18:00');
    expect(formatHHMM(scheduledEvent.endMinutes)).toBe('20:00');

    // 錦市場: 18:00 - 30(移動) = 17:30終了、17:30 - 105(滞在) = 15:45開始
    const nishiki = items.find(item => item.name === PRE_EVENT_SPOT)!;
    expect(formatHHMM(nishiki.endMinutes)).toBe('17:30');
    expect(formatHHMM(nishiki.startMinutes)).toBe('15:45');

    // 清水寺: 15:45 - 15(移動) = 15:30終了、15:30 - 270(滞在) = 11:00開始
    const kiyomizu = items.find(item => item.name === '清水寺')!;
    expect(formatHHMM(kiyomizu.endMinutes)).toBe('15:30');
    expect(formatHHMM(kiyomizu.startMinutes)).toBe('11:00');

    // 出発 = 11:00 - 120(出発移動) = 09:00 = dayStartちょうど
    expect(result.departureTime).toBe('09:00');
    expect(result.departureForEventTime).toBe('17:30');
    expect(result.arrivalAtEventTime).toBe('18:00');
    expect(result.madeItToEvent).toBe(true);
    expect(result.maxPreAnchorStayMinutes).toBe(375);
    expect(result.currentPreAnchorStayMinutes).toBe(375);

    // 空白は全区間0
    expect(result.gaps.every(gap => gap.minutes === 0)).toBe(true);
  });

  it('1日目の先頭に出発移動、最終日の末尾に帰路移動が合成される', () => {
    const days = day1([spot('清水寺', 270), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = assignTimes(days, config);
    const items = result.days[0].items;

    const departureMove = items[0];
    expect(departureMove.kind).toBe('move');
    expect(departureMove.moveRole).toBe('origin-departure');
    expect(formatHHMM(departureMove.startMinutes)).toBe('09:00');
    expect(formatHHMM(departureMove.endMinutes)).toBe('11:00');

    const returnMove = items[items.length - 1];
    expect(returnMove.kind).toBe('move');
    expect(returnMove.moveRole).toBe('return');
    expect(formatHHMM(returnMove.startMinutes)).toBe('20:00'); // イベント終了直後
    expect(formatHHMM(returnMove.endMinutes)).toBe('22:00');
  });

  it('イベントの滞在時間はLLM出力ではなくアンカー設定値を使う', () => {
    // LLMがイベントのstayMinutesにでたらめな値を出しても無視される
    const days = day1([spot(PRE_EVENT_SPOT, 100), eventItem('祇園祭 宵山', 999)]);
    const result = assignTimes(days, config);
    const scheduledEvent = result.days[0].items.find(item => item.kind === 'event')!;
    expect(scheduledEvent.endMinutes - scheduledEvent.startMinutes).toBe(120);
  });

  it('検証(a): 滞在合計が上限を超えると違反になり、遅刻量が負の空白として記録される', () => {
    // 滞在 400 + 105 = 505分 > 上限375分 → 130分不足
    const days = day1([spot('清水寺', 400), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = assignTimes(days, config);

    const violationA = result.violations.find(v => v.check === 'a');
    expect(violationA).toBeDefined();
    if (violationA?.check === 'a') {
      expect(violationA.excessMinutes).toBe(130);
      expect(violationA.maxPreAnchorStayMinutes).toBe(375);
      expect(violationA.currentPreAnchorStayMinutes).toBe(505);
    }

    // アンカーは動かない
    const scheduledEvent = result.days[0].items.find(item => item.kind === 'event')!;
    expect(formatHHMM(scheduledEvent.startMinutes)).toBe('18:00');

    // ブロックはdayStartまで後ろへずれ、遅刻130分が負の空白としてイベント直前に現れる
    expect(result.departureTime).toBe('09:00');
    expect(result.arrivalAtEventTime).toBe('20:10');
    expect(result.madeItToEvent).toBe(false);
    const gapIntoEvent = result.gaps.find(gap => gap.to === '祇園祭 宵山');
    expect(gapIntoEvent?.minutes).toBe(-130);
  });

  it('検証(b): DAY_START側の空白は違反にしない（ログには場所付きで記録する）', () => {
    // 滞在 60 + 60 = 120分 → 空白 375 - 120 = 255分がDAY_START側に現れるが、
    // ベースラインが朝の埋まり具合を評価しないため(b)の判定対象外（記録のみ）
    const days = day1([spot('清水寺', 60), spot(PRE_EVENT_SPOT, 60), eventItem()]);
    const result = assignTimes(days, config);

    expect(result.violations).toEqual([]);
    const dayStartGap = result.gaps.find(gap => gap.from === 'DAY_START');
    expect(dayStartGap?.minutes).toBe(255);
    // 間に合ってはいる
    expect(result.madeItToEvent).toBe(true);
  });

  it('検証(b): 逆算方式では予定間の空白は構成上0になり、違反は発生しない', () => {
    // アンカー方式の主張そのもの：イベント直前の早着待ち（予定間の空白）は
    // 逆算により構造的に0になる。全区間の空白が0であることを確認する。
    const days = day1([spot('清水寺', 60), spot(PRE_EVENT_SPOT, 60), eventItem()]);
    const result = assignTimes(days, config);
    const interItemGaps = result.gaps.filter(gap => gap.from !== 'DAY_START');
    expect(interItemGaps.every(gap => gap.minutes === 0)).toBe(true);
    expect(result.violations.some(v => v.check === 'b')).toBe(false);
  });

  it('空白は0〜30分なら許容される', () => {
    // 滞在 250 + 105 = 355分 → 空白 375 - 355 = 20分 → 違反なし
    const days = day1([spot('清水寺', 250), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = assignTimes(days, config);
    expect(result.violations).toEqual([]);
    const dayStartGap = result.gaps.find(gap => gap.from === 'DAY_START');
    expect(dayStartGap?.minutes).toBe(20);
  });

  it('空白レコードは全区間分を(0も含めて)場所付きで記録する', () => {
    const days = day1([spot('清水寺', 270), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = assignTimes(days, config);
    // 3アイテム → DAY_START側1件 + アイテム間2件 = 3件
    expect(result.gaps).toHaveLength(3);
    expect(result.gaps.map(gap => `${gap.from}->${gap.to}`)).toEqual([
      'DAY_START->清水寺',
      `清水寺->${PRE_EVENT_SPOT}`,
      `${PRE_EVENT_SPOT}->祇園祭 宵山`,
    ]);
  });

  it('アンカーの無い日はdayStartから順方向に詰める', () => {
    const days: SchedulerDay[] = [
      { dayIndex: 1, items: [spot(PRE_EVENT_SPOT, 100), eventItem()] },
      { dayIndex: 2, items: [spot('嵐山', 60), spot('金閣寺', 90)] },
    ];
    const result = assignTimes(days, config);
    const day2 = result.days.find(day => day.dayIndex === 2)!;

    // 2日目先頭は移動0（宿泊地から）で09:00開始
    const arashiyama = day2.items.find(item => item.name === '嵐山')!;
    expect(formatHHMM(arashiyama.startMinutes)).toBe('09:00');
    expect(formatHHMM(arashiyama.endMinutes)).toBe('10:00');
    const kinkaku = day2.items.find(item => item.name === '金閣寺')!;
    expect(formatHHMM(kinkaku.startMinutes)).toBe('10:15'); // 10:00 + 移動15分
    expect(formatHHMM(kinkaku.endMinutes)).toBe('11:45');

    // 帰路移動は最終日（2日目）の末尾のみ
    expect(day2.items[day2.items.length - 1].moveRole).toBe('return');
    const day1Result = result.days.find(day => day.dayIndex === 1)!;
    expect(day1Result.items.some(item => item.moveRole === 'return')).toBe(false);
  });
});

describe('validateDraftStructure: 検証(c)と構成チェック', () => {
  const vconfig = {
    anchorName: '祇園祭 宵山',
    anchorDayIndex: 1,
    preEventSpotName: PRE_EVENT_SPOT,
  };

  it('直前滞在場所がイベントの直前にあれば違反なし', () => {
    const days = day1([spot('清水寺', 100), spot(PRE_EVENT_SPOT, 100), eventItem()]);
    expect(validateDraftStructure(days, vconfig)).toEqual([]);
  });

  it('表記ゆれ（部分一致）でも直前滞在場所と認識する', () => {
    const days = day1([spot('錦市場で食べ歩き', 100), eventItem()]);
    expect(validateDraftStructure(days, vconfig)).toEqual([]);
    expect(nameMatches('錦市場で食べ歩き', PRE_EVENT_SPOT)).toBe(true);
  });

  it('旧字体の揺れ（慶應/慶応）でも直前滞在場所と認識する', () => {
    expect(nameMatches('慶應義塾大学日吉キャンパス', '慶応義塾大学日吉キャンパス')).toBe(true);
    expect(nameMatches('慶應義塾大学 日吉キャンパス', '日吉キャンパス')).toBe(true);
  });

  it('検証(c): 直前滞在場所とイベントの間に別の予定が入ると違反', () => {
    const days = day1([spot(PRE_EVENT_SPOT, 100), spot('八坂神社', 60), eventItem()]);
    const violations = validateDraftStructure(days, vconfig);
    expect(violations).toHaveLength(1);
    expect(violations[0].check).toBe('c');
    if (violations[0].check === 'c') {
      expect(violations[0].kind).toBe('intruder');
      expect(violations[0].intruders).toEqual(['八坂神社']);
    }
  });

  it('検証(c): 直前滞在場所が構成に無いと違反', () => {
    const days = day1([spot('清水寺', 100), eventItem()]);
    const violations = validateDraftStructure(days, vconfig);
    expect(violations[0].check).toBe('c');
    if (violations[0].check === 'c') expect(violations[0].kind).toBe('missing_pre_event_spot');
  });

  it('検証(c): 直前滞在場所がイベントより後にあると違反', () => {
    const days = day1([spot('清水寺', 100), eventItem(), spot(PRE_EVENT_SPOT, 60)]);
    const violations = validateDraftStructure(days, vconfig);
    expect(violations[0].check).toBe('c');
    if (violations[0].check === 'c') expect(violations[0].kind).toBe('pre_event_spot_after_event');
  });

  it('イベントが構成に無いと構成違反', () => {
    const days = day1([spot('清水寺', 100), spot(PRE_EVENT_SPOT, 100)]);
    const violations = validateDraftStructure(days, vconfig);
    expect(violations).toHaveLength(1);
    expect(violations[0].check).toBe('structure');
    if (violations[0].check === 'structure') expect(violations[0].kind).toBe('missing_event');
  });

  it('イベントが重複すると構成違反', () => {
    const days = day1([spot(PRE_EVENT_SPOT, 100), eventItem(), eventItem()]);
    const violations = validateDraftStructure(days, vconfig);
    expect(violations.some(v => v.check === 'structure' && v.kind === 'duplicate_event')).toBe(
      true,
    );
  });

  it('イベントが指定外の日にあると構成違反', () => {
    const days: SchedulerDay[] = [
      { dayIndex: 1, items: [spot('清水寺', 100), spot(PRE_EVENT_SPOT, 100)] },
      { dayIndex: 2, items: [eventItem()] },
    ];
    const violations = validateDraftStructure(days, vconfig);
    expect(violations.some(v => v.check === 'structure' && v.kind === 'event_on_wrong_day')).toBe(
      true,
    );
    expect(violations.some(v => v.check === 'structure' && v.kind === 'missing_event')).toBe(true);
  });
});

describe('forceFit: 打ち切り時の強制成立', () => {
  it('(c)違反: 間に挟まったアイテムを削除する', () => {
    const days = day1([spot(PRE_EVENT_SPOT, 100), spot('八坂神社', 60), eventItem()]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    expect(result.removedItems).toEqual(['八坂神社']);
    expect(result.days[0].items.map(item => item.name)).toEqual([PRE_EVENT_SPOT, '祇園祭 宵山']);
  });

  it('(a)違反: 直前滞在場所以外のアイテムを先頭から削除して収める', () => {
    // 400 + 105 = 505 > 375 → 清水寺(400)を削除 → 105は2アイテム構成の上限390以下
    const days = day1([spot('清水寺', 400), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    expect(result.removedItems).toEqual(['清水寺']);
    expect(result.trimmedStay).toBeNull();

    // 削除後は違反が解消されている（DAY_START側の空白は増えるが判定対象外）
    const after = assignTimes(result.days, config);
    expect(after.violations).toEqual([]);
    expect(after.madeItToEvent).toBe(true);
  });

  it('(a)違反: 削除できるアイテムが無ければ直前滞在場所の滞在を上限まで短縮する', () => {
    // 錦市場600分のみ → 2アイテム構成の上限 = 540 - (120 + 30) = 390分に短縮
    const days = day1([spot(PRE_EVENT_SPOT, 600), eventItem()]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    expect(result.removedItems).toEqual([]);
    expect(result.trimmedStay).toEqual({
      name: PRE_EVENT_SPOT,
      fromMinutes: 600,
      toMinutes: 390,
    });

    const after = assignTimes(result.days, config);
    expect(after.violations.some(v => v.check === 'a')).toBe(false);
  });

  it('イベントが無ければ補完挿入する', () => {
    const days = day1([spot('清水寺', 100), spot(PRE_EVENT_SPOT, 100)]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    expect(result.insertedItems).toContain('祇園祭 宵山');
    const items = result.days[0].items;
    expect(items[items.length - 1].isEvent).toBe(true);
    // 挿入後も直前滞在場所がイベントの直前にある
    expect(items[items.length - 2].name).toBe(PRE_EVENT_SPOT);
  });

  it('直前滞在場所が無ければイベント直前に補完挿入する', () => {
    const days = day1([spot('清水寺', 100), eventItem()]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    expect(result.insertedItems).toContain(PRE_EVENT_SPOT);
    const items = result.days[0].items;
    const k = items.findIndex(item => item.isEvent);
    expect(items[k - 1].name).toBe(PRE_EVENT_SPOT);
  });

  it('イベントより後の直前滞在場所はイベント直前へ移動する', () => {
    const days = day1([spot('清水寺', 100), eventItem(), spot(PRE_EVENT_SPOT, 60)]);
    const result = forceFit(days, config, PRE_EVENT_SPOT);
    const items = result.days[0].items;
    const k = items.findIndex(item => item.isEvent);
    expect(items[k - 1].name).toBe(PRE_EVENT_SPOT);
    // 検証(c)を通る構成になっている
    expect(
      validateDraftStructure(result.days, {
        anchorName: '祇園祭 宵山',
        anchorDayIndex: 1,
        preEventSpotName: PRE_EVENT_SPOT,
      }),
    ).toEqual([]);
  });

  it('元の構成データを破壊しない（純関数）', () => {
    const days = day1([spot('清水寺', 400), spot(PRE_EVENT_SPOT, 105), eventItem()]);
    const snapshot = JSON.parse(JSON.stringify(days));
    forceFit(days, config, PRE_EVENT_SPOT);
    expect(days).toEqual(snapshot);
  });
});
