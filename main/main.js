const { app, BrowserWindow, ipcMain } = require("electron");
const { registerIpcHandlers } = require("./ipcHandlers");
const { getConfig } = require("./configManager");
const fs = require("fs");
const ffmpeg = require("fluent-ffmpeg");
const configManager = require("./configManager");
const { downloadFFmpegWindows } = require("./download"); 
const path = require("path");

//logging / debug stuff
const log = require("electron-log");

let mainWindow;
let loadingWindow;

async function setupFFmpeg(mainWindow) {
  let ffmpegPath = configManager.getConfig().ffmpegPath;
  console.log('Configured ffmpegPath (raw):', ffmpegPath);
  try {
    if (ffmpegPath) ffmpegPath = path.normalize(ffmpegPath);
  } catch (e) {
    // ignore
  }

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.log("FFmpeg not found or invalid path. Downloading...");
    try {
      ffmpegPath = await downloadFFmpegWindows((percent) => {
        if (mainWindow && mainWindow.webContents) {
          console.log("Download progress:", percent);
          mainWindow.webContents.send("ffmpeg-download-progress", percent);
        }
      });
      try { ffmpegPath = path.normalize(ffmpegPath); } catch (e) {}
      console.log("FFmpeg downloaded to:", ffmpegPath);
    } catch (error) {
      console.error("FFmpeg download failed:", error);
      process.exit(0);
    }
  } else {
    console.log("Using existing FFmpeg at:", ffmpegPath);
  }

  // Final validation: ensure file exists, else attempt to find in userData/ffmpeg
  if (!fs.existsSync(ffmpegPath)) {
    try {
      const { findFFmpegBinary } = require('./download');
      const candidate = findFFmpegBinary(path.join(app.getPath('userData'), 'ffmpeg'));
      if (candidate && fs.existsSync(candidate)) {
        ffmpegPath = path.normalize(candidate);
        console.log('Located ffmpeg binary at:', ffmpegPath);
        configManager.setFFmpegPath(ffmpegPath);
      } else {
        console.error('Failed to locate ffmpeg binary after download.');
      }
    } catch (err) {
      console.error('Error searching for ffmpeg binary:', err);
    }
  }

  console.log('Setting ffmpeg path for fluent-ffmpeg to:', ffmpegPath);
  ffmpeg.setFfmpegPath(ffmpegPath);
}



function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
  });

  loadingWindow.loadFile("loading.html");
  loadingWindow.setMenu(null);
}

function createWindow() {
  const devUrl = process.env.VITE_DEV_SERVER_URL; // set by dev script when running Vite

  mainWindow = new BrowserWindow({
    width: 700,
    height: 750,
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      navigateOnDragDrop: true,
    },
    autoHideMenuBar: true,
  });

  if (devUrl) {
    // In dev, Vite will serve the renderer app
    mainWindow.loadURL(devUrl);
  } else {
    // In production, load the built renderer from dist
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // Fallback to legacy index.html if present
      mainWindow.loadFile('index.html');
    }
  }
  mainWindow.setMenu(null);
  mainWindow.webContents.openDevTools(); // Enable developer tools

  // Handle file drops at the window level
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith('file:///')) {
      event.preventDefault();
      // Extract file path from URL and send to renderer
      const filePath = url.replace('file:///', '');
      if (filePath) {
        const fileExtension = path.extname(filePath).toLowerCase();
        const allowedExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm'];
        if (allowedExtensions.includes(fileExtension)) {
          mainWindow.webContents.send('file-dropped', filePath);
        }
      }
    }
  });
}

app.whenReady().then(async () => {
  getConfig();  // load config

  createLoadingWindow();

  await setupFFmpeg(loadingWindow);

  if (loadingWindow) {
    loadingWindow.close();
    loadingWindow = null;
  }

  createWindow();
  registerIpcHandlers();
});
