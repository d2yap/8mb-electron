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

  if (!ffmpegPath || !fs.existsSync(ffmpegPath)) {
    console.log("FFmpeg not found or invalid path. Downloading...");
    try {
      ffmpegPath = await downloadFFmpegWindows((percent) => {
        if (mainWindow && mainWindow.webContents) {
          console.log("Download progress:", percent);
          mainWindow.webContents.send("ffmpeg-download-progress", percent);
        }
      });
      console.log("FFmpeg downloaded to:", ffmpegPath);
    } catch (error) {
      console.error("FFmpeg download failed:", error);
      process.exit(0);
    }
  } else {
    console.log("Using existing FFmpeg at:", ffmpegPath);
  }

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
  mainWindow = new BrowserWindow({
    width: 700,
    height: 750,
    acceptFirstMouse: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      navigateOnDragDrop: true,
      // webSecurity: false,
      // nodeIntegrationInWorker: true,
      // enableRemoteModule: true,
      // nativeWindowOpen: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile("index.html");
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
