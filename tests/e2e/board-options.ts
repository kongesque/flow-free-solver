import type { Dialog, Page } from '@playwright/test';

export async function openBoardOptions(page: Page) {
    if (await page.locator('.board-options').getAttribute('open') === null) {
        await page.locator('.board-options summary').click();
    }
}

export async function selectWallTool(page: Page) {
    await openBoardOptions(page);
    const toggle = page.getByRole('button', { name: 'Draw walls', exact: true });
    if (await toggle.getAttribute('aria-pressed') !== 'true') await toggle.click();
}

// Existing setup tests deliberately discard the previous puzzle when resizing.
export async function resizeBoard(page: Page, label: string, value: string) {
    const accept = (dialog: Dialog) => dialog.accept();
    page.once('dialog', accept);
    try {
        await page.getByRole('combobox', { name: label }).selectOption(value);
    } finally {
        page.off('dialog', accept);
    }
}
