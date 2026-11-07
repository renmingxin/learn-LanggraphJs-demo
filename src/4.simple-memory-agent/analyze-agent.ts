import 'dotenv/config'
import 'dev-log-monitor/auto';
import { ChatOpenAI } from '@langchain/openai'
import { Annotation, StateGraph } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, tool } from 'langchain';
import * as zod from 'zod'

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

// 单个站点的抓取结果
type PageResult = {
  name: string
  url: string
  ok: boolean
  chars: number
  content: string
}

const StateAnnotation = Annotation.Root({
  // 用户给的主题
  topic: Annotation<string>,
  // analyze 节点整理出的 5 个可借鉴站点
  sites: Annotation<{ name: string; url: string }[]>,
  // 并行抓取的结果
  pages: Annotation<PageResult[]>,
  // 最终汇总报告
  report: Annotation<string>,
})

// 爬虫工具：给一个 url，返回网页 HTML
const fetchTool = tool(async ({ url }) => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; LangGraphDemo/1.0)' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}, {
  name: 'fetch',
  description: '从给定的url获取内容, 并返回内容',
  schema: zod.object({
    url: zod.string().describe('要获取的url'),
  }),
})

// 去掉 script/style 和标签，只留正文文本
const cleanHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// 第一步：分析主题，给出 5 个国内可借鉴的网站
const analyzeNode = async (state: typeof StateAnnotation.State) => {
  const res = await llm.invoke([
    new SystemMessage(
      '你是产品调研分析师。请根据用户主题，给出 5 个国内可以借鉴的网站，' +
      '只输出 JSON 数组，每项形如 {"name":"网站名","url":"https://..."}，不要任何解释。' +
      'url 必须是能直接访问的首页地址。'
    ),
    new HumanMessage(`主题：${state.topic}`),
  ])

  // 模型可能把 JSON 包在 ```json 里，用正则取出第一个数组
  const raw = toText(res.content)
  const match = raw.match(/\[[\s\S]*\]/)
  let sites: { name: string; url: string }[] = []

  if (match) {
    try {
      const arr = JSON.parse(match[0])
      if (Array.isArray(arr)) {
        sites = arr
          .filter((item: any) => typeof item?.url === 'string' && /^https?:\/\//i.test(item.url))
          .map((item: any, i: number) => ({
            name: String(item.name ?? `站点${i + 1}`),
            url: String(item.url),
          }))
      }
    } catch {
      // JSON 解析失败就走下面的兜底
    }
  }

  if (!sites.length) {
    throw new Error(`analyzeNode 未能解析出站点，模型原始输出：${raw}`)
  }

  const picked = sites.slice(0, 5)
  console.log('[analyze] 得到站点：', picked.map((s) => `${s.name}(${s.url})`).join(' | '))
  return { sites: picked }
}

// 第二步：抓取单个站点，最多重试 3 次（这就是"不断搜索"的循环）
const fetchOne = async (site: { name: string; url: string }): Promise<PageResult> => {
  const MAX_ATTEMPTS = 3
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const html = await fetchTool.invoke({ url: site.url })
      const content = cleanHtml(String(html)).slice(0, 1500)
      if (content.length < 100) {
        throw new Error(`内容过短(${content.length} 字符)`)
      }
      console.log(`[fetch] ${site.name} 第 ${attempt} 次成功，${content.length} 字符`)
      return { name: site.name, url: site.url, ok: true, chars: content.length, content }
    } catch (err) {
      console.log(`[fetch] ${site.name} 第 ${attempt}/${MAX_ATTEMPTS} 次失败：${String(err)}`)
      if (attempt === MAX_ATTEMPTS) {
        return { name: site.name, url: site.url, ok: false, chars: 0, content: '' }
      }
      await sleep(500 * attempt)
    }
  }
  // 理论上不会走到这里
  return { name: site.name, url: site.url, ok: false, chars: 0, content: '' }
}

// 第三步：5 个站点并行抓取
const fetchNode = async (state: typeof StateAnnotation.State) => {
  const pages = await Promise.all(state.sites.map((site) => fetchOne(site)))
  console.log(`[fetch] 并行完成，成功 ${pages.filter((p) => p.ok).length}/${pages.length}`)
  return { pages }
}

// 第四步：把抓到的内容汇总成一份报告
const modelNode = async (state: typeof StateAnnotation.State) => {
  const usable = state.pages.filter((p) => p.ok && p.content)
  if (!usable.length) {
    const report = '所有站点均抓取失败，无法生成汇总报告。'
    console.log('[model]', report)
    return { report }
  }

  const corpus = usable
    .map((p, i) => `【${i + 1}】${p.name} ${p.url}\n${p.content}`)
    .join('\n\n')

  const res = await llm.invoke([
    new SystemMessage(
      '你是产品调研分析师。请基于提供的网页内容，输出一份结构化报告：' +
      '先一句话总结主题的可借鉴方向，再逐个列出这 5 个站点的可借鉴点，最后给出 3 条落地建议。' +
      '不要编造网页里没有的信息。'
    ),
    new HumanMessage(`主题：${state.topic}\n\n网页内容：\n${corpus}`),
  ])

  const report = toText(res.content)
  console.log('[model] 汇总完成')
  return { report }
}

// 状态图：分析 → 并行抓取 → 汇总
const agent = new StateGraph(StateAnnotation)
  .addNode('analyzeNode', analyzeNode)
  .addNode('fetchNode', fetchNode)
  .addNode('modelNode', modelNode)
  .addEdge('__start__', 'analyzeNode')
  .addEdge('analyzeNode', 'fetchNode')
  .addEdge('fetchNode', 'modelNode')
  .addEdge('modelNode', '__end__')
  .compile()

const invoke = async () => {
  const res = await agent.invoke({
    topic: 'AI 笔记应用的功能设计',
  })
  console.log('\n=== 最终报告 ===\n' + res.report)
  return res
}

invoke();
