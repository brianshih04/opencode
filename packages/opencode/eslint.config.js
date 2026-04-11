import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": ["error", { "fixStyle": "inline-type-imports", "disallowTypeAnnotations": false }],
      "@typescript-eslint/consistent-type-exports": "error",
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": "warn",
      "@typescript-eslint/await-thenable": "warn",
      "no-console": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "*.js", "*.cjs"],
  },
]
