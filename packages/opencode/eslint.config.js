import tseslint from "@typescript-eslint/eslint-plugin"
import tsparser from "@typescript-eslint/parser"

export default [
  {
    files: ["src/**/*.ts"],
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
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
    },
  },
  // CLI commands use console.log for output — that's correct
  {
    files: ["src/cli/cmd/**/*.ts", "src/cli/cmd/**/*.tsx"],
    rules: {
      "no-console": "off",
    },
  },
  {
    ignores: ["node_modules/", "dist/", "*.js"],
  },
]
