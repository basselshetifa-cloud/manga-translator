/**
 * Manga Translator - Popup Script
 * سكريبت واجهة المستخدم للإضافة
 */

// DOM Elements - عناصر الصفحة
const apiProviderSelect = document.getElementById('apiProvider');
const apiKeyInput = document.getElementById('apiKey');
const toggleApiKeyBtn = document.getElementById('toggleApiKey');
const getApiKeyLink = document.getElementById('getApiKeyLink');
const sourceLangSelect = document.getElementById('sourceLang');
const targetLangSelect = document.getElementById('targetLang');
const translatePageBtn = document.getElementById('translatePage');
const selectImageBtn = document.getElementById('selectImage');
const undoAllBtn = document.getElementById('undoAll');
const downloadAllBtn = document.getElementById('downloadAll');
const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusMessage = document.getElementById('statusMessage');

// API Help Links - روابط المساعدة للحصول على API Keys
const API_HELP_LINKS = {
  gemini: 'https://aistudio.google.com/app/apikey',
  groq: 'https://console.groq.com/keys',
  cohere: 'https://dashboard.cohere.com/api-keys'
};

/**
 * Initialize popup - تهيئة الواجهة
 * Load saved settings from storage
 */
async function initPopup() {
  try {
    // Load saved settings - تحميل الإعدادات المحفوظة
    const settings = await chrome.storage.local.get([
      'apiProvider',
      'apiKey',
      'sourceLang',
      'targetLang'
    ]);

    // Apply saved settings - تطبيق الإعدادات
    if (settings.apiProvider) {
      apiProviderSelect.value = settings.apiProvider;
    }
    if (settings.apiKey) {
      apiKeyInput.value = settings.apiKey;
    }
    if (settings.sourceLang) {
      sourceLangSelect.value = settings.sourceLang;
    }
    if (settings.targetLang) {
      targetLangSelect.value = settings.targetLang;
    }

    // Update help link - تحديث رابط المساعدة
    updateHelpLink();
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Update API help link based on selected provider
 * تحديث رابط المساعدة حسب المزود المختار
 */
function updateHelpLink() {
  const provider = apiProviderSelect.value;
  getApiKeyLink.href = API_HELP_LINKS[provider] || '#';
}

/**
 * Save settings to storage - حفظ الإعدادات
 */
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      apiProvider: apiProviderSelect.value,
      apiKey: apiKeyInput.value,
      sourceLang: sourceLangSelect.value,
      targetLang: targetLangSelect.value
    });
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Toggle API key visibility - إظهار/إخفاء مفتاح API
 */
function toggleApiKeyVisibility() {
  if (apiKeyInput.type === 'password') {
    apiKeyInput.type = 'text';
    toggleApiKeyBtn.textContent = '🙈';
  } else {
    apiKeyInput.type = 'password';
    toggleApiKeyBtn.textContent = '👁️';
  }
}

/**
 * Show status message - عرض رسالة الحالة
 * @param {string} message - الرسالة
 * @param {string} type - نوع الرسالة (success/error/info)
 */
function showStatus(message, type = 'info') {
  statusMessage.textContent = message;
  statusMessage.className = `status-message ${type}`;
  
  // Auto-hide after 5 seconds - إخفاء تلقائي
  setTimeout(() => {
    statusMessage.className = 'status-message';
  }, 5000);
}

/**
 * Update progress bar - تحديث شريط التقدم
 * @param {number} percent - النسبة المئوية
 * @param {string} text - النص المعروض
 */
function updateProgress(percent, text) {
  progressFill.style.width = `${percent}%`;
  progressText.textContent = text;
}

/**
 * Show/hide progress container - إظهار/إخفاء حاوية التقدم
 * @param {boolean} show - إظهار أم إخفاء
 */
function showProgress(show) {
  if (show) {
    progressContainer.classList.add('active');
    updateProgress(0, 'جاري التحضير...');
  } else {
    progressContainer.classList.remove('active');
  }
}

/**
 * Get current settings - الحصول على الإعدادات الحالية
 * @returns {Object} الإعدادات
 */
function getSettings() {
  return {
    apiProvider: apiProviderSelect.value,
    apiKey: apiKeyInput.value,
    sourceLang: sourceLangSelect.value,
    targetLang: targetLangSelect.value
  };
}

/**
 * Validate settings before translation
 * التحقق من الإعدادات قبل الترجمة
 * @returns {boolean} هل الإعدادات صحيحة
 */
function validateSettings() {
  const settings = getSettings();
  
  if (!settings.apiKey || settings.apiKey.trim() === '') {
    showStatus('الرجاء إدخال مفتاح API أولاً', 'error');
    apiKeyInput.focus();
    return false;
  }
  
  return true;
}

