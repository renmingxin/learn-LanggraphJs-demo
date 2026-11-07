import 'dotenv/config'
import 'dev-log-monitor/auto';

import { agent } from './5.agent.js'
import { BaseMessage, HumanMessage } from 'langchain';

const invoke = async () => {
  const res = await agent.invoke([
    new HumanMessage("计算200+100-80*100/20")
  ])
  console.log('invoke', res)
  return res
}

invoke();