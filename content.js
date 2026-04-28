// Inject "Generate Reply" buttons on the page
(function() {
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
    'div.VfPpkd-t08AT-Bz112c-M1sUe', // Google Maps reply textarea container
    'div[data-replyingtextarea="true"]'
  ];

  function createGenerateButton() {
    const button = document.createElement('button');
    button.innerHTML = '🧠 Generate Reply';
    button.className = 'gemini-generate-btn';
    button.type = 'button';
    return button;
  }

  function findCommentText(replyField) {
    // Try to find the review/comment text above the reply field
    let element = replyField;
    let commentText = '';
    let depth = 0;
    const maxDepth = 15;
    
    // Search up the DOM tree for comment/review content
    while (element && !commentText && element.parentElement && depth < maxDepth) {
      element = element.parentElement;
      depth++;
      
      // Get all text content from this level
      const text = element.innerText || element.textContent;
      
      // Filter out very long text (likely entire page) and very short text
      if (text && text.length > 15 && text.length < 2000) {
        // Try to extract just the review text, not menu items, timestamps, etc
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        
        // Look for the review text (usually 2-4 lines)
        if (lines.length >= 2 && lines.length <= 10) {
          // Exclude lines that are likely UI elements
          const reviewText = lines
            .filter(line => !line.includes('Reply') && !line.includes('Cancel') && !line.includes('Delete') && line.length > 10)
            .slice(0, 5)
            .join(' ');
          
          if (reviewText.length > 15 && reviewText.length < 2000) {
            commentText = reviewText;
          }
        }
      }
    }
    
    return commentText || 'User review';
  }

  function attachButtonToField(replyField) {
    // Check if button already attached
    if (replyField.parentElement && replyField.parentElement.querySelector('.gemini-generate-btn')) {
      return;
    }

    const button = createGenerateButton();
    
    // Insert button after the reply field
    if (replyField.nextSibling) {
      replyField.parentElement.insertBefore(button, replyField.nextSibling);
    } else {
      replyField.parentElement.appendChild(button);
    }

    button.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      button.disabled = true;
      button.innerHTML = '⏳ Generating...';

      try {
        // Get tone preference
        chrome.storage.sync.get(['tone'], (result) => {
          const tone = result.tone || 'professional';
          const commentText = findCommentText(replyField);

          chrome.runtime.sendMessage(
            { action: 'generateReply', comment: commentText, tone },
            (response) => {
              if (response.success) {
                // Set the reply in the text field
                if (replyField.contentEditable === 'true') {
                  replyField.innerText = response.reply;
                  replyField.textContent = response.reply;
                  replyField.focus();
                  
                  // Trigger input event for frameworks that listen to it
                  const inputEvent = new Event('input', { bubbles: true });
                  replyField.dispatchEvent(inputEvent);
                } else if (replyField.tagName === 'TEXTAREA') {
                  replyField.value = response.reply;
                  replyField.focus();
                  
                  // Trigger input event
                  const inputEvent = new Event('input', { bubbles: true });
                  replyField.dispatchEvent(inputEvent);
                }
                
                button.innerHTML = '✓ Generated!';
                setTimeout(() => {
                  button.innerHTML = '🧠 Generate Reply';
                  button.disabled = false;
                }, 2000);
              } else {
                alert('Error: ' + response.error);
                button.innerHTML = '🧠 Generate Reply';
                button.disabled = false;
              }
            }
          );
        });
      } catch (error) {
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
          const fields = node.querySelectorAll ? Array.from(node.querySelectorAll(replySelectors.join(','))) : [];
          
          // Also check the node itself
          if (node.matches && replySelectors.some(selector => node.matches(selector))) {
            fields.push(node);
          }
          
          fields.forEach(field => {
            if (!field.classList.contains('gemini-button-attached')) {
              field.classList.add('gemini-button-attached');
              attachButtonToField(field);
            }
          });
        }
      });
    });
    
    // Also periodically scan for any unattached reply fields
    replySelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
            field.classList.add('gemini-button-attached');
            attachButtonToField(field);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['contenteditable', 'aria-label', 'data-text']
  });

  // Initial scan
  replySelectors.forEach(selector => {
    try {
      document.querySelectorAll(selector).forEach(field => {
        if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
          field.classList.add('gemini-button-attached');
          attachButtonToField(field);
        }
      });
    } catch (e) {
      // Skip invalid selectors
    }
  });

  // Periodic scan every 2 seconds for dynamically loaded content
  setInterval(() => {
    replySelectors.forEach(selector => {
      try {
        document.querySelectorAll(selector).forEach(field => {
          if (!field.classList.contains('gemini-button-attached') && field.offsetParent !== null) {
            field.classList.add('gemini-button-attached');
            attachButtonToField(field);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
  }, 2000);
})();
