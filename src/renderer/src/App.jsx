import React, { useEffect, useState } from "react";
import FileSelector from "./components/FileSelector";
import Controls from "./components/Controls";
import Progress from "./components/Progress";
import Settings from "./components/Settings";
import api, { api as apiObj, path } from "./api";
import {
  MantineProvider,
  Tabs,
  Title,
  Paper,
  TextInput,
  Button,
  Text,
  Divider,
} from "@mantine/core";

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [thumbnail, setThumbnail] = useState("");
  const [selectedOutputFolder, setSelectedOutputFolder] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileSize, setFileSize] = useState(10);
  const [quality, setQuality] = useState(23);
  const [outputFormat, setOutputFormat] = useState("mp4");
  const [noAudio, setNoAudio] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [isCompressing, setIsCompressing] = useState(false);
  const [defaultOutput, setDefaultOutput] = useState("");
  const [darkMode, setDarkMode] = useState(false);
  const [darkLoaded, setDarkLoaded] = useState(false);
  const [qrCode, setQrCode] = useState(false);
  const [activeTab, setActiveTab] = useState("compressTab");
  const [ffmpegPath, setFfmpegPath] = useState("");
  const [dependencies, setDependencies] = useState({});

  useEffect(() => {
    // load dependencies for About tab
    api
      .invoke("get-dependencies")
      .then((res) => {
        if (res) {
          setDependencies(res.dependencies || {});
        }
      })
      .catch(() => {});

    // load ffmpeg path for settings
    api
      .invoke("get-ffmpeg-path")
      .then((p) => {
        if (p) setFfmpegPath(p);
      })
      .catch(() => {});

    // get default folder
    api
      .invoke("get-default-folder")
      .then((folder) => {
        if (folder) {
          setDefaultOutput(folder);
          setSelectedOutputFolder(folder);
        }
      })
      .catch(() => {});

    // load dark mode setting from main config (fallbacks to false)
    api
      .invoke("get-dark-mode")
      .then((stored) => {
        const val = !!stored;
        setDarkMode(val);
        setDarkLoaded(true);
        document.body.classList.toggle("dark", val);
      })
      .catch(() => {
        setDarkLoaded(true);
      });

    const offProgress =
      api.on &&
      api.on("compression-progress", (percent) => {
        console.debug("[react] compression-progress", percent);
        let p = Number(percent);
        if (!isNaN(p) && p > 0 && p <= 1) p = p * 100;
        if (isNaN(p)) return;
        p = Math.max(0, Math.min(100, p));
        setProgress(p);
        setStatus("Compressing");
      });

    const offFileDropped =
      api.on &&
      api.on("file-dropped", (filePath) => {
        setSelectedFile(filePath);
        api
          .invoke("get-thumbnail", filePath)
          .then((thumb) => setThumbnail(thumb))
          .catch(() => setThumbnail(""));
      });

    return () => {
      if (typeof offProgress === "function") offProgress();
      if (typeof offFileDropped === "function") offFileDropped();
    };
  }, []);

  useEffect(() => {
    // persist dark mode to app config via IPC
    // Only persist after we've loaded the stored value to avoid overwriting it
    if (darkLoaded) {
      try {
        api.invoke("save-dark-mode", !!darkMode).catch(() => {});
      } catch (e) {}
    }
    document.body.classList.toggle("dark", darkMode);
  }, [darkMode]);

  const chooseOutputFolder = async () => {
    const folder = await api.invoke("select-folder");
    if (folder) setSelectedOutputFolder(folder);
  };

  const onChooseDefaultFolder = async () => {
    const folder = await api.invoke("select-default-folder");
    if (folder) {
      setDefaultOutput(folder);
      setSelectedOutputFolder(folder);
      await api.invoke("save-default-folder", folder);
    }
  };

  const onChooseFFmpegPath = async () => {
    try {
      const chosen = await api.invoke("choose-ffmpeg-path");
      if (chosen) setFfmpegPath(chosen);
    } catch (e) {
      console.error("Failed to choose ffmpeg path:", e);
    }
  };

  const setButtonsDisabled = (disabled) => {
    setIsCompressing(disabled);
  };

  const onStopCompression = async () => {
    try {
      await api.invoke("stop-compression");
      setStatus("⏹️ Compression stopped by user");
      setProgress(0);
      setButtonsDisabled(false);
    } catch (err) {
      console.error("Failed to stop compression:", err);
    }
  };

  const onCompress = async () => {
    if (!selectedFile || !selectedOutputFolder) {
      window.alert("Please select a video and output folder.");
      return;
    }

    setButtonsDisabled(true);

    let fsVal = fileSize;
    if (isNaN(fsVal) || fsVal === "" || fsVal === null) {
      window.alert("Please input a valid number for the size in MB.");
      setButtonsDisabled(false);
      return;
    }

    let q = quality;
    if (isNaN(q) || q < 1 || q > 51) {
      window.alert("Please input a valid quality number between 1 and 51.");
      setButtonsDisabled(false);
      return;
    }

    const baseName = path.basename(selectedFile, path.extname(selectedFile));
    const filename = `${baseName}.${outputFormat}`;
    const outputPath = path.join(selectedOutputFolder, filename);

    setProgress(0);
    setStatus("🔄 Compressing...");

    try {
      const result = await api.invoke("compress-video", {
        inputPath: selectedFile,
        inputSize: fsVal,
        outputPath,
        noAudio: noAudio,
        quality: q,
        outputFormat,
      });

      if (result && result.error) throw new Error(result.error);

      setProgress(0);
      setStatus(
        `✅ Done: ${result.outputPath} ${(result.size / (1024 * 1024)).toFixed(2)}mb`,
      );
      setThumbnail("");
      api.send(
        "task-complete",
        `${result.outputPath} ${(result.size / (1024 * 1024)).toFixed(2)}mb`,
      );
      if (qrCode) await api.invoke("serve-video", result.outputPath);
    } catch (err) {
      setStatus(`❌ Error: ${err.message || "Unknown error."}`);
      console.error("[react] compression error", err);
    } finally {
      setButtonsDisabled(false);
    }
  };

  return (
    <MantineProvider
      forceColorScheme={darkMode ? "dark" : "light"}
      theme={{
        fontFamily: "JetBrains Mono, monospace",
      }}
    >
      <div style={{ padding: 16 }}>
        <Title order={1}>8mb</Title>
        <Tabs variant="pills" defaultValue="compressTab">
          <Tabs.List>
            <Tabs.Tab value="compressTab">Compress</Tabs.Tab>
            <Tabs.Tab value="settingsTab">Settings</Tabs.Tab>
            <Tabs.Tab value="aboutTab">About</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="compressTab">
            <Paper shadow="sm" radius="md" withBorder p="xl" id="compressTab">
              <FileSelector
                selectedFile={selectedFile}
                setSelectedFile={setSelectedFile}
                thumbnail={thumbnail}
                setThumbnail={setThumbnail}
              />

              <Controls
                fileName={fileName}
                setFileName={setFileName}
                fileSize={fileSize}
                setFileSize={setFileSize}
                quality={quality}
                setQuality={setQuality}
                outputFormat={outputFormat}
                setOutputFormat={setOutputFormat}
                noAudio={noAudio}
                setNoAudio={setNoAudio}
                chooseOutputFolder={chooseOutputFolder}
                selectedOutputFolder={selectedOutputFolder}
              />
              <Divider label="Progress" my="md" />
              <Progress progress={progress} status={status} />

              <div className="button-row" style={{ marginTop: 12 }}>
                <Button
                  id="compressBtn"
                  color="blue"
                  onClick={onCompress}
                  disabled={isCompressing}
                >
                  Compress Video
                </Button>
                <Button
                  id="stopCompressionBtn"
                  className="danger"
                  style={{ display: isCompressing ? "block" : "none" }}
                  onClick={onStopCompression}
                >
                  Stop Compression
                </Button>
              </div>
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="settingsTab">
            <Paper shadow="sm" radius="md" withBorder p="xl" id="settingsTab">
              <Settings
                defaultOutput={defaultOutput}
                setDefaultOutput={setDefaultOutput}
                onChooseDefaultFolder={onChooseDefaultFolder}
                onChooseFFmpegPath={onChooseFFmpegPath}
                ffmpegPath={ffmpegPath}
                darkMode={darkMode}
                setDarkMode={setDarkMode}
                qrCode={qrCode}
                setQrCode={setQrCode}
              />
            </Paper>
          </Tabs.Panel>

          <Tabs.Panel value="aboutTab">
            <Paper shadow="sm" radius="md" withBorder p="xl" id="aboutTab">
              <Title order={1}>8mb v.0.1.2</Title> <Text>Clean up version</Text>
              <Title order={4} mt="md">
                Dependencies used:
              </Title>
              {Object.keys(dependencies).length === 0 ? (
                <Text color="dim">No runtime dependencies found.</Text>
              ) : (
                <div style={{ marginTop: 8 }}>
                  {Object.entries(dependencies).map(([name, ver]) => (
                    <Text key={name} size="sm">
                      {name}: {ver}
                    </Text>
                  ))}
                </div>
              )}
            </Paper>
          </Tabs.Panel>
        </Tabs>
      </div>{" "}
    </MantineProvider>
  );
}
