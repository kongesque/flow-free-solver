import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { fileURLToPath, URL } from 'node:url';

const isolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

// Vite's static middleware returns 304 before applying server/preview headers.
// Safari rejects cached workers without COEP, including Z3's nested pthread.
function applyIsolationHeaders({ middlewares }) {
    middlewares.use((_request, response, next) => {
        for (const [name, value] of Object.entries(isolationHeaders)) response.setHeader(name, value);
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
        global: 'globalThis',
    },
    worker: {
        format: 'es',
    },
});
