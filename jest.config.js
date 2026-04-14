// jest.config.js
// @ts-check

import { createDefaultEsmPreset } from "ts-jest";

/** @type {{ tsconfig: string }} */
const tsJestEsmPresetOptions = {
  tsconfig: "./tsconfig.jest.json",
};

/** @type {import('ts-jest').DefaultEsmPreset} */
const presetConfig = createDefaultEsmPreset(tsJestEsmPresetOptions);

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  ...presetConfig,
  testEnvironment: "node",
  cacheDirectory: "<rootDir>/.cache/jest",
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" }, // Handle ESM imports by removing the .js extension
  testPathIgnorePatterns: [
    "/.cache/",
    "/dist/",
    "/node_modules/",
    "/src/mock/",
  ],
  coveragePathIgnorePatterns: [
    "/.cache/",
    "/dist/",
    "/node_modules/",
    "/src/mock/",
  ],
  maxWorkers: "100%",
};

export default jestConfig;
