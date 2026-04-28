// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'generateReply') {
    generateReply(request.comment, request.tone, request.rating).then(reply => {
      sendResponse({ success: true, reply });
    }).catch(error => {
      console.error('Generate reply error:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
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

        // Create context-aware prompt based on review rating
        let replyContext = '';
        let replyGuidance = '';

        if (rating <= 2) {
          // Negative review - acknowledge concerns, offer solutions
          replyContext = 'The customer left a negative review (1-2 stars). ';
          replyGuidance = `Generate a professional, empathetic response that:
- Acknowledges their specific concerns
- Shows genuine care for their experience
- Offers a solution or improvement action
- Invites them to contact management for resolution
- Is 2-3 sentences maximum`;
        } else if (rating === 3) {
          // Mixed review - acknowledge feedback
          replyContext = 'The customer left a mixed review (3 stars). ';
          replyGuidance = `Generate a professional response that:
- Acknowledges both positive and negative points
- Thanks them for constructive feedback
- Commits to addressing the concerns mentioned
- Shows appreciation for their honesty
- Is 2-3 sentences maximum`;
        } else if (rating === 4) {
          // Good review - appreciate and invite engagement
          replyContext = 'The customer left a good review (4 stars). ';
          replyGuidance = `Generate a professional, warm response that:
- Thanks them for the positive feedback
- Acknowledges what they appreciated
- Addresses any minor concerns if mentioned
- Invites them to revisit
- Is 2-3 sentences maximum`;
        } else {
          // Excellent review (5 stars) - express gratitude
          replyContext = 'The customer left an excellent review (5 stars). ';
          replyGuidance = `Generate a professional, warm response that:
- Expresses genuine gratitude for the positive review
- Acknowledges what made their experience great
- Invites them to visit again or share with others
- Builds customer loyalty
- Is 2-3 sentences maximum`;
        }

        // Create the prompt
        const prompt = `${replyContext}You are a professional business assistant generating a ${tone} reply to a customer review.

Customer Review: "${comment}"

${replyGuidance}

Important: 
- Keep the reply authentic and specific to their feedback
- Do NOT use generic responses
- Match the tone to the business context
- Be professional yet warm
- Do NOT include phrases like "Thank you for your feedback" as opening - be more specific
- Focus on what makes the response valuable to the customer

Reply:`;

        console.log('[Gemini Extension] Rating:', rating, '| Model:', model);

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
        console.log('[Gemini Extension] API Response data:', data);

        const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Could not generate reply. Please try again.';
        
        if (!reply || reply.trim().length === 0) {
          throw new Error('Empty response from API. The model may be rate-limited or unavailable.');
        }

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
        console.log('[Gemini Extension] Test API success:', data);
        resolve();
      });
    }).catch(error => {
      console.error('[Gemini Extension] Test API fetch error:', error);
      reject(error);
    });
  });
}
