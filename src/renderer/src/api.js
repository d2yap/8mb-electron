// Safe wrapper around `window.api` and `window.path` exposed by preload.js
const _win = typeof window !== 'undefined' ? window : {};

export const api = _win.api || {
  invoke: async (..._args) => {
    console.warn('[api] window.api.invoke is not available in this environment');
    return null;
  },
  send: (..._args) => {
    console.warn('[api] window.api.send is not available in this environment');
  },
  on: (_channel, _listener) => {
    console.warn('[api] window.api.on is not available in this environment');
    return () => {};
  }
}

export const path = _win.path || {
  basename: (p, ext) => {
    if (!p) return '';
    const idx = p.lastIndexOf('/') !== -1 ? p.lastIndexOf('/') : p.lastIndexOf('\\');
    let name = idx !== -1 ? p.slice(idx+1) : p;
    if (ext && name.endsWith(ext)) name = name.slice(0, -ext.length);
    return name;
  },
  extname: (p) => {
    if (!p) return '';
    const dot = p.lastIndexOf('.')
    return dot === -1 ? '' : p.slice(dot)
  },
  join: (...parts) => parts.join(require('path').sep)
}

export default api
