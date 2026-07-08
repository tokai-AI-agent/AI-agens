import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const hotpepperTool = createTool({
  id: 'hotpepper-tool',
  description: '飲食店の名前から、ホットペッパーの店舗情報（画像URLと正式な店舗名）を取得します。',
  inputSchema: z.object({
    keyword: z.string().describe('飲食店の店舗名'),
  }),
  outputSchema: z.object({
    imageUrl: z.string().nullable().describe('店舗の画像URL'),
    shopName: z.string().nullable().describe('ホットペッパーに登録されている正式な店舗名'),
  }),
  execute: async ({ keyword }) => {
    const apiKey = process.env.HOTPEPPER_API_KEY;

    if (!apiKey) {
      console.error("HOTPEPPER_API_KEYが設定されていません。");
      return { imageUrl: null, shopName: null };
    }

    const url = `https://webservice.recruit.co.jp/hotpepper/gourmet/v1/?key=${apiKey}&keyword=${encodeURIComponent(keyword)}&format=json&count=1`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      const shop = data.results?.shop?.[0] || null;
      const imageUrl = shop?.photo?.pc?.l || null;
      const shopName = shop?.name || null;
      return { imageUrl, shopName };
    } catch (error) {
      console.error("Hotpepper API Error:", error);
      return { imageUrl: null, shopName: null };
    }
  }
});