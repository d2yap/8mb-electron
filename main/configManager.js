const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const log = require("electron-log");

const configPath = path.join(app.getPath("userData"), "config.json");

const defaultConfig = {
  defaultOutputFolder: "",
  ffmpegPath: "",
  darkMode: false,
};

function configCheck() {
  try {
    if (!fs.existsSync(configPath)) {
      log.warn(`Config not found at ${configPath}`);
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    }
  } catch (e) {
    log.error(`configCheck error for ${configPath}: ${e && e.message}`);
    throw e;
  }
}

function getConfig() {
  configCheck();
  try {
    log.debug(`Reading config from ${configPath}`);
    const raw = fs.readFileSync(configPath, { encoding: "utf8" });
    const parsed = JSON.parse(raw || "{}");
    log.silly("Loaded config", parsed);
    return parsed;
  } catch (e) {
    log.error(
      `Failed to read/parse config at ${configPath}: ${e && e.message}`,
    );
    // attempt to recover by rewriting default config
    try {
      log.warn(`Rewriting default config to ${configPath}`);
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      return JSON.parse(JSON.stringify(defaultConfig));
    } catch (writeErr) {
      log.error(
        `Failed to rewrite default config: ${writeErr && writeErr.message}`,
      );
      throw writeErr;
    }
  }
}
function setDefaultOutputFolder(folderPath) {
  try {
    const config = getConfig();
    config.defaultOutputFolder = folderPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log.info(`Saved defaultOutputFolder=${folderPath} to ${configPath}`);
  } catch (e) {
    log.error(`setDefaultOutputFolder error: ${e && e.message}`);
    throw e;
  }
}

function setFFmpegPath(ffmpegPath) {
  try {
    const config = getConfig();
    // Normalize path to avoid stray separators/newlines
    try {
      ffmpegPath = path.normalize(ffmpegPath);
    } catch (e) {
      // fallback: keep original
    }
    config.ffmpegPath = ffmpegPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log.info(`Saved ffmpegPath=${ffmpegPath} to ${configPath}`);
  } catch (e) {
    log.error(`setFFmpegPath error: ${e && e.message}`);
    throw e;
  }
}

function getFFmpegPath() {
  const config = getConfig();
  log.silly(`getFFmpegPath -> ${config.ffmpegPath}`);
  return config.ffmpegPath;
}

function setDarkMode(value) {
  try {
    const config = getConfig();
    config.darkMode = !!value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    log.info(`Saved darkMode=${!!value} to ${configPath}`);
  } catch (e) {
    log.error(`setDarkMode error: ${e && e.message}`);
    throw e;
  }
}

function getDarkMode() {
  const config = getConfig();
  log.debug(`getDarkMode -> ${!!config.darkMode}`);
  return !!config.darkMode;
}

module.exports = {
  getConfig,
  setDefaultOutputFolder,
  setFFmpegPath,
  getFFmpegPath,
  setDarkMode,
  getDarkMode,
};
