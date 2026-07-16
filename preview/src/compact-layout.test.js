import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("compact wider preview layout", () => {
  it("widens the toolbar and preview card to 1200px", () => {
    const styles = readSource("./styles.css");

    expect(styles).toMatch(
      /\.document-toolbar\s*\{[\s\S]*?width:\s*min\(100%,\s*1200px\)/,
    );
    expect(styles).toMatch(
      /\.preview-container\s*\{[\s\S]*?width:\s*min\(100%,\s*1200px\)/,
    );
  });

  it("uses the compact desktop reading scale and preserves mobile body size", () => {
    const styles = readSource("./preview/preview.css");

    expect(styles).toMatch(
      /#preview-root\s*\{[\s\S]*?width:\s*min\(100%,\s*1040px\)[\s\S]*?font-size:\s*16px;[\s\S]*?line-height:\s*1\.6;/,
    );
    expect(styles).toMatch(/h1\s*\{[\s\S]*?font-size:\s*clamp\(32px,\s*5vw,\s*44px\)/);
    expect(styles).toMatch(/h2\s*\{[\s\S]*?font-size:\s*25px/);
    expect(styles).toMatch(/h3\s*\{[\s\S]*?font-size:\s*20px/);
    expect(styles).toMatch(
      /\.diagram-error\s*\{[\s\S]*?margin:\s*0\.9em 0;/,
    );
    expect(styles).toMatch(
      /@media \(max-width:\s*640px\)[\s\S]*?#preview-root\s*\{[\s\S]*?font-size:\s*16px/,
    );
  });

  it("keeps exported HTML aligned with the preview typography", () => {
    const source = readSource("./export.js");

    expect(source).toContain("article{width:min(100%,1040px)");
    expect(source).toContain("font-size:16px;line-height:1.6");
    expect(source).toContain("h1{margin-top:0;font-size:clamp(32px,5vw,44px)");
    expect(source).toContain("h2{margin-top:1.8em;padding-top:.3em");
    expect(source).toContain("font-size:25px");
    expect(source).toContain("h3{font-size:20px}");
    expect(source).toContain("margin:.9em 0");
  });
});
