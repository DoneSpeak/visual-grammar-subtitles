# DEVOPS — 发布到 Chrome Web Store

自动发布由 `.github/workflows/release.yml` 承担：推 `v*` tag → 校验版本 → typecheck/test/build/e2e → 上传 zip → 提交商店审核。

本文只写**人必须做的一次性准备**和**每次发布的操作**。CI 的内部实现看 workflow 本身，不在这里复述。

---

## 0. 分工总览

| 事项 | 频次 | 谁做 |
|---|---|---|
| 注册 Chrome 开发者账号（一次性 $5） | 一次 | 你 |
| 在开发者后台创建条目、填商店信息、隐私问卷 | 一次，之后偶尔改 | 你（手动，API 不支持） |
| 建 Google Cloud 项目 + OAuth 凭据 + refresh token | 一次 | 你 |
| 往 GitHub 仓库写 5 个 secret | 一次 | 你 |
| 改 `package.json` 版本 + 打 tag + push | 每次发布 | 你 |
| 构建、测试、上传、提交审核 | 每次发布 | GitHub Actions |

**API 的能力边界**（v2，2025-10 上线）：只能上传包体、提交审核、查状态、取消提交、调灰度比例。**不能**创建条目、不能改标题/描述/截图/分类/隐私声明——这些只能在开发者后台点。

---

## 1. 账号准备

### 1.1 Chrome Web Store 开发者账号

1. 用你的 Google 账号登 `https://chrome.google.com/webstore/devconsole`。
2. 首次进入会要求注册开发者：填住址、手机/邮箱验证、付一次性注册费（当前为 $5，以后台实际显示为准）。
3. 注册审核通常几分钟到几天。**这个账号就是条目 owner，后面所有 API 操作都用它签发的凭据**，不要换成别的 Google 账号。

### 1.2 Google Cloud 项目

1. `https://console.cloud.google.com` 新建项目（任意名字，例如 `jp-subtitle-overlay-release`）。
2. 「API 和服务 → 库」搜索 **Chrome Web Store API**，启用。
3. 记下 project id，后面 OAuth 同意屏幕要用。

### 1.3 OAuth 凭据

「API 和服务 → OAuth 同意屏幕」：

| 项 | 值 | 为什么 |
|---|---|---|
| User type | External | 内部类型只有 Workspace 组织可用 |
| 发布状态 | **In production**（不是 Testing） | Testing 状态下发的 refresh token **7 天必过期**，CI 会每週挂一次 |
| 作用域 | `https://www.googleapis.com/auth/chromewebstore` | v2 上传/发布所需 |

发布状态是 Testing 时，可以直接点「发布应用」；只有此 scope 的应用不需要 Google 人工验证。

然后「凭据 → 创建凭据 → OAuth 客户端 ID → 桌面应用」，拿到 `client_id` 和 `client_secret`。

### 1.4 换取 refresh token（本机做一次）

用 OAuth 2.0 Playground（`https://developers.google.com/oauthplayground`）：

1. 右上齿轮 → 勾选 **Use your own OAuth credentials**，填入上一步的 client id/secret。
2. 左侧 scope 填 `https://www.googleapis.com/auth/chromewebstore`，Authorize。
3. 用**注册开发者账号的那个 Google 账号**登录授权。
4. 用返回的 authorization code 换 token，复制 **Refresh token**。

也可以自己跑一遍授权码流程：

```bash
# 1) 浏览器打开，登录后从回调 URL 取 code
open "https://accounts.google.com/o/oauth2/v2/auth?client_id=$CLIENT_ID&redirect_uri=http://localhost&response_type=code&scope=https://www.googleapis.com/auth/chromewebstore&access_type=offline&prompt=consent"

# 2) 用 code 换 refresh_token
curl -s https://oauth2.googleapis.com/token \
  -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
  -d code="$CODE" -d grant_type=authorization_code -d redirect_uri=http://localhost
```

refresh token 只在首次授权时返回，丢了就重新走一遍授权（`prompt=consent` 保证重发）。

**自检**（确认凭据可用，也顺便验证商店条目已存在）：

