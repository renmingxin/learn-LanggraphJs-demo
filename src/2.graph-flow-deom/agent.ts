import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, StateGraph } from '@langchain/langgraph';
import { HumanMessage } from 'langchain';


const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
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

const StateAnnotation = Annotation.Root({
  //input:Annotation<string>
  //写个笑话
  //笑话的主题
  topic: Annotation<string>,
  //笑话
  joke: Annotation<string>,
  //改进后的笑话
  improvedJoke: Annotation<string>,
  //最终的笑话输出
  finalJoke: Annotation<string>,
})

// 先调用模型输出第一版笑话
const generateJoke = async (state: typeof StateAnnotation.State) => {
  const joke = await llm.invoke([
    new HumanMessage(`写个关于${state.topic}的笑话`)
  ])
  return { joke: joke.content }
}

//判断笑话好不好笑
const checkJoke = async (state: typeof StateAnnotation.State) => {
  //返回 "PASS" 或 "FAIL"
  // return "FAIL"
  return "PASS"
}

// 改进增强笑点
const improveJoke = async (state: typeof StateAnnotation.State) => {
  const joke = await llm.invoke([
    new HumanMessage(`使这个笑话更有趣：${state.joke}`)
  ])
  return { improvedJoke: joke.content }
}

//通过模型完善笑话
const finalJoke = async (state: typeof StateAnnotation.State) => {
  const joke = await llm.invoke([
    new HumanMessage(`完善笑话，添加一个历史典故到笑话中间: ${state.improvedJoke}`)
  ])
  return { finalJoke: joke.content }
}

// 定义状态图, 并添加节点
// 节点的名称必须是唯一的, 不能重复
const agent = new StateGraph(StateAnnotation)
  // 添加节点
  .addNode('generateJoke', generateJoke)
  // 添加节点
  .addNode('improveJoke', improveJoke)
  // 添加节点 
  .addNode('polishJoke', finalJoke)
  // 添加边
  // 从 __start__ 节点到 generateJoke 节点
  .addEdge('__start__', 'generateJoke')
  //添加条件边，从 generateJoke 节点到 __end__ 节点，
  // 如果 checkJoke 函数返回 "PASS"，则从 generateJoke 节点到 __end__ 节点，
  // 如果 checkJoke 函数返回 "FAIL"，则从 generateJoke 节点到 improveJoke 节点
  .addConditionalEdges('generateJoke', checkJoke, {
    PASS: "__end__",
    FAIL: 'improveJoke',
  })
  //添加边，从 improveJoke 节点到 polishJoke 节点
  .addEdge("improveJoke", 'polishJoke')
  //添加边，从 polishJoke 节点到 __end__ 节点
  .addEdge("polishJoke", '__end__')
  .compile()



// 调用模型
const invoke = async () => {
  const res = await agent.invoke({
    topic: '前端开发',
  })
  console.log('invoke', res)
  return res
}

invoke();