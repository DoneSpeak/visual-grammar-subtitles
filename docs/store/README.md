# Chrome Web Store 提交材料

发布流程（账号、OAuth、CI）见根目录 `DEVOPS.md`。这里只放**填表内容**：文案、隐私政策、问卷答案、审核备注、截图清单。

## 文件索引

| 文件 | 对应后台位置 |
|---|---|
| `listing.md` | 商店信息：名称、简短/详细说明、类别、语言 |
| `privacy-questionnaire.md` | 隐私权实践：单一用途、权限理由、数据用途、远程代码 |
| `reviewer-notes.md` | 审核 → 给审核员的备注 |
| `screenshots.md` | 截图与宣传图的来源、生成命令、上传对应关系 |
| `assets/en/` `assets/zh/` | 各 5 张 1280×800 截图，已生成 |
| `assets/promo/` | 440×280 与 1400×560 宣传图，已生成 |
| `../site/privacy/index.html` | 隐私政策页（部署后填其 URL） |
| `../site/sample.ja.srt` | 审核用的示例字幕 |

## 必须先补的两处

1. **联系邮箱**：`REPLACE-ME@example.com` 出现在 `docs/site/index.html`、`docs/site/privacy/index.html`。换成真实可收信的地址。
2. **隐私政策 URL**：Pages 首次部署后才存在。

截图与宣传图已生成；改 UI 后执行 `node scripts/capture-store-assets.mjs` 重出。

## 隐私政策托管

`docs/site/` 已配好 `.github/workflows/pages.yml`，推 `main` 即部署，只发布该目录。

1. 仓库 Settings → Pages → Source 选 **GitHub Actions**。
2. 推一次 `main`，等 `pages` workflow 变绿。
3. URL 形如 `https://<owner>.github.io/<repo>/privacy/`；示例字幕在 `.../sample.ja.srt`。

私有仓库的 Pages 需要付费计划（Pro/Team）。不想开 Pages 的替代方案：

| 方案 | 成本 | 说明 |
|---|---|---|
| GitHub Pages | 免费（公开仓库） | 最简单，但源码公开 |
| Cloudflare Pages / Netlify / Vercel | 免费 | 连私有仓库，构建目录填 `docs/site`，无构建命令 |
| 任意静态托管 | 视情况 | 上传 `docs/site/` 即可 |

## 不存在的“申请协议”

Chrome Web Store **不要求上传 EULA 或服务条款文件**。需要签的只有两处，都在注册账号时完成：

- Chrome Web Store Developer Agreement（注册开发者账号时勾选）
- Chrome Web Store Program Policies（同上，之后每次提交视为继续遵守）

条目层面唯一强制的法律文档是**隐私政策 URL**（因为使用了 `<all_urls>` 并处理字幕文本）。EU DSA 的 trader/non-trader 声明在后台勾选，见 `privacy-questionnaire.md` 第 4 节。

## 首次提交（后台手动）

```bash
pnpm install
make check                 # typecheck + test
make zip                   # prezip 复制词典 → build → .output/jp-subtitle-overlay-<version>-chrome.zip
ls -lh .output/*-chrome.zip
```

1. 开发者后台 →「新增项」→ 上传 zip（首次上传即创建条目，版本取 `package.json` 的 `0.4.0`）。
2. 填 `listing.md`、`privacy-questionnaire.md`、隐私政策 URL、截图，粘贴 `reviewer-notes.md`。
3. 提交审核。`<all_urls>` 的新条目通常数天到数周；之后小版本更快。

## 后续版本

```bash
npm version patch --no-git-tag-version   # 或 minor / major
make verify                              # check + build + e2e
make publish-dry                         # 只验凭据与条目状态
make publish                             # build + zip + 上传 + 提交审核
```

CI 路径：推 `v*` tag，见 `DEVOPS.md` 第 4 节。商店不允许降级回滚，只能发更高版本号。

## 包体事实（用于核对）

| 项 | 值 |
|---|---|
| 产物目录 | `.output/chrome-mv3` |
| zip | `.output/jp-subtitle-overlay-<version>-chrome.zip` |
| 当前 zip 大小 | 16.71 MB（解压 21.5 MB，含 ~14 MB kuromoji 词典） |
| manifest | `manifest_version 3`，`minimum_chrome_version 120` |
| 权限 | `storage`、`unlimitedStorage`、`host_permissions: <all_urls>` |
| 远程代码 | 无 |
| 默认语言 | `en_GB`，另有 `zh_CN` |
