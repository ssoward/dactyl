import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import { redis } from './redis/client.js';
import { getPool } from './db/client.js';
import { registerRoutes } from './routes/index.js';
import { DactylError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import { env } from './env.js';
export async function buildApp(opts = {}) {
    const appLogger = 'logger' in opts ? opts.logger : logger;
    const app = Fastify({
        logger: appLogger,
        // Keep rawBody available for Stripe webhook signature verification
        // (requires content-type parser below)
    });
    // ─── OpenAPI / Swagger ────────────────────────────────────────────────────
    await app.register(import('@fastify/swagger'), {
        openapi: {
            info: {
                title: 'Dactyl API',
                version: '1.0.0',
                description: 'Pure A2A agent task marketplace',
            },
            servers: [{ url: 'https://api.dactyl.dev/v1' }],
            components: {
                securitySchemes: {
                    agentToken: {
                        type: 'http',
                        scheme: 'bearer',
                        description: 'X-Agent-Token JWT',
                    },
                },
            },
        },
    });
    // ─── Plugins ──────────────────────────────────────────────────────────────
    await app.register(cors, {
        origin: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Agent-Token'],
    });
    await app.register(sensible);
    await app.register(rateLimit, {
        global: true,
        max: 200,
        timeWindow: '1 minute',
        redis,
        keyGenerator(request) {
            // Rate-limit per agentId if authenticated, otherwise per IP
            return request.agentId ?? request.ip;
        },
        errorResponseBuilder(_request, context) {
            return {
                error: {
                    code: 'rate_limit_exceeded',
                    limit: context.max,
                    reset: new Date(context.ttl).toISOString(),
                },
            };
        },
    });
    // ─── Raw body parser for Stripe webhook ──────────────────────────────────
    app.addContentTypeParser('application/json', { parseAs: 'buffer' }, function (_req, body, done) {
        try {
            const json = JSON.parse(body.toString());
            // Attach raw buffer for Stripe signature verification
            done(null, json);
        }
        catch (err) {
            done(err);
        }
    });
    // ─── Error handler ────────────────────────────────────────────────────────
    app.setErrorHandler((error, _request, reply) => {
        if (error instanceof DactylError) {
            return reply.status(error.statusCode).send({
                error: {
                    code: error.code,
                    ...error.detail,
                },
            });
        }
        // Fastify validation errors
        if (error instanceof Error &&
            'validation' in error &&
            Array.isArray(error.validation)) {
            return reply.status(400).send({
                error: {
                    code: 'validation_error',
                    fields: error.validation,
                },
            });
        }
        logger.error({ err: error }, 'Unhandled error');
        return reply.status(500).send({
            error: { code: 'internal_error' },
        });
    });
    // ─── Health check ─────────────────────────────────────────────────────────
    app.get('/health', async (_request, reply) => {
        const checks = {};
        // DB check
        try {
            await getPool().query('SELECT 1');
            checks['db'] = 'ok';
        }
        catch {
            checks['db'] = 'error';
        }
        // Redis check
        try {
            await redis.ping();
            checks['redis'] = 'ok';
        }
        catch {
            checks['redis'] = 'error';
        }
        const healthy = Object.values(checks).every((v) => v === 'ok');
        return reply.status(healthy ? 200 : 503).send({ status: healthy ? 'ok' : 'degraded', checks });
    });
    // ─── Root info ────────────────────────────────────────────────────────────
    app.get('/', async (_request, reply) => {
        return reply.send({
            name: 'dactyl',
            version: '1.0.0',
            description: 'Pure A2A agent task marketplace',
            docs: `${env.BASE_URL}/agent-instructions.md`,
            health: '/health',
        });
    });
    // ─── Routes ───────────────────────────────────────────────────────────────
    await app.register(async (v1) => {
        await registerRoutes(v1);
    }, { prefix: '/v1' });
    return app;
}
//# sourceMappingURL=app.js.map