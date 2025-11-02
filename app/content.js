const OVERLAY_CONTAINER_ID = 'whispa-overlay-container';

// --- Overlay Management ---

function removeOverlay() {
  const container = document.getElementById(OVERLAY_CONTAINER_ID);
  if (container) {
    container.remove();
    console.log('Whispa overlay removed.');
  }
}

function injectOverlay() {
  if (document.getElementById(OVERLAY_CONTAINER_ID)) {
    console.log('Whispa overlay already active.');
    return;
  }

  // Load the HTML for the control panel
  fetch(chrome.runtime.getURL('overlay.html'))
    .then((response) => response.text())
    .then((html) => {
      const container = document.createElement('div');
      container.id = OVERLAY_CONTAINER_ID;
      container.innerHTML = html;
      document.body.appendChild(container);

      // Load the CSS
      const styleLink = document.createElement('link');
      styleLink.rel = 'stylesheet';
      styleLink.href = chrome.runtime.getURL('overlay.css');
      document.head.appendChild(styleLink);

      setupOverlayListeners(container);
    })
    .catch((error) => console.error('Error injecting overlay:', error));
}

// --- Event Listeners and Communication ---

function setupOverlayListeners(container) {
  const captureBtn = container.querySelector('#captureBtn');
  const recordBtn = container.querySelector('#recordBtn');
  const generateBtn = container.querySelector('#generateBtn');
  const closeBtn = container.querySelector('#closeOverlayBtn');
  const micImg = container.querySelector('#mic');
  const copyBtn = document.getElementById('copyBtn');
  const exportBtn = document.getElementById('exportBtn');
  const linearBtn = document.getElementById('linearBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  // CRITICAL: Set the correct paths for extension assets
  setExtensionAssetPaths(container);

  // 1. CAPTURE
  captureBtn?.addEventListener('click', () => {
    // Disable button to prevent double-click
    captureBtn.disabled = true;
    generateBtn.disabled = true;

    chrome.runtime.sendMessage(
      { action: 'content_captureScreen' },
      (response) => {
        if (response.success) {
          console.log('Capture confirmed by background.');
          chrome.runtime.sendMessage(
            { action: 'content_getCaptureData' },
            (imageResponse) => {
              if (imageResponse.success && imageResponse.imageData) {
                // Update status message
                updateOverlayStatus('Screen captured. Ready to record audio.');

                // Display the image
                displayCapturedImage(imageResponse.imageData);

                // Enable the next action button
                recordBtn.disabled = false;
              } else {
                // Handle failure to retrieve image data (e.g., background script error)
                updateOverlayStatus('Error retrieving image data.');
                captureBtn.disabled = false;
              }
            }
          );
        } else {
          // Handle capture failure (e.g., restricted page)
          updateOverlayStatus(`Capture failed: ${response.error}`);
          captureBtn.disabled = false;
        }
      }
    );
  });

  // 2. RECORD
  recordBtn?.addEventListener('click', () => {
    // We send a message to background.js to open the temporary window
    // which handles the capture. The background script is responsible
    // for updating the UI later.
    // recordBtn.disabled = true;
    micImg.src = chrome.runtime.getURL('icons/mic.svg');
    updateOverlayStatus('Awaiting audio permission window...');

    chrome.runtime.sendMessage(
      { action: 'content_requestCaptureWindow' },
      (response) => {
        if (response && response.success === false) {
          updateOverlayStatus(
            `Error opening capture window: ${
              response.error || 'Check console.'
            }`
          );
          ui_setButtonState('recordBtn', false);
        }
      }
    );
  });

  // 3. GENERATE
  generateBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { action: 'content_generateNotes' },
      (response) => {
        // Update UI with loading status
        const notesContent = document.querySelector(
          `#${OVERLAY_CONTAINER_ID} #notes`
        );
        console.log('responseContent', response.notesContent);
        if (notesContent) {
          notesContent.textContent = response.notesContent;
          displayGeneratedNotes();
        }
      }
    );
  });

  copyBtn.addEventListener('click', () => {
    const notesContent = document.querySelector(
      `#${OVERLAY_CONTAINER_ID} #notes`
    );
    const notesText = notesContent.textContent;
    if (notesText && notesText !== 'Your generated notes will appear here...') {
      navigator.clipboard
        .writeText(notesText)
        .then(() => {
          // Visual feedback for copy success
          const originalColor = copyBtn.style.color;
          copyBtn.style.color = '#4caf50';
          updateOverlayStatus('Notes copied!', '#4caf50');
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
    const notesContent = document.querySelector(
      `#${OVERLAY_CONTAINER_ID} #notes`
    );
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
      updateOverlayStatus('Downloaded!', '#4caf50');
    }
  });

  // Linearize notes functionality
  linearBtn.addEventListener('click', () => {
    const linearModal = document.getElementById('linearModal');
    const linearTeamId = document.getElementById('linearTeamId').value;
    const linearLabel = document.getElementById('linearLabel').value;
    const issueTitle = document.getElementById('issueTitle');
    const issueDescription = document.getElementById('issueDescription');
    const notesContent = document.querySelector(
      `#${OVERLAY_CONTAINER_ID} #notes`
    );

    linearModal.classList.remove('hidden');
    if (issueTitle && issueDescription) {
      issueTitle.value = `${notesContent.textContent
        .substring(0, 15)
        .trim()}...`;
      issueDescription.value = notesContent.textContent;
      updateOverlayStatus('Linearizing notes...');
      // chrome.runtime.sendMessage(
      //   {
      //     action: 'content_linearizeNotes',
      //     linearTeamId,
      //     linearLabel,
      //   },
      //   (response) => {
      //     if (response.success) {
      //       updateOverlayStatus('Notes linearized!', '#4caf50');
      //     } else {
      //       updateOverlayStatus(
      //         `Linearization failed: ${response.error || 'Check console.'}`
      //       );
      //     }
      //   }
      // );
    } else {
      updateOverlayStatus('Please enter both Linear Team ID and Label.');
    }
  });

  settingsBtn.addEventListener('click', () => {
    const settingsModal = document.getElementById('settingsModal');
    settingsModal.classList.remove('hidden');

    // chrome.runtime.sendMessage({ action: 'content_showSettingsModal' });
  });

  closeBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      { action: 'content_removeOverlay' },
      removeOverlay
    );
  });
}

