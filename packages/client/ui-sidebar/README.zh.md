# @deepseek-ai/dsh-client-ui-sidebar

[English](README.md) | 中文

侧边栏外壳插件：负责 New Session 操作、布局持有的折叠控件、可感知滚动的区域 seat，以及固定在底部的 Settings seat。品牌字标在 Terminal chrome（[ui-terminal](../ui-terminal/README.md)），不在本栏。[ui-workspace](../ui-workspace/README.md) 持有渲染到 `sidebar.workspaces` 的 Workspace 与 Session 浏览器；本包既不派生其中的行，也不持有其视图偏好。折叠时列宽为零并隐藏整列，面板切换与新建会话钉为顶栏 chrome（[整列隐藏](../../../.agents/notes/implemented/feature/2026-08-15-collapsed-sidebar-hides-column.md)）。macOS 桌面壳把这些控件固定在原生红绿灯旁，并让展开态 `logoRow` 继续充当 deep-drag chrome（[红绿灯旁切换](../../../.agents/notes/implemented/feature/2026-08-15-sidebar-toggle-beside-traffic-lights.md)）；`dsh web` 与 `--browser-launcher` 保持展开流式 `logoRow` 切换，折叠时在左上钉住同一对控件。切换在收起/展开字形间互换，顶栏图标标签使用下方 `Tooltip`（[顶栏 tooltip](../../../.agents/notes/implemented/feature/2026-08-15-top-bar-chrome-tooltips-and-sidebar-toggle-glyphs.md)）。约定：[slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.md)。

New Session 启动运行时的页面本地前端 Session Intent。运行时优先使用作用域操作给出的显式 Workspace，否则用当前 Session 的 Workspace，再否则用最近活跃 Workspace；都不存在时清入空白新建会话页。Workspace 专用控件与共享选择器属于 ui-workspace。

`SidebarRootComponentProps` 组合布局 owner share、全局 `useSessions` 与 `useWorkspaces` 钩子、已声明的 `sidebar.workspaces` 与 `sidebar.settings` 子 slot，以及注入的 `startSession` 与侧栏切换回调。本包无 plugin store。

实时收起时，外壳把展开内容固定在当前宽度并用 150ms 淡出，随后布局列 track 滑到零。收起落定后只显示固定的面板切换与新建会话图标；工作区与设置 seat 仍挂载但不绘制，直到再次展开。页面初始即为收起状态时会静态渲染该 chrome；减少动态效果模式会禁用两段过渡。

列内滚动条是指针可供性：指针在列外时外壳把 ui-theme 的[滚动条间接层](../ui-theme/README.md) 重绑为 `transparent`，并在指针离开后仍保持拇指可见 2s，因此无人指向的列表不带条。防止行跳动的预留属于滚动区域（[ui-workspace](../ui-workspace/README.md)），因此露出拇指不会重排。

脚部是 `sidebar.settings` seat：侧栏只渲染底部固定布局 slot 并共享其列状态（`wide`）；ui-settings 在此注册触发行与设置面板。

`/client` 导出仅含插件主体（`apply`/`inject`）与约定类型；SidebarRoot、行组件与树派生仍作为包内实现藏在 slot 注册之后。

## 模型体验

无；侧栏渲染浏览器会话列表，此处没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送提供商请求。

## 已知限制与延后工作

- **会话状态点渲染由 [ui-workspace](../ui-workspace/README.md) 持有** — 没有完成/错误通知源可用。
- **Workspace 浏览器行为由组合持有** — 分组、排序、搜索与行状态属于 [ui-workspace](../ui-workspace/README.md)，不属于本外壳。
- **「新任务完成」未读标记是本地查看状态** — completion-time > last-seen 从不到达主机。
