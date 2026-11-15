# 小灯屋 1.3 接上真实世界

基线：`release-1.2` 的 `e8dfce3`（2026-11-15）。文中的 `路径:行号` 都对应这个提交，代码改动后行号会漂移。SDK 的行号对应装着的 `@anthropic-ai/claude-agent-sdk` 0.3.306。

这份文档是 1.3 的唯一工作清单，展开的是 `docs/road-to-1.5.md` 第 5 节。下面的工作包全部完成，并且通过第 6 节的发布关卡，才发 1.3。

1.1 和 1.2 都还没有发布。两版的发布关卡（A12、B10）、真 Key 的运行、证书和商店那几步，都等 Lewis。1.3 就在 `release-1.2` 上接着做，这和 `docs/road-to-1.5.md` 第 2 节第 3 条不一样，1.2 当时也是这样。Lewis 2026-11-15 说一路做到 1.5，中间不停，所以设计和代码都提前开工，怎么接回去见第 2 节。

## 1. 目标

小店做出来的东西能直接拿去用，也能在用户点头以后用上用户自己的资料：

- **做得出：** Word、Excel、PPT 和 PDF 都能做，结果卡上先看一眼缩略图。递过来的这几种文件也读得懂。
- **改得了：** 改文档的模板收 Office 和 PDF，原文件照旧不动。
- **画得出：** 图表和海报用网页画好，再存成图片。
- **说得出处：** 调研报告的每条结论都标出处，结果卡上能点开核对，查不到的写明。
- **连得上：** 先连一个网盘里的文件夹和一份只读的日历，邮件只写草稿。每种连接一张授权卡。改动外面东西的事，一律先问。每次外部动作都留记录。

## 2. 流程

照 `docs/road-to-1.2.md` 第 2 节，有四处不同：

1. 集成分支是 `release-1.3`，从 `release-1.2` 的 `e8dfce3` 开。工作包分支从它开，名字用编号，比如 `c1-office`、`c4-connections`。
2. CHANGELOG 写在 “Unreleased (1.3)” 下面。
3. 1.1、1.2 先后发布时，照 1.2 文档第 2 节把它们压进 `main`。之后用 `git rebase --onto main release-1.2 release-1.3` 把 1.3 的提交搬到 `main` 上。冲突太多就改成把 `main` 合进 `release-1.3`。1.1、1.2 在发布关卡里改的东西，也要合进 `release-1.3`。
4. 真实运行用安装好的应用里存的那把 Key，不另要测试 Key。每个工作包开跑前单独报预算，Lewis 说了才跑。连接要用 Lewis 自己的网盘或日历时，先说清会读到什么，也等他说了再连。

## 3. 总览

改动量：S 是几处小改，M 是一个模块，L 跨多个模块或要改美术。

| 编号 | 内容 | 依赖 | 改动量 | 新美术 | 真 Key | 状态 |
|---|---|---|---|---|---|---|
| C4 | 店内工具和连接的框架 | 无 | L | 否 | 否 | 已合并（PR 待填） |
| C6 | 外部动作的安全规则和记录 | C4 | M | 否 | 否 | 未开工 |
| C1 | Office 和 PDF 的读写，结果卡预览 | C4 的店内工具那一半 | L | 否 | 约 $5 | 未开工 |
| C3 | 改文档的模板放宽 | C1 | M | 否 | 约 $3 | 未开工 |
| C7 | 调研报告带出处 | 无 | M | 否 | 约 $3 | 未开工 |
| C2 | 照片、图表和海报 | C1 的出图工具 | M | 否 | 约 $3 | 未开工，Q-C1 待定 |
| C5 | 首批连接 | C4、C6 | L | 少量 | 约 $3 | 未开工，Q-C2 待定 |
| C8 | 资料室和邮局 | C1、C5 | L | 是 | 否 | 未开工 |
| C9 | 发布关卡和商店政策复核 | 全部 | M | 否 | 约 $8 | 未开工 |

表里的顺序就是建议的开工顺序：

- **C4 最先。** Office 工具和外部连接走同一条路：应用自己在进程里开 MCP 服务器，交给 SDK。权限规则也要先认得这类工具，现在它们一律按严重处理（`app/main/risk-classifier.ts:369`）。这条路先铺好，C1 和 C5 只管往上挂工具。
- **C6 紧跟 C4，在 C5 之前。** 规则和记录要在第一个真连接之前就位。C5 的每个工具一写出来，就有风险等级、有授权卡、有记录，不用回头补。
- **C1 在 C3 之前。** 改 Office 文件要先读得懂、写得出。C1 也是 C4 的第一个用户，框架有毛病在这里就能看出来。
- **C7 和 C2 不依赖别的包。** C7 只改调研模板和结果卡。C2 的出图借用 C1 那个隔离的隐藏窗口，所以排在 C1 后面，和 C3 谁先谁后都行。
- **C5 在 C4、C6 之后。** 还要等 Q-C2 定下连哪几种。
- **C8 在 C1、C5 之后。** 资料室演的是 Office 工具，邮局演的是连接，两样都有了才知道要演什么。
- **C9 最后。**

真 Key 合计约 $25，和 `docs/road-to-1.5.md` 第 8 节的粗估一样。每个工作包开跑前单独报，等 Lewis 说了再跑。

## 4. 工作包

### C4 店内工具和连接的框架

**现状：**

