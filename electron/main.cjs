const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
let main;
app.whenReady().then(() => {
  main = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1050,
    minHeight: 720,
    backgroundColor: '#f6f5f0',
    title: 'Hearth Studio',
    icon: path.join(__dirname, '../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  main.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  main.webContents.on('will-navigate', (event) => event.preventDefault());
  main.loadFile(path.join(__dirname, '../dist/index.html'));
});
ipcMain.handle('project:save', async (event, { name, data }) => {
  if (event.sender !== main.webContents || typeof data !== 'string' || data.length > 5000000)
    throw new Error('Invalid project');
  const result = await dialog.showSaveDialog(main, {
    defaultPath:
      String(name)
        .replace(/[^a-z0-9 _-]/gi, '')
        .slice(0, 80) + '.hearth',
    filters: [{ name: 'Hearth project', extensions: ['hearth'] }],
  });
  if (result.canceled || !result.filePath) return false;
  await fs.writeFile(result.filePath, data, 'utf8');
  return true;
});
ipcMain.handle('project:open', async (event) => {
  if (event.sender !== main.webContents) throw new Error('Invalid sender');
  const result = await dialog.showOpenDialog(main, {
    properties: ['openFile'],
    filters: [{ name: 'Hearth project', extensions: ['hearth', 'json'] }],
  });
  if (result.canceled) return null;
  const stat = await fs.stat(result.filePaths[0]);
  if (stat.size > 5000000) throw new Error('Project is too large');
  return fs.readFile(result.filePaths[0], 'utf8');
});
app.on('window-all-closed', () => app.quit());