/**
 * Send message to content script
 * إرسال رسالة إلى content script
 * @param {string} action - الإجراء المطلوب
 */
async function sendToContentScript(action) {
  // Validate settings - التحقق من الإعدادات
  if (!validateSettings()) {
    return;
  }

  // Save settings - حفظ الإعدادات
  await saveSettings();

  try {
    // Get active tab - الحصول على التبويب النشط
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('لم يتم العثور على تبويب نشط', 'error');
      return;
    }

    // Show progress - إظهار التقدم
    showProgress(true);
    updateProgress(10, 'جاري الاتصال بالصفحة...');

    // Send message to content script - إرسال الرسالة
    const settings = getSettings();
    const response = await chrome.tabs.sendMessage(tab.id, {
      action: action,
      settings: settings
    });

    // Handle response - معالجة الرد
    if (response && response.success) {
      showStatus(response.message || 'تمت العملية بنجاح!', 'success');
    } else if (response && response.error) {
      showStatus(response.error, 'error');
    }

  } catch (error) {
    console.error('Error sending message:', error);
    showStatus('حدث خطأ في الاتصال بالصفحة. تأكد من تحديث الصفحة.', 'error');
  } finally {
    showProgress(false);
  }
}

/**
 * Handle translate page button click
 * معالجة زر ترجمة الصفحة
 */
function handleTranslatePage() {
  sendToContentScript('translatePage');
}

/**
 * Handle select image button click
 * معالجة زر اختيار صورة
 */
function handleSelectImage() {
  sendToContentScript('selectImage');
  // Close popup to allow image selection - إغلاق النافذة للسماح بالاختيار
  window.close();
}

/**
 * Handle undo all button click
 * معالجة زر التراجع عن الكل
 */
async function handleUndoAll() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('لم يتم العثور على تبويب نشط', 'error');
      return;
    }
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'undoAll' });
    
    if (response && response.success) {
      showStatus(response.message || 'تم التراجع عن الترجمات', 'success');
    } else {
      showStatus('لا توجد ترجمات للتراجع عنها', 'info');
    }
  } catch (error) {
    console.error('Error in undo:', error);
    showStatus('حدث خطأ. تأكد من تحديث الصفحة.', 'error');
  }
}

/**
 * Handle download all button click
 * معالجة زر تحميل الكل
 */
async function handleDownloadAll() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showStatus('لم يتم العثور على تبويب نشط', 'error');
      return;
    }
    
    // First check how many translated images exist
    const countResponse = await chrome.tabs.sendMessage(tab.id, { action: 'getTranslatedCount' });
    
    if (!countResponse || countResponse.count === 0) {
      showStatus('لا توجد صور مترجمة للتحميل', 'info');
      return;
    }
    
    showStatus(`جاري تحميل ${countResponse.count} صورة...`, 'info');
    
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'downloadAllImages' });
    
    if (response && response.success) {
      showStatus(`تم بدء تحميل ${response.count} صورة`, 'success');
    } else {
      showStatus('فشل تحميل الصور', 'error');
    }
  } catch (error) {
    console.error('Error in download:', error);
    showStatus('حدث خطأ. تأكد من تحديث الصفحة.', 'error');
  }
}

/**
 * Listen for progress updates from content script
 * الاستماع لتحديثات التقدم من content script
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'progress') {
    showProgress(true);
    updateProgress(message.percent, message.text);
  } else if (message.type === 'complete') {
    showProgress(false);
    showStatus(message.message, 'success');
  } else if (message.type === 'error') {
    showProgress(false);
    showStatus(message.message, 'error');
  }
});

// Event Listeners - مستمعي الأحداث
document.addEventListener('DOMContentLoaded', initPopup);
apiProviderSelect.addEventListener('change', () => {
  updateHelpLink();
  saveSettings();
});
apiKeyInput.addEventListener('change', saveSettings);
sourceLangSelect.addEventListener('change', saveSettings);
targetLangSelect.addEventListener('change', saveSettings);
toggleApiKeyBtn.addEventListener('click', toggleApiKeyVisibility);
translatePageBtn.addEventListener('click', handleTranslatePage);
selectImageBtn.addEventListener('click', handleSelectImage);
undoAllBtn.addEventListener('click', handleUndoAll);
downloadAllBtn.addEventListener('click', handleDownloadAll);

// Open help link in new tab - فتح رابط المساعدة في تبويب جديد
getApiKeyLink.addEventListener('click', async (e) => {
  e.preventDefault();
  const url = getApiKeyLink.href;
  // Validate URL against allowed domains - التحقق من الرابط
  const allowedUrls = Object.values(API_HELP_LINKS);
  if (url && url !== '#' && allowedUrls.includes(url)) {
    await chrome.tabs.create({ url: url });
  }
});
