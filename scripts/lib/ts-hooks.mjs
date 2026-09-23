/**
 * Module hooks that let a plain `node` script import the corpus, which is
 * TypeScript under src/ with extensionless imports and the `@/` alias.
 *
 * WHY NOT `--experimental-strip-types`: CI runs Node 20, which has no type
 * stripping, and stripping alone still would not resolve `../resumeData`
 * without an extension. `typescript` is already a devDependency, so each .ts
 * file is transpiled on load with it — no new tool, and the same compiler
 * `next build` type-checks with.
 *
 * Registered by `load-corpus.mjs`; nothing else should need this file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = new URL('../../src/', import.meta.url);

function withTsExtension(url) {
  const path = fileURLToPath(url);
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`]) {
    if (/\.tsx?$/.test(candidate) && existsSync(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  let target = null;
  if (specifier.startsWith('@/')) {
    target = new URL(specifier.slice(2), SRC);
  } else if (/^\.{1,2}\//.test(specifier) && context.parentURL?.match(/\.tsx?$/)) {
    target = new URL(specifier, context.parentURL);
  }
  const resolved = target && withTsExtension(target);
  if (resolved) return { url: resolved, shortCircuit: true };
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (!/\.tsx?$/.test(url)) return nextLoad(url, context);
  const { outputText } = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
    fileName: fileURLToPath(url),
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  return { format: 'module', source: outputText, shortCircuit: true };
}
