import { task } from '@langchain/langgraph'
import { toolsByName } from './1.tools.js'
import { ToolCall } from 'langchain'

// 调用工具，返回工具的回复, 包含工具的参数和结果, 以及工具的回复内容
export const callTool = task({ name: 'callTool' }, async (toolCall: ToolCall) => {
  console.log('toolCall', toolCall)
  const tool = toolsByName?.[toolCall.name as keyof typeof toolsByName]
  return tool.invoke(toolCall)
})