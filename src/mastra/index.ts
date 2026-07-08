import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { travelAgent } from './agents/travel-agent';
import { healthAgent } from './agents/health-agent';

const storage = new LibSQLStore({
  id: 'travel-storage',
  url: 'file:./mastra.db',
});

export const mastra = new Mastra({
  agents: { travelAgent, healthAgent },
  storage,
  memory: {
    default: new Memory({ storage }),
  },
});
