// Inject "Generate Reply" buttons on the page
(function() {
  // Target common reply/comment text areas
  const replySelectors = [
    'textarea',
    '[contenteditable="true"]',
    '[role="textbox"]',
    '.reply-input',
    '.comment-input',
    '#reply-text',
    '[aria-label*="reply" i]',
    '[aria-label*="comment" i]'
  ];

  function createGenerateButton() {
    const button = document.createElement('button');
    button.innerHTML = '🧠 Generate Reply';
    button.className = 'gemini-generate-btn';
    button.type = 'button';
    return button;
  }

  function findCommentText(replyField) {
    // Try to find the comment/review text above the reply field
    let element = replyField;
    let commentText = '';
    
    // Search up the DOM tree for comment content
    while (element && !commentText && element.parentElement) {
      element = element.parentElement;
      const text = element.innerText || element.textContent;
      if (text && text.length > 20 && text.length < 1000) {
        commentText = text;
      }
    }
    
    return commentText || 'User review';
  }

  function attachButtonToField(replyField) {
    // Check if button already attached
    if (replyField.nextElementSibling?.classList.contains('gemini-generate-btn')) {
      return;
    }

    const button = createGenerateButton();
    replyField.parentElement.insertBefore(button, replyField.nextSibling);

    button.addEventListener('click', async (e) => {
      e.preventDefault();
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
                } else {
                  replyField.value = response.reply;
                }
                replyField.focus();
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

  // Observe for new reply fields
  const observer = new MutationObserver(() => {
    replySelectors.forEach(selector => {
      document.querySelectorAll(selector).forEach(field => {
        if (!field.classList.contains('gemini-button-attached')) {
          field.classList.add('gemini-button-attached');
          attachButtonToField(field);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });

  // Initial scan
  replySelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach(field => {
      if (!field.classList.contains('gemini-button-attached')) {
        field.classList.add('gemini-button-attached');
        attachButtonToField(field);
      }
    });
  });
})();
