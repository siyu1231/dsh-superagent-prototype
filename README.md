English | [简体中文](README.zh.md)

# dsh-superagent (fork)

A fork of [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) (MIT, DeepSeek Harness Agent Team). The upstream design is kept: an agent that turns events into Tickets, works each Ticket in a directory of its own, and answers where it was asked. This fork adapts it to Windows and to many working directories, and gives the router Session a way to be replaced.

> **Research prototype, not an official DeepSeek product.** Upstream says the same about itself. Review it before using it in your own environment.

## What upstream already does

- **Event → Ticket → Session.** A Source turns an event into a Trigger, a Policy (with an optional Eval assessment) decides whether it becomes a Ticket, the Ticket gets exactly one executor Session, and the answer goes back to the conversation — usually as a pull request.
- **Sources.** GitHub (issues, pull requests, comments, CI) and, optionally, Feishu.
- **Rules, not eagerness.** Nothing is acted on unless a person allowed it or a written rule allows it.
- **A panel.** Overview, Sources, Triggers, Decisions, Execution, Settings, plus per-record pages.
- **Isolation.** The bot has its own git identity and its own credential shim; a Ticket never touches the operator's checkout.
- **Prompts and skills.** The router and the executor each get their own prompt, tool set and skills.

## What this fork changes

**1. Windows.** The plugin starts, resolves CLIs and runs work on Windows while POSIX behaviour is unchanged: PATHEXT lookup, `.cmd` shims that strip themselves from `PATH` and keep exit codes, `cmd.exe` quoting, PowerShell as the prepare shell, Git's schannel certificate settings for the worker, stale-lock reclaim, and a `pwsh`-aware master tool allowlist.

**2. Working directories instead of one repository.** Every folder in DSH's own Workspace list is a working directory; each may bind one GitHub repository, and the GitHub Source only decides the account and which events to receive. One Source polls every bound repository, thread keys are qualified per repository (`owner/name#4` versus `#4`), and each Ticket runs in its own directory beside its Workspace.

**3. A router Session that can be replaced.** A router's context only grows. `orchestrator_new_router`, the panel's **新开编排会话**, or simply starting a new Session in the router's own folder hands duty to a successor, which starts from a briefing — open Tickets, waiting candidates, recent Decisions, policy, Source health — and receives the queued work from then on. The predecessor keeps its history and gets nothing new; exactly one Session is on duty.

**4. A 跟踪 tab and a per-Ticket conversation tab.** In the right column's new-tab page, **跟踪** lists the Tickets this Session took. Opening one shows that Ticket's executor conversation (read from its Session log, folded one row per turn with the closing answer visible and the tools behind it), and a bottom button opens the real Session, restoring it first when it was archived.

**5. Sessions grouped and archived properly.** The plugin's Sessions belong to their DSH Workspace, so they no longer sit under 未分组; a finished Ticket's Session is archived, and opening it restores it instead of landing on an empty conversation.

**6. Documentation.** A Chinese README, Windows notes in `SETUP.md`, and the numbered docs kept in step with the code (`003-execution.md`, `005-panel.md`, `007-architecture.md`).

## Setup

Setup has many steps, so an agent does it with you. Ask your coding agent:

> Read SETUP.md in this repository and set up dsh-superagent with me.

On Windows the deployment lives in its own DSH profile, so the plugin's process-wide PATH and git settings cannot leak into your own sessions. See [SETUP.md](SETUP.md) and [docs/006-deployment.md](docs/006-deployment.md).

## Documentation

- [000 Philosophy](docs/000-philosophy.md) · [001 Domain model](docs/001-domain.md) · [002 Authorization](docs/002-authorization.md)
- [003 Execution](docs/003-execution.md) · [004 Prompts](docs/004-prompts.md) · [005 Panel](docs/005-panel.md)
- [006 Deployment](docs/006-deployment.md) · [007 Architecture](docs/007-architecture.md) · [008 Cookbook](docs/008-cookbook.md)

## License

MIT, as upstream. Copyright for the original work belongs to the DeepSeek Harness Agent Team; this fork's changes are published under the same licence.
