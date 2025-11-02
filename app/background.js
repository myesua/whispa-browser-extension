// Background script for Whispa extension
// const API_BASE_URL = 'https://whispa-ai.onrender.com/';
const API_BASE_URL = 'http://127.0.0.1:5000';
const token = '';

// Global storage for session data (heavy image, transcription text)
const sessionData = {
  captureData: null,
  transcription: null,
  currentTabId: null,
  captureWindowId: null,
  isRecording: false,
  captureTabId: null,
};

// Helper to retrieve token from storage
async function getToken() {
  const result = await chrome.storage.local.get('token');
  return result.token ?? token;
}

// Listener for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'launchOverlay') {
    sessionData.currentTabId = request.tabId;
    chrome.scripting
      .executeScript({
        target: { tabId: request.tabId },
        files: ['content.js'],
      })
      .then(() => {
        return chrome.tabs.sendMessage(request.tabId, {
          action: 'showOverlay',
        });
      })
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'content_captureScreen') {
    const targetTabId = sessionData.currentTabId;

    if (!targetTabId) {
      sendResponse({ success: false, error: 'Session tab ID is not set.' });
      return false;
    }

    chrome.tabs
      .get(targetTabId)
      .then((tab) => {
        console.log('tab: ', tab);
        // Tab exists and is accessible. Proceed with capture.
        return captureCurrentTab(targetTabId);
      })
      .then((res) => {
        sendResponse({ success: true, message: 'Image captured and stored.' });
      })
      .catch((error) => {
        const errorMessage =
          (error.message || '').includes('No tab with id') ||
          (error.message || '').includes('No window with id')
            ? `The target tab (ID: ${targetTabId}) was closed or navigated away.`
            : error.message;

        console.error('Capture validation failed:', errorMessage);

        // Send a status update back to the overlay UI
        chrome.tabs.sendMessage(targetTabId, {
          action: 'updateStatus',
          message: `❌ Error: ${errorMessage}. Please re-launch the extension.`,
        });

        sendResponse({ success: false, error: errorMessage });
      });

    return true;
  }

  if (request.action === 'content_getCaptureData') {
    if (sessionData.captureData) {
      sendResponse({ success: true, imageData: sessionData.captureData });
    } else {
      sendResponse({ success: false, error: 'No capture data available.' });
    }
    return false;
  }

  if (request.action === 'content_requestCaptureWindow') {
    const targetTabId = sessionData.currentTabId;

    if (sessionData.isRecording) {
      if (!sessionData.captureTabId) {
        console.error('Recording stop failed: Missing captureTabId.');
        sessionData.isRecording = false;
        sendUiUpdate('ui_setButtonState', {
          buttonId: 'recordBtn',
          disabled: false,
        });
        sendResponse({ success: false, error: 'Recording state corrupted.' });
        return true;
      }
      chrome.tabs.sendMessage(
        sessionData.captureTabId,
        { action: 'popup_stopRecording' },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              'Failed to stop popup recording:',
              chrome.runtime.lastError.message
            );
            // Force reset state
            sessionData.isRecording = false;
            sendUiUpdate('ui_setButtonState', {
              buttonId: 'recordBtn',
              disabled: false,
            });
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          sessionData.isRecording = false;
          sendUiUpdate('ui_toggleMicIcon', { icon: 'icons/mic-off.svg' });
          sendUiUpdate('updateStatus', {
            message: 'Stopping recording...',
          });
          sendUiUpdate('ui_setButtonState', {
            buttonId: 'recordBtn',
            disabled: true,
          });
          sendUiUpdate('ui_setButtonState', {
            buttonId: 'generateBtn',
            disabled: false,
          });
          sendResponse({ success: true, isRecording: false });
        }
      );
      return true;
    }

    sendResponse({ success: true, message: 'Capture flow initiated.' });
    openCaptureWindow(targetTabId).catch((error) => {
      console.error('Critical failure during openCaptureWindow:', error);
      sendUiUpdate('updateStatus', {
        message: `❌ Window failed to open. Error: ${error.message}`,
      });
      sendUiUpdate('ui_setButtonState', {
        buttonId: 'recordBtn',
        disabled: false,
      });
    });
    return true;
  }

  // This message is sent from capture_window.js when recording *starts*
  if (request.action === 'capture_window_recording_started') {
    sessionData.currentTabId = request.originalTabId;
    console.log(`Mic recording started for tab ID: ${request.originalTabId}.`);

    setTimeout(
      () =>
        sendUiUpdate('updateStatus', {
          message: '🔴 Recording... Click again to stop.',
        }),
      100
    );
    sendUiUpdate('ui_setButtonState', {
      buttonId: 'generateBtn',
      disabled: true,
    });

    sessionData.isRecording = true;

    return true;
  }

  if (request.action === 'capture_window_error') {
    delete sessionData.captureWindowId;

    setTimeout(
      () =>
        sendUiUpdate('updateStatus', {
          message: `Audio Permission denied or blocked. \n Refresh Whispa extension. \n Open a new tab -> brave://extensions or chrome://extensions`,
        }),
      300
    );
    sendUiUpdate('ui_setButtonState', {
      buttonId: 'recordBtn',
      disabled: false,
    });
    return false;
  }

  if (request.action === 'content_processAndTranscribeAudio') {
    const { audioBase64, audioExtension } = request;

    console.log(
      `Received Base64 string length: ${audioBase64.length} characters.`
    );

    try {
      const parts = audioBase64.split(';base64,');
      if (parts.length !== 2) {
        console.error('Base64 string format error.');
        return;
      }

      const mimeType = `audio/${audioExtension}`;
      const base64Content = parts[1];

      const binaryString = atob(base64Content);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);

      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const fixedFile = new File(
        [bytes.buffer],
        `recording.${audioExtension}`,
        {
          type: mimeType,
        }
      );

      console.log(
        `Received audio File (Base64 Method, ${fixedFile.size} bytes). Starting transcription...`
      );

      setTimeout(
        () =>
          sendUiUpdate('updateStatus', {
            message: 'Processing audio for transcription...',
          }),
        100
      );

      // Proceed with transcription using the fixedFile
      // transcribeAudio(fixedFile, audioExtension)
      //   .then((transcription) => {
      //     if (!transcription)
      //       throw new Error('Transcription returned empty text.');

      //     sessionData.transcription = transcription;

      //     sendUiUpdate('updateStatus', {
      //       action: 'updateStatus',
      //       message: 'Transcription Complete ✅',
      //     });
      //     sendUiUpdate('ui_setButtonState', {
      //       buttonId: 'generateBtn',
      //       disabled: false,
      //     });
      //   })
      //   .catch((error) => {
      //     console.error('FAILURE during transcription:', error);
      //     sendUiUpdate('updateStatus', {
      //       message: `Transcription Failed: ${error.message}`,
      //     });
      //     sendUiUpdate('ui_setButtonState', {
      //       buttonId: 'recordBtn',
      //       disabled: false,
      //     });
      //   });
    } catch (e) {
      console.error('Failed to reconstruct File from Blob:', e);
      sendUiUpdate('updateStatus', {
        message: `FATAL ERROR: Failed to process audio data.`,
      });
    }
    return true;
  }

  if (request.action === 'content_generateNotes') {
    console.log('got here bjs');
    generateNotes()
      .then((notes) => {
        sendResponse({
          success: true,
          notesContent: notes.content,
          currentTabId: sessionData.currentTabId,
        });
      })
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'linearCreateIssue') {
    createLinearIssue({
      title: request.title,
      description: request.description,
      priority: request.priority,
      team_id: request?.team_id,
      linear_api_key: request?.linear_api_key,
      label_ids: request?.label_ids,
    })
      .then((res) => {
        sendResponse({ success: true, data: res });
      })
      .catch((error) => {
        console.error('Error creating issue:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === 'login') {
    login(request.email, request.password)
      .then((res) => {
        sendResponse({ success: true, data: res, status: res.status });
      })
      .catch((error) => {
        console.error('Error logging in:', error);
        sendResponse({
          success: false,
          error: error.message,
          status: res.status,
        });
      });
    return true;
  }
  if (request.action === 'register') {
    register(request.email, request.password, request.name)
      .then((res) => {
        sendResponse({ success: true, data: res, status: res.status });
      })
      .catch((error) => {
        console.error('Error registering:', error);
        sendResponse({
          success: false,
          error: error.message,
          status: res.status,
        });
      });
    return true;
  }
});

// API calls and functions

async function captureCurrentTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);

    if (tab.status !== 'complete') {
      throw new Error('Target tab is still loading.');
    }
    const imageData = await chrome.tabs.captureVisibleTab(tab.windowId, {
      format: 'png',
    });

    sessionData.captureData = imageData;

    return { success: true, message: 'Image captured and stored.' };
  } catch (error) {
    console.error('Error in captureCurrentTab:', error);
    throw error;
  }
}

