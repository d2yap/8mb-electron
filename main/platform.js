// platform helpers 

const fs = require("fs");
const path = require("path");

const isWin = process.platform === "win32";
const isLinux = process.platform === "linux";

const BIN_EXT = isWin ? ".exe" : "";

// FFmpeg binary filename 
function ffmpegBinName() {
  return `ffmpeg${BIN_EXT}`;
}

// FFprobe binary filename 
function ffprobeBinName() {
  return `ffprobe${BIN_EXT}`;
}

/**
 * Resolve the FFprobe binary that sits alongside a given FFmpeg binary.
 *
 * On macOS/Linux `ffmpeg` is very often a symlink (e.g. /usr/bin/ffmpeg ->
 * /usr/lib/.../ffmpeg), so we follow the real path before looking for its
 * sibling `ffprobe`. If the path cannot be resolved we fall back to using
 * the directory of the supplied path.
 *
 * @param {string} ffmpegPath - Path to the FFmpeg binary.
 * @returns {string|null} Absolute FFprobe path, or null if input is falsy.
 */
function ffprobeFor(ffmpegPath) {
  if (!ffmpegPath) return null;

  let resolved = ffmpegPath;
  try {
    resolved = fs.realpathSync(ffmpegPath);
  } catch (e) {
    // Path may not exist yet; use the original.
  }

  return path.join(path.dirname(resolved), ffprobeBinName());
}

/**
 * File-dialog filter entry for selecting an FFmpeg executable.
 * Windows filters on ".exe"; other platforms must not restrict by extension
 * (Unix binaries typically have no extension).
 *
 * @returns {{name: string, extensions: string[]}}
 */
function executableFilter() {
  return {
    name: isWin ? "Executable" : "All files",
    extensions: isWin ? ["exe"] : ["*"],
  };
}

// Checks if the platform is Windows and returns a boolean
function supportsAutoDownload() {
  return isWin;
}

// Installation hint
function packageManagerHint() {
  if (isLinux) return "sudo apt install ffmpeg";
  return "Install FFmpeg and ensure it is on your PATH.";
}

module.exports = {
  isWin,
  isLinux,
  BIN_EXT,
  ffmpegBinName,
  ffprobeBinName,
  ffprobeFor,
  executableFilter,
  supportsAutoDownload,
  packageManagerHint,
};
