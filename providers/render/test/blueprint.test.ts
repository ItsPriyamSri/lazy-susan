import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { areSecret, deploymentReport, expectedKeys, readBlueprint } from "../src/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "out") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sourceFiles(path, found);
    else if (name.endsWith(".ts")) found.push(path);
  }
  return found;
}

const sources = [
  ...sourceFiles(join(ROOT, "apps")),
  ...sourceFiles(join(ROOT, "providers")),
  ...sourceFiles(join(ROOT, "packages")),
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");

const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8");
const blueprint = readBlueprint(join(ROOT, "render.yaml"));

describe("the blueprint", () => {
  it("is a file in the repository", () => {
    expect(blueprint).not.toBeNull();
  });

  it("deploys one web service from the repository's own image", () => {
    const service = blueprint!.services.find((s) => s.type === "web");
    expect(service?.name).toBe("lazy-susan");
    expect(service?.runtime).toBe("docker");
    expect(existsSync(join(ROOT, "Dockerfile"))).toBe(true);
  });

  it("checks a route the server actually answers", () => {
    const path = blueprint!.services.find((s) => s.type === "web")?.healthCheckPath;
    expect(path).toBe("/api/health");
    expect(sources).toContain(`"${path}"`);
  });

  it("keeps the keys out of the repository", () => {
    expect(readFileSync(join(ROOT, "render.yaml"), "utf8")).not.toMatch(/api[_-]?key:\s*\S{8,}/i);
    expect(areSecret(blueprint!.services[0])).toBe(true);
  });

  it("declares every key the code reads, and no key the code ignores", () => {
    const declared = expectedKeys(blueprint!.services[0]);
    const read = new Set(
      [...sources.matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => m[1]!),
    );

    // Everything declared is read somewhere.
    for (const key of declared) expect(read.has(key), `${key} is declared but never read`).toBe(true);

    // The provider keys the code understands are all offered by the blueprint.
    const providerKeys = ["MONGODB_URI", "BROWSERBASE_API_KEY", "ELEVENLABS_API_KEY", "AUTH0_DOMAIN", "AUTH0_AUDIENCE"];
    for (const key of providerKeys) expect(declared).toContain(key);
  });
});

describe("the image", () => {
  it("exposes the port the server listens on by default", () => {
    expect(dockerfile).toMatch(/EXPOSE 4757/);
    expect(sources).toMatch(/process\.env\.PORT \?\? 4757/);
  });

  it("does not copy node_modules, builds or the git history into the image", () => {
    const ignored = readFileSync(join(ROOT, ".dockerignore"), "utf8");
    expect(ignored).toMatch(/^node_modules$/m);
    expect(ignored).toMatch(/^\*\*\/dist$/m);
    expect(ignored).toMatch(/^\.git$/m);
  });
});

describe("the report", () => {
  it("says nothing is set when nothing is set", () => {
    const report = deploymentReport(blueprint, {});
    expect(report.service).toBe("lazy-susan");
    expect(report.configured).toBe(false);
    expect(report.keys.every((k) => k.set === false)).toBe(true);
  });

  it("says which single key a deployment has", () => {
    const report = deploymentReport(blueprint, { ELEVENLABS_API_KEY: "k" });
    expect(report.configured).toBe(true);
    expect(report.keys.find((k) => k.key === "ELEVENLABS_API_KEY")?.set).toBe(true);
    expect(report.keys.find((k) => k.key === "MONGODB_URI")?.set).toBe(false);
  });

  it("treats a blank value as absent, because a dashboard sometimes saves one", () => {
    const report = deploymentReport(blueprint, { MONGODB_URI: "   " });
    expect(report.keys.find((k) => k.key === "MONGODB_URI")?.set).toBe(false);
  });

  it("says nothing at all when there is no blueprint, instead of inventing one", () => {
    expect(deploymentReport(null, {}).service).toBeNull();
  });
});
