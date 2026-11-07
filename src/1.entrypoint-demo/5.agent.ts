import { addMessages, entrypoint } from '@langchain/langgraph';
import { callLLM } from './3.modal-node.js'
import { BaseMessage, ToolCall } from 'langchain';
import { callTool } from './4.tool-node.js';


// entrypoint 是一个函数，用于定义一个入口点，用于触发模型的调用，
// 它返回一个 Promise，用于等待模型的回复，
// 当模型回复完成后，会将模型的回复作为 Promise 的结果返回
export const agent = entrypoint({
  name: 'match-agent',
}, async (messages: BaseMessage[]) => {
  let modalResponse = await callLLM(messages)
  let iteration = 0
  while (true) {
    iteration++
    // 每轮打印一次，用于确认"调模型 → 调工具 → 回传结果 → 再调模型"的闭环是否真的跑通
    console.log(
      `[agent] 第 ${iteration} 轮: tool_calls=${modalResponse?.tool_calls?.length ?? 0}, finish_reason=${modalResponse?.response_metadata?.finish_reason}`
    )
    // 模型调用工具，需要递归调用模型, 直到模型不调用工具
    if (!modalResponse?.tool_calls?.length) {
      break
    }
    // 调用工具, 并获取工具的回复
    const toolResults = await Promise.all(modalResponse.tool_calls.map((toolCall: any) => callTool(toolCall)))
    // 过滤掉 undefined 值, 只保留工具的回复
    const validToolResults = toolResults.filter((result: any) => result !== undefined)
    // 合并模型回复和工具回复
    messages = addMessages(messages, [modalResponse, ...validToolResults])
    // 调用模型, 并获取模型的回复
    modalResponse = await callLLM(messages)
    console.log('modalResponse', modalResponse)

  }
  return modalResponse
})