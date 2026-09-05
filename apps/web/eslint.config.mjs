import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * `eslint-config-next` 16 ships flat configs directly, so the `FlatCompat` shim older guides use is
 * both unnecessary and broken here — it tries to JSON-stringify a plugin object that contains a
 * cycle.
 */
export default [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `.wrangler/` is Workers' own local-preview scratch space (miniflare's bundled worker,
    // dev-session state) — it never exists in a fresh checkout, only after `preview`/`dev` has
    // run locally, but linting it when it happens to be there pulls in a bundled, minified copy
    // of the entire Worker and buries real findings under thousands of generated-code warnings.
    ignores: [
      ".next/**",
      ".open-next/**",
      ".wrangler/**",
      "public/**",
      "node_modules/**",
      "*.config.mjs",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
