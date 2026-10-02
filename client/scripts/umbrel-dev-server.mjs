import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'

const port = Number(process.env.PORT || 5001)
const host = process.env.HOST || '127.0.0.1'
const targetUrl = (value, fallbackProtocol) =>
  new URL(value.includes('://') ? value : `${fallbackProtocol}://${value}`)
const wsTarget = targetUrl(process.env.BITFEED_WS_TARGET || 'wss://bits.monospace.live', 'ws')
const apiTarget = targetUrl(process.env.BITFEED_API_TARGET || 'https://bits.monospace.live', 'https')
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/build')

const types = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml',
}

function sendFile(res, file) {
  res.writeHead(200, {
    'content-type': types[path.extname(file)] || 'application/octet-stream',
    'cache-control': 'no-store',
  })
  fs.createReadStream(file).pipe(res)
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname)
  const candidate = path.resolve(root, `.${pathname}`)
  const file = candidate.startsWith(root) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(root, 'index.html')
  sendFile(res, file)
}

function proxyApi(req, res) {
  const upstreamUrl = new URL(req.url, apiTarget)
  const client = upstreamUrl.protocol === 'https:' ? https : http
  const upstream = client.request(upstreamUrl, {
    method: req.method,
    headers: { ...req.headers, host: upstreamUrl.host },
  }, upstreamRes => {
    const headers = { ...upstreamRes.headers }
    delete headers.connection
    delete headers['transfer-encoding']
    res.writeHead(upstreamRes.statusCode || 502, headers)
    upstreamRes.pipe(res)
  })
  upstream.on('error', error => {
    res.writeHead(502, { 'content-type': 'text/plain' })
    res.end(error.message)
  })
  req.pipe(upstream)
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) proxyApi(req, res)
  else serveStatic(req, res)
})

server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/ws/')) return socket.destroy()
  const upstreamPort = Number(wsTarget.port || (wsTarget.protocol === 'wss:' ? 443 : 80))
  const writeUpgrade = () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`)
    for (const [name, value] of Object.entries({ ...req.headers, host: wsTarget.host })) {
      upstream.write(`${name}: ${value}\r\n`)
    }
    upstream.write('\r\n')
    if (head.length) upstream.write(head)
    socket.pipe(upstream).pipe(socket)
  }
  const upstream = wsTarget.protocol === 'wss:'
    ? tls.connect({ host: wsTarget.hostname, port: upstreamPort, servername: wsTarget.hostname }, writeUpgrade)
    : net.connect({ host: wsTarget.hostname, port: upstreamPort }, writeUpgrade)
  upstream.on('error', () => socket.destroy())
})

server.listen(port, host, () => {
  console.log(`Bitfeed dev server: http://${host}:${port}`)
  console.log(`  /ws  -> ${wsTarget.origin}`)
  console.log(`  /api -> ${apiTarget.origin}`)
})
