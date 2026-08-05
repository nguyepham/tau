#!/usr/bin/env node
/**
 * Tau proxy daemon: MITM between Tau CLI and backends (DeepSeek & Antigravity).
 *
 * Overrides temperature, top_p/topP, top_k/topK, thinking on user requests.
 * Logs session details to ./proxy/logs/.
 */

import express from "express";
import { randomBytes } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Constants ────────────────────────────────────────────────────────────

const THINKING_MODE = "disabled";
const REASONING_EFFORT = "max";
const TEMPERATURE = 0.3;

const DEEPSEEK_API = "https://api.deepseek.com";
const ANTIGRAVITY_API = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_FALLBACK_API = "https://daily-cloudcode-pa.googleapis.com";

const MODEL_MAP = {
  "deepseek-v4-flash": "deepseek-v4-flash",
  "deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek-chat": "deepseek-v4-flash",
  "deepseek-reasoner": "deepseek-v4-pro",
  "deepseek-coder": "deepseek-v4-flash",
};

const REASONING_MODELS = new Set(["deepseek-v4-pro", "deepseek-reasoner"]);

const AVAILABLE_MODELS = [
  {
    id: "deepseek-v4-flash",
    object: "model",
    created: 1700000000,
    owned_by: "deepseek",
  },
  {
    id: "deepseek-v4-pro",
    object: "model",
    created: 1700000001,
    owned_by: "deepseek",
  },
];

const TAU_TAGS = [
  "<system-reminder>",
  "<local-command-caveat>",
  "<local-command-stdout>",
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<task-notification>",
  "<teammate-message>",
  "<channel-message>",
  "<cross-session-message>",
  "<fork-boilerplate>",
  "<remote-review>",
  "<remote-review-progress>",
  "<ultraplan>",
  "<tick>",
];

// ─── Logging ──────────────────────────────────────────────────────────────

let LOG_FILE = null;
let _sessionRequestTokens = 0;
let _sessionActive = false;

function log(msg = "") {
  if (!LOG_FILE) return;
  appendFileSync(LOG_FILE, msg + "\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function extractUnifiedMessages(data) {
  if (Array.isArray(data.messages)) {
    return data.messages;
  }
  const contents = data.request?.contents || data.contents;
  if (Array.isArray(contents)) {
    return contents.map((c) => {
      const role = c.role === "model" ? "assistant" : c.role || "user";
      let text = "";
      if (Array.isArray(c.parts)) {
        text = c.parts
          .map((p) => {
            if (typeof p === "string") return p;
            if (p && typeof p === "object" && typeof p.text === "string")
              return p.text;
            return "";
          })
          .filter(Boolean)
          .join(" ");
      } else if (typeof c.content === "string") {
        text = c.content;
      }
      return { role, content: text };
    });
  }
  return [];
}

function parseLastTauTag(c) {
  let lastClose = -1;
  let closeLen = 0;
  for (const tag of TAU_TAGS) {
    const close = `</${tag.slice(1)}`;
    const ci = c.lastIndexOf(close);
    if (ci > lastClose) {
      lastClose = ci;
      closeLen = close.length;
    }
  }
  return { lastClose, closeLen };
}

function extractLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    let content = msg.content;
    if (typeof content === "string") {
      const { lastClose, closeLen } = parseLastTauTag(content);
      if (lastClose !== -1) {
        content = content.slice(lastClose + closeLen);
        content = content.slice(3);
      }
      return String(content || "");
    }
    if (Array.isArray(content)) {
      return content
        .filter((p) => typeof p === "object")
        .map((p) => p.text || "")
        .join(" ");
    }
    return "";
  }
  return "";
}

function countMessages(messages) {
  let tau = 0;
  let user = 0;
  let injected = 0;
  let response = 0;
  let tool = 0;
  for (const msg of messages) {
    const role = msg.role;
    if (role === "system") {
      tau++;
    } else if (role === "user") {
      const c = msg.content;
      if (typeof c !== "string") {
        user++;
      } else {
        const { lastClose, closeLen } = parseLastTauTag(c);

        const onlyTauTags =
          lastClose !== -1 && lastClose + closeLen === c.length;
        const hasTauTags = lastClose !== -1;

        if (onlyTauTags) {
          // Type 1: only tau tags
          tau++;
        } else if (hasTauTags) {
          // Type 2: tau tags + user message
          user++;
          injected++;
          tau++;
        } else {
          // Type 3: only user message
          user++;
        }
      }
    } else if (role === "assistant") {
      response++;
    } else if (role === "tool") {
      tool++;
    }
  }
  return {
    tau,
    user,
    injected,
    response,
    tool,
    session: user + tau + response + tool - injected,
  };
}

