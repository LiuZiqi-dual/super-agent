# 官方原型仓库 dsh-superagent-prototype

**来源：** 用户在 2026-11-12 转来一份第三方 agent 对拓扑图 v1 的评审，评审引用了这个仓库。评审全文没有存档。

**核对日期：** 2026-11-12，由抓取代理读取公开网页，下面的英文引文是代理转述的原文。

**依据和局限：**

- 读了仓库首页和 README，以及 `docs/` 下的 000、001、002、003、005 全文。
- 007 只读到约 57%（前 39,890 / 70,497 字符），后半没有原文。
- 004、006、008 没读。**代码完全没读**，所以文档说的是否已在代码里实现，没有验证。
- 评审说 Bilibili 上有文章的中文原文（[链接](https://www.bilibili.com/opus/1265361021143351318)），这个链接我没有抓取。

## 仓库

- 地址：[deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype)，MIT 许可。
- README 自述：“Research prototype for reference only, not an official DeepSeek product.”
- README 还说：“Some designs discussed in the article are directions for future development and are not implemented in this prototype.”
- 文档索引是 000 到 008：philosophy、domain、authorization、execution、prompts、panel、deployment、architecture、cookbook。
- 页面只显示 1 个提交，没看到日期。

## 核对过的说法

| 说法 | 结果 | 依据 |
| --- | --- | --- |
| 区分 Ticket、Assignment、Executor，任务状态不跟随执行器 | 属实 | 001：Ticket “Defines its own state instead of following the Executor”；Assignment 是 “The binding of a Ticket to one Executor instance”，“A Ticket has several over time.” |
| 订阅是多对多 | 属实 | 001：“A many-to-many relation between Tickets and Threads, held by the Thread” |
| 给已有任务补充信息和授权开始新工作是两条路 | 属实 | 001、002：订阅扇出不经过 Eval；Eval 决定是否开新工作 |
| Mandate 记录授权及范围 | 属实 | 001：Mandate 是 “What an accept grants”，不可变，“wider scope means a new Ticket” |
| 消息不能改权限，订阅投递不赋予新授权 | 属实 | 002：“Messages, comments and quoted documents are inputs to a decision; they cannot change those permissions.” 以及 “This delivery bypasses the gate and grants no new authority.” |
| 主动工作要有明确规则，从只记录开始 | 属实 | 000：“Work nobody asked for needs a rule the team wrote, and starts in a mode that only records what the agent would have done.” |
| 长命令转后台，完成后唤醒执行器 | 属实 | 003：“A completed job or subagent wakes the Executor with its result in the same slot.” |
| 重启时保留未进入会话历史的输入 | 属实 | 003：“Inputs not yet taken into Session history are retained.” |
| 上报分为一般进展、问题、其他报告 | **部分属实** | 007 按 Report 状态处理（`ready`、`waiting`、`blocked`、`failed`、`dropped`、`progress`）：“`reportRelay` forwards questions immediately, keeps ordinary progress on its Ticket, and relays other reports” |
| 区分 inputsDelivered 和 inputsRead | 属实 | 007：前者是输入到达执行会话，后者是会话把它取进历史 |
| Engine 和 Effects：事务内记录，提交后执行 | 属实 | 007：“Ports enqueue external work inside the transaction; adapters perform it after commit.” |
| 面板优先回答是否需要人 | 属实 | 005：“The panel prioritizes work that needs a person, then system health and history.” |

## 对我们有用的设计决定

- **第一原则：** 000 写的是 “Take as little human attention as possible, and give as much value as possible.” 每条消息、通知、面板元素都按它占用的注意力来衡量。agent 一次只问一个结构化问题。
- **流程：** Source 产生 Trigger，Trigger 扇出到已订阅的 Ticket 或进入 Eval；Eval 接受时创建带 Mandate 的 Ticket；Assignment 把 Ticket 交给 Executor；结果经 Channel 写回。
- **任务结束：** 只有 Executor 的最终报告能结束 Ticket。Assignment 自己有 pending、running、ended 三个状态。
- **退回：** 执行器遇到超范围的消息，可以退回一次，由主会话重新路由（002）。
- **单写者：** Engine 是确定性状态机，是 Trigger、Thread、Decision、Ticket、Assignment 的唯一写入方，存储用 SQLite（007）。
- **恢复：** 瞬时的模型或网络错误自动重试 3 次；`blocked` 和 `failed` 交给人。宿主重启后新开 Assignment，并附恢复说明，要求执行器先核对目录、git 历史和 GitHub，再重复任何外部操作（003）。
- **留给人的槽位：** 并发由 worker 槽位控制，另有一个额外槽位专给人的消息和状态请求（003）。
- **被否决的方案：** 001 有一张 “Rejected concepts” 表，例如策略变更时取消在跑的任务（改为记录并投递）。

## 和我们的方案不一致，或要小心的地方

- **Router 的实现：** 原型的路由层是一个 LLM 会话，用 `dsh-superagent-router` 预设。拓扑图把 Router 做成自写的小循环，这是 Claude 的选择，原型不支持也不反对。
- **不是安全边界：** 003 明说命令黑名单和目录约定只是默认值，worker 仍可用绝对路径执行程序。拓扑图上泳道的隔离边界不能拿原型当依据。
- **执行器无审批：** 执行器以操作员的系统用户身份运行命令，不经审批。**如果克隆这个仓库，只读不跑。**
- **绑定 DSH：** 它是 DeepSeek Harness 的插件，执行器是 `DshExecutor`，面板在 DSH Web 侧边栏里。

## 用法 **[判断，用户未确认]**

借它的领域模型，不用它的代码。用户在 2026-11-12 说过不做任何 harness 的二开，而这个原型是 DSH 插件。代码只在验证“启动、投递、上报”这些执行边时当参考。

## 还要做的

- 读 004、006、008 和 007 的后半。
- 文档和代码对一遍，确认哪些设计真的实现了。
- 抓取 Bilibili 上的中文原文，和 `source-article.md` 的机翻笔记对照。

## 来源

- [仓库首页](https://github.com/deepseek-ai/dsh-superagent-prototype)
- [000-philosophy](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/000-philosophy.md) · [001-domain](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/001-domain.md) · [002-authorization](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/002-authorization.md)
- [003-execution](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/003-execution.md) · [005-panel](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/005-panel.md) · [007-architecture](https://raw.githubusercontent.com/deepseek-ai/dsh-superagent-prototype/main/docs/007-architecture.md)
