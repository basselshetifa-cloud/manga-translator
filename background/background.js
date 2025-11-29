/**
 * Manga Translator - Background Service Worker
 * خدمة الخلفية للإضافة
 */

let creatingOffscreen = null;

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
 * Create offscreen document for OCR
 * إنشاء مستند خارج الشاشة للـ OCR
 */
async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  
  // Check if offscreen document already exists
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  
  if (existingContexts.length > 0) {
    return; // Already exists
  }
  
  // Create offscreen document
  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: offscreenUrl,
      reasons: ['DOM_SCRAPING'],
      justification: 'OCR text extraction from manga images using Tesseract.js'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

/**
 * Perform OCR on image
 * تنفيذ OCR على الصورة
 */
async function performOCR(imageData, lang) {
  await setupOffscreenDocument();
  
  // Initialize OCR
  const initResponse = await chrome.runtime.sendMessage({
    action: 'ocr-init',
    lang: lang
  });
  
  if (!initResponse.success) {
    throw new Error(initResponse.error || 'Failed to initialize OCR');
  }
  
  // Recognize text
  const recognizeResponse = await chrome.runtime.sendMessage({
    action: 'ocr-recognize',
    imageData: imageData
  });
  
  if (!recognizeResponse.success) {
    throw new Error(recognizeResponse.error || 'Failed to recognize text');
  }
  
  return recognizeResponse.text;
}

/**
 * Fetch image and convert to base64
 * تحميل الصورة وتحويلها لـ base64
 * @param {string} url - رابط الصورة
 * @returns {Promise<string>} الصورة كـ base64
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
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Failed to read image blob'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Error fetching image:', error);
    throw error;
  }
}

// Listen for messages from popup or content scripts
// الاستماع للرسائل من الواجهة أو سكريبتات المحتوى
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from:', sender);
  
  // Handle image fetch request - معالجة طلب تحميل الصورة
  if (message.action === 'fetchImage') {
    fetchImageAsBase64(message.url)
      .then(base64 => sendResponse({ success: true, data: base64 }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
  
  // Handle OCR request - معالجة طلب OCR
  if (message.action === 'performOCR') {
    performOCR(message.imageData, message.lang)
      .then(text => sendResponse({ success: true, text: text }))
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
  
  // Handle OCR progress messages - معالجة رسائل تقدم OCR
  if (message.type === 'ocr-progress') {
    return false;
  }
  
  return false;
});

// Context menu for right-click translation (optional feature)
// قائمة السياق للترجمة بالنقر اليمين (ميزة اختيارية)
/*
chrome.contextMenus.create({
  id: 'translateImage',
  title: 'ترجم هذه الصورة',
  contexts: ['image']
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'translateImage') {
    chrome.tabs.sendMessage(tab.id, {
      action: 'translateSingleImage',
      imageUrl: info.srcUrl
    });
  }
});
*/

console.log('Manga Translator background service worker loaded');
