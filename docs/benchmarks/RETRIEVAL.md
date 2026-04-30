# Retrieval Model Benchmark

`scripts/retrieval-benchmark.ts` compares Codegraph's current embedding baseline, existing notable alternatives, and the GNO/Qwen-style preset path on bundled code-retrieval fixtures.

## What it measures

Fixtures cover:

- **Code intent search** — natural-language behavior queries.
- **Identifier search** — exact symbol/constant lookup.
- **Graph-aware symbol context** — queries that require callers/imports/surrounding context in symbol text.
- **Ambiguous natural-language queries** — user phrasing that should map to implementation concepts.

Compared model lanes:

- `current-default` (`nomic-v1.5`) — legacy Codegraph default kept for compatibility comparisons.
- `minilm-baseline` — fast legacy transformer baseline.
- `jina-code` — existing code-aware transformer alternative.
- `gno-qwen-compact` — Qwen embedding role from the GNO-inspired compact preset.

## Issue #13 decision summary

Maintainer decision: switch defaults now to the GNO/Qwen compact path for all retrieval roles. `gno-compact` is the default preset, and the default embedding role is `hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf`.

Review summary from the benchmark lane design and migration assessment:

- **Quality:** the GNO/Qwen compact lane is the target higher-quality code retrieval path and is now preferred over the legacy `nomic-v1.5` baseline; the benchmark continues to keep legacy lanes so regressions can be compared.
- **Speed:** the compact Qwen GGUF role is the smallest GNO lane and avoids making the balanced/quality generation models the default path. Real speed still depends on local `node-llama-cpp` hardware/runtime.
- **Install size:** default use includes the `node-llama-cpp` runtime plus the cached Qwen GGUF embedding file. Codegraph still avoids test-time or smoke-benchmark downloads, and explicit legacy transformer aliases remain available for smaller embedding runs.
- **Migration impact:** existing `.codegraphrc` files with `embeddings.model` such as `nomic-v1.5` continue to override the default embedding role. The `codegraph-default` preset remains available as a legacy compatibility preset.

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
- Transformer lanes use `@huggingface/transformers` and may read the local Hugging Face cache or use network downloads according to that runtime's environment settings (for example `HF_HUB_OFFLINE`). The benchmark's `--allow-downloads` flag does not override transformer-runtime policy.
- The Qwen/GGUF lane requires the bundled `node-llama-cpp` runtime and a cached GGUF model file for the `hf:` URI, or an explicitly allowed Codegraph GGUF cache download.
- By default, use `CODEGRAPH_NO_AUTO_DOWNLOAD=1`, `HF_HUB_OFFLINE=1`, or omit `--allow-downloads` to avoid surprise downloads across lanes. To permit Codegraph GGUF model downloads intentionally, pass `--allow-downloads`.
- The real benchmark currently creates separate document and query embedding ports for the same model so asymmetric input formatting is measured correctly. On GGUF/Qwen runs this can mean two wrappers for one model; plan memory/VRAM accordingly.
- Issue #13 resolved the default decision in favor of GNO/Qwen compact defaults. Keep this benchmark as regression evidence and run with explicit download/cache policy.
