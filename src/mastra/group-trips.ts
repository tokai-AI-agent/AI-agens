import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { registerApiRoute } from '@mastra/core/server';
import { travelAgent } from './agents/travel-agent';
import { searchHotPepperShops } from './tools/hotpepper-search';

const budgetSchema = z.enum(['1万～3万円', '4万～6万円', '7万～9万円', '10万円以上']);
const paceSchema = z.enum(['ゆったり', 'バランス', 'アクティブ']);

const preferenceSchema = z.object({
  destination: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  budget: budgetSchema,
  pace: paceSchema,
  mustHave: z.string().default(''),
  avoid: z.string().default(''),
  notes: z.string().default(''),
});

const generatedProposalSchema = z.object({
  title: z.string().min(1),
  concept: z.string().min(1),
  budget: z.string().min(1),
  agreement: z.object({
    common: z.array(z.string()),
    conflicts: z.array(z.string()),
    compromises: z.array(z.string()),
  }),
  days: z.array(z.object({
    day: z.number().int().positive(),
    label: z.string().min(1),
    spots: z.array(z.object({
      time: z.string().min(1),
      name: z.string().min(1),
      comment: z.string().min(1),
      imageUrl: z.string().url(),
      latitude: z.number(),
      longitude: z.number(),
    })).min(1),
  })).min(1),
});

const proposalSetSchema = z.object({
  proposals: z.array(generatedProposalSchema).length(3),
});

type Preference = z.infer<typeof preferenceSchema>;
type TripProposal = z.infer<typeof generatedProposalSchema> & { id: string };
type Member = {
  id: string;
  name: string;
  isHost: boolean;
  preference?: Preference;
};
type Room = {
  code: string;
  memberLimit: number;
  members: Member[];
  status: 'waiting' | 'preferences' | 'planning' | 'voting' | 'complete';
  proposals: TripProposal[];
  votes: Record<string, { proposalId: string; votedAt: string }>;
  confirmedProposalId?: string;
  votingRound: number;
  runoffProposalIds: string[];
  createdAt: string;
};

const rooms = new Map<string, Room>();

function roomCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  do {
    value = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
  } while (rooms.has(value));
  return value;
}

function voteCounts(room: Room) {
  return room.proposals.reduce<Record<string, number>>((counts, proposal) => {
    counts[proposal.id] = Object.values(room.votes).filter(vote => vote.proposalId === proposal.id).length;
    return counts;
  }, {});
}

function publicRoom(room: Room) {
  return {
    ...room,
    allPreferencesReady: room.members.length === room.memberLimit && room.members.every(member => member.preference),
    allVotesSubmitted: room.proposals.length > 0 && room.members.every(member => room.votes[member.id]),
    voteCounts: voteCounts(room),
  };
}

function getRoom(code: string) {
  return rooms.get(code.toUpperCase());
}

function parseGenerated(text: string) {
  const cleaned = text.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AIの応答にJSONが含まれていません');
  return proposalSetSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
}

