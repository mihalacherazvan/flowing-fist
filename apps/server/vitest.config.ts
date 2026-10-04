import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Every test file shares one test database, so they must not overlap
        fileParallelism: false,
        env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'mysql://root:flowing_fist@localhost:3307/flowing_fist_test',
            AUTH_RATE_LIMIT_PER_MINUTE: '1000'
        }
    }
});