- 每单给 SDK 的选项里，`mcpServers` 是空的，`strictMcpConfig` 为真，`settingSources` 也是空的（`app/main/agent-runner.ts:231-233`）。注释写明不读这台电脑上 Claude Code 自己的设置和 MCP 服务器。商量也一样（`app/main/consult.ts:51-53`）。
- 内置工具是一张固定的名单，没有 `Skill`，也没有任何 MCP 工具（`agent-runner.ts:146-148`）。三个帮手各有自己的只读工具（`agent-runner.ts:26-42`）。
- 权限规则只认内置工具。别的工具，包括 MCP 工具，都按严重处理（`risk-classifier.ts:368-369`），弹的确认卡默认是“不允许”（`app/main/permission-policy.ts:92-105`）。卡上写的是工具名（`permission-policy.ts:34-44`），`mcp__...` 这种名字用户看不懂。
- 现在唯一的秘密是 API Key，用 `safeStorage` 加密后存在数据文件夹（`app/main/api-key.ts:32-57`，`app/main/index.ts:1412`）。日志和录制只认得 Anthropic Key 的样子（`api-key.ts:26`），录制另外丢掉名字像 token 的字段（`app/main/recorder.ts:35`）。别的秘密只要出现在值里，就会原样写进去。
- SDK 能接的 MCP 服务器有四种：子进程（`stdio`）、`sse`、`http`，还有在应用自己进程里跑的 `sdk`（`node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts:1246`、`:1365`、`:1348`、`:1204`、`:1221`）。选项是 `Options.mcpServers`（`sdk.d.ts:1990`）。进程内的服务器用 `createSdkMcpServer()` 和 `tool()` 建（`sdk.d.ts:632`、`:10044`）。工具调用通过 `mcp_message` 控制请求回到应用（`sdk.d.ts:4907-4909`）。每个服务器可以给每个工具标 `always_ask`，这样 Claude Code 每次都先问应用的 `canUseTool`（`sdk.d.ts:1321-1323`）。
- `tool()` 要 zod 写参数。`zod` 4.6.7 和 `@modelcontextprotocol/sdk` 是 SDK 的对等依赖，`node_modules` 里有，`package.json` 里没写（`package.json:37-39`）。
- SDK 也有 `skills` 选项（`sdk.d.ts:2322`）。Anthropic 做 Office 文件的那几个技能要 Python 和几个 Python 库，用户的电脑上未必有。店员写文件也不许用 Python 脚本（`app/main/commission.ts:25`）。所以 Office 的读写要应用自己带，不靠技能。

**设计：**

- 两样东西走同一条路：
  - **店内工具：** 应用自带、不碰外面的工具，比如 C1 的 Office 读写和出图。每单都有，不用授权。
  - **连接：** 用户授权过的外部资料和动作，比如 C5 的网盘文件夹和日历。只有委托单上勾了的那几个才交给这一单。
- 两样都用进程内的 `sdk` 服务器，不开子进程，也不接远处的 `http` 服务器。理由：
  - 每次调用都回到主进程，应用能先看、先问、再记。
  - 秘密留在主进程里。子进程的服务器要把令牌放进环境变量交出去，`http` 的要放进请求头，交给 Claude Code 那个进程。
  - 不用让用户装别的程序，商店版也不用多申请权限。
- 1.3 不提供“自己加一个 MCP 服务器”的入口，`strictMcpConfig` 照旧为真。
- 服务器名一律以 `nook-` 开头，工具名就是 `mcp__nook-office__make_docx` 这样。每个工具在注册时声明：

```ts
type ToolKind = 'read' | 'make' | 'outside' | 'final';
// read：只读，不改任何东西（读递来的文件、读日历）
// make：只在委托文件夹里新建文件（做 docx、出图）
// outside：改委托文件夹以外的东西，能撤回（往网盘的“小灯屋”文件夹存一份）
// final：做了收不回（发信、删文件、改日历），1.3 一个都不做，见 C6
type NookTool = {
  name: string;            // 不带前缀，比如 make_docx
  kind: ToolKind;
  label: (input: unknown) => string;   // 卡片和记录上那句人话，比如“在日历里读 11 月 17 日到 23 日”
  schema: ZodRawShape;
  run: (input: unknown, ctx: ToolCtx) => Promise<CallToolResult>;
};
type ToolCtx = { run: string; project?: string; workDir: string; signal: AbortSignal };
```

- 连接存在数据文件夹的 `connections.json`，不含秘密：

```ts
type ConnectionKind = 'folder' | 'calendar' | 'maildraft';
type Connection = {
  id: string;                 // k<时间>
  kind: ConnectionKind;
  label: string;              // 用户起的名字，默认按种类给，比如“OneDrive 里的资料”
  added: string;              // YYYY-MM-DD
  lastUsed?: string;
  config: Record<string, string | number | boolean>;   // 文件夹路径、时区这类，不含秘密
  hasSecret?: boolean;        // 秘密在 connections.bin 里
  paused?: boolean;
};
```

- 秘密（日历订阅地址、以后的令牌）存在 `connections.bin`，用 `safeStorage` 加密。写法照 `KeyStore`：先写临时文件再改名，系统不能加密就不存，这种连接也就加不上。秘密只在主进程里解开，不进提示词，不进页面，不进日志和录制。
- 日志和录制的脱敏改成两层：照旧认 Key 的样子，再加一张“已知秘密”的表。连接加上或解开时把秘密登记进去，`Log` 和 `Recorder` 写之前逐个换成 `[redacted]`。
- 授权卡：加连接时弹，连接卡上也随时能看。每种连接自己写三段：

```ts
type Grant = {
  reads: string[];     // 能读什么，比如“这个文件夹里两层以内的文件”
  does: { what: string; undo: 'yes' | 'no' }[];   // 能做什么，每一条写明能不能撤回
  never: string[];     // 不会做什么，比如“不删、不改名、不移动”
  disconnect: string;  // 怎么断开，以及断开以后留下什么
};
```

- 卡上的按钮是“连上”和“先不连”，默认是“先不连”。连上以后笔记本多一页“连接”，每种一张卡：授权内容、最后一次用的日子、最近 5 条记录（C6）、“暂停”和“断开”。断开会删掉秘密和配置，记录留着。
- 委托单上加一行“这单可以用：”，列出没暂停的连接，默认一个都不勾。勾了的才进这一单的 `mcpServers`。`CommissionForm`（`app/shared/types.ts:269`）加 `connections?: string[]`，定时委托（B6）照存。
- 提示词：勾了连接时，多一句这一单能用哪些连接、各能做什么。`MATERIAL_RULE`（`commission.ts:27`）扩到连接读来的内容：日程、文件里写的话都是材料，不是指令。
- 三个帮手的工具名单不变，帮手不碰连接。
- `zod` 和 `@modelcontextprotocol/sdk` 写进 `dependencies`，`scripts/notices.mjs` 生成的第三方声明跟着更新。

