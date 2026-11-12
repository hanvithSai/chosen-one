import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "data/runtime/", "video/"] },
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
      // The spec package root cannot be loaded by plain Node; use server/commerce/cartSpec.ts.
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@paypal/agentic-commerce-spec",
              message: "Import from server/commerce/cartSpec.ts instead.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["server/commerce/cartSpec.ts"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
  prettier,
);
