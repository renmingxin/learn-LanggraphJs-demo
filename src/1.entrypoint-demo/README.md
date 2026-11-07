# 1.entrypoint-demo：用 LangGraph 的 `entrypoint` 手写一个 ReAct Agent

这个目录用 5 个文件、60 多行代码，把「模型 → 调工具 → 把结果回传 → 再调模型 → 得到答案」这套 Agent 循环从零搭了一遍。

它没有用 LangGraph 的 `StateGraph`、也没有用现成的 `createReactAgent`，而是用最基础的两个原语：

- `task()`：把一次副作用（调模型 / 调工具）包装成一个可复用的单元
- `entrypoint()`：定义一个入口函数，函数内部就是你的编排逻辑

---

## 一、整体流程

```
index.ts
   └─ agent.invoke([HumanMessage("计算200+100-80*100/20")])
          └─ entrypoint(match-agent)
                 │
                 ├─ callLLM(messages) ──────────────┐
                 │      └─ modalWithTools.invoke()  │  第 1 次调模型
                 │           └─ 返回 AIMessage      │
                 │              tool_calls: [...] ───┘
                 │
                 ├─ 有 tool_calls？
                 │      ├─ 没有 → break，返回最终的 AIMessage
                 │      └─ 有   → callTool(toolCall) × N（并行）
                 │                 └─ 返回 ToolMessage（带 tool_call_id）
                 │
                 ├─ messages += [AIMessage, ToolMessage...]
                 └─ 回到 callLLM …… 直到模型不再调工具
```

一句话概括数据流：**模型只负责"决定调什么"，工具只负责"算结果"，循环负责"把结果喂回去"。**

---

## 二、前置准备

### 1. 环境变量

在项目根目录（`LangGraph-demo/.env`）配置：

```ini
LLM_BASE_URL=https://你的兼容 OpenAI 协议的地址/v1
LLM_MODEL=deepseek-v4-1-flash-261017
LLM_API_KEY=sk-xxxx
```

这三个变量在 `2.modal.ts` 里被读取，缺 `LLM_BASE_URL` 会直接连到 OpenAI 官方地址而报错。

### 2. 依赖

本项目用到的关键依赖（已在根 `package.json` 中）：

| 包 | 作用 |
| --- | --- |
| `@langchain/langgraph` | 提供 `entrypoint`、`task`、`addMessages` |
| `langchain` | 提供 `tool`、`BaseMessage`、`ToolCall` 等类型 |
| `@langchain/openai` | `ChatOpenAI`，用它能接任何 OpenAI 兼容网关 |
| `zod` | 工具参数的 schema 定义 |
| `dotenv` | 读取 `.env` |

---

## 三、分步实现

### Step 1 — `1.tools.ts`：定义工具

工具 = **一个函数 + 一份给模型看的说明书**。

```ts
export const add = tool(({ a, b }) => a + b, {
  name: 'add',
  description: '两数相加',
  schema: z.object({
    a: z.number().describe('第一个加数'),
    b: z.number().describe('第二个加数'),
  }),
})
```

要点：

1. **`description` 是写给模型看的**，模型靠它判断"该不该调、调哪个"。写清楚比写漂亮重要。
2. **`schema` 决定模型能传什么参数**，`.describe()` 会一并进入工具定义，相当于参数级的提示词。
3. **schema 不是装饰品**：LangChain 会在调用前按它校验参数，类型不对会被拦下。

同目录下另外补了 `subtract`（减）、`multiply`（乘）、`divide`（除）。最后统一导出两份数据：

```ts
// 按名字索引，供 tool-node 执行时查找
export const toolsByName = {
  [add.name]: add,
  [subtract.name]: subtract,
  [multiply.name]: multiply,
  [divide.name]: divide,
}

// 数组形式，供 bindTools 绑定给模型
export const tools = Object.values(toolsByName)
```

为什么要导两份？因为**模型返回的只是工具名字符串**，运行时需要用 `toolsByName['add']` 找回真正的函数；而 `bindTools` 需要的是数组。

---

### Step 2 — `2.modal.ts`：创建模型并绑定工具

```ts
const llm = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  timeout: 30000,
  configuration: { baseURL: BASE_URL },
})

const modalWithTools = llm.bindTools(tools)
```

要点：

1. **`bindTools` 不改模型，只生成一个"带着工具清单"的新实例**。每次 `invoke` 时，这份清单会被序列化进请求体，所以你会看到 `promptTokens` 稳定多出几百（工具定义也占 token）。
2. **`tool_choice` 保持默认 `auto`**。这里踩过一次坑：写成 `{ tool_choice: 'any' }` 会强制模型**每一轮都必须调工具**，于是 `5.agent.ts` 的 `while` 循环永远等不到"不调工具"的那次回复，直接死循环。
   - 如果某个场景确实需要强制调用，**在单次调用时传**，不要写进绑定：
     ```ts
     modalWithTools.invoke(messages, { tool_choice: 'any' })
     ```
3. **`configuration.baseURL` 指向兼容网关**，因此 `model` 名字可以不是 OpenAI 官方模型。

---

