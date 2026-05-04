const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
} = require("electron");
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
const {
  getConfig,
  setDefaultOutputFolder,
  setDarkMode,
  getDarkMode,
} = require("./configManager");

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
  if (ext === null || ext === "") ext = base;

  let dir = path.dirname(filePath);
  let counter = 1;
  let newPath = filePath;

  if (inputPath.includes(`-compressed`))
    originalName = originalName.replace(/-compressed(\(\d+\))?$/, "");
  base = `${originalName}-compressed`;

  while (fs.existsSync(newPath) || base === ext) {
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
      filters: [{ name: "Videos", extensions: allowedExtensions }],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("select-folder", async () => {
    // ONLY show directories
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle("stop-compression", async () => {
    shouldStop = true;
    isProcessing = false;
    return { success: true };
  });

  ipcMain.handle(
    "compress-video",
    async (
      event,
      { inputPath, inputSize, outputPath, noAudio, quality, outputFormat },
    ) => {
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

        log.info(
          `Starting compression: input=${inputPath}, targetSize=${inputSize}MB, output=${outputPath}, noAudio=${noAudio}, quality=${quality}, format=${outputFormat}`,
        );

        await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(inputPath, (err, metadata) => {
            if (err) {
              log.error(`FFprobe error for ${inputPath}: ${err.message}`);
              return reject(new Error("FFprobe error: " + err.message));
            }
            totalTimeSeconds = metadata.format.duration;
            log.info(`Video duration: ${totalTimeSeconds}s`);
            resolve();
          });
        });

        if (totalTimeSeconds === 0) {
          log.error("Could not determine video duration.");
          return { error: "Could not determine video duration." };
        }

        const outputOptions = ["-preset", "medium", "-y"];
        let command = ffmpeg(inputPath);

        if (noAudio) {
          outputOptions.push("-an");
        }

        if (quality) {
          outputOptions.push("-crf", quality);
          log.info(`Using CRF quality: ${quality}`);
        } else {
          const targetBitrateBps = (maxSizeBytes * 8) / totalTimeSeconds;
          const targetBitrateKbps = Math.floor(targetBitrateBps / 1000);
          command.videoBitrate(targetBitrateKbps);
          log.info(
            `Using bitrate mode: target ${targetBitrateKbps} kbps (calculated from ${maxSizeBytes} bytes / ${totalTimeSeconds}s)`,
          );
        }

        await new Promise((resolve, reject) => {
          let lastPercent = 0;
          command
            .outputOptions(outputOptions)
            .output(outputPath)
            .on("progress", (p) => {
              // Check if user wants to stop
              if (shouldStop) {
                log.info("Compression stopped by user");
                command.kill("SIGKILL");
                reject(new Error("Compression stopped by user"));
                return;
              }
              // Debug raw values
              log.silly(
                `ffmpeg progress raw: percent=${p.percent} timemark=${p.timemark} frames=${p.frames}`,
              );

              // Prefer percent if provided by ffmpeg
              let percent = null;
              if (typeof p.percent === "number" && !isNaN(p.percent)) {
                percent = p.percent;
              } else if (p.timemark) {
                try {
                  const parts = p.timemark.split(":").map(Number);
                  let seconds = 0;
                  if (parts.length === 3)
                    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                  else if (parts.length === 2)
                    seconds = parts[0] * 60 + parts[1];
                  else seconds = Number(p.timemark) || 0;
                  if (totalTimeSeconds && !isNaN(seconds)) {
                    percent = (seconds / totalTimeSeconds) * 100;
                  }
                } catch (e) {
                  percent = 0;
                }
              }

              if (percent === null || isNaN(percent)) percent = 0;
              percent = Math.max(0, Math.min(100, percent));

              // Enforce monotonic increase (allow final jump to 100)
              if (percent < lastPercent && lastPercent < 99) {
                percent = lastPercent;
              }

              lastPercent = percent;
              log.debug(`Compression progress: ${percent.toFixed(2)}%`);
              event.sender.send("compression-progress", percent);
            })
            .on("end", () => {
              try {
                finalSize = fs.statSync(outputPath).size;
                log.info(
                  `Compression finished: output=${outputPath}, size=${finalSize} bytes (${(finalSize / (1024 * 1024)).toFixed(2)}MB)`,
                );
                resolve();
              } catch (err) {
                log.error(
                  `Failed to stat output file ${outputPath}: ${err.message}`,
                );
                reject(new Error("Failed to stat output file."));
              }
            })
            .on("error", (err) => {
              log.error(`FFmpeg error: ${err.message}`);
              reject(new Error("FFmpeg error: " + err.message));
            })
            .run();
        });

        return { outputPath, size: finalSize };
      } catch (err) {
        log.error(`Compression failed: ${err.message}`);
        // Clean up partial output file if compression was stopped
        if (shouldStop && fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
            log.info(`Cleaned up partial file: ${outputPath}`);
          } catch (cleanupErr) {
            log.error(`Failed to cleanup partial file: ${cleanupErr.message}`);
          }
        }
        return { error: err.message };
      } finally {
        isProcessing = false;
        shouldStop = false;
      }
    },
  );

  //grabs an image from the video
  ipcMain.handle("get-thumbnail", async (event, inputPath) => {
    return new Promise((resolve, reject) => {
      const thumbnailPath = path.join(
        app.getPath("temp"),
        `thumb-${Date.now()}.jpg`,
      );

      ffmpeg(inputPath)
        .screenshots({
          timestamps: ["1"],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: "320x?",
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

    expressApp.get("/", (req, res) =>
      res.send(`<a href=\"/file\">Download ${filename}</a>`),
    );
    expressApp.get("/file", (req, res) => res.download(filePath));
    server = expressApp.listen(port);

    const localIP = Object.values(os.networkInterfaces())
      .flat()
      .find((i) => i.family === "IPv4" && !i.internal).address;

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
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });

  //Notification when done
  ipcMain.on("task-complete", (event, message) => {
    new Notification({
      title: "Task complete!",
      body: message || "Compression is done.",
    }).show();
  });

  ipcMain.handle("get-default-folder", () => {
    try {
      const cfg = getConfig();
      log.debug("get-default-folder ->", cfg);
      return cfg.defaultOutputFolder;
    } catch (e) {
      log.error("get-default-folder error:", e && e.message);
      return null;
    }
  });

  ipcMain.handle("save-default-folder", (event, folderPath) => {
    try {
      setDefaultOutputFolder(folderPath);
      log.info(`save-default-folder -> ${folderPath}`);
    } catch (e) {
      log.error("save-default-folder error:", e && e.message);
    }
  });

  // Dark mode persistence
  ipcMain.handle("get-dark-mode", () => {
    try {
      const val = getDarkMode();
      log.debug(`get-dark-mode -> ${val}`);
      return val;
    } catch (e) {
      log.error("get-dark-mode error:", e && e.message);
      return false;
    }
  });

  ipcMain.handle("save-dark-mode", (event, value) => {
    try {
      setDarkMode(!!value);
      log.info(`save-dark-mode -> ${!!value}`);
    } catch (e) {
      log.error("save-dark-mode error:", e && e.message);
    }
  });
}

module.exports = { registerIpcHandlers };
