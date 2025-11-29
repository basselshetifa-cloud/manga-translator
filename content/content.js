/**
 * Manga Translator - Content Script
 * السكريبت الرئيسي لترجمة المانجا
 */

// ============================================
// API Configurations - إعدادات واجهات الترجمة
// ============================================

const API_CONFIGS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    /**
     * Build request for Google Gemini API
     * بناء الطلب لـ Google Gemini
     */
    buildRequest: (text, targetLang, apiKey, sourceLang) => ({
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: buildTranslationPrompt(text, targetLang, sourceLang)
            }]
          }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024
          }
        })
      },
      parseResponse: (data) => {
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
          return data.candidates[0].content.parts[0].text.trim();
        }
        throw new Error('Invalid Gemini response');
      }
    })
  },
  
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    /**
     * Build request for Groq API
     * بناء الطلب لـ Groq
     */
    buildRequest: (text, targetLang, apiKey, sourceLang) => ({
      url: 'https://api.groq.com/openai/v1/chat/completions',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [{
            role: 'user',
            content: buildTranslationPrompt(text, targetLang, sourceLang)
          }],
          temperature: 0.3,
          max_tokens: 1024
        })
      },
      parseResponse: (data) => {
        if (data.choices && data.choices[0]?.message?.content) {
          return data.choices[0].message.content.trim();
        }
        throw new Error('Invalid Groq response');
      }
    })
  },
  
  cohere: {
    url: 'https://api.cohere.ai/v1/generate',
    /**
     * Build request for Cohere API
     * بناء الطلب لـ Cohere
     */
    buildRequest: (text, targetLang, apiKey, sourceLang) => ({
      url: 'https://api.cohere.ai/v1/generate',
      options: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'command',
          prompt: buildTranslationPrompt(text, targetLang, sourceLang),
          max_tokens: 1024,
          temperature: 0.3
        })
      },
      parseResponse: (data) => {
        if (data.generations && data.generations[0]?.text) {
          return data.generations[0].text.trim();
        }
        throw new Error('Invalid Cohere response');
      }
    })
  }
};

// ============================================
// Global Variables - المتغيرات العامة
// ============================================

let isSelectionMode = false;
let currentSettings = null;

// Cache for translations - كاش للترجمات
const translationCache = new Map();

// Store original images for undo - حفظ الصور الأصلية للتراجع
const originalImages = new Map();

// Intersection Observer for lazy loading - المراقب للتحميل الكسول
let lazyLoadObserver = null;

// ============================================
// Translation Prompt - نص التوجيه للترجمة
// ============================================

/**
 * Build translation prompt for AI
 * بناء نص التوجيه للترجمة
 * @param {string} text - النص المراد ترجمته
 * @param {string} targetLang - لغة الهدف
 * @param {string} sourceLang - لغة المصدر (اختياري)
 * @returns {string} نص التوجيه
 */
function buildTranslationPrompt(text, targetLang, sourceLang = '') {
  // تحديد نوع المحتوى بناءً على لغة المصدر
  const sourceContext = {
    'jpn': 'Japanese manga',
    'kor': 'Korean manhwa',
    'chi_sim': 'Chinese manhua',
    'chi_tra': 'Chinese manhua',
    'eng': 'English translated manga/manhwa'
  };
  
  const contentType = sourceContext[sourceLang] || 'manga/manhwa';
  
  // توجيهات خاصة للعربية
  const arabicInstructions = targetLang === 'Arabic' ? `
- Use Modern Standard Arabic (الفصحى) throughout the translation
- Keep the language elegant, clear, and professional
- Use proper Arabic grammar and sentence structure
- Avoid colloquial/dialect words completely
- Write numbers in Arabic numerals (١، ٢، ٣) or words when appropriate
- Use Arabic quotation marks «» for speech
- For emphasis, use proper Arabic emphatic structures` : '';

  // توجيهات خاصة بنوع المحتوى
  const contentInstructions = {
    'Japanese manga': `
- Preserve Japanese honorifics: -san (سان), -kun (كون), -chan (تشان), -sama (ساما), -sensei (سينسي)
- Keep attack/technique names in transliterated Japanese with meaning in parentheses if needed
- Common expressions: すごい = رهيب/خطير، やばい = مصيبة، なるほど = فاهم/آه صح`,
    
    'Korean manhwa': `
- Adapt Korean honorifics: 형/오빠 = أخي الكبير، 선배 = سينباي/الأكبر، 님 = -نيم (للاحترام)
- Korean expressions: 대박 = خطير/رهيب، 화이팅 = فايتنج/قاتل، 아이고 = يا إلهي
- Pay attention to formal (합쇼체) vs informal (반말) speech levels`,
    
    'Chinese manhua': `
- For cultivation/Xianxia terms: 气 = تشي، 丹田 = دانتيان، 境界 = مرحلة/عالم، 突破 = اختراق
- Titles: 师父 = المعلم، 前辈 = السيد الأكبر، 弟子 = التلميذ
- Keep martial arts technique names with transliteration`,
    
    'English translated manga/manhwa': `
- This is already translated manga/manhwa in English
- Focus on natural Arabic translation that flows well
- Maintain any Japanese/Korean/Chinese terms that were kept in English (like honorifics, attack names)
- Adapt English expressions and idioms to Arabic equivalents
- Keep character names as they appear in the English version`
  };

  const specificInstructions = contentInstructions[contentType] || '';

  return `You are a veteran scanlation translator with 10+ years of experience in translating ${contentType}.

TARGET LANGUAGE: ${targetLang}

CORE RULES:
1. **Names**: Keep ALL character names unchanged - transliterate to Arabic script if needed (e.g., ナルト = ناروتو)
2. **Tone**: Match the emotional intensity exactly - dramatic scenes stay dramatic, funny scenes stay funny
3. **Natural Flow**: Translation must read like native ${targetLang}, not awkward literal translation
4. **Incomplete Text**: Manga often has incomplete sentences - complete them naturally based on context
5. **Sound Effects**: Translate the MEANING, not the sound (ドキドキ = قلبي يدق بسرعة، 쾅 = بووم/انفجار)
${specificInstructions}
${arabicInstructions}

QUALITY STANDARDS:
- Must sound like professionally translated manga that native ${targetLang} readers enjoy
- Preserve character personality through their speech patterns
- Keep the same energy and vibe as the original

OUTPUT: Translation ONLY. No explanations. No notes. No "Here's the translation:". Just the translated text.

---
TEXT TO TRANSLATE:
${text}`;
}

