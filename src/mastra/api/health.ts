import { registerApiRoute } from '@mastra/core/server';

/**
 * GET /api/health
 * Simple health check endpoint
 * Returns 200 OK if the service is running
 * @returns JSON response with basic health information
 */
export const healthRoute = registerApiRoute('/health', {
  method: 'GET',
  handler: async (c) =>
    c.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'mastra-test',
        version: '1.0.0',
      },
      200
    ),
});
