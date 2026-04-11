// jest.config.js
// @ts-check

import { createDefaultEsmPreset } from 'ts-jest';

/** @type {{ tsconfig: string }} */
const tsJestEsmPresetOptions = {
  tsconfig: './tsconfig.jest.json',
};

/** @type {import('ts-jest').DefaultEsmPreset} */
const presetConfig = createDefaultEsmPreset(tsJestEsmPresetOptions);

/** @type {import('ts-jest').JestConfigWithTsJest} */
const jestConfig = {
  ...presetConfig,
  testEnvironment: 'node',
  cacheDirectory: '<rootDir>/.cache/jest',
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^matterbridge/matter/clusters$': '<rootDir>/node_modules/matterbridge/dist/matter/clusters.js',
    '^matterbridge/matter/types$': '<rootDir>/node_modules/matterbridge/dist/matter/types.js',
    '^matterbridge/matter/devices$': '<rootDir>/node_modules/matterbridge/dist/matter/devices.js',
    '^matterbridge/matter/behaviors$': '<rootDir>/node_modules/matterbridge/dist/matter/behaviors.js',
    '^matterbridge/matter/endpoints$': '<rootDir>/node_modules/matterbridge/dist/matter/endpoints.js',
    '^matterbridge/matter$': '<rootDir>/node_modules/matterbridge/dist/matter/export.js',
    '^matterbridge/logger$': '<rootDir>/node_modules/matterbridge/dist/logger/export.js',
    '^matterbridge/storage$': '<rootDir>/node_modules/matterbridge/dist/storage/export.js',
    '^matterbridge/clusters$': '<rootDir>/node_modules/matterbridge/dist/clusters/export.js',
    '^matterbridge/devices$': '<rootDir>/node_modules/matterbridge/dist/devices/export.js',
    '^matterbridge/utils$': '<rootDir>/node_modules/matterbridge/dist/utils/export.js',
    '^matterbridge/jestutils$': '<rootDir>/node_modules/matterbridge/dist/jestutils/export.js',
    '^matterbridge/utils$': '<rootDir>/node_modules/matterbridge/dist/utils/export.js',
    '^matterbridge$': '<rootDir>/node_modules/matterbridge/dist/export.js',
  },
  testPathIgnorePatterns: ['/.cache/', '/dist/', '/node_modules/', '/src/mock/'],
  coveragePathIgnorePatterns: ['/.cache/', '/dist/', '/node_modules/', '/src/mock/'],
  maxWorkers: '100%',
};

export default jestConfig;
