// Inject "Generate Reply" buttons on the page
(function() {
  console.log('[Gemini Extension] Content script loaded');

  // Target common reply/comment text areas across different platforms
  const replySelectors = [
    // Generic selectors
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '.reply-input',
    '.comment-input',
    '#reply-text',
    '[aria-label*="reply" i]',
    '[aria-label*="comment" i]',
    // Google Maps specific selectors
    '[aria-label="Replying publicly"]',
    'div[aria-label="Replying publicly"]',
    'div[contenteditable="true"][data-text="true"]',
    'div.VfPpkd-t08AT-Bz112c-M1sUe',
    'div[data-replyingtextarea="true"]',
    // Additional Google Maps selectors for newer layout
    'div[role="textbox"][contenteditable="true"]',
    'div[contenteditable="true"][data-initial-value]'
  ];

  function createGenerateButton() {
    const button = document.createElement('button');
    button.innerHTML = '🧠 Generate Reply';
    button.className = 'gemini-generate-btn';
    button.type = 'button';
    button.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 16px;
      border: none;
      border-radius: 5px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin: 10px 0;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      transition: all 0.3s;
    `;
    return button;
  }

  function findCommentText(replyField) {
    // Try to find the review/comment text
    let element = replyField;
    let commentText = '';
    let depth = 0;
    const maxDepth = 20;
    
    // Search up the DOM tree for comment/review content
    while (element && !commentText && element.parentElement && depth < maxDepth) {
      element = element.parentElement;
      depth++;
      
      // Skip elements that are too large
      if (element.children.length > 50) continue;
      
      // Get text content
      const text = element.innerText || element.textContent;
      
      if (text && text.length > 15 && text.length < 3000) {
        const lines = text.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0);
        
        // Look for review text patterns
        if (lines.length >= 1 && lines.length <= 15) {
          // Filter out UI elements
          const reviewLines = lines.filter(line => 
            !line.includes('Reply') && 
            !line.includes('Cancel') && 
            !line.includes('Delete') &&
            !line.includes('Report') &&
            !line.includes('Additional') &&
            !line.includes('days ago') &&
            !line.includes('hours ago') &&
            !line.includes('minutes ago') &&
            !line.includes('weeks ago') &&
            !line.includes('months ago') &&
            line.length > 10
          );
          
          if (reviewLines.length > 0) {
            commentText = reviewLines.slice(0, 3).join(' ');
          }
        }
      }
    }
    
    return commentText || 'User review';
  }

  function attachButtonToField(replyField) {
    // Check if button already attached
    if (replyField.classList.contains('gemini-button-attached')) {
      return;
    }
    
    replyField.classList.add('gemini-button-attached');
    
    const button = createGenerateButton();
    
    // Insert button after the reply field or inside parent
    if (replyField.parentElement) {
      replyField.parentElement.appendChild(button);
    } else {
      replyField.after(button);
    }

    console.log('[Gemini Extension] Button attached to field');

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.disabled = true;
      button.innerHTML = '⏳ Generating...';

      try {
        // Get tone preference
        chrome.storage.sync.get(['tone', 'model'], (result) => {
          const tone = result.tone || 'professional';
          const model = result.model || 'gemini-2.5-flash';
          const commentText = findCommentText(replyField);

          console.log('[Gemini Extension] Generating reply for:', commentText);

          chrome.runtime.sendMessage(
            { action: 'generateReply', comment: commentText, tone, model },
            (response) => {
              if (response && response.success) {
                // Set the reply in the text field
                if (replyField.contentEditable === 'true') {
                  replyField.innerText = response.reply;
                  replyField.textContent = response.reply;
                  replyField.focus();
                  
                  // Trigger input event
                  const inputEvent = new Event('input', { bubbles: true });
                  const changeEvent = new Event('change', { bubbles: true });
                  replyField.dispatchEvent(inputEvent);
                  replyField.dispatchEvent(changeEvent);
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
      // Look for newly added elements
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // Check if this node or its children contain reply fields
          let fields = [];
          
          try {
            if (node.querySelectorAll) {
              fields = Array.from(node.querySelectorAll(replySelectors.join(',')));
            }
          } catch (e) {
            // Skip invalid selector
          }
          
          // Also check the node itself
          if (node.matches) {
            replySelectors.forEach(selector => {
              try {
                if (node.matches(selector)) {
                  fields.push(node);
                }
              } catch (e) {
                // Skip invalid selector
              }
            });
          }
          
          fields.forEach(field => {
            if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
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

  // Initial scan
  console.log('[Gemini Extension] Performing initial scan');
  replySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(field => {
        if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
          attachButtonToField(field);
        }
      });
    } catch (e) {
      // Skip invalid selectors
    }
  });

  // Periodic scan every 1 second for dynamically loaded content
  setInterval(() => {
    replySelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
            attachButtonToField(field);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
  }, 1000);

  console.log('[Gemini Extension] Content script initialized');
})();
