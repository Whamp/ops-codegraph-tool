# Retrieval Workflow Guide

This guide covers Codegraph's current retrieval workflow for semantic and hybrid search: model roles, embedding, cache policy, query expansion, reranking, stale-vector recovery, and migration from legacy config.

The default embedding model remains `nomic-v1.5`. Issue #13 owns any future default-model decision.

## Quick workflow

```bash
codegraph build
codegraph embed                         # uses config/default embedding model and structured symbol text
codegraph search "handle auth"          # hybrid BM25 + semantic search
codegraph search "parseConfig" --mode keyword
codegraph search "auth" --query-mode term:auth --query-mode intent:"validate bearer token"
```

Re-run `codegraph embed` whenever you change the embedding model, embedding strategy, compatibility profile, or after a full graph rebuild that makes stored embeddings stale.

## Model roles, presets, and overrides

Codegraph resolves retrieval models by role:

| Role | Purpose | Used by |
| --- | --- | --- |
| `embed` | Creates vectors for indexed symbols and search queries. | `codegraph embed`, semantic/hybrid search |
| `rerank` | Optional cross-encoder-style final ranking of fused candidates. | Hybrid search when reranking is enabled |
| `expand` | Optional query expansion model for lexical/vector variants and HyDE text. | Expansion-capable callers/providers |
| `gen` | Reserved generation role for workflows that need text generation. | Shared model-role config |

Built-in presets are defined in `src/domain/search/models.ts`:

- `codegraph-default` — compatibility preset. It keeps the current Codegraph embedding default (`nomic-v1.5`) and wires GNO-inspired retrieval roles for the optional stages.
- `gno-compact` — compact local Qwen/GGUF embedding, rerank, expansion, and generation roles.
- `gno-balanced` — Qwen embedding/rerank with a larger expansion/generation role.
- `gno-quality` — Qwen embedding/rerank with the largest built-in expansion/generation role.

Configure a preset and role overrides in `.codegraphrc.json`:

```json
{
  "models": {
    "preset": "gno-compact",
    "roles": {
      "embed": "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf",
      "rerank": "https://reranker.example/v1/rerank"
    }
  }
}
```

Role overrides can be transformer model names, full transformer model IDs, `hf:` GGUF URIs, `file:`/absolute GGUF paths, or HTTP(S) endpoints where supported by the role. Embedding also accepts legacy Codegraph model aliases such as `minilm`, `jina-code`, and `nomic-v1.5`.

### Legacy config compatibility

Existing single-model config still works:

```json
{
  "embeddings": {
    "model": "nomic-v1.5"
  }
}
```

When the selected preset is `codegraph-default`, `embeddings.model` is treated as the embedding role unless `models.roles.embed` is set. Non-default presets use their preset embedding role unless explicitly overridden. The `codegraph embed --model <name-or-uri>` flag overrides config for that embedding run. `codegraph search --model <name-or-uri>` can override the query embedding model for a search, but normal use should let search auto-detect the model recorded during `embed`.

## Embedding and re-embedding

Build the graph first, then embed symbols:

```bash
codegraph build
codegraph embed
codegraph embed --strategy structured
codegraph embed --strategy source
codegraph embed --model jina-code
codegraph embed --model hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf
```

Strategies:

- `structured` (default) embeds graph-aware symbol text with context such as callers/callees where available.
- `source` embeds raw source for the symbol range.

`codegraph embed` stores model metadata in the database: model URI, dimension, strategy, compatibility profile, formatter version, and build timestamp. Search compares stored metadata with the active model/profile and warns if vectors may be stale or incompatible.

Re-embed after:

- Changing `embeddings.model`, `models.preset`, or `models.roles.embed`.
- Passing a different `codegraph embed --model` value.
- Changing `--strategy` between `structured` and `source`.
- Updating Codegraph in a way that changes the embedding formatter/profile.
- Rebuilding the graph after broad file moves or large refactors.

### Clearing stale vectors

The normal recovery path is to build first, then re-run embedding with the desired model and strategy:

```bash
codegraph build
codegraph embed --model <model-or-uri> --strategy structured
```

This refreshes the primary `embeddings`, `embedding_meta`, and FTS rows and replaces vectors for the active model/profile storage key.

For a full clean slate, back up or remove the database and rebuild it:

```bash
cp .codegraph/graph.db .codegraph/graph.db.bak
rm .codegraph/graph.db
codegraph build
codegraph embed --model <model-or-uri> --strategy structured
```

If you must preserve the graph tables and only clear search/vector state, use `DROP TABLE IF EXISTS` so older databases without newer tables are handled safely:

