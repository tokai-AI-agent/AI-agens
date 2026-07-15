/**
 * 時刻割り当て済みプランを、既存フロントエンド（App.tsx）が正規表現でパースできる
 * 現行Markdown形式に変換する（第1段階：フロント無変更のための互換レイヤー）。
 *
 * フロントが依存しているパースルール:
 * - タイムライン行: /^-\s*\d{1,2}:\d{2}\s*-/ で始まり、「 / 」区切りでメタ情報が並ぶ
 * - 「/ 住所：◯◯」を地図のジオコーディングに使う（移動行には付けない）
 * - 「/ 画像URL：https://...」をサムネイル表示に使う
 * - 「出発」を含む行はスポットではない（画像を付けない）と判定される
 */
import type { ScheduledDayResult } from '../scheduler/timeline';
import { formatHHMM, nameMatches } from '../scheduler/timeline';

export type RenderInput = {
  conditions: {
    destination: string;
    departure: string;
    schedule: string;
    budget: string;
    people: string;
    purposes: string[];
  };
  travel: {
    originLegMinutes: number;
    defaultMinutes: number;
    toEventMinutes: number;
  };
  overview: { theme: string; comment: string };
  days: ScheduledDayResult[];
  notes: string[];
  sources: string[];
  aborted: boolean;
};

export const ABORT_NOTICE =
  '時間内に収まるプランを生成できませんでした。一部の予定を調整・削除したプランを表示しています。';

// 「 / 」区切りと「名前：コメント」分割を壊す文字をフィールド単位で無害化する。
// nameは「：」でtitle/commentに分割されるため、区切り文字そのものを含められない。
function sanitizeName(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replace(/\//g, '／').replace(/[:：]/g, ' ').trim();
}

function sanitizeField(value: string): string {
  return value.replace(/[\r\n]/g, ' ').replace(/\//g, '／').trim();
}

function timelineLine(parts: {
  time: number;
  title: string;
  comment: string;
  meta: string[];
}): string {
  const segments = [`${parts.title}：${parts.comment}`, ...parts.meta];
  return `- ${formatHHMM(parts.time)} - ${segments.join(' / ')}`;
}

export function renderPlanMarkdown(input: RenderInput): string {
  const { conditions, travel, overview, days, aborted } = input;
  const lines: string[] = [];

  if (aborted) {
    lines.push(`⚠️ ${ABORT_NOTICE}`, '');
  }

  const totalDays = days.length;
  lines.push(
    '## 旅行プラン概要',
    '',
    `- 出発地点：${conditions.departure}`,
    `- 旅行先：${conditions.destination}`,
    `- 想定日数：${totalDays <= 1 ? '日帰り（1日）' : `${totalDays}日間`}（日程：${conditions.schedule}）`,
    `- プランのテーマ：${sanitizeField(overview.theme)}`,
    `- 全体コメント：${sanitizeField(overview.comment)}`,
    '',
    '## モデルプラン',
  );

  for (const day of days) {
    lines.push('', `### ${day.dayIndex}日目`, '');
    for (const item of day.items) {
      if (item.kind === 'move') {
        const title =
          item.moveRole === 'origin-departure'
            ? `${sanitizeName(conditions.departure)}を出発`
            : `${sanitizeName(conditions.destination)}を出発し${sanitizeName(conditions.departure)}へ`;
        const comment =
          item.moveRole === 'origin-departure'
            ? `${sanitizeName(conditions.destination)}へ向かいます`
            : '帰路につきます';
        lines.push(
          timelineLine({
            time: item.startMinutes,
            title,
            comment,
            meta: [`移動：${item.travelFromPrevMinutes}分`],
          }),
        );
        continue;
      }

      const meta = [`滞在目安：${item.stayMinutes}分`, `移動：${item.travelFromPrevMinutes}分`];
      // 住所は地図ピンに使われるため必ず付ける（不明なら「不明」：フロント側で除外される）
      meta.push(`住所：${item.address ? sanitizeField(item.address) : '不明'}`);
      if (item.imageUrl && /^https?:\/\//.test(item.imageUrl)) {
        meta.push(`画像URL：${item.imageUrl.replace(/\s/g, '')}`);
      }
      lines.push(
        timelineLine({
          time: item.startMinutes,
          title: sanitizeName(item.name),
          comment: sanitizeField(item.comment),
          meta,
        }),
      );
    }
  }

  lines.push(
    '',
    '## 移動・注意点',
    '',
    `- 出発地点（${conditions.departure}）から${conditions.destination}までの移動時間：${travel.originLegMinutes}分（所与の設定値）`,
    `- スポット間の移動は各${travel.defaultMinutes}分、イベント会場への移動は${travel.toEventMinutes}分として計画しています（所与の設定値）`,
  );
  for (const note of input.notes) {
    lines.push(`- ${sanitizeField(note)}`);
  }

  lines.push('', '## 参考にした情報', '');
  if (input.sources.length > 0) {
    for (const source of input.sources) {
      lines.push(`- ${source.replace(/[\r\n]/g, ' ').trim()}`);
    }
  } else {
    lines.push('- （情報源の記載なし）');
  }

  return lines.join('\n');
}

/**
 * 最終Markdownからイベント行の開始時刻を取り出す。
 * ログ項目「イベント開始時刻が与えた固定値のまま出力されているか」を、
 * 内部変数の比較ではなく最終出力に対するエンドツーエンドの測定として行うためのもの。
 */
export function extractRenderedEventStart(markdown: string, eventName: string): string | null {
  for (const rawLine of markdown.split('\n')) {
    const match = rawLine.trim().match(/^-\s*(\d{1,2}:\d{2})\s*-\s*(.+)$/);
    if (!match) continue;
    const title = match[2].split(/\s*\/\s*/)[0].split(/[:：]/)[0].trim();
    if (title.includes('出発')) continue; // 移動行は対象外
    if (nameMatches(title, eventName)) return match[1];
  }
  return null;
}
