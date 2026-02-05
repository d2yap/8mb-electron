import React from 'react'

export default function Controls({
  fileName, setFileName,
  fileSize, setFileSize,
  quality, setQuality,
  outputFormat, setOutputFormat,
  noAudio, setNoAudio,
  chooseOutputFolder,
  selectedOutputFolder
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <label>Output Filename</label>
      <input id="fileNameInput" type="text" value={fileName} onChange={(e)=>setFileName(e.target.value)} placeholder="compressed.mp4" />

      <label>Output Format</label>
      <select id="outputFormat" value={outputFormat} onChange={(e)=>setOutputFormat(e.target.value)}>
        <option value="mp4">MP4</option>
        <option value="webm">WebM</option>
        <option value="mov">MOV</option>
        <option value="avi">AVI</option>
      </select>

      <label>Quality (1-51): <span id="qualityValue">{quality}</span></label>
      <input id="qualityInput" type="range" min="1" max="51" value={quality} onChange={(e)=>setQuality(Number(e.target.value))} />

      <div className="setting-row checkbox">
        <input id="noAudioToggle" type="checkbox" checked={noAudio} onChange={(e)=>setNoAudio(e.target.checked)} />
        <label htmlFor="noAudioToggle">Remove Audio</label>
      </div>

      <div style={{ marginTop: 8 }}>
        <button id="chooseOutputFolder" onClick={chooseOutputFolder}>Select Output Folder</button>
        <div id="folderOutputDisplay" style={{ marginTop: 6, fontStyle: 'italic' }}>{selectedOutputFolder || 'None selected'}</div>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>Max filesize:</label>
        <input id="fileSizeInput" type="number" value={fileSize} onChange={(e)=>setFileSize(e.target.value)} placeholder="10" /> mb
      </div>
    </div>
  )
}
