const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk').default;

// ==========================================
// KEY MANAGEMENT - HARD CODED FOR VERCEL
// ==========================================

const GEMINI_KEYS = [
    "AIzaSyClpltsofl389yzhD_9ZqYCPjn_vdW_yRU",
    "AIzaSyC6orrdwhC4_q34KLjoher-1-izyug8fRs",
    "AIzaSyB9z7lX_EXP5uRsoZTMV0SBnCwjG1Lvpgg",
    "AIzaSyC7rivo3yzimjzJX21X1TehmCdW9GXNf3U",
    "AIzaSyBxLVTYW84iLAMhMr3a6FQW5rW8zZY6HSk"
];

const GROQ_KEYS = [
    "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",
    "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",
    "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",
    "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",
    "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",
    "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",
    "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",
    "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"
];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Selects a random key from the provided array for load distribution
 * @param {Array<string>} array - Array of API keys
 * @returns {string} Randomly selected key
 */
const getRandomKey = (array) => {
  const randomIndex = Math.floor(Math.random() * array.length);
  return array[randomIndex];
};

/**
 * Detects if any message contains an image for vision processing
 * @param {Array} messages - Array of message objects
 * @returns {boolean} True if an image is detected
 */
const containsImage = (messages) => {
  return messages.some(message => {
    if (Array.isArray(message.content)) {
      return message.content.some(content => 
        content.type === 'image_url' || content.type === 'image'
      );
    }
    return false;
  });
};

/**
 * Converts messages into Gemini's expected format with vision support
 * @param {Array} messages - Array of message objects
 * @returns {Object} Formatted content for Gemini
 */
const prepareGeminiContent = (messages) => {
  const parts = [];
  
  messages.forEach(message => {
    const role = message.role || 'user';
    
    if (typeof message.content === 'string') {
      parts.push({ text: message.content });
    } else if (Array.isArray(message.content)) {
      message.content.forEach(content => {
        if (content.type === 'text') {
          parts.push({ text: content.text });
        } else if (content.type === 'image_url' || content.type === 'image') {
          const imageData = content.image_url?.url || content.image;
          // Handle base64 images
          if (imageData.startsWith('data:image')) {
            const base64Data = imageData.split(',')[1];
            const mimeType = imageData.split(';')[0].split(':')[1];
            parts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            });
          }
        }
      });
    }
  });
  
  return { parts };
};

// ==========================================
// API CALL HANDLERS
// ==========================================

/**
 * Calls Google Gemini API
 * @param {Array} messages - Array of message objects
 * @param {string} model - Model identifier
 * @returns {Promise<string>} AI response text
 */
const callGeminiAPI = async (messages) => {
  const apiKey = getRandomKey(GEMINI_KEYS);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  
  try {
    const content = prepareGeminiContent(messages);
    const result = await model.generateContent(content);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    throw new Error(`Gemini API call failed: ${error.message}`);
  }
};

/**
 * Calls Groq API
 * @param {Array} messages - Array of message objects
 * @returns {Promise<string>} AI response text
 */
const callGroqAPI = async (messages) => {
  const apiKey = getRandomKey(GROQ_KEYS);
  const groq = new Groq({ apiKey });
  
  // Filter out images for Groq (text-only model)
  const textMessages = messages.map(msg => ({
    role: msg.role,
    content: typeof msg.content === 'string' 
      ? msg.content 
      : msg.content.filter(c => c.type === 'text').map(c => c.text).join(' ')
  }));
  
  try {
    const completion = await groq.chat.completions.create({
      messages: textMessages,
      model: 'llama-3.1-70b-versatile',
      temperature: 0.7,
      max_tokens: 1024
    });
    
    return completion.choices[0]?.message?.content || 'No response generated';
  } catch (error) {
    console.error('Groq API Error:', error.message);
    throw new Error(`Groq API call failed: ${error.message}`);
  }
};

// ==========================================
// EXPRESS APP SETUP
// ==========================================

const app = express();

// CORS configuration - adjust origin for production
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*', // Restrict in production
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));

// ==========================================
// MAIN ENDPOINT: POST /api/chat
// ==========================================

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, model } = req.body;
    
    // Validate input
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ 
        error: 'Invalid request: messages array is required' 
      });
    }

    console.log(`[OpenDesk Gateway] Request received - Model: ${model}, Messages: ${messages.length}`);

    // Check for vision content
    const hasImage = containsImage(messages);
    if (hasImage) {
      console.log('[OpenDesk Gateway] Vision detected - Routing to Gemini');
    }

    // Route to appropriate API
    let responseText;
    
    if (hasImage) {
      // FORCE Gemini for vision requests
      responseText = await callGeminiAPI(messages);
    } else if (model && (model.includes('groq') || model.includes('llama'))) {
      // Route to Groq for Llama models
      console.log('[OpenDesk Gateway] Routing to Groq (Llama)');
      responseText = await callGroqAPI(messages);
    } else {
      // Default to Gemini
      console.log('[OpenDesk Gateway] Routing to Gemini (Default)');
      responseText = await callGeminiAPI(messages);
    }

    res.json({ 
      success: true, 
      response: responseText,
      model: hasImage ? 'gemini-1.5-flash' : 
             (model && (model.includes('groq') || model.includes('llama'))) ? 'llama-3.1-70b-versatile' : 
             'gemini-1.5-flash'
    });

  } catch (error) {
    console.error('[OpenDesk Gateway] Error:', error.message);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
});

// ==========================================
// HEALTH CHECK ENDPOINT
// ==========================================

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'OpenDesk AI Gateway',
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// VERCEL SERVERLESS EXPORT
// ==========================================

module.exports = app;
