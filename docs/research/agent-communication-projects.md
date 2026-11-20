# 多 Agent 通信项目调研

**来源：** [对话 2](https://claude.ai/chat/fdd1458f-6e67-4fc7-bf9f-621069b1097c)，2026-11-04。

**依据和局限：** 读了三个开源仓库的文档和部分关键源码，**没有实际运行**。当时是浅克隆，记录中没有 commit 号，星数和活跃度也没有保留。开工前请重新确认。

**背景：** 用户记得见过一个类似群聊的界面，里面接入不同 agent，各有角色，还能互相分发任务。问题是 Pear / Agent Relay、agentchattr、OpenAgents 是否已经实现了一部分 Super Agent 的构想。

## 结论

它们已经做了“多 agent 通信层”的大部分，其中 Agent Relay 最接近 Claude Code 的跨会话消息。但它们解决的主要是通信和协作界面，Super Agent 的编排大脑还得自己做。

用户记得的群聊界面最像 **agentchattr**：官方截图就是频道群聊，agent 带 Designer、Reviewer 等角色标签，互相 @，旁边还有 Jobs 和 Rules 面板。不过 Pear 也主打类似 Slack 的频道，所以不能确定就是它。

## 三个开源项目对比 **[源码]**

| | agentchattr | Agent Relay | OpenAgents |
| --- | --- | --- | --- |
| 接入方式 | 包装你启动的 CLI，运行在 tmux 或 Windows 控制台里 | 优先走各 CLI 的原生通道，也能接管已打开的会话 | 自己启动 agent，如 `claude -p --output-format stream-json` |
| 唤醒方式 | 向终端粘贴“去读频道”的提示，agent 再用 MCP 读消息 | Claude 写入会话的收件箱 socket；Codex 用 `codex queue` 和 hook | 适配器轮询服务端，间隔 2–15 秒 |
| 运行中投递 | 没有专门机制，取决于 CLI 如何处理输入 | **有**，Codex 用 PostToolUse 和 Stop hook 注入上下文 | 同频道排队，主路径上没看到工具调用间注入 |
| 消息路径 | 仅本机 | 默认经托管的 Relaycast，可自建 | 默认经 openagents.org，可自建 |
| 许可证 | MIT | Apache-2.0 | Apache-2.0 |
| 规模 | 约 1 万行 Python，易读 | 3000+ 文件，含 Rust 核心 | 3000+ 文件，含完整工作区产品 |

## Pear

- 建立在 Agent Relay 之上的桌面应用，提供 agent 终端、关系图、diff 审查和用量统计。
- 当时是私测，只支持 Apple Silicon 的 Mac，页面没有写价格和开源情况。
- 信息来自搜索结果里的一个 CloudFront 地址，**没有在官方域名上核对**。

## 可以借鉴的部分

- **跨厂商唤醒：** agentchattr 证明终端注入这个最简单的办法能跑通，还能保留各家官方 CLI。
- **按工具分路由：** Relay 的文档记录了一条完整链路：消息先注入 Claude 会话，Claude 再发给 Codex，Codex 的回复又注入回 Claude。
- **确认送达：** Relay 不把“文字出现在终端”当作送达，而是等 CLI 真正接受这一轮。很值得借鉴。
- **防循环：** agentchattr 默认每个频道 4 跳后暂停，等人发 `/continue` 继续。

## 对之前结论的修正

- 之前说运行中注入要靠第三方 CLI 提供 hook 或协议。Relay 的源码显示 Codex 已经有这类 hook，所以不必自己掌管 Codex 的循环。
- 用户说的竞品缺的主要是开箱即用的会话互发，底层能力未必缺。OpenAgents 还列了 Antigravity 适配器和预览版的 DeepSeek Harness。

## 还没解决好的部分 **[判断]**

- **任务编排：** 拆解、依赖、验收和失败重试。它们各有雏形，如 agentchattr 的 Jobs 和 Relay 的 flows，但这才是 Super Agent 的核心。
- **跨厂商权限：** 一个 agent 被拒绝后，不能换一个权限更高的 agent 代做。
- **共享上下文：** 多 agent 之间的记忆、决策记录和冲突合并。

## 试用前的安全注意事项

都先在隔离环境里试。

| 项目 | 风险 | 处理 |
| --- | --- | --- |
| Agent Relay | `relay init` 会改 `~/.claude/settings.json`。如果没设置过 `crossSessionInbound`，会写入 `accept`，对该账号的所有会话生效，还会加 SessionStart hook 和权限放行规则 | 不要在日常账号配置上直接跑。`relay init --uninstall` 可以撤销 |
| OpenAgents | 默认 execute 模式带 `--dangerously-skip-permissions`，工作区消息可以驱动本机 agent，且没有权限确认 | 不接入真实机器和凭据 |
| agentchattr | README 明确警告，开放网络访问再加自动批准，等于允许远程执行代码 | 只在本机使用 |
| Agent Relay（兼容性） | 依赖 Claude 会话记录里的 `messagingSocketPath`，官方文档里没看到这个字段 | CLI 升级后可能失效 |

## 当时的建议 **[判断，用户未确认]**

不要重写通信层，把精力放在编排层：

1. **先试用：** 用 agentchattr 跑一遍 multi lanes 流程，半天左右就能判断群聊形态是否适合。
2. **再选底座：** 如果需要运行中投递和跨机协作，就基于 Relay，或者照它的路由表写一层精简适配。
3. **做差异化：** 自己实现任务图、验收闭环和统一权限。

## 和落地方案的关系

这条建议晚于落地方案（11-02），方案没有吸收它，两者要放在一起看：

- 方案只编排 Claude Code，由 Kernel 经 stdio 或 `--resume` 投递。这种情况下用不上这些项目的跨厂商通道。
- 如果决定跨厂商，Worker 接口就要按厂商抽象，Relay 的路由表和确认送达机制才真正有价值。
- 方案的差异化也集中在 Kernel、Router、引用图和 Watchdog，和“做编排层”的方向一致。分歧主要在通信层自写还是复用。

这是 `decisions.md` 的未决问题 1 和 2。

## 来源

- [agentchattr](https://github.com/bcurts/agentchattr)
- [AgentWorkforce/relay](https://github.com/AgentWorkforce/relay)
- [OpenAgents](https://github.com/openagents-org/openagents)
- [Pear 产品页（CloudFront 地址）](https://d1gp7b6a86uot3.cloudfront.net/pear)
