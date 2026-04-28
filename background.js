// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    generateReply(request.comment, request.tone).then(reply => {
      sendResponse({ success: true, reply });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'testAPI') {
    testAPI(request.apiKey).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function generateReply(comment, tone = 'professional') {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey'], async (result) => {
      if (!result.apiKey) {
        reject(new Error('API Key not configured'));
        return;
      }

      try {
        const prompt = `You are a helpful assistant generating a ${tone} reply to the following comment or review. Generate a concise, contextual, and appropriate response. Keep it to 2-3 sentences.\n\nComment: "${comment}"\n\nReply:`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + result.apiKey, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }]
          })
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'API request failed');
        }

        const data = await response.json();
        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate reply';
        resolve(reply.trim());
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function testAPI(apiKey) {
  return new Promise((resolve, reject) => {
    fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=' + apiKey, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Say hello'
          }]
        }]
      })
    }).then(response => {
      if (!response.ok) {
        throw new Error('API test failed');
      }
      resolve();
    }).catch(reject);
  });
}
