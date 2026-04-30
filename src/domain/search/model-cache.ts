import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineError } from '../../shared/errors.js';

export type ModelType = 'embed' | 'rerank' | 'expand' | 'gen';
export interface DownloadPolicy {
  offline: boolean;
  allowDownload: boolean;
}
export interface PolicyFlags {
  offline?: boolean;
  allowDownload?: boolean;
}
export type ParsedModelUri =
  | { scheme: 'hf'; org: string; repo: string; file: string; quantization?: string }
  | { scheme: 'file'; file: string };

interface ManifestEntry {
  uri: string;
  type: ModelType;
  path: string;
  cachedAt: string;
}
interface Manifest {
  version: '1.0';
  models: ManifestEntry[];
}

const HF_QUANT_PATTERN = /^([^/]+)\/([^/:]+):(\w+)$/;
const HF_PATH_PATTERN = /^([^/]+)\/([^/]+)\/(.+\.gguf)$/i;
const GGUF_MAGIC = new Uint8Array([0x47, 0x47, 0x55, 0x46]);

function asError(cause: unknown): Error | undefined {
  return cause instanceof Error
    ? cause
    : cause === undefined
      ? undefined
      : new Error(String(cause));
}

async function importOptionalRuntime(specifier: string): Promise<unknown> {
  return (
    new Function('specifier', 'return import(specifier)') as (value: string) => Promise<unknown>
  )(specifier);
}

export function resolveDownloadPolicy(
  env: Record<string, string | undefined> = process.env,
  flags: PolicyFlags = {},
): DownloadPolicy {
  if (flags.offline || truthy(env.HF_HUB_OFFLINE) || truthy(env.CODEGRAPH_OFFLINE)) {
    return { offline: true, allowDownload: false };
  }
  if (flags.allowDownload !== undefined)
    return { offline: false, allowDownload: flags.allowDownload };
  if (truthy(env.CODEGRAPH_NO_AUTO_DOWNLOAD)) return { offline: false, allowDownload: false };
  return { offline: false, allowDownload: true };
}

function truthy(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true' || value?.toLowerCase() === 'yes';
}

export function isGgufModelUri(uri: string): boolean {
  return uri.startsWith('hf:') || uri.startsWith('file:') || path.isAbsolute(uri);
}

export function parseModelUri(uri: string): ParsedModelUri {
  if (uri.startsWith('hf:')) {
    const rest = uri.slice(3);
    const quantMatch = rest.match(HF_QUANT_PATTERN);
    if (quantMatch) {
      const [, org, repo, quantization] = quantMatch;
      return { scheme: 'hf', org: org!, repo: repo!, file: '', quantization };
    }
    const pathMatch = rest.match(HF_PATH_PATTERN);
    if (pathMatch) {
      const [, org, repo, file] = pathMatch;
      return { scheme: 'hf', org: org!, repo: repo!, file: file! };
    }
    throw new EngineError(
      `Invalid model URI "${uri}". Expected hf:org/repo/model.gguf or hf:org/repo:QUANT.`,
    );
  }
  if (uri.startsWith('file://')) {
    try {
      return { scheme: 'file', file: fileURLToPath(new URL(uri)) };
    } catch (cause) {
      throw new EngineError(`Invalid file model URI "${uri}".`, { cause: asError(cause) });
    }
  }
  if (uri.startsWith('file:')) {
    const file = uri.slice(5);
    if (!file) throw new EngineError('Invalid file model URI: empty file path.');
    return { scheme: 'file', file };
  }
  if (path.isAbsolute(uri)) return { scheme: 'file', file: uri };
  throw new EngineError(
    `Unsupported model URI "${uri}". Use a configured transformer model, http(s) endpoint, hf: URI, or file: URI.`,
  );
}

export async function validateGgufFile(filePath: string, uri = filePath): Promise<void> {
  let bytes: Buffer;
  try {
    const handle = await import('node:fs/promises').then((fs) => fs.open(filePath, 'r'));
    try {
      bytes = Buffer.alloc(512);
      const result = await handle.read(bytes, 0, 512, 0);
      bytes = bytes.subarray(0, result.bytesRead);
    } finally {
      await handle.close();
    }
  } catch (cause) {
    throw new EngineError(`Model file not found for ${uri}: ${filePath}`, {
      cause: asError(cause),
    });
  }

  if (GGUF_MAGIC.every((value, index) => bytes[index] === value)) return;
  const text = bytes.toString('utf8').toLowerCase();
  if (text.includes('<!doctype') || text.includes('<html') || text.includes('huggingface')) {
    throw new EngineError(
      `Model file for ${uri} looks like HTML instead of GGUF: ${filePath}. A proxy, firewall, login page, or captive portal may have intercepted the download. Remove the file and retry with network access.`,
    );
  }
  throw new EngineError(
    `Model file for ${uri} is not a valid GGUF file: ${filePath} (missing GGUF magic header). Remove it and download the .gguf model again.`,
  );
}

