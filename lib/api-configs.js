/**
 * Manga Translator - API Configurations
 * إعدادات واجهات برمجة التطبيقات للترجمة
 * 
 * This file contains the configuration for different AI translation APIs.
 * هذا الملف يحتوي على إعدادات واجهات الترجمة المختلفة.
 */

const API_CONFIGS = {
  /**
   * Google Gemini API Configuration
   * إعدادات Google Gemini
   * 
   * Free tier: 60 requests/minute
   * Get your key at: https://aistudio.google.com/app/apikey
   */
  gemini: {
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    model: 'gemini-1.5-flash',
    freeLimit: '60 requests/minute',
    keyUrl: 'https://aistudio.google.com/app/apikey',
    
    /**
     * Build request for Gemini API
     * بناء الطلب لـ Gemini
     */
    buildRequest: function(text, targetLang, apiKey) {
      return {
        url: `${this.url}?key=${encodeURIComponent(apiKey)}`,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: buildPrompt(text, targetLang)
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024
            }
          })
        }
      };
    },
    
    /**
     * Parse Gemini response
     * تحليل رد Gemini
     */
    parseResponse: function(data) {
      if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text.trim();
      }
      throw new Error('Invalid Gemini response format');
    }
  },

  /**
   * Groq API Configuration
   * إعدادات Groq
   * 
   * Free tier: 14,400 tokens/day
   * Get your key at: https://console.groq.com/keys
   */
  groq: {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.1-8b-instant',
    freeLimit: '14,400 tokens/day',
    keyUrl: 'https://console.groq.com/keys',
    
    /**
     * Build request for Groq API
     * بناء الطلب لـ Groq
     */
    buildRequest: function(text, targetLang, apiKey) {
      return {
        url: this.url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            messages: [{
              role: 'user',
              content: buildPrompt(text, targetLang)
            }],
            temperature: 0.3,
            max_tokens: 1024
          })
        }
      };
    },
    
    /**
     * Parse Groq response
     * تحليل رد Groq
     */
    parseResponse: function(data) {
      if (data.choices && data.choices[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }
      throw new Error('Invalid Groq response format');
    }
  },

  /**
   * Cohere API Configuration
   * إعدادات Cohere
   * 
   * Free tier: 100 API calls/minute
   * Get your key at: https://dashboard.cohere.com/api-keys
   */
  cohere: {
    name: 'Cohere',
    url: 'https://api.cohere.ai/v1/generate',
    model: 'command',
    freeLimit: '100 calls/minute',
    keyUrl: 'https://dashboard.cohere.com/api-keys',
    
    /**
     * Build request for Cohere API
     * بناء الطلب لـ Cohere
     */
    buildRequest: function(text, targetLang, apiKey) {
      return {
        url: this.url,
        options: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: this.model,
            prompt: buildPrompt(text, targetLang),
            max_tokens: 1024,
            temperature: 0.3
          })
        }
      };
    },
    
    /**
     * Parse Cohere response
     * تحليل رد Cohere
     */
    parseResponse: function(data) {
      if (data.generations && data.generations[0]?.text) {
        return data.generations[0].text.trim();
      }
      throw new Error('Invalid Cohere response format');
    }
  }
};

/**
 * Build translation prompt
 * بناء نص التوجيه للترجمة
 * 
 * @param {string} text - النص المراد ترجمته
 * @param {string} targetLang - لغة الهدف
 * @returns {string} نص التوجيه الكامل
 */
function buildPrompt(text, targetLang) {
  return `You are a professional manga/manhwa translator. Translate the following text to ${targetLang}.

Rules:
- Keep character names unchanged (transliterate if needed)
- Maintain emotional tone and expressions
- Use natural dialogue style appropriate for the target language
- Preserve onomatopoeia meanings while adapting them naturally
- Output ONLY the translation, nothing else - no explanations, no notes

Text to translate:
${text}`;
}

/**
 * Supported source languages for OCR
 * اللغات المدعومة للتعرف على النص
 */
const SUPPORTED_SOURCE_LANGUAGES = {
  jpn: {
    code: 'jpn',
    name: 'Japanese',
    nameAr: 'اليابانية',
    nativeName: '日本語'
  },
  kor: {
    code: 'kor',
    name: 'Korean',
    nameAr: 'الكورية',
    nativeName: '한국어'
  },
  chi_sim: {
    code: 'chi_sim',
    name: 'Chinese Simplified',
    nameAr: 'الصينية المبسطة',
    nativeName: '简体中文'
  },
  chi_tra: {
    code: 'chi_tra',
    name: 'Chinese Traditional',
    nameAr: 'الصينية التقليدية',
    nativeName: '繁體中文'
  }
};

/**
 * Supported target languages for translation
 * لغات الترجمة المدعومة
 */
const SUPPORTED_TARGET_LANGUAGES = {
  Arabic: {
    code: 'Arabic',
    name: 'Arabic',
    nameAr: 'العربية',
    isRTL: true
  },
  English: {
    code: 'English',
    name: 'English',
    nameAr: 'الإنجليزية',
    isRTL: false
  }
};

// Export for use in other scripts (if using modules)
// تصدير للاستخدام في سكريبتات أخرى
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_CONFIGS,
    SUPPORTED_SOURCE_LANGUAGES,
    SUPPORTED_TARGET_LANGUAGES,
    buildPrompt
  };
}
