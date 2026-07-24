#!/usr/bin/env python3
"""Zen proxy daemon — MITM between Zen CLI and DeepSeek/Antigravity providers.

Overrides temperature, top_p, thinking on user requests.
Logs session details to ./proxy/logs/.
"""

import json
import os
import secrets
import socket
from datetime import datetime

from flask import Flask, Response, request
import requests

# ─── Constants ────────────────────────────────────────────────────────────

THINKING_MODE = "disabled"
REASONING_EFFORT = "max"

T_DESIGN = 0.6
T_PLAN = 0.45
T_TEST = 0.45
T_IMPL = 0.1
T_REVIEW = 0.4
TEMPERATURE = 0.55

_TEMP_CONST_MAP: list[tuple[str, float]] = [
    ("T_DESIGN", T_DESIGN),
    ("T_PLAN", T_PLAN),
    ("T_TEST", T_TEST),
    ("T_IMPL", T_IMPL),
    ("T_REVIEW", T_REVIEW),
]

DEEPSEEK_API = "https://api.deepseek.com"
ANTIGRAVITY_API = "https://cloudcode-pa.googleapis.com"

ANTIGRAVITY_METHODS = frozenset({":generateContent", ":streamGenerateContent"})

MODEL_MAP: dict[str, str] = {
    "deepseek-v4-flash": "deepseek-v4-flash",
    "deepseek-v4-pro": "deepseek-v4-pro",
    "deepseek-chat": "deepseek-v4-flash",
    "deepseek-reasoner": "deepseek-v4-pro",
    "deepseek-coder": "deepseek-v4-flash",
}

REASONING_MODELS = frozenset({"deepseek-v4-pro", "deepseek-reasoner"})

AVAILABLE_MODELS = [
    {"id": "deepseek-v4-flash", "object": "model", "created": 1700000000, "owned_by": "deepseek"},
    {"id": "deepseek-v4-pro",   "object": "model", "created": 1700000001, "owned_by": "deepseek"},
]

ANTIGRAVITY_MODELS = [
    {"id": "gemini-3.5-flash-high",   "name": "Gemini 3.5 Flash (High)",   "contextWindow": 1048576},
    {"id": "gemini-3.5-flash-medium", "name": "Gemini 3.5 Flash (Medium)", "contextWindow": 1048576},
    {"id": "gemini-3.5-flash-low",    "name": "Gemini 3.5 Flash (Low)",    "contextWindow": 1048576},
    {"id": "gemini-3.1-pro-high",     "name": "Gemini 3.1 Pro (High)",     "contextWindow": 1048576},
    {"id": "gemini-3.1-pro-low",      "name": "Gemini 3.1 Pro (Low)",      "contextWindow": 1048576},
    {"id": "gemini-3-flash",          "name": "Gemini 3 Flash",            "contextWindow": 1048576},
    {"id": "claude-sonnet-4-6",       "name": "Claude Sonnet 4.6"},
    {"id": "claude-opus-4-6-thinking","name": "Claude Opus 4.6"},
]


# ─── Logging ──────────────────────────────────────────────────────────────

LOG_FILE: str | None = None

# Antigravity: cumulative promptTokenCount for per-request delta calculation
_ag_session_request_tokens: int = 0


def log(msg: str = ""):
    if not LOG_FILE:
        return
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


# ─── Helpers ──────────────────────────────────────────────────────────────

def resolve_antigravity_wire_model(model: str) -> str:
    m = model.lower()
    if m == "gemini-pro-agent":
        return "gemini-3.1-pro-high"
    if m == "gemini-3-flash-agent":
        return "gemini-3.5-flash-high"
    if m == "gemini-3.5-flash-low":
        return "gemini-3.5-flash-medium"
    if m == "gemini-3.5-flash-extra-low":
        return "gemini-3.5-flash-low"
    return model


def get_temperature_from_request(messages) -> float:
    found = None
    for msg in messages:
        if msg.get("role") != "user":
            continue
        user_text = msg.get("content", "")
        if isinstance(user_text, str):
            user_upper = user_text.upper()
        elif isinstance(user_text, list):
            user_upper = " ".join(
                p.get("text", "") for p in user_text if isinstance(p, dict)
            ).upper()
        else:
            user_upper = ""
        for const_name, temp in _TEMP_CONST_MAP:
            if const_name in user_upper:
                found = temp
    return found if found is not None else TEMPERATURE


