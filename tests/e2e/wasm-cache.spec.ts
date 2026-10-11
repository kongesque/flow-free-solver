import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Verify the served binary, not just a non-null solver result or filename.
test('versioned Z3 binary matches its hash and permits immutable browser caching', async ({ page }) => {
    const bytes = readFileSync('public/wasm/z3-built.wasm');
    const hash = createHash('sha256').update(bytes).digest('hex');
    await page.goto('./');
    const result = await page.evaluate(async filename => {
        const url = new URL(`wasm/${filename}`, document.baseURI).href;
        const first = await fetch(url);
        const policy = first.headers.get('cache-control');
        const binary = await first.arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', binary);
        const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
        return { policy, hash };
    }, `z3-built.${hash}.wasm`);
    expect(result.hash).toBe(hash);
    expect(result.policy).toBe('public, max-age=31536000, immutable');
});
