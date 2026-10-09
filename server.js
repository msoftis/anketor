const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./lib/db');
const { generateResponseForSurvey } = require('./lib/simulator');
const { getLocalIpAddress } = require('./lib/network');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const { parseDocxSurvey, parseTextSurvey } = require('./lib/wordParser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static assets
app.use(express.static(path.join(__dirname, 'public')));

// Public Responder Page route
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey.html'));
});



// ================= API ENDPOINTS =================

// System information (LAN IP, port, URLs)
app.get('/api/system/info', (req, res) => {
  const localIp = getLocalIpAddress();
  const host = req.get('host');
  res.json({
    port: PORT,
    localIp,
    localUrl: `http://localhost:${PORT}`,
    lanUrl: `http://${localIp}:${PORT}`,
    currentHostUrl: `${req.protocol}://${host}`
  });
});

// Get all surveys
app.get('/api/surveys', (req, res) => {
  const surveys = db.getSurveys();
  const allResponses = db.getAllResponses();

  // Attach response counts
  const enriched = surveys.map(s => {
    const resp = allResponses.filter(r => r.surveyId === s.id);
    return {
      ...s,
      responseCount: resp.length,
      simulatedCount: resp.filter(r => r.isSimulation).length,
      organicCount: resp.filter(r => !r.isSimulation).length
    };
  });

  res.json(enriched);
});

// Create new survey
app.post('/api/surveys', (req, res) => {
  try {
    const survey = db.createSurvey(req.body);
    res.status(201).json(survey);
  } catch (err) {
    console.error('Create survey error:', err);
    res.status(500).json({ error: 'Anket oluşturulurken hata meydana geldi' });
  }
});

// Upload and Parse Word (.docx) or Text survey file
app.post('/api/surveys/upload-word', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Lütfen bir Word (.docx) veya metin dosyası seçiniz.' });
    }

    const filename = (req.file.originalname || '').toLowerCase();
    let parsedSurvey;

    if (filename.endsWith('.docx') || (req.file.mimetype && req.file.mimetype.includes('wordprocessingml'))) {
      parsedSurvey = await parseDocxSurvey(req.file.buffer);
    } else if (filename.endsWith('.txt')) {
      parsedSurvey = parseTextSurvey(req.file.buffer.toString('utf-8'));
    } else {
      // Try docx parsing by default, fallback to text
      try {
        parsedSurvey = await parseDocxSurvey(req.file.buffer);
      } catch (e) {
        parsedSurvey = parseTextSurvey(req.file.buffer.toString('utf-8'));
      }
    }

    res.json({
      success: true,
      message: `${parsedSurvey.questions.length} adet soru başarıyla tespit edildi!`,
      data: parsedSurvey
    });
  } catch (err) {
    console.error('Word parse error:', err);
    res.status(500).json({ error: err.message || 'Word dosyası okunurken hata oluştu.' });
  }
});

// Parse pasted raw survey text
app.post('/api/surveys/parse-text', (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Lütfen anket metnini giriniz.' });
    }
    const parsedSurvey = parseTextSurvey(text);
    res.json({
      success: true,
      message: `${parsedSurvey.questions.length} adet soru başarıyla tespit edildi!`,
      data: parsedSurvey
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Metin ayrıştırılırken hata oluştu.' });
  }
});

// Get single survey details
app.get('/api/surveys/:id', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }
  res.json(survey);
});

// Update survey
app.put('/api/surveys/:id', (req, res) => {
  const updated = db.updateSurvey(req.params.id, req.body);
  if (!updated) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }
  res.json(updated);
});

// Delete survey
app.delete('/api/surveys/:id', (req, res) => {
  const deleted = db.deleteSurvey(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }
  res.json({ success: true, message: 'Anket silindi' });
});

