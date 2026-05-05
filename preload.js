const { contextBridge, ipcRenderer, webUtils } = require("electron");

// Try to require 'path' only when available (preload may be evaluated in non-Node environments during dev HMR)
let pathModule = null;
try {
  pathModule = require("path");
} catch (err) {
  // path not available (e.g. when Vite's sandbox tries to evaluate this file)
  pathModule = null;
}

contextBridge.exposeInMainWorld("api", {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  on: (channel, listener) => {
    const cb = (event, ...args) => listener(...args);
    ipcRenderer.on(channel, cb);
    return () => ipcRenderer.removeListener(channel, cb);
  },
  getPath: (file) => webUtils.getPathForFile(file),
});

// Expose minimal path helpers; prefer native `path` when present
contextBridge.exposeInMainWorld("path", {
  basename: (p, ext) => {
    if (pathModule) return pathModule.basename(p, ext);
    if (!p) return "";
    const idx = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    let name = idx !== -1 ? p.slice(idx + 1) : p;
    if (ext && name.endsWith(ext)) name = name.slice(0, -ext.length);
    return name;
  },
  extname: (p) => {
    if (pathModule) return pathModule.extname(p);
    if (!p) return "";
    const dot = p.lastIndexOf(".");
    return dot === -1 ? "" : p.slice(dot);
  },
  join: (...parts) => {
    if (pathModule) return pathModule.join(...parts);
    return parts.join("/");
  },
});
