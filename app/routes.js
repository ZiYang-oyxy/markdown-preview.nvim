const fs = require("fs");
const http = require("http");
const https = require("https");
const path = require("path");
const logger = require("./lib/util/logger")("app/routes");
const { resolveRuntimeAssetLayout } = require("./runtime-asset-layout");

const routes = [];
const MAX_REMOTE_ASSET_SIZE = 30 * 1024 * 1024;
const MAX_REMOTE_REDIRECTS = 5;
const assetLayout = resolveRuntimeAssetLayout({
  appDir: __dirname,
});

const use = function (route) {
  routes.unshift((req, res, next) => () => route(req, res, next));
};

function safeJoin(root, targetPath) {
  const resolved = path.resolve(root, `.${targetPath}`);
  if (!resolved.startsWith(root)) {
    return "";
  }
  return resolved;
}

const fetchRemoteAsset = (target, redirects = 0) => {
  return new Promise((resolve, reject) => {
    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      reject(new Error("invalid url"));
      return;
    }

    const requester = targetUrl.protocol === "https:" ? https : http;
    if (targetUrl.protocol !== "https:" && targetUrl.protocol !== "http:") {
      reject(new Error("unsupported protocol"));
      return;
    }

    const request = requester.get(targetUrl, (response) => {
      const { statusCode = 0, headers = {} } = response;
      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        response.resume();
        if (redirects >= MAX_REMOTE_REDIRECTS) {
          reject(new Error("too many redirects"));
          return;
        }
        const nextUrl = new URL(headers.location, targetUrl).toString();
        resolve(fetchRemoteAsset(nextUrl, redirects + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`unexpected status code ${statusCode}`));
        return;
      }

      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_REMOTE_ASSET_SIZE) {
          request.destroy(new Error("asset too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: headers["content-type"] || "application/octet-stream",
        });
      });
      response.on("error", reject);
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error("request timeout"));
    });
    request.on("error", reject);
  });
};

// /page/:number
use((req, res, next) => {
  if (/\/page\/\d+/.test(req.asPath)) {
    return fs.createReadStream(assetLayout.indexHtml).pipe(res);
  }
  next();
});

// /_next/path
use((req, res, next) => {
  if (/\/_next/.test(req.asPath)) {
    const filePath = safeJoin(assetLayout.htmlRoot, req.asPath);
    if (filePath && fs.existsSync(filePath)) {
      return fs.createReadStream(filePath).pipe(res);
    }
  }
  next();
});

// /_mkdp_export_proxy?url=https://...
use(async (req, res, next) => {
  if (req.asPath !== "/_mkdp_export_proxy") {
    next();
    return;
  }

  let remoteUrl = "";
  try {
    const url = new URL(req.url, "http://localhost");
    remoteUrl = url.searchParams.get("url") || "";
  } catch (e) {
    remoteUrl = "";
  }

  if (!remoteUrl) {
    res.statusCode = 400;
    res.end("missing url");
    return;
  }

  try {
    const { buffer, contentType } = await fetchRemoteAsset(remoteUrl);
    res.statusCode = 200;
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-type", contentType);
    res.end(buffer);
  } catch (e) {
    logger.error("proxy fetch fail: ", remoteUrl, e.message || e);
    res.statusCode = 502;
    res.end("failed to fetch resource");
  }
});

// /_static/markdown.css
// /_static/highlight.css
use((req, res, next) => {
  try {
    if (req.mkcss && req.asPath === "/_static/markdown.css") {
      if (fs.existsSync(req.mkcss)) {
        return fs.createReadStream(req.mkcss).pipe(res);
      }
    } else if (req.hicss && req.asPath === "/_static/highlight.css") {
      if (fs.existsSync(req.hicss)) {
        return fs.createReadStream(req.hicss).pipe(res);
      }
    }
  } catch (e) {
    logger.error("load diy css fail: ", req.asPath, req.mkcss, req.hicss);
  }
  next();
});

// /_static/path
use((req, res, next) => {
  if (/\/_static/.test(req.asPath)) {
    const fpath = safeJoin(
      assetLayout.staticRoot,
      req.asPath.replace("/_static", "")
    );
    if (fs.existsSync(fpath)) {
      return fs.createReadStream(fpath).pipe(res);
    } else {
      logger.error("No such file:", req.asPath, req.mkcss, req.hicss);
    }
  }
  next();
});

// images
use(async (req, res, next) => {
  logger.info("image route: ", req.asPath);
  const reg = /^\/_local_image_/;
  if (reg.test(req.asPath) && req.asPath !== "") {
    const plugin = req.plugin;
    const buffers = await plugin.nvim.buffers;
    const buffer = buffers.find((b) => b.id === Number(req.bufnr));
    if (buffer) {
      let fileDir = "";
      if (req.custImgPath !== "") {
        fileDir = req.custImgPath;
      } else {
        fileDir = await plugin.nvim.call("expand", `#${req.bufnr}:p:h`);
      }

      logger.info("fileDir", fileDir);

      const mingw_home = process.env.MINGW_HOME;
      if (mingw_home) {
        if (!fileDir.includes(":")) {
          // fileDir is unix-like:      /Z/x/y/...., 'Z' means Z:
          // the win-like fileDir should be: Z:\x\y...
          const cygpath = "cygpath.exe";
          const cmd = cygpath + " -w" + " -a " + fileDir;
          logger.info("cmd", cmd);

          const { execSync } = require("node:child_process");
          const result = execSync(cmd);
          fileDir = result.toString("utf8").replace("\n", "");

          logger.info("New fileDir", fileDir);
        }
      }

      let imgPath = decodeURIComponent(
        decodeURIComponent(req.asPath.replace(reg, ""))
      );
      imgPath = imgPath.replace(/\\ /g, " ");
      if (imgPath[0] !== "/" && imgPath[0] !== "\\") {
        imgPath = path.join(fileDir, imgPath);
      } else if (!fs.existsSync(imgPath)) {
        let tmpDirPath = fileDir;
        while (tmpDirPath !== "/" && tmpDirPath !== "\\") {
          tmpDirPath = path.normalize(path.join(tmpDirPath, ".."));
          let tmpImgPath = path.join(tmpDirPath, imgPath);
          if (fs.existsSync(tmpImgPath)) {
            imgPath = tmpImgPath;
            break;
          }
        }
      }
      logger.info("imgPath", imgPath);

      if (fs.existsSync(imgPath) && !fs.statSync(imgPath).isDirectory()) {
        if (imgPath.endsWith("svg")) {
          res.setHeader("content-type", "image/svg+xml");
        }
        return fs.createReadStream(imgPath).pipe(res);
      }
      logger.error("image not exists: ", imgPath);
    }
  }
  next();
});

// 404
use((req, res) => {
  res.statusCode = 404;
  return fs.createReadStream(assetLayout.notFoundHtml).pipe(res);
});

module.exports = function (req, res, next) {
  return routes.reduce((next, route) => route(req, res, next), next)();
};
