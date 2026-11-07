import 'dotenv/config'
import 'dev-log-monitor/auto';


const BASE_URL = process.env.LLM_BASE_URL
const MODEL: string = process.env.LLM_MODEL || 'deepseek-flash'
const EMBEDDING_MODEL: string = process.env.EMBEDDING_MODEL || 'doubao-embedding-vision'
const API_KEY = process.env.LLM_API_KEY || 'sk-12e809b239ec45e49596c0d08c8350eb'


console.log(BASE_URL)