// Duplicate survey - Creates an exact copy with 0 responses
app.post('/api/surveys/:id/duplicate', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  const duplicatedData = {
    title: `${survey.title} (Kopya)`,
    description: survey.description || '',
    themeColor: '#4f46e5',
    active: true,
    questions: (survey.questions || []).map((q, idx) => ({
      id: `q_${idx + 1}_${Date.now().toString(36)}_${idx}`,
      title: q.title,
      type: q.type,
      options: Array.isArray(q.options) ? [...q.options] : [],
      maxRating: q.maxRating || 5,
      required: !!q.required
    }))
  };

  const newSurvey = db.createSurvey(duplicatedData);
  res.status(201).json(newSurvey);
});

// ================= RESPONSES API =================

// Get responses and analytics for a survey
app.get('/api/surveys/:id/responses', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  const responses = db.getResponsesBySurvey(req.params.id);

  // Compute analytics aggregation per question
  const analytics = {};

  (survey.questions || []).forEach(q => {
    analytics[q.id] = {
      questionId: q.id,
      title: q.title,
      type: q.type,
      totalAnswered: 0,
      distribution: {},
      averageRating: 0,
      textAnswers: []
    };

    if (q.options) {
      q.options.forEach(opt => {
        analytics[q.id].distribution[opt] = 0;
      });
    }
  });

  let totalRatingSum = 0;
  let totalRatingCount = 0;

  responses.forEach(r => {
    const answers = r.answers || {};

    Object.keys(answers).forEach(qid => {
      if (!analytics[qid]) return;
      const ans = answers[qid];
      if (ans === undefined || ans === null || ans === '') return;

      analytics[qid].totalAnswered++;

      if (analytics[qid].type === 'single' || analytics[qid].type === 'select') {
        analytics[qid].distribution[ans] = (analytics[qid].distribution[ans] || 0) + 1;
      } else if (analytics[qid].type === 'multiple') {
        if (Array.isArray(ans)) {
          ans.forEach(val => {
            analytics[qid].distribution[val] = (analytics[qid].distribution[val] || 0) + 1;
          });
        }
      } else if (analytics[qid].type === 'rating') {
        const numVal = Number(ans);
        if (!isNaN(numVal)) {
          analytics[qid].distribution[numVal] = (analytics[qid].distribution[numVal] || 0) + 1;
          totalRatingSum += numVal;
          totalRatingCount++;
        }
      } else if (analytics[qid].type === 'text') {
        analytics[qid].textAnswers.push({
          responseId: r.id,
          text: ans,
          date: r.submittedAt,
          isSimulation: r.isSimulation
        });
      }
    });
  });

  // Calculate rating averages
  Object.keys(analytics).forEach(qid => {
    if (analytics[qid].type === 'rating' && analytics[qid].totalAnswered > 0) {
      let sum = 0;
      Object.keys(analytics[qid].distribution).forEach(star => {
        sum += Number(star) * analytics[qid].distribution[star];
      });
      analytics[qid].averageRating = (sum / analytics[qid].totalAnswered).toFixed(2);
    }
  });

  res.json({
    survey,
    totalCount: responses.length,
    simulatedCount: responses.filter(r => r.isSimulation).length,
    organicCount: responses.filter(r => !r.isSimulation).length,
    responses: responses.slice().reverse(), // latest first
    analytics
  });
});

// Submit a new response (from responder page)
app.post('/api/surveys/:id/responses', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  if (!survey.active) {
    return res.status(400).json({ error: 'Bu anket şu anda yanıtlara kapalıdır.' });
  }

  const { answers } = req.body;
  if (!answers || typeof answers !== 'object') {
    return res.status(400).json({ error: 'Geçersiz yanıt verisi' });
  }

  // Validate required questions
  const missing = [];
  (survey.questions || []).forEach(q => {
    if (q.required) {
      const val = answers[q.id];
      if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
        missing.push(q.title);
      }
    }
  });

  if (missing.length > 0) {
    return res.status(400).json({
      error: `Lütfen zorunlu soruları yanıtlayınız: ${missing.join(', ')}`,
      missing
    });
  }

  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'Bilinmiyor';

  const newResponse = db.addResponse({
    surveyId: survey.id,
    isSimulation: false,
    ip,
    userAgent,
    answers
  });

  res.status(201).json({
    success: true,
    message: 'Yanıtınız başarıyla kaydedildi!',
    responseId: newResponse.id
  });
});

