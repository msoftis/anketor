let currentSurvey = null;
const userAnswers = {};

function getSurveyIdFromUrl() {
  const pathParts = window.location.pathname.split('/');
  // If format is /s/ID
  if (pathParts.length >= 3 && pathParts[1] === 's') {
    return pathParts[2];
  }
  // Fallback to query param ?id=...
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('id') || '1';
}

async function loadSurvey() {
  const surveyId = getSurveyIdFromUrl();
  const loadingEl = document.getElementById('loadingState');
  const errorEl = document.getElementById('errorState');
  const formEl = document.getElementById('surveyForm');
  const progressWrapper = document.getElementById('progressWrapper');

  try {
    let surveyData = null;

    // 1. Try Firebase Firestore first if available
    if (typeof firestoreDb !== 'undefined' && firestoreDb) {
      try {
        const docSnap = await firestoreDb.collection('surveys').doc(surveyId).get();
        if (docSnap.exists) {
          surveyData = docSnap.data();
          console.log('☁️ Anket Firebase Firestore üzerinden yüklendi:', surveyId);
        }
      } catch (fbErr) {
        console.warn('Firestore anket getirme uyarısı:', fbErr);
      }
    }

    // 2. Fallback to local server API
    if (!surveyData) {
      try {
        const res = await fetch(`/api/surveys/${surveyId}`);
        if (res.ok) {
          surveyData = await res.json();
          console.log('💻 Anket yerel sunucu üzerinden yüklendi:', surveyId);
        }
      } catch (apiErr) {
        console.warn('Yerel API uyarısı:', apiErr);
      }
    }

    if (!surveyData) {
      throw new Error('Anket bulunamadı');
    }

    currentSurvey = surveyData;

    if (!currentSurvey.active) {
      loadingEl.style.display = 'none';
      errorEl.style.display = 'block';
      document.getElementById('errorTitle').textContent = 'Anket Yanıtlara Kapalıdır';
      document.getElementById('errorDesc').textContent = 'Bu anket yönetici tarafından geçici veya kalıcı olarak durdurulmuştur.';
      return;
    }

    // Apply standard brand theme
    document.documentElement.style.setProperty('--survey-theme', '#4f46e5');
    document.documentElement.style.setProperty('--survey-theme-glow', 'rgba(79, 70, 229, 0.25)');

    // Set titles
    document.title = `${currentSurvey.title} - Anketor`;
    document.getElementById('surveyTitle').textContent = currentSurvey.title;
    document.getElementById('surveyDescription').textContent = currentSurvey.description || '';

    // Render questions
    renderQuestions(currentSurvey.questions || []);

    loadingEl.style.display = 'none';
    formEl.style.display = 'block';
    progressWrapper.style.display = 'block';
    updateProgress();
  } catch (err) {
    loadingEl.style.display = 'none';
    errorEl.style.display = 'block';
  }
}

