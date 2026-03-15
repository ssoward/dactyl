import { instructionsRoutes } from './instructions.js';
import { authRoutes } from './auth.js';
import { taskRoutes } from './tasks.js';
import { agentRoutes } from './agents.js';
import { laneRoutes } from './lanes.js';
import { leaderboardRoutes } from './leaderboard.js';
import { creditsRoutes } from './credits.js';
/**
 * Register all API route plugins under the /v1 prefix.
 */
export async function registerRoutes(app) {
    // Agent instructions (no auth, accessible to any agent discovering the platform)
    await app.register(instructionsRoutes);
    // Auth endpoints
    await app.register(authRoutes, { prefix: '/auth' });
    // Core resource endpoints
    await app.register(taskRoutes, { prefix: '/tasks' });
    await app.register(agentRoutes, { prefix: '/agents' });
    await app.register(laneRoutes, { prefix: '/lanes' });
    await app.register(leaderboardRoutes, { prefix: '/leaderboard' });
    await app.register(creditsRoutes, { prefix: '/credits' });
}
//# sourceMappingURL=index.js.map