// Clear all responses for a survey (protected against accidental deletion)
app.delete('/api/surveys/:id/responses', (req, res) => {
  if (req.query.confirm !== 'true') {
    return res.status(400).json({ error: 'Yanıtları temizlemek için açık onay parametresi gereklidir.' });
  }
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  db.clearResponses(survey.id);
  res.json({ success: true, message: 'Tüm yanıtlar başarıyla temizlendi.' });
});

// Delete single response
app.delete('/api/responses/:id', (req, res) => {
  const deleted = db.deleteSingleResponse(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: 'Yanıt bulunamadı' });
  }
  res.json({ success: true, message: 'Yanıt silindi' });
});

// ================= SIMULATOR / RANDOM FILLER API =================

// Generate batch random responses
app.post('/api/surveys/:id/simulate', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  const count = Math.min(Math.max(parseInt(req.body.count, 10) || 10, 1), 5000); // Between 1 and 5000
  const constraints = req.body.constraints || {};
  const weights = req.body.weights || {};
  const batch = [];

  for (let i = 0; i < count; i++) {
    const simulated = generateResponseForSurvey(survey, constraints, weights);
    batch.push(simulated);
  }

  const added = db.addResponsesBatch(batch);

  res.json({
    success: true,
    addedCount: added,
    message: `${added} adet rastgele anket yanıtı başarıyla üretildi ve kaydedildi!`
  });
});

// Generate 1 single random response (for live streaming / ticker animation)
app.post('/api/surveys/:id/simulate-one', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).json({ error: 'Anket bulunamadı' });
  }

  const constraints = (req.body && req.body.constraints) ? req.body.constraints : {};
  const weights = (req.body && req.body.weights) ? req.body.weights : {};
  const simulated = generateResponseForSurvey(survey, constraints, weights);
  const response = db.addResponse(simulated);

  res.json({
    success: true,
    response
  });
});

// ================= EXPORT ENDPOINTS =================

// CSV Export (Excel Compatible with UTF-8 BOM)
app.get('/api/surveys/:id/export/csv', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).send('Anket bulunamadı');
  }

  const responses = db.getResponsesBySurvey(survey.id);
  const questions = survey.questions || [];

  // Header row
  const headers = ['Yanıt ID', 'Tarih', 'Tür', 'IP Adresi', ...questions.map(q => `"${q.title.replace(/"/g, '""')}"`)];
  const rows = [headers.join(';')];

  responses.forEach(r => {
    const row = [
      r.id,
      new Date(r.submittedAt).toLocaleString('tr-TR'),
      r.isSimulation ? 'Simülasyon (Bot)' : 'Gerçek Yanıt',
      r.ip || '-'
    ];

    questions.forEach(q => {
      let val = (r.answers || {})[q.id];
      if (val === undefined || val === null) {
        val = '';
      } else if (Array.isArray(val)) {
        val = val.join(', ');
      }
      row.push(`"${String(val).replace(/"/g, '""')}"`);
    });

    rows.push(row.join(';'));
  });

  const csvContent = '\uFEFF' + rows.join('\r\n'); // UTF-8 BOM for Turkish Excel compatibility
  const filename = `anket_${survey.id}_yanitlar_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// JSON Export
app.get('/api/surveys/:id/export/json', (req, res) => {
  const survey = db.getSurveyById(req.params.id);
  if (!survey) {
    return res.status(404).send('Anket bulunamadı');
  }

  const responses = db.getResponsesBySurvey(survey.id);
  const data = {
    survey,
    exportedAt: new Date().toISOString(),
    totalResponses: responses.length,
    responses
  };

  const filename = `anket_${survey.id}_veriler_${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(JSON.stringify(data, null, 2));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIpAddress();
  console.log(`\n=================================================`);
  console.log(`🚀 ANKETOR Sunucusu Aktif!`);
  console.log(`🌐 Yerel Erişim (Admin Panel): http://localhost:${PORT}`);
  console.log(`📱 Ağ Üzerinden Erişim (Mobil / Diğer Cihazlar): http://${localIp}:${PORT}`);
  console.log(`=================================================\n`);
});
