# 8mb-electron

File size compression software using FFMPEG.
![Screenshot of the program](readme/screenshot.png)

## Features

- Compression of videos with one click
- Easy PC to Phone file transfer using QR codes. (One way)

## Running in the development environment

1. Run `npm install`.
2. Start the renderer dev server and Electron together:

```bash
npm run dev
```

This runs Vite (renderer) and Electron concurrently. To run only Electron (legacy start):

```bash
npm start
```

## File access

This program will access your user data folder in order to store configuration files.

- Default Output Folder
- Dependencies required for the program to work (FFmpeg)
- Program does not include FFmpeg out of the box

## Release
The release is a portable version for Windows. [Click here for the Releases page.](https://github.com/d2yap/8mb-electron/releases)
