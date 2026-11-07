import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, StateGraph } from '@langchain/langgraph';
import { HumanMessage, SystemMessage } from 'langchain';


const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const API_KEY = process.env.LLM_API_KEY || 'sk-12e809b239ec45e49596c0d08c8350eb'

// 初始化模型
const llm = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  timeout: 30000, // 30秒超时，防止卡住
  configuration: {
    baseURL: BASE_URL,
  }
})

// 消息内容可能是字符串，也可能是多段内容数组，统一转成文本
const toText = (content: unknown): string =>
  typeof content === 'string' ? content : JSON.stringify(content)

// 四类意图，key 用于路由，value 仅用于提示词
const INTENTS = {
  presale: '售前问题（价格、优惠、活动、下单前咨询）',
  aftersale: '售后问题（退换货、物流、发票、维修、投诉）',
  product: '产品咨询（参数、功能、使用方法、选型对比）',
  general: '其他问题（与业务无关或无法判断）',
} as const

type IntentKey = keyof typeof INTENTS

const StateAnnotation = Annotation.Root({
  // 用户原始提问
  question: Annotation<string>,
  // 意图分类结果：presale | aftersale | product | general
  intent: Annotation<string>,
  // 客服最终回复
  answer: Annotation<string>,
})

// 第一步：意图识别，把用户问题归到某一类
const classifyIntent = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      `你是客服系统的意图分类器。请判断用户问题属于哪一类，只输出一个英文标签，不要任何解释：
- presale：${INTENTS.presale}
- aftersale：${INTENTS.aftersale}
- product：${INTENTS.product}
- general：${INTENTS.general}`
    ),
    new HumanMessage(`用户问题：${state.question}`),
  ])

  // 模型输出可能带多余内容，做一次兜底归一化
  const raw = toText(res.content).toLowerCase()
  let intent: IntentKey = 'general'
  if (raw.includes('presale') || raw.includes('售前')) intent = 'presale'
  else if (raw.includes('aftersale') || raw.includes('售后')) intent = 'aftersale'
  else if (raw.includes('product') || raw.includes('产品')) intent = 'product'

  console.log('[classify] 原始输出 =', raw, '→ 归一化 =', intent)
  return { intent }
}

// 第二步：不同意图交给不同节点处理（每个节点有自己的客服人设）

const handlePreSale = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      '你是售前客服，风格热情、促成转化。介绍当前价格与优惠活动，回答要简洁，最后引导用户下单，不要编造不存在的活动。'
    ),
    new HumanMessage(state.question),
  ])
  return { answer: toText(res.content) }
}

const handleAfterSale = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      '你是售后客服，风格耐心、以解决问题为先。先安抚情绪，再给出退换货、物流、发票等处理步骤，必要时提示用户提供订单号。'
    ),
    new HumanMessage(state.question),
  ])
  return { answer: toText(res.content) }
}

const handleProduct = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      '你是产品顾问，风格专业、客观。介绍产品参数、功能与使用场景，可以给出选型建议，不确定的参数要说明"以官方参数页为准"。'
    ),
    new HumanMessage(state.question),
  ])
  return { answer: toText(res.content) }
}

const handleGeneral = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      '你是通用客服。如果问题与业务无关，礼貌说明服务范围；如果无法判断，告知用户将转接人工客服。'
    ),
    new HumanMessage(state.question),
  ])
  return { answer: toText(res.content) }
}

// 路由函数：直接返回分类结果，作为条件边的分支 key
const routeByIntent = (state: typeof StateAnnotation.State) => state.intent

// 定义状态图：识别意图 → 条件边分流 → 各节点作答 → 结束
const agent = new StateGraph(StateAnnotation)
  // 节点名不能与状态字段重名（例如不能再叫 intent / answer）
  .addNode('classifyIntent', classifyIntent)
  .addNode('handlePreSale', handlePreSale)
  .addNode('handleAfterSale', handleAfterSale)
  .addNode('handleProduct', handleProduct)
  .addNode('handleGeneral', handleGeneral)
  // 入口边
  .addEdge('__start__', 'classifyIntent')
  // 条件边：根据 intent 决定去哪个节点
  .addConditionalEdges('classifyIntent', routeByIntent, {
    presale: 'handlePreSale',
    aftersale: 'handleAfterSale',
    product: 'handleProduct',
    general: 'handleGeneral',
  })
  // 每个处理节点都直接结束
  .addEdge('handlePreSale', '__end__')
  .addEdge('handleAfterSale', '__end__')
  .addEdge('handleProduct', '__end__')
  .addEdge('handleGeneral', '__end__')
  .compile()


// 调用：换一句 question 就能走不同分支
const invoke = async () => {
  const res = await agent.invoke({
    question: '你们这个套餐现在有优惠吗？我准备下单',
    // 其他可试：
    // '收到的商品坏了，怎么申请退货？'   → aftersale
    // '这款和另一款有什么区别，怎么选？' → product
    // '今天天气怎么样？'                → general
  })
  console.log('intent =', res.intent)
  console.log('答复 =', res.answer)
  return res
}

invoke();
