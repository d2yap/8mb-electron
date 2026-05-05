import React, { useRef } from "react";
import api from "../api";
import { Button } from "@mantine/core";
export default function FileSelector({
  selectedFile,
  setSelectedFile,
  thumbnail,
  setThumbnail,
}) {
  const fileInputRef = useRef(null);

  const onHiddenFileChange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) {
      // Electron File object has a `path` property
      const p = f.path || f.name;
      setSelectedFile(p);
      // request thumbnail from main
      api
        .invoke("get-thumbnail", p)
        .then((thumb) => {
          setThumbnail(thumb);
        })
        .catch(() => setThumbnail(""));
    }
  };

  const onSelectClick = async () => {
    const filePath = await api.invoke("select-video");
    if (filePath) {
      setSelectedFile(filePath);
      api
        .invoke("get-thumbnail", filePath)
        .then((thumb) => setThumbnail(thumb))
        .catch(() => setThumbnail(""));
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    console.debug("[FileSelector] File(s) dropped:", files);
    if (files && files[0]) {
      const f = files[0];
      const p = window.api.getPath(f);
      // validate extensions via main allowed list? assume main will validate on compress
      setSelectedFile(p);
      api
        .invoke("get-thumbnail", p)
        .then((thumb) => setThumbnail(thumb))
        .catch(() => setThumbnail(""));
    }
  };

  return (
    <div
      id="dropZone"
      onDragOver={(e) => {
        e.preventDefault();
      }}
      onDrop={onDrop}
      style={{ border: "2px dashed #ccc", padding: 20, textAlign: "center" }}
    >
      <p>Drag and drop video here, or click to select file</p>
      <Button id="selectFile" onClick={onSelectClick}>
        Select Video File
      </Button>
      <div
        id="filePathDisplay"
        style={{ marginTop: 10, fontStyle: "italic", userSelect: "all" }}
      >
        {selectedFile || "None selected"}
      </div>
      <input
        ref={fileInputRef}
        id="hiddenFileInput"
        type="file"
        accept="video/*"
        style={{ display: "none" }}
        onChange={onHiddenFileChange}
      />
      {thumbnail ? (
        <img
          id="thumbnail"
          src={thumbnail}
          alt="Video thumbnail"
          style={{ display: "block", marginTop: 12, maxWidth: "100%" }}
        />
      ) : null}
    </div>
  );
}
