import { defineConfig } from 'vitest/config';

export default defineConfig({
    base: './',
    server: {
        port: 3000,
        open: true
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true
    },
    test: {
        // e2e/ belongs to Playwright
        include: ['src/**/*.test.ts']
    }
});
