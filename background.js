// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    generateReply(request.comment, request.tone, request.rating).then(reply => {
      sendResponse({ success: true, reply });
    }).catch(error => {
      console.error('[Gemini Extension] Generate reply error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Keep channel open for async response
  } else if (request.action === 'testAPI') {
    testAPI(request.apiKey).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('[Gemini Extension] Test API error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

async function generateReply(comment, tone = 'professional', rating = 5) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(['apiKey', 'model'], async (result) => {
      if (!result.apiKey) {
        reject(new Error('API Key not configured. Please set your Gemini API key in the extension settings.'));
        return;
      }

      try {
        const model = result.model || 'gemini-2.5-flash';
        const apiKey = result.apiKey.trim();

        // Determine reply context based on rating
        let context = '';
        if (rating <= 2) {
          context = 'The customer left a negative review (1-2 stars). Acknowledge their specific concerns, apologize sincerely, offer concrete solutions to address their issues, and invite them to contact you directly to resolve the matter.';
        } else if (rating === 3) {
          context = 'The customer left a mixed/neutral review (3 stars). Thank them for their feedback, acknowledge both what went well and what could be improved, and explain what steps you are taking to improve.';
        } else if (rating === 4) {
          context = 'The customer left a good review (4 stars). Thank them warmly for their kind words, mention specific positive aspects if possible, and let them know you value their feedback.';
        } else {
          context = 'The customer left an excellent review (5 stars). Express genuine gratitude, appreciate their specific compliments, and invite them to visit again or try other offerings.';
        }

        // Create the prompt based on review type
        const prompt = `You are a professional business manager responding to a customer review on Google Maps.

Customer Review (${rating} out of 5 stars): "${comment}"

Context: ${context}

Generate a ${tone} reply that:
- Is exactly 2-3 sentences (NOT longer)
- Directly addresses the points made in the review
- Shows genuine care and understanding
- DOES NOT include generic phrases like "Thank you for your feedback"
- Feels personal and authentic
- Is appropriate for a business responding to this specific review

Reply (2-3 sentences only):`;

        console.log('[Gemini Extension] Sending request to Gemini API');
        console.log('[Gemini Extension] Model:', model);
        console.log('[Gemini Extension] Rating:', rating, 'stars');
        console.log('[Gemini Extension] Tone:', tone);

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
              maxOutputTokens: 512,
            }
          })
        });

        console.log('[Gemini Extension] API Response status:', response.status);

        if (!response.ok) {
          const errorData = await response.json();
          console.error('[Gemini Extension] API Error response:', errorData);
          
          let errorMessage = 'API request failed';
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.details?.[0]?.detail || errorMessage;
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('[Gemini Extension] API Response received');

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate reply. Please try again.';
        
        if (!reply || reply.trim().length === 0) {
          throw new Error('Empty response from API. The model may be rate-limited or unavailable.');
        }

        console.log('[Gemini Extension] Generated reply:', reply.substring(0, 100));
        resolve(reply.trim());
      } catch (error) {
        console.error('[Gemini Extension] Error in generateReply:', error);
        reject(error);
      }
    });
  });
}

async function testAPI(apiKey) {
  return new Promise((resolve, reject) => {
    const cleanApiKey = apiKey.trim();
    const model = 'gemini-2.5-flash';

    console.log('[Gemini Extension] Testing API with model:', model);

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
      console.log('[Gemini Extension] Test API response status:', response.status);
      
      if (!response.ok) {
        return response.json().then(errorData => {
          console.error('[Gemini Extension] Test API error:', errorData);
          let errorMessage = 'API test failed';
          if (errorData.error) {
            errorMessage = errorData.error.message || errorData.error.details?.[0]?.detail || errorMessage;
          }
          throw new Error(errorMessage);
        });
      }
      
      return response.json().then(data => {
        console.log('[Gemini Extension] Test API success');
        resolve();
      });
    }).catch(error => {
      console.error('[Gemini Extension] Test API fetch error:', error);
      reject(error);
    });
  });
}
