import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from 'langchain';


const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
const API_KEY = process.env.LLM_API_KEY || 'sk-12e809b239ec45e49596c0d08c8350eb'
//graph engineering
//多智能体
//并行流
//langgraph 子图

//我要写一个笑话，一首诗，写一个故事
//前端、后端、测试 并行开发

// 初始化模型
const llm = new ChatOpenAI({
  model: MODEL,
  apiKey: API_KEY,
  timeout: 30000, // 30秒超时，防止卡住
  configuration: {
    baseURL: BASE_URL,
  }
})


// 状态定义, 用于定义智能体的状态, 包含笑话、故事、诗、组合输出
// 每个状态都有一个对应的 Annotation, 用于定义状态的类型
const StateAnnotation = Annotation.Root({
  topic: Annotation<string>,
  //笑话
  joke: Annotation<string>,
  //故事
  story: Annotation<string>,
  //诗
  poem: Annotation<string>,
  //组合输出
  combined: Annotation<string>,
})

const callLlm1 = async (state: typeof StateAnnotation.State) => {
  const msg = await llm.invoke([
    new HumanMessage(`写个关于${state.topic}的笑话`)
  ])
  return { joke: msg.content }
}
const callLlm2 = async (state: typeof StateAnnotation.State) => {
  const msg = await llm.invoke([
    new HumanMessage(`写个关于${state.topic}的故事`)
  ])
  return { story: msg.content }
}
const callLlm3 = async (state: typeof StateAnnotation.State) => {
  const msg = await llm.invoke([
    new HumanMessage(`写个关于${state.topic}的诗`)
  ])
  return { poem: msg.content }
}
const combineLlm = async (state: typeof StateAnnotation.State) => {
  const msg = await llm.invoke([
    new HumanMessage(`这里有一个关于${state.topic}的笑话、故事、诗，写一个关于${state.topic}的组合输出。
      笑话：${state.joke}
      故事：${state.story}
      诗：${state.poem}
      `)
  ])
  return { combined: msg.content }
}



const agent = new StateGraph(StateAnnotation)
  // 节点定义
  .addNode('callLlm1', callLlm1)
  
  .addNode('callLlm2', callLlm2)
  .addNode('callLlm3', callLlm3)
  .addNode('combineLlm', combineLlm)
  // 边定义
  .addEdge('__start__', 'callLlm1')
  .addEdge('__start__', 'callLlm2')  
  .addEdge('__start__', 'callLlm1')
  .addEdge('__start__', 'callLlm2')
  .addEdge('__start__', 'callLlm3')
  .addEdge('callLlm1', 'combineLlm')
  .addEdge('callLlm2', 'combineLlm')
  .addEdge('callLlm3', 'combineLlm')
  .addEdge('combineLlm', '__end__')
  .compile()



const invoke = async () => {
  const res = await agent.invoke({
    topic: '前端开发',
  })
  console.log('invoke', res)
  return res
}

invoke();