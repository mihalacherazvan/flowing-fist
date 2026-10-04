import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CharacterState } from '@flowing-fist/sim';

interface GameHandle {
    getWorld(): { characters: CharacterState[] };
    getScene(): { animationGroups: { name: string; isPlaying: boolean }[] };
}

function getCharacters(page: Page): Promise<CharacterState[]> {
    return page.evaluate(() => (window as unknown as { flowingFist: GameHandle }).flowingFist.getWorld().characters);
}

function getPlayingAnimations(page: Page): Promise<string[]> {
    return page.evaluate(() => (window as unknown as { flowingFist: GameHandle }).flowingFist.getScene()
        .animationGroups.filter((group) => group.isPlaying).map((group) => group.name).sort());
}

test('training mode: move, dodge and lock on', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');

    // Both character models bring their own animation groups
    await page.waitForFunction(() => {
        const game = (window as unknown as { flowingFist?: GameHandle }).flowingFist;
        return game !== undefined && game.getScene().animationGroups.length >= 12;
    });
    // The canvas is deliberately not clicked: that would lock the pointer and let stray
    // mouse events turn the camera
    await expect.poll(() => getPlayingAnimations(page)).toEqual(['idle', 'idle']);

    // Headless rendering can run slower than real time, so wait on game state rather than the clock.
    // The camera starts looking along +X, so forward moves the player that way.
    await page.keyboard.down('KeyW');
    await expect.poll(async () => (await getCharacters(page))[0].x).toBeGreaterThan(1.5);
    expect(await getPlayingAnimations(page)).toEqual(['idle', 'run-forward']);
    await page.keyboard.up('KeyW');

    const [afterWalk] = await getCharacters(page);
    expect(Math.abs(afterWalk.z)).toBeLessThan(0.01);

    // Right of +X is -Z
    await page.keyboard.down('KeyD');
    await page.keyboard.press('Space');
    await expect.poll(async () => (await getCharacters(page))[0].dodgeCooldownTicks).toBeGreaterThan(0);
    await page.keyboard.up('KeyD');

    const [afterDodge] = await getCharacters(page);
    expect(afterWalk.z - afterDodge.z).toBeGreaterThan(5);

    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await getCharacters(page))[0].lockedOn).toBe(true);
    await expect.poll(() => getPlayingAnimations(page)).toEqual(['idle', 'idle']);

    const [player, dummy] = await getCharacters(page);
    expect(player.yaw).toBeCloseTo(Math.atan2(dummy.x - player.x, dummy.z - player.z), 3);

    // Give the camera time to swing behind the player before the picture
    await page.waitForTimeout(1500);
    await page.screenshot({ path: testInfo.outputPath('locked-on.png') });
    expect(errors).toEqual([]);
});

test('training mode: hit the dummy, then have it block', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await page.waitForFunction(() => {
        const game = (window as unknown as { flowingFist?: GameHandle }).flowingFist;
        return game !== undefined && game.getScene().animationGroups.length >= 12;
    });

    // Lock on and wait for the camera to swing round, so that forward means towards the dummy
    await page.keyboard.press('KeyF');
    await expect.poll(async () => (await getCharacters(page))[0].lockedOn).toBe(true);
    await page.waitForTimeout(1500);

    await page.keyboard.down('KeyW');
    await expect.poll(async () => {
        const [player, dummy] = await getCharacters(page);
        return Math.hypot(dummy.x - player.x, dummy.z - player.z);
    }).toBeLessThan(1.3);
    await page.keyboard.up('KeyW');

    await page.keyboard.press('KeyJ');
    await expect.poll(async () => (await getCharacters(page))[1].health).toBeLessThan(100);
    await expect(page.getByTestId('hud-right')).toContainText('Hit');

    // Let the jab finish, then switch the dummy to guarding
    await expect.poll(async () => (await getCharacters(page))[0].moveIndex).toBe(-1);
    await page.keyboard.press('KeyG');
    await expect.poll(async () => (await getCharacters(page))[1].guarding).toBe(true);

    const healthBeforeBlock = (await getCharacters(page))[1].health;
    await page.keyboard.press('KeyJ');
    await expect.poll(async () => (await getCharacters(page))[1].stamina).toBeLessThan(100);
    expect((await getCharacters(page))[1].health).toBe(healthBeforeBlock);

    expect(errors).toEqual([]);
});