### Step 3 — `3.modal-node.ts`：把"调模型"包成 task

```ts
export const callLLM = task({ name: 'callLLM' }, async (message: BaseMessage[]) => {
  return modalWithTools.invoke([
    new SystemMessage('你是一个专业的计算助手，只能回答计算相关的问题'),
    ...message
  ])
})
```

要点：

1. **`task()` 是 LangGraph 对"可缓存、可记录、可在 checkpoint 里回放"的异步单元的封装**。同一个 `task` 用相同入参调用时，在一次运行内可以被复用/去重，不会重复打网络请求。
2. **`SystemMessage` 放在这里而不是调用方**，好处是所有走 `callLLM` 的路径都自动带上同一条系统提示，不会漏。
3. **返回值就是 `AIMessage`**，里面带着 `content`、`tool_calls`、`response_metadata.finish_reason` —— 后者是循环判断的关键依据。

---

### Step 4 — `4.tool-node.ts`：把"执行工具"包成 task

```ts
export const callTool = task({ name: 'callTool' }, async (toolCall: ToolCall) => {
  console.log('toolCall', toolCall)
  const tool = toolsByName?.[toolCall.name as keyof typeof toolsByName]
  return tool.invoke(toolCall)
})
```

要点：

1. **直接 `tool.invoke(toolCall)`，不是 `tool.invoke(toolCall.args)`**。把整个 `ToolCall` 对象丢进去，LangChain 会自动生成一条带 `tool_call_id` 的 `ToolMessage`。这个 id 必须和模型发起的调用一一对应，否则下一轮请求会被 API 拒绝（报 "tool_call_id not found" / "must be a response to a preceding message"）。
2. **`toolsByName` 可能查不到**（模型幻觉出一个不存在的工具名），此时 `tool` 是 `undefined`，`invoke` 会抛错。稳妥写法是查不到就返回一条"工具不存在"的 `ToolMessage`，让模型自己纠正。
3. `console.log('toolCall', toolCall)` 是刻意留的诊断日志：**只有它出现，才证明模型真的发起了工具调用**，而不只是自己心算。

---

### Step 5 — `5.agent.ts`：核心循环

```ts
export const agent = entrypoint({ name: 'match-agent' }, async (messages: BaseMessage[]) => {
  let modalResponse = await callLLM(messages)
  let iteration = 0

  while (true) {
    iteration++
    console.log(`[agent] 第 ${iteration} 轮: tool_calls=${...}, finish_reason=${...}`)

    // 退出条件：模型不再要求调工具
    if (!modalResponse?.tool_calls?.length) {
      break
    }

    // 并行执行本轮所有工具调用
    const toolResults = await Promise.all(
      modalResponse.tool_calls.map((toolCall: any) => callTool(toolCall))
    )
    const validToolResults = toolResults.filter((r: any) => r !== undefined)

    // 关键：把"模型的调用意图"和"工具的执行结果"一起追加进对话
    messages = addMessages(messages, [modalResponse, ...validToolResults])

    // 带着新上下文再问模型一次
    modalResponse = await callLLM(messages)
  }

  return modalResponse
})
```

这段是整个 Agent 的心脏，四个细节值得记住：

1. **两个退出条件其实只有一个**：`tool_calls` 为空。`finish_reason` 只用来打印观察，不参与判断 —— 有些网关把 `finish_reason` 返回成别的值，用它判断会误伤。
2. **循环里必须先追加 `AIMessage`**。模型的 tool_call 是"它说过的话"，不带着这句话，后面那条 `ToolMessage` 就成了没有上下文的孤立消息，API 会报错。
3. **`Promise.all` 让同一轮的多个工具并行跑**。模型一次可能返回多个 tool_call（比如同时算 `80*100` 和 `200+100`），并行能省一轮网络等待。
4. **这是无上限的 `while (true)`**。理论上模型可以无限调工具，建议加个保险：
   ```ts
   const MAX_ITERATION = 8
   while (iteration < MAX_ITERATION) { ... }
   ```

`entrypoint` 本身的作用：把一个普通 async 函数注册成 LangGraph 可编排、可流式、可持久化的节点。它接收的 `messages` 就是初始输入，`return` 的 `modalResponse` 就是最终输出。

---

### 收尾 — `index.ts`：触发一次调用

```ts
const res = await agent.invoke([new HumanMessage('计算200+100-80*100/20')])
console.log('invoke', res)
```

```ts
import 'dotenv/config'
import 'dev-log-monitor/auto'
```

这两行 import 必须在**最前面**：`dotenv/config` 保证后续模块能读到 `.env`；`dev-log-monitor/auto` 是本地开发用的日志增强，早于业务代码加载才能接管日志输出。

---

## 四、一次完整调用的消息序列

以 `计算200+100-80*100/20`（答案是 `-100`）为例。模型如何拆分步骤取决于它自己，下面是一种常见走法：

