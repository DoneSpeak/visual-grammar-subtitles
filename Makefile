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