```sql
DROP TABLE IF EXISTS embeddings;
DROP TABLE IF EXISTS embedding_meta;
DROP TABLE IF EXISTS fts_index;
DROP TABLE IF EXISTS embedding_vectors;
DROP TABLE IF EXISTS embedding_vector_index_meta;
```

When sqlite-vec acceleration has been used, also inspect `sqlite_master` for virtual tables named `vec_embeddings_*` and drop each stale table with `DROP TABLE IF EXISTS` before re-running `codegraph embed`.

If results still appear stale after large graph changes, rebuild the graph and then re-embed:

```bash
codegraph build --no-incremental
codegraph embed --model <model-or-uri> --strategy structured
```

## Local GGUF setup

GGUF model URIs are handled by the model cache in `~/.codegraph/models` by default.

Supported URI forms:

```text
hf:org/repo/model.gguf
hf:org/repo:QUANT
file:/absolute/path/model.gguf
file:///absolute/path/model.gguf
/absolute/path/model.gguf
```

Local GGUF embedding requires the optional runtime:

```bash
npm install node-llama-cpp
```

If the runtime is not installed and a GGUF model is selected, Codegraph reports that `node-llama-cpp` is required. Users who only build graphs, run keyword search, or use transformer embeddings do not need this dependency.

Codegraph validates cached GGUF files before use. If a file is missing the `GGUF` magic header, or appears to be HTML from a proxy/login page, remove the bad file and download/cache it again.

## HTTP embedding backend setup

Embedding roles can point at an HTTP(S) endpoint that behaves like an OpenAI-compatible embeddings API:

```json
{
  "models": {
    "roles": {
      "embed": "https://models.example/v1/embeddings#text-embedding-model"
    }
  }
}
```

The part before `#` is the API URL. The part after `#` is sent as the `model` field. Without `#`, Codegraph derives a model name from the last URL path segment. Requests use:

```json
{ "input": ["text one", "text two"], "model": "text-embedding-model" }
```

Responses must include a `data` array with one embedding per input. `index` values are honored when present.

## Offline and download policy

GGUF cache/download policy is explicit:

| Control | Effect |
| --- | --- |
| `CODEGRAPH_OFFLINE=1` or `HF_HUB_OFFLINE=1` | Offline mode. Codegraph will not download and errors if the model is not cached. |
| `CODEGRAPH_NO_AUTO_DOWNLOAD=1` | Network is allowed generally, but Codegraph will not auto-download GGUF models. |
| Default | Codegraph may ask `node-llama-cpp` to resolve/download uncached GGUF models. |

For deterministic local runs, pre-cache model files under `~/.codegraph/models` or use `file:`/absolute paths, then set offline/no-download controls.

Transformer models are loaded through `@huggingface/transformers`; that runtime has its own cache and environment policy. The retrieval benchmark guide recommends `CODEGRAPH_NO_AUTO_DOWNLOAD=1` and/or `HF_HUB_OFFLINE=1` for no-surprise benchmark runs. See [`docs/benchmarks/RETRIEVAL.md`](../benchmarks/RETRIEVAL.md).

## Optional dependencies and fallback behavior

- `@huggingface/transformers` is optional and lazy-loaded for transformer embeddings. If missing, Codegraph prompts in TTY sessions or attempts non-interactive install; otherwise it tells you to install it.
- `node-llama-cpp` is optional and only needed for GGUF models.
- `sqlite-vec` support is optional. When vector acceleration is unavailable, Codegraph stores vectors in SQLite and semantic search falls back to brute-force vector comparison.
- Reranking is optional. Without a supported HTTP rerank endpoint, hybrid search skips reranking. If a configured rerank endpoint fails, hybrid search falls back to fusion-only results.

## Expansion, structured query modes, fusion, and reranking

Hybrid search combines BM25 keyword hits and semantic vector hits with weighted Reciprocal Rank Fusion (RRF). Relevant config defaults live under `search` in `.codegraphrc.json`:

```json
{
  "search": {
    "rrfK": 60,
    "rrfWeights": {
      "bm25": 2,
      "bm25Variant": 0.5,
      "vector": 2,
      "vectorVariant": 0.5,
      "hyde": 0.7
    },
    "rerank": {
      "enabled": false,
      "maxCandidates": 20,
      "fusionWeight": 0.4,
      "rerankWeight": 0.6
    }
  }
}
```

CLI controls:

```bash
codegraph search "auth flow" --mode hybrid
codegraph search "auth flow" --expand   # Allows model expansion only when a provider is wired
codegraph search "auth flow" --no-expand
codegraph search "auth flow" --rrf-k 30
codegraph search "auth flow" --explain --json
codegraph search "parseConfig" --query-mode term:parseConfig
codegraph search "auth" --query-mode term:auth --query-mode intent:"validate bearer token"
```

