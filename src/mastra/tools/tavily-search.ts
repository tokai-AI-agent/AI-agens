import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tavily } from '@tavily/core';

export const tavilySearchTool = createTool({
  id: 'tavily-search',
  description:
    '旅行先の観光スポット・グルメ・交通情報などをWeb検索して取得します。旅行プランの作成に必要な情報を収集するために使用してください。',
  inputSchema: z.object({
    query: z.string().describe('検索クエリ（例：「大阪 おすすめ観光スポット 2024」）'),
    maxResults: z.number().optional().describe('取得する最大結果数。デフォルトは5。'),
  }),
  outputSchema: z.object({
    answer: z.string(),
    results: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        content: z.string(),
      })
    ),
  }),
  execute: async (inputData) => {
    const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });

    const response = await client.search(inputData.query, {
      maxResults: inputData.maxResults ?? 5,
      searchDepth: 'basic',
      includeAnswer: true,
    });

    return {
      answer: response.answer ?? '',
      results: response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      })),
    };
  },
});
