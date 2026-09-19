const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hearth', {
  save: (name, data) => ipcRenderer.invoke('project:save', { name, data }),
  open: () => ipcRenderer.invoke('project:open'),
});
