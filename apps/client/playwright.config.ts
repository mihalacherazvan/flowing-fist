import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    // Software rendering is slow, and the first page load also waits for Vite to bundle dependencies
    workers: 1,
    timeout: 120_000,
    expect: { timeout: 15_000 },
    use: {
        baseURL: 'http://localhost:3100',
        launchOptions: {
            // Software WebGL so the game renders in headless Chromium
            args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
        }
    },
    webServer: [
        {
            command: 'pnpm exec vite --port 3100 --strictPort --no-open',
            url: 'http://localhost:3100',
            reuseExistingServer: true
        },
        {
            command: 'pnpm --filter @flowing-fist/server start',
            port: 2567,
            reuseExistingServer: true
        }
    ]
});
