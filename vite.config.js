import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { fileURLToPath, URL } from 'node:url';

const isolationHeaders = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    plugins: [react(), tailwindcss()],
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
