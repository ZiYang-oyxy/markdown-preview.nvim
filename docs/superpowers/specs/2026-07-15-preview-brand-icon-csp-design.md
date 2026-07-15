# Markdown Preview 品牌图标 CSP 修复设计

## 问题

Markdown Preview 的 Header 通过同源 URL `./icon-192.png` 加载品牌图标，但顶层页面的部署 CSP 使用 `img-src data:`。浏览器因此阻止同源 PNG，线上页面无法显示已经打包的橙底白色 `M` 图标。

隔离渲染 iframe 的 `img-src data:` 是独立安全边界，不应随顶层页面放宽。

## 设计

- 顶层页面 CSP 改为 `img-src 'self' data:`，允许应用自身的图标和 favicon。
- `preview-frame.html` 保持 `img-src data:`，继续禁止 Markdown 内容请求同源或远程图片。
- 更新自动化断言，分别锁定顶层和 iframe 的 CSP，避免后续把两种策略误合并。
- 同步线上 Nginx 顶层响应头并重新加载配置；不修改 `/cch` 路由。

## 验证

1. 运行 Preview 单元测试与生产构建。
2. 检查线上顶层 CSP 包含 `img-src 'self' data:`。
3. 检查线上 iframe CSP 仍为 `img-src data:`。
4. 请求线上 `icon-192.png`，确认返回 `200` 和 `image/png`。
5. 检查 `/cch/api/actions/health` 仍返回健康状态。

## 回滚

代码可回退该提交；线上可恢复修改前的 Nginx 配置备份并 reload。