def extract_last_user_message(messages) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content", "")
        if isinstance(content, str):
            # Strip all <tag>...</tag> wrappers to get real user content
            last_close = -1
            close_len = 0
            for tag in ZEN_TAGS:
                close = f"</{tag[1:]}"
                ci = content.rfind(close)
                if ci > last_close:
                    last_close = ci
                    close_len = len(close)
            if last_close != -1:
                content = content[last_close + close_len:]
                content = content[3:]
            return str(content) if content else ""
        if isinstance(content, list):
            texts = [p.get("text", "") for p in content if isinstance(p, dict)]
            return " ".join(texts)
        return ""
    return ""


ZEN_TAGS = (
    "<system-reminder>",
    "<local-command-caveat>",
    "<task-notification>",
    "<teammate-message>",
    "<channel-message>",
    "<cross-session-message>",
    "<fork-boilerplate>",
    "<remote-review>",
    "<remote-review-progress>",
    "<ultraplan>",
    "<tick>",
)

def count_messages(messages) -> dict:
    zen = 0
    request = 0
    response = 0
    session = 0
    for msg in messages:
        session += 1
        role = msg.get("role", "")
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(p.get("text", "") for p in content if isinstance(p, dict))

        if role == "system":
            zen += 1
        elif role == "user":
            if content.startswith(ZEN_TAGS):
                zen += 1
                request += 1
            else:
                request += 1
        elif role in ("assistant", "model"):
            response += 1
    return {"zen": zen, "request": request, "response": response, "session": session}


def is_antigravity_request(path: str) -> bool:
    return any(m in path for m in ANTIGRAVITY_METHODS)


# ─── Flask app ────────────────────────────────────────────────────────────

app = Flask(__name__)


@app.route("/v1/session/start", methods=["POST"])
def session_start():
    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id") or secrets.token_hex(8)
    project_dir = os.getcwd()
    now = datetime.now()

    log_dir = os.path.join(os.path.dirname(__file__), "logs")
    os.makedirs(log_dir, exist_ok=True)
    path = os.path.join(log_dir, f"zen_proxy_{now.strftime('%Y%m%d-%H%M%S')}-{session_id}.log")

    global LOG_FILE
    LOG_FILE = path

    global _ag_session_request_tokens
    _ag_session_request_tokens = 0

    with open(LOG_FILE, "w") as f:
        f.write("=" * 60 + "\n")
        f.write("  Zen Proxy session started\n")
        f.write("=" * 60 + "\n")
        f.write(f"  Started at : {now.isoformat()}\n")
        f.write(f"  Hostname   : {socket.gethostname()}\n")
        f.write(f"  Session ID : {session_id}\n")
        f.write(f"  Log file   : {LOG_FILE}\n")
        f.write(f"  PID        : {os.getpid()}\n")
        f.write(f"  Project    : {project_dir}\n")
        f.write("=" * 60 + "\n")

    return Response(
        json.dumps({"status": "ok", "log_file": LOG_FILE, "session_id": session_id}, ensure_ascii=False),
        status=200,
        content_type="application/json",
    )


@app.route("/v1/models", methods=["GET"])
@app.route("/models", methods=["GET"])
def list_models():
    provider = request.headers.get("X-Provider", "").lower()
    models = ANTIGRAVITY_MODELS if provider == "antigravity" else AVAILABLE_MODELS
    return Response(
        json.dumps({"object": "list", "data": models}, ensure_ascii=False),
        status=200,
        content_type="application/json",
    )