```bash
TOKEN=$(curl -s https://oauth2.googleapis.com/token \
  -d client_id="$CLIENT_ID" -d client_secret="$CLIENT_SECRET" \
  -d refresh_token="$REFRESH_TOKEN" -d grant_type=refresh_token | jq -r .access_token)

curl -s -H "Authorization: Bearer $TOKEN" \
  "https://chromewebstore.googleapis.com/v2/publishers/$PUBLISHER_ID/items/$ITEM_ID:fetchStatus" | jq .
```

正常返回里应该有 `publishedItemRevisionStatus` / `submittedItemRevisionStatus`。401 是凭据问题，404 是 publisher id / item id 写错。

---

## 2. 商店侧一次性配置

### 2.1 创建条目

在开发者后台「新增项」上传一次任意可用的 zip（本地 `pnpm zip` 的产物即可），完成条目创建。之后 CI 才能更新它。

### 2.2 取两个 ID

| ID | 取值位置 |
|---|---|
| item id | 开发者后台条目 URL 的末段（32 位小写字母）；也是已安装扩展的 id |
| publisher id | Dev Console URL 的第一段路径（UUID 形态）。**此位置需你实际核对一次**，不同版本后台 UI 有差异；取不到就先用上面对照表里那条 curl 试，404 报错信息会提示期望的 `publishers/*/items/*` 格式 |

### 2.3 商店信息（API 不覆盖，必须手动，且每次改代码后要自查）

- 名称、简短描述、详细描述、分类、语言（本扩展 `default_locale: en_GB`，另有 `zh_CN`）
- 图标 128×128（仓库内已有 `public/icon/`）
- 至少 1 张截图（1280×800 或 640×400），建议 3–5 张
- 宣传图 440×280（可选）
- **隐私政策 URL**：本扩展读取网页内容（`<all_urls>`）与本地字幕，属于处理用户数据，商店要求填隐私政策链接。需要自己准备一个可公开访问的页面
- 隐私权实践问卷（数据用途声明）
- 权限理由，逐条要写清楚，否则审核会退回：

| 权限 | 理由要点 |
|---|---|
| `storage` / `unlimitedStorage` | 保存用户设置、本地字幕与词典缓存，数据不外传 |
| `host_permissions: <all_urls>` | 字幕需叠加在任意站点的视频上；不读取与视频/字幕无关的内容 |
| 远程代码 | 无。确认构建产物里不含 eval/远程脚本（WXT 默认满足） |

`<all_urls>` 会触发深度审核：新条目首次审核通常数天到数周，之后的小版本会快一些。

---

## 3. GitHub 侧配置

### 3.1 仓库

当前仓库**没有配置 remote**。发布前需要：

```bash
gh repo create jp-subtitle-overlay --private --source . --remote origin   # 或自己建好后 git remote add
git push -u origin main
```

### 3.2 Secrets

仓库 Settings → Secrets and variables → Actions，或：

```bash
gh secret set CWS_PUBLISHER_ID   --body "<publisher id>"
gh secret set CWS_ITEM_ID        --body "<item id>"
gh secret set CWS_CLIENT_ID      --body "<oauth client id>"
gh secret set CWS_CLIENT_SECRET  --body "<oauth client secret>"
gh secret set CWS_REFRESH_TOKEN  --body "<refresh token>"
```

本地发布用同一组值，写到仓库根目录 `.env.cws`（已在 `.gitignore`）：

```bash
cat > .env.cws <<'EOF'
CWS_PUBLISHER_ID=...
CWS_ITEM_ID=...
CWS_CLIENT_ID=...
CWS_CLIENT_SECRET=...
CWS_REFRESH_TOKEN=...
EOF
```

### 3.3 Environment

workflow 的 `publish` job 声明了 `environment: chrome-web-store`。在 Settings → Environments 建同名 environment（名字不一致会导致 secrets 作用域对不上）。建议加 **Required reviewers = 自己**，这样推 tag 后发布仍需手动批准，避免误发。

### 3.4 分支保护

对 `main` 开启 required status checks，避免未过 verify 的代码被打 tag。

---

## 4. 每次发布

有两条路径，**实现是同一份 `scripts/publish-cws.mjs`**，行为一致，只是构建在哪跑：

| 路径 | 命令 | 适用 |
|---|---|---|
| 本地 | `make publish`（= build + zip + 上传） | 想立刻看到 API 报错、或 CI 出问题时的兜底 |
| CI | 推 `v*` tag | 常规发布，保证包体来自干净环境 |

