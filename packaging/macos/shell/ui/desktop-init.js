/* Injected by the macOS Tauri shell on every top-level navigation, including
   the localhost `dsh web` origin after `navigate()`. Browser-launcher / plain
   `dsh web` never load this file. Platform chrome constants (not Config). */
(function () {
  var host = location.hostname
  var protocol = location.protocol
  if (host !== '127.0.0.1' && protocol !== 'tauri:' && protocol !== 'asset:') {
    return
  }

  var root = document.documentElement
  root.dataset.dshDesktop = 'macos'

  function stampDragRegions() {
    var fullscreen = root.dataset.dshFullscreen === 'true'
    var nodes = document.querySelectorAll('[data-dsh-drag-chrome]')
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (fullscreen) {
        el.removeAttribute('data-tauri-drag-region')
      } else {
        var mode = el.getAttribute('data-dsh-drag-chrome')
        el.setAttribute('data-tauri-drag-region', mode === 'deep' ? 'deep' : '')
      }
    }
  }

  function applyFullscreen(fullscreen) {
    if (fullscreen) root.dataset.dshFullscreen = 'true'
    else delete root.dataset.dshFullscreen
    stampDragRegions()
  }

  stampDragRegions()
  new MutationObserver(stampDragRegions).observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-dsh-drag-chrome', 'data-dsh-fullscreen'],
  })

  var ipc = window.__TAURI_INTERNALS__
  if (ipc && typeof ipc.invoke === 'function') {
    ipc.invoke('plugin:window|is_fullscreen').then(applyFullscreen).catch(function () {
      /* IPC can race the first paint; resize eval in the shell retries. */
    })
  }
})()