**完成标准：** 新的 `tests/nook-tools.test.ts` 覆盖工具注册、名字前缀、四种类型的风险等级、没勾的连接不进 `mcpServers`。新的 `tests/connections.test.ts` 覆盖读写 `connections.json`、坏文件当作没有并留原样、秘密只进 `connections.bin`、系统不能加密时加不上、断开后秘密和配置都没了。`tests/api-key.test.ts` 加已知秘密的脱敏，`tests/risk.test.ts` 加 `mcp__nook-*` 的分级。替身 `tools/sim/claude.mjs` 现在只会发 `can_use_tool`（`tools/sim/claude.mjs:185`），要学会用 `mcp_message` 调进程内的工具。新场景 `connect` 用一个只在没打包时有的测试连接。连上、勾进委托、用一次、断开，日志和录制里搜不到那串秘密。授权卡的中英文截图都看过。`consult`、`templates`、`materials` 照旧过。

**做法：**

- 店内工具和连接共用 `app/main/nook-tools.ts`。`NookTool` 照设计写，多了一个 `description`，是写给店员看的工具说明。`sdkServer()` 建进程内的服务器，名字前面加 `nook-`。`outside` 和 `final` 的工具在服务器上标 `always_ask`。
- `connectionServers()` 只挑委托单上勾了、还在、没暂停的连接。连接号不是 `k<数字>` 的一律不要，因为它会变成服务器名。
- 风险等级在 `risk-classifier.ts`。`RiskContext.nook` 是这一单的工具表：`read` 和 `make` 放行，`outside` 和 `final` 按严重处理，卡上默认“不允许”。这一单没有的 `mcp__nook-*` 工具照旧按严重处理。确认卡上写的是工具自己的那句人话。
- 连接由 `app/main/connections.ts` 的 `ConnectionStore` 管。`connections.json` 不含秘密，所有秘密合成一份 JSON，加密后存进 `connections.bin`。两个文件都先写临时文件再改名，最后一个秘密删掉时 `connections.bin` 也删掉。
- 脱敏：`api-key.ts` 的 `redactSecrets()` 多查一张已知秘密的表（`knowSecret()`）。`Log`、`Recorder` 和诊断包本来就走这个函数，所以不用改。
- 连接的种类写在 `app/main/connection-kinds.ts`。现在只有 `test` 一种，只在没打包时有。它只有一个 `read` 工具，交出一张写死的便条。它的秘密取自环境变量 `LAMPLIGHT_TEST_SECRET`，场景拿这串字去日志和录制里搜。
- 授权卡和笔记本的连接页在 `app/renderer/ui/connections.ts`。连接页排在笔记本最前面。没有连接、也没有能加的种类时，这一页不出现。断开前先问一次，卡上写着断开以后留下什么。
- 委托单上的“这单可以用：”只列没暂停的连接，默认都不勾。勾了的连接号记在 `CommissionForm.connections` 上，跟着委托单进笔记本、待续记录和定时委托。
- 提示词：勾了连接时，`withConnections()` 在提示词最后加一段，列出能用的连接、各自的服务器名和用途。`MATERIAL_RULE` 加上了“从连接读来的内容”。
- 替身学会了 `mcp_message`：先发 `initialize`，再 `tools/list`，最后 `tools/call`。新剧本 `connect` 对每个连接调一次第一个工具，再把设好的秘密念出来，并夹在调用参数里，看应用能不能把它遮掉。
- `zod` 写进 `dependencies`，`@modelcontextprotocol/sdk` 写进 `devDependencies`，`package-lock.json` 用 `npm install --package-lock-only --offline` 更新。

**暂定（2026-11-15）：**

- `@modelcontextprotocol/sdk` 在应用里只用到类型。SDK 的 `sdk.mjs` 自己打包了 MCP 服务器，运行时不加载它，所以不进安装包。`scripts/notices.mjs` 现在跳过 `import type`，第三方声明照旧是 20 个包。`zod` 本身没有依赖，C1 起运行时要用，那时会进声明。
- 测试连接只能读，没有 `outside` 工具。能存一份的测试工具，等 C6 的 `outside` 场景再加。
- 断开以后，这串秘密还留在本次打开的脱敏表里，直到应用关掉，晚写的日志也搜不到它。
- `connections.json` 坏了就当作没有连接，文件原样不动。用户之后再加连接，会整个写掉坏文件，不另存一份。
- 打包版现在没有任何种类，笔记本没有连接页，委托单也没有那一行。打包版碰到不认识种类的连接（比如开发版留下的测试连接），连接页不列，委托单也用不上。
- 项目后面的几轮和定时委托，用的是第一张委托单勾的连接。在项目里改勾哪几个，留给以后的包。
- 设计里给 `always_ask` 填的工具名不带前缀，类型文件没写清楚该带不该带。就算 SDK 不认，应用自己的 `classify()` 也把这两类按严重处理，照样每次先问。
- 加连接的入口只在笔记本的连接页，每种一个“连上……”按钮。真连接要用户填的东西（文件夹、订阅地址）放在授权卡上，留给 C5。
- 三个帮手和商量照旧不碰连接：`SUBAGENTS` 的工具名单没改，`consult.ts` 的 `mcpServers` 还是空的。

### C6 外部动作的安全规则和记录

**现状：**

- 安全规则只管本地文件和命令。读委托文件夹以外的东西按严重处理，理由写在注释里：读到的东西可能被后面的网页请求带出去（`risk-classifier.ts:313-316`）。
- 网页搜索和抓取一律放行（`risk-classifier.ts:312`）。
- 确认卡一次只问一步，严重的默认“不允许”（`permission-policy.ts:92-105`）。没有“这一单都允许”的按钮。
- 每次权限请求和决定都写进这一单的录制（`agent-runner.ts:184-197`），录制最多留 50 份（`recorder.ts:8`）。用户看不到这些，也没有跨单的记录。
- 定时委托遇到要回答的事照旧等，不替用户点“允许”（`docs/road-to-1.2.md` B6）。

**设计：**

- 四种工具（C4）各有固定的规矩：
  - `read`：委托单上勾了就是同意，不弹卡，照记。
  - `make`：只能写进委托文件夹，路径规则和 `Write` 一样，不弹卡。
  - `outside`：每次都弹卡，默认“不允许”，卡上写清改的是哪里、怎么撤回。
  - `final`：1.3 没有这种工具。以后加了，也是每次弹严重卡，默认“不允许”，卡上写“做了就收不回”。这个规矩写死在代码里，不进设置。
