#!/usr/bin/env zsh
PID_FILE="$HOME/f/tau/proxy/daemon.pid"
LOG_FILE="$HOME/f/tau/proxy/logs/daemon.log"

mkdir -p "${LOG_FILE%/*}"
fuser -k 18288/tcp 2>/dev/null || lsof -ti:18288 | xargs kill -9 2>/dev/null || true
[ -f "$PID_FILE" ] && kill -9 "$(cat "$PID_FILE")" 2>/dev/null && rm -f "$PID_FILE"

nohup bun run "$HOME/f/tau/proxy/app.js" > "$LOG_FILE" 2>&1 &
echo $! > "$PID_FILE"
