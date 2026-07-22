#!/usr/bin/env zsh
# Restart the Zen proxy daemon.
# Matches the launch pattern in ~/.zshrc (lines 149-160).

PID_FILE="$HOME/harness/zen/proxy/daemon.pid"
SCRIPT="$HOME/harness/zen/proxy/app.py"
PYTHON="$HOME/.claude/zen-venv/bin/python3"
LOG_DIR="$HOME/harness/zen/proxy/logs"

# Kill existing daemon
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Stopping zen-proxy (pid $OLD_PID)..."
    kill "$OLD_PID" 2>/dev/null
    # Give it a moment, then force if still alive
    sleep 0.5
    if kill -0 "$OLD_PID" 2>/dev/null; then
      kill -9 "$OLD_PID" 2>/dev/null
    fi
  fi
  rm -f "$PID_FILE"
fi

# Start new daemon
mkdir -p "$LOG_DIR"
nohup "$PYTHON" "$SCRIPT" >> "$LOG_DIR/daemon.log" 2>&1 &
NEW_PID=$!
echo $NEW_PID > "$PID_FILE"
echo "Started zen-proxy (pid $NEW_PID)"