function renderQuestions(questions) {
  const container = document.getElementById('questionsContainer');
  container.innerHTML = '';

  questions.forEach((q, idx) => {
    const qEl = document.createElement('div');
    qEl.className = 'question-card';
    qEl.id = `q_card_${q.id}`;

    let inputHtml = '';

    if (q.type === 'single') {
      inputHtml = `<div class="options-list">` +
        (q.options || []).map((opt, optIdx) => `
          <label class="option-item-label">
            <input type="radio" name="ans_${q.id}" value="${escapeHtml(opt)}" onchange="onRadioChange('${q.id}', '${escapeHtml(opt)}')">
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join('') +
      `</div>`;
    } else if (q.type === 'multiple') {
      inputHtml = `<div class="options-list">` +
        (q.options || []).map((opt, optIdx) => `
          <label class="option-item-label">
            <input type="checkbox" name="ans_${q.id}" value="${escapeHtml(opt)}" onchange="onCheckboxChange('${q.id}')">
            <span>${escapeHtml(opt)}</span>
          </label>
        `).join('') +
      `</div>`;
    } else if (q.type === 'rating') {
      const max = q.maxRating || 5;
      let stars = '';
      for (let star = 1; star <= max; star++) {
        stars += `
          <button type="button" class="star-btn" data-qid="${q.id}" data-val="${star}" onclick="selectRating('${q.id}', ${star}, ${max})">
            <span>${star}</span>
            <span class="sub-star">★</span>
          </button>
        `;
      }
      inputHtml = `<div class="star-rating-box" id="rating_box_${q.id}">${stars}</div>`;
    } else if (q.type === 'select') {
      inputHtml = `
        <select class="survey-select" onchange="onSelectChange('${q.id}', this.value)">
          <option value="">Lütfen seçim yapınız...</option>
          ${(q.options || []).map(opt => `<option value="${escapeHtml(opt)}">${escapeHtml(opt)}</option>`).join('')}
        </select>
      `;
    } else if (q.type === 'text') {
      inputHtml = `
        <textarea class="survey-textarea" placeholder="Görüş ve düşüncelerinizi buraya yazabilirsiniz..." oninput="onTextInput('${q.id}', this.value)"></textarea>
      `;
    }

    qEl.innerHTML = `
      <div class="question-title">
        <span>${idx + 1}. ${escapeHtml(q.title)}</span>
        ${q.required ? `<span class="required-badge" title="Zorunlu Soru">*</span>` : ''}
      </div>
      <div class="question-hint">${q.required ? 'Bu soru zorunludur' : 'İsteğe bağlı'}</div>
      ${inputHtml}
    `;

    container.appendChild(qEl);
  });
}

function onRadioChange(qid, value) {
  userAnswers[qid] = value;
  updateProgress();
}

function onCheckboxChange(qid) {
  const checked = Array.from(document.querySelectorAll(`input[name="ans_${qid}"]:checked`)).map(el => el.value);
  userAnswers[qid] = checked;
  updateProgress();
}

function selectRating(qid, val, max) {
  userAnswers[qid] = val;
  const box = document.getElementById(`rating_box_${qid}`);
  if (box) {
    const buttons = box.querySelectorAll('.star-btn');
    buttons.forEach(btn => {
      const bVal = parseInt(btn.getAttribute('data-val'), 10);
      if (bVal <= val) {
        btn.classList.add('selected');
      } else {
        btn.classList.remove('selected');
      }
    });
  }
  updateProgress();
}

function onSelectChange(qid, val) {
  userAnswers[qid] = val;
  updateProgress();
}

function onTextInput(qid, val) {
  userAnswers[qid] = val.trim();
  updateProgress();
}

function updateProgress() {
  if (!currentSurvey || !currentSurvey.questions) return;
  const total = currentSurvey.questions.length;
  if (total === 0) return;

  let answeredCount = 0;
  currentSurvey.questions.forEach(q => {
    const ans = userAnswers[q.id];
    if (ans !== undefined && ans !== null && ans !== '' && (!Array.isArray(ans) || ans.length > 0)) {
      answeredCount++;
    }
  });

  const percent = Math.min(100, Math.round((answeredCount / total) * 100));
  const fill = document.getElementById('progressFill');
  if (fill) {
    fill.style.width = `${percent}%`;
  }
}

async function handleSurveySubmit(e) {
  e.preventDefault();
  const errorMsg = document.getElementById('submitErrorMsg');
  const submitBtn = document.getElementById('submitBtn');
  errorMsg.style.display = 'none';

  // Validation
  const missing = [];
  (currentSurvey.questions || []).forEach(q => {
    if (q.required) {
      const ans = userAnswers[q.id];
      if (ans === undefined || ans === null || ans === '' || (Array.isArray(ans) && ans.length === 0)) {
        missing.push(q);
      }
    }
  });

  if (missing.length > 0) {
    errorMsg.textContent = `Lütfen tüm zorunlu soruları doldurunuz (${missing.length} adet eksik soru var).`;
    errorMsg.style.display = 'block';

    // Scroll to first missing question
    const firstMissingEl = document.getElementById(`q_card_${missing[0].id}`);
    if (firstMissingEl) {
      firstMissingEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstMissingEl.style.borderColor = '#f43f5e';
      setTimeout(() => {
        firstMissingEl.style.borderColor = '';
      }, 2500);
    }
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span>Kaydediliyor...</span>`;

  try {
    let saved = false;

    // 1. Save directly to Firebase Firestore
    if (typeof firestoreDb !== 'undefined' && firestoreDb) {
      try {
        await firestoreDb.collection('responses').add({
          surveyId: String(currentSurvey.id),
          submittedAt: new Date().toISOString(),
          isSimulation: false,
          userAgent: navigator.userAgent || 'Web Browser',
          answers: userAnswers
        });

        // Increment count in survey doc
        if (firebase && firebase.firestore && firebase.firestore.FieldValue) {
          await firestoreDb.collection('surveys').doc(String(currentSurvey.id)).update({
            responseCount: firebase.firestore.FieldValue.increment(1)
          }).catch(e => console.warn('Count update warning:', e));
        }

        saved = true;
        console.log('☁️ Yanıt Firebase Firestore bulutuna başarıyla kaydedildi!');
      } catch (fbErr) {
        console.warn('Firestore kayıt uyarısı:', fbErr);
      }
    }

    // 2. Also send to local server if running
    try {
      const res = await fetch(`/api/surveys/${currentSurvey.id}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: userAnswers })
      });
      if (res.ok) {
        saved = true;
      }
    } catch (apiErr) {
      // Local server might not be running in static hosting
    }

    if (!saved) {
      throw new Error('Yanıt kaydedilemedi. Lütfen internet bağlantınızı kontrol ediniz.');
    }

    // Success transition
    document.getElementById('surveyForm').style.display = 'none';
    document.getElementById('progressWrapper').style.display = 'none';
    document.getElementById('successState').style.display = 'block';
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.innerHTML = `<span>Yanıtı Gönder</span><span>➔</span>`;
    errorMsg.textContent = err.message || 'Bağlantı hatası oluştu, lütfen tekrar deneyiniz.';
    errorMsg.style.display = 'block';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', loadSurvey);
