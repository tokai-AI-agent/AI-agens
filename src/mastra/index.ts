import { Mastra } from '@mastra/core/mastra';
import { registerApiRoute } from '@mastra/core/server';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { travelAgent } from './agents/travel-agent';
import { planStructureAgent } from './agents/plan-structure-agent';
import { planRequestSchema } from './schemas/plan';
import { buildErrorLogRecord, generateAnchoredPlan } from './pipeline/anchored-plan';
import { generateBaselinePlan } from './baseline/baseline-plan';
import { appendExperimentLog } from './logging/experiment-log';

const storage = new LibSQLStore({
  id: 'travel-storage',
  url: 'file:./mastra.db',
});

export const mastra = new Mastra({
  // travelAgentは従来どおり（フロントエンドが使うベースライン）。
  // planStructureAgentはアンカー方式パイプライン専用。
  agents: { travelAgent, planStructureAgent },
  storage,
  memory: {
    default: new Memory({ storage }),
  },
  server: {
    apiRoutes: [
      // アンカー方式のプラン生成（評価実験用）。
      // カスタムルートは /api プレフィックスがMastra予約のため /plan/anchored とする。
      // 例: POST http://localhost:4111/plan/anchored
      registerApiRoute('/plan/anchored', {
        method: 'POST',
        handler: async c => {
          const body = await c.req.json().catch(() => null);
          const parsed = planRequestSchema.safeParse(body);
          if (!parsed.success) {
            return c.json(
              { error: 'リクエスト形式が不正です', details: parsed.error.issues },
              400,
            );
          }

          const agent = c.get('mastra').getAgent('planStructureAgent');
          try {
            const result = await generateAnchoredPlan(agent, parsed.data);
            return c.json(result);
          } catch (error) {
            // 生成が失敗しても実験の1試行を欠測にしない（retryOutcome:'error'で記録）
            await appendExperimentLog(buildErrorLogRecord(parsed.data, error)).catch(() => {});
            return c.json(
              { error: error instanceof Error ? error.message : String(error) },
              500,
            );
          }
        },
      }),
      // ベースライン（現行travelAgent）の自動測定（評価実験用）。
      // アンカー方式と同じリクエスト形式を受け取り、同じJSONL形式でログを残す。
      // 例: POST http://localhost:4111/plan/baseline
      registerApiRoute('/plan/baseline', {
        method: 'POST',
        handler: async c => {
          const body = await c.req.json().catch(() => null);
          const parsed = planRequestSchema.safeParse(body);
          if (!parsed.success) {
            return c.json(
              { error: 'リクエスト形式が不正です', details: parsed.error.issues },
              400,
            );
          }

          const agent = c.get('mastra').getAgent('travelAgent');
          try {
            const result = await generateBaselinePlan(agent, parsed.data);
            return c.json(result);
          } catch (error) {
            await appendExperimentLog(
              buildErrorLogRecord(parsed.data, error, 'baseline'),
            ).catch(() => {});
            return c.json(
              { error: error instanceof Error ? error.message : String(error) },
              500,
            );
          }
        },
      }),
    ],
  },
});
