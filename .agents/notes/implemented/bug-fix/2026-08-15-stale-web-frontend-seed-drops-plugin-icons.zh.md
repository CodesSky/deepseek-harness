# Agent Note: 过期的 web 前端静态种子会丢掉仅插件使用的图标

Status: implemented

English | [2026-08-15-stale-web-frontend-seed-drops-plugin-icons.md](2026-08-15-stale-web-frontend-seed-drops-plugin-icons.md)

## 问题

侧栏 chrome 改用 `IconPanelLeftCollapseOutline16` / `IconPanelLeftExpandOutline16`（[顶栏 tooltip 与方向图标](../feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)）之后，桌面端出现整列空白侧栏：无会话列表、无新建会话胶囊、无设置，红绿灯旁也没有折叠按钮。控制台为 React #130 与 `slot entry crashed in 'sidebar'`——组件类型为 `undefined`。品牌锁与终端 chrome 仍在其他 slot 中工作，空白列容易被误判为折叠 CSS 回归。

## 决策

`apps/web` 的 Vite 构建把 `@deepseek-ai/dsh-client-ui-primitives` 种子进客户端模块静态表（`packages/client/web/src/seed.ts` 的 `import * as UiPrimitives`）。`ui-sidebar` 等插件 bundle 在运行时对该表做 `require()`，并不自带这些字形。只把图标加进 `ui-primitives` 源码并重建插件不够：必须重建 shell 前端 dist，静态种子才会导出新名字。用 `DSH_DESKTOP_RESOURCES` 冒烟时，还要刷新 macOS 闭包里的 `@deepseek-ai/dsh-web-frontend/dist`。

折叠列 CSS 保证顶栏固定 chrome 不被裁切：`AppFrame` 在 `.frame[data-sidebar-collapsed] .sidebarCol` 上设 `overflow: visible`；展开态 `logoRow` 同样 `overflow: visible`，以免 macOS 上 `position: fixed` 的 toggle 被行裁切。

## 备选方案

**把面板字形打进 `ui-sidebar` 的 client bundle。** 否决：平台模块的目的是让各插件共享同一套 React 图标实例表；复制 SVG 违背该约定。

**继续只用 `IconPanelLeftOutline16`。** 否决：产品需要 ui-primitives 已提供的方向性收起/展开字形。

## 验证

- `apps/web/tests/static-seed-panel-icons.spec.ts` 断言构建出的 index chunk 含两个字形导出名（捕捉过期的 `apps/web/dist`）。
- `packages/client/web/tests/seed-primitives.client.spec.ts` 断言 `getStaticModules()` 暴露与 primitives barrel 相同的函数。
- 侧栏 root 规格断言展开态座位（region/settings/胶囊/toggle）与折叠态顶栏 toggle 可见；layout/sidebar 样式规格钉住折叠列 `overflow: visible`。

## 后果

凡是只被插件 client bundle 消费的新 `ui-primitives` 导出，同一次改动必须执行 `pnpm --filter @deepseek-ai/dsh-web-frontend build`（桌面冒烟还需刷新闭包）。漏掉重建会表现为空侧栏列加 React #130，而不是缺图标占位。
