/**
 * Offscreen Document for OCR Processing
 * مستند خارج الشاشة لمعالجة OCR
 * 
 * This runs in a separate context where we can use Tesseract.js
 * without CSP restrictions from the target website
 */

let tesseractWorker = null;

/**
 * Initialize Tesseract OCR worker
 * تهيئة عامل Tesseract OCR
 */
async function initOCR(lang) {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
  }
  
  // Map language codes - تحويل رموز اللغات
  const langMap = {
    'eng': 'eng',
    'jpn': 'jpn',
    'kor': 'kor',
    'chi_sim': 'chi_sim',
    'chi_tra': 'chi_tra'
  };
  
  const tesseractLang = langMap[lang] || 'eng';
  
  try {
    tesseractWorker = await Tesseract.createWorker(tesseractLang, 1, {
      workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract/tesseract-core-simd.wasm.js'),
      langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
      logger: (m) => {
        if (m.status === 'recognizing text') {
          chrome.runtime.sendMessage({
            type: 'ocr-progress',
            progress: m.progress
          });
        }
      }
    });
    
    console.log('Tesseract OCR initialized for language:', tesseractLang);
    return true;
  } catch (error) {
    console.error('Error initializing OCR:', error);
    throw error;
  }
}

/**
 * Recognize text from image
 * التعرف على النص من الصورة
 */
async function recognizeText(imageData) {
  if (!tesseractWorker) {
    throw new Error('OCR not initialized');
  }
  
  try {
    const { data: { text } } = await tesseractWorker.recognize(imageData);
    return text.trim();
  } catch (error) {
    console.error('Error recognizing text:', error);
    throw error;
  }
}

/**
 * Cleanup worker
 * تنظيف العامل
 */
async function cleanup() {
  if (tesseractWorker) {
    await tesseractWorker.terminate();
    tesseractWorker = null;
  }
}

// Listen for messages from background script
// الاستماع للرسائل من سكريبت الخلفية
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only handle messages targeted at offscreen document
  if (message.target !== 'offscreen') {
    return false;
  }
  
  if (message.action === 'ocr-init') {
    initOCR(message.lang)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'ocr-recognize') {
    recognizeText(message.imageData)
      .then(text => sendResponse({ success: true, text: text }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.action === 'ocr-cleanup') {
    cleanup()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  return false;
});

console.log('Offscreen OCR document loaded');
