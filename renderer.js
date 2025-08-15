const { ipcRenderer } = require("electron");
const path = require("path");

//Variables
const { allowedExtensions } = require("./variables/allowedExtensions");

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
const noAudioToggle = document.getElementById("noAudioToggle");
const qualityInput = document.getElementById("qualityInput");
const dropZone = document.getElementById("dropZone");
const outputFormatSelect = document.getElementById("outputFormat");
const qualityValueSpan = document.getElementById("qualityValue");
const hiddenFileInput = document.getElementById("hiddenFileInput");
const stopCompressionBtn = document.getElementById("stopCompressionBtn");

let selectedFile = null;
let selectedOutputFolder = null;

//DEFAULTS
const DEFAULT_FILE_SIZE = 10; //mb
fileSizeDisplay.innerText = DEFAULT_FILE_SIZE;
const DEFAULT_QUALITY = 23;
qualityInput.value = DEFAULT_QUALITY;
qualityValueSpan.textContent = DEFAULT_QUALITY;

qualityInput.addEventListener("input", () => {
  qualityValueSpan.textContent = qualityInput.value;
});

// Make the entire drop zone clickable to trigger file selection
dropZone.addEventListener("click", (event) => {
  // Don't trigger if clicking on the button or other interactive elements
  if (event.target === dropZone || event.target.tagName === 'P' || event.target.id === 'filePathDisplay') {
    hiddenFileInput.click();
  }
});

// Stop compression button
stopCompressionBtn.addEventListener("click", async () => {
  try {
    await ipcRenderer.invoke("stop-compression");
    statusText.textContent = "⏹️ Compression stopped by user";
    progressBar.style.display = "none";
    setButtonsDisabled(false);
    stopCompressionBtn.style.display = "none";
  } catch (err) {
    console.error("Failed to stop compression:", err);
  }
});

// Handle file selection from the hidden input
hiddenFileInput.addEventListener("change", (event) => {
  if (event.target.files.length > 0) {
    const file = event.target.files[0];
    handleFileSelection(file.path);
  }
});

function handleFileSelection(filePath) {
  selectedFile = filePath;
  if (selectedFile) {
    filePathDisplay.textContent = selectedFile;

    //Hide thumbnail while loading
    thumbnail.style.display = "none";
    thumbnail.src = "";

    try {
      ipcRenderer.invoke("get-thumbnail", selectedFile).then(thumb => {
        thumbnail.src = thumb;
        thumbnail.style.display = "block"; // Show it when ready
      }).catch(err => {
        console.error("Failed to generate thumbnail:", err);
      });
    } catch (err) {
      console.error("Failed to generate thumbnail:", err);
    }
  } else {
    // if no file
    thumbnail.style.display = "none";
    thumbnail.src = "";
    filePathDisplay.textContent = "None selected.";
  }
}

(async () => {
  const defaultFolder = await ipcRenderer.invoke("get-default-folder");
  if (defaultFolder) {
    defaultOutputInput.value = defaultFolder;
    folderOutput.innerText = defaultFolder;
    selectedOutputFolder = defaultFolder;
  }
})();

selectFileBtn.addEventListener("click", async () => {
  const filePath = await ipcRenderer.invoke("select-video");
  handleFileSelection(filePath);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
  dropZone.classList.add('dragover');
});

dropZone.addEventListener("dragleave", (event) => {
  // Only remove the class if we're actually leaving the drop zone
  if (!dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove('dragover');
  }
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragover');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    const file = files[0];
    const fileExtension = path.extname(file.name).toLowerCase();
    if (allowedExtensions.includes(fileExtension.substring(1))) {
      handleFileSelection(file.path);
    } else {
      alert("Unsupported file type. Please drag and drop a video file.");
    }
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

function setButtonsDisabled(disabled) {
  selectFileBtn.disabled = disabled;
  chooseOutputFolderBtn.disabled = disabled;
  compressBtn.disabled = disabled;
  fileSizeInput.disabled = disabled;
  fileNameInput.disabled = disabled;
  qualityInput.disabled = disabled;
  noAudioToggle.disabled = disabled;
  outputFormatSelect.disabled = disabled;
  
  // Show/hide stop button
  stopCompressionBtn.style.display = disabled ? "block" : "none";
}

compressBtn.addEventListener("click", async () => {
  //Check if fields are empty
  if (!selectedFile || !selectedOutputFolder) {
    alert("Please select a video and output folder.");
    return;
  }

  setButtonsDisabled(true);

  let fileSize = fileSizeInput.value;
  // check if filesizeinput is a number and not less than 0
  if(isNaN(fileSize)){
    alert("Please input a valid number for the size in MB.");
    return;
  }else if(fileSize < 0 || fileSize == "" || fileSize == null){
    fileSize = DEFAULT_FILE_SIZE;
  }
  fileSizeDisplay.textContent = fileSize;

  let quality = qualityInput.value;
  if (isNaN(quality) || quality < 1 || quality > 51) {
    alert("Please input a valid quality number between 1 and 51.");
    return;
  }
  quality = parseInt(quality);

  let filename = fileNameInput.value.trim();
  const selectedOutputFormat = outputFormatSelect.value;
  // Remove existing extension and add the new one
  const baseName = path.basename(selectedFile, path.extname(selectedFile));
  filename = `${baseName}.${selectedOutputFormat}`;

  const outputPath = path.join(selectedOutputFolder, filename);

  progressBar.style.display = "block";
  progressBar.value = 0;
  statusText.textContent = "🔄 Compressing...";

  try {
    const result = await ipcRenderer.invoke("compress-video", {
      inputPath: selectedFile,
      inputSize: fileSize,
      outputPath,
      noAudio: noAudioToggle.checked,
      quality: quality,
      outputFormat: selectedOutputFormat,
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
  } finally {
    setButtonsDisabled(false);
  }
});

// Update progress bar from main
ipcRenderer.on("compression-progress", (event, percent) => {
  progressBar.style.display = "block";
  progressBar.value = percent;
});

// Listen for file drops from main process
ipcRenderer.on("file-dropped", (event, filePath) => {
  handleFileSelection(filePath);
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

