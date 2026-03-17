import type { FastifyInstance } from 'fastify';
import { instructionsRoutes } from './instructions.js';
import { authRoutes } from './auth.js';
import { taskRoutes } from './tasks.js';
import { agentRoutes } from './agents.js';
import { laneRoutes } from './lanes.js';
import { leaderboardRoutes } from './leaderboard.js';
import { creditsRoutes } from './credits.js';
import { docsRoutes } from './docs.js';

/**
 * Register all API route plugins under the /v1 prefix.
 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Agent instructions (no auth, accessible to any agent discovering the platform)
  await app.register(instructionsRoutes);

  // Documentation (no auth)
  await app.register(docsRoutes);

  // Auth endpoints (routes include /auth prefix internally)
  await app.register(authRoutes);

  // Core resource endpoints (routes include resource prefix internally)
  await app.register(taskRoutes);
  await app.register(agentRoutes);
  await app.register(laneRoutes);
  await app.register(leaderboardRoutes);
  await app.register(creditsRoutes);
}
