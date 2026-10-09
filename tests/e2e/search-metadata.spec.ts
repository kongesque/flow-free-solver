import { expect, test } from '@playwright/test';

test('search and sharing metadata is available before JavaScript and describes the current app', async ({ page, request }) => {
    const response = await request.get('./');
    expect(response.ok()).toBe(true);
    const html = await response.text();
    const rawSchema = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(rawSchema).toBeDefined();
    const graph = JSON.parse(rawSchema!)['@graph'];
    await page.goto('./');
    const title = await page.title();
    expect(title).toContain('Bridges, Warps');
    expect(title).not.toMatch(/instant|AI/i);
    for (const selector of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) {
        await expect(page.locator(selector)).toHaveAttribute('content', title);
    }
    const description = await page.locator('meta[name="description"]').getAttribute('content');
    for (const selector of ['meta[property="og:description"]', 'meta[name="twitter:description"]']) {
        await expect(page.locator(selector)).toHaveAttribute('content', description!);
    }
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', canonical!);
    expect(graph.map((item: { '@type': string }) => item['@type'])).toEqual(['WebSite', 'WebPage', 'WebApplication']);
    for (const item of graph) expect(item.url).toBe(canonical);
    expect(graph.find((item: { '@type': string }) => item['@type'] === 'WebApplication').description).toBe(description);
    await expect(page.locator('.solver-about')).toContainText('Solve Flow Free puzzles locally.');
    const image = await page.locator('meta[property="og:image"]').getAttribute('content');
    await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', image!);
    await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute('content', /colored dots/);
    const sitemap = await request.get('./sitemap.xml');
    expect(await sitemap.text()).toContain(`<loc>${canonical}</loc>`);
});