| 轮次 | 消息 | 说明 |
| --- | --- | --- |
| 0 | `HumanMessage("计算200+100-80*100/20")` | 入口输入 |
| 1 | `AIMessage`（`content: ""`，`tool_calls: [multiply, add]`，`finish_reason: "tool_calls"`） | 模型决定先算乘法和加法 |
| 2 | `ToolMessage(multiply → 8000, tool_call_id: xxx)`<br>`ToolMessage(add → 300, tool_call_id: yyy)` | 并行执行，结果与 id 一一对应 |
| 3 | `AIMessage`（`tool_calls: [divide]`，`finish_reason: "tool_calls"`） | 还要再算一步 8000/20 |
| 4 | `ToolMessage(divide → 400)` | |
| 5 | `AIMessage`（`content: "-100"`，`tool_calls: []`，`finish_reason: "stop"`） | 无工具调用 → `break` → 返回 |

对应终端日志大致如下（轮数与并行组合可能因模型而异）：

```
modalResponse AIMessage { finish_reason: "tool_calls", tool_calls: [multiply, add] }
[agent] 第 1 轮: tool_calls=2, finish_reason=tool_calls
toolCall { name: 'multiply', args: { a: 80, b: 100 }, ... }
toolCall { name: 'add', args: { a: 200, b: 100 }, ... }
[agent] 第 2 轮: tool_calls=1, finish_reason=tool_calls
toolCall { name: 'divide', args: { a: 8000, b: 20 }, ... }
[agent] 第 3 轮: tool_calls=0, finish_reason=stop
invoke AIMessage { content: "-100" }
```

只看 `[agent] 第 N 轮` 和 `toolCall` 两类日志，就能判断链路是否健康。

---

## 五、怎么运行

本项目用 `tsdown` 编译，`src/**` 会按目录结构输出到 `dist/`：

```powershell
# 1. 编译（或开发时用 pnpm watch 保持热编译）
pnpm build

# 2. 运行这个 demo
node dist/1.entrypoint-demo/index.mjs
```

产物落点为 `dist/1.entrypoint-demo/index.mjs`，与源码目录一一对应。

想换成别的题目，直接改 [index.ts](./index.ts) 里的 `HumanMessage` 内容即可。

---

## 六、日志怎么看

| 日志 | 含义 | 判断 |
| --- | --- | --- |
| `modalResponse AIMessage { tool_calls: [], finish_reason: "stop" }` | 模型直接心算，没走工具 | 链路没被触发（题目太简单，模型懒得调） |
| `modalResponse AIMessage { tool_calls: [{name:'add',...}], finish_reason: "tool_calls" }` | 模型发起工具调用 | 正常 |
| `toolCall { name: 'add', args: {...} }` | 工具真的被执行了 | 出现它才算真调用 |
| `[agent] 第 N 轮` 一直递增不结束 | 工具结果没正确回传 | 检查 `addMessages` 和 `ToolMessage` 的 `tool_call_id` |

**最容易误判的一点**：`invoke AIMessage` 是 `index.ts` 打印的最终返回值，它和"最后一轮"的响应是**同一个对象**，不是第 N+1 次模型调用。

---

## 七、踩坑记录

1. **`tool_choice: 'any'` 写进 `bindTools` → 死循环**
   强制每轮必调工具，循环永远等不到 `tool_calls: []`。只在单次 `invoke` 时传。

2. **`tool.invoke(toolCall.args)` 而不是 `tool.invoke(toolCall)`**
   少传 `tool_call_id`，下一轮请求会被 API 拒绝。

3. **不追加 `AIMessage` 只追加 `ToolMessage`**
   对话历史断裂，工具结果变成"无主消息"。

4. **`divide` 没有除零保护**
   只在 `description` 里写了"不能为 0"，靠模型自觉。严谨做法是在函数体里 `if (b === 0) throw new Error('除数不能为 0')`。

5. **`while (true)` 没有迭代上限**
   模型抽风时会无限循环烧 token，建议加 `MAX_ITERATION`。

6. **TS2742：导出的值无法命名推断类型**
   开启 `declaration` 且返回类型来自没有直接 import 的子路径时触发。解法是显式注解：
   ```ts
   type ModalWithTools = ReturnType<ChatOpenAI['bindTools']>
   const modalWithTools: ModalWithTools = llm.bindTools(tools)
   ```

7. **`tsconfig.json` 的 `rootDir` 冲突**
   设置了 `rootDir: "./src"` 却没写 `include`，tsc 默认会把根目录的 `tsdown.config.ts` 也纳入编译，报 "not under rootDir"。加上 `"include": ["src"]` 即可。

---

## 八、这套手写循环 vs LangGraph 现成方案

| | 手写 `entrypoint` 循环（本目录） | `createReactAgent` / `StateGraph` |
| --- | --- | --- |
| 代码量 | 少，全部逻辑一眼看穿 | 抽象多，需要理解节点/边/状态 |
| 可控性 | 完全可控，随时插日志、改退出条件 | 需要懂框架约定才能定制 |
| 适合场景 | **理解 ReAct 原理、调试链路** | 生产环境、需要持久化/中断/人工审批 |

建议顺序：先在本目录把循环跑通、把日志看明白，再去用 `createReactAgent` —— 那时你会知道框架在每个节点背后替你做了什么。
