# dsh-superagent

> **Research prototype for reference only, not an official DeepSeek product.** This code grew out of our team's day-to-day development work, with much of the engineering done by coding agents. Treat it as research code, not production-ready software. It may still contain bugs, and its coding style and engineering practices may be inconsistent. Review and adapt it before using it in your own environment.
>
> We have adapted it for publication, so it is not identical to our internal version or the implementation described in *Exploring Super-agent Design: Towards a More Autonomous Agent System*. Some designs discussed in the article are directions for future development and are not implemented in this prototype.

dsh-superagent is a proactive coding agent for the working directories you give it, packaged as a bundle for [DeepSeek Harness](https://www.deepseek.com/en/harness/). Each working directory is a Workspace in DSH's own Workspace list, with an optional GitHub repository bound to it. The agent listens to every bound repository and, optionally, to Feishu. When someone allowed asks the agent for work, it opens a work item, works on it in a directory of its own beside that Workspace, and answers in the original conversation, for example with a pull request. A web panel shows what needs a person, and names the Workspace each work item runs in.

It is also a way of working with an agent: **take as little human attention as possible, and give as much value as possible.** An agent that can act for a whole team can also waste a whole team's attention, so it acts only when asked or when a rule the team wrote allows it, and speaks only when someone must act or can use a result. [docs/000-philosophy.md](docs/000-philosophy.md) explains the principle and what it asks of the operator.

## Setup

Setup has many steps, so an agent does it with you. Ask your coding agent:

> Read SETUP.md in this repository and set up dsh-superagent with me.

It asks one short question at a time, shows the full plan once, and then installs and configures everything. [SETUP.md](SETUP.md) is what it follows.

## Documentation

Read the numbered documents in order; each builds only on the ones before it.

- [000 Philosophy](docs/000-philosophy.md)
- [001 Domain model](docs/001-domain.md)
- [002 Authorization](docs/002-authorization.md)
- [003 Execution](docs/003-execution.md)
- [004 Prompts](docs/004-prompts.md)
- [005 Panel](docs/005-panel.md)
- [006 Deployment](docs/006-deployment.md): manual setup, configuration, upgrades and troubleshooting
- [007 Architecture](docs/007-architecture.md)
- [008 Cookbook](docs/008-cookbook.md): adding a Source

## Workspaces

A Workspace is the unit that decides where work happens and which repository its work items come from. The settings page under **Execution → Workspaces** lists them: each entry has a name, a directory, an optional repository, an optional prepare command and an enabled switch. A directory left empty runs under the Execution root, and one repository may be bound to one Workspace only.

The list is not a second list of folders. DSH already keeps one Workspace per directory a Session runs in, and the panel offers those directories for you to bind; a directory you bind here is registered in DSH's Workspace list too, so it shows up in the sidebar beside the folders you work in. A work item's own directory is listed there only while the work item is open, and its entry is dropped when it ends — the directory and its Session logs stay.

Existing installations upgrade in place: the repository from the GitHub Source becomes the first Workspace, named after the repository.

## Platforms

dsh-superagent runs on POSIX systems and on Windows, from the same code. On Windows the runtime resolves `gh` and `lark-cli` through `PATH` and `PATHEXT`, writes `<name>.cmd` command shims, starts batch files through `cmd.exe` because Node cannot start one directly, and runs a prepare command in `pwsh` (or `powershell.exe`) instead of `sh`. On POSIX it keeps extensionless shims and `sh -c`. The test suite runs on both.

## Development

`pnpm check` runs the typecheck, the tests and the build.

## License

[MIT](LICENSE)