### 4.1 本地发布

```bash
make check                          # 至少过 typecheck + test
make publish-dry                    # 先空跑：验证凭据 + 条目状态，不上传
make publish                        # build → zip → 上传 → 提交审核
```

凭据自动从 `.env.cws` 读；也可以 `set -a; source .env.cws; set +a` 后直接 `node scripts/publish-cws.mjs`。常用参数：

| 参数 | 作用 |
|---|---|
| `--dry-run` | 只验凭据与 `takenDown`，不上传（上传会产生新的草稿版本，故不放进 dry-run） |
| `--staged` | 提交为 `STAGED_PUBLISH`，审核通过后到后台手动上线 |
| `--zip <path>` | 指定包体，默认取 `.output/` 里最新的 `*-chrome.zip` |
| `--env-file <path>` | 指定凭据文件，默认靠已有环境变量 |

### 4.2 CI 发布

```bash
# 1) 升版本（唯一版本来源是 package.json；tag 必须与之一致，否则 verify 直接失败）
npm version minor --no-git-tag-version    # patch / minor / major

# 2) 提交并打 tag
git add package.json && git commit -m "release: v$(node -p "require('./package.json').version")"
git tag "v$(node -p "require('./package.json').version")"

# 3) 推送（tag 触发发布）
git push origin main --tags
```

想先只构建不发布：Actions → release → Run workflow，`dry_run` 保持勾选（默认 true）。产物在 run 的 Artifacts 里，可直接手工上传后台。

发布完成后条目状态在后台「状态」列查看：审核中 → 已发布。API 只能提交，不能加速审核。

---

## 5. 失败排查

| 现象 | 原因 / 处理 |
|---|---|
| `tag vX 与 package.json 版本 Y 不一致` | 先 `npm version` 再打 tag |
| 换 token 返回 400/401 | secret 抄错；或 refresh token 已失效（Testing 状态下 7 天过期）→ 重走 1.4 |
| `fetchStatus` 404 | publisher id 或 item id 错，见 2.2 |
| `takenDown=true` | 条目被商店下架，需先在后台申诉/整改 |
| 上传后 `lastAsyncUploadState=FAILED` | zip 结构不对（必须无顶层目录，WXT 产物满足）或 manifest 版本号未递增 |
| 上传超时 | 包体大（本仓库含 kuromoji 词典，zip 约 20MB+）→ 网络慢，重跑 job 即可 |
| publish 返回 `blockOnWarnings` 类错误 | 商店校验有警告（权限、元数据），按返回的 itemError 逐条改 |
| 审核被拒 | 看后台邮件/原因，改后升版本重新提交 |

**回滚**：Chrome Web Store 不允许把已发布版本退回去。要回滚只能把旧代码重新打一个**更高**的版本号再发一次。

---

## 6. CI 组成

| Job | 内容 | 门槛等级 |
|---|---|---|
| `verify` | `pnpm install --frozen-lockfile` → typecheck → test → build → zip → e2e | 阻断发布 |
| `publish` | `node scripts/publish-cws.mjs`：换 token → 查 `takenDown` → 上传 → 轮询 `lastAsyncUploadState` 到 `SUCCEEDED` → 校验 `crxVersion` → `:publish` | tag 触发，或手动 `dry_run=false` |

本地等效：

```bash
make verify        # typecheck + test + build + e2e，与 verify job 同一条路径
make zip           # 产物 .output/visual-grammar-subtitles-<version>-chrome.zip
make publish-dry   # 只校验凭据与条目状态
make publish       # 与 CI publish job 同一条路径
```

---

## 7. 已知未验证项

- `publisher id` 在后台 UI 中的确切位置未核实，2.2 给的是最可能的来源。
- `pnpm e2e` 在 GitHub runner 上的 headless chromium 加载扩展未实测过（本地通过）。
- `pnpm test` 依赖 `packages/subtitle-contract/`（`src/nlp/schema.ts` 直接相对路径 import）、`public/vocab/`、`public/dict/vocabulary.json`。这些目前仍未纳入版本库，**不提交则 verify 必挂**。
- v2 可用 service account 替代 OAuth refresh token（无需 IAM 角色，publisher 下只能绑一个）。本 workflow 未实现该路径，改用需自行加 JWT 签名步骤。