- 对应到 SDK：`outside` 和 `final` 的工具在服务器上标 `always_ask`，Claude Code 每次都先问应用（`sdk.d.ts:1321-1323`）。应用的 `classify()` 再按上面四条给等级，两层都要放行才做。
- 没有“这一单都允许”，也没有“以后都允许”。见 Q-C3。
- 读过私人内容以后，网页工具要先问。一单里读过连接的内容（日历、网盘的文件）以后，`WebSearch` 和 `WebFetch` 从放行改成 `ask`。卡上写“这单读过你的日历，查网页前先问你一声”。这条和读委托文件夹以外的文件是同一个理由。没勾连接的委托照旧放行。
- 定时委托照 B6：要问的事照样等，发通知，不替用户点。
- 记录：数据文件夹的 `actions.jsonl`，每次调用连接的工具写一行：

```ts
type ActionLog = {
  t: string;               // ISO 时刻
  run: string; project?: string;
  connection: string;      // 连接号
  tool: string;            // 不带前缀的工具名
  kind: ToolKind;
  said: string;            // 那句人话（label），不含读到的内容
  decision: 'given' | 'allowed' | 'denied';   // given：勾选就算同意的读
  ok: boolean; error?: string;
  undo?: { how: string; done?: string };     // outside 的才有，比如删掉存进网盘的那一份
};
```

- 只记做了什么，不记读到的内容和写出的正文。最多留一年或 5,000 行，先删最旧的。“忘掉一切”连记录一起清。
- 笔记本加一页“外部动作”，按日子列，可按连接筛。`outside` 的那几行有“撤回”，撤回本身也记一行。
- 设置里加“暂停所有连接”。打开后委托单上不列连接，在跑的单下一次调用就被拒，告诉店员连接暂停了。

**完成标准：** `tests/risk.test.ts` 加四种工具的等级，读过连接以后网页工具变 `ask`，没勾连接时照旧。`tests/decision.test.ts` 加 `outside` 的卡默认“不允许”、卡上没有一单都允许的按钮。新的 `tests/action-log.test.ts` 覆盖写一行、不含内容、按条数和日子删旧、撤回再记一行。新场景 `outside`：替身用测试连接做一次 `outside`，第一次点“不允许”，第二次点允许，再从“外部动作”页撤回，三行记录都对。新场景 `outsideweb`：读过测试连接以后去查网页，弹了卡。定时委托里的 `outside` 不自己做，等到用户来点。中英文的卡片和“外部动作”页截图都看过，最小窗口也看。`budget`、`scheduled`、`parallel` 照旧过。

### C1 Office 和 PDF 的读写，结果卡预览

**现状：**

- 模板都做网页、Markdown、CSV 或纯文本（`app/shared/templates.ts:66-180`）。表格做的是带 BOM 的 CSV（`templates.ts:111-120`），简历做成网页，让用户自己用浏览器打印成 PDF（`templates.ts:140-147`）。
- 结果卡认主文件按网页、改过的文档、Markdown、表格或信的顺序（`templates.ts:35-41`，`commission.ts:277-286`），没有 Office。
- 点一下就打开的只有 `OPENABLE` 里的那几种：网页、文本、表格、几种图片和 PDF（`app/main/index.ts:1365-1372`）。注释写明，别的种类可能被网页带着写成能运行的东西，所以只在文件夹里指给用户看。Office 文件不在里面，作品架、看旧版本和结果卡都是这样（`index.ts:978`、`:1137`、`:1361`）。
- 结果卡上只有总结、文件名、花费和按钮，没有预览（`app/renderer/ui/panels.ts:485-560`）。
- 应用已经能把网页存成 PDF：隐藏窗口，没有 Node，独立的会话，只许加载作品文件夹里的东西（`app/main/print.ts:14-29`，`app/main/export.ts:28-34`）。
- 递过来的材料不挑种类，单个 20MB，合计 50MB，最多 10 个（`app/main/materials.ts:7-9`）。Claude Code 的 `Read` 能直接读 PDF（一次最多 20 页）和四种图片（`node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:896-898`、`:246-255`），读不了 docx、xlsx、pptx。
- 应用有一个只会打包的 zip 写法（`app/main/zip.ts:6`），不会解压。`package.json` 里没有任何处理 Office 或 PDF 的库（`package.json:37-39`）。

**设计：**

- 新的店内工具服务器 `nook-office`，在主进程里跑：

| 工具 | 类型 | 做什么 |
|---|---|---|
| `read_document` | read | 读委托文件夹里的 docx、xlsx、pptx，回给店员纯文本。PDF 回一句“用 Read 读，带 pages” |
| `make_docx` | make | 按文档结构写一个 docx |
| `make_xlsx` | make | 按表格结构写一个 xlsx |
| `make_pptx` | make | 按幻灯片结构写一个 pptx |
| `make_pdf` | make | 把委托文件夹里的一个网页存成 PDF，用 `pageToPdf()` |

- 店员不写 OOXML，只交结构，应用负责成文件。结构是这样：

```ts
type DocSpec = { title?: string; blocks: Block[] };
type Block =
  | { h: 1 | 2 | 3; text: string }
  | { p: string }                                   // 支持 **粗体** 和 *斜体*，别的不认
  | { list: string[]; ordered?: boolean }
  | { table: { head: string[]; rows: string[][] } }
  | { image: string; caption?: string }             // 委托文件夹里的相对路径
  | { pageBreak: true };
type SheetSpec = { sheets: {
  name: string;
  columns: { header: string; width?: number; format?: 'text' | 'number' | 'money' | 'date' | 'percent' }[];
  rows: (string | number | { f: string })[][];      // f 是公式，比如 =SUM(B2:B20)
  freezeHeader?: boolean;
}[] };
type SlideSpec = { title: string; accent?: string; slides: {
  layout: 'title' | 'bullets' | 'image' | 'two';
  title: string; bullets?: string[]; image?: string; right?: string[]; notes?: string;
}[] };
```

