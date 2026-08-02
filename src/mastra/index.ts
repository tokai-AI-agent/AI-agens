import { Mastra } from '@mastra/core/mastra';
import { LibSQLStore } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { travelAgent } from './agents/travel-agent';
import { groupTripApiRoutes } from './group-trips';

const storage = new LibSQLStore({
  id: 'travel-storage',
  url: 'file:./mastra.db',
});

export const mastra = new Mastra({
  agents: { travelAgent },
  storage,
  server: {
    apiRoutes: groupTripApiRoutes,
  },
  memory: {
    default: new Memory({ storage }),
  },
});