export class ModelCache {
  readonly dir: string;
  private readonly manifestPath: string;

  constructor(cacheDir = path.join(os.homedir(), '.codegraph', 'models')) {
    this.dir = cacheDir;
    this.manifestPath = path.join(cacheDir, 'manifest.json');
  }

  async ensureModel(
    uri: string,
    type: ModelType,
    policy = resolveDownloadPolicy(),
  ): Promise<string> {
    const parsed = parseModelUri(uri);
    if (parsed.scheme === 'file') {
      await validateGgufFile(parsed.file, uri);
      return parsed.file;
    }

    const cached = await this.getCachedPath(uri);
    if (cached) return cached;
    const localFile = await this.findLocalCachedPath(parsed, uri);
    if (localFile) {
      await this.addToManifest(uri, type, localFile);
      return localFile;
    }
    if (policy.offline) {
      throw new EngineError(
        `Model ${uri} is not cached and offline mode is enabled. Add a Codegraph cache manifest entry at ${this.manifestPath}, place the GGUF file under ${this.dir}/<org>/<repo>/<file>, or disable CODEGRAPH_OFFLINE/HF_HUB_OFFLINE.`,
      );
    }
    if (!policy.allowDownload) {
      throw new EngineError(
        `Model ${uri} is not cached and automatic downloads are disabled. Add a Codegraph cache manifest entry at ${this.manifestPath}, place the GGUF file under ${this.dir}/<org>/<repo>/<file>, or set CODEGRAPH_NO_AUTO_DOWNLOAD=0.`,
      );
    }

    let runtime: {
      resolveModelFile?: (uri: string, options: { directory: string }) => Promise<string>;
    };
    try {
      runtime = (await importOptionalRuntime('node-llama-cpp')) as typeof runtime;
    } catch (cause) {
      throw new EngineError(
        'Qwen/GGUF embeddings require optional runtime node-llama-cpp. Install it only if you use GGUF models: npm install node-llama-cpp',
        { cause: asError(cause) },
      );
    }
    if (!runtime.resolveModelFile) {
      throw new EngineError(
        'node-llama-cpp does not expose resolveModelFile; update the optional runtime.',
      );
    }
    await mkdir(this.dir, { recursive: true });
    const resolvedPath = await runtime.resolveModelFile(toNodeLlamaCppUri(parsed), {
      directory: this.dir,
    });
    await validateGgufFile(resolvedPath, uri);
    await this.addToManifest(uri, type, resolvedPath);
    return resolvedPath;
  }

  async getCachedPath(uri: string): Promise<string | null> {
    const manifest = await this.loadManifest();
    const entry = manifest.models.find((item) => item.uri === uri);
    if (!entry) return null;
    try {
      await stat(entry.path);
      await validateGgufFile(entry.path, uri);
      return entry.path;
    } catch {
      await this.removeFromManifest(uri);
      return null;
    }
  }

  private async findLocalCachedPath(parsed: ParsedModelUri, uri: string): Promise<string | null> {
    if (parsed.scheme !== 'hf' || parsed.quantization || !parsed.file) return null;
    const candidates = [
      path.join(this.dir, parsed.org, parsed.repo, parsed.file),
      path.join(this.dir, parsed.repo, parsed.file),
      path.join(this.dir, parsed.file),
    ];
    for (const candidate of candidates) {
      try {
        await validateGgufFile(candidate, uri);
        return candidate;
      } catch {
        // Continue looking for deterministic local cache layouts before reporting a miss.
      }
    }
    return null;
  }

  private async loadManifest(): Promise<Manifest> {
    try {
      return JSON.parse(await readFile(this.manifestPath, 'utf8')) as Manifest;
    } catch {
      return { version: '1.0', models: [] };
    }
  }

  private async writeManifest(manifest: Manifest): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async addToManifest(uri: string, type: ModelType, modelPath: string): Promise<void> {
    const manifest = await this.loadManifest();
    manifest.models = manifest.models.filter((item) => item.uri !== uri);
    manifest.models.push({ uri, type, path: modelPath, cachedAt: new Date().toISOString() });
    await this.writeManifest(manifest);
  }

  private async removeFromManifest(uri: string): Promise<void> {
    const manifest = await this.loadManifest();
    manifest.models = manifest.models.filter((item) => item.uri !== uri);
    await this.writeManifest(manifest);
  }
}

export async function clearCachedModelFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function toNodeLlamaCppUri(parsed: ParsedModelUri): string {
  if (parsed.scheme === 'file') return parsed.file;
  return parsed.quantization
    ? `hf:${parsed.org}/${parsed.repo}:${parsed.quantization}`
    : `hf:${parsed.org}/${parsed.repo}/${parsed.file}`;
}

export function cacheKeyForUri(uri: string): string {
  return createHash('sha256').update(uri).digest('hex').slice(0, 32);
}
