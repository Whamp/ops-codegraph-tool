import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { CliContext } from '../../src/cli/types.js';

const searchMock = vi.fn();
const resolveModelRoleUriMock = vi.fn(() => 'preset-model-uri');

vi.mock('../../src/domain/search/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/domain/search/index.js')>();
  return {
    ...actual,
    resolveModelRoleUri: resolveModelRoleUriMock,
    search: searchMock,
  };
});

const { command } = await import('../../src/cli/commands/search.js');

function ctx(): CliContext {
  return {
    config: { models: { preset: 'gno-compact' } },
    resolveNoTests: () => false,
    resolveQueryOpts: (opts) => opts,
    formatSize: (bytes) => `${bytes}B`,
    outputResult: () => false,
    program: {} as CliContext['program'],
  };
}

describe('search command model option resolution', () => {
  beforeEach(() => {
    searchMock.mockClear();
    resolveModelRoleUriMock.mockClear();
  });

  test('leaves model undefined when --model is omitted so DB auto-detection can run', async () => {
    await command.execute?.(['needle'], { limit: '15', minScore: '0.2', rrfK: '60' }, ctx());

    expect(resolveModelRoleUriMock).not.toHaveBeenCalled();
    expect(searchMock).toHaveBeenCalledWith(
      'needle',
      undefined,
      expect.objectContaining({ model: undefined }),
    );
  });

  test('passes explicit --model through to search', async () => {
    await command.execute?.(
      ['needle'],
      { limit: '15', minScore: '0.2', model: 'minilm', rrfK: '60' },
      ctx(),
    );

    expect(resolveModelRoleUriMock).not.toHaveBeenCalled();
    expect(searchMock).toHaveBeenCalledWith(
      'needle',
      undefined,
      expect.objectContaining({ model: 'minilm' }),
    );
  });
});
