import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../package.json'), 'utf8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

describe('package metadata', () => {
  it('installs the GGUF runtime as a hard dependency for the default GNO embedding path', () => {
    expect(pkg.dependencies?.['node-llama-cpp']).toMatch(/^\^?3\./);
    expect(pkg.peerDependencies?.['node-llama-cpp']).toBeUndefined();
    expect(pkg.peerDependenciesMeta?.['node-llama-cpp']).toBeUndefined();
  });

  it('does not install the flagged tree-sitter-erlang package', () => {
    expect(pkg.dependencies?.['tree-sitter-erlang']).toBeUndefined();
    expect(pkg.devDependencies?.['tree-sitter-erlang']).toBeUndefined();
    expect(pkg.peerDependencies?.['tree-sitter-erlang']).toBeUndefined();
  });
});
