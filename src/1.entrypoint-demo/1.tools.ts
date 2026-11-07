//工具都需要有一个标准的协议
import { tool } from 'langchain'
import * as z from 'zod'

// 加法工具，
export const add = tool(({ a, b }) => a + b, {
  name: 'add',
  description: '两数相加',
  // 定义schema参数的类型,每个语言有不同的实现，
  // typescript：zod，python：pydantic，java：lombok
  schema: z.object({
    a: z.number().describe('第一个加数'),
    b: z.number().describe('第二个加数'),
  })
})

// 减法工具
export const subtract = tool(({ a, b }) => a - b, {
  name: 'subtract',
  description: '两数相减，a 减 b',
  schema: z.object({
    a: z.number().describe('被减数'),
    b: z.number().describe('减数'),
  })
})

// 乘法工具
export const multiply = tool(({ a, b }) => a * b, {
  name: 'multiply',
  description: '两数相乘',
  schema: z.object({
    a: z.number().describe('第一个因数'),
    b: z.number().describe('第二个因数'),
  })
})

// 除法工具
export const divide = tool(({ a, b }) => a / b, {
  name: 'divide',
  description: '两数相除，a 除以 b',
  schema: z.object({
    a: z.number().describe('被除数'),
    b: z.number().describe('除数，不能为 0'),
  })
})

// 所有计算工具，方便统一注册给模型
export const toolsByName = {
  [add.name]: add,
  [subtract.name]: subtract,
  [multiply.name]: multiply,
  [divide.name]: divide
}

export const tools = Object.values(toolsByName)
