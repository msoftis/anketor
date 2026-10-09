// Centralized Firebase Firestore Data Service (Client-Side Serverless)

(function(window) {
  // Reference to Firestore database
  function getDb() {
    if (typeof firestoreDb !== 'undefined' && firestoreDb) {
      return firestoreDb;
    }
    if (typeof firebase !== 'undefined' && firebase.firestore) {
      return firebase.firestore();
    }
    return null;
  }

  // 1. Get all surveys
  async function getAllSurveys() {
    const db = getDb();
    if (!db) {
      console.warn('Firestore bağlantısı yok. LocalStorage kullanılıyor.');
      return getLocalSurveys();
    }

    try {
      const snap = await db.collection('surveys').get();
      const list = [];
      snap.forEach(doc => {
        list.push({ ...doc.data(), id: doc.id });
      });

      // Synchronize response counts from actual responses collection
      try {
        const respSnap = await db.collection('responses').get();
        const counts = {};
        respSnap.forEach(d => {
          const sid = String(d.data().surveyId);
          counts[sid] = (counts[sid] || 0) + 1;
        });

        list.forEach(s => {
          s.responseCount = counts[String(s.id)] || 0;
        });
      } catch (countErr) {
        console.warn('Yanıt sayıları senkronizasyon uyarısı:', countErr);
      }

      // Sort by createdAt descending
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      return list;
    } catch (err) {
      console.error('Firestore anket getirme hatası:', err);
      return getLocalSurveys();
    }
  }

  // 2. Get survey by ID
  async function getSurveyById(id) {
    const db = getDb();
    const strId = String(id);
    if (!db) {
      const surveys = getLocalSurveys();
      return surveys.find(s => String(s.id) === strId) || null;
    }

    try {
      const doc = await db.collection('surveys').doc(strId).get();
      if (doc.exists) {
        const data = { ...doc.data(), id: doc.id };
        try {
          const respSnap = await db.collection('responses').where('surveyId', '==', strId).get();
          data.responseCount = respSnap.size;
        } catch (_) {}
        return data;
      }
      return null;
    } catch (err) {
      console.error('Firestore tekil anket getirme hatası:', err);
      const surveys = getLocalSurveys();
      return surveys.find(s => String(s.id) === strId) || null;
    }
  }

  // Helper: Get next clean sequential numeric ID (1, 2, 3, 4, 5...)
  async function getNextNumericSurveyId() {
    const surveys = await getAllSurveys();
    let maxId = 0;
    surveys.forEach(s => {
      const num = parseInt(s.id, 10);
      if (!isNaN(num) && String(num) === String(s.id).trim() && num > maxId) {
        maxId = num;
      }
    });
    return String(maxId + 1);
  }

  // 3. Save or update survey
  async function saveSurvey(survey) {
    const db = getDb();
    let id = survey.id ? String(survey.id).trim() : '';
    if (!id) {
      id = await getNextNumericSurveyId();
    }

    const surveyToSave = {
      ...survey,
      id,
      updatedAt: new Date().toISOString()
    };
    if (!surveyToSave.createdAt) {
      surveyToSave.createdAt = new Date().toISOString();
    }
    if (surveyToSave.responseCount === undefined) {
      surveyToSave.responseCount = 0;
    }

    if (db) {
      try {
        await db.collection('surveys').doc(id).set(surveyToSave, { merge: true });
        console.log('☁️ Anket Firestore\'a kaydedildi. Sabit Temiz ID:', id);
      } catch (err) {
        console.error('Firestore kayıt hatası:', err);
      }
    }

    saveLocalSurvey(surveyToSave);
    return surveyToSave;
  }

  // 4. Duplicate survey
  async function duplicateSurvey(surveyId) {
    const original = await getSurveyById(surveyId);
    if (!original) throw new Error('Kopyalanacak anket bulunamadı');

    const newId = await getNextNumericSurveyId();
    const newSurvey = {
      ...JSON.parse(JSON.stringify(original)),
      id: newId,
      title: `${original.title} (Kopya)`,
      responseCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    return await saveSurvey(newSurvey);
  }

  // 5. Delete survey and its responses
  async function deleteSurvey(surveyId) {
    const db = getDb();
    const strId = String(surveyId);

    if (db) {
      try {
        // Delete survey document
        await db.collection('surveys').doc(strId).delete();

        // Delete associated responses
        const resps = await db.collection('responses').where('surveyId', '==', strId).get();
        const batch = db.batch();
        resps.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log('🗑️ Anket ve yanıtlar Firestore\'dan silindi:', strId);
      } catch (err) {
        console.error('Firestore anket silme hatası:', err);
      }
    }

    deleteLocalSurvey(strId);
    return true;
  }

  // 6. Get responses for a survey
  async function getSurveyResponses(surveyId) {
    const db = getDb();
    const strId = String(surveyId);

    if (!db) {
      return getLocalResponses(strId);
    }

    try {
      const snap = await db.collection('responses').where('surveyId', '==', strId).get();
      const list = [];
      snap.forEach(doc => {
        list.push({ ...doc.data(), id: doc.id });
      });

      // Sort latest first
      list.sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
      return list;
    } catch (err) {
      console.error('Firestore yanıt getirme hatası:', err);
      return getLocalResponses(strId);
    }
  }

  // 7. Add a new response
  async function addResponse(surveyId, answers, isSimulation = false) {
    const db = getDb();
    const strId = String(surveyId);
    const newResp = {
      surveyId: strId,
      isSimulation: !!isSimulation,
      submittedAt: new Date().toISOString(),
      ip: isSimulation ? `192.168.1.${Math.floor(Math.random() * 200) + 10}` : 'Web Katılımcısı',
      userAgent: navigator.userAgent || 'Web Browser',
      answers: answers || {}
    };

    if (db) {
      try {
        const docRef = await db.collection('responses').add(newResp);
        newResp.id = docRef.id;

        // Increment responseCount in survey
        const surveyRef = db.collection('surveys').doc(strId);
        await db.runTransaction(async (transaction) => {
          const sfDoc = await transaction.get(surveyRef);
          if (sfDoc.exists) {
            const currentCount = sfDoc.data().responseCount || 0;
            transaction.update(surveyRef, { responseCount: currentCount + 1 });
          }
        });
      } catch (err) {
        console.error('Firestore yanıt ekleme hatası:', err);
      }
    }

    saveLocalResponse(newResp);
    return newResp;
  }

  // 8. Simulate responses in batch
  async function simulateResponses(surveyId, count, constraints = {}, weights = {}) {
    const survey = await getSurveyById(surveyId);
    if (!survey) throw new Error('Anket bulunamadı');

    const totalCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 1000);
    const generated = [];

    for (let i = 0; i < totalCount; i++) {
      const sim = window.SurveySimulator.generateResponseForSurvey(survey, constraints, weights);
      sim.surveyId = String(surveyId);
      generated.push(sim);
    }

    const db = getDb();
    if (db) {
      // Write in chunks of 400 (Firestore batch limit is 500)
      const chunkSize = 400;
      for (let i = 0; i < generated.length; i += chunkSize) {
        const chunk = generated.slice(i, i + chunkSize);
        const batch = db.batch();
        chunk.forEach(resp => {
          const ref = db.collection('responses').doc();
          batch.set(ref, resp);
        });
        await batch.commit();
      }

      // Update response count
      const surveyRef = db.collection('surveys').doc(String(surveyId));
      await db.runTransaction(async (transaction) => {
        const sfDoc = await transaction.get(surveyRef);
        if (sfDoc.exists) {
          const currentCount = sfDoc.data().responseCount || 0;
          transaction.update(surveyRef, { responseCount: currentCount + generated.length });
        }
      });
    }

    // Save to local as well
    generated.forEach(r => saveLocalResponse(r));

    return generated.length;
  }

  // 9. Calculate Analytics (Pure Client-Side)
  function calculateAnalytics(survey, responses) {
    const analytics = {};
    const questions = survey.questions || [];

    questions.forEach(q => {
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

    return analytics;
  }

  // 10. Exports (Browser Blob)
  function exportCSV(survey, responses) {
    const questions = survey.questions || [];
    const headers = ['No', 'Tarih', 'IP / Kaynak', ...questions.map(q => `"${(q.title || '').replace(/"/g, '""')}"`)];
    const rows = [headers.join(';')];

    responses.forEach((r, idx) => {
      const row = [
        responses.length - idx,
        new Date(r.submittedAt).toLocaleString('tr-TR'),
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

    const csvContent = '\uFEFF' + rows.join('\r\n');
    downloadBlob(csvContent, `anket_${survey.id}_yanitlar.csv`, 'text/csv;charset=utf-8;');
  }

  function exportJSON(survey, responses) {
    const exportData = {
      survey,
      totalResponses: responses.length,
      exportedAt: new Date().toISOString(),
      responses
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    downloadBlob(jsonStr, `anket_${survey.id}_veriler.json`, 'application/json');
  }

  function downloadBlob(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // LocalStorage Fallbacks
  function getLocalSurveys() {
    try {
      return JSON.parse(localStorage.getItem('anketor_surveys') || '[]');
    } catch {
      return [];
    }
  }

  function saveLocalSurvey(survey) {
    const list = getLocalSurveys();
    const idx = list.findIndex(s => String(s.id) === String(survey.id));
    if (idx !== -1) {
      list[idx] = survey;
    } else {
      list.unshift(survey);
    }
    localStorage.setItem('anketor_surveys', JSON.stringify(list));
  }

  function deleteLocalSurvey(id) {
    const list = getLocalSurveys().filter(s => String(s.id) !== String(id));
    localStorage.setItem('anketor_surveys', JSON.stringify(list));
  }

  function getLocalResponses(surveyId) {
    try {
      const all = JSON.parse(localStorage.getItem('anketor_responses') || '[]');
      return all.filter(r => String(r.surveyId) === String(surveyId));
    } catch {
      return [];
    }
  }

  function saveLocalResponse(resp) {
    try {
      const all = JSON.parse(localStorage.getItem('anketor_responses') || '[]');
      all.push(resp);
      localStorage.setItem('anketor_responses', JSON.stringify(all));
    } catch (e) {
      console.warn('LocalStorage yanıt kaydetme uyarısı:', e);
    }
  }

  window.FirebaseService = {
    getAllSurveys,
    getSurveyById,
    saveSurvey,
    duplicateSurvey,
    deleteSurvey,
    getSurveyResponses,
    addResponse,
    simulateResponses,
    calculateAnalytics,
    exportCSV,
    exportJSON
  };
})(window);