@app.route("/chat/completions", methods=["POST"])
@app.route("/v1/chat/completions", methods=["POST"])
def proxy_deepseek():
    data = request.get_json()

    data["thinking"] = {"type": THINKING_MODE}

    # Strip incoming temperature (CLI sends 1); override below
    data.pop("temperature", None)

    # inline: append "\n\ntalk less" to last user message
    for msg in reversed(data["messages"]):
        if msg.get("role") == "user":
            c = msg.get("content", "")
            if isinstance(c, str):
                msg["content"] = c + "\n\ntalk less"
            elif isinstance(c, list):
                for p in reversed(c):
                    if isinstance(p, dict) and "text" in p:
                        p["text"] = p["text"] + "\n\ntalk less"
                        break
            break

    temperature = get_temperature_from_request(data["messages"])
    data["temperature"] = temperature

    # Log request AFTER mutation so log reflects what API receives
    if data:
        log_data = dict(data)
        if "messages" in log_data:
            log_data["messages"] = list(log_data["messages"])
            for i, msg in enumerate(log_data["messages"]):
                role = msg.get("role")
                if role == "system":
                    msg_copy = dict(msg)
                    c = msg_copy.get("content", "")
                    msg_copy["content"] = f"[System prompt elided, length: {len(c) if isinstance(c, str) else 'N/A'}]"
                    log_data["messages"][i] = msg_copy
                elif role == "user":
                    c = msg.get("content", "")
                    if isinstance(c, str) and c.startswith("<system-reminder>"):
                        msg_copy = dict(msg)
                        msg_copy["content"] = f"[System reminder elided, length: {len(c)}]"
                        log_data["messages"][i] = msg_copy
        if "tools" in log_data:
            log_data["tools"] = f"[Tools array elided, count: {len(log_data['tools'])}]"

        log(f"[DEEPSEEK REQ FULL]\n{json.dumps(log_data, indent=2)}")

    last_msg = extract_last_user_message(data["messages"])

    resp = requests.post(
        f"{DEEPSEEK_API}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": request.headers.get("Authorization", ""),
        },
        json=data,
        stream=data.get("stream", False),
    )

    def _log_deepseek(usage_data):
        hit = usage_data.get("prompt_cache_hit_tokens", 0) or 0
        prompt = usage_data.get("prompt_tokens", 0) or 0
        completion = usage_data.get("completion_tokens", 0) or 0
        total = usage_data.get("total_tokens", 0) or 0
        cached_pct = f"{hit / prompt * 100:.1f}%" if prompt > 0 else "N/A"

        msg_counts = count_messages(data["messages"])
        logged_sys = msg_counts["zen"]
        req_msgs = msg_counts["request"]
        resp_msgs = msg_counts["response"] + 1
        session_msg_total = msg_counts["session"]

        zen_msgs = max(0, logged_sys - 1)

        log("---")
        log(f"[MODEL] {data["model"]}")
        log(f"[OVERRIDE] temperature: {temperature}")
        log("[MESSAGE COUNT]")
        log(f"  request: {req_msgs} (zen: {zen_msgs})")
        log(f"  response: {resp_msgs}")
        log(f"  session: {session_msg_total}")
        log("[TOKEN COUNT]")
        log(f"  CACHED: {cached_pct}")
        log(f"  request: {prompt}")
        log(f"  response: {completion}")
        log(f"  session: {total}")
        log(f"[REQUEST]:\n{last_msg[:500]}")

    if data.get("stream"):
        def generate():
            usage_data = None
            full_content = ""
            for chunk in resp.iter_content(chunk_size=None):
                if chunk:
                    chunk_str = chunk.decode() if isinstance(chunk, bytes) else chunk
                    for line in chunk_str.split("\n"):
                        line = line.strip()
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                parsed = json.loads(line[6:])
                                if "usage" in parsed and parsed["usage"]:
                                    usage_data = parsed["usage"]
                                if "choices" in parsed and len(parsed["choices"]) > 0:
                                    delta = parsed["choices"][0].get("delta", {})
                                    full_content += delta.get("content", "")
                            except json.JSONDecodeError:
                                pass
                    yield chunk

            if usage_data:
                _log_deepseek(usage_data)
            log(f"[RESPONSE]:\n{full_content}")

        return Response(
            generate(),
            content_type=resp.headers.get("content-type"),
            status=resp.status_code,
        )

    if resp.status_code != 200:
        log(f"[ERROR] HTTP {resp.status_code}: {resp.text[:500]}")
        return Response(resp.text, status=resp.status_code, content_type=resp.headers.get("content-type"))

    resp_json = resp.json()
    log(f"[DEEPSEEK RESP FULL]\n{json.dumps(resp_json, indent=2)}")

    usage_data = resp_json.get("usage")
    if usage_data:
        _log_deepseek(usage_data)

    return Response(
        json.dumps(resp_json, ensure_ascii=False),
        status=resp.status_code,
        content_type="application/json",
    )


@app.route("/v1internal:<action>", methods=["POST"])
def proxy_antigravity_route(action):  # noqa: ARG001 pylint: disable=unused-argument
    return proxy_antigravity(request.path)

