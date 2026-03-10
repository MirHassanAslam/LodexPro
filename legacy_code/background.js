// The name must match the name in your host manifest JSON file
const applicationName = "com.loadifypro.integration";

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.url) {
        console.log("Sending URL to native host:", message.url);
        // Send the URL to the Python application
        chrome.runtime.sendNativeMessage(applicationName, { url: message.url },
            function(response) {
                if (chrome.runtime.lastError) {
                    console.error("Error sending message:", chrome.runtime.lastError.message);
                } else {
                    console.log("Received response from host:", response);
                }
            }
        );
    }
});
