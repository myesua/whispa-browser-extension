// Background script for Whispa extension
const API_BASE_URL = 'https://whispa-ai.onrender.com/';
const token = '';

// Listener for messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'captureScreen') {
    captureCurrentTab(sendResponse)
      .then((imageData) => {
        sendResponse({ success: true, imageData });
      })
      .catch((error) => {
        console.error('Error capturing screen:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'processAudio') {
    transcribeAudio(request.data)
      .then((transcription) => {
        sendResponse({ success: true, transcription });
      })
      .catch((error) => {
        console.error('Error recording audio:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (request.action === 'generateNotes') {
    generateNotes(request.captureData, request.transcription)
      .then((notes) => {
        sendResponse({ success: true, notes });
      })
      .catch((error) => {
        console.error('Error generating notes:', error);
        sendResponse({ success: false, error: error.message });
      });
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

// Function to capture the current tab
async function captureCurrentTab() {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab) {
      throw new Error('No active tab found');
    }

    // Check if activeTab permission is available
    if (!chrome.tabs.captureVisibleTab) {
      throw new Error('activeTab permission not available');
    }

    // Capture the visible area of the tab
    const imageData = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
    });

    // Save the capture to storage for later use
    await chrome.storage.local.set({
      lastCapture: {
        imageData,
        timestamp: Date.now(),
        url: tab.url,
        title: tab.title,
      },
    });
    return imageData;
  } catch (error) {
    console.error('Error in captureCurrentTab:', error);
    throw error;
  }
}

async function transcribeAudio(audioData) {
  try {
    const response = await fetch(`${API_BASE_URL}/audio/transcribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ audio_data: audioData }),
    });
    const data = await response.json();
    return data?.audio_text;
  } catch (error) {
    console.error('Error in transcribing audio: ', error);
    throw error;
  }
}

// Function to process captured screen and audio to generate notes
async function generateNotes(captureData, transcription) {
  try {
    const response = await fetch(`${API_BASE_URL}/notes/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image_b64: captureData,
        voice_text: transcription,
        privacy_mode: true,
      }),
    });
    const data = await response.json();
    return {
      title: data?.notes?.title,
      content: data?.notes?.content,
      stored: data?.stored,
    };
  } catch (error) {
    console.error('Error in generateNotes:', error);
    throw error;
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
  try {
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
