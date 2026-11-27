import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Mirror the TypeScript path alias under Node when exercising API routes.
export default defineConfig({
 resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
});
