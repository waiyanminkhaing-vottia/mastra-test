import { MCPClient } from '@mastra/mcp';

export const zapierMcpClient = new MCPClient({
  id: 'mcp-client',
  servers: {
    zapier: {
      url: new URL(process.env.ZAPIER_MCP_URL!),
    },
  },
});
