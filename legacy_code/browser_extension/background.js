// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.url) {
        console.log("Sending URL to LoadifyPro:", message.url, "Quality:", message.quality || 'best');
        // Send the URL and quality to the LoadifyPro HTTP server
        fetch('http://localhost:8080/add_download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                url: message.url,
                quality: message.quality || 'best'
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log("Received response from LoadifyPro:", data);
        })
        .catch(error => {
            console.error("Error sending message to LoadifyPro:", error);
        });
    }
});