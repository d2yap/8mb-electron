import React from "react";
import { Checkbox, Button, TextInput } from "@mantine/core";
export default function Settings({
  defaultOutput,
  setDefaultOutput,
  onChooseDefaultFolder,
  onChooseFFmpegPath,
  ffmpegPath,
  darkMode,
  setDarkMode,
  qrCode,
  setQrCode,
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="setting-row">
        <TextInput
          label="Default Output Folder"
          id="defaultOutput"
          value={defaultOutput || ""}
          readOnly
        />
        <Button id="chooseDefaultFolder" onClick={onChooseDefaultFolder}>
          Choose Folder
        </Button>
      </div>

      <div className="setting-row">
        <TextInput
          label="FFmpeg Path"
          id="ffmpegPath"
          value={ffmpegPath || ""}
          readOnly
        />
        <Button id="chooseFFmpegPath" onClick={onChooseFFmpegPath}>
          Choose FFmpeg Path
        </Button>
      </div>

      <div className="setting-row checkbox">
        <Checkbox
          id="darkModeToggle"
          label="Dark Mode"
          description="Enable dark mode."
          checked={darkMode}
          onChange={(e) => setDarkMode(e.target.checked)}
        />
      </div>

      <div className="setting-row checkbox">
        <Checkbox
          id="qrCodeToggle"
          label="Generate QR Code"
          description="Opens a server to generate a QR code to scan with your phone."
          checked={qrCode}
          onChange={(e) => setQrCode(e.target.checked)}
        />
      </div>
    </div>
  );
}
