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
