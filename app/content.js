if (!window.WHISPA_CONSTANTS_LOADED) {
  const OVERLAY_CONTAINER_ID = 'whispa-overlay-container';
  window.WHISPA_CONSTANTS_LOADED = true;

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
        makeDraggable(container);
      })
      .catch((error) => console.error('Error injecting overlay:', error));
  }

  function toggleOverlayVisibility(visible) {
    const container = document.getElementById(OVERLAY_CONTAINER_ID);
    if (container) {
      if (visible) {
        container.style.visibility = 'visible';
        container.style.opacity = '1';
      } else {
        container.style.visibility = 'hidden';
        container.style.opacity = '0';
      }
    }
  }

  function playCaptureSound() {
    const soundUrl = chrome.runtime.getURL('assets/sounds/capture.wav');

    try {
      const audio = new Audio(soundUrl);
      audio.volume = 0.1;
      audio.play().catch((e) => {
        console.error('Could not play capture sound:', e);
      });
    } catch (error) {
      console.error('Error creating audio object:', error);
    }
  }

  /**
   *
   * @param {HTMLDivElement} element
   * @returns
   */
  function makeDraggable(element) {
    let isDragging = false;
    let offset = { x: 0, y: 0 };
    const dragHandle = element.querySelector(`#top_content`);
    if (!dragHandle) {
      console.error('Drag handle (header) not found for overlay.');
      return;
    }

    dragHandle.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      const rect = element.getBoundingClientRect();
      offset.x = e.clientX - rect.left;
      offset.y = e.clientY - rect.top;
      e.preventDefault();
      element.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      let newX = e.clientX - offset.x;
      let newY = e.clientY - offset.y;

      // --- Edge Boundary Logic ---
      const tabWidth = window.innerWidth;
      const tabHeight = window.innerHeight;
      const elementWidth = element.offsetWidth;
      const elementHeight = element.offsetHeight;

      newX = Math.max(0, Math.min(newX, tabWidth - elementWidth));
      newY = Math.max(0, Math.min(newY, tabHeight - elementHeight));

      // 3. Apply position
      element.style.left = newX + 'px';
      element.style.top = newY + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        element.style.cursor = 'grab';
      }
    });
  }

  // --- Event Listeners and Communication ---
  /**
   *
   * @param {HTMLDivElement} container
   * @returns
   */
  function setupOverlayListeners(container) {
    const captureBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#captureBtn')
    );
    const recordBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#recordBtn')
    );
    const generateBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#generateBtn')
    );
    const closeBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#closeOverlayBtn')
    );
    const micImg = /** @type {HTMLImageElement} */ (
      container.querySelector('#mic')
    );
    const copyBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#copyBtn')
    );
    const exportBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#exportBtn')
    );
    const linearBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#linearBtn')
    );
    const settingsBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#settingsBtn')
    );
    const cancelSettingsBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#cancelSettingsBtn')
    );
    const saveSettingsBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#saveSettingsBtn')
    );
    const cancelLinearBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#cancelLinearBtn')
    );
    const submitLinearBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#submitLinearBtn')
    );
    const linearApiKey = /** @type {HTMLInputElement} */ (
      container.querySelector('#linearApiKey')
    );
    const linearTeamId = /** @type {HTMLInputElement} */ (
      container.querySelector('#linearTeamId')
    );
    const linearLabel = /** @type {HTMLInputElement} */ (
      container.querySelector('#linearLabel')
    );
    const loginForm = /** @type {HTMLDivElement} */ (
      container.querySelector('#login')
    );
    const loginBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#loginBtn')
    );
    const loginLink = /** @type {HTMLAnchorElement} */ (
      container.querySelector('#loginLink')
    );
    const registerForm = /** @type {HTMLDivElement} */ (
      container.querySelector('#register')
    );
    const registerBtn = /** @type {HTMLButtonElement} */ (
      container.querySelector('#registerBtn')
    );
    const registerLink = /** @type {HTMLAnchorElement} */ (
      container.querySelector('#registerLink')
    );
    const welcomeScreen = /** @type {HTMLDivElement} */ (
      container.querySelector('#welcomeScreenContainer')
    );
    const welcomeScreenFooter = /** @type {HTMLDivElement} */ (
      container.querySelector('#welcomeScreenFooter')
    );
    const eyeIcons = /** @type {NodeListOf<HTMLImageElement>} */ (
      container?.querySelectorAll('#eyeIcon')
    );
    const refreshIcon = /** @type {HTMLImageElement} */ (
      container?.querySelector('#refreshIcon')
    );

    let whispaEnabled = true;
    let settings = {
      linearApiKey: '',
      linearTeamId: '',
      linearLabel: [],
    };

    // Initialize extension state
    chrome.storage.local.get(
      ['whispaEnabled', 'settings', 'user'],
      function (result) {
        // Default to enabled if not set
        whispaEnabled = result.whispaEnabled !== false;
        if (result.settings) {
          settings = result.settings;
          linearApiKey.value = settings.linearApiKey || '';
          linearTeamId.value = settings.linearTeamId || '';
          linearLabel.value = settings.linearLabel || [];
          // geminiApiKey.value = settings.geminiApiKey || '';
        }
        if (!result.user?.token) {
          welcomeScreen?.classList?.add('hidden');
          welcomeScreenFooter?.classList?.add('hidden');
          loginForm?.classList?.remove('hidden');
        } else if (result?.user?.token) {
          chrome.runtime.sendMessage(
            {
              action: 'content_checkTokenValidity',
              token: result?.user?.token,
            },
            (response) => {
              if (response && response.success === false) {
                welcomeScreen?.classList?.add('hidden');
                welcomeScreenFooter?.classList?.add('hidden');
                loginForm?.classList?.remove('hidden');
                return;
              }
              chrome.storage.local.set({
                whispaEnabled: true,
                user: response.data,
              });
              const toolbar = container?.querySelector('header .toolbar');
              const main = container?.querySelector('main');
              setTimeout(() => {
                welcomeScreen?.classList?.add('hidden');
                welcomeScreenFooter?.classList?.add('hidden');
                toolbar?.classList?.remove('hidden');
                main?.classList?.remove('hidden');
              }, 5000);
            }
          );
        }
        if (!whispaEnabled) {
          status.textContent =
            'Whispa is disabled. Please enable it in settings.';
          return;
        }
      }
    );

    // Set the correct paths for extension assets
    setExtensionAssetPaths(container);

    recordBtn.disabled = true;
    generateBtn.disabled = true;

    // 1. CAPTURE
    captureBtn?.addEventListener('click', () => {
      captureBtn.disabled = true;
      generateBtn.disabled = true;
      toggleOverlayVisibility(false);
      setTimeout(
        () =>
          chrome.runtime.sendMessage(
            { action: 'content_captureScreen' },
            (response) => {
              toggleOverlayVisibility(true);
              if (response.success) {
                playCaptureSound();
                chrome.runtime.sendMessage(
                  { action: 'content_getCaptureData' },
                  (imageResponse) => {
                    if (imageResponse.success && imageResponse.imageData) {
                      const img = captureBtn?.querySelector('img');
                      updateOverlayStatus(
                        'Screen captured. Ready to record audio.'
                      );
                      displayCapturedImage(imageResponse.imageData);
                      img.src = chrome.runtime.getURL(
                        'assets/icons/camera-off.svg'
                      );
                      captureBtn.disabled = true;
                      recordBtn.disabled = false;
                    } else {
                      updateOverlayStatus('Error retrieving image data.');
                      captureBtn.disabled = false;
                    }
                  }
                );
              } else {
                updateOverlayStatus(`Capture failed: ${response.error}`);
                captureBtn.disabled = false;
              }
            }
          ),
        50
      );
    });

    // 2. RECORD
    recordBtn?.addEventListener('click', () => {
      generateBtn.disabled = true;
      micImg.src = chrome.runtime.getURL('assets/icons/mic.svg');
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
      const modeSelectOverlay = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} select#modeSelectOverlay`
      );
      updateOverlayStatus('Starting generation...');
      chrome.runtime.sendMessage({
        action: 'content_generateNotes',
        qa_type: modeSelectOverlay?.value ?? 'general',
      });
    });

    copyBtn?.addEventListener('click', () => {
      const notesContent = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #notes`
      );
      const notesText = notesContent.textContent;
      if (
        notesText &&
        notesText !== 'Your generated notes will appear here...'
      ) {
        navigator.clipboard
          .writeText(notesText)
          .then(() => {
            // Visual feedback for copy success
            const originalColor = copyBtn.style.color;
            copyBtn.style.color = '#4caf50';
            updateOverlayStatus('Notes copied!');
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
    exportBtn?.addEventListener('click', () => {
      const notesContent = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #notes`
      );
      const notesText = notesContent.textContent;
      if (
        notesText &&
        notesText !== 'Your generated notes will appear here...'
      ) {
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
    linearBtn?.addEventListener('click', () => {
      const linearModal = container?.querySelector('#linearModal');
      const issueTitle = container?.querySelector('#issueTitle');
      const issueDescription = container?.querySelector('#issueDescription');
      const notesContent = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #notes`
      );

      linearModal.classList.remove('hidden');
      if (issueTitle && issueDescription) {
        issueTitle.value = `${notesContent.textContent
          .substring(0, 50)
          .trim()}...`;
        issueDescription.value = notesContent.textContent;
        updateOverlayStatus('Linearizing notes...');
      } else {
        updateOverlayStatus('Please enter both Linear Team ID and Label.');
      }
    });

    settingsBtn?.addEventListener('click', () => {
      const settingsModal = container?.querySelector('#settingsModal');
      settingsModal.classList.remove('hidden');
    });

    cancelSettingsBtn?.addEventListener('click', () => {
      const settingsModal = container?.querySelector('#settingsModal');
      settingsModal?.classList?.add('hidden');
    });

    cancelLinearBtn?.addEventListener('click', () => {
      const linearModal = container?.querySelector('#linearModal');
      linearModal.classList.add('hidden');
      updateOverlayStatus('Linearization cancelled.');
    });

    submitLinearBtn?.addEventListener('click', () => {
      const issueTitle = container?.querySelector('#issueTitle');
      const issueDescription = container?.querySelector('#issueDescription');
      const issuePriority = container?.querySelector('#issuePriority');

      if (!issueTitle?.value?.length || !issueDescription?.value?.length) {
        showToast({
          message: 'Please enter both issue title and description',
          parent: container,
          status: 'error',
        });
        return;
      }
      if (!settings.linearApiKey?.length || !settings.linearTeamId?.length) {
        showToast({
          message: 'Please enter both Linear API key and Team ID',
          parent: container,
          status: 'error',
        });
        return;
      }
      ui_setButtonState('submitLinearBtn', true);
      chrome.runtime.sendMessage(
        {
          action: 'content_linearizeNotes',
          title: issueTitle.value,
          description: issueDescription.value,
          priority: issuePriority.value,
          team_id: settings.linearTeamId,
          linear_api_key: settings.linearApiKey,
          label_ids: settings.linearLabel,
        },
        (response) => {
          if (response.success) {
            showToast({ message: 'Linear issue created!', parent: container });
            issueTitle.value = '';
            issueDescription.value = '';
            issuePriority.value = 'meduim';
            updateOverlayStatus('Notes linearized!', '#4caf50');
            ui_setButtonState('linearBtn', true);
            ui_setButtonState('submitLinearBtn', false);
            linearModal?.classList.add('hidden');
          } else {
            showToast({
              message: 'Linear issue creation failed!',
              parent: container,
              status: 'error',
            });
            ui_setButtonState('submitLinearBtn', false);
            updateOverlayStatus(
              `Linearization failed: ${response.error || 'Check console.'}`
            );
          }
        }
      );
    });

    saveSettingsBtn?.addEventListener('click', () => {
      const settingsModal = container?.querySelector('#settingsModal');
      if (!linearApiKey?.value?.length || !linearTeamId?.value?.length) {
        showToast({
          message: 'Please enter both Linear API key and Team ID',
          parent: container,
        });
        return;
      }
      settings = {
        linearApiKey: linearApiKey?.value,
        linearTeamId: linearTeamId?.value,
        linearLabel: linearLabel?.value?.length
          ? linearLabel?.value?.split(',')
          : [],
        // geminiApiKey: geminiApiKey?.value,
      };
      chrome.storage.local.set({ whispaEnabled: true, settings }, () => {
        showToast({
          message: 'Settings saved successfully!',
          parent: container,
        });
        settingsModal.classList.add('hidden');
      });
    });

    loginBtn?.addEventListener('click', () => {
      const email = container.querySelector('#login #email')?.value;
      const password = container.querySelector('#login #password')?.value;

      if (!email?.length || !password?.length) {
        showToast({
          message: 'Please enter both email and password',
          parent: container,
          status: 'error',
        });
        return;
      }
      ui_setButtonState('loginBtn', true);
      chrome.runtime.sendMessage(
        {
          action: 'login_user',
          email,
          password,
        },
        (response) => {
          if (response && response.success) {
            const toolbar = container?.querySelector('header .toolbar');
            const main = container?.querySelector('main');
            welcomeScreen?.classList?.remove('hidden');
            welcomeScreenFooter?.classList?.remove('hidden');
            setTimeout(() => {
              welcomeScreen?.classList?.add('hidden');
              welcomeScreenFooter?.classList?.add('hidden');
              toolbar?.classList?.remove('hidden');
              main?.classList?.remove('hidden');
            }, 5000);
            ui_setButtonState('loginBtn', false);
            loginForm?.classList?.add('hidden');
          } else {
            ui_setButtonState('loginBtn', false);
            showToast({
              message: 'Invalid credentials! Try again',
              parent: container,
              status: 'error',
            });
          }
        }
      );
    });

    registerBtn?.addEventListener('click', () => {
      const emailRegister = container.querySelector(
        '#register #email-register'
      )?.value;
      const passwordRegister = container.querySelector(
        '#register #password-register'
      )?.value;
      const name = container.querySelector('#register #name')?.value;
      if (
        !emailRegister?.length ||
        !passwordRegister?.length ||
        !name?.length
      ) {
        showToast({
          message: 'Please enter both email, password, and your full name',
          parent: container,
          status: 'error',
        });
        return;
      }
      ui_setButtonState('registerBtn', true);
      chrome.runtime.sendMessage(
        {
          action: 'register_user',
          email: emailRegister,
          password: passwordRegister,
          name,
        },
        (response) => {
          if (response && response.success) {
            const toolbar = container?.querySelector('header .toolbar');
            const main = container?.querySelector('main');
            welcomeScreen?.classList?.remove('hidden');
            welcomeScreenFooter?.classList?.remove('hidden');
            setTimeout(() => {
              welcomeScreen?.classList?.add('hidden');
              welcomeScreenFooter?.classList?.add('hidden');
              toolbar?.classList?.remove('hidden');
              main?.classList?.remove('hidden');
            }, 5000);
            ui_setButtonState('registerBtn', false);
            registerForm?.classList?.add('hidden');
          } else {
            ui_setButtonState('registerBtn', false);
            showToast({
              message: 'Registration failed! Check your entries and try again',
              parent: container,
              status: 'error',
            });
          }
        }
      );
    });

    loginLink?.addEventListener('click', (e) => {
      e?.preventDefault();
      loginForm?.classList?.remove('hidden');
      registerForm?.classList?.add('hidden');
    });

    registerLink?.addEventListener('click', (e) => {
      e?.preventDefault();
      registerForm?.classList?.remove('hidden');
      loginForm?.classList?.add('hidden');
    });

    eyeIcons?.forEach((icon) => {
      icon?.addEventListener('click', () => {
        const inputElement = icon?.previousElementSibling;
        if (inputElement?.type === 'password') {
          inputElement.type = 'text';
          icon.src = chrome.runtime.getURL('assets/icons/eye.svg');
        } else if (inputElement?.type === 'text') {
          inputElement.type = 'password';
          icon.src = chrome.runtime.getURL('assets/icons/eye-off.svg');
        }
      });
    });

    refreshIcon.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'content_refresh' }, (response) => {
        if (response.success) {
          refreshUI();
        }
      });
    });

    closeBtn?.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'content_removeOverlay' });
      removeOverlay();
    });
  }

  // Helper function to show toast notifications
  function showToast({
    message,
    duration = 3000,
    status = 'success',
    parent = document.body,
  }) {
    const toast = document.createElement('div');
    toast.className = `toast show ${status === 'error' ? 'error' : 'success'}`;
    toast.textContent = message;
    parent.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, duration);
  }

  // New Helper Function to set absolute paths
  function setExtensionAssetPaths(container) {
    const logoImg = container.querySelector('.logo-img');
    if (
      logoImg &&
      logoImg.getAttribute('src') === 'assets/icons/new_logo.png'
    ) {
      logoImg.src = chrome.runtime.getURL('assets/icons/new_logo.png');
    }

    const iconElements = container.querySelectorAll(
      '.action-btn img, .top_content .actions img, .register img, .login img, .settings-modal img, .post-actions-right img'
    );

    iconElements.forEach((img) => {
      const relativePath = img.getAttribute('src');
      if (relativePath) {
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

  /**
   *
   * @param {Object} param0
   * @param {boolean} [param0.refresh=false]
   */
  function displayGeneratedNotes({ refresh = false }) {
    const container = /** @type {HTMLDivElement} */ (
      document.getElementById(OVERLAY_CONTAINER_ID)
    );
    const imageElement = /** @type {HTMLImageElement} */ (
      container.querySelector(`#capturedImage`)
    );
    const notesPreview = /** @type {HTMLDivElement} */ (
      container.querySelector(`#notesPreview`)
    );
    const notesContent = /** @type {HTMLDivElement} */ (
      container.querySelector(`#notes`)
    );
    const postActions = /** @type {HTMLDivElement} */ (
      container.querySelector(`#postActions`)
    );
    const modeSelectOverlay = /** @type {HTMLSelectElement} */ (
      container.querySelector(`#modeSelectOverlay`)
    );
    const controls = /** @type {HTMLDivElement} */ (
      container.querySelector(`#controls`)
    );
    const progressElements = /** @type {NodeListOf<HTMLProgressElement>} */ (
      container.querySelectorAll(`progress`)
    );

    if (imageElement && notesPreview) {
      if (refresh) {
        updateOverlayStatus('Ready to capture...', '#555');
        progressElements.forEach((el) => {
          el.classList.remove('progress');
          el.classList.remove('progress-error');
          el.value = 0;
        });
        imageElement.classList.add('hidden');
        imageElement.src = '';
        modeSelectOverlay.classList.remove('hidden');
        controls.classList.remove('hidden');
        notesPreview.classList.add('hidden');
        notesContent.textContent =
          'Your notes will appear here in a bit. Scroll down to see the streaming once active...';
        postActions.classList.add('hidden');
        ui_setButtonState('copyBtn', false);
        ui_setButtonState('exportBtn', false);
        ui_setButtonState('linearBtn', false);
        ui_setButtonState('captureBtn', false);
        ui_setButtonState('recordBtn', true);
        ui_setButtonState('generateBtn', true);
        return;
      }
      imageElement.classList.add('hidden');
      modeSelectOverlay.classList.add('hidden');
      controls.classList.add('hidden');
      notesPreview.classList.remove('hidden');
      postActions.classList.remove('hidden');
      ui_setButtonState('copyBtn', true);
      ui_setButtonState('exportBtn', true);
      ui_setButtonState('linearBtn', true);
    }
  }

  function refreshUI() {
    displayGeneratedNotes({ refresh: true });
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

    if (request.action === 'showLoader') {
      const loader = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #progressContainerWrapper #loader`
      );
      if (loader) {
        loader?.classList?.add('loader');
      }
    }

    if (request.action === 'hideLoader') {
      const loader = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #progressContainerWrapper #loader`
      );
      if (loader) {
        loader?.classList?.remove('loader');
      }
    }

    if (request.action === 'stream_start') {
      displayGeneratedNotes({ refresh: false });
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        message: request.status,
      });
    } else if (request.action === 'stream_chunk') {
      const notesContent = document.querySelector(
        `#${OVERLAY_CONTAINER_ID} #notes`
      );
      if (notesContent) {
        if (
          notesContent.innerText?.includes(
            'Your notes will appear here in a bit. Scroll down to see the streaming once active...'
          )
        ) {
          notesContent.textContent = '';
          notesContent.textContent = request.chunk;
        } else {
          notesContent.textContent += request.chunk;
        }
      }
      if (notesContent) {
        notesContent.scrollTop = notesContent.scrollHeight;
      }
    } else if (request.action === 'stream_end') {
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        message: 'Notes generation complete!',
      });
      chrome.runtime.sendMessage({
        action: 'updateProgress',
        elementId: 'generateProgress',
        status: 'success',
      });
      ui_setButtonState('copyBtn', false);
      ui_setButtonState('exportBtn', false);
      ui_setButtonState('linearBtn', false);
    } else if (request.action === 'stream_error') {
      chrome.runtime.sendMessage({
        action: 'updateStatus',
        message: `Error: ${request.error}`,
      });
      chrome.runtime.sendMessage({
        action: 'updateProgress',
        elementId: 'generateProgress',
        status: 'error',
      });
    }

    /***
     * Update progress bar based on request.status
     * @param {string} request.elementId - The ID of the progress element to update.
     * @param {string} request.status - The status to update the progress bar to.
     */
    if (request.action === 'updateProgress') {
      const element = /** @type {HTMLProgressElement} */ (
        document.querySelector(`progress#${request.elementId}`)
      );
      switch (request.status) {
        case 'start':
          element.value = 50;
          element.classList.add('progress');
          break;
        case 'mid':
          element.value = 75;
          break;
        case 'success':
          element.value = 100;
          element.classList.remove('progress');
          break;
        default:
          element.value = 100;
          element.classList.add('progress-error');
          break;
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
        updateOverlayStatus('Ready to record audio.');
        button.classList.remove('recording-active');
      }
    }
  }
}
