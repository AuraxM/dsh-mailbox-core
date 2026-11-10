import { existsSync, readFileSync, statSync } from "node:fs";

const manifest = JSON.parse(readFileSync("package.json", "utf8"));
const required = [
  "index.js", "client.js", "cordis.patch.yml", "locale/en.json", "locale/zh.json",
  "icon.svg", "README.md", "lib/settings-api.js", "lib/source-settings.js", "lib/filter-runtime.js", "lib/retention.js",
  "scripts/validate.mjs",
];
for (const file of required) {
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`missing required file: ${file}`);
}
for (const locale of ["locale/en.json", "locale/zh.json"]) {
  const value = JSON.parse(readFileSync(locale, "utf8"));
  if (!value.meta?.title || !value.meta?.description) throw new Error(`missing display metadata: ${locale}`);
}
const svg = readFileSync("icon.svg", "utf8");
if (!svg.includes("<svg") || !svg.includes("</svg>") || Buffer.byteLength(svg) > 256 * 1024) {
  throw new Error("invalid SVG envelope or size");
}
if (/(?:href|src)\s*=\s*["'](?:https?:)?\/\//i.test(svg)) throw new Error("SVG contains an external resource");
if (manifest.name !== "@local/dsh-agent-mailbox" || manifest.dsh?.bundle?.patch !== "./cordis.patch.yml") {
  throw new Error("invalid bundle identity or patch export");
}
if (manifest.dsh?.client?.platform !== "web") throw new Error("client bundle is not declared for the web");
if (!manifest.exports || manifest.exports["./client"] !== "./client.js") throw new Error("client export is missing");
if (manifest.exports["./icon"] !== "./icon.svg" || manifest.exports["./locale/*.json"] !== "./locale/*.json") {
  throw new Error("display resources are not exported");
}
if (manifest.dependencies || manifest.optionalDependencies) throw new Error("unexpected runtime dependency");
const patch = readFileSync("cordis.patch.yml", "utf8");
if (!patch.includes("id: agent-mailbox") || !patch.includes("@local/dsh-agent-mailbox")) {
  throw new Error("patch is missing row id or package name");
}
const client = readFileSync("client.js", "utf8");
if (!client.includes("settings.section") || !client.includes("agent-mailbox")) {
  throw new Error("client is missing the Settings section registration");
}
if (/(?:src|href)\s*=\s*["']https?:\/\//i.test(client)) throw new Error("client references an external resource");
console.log("Manifest, patch, client, locales, original SVG, required files and zero-dependency checks passed");
