# 🌐 LoadifyPro Browser Integration Setup

This guide will help you set up browser integration for LoadifyPro, allowing you to download videos and files directly from your browser.

## 📋 Prerequisites

- LoadifyPro 2.0 application running
- Google Chrome browser
- Python 3.7+ installed

## 🚀 Quick Setup

### Step 1: Install the Browser Extension

1. **Run the installer:**
   ```bash
   python install_extension.py
   ```

2. **Open Chrome and go to:** `chrome://extensions/`

3. **Enable Developer Mode:**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension:**
   - Click "Load unpacked"
   - Select the `browser_extension` folder created by the installer

5. **Get the Extension ID:**
   - Copy the Extension ID from the extension card (looks like: `abcdefghijklmnopqrstuvwxyz123456`)

6. **Complete the setup:**
   ```bash
   python install_extension.py YOUR_EXTENSION_ID
   ```

### Step 2: Start LoadifyPro

1. **Launch LoadifyPro:**
   ```bash
   python main_app.py
   ```

2. **Verify integration:**
   - The application will automatically start listening for browser messages
   - You should see "Browser integration listener thread started" in the logs

## 🎯 How It Works

### Browser Extension Features:
- **Video Detection**: Automatically detects video elements on web pages
- **Download Button**: Adds a "Download with LoadifyPro" button to videos
- **Native Messaging**: Communicates with LoadifyPro via Chrome's native messaging API

### Integration Flow:
1. **User visits a video website** (YouTube, Vimeo, etc.)
2. **Extension detects video** and adds download button
3. **User clicks button** to send URL to LoadifyPro
4. **LoadifyPro receives URL** and automatically starts download
5. **Download appears** in LoadifyPro's interface

## 🔧 Technical Details

### Files Created:
- `browser_extension/` - Chrome extension files
- `browser_integration.py` - Native messaging listener
- `run_host.bat` - Windows batch file to launch integration
- Native host manifest in Chrome's directory

### Communication:
- **Protocol**: Chrome Native Messaging
- **Format**: JSON messages via stdin/stdout
- **Queue**: Thread-safe message queue for UI updates

## 🛠️ Troubleshooting

### Extension Not Working:
1. **Check Developer Mode**: Ensure it's enabled in Chrome
2. **Verify Extension ID**: Make sure it's correctly set in the native host manifest
3. **Check Console**: Open Chrome DevTools to see any errors

### LoadifyPro Not Receiving URLs:
1. **Check Logs**: Look for "Browser integration listener thread started"
2. **Verify Native Host**: Check if `com.loadifypro.integration.json` exists
3. **Restart Both**: Close Chrome and LoadifyPro, then restart

### Permission Issues:
1. **Run as Administrator**: If you get permission errors
2. **Check File Paths**: Ensure all paths in the manifest are correct
3. **Antivirus**: Some antivirus software may block native messaging

## 📁 File Structure

```
LodifyPro 2.0/
├── main_app.py                 # Updated with browser integration
├── browser_integration.py      # Native messaging listener
├── install_extension.py        # Extension installer
├── run_host.bat               # Windows launcher
├── browser_extension/         # Chrome extension files
│   ├── manifest.json
│   ├── content_script.js
│   └── background.js
└── BROWSER_INTEGRATION_README.md
```

## 🎉 Success!

Once set up, you'll be able to:
- ✅ Download videos directly from YouTube, Vimeo, and other sites
- ✅ See download progress in LoadifyPro's interface
- ✅ Use all of LoadifyPro's features (antivirus scanning, speed limiting, etc.)
- ✅ Enjoy seamless browser integration like IDM

## 🔄 Updates

To update the extension:
1. Run `python install_extension.py` again
2. Reload the extension in Chrome
3. Restart LoadifyPro

---

**Need Help?** Check the logs in `loadifypro.log` for detailed information about any issues.
