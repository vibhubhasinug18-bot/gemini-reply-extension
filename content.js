// Inject "Generate Reply" buttons on Google Maps review reply box
(function() {
  console.log('[Gemini Extension] Content script loaded on:', window.location.href);

  function createGenerateButton() {
    const button = document.createElement('button');
    button.innerHTML = '🧠 Generate Reply';
    button.className = 'gemini-generate-btn';
    button.type = 'button';
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin: 10px 5px 10px 0;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      transition: all 0.3s;
      display: inline-block;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 9999;
    `;
    return button;
  }

  function extractReviewInfo() {
    // Find the review that's being replied to
    let reviewText = '';
    let reviewRating = 0;
    
    try {
      // Look for the review container in the visible DOM
      const reviewElements = document.querySelectorAll('div[aria-label*="Review"]');
      
      for (let elem of reviewElements) {
        const text = elem.innerText || elem.textContent;
        
        // Look for actual review text (not the reply interface)
        if (text && text.includes('Substandard') || text.includes('products') || text.includes('prices')) {
          reviewText = text;
          break;
        }
      }

      // If not found, search more broadly
      if (!reviewText) {
        // Find text between review header and reply box
        const allText = document.body.innerText;
        const replyIndex = allText.indexOf('Replying publicly');
        
        if (replyIndex > 0) {
          // Look backward for the review content
          const beforeReply = allText.substring(0, replyIndex);
          const lines = beforeReply.split('\n');
          
          // Get the last few non-empty lines before the reply box
          const reviewLines = lines.reverse().filter(l => l.trim().length > 5).slice(0, 5).reverse();
          reviewText = reviewLines.join(' ');
        }
      }

      // Extract rating (count stars)
      const starElements = document.querySelectorAll('span[role="img"][aria-label*="star"]');
      starElements.forEach(star => {
        const label = star.getAttribute('aria-label');
        const match = label.match(/(\d+)\s+out of 5/);
        if (match) {
          reviewRating = parseInt(match[1]);
        }
      });
    } catch (e) {
      console.log('[Gemini Extension] Error extracting review:', e.message);
    }

    return { reviewText: reviewText.trim(), reviewRating };
  }

  function findReplyTextBox() {
    // Find the contenteditable reply box
    const candidates = document.querySelectorAll('div[contenteditable="true"]');
    
    for (let elem of candidates) {
      const ariaLabel = elem.getAttribute('aria-label');
      const placeholder = elem.getAttribute('data-placeholder');
      
      // Check if this is the reply box
      if (ariaLabel === 'Replying publicly' || 
          placeholder?.includes('reply') ||
          elem.closest('div')?.innerText?.includes('Replying publicly')) {
        console.log('[Gemini Extension] Found reply text box');
        return elem;
      }
    }
    
    // Fallback: look for any contenteditable near "Replying publicly"
    const replyingLabel = Array.from(document.querySelectorAll('*')).find(el => 
      el.textContent === 'Replying publicly'
    );
    
    if (replyingLabel) {
      // Find the contenteditable box near this label
      const container = replyingLabel.closest('div[role="dialog"]') || replyingLabel.parentElement;
      if (container) {
        const box = container.querySelector('div[contenteditable="true"]');
        if (box) {
          console.log('[Gemini Extension] Found reply box via label search');
          return box;
        }
      }
    }
    
    return null;
  }

  function attachButtonToReplyBox() {
    const replyBox = findReplyTextBox();
    
    if (!replyBox) {
      console.log('[Gemini Extension] Reply box not found yet');
      return false;
    }

    // Check if button already attached
    if (replyBox.parentElement?.querySelector('.gemini-generate-btn')) {
      console.log('[Gemini Extension] Button already attached');
      return true;
    }

    const { reviewText, reviewRating } = extractReviewInfo();
    console.log('[Gemini Extension] Review:', reviewText.substring(0, 100), 'Rating:', reviewRating);

    const button = createGenerateButton();
    
    // Insert button right after the reply text box, before Reply/Cancel buttons
    const replyButtonContainer = replyBox.parentElement;
    if (replyButtonContainer) {
      replyButtonContainer.insertBefore(button, replyButtonContainer.querySelector('[aria-label="Reply"]') || replyButtonContainer.querySelector('button'));
    }

    console.log('[Gemini Extension] Button attached successfully');

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      button.disabled = true;
      button.innerHTML = '⏳ Generating...';

      try {
        chrome.storage.sync.get(['tone', 'model'], (result) => {
          const tone = result.tone || 'professional';
          const model = result.model || 'gemini-2.5-flash';
          const { reviewText, reviewRating } = extractReviewInfo();

          console.log('[Gemini Extension] Sending request:', { reviewText, reviewRating, tone, model });

          chrome.runtime.sendMessage(
            { 
              action: 'generateReply', 
              comment: reviewText,
              tone,
              model,
              rating: reviewRating
            },
            (response) => {
              console.log('[Gemini Extension] Response:', response);
              
              if (response && response.success) {
                // Set the reply
                replyBox.innerText = response.reply;
                replyBox.textContent = response.reply;
                replyBox.focus();
                
                // Trigger input events
                const inputEvent = new Event('input', { bubbles: true });
                const changeEvent = new Event('change', { bubbles: true });
                replyBox.dispatchEvent(inputEvent);
                replyBox.dispatchEvent(changeEvent);
                
                console.log('[Gemini Extension] Reply inserted successfully');
                
                button.innerHTML = '✓ Generated!';
                setTimeout(() => {
                  button.innerHTML = '🧠 Generate Reply';
                  button.disabled = false;
                }, 2000);
              } else {
                const errorMsg = response?.error || 'Unknown error';
                console.error('[Gemini Extension] API Error:', errorMsg);
                alert('Error generating reply: ' + errorMsg);
                button.innerHTML = '🧠 Generate Reply';
                button.disabled = false;
              }
            }
          );
        });
      } catch (error) {
        console.error('[Gemini Extension] Exception:', error);
        alert('Error: ' + error.message);
        button.innerHTML = '🧠 Generate Reply';
        button.disabled = false;
      }
    });

    return true;
  }

  // Aggressive scanning for the reply box
  console.log('[Gemini Extension] Starting monitoring for reply interface');

  // Check immediately
  attachButtonToReplyBox();

  // Watch for DOM changes
  const observer = new MutationObserver((mutations) => {
    // Every time DOM changes, check if reply box exists
    for (let mutation of mutations) {
      if (mutation.type === 'childList' || mutation.type === 'subtree') {
        // Check if a reply box appeared
        if (findReplyTextBox() && !document.querySelector('.gemini-generate-btn')) {
          console.log('[Gemini Extension] Reply interface detected, attaching button');
          attachButtonToReplyBox();
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  // Also check every 500ms
  setInterval(() => {
    if (findReplyTextBox() && !document.querySelector('.gemini-generate-btn')) {
      console.log('[Gemini Extension] Reply box found in interval check');
      attachButtonToReplyBox();
    }
  }, 500);

  console.log('[Gemini Extension] Content script fully initialized');
})();
