import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "data/runtime/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["server/**/*.ts", "scripts/**/*.{ts,mjs}", "tests/**/*.ts", "*.{js,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["web/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  prettier,
);
