import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const wikipediaImageTool = createTool({
  id: 'wikipedia-image',
  description: '観光地やスポットの名前から、Wikipediaのメイン画像URLを取得します。飲食店以外のスポットに使用してください。',
  inputSchema: z.object({
    keyword: z.string().describe('観光地やスポットの名前（例: 「清水寺」「東京タワー」）'),
  }),
  execute: async ({ keyword }) => {
    const url = `https://ja.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(keyword)}&gsrlimit=1&prop=pageimages&piprop=original&format=json&utf8=1`;
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      const pages = data?.query?.pages || {};
      const pageKey = Object.keys(pages)[0];
      const imageUrl = pageKey ? pages[pageKey]?.original?.source || null : null;
      return { imageUrl };
    } catch {
      return { imageUrl: null };
    }
  }
});
