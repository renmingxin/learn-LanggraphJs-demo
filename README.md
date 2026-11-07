# LangGraph 学习 Demo

一套由浅入深的 LangGraph（TypeScript）示例合集，从"手写一个 ReAct 循环"开始，逐步覆盖状态图、条件路由、并行分支、工具调用、子图、中断与恢复（human-in-the-loop）。

每个目录都是**独立可运行**的小 demo，入口文件末尾会直接调用 `invoke()`，编译后单独执行即可看到完整日志。

---

## 快速开始

### 1. 环境要求

- Node.js 20+（本项目在 Node 24 上验证）
- pnpm

### 2. 安装依赖

```powershell
pnpm install
```

### 3. 配置环境变量

在项目根目录（本文件所在目录）新建 `.env`：

```ini
LLM_BASE_URL=https://你的兼容 OpenAI 协议的地址/v1
LLM_MODEL=deepseek-v4-1-flash-261017
LLM_API_KEY=sk-xxxx
```

说明：代码里 `LLM_BASE_URL` 缺省时，`ChatOpenAI` 会连到 OpenAI 官方地址；所有示例都以它为准，务必配好。

### 4. 编译并运行

`tsdown.config.ts` 把 `src/**/*.ts` 的每个文件都当作独立入口，产物按**源目录结构**输出到 `dist/`，扩展名为 `.mjs`：

```powershell
# 编译一次
pnpm build

# 开发时保持热编译
pnpm watch
```

运行某个示例（**注意：是编译后的 dist 路径，不是 src**）：

```powershell
node dist/1.entrypoint-demo/index.mjs
node dist/2.graph-flow-deom/agent-customer.mjs
node dist/3.parallel-flow/agent.mjs
node dist/4.simple-memory-agent/analyze-agent.mjs
node dist/5.sub-graph/agent.mjs
node dist/6.interrupt/agent.mjs
```

---

## 目录结构

```
LangGraph-demo/
├── src/
│   ├── index.ts                     # 打印环境变量，验证 .env 是否生效
│   ├── 1.entrypoint-demo/           # 用 entrypoint + task 手写 ReAct Agent
│   │   ├── 1.tools.ts               # add / subtract / multiply / divide 工具
│   │   ├── 2.modal.ts               # ChatOpenAI + bindTools
│   │   ├── 3.modal-node.ts          # 调模型封装成 task
│   │   ├── 4.tool-node.ts           # 执行工具封装成 task
│   │   ├── 5.agent.ts               # 核心 while 循环：调模型 → 调工具 → 回传
│   │   ├── index.ts                 # 入口：agent.invoke([HumanMessage(...)])
│   │   ├── README.md                # 本目录详细教程
│   │   └── flow.html                # 流程图解
│   ├── 2.graph-flow-deom/           # StateGraph 条件路由
│   │   ├── agent.ts                 # 笑话润色版（generate → check → improve → polish）
│   │   ├── agent-customer.ts        # AI 客服版：意图识别 → 四类分支
│   │   └── agent-customer-flow.html # 客服版流程图解
│   ├── 3.parallel-flow/             # 并行分支
│   │   ├── agent.ts                 # 笑话 / 故事 / 诗 三节点并行 → 汇总
│   │   └── parallel-flow.html
│   ├── 4.simple-memory-agent/       # 工具调用 + 状态图
│   │   ├── agent.ts                 # 爬取单页 → 模型分析
│   │   ├── analyze-agent.ts         # 分析主题 → 并行抓 5 站 → 汇总报告
│   │   └── analyze-flow.html
│   ├── 5.sub-graph/                 # 子图
│   │   ├── agent.ts                 # 主图内先后调用两个子图
│   │   └── sub-graph-flow.html
│   └── 6.interrupt/                 # 中断与恢复
│       ├── agent.ts                 # 分析 → 人工确认 → 抓取 → 汇总
│       └── interrupt-flow.html
├── tsdown.config.ts                 # entry: src/**/*.ts
├── tsconfig.json                    # include: ["src"]
├── package.json
└── README.md
```

