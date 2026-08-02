import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

const shopSchema = z.object({
  id: z.string(), name: z.string(), address: z.string(), genre: z.string(),
  catchCopy: z.string(), budget: z.string(), access: z.string(), open: z.string(),
  photoUrl: z.string(), shopUrl: z.string(), latitude: z.number(), longitude: z.number(),
});
export type HotPepperShop = z.infer<typeof shopSchema>;

type ApiResponse = {
  results?: {
    error?: Array<{ message?: string }>;
    shop?: Array<{
      id?: string; name?: string; address?: string; catch?: string; access?: string; open?: string;
      lat?: number; lng?: number; genre?: { name?: string }; budget?: { average?: string };
      photo?: { pc?: { l?: string } }; urls?: { pc?: string };
    }>;
  };
};

export async function searchHotPepperShops(keyword: string, count = 15): Promise<HotPepperShop[]> {
  const apiKey = process.env.RECRUIT_HOTPEPPER_API_KEY;
  if (!apiKey) throw new Error('RECRUIT_HOTPEPPER_API_KEYが設定されていません');
  const params = new URLSearchParams({
    key: apiKey, keyword, count: String(Math.min(Math.max(count, 1), 100)), format: 'json',
  });
  const response = await fetch(`https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?${params}`);
  if (!response.ok) throw new Error(`ホットペッパーグルメAPI: HTTP ${response.status}`);
  const data = await response.json() as ApiResponse;
  const apiError = data.results?.error?.[0]?.message;
  if (apiError) throw new Error(`ホットペッパーグルメAPI: ${apiError}`);
  return (data.results?.shop ?? []).map(shop => ({
    id: shop.id ?? '', name: shop.name ?? '', address: shop.address ?? '',
    genre: shop.genre?.name ?? '', catchCopy: shop.catch ?? '',
    budget: shop.budget?.average ?? '', access: shop.access ?? '', open: shop.open ?? '',
    photoUrl: shop.photo?.pc?.l ?? '', shopUrl: shop.urls?.pc ?? '',
    latitude: Number(shop.lat ?? 0), longitude: Number(shop.lng ?? 0),
  })).filter(shop => shop.id && shop.name);
}

export const hotPepperSearchTool = createTool({
  id: 'hotpepper-gourmet-search',
  description: '日本国内の飲食店、カフェ、食べ物をホットペッパーグルメから検索します。旅行中の昼食・夕食・カフェ候補を探すときに使います。',
  inputSchema: z.object({
    keyword: z.string().min(1).describe('地域名と料理・店の希望。例: 京都駅 和食 個室'),
    count: z.number().int().min(1).max(30).optional(),
  }),
  outputSchema: z.object({
    shops: z.array(shopSchema),
    credit: z.literal('Powered by ホットペッパーグルメ Webサービス'),
  }),
  execute: async input => ({
    shops: await searchHotPepperShops(input.keyword, input.count ?? 15),
    credit: 'Powered by ホットペッパーグルメ Webサービス' as const,
  }),
});