// ============================================
// Gemini Vision Functions - وظائف Gemini Vision
// ============================================

/**
 * Extract text and translate via background script using Gemini Vision API
 * استخراج النص وترجمته عبر سكريبت الخلفية باستخدام Gemini Vision API
 * @param {string} imageData - الصورة كـ data URL
 * @param {Object} settings - إعدادات الترجمة
 * @returns {Promise<string>} النص المترجم
 */
async function extractAndTranslateViaBackground(imageData, settings) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'extractAndTranslate', imageData: imageData, settings: settings },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve(response.text);
        } else {
          reject(new Error(response?.error || 'فشل استخراج النص والترجمة'));
        }
      }
    );
  });
}

// ============================================
// Translation Functions - وظائف الترجمة
// ============================================

/**
 * Translate text using selected API
 * ترجمة النص باستخدام API المحدد
 * @param {string} text - النص المراد ترجمته
 * @param {string} targetLang - لغة الهدف
 * @param {string} apiProvider - مزود API
 * @param {string} apiKey - مفتاح API
 * @param {string} sourceLang - لغة المصدر (اختياري)
 * @returns {Promise<string>} النص المترجم
 */
async function translateText(text, targetLang, apiProvider, apiKey, sourceLang) {
  const config = API_CONFIGS[apiProvider];
  if (!config) {
    throw new Error(`Unknown API provider: ${apiProvider}`);
  }
  
  sendProgress(60, 'جاري الترجمة بالذكاء الاصطناعي...');
  
  try {
    const request = config.buildRequest(text, targetLang, apiKey, sourceLang);
    const response = await fetch(request.url, request.options);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMessage = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(`خطأ من API: ${errorMessage}`);
    }
    
    const data = await response.json();
    const translatedText = request.parseResponse(data);
    
    console.log('Translated text:', translatedText);
    return translatedText;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}

// ============================================
// Cache Functions - وظائف الكاش
// ============================================

/**
 * Generate hash for image data URL
 * توليد hash للصورة
 * @param {string} dataUrl - الصورة كـ data URL
 * @returns {string} hash الصورة
 */
function hashImageData(dataUrl) {
  let hash = 0;
  const str = dataUrl.substring(0, 10000); // Use first 10000 chars for speed
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}

/**
 * Get cached translation if available
 * الحصول على ترجمة مخزنة إن وجدت
 * @param {string} imageHash - hash الصورة
 * @param {string} targetLang - لغة الهدف
 * @returns {Object|null} الترجمة المخزنة أو null
 */
function getCachedTranslation(imageHash, targetLang) {
  const cacheKey = `${imageHash}_${targetLang}`;
  if (translationCache.has(cacheKey)) {
    console.log('Cache hit for image:', cacheKey);
    return translationCache.get(cacheKey);
  }
  return null;
}

/**
 * Store translation in cache
 * تخزين الترجمة في الكاش
 * @param {string} imageHash - hash الصورة
 * @param {string} targetLang - لغة الهدف
 * @param {Object} data - بيانات الترجمة
 */
function setCachedTranslation(imageHash, targetLang, data) {
  const cacheKey = `${imageHash}_${targetLang}`;
  translationCache.set(cacheKey, data);
  
  // Limit cache size to 50 entries
  if (translationCache.size > 50) {
    const firstKey = translationCache.keys().next().value;
    translationCache.delete(firstKey);
  }
}

// ============================================
// Bubble Detection Functions - وظائف كشف الفقاعات
// ============================================

/**
 * Get bubble colors based on average brightness
 * الحصول على ألوان الفقاعة حسب متوسط السطوع
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {Object} bubble - معلومات الفقاعة
 * @returns {Object} ألوان الخلفية والنص
 */
function getBubbleColors(canvas, bubble) {
  const ctx = canvas.getContext('2d');
  
  // Sample the center area of the bubble
  const sampleX = Math.max(0, Math.floor(bubble.x + bubble.width * 0.25));
  const sampleY = Math.max(0, Math.floor(bubble.y + bubble.height * 0.25));
  const sampleWidth = Math.min(Math.floor(bubble.width * 0.5), canvas.width - sampleX);
  const sampleHeight = Math.min(Math.floor(bubble.height * 0.5), canvas.height - sampleY);
  
  if (sampleWidth <= 0 || sampleHeight <= 0) {
    return { background: '#FFFFFF', text: '#000000' };
  }
  
  const imageData = ctx.getImageData(sampleX, sampleY, sampleWidth, sampleHeight);
  const data = imageData.data;
  
  // Calculate average brightness - حساب متوسط السطوع
  let totalBrightness = 0;
  let pixelCount = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalBrightness += (r + g + b) / 3;
    pixelCount++;
  }
  
  const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 255;
  
  // If bubble is dark, use white text on dark background
  // لو الفقاعة غامقة، النص أبيض والعكس
  if (avgBrightness < 128) {
    return { background: '#000000', text: '#FFFFFF', isDark: true };
  } else {
    return { background: '#FFFFFF', text: '#000000', isDark: false };
  }
}

