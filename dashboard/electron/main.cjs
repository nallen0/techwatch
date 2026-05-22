const { app, BrowserWindow, protocol, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const DATA_DIR = path.join(app.getPath('home'), 'Library', 'Application Support', 'TechWatch');
const INDICATORS_PATH = path.join(DATA_DIR, 'indicators.json');
const REPORT_PATH = path.join(DATA_DIR, 'report.csv');

function bootstrapData() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const distData = path.join(app.getAppPath(), 'dist', 'data');
  if (!fs.existsSync(INDICATORS_PATH)) {
    const seed = path.join(distData, 'indicators.json');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, INDICATORS_PATH);
  }
  if (!fs.existsSync(REPORT_PATH)) {
    const seed = path.join(app.getAppPath(), 'dist', 'report.csv');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, REPORT_PATH);
  }
}

ipcMain.handle('get-indicators', () => {
  return JSON.parse(fs.readFileSync(INDICATORS_PATH, 'utf8'));
});

ipcMain.handle('get-report-csv', () => {
  return fs.readFileSync(REPORT_PATH, 'utf8');
});

function createWindow() {
  const distPath = path.join(app.getAppPath(), 'dist');

  protocol.handle('app', (request) => {
    let pathname = new URL(request.url).pathname;
    if (pathname === '/') pathname = '/index.html';
    return net.fetch('file://' + path.join(distPath, pathname));
  });

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'TechWatch',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.loadURL('app://localhost/');
}

app.whenReady().then(() => {
  bootstrapData();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