---

## 六个示例学什么

| # | 目录 / 入口 | 核心机制 | 你会学到 |
| --- | --- | --- | --- |
| 1 | `1.entrypoint-demo/index.ts` | `entrypoint` + `task` | 不用框架封装，手写 ReAct 循环：`bindTools`、`tool_calls`、`ToolMessage`、`addMessages` |
| 2 | `2.graph-flow-deom/agent.ts` | `StateGraph` + `addConditionalEdges` | 状态字段、节点、普通边、条件边；节点名不能与状态字段重名 |
| 2 | `2.graph-flow-deom/agent-customer.ts` | 条件路由 | 意图识别（售前/售后/产品/其他）→ 四类客服节点各答各的 |
| 3 | `3.parallel-flow/agent.ts` | 并行分支 | 同一节点多条出边 = 并行；多条入边 = 等全部到齐再执行 |
| 4 | `4.simple-memory-agent/agent.ts` | 工具 + 状态 | `tool()` + zod schema；在节点里调用工具并写回状态 |
| 4 | `4.simple-memory-agent/analyze-agent.ts` | 工具 + 并行 + 汇总 | 模型给出站点 → `Promise.all` 抓取（含重试）→ 模型生成报告 |
| 5 | `5.sub-graph/agent.ts` | 子图 | 把一张编译好的图当作节点调用；子图有独立状态副本 |
| 6 | `6.interrupt/agent.ts` | `interrupt` + `checkpointer` | 图暂停等人工输入；`MemorySaver` + `thread_id`；`Command({ resume })` 恢复 |

### 各示例一句话流程

1. **entrypoint-demo**：`HumanMessage → 模型 → 有 tool_calls？→ 执行工具 → 结果回传 → 再调模型 … → 得到答案`
2. **graph-flow**（笑话版）：`生成笑话 → 判断 PASS/FAIL → PASS 结束 / FAIL 继续改进 → 润色 → 结束`
   （当前 `checkJoke` 恒返回 `PASS`，所以实际运行时只会走"生成 → 结束"）
3. **graph-flow**（客服版）：`问题 → 意图分类 → presale / aftersale / product / general 四条分支 → 结束`
4. **parallel-flow**：`主题 → 同时写笑话、故事、诗 → 三者汇总 → 结束`
5. **simple-memory-agent**：`URL → fetch 工具抓页面 → 模型分析`
6. **analyze-agent**：`主题 → 模型选出 5 个站点 → 并行抓取（每站最多重试 3 次）→ 模型汇总报告`
7. **sub-graph**：`抓百度 → 子图1（抓 hao123 + 分析）→ 子图2（抓淘宝 + 分析）→ 分析百度页`
8. **interrupt**：`分析出站点 → 暂停问"是否满意" → 是则继续抓取并汇总；否则终止`

---

## 概念速查

| 概念 | 在本项目中的位置 | 要点 |
| --- | --- | --- |
| `Annotation.Root({...})` | 所有 StateGraph 示例 | 定义状态字段（channel）；节点返回对象只写自己那段 |
| `addNode(name, fn)` | 所有 StateGraph 示例 | 节点名必须唯一，且**不能与状态字段同名**，否则 `compile()` 报错 |
| `addEdge(a, b)` | 所有 StateGraph 示例 | 普通边；`__start__` / `__end__` 是保留节点名 |
| `addConditionalEdges(src, router, map)` | `2.graph-flow-deom/*` | `router` 返回值必须是 `map` 的某个 key |
| 并行 | `3.parallel-flow`、`4.*/analyze-agent.ts` | 图的并行由"多条出边"表达；`fetchNode` 内部再用 `Promise.all` 做 I/O 并行 |
| `tool(fn, { name, description, schema })` | `1.*`、`4.*`、`6.*` | `description` 给模型看，`schema` 做参数校验；执行用 `tool.invoke(toolCall)` |
| `entrypoint` / `task` | `1.entrypoint-demo` | 轻量编排原语，不建图也能跑循环 |
| 子图 | `5.sub-graph` | `subGraph.invoke()` 会另开一份状态，结果不会自动合并回父图 |
| `interrupt()` | `6.interrupt` | 抛中断信号，节点立即停下；必须配合 `checkpointer` 与 `thread_id` |
| `Command({ resume })` | `6.interrupt` | 同一线程上恢复执行；resume 值就是 `interrupt()` 的返回值 |