- 读：docx 按段落样式还原标题，表格写成竖线表。xlsx 每张表写成 CSV，最多 2,000 行、50 列，截掉的写明。pptx 每页写标题、正文和备注。docx 和 pptx 由应用自己解压、读 XML，xlsx 用写它的那个库读。
- 解压有上限：解开后合计不超过 100MB，条目不超过 5,000 个，超了就不读，告诉店员文件太大。
- 写：docx、xlsx、pptx 各用一个纯 JavaScript 的库，不要原生模块。候选是 `docx`、`exceljs`、`pptxgenjs`，开工时核对许可、装进安装包后多大、最近有没有维护，结果写进本文。
- 写出来的文件只能在委托文件夹里，路径规则和 `Write` 一样，不覆盖用户原有的文件。图片也只能取委托文件夹里的。
- 文件夹外的网络一概不碰，库里能联网取图的选项都不开。
- 模板：
  - 新模板 `document`（Word 文档，比如报告、通知、说明书）和 `slides`（PPT）。
  - `sheet` 改成做 xlsx，带格式和公式，CSV 不再做。
  - `resume` 照旧做网页，做完再用 `make_pdf` 存一份 PDF。
  - 结果卡的主文件顺序加上 `office`：`docx`、`xlsx`、`pptx`、`pdf`，排在网页后面。
- 打开：`OPENABLE` 加 `.docx`、`.xlsx`、`.pptx`，不加带宏的 `.docm`、`.xlsm`、`.pptm`。打开前 `officeSafe()` 先看一眼包里：没有 `vbaProject.bin`，内容类型不是带宏的，关系文件里除了超链接没有指向外面的目标。有一样不对，就照旧只在文件夹里指给用户看，卡上写原因。
- 预览：结果卡在总结下面放一张缩略图，宽 280 像素：
  - 网页：在 `pageToPdf()` 那样隔离的隐藏窗口里打开，用 `capturePage()` 拍第一屏。
  - 图片：直接缩小。
  - 店里做的 docx、xlsx、pptx 和 PDF：`make_*` 写文件时，顺手按同一份结构写一个预览用的网页，放在数据文件夹的 `previews/<运行号>/`，再照网页的办法拍。
  - 用户递来的文件、或者店员用别的办法写出来的 Office 文件：不拍，只写文件名。
  - 预览在主进程里做好，作为一张 PNG 交给页面，不超过 200KB。缩略图点了就是“打开”。
- 风险分级：`read_document` 只许读委托文件夹里的文件，`make_*` 按 C6 的 `make` 处理。

**完成标准：** 新的 `tests/office.test.ts` 覆盖三种结构写出的文件能被读回同样的文字、公式还在、图片只认文件夹里的、路径出了文件夹就拒绝、解压超限就不读。`tests/fixtures/` 放几份 Word、Excel、PowerPoint 存出来的小文件，`read_document` 读它们的结果做快照。新的 `tests/office-safe.test.ts` 覆盖带宏、带外部模板、带外部链接的样本都不打开。`tests/templates-prompts.test.ts` 的快照加两个新模板和改过的 `sheet`。`tests/templates-registry.test.ts` 照旧过。新场景 `office`：替身各做一份 docx、xlsx、pptx 和 PDF，结果卡有缩略图，点了能打开（打开的动作在替身里记下，不真开 Office）。新场景 `officeread`：递一份 docx 和一份 xlsx，替身读到的文字和样本一样。中英文的结果卡截图都看过，最小窗口也看。`templates`、`export`、`materials`、`revise` 照旧过。真 Key 约 $5：Word、Excel、PPT、PDF 各做一单，再递一份 Word 让它总结。四个文件在 Office 里打开看过。

### C3 改文档的模板放宽

**现状：**

- 改文档的模板只收 txt、md、html、htm、csv、json，1MB 以内（`templates.ts:62-64`、`:84`）。
- 开工前把用户的文件复制进委托文件夹，叫“原稿”，店员把改好的写成另一个文件，原稿和用户的文件都不动（`commission.ts:231-236`，`templates.ts:85-89`）。
- 结果卡把改好的那个当主文件（`templates.ts:37`）。

**设计：**

- 收的种类加上 docx、xlsx、pptx 和 PDF，上限提到 20MB，和递材料的单个上限一样（`materials.ts:8`）。带宏的不收，卡上说为什么。
- 原稿照旧复制一份，用户的文件不动。改法按种类分：
  - **docx：** 新工具 `edit_docx` 按段落编号改文字，改动写成 Word 的修订（插入和删除），用户在 Word 里能逐条接受或拒绝。没改的段落原样不动。改过的段落里，字体这类细节可能丢，提示词和结果卡都写明。
  - **pptx：** `edit_pptx` 按页和文本框改文字，别的不动。
  - **xlsx：** `edit_xlsx` 按单元格地址改值和公式。表里有图表、透视表或外部链接时不改，因为库读写一遍可能丢掉它们。这时改成写一份“改动清单”，卡上说清楚。
  - **PDF：** 改不了原格式。店员读完写一份改好的 docx，结果卡写明“PDF 改成了 Word”。
- 改之前，店员先用 `read_document` 拿到带编号的段落、文本框或单元格，再按编号改，不猜位置。
- 改好的照旧另存一份（“改好的 xxx.docx”），原稿不动。结果卡的缩略图用改好的那份。
- `edit_*` 只能改委托文件夹里以“改好的”开头的复制件，不能改原稿。工具先把原稿复制成改好的那份，再在复制件上改。

**完成标准：** `tests/office.test.ts` 加三种编辑：修订在 XML 里对、没改的段落逐字节一样、有图表的表格拒绝改、原稿永远不动。`tests/templates.test.ts` 加新的种类和 20MB 上限，带宏的被拒。新场景 `officeedit`：分别递一份 docx、pptx 和 xlsx 来改，原稿逐字节没变，改好的能读回改动。递一份 PDF，得到一份 docx。中英文截图都看过。`inplace`、`revise`、`templates` 照旧过。真 Key 约 $3：docx、xlsx、pptx 各改一单，在 Office 里看修订和改动。

### C7 调研报告带出处

**现状：**

