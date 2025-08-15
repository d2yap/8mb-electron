const { app, BrowserWindow, ipcMain, dialog, Notification } = require("electron");
const fs = require("fs");
const os = require("os");
const express = require("express");
const QRCode = require("qrcode");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

//Debugging
const log = require("electron-log");

//Constant Variables
const { allowedExtensions } = require("../variables/allowedExtensions");
const { getConfig, setDefaultOutputFolder } = require("./configManager");

let server;
//For processing loops
let isProcessing = false;
let shouldStop = false;

function getAvailableFilename(filePath, inputPath) {
  let ext = path.extname(filePath);
  let base = path.basename(filePath, ext);
  let inputExt = path.extname(inputPath);
  let originalName = path.basename(inputPath, inputExt);

  //If there is no extension found, it might be that the base has the extension name. 
  // Example if what was inserted was .mp4 -> .mp4 will be the base so we have to give it back to the "ext" variable.
  // Since when compressBtn is called it attaches a .mp4
  if(ext === null || ext === "") ext = base;

  let dir = path.dirname(filePath);
  let counter = 1;
  let newPath = filePath;

  if(inputPath.includes(`-compressed`)) originalName = originalName.replace(/-compressed(\(\d+\))?$/, "");
  base = `${originalName}-compressed`;

  while (fs.existsSync(newPath) || (base === ext)) {
    newPath = path.join(dir, `${base}(${counter})${ext}`);
    counter++;
  }

  return newPath;
}

function registerIpcHandlers() {
ipcMain.handle("select-video", async () => {
  // ONLY show files with these extensions..
  const result = await dialog.showOpenDialog({
  properties: ["openFile"],
  filters: [{ name: "Videos", extensions: allowedExtensions}]
});
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("select-folder", async () => {
  // ONLY show directories
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("stop-compression", async () => {
  shouldStop = true;
  isProcessing = false;
  return { success: true };
});

ipcMain.handle("compress-video", async (event, { inputPath, inputSize, outputPath, noAudio, quality, outputFormat }) => {
  if (isProcessing) {
    return { error: "Compression already in progress." };
  }
  isProcessing = true;
  shouldStop = false;
  try {
    outputPath = getAvailableFilename(outputPath, inputPath);
    const maxSizeBytes = inputSize * 1024 * 1024;
    let finalSize = 0;
    let totalTimeSeconds = 0;

    await new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (err, metadata) => {
        if (err) {
          return reject(new Error("FFprobe error: " + err.message));
        }
        totalTimeSeconds = metadata.format.duration;
        resolve();
      });
    });

    if (totalTimeSeconds === 0) {
      return { error: "Could not determine video duration." };
    }

    const outputOptions = ["-preset", "medium", "-y"];
    let command = ffmpeg(inputPath);

    if (noAudio) {
      outputOptions.push("-an");
    }

    if (quality) {
      outputOptions.push("-crf", quality);
    } else {
      const targetBitrate = (maxSizeBytes * 8) / totalTimeSeconds;
      command.videoBitrate(targetBitrate);
    }

    await new Promise((resolve, reject) => {
      command
        .outputOptions(outputOptions)
        .output(outputPath)
        .on("progress", p => {
          // Check if user wants to stop
          if (shouldStop) {
            command.kill('SIGKILL');
            reject(new Error("Compression stopped by user"));
            return;
          }
          
          const time = parseInt(p.timemark.replace(/:/g, '')) || 0;
          const percent = totalTimeSeconds ? (time / (totalTimeSeconds * 100)) * 100 : 0;
          event.sender.send("compression-progress", percent);
        })
        .on("end", () => {
          try {
            finalSize = fs.statSync(outputPath).size;
            resolve();
          } catch (err) {
            reject(new Error("Failed to stat output file."));
          }
        })
        .on("error", err => {
          reject(new Error("FFmpeg error: " + err.message));
        })
        .run();
    });

    return { outputPath, size: finalSize };
  } catch (err) {
    // Clean up partial output file if compression was stopped
    if (shouldStop && fs.existsSync(outputPath)) {
      try {
        fs.unlinkSync(outputPath);
      } catch (cleanupErr) {
        console.error("Failed to cleanup partial file:", cleanupErr);
      }
    }
    return { error: err.message };
  } finally {
    isProcessing = false;
    shouldStop = false;
  }
});

//grabs an image from the video
ipcMain.handle("get-thumbnail", async (event, inputPath) => {
  return new Promise((resolve, reject) => {
    const thumbnailPath = path.join(app.getPath("temp"), `thumb-${Date.now()}.jpg`);

    ffmpeg(inputPath)
      .screenshots({
        timestamps: ["1"],
        filename: path.basename(thumbnailPath),
        folder: path.dirname(thumbnailPath),
        size: "320x?"
      })
      .on("end", () => {
        fs.readFile(thumbnailPath, (err, data) => {
          if (err) return reject(err);
          resolve(`data:image/jpeg;base64,${data.toString("base64")}`);
          fs.unlink(thumbnailPath, () => {});
        });
      })
      .on("error", reject);
  });
});

//IP stuff
ipcMain.handle("serve-video", async (event, filePath) => {
  if (server) server.close();
  const expressApp = express();
  //Change this soon..
  const port = 4321;
  const filename = path.basename(filePath);

  expressApp.get("/", (req, res) => res.send(`<a href=\"/file\">Download ${filename}</a>`));
  expressApp.get("/file", (req, res) => res.download(filePath));
  server = expressApp.listen(port);

  const localIP = Object.values(os.networkInterfaces())
    .flat()
    .find(i => i.family === "IPv4" && !i.internal).address;

  const url = `http://${localIP}:${port}/file`;
  const qr = await QRCode.toDataURL(url);

  const qrWindow = new BrowserWindow({
    width: 400,
    height: 500,
    title: "QR Code",
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  qrWindow.loadFile("qr.html");
  qrWindow.webContents.on("did-finish-load", () => {
    qrWindow.webContents.send("load-qr", { qr, url });
  });

  return { url };
});

//Select Default Folder selection
ipcMain.handle("select-default-folder", async () => {
  const result = await dialog.showOpenDialog({ properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0];
});

//Notification when done
ipcMain.on('task-complete', (event, message)=>{
  new Notification({
    title: 'Task complete!',
    body: message || 'Compression is done.'}).show();
  });

ipcMain.handle("get-default-folder", () => {
  return getConfig().defaultOutputFolder;
});

ipcMain.handle("save-default-folder", (event, folderPath) => {
  setDefaultOutputFolder(folderPath);
});

}

module.exports = { registerIpcHandlers };