// New Helper Function to set absolute paths
function setExtensionAssetPaths(container) {
  // 1. Update the logo image
  const logoImg = container.querySelector('.logo-img');
  if (logoImg && logoImg.getAttribute('src') === 'icons/logo_dark.png') {
    logoImg.src = chrome.runtime.getURL('icons/logo_dark.png');
  }

  // 2. Update all icon buttons
  // Get all img tags that are immediate children of buttons within controls/header
  const iconElements = container.querySelectorAll(
    '.action-btn img, .top_content .actions img'
  );

  iconElements.forEach((img) => {
    const relativePath = img.getAttribute('src');
    if (relativePath) {
      // The path in your HTML is just 'icons/x.svg', so construct the absolute path
      // This correctly replaces 'icons/x.svg' with 'chrome-extension://.../icons/x.svg'
      img.src = chrome.runtime.getURL(relativePath);
    }
  });
}

// New Helper Functions for content.js

function updateOverlayStatus(message, color = null) {
  const statusElement = document.querySelector(
    `#${OVERLAY_CONTAINER_ID} #status`
  );
  if (statusElement) {
    statusElement.textContent = message;
    if (color) {
      statusElement.style.color = color;
    }
  }
}

function displayCapturedImage(imageData) {
  const imageElement = document.getElementById('capturedImage');
  const notesPreview = document.getElementById('notesPreview');

  if (imageElement && notesPreview) {
    imageElement.src = imageData;
    imageElement.classList.remove('hidden');
    notesPreview.classList.add('hidden');
  }
}

function displayGeneratedNotes() {
  const imageElement = document.getElementById('capturedImage');
  const notesPreview = document.getElementById('notesPreview');
  const postActions = document.getElementById('postActions');
  const modeSelectOverlay = document.getElementById('modeSelectOverlay');
  const controls = document.getElementById('controls');
  const copyBtn = document.getElementById('copyBtn');
  const exportBtn = document.getElementById('exportBtn');
  const linearBtn = document.getElementById('linearBtn');

  if (imageElement && notesPreview) {
    imageElement.classList.add('hidden');
    modeSelectOverlay.classList.add('hidden');
    controls.classList.add('hidden');
    notesPreview.classList.remove('hidden');
    postActions.classList.remove('hidden');
    copyBtn.disabled = false;
    exportBtn.disabled = false;
    linearBtn.disabled = false;
  }
}

// --- Message Handler from Background ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'showOverlay') {
    injectOverlay();
    sendResponse({ success: true });
    return false;
  }

  if (request.action === 'ui_toggleMicIcon') {
    const micImg = document.querySelector(`#${OVERLAY_CONTAINER_ID} #mic`);
    if (micImg) {
      micImg.src = chrome.runtime.getURL(request.icon);
    }
  }

  if (request.action === 'ui_setButtonState') {
    const button = document.querySelector(`#${request.buttonId}`);
    if (button) {
      button.disabled = request.disabled;
      if (!request.disabled) {
        // If re-enabling, reset status if it was stuck on 'Awaiting permission'
        updateOverlayStatus('Ready to record audio.');
      }
    }
  }

  // Update progress/status based on background/offscreen feedback
  if (request.action === 'updateStatus') {
    const statusElement = document.querySelector(
      `#${OVERLAY_CONTAINER_ID} #status`
    );
    if (statusElement) {
      statusElement.textContent = request.message;
      console.log('request.message', request.message);
    }
  }
});

function ui_setButtonState(buttonId, disabled) {
  const button = document.querySelector(`#${buttonId}`);
  if (button) {
    button.disabled = disabled;
    if (!disabled && buttonId === 'recordBtn') {
      // If re-enabling record button, reset status
      updateOverlayStatus('Ready to record audio.');
      button.classList.remove('recording-active'); // Ensure visual state is reset
    }
  }
}
