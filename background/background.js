/**
 * Manga Translator - Background Service Worker
 * خدمة الخلفية للإضافة
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

// Listen for messages from popup or content scripts
// الاستماع للرسائل من الواجهة أو سكريبتات المحتوى
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message, 'from:', sender);
  
  // Forward progress messages to popup - إعادة توجيه رسائل التقدم
  if (message.type === 'progress' || message.type === 'complete' || message.type === 'error') {
    // Broadcast to all extension pages - البث لكل صفحات الإضافة
    chrome.runtime.sendMessage(message).catch(() => {
      // Popup might be closed - الواجهة قد تكون مغلقة
    });
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
