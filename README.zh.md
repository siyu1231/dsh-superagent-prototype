[English](README.md) | 简体中文

# dsh-superagent（分支版）

基于 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)（MIT，DeepSeek Harness Team）的分支。上游的核心设计保留：把事件变成工单、每张工单在自己的目录里干、回到原处答复。本分支在它之上做了 Windows 适配、多工作目录，以及让编排会话可以被换掉。

> **仅供研究参考的原型，不是 DeepSeek 的正式产品。** 上游对自己的说明也是如此。在你自己的环境里使用前，请先审阅。

## 上游已经具备的核心功能

- **事件 → 工单 → 会话。** 来源把事件变成触发，策略（可加一次模型判断）决定要不要立项，立项后一张工单对应唯一一个执行会话，结果回到原对话——通常是一个 PR。
- **来源。** GitHub（issue、PR、评论、CI），可选飞书。
- **靠规则、不靠热情。** 没有人授权、也没有规则允许的事，它不动手。
- **网页面板。** 总览、来源、触发、判断、执行、设置，以及每条记录的详情页。
- **隔离。** 机器人有自己的 git 身份和凭据代理，工单不会碰你的工作副本。
- **提示与技能。** 编排会话和执行会话各自有提示、工具集与技能。

## 这个分支做了什么

**1. 能在 Windows 上跑。** 插件能启动、能解析命令行、能干活，POSIX 行为不变：PATHEXT 解析、`.cmd` 中间层（把自己从 PATH 里摘掉、保留退出码）、`cmd.exe` 引号处理、用 PowerShell 作 prepare shell、给 worker 补 Git 的 schannel 证书设置、残留锁回收、按平台放行 `pwsh`。

**2. 从「一个仓库」变成「工作目录」。** DSH 工作区列表里的每个文件夹都是一个工作目录，每个目录可绑定一个 GitHub 仓库；GitHub 来源只管账号和收哪些事件。一个来源轮询所有已绑定仓库，线程标识按仓库区分（`owner/name#4` 与 `#4`），每张工单在自己的工作目录旁边的子目录里跑。

**3. 编排会话可以换新。** router 的上下文只增不减。用 `orchestrator_new_router` 工具、面板上的**新开编排会话**，或者干脆在 router 自己的文件夹里新建一个会话，职责就交给继任者：它先收到一份简报（未完成工单、等待判断的候选、最近决定、策略、来源健康），之后的消息都投给它。前任保留历史但不再收新活；任何时刻只有一个会话在岗。

**4. 「跟踪」标签与每张工单的对话标签。** 右侧栏「+」新建页里的**跟踪**列出本会话接过的工单；点开一条会打开该工单的「执行会话」——内容读自那条会话的日志，按轮折叠，只显示每轮结束时的结论，工具与思考收在行内——底部按钮进入真实会话，若它已被归档会先恢复再打开。

**5. 会话归组与归档修复。** 插件的会话归属到对应的 DSH 工作区，不再落到「未分组」；工单结束时归档它的执行会话，再次打开时先恢复，而不是落到一个空会话。

**6. 文档。** 中文 README、`SETUP.md` 的 Windows 说明，以及跟着代码一起更新的编号文档（`003-execution.md`、`005-panel.md`、`007-architecture.md`）。

## 安装

安装步骤不少，所以由一个智能体陪你做。对你的编码智能体说：

> 读这个仓库里的 SETUP.md，和我一起装 dsh-superagent。

在 Windows 上，部署放在独立的 DSH profile 里，这样插件对 PATH 和 git 的全局设置不会影响到你自己的会话。见 [SETUP.md](SETUP.md) 与 [docs/006-deployment.md](docs/006-deployment.md)。

## 文档

- [000 理念](docs/000-philosophy.md) · [001 领域模型](docs/001-domain.md) · [002 授权](docs/002-authorization.md)
- [003 执行](docs/003-execution.md) · [004 提示](docs/004-prompts.md) · [005 面板](docs/005-panel.md)
- [006 部署](docs/006-deployment.md) · [007 架构](docs/007-architecture.md) · [008 配方](docs/008-cookbook.md)

## 许可

MIT，与上游一致。原始作品版权归 DeepSeek Harness Team；本分支的改动以同一许可发布。
