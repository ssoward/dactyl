import { z } from 'zod';
const envSchema = z.object({
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    RS256_PRIVATE_KEY: z.string().min(1),
    RS256_PUBLIC_KEY: z.string().min(1),
    WEBHOOK_SIGNING_SECRET: z.string().min(32),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET: z.string().min(1),
    PORT: z.coerce.number().int().positive().default(3000),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    BASE_URL: z.string().url().default('http://localhost:3000/v1'),
    CLAIM_TTL_SECONDS: z.coerce.number().int().positive().default(600),
    PROGRESS_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});
function loadEnv() {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
        const issues = result.error.issues
            .map((i) => `  ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        throw new Error(`Invalid environment variables:\n${issues}`);
    }
    return result.data;
}
export const env = loadEnv();
//# sourceMappingURL=env.js.map