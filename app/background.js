// Background script for Whispa extension
// const API_BASE_URL = 'https://whispa-ai.onrender.com/';
const API_BASE_URL = 'http://127.0.0.1:5000';

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
  const result = await chrome.storage.local.get(['whispaEnabled', 'user']);
  return result.whispaEnabled && result.user?.token ? result.user.token : null;
}

function resetData() {
  sessionData.captureData = null;
  sessionData.transcription = null;
  sessionData.currentTabId = null;
  sessionData.captureWindowId = null;
  sessionData.isRecording = null;
  sessionData.captureTabId = null;
}

async function refreshData() {
  sessionData.captureData = null;
  sessionData.transcription = null;
  sessionData.captureWindowId = null;
  sessionData.isRecording = null;
  sessionData.captureTabId = null;
}

chrome.action.onClicked.addListener(async (tab) => {
  sessionData.currentTabId = tab.id;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });
    await chrome.tabs.sendMessage(tab.id, {
      action: 'showOverlay',
    });
  } catch (error) {
    console.error('Failed to inject/show overlay:', error);
  }
});

// Listener for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'content_captureScreen') {
    const targetTabId = sessionData.currentTabId;

    if (!targetTabId) {
      sendResponse({ success: false, error: 'Session tab ID is not set.' });
      return false;
    }

    chrome.tabs
      .get(targetTabId)
      .then(() => {
        return captureCurrentTab(targetTabId);
      })
      .then(() => {
        sendUiUpdate('updateProgress', {
          elementId: 'captureProgress',
          status: 'success',
        });
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
        sendUiUpdate('updateProgress', {
          elementId: 'captureProgress',
          status: 'error',
        });
        sendResponse({ success: false, error: errorMessage });
      });

    return true;
  }

  if (request.action === 'content_getCaptureData') {
    if (sessionData.captureData) {
      sendUiUpdate('updateProgress', {
        elementId: 'captureProgress',
        status: 'success',
      });
      sendResponse({ success: true, imageData: sessionData.captureData });
    } else {
      sendUiUpdate('updateProgress', {
        elementId: 'captureProgress',
        status: 'error',
      });
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
        sendUiUpdate('updateProgress', {
          elementId: 'recordProgress',
          status: 'error',
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
            sendUiUpdate('updateProgress', {
              elementId: 'recordProgress',
              status: 'error',
            });
            sendResponse({
              success: false,
              error: chrome.runtime.lastError.message,
            });
            return;
          }
          sessionData.isRecording = false;
          sendUiUpdate('ui_toggleMicIcon', {
            icon: 'assets/icons/mic-off.svg',
          });
          sendUiUpdate('updateStatus', {
            message: 'Stopping recording...',
          });
          sendUiUpdate('ui_setButtonState', {
            buttonId: 'recordBtn',
            disabled: true,
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
    sendUiUpdate('updateProgress', {
      elementId: 'recordProgress',
      status: 'error',
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
      setTimeout(
        () =>
          sendUiUpdate('updateStatus', {
            message:
              'Sending request to AI model (this may take 30-60 seconds)...',
          }),
        100
      );
      sendUiUpdate('updateProgress', {
        elementId: 'recordProgress',
        status: 'mid',
      });
      // Proceed with transcription using the fixedFile
      transcribeAudio(fixedFile, audioExtension)
        .then((transcription) => {
          if (!transcription)
            throw new Error('Transcription returned empty text.');

          sessionData.transcription = transcription;
          sendUiUpdate('updateProgress', {
            elementId: 'recordProgress',
            status: 'success',
          });
          sendUiUpdate('updateStatus', {
            action: 'updateStatus',
            message: 'Transcription Complete ✅',
          });
          sendUiUpdate('ui_setButtonState', {
            buttonId: 'generateBtn',
            disabled: false,
          });
        })
        .catch((error) => {
          console.error('FAILURE during transcription:', error);
          sendUiUpdate('updateStatus', {
            message: `Transcription Failed: ${error.message}`,
          });
          sendUiUpdate('ui_setButtonState', {
            buttonId: 'recordBtn',
            disabled: false,
          });
          sendUiUpdate('updateProgress', {
            elementId: 'recordProgress',
            status: 'error',
          });
        });
    } catch (e) {
      console.error('Failed to reconstruct File from Blob:', e);
      sendUiUpdate('updateStatus', {
        message: `FATAL ERROR: Failed to process audio data.`,
      });
      sendUiUpdate('updateProgress', {
        elementId: 'recordProgress',
        status: 'error',
      });
    }
    return true;
  }

  if (request.action === 'content_generateNotes') {
    generateNotes(request.qa_type).catch((error) => {
      console.error('Final error in generation flow:', error);
    });
    return true;
  }

  if (request.action === 'content_linearizeNotes') {
    createLinearIssue({
      title: request.title,
      description: request.description,
      priority: request.priority,
      team_id: request?.team_id,
      linear_api_key: request?.linear_api_key,
      label_ids: request?.label_ids ?? [],
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
  if (request.action === 'login_user') {
    login(request.email, request.password)
      .then((res) => {
        if (res.success) {
          sendResponse({
            success: true,
            data: {
              token: res?.data?.access_token,
              full_name: res?.data?.full_name,
              privacy_mode: res?.data?.privacy_mode,
            },
          });
        } else {
          sendResponse({
            success: false,
            data: res.data,
          });
        }
      })
      .catch((error) => {
        console.error('Error logging in:', error);
        sendResponse({
          success: false,
          error: error.message,
        });
      });
    return true;
  }
  if (request.action === 'register_user') {
    register(request.email, request.password, request.name)
      .then((res) => {
        if (!res.success) {
          sendResponse({
            success: false,
            data: res.data,
          });
          return;
        }
        sendResponse({
          success: true,
          data: {
            token: res?.data?.access_token,
            full_name: res?.data?.full_name,
            privacy_mode: res?.data?.privacy_mode,
          },
        });
      })
      .catch((error) => {
        console.error('Error registering:', error);
        sendResponse({
          success: false,
          error: error.message,
        });
      });
    return true;
  }
  if (request.action === 'content_checkTokenValidity') {
    checkTokenValidity(request.token)
      .then((res) => {
        if (!res.success) {
          sendResponse({
            success: false,
            data: res.data,
          });
          return;
        }
        sendResponse({ success: true, data: res.data });
      })
      .catch((error) => {
        console.error('Error checking token validity:', error);
        sendResponse({
          success: false,
          error: error.message,
        });
      });
    return true;
  }
  if (request.action === 'content_refresh') {
    refreshData()
      .then(() => {
        sendResponse({ success: true, message: 'Data reset successfully.' });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
  if (request.action === 'content_removeOverlay') {
    resetData();
    return false;
  }
});

// API calls and functions
/**
 * Check if the provided token is valid by making a request to the /auth/user endpoint.
 * @param {string} token - The token to validate.
 * @returns {Promise<{token: string, full_name: string, privacy_mode: boolean}>} - The response data if the token is valid.
 * @throws {Error} - If the token is invalid or the request fails.
 */
async function checkTokenValidity(token) {
  try {
    const res = await fetch(`${API_BASE_URL}/user/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) {
      console.error('Error checking token validity:', res.status);
      return { success: false, data: null };
    }
    const data = await res.json();
    return {
      success: true,
      data: {
        token: data?.access_token,
        full_name: data.full_name,
        privacy_mode: data.privacy_mode,
      },
    };
  } catch (error) {
    console.error('Failed to validate user:', error);
    throw error;
  }
}

/***
 * @param {string} priority
 */
function mapIssuePriorityToAPI(priority) {
  switch (priority) {
    case 'medium':
      return 2;
    case 'high':
      return 3;
    case 'urgent':
      return 4;
    default:
      return 1;
  }
}

async function captureCurrentTab(tabId) {
  sendUiUpdate('updateProgress', {
    elementId: 'captureProgress',
    status: 'start',
  });
  sendUiUpdate('showLoader', {});
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
  } finally {
    sendUiUpdate('hideLoader', {});
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
  sendUiUpdate('updateProgress', {
    elementId: 'recordProgress',
    status: 'start',
  });
  sendUiUpdate('showLoader', {});
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
    sendUiUpdate('updateProgress', {
      elementId: 'captureProgress',
      status: 'error',
    });
    throw new Error(`Window creation failed: ${error.message}`);
  } finally {
    sendUiUpdate('hideLoader', {});
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

  sendUiUpdate('showLoader', {});

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
  } finally {
    sendUiUpdate('hideLoader', {});
  }
}

/**
 *
 * @param {"general" | "bug" | "ux" | "feature"} qa_type
 * @returns
 */
async function generateNotes(qa_type) {
  const token = await getToken();
  const tabId = sessionData.currentTabId;
  const { captureData, transcription } = sessionData;
  if (!token) throw new Error('Authentication token missing.');
  if (!captureData) throw new Error('No screen capture data available.');
  if (!transcription) throw new Error('No audio transcription available.');

  chrome.tabs.sendMessage(tabId, {
    action: 'stream_start',
    status: 'Generating notes...',
  });

  sendUiUpdate('showLoader', {});

  const streamUrl = `${API_BASE_URL}/notes/generate/stream`;

  sendUiUpdate('updateProgress', {
    elementId: 'generateProgress',
    status: 'start',
  });
  sendUiUpdate('ui_setButtonState', {
    elementId: 'generateBtn',
    disabled: true,
  });
  setTimeout(
    () =>
      sendUiUpdate('updateStatus', {
        message: 'Sending request to AI model (this may take 30-60 seconds)...',
      }),
    100
  );

  try {
    const response = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image_b64: captureData,
        voice_text: transcription,
        privacy_mode: true,
        qa_type,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullContent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      fullContent += chunk;
      chrome.tabs
        .sendMessage(tabId, {
          action: 'stream_chunk',
          chunk: chunk,
        })
        .catch((e) => {
          console.warn('UI connection lost during stream:', e);
        });
    }
    chrome.tabs.sendMessage(tabId, {
      action: 'stream_end',
    });
    sendUiUpdate('ui_setButtonState', {
      elementId: 'generateBtn',
      disabled: true,
    });
    sendUiUpdate('ui_setButtonState', {
      elementId: 'copyBtn',
      disabled: false,
    });
    sendUiUpdate('ui_setButtonState', {
      elementId: 'exportBtn',
      disabled: true,
    });
    sendUiUpdate('ui_setButtonState', {
      elementId: 'linearBtn',
      disabled: true,
    });
    sendUiUpdate('updateStatus', {
      message: 'Notes generation complete!',
    });
    sendUiUpdate('updateProgress', {
      elementId: 'generateProgress',
      status: 'success',
    });
    return { success: true, fullContent: fullContent };
  } catch (error) {
    console.error('Error in streaming notes:', error);
    sendUiUpdate('updateProgress', {
      elementId: 'generateProgress',
      status: 'error',
    });
    sendUiUpdate('ui_setButtonState', {
      elementId: 'generateBtn',
      disabled: false,
    });
    chrome.tabs.sendMessage(tabId, {
      action: 'stream_error',
      error: error.message,
    });
    throw error;
  } finally {
    sendUiUpdate('hideLoader', {});
  }
}

async function createLinearIssue({
  title,
  description,
  priority,
  team_id,
  linear_api_key,
  label_ids,
}) {
  sendUiUpdate('showLoader', {});
  try {
    const token = await getToken();
    if (!token) throw new Error('Authentication token missing.');
    const _priority = mapIssuePriorityToAPI(priority);
    const response = await fetch(`${API_BASE_URL}/linear/create-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        title,
        description,
        priority: _priority,
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
  } finally {
    sendUiUpdate('hideLoader', {});
  }
}

/***
 * Login function to authenticate user and store token
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<{data: {full_name: string, token: string, privacy_mode: boolean} | null, success: string, message: string | null}>}
 */
async function login(email, password) {
  if (!email || !password) {
    return {
      data: null,
      status: 'error',
      message: 'Please enter email and password',
    };
  }
  sendUiUpdate('showLoader', {});
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
      chrome.storage.local.set({
        whispaEnabled: true,
        user: {
          token: data?.access_token,
          full_name: data?.full_name,
          privacy_mode: data?.privacy_mode,
        },
      });
      return { data, success: true, message: null };
    } else {
      return { data, success: false, message: null };
    }
  } catch (error) {
    console.error('Error in login:', error);
    throw error;
  } finally {
    sendUiUpdate('hideLoader', {});
  }
}

async function register(email, password, name) {
  if (!email || !password || !name) {
    return {
      data: null,
      status: 'error',
      message: 'Please enter email, password, and name',
    };
  }
  sendUiUpdate('showLoader', {});
  try {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        full_name: name,
        privacy_mode: true,
      }),
    });
    const data = (await response.json()) ?? {
      full_name: '',
      access_token: '',
      privacy_mode: true,
    };
    if (response.ok) {
      chrome.storage.local.set({
        whispaEnabled: true,
        user: {
          token: data?.access_token,
          full_name: data?.full_name,
          privacy_mode: data?.privacy_mode,
        },
      });
      return { data, success: true, message: null };
    } else {
      return { data, success: false, message: null };
    }
  } catch (error) {
    console.error('Error in register:', error);
    throw error;
  } finally {
    sendUiUpdate('hideLoader', {});
  }
}

async function cacheAndSaveNotes({
  finalMarkdown,
  originalImageB64,
  originalVoiceText,
  currentSessionId,
  isPrivacyMode = true,
}) {
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
