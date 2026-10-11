import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const z3WasmHash = createHash('sha256').update(readFileSync(new URL('./public/wasm/z3-built.wasm', import.meta.url))).digest('hex');

const isolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Vite's static middleware returns 304 before applying server/preview headers.
// Safari rejects cached workers without COEP, including Z3's nested pthread.
function applyIsolationHeaders({ middlewares }) {
    middlewares.use((request, response, next) => {
        for (const [name, value] of Object.entries(isolationHeaders)) response.setHeader(name, value);
        if (/\/wasm\/z3-built\.[a-f0-9]{64}\.wasm$/.test(request.url?.split('?')[0] ?? '')) {
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
        next();
    });
}

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    plugins: [react(), tailwindcss(), {
        name: 'cross-origin-isolation-headers',
        configureServer: applyIsolationHeaders,
        configurePreviewServer: applyIsolationHeaders,
    }],
    optimizeDeps: {
        // Worker-only CommonJS imports must be discovered before the first
        // solve; late discovery otherwise reloads the page and loses its result.
        include: [
            'z3-solver/build/low-level/wrapper.__GENERATED__',
            'z3-solver/build/high-level',
            'z3-solver/build/z3-built',
        ],
    },
    base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? '/flow-free-solver/' : '/'),
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
    server: {
        open: true,
        headers: isolationHeaders,
    },
    preview: { headers: isolationHeaders },
    define: {
        __Z3_WASM_FILE__: JSON.stringify(`z3-built.${z3WasmHash}.wasm`),
        global: 'globalThis',
    },
    worker: {
        format: 'es',
    },
});
