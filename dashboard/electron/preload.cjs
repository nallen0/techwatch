const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getIndicators: () => ipcRenderer.invoke('get-indicators'),
  getReportCsv:  () => ipcRenderer.invoke('get-report-csv'),
});
