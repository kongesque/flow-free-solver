import type { Page } from '@playwright/test';

export async function openBoardOptions(page: Page) {
    if (await page.locator('.mobile-board-options summary').isVisible()
        && await page.locator('.mobile-board-options').getAttribute('open') === null) {
        await page.locator('.board-options summary').click();
    }
}
