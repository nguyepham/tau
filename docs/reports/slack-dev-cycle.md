### Dev Workflow Roles
- **Alerts & Observability:** Sentry, Datadog, CloudWatch => error alerts + metric spikes routed to dedicated channels.
- **VCS & CI/CD:** GitHub/GitLab apps => PR review requests, commit checks, pipeline failures, release tags.
- **Incident Management:** PagerDuty/Opsgenie integrations => auto-generate incident channels (`#inc-<id>`), track triage timelines, sync status pages.
- **ChatOps:** Slash commands (`/deploy`, `/rollback`) + interactive message buttons => trigger workflows without context switching.

### Developer Platform (Building Slack Apps)
- **UI Framework:** Block Kit (declarative JSON) => renders cards, modals, inputs, buttons.
- **Inbound APIs:**
  - Incoming Webhooks: one-way JSON over HTTP POST for simple messaging.
  - Web API: HTTP REST (`chat.postMessage`, `conversations.history`) authenticated via Bot/User OAuth tokens.
- **Outbound / Interactivity:**
  - Events API: HTTP webhooks pushed to public HTTPS endpoint on workspace actions (`app_mention`, `reaction_added`).
  - Socket Mode: persistent WebSocket connection. Receives events/payloads behind corporate firewalls without public ingress.
- **SDKs:** Bolt (`@slack/bolt` for Node/TS, `slack_bolt` for Python) => abstracts signature verification, event routing, OAuth, state handling.

### Best Practices
- Thread replies > channel-level posts. Prevents channel noise.
- Separate alert tiers: `#alerts-urgent` (on-call ping) vs `#alerts-info` (silent log stream).
- User-specific outputs => `chat.postEphemeral`.
- Request verification: validate incoming `X-Slack-Signature` using app signing secret. Prevent spoofed webhooks.
