# 方案甲、乙的比较与合并记录

**来源：** [对话 1](https://claude.ai/chat/73a23fe4-82d7-4a74-8946-f2d1ecdb3def)，2026-11-02。

- **方案甲：** 另一个人提出的 `cc-superagent` 架构设想与工程规划，是用户提供的附件。**原文已无法取回**，下面的内容都是 Claude 当时的转述和评价。
- **方案乙：** Claude 对照 Claude Code 官方文档写的设想与规划。

下面的评价都是 Claude 的 **[判断]**，而方案乙也是 Claude 自己写的，所以不算独立评审。如果能找回方案甲，值得让人重新比较一次。

当时的结论：方案甲工程细节更具体，方案乙更贴合 Claude Code 的真实能力，也更重视可运维性。

## 方案甲的长处（已采纳）

| 设计 | 价值 | 方案乙当时的状态 |
| --- | --- | --- |
| Pass-through 影子日志：直通事件不唤醒 Router，下次唤醒时附一行记录 | 用很低的成本保留 Router 的全局态势 | 没有 |
| Credential Broker、占位符、高熵扫描：命令只写 `$CRED_PROD_DB_URL`，由 daemon 在进程环境中注入，输出回传前脱敏 | 完整实现“用凭据但看不见凭据” | 只有方向，没有机制 |
| 显式边表 + FTS5：`recall_object(query="鉴权")` 按内容找入口，再多跳 | 提供从模糊问题到第一个对象 ID 的入口 | 只有 `recall(id)` |
| 投机执行协议：`mode="speculative"`、`ttl_minutes`、`SPECULATIVE_ABORT / SUCCESS` | 有 TTL 和明确终态，Router 可以据此决定是否开口 | 有逻辑，没有协议 |
| `WAITING_FOR_ENDPOINT` 状态 | 把笔记本合盖建模成正常状态，而不是异常 | 只在验收标准里提到 |
| Router 用 `--system-prompt-file` 整体替换系统提示 | 省掉不需要的写代码指导 | 用的是 `--append` |
| 目录结构和 `kernel.ts` 骨架 | 可以直接开工 | 只有接口定义 |

## 方案甲的问题（已修正）

| 问题 | 为什么有问题 | 修正 |
| --- | --- | --- |
| 自建 `async_exec_start/stop` MCP | 前提是原生 Bash 会阻塞，但 Claude Code 有 `run_in_background`、`TaskStop` 和 `Monitor`。自建会丢掉这些集成，模型还要学两套工具 | 用原生后台任务，中途打断用 SDK `interrupt()` |
| Watchdog 放在同主机 cron，且能直接改策略文件 | 主机挂了它也挂。它读的是不可信转录，直接改策略是注入攻击的最短路径 | 放到云端定时任务，策略变更只出 proposal，由人合并 |
| 没考虑进程生命周期 | `-p` 无人值守上限 30 分钟（最高 2 小时），空闲 10 分钟退出，长连接 Router 的假设不成立 | 把 Router 重启视为常态，用 `--resume` 续上 |
| 只靠 `--disallowedTools` 做围栏 | 单层不够硬 | `--tools` 白名单 + `--disallowedTools` + `PreToolUse` deny 三层 |
| 引用了旧名称和不安全的解析 | subagent 工具现在叫 `Agent` 而不是 `Task`；模型名是上一代；`stdout.on('data')` 按 chunk 解析 JSON 会在行被切开时崩溃 | 更新名称，加行缓冲 |
| 没有可度量的验收 | 不跑合成负载，就不知道 Router 是否真的不执行、直通是否真的省 token | 按阶段设实验门禁 |
| 投机 Worker“单测全绿才汇报”没有保证机制 | 只是提示词里的一句话 | `Stop` hook 跑测试，不过就 block |
| BYOM 执行面分裂 | 模型同时面对本地 worktree 和 Remote Env MCP 两套文件系统和 shell，容易搞混 | Worker 进程直接跑在环境所在的机器上，Kernel 经隧道用 stream-json 对话 |

完整的取舍表见 `super-agent-plan.md` 第 14.2 节。

## 方案乙被替换的早期想法

对话 1 的前几轮说法和最终方案不同的地方，一律以最终方案为准：

| 早期说法 | 最终方案 |
| --- | --- |
| 排期 6–8 周到“持续在线” | 10–12 周（第 12 节） |
| Router 用 Agent SDK 的 `ClaudeSDKClient` | P0 用 CLI 子进程，P2 再评估 SDK（第 4.1 节） |
| 组件叫 Gateway | 叫 Event Kernel |
| Watchdog 可以“改库里的策略提示词” | 只能提 proposal（第 9.4 节） |
| 投机 Worker 可用 `--permission-mode plan` | 独立 worktree + 小预算，能推分支、开草稿 PR（第 7.2 节） |
| IM 回复“≤100 字” | 100 英文词 / 150 汉字（第 7.1 节）；原文是 100 words |
| 用 prompt 型 hook 判断漂移 | Watchdog 巡检时用模型判断（第 10.2 节） |

## 合并后仍未解决的矛盾

- **方案甲的 4 周排期和最终的 10–12 周：** 方案里写的处理方式是过不了门禁就不推进，P0 结束时重估。
- **方案甲作者是否认可这些修正：** 记录中没有他的回应。
