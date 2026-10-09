const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SURVEYS_FILE = path.join(DATA_DIR, 'surveys.json');
const RESPONSES_FILE = path.join(DATA_DIR, 'responses.json');

// Ensure directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Generate unique ID
function generateId(prefix = 's') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

// Initial sample survey if database is empty
const SAMPLE_SURVEY = {
  id: 's_ornek101',
  title: 'Müşteri Memnuniyeti ve Geri Bildirim Anketi',
  description: 'Hizmetlerimizi geliştirmek için görüşleriniz bizim için çok değerlidir. Lütfen birkaç dakikanızı ayırarak soruları yanıtlayınız.',
  themeColor: '#6366f1', // Indigo
  active: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  questions: [
    {
      id: 'q_1',
      title: 'Genel olarak aldığınız hizmetten ne kadar memnunsunuz?',
      type: 'rating',
      maxRating: 5,
      required: true
    },
    {
      id: 'q_2',
      title: 'Bizi arkadaşlarınıza veya meslektaşlarınıza tavsiye eder misiniz?',
      type: 'single',
      options: ['Kesinlikle Tavsiye Ederim', 'Muhtemelen Ederim', 'Kararsızım', 'Pek Sanmıyorum', 'Asla Etmem'],
      required: true
    },
    {
      id: 'q_3',
      title: 'En çok hangi yönümüzü başarılı buldunuz?',
      type: 'multiple',
      options: ['Hızlı Destek', 'Kullanım Kolaylığı', 'Fiyat / Performans', 'Güvenilirlik', 'Tasarım ve Arayüz'],
      required: false
    },
    {
      id: 'q_4',
      title: 'Hangi sıklıkla platformumuzu ziyaret ediyorsunuz?',
      type: 'select',
      options: ['Hemen hemen her gün', 'Haftada birkaç kez', 'Ayda birkaç kez', 'İlk defa kullanıyorum'],
      required: false
    },
    {
      id: 'q_5',
      title: 'Bizimle paylaşmak istediğiniz ek bir düşünce veya öneriniz var mı?',
      type: 'text',
      required: false
    }
  ]
};

// Safe JSON reading
function readJson(filePath, defaultValue) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2), 'utf-8');
      return defaultValue;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
    return defaultValue;
  }
}

// Safe JSON writing (atomic write via temp file)
function writeJson(filePath, data) {
  try {
    const tempPath = `${filePath}.tmp_${Date.now()}`;
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err);
    return false;
  }
}

// Initialize database
function initDb() {
  const surveys = readJson(SURVEYS_FILE, null);
  if (!surveys || surveys.length === 0) {
    writeJson(SURVEYS_FILE, [SAMPLE_SURVEY]);
  }
  readJson(RESPONSES_FILE, []);
}

initDb();

function getNextSurveyId(surveys) {
  if (!surveys || surveys.length === 0) return '1';
  const numericIds = surveys
    .map(s => parseInt(s.id, 10))
    .filter(n => !isNaN(n) && n > 0);
  const max = numericIds.length > 0 ? Math.max(...numericIds) : 0;
  return String(max + 1);
}

