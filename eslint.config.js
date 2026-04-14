// eslint.config.js
import { existsSync } from "node:fs";
import path from "node:path";
import url from "node:url";

import js from "@eslint/js";
import json from "@eslint/json";
import markdown from "@eslint/markdown";
import { defineConfig } from "eslint/config";
import jest from "eslint-plugin-jest";
import jsdoc from "eslint-plugin-jsdoc";
import n from "eslint-plugin-n";
import prettier from "eslint-plugin-prettier/recommended";
import promise from "eslint-plugin-promise";
import pluginSimpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

const sourceFiles = ["**/*.{js,mjs,cjs,ts,mts,cts}"];
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

export default defineConfig([
  {
    name: "Global Ignores",
    ignores: [
      "**/.cache",
      "**/build",
      "**/coverage",
      "**/dist",
      "**/jest",
      "**/node_modules",
      "**/screenshots",
      "**/temp",
      "**/vendor",
    ],
  },
  ...tseslint.configs.strict.map((c) => ({ ...c, files: sourceFiles })),
  { ...n.configs["flat/recommended-script"], files: sourceFiles },
  { ...promise.configs["flat/recommended"], files: sourceFiles },
  { ...jsdoc.configs["flat/recommended"], files: sourceFiles },
  prettier,
  {
    name: "JavaScript & TypeScript Source Files",
    files: sourceFiles,
    languageOptions: {
      sourceType: "module",
      ecmaVersion: "latest",
    },
    linterOptions: {
      reportUnusedDisableDirectives: "error",
      reportUnusedInlineConfigs: "error",
    },
    plugins: {
      js,
      n,
      promise,
      jsdoc,
      "simple-import-sort": pluginSimpleImportSort,
    },
    extends: ["js/recommended"],
    rules: {
      "no-console": "warn",
      "spaced-comment": ["error", "always"],
      "no-unused-vars": "warn",
      "simple-import-sort/imports": ["warn"],
      "simple-import-sort/exports": ["warn"],
      "n/prefer-node-protocol": "error",
      "n/no-unsupported-features/node-builtins": [
        "error",
        { ignores: ["fetch"] },
      ],
      "n/no-extraneous-import": "off",
      "n/no-unpublished-import": "off",
      "promise/always-return": "warn",
      "promise/catch-or-return": "warn",
      "promise/no-nesting": "warn",
      "jsdoc/tag-lines": ["error", "any", { startLines: 1, endLines: 0 }],
      "jsdoc/check-tag-names": [
        "warn",
        { definedTags: ["created", "contributor", "remarks"] },
      ],
      "jsdoc/no-undefined-types": "off",
      "prettier/prettier": "warn",
    },
  },
  {
    name: "JavaScript Source Files",
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    name: "TypeScript Source Files",
    files: ["**/src/**/*.{ts,mts,cts}"],
    ignores: ["**/src/**/*.test.{ts,mts,cts}", "**/src/**/*.spec.{ts,mts,cts}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: existsSync(path.join(__dirname, "tsconfig.eslint.json"))
          ? "./tsconfig.eslint.json"
          : "./tsconfig.build.json",
      },
    },
    rules: {
      "no-redeclare": "off",
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          vars: "all",
          args: "after-used",
          ignoreRestSiblings: true,
          varsIgnorePattern: "^_",
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/require-await": "warn",
    },
  },
  {
    name: "Jest Test Files",
    files: ["**/*.spec.ts", "**/*.test.ts", "**/__test__/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: "./tsconfig.jest.json",
      },
    },
    plugins: { jest },
    rules: {
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-function": "off",
      "jsdoc/require-jsdoc": "off",
      ...jest.configs.recommended.rules,
    },
  },
  {
    name: "JSON Files",
    files: ["**/*.json"],
    ignores: ["**/devcontainer.json"],
    plugins: { json },
    language: "json/json",
    rules: {
      "json/no-duplicate-keys": "error",
    },
  },
  {
    name: "JSONC files",
    files: ["**/devcontainer.json", "**/*.jsonc"],
    plugins: { json },
    language: "json/jsonc",
  },
  {
    name: "Markdown Files",
    files: ["**/*.md"],
    plugins: { markdown },
    language: "markdown/commonmark",
    rules: {
      "markdown/no-html": "off",
    },
  },
]);
