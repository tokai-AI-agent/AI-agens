import { describe, it, expect } from 'vitest';
import {
  parseDurationJp,
  parseTimeline,
  judgeBaselineMarkdown,
  type BaselineJudgeConfig,
} from './parse-markdown';

const config: BaselineJudgeConfig = {
  anchor: { name: 'みなとみらいの花火フェスティバル', startTime: '18:00', dayIndex: 1 },
  travel: { toEventMinutes: 40, defaultMinutes: 15 },
  window: { dayStart: '13:00' },
  eventMatchKeywords: ['花火'],
};

describe('parseDurationJp: 滞在・移動時間表記の分換算', () => {
  it('基本形と「約」付きを読める', () => {
    expect(parseDurationJp('90分')).toBe(90);
    expect(parseDurationJp('約90分')).toBe(90);
    expect(parseDurationJp('約1時間')).toBe(60);
  });

  it('時間表記を分に換算する', () => {
    expect(parseDurationJp('1時間30分')).toBe(90);
    expect(parseDurationJp('1.5時間')).toBe(90);
    expect(parseDurationJp('2時間')).toBe(120);
  });

  it('範囲表記は小さい方（ベースラインに有利な解釈）', () => {
    expect(parseDurationJp('60〜90分')).toBe(60);
    expect(parseDurationJp('1〜2時間')).toBe(60);
  });

  it('複数の分表記は合算する（乗り継ぎ移動）', () => {
    expect(parseDurationJp('電車30分＋徒歩5分')).toBe(35);
  });

  it('単位なしの数値は分とみなし、読めない表記はnull', () => {
    expect(parseDurationJp('60')).toBe(60);
    expect(parseDurationJp('ゆっくり')).toBeNull();
    expect(parseDurationJp('')).toBeNull();
    expect(parseDurationJp(null)).toBeNull();
  });
});

describe('parseTimeline: タイムライン行の抽出', () => {
  it('日見出し・時刻・タイトル・メタ情報を抽出する', () => {
    const md = [
      '## モデルプラン',
      '',
      '### 1日目',
      '',
      '- 13:00 - 日吉キャンパス：散策 / 滞在目安：120分 / 住所：横浜市港北区',
      '- 15:20 - カフェ：休憩 / 滞在目安：約1時間 / 移動：徒歩10分 / 住所：不明',
      '- 17:20 - 会場へ移動：車で向かう / 移動：40分',
      '### 2日目',
      '- 09:00 - 山下公園：朝の散歩 / 滞在目安：60分 / 住所：横浜市中区',
    ].join('\n');

    const items = parseTimeline(md);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      day: 1,
      timeText: '13:00',
      title: '日吉キャンパス',
      isMoveLine: false,
      stayMinutes: 120,
      travelMinutes: null,
    });
    expect(items[1]).toMatchObject({ stayMinutes: 60, travelMinutes: 10 });
    expect(items[2]).toMatchObject({ title: '会場へ移動', isMoveLine: true, travelMinutes: 40 });
    expect(items[3]).toMatchObject({ day: 2 });
  });

  it('```markdownフェンスを剥がして読める', () => {
    const md = '```markdown\n### 1日目\n- 13:00 - 日吉キャンパス：散策 / 滞在目安：120分\n```';
    expect(parseTimeline(md)).toHaveLength(1);
  });
});

