const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('xs', {
  info: () => ipcRenderer.invoke('xs:info'),
  printers: () => ipcRenderer.invoke('xs:printers'),
  printerSetup: () => ipcRenderer.invoke('xs:printerSetup'),
  print: (args) => ipcRenderer.invoke('xs:print', args),
  badge: (n) => ipcRenderer.send('xs:badge', n)
});
