import { extname } from "path";
import { runNativeZenToolSync } from "./nativeZenTools.js";

const MAX_CACHE_ENTRIES = 300;
const MAX_NATIVE_HIGHLIGHT_CHARS = 200_000;

const TRAILING_ANSI_SPACE_RE =
  /(?:(?:\x1B\[[0-?]*[ -/]*[@-~])*[ \t]+(?:\x1B\[[0-?]*[ -/]*[@-~])*)+$/u;

const highlightCache = new Map<string, string | null>();

function remember<K, V>(cache: Map<K, V>, key: K, value: V): V {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
}

function languageFromPathOrHint(
  filePathOrLanguage: string | undefined,
): string {
  if (!filePathOrLanguage) return "";
  if (!filePathOrLanguage.includes("/") && !filePathOrLanguage.includes("\\")) {
    return filePathOrLanguage;
  }
  const ext = extname(filePathOrLanguage).slice(1);
  return ext;
}

function trimRenderedLine(line: string): string {
  let trimmed = line.replace(/[ \t]+$/u, "");
  while (trimmed !== "") {
    const next = trimmed.replace(TRAILING_ANSI_SPACE_RE, "");
    if (next === trimmed) break;
    trimmed = next;
  }
  return trimmed;
}

export function highlightCodeWithNative(
  code: string,
  filePathOrLanguage?: string,
): string | null {
  if (!code || code.length > MAX_NATIVE_HIGHLIGHT_CHARS) return null;
  const language = languageFromPathOrHint(filePathOrLanguage);
  const key = `code:${language}:${filePathOrLanguage ?? ""}:${code}`;
  const cached = highlightCache.get(key);
  if (cached !== undefined) return cached;

  const args = ["--style", "github-dark"];
  if (language) args.push("--lang", language);
  let rendered: string | null = null;
  try {
    rendered = runNativeZenToolSync("highlight-code", args, {
      input: code,
      timeoutMs: 5_000,
      maxBuffer: 2_000_000,
    });
  } catch {
    rendered = null;
  }
  return remember(
    highlightCache,
    key,
    rendered
      ?.replace(/\uFEFF/g, "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map(trimRenderedLine)
      .join("\n")
      .trimEnd() || null,
  );
}
