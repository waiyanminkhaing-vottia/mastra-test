import { MCPClient } from '@mastra/mcp';

const zapierMcpUrl = process.env.ZAPIER_MCP_URL;
if (!zapierMcpUrl) {
  throw new Error('ZAPIER_MCP_URL environment variable is required');
}

export const zapierMcpClient = new MCPClient({
  id: 'mcp-client',
  servers: {
    zapier: {
      url: new URL(zapierMcpUrl),
    },
  },
});
