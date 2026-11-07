import type { Linter } from 'eslint';

export declare function createConfig(options: { rootDir: string }): Linter.Config[];
export declare function boundaryConfigs(rootDir: string): Linter.Config[];
