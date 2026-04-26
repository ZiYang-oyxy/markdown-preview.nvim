const opener = require("../opener");

const COMMON_OPTION_HELP = [
  "  --config <path>              JSON config file",
  "  --theme <light|dark>         Theme mode",
  "  --page-title <template>      Page title template",
  "  --markdown-css <path>        Override markdown.css",
  "  --highlight-css <path>       Override highlight.css",
  "  --images-path <path>         Base path for local images",
];

function printUsage() {
  process.stderr.write(
    [
      "Usage: mkdp browse [dir] [options]",
      "",
      "Options:",
      ...COMMON_OPTION_HELP,
      "  --browser <name>            Browser application or command",
      "  -h, --help                  Show this help",
    ].join("\n") + "\n"
  );
}

function parseArgs(argv) {
  const args = argv;
  const parsed = {
    root: ".",
    config: "",
    theme: "",
    pageTitle: "",
    markdownCss: "",
    highlightCss: "",
    imagesPath: "",
    browser: "",
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }
    if (arg === "--config") {
      parsed.config = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--theme") {
      parsed.theme = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--page-title") {
      parsed.pageTitle = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--markdown-css") {
      parsed.markdownCss = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--highlight-css") {
      parsed.highlightCss = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--images-path") {
      parsed.imagesPath = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--browser") {
      parsed.browser = args[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    }

    parsed.root = arg;
  }

  return parsed;
}

function openUrl(url, browser) {
  return new Promise((resolve, reject) => {
    const child = opener(url, browser || undefined);
    let settled = false;

    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      fn(value);
    };

    child.once("error", (error) => finish(reject, error));
    child.once("spawn", () => finish(resolve));

    setTimeout(() => finish(resolve), 400);
  });
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const signals = ["SIGINT", "SIGTERM"];
    const onSignal = () => {
      signals.forEach((signal) => process.off(signal, onSignal));
      resolve();
    };

    signals.forEach((signal) => process.on(signal, onSignal));
  });
}

async function main() {
  const cliArgs = parseArgs(process.argv.slice(2));
  return runParsed(cliArgs);
}

async function run(argv) {
  const cliArgs = parseArgs(argv);
  return runParsed(cliArgs);
}

async function runParsed(cliArgs) {
  if (cliArgs.help) {
    printUsage();
    return;
  }

  const { createStandaloneBrowseSession } = require("../runtime");
  const session = await createStandaloneBrowseSession(cliArgs, {
    defaultRoot: ".",
  });
  const url = `${session.origin}/_mkdp/browse`;

  process.stdout.write(`${url}\n`);

  try {
    try {
      await openUrl(url, cliArgs.browser);
    } catch (error) {
      process.stderr.write(
        `failed to open browser automatically: ${error.message || String(error)}\n`
      );
      process.stderr.write(`open the URL manually: ${url}\n`);
    }

    process.stderr.write("browse server is running, press Ctrl+C to stop\n");
    await waitForShutdown();
  } finally {
    await session.close();
  }
}

module.exports = {
  parseArgs,
  run,
};

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}
