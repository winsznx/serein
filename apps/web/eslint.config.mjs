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
    ignores: [".next/**", ".open-next/**", "public/**", "node_modules/**", "*.config.mjs"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
];
