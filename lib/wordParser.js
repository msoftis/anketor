const mammoth = require('mammoth');

/**
 * Intelligent Parser for Word (.docx) and Text Survey Files
 */

function cleanLine(line) {
  if (!line) return '';
  return line.replace(/\r/g, '').trim();
}

function isQuestionStart(line) {
  // Matches: "1. Soru", "1) Soru", "1 - Soru", "Soru 1:", "Soru 1.", "Q1:", "[1]", "1."
  const patterns = [
    /^(?:Soru\s*)?(\d+)[.)\-:\s]\s*(.+)/i,
    /^(?:Q|Question)\s*(\d+)[.)\-:\s]\s*(.+)/i,
    /^\[(\d+)\]\s*(.+)/,
    /^(\d+)\.\s*$/
  ];

  for (const regex of patterns) {
    const match = line.match(regex);
    if (match) return true;
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
  // Matches: "A) ...", "a. ...", "[ ] ...", "( ) ...", "• ...", "- ...", "* ..."
  const optionRegex = /^([A-Ha-h][.)\-:]|\(\s*[A-Ha-h0-9]\s*\)|\[\s*[xX ]?\s*\]|\(\s*[xX ]?\s*\)|[•\-\*\u2022\u25CF\u25CB])\s*(.+)/;
  return optionRegex.test(line);
}

function stripOptionPrefix(line) {
  return line
    .replace(/^([A-Ha-h][.)\-:]|\(\s*[A-Ha-h0-9]\s*\)|\[\s*[xX ]?\s*\]|\(\s*[xX ]?\s*\)|[•\-\*\u2022\u25CF\u25CB])\s*/, '')
    .trim();
}

// Check for in-line options like "A) Evet   B) Hayır   C) Kararsızım"
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

  // Multi-select indicators
  if (
    lowerTitle.includes('birden fazla') ||
    lowerTitle.includes('en fazla') ||
    lowerTitle.includes('hangileri') ||
    lowerTitle.includes('uygun olanları işaretleyiniz') ||
    lowerTitle.includes('seçebilirsiniz')
  ) {
    return 'multiple';
  }

  // Rating indicators (1-5, 1-10, yıldız, puanlayın, likert)
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

  // If options are pure scale like ["1", "2", "3", "4", "5"]
  if (options && options.length === 5 && options.every((opt, i) => opt.trim() === String(i + 1))) {
    return 'rating';
  }

  // Open-ended / text
  if (
    !options || options.length === 0 ||
    lowerTitle.includes('açıklayınız') ||
    lowerTitle.includes('belirtiniz') ||
    lowerTitle.includes('düşünceleriniz') ||
    lowerTitle.includes('önerileriniz') ||
    lowerTitle.includes('yorumunuz') ||
    lowerTitle.includes('nedenini yazınız')
  ) {
    return 'text';
  }

  return 'single';
}

/**
 * Main parser function:
 * Converts docx buffer into survey object
 */
async function parseDocxSurvey(fileBuffer) {
  // Extract text from Word document
  const { value: rawText } = await mammoth.extractRawText({ buffer: fileBuffer });
  return parseTextSurvey(rawText);
}

/**
 * Text parsing algorithm
 */
function parseTextSurvey(rawText) {
  const lines = rawText
    .split('\n')
    .map(cleanLine)
    .filter(l => l.length > 0);

  if (lines.length === 0) {
    throw new Error('Dosya içeriği boş görünüyor.');
  }

  let surveyTitle = 'İçe Aktarılan Anket';
  let surveyDescription = '';
  let startIndex = 0;

  // Detect title from top lines
  if (lines.length > 0) {
    surveyTitle = lines[0].replace(/^#+\s*/, '').trim();
    startIndex = 1;

    // Check if next line is a description or subtitle
    if (lines.length > 1 && !isQuestionStart(lines[1])) {
      surveyDescription = lines[1];
      startIndex = 2;
    }
  }

  const rawQuestions = [];
  let currentQ = null;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];

    // Check if line starts a new question
    if (isQuestionStart(line)) {
      if (currentQ) {
        rawQuestions.push(currentQ);
      }
      currentQ = {
        title: stripQuestionPrefix(line),
        options: [],
        lines: []
      };
      continue;
    }

    // If we have an active question
    if (currentQ) {
      // Check for inline choices on this line
      const inlineOpts = extractInlineOptions(line);
      if (inlineOpts) {
        currentQ.options.push(...inlineOpts);
        continue;
      }

      // Check if line is an option
      if (isOptionStart(line)) {
        currentQ.options.push(stripOptionPrefix(line));
        continue;
      }

      // If line is short and looks like an option (e.g. "Evet", "Hayır")
      if (['evet', 'hayır', 'kararsızım', 'katılıyorum', 'katılmıyorum', 'kesinlikle katılıyorum'].includes(line.toLowerCase())) {
        currentQ.options.push(line);
        continue;
      }

      // If question title was multiline (no options found yet)
      if (currentQ.options.length === 0) {
        // If line is not a separator like "------"
        if (!line.startsWith('---') && !line.startsWith('===') && !line.startsWith('...')) {
          currentQ.title += ' ' + line;
        }
      }
    } else {
      // Before first question, could be extra description
      if (!surveyDescription) {
        surveyDescription = line;
      } else {
        surveyDescription += ' ' + line;
      }
    }
  }

  if (currentQ) {
    rawQuestions.push(currentQ);
  }

  // Fallback if no questions detected by numbers (split by empty paragraphs or '?')
  if (rawQuestions.length === 0) {
    const fallbackQuestions = lines.filter(l => l.includes('?') || l.length > 15);
    fallbackQuestions.forEach((qText, idx) => {
      rawQuestions.push({
        title: qText,
        options: ['Evet', 'Hayır', 'Kararsızım']
      });
    });
  }

  // Format finalized questions
  const questions = rawQuestions.map((q, idx) => {
    const type = detectQuestionType(q.title, q.options);
    let options = q.options;

    if (type === 'rating') {
      options = [];
    } else if (type === 'text') {
      options = [];
    } else if (options.length === 0) {
      // Default fallback options if choice question had no options parsed
      options = ['Seçenek 1', 'Seçenek 2'];
    }

    return {
      id: `q_${idx + 1}`,
      title: q.title.trim(),
      type: type,
      options: options,
      maxRating: 5,
      required: true
    };
  });

  return {
    title: surveyTitle,
    description: surveyDescription,
    questions
  };
}

module.exports = {
  parseDocxSurvey,
  parseTextSurvey
};
