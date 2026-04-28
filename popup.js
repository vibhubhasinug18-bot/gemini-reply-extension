document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveBtn = document.getElementById('saveBtn');
  const toneSelect = document.getElementById('tone');
  const settingsBtn = document.getElementById('settingsBtn');
  const testBtn = document.getElementById('testBtn');
  const statusDiv = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['apiKey', 'tone', 'model'], (result) => {
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey.substring(0, 10) + '...'; // Show partial key
      apiKeyInput.placeholder = 'API Key already saved';
      updateStatus('✓ API Key configured', 'success');
    } else {
      updateStatus('⚠ No API Key set', 'warning');
    }
    if (result.tone) {
      toneSelect.value = result.tone;
    }
  });

  // Save API Key
  saveBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value;
    if (!apiKey) {
      updateStatus('✗ Please enter an API key', 'error');
      return;
    }
    chrome.storage.sync.set({ apiKey, model: 'gemini-2.5-flash' }, () => {
      updateStatus('✓ API Key saved! (Using Gemini 2.5 Flash)', 'success');
      apiKeyInput.value = '';
      apiKeyInput.placeholder = 'API Key updated';
    });
  });

  // Save tone preference
  toneSelect.addEventListener('change', () => {
    chrome.storage.sync.set({ tone: toneSelect.value }, () => {
      updateStatus('✓ Tone preference saved', 'success');
    });
  });

  // Open settings page
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Test API connection
  testBtn.addEventListener('click', async () => {
    updateStatus('Testing API...', 'info');
    chrome.storage.sync.get(['apiKey'], async (result) => {
      if (!result.apiKey) {
        updateStatus('✗ API Key not configured', 'error');
        return;
      }
      
      chrome.runtime.sendMessage(
        { action: 'testAPI', apiKey: result.apiKey },
        (response) => {
          if (response.success) {
            updateStatus('✓ API connection successful!', 'success');
          } else {
            updateStatus(`✗ API Error: ${response.error}`, 'error');
          }
        }
      );
    });
  });

  function updateStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = 'status ' + type;
  }
});
