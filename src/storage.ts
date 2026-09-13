import { resolve } from 'node:path'
export const dataRoot = () => resolve(process.env.DATA_DIR || './data')
