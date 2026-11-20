# Claude Code 能力对照

**信息截至：** 2026-11-02，跨会话消息截至 11-04，记忆机制截至 11-06。除非另有标注，内容都是当时对照官方文档得出的结论，原始查询结果没有保留。Claude Code 更新很快，写依赖具体 flag 或 hook 的代码前，先查文档或实测。

**验证后请更新这个文件。** 把结果记到文末的“待验证”表中，写明版本和日期。

## 基本判断

Claude Code 是一个固定且很强的单会话 Agent Loop，外加密集的扩展点和官方托管能力。所以 Super Agent 不改内核，而是在外面编排多个 Claude Code 会话：Router 和 Worker 都是会话，粘合层是我们自己的代码。**[判断]**

## 文章模块与现有能力对照

| 文章模块 | Claude Code 已有 | 要自建 |
| --- | --- | --- |
| Router 层 | Agent SDK 长会话和流式输入；`--tools` / `--disallowedTools` 能拿掉执行工具；`PreToolUse` hook 可以 deny；会话可 resume / fork | **合批**：SDK 流式输入是逐条顺序处理，不会自动合并 |
| Worker 层 | `claude -p --resume <id>`；`--worktree`；后台 subagent 默认开启；`isolation: worktree`；`--max-turns` / `--max-budget-usd` | Thread、订阅和直通路由 |
| 事件驱动 | Channels（Telegram、Discord、iMessage 推送进会话，research preview）；GitHub Action（`@claude`）；云端定时任务及其 API fire 端点；跨会话 `SendMessage` / `ListAgents` | Trigger 归一化、Thread 注册表、对象图 |
| 上下文组织 | `PostToolUse` 的 `updatedToolOutput`（可以做 Spill）；`additionalContext` 注入；`PreCompact`；`SessionStart(compact)`；auto memory | Inline 包格式、`recall`、Chain of Recall |
| 全双工 | 原生支持：后台 Bash、后台 subagent、`Monitor`，通知在工具调用之间送达 | 无 |
| 计算/状态/环境分离 | 会话是 JSONL 文件，可异地 resume；SDK `session_store`；cloud sessions；self-hosted runners；Managed Agents | 我们自己的 endpoint daemon |
| Watchdog | 云端定时任务；`claude agents --json`；`Notification` hook；`--fork-session` | 进度和漂移判断逻辑 |

## 按主题整理

### Headless（`claude -p`）

- **相关 flag：** `--input-format stream-json`、`--output-format stream-json`、`--verbose`、`--session-id`、`--resume`、`--fork-session`、`--permission-mode`、`--max-turns`、`--max-budget-usd`、`--tools`、`--disallowedTools`、`--mcp-config`、`--strict-mcp-config`、`--settings`、`--agents`、`--system-prompt-file`、`--append-system-prompt-file`、`--bare`、`--worktree` / `-w`。
- **`--bare`：** 跳过 hooks、skills、CLAUDE.md、auto memory、插件和默认 MCP。
- **`--allowedTools` 不是围栏：** 它只负责自动批准，不限制工具。要限制工具请用 `--tools` 或 `--disallowedTools`。
- **生命周期：** 无人值守上限 30 分钟（最高可设 2 小时），空闲 10 分钟退出。因此设计成“会话常驻，进程可重启”。
- **权限模式：** Worker 用 `acceptEdits`，需要更开放时用 `auto`，不用 `bypassPermissions`。

### Hooks

- **方案用到的事件：** `PreToolUse`、`PostToolUse`、`PostToolBatch`、`UserPromptSubmit`、`Stop`、`SubagentStop`、`PreCompact`、`SessionStart`、`Notification`。
- **阻止工具：** 输出 `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"..."}}`。
- **改写输入：** `updatedInput`。
- **改写工具输出：** `updatedToolOutput`。
- **阻止结束：** `{"decision":"block","reason":"..."}`。
- **注入上下文：** `additionalContext`，`SessionStart` 上限 10,000 字符。

### Subagents 和 Agent Teams

- subagent 工具现在叫 `Agent`，不是 `Task`。
- subagent 默认后台运行，完成后以通知形式送达。方案记录的嵌套深度默认 3，并发上限 20。
- Agent Teams 是实验性功能，只支持交互式；`-p` 和 SDK 不会启动 teammate。所以 Worker 内部用 subagents。

### 后台执行

- `Bash` 的 `run_in_background: true` 立即返回任务 ID，输出写入文件。
- `TaskStop` 停止任务，`Monitor` 流式查看输出。
- 前台命令超时会自动转后台，`-p` 进程会为后台任务保持存活。
- 流式输入的新消息在当前轮结束后处理。要立即打断，用 SDK 的 `interrupt()`。

### Agent SDK

- 提供 `ClaudeSDKClient`、`AsyncIterable` 流式输入、`resume` / `fork_session`、进程内 MCP 工具（`create_sdk_mcp_server`）和 `interrupt()`。
- 同一进程跑多个独立会话，官方文档没有保证，**[未验证]**。

### 云端和远程

