import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createApp, lanAddresses } from './server_app.js'
import { aiMode } from './server_ai.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 3001)
const dataFile = process.env.DATA_FILE ? path.resolve(process.env.DATA_FILE) : path.join(root, 'data', 'db.json')

const app = createApp({ dataFile })
app.listen(PORT, '0.0.0.0', () => {
  console.log(`共识终端机 API → http://localhost:${PORT}  （数据：${path.relative(root, dataFile)}，AI：${aiMode()}）`)
  const lan = lanAddresses()
  if (lan.length) console.log(`局域网地址：${lan.map((ip) => `http://${ip}:${PORT}`).join('  ')}`)
})
