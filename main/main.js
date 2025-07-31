const { app, BrowserWindow } = require("electron");
const { registerIpcHandlers } = require("./ipcHandlers");
const { getConfig } = require("./configManager");

//Logging / debug stuff
const log = require("electron-log");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 700,
    height: 750,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile("index.html");
  mainWindow.setMenu(null);
}

app.whenReady().then(() => {
  getConfig();            //DefaultOutputFolder
  createWindow();         //Window
  registerIpcHandlers();  //Register
});