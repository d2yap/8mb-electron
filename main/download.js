const https = require("https");
const fs = require("fs");
const path = require("path");
const unzipper = require("unzipper");
const { app } = require("electron");

//config setting
const { setFFmpegPath } = require("./configManager");

function downloadWithRedirect(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          if (response.headers.location) {
            resolve(
              downloadWithRedirect(response.headers.location, file, onProgress),
            );
          } else {
            reject(new Error("Redirected but no location header"));
          }
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download FFmpeg: Status code ${response.statusCode}`,
            ),
          );
          return;
        }

        const totalSize = parseInt(response.headers["content-length"], 10);
        let downloaded = 0;

        response.on("data", (chunk) => {
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
      })
      .on("error", reject);
  });
}

async function downloadFFmpegWindows(onProgress) {
  const downloadUrl =
    "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip";
  const downloadPath = path.join(app.getPath("userData"), "ffmpeg.zip");
  const extractPath = path.join(app.getPath("userData"), "ffmpeg");

  const file = fs.createWriteStream(downloadPath);

  await downloadWithRedirect(downloadUrl, file, onProgress);

  // Remove any previous extraction to ensure newer version replaces older
  try {
    if (fs.existsSync(extractPath)) {
      fs.rmSync(extractPath, { recursive: true, force: true });
    }
  } catch (e) {
    console.warn(
      "Could not remove previous ffmpeg extract folder:",
      e.message || e,
    );
  }

  return new Promise((resolve, reject) => {
    fs.createReadStream(downloadPath)
      .pipe(unzipper.Extract({ path: extractPath }))
      .on("close", () => {
        fs.unlink(downloadPath, (err) => {
          if (err) console.warn("Failed to delete ffmpeg.zip:", err);
        });
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
  if (!fs.existsSync(folder)) throw new Error("FFmpeg folder not found");
  const files = fs.readdirSync(folder, { withFileTypes: true });
  // Filter directories that look like the expected ffmpeg build folders
  const candidates = files
    .filter(
      (f) =>
        f.isDirectory() &&
        f.name.toLowerCase().includes("ffmpeg") &&
        f.name.toLowerCase().includes("essentials_build"),
    )
    .map((f) => ({ name: f.name, full: path.join(folder, f.name) }));

  if (candidates.length === 0) throw new Error("FFmpeg folder not found");

  // Try to pick the newest by parsing version numbers in the folder name
  const parsed = candidates.map((c) => {
    const m = c.name.match(/(\d+(?:\.\d+)*)/);
    return { ...c, version: m ? m[1] : null };
  });

  parsed.sort((a, b) => {
    if (a.version && b.version) {
      const as = a.version.split(".").map(Number);
      const bs = b.version.split(".").map(Number);
      for (let i = 0; i < Math.max(as.length, bs.length); i++) {
        const av = as[i] || 0;
        const bv = bs[i] || 0;
        if (av !== bv) return bv - av; // descending
      }
      return 0;
    }
    if (a.version) return -1;
    if (b.version) return 1;
    // Fallback to mtime descending
    const aStat = fs.statSync(a.full);
    const bStat = fs.statSync(b.full);
    return bStat.mtimeMs - aStat.mtimeMs;
  });

  const chosen = parsed[0];
  const ffmpegExe = path.join(chosen.full, "bin", "ffmpeg.exe");
  if (!fs.existsSync(ffmpegExe))
    throw new Error("ffmpeg.exe not found in " + chosen.full);
  return ffmpegExe;
}

module.exports = { downloadFFmpegWindows, findFFmpegBinary };
