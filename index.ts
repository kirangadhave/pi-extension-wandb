import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE_URL = "https://api.inference.wandb.ai/v1";
const CACHE_DIR = join(homedir(), ".cache", "pi-extension-wandb");
const CACHE_FILE = join(CACHE_DIR, "models.json");
const CACHE_TTL_MS = 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5_000;

// Substring matches against model id (case-insensitive). Add new reasoning
// families here; PRs welcome.
const REASONING_MODEL_PATTERNS = [
  "deepseek-r1",
  "deepseek-v3.1",
  "deepseek-v3.2",
  "gpt-oss",
  "qwen3",
  "glm-4.5",
  "glm-5",
];

// W&B's /v1/models doesn't return context-window metadata. Hardcode the ones
// we know; unknown ids fall back to DEFAULT_CONTEXT_WINDOW. PRs welcome.
const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  "deepseek-ai/DeepSeek-V3.1": 128_000,
  "deepseek-ai/DeepSeek-R1-0528": 161_000,
  "meta-llama/Llama-3.1-8B-Instruct": 131_072,
  "meta-llama/Llama-3.3-70B-Instruct": 131_072,
  "meta-llama/Llama-4-Scout-17B-16E-Instruct": 131_072,
  "moonshotai/Kimi-K2-Instruct": 131_072,
  "openai/gpt-oss-20b": 131_072,
  "openai/gpt-oss-120b": 131_072,
  "Qwen/Qwen3-235B-A22B-Instruct-2507": 262_144,
  "Qwen/Qwen3-Coder-480B-A35B-Instruct": 262_144,
  "zai-org/GLM-4.5": 131_072,
};

const DEFAULT_CONTEXT_WINDOW = 131_072;
const DEFAULT_MAX_TOKENS = 16_384;

type ApiModel = {
  id: string;
  name?: string;
};

type CachedModels = {
  fetchedAt: number;
  data: ApiModel[];
};

const isReasoning = (id: string): boolean => {
  const lower = id.toLowerCase();
  return REASONING_MODEL_PATTERNS.some((p) => lower.includes(p));
};

const prettyName = (id: string): string => {
  if (!id.includes("/")) return id;
  const [vendor, ...rest] = id.split("/");
  return `${vendor} · ${rest.join("/")}`;
};

const log = (msg: string): void => {
  if (process.env.WANDB_DEBUG === "1") {
    console.error(`[pi-extension-wandb] ${msg}`);
  }
};

async function fetchModels(apiKey: string, project?: string): Promise<ApiModel[]> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  if (project) headers["OpenAI-Project"] = project;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/models`, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
    const payload = (await res.json()) as { data?: ApiModel[] };
    const data = payload.data ?? [];
    if (data.length === 0) throw new Error("empty model list");
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function readCache(): ApiModel[] | null {
  try {
    if (!existsSync(CACHE_FILE)) return null;
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CachedModels;
    return cached.data;
  } catch (err) {
    log(`cache read failed: ${(err as Error).message}`);
    return null;
  }
}

function isCacheFresh(): boolean {
  try {
    if (!existsSync(CACHE_FILE)) return false;
    const cached = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as CachedModels;
    return Date.now() - cached.fetchedAt < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

function writeCache(data: ApiModel[]): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true });
    const cached: CachedModels = { fetchedAt: Date.now(), data };
    writeFileSync(CACHE_FILE, JSON.stringify(cached));
  } catch (err) {
    log(`cache write failed: ${(err as Error).message}`);
  }
}

export default async function (pi: ExtensionAPI): Promise<void> {
  const apiKey = process.env.WANDB_API_KEY;
  const project = process.env.WANDB_PROJECT;
  const skipCache = process.env.WANDB_NO_CACHE === "1";

  if (!apiKey) {
    log("WANDB_API_KEY not set; provider not registered. See README.");
    return;
  }

  let models: ApiModel[] | null = null;
  if (!skipCache && isCacheFresh()) {
    models = readCache();
    if (models) log(`using fresh cached model list (${models.length} models)`);
  }

  if (!models) {
    try {
      models = await fetchModels(apiKey, project);
      writeCache(models);
      log(`fetched ${models.length} models from /v1/models`);
    } catch (err) {
      log(`fetch failed: ${(err as Error).message}`);
      models = readCache();
      if (models) {
        log(`using stale cached model list (${models.length} models)`);
      } else {
        log("no cached models available; provider not registered.");
        return;
      }
    }
  }

  const headers: Record<string, string> = {};
  if (project) headers["OpenAI-Project"] = project;

  pi.registerProvider("wandb", {
    name: "Weights & Biases Inference",
    baseUrl: BASE_URL,
    apiKey: "WANDB_API_KEY",
    api: "openai-completions",
    headers,
    models: models.map((m) => ({
      id: m.id,
      name: m.name ?? prettyName(m.id),
      reasoning: isReasoning(m.id),
      input: ["text"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: KNOWN_CONTEXT_WINDOWS[m.id] ?? DEFAULT_CONTEXT_WINDOW,
      maxTokens: DEFAULT_MAX_TOKENS,
    })),
  });
}
