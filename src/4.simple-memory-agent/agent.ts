import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, BaseStore, StateGraph } from '@langchain/langgraph';
import { HumanMessage, InMemoryStore, tool } from 'langchain';
import * as zod from 'zod'

const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
const API_KEY = process.env.LLM_API_KEY || 'sk-12e809b239ec45e49596c0d08c8350eb'
//模型每次执行，知道之前的对话结果，记忆（上下文）
// 初始化存储, 用于存储模型的上下文
// 每个用户都有一个对应的存储, 用于存储该用户的上下文
const store = new InMemoryStore()
// 初始化模型
const llm = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  timeout: 30000, // 30秒超时，防止卡住
  configuration: {
    baseURL: BASE_URL,
  }
})

const StateAnnotation = Annotation.Root({
  url: Annotation<string>,
  times: Annotation<number>,
  text: Annotation<string>,
})

//定义工具,爬虫工具
const fetchTool = tool(async ({ url }) => {
  const res = await fetch(url)
  return await res.text()
}, {
  name: 'fetch',
  description: '从给定的url获取内容, 并返回内容',
  schema: zod.object({
    url: zod.string().describe('要获取的url'),
  }),
})

const fetchToolNode = async (state: typeof StateAnnotation.State) => {
  const res = await fetchTool.invoke({ url: state.url })
  return { times: state.times + 1, text: res }
}

const modalNode = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke(`用户爬取到的内容是：${state.text}，再简短的分析一下这个网页的内容`)
  console.log('modalNode', res.content)
  return { times: state.times }
}


const agent = new StateGraph(StateAnnotation)
  // 节点定义
  .addNode('fetchToolNode', fetchToolNode)
  .addNode('modalNode', modalNode)
  .addEdge('__start__', 'fetchToolNode')
  .addEdge('fetchToolNode', 'modalNode')
  .addEdge('modalNode', '__end__')
  .compile({
    store: store as unknown as BaseStore,
  });


const invoke = async () => {
  const res = await agent.invoke({
    times: 0,
    url: 'https://www.baidu.com/',
  })
  // console.log('invoke', res)
  return res
}

invoke();