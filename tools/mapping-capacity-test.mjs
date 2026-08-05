#!/usr/bin/env node
import fs from 'node:fs';

const target = process.env.MAP_CAPACITY_TARGET?.trim();
const bearer = process.env.MAP_CAPACITY_BEARER?.trim();
const capability = process.env.MAP_CAPACITY_CAPABILITY?.trim();
const requests = Number(process.env.MAP_CAPACITY_REQUESTS ?? 120);
const concurrency = Number(process.env.MAP_CAPACITY_CONCURRENCY ?? 12);
const p95BudgetMs = Number(process.env.MAP_CAPACITY_P95_BUDGET_MS ?? 1_000);
const errorBudget = Number(process.env.MAP_CAPACITY_ERROR_BUDGET ?? 0.01);
const output = process.env.MAP_CAPACITY_OUTPUT?.trim() || 'artifacts/mapping-capacity-result.json';

if (!target || !/^https:\/\//.test(target)) throw new Error('MAP_CAPACITY_TARGET must be an HTTPS same-origin mapping endpoint');
if (!Number.isInteger(requests) || requests < 1 || requests > 5_000) throw new Error('MAP_CAPACITY_REQUESTS must be an integer from 1 to 5000');
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('MAP_CAPACITY_CONCURRENCY must be an integer from 1 to 100');
if (target.includes('/tiles/') || target.includes('/cesium/')) {
  if (!bearer || !capability) throw new Error('Protected vector-tile and Cesium tests require MAP_CAPACITY_BEARER and MAP_CAPACITY_CAPABILITY');
}

const durations = [];
const failures = [];
let next = 0;
async function worker() {
  while (true) {
    const index = next++;
    if (index >= requests) return;
    const started = performance.now();
    try {
      const response = await fetch(target, { headers: { Accept: 'application/octet-stream,image/*;q=0.9', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(capability ? { 'X-Geospatial-Capability': `Bearer ${capability}` } : {}) }, signal: AbortSignal.timeout(15_000) });
      await response.arrayBuffer();
      const durationMs = performance.now() - started;
      durations.push(durationMs);
      if (!response.ok) failures.push({ index, status: response.status, durationMs });
    } catch (error) {
      failures.push({ index, status: 0, durationMs: performance.now() - started, error: error instanceof Error ? error.message : 'request failed' });
    }
  }
}
await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, worker));
durations.sort((a, b) => a - b);
const percentile = (p) => durations[Math.max(0, Math.ceil(durations.length * p) - 1)] ?? null;
const result = { target: new URL(target).origin + new URL(target).pathname, requests, concurrency, successfulRequests: requests - failures.length, failedRequests: failures.length, errorRate: failures.length / requests, p50Ms: percentile(0.5), p95Ms: percentile(0.95), maxMs: durations.at(-1) ?? null, budgets: { p95BudgetMs, errorBudget }, passed: failures.length / requests <= errorBudget && (percentile(0.95) ?? Infinity) <= p95BudgetMs, failures: failures.slice(0, 20), completedAt: new Date().toISOString() };
fs.mkdirSync(new URL('.', `file://${process.cwd()}/${output}`).pathname, { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
if (!result.passed) process.exitCode = 1;
