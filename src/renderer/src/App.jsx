import React, { useEffect, useState } from 'react'
import FileSelector from './components/FileSelector'
import Controls from './components/Controls'
import Progress from './components/Progress'
import Settings from './components/Settings'
import api, { api as apiObj, path } from './api'

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [thumbnail, setThumbnail] = useState('')
  const [selectedOutputFolder, setSelectedOutputFolder] = useState('')
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(10)
  const [quality, setQuality] = useState(23)
  const [outputFormat, setOutputFormat] = useState('mp4')
  const [noAudio, setNoAudio] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('Idle')
  const [isCompressing, setIsCompressing] = useState(false)
  const [defaultOutput, setDefaultOutput] = useState('')
  const [darkMode, setDarkMode] = useState(false)
  const [qrCode, setQrCode] = useState(false)
  const [activeTab, setActiveTab] = useState('compressTab')

  useEffect(() => {
    // get default folder
    api.invoke('get-default-folder').then(folder => {
      if (folder) {
        setDefaultOutput(folder)
        setSelectedOutputFolder(folder)
      }
    }).catch(()=>{})

    // load dark mode setting
    const stored = window.localStorage.getItem('dark-mode') === 'true'
    setDarkMode(stored)
    document.body.classList.toggle('dark', stored)

    const offProgress = api.on && api.on('compression-progress', (percent) => {
      console.debug('[react] compression-progress', percent)
      let p = Number(percent)
      if (!isNaN(p) && p > 0 && p <= 1) p = p * 100
      if (isNaN(p)) return
      p = Math.max(0, Math.min(100, p))
      setProgress(p)
      setStatus('Compressing')
    })

    const offFileDropped = api.on && api.on('file-dropped', (filePath) => {
      setSelectedFile(filePath)
      api.invoke('get-thumbnail', filePath).then(thumb => setThumbnail(thumb)).catch(()=>setThumbnail(''))
    })

    return () => {
      if (typeof offProgress === 'function') offProgress()
      if (typeof offFileDropped === 'function') offFileDropped()
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('dark-mode', darkMode)
    document.body.classList.toggle('dark', darkMode)
  }, [darkMode])

  const chooseOutputFolder = async () => {
    const folder = await api.invoke('select-folder')
    if (folder) setSelectedOutputFolder(folder)
  }

  const onChooseDefaultFolder = async () => {
    const folder = await api.invoke('select-default-folder')
    if (folder) {
      setDefaultOutput(folder)
      setSelectedOutputFolder(folder)
      await api.invoke('save-default-folder', folder)
    }
  }

  const setButtonsDisabled = (disabled) => {
    setIsCompressing(disabled)
  }

  const onStopCompression = async () => {
    try {
      await api.invoke('stop-compression')
      setStatus('⏹️ Compression stopped by user')
      setProgress(0)
      setButtonsDisabled(false)
    } catch (err) {
      console.error('Failed to stop compression:', err)
    }
  }

  const onCompress = async () => {
    if (!selectedFile || !selectedOutputFolder) {
      window.alert('Please select a video and output folder.')
      return
    }

    setButtonsDisabled(true)

    let fsVal = fileSize
    if (isNaN(fsVal) || fsVal === '' || fsVal === null) {
      window.alert('Please input a valid number for the size in MB.')
      setButtonsDisabled(false)
      return
    }

    let q = quality
    if (isNaN(q) || q < 1 || q > 51) {
      window.alert('Please input a valid quality number between 1 and 51.')
      setButtonsDisabled(false)
      return
    }

    const baseName = path.basename(selectedFile, path.extname(selectedFile))
    const filename = `${baseName}.${outputFormat}`
    const outputPath = path.join(selectedOutputFolder, filename)

    setProgress(0)
    setStatus('🔄 Compressing...')

    try {
      const result = await api.invoke('compress-video', {
        inputPath: selectedFile,
        inputSize: fsVal,
        outputPath,
        noAudio: noAudio,
        quality: q,
        outputFormat,
      })

      if (result && result.error) throw new Error(result.error)

      setProgress(0)
      setStatus(`✅ Done: ${result.outputPath} ${(result.size/(1024*1024)).toFixed(2)}mb`)
      setThumbnail('')
      api.send('task-complete', `${result.outputPath} ${(result.size/(1024*1024)).toFixed(2)}mb`)
      if (qrCode) await api.invoke('serve-video', result.outputPath)
    } catch (err) {
      setStatus(`❌ Error: ${err.message || 'Unknown error.'}`)
      console.error('[react] compression error', err)
    } finally {
      setButtonsDisabled(false)
    }
  }

  return (
    <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
      <h1>8mb</h1>
      <div className="tabs">
        <button className={`shadcn-button ${activeTab==='compressTab'?'active':''}`} onClick={()=>setActiveTab('compressTab')}>Compress</button>
        <button className={`shadcn-button ${activeTab==='settingsTab'?'active':''}`} onClick={()=>setActiveTab('settingsTab')}>Settings</button>
      </div>

      <div id="compressTab" className={`tab-content ${activeTab==='compressTab' ? 'active' : ''}`}>
          <div className="file-size">
            <p>Max filesize:</p>
            <input id="fileSizeInput" type="number" value={fileSize} onChange={(e)=>setFileSize(e.target.value)} />
            <p>mb</p>
          </div>

          <FileSelector selectedFile={selectedFile} setSelectedFile={setSelectedFile} thumbnail={thumbnail} setThumbnail={setThumbnail} />

          <Controls fileName={fileName} setFileName={setFileName} fileSize={fileSize} setFileSize={setFileSize} quality={quality} setQuality={setQuality} outputFormat={outputFormat} setOutputFormat={setOutputFormat} noAudio={noAudio} setNoAudio={setNoAudio} chooseOutputFolder={chooseOutputFolder} selectedOutputFolder={selectedOutputFolder} />

          <Progress progress={progress} status={status} />

          <div className="button-row" style={{ marginTop: 12 }}>
            <button id="compressBtn" className="primary" disabled={isCompressing} onClick={onCompress}>Compress Video</button>
            <button id="stopCompressionBtn" className="danger" style={{ display: isCompressing ? 'block' : 'none' }} onClick={onStopCompression}>Stop Compression</button>
          </div>
        </div>

      <div id="settingsTab" className={`tab-content ${activeTab==='settingsTab' ? 'active' : ''}`}>
        <Settings defaultOutput={defaultOutput} setDefaultOutput={setDefaultOutput} onChooseDefaultFolder={onChooseDefaultFolder} darkMode={darkMode} setDarkMode={setDarkMode} qrCode={qrCode} setQrCode={setQrCode} />
      </div>
    </div>
  )
}
