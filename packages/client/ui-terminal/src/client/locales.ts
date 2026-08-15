/** Product copy for the interactive terminal panel. */

/** Dictionary keys owned by the terminal panel plugin. */
export type TerminalKey =
  | 'action.label'
  | 'action.open'
  | 'action.close'
  | 'action.new'
  | 'panel.title'
  | 'panel.empty'
  | 'panel.select'
  | 'panel.detached'
  | 'panel.overrun'
  | 'panel.refresh'
  | 'panel.unavailable'
  | 'dock.empty'
  | 'dock.opening'

/** Dictionary namespace owned by this plugin. */
export const NS = 'terminal' as const

/** Chinese product copy. */
export const zh: Record<TerminalKey, string> = {
  'action.label': '终端',
  'action.open': '打开终端',
  'action.close': '关闭终端',
  'action.new': '新建终端',
  'panel.title': '交互终端',
  'panel.empty': '当前会话没有可附加的 PTY。请先让模型调用 terminal_open，或使用右上角终端打开用户 shell。',
  'panel.select': '选择会话',
  'panel.detached': '未附加',
  'panel.overrun': '输出过快，部分字节已丢弃',
  'panel.refresh': '刷新列表',
  'panel.unavailable': '终端服务不可用',
  'dock.empty': '点击 + 新建交互终端',
  'dock.opening': '正在启动 shell…',
}

/** English product copy. */
export const en: Record<TerminalKey, string> = {
  'action.label': 'Terminal',
  'action.open': 'Open terminal',
  'action.close': 'Close terminal',
  'action.new': 'New terminal',
  'panel.title': 'Interactive terminal',
  'panel.empty': 'No attachable PTY for this session. Ask the model to call terminal_open, or open a user shell from the top-right Terminal control.',
  'panel.select': 'Select session',
  'panel.detached': 'Not attached',
  'panel.overrun': 'Output overrun — some bytes were dropped',
  'panel.refresh': 'Refresh list',
  'panel.unavailable': 'Terminal service unavailable',
  'dock.empty': 'Click + to open an interactive shell',
  'dock.opening': 'Starting shell…',
}
