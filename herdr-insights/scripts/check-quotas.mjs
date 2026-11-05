import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { normalizeClaude, normalizeCodex, presentQuota, quotaWindow, queryCodex, configureClaude, quotaSnapshot, STALE_MS } from "../mods/insights/quotas.mjs";

const now = 1800000000000;
const reset = now / 1000 + 3600;
const codex = normalizeCodex({ rateLimits: { primary: { usedPercent: 25, resetsAt: reset, windowDurationMins: 300 },
  secondary: { usedPercent: 0, resetsAt: reset, windowDurationMins: 10080 } } }, now);
assert.equal(codex.windows.length, 2);
assert.equal(codex.windows[0].remainingPercent, 75);
assert.equal(codex.windows[1].usedPercent, 0);
assert.equal(presentQuota(codex, true, now).status, "Current");
assert.equal(presentQuota(codex, true, now + STALE_MS + 1).status, "Stale");
assert.equal(presentQuota({ ...codex, error: "Offline" }, true, now).status, "Stale");
assert.equal(presentQuota(codex, false, now).status, "Disabled");
assert.equal(presentQuota(null, true, now).status, "Unavailable");
assert.equal(normalizeCodex({ rateLimits: {} }, now).windows.length, 0);
assert.equal(normalizeCodex({ rateLimitsByLimitId: { model: { primary: { usedPercent: 12 } } } }, now).windows.length, 1);
for (const invalid of [null, "20", -1, 101, NaN, Infinity]) assert.equal(quotaWindow("test", invalid, reset, now), null);
const expired = normalizeClaude({ rate_limits: { five_hour: { used_percentage: 100, resets_at: now / 1000 - 1 } } }, now);
assert.equal(presentQuota(expired, true, now).status, "Stale");
assert.equal(expired.windows[0].remainingPercent, 0);
assert.equal(normalizeClaude({}, now).windows.length, 0);

// A fake app-server verifies the handshake, fragmented JSON, RPC errors, and bounded cleanup.
function server(error = false, silent = false) {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => { queueMicrotask(() => child.emit("close", 0)); return true; };
  const methods = [];
  child.stdin.on("data", (raw) => {
    const message = JSON.parse(raw.toString()); methods.push(message.method);
    if (!message.id || silent) return;
    const reply = JSON.stringify(message.id === 1 ? { id: 1, result: {} }
      : error ? { id: 2, error: { code: -32000, message: "SECRET must not leak" } }
        : { id: 2, result: { rateLimits: { primary: { usedPercent: 25 } } } });
    queueMicrotask(() => { child.stdout.write(reply.slice(0, 7)); child.stdout.write(reply.slice(7) + "\n"); });
  });
  return { child, methods };
}
const fake = server();
assert.equal((await queryCodex("fake", { spawnProcess: () => fake.child })).rateLimits.primary.usedPercent, 25);
assert.deepEqual(fake.methods, ["initialize", "initialized", "account/rateLimits/read"]);
await assert.rejects(queryCodex("fake", { spawnProcess: () => server(true).child }), (error) => !error.message.includes("SECRET"));
await assert.rejects(queryCodex("fake", { timeoutMs: 10, spawnProcess: () => server(false, true).child }), /timed out/);

const dir = await fs.mkdtemp(path.join(os.tmpdir(), "insights-quota-test-"));
try {
  const store = path.join(dir, "store");
  const settingsFile = path.join(dir, "settings.json");
  const original = { unrelated: true, statusLine: { type: "command", command: "printf 'existing status line'", padding: 2 } };
  await fs.writeFile(settingsFile, JSON.stringify(original));
  assert.equal((await quotaSnapshot(store)).codex.status, "Disabled");
  await configureClaude(store, true, settingsFile);
  const settings = JSON.parse(await fs.readFile(settingsFile));
  assert.equal(settings.unrelated, true);
  assert.equal(settings.statusLine.padding, 2);
  assert.ok(settings.statusLine.command.includes("claude-statusline"));
  const helper = fileURLToPath(new URL("../mods/insights/quotas.mjs", import.meta.url));
  const payload = { prompt: "SECRET PROMPT", rate_limits: { five_hour: { used_percentage: 42, resets_at: reset }, seven_day: { used_percentage: 17, resets_at: reset } } };
  const child = execFile(process.execPath, [helper, "claude-statusline", "--store", store]);
  child.stdin.end(JSON.stringify(payload));
  const output = await new Promise((resolve, reject) => {
    let stdout = "";
    child.stdout.on("data", (data) => { stdout += data; });
    child.on("error", reject);
    child.on("close", (code) => code === 0 ? resolve(stdout) : reject(new Error(`hook exit ${code}`)));
  });
  assert.equal(output, "existing status line");
  const cache = await fs.readFile(path.join(store, "quota-claude.json"), "utf8");
  assert.ok(!cache.includes("SECRET"));
  assert.equal(JSON.parse(cache).windows[0].remainingPercent, 58);
  assert.equal((await fs.stat(path.join(store, "quota-claude.json"))).mode & 0o777, 0o600);
  assert.equal((await quotaSnapshot(store)).claude.enabled, true);
  await configureClaude(store, false, settingsFile);
  assert.deepEqual(JSON.parse(await fs.readFile(settingsFile)), original);
  assert.equal((await quotaSnapshot(store)).claude.status, "Disabled");
  assert.ok((await fs.readdir(dir)).some((name) => name.endsWith(".bak")));
  await configureClaude(store, true, settingsFile);
  await fs.writeFile(settingsFile, JSON.stringify({ statusLine: { type: "command", command: "user-changed" } }));
  await assert.rejects(configureClaude(store, false, settingsFile), /changed since connection/);
  assert.equal(JSON.parse(await fs.readFile(settingsFile)).statusLine.command, "user-changed");
  const savedConfig = JSON.parse(await fs.readFile(path.join(store, "quota-settings.json")));
  await fs.writeFile(settingsFile, JSON.stringify({ statusLine: { type: "command", command: savedConfig.claude.hook } }));
  await configureClaude(store, false, settingsFile);
  await fs.writeFile(settingsFile, JSON.stringify({ unrelated: true }));
  await configureClaude(store, true, settingsFile);
  await configureClaude(store, false, settingsFile);
  assert.deepEqual(JSON.parse(await fs.readFile(settingsFile)), { unrelated: true });
  const linked = path.join(dir, "linked.json");
  await fs.symlink(settingsFile, linked);
  await assert.rejects(configureClaude(store, true, linked), /linked/);
  await fs.writeFile(settingsFile, "not valid JSON");
  await assert.rejects(configureClaude(store, true, settingsFile), /Invalid Claude settings/);
  assert.equal(await fs.readFile(settingsFile, "utf8"), "not valid JSON");
  const result = await promisify(execFile)(process.execPath, [helper, "read", "--store", store]);
  assert.equal(JSON.parse(result.stdout).codex.status, "Disabled");
} finally { await fs.rm(dir, { recursive: true, force: true }); }
console.log("Quota checks passed: normalization, stale/unavailable states, Codex RPC, timeout, private capture, and reversible Claude setup.");