Structured query modes:

- `term:<text>` adds exact/lexical BM25-oriented terms.
- `intent:<text>` adds semantic intent text for vector retrieval and rerank intent.
- `hyde:<text>` supplies one hypothetical answer/document passage for vector retrieval.

Rules enforced by the parser:

- `--query-mode` is repeatable.
- Only one HyDE entry is allowed.
- HyDE-only input is rejected; include a plain query, `term`, or `intent` entry.
- Structured query documents can also use `term:`, `intent:`, and `hyde:` line prefixes.

Expansion behavior:

- Expansion is off for CLI hybrid search unless `--expand` is passed or structured query modes are provided.
- `--query-mode` structured entries work without a model provider because the user/agent supplies the lexical, intent, or HyDE text explicitly.
- Model-generated expansion requires an expansion provider to be wired by the caller; current CLI/MCP paths do not create one automatically, so `--expand`/`expand` can be skipped with `no_provider`.
- MCP `semantic_search` exposes `expand`, `no_expand`, `query_mode`, `query_modes`, and `explain`; structured modes add routed variants without a provider.
- Expansion guardrails preserve quoted phrases, negations, acronyms, and code-like symbols, and drop variants that drift too far from the original query.
- Strong exact BM25 signals can skip model expansion so precise identifier searches stay fast.

Reranking behavior:

- Config `search.rerank.enabled` or request-level MCP `rerank` enables reranking; `no_rerank` disables it for that request.
- CLI search currently exposes expansion and explain controls; MCP also exposes `rerank`, `no_rerank`, and `rerank_candidates`.
- Reranking only applies to the top fused candidates (`maxCandidates`/`rerank_candidates`).
- Scores are blended with fusion according to `fusionWeight` and `rerankWeight`.
- The top exact lexical hit is protected from rerank-only demotion.
- If no HTTP rerank endpoint is configured, reranking is skipped and no rerank metadata is attached.
- If a configured rerank endpoint errors, search returns fusion-only ordering and JSON results include rerank fallback metadata.

Use `--explain --json` to inspect source contributions (`bm25`, `bm25_variant`, `vector`, `vector_variant`, `hyde`). JSON output includes rerank metadata when reranking runs or a configured reranker errors.

## Speed vs. quality guidance

- Fast exact lookup: `codegraph search "parseConfig" --mode keyword`.
- Fast semantic search without expansion: `codegraph search "auth flow" --mode semantic` or hybrid with `--no-expand`.
- Better recall: hybrid search with explicit `term`/`intent`/`hyde` structured modes, or `--expand` when an expansion provider is wired.
- More stable final ordering: enable reranking where a supported rerank backend is configured, accepting extra latency over the top candidate set.
- Larger GGUF expansion/generation roles can improve query expansion quality but need more disk, RAM/VRAM, and startup time.
- Lower `--rrf-k` values emphasize top-ranked source hits more strongly; higher values smooth rankings across sources.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `No codegraph database found` | Run `codegraph build` first or pass `--db`. |
| Search warns that stored embeddings may be stale/incompatible | Re-run `codegraph embed --model <active-model> --strategy <strategy>`. |
| Search results do not reflect moved/deleted files | Run `codegraph build --no-incremental`, then re-embed. |
| GGUF model is not cached in offline mode | Add it to `~/.codegraph/models`, add a manifest entry, use `file:`, or disable offline mode intentionally. |
| GGUF file looks like HTML or is missing the GGUF header | Delete the bad file and re-download through an authenticated/unblocked network path. |
| `node-llama-cpp` missing | Install it only if using GGUF models: `npm install node-llama-cpp`. |
| Transformer runtime missing | Install `@huggingface/transformers` if using transformer embeddings. |
| HTTP embedding returns the wrong number of vectors | Fix the backend to return one `data[*].embedding` per input, with correct `index` values if reordering. |
| Reranker unavailable | Disable reranking or configure a supported HTTP rerank endpoint; fusion-only search still works. |

## Attribution

Codegraph's model-role architecture and retrieval workflow adapt design and code ideas from the GNO retrieval modules where applicable, including role-separated retrieval models, GGUF/cache policy concepts, query expansion, weighted fusion, reranking guardrails, and resilient embedding behavior.

GNO source reference: https://github.com/gmickel/gno.

GNO license: https://github.com/gmickel/gno/blob/main/LICENSE — MIT License, Copyright (c) 2025 Gordon Mickel.