- 调研模板让帮手去查，写一份 `summary.md`：先三句总结，再列要点，最后是出处和链接（`templates.ts:74-82`）。出处和要点之间没有对应，哪条结论来自哪里看不出来。
- 结果卡把店员最后那段话当纯文本显示（`panels.ts:538`），不显示文件内容，也没有链接。
- 页面要打开网址只有一条路，而且只认几个写死的地址（`index.ts:431`）。
- 帮手的网页搜索和抓取都经过钩子，录制里有每次抓取的地址（`agent-runner.ts:72-85`、`:174-176`）。

**设计：**

- 模板改成两份文件：
  - `summary.md`：每条要点后面跟编号，比如“……[1][3]”，最后照旧列出处。
  - `sources.json`：

```ts
type Sources = {
  sources: { n: number; title: string; url: string; checked: string /* YYYY-MM-DD */; quote?: string }[];
  unsourced: string[];   // 写了但没找到出处的结论，原话
};
```

- 提示词写明：每条要点至少一个编号，找不到出处的放进 `unsourced`，在总结里也标“未找到出处”，不许编链接。
- 一单结束，应用的 `checkCitations()` 对一遍：
  - 哪条要点没有编号；
  - 哪个编号在 `sources.json` 里没有；
  - 哪个链接这一单的搜索结果和抓取里都没出现过，标“这一轮没打开过”。
- 对不上的不改文件，只在结果卡上写出来。
- 结果卡多一块“出处”，最多列 8 条，多的写共几条。每条是标题、网站名和“打开过”或“没打开过”。点了用系统浏览器打开。下面列“没找到出处”的结论。
- 打开出处走新的 `openSource(run, n)`。主进程只开这一单 `sources.json` 里那一条，只认 `http` 和 `https`。
- 旅行攻略（`templates.ts:158-168`）和读书笔记也写出处，1.3 先不动，调研这条路走通了再接。

**完成标准：** 新的 `tests/citations.test.ts` 覆盖编号解析、缺编号、编号不存在、没打开过的链接、`unsourced` 原样列出、非 http 链接不给打开。`tests/templates-prompts.test.ts` 的快照跟着改。新场景 `cite`：替身写一份总结，有一条没出处，一条链接没打开过。结果卡上两样都标出来了，点出处时替身记下的地址对。中英文结果卡截图都看过。`templates` 照旧过。真 Key 约 $3：三个题目各查一次，一个冷门、一个有争议、一个要最新数字，人工点开每条出处核对，结果记进第 7 节。

### C2 照片、图表和海报

**现状：**

- 相册模板已经让店员先看每张照片（`templates.ts:130-138`）。`Read` 能看 jpeg、png、gif、webp 四种（`sdk-tools.d.ts:255`）。
- 委托单检查“有没有照片”时认的是另一套：多了 bmp 和 avif（`panels.ts:138`、`:437`）。这两种能递过来，店员却看不到。
- 没有做图表、海报的模板，也没有把网页存成图片的办法。存 PDF 的隐藏窗口已经有了（`print.ts:14-29`）。
- 不接图像生成模型，见 Q-C1。

**设计：**

- 照片：
  - 递来的 bmp、avif、tiff，在隐藏窗口里画一遍，存成 png 副本，放在材料旁边，店员看副本，原图不动。Chromium 打不开的，比如 HEIC，不收，卡上说先存成 JPG。
  - 委托单的照片检查和店员看得到的种类用同一张表。
  - 单张照片超过 20MB 的照旧不收（`materials.ts:8`）。
- `nook-office` 加一个工具 `render_png`（类型 `make`）：把委托文件夹里的一个网页拍成 PNG，宽高由店员给，每边最多 4,096 像素。窗口的隔离和 `pageToPdf()` 一样：只许加载作品文件夹里的东西，不联网。
- 店员拍完可以用 `Read` 看这张图，自己检查排版，再改。
- 新模板 `chart`：用递来的表格（csv、xlsx）或单子上写的数字，画成 `chart.html`，图用内联 SVG，不引外部库。再拍成 `chart.png`。提示词要求：数字原样照抄，坐标从零开始，图上写单位和出处。
- 新模板 `poster`：海报和卡片，尺寸三选一：A4 竖版、方图（1080×1080）、宽屏（1920×1080）。做 `poster.html`，拍成 PNG，A4 的再存一份 PDF。照片只能用递来的。
- 结果卡的主文件是 PNG，缩略图就是它本身。

**完成标准：** `tests/materials.test.ts` 加 bmp、avif 转副本和 HEIC 被拒。`tests/office.test.ts` 加 `render_png` 的尺寸上限，加载外部地址被拦。`tests/templates-prompts.test.ts` 加两个新模板。新场景 `chart`：递一份 csv，替身画图、拍图，结果卡的缩略图是那张图，文件夹里有 `chart.html` 和 `chart.png`。新场景 `poster`：A4 一张，PNG 和 PDF 都在。`album` 递一张 bmp 能做完。中英文截图都看过，海报的 PNG 打开看过。`templates`、`materials` 照旧过。真 Key 约 $3：一张照片看图说话，一张图表，一张海报。

### C5 首批连接

按 Q-C2 的建议做，Lewis 改了就跟着改。

**现状：**

- 没有任何连接。店员能碰的只有委托文件夹、用户借出的文件夹（A6）和网页。
- 用户借出的文件夹是“在这里改”，每单选一次，店员能写（`docs/road-to-1.1.md` A6）。没有“只给看、不给改”的文件夹。
- 写信的模板只写纯文本，提示词写明不发出去（`templates.ts:101-110`）。给我们写信用的是 `mailto:`，打开用户自己的邮件程序（`index.ts:306`）。
- 商店版的清单只声明了 `runFullTrust`（`scripts/msix.mjs:83-85`），没有注册网址协议。要走登录跳转的连接，只能用本机回环地址接回调。

**设计：**

- **网盘文件夹（`folder`）：** 用户选一个文件夹，常见的是 OneDrive、坚果云、Google Drive 或 Dropbox 在电脑上同步的那个。应用不碰网盘的账号，同步交给它们自己的程序。
  - `list`（read）：列出两层以内的文件，最多 500 条，写法照 `listFolder()`（`commission.ts:239`）。隐藏文件、链接和名字像密钥的文件不列（`risk-classifier.ts:35`）。
  - `read`（read）：读一个文件。文本直接给，Office 走 `read_document`，PDF 和图片先复制进委托文件夹再让店员用 `Read`。单个 20MB。
  - `save_copy`（outside）：把委托文件夹里做好的一个文件，复制到这个文件夹下的“小灯屋”子文件夹。重名就在名字后面加序号，不覆盖。撤回就是删掉这一份。
  - 不删、不改名、不移动、不改用户的文件。
  - 授权卡写：能读这个文件夹两层以内；能往“小灯屋”里存新文件，每次都问；断开以后已经存进去的文件留着。
