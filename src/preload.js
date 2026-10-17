'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('widget', {
  getState: () => ipcRenderer.invoke('app:get-state'),
  saveConfig: (patch) => ipcRenderer.invoke('app:save-config', patch),
  setPage: (page) => ipcRenderer.send('app:set-page', page),
  selectItem: (id) => ipcRenderer.send('app:select-item', id),
  dragStart: () => ipcRenderer.send('app:drag-start'),
  dragEnd: () => ipcRenderer.send('app:drag-end'),
  bumpScale: (dir) => ipcRenderer.send('app:bump-scale', dir),
  setScale: (value) => ipcRenderer.invoke('app:set-scale', value),
  openMenu: () => ipcRenderer.send('app:context-menu'),
  hide: () => ipcRenderer.send('app:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  setTrayTitle: (text) => ipcRenderer.send('app:title', text),
  onState: (fn) => {
    ipcRenderer.on('app:state', (_e, payload) => fn(payload));
  },
  onOpenSettings: (fn) => {
    ipcRenderer.on('app:open-settings', () => fn());
  }
});
