// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    generateReply(request.comment, request.tone).then(reply => {
      sendResponse({ success: true, reply });
    }).catch(error => {
      console.error('Generate reply error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'testAPI') {
    testAPI(request.apiKey).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Test API error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function generateReply(comment, tone = 'professional') {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey', 'model'], async (result) => {
      if (!result.apiKey) {
        reject(new Error('API Key not configured. Please set your Gemini API key in the extension settings.'));
        return;
      }

      try {
        const model = result.model || 'gemini-2.5-flash'; // Default to Gemini 2.5 Flash
        const apiKey = result.apiKey.trim();

        // Create the prompt
        const prompt = `You are a professional business assistant generating a ${tone} reply to the following customer review or comment. 

Generate a concise, contextual, and appropriate response that:
- Addresses the customer's concerns or compliments
- Is professional and courteous
- Is 2-3 sentences maximum
- Shows genuine engagement

Customer Review: "${comment}"

Reply:`;

        console.log('Sending request to Gemini API with model:', model);
        console.log('API Key length:', apiKey.length);

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: prompt
              }]
            }],
            generationConfig: {
              temperature: 0.7,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 1024,
            }
          })
        });

        console.log('API Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('API Error response:', errorData);
          
          let errorMessage = 'API request failed';
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.details?.[0]?.detail || errorMessage;
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('API Response data:', data);

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate reply. Please try again.';
        
        if (!reply || reply.trim().length === 0) {
          throw new Error('Empty response from API. The model may be rate-limited or unavailable.');
        }

        resolve(reply.trim());
      } catch (error) {
        console.error('Error in generateReply:', error);
        reject(error);
      }
    });
  });
}

async function testAPI(apiKey) {
  return new Promise((resolve, reject) => {
    const cleanApiKey = apiKey.trim();
    const model = 'gemini-2.5-flash';

    console.log('Testing API with model:', model);

    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${cleanApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Say hello in one word'
          }]
        }]
      })
    }).then(response => {
      console.log('Test API response status:', response.status);
      
      if (!response.ok) {
        return response.json().then(errorData => {
          console.error('Test API error:', errorData);
          let errorMessage = 'API test failed';
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.details?.[0]?.detail || errorMessage;
          }
          throw new Error(errorMessage);
        });
      }
      
      return response.json().then(data => {
        console.log('Test API success:', data);
        resolve();
      });
    }).catch(error => {
      console.error('Test API fetch error:', error);
      reject(error);
    });
  });
}
