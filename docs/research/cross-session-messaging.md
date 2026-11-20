# Claude Code 跨会话消息

**来源：** [对话 2](https://claude.ai/chat/fdd1458f-6e67-4fc7-bf9f-621069b1097c)，2026-11-04。

**背景：** 用户在 multi lanes 多进程开发中觉得这个功能很好用：会话 A 能主动发消息给会话 B，并触发 B 的行为。问题是 Claude Code 是否开源、怎么实现、Super Agent 能否借鉴。

## 结论

- Claude Code CLI 不是开源软件，所以这里没有源码讲解，只有官方文档写明的行为。
- 机制思路可以借鉴，但要独立实现，不复制代码。
- 这项能力体验好，关键不在 socket，而在唤醒、模型自主发送、信任隔离和防失控。

## 开源状态

- **许可证：** `anthropics/claude-code` 的 LICENSE 只有一句 “All rights reserved”，使用受 Anthropic 商业条款约束。
- **仓库内容：** 根目录能看到插件、脚本、示例和文档，没看到 CLI 的 `src/`。页面列表可能不完整。
- **错误说法：** 网上有文章称它是 Apache 2.0 开源，这与 LICENSE 不符。
- **泄露代码：** 网上有从 npm source map 恢复或泄露的代码。当时没有读，也不要用进产品，有版权风险。
- **商业条款：** 当时没能打开原文。印象中有竞品和逆向工程限制，**[未验证]**。如果要用 Claude Code 开发同类产品，先让法务确认。

## 两套机制 **[官方文档]**

| | 跨会话消息 | Agent Teams（实验性） |
| --- | --- | --- |
| 会话关系 | 你自己启动的独立会话 | 由 lead 创建并管理的队友 |
| 同机传输 | 每会话一个 Unix socket（Windows 用命名管道） | 收件箱文件 `~/.claude/teams/{team}/inboxes/{agent}.json` |
| 跨机传输 | 经 Anthropic 服务器和 Remote Control | 文档未提及 |
| 内容 | 纯文本 | 也有结构化协议消息 |

## 一条消息的流程 **[官方文档]**

```text
A 的模型调用 ListAgents → 找到目标会话
A 的模型调用 SendMessage → 写入 B 的 socket
B 做准入检查 → accept / hold / refuse
  ├─ B 正在执行：在两次工具调用之间读取，不打断正在运行的工具
  └─ B 空闲：自动开启新一轮
```

## 体验好的五个设计 **[官方文档，归纳是判断]**

1. **能唤醒：** 消息能直接触发空闲会话开始工作，这是它和共享文件的本质区别。
2. **模型自主发送：** 通信是模型可调用的工具，它判断有必要时就会发，不用人转述。
3. **信任隔离：** 接收方知道消息来自其他会话，而不是用户。消息不能批准权限或改配置，其中的 `/compact` 等命令也不会执行。
4. **防失控：** 单条上限约 100 万字符，已接受队列最多 50 条，暂扣最多 100 条，还有按发送方限流和重复消息丢弃。
5. **空闲通知：** `notify_when_idle` 让对方下次空闲或退出时回一条通知。订阅本身不消耗对方的 token，12 小时无通知则过期。

另外，默认策略防止权限绕过：跳过权限确认的会话收到普通会话的消息会先暂扣，反方向也一样。`crossSessionInbound` 设置控制准入。

## 借鉴设计 **[判断]**

下面是设计建议，不代表 Claude Code 的内部实现。

```python
async def session_main():
    while True:
        event = await inbox.next()          # 用户输入或 peer 消息
        await run_turn(event)
        notify_idle_subscribers()           # 处理空闲订阅

async def run_turn(event):
    history.append(wrap(event))             # peer 消息标明来源，不当作用户输入
    while True:
        response = await llm(history)
        await execute_tools(response)       # 工具不被打断
        pending = inbox.drain()             # 关键：工具调用之间注入
        history.extend(wrap(m) for m in pending)
        if not response.tool_calls and not pending:
            return
```

**建议顺序：**

1. **注册与发现：** 每个会话在权限为 `0700` 的目录下创建 socket，并登记名称、PID、工作目录和状态。清理时用 PID 判断会话是否还活着。
2. **送达与唤醒：** 实现 `list_agents`、`send_message` 和空闲唤醒，这时就已经很好用了。
3. **运行中注入：** 加入上面的 `drain` 逻辑。
4. **安全与限流：** 加来源标记、权限隔离、准入策略、限流和去重。
5. **空闲订阅：** 用它取代轮询，减少 token 消耗。
6. **跨机中继：** 最后再做服务端存储转发和离线投递。

**注意：** 这段循环假设我们自己掌管 agent loop。落地方案是在外面编排 Claude Code，不自己写 loop，所以这里主要作为第三方 CLI 适配和自研 loop 时的参考。

## 两个要提前考虑的坑

- **第三方 CLI 的控制权：** 如果包装的是 Codex 这类 CLI，我们控制不了它的内部循环。**后来修正：** 对话 2 的后续源码阅读发现，Codex 已经有这类 hook，不必自己掌管它的循环。详见 `agent-communication-projects.md`。
- **权限绕过：** 必须防止会话 A 被拒绝后，让权限更高的会话 B 代做。

## 对落地方案的影响

- 方案第 10.3 节让 Watchdog 用跨会话 `SendMessage` 纠偏。Watchdog 是云端会话，Worker 是 `-p` 进程，这条路径能否送达还 **[未验证]**。来源过滤粒度同样 **[未验证]**。
- 方案第 3.3 节的直通走 Kernel 的 stdin 或 `--resume`，不依赖跨会话消息，所以 P0 的核心路径不受影响。

## 用户前提的修正

用户提到 Codex CLI、Antigravity CLI、OpenCode、DeepSeek Harness 都没有这么好用的功能。这些竞品当时**没有逐一验证**。后续调研认为，它们缺的主要是开箱即用的会话互发，底层能力未必缺：Codex 有相关 hook，OpenAgents 还列了 Antigravity 适配器和预览版的 DeepSeek Harness。另外，一篇社区文章介绍过 OpenCode 上的 Agent Teams 实现。

## 来源

- [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging)
- [Agent Teams](https://code.claude.com/docs/en/agent-teams)
- [Channels](https://code.claude.com/docs/en/channels)
- [Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)
- [anthropics/claude-code LICENSE](https://github.com/anthropics/claude-code/blob/main/LICENSE.md)
- [anthropics/claude-code 仓库](https://github.com/anthropics/claude-code)
- [OpenCode 的 Agent Teams 实现（社区文章）](https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol)
