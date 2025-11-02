// let recorder;
// let data = [];
// let isRecording = false;
// let activeStream;

// console.log('Offscreen Document initialized and ready.');
// chrome.runtime
//   .sendMessage({ action: 'offscreen_ready' })
//   .catch((e) => console.error('Failed to signal readiness to background:', e));

// // 1. Message Listener
// chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
//   if (message.action === 'offscreen_startRecording') {
//     // Note: message no longer contains a streamId
//     startRecording() // <<< No argument needed
//       .then((success) => sendResponse({ success: true, isRecording: true }))
//       .catch((error) => {
//         console.error('startRecording promise rejected:', error.message);
//         sendResponse({ success: false, error: error.message });
//       });
//     return true;
//   }
//   if (message.action === 'offscreen_stopRecording') {
//     stopRecording()
//       .then((success) => sendResponse({ success: success, isRecording: false }))
//       .catch((error) => sendResponse({ success: false, error: error.message }));
//     return true;
//   }
// });

// // 2. Start Recording Function
// async function startRecording() {
//   // <<< No argument
//   if (isRecording) return true;

//   try {
//     // 1. GET MEDIA STREAM (from the user's MICROPHONE)
//     // This is allowed because the capture_window.js already got the user gesture.
//     console.log('Offscreen doc: Requesting microphone stream...');
//     const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
//     console.log('Offscreen doc: Microphone stream acquired.');

//     // 2. Create MediaRecorder
//     activeStream = stream;
//     recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
//     data = [];

//     recorder.ondataavailable = (event) => {
//       if (event.data.size > 0) {
//         console.log(
//           `Offscreen doc: Received data chunk of size ${event.data.size}`
//         );
//         data.push(event.data);
//       }
//     };

//     recorder.start(1000); // Start recording and capture chunks every 1 second
//     console.log('Offscreen doc: Recording started.');
//     isRecording = true;
//     return true;
//   } catch (error) {
//     console.error('Error starting recording in offscreen:', error.message);
//     throw error; // Re-throw to reject the promise
//   }
// }

// // 3. Stop Recording Function
// async function stopRecording() {
//   if (!isRecording) return false;
//   console.log('Offscreen doc: Stopping recording...');

//   return new Promise((resolve) => {
//     recorder.onstop = () => {
//       console.log('Offscreen doc: Recorder stopped. Processing audio.');
//       processAudio(); // This function now handles closing the document
//       isRecording = false;

//       if (activeStream) {
//         activeStream.getTracks().forEach((track) => track.stop());
//         activeStream = null;
//       }

//       resolve(true);
//     };
//     recorder.stop();
//   });
// }

// // 4. Process Audio (This function is now correct)
// function processAudio() {
//   if (data.length === 0) {
//     console.error('ProcessAudio Error: No audio data was captured.');
//     chrome.runtime.sendMessage({
//       action: 'offscreen_recordingError',
//       error: 'No audio data was captured. (Mic was silent?)',
//     });
//     chrome.offscreen.closeDocument().catch((e) => console.error(e));
//     return;
//   }

//   const audioBlob = new Blob(data, {
//     type: recorder.mimeType,
//   });
//   console.log(`Offscreen doc: Processing audio blob (${audioBlob.size} bytes)`);

//   const mimeType = recorder.mimeType;
//   const extensionMatch = mimeType.match(/\/(.*?)(;|$)/);
//   const fileExtension = extensionMatch ? `${extensionMatch[1]}` : 'webm';

//   const reader = new FileReader();

//   reader.onloadend = () => {
//     const audioArrayBuffer = reader.result;
//     console.log(
//       `Offscreen doc: Converted to ArrayBuffer. Sending to background.`
//     );

//     chrome.runtime.sendMessage({
//       action: 'offscreen_audioArrayBufferReady',
//       audioArrayBuffer: audioArrayBuffer,
//       audioExtension: fileExtension,
//     });

//     data = [];
//     chrome.offscreen.closeDocument().catch((e) => console.error(e));
//   };

//   reader.onerror = (e) => {
//     console.error('FileReader failed to read Blob:', e);
//     data = [];
//     chrome.runtime.sendMessage({
//       action: 'offscreen_recordingError',
//       error: 'FileReader failed to process audio data.',
//     });
//     chrome.offscreen.closeDocument().catch((e) => console.error(e));
//   };

//   reader.readAsArrayBuffer(audioBlob);
// }
