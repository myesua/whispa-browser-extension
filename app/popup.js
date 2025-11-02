// Popup script for Whispa extension
const API_BASE_URL = 'https://whispa-ai.onrender.com/';

document.addEventListener('DOMContentLoaded', function () {
  // DOM elements
  const loginForm = document.getElementById('login');
  const registerForm = document.getElementById('register');
  const loginEmailInput = document.getElementById('email');
  const loginPasswordInput = document.getElementById('password');
  const loginBtn = document.getElementById('loginBtn');
  const registerEmailInput = document.getElementById('email-register');
  const registerPasswordInput = document.getElementById('password-register');
  const nameInput = document.getElementById('name');
  const registerBtn = document.getElementById('registerBtn');

  const appContainer = document.querySelector('.app-container');
  const captureBtn = document.getElementById('captureBtn');
  const recordBtn = document.getElementById('recordBtn');
  const generateBtn = document.getElementById('generateBtn');
  const copyBtn = document.getElementById('copyBtn');
  const exportBtn = document.getElementById('exportBtn');
  const linearBtn = document.getElementById('linearBtn');

  // const status = document
  //   .getElementById('status')
  //   ?.querySelector('.value');
  const status = document.getElementById('status');
  const imagePreview = document.getElementById('imagePreview');
  const capturedImage = document.getElementById('capturedImage');
  const notesPreview = document.getElementById('notesPreview');
  const notesContent = document.getElementById('notes');
  const captureProgess = document.getElementById('captureProgress');
  const recordProgress = document.getElementById('recordProgress');
  const generateProgress = document.getElementById('generateProgress');
  const mic = document.getElementById('mic');

  // Settings Modal Elements
  const settingsBtn = document.getElementById('settingsBtn');
  const settingsModal = document.getElementById('settingsModal');
  const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const linearApiKey = document.getElementById('linearApiKey');
  const linearTeamId = document.getElementById('linearTeamId');
  const linearLabel = document.getElementById('linearLabel');
  const geminiApiKey = document.getElementById('geminiApiKey');

  // State variables
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let captureData = null;
  let audioData = null;
  let transcription = null;
  let whispaEnabled = true;
  let settings = {};

  // Initialize extension state
  chrome.storage.local.get(['whispaEnabled', 'settings'], function (result) {
    // Default to enabled if not set
    whispaEnabled = result.whispaEnabled !== false;
    if (result.settings) {
      settings = result.settings;
      linearApiKey.value = settings.linearApiKey || '';
      linearTeamId.value = settings.linearTeamId || '';
      linearLabel.value = settings.linearLabel || [];
      // geminiApiKey.value = settings.geminiApiKey || '';
    }
    if (!whispaEnabled) {
      status.textContent = 'Whispa is disabled. Please enable it in settings.';
      return;
    }
    // updateUIState();
  });

  //   chrome.storage.local.get('token', ({ token, expired }) => {
  //     if (token && !expired) {
  //       appContainer.classList.remove('hidden');
  //       loginForm.classList.add('hidden');
  //       registerForm.classList.add('hidden');
  //     } else if (token && expired) {
  //       loginForm.classList.remove('hidden');
  //       appContainer.classList.add('hidden');
  //       registerForm.classList.add('hidden');
  //     } else {
  //       loginForm.classList.add('hidden');
  //       registerForm.classList.remove('hidden');
  //     }
  //   });

  // Check Authentication first
  chrome.storage.local.get('token', ({ token }) => {
    // if (!token) {
    //   // Show login/register form if not authenticated
    //   loginForm.classList.remove('hidden');
    //   registerForm.classList.add('hidden');
    //   // NOTE: You'll need to hide the main app/toolbar in popup.html
    //   return;
    // }

    // --- AUTHENTICATED: LAUNCH OVERLAY ---

    // 1. Get the current active tab in the window the popup belongs to
    chrome.tabs.query(
      {
        active: true,
        currentWindow: true,
        // Note: We rely on the window being 'normal' rather than querying for it,
        // but the `currentWindow: true` constraint usually restricts it effectively.
      },
      function (tabs) {
        const activeTab = tabs[0];

        // Safety checks (we assume the current window is the desired target)
        if (!activeTab || !activeTab.id) {
          console.error('No valid active tab found.');
          document.getElementById('status').textContent =
            'Error: Cannot operate on this page.';
          return;
        }

        const tabId = activeTab.id;

        // 2. Send message to background.js
        chrome.runtime.sendMessage(
          {
            action: 'launchOverlay',
            tabId: tabId, // Send the confirmed browser tab ID
          },
          (response) => {
            // It is CRITICAL to close the window only AFTER the message is sent
            // and ideally after the injection is confirmed.
            // Since the background script sends a response on injection success:
            if (response && response.success) {
              console.log('Overlay launch initiated. Popup closing.');
              window.close(); // Close the popup
            } else {
              console.error(
                'Overlay launch failed or background did not respond successfully.',
                response
              );
            }
          }
        );
      }
    );
  });

  async function login() {
    const email = loginEmailInput.value;
    const password = loginPasswordInput.value;
    chrome.runtime.sendMessage(
      { action: 'login', email, password },
      (response) => {
        if (response.status === 'success') {
          chrome.storage.local.set({
            token: response?.data?.access_token,
            expired: false,
          });
          loginForm.classList.add('hidden');
          registerForm.classList.add('hidden');
        } else if (response.status === 'error' && response?.data?.message) {
          showToast(response?.data?.message);
        } else {
          showToast('Login failed');
        }
      }
    );
  }

  async function register() {
    const email = registerEmailInput.value;
    const password = registerPasswordInput.value;
    const name = nameInput.value;
    chrome.runtime.sendMessage(
      { action: 'register', email, password, name },
      (response) => {
        if (response.status === 'success') {
          chrome.storage.local.set({
            token: response?.data?.access_token,
            expired: false,
          });
          loginForm.classList.add('hidden');
          registerForm.classList.add('hidden');
        } else if (response.status === 'error' && response?.data?.message) {
          showToast(response?.data?.message);
        } else {
          showToast('Registration failed');
        }
      }
    );
  }

  const toggle = document.getElementById('extensionToggle');
  const label = document.getElementById('switchLabel');
  // const select = document.getElementById('modeSelectOverlay');

  toggle.addEventListener('change', () => {
    chrome.storage.local.set({ whispaEnabled: toggle.checked });
    label.textContent = toggle.checked ? 'on' : 'off';
  });

  // select?.addEventListener('change', () => {
  //   console.log('Selected:', select?.value);
  // });

  // Screen capture functionality
  //   captureBtn.addEventListener('click', processCapture);
  //   function processCapture() {
  //     // status.textContent = 'Capturing...';
  //     // status.textContent = 'Not recorded';
  //     // status.textContent = 'Not started';
  //     captureProgess.classList.add('progress');
  //     captureProgess.value = 50;
  //     chrome.runtime.sendMessage({ action: 'captureScreen' }, (response) => {
  //       if (chrome.runtime.lastError) {
  //         console.error('Error:', chrome.runtime.lastError.message);
  //         captureProgess.classList.add('progress-error');
  //         captureProgess.value = 100;
  //         // status.textContent = 'Failed ❌';
  //         return;
  //       }
  //       if (response?.success) {
  //         captureData = response.imageData;
  //         console.log('response: ', response?.imageData);
  //         capturedImage.src = captureData;
  //         capturedImage.classList.remove('hidden');
  //         // Update progress bar
  //         captureProgess.classList.remove('progress');
  //         captureProgess.value = 100;
  //         // status.textContent = 'Captured ✅';
  //         captureBtn.disabled = true;
  //         recordBtn.disabled = false;
  //         generateBtn.disabled = !audioData;
  //       } else {
  //         console.error('Capture failed:', response?.error);
  //         captureProgess.classList.add('progress-error');
  //         captureProgess.value = 100;
  //         // status.textContent = 'Failed ❌';
  //       }
  //     });
  //   }

  //   // Audio recording functionality
  //   recordBtn.addEventListener('click', async () => {
  //     if (isRecording) {
  //       stopRecording();
  //     } else {
  //       try {
  //         // Disable button while requesting permission
  //         recordBtn.disabled = true;

  //         // Ask for microphone access
  //         const stream = await navigator.mediaDevices.getUserMedia({
  //           audio: true,
  //         });

  //         startRecording(stream);

  //         // Re-enable button after permission granted
  //         recordBtn.disabled = false;
  //         // status.textContent = 'Recording...';
  //       } catch (error) {
  //         console.error('Error accessing microphone:', error);

  //         // Notify user to allow microphone usage
  //         if (
  //           error.name === 'NotAllowedError' ||
  //           error.name === 'PermissionDeniedError'
  //         ) {
  //           status.textContent =
  //             'Microphone access denied. Please allow microphone usage in your browser settings.';
  //         } else if (
  //           error.name === 'NotFoundError' ||
  //           error.name === 'DevicesNotFoundError'
  //         ) {
  //           status.textContent =
  //             'No microphone found. Please connect a microphone and try again.';
  //         } else {
  //           status.textContent = 'Error accessing microphone: ' + error.message;
  //         }
  //         recordBtn.disabled = false;
  //       }
  //     }
  //   });

  //   function startRecording(stream) {
  //     // status.textContent = 'Recording...';
  //     // status.textContent = 'Not started';
  //     // recordBtn.querySelector('.record-text').textContent = 'Stop';

  //     mediaRecorder = new MediaRecorder(stream);
  //     audioChunks = [];

  //     mediaRecorder.addEventListener('dataavailable', (event) => {
  //       recordProgress.classList.add('progress');
  //       recordProgress.value = 50;
  //       audioChunks.push(event.data);
  //     });

  //     mediaRecorder.addEventListener('stop', () => {
  //       const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  //       // Convert Blob to base64 data URI
  //       const reader = new FileReader();
  //       reader.onloadend = async function () {
  //         audioData = reader.result; // This will be a proper data URI with format "data:audio/webm;base64,..."
  //         isRecording = false;
  //         await processAudio(audioData);
  //         // Enable generate button if both capture and audio are ready
  //         if (captureData && transcription) {
  //           generateBtn.disabled = false;
  //         }
  //       };
  //       reader.readAsDataURL(audioBlob);
  //     });

  //     mediaRecorder.start();
  //     isRecording = true;
  //   }

  //   async function stopRecording() {
  //     if (mediaRecorder && isRecording) {
  //       mediaRecorder.stop();
  //       mediaRecorder.stream.getTracks().forEach((track) => track.stop());
  //       mic.src = 'icons/mic-off.svg';
  //       recordBtn.disabled = true;

  //       if (!transcription) {
  //         status.textContent = 'Processing...';
  //         // recordBtn.querySelector('.record-text').textContent = 'Wait';
  //         generateBtn.disabled = true;
  //       }
  //     }
  //   }

  //   // Generate notes functionality
  //   generateBtn.addEventListener('click', async () => {
  //     if (!captureData || !audioData) {
  //       console.error('Missing capture data or audio data');
  //       status.textContent = 'Missing capture data or audio data';
  //       return;
  //     }
  //     captureBtn.disabled = true;
  //     recordBtn.disabled = true;
  //     generateBtn.disabled = true;
  //     status.textContent = 'Processing...';
  //     generateProgress.classList.add('progress');
  //     generateProgress.value = 50;
  //     // Send data to background script for processing
  //     chrome.runtime.sendMessage(
  //       {
  //         action: 'generateNotes',
  //         captureData: captureData,
  //         transcription: transcription,
  //       },
  //       (response) => {
  //         if (chrome.runtime.lastError) {
  //           console.error('Error:', chrome.runtime.lastError.message);
  //           status.textContent = 'Error while generating notes';
  //           generateBtn.disabled = false;
  //           generateProgress.classList.add('progress-error');
  //           generateProgress.value = 100;
  //           return;
  //         }
  //         if (response?.success) {
  //           notesContent.textContent = response?.notes?.content;
  //           status.textContent = 'Processed ✅';
  //           notesPreview.classList.remove('hidden');
  //           generateBtn.disabled = true;
  //           copyBtn.disabled = false;
  //           exportBtn.disabled = false;
  //           linearBtn.disabled = false;
  //           generateProgress.classList.remove('progress');
  //           generateProgress.value = 100;
  //         } else {
  //           console.error('Generation failed:', response?.error);
  //           status.textContent = 'Failed to generate notes';
  //           captureBtn.disabled = false;
  //           recordBtn.disabled = false;
  //           generateBtn.disabled = false;
  //           generateProgress.classList.add('progress-error');
  //           generateProgress.value = 100;
  //         }
  //       }
  //     );
  //   });

  //   async function processAudio(audio_data) {
  //     // recordBtn.disabled = true;
  //     status.textContent = 'Processing...';
  //     generateBtn.disabled = true;
  //     chrome.runtime.sendMessage(
  //       { action: 'processAudio', data: audio_data },
  //       (response) => {
  //         if (chrome.runtime.lastError) {
  //           console.error('Error:', chrome.runtime.lastError.message);
  //           recordProgress.classList.add('progress-error');
  //           recordProgress.value = 100;
  //           status.textContent = 'Failed ❌';
  //           return;
  //         }
  //         if (response?.success) {
  //           transcription = response?.transcription;
  //           recordProgress.classList.remove('progress');
  //           recordProgress.value = 100;
  //           status.textContent = 'Recorded ✅';
  //           // recordBtn.querySelector('.record-text').textContent = 'Record';
  //           generateBtn.disabled = false;
  //           recordBtn.disabled = true;
  //           return;
  //         } else {
  //           console.error('Audio processing failed:', response?.error);
  //           status.textContent = 'Failed ❌';
  //           recordProgress.classList.add('progress-error');
  //           recordProgress.value = 100;
  //         }
  //       }
  //     );
  //   }

  // Copy notes functionality
  copyBtn.addEventListener('click', () => {
    const notesText = notesContent.textContent;
    if (notesText && notesText !== 'Your generated notes will appear here...') {
      navigator.clipboard
        .writeText(notesText)
        .then(() => {
          // Visual feedback for copy success
          const originalColor = copyBtn.style.color;
          copyBtn.style.color = '#4caf50';
          status.textContent = 'Notes copied!';
          setTimeout(() => {
            copyBtn.style.color = originalColor;
          }, 1000);
        })
        .catch((err) => {
          console.error('Failed to copy notes:', err);
        });
    }
  });

  // Export notes functionality
  exportBtn.addEventListener('click', () => {
    const notesText = notesContent.textContent;
    if (notesText && notesText !== 'Your generated notes will appear here...') {
      const blob = new Blob([notesText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'whispa-notes.md';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });

  // Linear integration functionality
  const linearModal = document.getElementById('linearModal');
  const issueTitle = document.getElementById('issueTitle');
  const issueDescription = document.getElementById('issueDescription');
  const issuePriority = document.getElementById('issuePriority');
  const cancelLinearBtn = document.getElementById('cancelLinearBtn');
  const submitLinearBtn = document.getElementById('submitLinearBtn');
  const linearSuccess = document.getElementById('linearSuccess');

  // Open Linear modal when Linear button is clicked
  linearBtn.addEventListener('click', async () => {
    // Pre-fill the form with the generated notes
    const notesText = notesContent.textContent;
    if (notesText && notesText !== 'Your generated notes will appear here...') {
      // Extract a title from the first line or first 50 characters
      const firstLine = notesText.split('\n')[0];
      issueTitle.value =
        firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine;

      // Use the full notes as description
      issueDescription.value = notesText;
      // Show the modal
      linearModal.classList.remove('hidden');
    }
  });

  submitLinearBtn.addEventListener('click', () => {
    if (!linearApiKey?.value?.length || !linearTeamId?.value?.length) {
      showToast(
        'Error: Please enter Linear API Key and Team ID',
        3000,
        'error'
      );
      return;
    }
    cancelLinearBtn.disabled = true;
    submitLinearBtn.disabled = true;
    chrome.runtime.sendMessage(
      {
        action: 'linearCreateIssue',
        title: issueTitle.value,
        description: notesContent.textContent,
        priority: mapIssuePriorityToAPI(issuePriority?.value),
        team_id: linearTeamId?.value ?? settings?.linearTeamId,
        label_ids: !linearLabel?.value?.length
          ? []
          : linearLabel?.value?.split(',').map((id) => id.trim()) ??
            settings?.linearLabel?.split(',').map((id) => id.trim()),
        linear_api_key: linearApiKey?.value ?? settings?.linearApiKey,
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError.message);
          showToast('Error creating linear issue', 3000, 'error');
          return;
        }
        if (response?.success) {
          linearSuccess.classList.remove('hidden');
          showToast('Issue created successfully!');
          linearBtn.disabled = true;
          setTimeout(() => linearModal.classList.add('hidden'), 500);
          cancelLinearBtn.disabled = false;
          submitLinearBtn.disabled = false;
        } else {
          console.error('Creation failed:', response?.error);
          showToast('Error creating linear issue', 3000, 'error');
        }
      }
    );
  });

  // Close Linear modal when Cancel button is clicked
  cancelLinearBtn.addEventListener('click', () => {
    linearModal.classList.add('hidden');
    linearSuccess.classList.add('hidden');
  });

  // Helper function to show toast notifications
  function showToast(message, duration = 3000, status = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast show ${status === 'error' ? 'error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  // Settings Modal Functionality
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });

  cancelSettingsBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });

  saveSettingsBtn.addEventListener('click', () => {
    settings = {
      linearApiKey: linearApiKey?.value,
      linearTeamId: linearTeamId?.value,
      linearLabel: linearLabel?.value,
      geminiApiKey: geminiApiKey?.value,
    };
    chrome.storage.local.set({ settings }, () => {
      showToast('Settings saved successfully!');
      settingsModal.classList.add('hidden');
      // updateUIState();
    });
  });

  // Helper function to update UI based on extension state
  function updateUIState() {
    captureBtn.disabled = !whispaEnabled;
    recordBtn.disabled = !whispaEnabled;
    generateBtn.disabled =
      !whispaEnabled || !captureData || !audioData || !transcription;

    // Disable export and linear buttons if Linear API key is not set
    // if (settings.linearApiKey && settings.linearTeamId) {
    //   exportBtn.disabled = false;
    //   linearBtn.disabled = false;
    // } else {
    //   exportBtn.disabled = true;
    //   linearBtn.disabled = true;
    // }
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

  // Check for saved collapsed state
  chrome.storage.local.get(['whispaCollapsed'], function (result) {
    if (result.whispaCollapsed) {
      document.body.classList.add('collapsed');
    }
  });
});
