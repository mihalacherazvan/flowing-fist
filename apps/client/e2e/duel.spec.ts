import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import type { CharacterState } from '@flowing-fist/sim';

interface GameHandle {
    getWorld(): { tick: number; characters: CharacterState[] };
    getLocalPlayerIndex(): number;
    getScene(): { animationGroups: unknown[] };
}

async function openGame(browser: Browser, query: string, errors: string[]): Promise<Page> {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto(`/${query}`);
    await page.waitForFunction(() => {
        const game = (window as unknown as { flowingFist?: GameHandle }).flowingFist;
        return game !== undefined && game.getScene().animationGroups.length >= 12;
    });

    return page;
}

function getCharacters(page: Page): Promise<CharacterState[]> {
    return page.evaluate(() => (window as unknown as { flowingFist: GameHandle }).flowingFist.getWorld().characters);
}

function getLocalPlayerIndex(page: Page): Promise<number> {
    return page.evaluate(() => (window as unknown as { flowingFist: GameHandle }).flowingFist.getLocalPlayerIndex());
}

for (const latencyQuery of ['', '?latency=80']) {
    test(`online duel${latencyQuery ? ' with simulated latency' : ''}: both players see the same fight`, async ({ browser }) => {
        const errors: string[] = [];
        const firstPage = await openGame(browser, latencyQuery, errors);
        const secondPage = await openGame(browser, latencyQuery, errors);

        await firstPage.keyboard.press('KeyO');
        await expect(firstPage.getByTestId('hud-status')).toContainText('waiting for an opponent');

        await secondPage.keyboard.press('KeyO');
        await expect(firstPage.getByTestId('hud-status')).toContainText('predicting');
        await expect(secondPage.getByTestId('hud-status')).toContainText('predicting');

        const firstIndex = await getLocalPlayerIndex(firstPage);
        const secondIndex = await getLocalPlayerIndex(secondPage);
        expect([firstIndex, secondIndex].sort()).toEqual([0, 1]);

        // The first player locks on, walks up to the second and hits them
        await firstPage.keyboard.press('KeyF');
        await expect.poll(async () => (await getCharacters(firstPage))[firstIndex].lockedOn).toBe(true);
        await firstPage.waitForTimeout(1500);

        await firstPage.keyboard.down('KeyW');
        await expect.poll(async () => {
            const characters = await getCharacters(firstPage);
            return Math.hypot(characters[0].x - characters[1].x, characters[0].z - characters[1].z);
        }).toBeLessThan(1.5);
        await firstPage.keyboard.up('KeyW');

        await firstPage.keyboard.press('KeyJ');

        // The second player sees themselves get hit
        await expect.poll(async () => (await getCharacters(secondPage))[secondIndex].health).toBeLessThan(100);

        // Once things settle, both pages hold the same positions and health
        await expect.poll(async () => {
            const [first, second] = await Promise.all([getCharacters(firstPage), getCharacters(secondPage)]);
            const moving = first.some((character) => character.moveIndex >= 0 || character.stunTicks > 0);

            return !moving && [0, 1].every((index) => Math.abs(first[index].x - second[index].x) < 1e-6
                && Math.abs(first[index].z - second[index].z) < 1e-6
                && first[index].health === second[index].health);
        }).toBe(true);

        // Leaving ends the fight for the other player
        await secondPage.keyboard.press('KeyO');
        await expect(firstPage.getByTestId('hud-status')).toContainText('Opponent left');

        expect(errors).toEqual([]);

        // Otherwise the pages keep rendering and slow down every later test
        await firstPage.context().close();
        await secondPage.context().close();
    });
}
