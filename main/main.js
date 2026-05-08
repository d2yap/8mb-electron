const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const { registerIpcHandlers } = require("./ipcHandlers");
const { getConfig } = require("./configManager");
const fs = require("fs");
const configManager = require("./configManager");
const { downloadFFmpegWindows } = require("./download");
const path = require("path");
const { allowedExtensions } = require("../variables/allowedExtensions");

//logging / debug stuff
const log = require("electron-log");

let mainWindow;
let loadingWindow;

const { exec } = require("child_process");

/**
 * Looks for FFmpeg and returns null if FFmpeg is not found from the config
 * * @async
 * @param {Electron.BrowserWindow} mainWindow - app window
 * @returns {Promise<string|null>} Resolves promise with normalized FFmpeg path or null if no exe is found.
 *
 * > null value is used for choiceFFmpeg to look for a file path
 */
async function setupFFmpeg(mainWindow) {
  // Get the ffmpeg config file path
  let ffmpegPath = configManager.getConfig().ffmpegPath;

  // clean file path
  try {
    if (ffmpegPath) ffmpegPath = path.normalize(ffmpegPath);
  } catch (e) {}

  if (ffmpegPath && fs.existsSync(ffmpegPath)) {
    console.log("Using existing FFmpeg at:", ffmpegPath);
    return ffmpegPath;
  }

  // go to setup
  return null;
}

/**
 * Helps the FFmpeg process by notifying the user through the loading window.
 * * @async
 * @param {Electron.BrowserWindow} loadingWindow - Window used to visualize process and recieve user choices through IPC
 * @returns {Promise<string|void>} Promise that resolves with a valid FFmpeg path, or void if the process completes through UI resolve.
 */
async function choiceFFmpeg(loadingWindow) {
  const configPath = await setupFFmpeg(loadingWindow);
  if (configPath) return configPath;

  return new Promise((resolve) => {
    const handleChoice = async (event, choice) => {
      try {
        if (!loadingWindow || !loadingWindow.webContents) return;

        if (choice === "download") {
          try {
            const ffmpegPath = await downloadFFmpegWindows((percent) => {
              if (loadingWindow && loadingWindow.webContents)
                loadingWindow.webContents.send(
                  "ffmpeg-download-progress",
                  percent,
                );
            });
            configManager.setFFmpegPath(ffmpegPath);
            loadingWindow.webContents.send("ffmpeg-setup-complete", ffmpegPath);
            ipcMain.removeListener("ffmpeg-choice", handleChoice);
            return resolve();
          } catch (err) {
            console.error("Download failed:", err);
            loadingWindow.webContents.send(
              "ffmpeg-setup-error",
              err.message || String(err),
            );
            return;
          }
        }

        // Locate
        if (choice === "locate") {
          try {
            const res = await dialog.showOpenDialog(loadingWindow, {
              properties: ["openFile"],
              filters: [
                {
                  name: "Executable",
                  extensions: process.platform === "win32" ? ["exe"] : [],
                },
              ],
            });
            if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
              loadingWindow.webContents.send(
                "ffmpeg-setup-error",
                "File selection cancelled",
              );
              return;
            }
            const chosen = res.filePaths[0];
            if (!fs.existsSync(chosen)) {
              loadingWindow.webContents.send(
                "ffmpeg-setup-error",
                "Selected file does not exist",
              );
              return;
            }
            configManager.setFFmpegPath(chosen);
            loadingWindow.webContents.send("ffmpeg-setup-complete", chosen);
            ipcMain.removeListener("ffmpeg-choice", handleChoice);
            return resolve();
          } catch (err) {
            loadingWindow.webContents.send(
              "ffmpeg-setup-error",
              err.message || String(err),
            );
            return;
          }
        }

        // Auto-detect
        if (choice === "auto-detect") {
          const whichCmd =
            process.platform === "win32" ? "where ffmpeg" : "which ffmpeg";
          exec(whichCmd, (err, stdout) => {
            if (err || !stdout) {
              loadingWindow.webContents.send(
                "ffmpeg-setup-error",
                "ffmpeg not found on PATH",
              );
              return;
            }
            const candidate = stdout.split(/\r?\n/)[0].trim();
            if (!candidate || !fs.existsSync(candidate)) {
              loadingWindow.webContents.send(
                "ffmpeg-setup-error",
                "ffmpeg not found on PATH",
              );
              return;
            }
            try {
              configManager.setFFmpegPath(candidate);
              loadingWindow.webContents.send(
                "ffmpeg-setup-complete",
                candidate,
              );
              ipcMain.removeListener("ffmpeg-choice", handleChoice);
              return resolve();
            } catch (e) {
              loadingWindow.webContents.send(
                "ffmpeg-setup-error",
                e.message || String(e),
              );
              return;
            }
          });
        }
      } catch (e) {
        console.error("Error handling ffmpeg choice:", e);
        if (loadingWindow && loadingWindow.webContents)
          loadingWindow.webContents.send(
            "ffmpeg-setup-error",
            e.message || String(e),
          );
      }
    };

    ipcMain.on("ffmpeg-choice", handleChoice);
  });
}

/**
 * Window for handling downloading/ffmpeg location
 */
function createLoadingWindow() {
  loadingWindow = new BrowserWindow({
    width: 500,
    height: 300,
    icon: path.join(__dirname, "..", "icon", "favicon.ico"),
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

// actual window
function createWindow() {
  const devUrl = process.env.VITE_DEV_SERVER_URL; // set by dev script when running Vite

  mainWindow = new BrowserWindow({
    width: 700,
    height: 750,
    icon: path.join(__dirname, "..", "icon", "favicon.ico"),
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "preload.js"),
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
    const indexPath = path.join(__dirname, "..", "dist", "index.html");
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      // Fallback to legacy index.html if present
      mainWindow.loadFile("index.html");
    }
  }
  mainWindow.setMenu(null);
  //mainWindow.webContents.openDevTools(); // Enable developer tools

  // Handle file drops at the window level -> this is for file dropping
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file:///")) {
      event.preventDefault();
      // Extract file path from URL and send to renderer
      const filePath = url.replace("file:///", "");
      if (filePath) {
        const fileExtension = path.extname(filePath).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
          mainWindow.webContents.send("file-dropped", filePath);
        }
      }
    }
  });
}

// Set app user model ID for Windows taskbar
if (process.platform === "win64") {
  app.setAppUserModelId("com.github.d2yap");
}

app.whenReady().then(async () => {
  getConfig(); // load config

  createLoadingWindow();

  // Check for user's FFmpeg file path, etc
  await choiceFFmpeg(loadingWindow);

  if (loadingWindow) {
    loadingWindow.close();
    loadingWindow = null;
  }

  createWindow();
  registerIpcHandlers();
});