// Database Operations
const db = {
  // Surveys
  getSurveys() {
    return readJson(SURVEYS_FILE, []);
  },

  getSurveyById(id) {
    if (!id) return null;
    const surveys = this.getSurveys();
    const searchId = String(id).trim();
    return surveys.find(s => String(s.id) === searchId || s.legacyId === searchId) || null;
  },

  createSurvey(surveyData) {
    const surveys = this.getSurveys();
    const newSurvey = {
      id: surveyData.id ? String(surveyData.id) : getNextSurveyId(surveys),
      title: surveyData.title || 'İsimsiz Anket',
      description: surveyData.description || '',
      themeColor: '#4f46e5', // Fixed standard brand color
      active: surveyData.active !== undefined ? surveyData.active : true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      questions: (surveyData.questions || []).map((q, idx) => ({
        id: q.id || `q_${idx + 1}_${crypto.randomBytes(2).toString('hex')}`,
        title: q.title || `Soru ${idx + 1}`,
        type: q.type || 'single', // single, multiple, rating, text, select
        options: q.options || (['single', 'multiple', 'select'].includes(q.type) ? ['Seçenek 1', 'Seçenek 2'] : []),
        maxRating: q.maxRating || 5,
        required: !!q.required
      }))
    };
    surveys.unshift(newSurvey);
    writeJson(SURVEYS_FILE, surveys);
    return newSurvey;
  },

  updateSurvey(id, updateData) {
    const surveys = this.getSurveys();
    const searchId = String(id).trim();
    const index = surveys.findIndex(s => String(s.id) === searchId || s.legacyId === searchId);
    if (index === -1) return null;

    surveys[index] = {
      ...surveys[index],
      ...updateData,
      themeColor: '#4f46e5', // Always maintain standard brand color
      id: surveys[index].id, // protect ID
      createdAt: surveys[index].createdAt,
      updatedAt: new Date().toISOString()
    };

    writeJson(SURVEYS_FILE, surveys);
    return surveys[index];
  },

  deleteSurvey(id) {
    let surveys = this.getSurveys();
    const searchId = String(id).trim();
    const initialLen = surveys.length;
    surveys = surveys.filter(s => String(s.id) !== searchId && s.legacyId !== searchId);
    if (surveys.length !== initialLen) {
      writeJson(SURVEYS_FILE, surveys);
      this.clearResponses(id);
      return true;
    }
    return false;
  },

  // Responses
  getAllResponses() {
    return readJson(RESPONSES_FILE, []);
  },

  getResponsesBySurvey(surveyId) {
    const all = this.getAllResponses();
    const survey = this.getSurveyById(surveyId);
    const searchId = String(surveyId).trim();
    const legacyId = survey && survey.legacyId ? survey.legacyId : null;
    return all.filter(r => String(r.surveyId) === searchId || (legacyId && String(r.surveyId) === legacyId));
  },

  addResponse(responseData) {
    const responses = this.getAllResponses();
    const newResponse = {
      id: responseData.id || generateId('r'),
      surveyId: String(responseData.surveyId),
      submittedAt: responseData.submittedAt || new Date().toISOString(),
      isSimulation: !!responseData.isSimulation,
      ip: responseData.ip || '127.0.0.1',
      userAgent: responseData.userAgent || 'Web Browser',
      answers: responseData.answers || {}
    };
    responses.push(newResponse);
    writeJson(RESPONSES_FILE, responses);
    return newResponse;
  },

  addResponsesBatch(batchResponses) {
    const responses = this.getAllResponses();
    const formatted = batchResponses.map(item => ({
      id: item.id || generateId('r'),
      surveyId: String(item.surveyId),
      submittedAt: item.submittedAt || new Date().toISOString(),
      isSimulation: item.isSimulation !== undefined ? item.isSimulation : true,
      ip: item.ip || '127.0.0.1 (simulated)',
      userAgent: item.userAgent || 'Simulator Bot',
      answers: item.answers || {}
    }));
    responses.push(...formatted);
    writeJson(RESPONSES_FILE, responses);
    return formatted.length;
  },

  clearResponses(surveyId) {
    let responses = this.getAllResponses();
    if (surveyId) {
      const survey = this.getSurveyById(surveyId);
      const searchId = String(surveyId).trim();
      const legacyId = survey && survey.legacyId ? survey.legacyId : null;
      responses = responses.filter(r => String(r.surveyId) !== searchId && (!legacyId || String(r.surveyId) !== legacyId));
    } else {
      responses = [];
    }
    writeJson(RESPONSES_FILE, responses);
    return true;
  },

  deleteSingleResponse(id) {
    let responses = this.getAllResponses();
    const initialLen = responses.length;
    responses = responses.filter(r => r.id !== id);
    if (responses.length !== initialLen) {
      writeJson(RESPONSES_FILE, responses);
      return true;
    }
    return false;
  }
};

module.exports = db;
