PNPM ?= pnpm

.DEFAULT_GOAL := help

.PHONY: help install dev build zip typecheck test test-watch storybook storybook-build e2e check verify clean distclean

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
clean: ## 删除构建与测试产物
	rm -rf .output .wxt storybook-static test-results playwright-report

distclean: clean ## 连 node_modules 一起删除
	rm -rf node_modules

UV ?= uv
VOCAB_DIR ?= python/vocabulary
VOCAB_PYTHON ?= .venv/bin/python
.PHONY: vocab-install vocab-fetch vocab-match vocab-build vocab-validate vocab-test vocab-check
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
