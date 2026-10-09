// Realistic Synthetic Survey Response Generator

const SAMPLE_TEXT_ANSWERS = [
  "Oldukça memnun kaldım, ellerinize sağlık.",
  "Sistem çok hızlı ve pratik çalışıyor.",
  "Genel olarak başarılı ancak mobil görünüm biraz daha optimize edilebilir.",
  "Harika bir deneyimdi, herkese tavsiye ederim.",
  "Fiyat ve performans dengesi oldukça başarılı.",
  "Beklediğimden çok daha iyi çıktı, teşekkürler.",
  "Destek ekibi çok ilgiliydi, sorularıma anında yanıt aldım.",
  "Arayüz oldukça modern ve anlaşılır olmuş.",
  "Bence yeni özellikler eklenirse rakipsiz olur.",
  "Bazı sayfalarda yüklenme süresi biraz hızlanabilir.",
  "Kullanımı çok kolay, ilk defa kullanan biri bile rahatça çözebilir.",
  "Gayet başarılı bir proje, devamını dilerim.",
  "Tasarım sade ve göz yormuyor, çok beğendim.",
  "Eksiksiz ve kaliteli bir hizmet aldım.",
  "Her şey yolunda gitti, sorun yaşamadım."
];

function getRandomItem(array) {
  if (!array || array.length === 0) return '';
  return array[Math.floor(Math.random() * array.length)];
}

function getRandomSubarray(array, min = 1, max = null) {
  if (!array || array.length === 0) return [];
  const countMax = max !== null ? Math.min(max, array.length) : array.length;
  const count = Math.floor(Math.random() * (countMax - min + 1)) + min;
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

// Generate human-like weighted rating (more 4 and 5, fewer 1 and 2)
function getWeightedRating(maxRating = 5) {
  const rand = Math.random();
  if (maxRating === 5) {
    if (rand < 0.45) return 5;
    if (rand < 0.75) return 4;
    if (rand < 0.90) return 3;
    if (rand < 0.96) return 2;
    return 1;
  }
  // Generic scale
  return Math.max(1, Math.min(maxRating, Math.round(maxRating * (0.6 + Math.random() * 0.4))));
}

// Weighted random item selection based on custom percentage/weight distribution
function getWeightedRandomItem(options, weightsMap = null) {
  if (!options || options.length === 0) return '';
  if (options.length === 1) return options[0];

  // If no weights specified or weightsMap is empty, use uniform random
  if (!weightsMap || typeof weightsMap !== 'object' || Object.keys(weightsMap).length === 0) {
    return getRandomItem(options);
  }

  // Map each option to its positive weight
  const weights = options.map(opt => {
    const key = String(opt).trim();
    if (weightsMap[key] !== undefined) {
      const val = parseFloat(weightsMap[key]);
      return isNaN(val) || val < 0 ? 0 : val;
    }
    return 1; // Default neutral weight if not explicitly configured
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) {
    return getRandomItem(options);
  }

  let randomVal = Math.random() * totalWeight;
  for (let i = 0; i < options.length; i++) {
    if (randomVal < weights[i]) {
      return options[i];
    }
    randomVal -= weights[i];
  }

  return options[options.length - 1];
}

// Weighted random subarray for multiple choice
function getWeightedSubarray(options, weightsMap = null, min = 1, max = null) {
  if (!options || options.length === 0) return [];
  const countMax = max !== null ? Math.min(max, options.length) : options.length;
  const count = Math.floor(Math.random() * (countMax - min + 1)) + min;

  if (!weightsMap || Object.keys(weightsMap).length === 0) {
    return getRandomSubarray(options, min, max);
  }

  // Draw without replacement using current weights
  const pool = [...options];
  const currentWeights = { ...weightsMap };
  const selected = [];

  for (let step = 0; step < count && pool.length > 0; step++) {
    const picked = getWeightedRandomItem(pool, currentWeights);
    selected.push(picked);
    // Remove picked from pool
    const idx = pool.indexOf(picked);
    if (idx !== -1) pool.splice(idx, 1);
  }

  return selected;
}

// Generate single realistic response object for a given survey with optional constraints & weights
function generateResponseForSurvey(survey, constraints = {}, weights = {}) {
  const answers = {};

  if (!survey || !survey.questions) {
    return { answers };
  }

  for (const q of survey.questions) {
    // If not required, sometimes skip (15% chance to skip optional)
    if (!q.required && Math.random() < 0.15) {
      continue;
    }

    // List of excluded option texts for this question
    const rawExcluded = Array.isArray(constraints[q.id]) ? constraints[q.id] : [];
    const excluded = rawExcluded.map(item => String(item).trim());
    const qWeights = weights[q.id] || null;

    switch (q.type) {
      case 'single':
      case 'select': {
        if (q.options && q.options.length > 0) {
          const allowed = q.options.filter(opt => !excluded.includes(String(opt).trim()));
          const candidateOptions = allowed.length > 0 ? allowed : q.options;
          answers[q.id] = getWeightedRandomItem(candidateOptions, qWeights);
        }
        break;
      }

      case 'multiple': {
        if (q.options && q.options.length > 0) {
          const allowed = q.options.filter(opt => !excluded.includes(String(opt).trim()));
          const candidateOptions = allowed.length > 0 ? allowed : q.options;
          answers[q.id] = getWeightedSubarray(candidateOptions, qWeights, 1, Math.min(3, candidateOptions.length));
        }
        break;
      }

      case 'rating': {
        const maxR = q.maxRating || 5;
        const allRatings = Array.from({ length: maxR }, (_, i) => i + 1);
        const allowed = allRatings.filter(r => !excluded.includes(String(r)));
        const candidateRatings = allowed.length > 0 ? allowed : allRatings;

        if (qWeights && Object.keys(qWeights).length > 0) {
          // Custom weights provided by user (e.g. {"5": 60, "4": 30, "3": 10})
          const picked = getWeightedRandomItem(candidateRatings.map(String), qWeights);
          answers[q.id] = parseInt(picked, 10) || maxR;
        } else if (maxR === 5 && candidateRatings.length === 5) {
          // Standard realistic curve
          answers[q.id] = getWeightedRating(5);
        } else {
          answers[q.id] = getRandomItem(candidateRatings);
        }
        break;
      }

      case 'text':
        // Optional text: 70% fill chance, required: 100%
        if (q.required || Math.random() < 0.70) {
          answers[q.id] = getRandomItem(SAMPLE_TEXT_ANSWERS);
        }
        break;

      default:
        if (q.options && q.options.length > 0) {
          const allowed = q.options.filter(opt => !excluded.includes(String(opt).trim()));
          const candidateOptions = allowed.length > 0 ? allowed : q.options;
          answers[q.id] = getWeightedRandomItem(candidateOptions, qWeights);
        }
    }
  }

  return {
    surveyId: survey.id,
    submittedAt: new Date(Date.now() - Math.floor(Math.random() * 3600000)).toISOString(),
    isSimulation: true,
    ip: `192.168.1.${Math.floor(Math.random() * 200) + 10} (bot)`,
    userAgent: 'Anketor Synthetic Agent v1.0',
    answers
  };
}

module.exports = {
  generateResponseForSurvey,
  SAMPLE_TEXT_ANSWERS
};
