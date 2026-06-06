
module.exports = {
  pageExtensions: [ 'jsx' ],
  exportPathMap: async function () {
    return {
      '/': { page: '/' },
      '/404.html': { page: '/404' }
    }
  },
  // dist/ 必须随仓库提交（nvim 用户 clone 即用，不会本地 build）。
  // Next 默认把 main / webpack runtime / commons chunk 命名成
  // `[name]-[contenthash].js`，内容一变文件名就变；用户端只要因为任何原因
  // 残留了旧 hash 文件成为 untracked，再 pull 就会触发
  // "The following untracked working tree files would be overwritten by checkout"
  // 而中止。固定文件名后每次都是同名覆盖，从根上消除这种撞车。
  webpack(config, { isServer }) {
    if (!isServer) {
      config.output.filename = function ({ chunk }) {
        return chunk.name.endsWith('.js') ? chunk.name : `${chunk.name}.js`
      }
      config.output.chunkFilename = 'static/chunks/[name].js'
    }
    return config
  }
}

