---
name: arco-getting-started
description: "Arco Design installation and setup guide. Use for installing @arco-design/web-react, importing styles, configuring on-demand loading (babel-plugin-import or tree-shaking), and TypeScript setup."
user-invocable: false
---

# 快速开始

## 安装

```bash
# npm
npm install @arco-design/web-react

# yarn
yarn add @arco-design/web-react

# pnpm
pnpm add @arco-design/web-react
```

**Peer Dependencies**: `react >= 16`、`react-dom >= 16`

## 全量引入

```tsx
import React from 'react';
import { Button, Input, Select } from '@arco-design/web-react';
import '@arco-design/web-react/dist/css/arco.css';

function App() {
  return (
    <div>
      <Button type="primary">Hello Arco</Button>
    </div>
  );
}
```

## 按需加载（按实际构建工具选择）

本项目统一从 `@arco-design/web-react` 主入口导入组件，完整样式在 `pages/_app.jsx` 引入一次。先使用 Next.js 默认构建方案，只有实际构建验证需要时才配置按需优化；下方 Babel 配置不是本项目的默认配置。

### 方式一：使用 babel-plugin-import

```bash
npm install babel-plugin-import --save-dev
```

```json
// .babelrc 或 babel.config.js
{
  "plugins": [
    ["import", { "libraryName": "@arco-design/web-react", "libraryDirectory": "es", "style": true }]
  ]
}
```

### 主入口与 tree-shaking

保持源码从公开主入口导入，由实际构建工具处理优化，并通过构建产物确认效果：

```tsx
import { Button } from '@arco-design/web-react';
```

## 图标库

图标随 `@arco-design/web-react` 提供，从其公开的 `/icon` 入口导入，无需额外安装图标包。

```tsx
import { IconSearch, IconPlus } from '@arco-design/web-react/icon';

<Button icon={<IconSearch />}>搜索</Button>
```

## 类型参考

Arco Design 内置类型定义，可用于核对组件 API。本项目使用 JavaScript / JSX，不生成类型导入；下列写法仅适用于 TypeScript 项目。

```tsx
import type { ButtonProps, SelectProps, TableProps } from '@arco-design/web-react';
```

所有组件 Props 类型均可通过 `import type { XxxProps }` 导入。

## 浏览器兼容性

支持所有现代浏览器及 IE11+（需 polyfill）。

| 浏览器 | 版本 |
|--------|------|
| Chrome | 最新 2 个版本 |
| Firefox | 最新 2 个版本 |
| Safari | 最新 2 个版本 |
| Edge | 最新 2 个版本 |
| IE | 11 (需 polyfill) |

## 关键依赖

| 依赖 | 用途 |
|------|------|
| `dayjs` | 日期时间处理（替代 Moment.js，体积更小） |
| `lodash` | 工具函数库 |
| `react-transition-group` | CSS 过渡动画 |
| `b-validate` | 表单校验引擎 |
| `react-focus-lock` | 焦点锁定（Modal/Drawer） |