- **日历只读（`calendar`）：** 用户贴一个日历的 iCal 订阅地址。Google 日历、Outlook 都能给这种只读的私密地址。
  - 这个地址就是秘密，存进 `connections.bin`。
  - `events`（read）：主进程用 `net.fetch` 取这一个地址，只认 `https`。应用自己解析日程，给出一段时间里的事：开始、结束、标题、地点，重复的日程展开。一次最多 62 天、200 条。
  - 不能改日历。要加日程时，店员在委托文件夹里写一个 `.ics` 文件。用户在结果卡上点开，由日历程序问用户要不要加。`.ics` 加进 `OPENABLE`。
  - 授权卡写：能读你给的那份日历；不能改，也改不了；断开以后订阅地址从这台电脑上删掉。还要提醒用户：这个地址谁拿到都能看你的日历，要换的话去日历那边重置。
  - 验收时替身不联网：没打包时允许 `http://127.0.0.1`，场景自己起一个小服务器送样本日历。打包后只认 `https`。
- **邮件草稿（`maildraft`），最后做：** 不连邮箱账号。
  - `draft`（make）：把收件人、主题、正文写成委托文件夹里的一个 `.eml`，带 `X-Unsent: 1`。Outlook 打开这种文件时当作没发的草稿。
  - 结果卡上的“在邮件程序里打开”，由用户自己看、自己发。别的邮件程序打开 `.eml` 时怎么处理，真机上逐个看，不行就退回 `mailto:`，正文太长时只放主题和第一段。
  - 授权卡写：只写草稿，从来不发；草稿在这一单的文件夹里。
  - 写信模板勾了这个连接时，多做一份草稿。
- 三种都是 C4 的 `sdk` 服务器，名字是 `nook-folder`、`nook-calendar`、`nook-maildraft`。每次调用照 C6 记录。

**完成标准：** 新的 `tests/ics.test.ts` 覆盖解析、全天事件、时区、每周重复、例外日期、条数和天数上限、坏文件。新的 `tests/folder-link.test.ts` 覆盖只列两层、不列隐藏和像密钥的文件、存一份不覆盖、撤回只删存进去的那份、链接指到外面就拒。新的 `tests/eml.test.ts` 覆盖草稿的头和中文主题的编码。新场景 `folderlink`：连一个样本文件夹，委托读里面的 docx，做好以后存一份，第一次不允许、第二次允许，再撤回。新场景 `calendar`：替身读样本日历排一周计划，日志、录制和页面里都搜不到订阅地址。新场景 `maildraft`：写信勾上草稿，`.eml` 在文件夹里，点了“在邮件程序里打开”（替身记下）。中英文的三张授权卡和连接页截图都看过。真 Key 约 $3：每种连接一单。用 Lewis 自己的同步文件夹和日历之前，先说清会读到什么，等他点头。

### C8 资料室和邮局

**现状：**

- 店里有七个区（`app/renderer/game/layout.ts:18-26`），墙上已经很挤，1.2 的项目看板就是因为没有空位才做在黑板上（`docs/road-to-1.2.md` B2 的暂定）。
- 阿灯用读文件的工具时会走到书架（`rules/cafe.yaml:199-205`）。规则按工具名一字不差地比（`app/renderer/translator/translator.ts:39-40`）。
- 邮差阿信已经是街坊，会来串门，也送新版本的信（`app/shared/types.ts:14`，`app/renderer/game/guests.ts:15-17`）。

**设计：**

- 不加新房间。1.4 要把店搬上街，新店和新房间都放到那时候做。
- **资料室：** 书架那一区多一个文件柜。规则加在读文件那条前面：
  - 用 `read_document` 时，店员走到文件柜前翻；
  - 用 `make_*`、`edit_*`、`render_png` 时，坐在工作台写，做完把一叠纸放进文件柜。
  - 帮手不碰这些工具，所以只有主代理演。
- **邮局：** 门边的墙上加一个信插。
  - 读日历或网盘时，阿信从前门进来，把一封信插进信插，阿灯去取。
  - `save_copy` 允许以后，阿灯把包裹交给阿信带走。
  - 写好草稿时，阿灯把信放进柜台上的“待寄”小筐，提示用户“信写好了，你来寄”。阿信不来取。
  - 一单里阿信最多来两次，再有就由阿灯自己去信插。这样不会一直有人进进出出。
- 阿信本来就会来串门，两件事撞上时以连接为先，串门往后挪。
- 新美术只有文件柜、信插和待寄小筐三件，用现有素材包拼。放不下就在 `docs/floor-plans.md` 里改书架那一区，开工时先在两个场景里找位置。

**完成标准：** `tests/translator.test.ts` 加新工具名的规则和阿信一单最多来两次。`tests/routes.test.ts` 加文件柜和信插的站位，咖啡馆和书房逐个核对。`tests/pieces.test.ts` 加三件摆设。新场景 `backroom`：一单里做 docx、读日历、存进网盘、写草稿，分段截图。咖啡馆和书房、白天和夜里都截，中英文都看过。`walk`、`objects`、`seasons`、`crowd` 照旧过。

### C9 发布关卡和商店政策复核

**设计：** 照 1.2 的 B10，项目见第 6 节。真 Key 部分是每种新格式和每种连接各跑一单，约 $8。

商店政策要重读当时的最新版。1.0 时参照的是 11.16 条（`docs/road-to-1.5.md:169`），本文没有联网核对现在的条文，条号可能已经变了。要对的几处：

- 生成式 AI 的内容：店里做出来的文件和图片是 AI 做的，商店说明和应用里都要写明。
- 隐私：商店说明现在写“你的设置、Key 和作品都只在你的电脑上”（`store/listing.md:39`）。连接读到的内容会随委托发给 Anthropic，日历订阅地址会从这台电脑去取。这两句要加进去，英文那段也改。`docs/road-to-1.5.md:228` 说 1.4 以前只连 Anthropic，也跟着改一句。
- 年龄分级问卷里有没有新的项目要勾。

