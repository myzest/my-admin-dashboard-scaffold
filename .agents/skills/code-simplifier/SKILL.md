---
name: code-simplifier
description: Simplify recently changed code for clarity, reuse, and maintainability while preserving behavior. Use for focused refactoring or simplification review; follow the user's requested edit or review scope.
license: Apache-2.0
---

# 代码简化

基于 Anthropic 官方 code-simplifier 改编；已转换为通用 skill，并调整为本项目规范。来源版本见 `INSTALLATION.json`，许可见 `LICENSE`。

## 范围

- 默认关注本次修改和用户指定的代码，不顺带重构整个仓库。
- 只审查的任务提供具体建议；已授权实现的任务可直接完成范围内的简化。
- 遵守适用的 `AGENTS.md`、`AGENT.md`、`CLAUDE.md` 和现有技术栈，不强制切换语言、语法风格或模型。
- 简化保持输入输出、接口约定、异常、副作用和可观察行为不变；发现行为缺陷时明确区分修复与重构。

## 简化规则

- 先搜索已有组件、工具函数和业务方法，复用语义一致的实现。
- 删除重复计算、无职责的转发层、无效分支和没有价值的抽象。
- 减少嵌套，用清晰命名和直观控制流表达意图；避免嵌套三元和密集单行。
- 只在职责明确、确有复用价值时提取公共代码；单处使用的逻辑通常留在所属模块。
- 保留有助于组织代码的抽象，不以文件数、函数行数或参数个数作为质量指标。
- 不将多个职责合并进巨型函数或万能组件，不越过模块公开入口以缩短代码。
- 基础组件和通用能力优先使用现有成熟库；业务专用逻辑不堆进通用 `utils`。
- 保留必要的权限校验、事务、错误传播和幂等处理，不把这些约束视为冗余。
- 删除复述代码的注释，保留解释约束、取舍和外部兼容原因的注释。

## 验证与交付

- 检查调用方和相关分支，确认简化没有改变行为或破坏模块边界。
- 运行与改动相关的现有检查；仅在风险或项目要求需要时补充测试。
- 不为低影响改动引入测试框架，也不无条件运行全仓测试。
- 说明有实际意义的简化、验证结果和未解决的问题；代码已清晰时无需制造修改。

上游：[Anthropic code-simplifier](https://github.com/anthropics/claude-plugins-official/blob/a0b04d9ddccaabe1976645f68b0eda50f74e7022/plugins/code-simplifier/agents/code-simplifier.md)。
