# Markdown Studio

Markdown Studio 是一个独立的、paste-first 的静态网页：把 Markdown 源文本粘贴进去，即可阅读 Markdown、代码、KaTeX 与 Mermaid，并可导出无脚本的静态 HTML。

它不依赖旧 Browser/Preview 服务，不读取服务器文件，也没有数据 API。文档只保存在当前浏览器的 `localStorage`。

## 本地运行

在仓库根目录执行：

```bash
npm install --prefix studio
npm run build-studio
npm run studio -- --no-open
```

默认地址使用固定 origin `http://127.0.0.1:17329`，实际入口带每次启动生成的随机路径令牌。指定端口：

```bash
npm run studio -- --port 17330
```

服务只监听 `127.0.0.1`；端口被占用时直接失败，不会悄悄改用随机端口。这样浏览器存储 origin 稳定，且不会意外暴露到局域网。

## 构建与部署

```bash
npm install --prefix studio
npm run build-studio
```

只发布 `studio/dist/`。它是完整静态产物，可部署到 Nginx、Caddy、Cloudflare Pages、Netlify、GitHub Pages 或对象存储。

**生产环境必须给 Studio 使用专用 origin，并部署在该 origin 的根目录。** 例如 `https://markdown.example.com/`。不要放在现有业务站点的 `/studio/` 子目录：`localStorage` 按 origin 而不是路径隔离，同源的其他应用或其 XSS 可以直接读取和修改 `mkdp-studio:*` 数据；CSP 和 iframe sandbox 无法提供路径级存储隔离。

不要把以下内容作为 Studio 的公网后端：

- `app/server.js`
- 旧 Browser/Preview 服务
- `/_local_image_`、`/_mkdp_export_proxy` 或 Socket.IO 路由
- 整个仓库目录

Studio 不需要这些能力。把旧动态服务暴露到内网或公网会重新引入本地文件读取、SSRF、远程内容反射和旧渲染器 XSS 风险。

产物使用相对资源路径，但这是构建兼容性，不代表子目录具有安全隔离。生产部署仍必须使用专用 origin 的根目录。平台应原样提供静态文件，不要把所有未知路径回退到 `index.html`。

## 推荐安全头

`public/_headers` 为支持该格式的平台提供默认配置。其他平台至少设置：

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`
- `Cross-Origin-Opener-Policy: same-origin`

顶层页面的 CSP 允许同源脚本、样式和 sandbox iframe，但禁止网络连接。`studio-preview.html` 使用更严格的 CSP，并由父页面以 `sandbox="allow-scripts"` 加载，不能添加 `allow-same-origin`。

公网部署若需要身份认证，应由静态托管平台或反向代理完成；不要为了登录功能给 Studio 增加应用服务器或文档上传 API。反向代理也必须把 Studio 放在专用 origin，而不是与业务应用共享 origin。

## 数据与限制

- 最多 50 份临时文档。
- 单份 Markdown 最多 1 MiB。
- 全部 Markdown 合计最多约 4 MiB。
- 每份文档使用独立 key；新粘贴不会覆盖当前文档。
- 清除站点数据或浏览器隐私数据会删除这些临时文档。
- 不使用 IndexedDB、数据库、账号系统、Service Worker 或云同步。

## 安全渲染边界

- Markdown 原始 HTML 关闭。
- 远程图片默认不加载；只允许内嵌 raster data image。
- KaTeX 使用 `trust:false` 与严格模式。
- Mermaid 使用 strict security、禁用 HTML labels、限制图数量、文本大小和边数量。
- Markdown HTML 与 Mermaid SVG 分别经过白名单净化。
- 预览只通过一次性 `MessageChannel` 与父页面通信。
- 导出快照在父页面再次净化，并带 `default-src 'none'` CSP；不包含脚本、事件属性、iframe、form、active embed、`foreignObject` 或远程资源。

## 验证

```bash
npm --prefix studio test
npm --prefix studio run build
npm --prefix studio run test:e2e
node test/studio-static-server.test.js
node test/cli-package.test.js
```
