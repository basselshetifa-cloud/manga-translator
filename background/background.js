/**
 * Manga Translator - Background Service Worker
 * خدمة الخلفية للإضافة
 * 
 * Uses Gemini Vision API for OCR and translation in one step
 * يستخدم Gemini Vision API للتعرف على النص والترجمة في خطوة واحدة
 */

// Extension installation event - حدث تثبيت الإضافة
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Manga Translator installed!', details.reason);
  
  // Set default settings on install - تعيين الإعدادات الافتراضية
  if (details.reason === 'install') {
    chrome.storage.local.set({
      apiProvider: 'gemini',
      sourceLang: 'jpn',
      targetLang: 'Arabic'
    });
    
    console.log('Default settings initialized');
  }
});

// Extension startup event - حدث بدء الإضافة
chrome.runtime.onStartup.addListener(() => {
  console.log('Manga Translator started');
});

/**
 * Extract text and translate using Gemini Vision API
 * استخراج النص وترجمته باستخدام Gemini Vision API
 * @param {string} imageBase64 - الصورة كـ base64 (بدون data URL prefix)
 * @param {string} mimeType - نوع الصورة (image/jpeg, image/png, etc.)
 * @param {Object} settings - إعدادات الترجمة
 * @returns {Promise<string>} النص المترجم
 */
async function extractAndTranslate(imageBase64, mimeType, settings) {
  const { apiKey, targetLang, sourceLang } = settings;
  
  if (!apiKey) {
    throw new Error('مفتاح API غير متوفر');
  }
  
  // Build source language context
  const sourceContext = {
    'jpn': 'Japanese manga',
    'kor': 'Korean manhwa',
    'chi_sim': 'Chinese (Simplified) manhua',
    'chi_tra': 'Chinese (Traditional) manhua',
    'eng': 'English translated manga/manhwa'
  };
  
  const contentType = sourceContext[sourceLang] || 'manga/manhwa';
  
  // Build the prompt for Gemini Vision
  const prompt = `You are an expert manga/manhwa translator. This is a ${contentType} image.

TASK: Extract ALL text from this image and translate it to ${targetLang}.

RULES:
1. Keep character names unchanged (transliterate to Arabic script if needed, e.g., ナルト = ناروتو)
2. Maintain the emotional tone and intensity
3. Translate sound effects with their meaning (e.g., ドキドキ = قلبي يدق بسرعة)
4. For ${targetLang === 'Arabic' ? 'Arabic, use Modern Standard Arabic (الفصحى), use Arabic quotation marks «»' : 'the target language, use natural expressions'}
5. If multiple speech bubbles exist, separate each translation with a newline

OUTPUT: Return ONLY the translated text, nothing else. No explanations, no notes, no "Here's the translation:".`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048
          }
        })
      }
    );
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(`خطأ من Gemini API: ${errorMessage}`);
    }
    
    const data = await response.json();
    
    if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text.trim();
    }
    
    throw new Error('رد غير صالح من Gemini API');
  } catch (error) {
    console.error('Gemini Vision API error:', error);
    throw error;
  }
}

/**
 * Fetch image and convert to base64
 * تحميل الصورة وتحويلها لـ base64
 * @param {string} url - رابط الصورة
 * @returns {Promise<Object>} الصورة كـ base64 مع نوع MIME
 */
async function fetchImageAsBase64(url) {
  try {
    const response = await fetch(url, {
      mode: 'cors',
      credentials: 'omit'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const blob = await response.blob();
    const mimeType = blob.type || 'image/jpeg';
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // reader.result is a data URL like "data:image/jpeg;base64,..."
        resolve({
          dataUrl: reader.result,
          mimeType: mimeType
        });
      };
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

/**
 * Extract base64 data from data URL
 * استخراج بيانات base64 من data URL
 * @param {string} dataUrl - data URL كاملة
 * @returns {Object} البيانات ونوع MIME
 */
function parseDataUrl(dataUrl) {
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (matches) {
    return {
      mimeType: matches[1],
      base64: matches[2]
    };
  }
  throw new Error('Invalid data URL format');
}

// Listen for messages from popup or content scripts
// الاستماع للرسائل من الواجهة أو سكريبتات المحتوى
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.action || message.type, 'from:', sender.tab?.url || 'extension');
  
  // Handle image fetch request - معالجة طلب تحميل الصورة
  if (message.action === 'fetchImage') {
    fetchImageAsBase64(message.url)
      .then(result => sendResponse({ success: true, data: result.dataUrl, mimeType: result.mimeType }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  // Handle extract and translate request (new Gemini Vision approach)
  // معالجة طلب الاستخراج والترجمة (النهج الجديد مع Gemini Vision)
  if (message.action === 'extractAndTranslate') {
    const { imageData, settings } = message;
    
    // Parse the data URL to get base64 and mime type
    let base64Data, mimeType;
    try {
      const parsed = parseDataUrl(imageData);
      base64Data = parsed.base64;
      mimeType = parsed.mimeType;
    } catch (e) {
      sendResponse({ success: false, error: 'صيغة الصورة غير صالحة' });
      return true;
    }
    
    extractAndTranslate(base64Data, mimeType, settings)
      .then(translatedText => sendResponse({ success: true, text: translatedText }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  // Forward progress messages to popup - إعادة توجيه رسائل التقدم
  if (message.type === 'progress' || message.type === 'complete' || message.type === 'error') {
    // Broadcast to all extension pages - البث لكل صفحات الإضافة
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might be closed - الواجهة قد تكون مغلقة
    });
  }
  
  return false;
});

console.log('Manga Translator background service worker loaded');
