import { registerApiRoute } from '@mastra/core/server';

export const createHealthRoute = (basePath: string = '') => {
  // Construct the full path with base path
  const healthPath = basePath ? `${basePath}/health` : '/health';

  return registerApiRoute(healthPath, {
    method: 'GET',
    handler: async (c) => {
      const mastra = c.get('mastra');

      try {
        // Basic health checks
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          demo: process.env.DEMO ?? 'unknown',
          branch: process.env.BRANCH ?? 'unknown',
          environment: process.env.NODE_ENV ?? 'development',
          version: process.env.npm_package_version ?? '1.0.0',
          basePath: basePath || '/',
          checks: {
            mastra: !!mastra,
            memory: process.memoryUsage(),
            storage: false as boolean,
          },
        };

        // Optional: Check if storage is available
        try {
          const storage = mastra?.getStorage();
          health.checks.storage = !!storage;
        } catch {
          health.checks.storage = false;
        }

        return c.json(health, 200);
      } catch (error) {
        return c.json(
          {
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          500
        );
      }
    },
  });
};

// Export default route without base path for backward compatibility
export const healthRoute = createHealthRoute();
