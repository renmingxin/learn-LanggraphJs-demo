//大预言模型，llm deepseek-4.1-flash
//图片模型，image-2
//语音模型，asr whisper-1
//视频模型，seedance
import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { tools } from './1.tools.js'

const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
const API_KEY = process.env.LLM_API_KEY || 'sk-12e809b239ec45e49596c0d08c8350eb'


const llm = new ChatOpenAI({
    model: MODEL,
    apiKey: API_KEY,
    timeout: 30000, // 30秒超时，防止卡住
    configuration: {
        baseURL: BASE_URL,
    }
})


// 绑定工具到模型
// 模型会根据工具的定义，自动调用工具
// 工具的定义，需要在 tools.ts 中定义
// 工具的调用，需要在 modal-node.ts 中定义
// 注意:不要设置 tool_choice: "any"，它会强制模型每轮都必须调用工具，
// 导致 5.agent.ts 的循环永远等不到"不调用工具"的文本回复而死循环。
// 默认 auto 让模型自己决定是否调用工具。
const modalWithTools = llm.bindTools(tools)

export { modalWithTools }
