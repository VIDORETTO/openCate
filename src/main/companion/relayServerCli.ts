import { CompanionRelayServer } from './relayServer'

const host = process.env.CATE_RELAY_HOST ?? '127.0.0.1'
const port = Number(process.env.CATE_RELAY_PORT ?? 8787)
const corsOrigin = process.env.CATE_RELAY_CORS_ORIGIN ?? '*'

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('CATE_RELAY_PORT must be an integer between 0 and 65535')
}

const relay = new CompanionRelayServer({ host, port, corsOrigin })
const address = await relay.listen()
process.stdout.write(`openCate companion relay listening on ${address.host}:${address.port}\n`)

const stop = (): void => {
  void relay.close().finally(() => process.exit(0))
}
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
