// Inject "Generate Reply" buttons on the page
(function() {
  console.log('[Gemini Extension] Content script loaded');

  // Target the Google Maps review reply box
  const replySelectors = [
    'div[contenteditable="true"]',
    'textarea',
  ];

  function isReplyBox(element) {
    // Check if this is actually a reply box by looking at parent structure
    if (!element) return false;
    
    const text = (element.getAttribute('aria-label') || '').toLowerCase();
    const parent = element.parentElement;
    const parentText = (parent?.innerText || '').toLowerCase();
    
    // Look for "replying publicly" text nearby
    if (text.includes('replying') || parentText.includes('replying publicly')) {
      return true;
    }
    
    // Check if element has placeholder or aria-label mentioning reply/comment
    const placeholder = element.getAttribute('placeholder') || '';
    if (placeholder.includes('reply') || placeholder.includes('comment')) {
      return true;
    }
    
    // Check parent classes
    if (parent?.className?.includes('reply') || parent?.className?.includes('comment')) {
      return true;
    }
    
    // Check for "Replying publicly" in nearby text
    let current = element;
    for (let i = 0; i < 10; i++) {
      if (!current) break;
      const html = current.innerHTML || '';
      if (html.includes('Replying publicly')) {
        return true;
      }
      current = current.parentElement;
    }
    
    return false;
  }

  function extractRating(replyField) {
    let rating = 5;
    
    // Search up the DOM tree
    let current = replyField;
    for (let depth = 0; depth < 30; depth++) {
      if (!current) break;
      
      // Check aria-label for rating
      const ariaLabel = current.getAttribute('aria-label') || '';
      const match = ariaLabel.match(/(\d)\s+out of 5/);
      if (match) {
        rating = parseInt(match[1]);
        console.log('[Gemini Extension] Found rating from aria-label:', rating);
        return rating;
      }
      
      // Check for star elements
      const stars = current.querySelectorAll?.('i.material-icons-extended');
      if (stars && stars.length > 0) {
        let filled = 0;
        stars.forEach(s => {
          if (s.className.includes('lMAmUc')) filled++;
        });
        if (filled > 0 && filled <= 5) {
          console.log('[Gemini Extension] Found rating from stars:', filled);
          return filled;
        }
      }
      
      // Check role=img with aria-label
      const imgs = current.querySelectorAll?.('span[role="img"]');
      if (imgs) {
        imgs.forEach(img => {
          const label = img.getAttribute('aria-label') || '';
          const m = label.match(/(\d)\s+out of 5\s+stars?/);
          if (m) {
            rating = parseInt(m[1]);
            console.log('[Gemini Extension] Found rating from img:', rating);
          }
        });
        if (rating !== 5) return rating;
      }
      
      current = current.parentElement;
    }
    
    console.log('[Gemini Extension] Using default rating:', rating);
    return rating;
  }

  function findCommentText(replyField) {
    let commentText = '';
    let current = replyField;
    
    for (let depth = 0; depth < 30; depth++) {
      if (!current) break;
      
      const text = (current.innerText || current.textContent || '').trim();
      if (text && text.length > 20 && text.length < 5000) {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        
        if (lines.length >= 1 && lines.length <= 25) {
          const filtered = lines.filter(l => {
            const lower = l.toLowerCase();
            return !lower.match(/(reply|cancel|delete|report|additional|new|replying|this customer|owner|local guide|ago|photo)/i) &&
                   !lower.match(/(star|out of 5)/i) &&
                   l.trim().length > 10 &&
                   l.trim().length < 500;
          });
          
          if (filtered.length > 0) {
            commentText = filtered.slice(0, 5).join(' ').trim().replace(/\s+/g, ' ');
            if (commentText.length > 15) {
              console.log('[Gemini Extension] Found review text:', commentText.substring(0, 80));
              return commentText;
            }
          }
        }
      }
      
      current = current.parentElement;
    }
    
    return commentText || 'User review';
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.textContent = '🧠 Generate Reply';
    btn.className = 'gemini-reply-btn';
    btn.type = 'button';
    btn.style.cssText = `
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 10px 18px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      margin: 10px 5px;
      box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
      font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif;
    `;
    return btn;
  }

  function attachButton(field) {
    if (field.classList.contains('gemini-has-btn')) return;
    if (!isReplyBox(field)) return;
    
    field.classList.add('gemini-has-btn');
    
    const btn = createButton();
    field.parentElement.appendChild(btn);
    
    console.log('[Gemini Extension] Button attached!');
    
    btn.addEventListener('click', () => {
      btn.disabled = true;
      btn.textContent = '⏳ Generating...';
      
      const comment = findCommentText(field);
      const rating = extractRating(field);
      
      chrome.storage.sync.get(['tone', 'model'], (result) => {
        chrome.runtime.sendMessage({
          action: 'generateReply',
          comment,
          tone: result.tone || 'professional',
          model: result.model || 'gemini-2.5-flash',
          rating
        }, (response) => {
          if (response?.success) {
            if (field.contentEditable === 'true') {
              field.textContent = response.reply;
              field.innerText = response.reply;
            } else {
              field.value = response.reply;
            }
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            
            btn.textContent = '✓ Generated!';
            setTimeout(() => {
              btn.textContent = '🧠 Generate Reply';
              btn.disabled = false;
            }, 2000);
          } else {
            alert('Error: ' + (response?.error || 'Unknown'));
            btn.textContent = '🧠 Generate Reply';
            btn.disabled = false;
          }
        });
      });
    });
  }

  // Watch for changes
  const observer = new MutationObserver(() => {
    document.querySelectorAll('div[contenteditable="true"], textarea').forEach(field => {
      if (!field.classList.contains('gemini-has-btn')) {
        attachButton(field);
      }
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true
  });

  // Initial scan
  document.querySelectorAll('div[contenteditable="true"], textarea').forEach(field => {
    attachButton(field);
  });

  // Keep checking every 2 seconds
  setInterval(() => {
    document.querySelectorAll('div[contenteditable="true"], textarea').forEach(field => {
      if (!field.classList.contains('gemini-has-btn')) {
        attachButton(field);
      }
    });
  }, 2000);

  console.log('[Gemini Extension] Ready to attach buttons');
})();