async function sendUiUpdate(action, payload) {
  if (sessionData.currentTabId) {
    try {
      await chrome.tabs.sendMessage(sessionData.currentTabId, {
        action: action,
        ...payload,
      });
    } catch (e) {
      console.error('Failed to send UI message to tab:', e);
    }
  }
}

// Function to open the small capture window
async function openCaptureWindow(tabId) {
  try {
    const currentTab = await chrome.tabs.get(tabId);

    const currentWindow = await chrome.windows.get(currentTab.windowId);
    // -------------------------
    const popupWidth = 170;
    const popupHeight = 100;

    // Position it relative to the top-right of the current window
    const topPosition = currentWindow.top;
    const leftPosition = currentWindow.left + currentWindow.width - popupWidth;

    const windowUrl = chrome.runtime.getURL(
      `capture_window.html?tabId=${tabId}`
    );

    const captureWin = await chrome.windows.create({
      url: windowUrl,
      type: 'popup',
      width: popupWidth,
      height: popupHeight,
      focused: true,
      top: topPosition,
      left: leftPosition,
    });

    await chrome.windows.update(captureWin.id, {
      state: 'normal',
      width: popupWidth,
      height: popupHeight,
      top: topPosition,
      left: leftPosition,
      focused: true,
    });

    if (chrome.runtime.lastError) {
      throw new Error(chrome.runtime.lastError.message);
    }
    const captureTabId = captureWin.tabs[0].id;

    sessionData.captureWindowId = captureWin.id;
    sessionData.captureTabId = captureTabId;
    return captureWin;
  } catch (error) {
    console.error('Error creating capture window:', error);
    throw new Error(`Window creation failed: ${error.message}`);
  }
}

