#!/usr/bin/env node
// 把构建好的 zip 上传到 Chrome Web Store 并提交审核（API v2）。
// 本地与 CI 共用同一份实现，避免两条发布路径行为漂移。
//
//   node scripts/publish-cws.mjs                     # 用 .output/*-chrome.zip
//   node scripts/publish-cws.mjs --zip path/to.zip
//   node scripts/publish-cws.mjs --dry-run           # 只校验凭据与条目状态，不上传
//   node scripts/publish-cws.mjs --staged            # 提交为 STAGED_PUBLISH（审核通过后手动上线）
//
// 凭据从环境变量读取；--env-file 可指定一个 KEY=VALUE 文件。
//   CWS_PUBLISHER_ID  CWS_ITEM_ID
//   CWS_CLIENT_ID  CWS_CLIENT_SECRET  CWS_REFRESH_TOKEN
// 或者直接给 CWS_ACCESS_TOKEN 跳过换取步骤（调试用，约 1 小时有效）。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const API = 'https://chromewebstore.googleapis.com/v2';
const UPLOAD_API = 'https://chromewebstore.googleapis.com/upload/v2';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ROOT = resolve(import.meta.dirname, '..');

const POLL_INTERVAL_MS = 5_000;
const POLL_ATTEMPTS = 60;

const args = process.argv.slice(2);

function flag(name) {
  return args.includes(`--${name}`);
}
function option(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

if (flag('help')) {
  console.log(readFileSync(import.meta.filename, 'utf8').split('\n').slice(0, 15).join('\n'));
  process.exit(0);
}

const dryRun = flag('dry-run');
const publishType = flag('staged') ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH';

const envFile = option('env-file');
if (envFile) loadEnvFile(envFile);

let zipPath = option('zip') ? resolve(option('zip')) : undefined;
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

function loadEnvFile(path) {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    process.env[key] ??= value;
  }
}

function findZip() {
  const outDir = join(ROOT, '.output');
  if (!existsSync(outDir)) fail('找不到 .output/，先跑 pnpm build && pnpm zip');
  const zips = readdirSync(outDir)
    .filter((f) => f.endsWith('-chrome.zip'))
    .map((f) => join(outDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (zips.length === 0) fail('.output/ 里没有 *-chrome.zip，先跑 pnpm zip');
  return zips[0];
}

function fail(message, detail) {
  console.error(`✗ ${message}`);
  if (detail !== undefined) console.error(typeof detail === 'string' ? detail : JSON.stringify(detail, null, 2));
  process.exit(1);
}

function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) fail(`缺少环境变量：${missing.join(', ')}`);

}

/** 调用 v2 接口，非 2xx 时把响应体原样打出来再退出。 */
async function call(method, url, { token, body, contentType } = {}) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    body,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) fail(`${method} ${url} → HTTP ${res.status}`, json);
  return json;
}

async function accessToken() {
  if (process.env.CWS_ACCESS_TOKEN) return process.env.CWS_ACCESS_TOKEN;
  requireEnv('CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CWS_CLIENT_ID,
      client_secret: process.env.CWS_CLIENT_SECRET,
      refresh_token: process.env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.access_token) {
    fail('换取 access token 失败（refresh token 失效？Testing 状态下的 token 7 天过期）', json);
  }
  return json.access_token;
}

async function waitForUpload(itemName, token) {
  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    const status = await call('GET', `${API}/${itemName}:fetchStatus`, { token });
    const state = status.lastAsyncUploadState;
    if (state === 'SUCCEEDED') return;
    if (state === 'IN_PROGRESS' || state === undefined) {
      console.log(`  上传中…（${attempt}/${POLL_ATTEMPTS}）`);
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      continue;
    }
    fail(`上传失败：lastAsyncUploadState=${state}`, status);
  }
  fail(`等待上传超时（${(POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s）`);
}

// ── 主流程 ────────────────────────────────────────────────────────────────
// 顶层 await 抛错走 uncaughtException，普通 promise 走 unhandledRejection，两条都接。
const onFatal = (err) => {
  console.error(`✗ 网络或运行时错误：${err?.cause?.message ?? err?.message ?? err}`);
  process.exit(1);
};
process.on('unhandledRejection', onFatal);
process.on('uncaughtException', onFatal);

requireEnv('CWS_PUBLISHER_ID', 'CWS_ITEM_ID');
const itemName = `publishers/${process.env.CWS_PUBLISHER_ID}/items/${process.env.CWS_ITEM_ID}`;

console.log(`条目  ${itemName}`);
console.log(`版本  ${version}（package.json）`);
console.log(`模式  ${dryRun ? 'dry-run（不上传）' : publishType}`);

const token = await accessToken();

const before = await call('GET', `${API}/${itemName}:fetchStatus`, { token });
if (before.takenDown) fail('条目已被下架（takenDown=true），需先在开发者后台处理', before);
if (before.warned) console.warn('⚠ 条目当前有商店警告（warned=true），先看后台再决定是否继续');

if (dryRun) {
  console.log('✓ 凭据与条目状态正常，dry-run 结束（未上传）');
  process.exit(0);
}

zipPath ??= findZip();
if (!existsSync(zipPath)) fail(`包体不存在：${zipPath}`);
console.log(`包体  ${zipPath}`);

const upload = await call('POST', `${UPLOAD_API}/${itemName}:upload`, {
  token,
  body: readFileSync(zipPath),
  contentType: 'application/zip',
});
console.log(`uploadState=${upload.uploadState ?? '(async)'} crxVersion=${upload.crxVersion ?? '?'}`);

if (upload.uploadState === 'IN_PROGRESS') await waitForUpload(itemName, token);
else if (upload.uploadState && !['SUCCEEDED', 'SUCCESS'].includes(upload.uploadState)) {
  fail(`上传失败：uploadState=${upload.uploadState}`, upload);
}

if (upload.crxVersion && upload.crxVersion !== version) {
  fail(`上传版本 ${upload.crxVersion} 与 package.json ${version} 不一致`);
}

const publish = await call('POST', `${API}/${itemName}:publish`, {
  token,
  body: JSON.stringify({ publishType }),
  contentType: 'application/json',
});
console.log('publish →', JSON.stringify(publish));

const after = await call('GET', `${API}/${itemName}:fetchStatus`, { token });
console.log(JSON.stringify(after, null, 2));
console.log(`✓ 已提交审核：${process.env.CWS_ITEM_ID} v${version}`);
