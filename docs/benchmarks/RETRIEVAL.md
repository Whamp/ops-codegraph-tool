# Retrieval Model Benchmark

`scripts/retrieval-benchmark.ts` compares Codegraph's current embedding baseline, existing notable alternatives, and the GNO/Qwen-style preset path on bundled code-retrieval fixtures.

## What it measures

Fixtures cover:

- **Code intent search** — natural-language behavior queries.
- **Identifier search** — exact symbol/constant lookup.
- **Graph-aware symbol context** — queries that require callers/imports/surrounding context in symbol text.
- **Ambiguous natural-language queries** — user phrasing that should map to implementation concepts.

Compared model lanes:

- `current-default` (`nomic-v1.5`) — current Codegraph default; this benchmark does not change it.
- `minilm-baseline` — fast legacy transformer baseline.
- `jina-code` — existing code-aware transformer alternative.
- `gno-qwen-compact` — Qwen embedding role from the GNO-inspired compact preset.

Output is JSON with `hitAt1`, `hitAt3`, `hitAt5`, `mrr`, per-query ranks, elapsed embedding/search time, and local embedding-cost counts. Cloud cost is always reported as `0` because the benchmark is designed for local/offline runs.

## CI-safe smoke run (default)

The default mode is deterministic and does not load models, download weights, or call cloud services:

```bash
node --experimental-strip-types --import ./scripts/ts-resolve-loader.js scripts/retrieval-benchmark.ts --mock --top-k 3 > retrieval-smoke.json
```

This mode validates fixture coverage, model-lane wiring, metrics, and machine-readable output shape.

## Real local benchmark

Real mode embeds the bundled fixtures with local model runtimes. Build first so the script can import compiled Codegraph modules:

```bash
npm run build
CODEGRAPH_NO_AUTO_DOWNLOAD=1 node --experimental-strip-types --import ./scripts/ts-resolve-loader.js scripts/retrieval-benchmark.ts --real > retrieval-real.json
```

Notes:

- No cloud service or API key is required.
- Transformer lanes may use the local Hugging Face cache used by `@huggingface/transformers`.
- The Qwen/GGUF lane requires optional `node-llama-cpp` and a cached GGUF model file for the `hf:` URI, or an explicitly allowed local download.
- By default, use `CODEGRAPH_NO_AUTO_DOWNLOAD=1` or omit `--allow-downloads` to avoid surprise downloads. To permit local model downloads intentionally, pass `--allow-downloads`.
- Issue #13 owns any decision to change the default model; benchmark results are evidence only.
