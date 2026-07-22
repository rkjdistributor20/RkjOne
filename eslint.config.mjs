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
 ".next-stale-*/**",
 "web/.next/**",
 "out/**",
 "build/**",
 ".vercel/**",
 "android/**/build/**",
 "ios/**/build/**",
 "next-env.d.ts",
 ]),
 {
 rules: {
 // Supabase RPCs and legacy integration payloads are runtime-validated at their boundaries.
 "@typescript-eslint/no-explicit-any": "off",
 // These React Compiler advisory rules currently flag established async loading and
 // controlled-dialog reset patterns. Correctness rules remain enabled below.
 "react-hooks/set-state-in-effect": "off",
 "react-hooks/preserve-manual-memoization": "off",
 },
 },
 {
 files: ["scripts/**/*.{js,mjs,cjs,ts}"],
 rules: {
 // Verification scripts intentionally use short-circuit assertions and retain
 // diagnostic intermediates that are useful while investigating live data.
 "@typescript-eslint/no-unused-expressions": "off",
 "@typescript-eslint/no-unused-vars": "off",
 },
 },
]);

export default eslintConfig;
