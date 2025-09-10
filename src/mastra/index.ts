import { Mastra } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';

const logLevel = process.env.LOG_LEVEL || 'info';

export const mastra: Mastra = new Mastra({
  logger: new PinoLogger({
    name: 'mastra-test',
    level: logLevel as any,
  }),
});