export const groupTripApiRoutes = [
  registerApiRoute('/group-trips', {
    method: 'POST',
    handler: async c => {
      const body = z.object({
        hostName: z.string().min(1).max(30),
        memberLimit: z.number().int().min(2).max(5),
      }).parse(await c.req.json());
      const host: Member = { id: randomUUID(), name: body.hostName, isHost: true };
      const room: Room = {
        code: roomCode(),
        memberLimit: body.memberLimit,
        members: [host],
        status: 'waiting',
        proposals: [],
        votes: {},
        votingRound: 1,
        runoffProposalIds: [],
        createdAt: new Date().toISOString(),
      };
      rooms.set(room.code, room);
      return c.json({ room: publicRoom(room), memberId: host.id });
    },
  }),
  registerApiRoute('/group-trips/:code', {
    method: 'GET',
    handler: async c => {
      const room = getRoom(c.req.param('code'));
      if (!room) return c.json({ error: 'ルームが見つかりません' }, 404);
      return c.json({ room: publicRoom(room) });
    },
  }),
  registerApiRoute('/group-trips/:code/join', {
    method: 'POST',
    handler: async c => {
      const room = getRoom(c.req.param('code'));
      if (!room) return c.json({ error: 'ルームが見つかりません' }, 404);
      if (room.members.length >= room.memberLimit) return c.json({ error: 'このルームは満員です' }, 409);
      if (room.proposals.length > 0) return c.json({ error: '提案作成後は参加できません' }, 409);
      const { name } = z.object({ name: z.string().min(1).max(30) }).parse(await c.req.json());
      const member: Member = { id: randomUUID(), name, isHost: false };
      room.members.push(member);
      room.status = room.members.length === room.memberLimit ? 'preferences' : 'waiting';
      return c.json({ room: publicRoom(room), memberId: member.id });
    },
  }),
  registerApiRoute('/group-trips/:code/preferences', {
    method: 'PUT',
    handler: async c => {
      const room = getRoom(c.req.param('code'));
      if (!room) return c.json({ error: 'ルームが見つかりません' }, 404);
      if (room.proposals.length > 0) return c.json({ error: '提案作成後は希望を変更できません' }, 409);
      const body = z.object({ memberId: z.string(), preference: preferenceSchema }).parse(await c.req.json());
      const member = room.members.find(item => item.id === body.memberId);
      if (!member) return c.json({ error: '参加者が見つかりません' }, 404);
      member.preference = body.preference;
      room.status = room.members.length === room.memberLimit ? 'preferences' : 'waiting';
      return c.json({ room: publicRoom(room) });
    },
  }),
  registerApiRoute('/group-trips/:code/proposals', {
    method: 'POST',
    handler: async c => {
      const room = getRoom(c.req.param('code'));
      if (!room) return c.json({ error: 'ルームが見つかりません' }, 404);
      const { memberId } = z.object({ memberId: z.string() }).parse(await c.req.json());
      const member = room.members.find(item => item.id === memberId);
      if (!member?.isHost) return c.json({ error: '代表者のみ提案を作成できます' }, 403);
      if (room.members.length !== room.memberLimit || !room.members.every(item => item.preference)) {
        return c.json({ error: '全員の参加と希望入力を待っています' }, 409);
      }
      room.status = 'planning';
      try {
        const preferences = room.members.map(item => ({
          name: item.name,
          ...item.preference!,
        }));
        const destination = preferences[0]?.destination ?? '';
        const foodKeywords = preferences
          .flatMap(item => [item.mustHave, item.notes])
          .filter(Boolean)
          .join(' ');
        const restaurantKeyword = `${destination} ${foodKeywords}`.trim();
        const restaurants = await searchHotPepperShops(restaurantKeyword, 20);
        const prompt = `あなたはグループ旅行の合意形成を支援する旅行プランナーです。
次の${room.members.length}人の希望を整理し、特徴の異なる旅行案を必ず3案作成してください。

参加者の希望:
${JSON.stringify(preferences, null, 2)}

ホットペッパーグルメAPIで取得した実在の飲食店候補:
${JSON.stringify(restaurants, null, 2)}

条件:
- 昼食・夕食・カフェには上記の飲食店候補だけを使い、店名を変更しない
- 飲食店の写真、緯度、経度は候補のphotoUrl、latitude、longitudeをそのまま使う
- 3案は「ゆったり」「定番重視」「体験重視」など明確に違いを出す
- 各案に、共通希望・意見が分かれた点・採用した妥協案を短文で整理する
- 各日程に、時刻順の観光スポットを3～5件含める
- 各スポットに内容説明、実在する画像のHTTPS URL、正確な緯度・経度を含める
- 公式サイト（観光局・鉄道・航空・道路・自治体・施設公式ページ）だけを参照し、個人ブログ・SNS・個人サイトは使わない
- 電車・車・バスなどの移動時間は、実際の路線・所要時間・距離が妥当な範囲になるように整理し、無理な遠距離移動は避ける
- 予算帯と日付を守る
- 説明文やMarkdownを付けず、次の形のJSONだけを返す

{"proposals":[{"title":"案名","concept":"特徴","budget":"予算目安","agreement":{"common":["共通希望"],"conflicts":["意見の違い"],"compromises":["妥協案"]},"days":[{"day":1,"label":"1日目 2026-01-01","spots":[{"time":"09:00","name":"場所","comment":"体験内容と移動の補足","imageUrl":"https://...","latitude":35.0,"longitude":139.0}]}]}]}`;
        let generated: z.infer<typeof proposalSetSchema> | undefined;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try {
            const response = await travelAgent.generate(prompt);
            generated = parseGenerated(response.text);
            break;
          } catch (error) {
            lastError = error;
            if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
          }
        }
        if (!generated) throw lastError;
        room.proposals = generated.proposals.map((proposal, index) => ({
          ...proposal,
          id: `plan-${index + 1}`,
        }));
        room.votes = {};
        room.votingRound = 1;
        room.runoffProposalIds = [];
        room.status = 'voting';
        return c.json({ room: publicRoom(room) });
      } catch (error) {
        room.status = 'preferences';
        const message = error instanceof Error ? error.message : '旅行案を作成できませんでした';
        return c.json({ error: `旅行案の生成に失敗しました: ${message}` }, 500);
      }
    },
  }),
  registerApiRoute('/group-trips/:code/votes', {
    method: 'POST',
    handler: async c => {
      const room = getRoom(c.req.param('code'));
      if (!room) return c.json({ error: 'ルームが見つかりません' }, 404);
      if (room.status === 'complete') return c.json({ room: publicRoom(room) });
      const body = z.object({ memberId: z.string(), proposalId: z.string() }).parse(await c.req.json());
      const member = room.members.find(item => item.id === body.memberId);
      if (!member) return c.json({ error: '参加者が見つかりません' }, 404);
      if (!room.proposals.some(item => item.id === body.proposalId)) {
        return c.json({ error: '旅行案が見つかりません' }, 404);
      }
      if (room.runoffProposalIds.length > 0 && !room.runoffProposalIds.includes(body.proposalId)) {
        return c.json({ error: 'この旅行案は決選投票の対象ではありません' }, 409);
      }
      room.votes[member.id] = { proposalId: body.proposalId, votedAt: new Date().toISOString() };
      if (room.members.every(item => room.votes[item.id])) {
        const counts = voteCounts(room);
        const topCount = Math.max(...Object.values(counts));
        const eligibleIds = new Set(
          room.runoffProposalIds.length > 0
            ? room.runoffProposalIds
            : room.proposals.map(item => item.id),
        );
        const tied = room.proposals.filter(
          item => eligibleIds.has(item.id) && counts[item.id] === topCount,
        );

        if (tied.length > 1) {
          room.runoffProposalIds = tied.map(item => item.id);
          room.votingRound += 1;
          room.votes = {};
          room.status = 'voting';
        } else {
          room.confirmedProposalId = tied[0].id;
          room.runoffProposalIds = [];
          room.status = 'complete';
        }
      }
      return c.json({ room: publicRoom(room) });
    },
  }),
];