**完成标准：** 第 6 节全部勾上。

## 5. 待 Lewis 决定

下面几条都先按建议做，**暂定（2026-11-15），Lewis 看过再定**。改了的话，对应的工作包跟着改。

| 编号 | 问题 | 建议 | 理由 |
|---|---|---|---|
| Q-C1 | 接不接图像生成模型，接哪家 | 1.3 不接。图表和海报用网页画好再存成图片（C2） | 接的话要另一家服务的 Key，另一套账和价格，商店的生成式 AI 政策也要多审一样东西。用户要的多半是图表、海报、卡片，网页画得出来，字也不会画错。**暂定（2026-11-15），Lewis 看过再定** |
| Q-C2 | 首批连哪几种工具 | 先做网盘文件夹和只读日历，邮件只写本地草稿，最后做 | 这三种都不用 Lewis 去 Google 或微软注册应用，也不用过它们的审核，用户也不用登录账号。网盘文件夹只是本机的一个文件夹，同步交给网盘自己的程序。日历的订阅地址生来只读，想改也改不了。邮件草稿不连邮箱，发不发由用户自己定。真要连邮箱或可写的日历，要走登录授权，还要 Lewis 的开发者账号，这类留到 1.3 以后。各家现在有没有官方的 MCP 服务器，本文没有联网查，C5 开工前再查一次。**暂定（2026-11-15），Lewis 看过再定** |
| Q-C3 | 有没有外部动作可以不问直接做 | 没有。读用户勾过的连接不问，凡是改动外面东西的都每次问，定时委托也一样 | 委托单上的勾选已经是读的同意。改动外面的东西一次出错，用户可能根本不知道。按 C6，这样的动作 1.3 只有“存一份到网盘”一种，每次问一下也不烦。**暂定（2026-11-15），Lewis 看过再定** |

## 6. 发布关卡

**自动检查（我做）**

- [ ] `npm run typecheck` 和 `npx vitest run` 全过。
- [ ] 全量验收中英文全过，新场景都在里面：`connect`、`outside`、`outsideweb`、`office`、`officeread`、`officeedit`、`cite`、`chart`、`poster`、`folderlink`、`calendar`、`maildraft`、`backroom`。
- [ ] `npm run packaged` 过，打包后的程序里 `nook-*` 服务器能起来，测试连接和 `http://127.0.0.1` 的口子都不在。
- [ ] 安装包比 1.2 大了多少，记进第 7 节。

**真机（我做，要花钱的先报预算，用应用里存的 Key）**

- [ ] 先备份真实的数据文件夹，从 1.2 升到 1.3，作品、项目、账本都在。
- [ ] Word、Excel、PPT、PDF 各做一单，在 Office 里打开看过，结果卡的缩略图对（C1，约 $5）。
- [ ] docx、xlsx、pptx 各改一单，Word 里的修订能逐条接受（C3，约 $3）。
- [ ] 三次调研，每条出处人工点开核对（C7，约 $3）。
- [ ] 一张照片、一张图表、一张海报（C2，约 $3）。
- [ ] 网盘文件夹、日历、邮件草稿各一单（C5，约 $3）。连 Lewis 自己的文件夹和日历之前先问。
- [ ] 一个项目里连着用几种：读日历排计划，做成 xlsx，存进网盘，写一封草稿（C9，约 $8）。
- [ ] “外部动作”页和每张连接卡上的记录，和真跑时做过的事一一对上。
- [ ] 日志、录制和诊断包里搜不到日历订阅地址。

**Lewis 自己看**

- [ ] 授权卡、连接页、“外部动作”页、资料室和邮局的截图看过。
- [ ] 在自己的电脑上用 Outlook 或别的邮件程序打开过草稿，看过 `.ics` 加进日历。
- [ ] 商店政策复核的结果看过，商店说明的隐私那段改过的中英文都看过。

**要 Lewis 的账户才能做的**

- [ ] Partner Center 提交新版本，填生成式 AI 和隐私的问卷。
- [ ] 1.1 的代码签名证书（Q-A1）定了以后，1.3 照用。
- [ ] Q-C2 要是改成连邮箱或可写的日历，要用 Lewis 的账户在 Google 或微软注册应用、过它们的审核，这一项要提前几周开始。

**发布（Lewis 说发才发）**

- [ ] 1.1 和 1.2 已经发布，`release-1.3` 已经搬到 `main` 上，见第 2 节。
- [ ] 版本号改成 1.3.0，写 CHANGELOG 和 `release-notes/v1.3.0.md`。
- [ ] 先打 rc 标签跑通 `release.yml`，再打 `v1.3.0`。
- [ ] 商店版提交新版本。

## 7. 进度记录

每完成一个工作包，在这里加一行：日期、工作包、PR、查过什么、没查到什么。范围外的问题也记在这里。

| 日期 | 工作包 | PR | 结果 |
|---|---|---|---|
| 2026-11-15 | 本文 | 分支 `c0-roadmap`，未推送 | 基线 `release-1.2` 的 `e8dfce3`。每个包的现状都按代码和 SDK 的类型文件核过。比路线图多出来的有三处。一是 Office 的读写要应用自己带库，Claude Code 的技能要 Python，靠不住。二是相册收 bmp、avif，店员却看不到这两种。三是日志的脱敏只认 Anthropic Key 的样子，连接的秘密要另外登记。没查的：各家官方 MCP 服务器的现状、商店政策现在的条文、三个写文件的库的许可和大小，都没有联网核对 |
| 2026-11-15 | C4 | 分支 `c4-tools`，未推送 | `npx vitest run` 和 `tsc` 全过，新测试先看着失败再实现。中英文都跑过 `connect`、`consult`、`templates`、`materials`、`parallel`、`scheduled`、`projectboard`、`cards`，全过。授权卡、连接页和委托单那一行，中英文的截图都看过，640×360 的也看过。`connect` 场景里，替身把秘密念出来、夹进调用参数，日志和录制里都搜不到。没查的：没有真 Key 的运行，打包版里 `nook-*` 服务器能不能起来留给 C9，安装包多了多少没量 |
