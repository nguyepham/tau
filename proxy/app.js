#!/usr/bin/env node
/**
 * Tau proxy daemon — MITM between Tau CLI and DeepSeek.
 *
 * Overrides temperature, top_p, thinking on user requests.
 * Logs session details to ./proxy/logs/.
 *
 * Ported from proxy/app.py — DeepSeek only (no Antigravity).
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

const T_DESIGN = 0.6;
const T_PLAN = 0.45;
const T_TEST = 0.45;
const T_IMPL = 0.1;
const T_REVIEW = 0.4;
const TEMPERATURE = 0.55;

const TEMP_CONST_MAP = [
  ["T_DESIGN", T_DESIGN],
  ["T_PLAN", T_PLAN],
  ["T_TEST", T_TEST],
  ["T_IMPL", T_IMPL],
  ["T_REVIEW", T_REVIEW],
];

const DEEPSEEK_API = "https://api.deepseek.com";

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

function getTemperatureFromRequest(messages) {
  let found = null;
  for (const msg of messages) {
    if (msg.role !== "user") continue;

    let text = "";
    if (typeof msg.content === "string") {
      // Strip trailing tau tags to get actual user content
      let content = msg.content;
      let lastClose = -1;
      let closeLen = 0;
      for (const tag of TAU_TAGS) {
        const close = `</${tag.slice(1)}`;
        const ci = content.lastIndexOf(close);
        if (ci > lastClose) {
          lastClose = ci;
          closeLen = close.length;
        }
      }
      if (lastClose !== -1) {
        content = content.slice(lastClose + closeLen);
        content = content.slice(3); // strip leading newlines
      }
      text = content.toUpperCase();
    } else if (Array.isArray(msg.content)) {
      text = msg.content
        .filter((p) => typeof p === "object")
        .map((p) => p.text || "")
        .join(" ")
        .toUpperCase();
    }
    if (!text) continue;

    for (const [name, temp] of TEMP_CONST_MAP) {
      if (text.includes(name)) found = temp;
    }
  }
  return found ?? TEMPERATURE;
}

function extractLastUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    let content = msg.content;
    if (typeof content === "string") {
      let lastClose = -1;
      let closeLen = 0;
      for (const tag of TAU_TAGS) {
        const close = `</${tag.slice(1)}`;
        const ci = content.lastIndexOf(close);
        if (ci > lastClose) {
          lastClose = ci;
          closeLen = close.length;
        }
      }
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

// ─── Express app ──────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "10mb" }));

// ─── Routes ───────────────────────────────────────────────────────────────

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

  const temperature = getTemperatureFromRequest(data.messages);
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
  res.json({ status: "ok", temperature: TEMPERATURE });
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
