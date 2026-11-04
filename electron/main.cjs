const { app, BrowserWindow, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const net = require('node:net');
const { startServer } = require('../serve-game.js');

const ROOT = path.join(__dirname, '..');
const UPDATE_INTERVAL = 4 * 60 * 60 * 1000;
let gameServer = null;
let mainWindow = null;

function setupAutoUpdate() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', () => {});
  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  check();
  setInterval(check, UPDATE_INTERVAL);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '0.0.0.0');
  });
}

async function launchServer() {
  for (const port of [8000, 8001, 8002, 8003, 8004, 8005]) {
    if (!(await isPortFree(port))) continue;
    try {
      gameServer = await startServer(port);
      return port;
    } catch {
      gameServer = null;
    }
  }
  return 0;
}

async function createWindow() {
  const port = await launchServer();
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#87ceeb',
    autoHideMenuBar: true,
    icon: path.join(ROOT, 'image-pack', 'icon-512.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (!port) {
    mainWindow.loadURL('data:text/html,' + encodeURIComponent(
      '<body style="font:16px system-ui;padding:40px;background:#1b2224;color:#fff">' +
      '<h1>Could not start the game server</h1><p>Close other copies of +1 Speed and try again.</p></body>'
    ));
    return;
  }
  mainWindow.loadURL(`http://127.0.0.1:${port}/`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    await createWindow();
    setupAutoUpdate();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    if (gameServer) {
      gameServer.close();
      gameServer = null;
    }
  });
}
