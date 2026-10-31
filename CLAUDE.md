# CLAUDE.md

Chrome MV3 扩展：在任意网页视频上叠加本地字幕，日语词性着色。WXT 构建，React 19 + Tailwind 4 只用于 popup/options。

## 硬约束

1. **overlay / content script 不用 React。** 字幕层与视频同步是 rAF 直写 style 的几何计算（`src/features/overlay/`），React 化只会引入每帧重渲染。它跑在宿主页的 Shadow DOM 里，保持命令式。
2. **React 只出现在 `src/entrypoints/{popup,options}`**，每个入口一个目录：`index.html + main.tsx` 同级，组件与 hooks 放 `src/features/<area>/`。不要在 `entrypoints/` 里加二级目录。
3. **`src/design-system/` 不得 import `chrome.*`、`@/shared/storage` 或任何 `@/features/`。** 它必须能在 Storybook 里独立渲染；需要数据的部分通过 props 注入。
4. **颜色只走 CSS 变量。** 组件里禁止硬编码色值（含 Tailwind 任意值如 `bg-[#fff]`）。新增颜色要在两处同时登记：`src/design-system/tokens/colors.css` 的 `:root` 与 `:root[data-theme='dark']`，以及 `src/design-system/tokens/themes.css` 的 `@theme inline`。
5. **`--primary` ≠ `--accent`。** 本项目的 `--primary` 是实心按钮底色（原 `--accent` 改名而来），`--accent` 是 shadcn 语义的浅底悬停色。混用会导致按钮与 hover 全部错色。
6. **暗色靠 `data-theme`，不是 `prefers-color-scheme`。** Tailwind 的 `dark` 变体已在 `themes.css` 用 `@custom-variant` 改写；主题读写只经 `src/shared/theme.ts`。
7. **不要手写 `manifest.json`。** 它由 `wxt.config.ts` 的 `manifest` 字段生成（`srcDir: 'src'`，`public/` 留在仓库根）。改权限、content script 匹配范围、`options_ui` 都改 `wxt.config.ts`。
8. **`public/dict/` 是生成物。** kuromoji 词典由 `scripts/sync-dict.mjs` 在 `predev`/`prebuild` 复制，已 gitignore；提交前不要把它塞进版本库。`public/dict/vocabulary.json` 与 `public/vocab/` 由 `pnpm vocab:build` 从 `python/vocabulary/dist/` 生成，产物已提交，不要手改。
9. **用户可见文案只走 `src/shared/i18n/`。** 新增文案加到 `messages/<section>.ts`，`defineMessages(en, zh)` 会强制两种语言键一致；运行时用 `t(key, params)`，禁止在组件/overlay 里写死中文或英文。写入 `chrome.storage` 的哨兵值（`src/shared/persistedText.ts`）保持规范中文，只在渲染时经 `i18n/display.ts` 翻译。Chrome 清单文案在 `public/_locales/{en_GB,zh_CN}`，由浏览器语言决定，与应用内 `ui:language` 无关。

## 验证门槛

- 任何改动：`pnpm typecheck && pnpm test`
- 改了 `design-system/` 组件：补或改对应 `*.stories.tsx`，跑 `pnpm build-storybook`
- 改了 popup/options 行为：`pnpm build && pnpm e2e`（e2e 加载 `.output/chrome-mv3`，必须先 build）
- 改了 background/content：无自动化覆盖，手工加载扩展回归：字幕显示、拖动/resize、控制面板、词典卡、广告标记、kuromoji 分词

## 命令

`make help` 列出全部目标；`make check` = typecheck + test，`make verify` = check + build + e2e。底层仍是 pnpm：`pnpm dev` · `pnpm build` · `pnpm zip` · `pnpm typecheck` · `pnpm test` · `pnpm storybook` · `pnpm e2e`

产物：`.output/chrome-mv3`。领域逻辑在 `src/shared/`（站点规则、字幕包、词典设置、词性配色），不要为它们再包一层 use-case。

## 外部依赖注意事项

- `@sglkc/kuromoji` 在 MV3 service worker 里依赖 `self.fetch` 补丁与 `chrome.runtime.getURL('dict/')`（`src/entrypoints/background.ts`）。升级该包或改打包方式后必须回归分词。
- kitsunekko 在线导入走跨域抓取，改动 `src/features/scraper/` 后需实测。