---

## 运行注意事项

1. **`dev-log-monitor/auto` 会常驻**
   每个入口都 import 了它，它会启动 `http://localhost:3333` 的日志 UI，脚本跑完也**不会自动退出**。验证完直接 `Ctrl+C` 即可。
   如果启动时报 `Port 3333 is in use`，说明有上一个实例没关，结束残留的 node 进程即可（不影响脚本本身运行）。

2. **`6.interrupt` 需要终端输入**
   第一次 `invoke` 会停在 `interruptNode`，终端会提示：
   ```
   当前分析结果是否满意？输入 y/是 继续，其他则中断：
   ```
   输入 `y` 才继续抓取与汇总。非交互环境下可以用：
   ```powershell
   "y" | node dist/6.interrupt/agent.mjs
   ```

3. **`4.*/analyze-agent.ts` 与 `6.*` 的抓取会失败一部分**
   语雀、飞书、wolai 等站点是前端渲染的 SPA，直接 `fetch` 只能拿到几十个字符的 HTML 壳，表现为"内容过短"连续失败 3 次。这是站点特性，不是代码 bug。

4. **每个文件末尾都直接执行 `invoke()`**
   所以只要 `import` 了某个文件，它就会跑一次。调试时如需"只导入不执行"，得自己把那行注释掉。

---

## 常见问题

| 现象 | 原因 / 处理 |
| --- | --- |
| `rootDir` 报错：`tsdown.config.ts` 不在 `rootDir: src` 下 | `tsc` 默认匹配 `**/*`，需要在 `tsconfig.json` 加 `"include": ["src"]` |
| `TS2742`：无法命名推断类型，很可能不可移植 | 开启 `declaration` 且返回类型来自未直接 import 的子路径；显式注解，例如 `type X = ReturnType<ChatOpenAI['bindTools']>` |
| 构建报 `PARSE_ERROR: Unexpected JSX expression` | `tsdown` 入口曾是 `src/**`，把 `.html` / `.md` 也当源码解析；入口应为 `src/**/*.ts` |
| `finalJoke is already being used as a state attribute` | 节点名与状态字段重名，改节点名（如 `polishJoke`） |
| 模型一直调工具、循环不结束 | 检查是否把 `tool_choice: 'any'` 写进了 `bindTools`；强制调用只应在单次 `invoke` 时传 |
| `InMemoryStore` 类型不匹配 `BaseStore` | 它定义在 `@langchain/langgraph`，从 `langchain` 导入会丢类型；以官方导出路径为准 |
| git 提示 `LF will be replaced by CRLF` | Windows 换行符转换提示，不影响运行；可用 `.gitattributes` 统一 `eol=lf` |

---

## 安全提示

`2.modal.ts`、`3.*`、`4.*`、`5.*`、`6.*` 里 `LLM_API_KEY` 都带了一个**硬编码的兜底值**。这些文件已进入 git 暂存/提交范围时，建议：

1. 删除源码里的兜底 key，统一从 `.env` 读取；
2. 到服务商后台轮换该 key；
3. 确认 `.env` 已被 `.gitignore` 忽略。

---

## 配套图解

每个示例目录都有一份自包含的 HTML 图解，浏览器直接打开：

- `src/1.entrypoint-demo/README.md` + `flow.html`
- `src/2.graph-flow-deom/agent-customer-flow.html`
- `src/3.parallel-flow/parallel-flow.html`
- `src/4.simple-memory-agent/analyze-flow.html`
- `src/5.sub-graph/sub-graph-flow.html`
- `src/6.interrupt/interrupt-flow.html`
