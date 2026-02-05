import React from 'react'

export default function Settings({ defaultOutput, setDefaultOutput, onChooseDefaultFolder, darkMode, setDarkMode, qrCode, setQrCode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div className="setting-row">
        <label>Default Output Folder</label>
        <input id="defaultOutput" type="text" value={defaultOutput || ''} readOnly />
        <button id="chooseDefaultFolder" onClick={onChooseDefaultFolder}>Choose Folder</button>
      </div>

      <div className="setting-row checkbox">
        <input id="darkModeToggle" type="checkbox" checked={darkMode} onChange={(e)=>setDarkMode(e.target.checked)} />
        <label htmlFor="darkModeToggle">Dark Mode</label>
      </div>

      <div className="setting-row checkbox">
        <input id="qrCodeToggle" type="checkbox" checked={qrCode} onChange={(e)=>setQrCode(e.target.checked)} />
        <label htmlFor="qrCodeToggle">Generate QR Code</label>
      </div>
    </div>
  )
}
