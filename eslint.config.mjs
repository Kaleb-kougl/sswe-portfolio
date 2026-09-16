import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ignore custom project directories.
    // These are sibling packages with their own repos, cloned alongside and
    // gitignored. Each one must be registered in FOUR places or it leaks into
    // the portfolio's tooling: .gitignore, this list, tsconfig "exclude", and
    // vitest.config.ts "exclude".
    "r3f-projectiles/**",
    "roblox-css/**",
    "r3f-scraper/**",
    "public/draco-gltf/**",
  ]),
  {
    files: ["__tests__/**/*.ts", "__tests__/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-function-type": "off",
    },
  },
]);

export default eslintConfig;
