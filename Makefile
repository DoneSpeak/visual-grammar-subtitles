PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install dev build zip typecheck test test-watch storybook storybook-build e2e check verify publish publish-dry clean distclean

help: ## 列出可用命令
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  %-16s %s\n", $$1, $$2}'

install: ## 安装依赖并生成 WXT 类型
	$(PNPM) install

dev: ## 开发模式，自动复制 kuromoji 词典
	$(PNPM) dev

build: ## 生产构建 → .output/chrome-mv3
	$(PNPM) build

zip: ## 构建并打包可分发的 zip
	$(PNPM) zip

typecheck: ## tsc --noEmit
	$(PNPM) typecheck

test: ## 单元测试（Vitest，跑一遍）
	$(PNPM) test

test-watch: ## 单元测试 watch 模式
	$(PNPM) test:watch

storybook: ## 本地 Storybook，http://localhost:6006
	$(PNPM) storybook

storybook-build: ## 静态 Storybook → storybook-static/
	$(PNPM) build-storybook

e2e: build ## 先构建再跑 Playwright（依赖 .output/chrome-mv3）
	$(PNPM) e2e

check: typecheck test ## 类型检查 + 单元测试，提交前最低门槛
verify: check build e2e ## 全量验证
publish: zip ## 构建并上传 Chrome Web Store 提交审核（需 CWS_* 凭据，见 DEVOPS.md）
	node scripts/publish-cws.mjs
publish-dry: ## 只校验凭据与条目状态，不上传
	node scripts/publish-cws.mjs --dry-run
clean: ## 删除构建与测试产物
	rm -rf .output .wxt storybook-static test-results playwright-report

distclean: clean ## 连 node_modules 一起删除
	rm -rf node_modules

UV ?= uv
NLP_PORT ?= 8765
NLP_PYTHON ?= .venv/bin/python
LOG ?= 0
ifneq ($(origin NLP_ALLOWED_ORIGINS),undefined)
export NLP_ALLOWED_ORIGINS
endif
ifneq ($(origin NLP_DATA_DIR),undefined)
export NLP_DATA_DIR
endif
ifneq ($(origin NLP_API_TOKEN),undefined)
export NLP_API_TOKEN
endif
.PHONY: nlp-install nlp-serve nlp-serve-log npl-serve-log nlp-stop nlp-token nlp-test nlp-check --log vocab-install vocab-fetch vocab-match vocab-build vocab-validate vocab-test vocab-check
nlp-install: ## 安装 Python 3.12、本机 NLP 服务及 GiNZA 模型
	cd python/server && $(UV) sync --python 3.12

nlp-serve: ## 后台启动 NLP，显示 Token 和配置步骤；LOG=1 同时查看日志
	@cd python/server && command -v $(NLP_PYTHON) >/dev/null || { echo '请先执行 make nlp-install 安装 NLP 服务。'; exit 1; }
	@cd python/server && $(NLP_PYTHON) service.py start --port $(NLP_PORT) $(if $(filter 1 true yes,$(LOG))$(filter --log,$(MAKECMDGOALS)),--log,)

nlp-serve-log: ## 查看 NLP 日志；Ctrl-C / Ctrl-Z 退出，后台继续运行
	@cd python/server && $(NLP_PYTHON) service.py logs

npl-serve-log: nlp-serve-log ## nlp-serve-log 的兼容别名

nlp-stop: ## 停止后台 NLP 服务
	@cd python/server && $(NLP_PYTHON) service.py stop

--log:
	@:

nlp-token: ## 显示 API Token，供复制到插件设置（首次自动生成）
	@cd python/server && $(NLP_PYTHON) -m config

nlp-test: ## Python 协议与 HTTP 接口测试
	cd python/server && $(NLP_PYTHON) -m pytest -q

nlp-check: check nlp-test ## 前后端联合检查

VOCAB_DIR ?= python/vocabulary
VOCAB_PYTHON ?= .venv/bin/python
vocab-install: ## 安装视觉词汇构建器（uv，Python 3.12）
	cd $(VOCAB_DIR) && $(UV) sync --python 3.12

vocab-fetch: ## 下载并校验固定版本的 OpenMoji / OpenJLPT 源
	cd $(VOCAB_DIR) && $(VOCAB_PYTHON) -m vocabulary fetch

vocab-match: vocab-fetch ## 生成待人工审核的图片候选清单
	cd $(VOCAB_DIR) && $(VOCAB_PYTHON) -m vocabulary match

vocab-build: vocab-fetch ## 生成 dist/vocabulary.ja.yaml 与 SVG 资源
	cd $(VOCAB_DIR) && $(VOCAB_PYTHON) -m vocabulary build

vocab-validate: ## 校验已生成的词汇包
	cd $(VOCAB_DIR) && $(VOCAB_PYTHON) -m vocabulary validate

vocab-test: ## 构建器单元测试
	cd $(VOCAB_DIR) && $(VOCAB_PYTHON) -m pytest -q

vocab-check: vocab-build vocab-validate ## 构建 + 校验
