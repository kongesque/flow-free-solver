import type { Page } from '@playwright/test';

export async function openBoardOptions(page: Page) {
    if (await page.locator('.board-options').getAttribute('open') === null) {
        await page.locator('.board-options summary').click();
    }
}

export async function selectWallTool(page: Page) {
    await openBoardOptions(page);
    const toggle = page.getByRole('button', { name: 'Walls', exact: true });
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
}

// Generation scenarios explicitly opt into the optional generator UI.
export async function optIntoGenerator(page: Page) {
    await page.addInitScript(() => {
        if (localStorage.getItem('flow-show-generator') === null) localStorage.setItem('flow-show-generator', 'true');
    });
}
