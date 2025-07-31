const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const configPath = path.join(app.getPath("userData"), "config.json");

const defaultConfig = {
    defaultOutputFolder: ""
};

function configCheck(){
    if(!fs.existsSync(configPath)) fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
}

function getConfig(){
    configCheck();
    const raw = fs.readFileSync(configPath);
    return JSON.parse(raw);
}
function setDefaultOutputFolder(folderPath){
    const config = getConfig();
    config.defaultOutputFolder = folderPath;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { getConfig, setDefaultOutputFolder };