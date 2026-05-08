const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  Notification,
} = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const express = require("express");
const QRCode = require("qrcode");
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
  getFFmpegPath,
} = require("./configManager");

let server;
//For processing loops
let isProcessing = false;
let shouldStop = false;
let compressionProcess = null;

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

// ============================================
// HELPER FUNCTIONS: ffmpeg CLI via spawn()
// ============================================

/**
 * Get video duration using ffprobe
 * Replaces: ffmpeg.ffprobe() / old fluent-ffmpeg implementation
 */
function getVideoDuration(inputPath) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) {
      return reject(new Error("FFmpeg path not configured"));
    }

    // ffprobe is in the same directory as ffmpeg
    const ffprobePath = path.join(path.dirname(ffmpegPath), "ffprobe.exe");

    log.info(`Attempting to run ffprobe: ${ffprobePath}`);
    log.info(`Input file: ${inputPath}`);

    // Check if ffprobe exists
    if (!fs.existsSync(ffprobePath)) {
      return reject(new Error(`ffprobe not found at ${ffprobePath}`));
    }

    // Use JSON output format (more reliable across versions)
    const ffprobe = spawn(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      inputPath,
    ]);

    let output = "";
    let errorOutput = "";

    ffprobe.stdout.on("data", (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on("data", (data) => {
      errorOutput += data.toString();
      log.error(`ffprobe stderr: ${data.toString()}`);
    });

    ffprobe.on("close", (code) => {
      if (code !== 0) {
        log.error(`ffprobe exited with code ${code}, stderr: ${errorOutput}`);
        return reject(
          new Error(`ffprobe failed with code ${code}: ${errorOutput}`),
        );
      }
      try {
        const json = JSON.parse(output);
        const duration = parseFloat(json.format.duration);
        if (isNaN(duration)) {
          log.error(`Could not parse duration from JSON: ${output}`);
          return reject(new Error("Could not parse duration"));
        }
        log.info(`Parsed duration: ${duration}s`);
        resolve(duration);
      } catch (err) {
        log.error(`Failed to parse ffprobe JSON output: ${err.message}`);
        return reject(err);
      }
    });

    ffprobe.on("error", (err) => {
      log.error(`ffprobe spawn error: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Compress video using spawn with progress tracking
 * Replaces: ffmpeg(inputPath).outputOptions(...).run()
 */
async function compressVideoWithSpawn({
  inputPath,
  outputPath,
  targetSizeMB,
  quality = null, // if null, use bitrate targeting instead
  noAudio = false,
  totalTimeSeconds,
  onProgress,
  eventSender,
}) {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) throw new Error("FFmpeg path not configured");

  // If a target size is set, ALWAYS use bitrate mode
  let videoBitrateArg = null;
  let crfArg = null;
  // Safety margin to prevent overshooting target size
  const SAFETY_MARGIN_MB = 0.05;
  const effectiveTargetMB = targetSizeMB - SAFETY_MARGIN_MB;

  if (targetSizeMB && totalTimeSeconds > 0) {
    const audioBitrateKbps = noAudio ? 0 : 128;
    const targetBits = effectiveTargetMB * 1024 * 1024 * 8;
    const audioBits = audioBitrateKbps * 1000 * totalTimeSeconds;
    const videoBits = targetBits - audioBits;
    const videoBitrateKbps = Math.max(
      100,
      Math.floor(videoBits / totalTimeSeconds / 1000),
    );
    videoBitrateArg = `${videoBitrateKbps}k`;
    log.info(
      `Bitrate mode: ${videoBitrateKbps} kbps (target ${targetSizeMB}MB, ${totalTimeSeconds}s)`,
    );
  } else if (quality) {
    crfArg = String(quality);
    log.info(`CRF mode: ${quality}`);
  } else {
    crfArg = "23"; // fallback
  }

  // check if output is webm or mp4
  const ext = path.extname(outputPath).toLowerCase();
  const isWebM = ext === ".webm";
  const args = ["-i", inputPath, "-y"];
  // WEBM
  if (isWebM) {
    args.push(
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      videoBitrateArg,
      "-deadline",
      "good",
      "-cpu-used",
      "2",
    );

    if (videoBitrateArg) {
      args.push("-b:v", videoBitrateArg);
    } else {
      args.push("-crf", crfArg || "33", "-b:v", "0");
    }

    if (noAudio) {
      args.push("-an");
    } else {
      args.push("-c:a", "libopus", "-b:a", "128k");
    }
  } else {
    if (ext === ".mov") {
      // MOV
      args.push("-c:v", "libx264", "-preset", "medium");
      if (crfArg) {
        args.push("-crf", crfArg);
      } else {
        args.push(
          "-b:v",
          videoBitrateArg,
          "-maxrate",
          videoBitrateArg,
          "-bufsize",
          `${parseInt(videoBitrateArg) * 2}k`,
        );
      }
      if (noAudio) {
        args.push("-an");
      } else {
        args.push("-c:a", "aac", "-b:a", "128k");
      }
    } else if (ext === ".avi") {
      // AVI
      args.push("-c:v", "mpeg4");
      if (crfArg) {
        const q = Math.max(1, Math.min(31, parseInt(crfArg) || 5));
        args.push("-qscale:v", String(q));
      } else {
        args.push(
          "-b:v",
          videoBitrateArg,
          "-maxrate",
          videoBitrateArg,
          "-bufsize",
          `${parseInt(videoBitrateArg) * 2}k`,
        );
      }
      if (noAudio) {
        args.push("-an");
      } else {
        args.push("-c:a", "libmp3lame", "-b:a", "128k");
      }
    } else {
      // MP4/MKV
      args.push("-c:v", "libx264", "-preset", "medium");
      if (crfArg) {
        args.push("-crf", crfArg);
      } else {
        args.push(
          "-b:v",
          videoBitrateArg,
          "-maxrate",
          videoBitrateArg,
          "-bufsize",
          `${parseInt(videoBitrateArg) * 2}k`,
        );
      }
      if (noAudio) {
        args.push("-an");
      } else {
        args.push("-c:a", "aac", "-b:a", "128k");
      }
    }
  }

  args.push(outputPath);

  return new Promise((resolve, reject) => {
    compressionProcess = spawn(ffmpegPath, args);
    let lastPercent = 0;

    // ffmpeg writes progress info to stderr
    compressionProcess.stderr.on("data", (data) => {
      if (shouldStop) return;

      const stderr = data.toString();

      // Parse progress line: "time=HH:MM:SS.ss"
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const [, hours, minutes, seconds] = timeMatch;
        const currentSeconds =
          parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        let percent = (currentSeconds / totalTimeSeconds) * 100;
        percent = Math.min(99, Math.max(0, percent)); // Clamp 0-99

        // Only report if changed by at least 1%
        if (percent >= lastPercent + 1) {
          lastPercent = percent;
          log.debug(`Compression progress: ${percent.toFixed(2)}%`);
          if (eventSender) {
            eventSender.send("compression-progress", percent);
          }
          if (onProgress) onProgress(percent);
        }
      }
    });

    compressionProcess.on("close", (code) => {
      compressionProcess = null;
      if (code === 0) {
        // Success
        if (eventSender) {
          eventSender.send("compression-progress", 100);
        }
        resolve();
      } else {
        log.error(`ffmpeg exited with code ${code}`);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    compressionProcess.on("error", (err) => {
      compressionProcess = null;
      log.error(`ffmpeg error: ${err.message}`);
      reject(err);
    });
  });
}

/**
 * Extract a frame from video as thumbnail
 * Replaces: ffmpeg(inputPath).screenshots()
 */
async function generateThumbnail(inputPath, outputPath, timeSeconds = 1) {
  const ffmpegPath = getFFmpegPath();
  if (!ffmpegPath) {
    throw new Error("FFmpeg path not configured");
  }

  const args = [
    "-i",
    inputPath,
    "-ss",
    String(timeSeconds),
    "-vf",
    "scale=320:-1",
    "-vframes",
    "1",
    "-f",
    "image2",
    "-y",
    outputPath,
  ];

  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, args);

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        log.error(`ffmpeg thumbnail failed with code ${code}`);
        reject(new Error(`ffmpeg thumbnail failed with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      log.error(`ffmpeg thumbnail error: ${err.message}`);
      reject(err);
    });
  });
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
    if (compressionProcess) {
      compressionProcess.kill("SIGKILL");
      compressionProcess = null;
    }
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
        let finalSize = 0;
        let totalTimeSeconds = 0;

        log.info(
          `Starting compression: input=${inputPath}, targetSize=${inputSize}MB, output=${outputPath}, noAudio=${noAudio}, quality=${quality}, format=${outputFormat}`,
        );

        // Get video duration using ffprobe
        try {
          totalTimeSeconds = await getVideoDuration(inputPath);
          log.info(`Video duration: ${totalTimeSeconds}s`);
        } catch (err) {
          log.error(`Failed to get video duration: ${err.message}`);
          return { error: "Could not determine video duration." };
        }

        if (totalTimeSeconds === 0) {
          log.error("Could not determine video duration.");
          return { error: "Could not determine video duration." };
        }

        // Run compression with spawn
        try {
          await compressVideoWithSpawn({
            inputPath,
            outputPath,
            targetSizeMB: inputSize,
            quality,
            noAudio,
            totalTimeSeconds,
            eventSender: event.sender,
          });
        } catch (err) {
          log.error(`Compression failed: ${err.message}`);
          throw err;
        }

        // Get output file size
        try {
          finalSize = fs.statSync(outputPath).size;
          log.info(
            `Compression finished: output=${outputPath}, size=${finalSize} bytes (${(finalSize / (1024 * 1024)).toFixed(2)}MB)`,
          );
        } catch (err) {
          log.error(`Failed to stat output file: ${err.message}`);
          return { error: "Failed to stat output file." };
        }

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
        compressionProcess = null;
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

      generateThumbnail(inputPath, thumbnailPath, 1)
        .then(() => {
          fs.readFile(thumbnailPath, (err, data) => {
            // Clean up temp file
            fs.unlink(thumbnailPath, () => {});

            if (err) return reject(err);
            resolve(`data:image/jpeg;base64,${data.toString("base64")}`);
          });
        })
        .catch(reject);
    });
  });

  //IP stuff
  ipcMain.handle("serve-video", async (event, filePath) => {
    try {
      // Validate file exists
      if (!fs.existsSync(filePath)) {
        throw new Error("File not found");
      }

      // Close previous server if it exists
      if (server) {
        await new Promise((resolve) => server.close(resolve));
      }

      const expressApp = express();
      const filename = path.basename(filePath);

      expressApp.get("/", (req, res) =>
        res.send(`<a href="/file">Download ${filename}</a>`),
      );
      expressApp.get("/file", (req, res) => res.download(filePath));

      // Find available port (let OS choose)
      const port = await new Promise((resolve, reject) => {
        const srv = expressApp.listen(0, () => {
          const assignedPort = srv.address().port;
          srv.close(() => resolve(assignedPort));
        });
        srv.on("error", reject);
      });

      // Start server on the found port
      await new Promise((resolve, reject) => {
        server = expressApp.listen(port, (err) => {
          if (err) reject(err);
          else resolve();
        });
        server.on("error", reject);
      });

      // Get local IP with fallback to localhost
      const localIP =
        Object.values(os.networkInterfaces())
          .flat()
          .find((i) => i.family === "IPv4" && !i.internal)?.address ||
        "localhost";

      const url = `http://${localIP}:${port}/file`;
      const qr = await QRCode.toDataURL(url);

      const qrWindow = new BrowserWindow({
        width: 400,
        height: 500,
        title: "QR Code",
        resizable: false,
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: path.join(__dirname, "..", "preload.js"),
        },
      });

      qrWindow.loadFile("qr.html");
      qrWindow.webContents.on("did-finish-load", () => {
        qrWindow.webContents.send("load-qr", { qr, url });
      });

      // Clean up server when window closes
      qrWindow.on("closed", () => {
        if (server) {
          server.close();
          server = null;
        }
      });

      log.info(`Serving video at http://${localIP}:${port}`);
      return { url };
    } catch (err) {
      log.error(`serve-video error: ${err.message}`);
      return { error: err.message };
    }
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

  // Return project dependencies from package.json for About dialog
  ipcMain.handle("get-dependencies", async () => {
    try {
      const pkgPath = path.join(__dirname, "..", "package.json");
      if (!fs.existsSync(pkgPath)) return { dependencies: {} };
      const raw = fs.readFileSync(pkgPath, { encoding: "utf8" });
      const parsed = JSON.parse(raw || "{}");
      return {
        dependencies: parsed.dependencies || {},
      };
    } catch (err) {
      log.error("get-dependencies error:", err && err.message);
      return { dependencies: {} };
    }
  });

  // Open file dialog to choose ffmpeg executable and save to config
  ipcMain.handle("choose-ffmpeg-path", async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Executables", extensions: ["exe", ""] }],
      });
      if (result.canceled || !result.filePaths || result.filePaths.length === 0)
        return null;
      const chosen = result.filePaths[0];
      try {
        // persist selection
        const { setFFmpegPath } = require("./configManager");
        setFFmpegPath(chosen);
      } catch (e) {
        log.error("Failed to save ffmpegPath:", e && e.message);
      }
      return chosen;
    } catch (err) {
      log.error("choose-ffmpeg-path error:", err && err.message);
      return null;
    }
  });

  ipcMain.handle("get-ffmpeg-path", async () => {
    try {
      const { getFFmpegPath } = require("./configManager");
      return getFFmpegPath();
    } catch (err) {
      log.error("get-ffmpeg-path error:", err && err.message);
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
