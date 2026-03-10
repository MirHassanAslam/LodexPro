function addDownloadButton(videoElement) {
    if (videoElement.hasAttribute('data-loadify-button')) {
        return; // Button already exists
    }
    videoElement.setAttribute('data-loadify-button', 'true');

    const button = document.createElement('button');
    button.innerText = 'Download with LoadifyPro';
    button.style.position = 'absolute';
    button.style.top = '10px';
    button.style.right = '10px';
    button.style.zIndex = '9999';
    button.style.padding = '8px 12px';
    button.style.backgroundColor = '#00d4ff';
    button.style.color = '#1a1a1a';
    button.style.border = 'none';
    button.style.borderRadius = '5px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '12px';
    button.style.fontWeight = 'bold';
    
    // Make sure the video's container can hold a positioned element
    const container = videoElement.parentElement;
    if (getComputedStyle(container).position === 'static') {
        container.style.position = 'relative';
    }

    button.onclick = (e) => {
        e.stopPropagation();
        const videoUrl = window.location.href; // For sites like YouTube, the page URL is needed
        console.log("Button clicked, sending URL:", videoUrl);
        chrome.runtime.sendMessage({ url: videoUrl });
    };

    container.appendChild(button);
}

// Find all video elements on the page and add the button
function findVideosAndAddButtons() {
    document.querySelectorAll('video').forEach(addDownloadButton);
}

// Run initially and then check for new videos periodically
findVideosAndAddButtons();
setInterval(findVideosAndAddButtons, 3000); // Check every 3 seconds
```

You'll also need a small icon file named `icon48.png` inside the `browser_extension` folder. You can use any 48x48 pixel PNG image.

---
### **Phase 3: Connecting Everything**

This is the final, crucial step that tells Chrome how to find and run your Python listener.

#### **File 6 of 6: The Native Host Manifest**
This is a special JSON file. It **must not** be in your project folder. You have to place it in a specific system directory.

1.  Create a new file named `com.loadifypro.integration.json`.
2.  Paste the following code into it. **You must edit the "path" value to point to your project.**

```json
{
    "name": "com.loadifypro.integration",
    "description": "Host for communicating with LoadifyPro",
    "path": "C:\\path\\to\\your\\LODIFYPRO 2.0\\run_host.bat",
    "type": "stdio",
    "allowed_origins": [
        "chrome-extension://YOUR_EXTENSION_ID_HERE/"
    ]
}
