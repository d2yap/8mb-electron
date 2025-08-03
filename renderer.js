const { ipcRenderer } = require("electron");
const path = require("path");

//Variables
const { allowedExtensions } = require("./variables/allowedExtensions");
const { match } = require("assert");

//Logging / debug stuff
const log = require("electron-log");

//MAYBE I should start separating this into individual files
const selectFileBtn = document.getElementById("selectFile");
const filePathDisplay = document.getElementById("filePathDisplay");
const chooseOutputFolderBtn = document.getElementById("chooseOutputFolder");
const compressBtn = document.getElementById("compressBtn");
const fileNameInput = document.getElementById("fileNameInput");
const fileSizeInput = document.getElementById("fileSizeInput");
const fileSizeDisplay = document.getElementById("fileSizeDisplay");
const progressBar = document.getElementById("progressBar");
const statusText = document.getElementById("statusText");
const thumbnail = document.getElementById("thumbnail");
const folderOutput = document.getElementById("folderOutputDisplay");
const defaultOutputInput = document.getElementById("defaultOutput");
const chooseDefaultFolderBtn = document.getElementById("chooseDefaultFolder");
const darkModeToggle = document.getElementById("darkModeToggle");
const qrCodeToggle = document.getElementById("qrCodeToggle");
const downloadProgressBar = document.getElementById("downloadProgressBar");

let selectedFile = null;
let selectedOutputFolder = null;

//DEFAULTS
const DEFAULT_FILE_SIZE = 10; //mb
fileSizeDisplay.innerText = DEFAULT_FILE_SIZE;

(async () => {
  const defaultFolder = await ipcRenderer.invoke("get-default-folder");
  if (defaultFolder) {
    defaultOutputInput.value = defaultFolder;
    folderOutput.innerText = defaultFolder;
    selectedOutputFolder = defaultFolder;
  }
})();

selectFileBtn.addEventListener("click", async () => {
  selectedFile = await ipcRenderer.invoke("select-video");

  if (selectedFile) {
    filePathDisplay.textContent = selectedFile;

    //Hide thumbnail while loading
    thumbnail.style.display = "none";
    thumbnail.src = "";

    try {
      const thumb = await ipcRenderer.invoke("get-thumbnail", selectedFile);
      thumbnail.src = thumb;
      thumbnail.style.display = "block"; // Show it when ready
    } catch (err) {
      console.error("Failed to generate thumbnail:", err);
    }
  } else {
    // if no file
    thumbnail.style.display = "none";
    thumbnail.src = "";
    filePathDisplay.textContent = "None selected.";
  }
});


chooseOutputFolderBtn.addEventListener("click", async () => {
  selectedOutputFolder = await ipcRenderer.invoke("select-folder");

  //Display Output folder
  if(selectedOutputFolder){
    folderOutput.textContent = selectedOutputFolder;
  }else{
    folderOutput.textContent = "None selected";
  }

});

compressBtn.addEventListener("click", async () => {

  //Check   if fields are empty
  if (!selectedFile || !selectedOutputFolder) {
    alert("Please select a video and output folder.");
    return;
  }

  let fileSize = fileSizeInput.value;
  // check if filesizeinput is a number and not less than 0
  if(isNaN(fileSize)){
    alert("Please input a valid number for the size in MB.");
    return;
  }else if(fileSize < 0 || fileSize == "" || fileSize == null){
    fileSize = DEFAULT_FILE_SIZE;
  }
  fileSizeDisplay.textContent = fileSize;

  let filename = fileNameInput.value.trim();
  const matchedExtension = allowedExtensions.find(e => selectedFile.toLowerCase().endsWith(e));
  if (matchedExtension) {
    filename += ("." + matchedExtension);
  }else{
    alert("This extension is not allowed.");
    return;
  }

  const outputPath = path.join(selectedOutputFolder, filename);

  progressBar.style.display = "block";
  progressBar.value = 0;
  statusText.textContent = "🔄 Compressing...";

  try {
  const result = await ipcRenderer.invoke("compress-video", {
    inputPath: selectedFile,
    inputSize: fileSize,
    outputPath,
  });

  if (result.error) {
    throw new Error(result.error);
  }

  progressBar.style.display = "none";
  const sizeInMB = (result.size / (1024 * 1024)).toFixed(2);
  statusText.textContent = `✅ Done: ${result.outputPath} ${sizeInMB}mb`;
  thumbnail.style.display = "none";

  // QR stuff
  ipcRenderer.send('task-complete', `${result.outputPath} ${sizeInMB}mb`);
  if (qrCodeToggle.checked) {
    await ipcRenderer.invoke("serve-video", result.outputPath);
  }

} catch (err) {
  progressBar.style.display = "none";
  statusText.textContent = `❌ Error: ${err.message || "Unknown error."}`;
}
});

// Update progress bar from main
ipcRenderer.on("compression-progress", (event, percent) => {
  progressBar.style.display = "block";
  progressBar.value = percent;
  
});

// Default folder selection
chooseDefaultFolderBtn.addEventListener("click", async () => {
  const folder = await ipcRenderer.invoke("select-default-folder");
  if (folder) {
    defaultOutputInput.value = folder;
    selectedOutputFolder = folder;
    await ipcRenderer.invoke("save-default-folder", folder);
  }
});

// Tabs functionality
const tabButtons = document.querySelectorAll(".tab-btn");
const tabContents = document.querySelectorAll(".tab-content");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    tabContents.forEach((tab) => {
      tab.classList.remove("active");
      if (tab.id === target) tab.classList.add("active");
    });
  });
});

// Dark mode toggle
function setDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
  window.localStorage.setItem("dark-mode", enabled);
}

darkModeToggle.addEventListener("change", () => {
  setDarkMode(darkModeToggle.checked);
});

// Load dark mode setting
const darkModeStored = window.localStorage.getItem("dark-mode") === "true";
darkModeToggle.checked = darkModeStored;
setDarkMode(darkModeStored);