/**
 * Detect text regions using Gemini Vision API
 * كشف مناطق النص باستخدام Gemini Vision API
 * @param {string} imageDataUrl - الصورة كـ data URL
 * @param {Object} settings - الإعدادات
 * @returns {Promise<Array>} مصفوفة مناطق النص
 */
async function detectTextRegionsViaGemini(imageDataUrl, settings) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'detectTextRegions', imageData: imageDataUrl, settings: settings },
      (response) => {
        if (chrome.runtime.lastError) {
          // Fall back to local detection if API fails
          resolve(null);
          return;
        }
        if (response && response.success && response.regions) {
          resolve(response.regions);
        } else {
          resolve(null); // Fall back to local detection
        }
      }
    );
  });
}

/**
 * Parse bubble positions from translation response
 * استخراج مواقع الفقاعات من رد الترجمة
 * @param {string} translatedText - النص المترجم مع المواقع
 * @param {number} canvasWidth - عرض الكانفاس
 * @param {number} canvasHeight - ارتفاع الكانفاس
 * @returns {Array} مصفوفة الفقاعات مع النصوص
 */
function parseBubblesFromResponse(translatedText, canvasWidth, canvasHeight) {
  const bubbles = [];
  
  // Try to parse JSON format first
  try {
    // Check if response contains JSON array
    const jsonMatch = translatedText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map((item, index) => ({
          x: item.x || 0,
          y: item.y || 0,
          width: item.width || canvasWidth * 0.4,
          height: item.height || canvasHeight * 0.1,
          centerX: (item.x || 0) + (item.width || canvasWidth * 0.4) / 2,
          centerY: (item.y || 0) + (item.height || canvasHeight * 0.1) / 2,
          text: item.text || item.translation || '',
          index: index
        })).filter(b => b.text.trim());
      }
    }
  } catch (e) {
    // JSON parsing failed, continue with text splitting
  }
  
  // Fall back to simple text splitting
  const textParts = translatedText.split(/[.!?。！？\n]+/).filter(t => t.trim());
  return textParts.map((text, index) => ({
    text: text.trim(),
    index: index
  }));
}

/**
 * Detect and clean speech bubbles in image (improved version)
 * كشف وتبييض فقاعات الكلام (النسخة المحسنة)
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {Array} textRegions - مناطق النص المكتشفة (اختياري)
 * @returns {Array} مصفوفة الفقاعات المكتشفة
 */
function detectAndCleanBubbles(canvas, textRegions = null) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  
  // If we have text regions from Gemini, use them
  if (textRegions && textRegions.length > 0) {
    console.log('Using Gemini-detected text regions:', textRegions.length);
    return textRegions.map(region => {
      // Validate and sanitize region coordinates (expect normalized 0-1 range)
      const regionX = typeof region.x === 'number' ? Math.max(0, Math.min(1, region.x)) : 0;
      const regionY = typeof region.y === 'number' ? Math.max(0, Math.min(1, region.y)) : 0;
      const regionW = typeof region.width === 'number' ? Math.max(0, Math.min(1, region.width)) : 0.2;
      const regionH = typeof region.height === 'number' ? Math.max(0, Math.min(1, region.height)) : 0.1;
      
      const bubble = {
        x: Math.floor(regionX * width),
        y: Math.floor(regionY * height),
        width: Math.floor(regionW * width),
        height: Math.floor(regionH * height),
        text: region.text || '',
        pixels: []
      };
      bubble.centerX = bubble.x + bubble.width / 2;
      bubble.centerY = bubble.y + bubble.height / 2;
      
      // Get dynamic colors for this bubble
      bubble.colors = getBubbleColors(canvas, bubble);
      
      return bubble;
    }).filter(b => b.width > 0 && b.height > 0); // Filter out invalid bubbles
  }
  
  // Fall back to flood fill detection
  const visited = new Set();
  const bubbles = [];
  
  // Adaptive brightness threshold based on image
  let totalImageBrightness = 0;
  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel (16 = 4 pixels * 4 RGBA bytes)
    totalImageBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
  }
  const avgImageBrightness = totalImageBrightness / (data.length / 16);
  
  // Adjust threshold based on image brightness
  const BRIGHTNESS_THRESHOLD = avgImageBrightness > 180 ? 240 : 220;
  const MIN_BUBBLE_SIZE = Math.max(500, width * height * 0.005); // At least 0.5% of image
  const MAX_BUBBLE_SIZE = width * height * 0.25; // Maximum 25% of image
  
  /**
   * Check if pixel is likely part of a text bubble
   */
  function isBubblePixel(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const brightness = (r + g + b) / 3;
    
    // Check for both light and dark bubbles
    return brightness > BRIGHTNESS_THRESHOLD || brightness < 30;
  }
  
  /**
   * Flood fill to find connected region
   */
  function floodFill(startX, startY, checkDark = false) {
    const region = {
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY,
      pixels: [],
      isDark: checkDark
    };
    
    const stack = [[startX, startY]];
    const threshold = checkDark ? 30 : BRIGHTNESS_THRESHOLD;
    
    while (stack.length > 0 && region.pixels.length < MAX_BUBBLE_SIZE) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      
      const idx = (y * width + x) * 4;
      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      const isValid = checkDark ? brightness < threshold : brightness > threshold;
      
      if (!isValid) continue;
      
      visited.add(key);
      region.pixels.push([x, y]);
      
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
      
      // Add neighbors with step of 1 for accuracy
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return region;
  }
  
  // Scan for bubbles
  const step = 8;
  for (let y = step; y < height - step; y += step) {
    for (let x = step; x < width - step; x += step) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      
      const idx = (y * width + x) * 4;
      const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
      
      // Check for light bubbles (most common)
      if (brightness > BRIGHTNESS_THRESHOLD) {
        const region = floodFill(x, y, false);
        
        if (region.pixels.length >= MIN_BUBBLE_SIZE) {
          const bubble = {
            x: region.minX,
            y: region.minY,
            width: region.maxX - region.minX,
            height: region.maxY - region.minY,
            centerX: (region.minX + region.maxX) / 2,
            centerY: (region.minY + region.maxY) / 2,
            pixels: region.pixels,
            isDark: false
          };
          
          // Aspect ratio check - bubbles are usually not too elongated
          const aspectRatio = bubble.width / (bubble.height || 1);
          if (aspectRatio > 0.2 && aspectRatio < 5) {
            bubble.colors = getBubbleColors(canvas, bubble);
            bubbles.push(bubble);
          }
        }
      }
      // Check for dark bubbles
      else if (brightness < 30) {
        const region = floodFill(x, y, true);
        
        if (region.pixels.length >= MIN_BUBBLE_SIZE) {
          const bubble = {
            x: region.minX,
            y: region.minY,
            width: region.maxX - region.minX,
            height: region.maxY - region.minY,
            centerX: (region.minX + region.maxX) / 2,
            centerY: (region.minY + region.maxY) / 2,
            pixels: region.pixels,
            isDark: true
          };
          
          const aspectRatio = bubble.width / (bubble.height || 1);
          if (aspectRatio > 0.2 && aspectRatio < 5) {
            bubble.colors = { background: '#000000', text: '#FFFFFF', isDark: true };
            bubbles.push(bubble);
          }
        }
      }
    }
  }
  
  console.log(`Detected ${bubbles.length} bubbles`);
  return bubbles;
}

