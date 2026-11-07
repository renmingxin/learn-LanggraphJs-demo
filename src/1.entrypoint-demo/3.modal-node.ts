import { task } from '@langchain/langgraph'
import { modalWithTools } from './2.modal.js'
import { BaseMessage, SystemMessage } from 'langchain'

// 调用模型，返回模型的回复，包含工具调用的结果，以及模型的回复内容
export const callLLM = task({ name: 'callLLM' }, async (message: BaseMessage[]) => {
  return modalWithTools.invoke([
    new SystemMessage('你是一个专业的计算助手，只能回答计算相关的问题'),
    ...message
  ])
})