function logDeepSeekUsage(usageData, temperature, lastMsg, msgCounts) {
  const hit = usageData.prompt_cache_hit_tokens || 0;
  const miss = usageData.prompt_cache_miss_tokens || 0;
  const prompt = usageData.prompt_tokens || 0;
  const completion = usageData.completion_tokens || 0;
  const total = usageData.total_tokens || 0;
  const cachedPct =
    prompt > 0 ? `${((hit / prompt) * 100).toFixed(2)}%` : "N/A";

  const tauMsgs = Math.max(0, msgCounts.tau - 1);
  const respMsgs = msgCounts.response + 1;

  log("---");
  log(`[MODEL] ${usageData._model || "unknown"}`);
  log(`[OVERRIDE] temperature: ${temperature}`);
  log("[MESSAGE COUNT]");
  log(`  injected: ${msgCounts.injected}`);
  log(`  tau: ${tauMsgs}`);
  log(`  tool: ${msgCounts.tool}`);
  log(`  user: ${msgCounts.user}`);
  log(`  response: ${respMsgs}`);
  log(`  session: ${msgCounts.session}`);
  const requestTokens = Math.max(0, prompt - _sessionRequestTokens);
  _sessionRequestTokens = prompt;

  log("[TOKEN COUNT]");
  log(`  request: ${requestTokens} (cached: ${cachedPct})`);
  log(`  miss: ${miss}`);
  log(`  response: ${completion}`);
  log(`  session: ${total}`);
  log(`[USER]:\n${(lastMsg || "").slice(0, 500)}`);
}

// ─── Antigravity Config & Logging Helpers ─────────────────────────────────

function getOrInitGenConfig(data) {
  const req =
    data.request && typeof data.request === "object" ? data.request : data;
  return (req.generationConfig ??= {});
}

function processAntigravityConfig(data) {
  const genConfig = getOrInitGenConfig(data);
  genConfig.temperature = TEMPERATURE;
  genConfig.topP = 0.85;
  genConfig.thinkingConfig = {
    ...genConfig.thinkingConfig,
    includeThoughts: true,
  };

  // for (const obj of [data, data.request, genConfig]) {
  //   if (obj) {
  //     delete obj.temperature;
  //     delete obj.topP;
  //     delete obj.top_p;
  //   }
  // }

  return genConfig;
}

function extractResponseContentAndThought(candidates) {
  let text = "",
    thought = "";
  for (const cand of candidates || []) {
    if (cand.thinking) thought += cand.thinking;
    if (cand.thought) thought += cand.thought;

    for (const p of cand.content?.parts || []) {
      if (p.thought === true && p.text) thought += p.text;
      else if (p.thought) thought += p.thought;
      else if (p.thoughtText) thought += p.thoughtText;
      else if (p.text) text += p.text;
    }
  }
  return { text, thought };
}

function logAntigravityResponse(
  usageData,
  genConfig,
  lastMsg,
  msgCounts,
  thought,
  content,
  isGen,
) {
  if (usageData && isGen)
    logAntigravityUsage(usageData, genConfig, lastMsg, msgCounts);
  if (thought) log(`[ANTIGRAVITY THOUGHT]:\n${thought}`);
  if (content) log(`[ANTIGRAVITY RESPONSE]:\n${content}`);
}

