// Processo principal do Electron: abre a janela e serve os arquivos do app.
const { app, BrowserWindow, protocol, net, session } = require('electron');

// Deixa o áudio tocar sem precisar de um clique antes (os gestos podem iniciar a música)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV = process.env.ELECTRON_DEV === '1';
const DIST = path.join(__dirname, '..', 'dist');

// Um protocolo próprio (app://) em vez de file://, porque o fetch e a câmera
// funcionam melhor em "contexto seguro".
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'HandFX',
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.setMenuBarVisibility(false);

  if (DEV) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadURL('app://hand-fx/index.html');
  }
}

app.whenReady().then(() => {
  protocol.handle('app', async (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';

    const file = path.normalize(path.join(DIST, pathname));
    // Impede acessar arquivos fora da pasta dist
    if (!file.startsWith(DIST)) return new Response('Acesso negado', { status: 403 });

    const res = await net.fetch(pathToFileURL(file).toString());
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return res;
    return new Response(res.body, { status: res.status, headers: { 'content-type': type } });
  });

  // Libera o uso da câmera
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
