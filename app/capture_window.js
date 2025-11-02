// THE RECORDER

let recorder;
let data = [];
let activeStream;

document.addEventListener('DOMContentLoaded', () => {
  const urlParams = new URLSearchParams(window.location.search);
  const tabId = parseInt(urlParams.get('tabId'));

  if (!tabId) {
    chrome.runtime.sendMessage({
      action: 'capture_window_error',
      error: 'Missing target tab ID.',
    });
    window.close();
    return;
  }

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((stream) => {
      activeStream = stream;
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      data = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          data.push(event.data);
        }
      };

      recorder.start();
      chrome.runtime.sendMessage({
        action: 'capture_window_recording_started',
        originalTabId: tabId,
      });
    })
    .catch((error) => {
      chrome.runtime.sendMessage({
        action: 'capture_window_error',
        error: error.message,
      });

      setTimeout(() => window.close(), 1500);
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'popup_stopRecording') {
    if (!recorder || recorder.state !== 'recording') {
      sendResponse({
        success: false,
        error: 'Recorder not active or initialized.',
      });
      return false;
    }

    new Promise((resolve) => {
      const finalDataHandler = (event) => {
        if (event.data.size > 0) {
          data.push(event.data);
        }
        recorder.removeEventListener('dataavailable', finalDataHandler);
        resolve();
      };

      recorder.addEventListener('dataavailable', finalDataHandler);
      recorder.requestData();
    })
      .then(() => {
        recorder.onstop = () => {
          console.log(
            `Recorder: Stop event fired. Total chunks: ${data.length}`
          );
          processAudio();
          activeStream.getTracks().forEach((track) => track.stop());
          sendResponse({ success: true });
          setTimeout(() => window.close(), 100);
        };
        recorder.stop();
      })
      .catch((error) => {
        console.error('Error during audio finalization:', error);
        sendResponse({ success: false, error: 'Audio finalization error.' });
      });

    return true;
  }
});

function processAudio() {
  if (data.length === 0) {
    console.error('No audio data captured.');
    return;
  }

  const audioBlob = new Blob(data, {
    type: recorder.mimeType,
  });

  const mimeType = recorder.mimeType;
  const extensionMatch = mimeType.match(/\/(.*?)(;|$)/);
  const fileExtension = extensionMatch ? `${extensionMatch[1]}` : 'webm';

  const reader = new FileReader();

  reader.onloadend = function () {
    const base64Data = reader.result;

    console.log(`Base64 string length: ${base64Data.length} characters.`);

    chrome.runtime.sendMessage({
      action: 'content_processAndTranscribeAudio',
      audioBase64: base64Data,
      audioExtension: fileExtension,
    });
  };

  reader.readAsDataURL(audioBlob);

  data = [];
}
