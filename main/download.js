const https = require("https");
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { app } = require("electron");

//config setting
const { setFFmpegPath } = require("./configManager");

function downloadWithRedirect(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        if (response.headers.location) {
          resolve(downloadWithRedirect(response.headers.location, file, onProgress));
        } else {
          reject(new Error("Redirected but no location header"));
        }
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download FFmpeg: Status code ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (onProgress && totalSize) {
          const percent = Math.round((downloaded / totalSize) * 100);
          onProgress(percent);
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", reject);
  });
}

async function downloadFFmpegWindows(onProgress) {
  const downloadUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
  const downloadPath = path.join(app.getPath("userData"), "ffmpeg.zip");
  const extractPath = path.join(app.getPath("userData"), "ffmpeg");

  const file = fs.createWriteStream(downloadPath);

  await downloadWithRedirect(downloadUrl, file, onProgress);

  return new Promise((resolve, reject) => {
    fs.createReadStream(downloadPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on("close", () => {
            fs.unlink(downloadPath, (err) => {if (err) console.warn("Failed to delete ffmpeg.zip:", err);});
        try {
          const binaryPath = findFFmpegBinary(extractPath);
          setFFmpegPath(binaryPath);
          resolve(binaryPath);
        } catch (err) {
          reject(err);
        }
      })
      .on("error", reject);
  });
}

function findFFmpegBinary(folder) {
  const files = fs.readdirSync(folder, { withFileTypes: true });
  const ffmpegFolder = files.find(
    f => f.isDirectory() && f.name.includes("ffmpeg") && f.name.includes("essentials_build")
  );

  if (!ffmpegFolder) throw new Error("FFmpeg folder not found");

  return path.join(folder, ffmpegFolder.name, "bin", "ffmpeg.exe");
}

module.exports = { downloadFFmpegWindows };