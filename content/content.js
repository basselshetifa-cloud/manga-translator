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

let tesseractWorker = null;
let isSelectionMode = false;
let currentSettings = null;

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
    'chi_tra': 'Chinese manhua'
  };
  
  const contentType = sourceContext[sourceLang] || 'manga/manhwa';
  
  // توجيهات خاصة للعربية
  const arabicInstructions = targetLang === 'Arabic' ? `
- Use a mix of Modern Standard Arabic (فصحى) for dramatic moments and Egyptian dialect (عامية مصرية) for casual dialogue
- Examples of Egyptian dialect to use naturally: يعني، والله، يلا، خلاص، طيب، ايه ده، ازيك
- Write numbers in Arabic numerals (١، ٢، ٣)
- Use Arabic quotation marks «» for speech` : '';

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
- Keep martial arts technique names with transliteration`
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
// OCR Functions - وظائف التعرف على النص
// ============================================

/**
 * Load script from CDN
 * تحميل سكريبت من CDN
 * @param {string} url - رابط السكريبت
 * @returns {Promise} وعد بتحميل السكريبت
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    // Check if already loaded - التحقق من التحميل المسبق
    if (window.Tesseract) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Initialize Tesseract OCR
 * تهيئة محرك التعرف على النص
 * @param {string} lang - لغة التعرف (jpn, kor, chi_sim, chi_tra)
 */
async function initOCR(lang) {
  try {
    // Load Tesseract.js from CDN - تحميل Tesseract.js
    sendProgress(15, 'جاري تحميل محرك OCR...');
    await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    
    // Create worker - إنشاء عامل المعالجة
    sendProgress(25, 'جاري تهيئة التعرف على النص...');
    tesseractWorker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => {
        if (m.status === 'recognizing text') {
          const percent = Math.round(25 + (m.progress * 30));
          sendProgress(percent, `جاري التعرف على النص... ${Math.round(m.progress * 100)}%`);
        }
      }
    });
    
    console.log('Tesseract OCR initialized for language:', lang);
  } catch (error) {
    console.error('Error initializing OCR:', error);
    throw new Error('فشل في تهيئة محرك التعرف على النص');
  }
}

/**
 * Extract text from image using OCR
 * استخراج النص من الصورة
 * @param {string} imageUrl - رابط الصورة
 * @returns {Promise<string>} النص المستخرج
 */
async function extractText(imageUrl) {
  if (!tesseractWorker) {
    throw new Error('OCR not initialized');
  }
  
  try {
    sendProgress(35, 'جاري استخراج النص من الصورة...');
    const { data: { text } } = await tesseractWorker.recognize(imageUrl);
    
    // Clean up text - تنظيف النص
    const cleanedText = text.trim().replace(/\n{3,}/g, '\n\n');
    
    if (!cleanedText) {
      throw new Error('لم يتم العثور على نص في الصورة');
    }
    
    console.log('Extracted text:', cleanedText);
    return cleanedText;
  } catch (error) {
    console.error('Error extracting text:', error);
    throw error;
  }
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
// Bubble Detection Functions - وظائف كشف الفقاعات
// ============================================

/**
 * Detect and clean speech bubbles in image
 * كشف وتبييض فقاعات الكلام
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @returns {Array} مصفوفة الفقاعات المكتشفة
 */
function detectAndCleanBubbles(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;
  
  // Track visited pixels - تتبع البكسلات المزارة
  const visited = new Set();
  const bubbles = [];
  
  // Brightness threshold for white areas - عتبة السطوع للمناطق البيضاء
  const BRIGHTNESS_THRESHOLD = 230;
  const MIN_BUBBLE_SIZE = 500; // Minimum pixels for a bubble - الحد الأدنى للفقاعة
  const MAX_BUBBLE_SIZE = width * height * 0.3; // Maximum 30% of image - الحد الأقصى
  
  /**
   * Check if pixel is bright (likely part of bubble)
   * التحقق من سطوع البكسل
   */
  function isBright(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const idx = (y * width + x) * 4;
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const brightness = (r + g + b) / 3;
    return brightness > BRIGHTNESS_THRESHOLD;
  }
  
  /**
   * Flood fill to find connected white region
   * ملء الفيضان لإيجاد منطقة بيضاء متصلة
   */
  function floodFill(startX, startY) {
    const region = {
      minX: startX,
      maxX: startX,
      minY: startY,
      maxY: startY,
      pixels: []
    };
    
    const stack = [[startX, startY]];
    
    while (stack.length > 0 && region.pixels.length < MAX_BUBBLE_SIZE) {
      const [x, y] = stack.pop();
      const key = `${x},${y}`;
      
      if (visited.has(key)) continue;
      if (!isBright(x, y)) continue;
      
      visited.add(key);
      region.pixels.push([x, y]);
      
      // Update bounds - تحديث الحدود
      region.minX = Math.min(region.minX, x);
      region.maxX = Math.max(region.maxX, x);
      region.minY = Math.min(region.minY, y);
      region.maxY = Math.max(region.maxY, y);
      
      // Add neighbors - إضافة الجيران
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    
    return region;
  }
  
  // Scan image for bright regions - مسح الصورة للمناطق المضيئة
  const step = 10; // Scan every 10 pixels for efficiency - مسح كل 10 بكسلات
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const key = `${x},${y}`;
      if (!visited.has(key) && isBright(x, y)) {
        const region = floodFill(x, y);
        
        // Check if region is large enough to be a bubble
        if (region.pixels.length >= MIN_BUBBLE_SIZE) {
          bubbles.push({
            x: region.minX,
            y: region.minY,
            width: region.maxX - region.minX,
            height: region.maxY - region.minY,
            centerX: (region.minX + region.maxX) / 2,
            centerY: (region.minY + region.maxY) / 2,
            pixels: region.pixels
          });
        }
      }
    }
  }
  
  // Clean bubbles (fill with white) - تنظيف الفقاعات (ملء بالأبيض)
  bubbles.forEach(bubble => {
    bubble.pixels.forEach(([px, py]) => {
      const idx = (py * width + px) * 4;
      data[idx] = 255;     // R
      data[idx + 1] = 255; // G
      data[idx + 2] = 255; // B
    });
  });
  
  ctx.putImageData(imageData, 0, 0);
  
  console.log(`Detected ${bubbles.length} bubbles`);
  return bubbles;
}

// ============================================
// Text Rendering Functions - وظائف عرض النص
// ============================================

/**
 * Add translated text to bubble
 * إضافة النص المترجم للفقاعة
 * @param {HTMLCanvasElement} canvas - الكانفاس
 * @param {string} text - النص المترجم
 * @param {Object} bubble - معلومات الفقاعة
 * @param {boolean} isRTL - هل النص من اليمين لليسار
 */
function addTextToBubble(canvas, text, bubble, isRTL = false) {
  const ctx = canvas.getContext('2d');
  
  // Calculate font size based on bubble size - حساب حجم الخط
  const maxWidth = bubble.width * 0.85;
  const maxHeight = bubble.height * 0.85;
  let fontSize = Math.min(maxWidth / 8, maxHeight / 3, 24);
  fontSize = Math.max(fontSize, 10); // Minimum font size - الحد الأدنى للخط
  
  // Set text properties - تعيين خصائص النص
  ctx.font = `bold ${fontSize}px "Segoe UI", "Noto Sans Arabic", "Noto Sans JP", sans-serif`;
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
  
  // Draw each line - رسم كل سطر
  lines.forEach((line, index) => {
    const y = startY + index * lineHeight;
    
    // Draw white stroke for visibility - رسم حد أبيض للوضوح
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = fontSize / 4;
    ctx.lineJoin = 'round';
    ctx.strokeText(line, bubble.centerX, y);
    
    // Draw black text - رسم النص الأسود
    ctx.fillStyle = '#000000';
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
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    
    // Handle CORS for external images - معالجة CORS للصور الخارجية
    const tempImg = new Image();
    tempImg.crossOrigin = 'anonymous';
    
    await new Promise((resolve, reject) => {
      tempImg.onload = resolve;
      tempImg.onerror = () => reject(new Error('Failed to load image'));
      tempImg.src = img.src;
    });
    
    ctx.drawImage(tempImg, 0, 0);
    
    // Initialize OCR if needed - تهيئة OCR إذا لزم الأمر
    if (!tesseractWorker) {
      await initOCR(settings.sourceLang);
    }
    
    // Extract text from image - استخراج النص
    const extractedText = await extractText(canvas.toDataURL());
    
    if (!extractedText || extractedText.trim() === '') {
      throw new Error('لم يتم العثور على نص في الصورة');
    }
    
    // Translate text - ترجمة النص
    const translatedText = await translateText(
      extractedText,
      settings.targetLang,
      settings.apiProvider,
      settings.apiKey,
      settings.sourceLang
    );
    
    // Detect and clean bubbles - كشف وتنظيف الفقاعات
    sendProgress(75, 'جاري معالجة فقاعات الكلام...');
    const bubbles = detectAndCleanBubbles(canvas);
    
    // Add translated text to bubbles - إضافة النص المترجم
    sendProgress(85, 'جاري إضافة النص المترجم...');
    const isRTL = settings.targetLang === 'Arabic';
    
    if (bubbles.length > 0) {
      // Distribute text among bubbles - توزيع النص على الفقاعات
      const textParts = translatedText.split(/[.!?。！？\n]+/).filter(t => t.trim());
      
      bubbles.forEach((bubble, index) => {
        const textPart = textParts[index % textParts.length] || translatedText;
        addTextToBubble(canvas, textPart.trim(), bubble, isRTL);
      });
    } else {
      // If no bubbles found, add text overlay - إذا لم توجد فقاعات، إضافة طبقة نص
      const fakeBubble = {
        centerX: canvas.width / 2,
        centerY: canvas.height * 0.9,
        width: canvas.width * 0.8,
        height: canvas.height * 0.15
      };
      addTextToBubble(canvas, translatedText, fakeBubble, isRTL);
    }
    
    return canvas;
  } catch (error) {
    console.error('Error translating image:', error);
    throw error;
  }
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
  canvas.className = img.className;
  canvas.setAttribute('data-translated', 'true');
  
  // Copy relevant styles - نسخ الأنماط المهمة
  const computedStyle = window.getComputedStyle(img);
  canvas.style.margin = computedStyle.margin;
  canvas.style.border = computedStyle.border;
  canvas.style.borderRadius = computedStyle.borderRadius;
  
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
  } finally {
    // Clean up OCR worker - تنظيف عامل OCR
    if (tesseractWorker) {
      await tesseractWorker.terminate();
      tesseractWorker = null;
    }
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
  
  // Disable selection mode - تعطيل وضع الاختيار
  disableImageSelection();
  
  try {
    sendProgress(5, 'جاري ترجمة الصورة المحددة...');
    const translatedCanvas = await translateImage(img, currentSettings);
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
  
  return false;
});

// Log initialization - تسجيل التهيئة
console.log('Manga Translator content script loaded');
