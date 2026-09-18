// 运行：node scripts/run-settlement-check.mjs
// 用 esbuild 把 TS 源码打包，注入内存版 idb-keyval 与 localStorage 桩，
// 在 Node 中端到端校验诚信金结算。
import { build } from '../node_modules/.pnpm/esbuild@0.25.12/node_modules/esbuild/lib/main.js';
import { pathToFileURL } from 'node:url';
import { writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const stubPath = resolve(__dirname, 'idb-keyval.stub.mjs');
const entry = resolve(__dirname, 'settlement-check.ts');
const outfile = resolve(__dirname, '.settlement-check.bundle.mjs');

const aliasPlugin = {
  name: 'alias',
  setup(b) {
    b.onResolve({ filter: /^@\// }, (args) => {
      const rel = args.path.slice(2);
      const candidates = [resolve(root, 'src', rel), resolve(root, 'src', `${rel}.ts`)];
      return { path: candidates[1] };
    });
  },
};

await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile,
  alias: { 'idb-keyval': stubPath },
  plugins: [aliasPlugin],
  logLevel: 'warning',
});

// localStorage 内存桩
const ls = new Map();
globalThis.localStorage = {
  getItem: (k) => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: (k) => ls.delete(k),
  clear: () => ls.clear(),
};

try {
  await import(pathToFileURL(outfile).href);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  rmSync(outfile, { force: true });
}
