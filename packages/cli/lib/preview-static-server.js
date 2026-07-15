const crypto = require('crypto')
const fs = require('fs')
const http = require('http')
const path = require('path')

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
}

const SHELL_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const PREVIEW_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "connect-src 'none'",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

function commonHeaders() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  }
}

function send(response, statusCode, body, headers = {}) {
  const content = Buffer.isBuffer(body) ? body : Buffer.from(body)
  response.writeHead(statusCode, {
    ...commonHeaders(),
    'Content-Length': content.byteLength,
    ...headers
  })
  response.end(content)
}

function safeRelativePath(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null
  let decoded
  try {
    decoded = decodeURIComponent(pathname.slice(prefix.length))
  } catch (_) {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null
  const segments = decoded.split('/')
  if (segments.some((segment) => segment === '..')) return null
  const normalized = path.posix.normalize(decoded || 'index.html').replace(/^\/+/, '')
  if (!normalized || normalized.startsWith('../')) return null
  return normalized.endsWith('/') ? `${normalized}index.html` : normalized
}

function startPreviewStaticServer(options = {}) {
  const assetRoot = fs.realpathSync(path.resolve(options.assetRoot || path.join(__dirname, '..', 'assets', 'preview')))
  const port = options.port === undefined ? 17329 : Number(options.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    return Promise.reject(new Error('port must be an integer between 0 and 65535'))
  }
  if (!fs.existsSync(path.join(assetRoot, 'index.html'))) {
    return Promise.reject(new Error(`Markdown Preview assets do not exist: ${assetRoot}`))
  }

  const token = crypto.randomBytes(16).toString('hex')
  const prefix = `/${token}/`
  const server = http.createServer((request, response) => {
    const address = server.address()
    const expectedHost = address && typeof address === 'object'
      ? `127.0.0.1:${address.port}`
      : ''
    if (String(request.headers.host || '').toLowerCase() !== expectedHost) {
      send(response, 421, 'Misdirected Request')
      return
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' })
      return
    }
    const requestUrl = new URL(request.url, 'http://127.0.0.1')
    const relative = safeRelativePath(requestUrl.pathname, prefix)
    if (!relative) {
      send(response, 404, 'Not Found')
      return
    }
    const filePath = path.resolve(assetRoot, relative)
    if (filePath !== assetRoot && !filePath.startsWith(`${assetRoot}${path.sep}`)) {
      send(response, 404, 'Not Found')
      return
    }

    fs.realpath(filePath, (realPathError, realPath) => {
      if (realPathError || (realPath !== assetRoot && !realPath.startsWith(`${assetRoot}${path.sep}`))) {
        send(response, 404, 'Not Found')
        return
      }
      fs.readFile(realPath, (readError, content) => {
        if (readError) {
          send(response, 404, 'Not Found')
          return
        }
        const extension = path.extname(realPath).toLowerCase()
        const headers = {
          'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=31536000, immutable',
          'Content-Type': MIME_TYPES[extension] || 'application/octet-stream'
        }
        if (extension === '.html') {
          headers['Content-Security-Policy'] = path.basename(realPath) === 'preview-frame.html'
            ? PREVIEW_CSP
            : SHELL_CSP
        }
        if (request.method === 'HEAD') {
          response.writeHead(200, { ...commonHeaders(), ...headers, 'Content-Length': content.byteLength })
          response.end()
          return
        }
        send(response, 200, content, headers)
      })
    })
  })

  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError)
      const address = server.address()
      const origin = `http://127.0.0.1:${address.port}`
      resolve({
        origin,
        token,
        url: `${origin}${prefix}`,
        close: () => new Promise((closeResolve, closeReject) => {
          server.close((error) => error ? closeReject(error) : closeResolve())
        })
      })
    })
  })
}

module.exports = {
  startPreviewStaticServer
}
