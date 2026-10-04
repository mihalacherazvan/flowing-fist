import { DEFAULT_SERVER_PORT } from '@flowing-fist/protocol';

// Matches docker-compose.yml, so a fresh checkout runs without any configuration
const DEVELOPMENT_DATABASE_URL = 'mysql://root:flowing_fist@localhost:3307/flowing_fist';
const DEVELOPMENT_JWT_SECRET = 'development-only-secret-do-not-deploy';

const isProduction = process.env.NODE_ENV === 'production';

function readSecret(name: string, developmentValue: string): string {
    const value = process.env[name];
    if (value) return value;
    if (isProduction) throw new Error(`${name} must be set in production`);

    return developmentValue;
}

export const config = {
    port: Number(process.env.PORT ?? DEFAULT_SERVER_PORT),
    databaseUrl: readSecret('DATABASE_URL', DEVELOPMENT_DATABASE_URL),
    jwtSecret: readSecret('JWT_SECRET', DEVELOPMENT_JWT_SECRET),
    /** Requests per minute allowed from one address to the sign-in endpoints */
    authRateLimitPerMinute: Number(process.env.AUTH_RATE_LIMIT_PER_MINUTE ?? 60)
};
