import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export default defineConfig({
 root,
 resolve: { alias: { '@': root } },
 test: { include: ['app/api/reports/**/*.test.ts', 'lib/reports/**/*.test.ts'] },
});