async function transcribeAudio(audioFile, audioExtension) {
  const token = await getToken();
  if (!token) throw new Error('Authentication token missing.');

  // 1. Create a FormData object
  const formData = new FormData();

  // 2. Append the Blob as a file, ensuring the filename has the correct extension
  const filename = `recording.${audioExtension}`;
  formData.append('audio_file', audioFile, filename);

  try {
    const response = await fetch(`${API_BASE_URL}/audio/transcribe`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `HTTP error! Status: ${response.status}`
      );
    }

    const data = await response.json();
    return data?.audio_text;
  } catch (error) {
    console.error('Error in transcribing audio: ', error);
    throw error;
  }
}

// Function to process captured screen and audio to generate notes
async function generateNotes(captureData, transcription) {
  // const token = await getToken();
  // if (!token) throw new Error('Authentication token missing.');
  // if (!sessionData.captureData || !captureData)
  //   throw new Error('No screen capture data available.');
  // if (!sessionData.transcription || !transcription)
  //   throw new Error('No audio transcription available.');

  return {
    title: 'Test Note Title',
    content:
      '### Mitacs is a nonprofit national research organization that partners with Canadian universities, industry and government, to support research and training programs in the broad fields of industrial and social innovation.\n Most Mitacs programs require a supervisor that is eligible to hold Tri-Agency funds and also typically require a 50% (+GST) cash contribution from an eligible partner. The intern must be an active student or postdoctoral fellow at the University, but the sponsor may consider recent graduates for internships. Most applications require the knowledge/approval of a Mitacs adviser (see below).\n\n##### Mitacs is a nonprofit national research organization that partners with Canadian universities, industry and government, to support research and training programs in the broad fields of industrial and social innovation.\nMost Mitacs programs require a supervisor that is eligible to hold Tri-Agency funds and also typically require a 50% (+GST) cash contribution from an eligible partner. The intern must be an active student or postdoctoral fellow at the University, but the sponsor may consider recent graduates for internships. Most applications require the knowledge/approval of a Mitacs adviser (see below).',
    stored: false,
  };
  // try {
  //   const response = await fetch(`${API_BASE_URL}/notes/generate`, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //       Authorization: `Bearer ${token}`,
  //     },
  //     body: JSON.stringify({
  //       image_b64: captureData,
  //       voice_text: transcription,
  //       privacy_mode: true,
  //     }),
  //   });
  //   const data = await response.json();
  //   return {
  //     title: data?.notes?.title,
  //     content: data?.notes?.content,
  //     stored: data?.stored,
  //   };
  // } catch (error) {
  //   console.error('Error in generateNotes:', error);
  //   throw error;
  // }
}

