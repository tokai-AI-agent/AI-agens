import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { travelAgent } from './agents/travel-agent';

const storage = new LibSQLStore({
  id: 'travel-storage',
  url: 'file:./mastra.db',
});

export const mastra = new Mastra({
  agents: { travelAgent },
  storage,
  memory: {
    default: new Memory({ storage }),
  },
});
