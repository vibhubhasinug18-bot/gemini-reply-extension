// Inject "Generate Reply" buttons on the page
(function() {
  console.log('[Gemini Extension] Content script loaded');

  // ONLY target the Google Maps review reply box - NOT search bars
  const replySelectors = [
    // Google Maps specific reply box selectors
    'div[aria-label="Replying publicly"]',
    'div[contenteditable="true"][jsname]',
    // Only target textbox if it's inside a reply container
    'div.VaHEVc div[contenteditable="true"]',
    'div[role="dialog"] div[contenteditable="true"]',
    'textarea[aria-label*="reply" i]',
    'textarea[aria-label*="comment" i]',
  ];

  // Elements to EXCLUDE - these are NOT reply boxes
  const excludeSelectors = [
    // Search bars
    '[aria-label*="search" i]',
    '.gLFyf', // Google search input
    '[role="combobox"]', // Search suggestions
    // Navigation/UI elements
    '[role="navigation"]',
    'nav'
  ];

  function isExcluded(element) {
    // Check if element or any parent is excluded
    let current = element;
    while (current && current !== document.body) {
      excludeSelectors.forEach(selector => {
        try {
          if (current.matches(selector)) {
            return true;
          }
        } catch (e) {}
      });
      current = current.parentElement;
    }
    return false;
  }

  function isInReplyContainer(element) {
    // Check if element is inside a Google Maps review reply container
    let current = element;
    while (current && current !== document.body) {
      const parent = current.parentElement;
      
      // Check for Google Maps reply dialog patterns
      if (parent) {
        // Reply interface has specific structure
        const hasReplyInterface = 
          parent.querySelector('[aria-label="Replying publicly"]') ||
          parent.getAttribute('aria-label') === 'Replying publicly' ||
          parent.className.includes('VaHEVc') ||
          parent.className.includes('KuKPRc');
        
        if (hasReplyInterface) {
          console.log('[Gemini Extension] Found reply container');
          return true;
        }
      }
      
      current = parent;
    }
    return false;
  }

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
    `;
    return button;
  }

  function findCommentText(replyField) {
    // Find the review text associated with this reply field
    let element = replyField;
    let commentText = '';
    let depth = 0;
    const maxDepth = 25;
    
    // Search up the DOM tree for comment/review content
    while (element && !commentText && element.parentElement && depth < maxDepth) {
      element = element.parentElement;
      depth++;
      
      // Skip elements that are too large
      if (element.children && element.children.length > 100) continue;
      
      // Get text content
      const text = (element.innerText || element.textContent || '').trim();
      
      if (text && text.length > 15 && text.length < 5000) {
        const lines = text.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
        
        // Look for review text patterns (usually 2-10 lines)
        if (lines.length >= 1 && lines.length <= 20) {
          // Filter out UI elements and metadata
          const reviewLines = lines.filter(line => 
            !line.match(/^(Reply|Cancel|Delete|Report|Additional|NEW|ago|ago|photos?|reviews?|Local Guide|Owner|Replying publicly|This customer will be|notified|visible|Business Profile)/i) &&
            !line.match(/(days?|hours?|minutes?|weeks?|months?|years?)\s+(ago|later)/i) &&
            !line.match(/^[\d]+\s*(out of|\/)/i) &&
            line.length > 10 &&
            line.length < 500
          );
          
          if (reviewLines.length > 0) {
            // Take the review text (usually the first meaningful content)
            commentText = reviewLines.slice(0, 5).join(' ').trim();
            
            // Remove extra whitespace
            commentText = commentText.replace(/\s+/g, ' ');
          }
        }
      }
    }
    
    return commentText || 'User review';
  }

  function attachButtonToField(replyField) {
    // Double-check this is actually a reply field
    if (!isInReplyContainer(replyField)) {
      console.log('[Gemini Extension] Field not in reply container, skipping');
      return;
    }

    // Check if already attached
    if (replyField.classList.contains('gemini-button-attached')) {
      return;
    }
    
    replyField.classList.add('gemini-button-attached');
    
    const button = createGenerateButton();
    
    // Insert button right after the reply field, before Reply/Cancel buttons
    if (replyField.parentElement) {
      // Find where to insert - usually right after the text area
      const nextElement = replyField.nextElementSibling;
      if (nextElement) {
        replyField.parentElement.insertBefore(button, nextElement);
      } else {
        replyField.parentElement.appendChild(button);
      }
    }

    console.log('[Gemini Extension] Button attached to reply field');

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.disabled = true;
      button.innerHTML = '⏳ Generating...';

      try {
        chrome.storage.sync.get(['tone', 'model'], (result) => {
          const tone = result.tone || 'professional';
          const model = result.model || 'gemini-2.5-flash';
          const commentText = findCommentText(replyField);

          console.log('[Gemini Extension] Generating reply for:', commentText.substring(0, 100));

          chrome.runtime.sendMessage(
            { action: 'generateReply', comment: commentText, tone, model },
            (response) => {
              if (response && response.success) {
                // Set the reply in the text field
                if (replyField.contentEditable === 'true') {
                  replyField.innerText = response.reply;
                  replyField.textContent = response.reply;
                  replyField.focus();
                  
                  // Trigger input events
                  const inputEvent = new Event('input', { bubbles: true });
                  const changeEvent = new Event('change', { bubbles: true });
                  replyField.dispatchEvent(inputEvent);
                  replyField.dispatchEvent(changeEvent);
                  
                  console.log('[Gemini Extension] Reply inserted:', response.reply.substring(0, 100));
                } else if (replyField.tagName === 'TEXTAREA') {
                  replyField.value = response.reply;
                  replyField.focus();
                  
                  const inputEvent = new Event('input', { bubbles: true });
                  replyField.dispatchEvent(inputEvent);
                }
                
                button.innerHTML = '✓ Generated!';
                setTimeout(() => {
                  button.innerHTML = '🧠 Generate Reply';
                  button.disabled = false;
                }, 2000);
              } else {
                const errorMsg = response?.error || 'Unknown error';
                console.error('[Gemini Extension] Error:', errorMsg);
                alert('Error: ' + errorMsg);
                button.innerHTML = '🧠 Generate Reply';
                button.disabled = false;
              }
            }
          );
        });
      } catch (error) {
        console.error('[Gemini Extension] Exception:', error);
        alert('Error generating reply: ' + error.message);
        button.innerHTML = '🧠 Generate Reply';
        button.disabled = false;
      }
    });
  }

  // Watch for reply interface to appear
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          let fields = [];
          
          try {
            if (node.querySelectorAll) {
              fields = Array.from(node.querySelectorAll(replySelectors.join(',')));
            }
          } catch (e) {
            console.log('[Gemini Extension] Selector error:', e.message);
          }
          
          // Check node itself
          if (node.matches) {
            replySelectors.forEach(selector => {
              try {
                if (node.matches(selector) && !isExcluded(node)) {
                  fields.push(node);
                }
              } catch (e) {}
            });
          }
          
          fields.forEach(field => {
            if (!field.classList.contains('gemini-button-attached') && 
                field.offsetParent !== null &&
                !isExcluded(field)) {
              attachButtonToField(field);
            }
          });
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable', 'aria-label', 'data-text', 'role']
  });

  // Initial scan - but only look in known reply containers
  console.log('[Gemini Extension] Performing initial scan');
  
  // First, find the reviews container
  const reviewsContainer = document.querySelector('[aria-label="Reviews"]') || document.querySelector('.reviews-container');
  const searchContainer = document.querySelector('.gLFyf')?.parentElement;
  
  replySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(field => {
        if (!field.classList.contains('gemini-button-attached') && 
            field.offsetParent !== null &&
            !isExcluded(field)) {
          attachButtonToField(field);
        }
      });
    } catch (e) {}
  });

  // Periodic scan every 2 seconds
  setInterval(() => {
    replySelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (!field.classList.contains('gemini-button-attached') && 
              field.offsetParent !== null &&
              !isExcluded(field)) {
            attachButtonToField(field);
          }
        });
      } catch (e) {}
    });
  }, 2000);

  console.log('[Gemini Extension] Content script initialized');
})();
