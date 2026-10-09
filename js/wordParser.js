// Browser-Based Word (.docx) & Plain Text Survey Parser

(function(window) {
  function cleanLine(line) {
    if (!line) return '';
    return line.replace(/\r/g, '').trim();
  }

  function isQuestionStart(line) {
    const patterns = [
      /^(?:Soru\s*)?(\d+)[.)\-:\s]\s*(.+)/i,
      /^(?:Q|Question)\s*(\d+)[.)\-:\s]\s*(.+)/i,
      /^\[(\d+)\]\s*(.+)/,
      /^(\d+)\.\s*$/
    ];

    for (const regex of patterns) {
      if (regex.test(line)) return true;
    }
    return false;
  }

  function stripQuestionPrefix(line) {
    return line
      .replace(/^(?:Soru\s*)?\d+[.)\-:\s]\s*/i, '')
      .replace(/^(?:Q|Question)\s*\d+[.)\-:\s]\s*/i, '')
      .replace(/^\[\d+\]\s*/, '')
      .trim();
  }

  function isOptionStart(line) {
    const optionRegex = /^([A-Ha-h][.)\-:]|\(\s*[A-Ha-h0-9]\s*\)|\[\s*[xX ]?\s*\]|\(\s*[xX ]?\s*\)|[•\-\*\u2022\u25CF\u25CB])\s*(.+)/;
    return optionRegex.test(line);
  }

  function stripOptionPrefix(line) {
    return line
      .replace(/^([A-Ha-h][.)\-:]|\(\s*[A-Ha-h0-9]\s*\)|\[\s*[xX ]?\s*\]|\(\s*[xX ]?\s*\)|[•\-\*\u2022\u25CF\u25CB])\s*/, '')
      .trim();
  }

  function extractInlineOptions(line) {
    const inlinePattern = /(?:[A-Ha-h][.)\-:]|\(\s*[A-Ha-h]\s*\))\s*([^A-Ha-h.)\-:]+)/g;
    const matches = [];
    let m;
    while ((m = inlinePattern.exec(line)) !== null) {
      const opt = m[1].trim();
      if (opt.length > 0 && opt.length < 80) {
        matches.push(opt);
      }
    }
    return matches.length >= 2 ? matches : null;
  }

  function detectQuestionType(title, options) {
    const lowerTitle = title.toLowerCase();

    if (
      lowerTitle.includes('birden fazla') ||
      lowerTitle.includes('en fazla') ||
      lowerTitle.includes('hangileri') ||
      lowerTitle.includes('uygun olanları işaretleyiniz') ||
      lowerTitle.includes('seçebilirsiniz')
    ) {
      return 'multiple';
    }

    if (
      lowerTitle.includes('puanlayınız') ||
      lowerTitle.includes('puan veriniz') ||
      lowerTitle.includes('1 ile 5 arası') ||
      lowerTitle.includes('1-5 arası') ||
      lowerTitle.includes('1 ila 5') ||
      lowerTitle.includes('derecelendiriniz')
    ) {
      return 'rating';
    }

    if (options && options.length === 5 && options.every((opt, i) => opt.trim() === String(i + 1))) {
      return 'rating';
    }

    if (
      !options || options.length === 0 ||
      lowerTitle.includes('açıklayınız') ||
      lowerTitle.includes('belirtiniz') ||
      lowerTitle.includes('düşünceleriniz') ||
      lowerTitle.includes('önerileriniz') ||
      lowerTitle.includes('yorumunuz') ||
      lowerTitle.includes('görüşünüz')
    ) {
      return 'text';
    }

    return 'single';
  }

  function parseSurveyText(rawText, defaultTitle = 'Word Dosyasından Yüklenen Anket') {
    if (!rawText || typeof rawText !== 'string') {
      throw new Error('İçerik boş veya okunamadı.');
    }

    const lines = rawText.split('\n').map(cleanLine).filter(l => l.length > 0);
    if (lines.length === 0) {
      throw new Error('Belgede işlenebilir metin bulunamadı.');
    }

    let detectedTitle = defaultTitle;
    let description = '';
    const questions = [];

    let currentQ = null;
    let inHeader = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (inHeader && !isQuestionStart(line)) {
        if (i === 0 && line.length > 3 && line.length < 120 && !isOptionStart(line)) {
          detectedTitle = line;
        } else if (line.length > 0 && line.length < 300) {
          description += (description ? ' ' : '') + line;
        }
        continue;
      }

      if (isQuestionStart(line)) {
        inHeader = false;
        if (currentQ) {
          currentQ.type = detectQuestionType(currentQ.title, currentQ.options);
          questions.push(currentQ);
        }

        const qTitle = stripQuestionPrefix(line);
        currentQ = {
          id: `q_${questions.length + 1}_${Date.now().toString(36).slice(-4)}`,
          title: qTitle || `Soru #${questions.length + 1}`,
          type: 'single',
          options: [],
          required: true
        };
        continue;
      }

      if (currentQ) {
        const inlineOpts = extractInlineOptions(line);
        if (inlineOpts) {
          inlineOpts.forEach(opt => currentQ.options.push(opt));
          continue;
        }

        if (isOptionStart(line)) {
          const optText = stripOptionPrefix(line);
          if (optText.length > 0) {
            currentQ.options.push(optText);
          }
          continue;
        }

        if (currentQ.options.length === 0 && line.length > 0 && line.length < 200) {
          currentQ.title += ' ' + line;
        }
      }
    }

    if (currentQ) {
      currentQ.type = detectQuestionType(currentQ.title, currentQ.options);
      questions.push(currentQ);
    }

    if (questions.length === 0) {
      throw new Error('Belgede geçerli soru formatı (örn: "1. Soru metni" veya "A) Seçenek") bulunamadı.');
    }

    return {
      title: detectedTitle,
      description: description || 'Word belgesinden otomatik içe aktarılmıştır.',
      questions
    };
  }

  async function parseDocxFile(file) {
    if (!window.mammoth) {
      throw new Error('Word işleme kütüphanesi (mammoth.js) yüklenemedi. Lütfen internet bağlantınızı kontrol ediniz.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer });
    const rawText = result.value || '';
    const fileNameTitle = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ');
    return parseSurveyText(rawText, fileNameTitle);
  }

  window.SurveyWordParser = {
    parseSurveyText,
    parseDocxFile
  };
})(window);
