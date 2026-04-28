// Google Maps Review Reply Extension - Content Script
(function() {
  console.log('[Gemini Extension] Initializing...');

  // Configuration
  const BUTTON_ID = 'gemini-generate-btn';
  const MARKER_CLASS = 'gemini-marked';
  
  // Look for the reply field more aggressively
  function findReplyTextField() {
    // Method 1: Direct selector for contenteditable field with "Replying publicly" nearby
    const allEditables = document.querySelectorAll('[contenteditable="true"]');
    
    for (let field of allEditables) {
      // Check if this field is visible
      if (field.offsetParent === null) continue;
      
      // Walk up parents to check for "Replying publicly"
      let parent = field;
      let found = false;
      for (let i = 0; i < 15; i++) {
        if (!parent) break;
        const text = parent.innerText || parent.textContent || '';
        if (text.includes('Replying publicly')) {
          found = true;
          break;
        }
        parent = parent.parentElement;
      }
      
      if (found) return field;
    }
    
    // Fallback: Check all contenteditable in dialogs
    const dialogs = document.querySelectorAll('[role="dialog"]');
    for (let dialog of dialogs) {
      const field = dialog.querySelector('[contenteditable="true"]');
      if (field && field.offsetParent !== null) {
        return field;
      }
    }
    
    return null;
  }

  function injectButton(textField) {
    // Don't inject twice
    if (textField.classList.contains(MARKER_CLASS)) {
      return;
    }
    
    textField.classList.add(MARKER_CLASS);
    
    console.log('[Gemini Extension] Found reply field, injecting button');
    
    // Create button
    const btn = document.createElement('button');
    btn.id = BUTTON_ID + Date.now();
    btn.textContent = '🧠 Generate';
    btn.type = 'button';
    btn.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%) !important;
      color: white !important;
      padding: 10px 16px !important;
      border: none !important;
      border-radius: 5px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      margin-left: 8px !important;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2) !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
      z-index: 10000 !important;
      display: inline-block !important;
    `;
    
    // Insert button after the reply field
    textField.parentElement.appendChild(btn);
    
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleGenerateClick(textField, btn);
    });
  }

  function getReviewRating() {
    // Look for star rating - check all elements with aria-label containing "out of 5"
    const allElements = document.querySelectorAll('[aria-label*="out of 5"]');
    
    for (let el of allElements) {
      const label = el.getAttribute('aria-label');
      const match = label.match(/(\d)\s+out of 5/);
      if (match) {
        const rating = parseInt(match[1]);
        console.log('[Gemini Extension] Detected rating:', rating);
        return rating;
      }
    }
    
    // Fallback: look for star count elements
    const starContainers = document.querySelectorAll('[class*="star"], [class*="rating"]');
    for (let container of starContainers) {
      const ariaLabel = container.getAttribute('aria-label');
      if (ariaLabel) {
        const match = ariaLabel.match(/(\d)\s+out/);
        if (match) {
          const rating = parseInt(match[1]);
          console.log('[Gemini Extension] Found rating from container:', rating);
          return rating;
        }
      }
    }
    
    return 5; // Default
  }

  function getReviewText() {
    // Search for review text elements
    const possibleElements = document.querySelectorAll(
      'div.VBzcrb, div.JhRJje, div[class*="review"], [data-review], div.Fv38Af'
    );
    
    for (let el of possibleElements) {
      const text = (el.innerText || el.textContent || '').trim();
      // Filter out UI elements
      if (text && text.length > 20 && text.length < 500 && 
          !text.includes('Reply') && !text.includes('Cancel') &&
          !text.includes('ago') && !text.includes('photo') &&
          !text.includes('Replying') && !text.includes('This customer')) {
        console.log('[Gemini Extension] Found review text:', text.substring(0, 60));
        return text;
      }
    }
    
    return 'User review';
  }

  function handleGenerateClick(textField, btn) {
    btn.disabled = true;
    btn.textContent = '⏳';
    
    const reviewText = getReviewText();
    const rating = getReviewRating();
    
    console.log('[Gemini Extension] Generating reply for:', reviewText.substring(0, 60));
    console.log('[Gemini Extension] Rating:', rating);
    
    chrome.storage.sync.get(['tone', 'model'], (result) => {
      chrome.runtime.sendMessage({
        action: 'generateReply',
        comment: reviewText,
        tone: result.tone || 'professional',
        model: result.model || 'gemini-2.5-flash',
        rating: rating
      }, (response) => {
        if (response?.success) {
          console.log('[Gemini Extension] Inserting reply:', response.reply.substring(0, 60));
          
          // Set the text in the field
          if (textField.contentEditable === 'true') {
            textField.innerText = response.reply;
            textField.textContent = response.reply;
          } else if (textField.tagName === 'TEXTAREA') {
            textField.value = response.reply;
          }
          
          // Trigger input events
          textField.dispatchEvent(new Event('input', { bubbles: true }));
          textField.dispatchEvent(new Event('change', { bubbles: true }));
          
          btn.textContent = '✓';
          setTimeout(() => {
            btn.textContent = '🧠 Generate';
            btn.disabled = false;
          }, 2000);
        } else {
          console.error('[Gemini Extension] Error:', response?.error);
          alert('Error: ' + (response?.error || 'Unknown'));
          btn.textContent = '🧠 Generate';
          btn.disabled = false;
        }
      });
    });
  }

  // Main loop - check for reply field every 500ms (aggressive polling)
  console.log('[Gemini Extension] Starting aggressive polling...');
  
  setInterval(() => {
    const field = findReplyTextField();
    if (field && !field.classList.contains(MARKER_CLASS)) {
      injectButton(field);
    }
  }, 500);
  
  // Also watch for mutations for faster detection
  const observer = new MutationObserver(() => {
    const field = findReplyTextField();
    if (field && !field.classList.contains(MARKER_CLASS)) {
      injectButton(field);
    }
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false,
    characterData: false
  });
  
  console.log('[Gemini Extension] Ready');
})();
