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

TOP_P = 0.9

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


def log(msg: str = ""):
    if not LOG_FILE:
        return
    with open(LOG_FILE, "a") as f:
        f.write(msg + "\n")


# ─── Helpers ──────────────────────────────────────────────────────────────


def resolve_model(raw: str) -> str:
    base = raw.lower().replace("[1m]", "").replace("[2m]", "").strip()
    if base.startswith("deepseek/"):
        base = base.removeprefix("deepseek/")
    return MODEL_MAP.get(base, "deepseek-v4-flash")


def resolve_antigravity_wire_model(model: str) -> str:
    m = model.lower()
    if m == "gemini-3.1-pro-high":
        return "gemini-pro-agent"
    if m == "gemini-3.5-flash-high":
        return "gemini-3-flash-agent"
    if m == "gemini-3.5-flash-medium":
        return "gemini-3.5-flash-low"
    if m == "gemini-3.5-flash-low":
        return "gemini-3.5-flash-extra-low"
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
        if msg.get("role") == "user":
            content = msg.get("content", "")
            if isinstance(content, list):
                texts = [p.get("text", "") for p in content if isinstance(p, dict)]
                return " ".join(texts)
            return str(content) if content else ""
    return ""


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

    raw_model = data.get("model", "")
    resolved = resolve_model(raw_model)
    if resolved != raw_model:
        log(f"[MODEL] {raw_model} -> {resolved}")
    data["model"] = resolved

    data["thinking"] = {"type": THINKING_MODE}
    data["reasoning_effort"] = REASONING_EFFORT

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
    data["top_p"] = TOP_P

    last_msg = extract_last_user_message(data["messages"])
    log("---")
    log(f"[DEEPSEEK] msgs={len(data['messages'])} user={sum(1 for m in data['messages'] if m.get('role') == 'user')} temp={temperature} top_p={TOP_P}")
    log(f"[DEEPSEEK USER] {last_msg[:500]}")

    resp = requests.post(
        f"{DEEPSEEK_API}/chat/completions",
        headers={
            "Content-Type": "application/json",
            "Authorization": request.headers.get("Authorization", ""),
        },
        json=data,
        stream=data.get("stream", False),
    )

    if data.get("stream"):
        def generate():
            usage_data = None
            finish_reason = None
            for chunk in resp.iter_content(chunk_size=None):
                if chunk:
                    chunk_str = chunk.decode() if isinstance(chunk, bytes) else chunk
                    for line in chunk_str.split("\n"):
                        line = line.strip()
                        if line.startswith("data: ") and line != "data: [DONE]":
                            try:
                                parsed = json.loads(line[6:])
                                choices = parsed.get("choices", [])
                                if choices:
                                    finish_reason = choices[0].get("finish_reason") or finish_reason
                                if "usage" in parsed:
                                    usage_data = parsed["usage"]
                            except json.JSONDecodeError:
                                pass
                    yield chunk
            if usage_data:
                log("[DEEPSEEK USAGE]")
                log(f"  prompt_tokens: {usage_data.get('prompt_tokens')}")
                log(f"  completion_tokens: {usage_data.get('completion_tokens')}")
                log(f"  total_tokens: {usage_data.get('total_tokens')}")
                log(f"  prompt_cache_hit_tokens: {usage_data.get('prompt_cache_hit_tokens')}")
                log(f"  prompt_cache_miss_tokens: {usage_data.get('prompt_cache_miss_tokens')}")
                ctd = usage_data.get("completion_tokens_details")
                if ctd:
                    log("  completion_tokens_details:")
                    log(f"    reasoning_tokens: {ctd.get('reasoning_tokens')}")
            if finish_reason:
                log(f"[ DEEPSEEK FINISH_REASON] {finish_reason}")

        return Response(
            generate(),
            content_type=resp.headers.get("content-type"),
            status=resp.status_code,
        )

    if resp.status_code != 200:
        log(f"[ERROR] HTTP {resp.status_code}: {resp.text[:500]}")
        return Response(resp.text, status=resp.status_code, content_type=resp.headers.get("content-type"))

    resp_json = resp.json()
    usage_data = resp_json.get("usage")
    if usage_data:
        log("[DEEPSEEK USAGE]")
        log(f"  prompt_tokens: {usage_data.get('prompt_tokens')}")
        log(f"  completion_tokens: {usage_data.get('completion_tokens')}")
        log(f"  total_tokens: {usage_data.get('total_tokens')}")
        log(f"  prompt_cache_hit_tokens: {usage_data.get('prompt_cache_hit_tokens')}")
        log(f"  prompt_cache_miss_tokens: {usage_data.get('prompt_cache_miss_tokens')}")
        ctd = usage_data.get("completion_tokens_details")
        if ctd:
            log("  completion_tokens_details:")
            log(f"    reasoning_tokens: {ctd.get('reasoning_tokens')}")
    choices = resp_json.get("choices", [])
    if choices:
        fr = choices[0].get("finish_reason")
        if fr:
            log(f"[DEEPSEEK FINISH_REASON] {fr}")

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
    if data and "model" in data:
        data["model"] = resolve_antigravity_wire_model(data["model"])

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
        gen_config["topP"] = TOP_P

        last_msg = messages[-1]["content"][:500] if messages else ""
        log("---")
        log(f"[ANTIGRAVITY] msgs={len(messages)} user={sum(1 for m in messages if m.get('role') == 'user')} temp={temp} topP={TOP_P}")
        log(f"[ANTIGRAVITY USER] {last_msg}")

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
        for line in full_text.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                try:
                    parsed = json.loads(line[6:])
                    inner_resp = parsed.get("response", {})
                    if "usageMetadata" in inner_resp:
                        usage_data = inner_resp["usageMetadata"]
                except json.JSONDecodeError:
                    pass

        if usage_data:
            log("[ANTIGRAVITY USAGE]")
            log(f"  prompt_tokens: {usage_data.get('promptTokenCount')}")
            log(f"  completion_tokens: {usage_data.get('candidatesTokenCount')}")
            log(f"  total_tokens: {usage_data.get('totalTokenCount')}")

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
    usage = resp_json.get("usageMetadata") or (resp_json.get("response") or {}).get("usageMetadata")
    if usage:
        log("[ANTIGRAVITY USAGE]")
        log(f"  prompt_tokens: {usage.get('promptTokenCount')}")
        log(f"  completion_tokens: {usage.get('candidatesTokenCount')}")
        log(f"  total_tokens: {usage.get('totalTokenCount')}")
    candidates = (resp_json.get("response") or resp_json).get("candidates", [])
    if candidates:
        fr = candidates[0].get("finishReason")
        if fr:
            log(f"[ANTIGRAVITY FINISH_REASON] {fr}")

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
