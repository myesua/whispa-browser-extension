chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'requestMicAccess') {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        console.log('Microphone granted!');
        sendResponse({ status: 'success', stream });
      })
      .catch((err) => {
        console.error('Mic denied:', err);
        sendResponse({ status: 'error', message: err.message });
      });
    return true;
  }
});