// ============================================
// Text Rendering Functions - وظائف عرض النص
// ============================================

/**
 * Clean bubble using detected pixels or ellipse shape
 * تنظيف الفقاعة باستخدام البكسلات المكتشفة أو الشكل البيضاوي
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {Object} bubble - معلومات الفقاعة
 * @returns {void}
 */
function cleanBubble(canvas, bubble) {
  const ctx = canvas.getContext('2d');
  
  // Get colors based on bubble brightness
  const colors = bubble.colors || getBubbleColors(canvas, bubble);
  
  // If we have pixel data, clean using pixels (follows bubble shape)
  if (bubble.pixels && bubble.pixels.length > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // Parse background color
    const bgColor = colors.background === '#000000' ? [0, 0, 0] : [255, 255, 255];
    
    bubble.pixels.forEach(([px, py]) => {
      const idx = (py * canvas.width + px) * 4;
      data[idx] = bgColor[0];     // R
      data[idx + 1] = bgColor[1]; // G
      data[idx + 2] = bgColor[2]; // B
    });
    
    ctx.putImageData(imageData, 0, 0);
  } else {
    // Fall back to ellipse shape with padding
    ctx.fillStyle = colors.background;
    
    const padding = 5;
    const centerX = bubble.centerX;
    const centerY = bubble.centerY;
    const radiusX = (bubble.width / 2) - padding;
    const radiusY = (bubble.height / 2) - padding;
    
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
}

/**
 * Add translated text to bubble with dynamic colors and outline
 * إضافة النص المترجم للفقاعة مع ألوان ديناميكية وحدود
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {string} text - النص المترجم
 * @param {Object} bubble - معلومات الفقاعة
 * @param {boolean} isRTL - هل النص من اليمين لليسار
 */
function addTextToBubble(canvas, text, bubble, isRTL = false) {
  const ctx = canvas.getContext('2d');
  
  // Get dynamic colors for this bubble
  const colors = bubble.colors || getBubbleColors(canvas, bubble);
  
  // Calculate font size based on bubble size - حساب حجم الخط
  const maxWidth = bubble.width * 0.85;
  const maxHeight = bubble.height * 0.85;
  let fontSize = Math.min(maxWidth / 5, maxHeight / 2, 48);
  fontSize = Math.max(fontSize, 14); // minimum 14px for readability
  
  // Use manga-style font stack with Noto Sans Arabic
  ctx.font = `bold ${fontSize}px "Noto Sans Arabic", "Noto Sans JP", "Noto Sans KR", "Segoe UI", "Arial", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Set RTL direction if needed - تعيين اتجاه RTL
  if (isRTL) {
    ctx.direction = 'rtl';
  }
  
  // Split text into lines - تقسيم النص لأسطر
  const lines = wrapText(ctx, text, maxWidth);
  const lineHeight = fontSize * 1.3;
  const totalHeight = lines.length * lineHeight;
  
  // Calculate starting Y position - حساب موقع البداية
  let startY = bubble.centerY - totalHeight / 2 + lineHeight / 2;
  
  // Draw each line with outline - رسم كل سطر مع حدود
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    
    // Draw outline (stroke) first - رسم الحدود أولاً
    ctx.strokeStyle = colors.background;
    ctx.lineWidth = fontSize / 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(line, bubble.centerX, y);
    
    // Draw text fill - رسم النص
    ctx.fillStyle = colors.text;
    ctx.fillText(line, bubble.centerX, y);
  });
}

/**
 * Wrap text to fit within width
 * تقسيم النص ليناسب العرض
 * @param {CanvasRenderingContext2D} ctx - سياق الكانفاس
 * @param {string} text - النص
 * @param {number} maxWidth - العرض الأقصى
 * @returns {Array<string>} مصفوفة الأسطر
 */
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines.length > 0 ? lines : [text];
}

// ============================================
// Image Translation Functions - وظائف ترجمة الصور
// ============================================

/**
 * Fetch image via background script to bypass CORS
 * تحميل الصورة عبر الخلفية لتجاوز CORS
 * @param {string} url - رابط الصورة
 * @returns {Promise<string>} الصورة كـ base64 data URL
 */
async function fetchImageViaBackground(url) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action: 'fetchImage', url: url },
      (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (response && response.success) {
          resolve(response.data);
        } else {
          reject(new Error(response?.error || 'Failed to fetch image'));
        }
      }
    );
  });
}

/**
 * Translate a single image
 * ترجمة صورة واحدة
 * @param {HTMLImageElement} img - عنصر الصورة
 * @param {Object} settings - الإعدادات
 * @returns {Promise<HTMLCanvasElement>} الكانفاس المترجم
 */
async function translateImage(img, settings) {
  try {
    // Create canvas from image - إنشاء كانفاس من الصورة
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let imageDataUrl;
    
    // Try to load image, use background fetch if CORS fails
    // محاولة تحميل الصورة، استخدام الخلفية إذا فشل CORS
    try {
      // First try direct load - محاولة التحميل المباشر أولاً
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      
      await new Promise((resolve, reject) => {
        tempImg.onload = resolve;
        tempImg.onerror = reject;
        tempImg.src = img.src;
      });
      
      canvas.width = tempImg.naturalWidth || tempImg.width;
      canvas.height = tempImg.naturalHeight || tempImg.height;
      ctx.drawImage(tempImg, 0, 0);
      imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
    } catch (corsError) {
      // CORS failed, try via background script
      // فشل CORS، محاولة عبر الخلفية
      console.warn('Direct load failed, trying via background...', corsError);
      sendProgress(12, 'جاري تحميل الصورة عبر الخلفية...');
      
      imageDataUrl = await fetchImageViaBackground(img.src);
      
      // Load the base64 image to get dimensions for canvas
      const bgImg = new Image();
      await new Promise((resolve, reject) => {
        bgImg.onload = resolve;
        bgImg.onerror = () => reject(new Error('Failed to load fetched image'));
        bgImg.src = imageDataUrl;
      });
      
      canvas.width = bgImg.naturalWidth || bgImg.width;
      canvas.height = bgImg.naturalHeight || bgImg.height;
      ctx.drawImage(bgImg, 0, 0);
    }
    
    // Store original image for undo - حفظ الصورة الأصلية للتراجع
    const imageId = generateImageId(img);
    originalImages.set(imageId, {
      src: img.src,
      dataUrl: imageDataUrl,
      element: img
    });
    
    // Check cache first - التحقق من الكاش أولاً
    const imageHash = hashImageData(imageDataUrl);
    const cachedData = getCachedTranslation(imageHash, settings.targetLang);
    
    let translatedText;
    if (cachedData) {
      sendProgress(50, 'تم استخدام الترجمة المخزنة...');
      translatedText = cachedData.text;
    } else {
      // Use Gemini Vision API to extract and translate in one step
      // استخدام Gemini Vision API للاستخراج والترجمة في خطوة واحدة
      sendProgress(35, 'جاري استخراج النص وترجمته بالذكاء الاصطناعي...');
      translatedText = await extractAndTranslateViaBackground(imageDataUrl, settings);
      
      // Cache the translation - تخزين الترجمة
      setCachedTranslation(imageHash, settings.targetLang, { text: translatedText });
    }
    
    // Clean up text - تنظيف النص
    const cleanedTranslation = translatedText.trim().replace(/\n{3,}/g, '\n\n');
    
    if (!cleanedTranslation) {
      throw new Error('لم يتم العثور على نص في الصورة');
    }
    
    console.log('Translated text:', cleanedTranslation);
    
    // Detect and clean bubbles - كشف وتنظيف الفقاعات
    sendProgress(75, 'جاري معالجة فقاعات الكلام...');
    const bubbles = detectAndCleanBubbles(canvas);
    
    // Add translated text to bubbles - إضافة النص المترجم
    sendProgress(85, 'جاري إضافة النص المترجم...');
    const isRTL = settings.targetLang === 'Arabic';
    
    if (bubbles.length > 0) {
      // Distribute text among bubbles - توزيع النص على الفقاعات
      const textParts = cleanedTranslation.split(/[.!?。！？\n]+/).filter(t => t.trim());
      
      // Sort bubbles by position (top to bottom, right to left for RTL)
      bubbles.sort((a, b) => {
        const yDiff = a.centerY - b.centerY;
        if (Math.abs(yDiff) > 50) return yDiff;
        return isRTL ? b.centerX - a.centerX : a.centerX - b.centerX;
      });
      
      bubbles.forEach((bubble, index) => {
        cleanBubble(canvas, bubble);
        // Each bubble gets one line of text
        if (index < textParts.length) {
          addTextToBubble(canvas, textParts[index].trim(), bubble, isRTL);
        }
      });
    } else {
      // If no bubbles found, add text overlay - إذا لم توجد فقاعات، إضافة طبقة نص
      const fakeBubble = {
        centerX: canvas.width / 2,
        centerY: canvas.height * 0.9,
        width: canvas.width * 0.8,
        height: canvas.height * 0.15,
        colors: { background: '#FFFFFF', text: '#000000' }
      };
      addTextToBubble(canvas, cleanedTranslation, fakeBubble, isRTL);
    }
    
    // Store canvas reference for download - تخزين مرجع الكانفاس للتحميل
    canvas.setAttribute('data-image-id', imageId);
    
    return canvas;
  } catch (error) {
    console.error('Error translating image:', error);
    throw error;
  }
}

/**
 * Generate unique ID for image element
 * توليد معرف فريد لعنصر الصورة
 * @param {HTMLImageElement} img - عنصر الصورة
 * @returns {string} المعرف الفريد
 */
function generateImageId(img) {
  return `img_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Undo translation for a specific image
 * التراجع عن ترجمة صورة معينة
 * @param {string} imageId - معرف الصورة
 * @returns {boolean} هل نجح التراجع
 */
function undoTranslation(imageId) {
  const originalData = originalImages.get(imageId);
  if (!originalData) {
    console.warn('No original image found for ID:', imageId);
    return false;
  }
  
  // Find the translated canvas
  const canvas = document.querySelector(`canvas[data-image-id="${imageId}"]`);
  if (!canvas) {
    console.warn('Translated canvas not found for ID:', imageId);
    return false;
  }
  
  // Create new image element
  const newImg = document.createElement('img');
  newImg.src = originalData.src;
  newImg.className = canvas.className.replace('manga-translator-translated', '');
  newImg.style.cssText = canvas.style.cssText;
  newImg.removeAttribute('data-translated');
  
  // Replace canvas with original image
  canvas.parentNode.replaceChild(newImg, canvas);
  
  // Clean up
  originalImages.delete(imageId);
  
  console.log('Undo successful for image:', imageId);
  return true;
}

/**
 * Undo all translations on the page
 * التراجع عن كل الترجمات في الصفحة
 */
function undoAllTranslations() {
  const imageIds = Array.from(originalImages.keys());
  let successCount = 0;
  
  imageIds.forEach(imageId => {
    if (undoTranslation(imageId)) {
      successCount++;
    }
  });
  
  console.log(`Undo complete: ${successCount} images restored`);
  return successCount;
}

/**
 * Download translated image
 * تحميل الصورة المترجمة
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {string} filename - اسم الملف
 */
function downloadTranslatedImage(canvas, filename = 'translated_manga.png') {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

/**
 * Replace image with translated canvas
 * استبدال الصورة بالكانفاس المترجم
 * @param {HTMLImageElement} img - عنصر الصورة الأصلي
 * @param {HTMLCanvasElement} canvas - الكانفاس المترجم
 */
function replaceImageWithCanvas(img, canvas) {
  // Style canvas to match original image - تنسيق الكانفاس ليطابق الصورة
  canvas.style.maxWidth = '100%';
  canvas.style.height = 'auto';
  canvas.style.display = img.style.display || 'block';
  canvas.className = img.className + ' manga-translator-translated';
  canvas.setAttribute('data-translated', 'true');
  
  // Copy relevant styles - نسخ الأنماط المهمة
  const computedStyle = window.getComputedStyle(img);
  canvas.style.margin = computedStyle.margin;
  canvas.style.border = computedStyle.border;
  canvas.style.borderRadius = computedStyle.borderRadius;
  canvas.style.cursor = 'pointer';
  
  // Add double-click handler for undo - إضافة معالج النقر المزدوج للتراجع
  canvas.addEventListener('dblclick', () => {
    const imageId = canvas.getAttribute('data-image-id');
    if (imageId && confirm('هل تريد التراجع عن الترجمة؟')) {
      undoTranslation(imageId);
    }
  });
  
  // Add right-click context menu for download - إضافة قائمة النقر اليمين للتحميل
  canvas.addEventListener('contextmenu', (e) => {
    // Allow default context menu but also provide download option via custom handler
    canvas.setAttribute('data-can-download', 'true');
  });
  
  // Replace image - استبدال الصورة
  img.parentNode.replaceChild(canvas, img);
}

/**
 * Translate all images on page
 * ترجمة كل الصور في الصفحة
 * @param {Object} settings - الإعدادات
 */
async function translatePage(settings) {
  try {
    sendProgress(5, 'جاري البحث عن الصور...');
    
    // Find all manga images - إيجاد كل صور المانجا
    const images = Array.from(document.querySelectorAll('img'))
      .filter(img => {
        // Filter criteria - معايير الفلترة
        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        const isLargeEnough = width > 200 && height > 200;
        const isNotTranslated = !img.getAttribute('data-translated');
        const isVisible = img.offsetParent !== null;
        
        return isLargeEnough && isNotTranslated && isVisible;
      });
    
    if (images.length === 0) {
      throw new Error('لم يتم العثور على صور مناسبة للترجمة');
    }
    
    console.log(`Found ${images.length} images to translate`);
    sendProgress(10, `تم العثور على ${images.length} صورة`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Translate each image - ترجمة كل صورة
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const progress = 10 + Math.round((i / images.length) * 85);
      
      try {
        sendProgress(progress, `جاري ترجمة الصورة ${i + 1} من ${images.length}...`);
        const translatedCanvas = await translateImage(img, settings);
        replaceImageWithCanvas(img, translatedCanvas);
        successCount++;
      } catch (error) {
        console.error(`Error translating image ${i + 1}:`, error);
        errorCount++;
      }
    }
    
    // Send completion message - إرسال رسالة الإكمال
    sendProgress(100, 'اكتملت الترجمة!');
    
    return {
      success: true,
      message: `تمت ترجمة ${successCount} صورة بنجاح${errorCount > 0 ? ` (${errorCount} فشلت)` : ''}`
    };
    
  } catch (error) {
    console.error('Error translating page:', error);
    throw error;
  }
}

// ============================================
// Image Selection Mode - وضع اختيار الصورة
// ============================================

/**
 * Enable image selection mode
 * تفعيل وضع اختيار الصورة
 * @param {Object} settings - الإعدادات
 */
function enableImageSelection(settings) {
  currentSettings = settings;
  isSelectionMode = true;
  
  // Create overlay - إنشاء طبقة التغطية
  const overlay = document.createElement('div');
  overlay.className = 'manga-translator-overlay';
  overlay.id = 'manga-translator-overlay';
  document.body.appendChild(overlay);
  
  // Create tooltip - إنشاء التلميح
  const tooltip = document.createElement('div');
  tooltip.className = 'manga-translator-tooltip';
  tooltip.textContent = 'انقر على صورة لترجمتها - اضغط ESC للإلغاء';
  tooltip.id = 'manga-translator-tooltip';
  document.body.appendChild(tooltip);
  
  // Add event listeners - إضافة مستمعي الأحداث
  document.addEventListener('mouseover', handleImageHover);
  document.addEventListener('mouseout', handleImageHoverOut);
  document.addEventListener('click', handleImageClick);
  document.addEventListener('keydown', handleEscapeKey);
  
  console.log('Image selection mode enabled');
}

/**
 * Disable image selection mode
 * تعطيل وضع اختيار الصورة
 */
function disableImageSelection() {
  isSelectionMode = false;
  currentSettings = null;
  
  // Remove overlay and tooltip - إزالة الطبقة والتلميح
  const overlay = document.getElementById('manga-translator-overlay');
  const tooltip = document.getElementById('manga-translator-tooltip');
  
  if (overlay) overlay.remove();
  if (tooltip) tooltip.remove();
  
  // Remove highlights - إزالة التمييز
  document.querySelectorAll('.manga-translator-highlight').forEach(el => {
    el.classList.remove('manga-translator-highlight');
  });
  
  // Remove event listeners - إزالة مستمعي الأحداث
  document.removeEventListener('mouseover', handleImageHover);
  document.removeEventListener('mouseout', handleImageHoverOut);
  document.removeEventListener('click', handleImageClick);
  document.removeEventListener('keydown', handleEscapeKey);
  
  console.log('Image selection mode disabled');
}

/**
 * Handle image hover in selection mode
 * معالجة التحويم على الصورة
 */
function handleImageHover(e) {
  if (!isSelectionMode) return;
  
  const img = e.target.closest('img');
  if (img && !img.getAttribute('data-translated')) {
    img.classList.add('manga-translator-highlight');
  }
}

/**
 * Handle image hover out
 * معالجة الخروج من التحويم
 */
function handleImageHoverOut(e) {
  if (!isSelectionMode) return;
  
  const img = e.target.closest('img');
  if (img) {
    img.classList.remove('manga-translator-highlight');
  }
}

/**
 * Handle image click in selection mode
 * معالجة النقر على الصورة
 */
async function handleImageClick(e) {
  if (!isSelectionMode) return;
  
  const img = e.target.closest('img');
  if (!img || img.getAttribute('data-translated')) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // Save settings before disabling selection mode
  // حفظ الإعدادات قبل تعطيل وضع الاختيار
  if (!currentSettings) {
    sendError('الإعدادات غير متاحة');
    return;
  }
  const settings = { ...currentSettings };
  
  // Disable selection mode - تعطيل وضع الاختيار
  disableImageSelection();
  
  try {
    sendProgress(5, 'جاري ترجمة الصورة المحددة...');
    const translatedCanvas = await translateImage(img, settings);
    replaceImageWithCanvas(img, translatedCanvas);
    
    sendComplete('تمت ترجمة الصورة بنجاح!');
  } catch (error) {
    sendError(error.message || 'فشلت ترجمة الصورة');
  }
}

/**
 * Handle escape key to cancel selection
 * معالجة مفتاح Escape للإلغاء
 */
function handleEscapeKey(e) {
  if (e.key === 'Escape' && isSelectionMode) {
    disableImageSelection();
    sendComplete('تم إلغاء وضع الاختيار');
  }
}

// ============================================
// Communication Functions - وظائف التواصل
// ============================================

/**
 * Send progress update to popup
 * إرسال تحديث التقدم للواجهة
 */
function sendProgress(percent, text) {
  chrome.runtime.sendMessage({
    type: 'progress',
    percent: percent,
    text: text
  }).catch((error) => {
    // Popup may be closed - log for debugging but don't throw
    // الواجهة قد تكون مغلقة - تسجيل للتصحيح بدون رمي خطأ
    if (error.message !== 'Could not establish connection. Receiving end does not exist.') {
      console.debug('Progress message failed:', error.message);
    }
  });
}

/**
 * Send completion message to popup
 * إرسال رسالة الإكمال للواجهة
 */
function sendComplete(message) {
  chrome.runtime.sendMessage({
    type: 'complete',
    message: message
  }).catch((error) => {
    if (error.message !== 'Could not establish connection. Receiving end does not exist.') {
      console.debug('Complete message failed:', error.message);
    }
  });
}

/**
 * Send error message to popup
 * إرسال رسالة الخطأ للواجهة
 */
function sendError(message) {
  chrome.runtime.sendMessage({
    type: 'error',
    message: message
  }).catch((error) => {
    if (error.message !== 'Could not establish connection. Receiving end does not exist.') {
      console.debug('Error message failed:', error.message);
    }
  });
}

// ============================================
// Lazy Loading Functions - وظائف التحميل الكسول
// ============================================

/**
 * Initialize lazy loading for images
 * تهيئة التحميل الكسول للصور
 * @param {Object} settings - الإعدادات
 */
function initLazyLoading(settings) {
  // Clean up existing observer
  if (lazyLoadObserver) {
    lazyLoadObserver.disconnect();
  }
  
  // Create Intersection Observer
  lazyLoadObserver = new IntersectionObserver((entries) => {
    entries.forEach(async (entry) => {
      if (entry.isIntersecting) {
        const img = entry.target;
        
        // Skip if already translated or being processed
        if (img.getAttribute('data-translated') || img.getAttribute('data-translating')) {
          return;
        }
        
        // Mark as being processed
        img.setAttribute('data-translating', 'true');
        
        try {
          console.log('Lazy loading: translating visible image');
          const translatedCanvas = await translateImage(img, settings);
          replaceImageWithCanvas(img, translatedCanvas);
        } catch (error) {
          console.error('Lazy load translation error:', error);
          img.removeAttribute('data-translating');
        }
        
        // Stop observing this image
        lazyLoadObserver.unobserve(img);
      }
    });
  }, {
    rootMargin: '100px', // Start loading 100px before visible
    threshold: 0.1 // Trigger when 10% visible
  });
  
  // Observe all manga images
  const images = document.querySelectorAll('img');
  images.forEach(img => {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const isLargeEnough = width > 200 && height > 200;
    const isNotTranslated = !img.getAttribute('data-translated');
    
    if (isLargeEnough && isNotTranslated) {
      lazyLoadObserver.observe(img);
    }
  });
  
  console.log('Lazy loading initialized');
}

/**
 * Stop lazy loading
 * إيقاف التحميل الكسول
 */
function stopLazyLoading() {
  if (lazyLoadObserver) {
    lazyLoadObserver.disconnect();
    lazyLoadObserver = null;
  }
  console.log('Lazy loading stopped');
}

// ============================================
// Message Listener - مستمع الرسائل
// ============================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.action === 'translatePage') {
    // Translate all images on page - ترجمة كل الصور
    translatePage(message.settings)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ 
        success: false, 
        error: error.message || 'حدث خطأ أثناء الترجمة' 
      }));
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'selectImage') {
    // Enable image selection mode - تفعيل وضع اختيار الصورة
    enableImageSelection(message.settings);
    sendResponse({ success: true, message: 'وضع اختيار الصورة مفعل' });
    return true;
  }
  
  if (message.action === 'enableLazyLoading') {
    // Enable lazy loading mode - تفعيل وضع التحميل الكسول
    initLazyLoading(message.settings);
    sendResponse({ success: true, message: 'التحميل الكسول مفعل' });
    return true;
  }
  
  if (message.action === 'disableLazyLoading') {
    // Disable lazy loading mode - تعطيل وضع التحميل الكسول
    stopLazyLoading();
    sendResponse({ success: true, message: 'تم إيقاف التحميل الكسول' });
    return true;
  }
  
  if (message.action === 'undoAll') {
    // Undo all translations - التراجع عن كل الترجمات
    const count = undoAllTranslations();
    sendResponse({ success: true, message: `تم التراجع عن ${count} صورة` });
    return true;
  }
  
  if (message.action === 'downloadImage') {
    // Download a specific translated image
    const canvas = document.querySelector(`canvas[data-image-id="${message.imageId}"]`);
    if (canvas) {
      downloadTranslatedImage(canvas, message.filename || 'translated_manga.png');
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'الصورة غير موجودة' });
    }
    return true;
  }
  
  if (message.action === 'downloadAllImages') {
    // Download all translated images with proper sequencing
    const canvases = Array.from(document.querySelectorAll('canvas[data-translated="true"]'));
    
    if (canvases.length === 0) {
      sendResponse({ success: false, error: 'لا توجد صور مترجمة' });
      return true;
    }
    
    // Use async/await pattern for reliable sequential downloads
    (async () => {
      for (let i = 0; i < canvases.length; i++) {
        downloadTranslatedImage(canvases[i], `translated_manga_${i + 1}.png`);
        // Wait between downloads to avoid overwhelming the browser
        if (i < canvases.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    })();
    
    sendResponse({ success: true, count: canvases.length });
    return true;
  }
  
  if (message.action === 'getTranslatedCount') {
    // Get count of translated images - الحصول على عدد الصور المترجمة
    const count = document.querySelectorAll('canvas[data-translated="true"]').length;
    sendResponse({ success: true, count: count });
    return true;
  }
  
  return false;
});

// Log initialization - تسجيل التهيئة
console.log('Manga Translator content script loaded');