function logAntigravityUsage(usageData, genConfig, lastMsg, msgCounts) {
  const prompt =
    usageData?.promptTokenCount || usageData?.prompt_token_count || 0;
  const completion =
    usageData?.candidatesTokenCount || usageData?.candidates_token_count || 0;
  const total = usageData?.totalTokenCount || usageData?.total_token_count || 0;
  const cached =
    usageData?.cachedContentTokenCount ||
    usageData?.cached_content_token_count ||
    0;
  const cachedPct =
    prompt > 0 ? `${((cached / prompt) * 100).toFixed(2)}%` : "N/A";

  log("---");
  log("[ANTIGRAVITY RESP]");
  log(
    `[CONFIG] temperature: ${genConfig.temperature ?? "N/A"}, topP: ${genConfig.topP ?? "N/A"}, topK: ${genConfig.topK ?? "N/A"}, thinkingConfig: ${JSON.stringify(genConfig.thinkingConfig ?? null)}`,
  );
  log("[MESSAGE COUNT]");
  log(`  tau: ${msgCounts.tau}`);
  log(`  tool: ${msgCounts.tool}`);
  log(`  user: ${msgCounts.user}`);
  log(`  response: ${msgCounts.response}`);
  log(`  session: ${msgCounts.session}`);
  const requestTokens = Math.max(0, prompt - _sessionRequestTokens);
  _sessionRequestTokens = prompt;

  log("[TOKEN COUNT]");
  log(`  request: ${requestTokens} (cached: ${cachedPct})`);
  log(`  prompt: ${prompt}`);
  log(`  cached: ${cached}`);
  log(`  response: ${completion}`);
  log(`  session: ${total}`);
  log(`[USER]:\n${(lastMsg || "").slice(0, 500)}`);
}