- **云端定时任务：** 最小间隔 1 小时，每次是新会话。API fire 端点限流记录为 100 次/小时/账户。
- **Self-hosted environment runner：** 面向 Team/Enterprise，是文档化的“云端会话在你的基础设施上执行”的方式。
- **Remote Control（`claude --rc`）：** 用手机或浏览器驱动本地会话，方向和 BYOM 相反，不是方案的组件。
- **Managed Agents：** Agent / Environment / Session / Events 四个概念，可以作为 P3 的 Worker 后端。
- **Agent view（`claude --bg`、`claude agents --json`）：** 状态有 `working | blocked | done | failed | stopped`，research preview。

### Channels 和外部入口

- **Channels：** `claude --channels plugin:telegram@...`，需要 claude.ai 或 Console 鉴权，research preview。
- **Claude Tag：** Slack 里的 Claude，需要 Team/Enterprise。
- **GitHub Action：** 支持 `@claude` 的同步场景。

### 记忆和上下文（2026-11-06 核对）

来源：[How Claude remembers your project](https://code.claude.com/docs/en/memory)

- 跨会话记忆是 CLAUDE.md 和 auto memory 两种，文档没有提到 claude.ai 对话。
- CLAUDE.md 从工作目录及其上级目录加载；子目录里的按需加载。
- `@path` 导入最多四跳。**导入不省上下文**，会和 CLAUDE.md 一起加载。建议单文件 200 行以内。
- 导入工作目录之外的文件时，首次会弹出批准对话框。
- `/context` 可以确认哪些文件已加载。
- 根目录 CLAUDE.md 在 `/compact` 后会重新读取注入。
- Auto memory 位于 `~/.claude/projects/<project>/memory/`，只保存在本机，启动时加载 `MEMORY.md` 的前 200 行或 25KB，topic 文件按需读取。`autoMemoryDirectory` 可以改位置。
- 会话转录会按 `cleanupPeriodDays` 清理。**如果 Worker 依赖旧会话 resume，要留意这个保留期。**这是整理时的 **[判断]**，方案里没有提到。

### 跨会话消息

见 `cross-session-messaging.md`。

## 待验证

前 9 项来自方案第 14.3 节，后 4 项是整理时补充的。

| # | 问题 | 为什么重要 | 结果（版本 / 日期） |
| --- | --- | --- | --- |
| 1 | 同一进程内多个 Agent SDK 会话并发是否可靠 | 决定 P2 的进程模型；不行就一会话一子进程 | |
| 2 | `--input-format stream-json` 的行结构和 CLI 路径下的打断消息 | Kernel 和 Router 的对接 | |
| 3 | `-p` 时限按会话还是按轮计算，对持续接收输入的 Router 是否生效 | Router 能否长驻 | |
| 4 | `updatedToolOutput` 对 MCP 工具返回是否生效 | Spill 和脱敏的覆盖面 | |
| 5 | `--bare` 下 `--settings` 传入的 hooks 是否执行 | Router 第三层围栏 | |
| 6 | Stop hook 运行测试的超时上限 | 大仓库的验收门 | |
| 7 | 跨会话 `SendMessage` 能否送达 `-p` 会话，`crossSessionInbound` 的过滤粒度 | Watchdog 纠偏 | |
| 8 | 云端定时任务 fire 端点的认证和限流 | Watchdog 触发 | |
| 9 | 投机 Worker 用什么身份推分支、开 PR | 投机执行 | |
| 10 | `--tools "mcp__router__*"` 的通配写法是否按预期工作 | Router 第一层围栏 | |
| 11 | `--max-turns 50` 对长驻流式 Router 是按轮还是按会话累计 | 否则 Router 可能提前退出 | |
| 12 | 云端 Watchdog 如何连到 Kernel 主机上的注册表和转录，主机挂掉时能看到什么 | 方案没有写明 | |
| 13 | 无人值守的 `claude -p` 用什么账号或 API key，是否符合对应条款 | 成本和合规 | |

## 官方文档

- [Hooks](https://code.claude.com/docs/en/hooks) · [Hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [CLI reference](https://code.claude.com/docs/en/cli-reference) · [Headless](https://code.claude.com/docs/en/headless)
- [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Subagents](https://code.claude.com/docs/en/sub-agents) · [Agent teams](https://code.claude.com/docs/en/agent-teams) · [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- [Channels](https://code.claude.com/docs/en/channels) · [GitHub Actions](https://code.claude.com/docs/en/github-actions) · [Claude Tag](https://claude.com/docs/claude-tag/overview)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) · [Self-hosted environments](https://code.claude.com/docs/en/self-hosted-environments) · [Scheduled tasks](https://code.claude.com/docs/en/routines) · [Remote Control](https://code.claude.com/docs/en/remote-control)
- [Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview)
- [Context window](https://code.claude.com/docs/en/context-window) · [Memory](https://code.claude.com/docs/en/memory) · [Sessions](https://code.claude.com/docs/en/sessions) · [Worktrees](https://code.claude.com/docs/en/worktrees)
- [Tools reference](https://code.claude.com/docs/en/tools-reference) · [Agent view](https://code.claude.com/docs/en/agent-view) · [Plugins components](https://code.claude.com/docs/en/plugins/components) · [Skills](https://code.claude.com/docs/en/skills)
