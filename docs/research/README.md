# 调研资料索引

整理于 2026-11-06。这些内容原本在 claude.ai 的 `super-agent` 项目里。Claude Code 的官方文档没有提供读取 claude.ai 对话的途径，所以整理到这里，由 `CLAUDE.md` 引用。

## 文件

| 文件 | 内容 | 主要来源 | 信息截至 |
| --- | --- | --- | --- |
| [`decisions.md`](decisions.md) | 已确认的决定、工作假设、未决问题 | 两个对话 + 本次整理 | 2026-11-06 |
| [`super-agent-plan.md`](super-agent-plan.md) | 完整落地方案：架构、配置、路线图、评估、风险 | Claude Docs rev 17 快照 | 2026-11-02 |
| [`source-article.md`](source-article.md) | DeepSeek Harness 原文的逐节笔记和实验数据 | 2026-11-06 重新读取原文 | 2026-11-01 发布 |
| [`plan-merge-review.md`](plan-merge-review.md) | 方案甲、乙的比较和被替换的早期想法 | 对话 1 | 2026-11-02 |
| [`claude-code-capabilities.md`](claude-code-capabilities.md) | Claude Code 已有能力、缺口、限制和待验证项 | 对话 1 的文档核对 | 2026-11-02 |
| [`cross-session-messaging.md`](cross-session-messaging.md) | 跨会话消息的机制、许可证和借鉴思路 | 对话 2 | 2026-11-04 |
| [`agent-communication-projects.md`](agent-communication-projects.md) | agentchattr、Agent Relay、OpenAgents、Pear 的对比和试用风险 | 对话 2，含源码阅读 | 2026-11-04 |
| [`dsh-superagent-prototype.md`](dsh-superagent-prototype.md) | 文章配套的官方原型仓库：领域模型、授权、执行与恢复，以及和我们方案不一致的地方 | 抓取仓库文档核对，代码没读 | 2026-11-12 |

另外，`docs/design/lane-coordinator-topology.html` 是 2026-11-12 起的拓扑提议稿，用户还没有确认，不属于调研资料。

**建议阅读顺序：** `decisions.md` → `super-agent-plan.md`，其他文件按需查阅。

## 内容标记

文件中用这些标记区分内容的可靠程度：

| 标记 | 含义 |
| --- | --- |
| **[原文]** | DeepSeek Harness 文章的说法。它的实验是合成负载，作者自己也说结果仅供参考 |
| **[官方文档]** | 当时对照 Claude Code 官方文档核对过，之后可能已变化 |
| **[源码]** | 读过第三方仓库的文档或部分源码，但没有实际运行 |
| **[判断]** | Claude 的推断或建议，用户没有确认过 |
| **[未验证]** | 还没有证据，需要查证或实测 |

## 原始来源

- [对话 1：Claude super agent 落地方案](https://claude.ai/chat/73a23fe4-82d7-4a74-8946-f2d1ecdb3def)（2026-11-02）
- [对话 2：Claude Code 跨会话通信](https://claude.ai/chat/fdd1458f-6e67-4fc7-bf9f-621069b1097c)（2026-11-04）
- [Claude Docs：Claude Super Agent 落地方案](https://claude.ai/artifact/SDway8Gszg9c8HHfyDryDU)
- [DeepSeek Harness：Exploring Super-agent Design](https://x.com/DeepSeekHarness/status/2116857257245987236)（2026-11-01）

以上 claude.ai 链接需要登录用户本人的账号，Claude Code CLI 打不开。

## 已知缺口

1. **方案甲原文缺失。** 它是对话 1 里的附件，这次从对话记录里取不回来。这里只有落地方案和点评中转述的内容。如果需要，请把原文件放进 `docs/research/`。
2. **调研的原始输出没有保留。** 对话记录保留了 Claude 的结论和执行的命令，但没有网页和命令的返回内容。文档核对的原始结果、第三方源码的具体片段都查不到了，需要时只能重查。
3. **第三方仓库版本没有固定。** 当时读的是浅克隆，记录中没有 commit 号，所以源码结论对应的版本已无法确认。
4. **原文图表未归档。** 文章里的图没有复制过来，图中的数字只保留了正文和表格写到的部分。
5. **商业条款没读过。** Claude Code 商业条款原文当时没有打开，相关说法只是印象，见 `decisions.md`。
6. **Claude Docs 可能继续变化。** `super-agent-plan.md` 是 rev 17 的快照。从现在起，建议以仓库里的版本为准；如果还要在 Claude Docs 上改，需要手动同步。
