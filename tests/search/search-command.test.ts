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

  test('passes additive --expand flag through to search', async () => {
    await command.execute?.(
      ['needle'],
      { limit: '15', minScore: '0.2', rrfK: '60', expand: true },
      ctx(),
    );

    expect(searchMock).toHaveBeenCalledWith(
      'needle',
      undefined,
      expect.objectContaining({ expand: true }),
    );
  });

  test('parses repeatable --query-mode values and disables generated expansion by default', async () => {
    await command.execute?.(
      ['auth flow'],
      {
        limit: '15',
        minScore: '0.2',
        rrfK: '60',
        queryMode: ['term:"refresh token"', 'intent:token rotation'],
      },
      ctx(),
    );

    expect(searchMock).toHaveBeenCalledWith(
      'auth flow',
      undefined,
      expect.objectContaining({
        expand: false,
        queryTextKind: 'plain',
        queryModes: [
          { mode: 'term', text: '"refresh token"' },
          { mode: 'intent', text: 'token rotation' },
        ],
      }),
    );
  });

  test('rejects explicit hyde-only query-mode values without positional query text', () => {
    expect(command.validate?.([''], { queryMode: ['hyde:hypothetical answer'] }, ctx())).toMatch(
      /hyde-only inputs are not allowed/i,
    );
  });

  test('normalizes multi-line structured query syntax before searching', async () => {
    await command.execute?.(
      ['auth flow\nterm: "refresh token"\nintent: token rotation'],
      { limit: '15', minScore: '0.2', rrfK: '60' },
      ctx(),
    );

    expect(searchMock).toHaveBeenCalledWith(
      'auth flow',
      undefined,
      expect.objectContaining({
        expand: false,
        queryTextKind: 'plain',
        queryModes: [
          { mode: 'term', text: '"refresh token"' },
          { mode: 'intent', text: 'token rotation' },
        ],
      }),
    );
  });

  test('returns validation errors for invalid structured query inputs', () => {
    expect(command.validate?.(['needle'], { queryMode: ['vector: nope'] }, ctx())).toMatch(
      /Invalid --query-mode value/,
    );
    expect(command.validate?.(['needle\nterm:   '], {}, ctx())).toMatch(
      /line 2 must contain non-empty text after term:/,
    );
  });
});