async function createLinearIssue({
  title,
  description,
  priority,
  team_id,
  linear_api_key,
  label_ids,
}) {
  try {
    sessionData.token = await getToken(); // Get the current token
    if (!token) throw new Error('Authentication token missing.');
    const response = await fetch(`${API_BASE_URL}/linear/create-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        description,
        priority,
        team_id,
        linear_api_key,
        label_ids,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Request failed with status ${response.status}: ${
          errorText || response.statusText
        }`
      );
    }

    const data = await response.json().catch(() => ({}));
    return data;
  } catch (error) {
    console.error('Error in createLinearIssue:', error);
    throw error;
  }
}

/***
 * Login function to authenticate user and store token
 * @param {string} email - User's email address
 * @param {string} password - User's password
 */
async function login(email, password) {
  if (!email || !password) {
    return {
      data: null,
      status: 'error',
      message: 'Please enter email and password',
    };
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (response.ok) {
      chrome.storage.local.set({ token: data?.access_token, expired: false });
      return { data, status: 'success', message: null };
    } else {
      return { data, status: 'error', message: null };
    }
  } catch (error) {
    console.error('Error in login:', error);
    throw error;
  }
}

async function register(email, password, name) {
  if (!email || !password || !name) {
    alert('Please enter email, password, and name');
    return {
      data: null,
      status: 'error',
      message: 'Please enter email, password, and name',
    };
  }
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await response.json();
    if (response.ok) {
      return { data, status: 'success', message: null };
    } else {
      return { data, status: 'error', message: null };
    }
  } catch (error) {
    console.error('Error in register:', error);
    throw error;
  }
}

// Client-side JavaScript (e.g., in your extension's background or popup script)

async function cacheAndSaveNotes(
  finalMarkdown,
  originalImageB64,
  originalVoiceText,
  currentSessionId,
  isPrivacyMode = true
) {
  const titleMatch = finalMarkdown.match(/^#\s+(.+)/m);
  const title = titleMatch
    ? titleMatch[1].trim()
    : finalMarkdown.substring(0, 80) + '...';

  try {
    await chrome.storage.session.set({
      last_captured_image_b64: originalImageB64,
      last_captured_audio_text: originalVoiceText,
      last_generated_note: {
        title: title,
        content: finalMarkdown,
        sessionId: currentSessionId,
        timestamp: Date.now(),
      },
    });
    console.log('Last note and inputs successfully cached in session storage.');
  } catch (error) {
    console.error('Error caching data to session storage:', error);
  }

  if (!isPrivacyMode) {
    const saveResponse = await fetch(`${API_BASE_URL}/save_notes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        final_markdown: finalMarkdown,
        voice_text: originalVoiceText,
        session_id: currentSessionId,
        privacy_mode: isPrivacyMode,
      }),
    });
    const saveResult = await saveResponse.json();
    console.log('Server save result:', saveResult);
  }
}
