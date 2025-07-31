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

ipcMain.handle("compress-video", async (event, { inputPath,inputSize, outputPath }) => {
  outputPath = getAvailableFilename(outputPath, inputPath);
  const maxSizeBytes = inputSize * 1024 * 1024;
  let currentBitrate = 1000;
  let attempt = 0;

  //10 attempts
  while (attempt < 10) {
    await new Promise((resolve, reject) => {

      ffmpeg(inputPath)
        .videoBitrate(currentBitrate)
        .outputOptions(["-preset fast", "-y"])
        .output(outputPath)
        .on('codecData', data => {
          // HERE YOU GET THE TOTAL TIME
          totalTime = parseInt(data.duration.replace(/:/g, '')) 
          })
        .on("progress", p => {
          //stackoverflow thing..
          const time = parseInt(p.timemark.replace(/:/g, ''))
          const percent = (time / totalTime) * 100
          event.sender.send("compression-progress", percent);

        })
        .on("end", () => {
          const finalSize = fs.statSync(outputPath).size;
          if (finalSize <= maxSizeBytes) {
            resolve();
          } else {
            currentBitrate *= 0.85;
            attempt++;
            resolve();
          }
        })
        .on("error", reject)
        .run();
    });

    const size = fs.statSync(outputPath).size;
    if (size <= maxSizeBytes) break;
  }
  const size = fs.statSync(outputPath).size;
  return { outputPath, size };
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