def proxy_antigravity(path: str):
    data = request.get_json()
    if data:
        log(f"[ANTIGRAVITY REQ FULL]\n{json.dumps(data, indent=2)}")
    if data and "model" in data:
        data["model"] = resolve_antigravity_wire_model(data["model"])

    # Set in generatecontent block, used by _log_antigravity
    _log_antigravity = None  # type: ignore

    if "generatecontent" in path.lower():
        inner = data.setdefault("request", {})
        contents = inner.get("contents", [])
        messages = []
        for c in contents:
            role = c.get("role", "")
            if role == "model":
                role = "assistant"
            parts = c.get("parts", [])
            text_content = ""
            for p in parts:
                if isinstance(p, dict) and "text" in p:
                    text_content += p["text"]
            messages.append({"role": role, "content": text_content})

        # Append "talk less" to last user content in Antigravity format
        for c in reversed(contents):
            if c.get("role") == "user":
                parts = c.get("parts", [])
                for p in reversed(parts):
                    if isinstance(p, dict) and "text" in p:
                        p["text"] = p["text"] + "\n\ntalk less"
                        break
                break

        temp = get_temperature_from_request(messages)
        gen_config = inner.setdefault("generationConfig", {})
        gen_config["temperature"] = temp

        last_msg = messages[-1]["content"][:500] if messages else ""

        def _log_antigravity(usage_data):
            global _ag_session_request_tokens
            prompt = usage_data.get("promptTokenCount", 0) or 0
            completion = usage_data.get("candidatesTokenCount", 0) or 0
            total = usage_data.get("totalTokenCount", 0) or 0
            request_tokens = prompt - _ag_session_request_tokens
            _ag_session_request_tokens = prompt

            msg_counts = count_messages(messages)
            sys_msgs = msg_counts["system_reminder"]
            req_msgs = msg_counts["request"]
            resp_msgs = msg_counts["response"] + 1
            session_msg_total = sys_msgs + req_msgs + resp_msgs

            logged_sys = max(0, sys_msgs - 1)

            log("---")
            log(f"[MODEL] {data.get('model', '')}")
            log(f"[OVERRIDE] temperature: {temp}")
            log("[MESSAGE COUNT]")
            log(f"  system_reminder: {logged_sys}")
            log(f"  request: {req_msgs}")
            log(f"  response: {resp_msgs}")
            log(f"  session: {session_msg_total}")
            log("[TOKEN COUNT]")
            log(f"  request: {request_tokens}")
            log(f"  response: {completion}")
            log(f"  session: {total}")
            log(f"[REQUEST] {last_msg}")

    qs = request.query_string.decode("utf-8")
    url = f"{ANTIGRAVITY_API}{path}"
    if qs:
        url = f"{url}?{qs}"

    headers = {k: v for k, v in request.headers if k.lower() != "host"}
    is_stream = "streamGenerateContent" in path

    resp = requests.post(url, headers=headers, json=data, stream=is_stream)

    if is_stream:
        usage_data = None
        raw_chunks: list[bytes] = []

        for chunk in resp.iter_content(chunk_size=None):
            if chunk:
                raw_chunks.append(chunk)

        full_text = b"".join(raw_chunks).decode()
        resp_keys = set()
        full_content = ""
        for line in full_text.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                try:
                    parsed = json.loads(line[6:])
                    inner_resp = parsed.get("response", {})
                    if "usageMetadata" in inner_resp:
                        usage_data = inner_resp["usageMetadata"]
                    for cand in inner_resp.get("candidates", []):
                        for part in cand.get("content", {}).get("parts", []):
                            if "text" in part:
                                full_content += part["text"]
                except json.JSONDecodeError:
                    pass

        log(f"[ANTIGRAVITY RESP KEYS] {sorted(list(resp_keys))}")
        log(f"[ANTIGRAVITY RESP FULL (STREAM)]\n{full_content}")

        if usage_data and _log_antigravity:
            _log_antigravity(usage_data)

        def generate():
            for c in raw_chunks:
                yield c

        return Response(
            generate(),
            content_type=resp.headers.get("content-type"),
            status=resp.status_code,
        )

    if resp.status_code != 200:
        log(f"[ANTIGRAVITY ERROR] HTTP {resp.status_code}: {resp.text[:500]}")
        return Response(resp.text, status=resp.status_code, content_type=resp.headers.get("content-type"))

    resp_json = resp.json()
    log(f"[ANTIGRAVITY RESP FULL]\n{json.dumps(resp_json, indent=2)}")

    usage = resp_json.get("usageMetadata") or (resp_json.get("response") or {}).get("usageMetadata")
    if usage and _log_antigravity:
        _log_antigravity(usage)

    return Response(
        json.dumps(resp_json, ensure_ascii=False),
        status=resp.status_code,
        content_type="application/json",
    )


@app.route("/health")
def health():
    return {"status": "ok", "temperature": TEMPERATURE}


@app.after_request
def log_status(response):
    if response.status_code != 200:
        log(f"[STATUS] {response.status_code}")
    return response


if __name__ == "__main__":
    print("Zen proxy daemon starting on http://127.0.0.1:18288")
    print("  Session log: created on POST /v1/session/start")
    app.run(host="127.0.0.1", port=18288, debug=False, use_reloader=False)
