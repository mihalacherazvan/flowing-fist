import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    use: {
        baseURL: 'http://localhost:3100',
        launchOptions: {
            // Software WebGL so the game renders in headless Chromium
            args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']
        }
    },
    webServer: {
        command: 'pnpm exec vite --port 3100 --strictPort --no-open',
        url: 'http://localhost:3100',
        reuseExistingServer: true
    }
});