async function handleAntigravityRequest(req, res) {
  try {
    const data = req.body || {};
    const unifiedMessages = extractUnifiedMessages(data);
    const isGenRequest =
      req.originalUrl.includes("generateContent") ||
      req.originalUrl.includes("streamGenerateContent") ||
      data.request?.contents ||
      data.contents;

    let genConfig = {};
    let lastMsg = "";
    let msgCounts = {
      tau: 0,
      user: 0,
      injected: 0,
      response: 0,
      tool: 0,
      session: 0,
    };

    if (isGenRequest) {
      genConfig = processAntigravityConfig(data);
      lastMsg = extractLastUserMessage(unifiedMessages);
      msgCounts = countMessages(unifiedMessages);

      const logData = JSON.parse(JSON.stringify(data));
      if (logData.request?.contents) {
        logData.request.contents = `[Contents array elided, count: ${logData.request.contents.length}]`;
      } else if (logData.contents) {
        logData.contents = `[Contents array elided, count: ${logData.contents.length}]`;
      }
      log(`[ANTIGRAVITY REQ FULL]\n${JSON.stringify(logData, null, 2)}`);
      log("---");
      log(`[ANTIGRAVITY REQ] endpoint: ${req.originalUrl}`);
      log(`[MODEL] ${data.model || data.request?.model || "antigravity"}`);
      log(
        `[CONFIG] temperature: ${genConfig.temperature ?? "N/A"}, topP: ${genConfig.topP ?? "N/A"}, topK: ${genConfig.topK ?? "N/A"}, thinkingConfig: ${JSON.stringify(genConfig.thinkingConfig ?? null)}`,
      );
    } else {
      log(`[ANTIGRAVITY REQ NON-GEN] ${req.method} ${req.originalUrl}`);
    }

    let targetUrl = `${ANTIGRAVITY_API}${req.originalUrl}`;
    const forwardHeaders = {};
    for (const [key, val] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "content-length") continue;
      forwardHeaders[key] = val;
    }
    if (!forwardHeaders["content-type"]) {
      forwardHeaders["content-type"] = "application/json";
    }

    let resp;
    try {
      resp = await fetch(targetUrl, {
        method: req.method,
        headers: forwardHeaders,
        body:
          req.method !== "GET" && req.method !== "HEAD"
            ? JSON.stringify(data)
            : undefined,
      });

      if (resp.status === 404) {
        log(
          `[ANTIGRAVITY 404] ${targetUrl} returned 404, falling back to ${ANTIGRAVITY_FALLBACK_API}`,
        );
        const fallbackUrl = `${ANTIGRAVITY_FALLBACK_API}${req.originalUrl}`;
        const fallbackResp = await fetch(fallbackUrl, {
          method: req.method,
          headers: forwardHeaders,
          body:
            req.method !== "GET" && req.method !== "HEAD"
              ? JSON.stringify(data)
              : undefined,
        });
        if (fallbackResp.ok || fallbackResp.status !== 404) {
          resp = fallbackResp;
        }
      }
    } catch (err) {
      log(`[ANTIGRAVITY FETCH ERROR] ${err.message}`);
      res
        .status(502)
        .json({
          error: "Antigravity backend unreachable",
          details: err.message,
        });
      return;
    }

    const isStream =
      req.originalUrl.includes("streamGenerateContent") ||
      req.originalUrl.includes("alt=sse") ||
      Boolean(data.stream);

    if (isStream) {
      res.writeHead(resp.status, {
        "Content-Type": resp.headers.get("content-type") || "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let usageData = null;
      let fullContent = "";
      let fullThought = "";
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      function pump() {
        reader
          .read()
          .then(({ done, value }) => {
            if (done) {
              logAntigravityResponse(
                usageData,
                genConfig,
                lastMsg,
                msgCounts,
                fullThought,
                fullContent,
                isGenRequest,
              );
              res.end();
              return;
            }
            const chunk = decoder.decode(value, { stream: true });
            for (const line of chunk.split("\n")) {
              const trimmed = line.trim();
              if (trimmed.startsWith("data: ")) {
                const payloadStr = trimmed.slice(6).trim();
                if (payloadStr && payloadStr !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(payloadStr);
                    log(
                      `[ANTIGRAVITY STREAM CHUNK]\n${JSON.stringify(parsed, null, 2)}`,
                    );

                    const resPayload = parsed.response || parsed;
                    if (resPayload.usageMetadata)
                      usageData = resPayload.usageMetadata;

                    const { text, thought } = extractResponseContentAndThought(
                      resPayload.candidates,
                    );
                    if (text) fullContent += text;
                    if (thought) fullThought += thought;
                  } catch {
                    // skip parse errors
                  }
                }
              }
            }
            res.write(chunk);
            pump();
          })
          .catch((err) => {
            log(`[ANTIGRAVITY STREAM PUMP ERROR] ${err.message}`);
            res.end();
          });
      }
      pump();
    } else {
      if (!resp.ok) {
        const text = await resp.text();
        log(`[ANTIGRAVITY ERROR] HTTP ${resp.status}: ${text.slice(0, 500)}`);
        res
          .status(resp.status)
          .type(resp.headers.get("content-type") || "text/plain")
          .send(text);
        return;
      }

      const respJson = await resp.json();
      log(`[ANTIGRAVITY RESP FULL]\n${JSON.stringify(respJson, null, 2)}`);

      const resPayload = respJson.response || respJson;
      const { text: fullContent, thought: fullThought } =
        extractResponseContentAndThought(resPayload.candidates);
      const usageData = resPayload.usageMetadata;

      logAntigravityResponse(
        usageData,
        genConfig,
        lastMsg,
        msgCounts,
        fullThought,
        fullContent,
        isGenRequest,
      );

      res.status(resp.status).json(respJson);
    }
  } catch (err) {
    console.error("Uncaught exception in handleAntigravityRequest:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}

// ─── Express app ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));

// ─── Middleware / Routes ──────────────────────────────────────────────────

// Antigravity routes middleware
app.use((req, res, next) => {
  if (
    req.originalUrl.startsWith("/v1internal") ||
    req.originalUrl.startsWith("/v1beta") ||
    req.headers["x-goog-api-client"] ||
    req.headers["x-request-source"] === "local" ||
    req.body?.userAgent === "antigravity"
  ) {
    return handleAntigravityRequest(req, res);
  }
  next();
});

app.post("/v1/session/start", (req, res) => {
  const body = req.body || {};
  const sessionId = body.session_id || randomBytes(8).toString("hex");
  const projectDir = body.project_dir || process.cwd();
  const now = new Date();

  const logDir = join(__dirname, "logs");
  mkdirSync(logDir, { recursive: true });

  const path = join(logDir, `tau_proxy_${formatDate(now)}-${sessionId}.log`);
  LOG_FILE = path;

  const header =
    "=".repeat(60) +
    "\n  Tau Proxy session started\n" +
    "=".repeat(60) +
    `\n  Started at : ${now.toISOString()}` +
    `\n  Hostname   : ${hostname()}` +
    `\n  Session ID : ${sessionId}` +
    `\n  Log file   : ${LOG_FILE}` +
    `\n  PID        : ${process.pid}` +
    `\n  Project    : ${projectDir}` +
    "\n" +
    "=".repeat(60) +
    "\n";

  writeFileSync(LOG_FILE, header);

  _sessionRequestTokens = 0;
  _sessionActive = true;

  res.json({ status: "ok", log_file: LOG_FILE, session_id: sessionId });
});

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${y}${m}${day}-${h}${min}${s}`;
}

app.get(["/v1/models", "/models"], (_req, res) => {
  res.json({ object: "list", data: AVAILABLE_MODELS });
});

app.post(["/v1/chat/completions", "/chat/completions"], async (req, res) => {
  const data = req.body;

  // Mutate request
  data.thinking = { type: THINKING_MODE };
  delete data.temperature;
  delete data.topP;
  data.top_p = 0.85;

  const temperature = TEMPERATURE;
  data.temperature = temperature;

  // Log request (elide system prompts, tools)
  const logData = JSON.parse(JSON.stringify(data));
  if (logData.messages) {
    for (let i = 0; i < logData.messages.length; i++) {
      const m = logData.messages[i];
      if (m.role === "system") {
        const c = m.content || "";
        m.content = `[System prompt elided, length: ${typeof c === "string" ? c.length : "N/A"}]`;
      } else if (m.role === "user") {
        const c = m.content || "";
        if (typeof c === "string" && c.startsWith("<system-reminder>")) {
          m.content = `[System reminder elided, length: ${c.length}]`;
        }
      }
    }
  }
  if (logData.tools) {
    logData.tools = `[Tools array elided, count: ${logData.tools.length}]`;
  }
  log(`[DEEPSEEK REQ FULL]\n${JSON.stringify(logData, null, 2)}`);

  const lastMsg = extractLastUserMessage(data.messages);

  // Forward to DeepSeek
  const resp = await fetch(`${DEEPSEEK_API}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: req.headers["authorization"] || "",
    },
    body: JSON.stringify(data),
  });

  if (data.stream) {
    // Streaming response
    let usageData = null;
    let fullContent = "";
    const headers = {
      "Content-Type": resp.headers.get("content-type") || "text/event-stream",
    };
    res.writeHead(resp.status, headers);

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();

    function pump() {
      reader.read().then(({ done, value }) => {
        if (done) {
          if (usageData) {
            usageData._model = data.model;
            const msgCounts = countMessages(data.messages);
            logDeepSeekUsage(usageData, temperature, lastMsg, msgCounts);
          }
          log(`[RESPONSE]:\n${fullContent}`);
          res.end();
          return;
        }
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ") && trimmed !== "data: [DONE]") {
            try {
              const parsed = JSON.parse(trimmed.slice(6));
              if (parsed.usage) usageData = parsed.usage;
              if (parsed.choices?.[0]?.delta?.content) {
                fullContent += parsed.choices[0].delta.content;
              }
            } catch {
              // skip parse errors
            }
          }
        }
        res.write(chunk);
        pump();
      });
    }
    pump();
  } else {
    // Non-streaming response
    if (!resp.ok) {
      const text = await resp.text();
      log(`[ERROR] HTTP ${resp.status}: ${text.slice(0, 500)}`);
      res
        .status(resp.status)
        .type(resp.headers.get("content-type") || "text/plain")
        .send(text);
      return;
    }

    const respJson = await resp.json();
    log(`[DEEPSEEK RESP FULL]\n${JSON.stringify(respJson, null, 2)}`);

    const usageData = respJson.usage;
    if (usageData) {
      usageData._model = data.model;
      const msgCounts = countMessages(data.messages);
      logDeepSeekUsage(usageData, temperature, lastMsg, msgCounts);
    }

    res.status(resp.status).json(respJson);
  }
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", temperature: TEMPERATURE, antigravity: true });
});

// Log non-200 status codes
app.use((_req, res, next) => {
  const originalSend = res.send;
  res.send = function (body) {
    if (res.statusCode !== 200) {
      log(`[STATUS] ${res.statusCode}`);
    }
    return originalSend.call(this, body);
  };
  next();
});

// ─── Main ─────────────────────────────────────────────────────────────────

const PORT = 18288;
const HOST = "127.0.0.1";

console.log(`Tau proxy daemon starting on http://${HOST}:${PORT}`);
console.log("  Session log: created on POST /v1/session/start");

app.listen(PORT, HOST, () => {
  console.log(`  Listening on http://${HOST}:${PORT}`);
});
