import React from "react";
import {
  Checkbox,
  Slider,
  NativeSelect,
  TextInput,
  Divider,
  Button,
  Text,
} from "@mantine/core";

export default function Controls({
  fileName,
  setFileName,
  fileSize,
  setFileSize,
  quality,
  setQuality,
  outputFormat,
  setOutputFormat,
  noAudio,
  setNoAudio,
  chooseOutputFolder,
  selectedOutputFolder,
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <Divider label="Output Settings" my="md" />
      <TextInput
        label="Target filesize (MB)"
        description="Set the desired maximum filesize for the output video."
        variant="default"
        id="fileSizeInput"
        type="number"
        value={fileSize}
        onChange={(e) => setFileSize(e.target.value)}
        placeholder="10"
      />
      <TextInput
        label="Output Filename"
        description="Enter the desired name for the output video file."
        id="fileNameInput"
        value={fileName}
        onChange={(e) => setFileName(e.target.value)}
        placeholder="compressed.mp4"
      />

      <NativeSelect
        id="outputFormat"
        label="Output Format"
        description="Select the desired output video format."
        value={outputFormat}
        onChange={(e) => {
          console.debug("[Controls] Output format changed:", e.target.value);
          setOutputFormat(e.target.value);
        }}
        data={[
          { value: "mp4", label: "MP4" },
          { value: "webm", label: "WebM" },
          { value: "mov", label: "MOV" },
          { value: "avi", label: "AVI" },
        ]}
      />
      <Text size="sm" style={{ marginTop: 10 }}>
        Quality (1-51): <span id="qualityValue">{quality}</span>
      </Text>

      <Slider
        min={1}
        max={51}
        value={quality}
        onChange={(val) => {
          console.debug("[Controls] Quality changed:", val);
          setQuality(val);
        }}
      />
      {/* Debug: Quality */}

      <Checkbox
        style={{ marginTop: 10 }}
        id="noAudioToggle"
        label="Remove Audio"
        checked={noAudio}
        onChange={(e) => {
          console.debug("[Controls] Audio removed:", e.target.checked);
          setNoAudio(e.target.checked);
        }}
      />
      {/* Debug: Audio removed */}

      <div style={{ marginTop: 8 }}>
        <Button
          size="md"
          color="blue"
          id="chooseOutputFolder"
          onClick={() => {
            console.debug("[Controls] Output folder selected");
            chooseOutputFolder();
          }}
        >
          Select Output Folder
        </Button>
        {/* Debug: Output folder */}
        <div
          id="folderOutputDisplay"
          style={{ marginTop: 6, fontStyle: "italic" }}
        >
          {selectedOutputFolder || "None selected"}
        </div>
        <Divider label="Progress" my="md" />
      </div>
    </div>
  );
}