describe('judgeBaselineMarkdown: 間に合い・改ざん・空白の判定', () => {
  it('明示的な移動行があればその時刻を出発時刻とし、時刻どおりなら間に合い', () => {
    const md = [
      '### 1日目',
      '- 13:00 - 日吉キャンパス：散策 / 滞在目安：120分',
      '- 15:10 - みなとみらいでカフェ：休憩 / 滞在目安：120分 / 移動：徒歩10分',
      '- 17:20 - 会場へ移動：車で花火会場へ / 移動：40分',
      '- 18:00 - みなとみらいの花火フェスティバル：夏の夜空 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.parseInfo.eventMatchedBy).toBe('name');
    expect(result.parseInfo.departureSource).toBe('move-line');
    expect(result.departureForEventTime).toBe('17:20');
    expect(result.arrivalAtEventTime).toBe('18:00');
    expect(result.madeItToEvent).toBe(true);
    expect(result.eventTimePreserved).toBe(true);
    expect(result.departureTime).toBe('13:00');

    // 空白: DAY_START→0、日吉→カフェ 15:10-(13:00+120+10)=0、
    // カフェ→イベントは出発時刻ベース（移動行17:20+40=18:00着）で 18:00-18:00=0。
    // カフェ終了17:10〜移動行17:20の10分は前の場所での滞在延長とみなし数えない
    const gapMap = Object.fromEntries(result.gaps.map(g => [`${g.from}->${g.to}`, g.minutes]));
    expect(gapMap['DAY_START->日吉キャンパス']).toBe(0);
    expect(gapMap['日吉キャンパス->みなとみらいでカフェ']).toBe(0);
    expect(gapMap['みなとみらいでカフェ->みなとみらいの花火フェスティバル']).toBe(0);
  });

  it('直前予定の滞在が読めなくても、移動行があればイベント直前の空白を計算できる', () => {
    // プローブで実際に観測したパターン：昼食に滞在目安が無いが、直後に明示的な移動行がある
    const md = [
      '### 1日目',
      '- 16:00 - 昼食・カフェ：早めの夕食 / 予算目安：3,000円',
      '- 17:00 - 会場へ移動：花火会場へ / 移動：徒歩',
      '- 18:00 - みなとみらいの花火フェスティバル：観覧 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.parseInfo.departureSource).toBe('move-line');
    // 17:00発 + 40分 = 17:40着 → イベント18:00まで20分の待ち
    expect(result.arrivalAtEventTime).toBe('17:40');
    expect(result.madeItToEvent).toBe(true);
    const eventGap = result.gaps.find(g => g.to === 'みなとみらいの花火フェスティバル');
    expect(eventGap?.minutes).toBe(20);
    expect(result.parseInfo.skippedGapJunctions).toBe(0);
  });

  it('移動行が無ければ直前予定の開始+滞在を出発時刻とし、遅刻を検出する', () => {
    // 13:00+300分=18:00発 → 40分移動 → 18:40着 > 18:00 → 間に合わない
    const md = [
      '### 1日目',
      '- 13:00 - 日吉キャンパス：ゆっくり滞在 / 滞在目安：300分',
      '- 18:00 - みなとみらいの花火フェスティバル：観覧 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.parseInfo.departureSource).toBe('prev-stay');
    expect(result.departureForEventTime).toBe('18:00');
    expect(result.arrivalAtEventTime).toBe('18:40');
    expect(result.madeItToEvent).toBe(false);
    expect(result.eventTimePreserved).toBe(true);
    // イベント直前区間の空白は負（遅刻量）
    const eventGap = result.gaps.find(g => g.to === 'みなとみらいの花火フェスティバル');
    expect(eventGap?.minutes).toBe(-40);
  });

  it('イベント開始時刻の改ざん（18:00→18:30）を検出する', () => {
    const md = [
      '### 1日目',
      '- 13:00 - 日吉キャンパス：滞在 / 滞在目安：4時間',
      '- 18:30 - みなとみらいの花火フェスティバル：観覧 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.renderedEventStart).toBe('18:30');
    expect(result.eventTimePreserved).toBe(false);
    // 改ざんされていても、間に合い判定は与えた18:00に対して行う
    // 17:00発 + 40分 = 17:40着 ≤ 18:00 → 間に合っている
    expect(result.madeItToEvent).toBe(true);
  });

  it('イベント名の表記ゆれはキーワードで拾う', () => {
    const md = [
      '### 1日目',
      '- 16:00 - 日吉キャンパス：滞在 / 滞在目安：80分',
      '- 18:00 - 花火大会観覧：臨港パークで観覧 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.parseInfo.eventMatchedBy).toBe('keyword');
    expect(result.eventTimePreserved).toBe(true);
    expect(result.madeItToEvent).toBe(true); // 17:20発+40=18:00着
  });

  it('イベント行が見つからなければ判定不能（改ざん=false扱い）', () => {
    const md = ['### 1日目', '- 13:00 - 日吉キャンパス：滞在 / 滞在目安：120分'].join('\n');
    const result = judgeBaselineMarkdown(md, config);
    expect(result.parseInfo.eventLineFound).toBe(false);
    expect(result.madeItToEvent).toBeNull();
    expect(result.renderedEventStart).toBeNull();
    expect(result.eventTimePreserved).toBe(false);
  });

  it('直前予定の滞在目安が読めなければ間に合い判定はnull、空白はスキップして数える', () => {
    const md = [
      '### 1日目',
      '- 13:00 - 日吉キャンパス：滞在 / 滞在目安：ゆっくり',
      '- 18:00 - みなとみらいの花火フェスティバル：観覧 / 滞在目安：120分',
    ].join('\n');

    const result = judgeBaselineMarkdown(md, config);
    expect(result.madeItToEvent).toBeNull();
    expect(result.parseInfo.departureSource).toBeNull();
    expect(result.parseInfo.skippedGapJunctions).toBe(1);
    // 改ざん判定は時刻だけで可能なので有効
    expect(result.eventTimePreserved).toBe(true);
  });

  it('DAY_START空白は最初の行（移動行含む）に対して記録する', () => {
    const md = [
      '### 1日目',
      '- 14:30 - 日吉キャンパス：滞在 / 滞在目安：170分',
      '- 18:00 - みなとみらいの花火フェスティバル：観覧 / 滞在目安：120分',
    ].join('\n');
    const result = judgeBaselineMarkdown(md, config);
    const dayStartGap = result.gaps.find(g => g.from === 'DAY_START');
    expect(dayStartGap?.minutes).toBe(90); // 14:30 - 13:00
  });
});
