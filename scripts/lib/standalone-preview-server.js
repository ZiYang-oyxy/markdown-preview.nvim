const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const socketIo = require('socket.io')

const REPO_ROOT = path.resolve(__dirname, '..', '..')
const APP_ROOT = path.join(REPO_ROOT, 'app')
const APP_OUT_ROOT = path.join(APP_ROOT, 'out')
const APP_STATIC_ROOT = path.join(APP_ROOT, '_static')
const MAX_REMOTE_ASSET_SIZE = 30 * 1024 * 1024
const MAX_REMOTE_REDIRECTS = 5

function safeJoin(root, targetPath) {
  const resolved = path.resolve(root, `.${targetPath}`)
  if (!resolved.startsWith(root)) {
    return ''
  }
  return resolved
}

function sendFile(res, filePath, statusCode) {
  res.statusCode = statusCode || 200
  fs.createReadStream(filePath).pipe(res)
}

function resolveImagePath(assetPath, context) {
  const decoded = decodeURIComponent(decodeURIComponent(assetPath.replace(/^\/_local_image_/, ''))).replace(/\\ /g, ' ')
  const searchRoots = []

  if (context.imagesPath) {
    searchRoots.push(context.imagesPath)
  }
  if (context.fileDir) {
    searchRoots.push(context.fileDir)
  }
  if (context.cwd) {
    searchRoots.push(context.cwd)
  }

  if (!decoded) {
    return ''
  }

  if (path.isAbsolute(decoded)) {
    if (fs.existsSync(decoded) && !fs.statSync(decoded).isDirectory()) {
      return decoded
    }

    for (let i = 0; i < searchRoots.length; i += 1) {
      let current = searchRoots[i]
      while (current && current !== path.dirname(current)) {
        const candidate = path.join(current, decoded)
        if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
          return candidate
        }
        current = path.dirname(current)
      }
    }

    return ''
  }

  for (let i = 0; i < searchRoots.length; i += 1) {
    const candidate = path.resolve(searchRoots[i], decoded)
    if (fs.existsSync(candidate) && !fs.statSync(candidate).isDirectory()) {
      return candidate
    }
  }

  return ''
}

function fetchRemoteAsset(target, redirects = 0) {
  return new Promise((resolve, reject) => {
    let targetUrl
    try {
      targetUrl = new URL(target)
    } catch (error) {
      reject(new Error('invalid url'))
      return
    }

    const requester = targetUrl.protocol === 'https:' ? https : http
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      reject(new Error('unsupported protocol'))
      return
    }

    const request = requester.get(targetUrl, (response) => {
      const { statusCode = 0, headers = {} } = response
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        response.resume()
        if (redirects >= MAX_REMOTE_REDIRECTS) {
          reject(new Error('too many redirects'))
          return
        }
        resolve(fetchRemoteAsset(new URL(headers.location, targetUrl).toString(), redirects + 1))
        return
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume()
        reject(new Error(`unexpected status code ${statusCode}`))
        return
      }

      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_REMOTE_ASSET_SIZE) {
          request.destroy(new Error('asset too large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: headers['content-type'] || 'application/octet-stream'
        })
      })
      response.on('error', reject)
    })

    request.setTimeout(15000, () => {
      request.destroy(new Error('request timeout'))
    })
    request.on('error', reject)
  })
}

async function handleRequest(req, res, context) {
  const requestUrl = new URL(req.url, 'http://127.0.0.1')
  const pathname = requestUrl.pathname

  if (/^\/page\/\d+$/.test(pathname)) {
    sendFile(res, path.join(APP_OUT_ROOT, 'index.html'))
    return
  }

  if (pathname.startsWith('/_next/')) {
    const filePath = safeJoin(APP_OUT_ROOT, pathname)
    if (filePath && fs.existsSync(filePath)) {
      sendFile(res, filePath)
      return
    }
  }

  if (pathname === '/_static/markdown.css' && context.markdownCss && fs.existsSync(context.markdownCss)) {
    sendFile(res, context.markdownCss)
    return
  }

  if (pathname === '/_static/highlight.css' && context.highlightCss && fs.existsSync(context.highlightCss)) {
    sendFile(res, context.highlightCss)
    return
  }

  if (pathname.startsWith('/_static/')) {
    const filePath = safeJoin(APP_STATIC_ROOT, pathname.replace('/_static', ''))
    if (filePath && fs.existsSync(filePath)) {
      sendFile(res, filePath)
      return
    }
  }

  if (pathname === '/_mkdp_export_proxy') {
    const remoteUrl = requestUrl.searchParams.get('url') || ''
    if (!remoteUrl) {
      res.statusCode = 400
      res.end('missing url')
      return
    }

    try {
      const { buffer, contentType } = await fetchRemoteAsset(remoteUrl)
      res.statusCode = 200
      res.setHeader('cache-control', 'no-store')
      res.setHeader('content-type', contentType)
      res.end(buffer)
    } catch (error) {
      res.statusCode = 502
      res.end('failed to fetch resource')
    }
    return
  }

  if (pathname.startsWith('/_local_image_')) {
    const imagePath = resolveImagePath(pathname, context)
    if (imagePath) {
      if (/\.svg$/i.test(imagePath)) {
        res.setHeader('content-type', 'image/svg+xml')
      }
      sendFile(res, imagePath)
      return
    }
  }

  sendFile(res, path.join(APP_OUT_ROOT, '404.html'), 404)
}

async function startStandalonePreviewServer(context) {
  const server = http.createServer((req, res) => {
    handleRequest(req, res, context).catch((error) => {
      res.statusCode = 500
      res.end(error.message || String(error))
    })
  })

  const io = socketIo(server)

  io.on('connection', (client) => {
    const payload = {
      options: context.previewOptions || {},
      isActive: true,
      winline: 1,
      winheight: 1,
      cursor: [0, 1, 1, 0],
      pageTitle: context.pageTitle || '「${name}」',
      theme: context.theme || 'light',
      name: context.name || 'markdown-preview',
      content: context.contentLines || []
    }

    client.emit('refresh_content', payload)
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen({ host: '127.0.0.1', port: 0 }, resolve)
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('failed to resolve standalone preview server address')
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      io.close()
      server.close((error) => {
        if (error && error.message !== 'Server is not running.') {
          reject(error)
          return
        }
        resolve()
      })
    })
  }
}

module.exports = {
  startStandalonePreviewServer
}
