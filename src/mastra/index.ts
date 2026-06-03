import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { travelAgent } from './agents/travel-agent';

export const mastra = new Mastra({
  agents: { travelAgent },
  storage: new LibSQLStore({
    id: 'travel-storage',
    url: 'file:./mastra.db',
  }),
});
