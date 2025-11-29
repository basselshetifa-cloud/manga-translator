/**
 * Manga Translator - Background Service Worker
 * خدمة الخلفية للإضافة
 */

// Import Tesseract.js
importScripts('../lib/tesseract/tesseract.min.js');

let tesseractWorker = null;
let currentLang = null;

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
 * Initialize Tesseract OCR worker
 * تهيئة عامل Tesseract OCR
 */
async function initOCR(lang) {
  // If already initialized with same language, skip
  if (tesseractWorker && currentLang === lang) {
    console.log('OCR already initialized for:', lang);
    return;
  }
  
  // Terminate existing worker if different language
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
  
  const langMap = {
    'eng': 'eng',
    'jpn': 'jpn',
    'kor': 'kor',
    'chi_sim': 'chi_sim',
    'chi_tra': 'chi_tra'
  };
  
  const tesseractLang = langMap[lang] || 'eng';
  
  try {
    console.log('Initializing Tesseract for language:', tesseractLang);
    
    tesseractWorker = await Tesseract.createWorker(tesseractLang, 1, {
      workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract/tesseract-core-simd.wasm.js'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
      logger: (m) => {
        if (m.status === 'recognizing text') {
          console.log('OCR Progress:', Math.round(m.progress * 100) + '%');
        }
      }
    });
    
    currentLang = lang;
    console.log('Tesseract OCR initialized successfully');
  } catch (error) {
    console.error('Error initializing OCR:', error);
    throw error;
  }
}

/**
 * Perform OCR on image
 * تنفيذ OCR على الصورة
 */
async function performOCR(imageData, lang) {
  try {
    // Initialize if needed
    await initOCR(lang);
    
    if (!tesseractWorker) {
      throw new Error('OCR worker not initialized');
    }
    
    console.log('Starting OCR recognition...');
    const { data: { text } } = await tesseractWorker.recognize(imageData);
    console.log('OCR completed, text length:', text.length);
    
    return text.trim();
  } catch (error) {
    console.error('OCR error:', error);
    throw error;
  }
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
  
  return false;
});

console.log('Manga Translator background service worker loaded');
