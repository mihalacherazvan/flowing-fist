import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { CharacterState } from '@flowing-fist/sim';

interface GameHandle {
    getWorld(): { characters: CharacterState[] };
    getScene(): { animationGroups: unknown[] };
}

// Index of back-right in the simulation's stance order; a hook ends there, a jab does not
const BACK_RIGHT = 2;

async function waitForGame(page: Page): Promise<void> {
    await page.waitForFunction(() => {
        const game = (window as unknown as { flowingFist?: GameHandle }).flowingFist;
        return game !== undefined && game.getScene().animationGroups.length >= 12;
    });
}

function getPlayer(page: Page): Promise<CharacterState> {
    return page.evaluate(() => (window as unknown as { flowingFist: GameHandle }).flowingFist.getWorld().characters[0]);
}

test('deck editor: build a deck, fight with it, keep it across a reload and a registration', async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    await waitForGame(page);

    await page.keyboard.press('KeyB');
    await expect(page.getByTestId('account-name')).toContainText('Guest-');

    // A new player starts from the default deck: jab, cross, hook
    const firstSlot = page.getByTestId('deck-slot-front-right-0');
    await expect(firstSlot).toHaveValue('jab');

    // The hook is in use, so it only becomes available for the first slot once its own slot is emptied
    await expect(firstSlot.locator('option[value="hook"]')).toHaveCount(0);
    await page.getByTestId('deck-slot-front-right-2').selectOption('');
    await firstSlot.selectOption('hook');

    // The cross does not start where the hook ends, so it was dropped
    await expect(page.getByTestId('deck-slot-front-right-1')).toHaveValue('');

    // Typing must reach the field and not the game: O would start an online duel
    await page.getByTestId('deck-name').fill('');
    await page.getByTestId('deck-name').pressSequentially('Hooks only');
    await expect(page.getByTestId('hud-status')).toContainText('Training');

    await page.getByTestId('deck-save').click();
    await expect(page.getByTestId('deck-message')).toContainText('This is the deck you fight with');
    await page.screenshot({ path: testInfo.outputPath('deck-editor.png') });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu')).toHaveCount(0);

    // Training restarted with the new deck: the first attack is now the hook
    await page.keyboard.press('KeyJ');
    await expect.poll(async () => (await getPlayer(page)).stance).toBe(BACK_RIGHT);

    // The deck belongs to the guest account, which the browser remembers
    await page.reload();
    await waitForGame(page);
    await page.getByTestId('menu-open').click();
    await expect(page.getByTestId('deck-name')).toHaveValue('Hooks only');
    await expect(page.getByTestId('deck-slot-front-right-0')).toHaveValue('hook');

    // Registering turns the guest into an account and keeps the deck
    await page.getByTestId('account-register').click();
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.com`);
    await page.getByLabel('Password').fill('correct horse battery');
    await page.getByLabel('Display name').fill('Tester');
    await page.getByTestId('account-submit').click();

    await expect(page.getByTestId('account-name')).toContainText('Tester');
    await expect(page.getByTestId('deck-name')).toHaveValue('Hooks only');
    await page.screenshot({ path: testInfo.outputPath('registered.png') });

    expect(errors).toEqual([]);
});
