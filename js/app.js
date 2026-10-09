// ANKETOR - Main Dashboard Application Controller

let allSurveys = [];
let selectedAnalyticsSurveyId = null;
let currentEditingSurvey = null;
let systemInfo = { port: 3000, localIp: 'localhost', localUrl: 'http://localhost:3000', lanUrl: 'http://localhost:3000' };

// Simulator State
let isSimulating = false;
let simInterval = null;
let simTargetCount = 0;
let simCompletedCount = 0;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  await fetchSystemInfo();
  setupEventListeners();
  initAuth();
});

// System Info & Helpers
function getSurveyPublicUrl(surveyId) {
  const base = window.location.href.split('?')[0].replace(/index\.html$/, '');
  const cleanBase = base.endsWith('/') ? base : base + '/';
  return `${cleanBase}survey.html?id=${surveyId}`;
}

async function fetchSystemInfo() {
  const ipText = document.getElementById('networkIpText');
  if (ipText) {
    ipText.textContent = `Bulut: Firebase Firestore (anketor1)`;
  }
}

// Tab Switching
function switchTab(tabId) {
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === tabId);
  });

  const mainTitleEl = document.getElementById('navMainTitle');
  const subBreadcrumbEl = document.getElementById('subViewBreadcrumb');
  const subTitleBadgeEl = document.getElementById('subViewTitleBadge');

  if (tabId === 'tab-surveys') {
    if (mainTitleEl) mainTitleEl.style.display = 'inline-flex';
    if (subBreadcrumbEl) subBreadcrumbEl.style.display = 'none';
  } else {
    if (mainTitleEl) mainTitleEl.style.display = 'none';
    if (subBreadcrumbEl) subBreadcrumbEl.style.display = 'inline-flex';

    if (tabId === 'tab-analytics') {
      const s = allSurveys.find(x => String(x.id) === String(selectedAnalyticsSurveyId)) || allSurveys[0];
      const surveyInfo = s ? `📈 #${s.id} ${s.title.length > 45 ? s.title.substring(0, 42) + '...' : s.title}` : '📈 Anket Sonuçları';
      if (subTitleBadgeEl) subTitleBadgeEl.textContent = surveyInfo;
      populateAnalyticsSurveySelect();
      loadAnalyticsForSelectedSurvey();
    } else if (tabId === 'tab-builder') {
      const isEditing = document.getElementById('editingSurveyId')?.value;
      if (subTitleBadgeEl) subTitleBadgeEl.textContent = isEditing ? `✏️ Anket Düzenle` : `🛠️ Yeni Anket Tasarla`;
    } else if (tabId === 'tab-share') {
      const currentSelected = document.getElementById('shareSurveySelect')?.value;
      const s = allSurveys.find(x => String(x.id) === String(currentSelected)) || allSurveys[0];
      const surveyInfo = s ? `🚀 #${s.id} ${s.title.length > 45 ? s.title.substring(0, 42) + '...' : s.title}` : '🚀 Paylaş & Yayınla';
      if (subTitleBadgeEl) subTitleBadgeEl.textContent = surveyInfo;
      populateShareSurveySelect();
      updateShareLinks();
    }
  }
}

function openSurveyShare(surveyId) {
  populateShareSurveySelect();
  const select = document.getElementById('shareSurveySelect');
  if (select) select.value = String(surveyId);
  updateShareLinks();
  switchTab('tab-share');
}

function setupEventListeners() {
  // ESC to close modals
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSimulatorModal();
      closeConfirmModal();
      closeWordUploadModal();
    }
  });

  setupWordDropzone();
}

// ================= 1. SURVEYS LIST =================

async function loadSurveysList() {
  try {
    if (window.FirebaseService) {
      allSurveys = await window.FirebaseService.getAllSurveys();
    } else {
      const res = await fetch('/api/surveys');
      if (!res.ok) throw new Error('Anketler yüklenemedi');
      allSurveys = await res.json();
    }
    filterSurveysList();
    populateAllDropdowns();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function filterSurveysList() {
  const query = (document.getElementById('surveySearchInput')?.value || '').toLowerCase().trim();
  const filterStatus = document.getElementById('surveyStatusFilter')?.value || 'all';

  const filtered = allSurveys.filter(s => {
    const matchesQuery = !query || s.title.toLowerCase().includes(query) || (s.description && s.description.toLowerCase().includes(query));
    const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' && s.active) || (filterStatus === 'inactive' && !s.active);
    return matchesQuery && matchesStatus;
  });

  const countBadge = document.getElementById('surveysCountBadge');
  if (countBadge) {
    countBadge.textContent = `${filtered.length} / ${allSurveys.length} Anket`;
  }

  renderSurveysGrid(filtered);
}

function renderSurveysGrid(surveys) {
  const container = document.getElementById('surveysListContainer');
  if (!container) return;

  if (surveys.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: #ffffff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color); box-shadow: var(--shadow-sm);">
        <div style="font-size: 40px; margin-bottom: 12px;">📝</div>
        <h3 style="font-size: 18px; color: var(--text-main); font-weight: 700; margin-bottom: 6px;">Kayıtlı Anket Bulunamadı</h3>
        <p style="color: var(--text-muted); font-size: 14px; margin-bottom: 20px;">Arama kriterlerine uygun anket yok veya henüz anket oluşturulmamış.</p>
        <button class="btn btn-primary" onclick="switchTab('tab-builder'); resetSurveyForm();">+ Yeni Anket Oluştur</button>
      </div>
    `;
    return;
  }

  container.innerHTML = surveys.map(s => {
    const publicUrl = getSurveyPublicUrl(s.id);
    const questionCount = (s.questions || []).length;

    return `
      <div class="survey-card">
        <!-- Top Metadata Header -->
        <div class="survey-card-top-meta">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="survey-badge-id">#${s.id}</span>
            <span class="badge ${s.active ? 'badge-success' : 'badge-gray'}">
              ${s.active ? '● Aktif' : '○ Kapalı'}
            </span>
            <span class="badge badge-gray">
              📝 ${questionCount} Soru
            </span>
          </div>
          <button class="survey-link-pill" title="Katılımcı linkini kopyala" onclick="copyDirectLink('${publicUrl}')">
            <span>🔗</span>
            <span>survey.html?id=${s.id}</span>
          </button>
        </div>

        <!-- Title & Description -->
        <div>
          <h3 class="survey-card-title">${escapeHtml(s.title)}</h3>
          <p class="survey-card-desc">${escapeHtml(s.description || 'Açıklama belirtilmemiş.')}</p>
        </div>

        <!-- 3-Column Key Stats Box -->
        <div class="survey-card-stats-row">
          <div class="card-stat-box">
            <span class="card-stat-num">${s.responseCount || 0}</span>
            <span class="card-stat-label">Toplam Yanıt</span>
          </div>
          <div class="card-stat-box">
            <span class="card-stat-num">${questionCount}</span>
            <span class="card-stat-label">Soru Sayısı</span>
          </div>
          <div class="card-stat-box">
            <span class="card-stat-num" style="color: ${s.active ? 'var(--accent-emerald)' : 'var(--text-muted)'}; font-size: 15px;">${s.active ? 'Aktif' : 'Pasif'}</span>
            <span class="card-stat-label">Durum</span>
          </div>
        </div>

        <!-- Primary Action Grid (4 visible, distinct, readable buttons) -->
        <div class="survey-actions-grid">
          <button class="btn-action-analytics" onclick="viewAnalytics('${s.id}')" title="Bu anketin canlı sonuçlarını ve grafiklerini incele">
            <span class="action-icon">📈</span>
            <span class="action-text">Sonuçlar & Analiz</span>
          </button>
          
          <button class="btn-action-builder" onclick="editSurvey('${s.id}')" title="Soruları ve seçenekleri düzenle">
            <span class="action-icon">✏️</span>
            <span class="action-text">Tasarla & Düzenle</span>
          </button>
          
          <button class="btn-action-share" onclick="openSurveyShare('${s.id}')" title="Katılım linkini ve ağ paylaşımını görüntüle">
            <span class="action-icon">🚀</span>
            <span class="action-text">Paylaşım & Link</span>
          </button>
          
          <button class="btn-action-simulate" onclick="openSimulatorModal('${s.id}')" title="Test amaçlı rastgele katılımcı yanıtları üret">
            <span class="action-icon">⚡</span>
            <span class="action-text">Yanıt Simüle Et</span>
          </button>
        </div>

        <!-- Bottom Secondary Toolbar -->
        <div class="survey-card-bottom-bar">
          <a href="/s/${s.id}" target="_blank" class="btn-outline-preview" title="Formu katılımcı gözüyle yeni sekmede aç">
            <span>↗️ Formu Önizle</span>
          </a>
          
          <div class="bottom-action-group">
            <button class="btn-icon-label" title="Bu anketin kopyasını oluştur" onclick="duplicateSurvey('${s.id}')">
              <span>📑 Çoğalt</span>
            </button>
            <button class="btn-danger-label" title="Anketi ve verilerini sil" onclick="confirmDeleteSurvey('${s.id}', '${escapeHtml(s.title)}')">
              <span>🗑️ Sil</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function populateAllDropdowns() {
  populateAnalyticsSurveySelect();
  populateShareSurveySelect();
  populateSimSurveySelect();
}

// ================= 2. ANALYTICS & CHARTS =================

function populateAnalyticsSurveySelect() {
  const select = document.getElementById('analyticsSurveySelect');
  if (!select) return;

  select.innerHTML = allSurveys.map(s => `
    <option value="${s.id}" ${s.id === selectedAnalyticsSurveyId ? 'selected' : ''}>
      [#${s.id}] ${escapeHtml(s.title)} (${s.responseCount || 0} Yanıt)
    </option>
  `).join('');

  if (!selectedAnalyticsSurveyId && allSurveys.length > 0) {
    selectedAnalyticsSurveyId = allSurveys[0].id;
  }
}

function viewAnalytics(surveyId) {
  selectedAnalyticsSurveyId = surveyId;
  switchTab('tab-analytics');
}

let currentAnalyticsViewMode = 'oran'; // 'oran' or 'grafik'
let currentAnalyticsData = null;

const PIE_COLORS = [
  '#4f46e5', // Indigo
  '#06b6d4', // Cyan
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#3b82f6', // Blue
  '#e11d48'  // Rose
];

function shadeColor(color, percent) {
  let num = parseInt(color.replace('#', ''), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      B = ((num >> 8) & 0x00FF) + amt,
      G = (num & 0x0000FF) + amt;
  return '#' + (0x1000000 + (R<255?R<1?0:R:255)*0x10000 + (B<255?B<1?0:B:255)*0x100 + (G<255?G<1?0:G:255)).toString(16).slice(1);
}

function setAnalyticsViewMode(mode) {
  currentAnalyticsViewMode = mode;
  const btnOran = document.getElementById('btnModeOran');
  const btnGrafik = document.getElementById('btnModeGrafik');
  if (btnOran) btnOran.classList.toggle('active', mode === 'oran');
  if (btnGrafik) btnGrafik.classList.toggle('active', mode === 'grafik');

  if (currentAnalyticsData) {
    renderAnalyticsCharts(currentAnalyticsData);
  }
}

function highlightPieSlice(chartId, sliceIdx, label, count, pct) {
  const svg = document.getElementById(chartId);
  const tooltip = document.getElementById(`tooltip_${chartId}`);
  if (svg) {
    const sliceGroups = svg.querySelectorAll('.pie-slice-group');
    sliceGroups.forEach(g => {
      if (g.getAttribute('data-slice-idx') === String(sliceIdx)) {
        g.classList.add('highlighted');
      } else {
        g.classList.remove('highlighted');
      }
    });
  }

  const card = document.getElementById(`chartCard_${chartId}`);
  if (card) {
    const legendItems = card.querySelectorAll('.pie-legend-item');
    legendItems.forEach(it => {
      if (it.getAttribute('data-slice-idx') === String(sliceIdx)) {
        it.classList.add('highlighted');
      } else {
        it.classList.remove('highlighted');
      }
    });
  }

  if (tooltip) {
    tooltip.textContent = `${label}: ${count} Yanıt (%${pct})`;
    tooltip.style.display = 'block';
  }
}

function unhighlightPieSlice(chartId) {
  const svg = document.getElementById(chartId);
  const tooltip = document.getElementById(`tooltip_${chartId}`);
  if (svg) {
    const sliceGroups = svg.querySelectorAll('.pie-slice-group');
    sliceGroups.forEach(g => g.classList.remove('highlighted'));
  }
  const card = document.getElementById(`chartCard_${chartId}`);
  if (card) {
    const legendItems = card.querySelectorAll('.pie-legend-item');
    legendItems.forEach(it => it.classList.remove('highlighted'));
  }
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}

function render3DPieChartSVG(items, chartId) {
  const total = items.reduce((acc, it) => acc + (it.count || 0), 0);
  if (total <= 0) {
    return `<div style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 30px;">Henüz bu soru için yanıt kaydedilmedi.</div>`;
  }

  const cx = 170;
  const cy = 90;
  const rx = 120;
  const ry = 65;
  const depth = 22;

  const nonZero = items.filter(it => it.count > 0);
  if (nonZero.length === 1) {
    const item = nonZero[0];
    const darkColor = shadeColor(item.color, -25);
    return `
      <div class="pie-3d-wrapper">
        <svg class="pie-3d-svg" viewBox="0 0 340 210" id="${chartId}">
          <ellipse cx="${cx}" cy="${cy + depth + 6}" rx="${rx + 4}" ry="${ry + 3}" fill="rgba(0,0,0,0.06)" />
          <path d="M ${cx - rx} ${cy} A ${rx} ${ry} 0 0 0 ${cx + rx} ${cy} L ${cx + rx} ${cy + depth} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy + depth} Z" fill="${darkColor}" />
          <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${item.color}" stroke="#ffffff" stroke-width="1.5" />
          <text x="${cx}" y="${cy + 5}" text-anchor="middle" font-weight="700" font-size="16" fill="#ffffff" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.5))">100%</text>
        </svg>
        <div class="pie-tooltip" id="tooltip_${chartId}" style="display: none;"></div>
      </div>
    `;
  }

  let currentAngle = -Math.PI / 2;
  const slices = items.map((it, idx) => {
    const sliceAngle = (it.count / total) * (Math.PI * 2);
    const startAngle = currentAngle;
    const endAngle = currentAngle + sliceAngle;
    currentAngle = endAngle;
    return {
      ...it,
      index: idx,
      startAngle,
      endAngle,
      midAngle: (startAngle + endAngle) / 2,
      pct: Math.round((it.count / total) * 100)
    };
  }).filter(s => s.count > 0);

  // 1. Soft Shadow
  const shadowSvg = `<ellipse cx="${cx}" cy="${cy + depth + 8}" rx="${rx + 6}" ry="${ry + 4}" fill="rgba(0,0,0,0.07)" />`;

  // 2. 3D Side Walls
  let sideWallsSvg = '';
  slices.forEach(s => {
    const darkColor = shadeColor(s.color, -26);
    const numSteps = Math.max(8, Math.ceil((s.endAngle - s.startAngle) * 16));
    const stepSize = (s.endAngle - s.startAngle) / numSteps;

    let wallSegments = [];
    for (let i = 0; i < numSteps; i++) {
      const a1 = s.startAngle + i * stepSize;
      const a2 = s.startAngle + (i + 1) * stepSize;
      const mid = (a1 + a2) / 2;
      const normMid = ((mid % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      if (normMid > 0.001 && normMid < Math.PI - 0.001) {
        const x1 = cx + rx * Math.cos(a1);
        const y1 = cy + ry * Math.sin(a1);
        const x2 = cx + rx * Math.cos(a2);
        const y2 = cy + ry * Math.sin(a2);
        wallSegments.push(`M ${x1} ${y1} L ${x2} ${y2} L ${x2} ${y2 + depth} L ${x1} ${y1 + depth} Z`);
      }
    }

    if (wallSegments.length > 0) {
      sideWallsSvg += `<path d="${wallSegments.join(' ')}" fill="${darkColor}" class="pie-3d-wall" data-slice-idx="${s.index}" />`;
    }
  });

  // 3. Top Slices
  let topSlicesSvg = '';
  slices.forEach(s => {
    const x1 = cx + rx * Math.cos(s.startAngle);
    const y1 = cy + ry * Math.sin(s.startAngle);
    const x2 = cx + rx * Math.cos(s.endAngle);
    const y2 = cy + ry * Math.sin(s.endAngle);
    const largeArcFlag = (s.endAngle - s.startAngle) > Math.PI ? 1 : 0;

    const pathD = `M ${cx} ${cy} L ${x1} ${y1} A ${rx} ${ry} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;

    const labelR_x = rx * 0.65;
    const labelR_y = ry * 0.65;
    const lx = cx + labelR_x * Math.cos(s.midAngle);
    const ly = cy + labelR_y * Math.sin(s.midAngle);

    const labelHtml = s.pct >= 6 ? `
      <text x="${lx.toFixed(1)}" y="${(ly + 4).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.6))" pointer-events="none">
        ${s.pct}%
      </text>
    ` : '';

    topSlicesSvg += `
      <g class="pie-slice-group" data-slice-idx="${s.index}"
         onmouseenter="highlightPieSlice('${chartId}', ${s.index}, '${escapeAttr(s.label)}', ${s.count}, ${s.pct})"
         onmouseleave="unhighlightPieSlice('${chartId}')">
        <path d="${pathD}" fill="${s.color}" stroke="#ffffff" stroke-width="1.5" class="pie-3d-top" />
        ${labelHtml}
      </g>
    `;
  });

  return `
    <div class="pie-3d-wrapper">
      <svg class="pie-3d-svg" viewBox="0 0 340 210" id="${chartId}">
        ${shadowSvg}
        ${sideWallsSvg}
        ${topSlicesSvg}
      </svg>
      <div class="pie-tooltip" id="tooltip_${chartId}" style="display: none;"></div>
    </div>
  `;
}

async function loadAnalyticsForSelectedSurvey() {
  const select = document.getElementById('analyticsSurveySelect');
  if (select && select.value) {
    selectedAnalyticsSurveyId = select.value;
  }

  if (!selectedAnalyticsSurveyId && allSurveys.length > 0) {
    selectedAnalyticsSurveyId = allSurveys[0].id;
  }

  if (!selectedAnalyticsSurveyId) return;

  try {
    let data = null;
    if (window.FirebaseService) {
      const survey = await window.FirebaseService.getSurveyById(selectedAnalyticsSurveyId);
      const responses = await window.FirebaseService.getSurveyResponses(selectedAnalyticsSurveyId);
      const analytics = window.FirebaseService.calculateAnalytics(survey || {}, responses);
      data = {
        survey: survey || {},
        totalCount: responses.length,
        responses,
        analytics
      };
    } else {
      const res = await fetch(`/api/surveys/${selectedAnalyticsSurveyId}/responses`);
      if (!res.ok) throw new Error('Sonuçlar alınamadı');
      data = await res.json();
    }
    currentAnalyticsData = data;
    renderAnalyticsData(data);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderAnalyticsData(data) {
  currentAnalyticsData = data;
  const { totalCount, survey, responses, analytics } = data;

  // Overview stats
  const statTotalEl = document.getElementById('statTotalResponses');
  if (statTotalEl) statTotalEl.textContent = totalCount;
  
  const statQuestionsEl = document.getElementById('statTotalQuestions');
  if (statQuestionsEl && survey) {
    statQuestionsEl.textContent = (survey.questions || []).length;
  }

  // Calculate overall rating average if any rating questions exist
  let overallRatingAvg = '-';
  const ratingKeys = Object.keys(analytics).filter(k => analytics[k].type === 'rating' && analytics[k].totalAnswered > 0);
  if (ratingKeys.length > 0) {
    const sum = ratingKeys.reduce((acc, k) => acc + parseFloat(analytics[k].averageRating || 0), 0);
    overallRatingAvg = (sum / ratingKeys.length).toFixed(1) + ' ★';
  }
  document.getElementById('statAvgRating').textContent = overallRatingAvg;

  // Render Charts based on active view mode
  renderAnalyticsCharts(data);

  // Render Table
  renderResponsesTable(responses);
}

function renderAnalyticsCharts(data) {
  const { survey, totalCount, analytics } = data;
  const chartsContainer = document.getElementById('analyticsChartsContainer');
  if (!chartsContainer) return;
  chartsContainer.innerHTML = '';

  const questions = survey.questions || [];

  if (totalCount === 0) {
    chartsContainer.innerHTML = `
      <div style="text-align: center; padding: 48px 20px; background: #ffffff; border-radius: var(--radius-lg); border: 1px dashed var(--border-color); box-shadow: var(--shadow-sm);">
        <div style="font-size: 36px; margin-bottom: 12px;">📊</div>
        <h3 style="font-size: 17px; color: var(--text-main); font-weight: 700; margin-bottom: 6px;">Henüz Kayıtlı Yanıt Yok</h3>
        <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
          Ankete henüz katılımcı gelmedi. Üstteki "⚡ Simülasyon" butonunu kullanarak test yanıtları üretebilirsiniz.
        </p>
        <button class="btn btn-simulator btn-sm" onclick="openSimulatorModal('${survey.id}')">
          ⚡ 50 Adet Test Yanıtı Doldur
        </button>
      </div>
    `;
    return;
  }

  questions.forEach((q, idx) => {
    const qAnalytics = analytics[q.id];
    if (!qAnalytics) return;

    const chartCard = document.createElement('div');
    chartCard.className = 'chart-card';
    const chartId = `chart_q_${idx}_${safeId(q.id)}`;
    chartCard.id = `chartCard_${chartId}`;

    let innerHtml = `
      <div class="chart-header">
        <div>
          <span class="badge badge-primary" style="margin-right: 8px;">Soru ${idx + 1}</span>
          <span class="chart-title">${escapeHtml(q.title)}</span>
        </div>
        <span class="badge badge-gray">${qAnalytics.totalAnswered} / ${totalCount} Yanıtlandı</span>
      </div>
    `;

    if (['single', 'multiple', 'select'].includes(q.type) || !q.type) {
      const dist = qAnalytics.distribution || {};
      const options = q.options || Object.keys(dist);

      if (currentAnalyticsViewMode === 'grafik') {
        // 3D PIE CHART MODE
        const items = options.map((opt, oIdx) => {
          const count = dist[opt] || 0;
          const pct = qAnalytics.totalAnswered > 0 ? Math.round((count / qAnalytics.totalAnswered) * 100) : 0;
          const color = PIE_COLORS[oIdx % PIE_COLORS.length];
          return { label: opt, count, pct, color };
        });

        const svgHtml = render3DPieChartSVG(items, chartId);
        const legendHtml = `
          <div class="pie-legend-wrapper">
            <div class="pie-legend-header">
              <span class="pie-legend-title">Seçenek Dağılımı</span>
              <span class="pie-legend-total">${qAnalytics.totalAnswered} Yanıt</span>
            </div>
            <div class="pie-legend-list">
              ${items.map((it, sIdx) => `
                <div class="pie-legend-item" data-slice-idx="${sIdx}"
                     onmouseenter="highlightPieSlice('${chartId}', ${sIdx}, '${escapeAttr(it.label)}', ${it.count}, ${it.pct})"
                     onmouseleave="unhighlightPieSlice('${chartId}')">
                  <div class="pie-legend-left">
                    <span class="pie-legend-color" style="background: ${it.color};"></span>
                    <span class="pie-legend-label" title="${escapeHtml(it.label)}">${escapeHtml(it.label)}</span>
                  </div>
                  <div class="pie-legend-right">
                    <span class="pie-legend-count">${it.count}</span>
                    <span class="pie-legend-badge" style="background: ${it.color}15; color: ${it.color}; border: 1px solid ${it.color}35;">
                      %${it.pct}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        innerHtml += `
          <div class="pie-3d-grid">
            ${svgHtml}
            ${legendHtml}
          </div>
        `;
      } else {
        // ORAN (BARS) MODE
        innerHtml += `<div class="chart-bars-list">`;
        options.forEach(opt => {
          const count = dist[opt] || 0;
          const pct = qAnalytics.totalAnswered > 0 ? Math.round((count / qAnalytics.totalAnswered) * 100) : 0;

          innerHtml += `
            <div class="chart-bar-item">
              <div class="chart-bar-info">
                <span class="chart-bar-label">${escapeHtml(opt)}</span>
                <span class="chart-bar-count">${count} (%${pct})</span>
              </div>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width: ${pct}%;"></div>
              </div>
            </div>
          `;
        });
        innerHtml += `</div>`;
      }
    } else if (q.type === 'rating') {
      const max = q.maxRating || 5;
      const avg = qAnalytics.averageRating || '0.00';
      const dist = qAnalytics.distribution || {};

      if (currentAnalyticsViewMode === 'grafik') {
        // 3D PIE CHART FOR RATINGS
        const items = [];
        for (let star = max; star >= 1; star--) {
          const count = dist[star] || 0;
          const pct = qAnalytics.totalAnswered > 0 ? Math.round((count / qAnalytics.totalAnswered) * 100) : 0;
          const color = PIE_COLORS[(max - star) % PIE_COLORS.length];
          items.push({ label: `${star} Yıldız ★`, count, pct, color });
        }

        const svgHtml = render3DPieChartSVG(items, chartId);
        const legendHtml = `
          <div class="pie-legend-wrapper">
            <div class="pie-legend-header">
              <div style="display: flex; align-items: baseline; gap: 8px;">
                <span style="font-size: 20px; font-weight: 800; color: #fbbf24;">${avg} ★</span>
                <span style="font-size: 11px; color: var(--text-muted);">Ortalama Puan</span>
              </div>
              <span class="pie-legend-total">${qAnalytics.totalAnswered} Yanıt</span>
            </div>
            <div class="pie-legend-list">
              ${items.map((it, sIdx) => `
                <div class="pie-legend-item" data-slice-idx="${sIdx}"
                     onmouseenter="highlightPieSlice('${chartId}', ${sIdx}, '${escapeAttr(it.label)}', ${it.count}, ${it.pct})"
                     onmouseleave="unhighlightPieSlice('${chartId}')">
                  <div class="pie-legend-left">
                    <span class="pie-legend-color" style="background: ${it.color};"></span>
                    <span class="pie-legend-label">${escapeHtml(it.label)}</span>
                  </div>
                  <div class="pie-legend-right">
                    <span class="pie-legend-count">${it.count}</span>
                    <span class="pie-legend-badge" style="background: ${it.color}15; color: ${it.color}; border: 1px solid ${it.color}35;">
                      %${it.pct}
                    </span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;

        innerHtml += `
          <div class="pie-3d-grid">
            ${svgHtml}
            ${legendHtml}
          </div>
        `;
      } else {
        // ORAN (BARS) FOR RATINGS
        innerHtml += `
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 20px;">
            <div style="font-size: 42px; font-weight: 800; color: #fbbf24; line-height: 1;">${avg}</div>
            <div>
              <div class="rating-stars" style="font-size: 20px;">${'★'.repeat(Math.round(parseFloat(avg)))}${'☆'.repeat(Math.max(0, max - Math.round(parseFloat(avg))))}</div>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">5 üzerinden ortalama puan</p>
            </div>
          </div>
          <div class="chart-bars-list">
        `;

        for (let star = max; star >= 1; star--) {
          const count = dist[star] || 0;
          const pct = qAnalytics.totalAnswered > 0 ? Math.round((count / qAnalytics.totalAnswered) * 100) : 0;
          innerHtml += `
            <div class="chart-bar-item">
              <div class="chart-bar-info">
                <span class="chart-bar-label">${star} Yıldız ★</span>
                <span class="chart-bar-count">${count} (%${pct})</span>
              </div>
              <div class="chart-bar-track">
                <div class="chart-bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, #f59e0b, #fbbf24);"></div>
              </div>
            </div>
          `;
        }
        innerHtml += `</div>`;
      }
    } else if (q.type === 'text') {
      const texts = qAnalytics.textAnswers || [];
      innerHtml += `
        <div style="max-height: 240px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px;">
          ${texts.length === 0 ? '<p style="color: var(--text-dim); font-size: 13px;">Henüz yazılı yanıt girilmemiş.</p>' : 
            texts.slice(0, 30).map(item => `
              <div style="background: #f8fafc; padding: 12px 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 13px;">
                <p style="color: var(--text-main); font-weight: 500; margin-bottom: 6px;">"${escapeHtml(item.text)}"</p>
                <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-dim);">
                  <span>${new Date(item.date).toLocaleDateString('tr-TR')} ${new Date(item.date).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                  <span class="badge badge-gray" style="font-size: 10px; padding: 2px 6px;">Kayıtlı</span>
                </div>
              </div>
            `).join('')
          }
        </div>
      `;
    }

    chartCard.innerHTML = innerHtml;
    chartsContainer.appendChild(chartCard);
  });
}

function renderResponsesTable(responses) {
  const tableBody = document.getElementById('responsesTableBody');
  const countBadge = document.getElementById('responsesCountBadge');
  if (!tableBody) return;

  countBadge.textContent = `${responses.length} kayıt`;

  if (responses.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-dim); padding: 24px;">Henüz yanıt bulunmuyor.</td></tr>`;
    return;
  }

  tableBody.innerHTML = responses.slice(0, 50).map((r, idx) => `
    <tr>
      <td style="font-family: monospace; color: var(--text-dim);">${responses.length - idx}</td>
      <td style="font-size: 12px; white-space: nowrap;">${new Date(r.submittedAt).toLocaleDateString('tr-TR')} ${new Date(r.submittedAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td style="font-family: monospace; font-size: 11px; color: var(--text-muted);">${escapeHtml(r.ip || '-')}</td>
      <td style="text-align: center;">
        <span class="badge badge-success" style="font-size: 11px; padding: 3px 8px;">✓ Kaydedildi</span>
      </td>
    </tr>
  `).join('');
}

// Exports
function exportCSV() {
  if (!currentAnalyticsData || !currentAnalyticsData.survey) {
    showToast('Dışa aktarılacak veri bulunamadı', 'error');
    return;
  }
  if (window.FirebaseService) {
    window.FirebaseService.exportCSV(currentAnalyticsData.survey, currentAnalyticsData.responses || []);
  } else {
    window.open(`/api/surveys/${selectedAnalyticsSurveyId}/export/csv`, '_blank');
  }
}

function exportJSON() {
  if (!currentAnalyticsData || !currentAnalyticsData.survey) {
    showToast('Dışa aktarılacak veri bulunamadı', 'error');
    return;
  }
  if (window.FirebaseService) {
    window.FirebaseService.exportJSON(currentAnalyticsData.survey, currentAnalyticsData.responses || []);
  } else {
    window.open(`/api/surveys/${selectedAnalyticsSurveyId}/export/json`, '_blank');
  }
}

// ================= 3. SURVEY BUILDER =================

let builderQuestions = [];

function resetSurveyForm() {
  document.getElementById('editingSurveyId').value = '';
  document.getElementById('surveyInputTitle').value = '';
  document.getElementById('surveyInputDesc').value = '';
  document.getElementById('surveyInputActive').value = 'true';
  document.getElementById('builderFormTitle').textContent = 'Yeni Anket Oluştur';

  builderQuestions = [
    {
      id: 'q_1',
      title: 'Hizmetimiz hakkında ne düşünüyorsunuz?',
      type: 'single',
      options: ['Harika', 'İyi', 'Orta', 'Geliştirilmeli'],
      required: true
    }
  ];

  renderBuilderQuestions();
}

function editSurvey(surveyId) {
  const survey = allSurveys.find(s => String(s.id) === String(surveyId));
  if (!survey) return;

  document.getElementById('editingSurveyId').value = survey.id;
  document.getElementById('surveyInputTitle').value = survey.title;
  document.getElementById('surveyInputDesc').value = survey.description || '';
  document.getElementById('surveyInputActive').value = survey.active !== false ? 'true' : 'false';
  document.getElementById('builderFormTitle').textContent = `#${survey.id} Nolu Anketi Düzenle`;

  builderQuestions = JSON.parse(JSON.stringify(survey.questions || []));
  renderBuilderQuestions();
  switchTab('tab-builder');
}

function renderBuilderQuestions() {
  const container = document.getElementById('builderQuestionsList');
  container.innerHTML = '';

  builderQuestions.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'question-item';
    card.id = `builder_q_${idx}`;

    let optionsMarkup = '';
    if (['single', 'multiple', 'select'].includes(q.type)) {
      optionsMarkup = `
        <div style="margin-top: 14px;">
          <label style="font-size: 13px; font-weight: 600; color: var(--text-muted); display: block; margin-bottom: 8px;">Seçenekler:</label>
          <div id="options_container_${idx}">
            ${(q.options || []).map((opt, optIdx) => `
              <div class="option-pill-input">
                <input type="text" class="form-input" style="padding: 8px 12px; font-size: 13px;" value="${escapeHtml(opt)}" oninput="updateBuilderOption(${idx}, ${optIdx}, this.value)">
                <button type="button" class="btn btn-icon btn-sm" style="color: #f43f5e;" onclick="removeBuilderOption(${idx}, ${optIdx})">✕</button>
              </div>
            `).join('')}
          </div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 6px;" onclick="addBuilderOption(${idx})">+ Seçenek Ekle</button>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="question-item-top">
        <span class="question-number-badge">Soru #${idx + 1}</span>
        <div style="display: flex; gap: 8px; align-items: center;">
          <label style="font-size: 13px; display: flex; align-items: center; gap: 6px; cursor: pointer;">
            <input type="checkbox" ${q.required ? 'checked' : ''} onchange="updateBuilderQuestionRequired(${idx}, this.checked)">
            <span>Zorunlu</span>
          </label>
          <button type="button" class="btn btn-icon btn-sm" style="color: #f43f5e;" onclick="removeBuilderQuestion(${idx})" title="Soruyu Sil">
            🗑️
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px; margin-bottom: 12px;">
        <div>
          <label class="form-label" style="font-size: 12px;">Soru Metni</label>
          <input type="text" class="form-input" value="${escapeHtml(q.title)}" oninput="updateBuilderQuestionTitle(${idx}, this.value)" placeholder="Sorunuzu yazın...">
        </div>
        <div>
          <label class="form-label" style="font-size: 12px;">Soru Tipi</label>
          <select class="form-select" onchange="updateBuilderQuestionType(${idx}, this.value)">
            <option value="single" ${q.type === 'single' ? 'selected' : ''}>Tekli Seçim (Radyo)</option>
            <option value="multiple" ${q.type === 'multiple' ? 'selected' : ''}>Çoktan Seçmeli (Onay Kutusu)</option>
            <option value="rating" ${q.type === 'rating' ? 'selected' : ''}>Yıldız Puanlama (1-5)</option>
            <option value="text" ${q.type === 'text' ? 'selected' : ''}>Yazılı Görüş (Metin)</option>
            <option value="select" ${q.type === 'select' ? 'selected' : ''}>Açılır Liste (Dropdown)</option>
          </select>
        </div>
      </div>

      ${optionsMarkup}
    `;

    container.appendChild(card);
  });
}

function addQuestionCard() {
  builderQuestions.push({
    id: `q_${Date.now()}`,
    title: `Soru ${builderQuestions.length + 1}`,
    type: 'single',
    options: ['Seçenek 1', 'Seçenek 2', 'Seçenek 3'],
    required: false
  });
  renderBuilderQuestions();
}

function removeBuilderQuestion(idx) {
  builderQuestions.splice(idx, 1);
  renderBuilderQuestions();
}

function updateBuilderQuestionTitle(idx, val) {
  if (builderQuestions[idx]) builderQuestions[idx].title = val;
}

function updateBuilderQuestionType(idx, val) {
  if (builderQuestions[idx]) {
    builderQuestions[idx].type = val;
    if (['single', 'multiple', 'select'].includes(val) && (!builderQuestions[idx].options || builderQuestions[idx].options.length === 0)) {
      builderQuestions[idx].options = ['Seçenek 1', 'Seçenek 2'];
    }
    renderBuilderQuestions();
  }
}

function updateBuilderQuestionRequired(idx, val) {
  if (builderQuestions[idx]) builderQuestions[idx].required = val;
}

function addBuilderOption(qIdx) {
  if (builderQuestions[qIdx]) {
    if (!builderQuestions[qIdx].options) builderQuestions[qIdx].options = [];
    builderQuestions[qIdx].options.push(`Seçenek ${builderQuestions[qIdx].options.length + 1}`);
    renderBuilderQuestions();
  }
}

function updateBuilderOption(qIdx, optIdx, val) {
  if (builderQuestions[qIdx] && builderQuestions[qIdx].options[optIdx] !== undefined) {
    builderQuestions[qIdx].options[optIdx] = val;
  }
}

function removeBuilderOption(qIdx, optIdx) {
  if (builderQuestions[qIdx] && builderQuestions[qIdx].options) {
    builderQuestions[qIdx].options.splice(optIdx, 1);
    renderBuilderQuestions();
  }
}

async function saveSurveyForm() {
  const title = document.getElementById('surveyInputTitle').value.trim();
  const description = document.getElementById('surveyInputDesc').value.trim();
  const active = document.getElementById('surveyInputActive').value === 'true';
  const editingId = document.getElementById('editingSurveyId').value;

  if (!title) {
    showToast('Lütfen anket başlığını giriniz', 'error');
    return;
  }

  if (builderQuestions.length === 0) {
    showToast('En az bir soru eklemelisiniz', 'error');
    return;
  }

  const payload = {
    title,
    description,
    themeColor: '#4f46e5', // Fixed standard brand theme
    active,
    questions: builderQuestions
  };

  try {
    let saved;
    if (window.FirebaseService) {
      saved = await window.FirebaseService.saveSurvey({
        id: editingId || String(Date.now()),
        ...payload
      });
    } else {
      let res;
      if (editingId) {
        res = await fetch(`/api/surveys/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/surveys', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) throw new Error('Anket kaydedilemedi');
      saved = await res.json();
    }

    showToast(`"${saved.title}" başarıyla kaydedildi!`, 'success');
    await loadSurveysList();
    switchTab('tab-surveys');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function duplicateSurvey(surveyId) {
  try {
    if (window.FirebaseService) {
      await window.FirebaseService.duplicateSurvey(surveyId);
    } else {
      const res = await fetch(`/api/surveys/${surveyId}/duplicate`, { method: 'POST' });
      if (!res.ok) throw new Error('Kopyalama başarısız');
    }
    showToast('Anket kopyası oluşturuldu', 'success');
    await loadSurveysList();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function confirmDeleteSurvey(surveyId, title) {
  openConfirmModal(
    'Anketi Sil',
    `"${title}" anketi ve toplanmış olan tüm yanıtları tamamen silinecektir. Onaylıyor musunuz?`,
    async () => {
      try {
        if (window.FirebaseService) {
          await window.FirebaseService.deleteSurvey(surveyId);
        } else {
          const res = await fetch(`/api/surveys/${surveyId}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('Silme işlemi başarısız');
        }
        showToast('Anket silindi', 'info');
        closeConfirmModal();
        await loadSurveysList();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
}

// ================= 4. SIMULATOR (USER'S DESIRED CORE ENGINE) =================

// Simulator Constraints State
// Each entry: { id: string, questionId: string, excludedOptions: string[] }
let simulatorConstraints = [];

function populateSimSurveySelect() {
  const select = document.getElementById('simTargetSurveySelect');
  if (!select) return;

  select.innerHTML = allSurveys.map(s => `
    <option value="${s.id}">
      #${s.id} - ${escapeHtml(s.title)} (${s.responseCount || 0} mevcut yanıt)
    </option>
  `).join('');
}

function openSimulatorModal(preselectedSurveyId) {
  populateSimSurveySelect();
  if (preselectedSurveyId) {
    const select = document.getElementById('simTargetSurveySelect');
    if (select) select.value = preselectedSurveyId;
  }

  // Reset or initialize constraints for modal
  simulatorConstraints = [];
  renderSimulatorConstraints();

  document.getElementById('simProgressBox').style.display = 'none';
  document.getElementById('simStopBtn').style.display = 'none';
  document.getElementById('simStartBtn').style.display = 'inline-flex';
  document.getElementById('simulatorModal').classList.add('open');
}

function closeSimulatorModal() {
  if (isSimulating) {
    stopLiveSimulation();
  }
  document.getElementById('simulatorModal').classList.remove('open');
}

function onSimTargetSurveyChanged() {
  // Reset constraints when switching surveys
  simulatorConstraints = [];
  renderSimulatorConstraints();
}

function getSimQuestionTypeLabel(type) {
  switch (type) {
    case 'single': return 'Tekli Seçim';
    case 'multiple': return 'Çoklu Seçim';
    case 'select': return 'Açılır Menü';
    case 'rating': return 'Puan / Yıldız';
    case 'text': return 'Metin';
    default: return 'Tekli Seçim';
  }
}

function getSelectableOptionsForQuestion(q) {
  if (!q) return [];
  if (['single', 'select', 'multiple'].includes(q.type) || !q.type) {
    return q.options || [];
  } else if (q.type === 'rating') {
    const maxR = q.maxRating || 5;
    return Array.from({ length: maxR }, (_, i) => String(i + 1));
  }
  return [];
}

function safeId(str) {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, '_');
}

function addSimulatorConstraint(mode = 'weight') {
  const targetSelect = document.getElementById('simTargetSurveySelect');
  if (!targetSelect) return;
  const surveyId = targetSelect.value;
  const survey = allSurveys.find(s => String(s.id) === String(surveyId));

  if (!survey || !survey.questions || survey.questions.length === 0) {
    showToast('Bu ankette henüz soru maddesi bulunmuyor.', 'info');
    return;
  }

  // Select first question that is not yet added, or default to first question
  const usedQIds = simulatorConstraints.map(c => c.questionId);
  const nextQ = survey.questions.find(q => !usedQIds.includes(q.id)) || survey.questions[0];

  const defaultWeights = {};
  const opts = getSelectableOptionsForQuestion(nextQ);
  if (opts.length > 0) {
    const eqWeight = Math.round(100 / opts.length);
    opts.forEach(opt => {
      defaultWeights[String(opt)] = eqWeight;
    });
  }

  const newConstraint = {
    id: 'c_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    questionId: nextQ.id,
    mode: mode, // 'weight' or 'exclude'
    excludedOptions: [],
    weights: defaultWeights
  };

  simulatorConstraints.push(newConstraint);
  renderSimulatorConstraints();
}

function removeSimulatorConstraint(constraintId) {
  simulatorConstraints = simulatorConstraints.filter(c => c.id !== constraintId);
  renderSimulatorConstraints();
}

function setConstraintMode(constraintId, mode) {
  const constraint = simulatorConstraints.find(c => c.id === constraintId);
  if (constraint) {
    constraint.mode = mode;
    renderSimulatorConstraints();
  }
}

function onSimConstraintQuestionChange(constraintId, newQuestionId) {
  const constraint = simulatorConstraints.find(c => c.id === constraintId);
  if (constraint) {
    constraint.questionId = newQuestionId;
    constraint.excludedOptions = [];
    const surveyId = document.getElementById('simTargetSurveySelect')?.value;
    const survey = allSurveys.find(s => String(s.id) === String(surveyId));
    const nextQ = survey?.questions.find(q => q.id === newQuestionId);
    const opts = getSelectableOptionsForQuestion(nextQ);
    const newWeights = {};
    if (opts.length > 0) {
      const eqWeight = Math.round(100 / opts.length);
      opts.forEach(opt => {
        newWeights[String(opt)] = eqWeight;
      });
    }
    constraint.weights = newWeights;
    renderSimulatorConstraints();
  }
}

function toggleSimConstraintOption(constraintId, optionVal) {
  const constraint = simulatorConstraints.find(c => c.id === constraintId);
  if (!constraint) return;

  const strVal = String(optionVal);
  const idx = constraint.excludedOptions.indexOf(strVal);
  if (idx >= 0) {
    // Un-exclude
    constraint.excludedOptions.splice(idx, 1);
    if (constraint.weights && constraint.weights[strVal] === 0) {
      constraint.weights[strVal] = 25;
    }
  } else {
    // Exclude
    constraint.excludedOptions.push(strVal);
    if (!constraint.weights) constraint.weights = {};
    constraint.weights[strVal] = 0;
  }
  renderSimulatorConstraints();
}

function onOptionWeightInput(constraintId, optionVal, newWeight) {
  const constraint = simulatorConstraints.find(c => c.id === constraintId);
  if (!constraint) return;

  const num = Math.max(0, Math.min(100, parseInt(newWeight, 10) || 0));
  if (!constraint.weights) constraint.weights = {};
  constraint.weights[String(optionVal)] = num;

  const strVal = String(optionVal);
  if (num === 0) {
    if (!constraint.excludedOptions.includes(strVal)) constraint.excludedOptions.push(strVal);
  } else {
    constraint.excludedOptions = constraint.excludedOptions.filter(x => x !== strVal);
  }

  const sId = safeId(strVal);
  const rowEl = document.getElementById(`weightRow_${constraint.id}_${sId}`);
  const valEl = document.getElementById(`weightVal_${constraint.id}_${sId}`);
  if (valEl) valEl.textContent = `%${num}`;
  if (rowEl) {
    if (num === 0) rowEl.classList.add('zero');
    else rowEl.classList.remove('zero');
  }

  updateConstraintDistBar(constraint);
}

function applyWeightPreset(constraintId, presetName) {
  const constraint = simulatorConstraints.find(c => c.id === constraintId);
  if (!constraint) return;
  const targetSelect = document.getElementById('simTargetSurveySelect');
  const survey = allSurveys.find(s => String(s.id) === String(targetSelect?.value));
  const q = survey?.questions.find(x => x.id === constraint.questionId);
  const opts = getSelectableOptionsForQuestion(q);
  if (opts.length === 0) return;

  constraint.weights = {};
  constraint.excludedOptions = [];

  if (presetName === 'equal') {
    const eq = Math.round(100 / opts.length);
    opts.forEach(opt => {
      constraint.weights[String(opt)] = eq;
    });
  } else if (presetName === 'positive') {
    const curves = {
      2: [80, 20],
      3: [65, 25, 10],
      4: [55, 30, 15, 0],
      5: [50, 30, 15, 5, 0]
    };
    const curve = curves[opts.length] || opts.map((_, i) => Math.max(0, Math.round(100 / (i + 1.5))));
    opts.forEach((opt, idx) => {
      const w = curve[idx] !== undefined ? curve[idx] : 10;
      constraint.weights[String(opt)] = w;
      if (w === 0) constraint.excludedOptions.push(String(opt));
    });
  } else if (presetName === 'negative') {
    const curves = {
      2: [20, 80],
      3: [10, 25, 65],
      4: [0, 15, 30, 55],
      5: [0, 5, 15, 30, 50]
    };
    const curve = curves[opts.length] || [...opts].reverse().map((_, i) => Math.max(0, Math.round(100 / (i + 1.5))));
    opts.forEach((opt, idx) => {
      const w = curve[idx] !== undefined ? curve[idx] : 10;
      constraint.weights[String(opt)] = w;
      if (w === 0) constraint.excludedOptions.push(String(opt));
    });
  } else if (presetName === 'clear') {
    opts.forEach(opt => {
      constraint.weights[String(opt)] = 0;
      constraint.excludedOptions.push(String(opt));
    });
  }

  renderSimulatorConstraints();
}

const DIST_PALETTE = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316'];

function updateConstraintDistBar(constraint) {
  const barEl = document.getElementById(`distBar_${constraint.id}`);
  const totalEl = document.getElementById(`distTotal_${constraint.id}`);
  if (!barEl) return;

  const weights = constraint.weights || {};
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + (Number(w) || 0), 0);

  if (totalEl) {
    totalEl.textContent = `Toplam Yük: %${total}`;
    if (total === 100) totalEl.style.color = '#15803d';
    else if (total === 0) totalEl.style.color = '#dc2626';
    else totalEl.style.color = 'var(--text-muted)';
  }

  if (total <= 0) {
    barEl.innerHTML = `<div class="sim-dist-bar-seg" style="width: 100%; background: #fee2e2;"></div>`;
    return;
  }

  barEl.innerHTML = entries.map(([opt, w], idx) => {
    const num = Number(w) || 0;
    if (num <= 0) return '';
    const pct = ((num / total) * 100).toFixed(1);
    const color = DIST_PALETTE[idx % DIST_PALETTE.length];
    return `
      <div class="sim-dist-bar-seg" style="width: ${pct}%; background: ${color};" title="${escapeHtml(opt)}: %${num} (Dağılım: ${pct}%)"></div>
    `;
  }).join('');
}

function renderSimulatorConstraints() {
  const listEl = document.getElementById('simConstraintsList');
  const countBadge = document.getElementById('simConstraintCountBadge');
  if (!listEl) return;

  const targetSelect = document.getElementById('simTargetSurveySelect');
  const surveyId = targetSelect ? targetSelect.value : null;
  const survey = allSurveys.find(s => String(s.id) === String(surveyId));

  if (countBadge) {
    if (simulatorConstraints.length > 0) {
      countBadge.style.display = 'inline-block';
      countBadge.textContent = `${simulatorConstraints.length} Kural`;
    } else {
      countBadge.style.display = 'none';
    }
  }

  if (!survey || !survey.questions || survey.questions.length === 0) {
    listEl.innerHTML = `
      <div class="sim-empty-constraints">
        Bu anket için soru bulunmuyor.
      </div>
    `;
    return;
  }

  if (simulatorConstraints.length === 0) {
    listEl.innerHTML = `
      <div class="sim-empty-constraints">
        Henüz bir soru kısıtı veya yük ayarı eklenmedi. Tüm seçenekler eşit oranda rastgele seçilir.<br>
        Belirli yanıtların daha çok çıkması için <b>⚖️ Yük / Yüzde Ayarı Ekle</b> butonuna tıklayın.
      </div>
    `;
    return;
  }

  listEl.innerHTML = simulatorConstraints.map((constraint, cIdx) => {
    const activeQ = survey.questions.find(q => q.id === constraint.questionId);
    const selectableOptions = getSelectableOptionsForQuestion(activeQ);
    const mode = constraint.mode || 'weight';

    // Question dropdown
    const questionSelectHtml = `
      <select class="form-select" onchange="onSimConstraintQuestionChange('${constraint.id}', this.value)">
        ${survey.questions.map((q, qIndex) => `
          <option value="${q.id}" ${q.id === constraint.questionId ? 'selected' : ''}>
            ${qIndex + 1}. ${escapeHtml(q.title || 'İsimsiz Soru')} (${getSimQuestionTypeLabel(q.type)})
          </option>
        `).join('')}
      </select>
    `;

    // Mode tabs switcher
    const modeSwitcherHtml = `
      <div class="sim-mode-switcher">
        <button type="button" class="sim-mode-tab ${mode === 'weight' ? 'active' : ''}" onclick="setConstraintMode('${constraint.id}', 'weight')">
          ⚖️ Yüzde / Yük Dağılımı (%)
        </button>
        <button type="button" class="sim-mode-tab ${mode === 'exclude' ? 'active' : ''}" onclick="setConstraintMode('${constraint.id}', 'exclude')">
          🚫 Hızlı Çiz (Engelle)
        </button>
      </div>
    `;

    let contentHtml = '';

    if (activeQ && selectableOptions.length > 0) {
      if (mode === 'weight') {
        // Weights & Percentage Sliders Mode
        if (!constraint.weights) constraint.weights = {};

        const totalW = selectableOptions.reduce((sum, opt) => sum + (constraint.weights[String(opt)] !== undefined ? Number(constraint.weights[String(opt)]) : 25), 0);

        const rowsHtml = selectableOptions.map((opt, oIdx) => {
          const optStr = String(opt);
          const currentVal = constraint.weights[optStr] !== undefined ? Number(constraint.weights[optStr]) : Math.round(100 / selectableOptions.length);
          constraint.weights[optStr] = currentVal;
          const displayLabel = activeQ.type === 'rating' ? `${optStr} ⭐ Puan` : optStr;
          const sId = safeId(optStr);
          const isZero = currentVal === 0;

          return `
            <div class="sim-weight-row ${isZero ? 'zero' : ''}" id="weightRow_${constraint.id}_${sId}">
              <div class="sim-weight-label" title="${escapeHtml(displayLabel)}">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${DIST_PALETTE[oIdx % DIST_PALETTE.length]}; margin-right: 6px;"></span>
                ${escapeHtml(displayLabel)}
              </div>
              <div class="sim-weight-slider-wrap">
                <input type="range" class="sim-weight-slider" min="0" max="100" step="5" value="${currentVal}"
                       oninput="onOptionWeightInput('${constraint.id}', '${escapeAttr(optStr)}', this.value)">
                <span class="sim-weight-val" id="weightVal_${constraint.id}_${sId}">%${currentVal}</span>
              </div>
            </div>
          `;
        }).join('');

        contentHtml = `
          <div class="sim-presets-bar">
            <span style="font-size: 11px; color: var(--text-muted); font-weight: 600;">Şablonlar:</span>
            <button type="button" class="btn-sim-preset" onclick="applyWeightPreset('${constraint.id}', 'equal')">⚡ Eşit Dağıt</button>
            <button type="button" class="btn-sim-preset" onclick="applyWeightPreset('${constraint.id}', 'positive')">🌟 Yüksek Memnuniyet</button>
            <button type="button" class="btn-sim-preset" onclick="applyWeightPreset('${constraint.id}', 'negative')">👎 Düşük Memnuniyet</button>
            <button type="button" class="btn-sim-preset" onclick="applyWeightPreset('${constraint.id}', 'clear')">✕ Sıfırla</button>
          </div>

          <div class="sim-weights-list">
            ${rowsHtml}
          </div>

          <div class="sim-dist-bar-wrap">
            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 600;">
              <span id="distTotal_${constraint.id}">Toplam Yük: %${totalW}</span>
              <span style="color: var(--text-muted);">Bot bu oranlara göre ağırlıklı seçim yapar</span>
            </div>
            <div class="sim-dist-bar" id="distBar_${constraint.id}">
              <!-- Rendered via JS update -->
            </div>
          </div>
        `;
      } else {
        // Quick Exclude (Strike-through) Mode
        const chipsHtml = selectableOptions.map(opt => {
          const optStr = String(opt);
          const isExcluded = constraint.excludedOptions.includes(optStr);
          const displayLabel = activeQ.type === 'rating' ? `${optStr} ⭐` : optStr;
          
          return `
            <div class="sim-chip ${isExcluded ? 'excluded' : 'allowed'}"
                 onclick="toggleSimConstraintOption('${constraint.id}', '${escapeAttr(optStr)}')"
                 title="${isExcluded ? 'Yasaklandı: Bot bu yanıtı seçmeyecektir. İzin vermek için tıklayın.' : 'İzinli: Yasaklamak için tıklayın (üzeri çizilir).'}">
              <span class="sim-chip-icon">${isExcluded ? '✕' : '✓'}</span>
              <span>${escapeHtml(displayLabel)}</span>
            </div>
          `;
        }).join('');

        const hintHtml = constraint.excludedOptions.length > 0
          ? `<div class="sim-constraint-hint" style="color: #b91c1c; font-weight: 500;">⛔ <b>${constraint.excludedOptions.length}</b> cevap engellendi (üzeri çizili). Kalanlar eşit rastgele seçilir.</div>`
          : `<div class="sim-constraint-hint">💡 Botun seçmesini istemediğiniz cevaba tıklayın (üzeri çizilir).</div>`;

        contentHtml = `
          <div class="sim-constraint-options">
            ${chipsHtml}
          </div>
          ${hintHtml}
        `;
      }
    } else {
      contentHtml = `<div style="font-size: 12px; color: var(--text-muted); font-style: italic; margin-top: 8px;">Açık uçlu metin sorusu (seçenek bulunmuyor).</div>`;
    }

    return `
      <div class="sim-constraint-card">
        <div class="sim-constraint-header">
          <span style="font-weight: 700; font-size: 13px; color: var(--accent-violet); white-space: nowrap;">#${cIdx + 1}</span>
          ${questionSelectHtml}
          <button type="button" class="btn-remove-constraint" onclick="removeSimulatorConstraint('${constraint.id}')" title="Bu ayarı kaldır">✕</button>
        </div>
        ${modeSwitcherHtml}
        ${contentHtml}
      </div>
    `;
  }).join('');

  // Update distribution bars for all active weight cards
  simulatorConstraints.forEach(c => {
    if (c.mode === 'weight') updateConstraintDistBar(c);
  });
}

function getActiveConstraintsMap() {
  const map = {};
  simulatorConstraints.forEach(c => {
    const list = [...(c.excludedOptions || [])];
    if (c.mode === 'weight' && c.weights) {
      Object.entries(c.weights).forEach(([opt, val]) => {
        if (Number(val) === 0 && !list.includes(opt)) {
          list.push(opt);
        }
      });
    }
    if (c.questionId && list.length > 0) {
      map[c.questionId] = list;
    }
  });
  return map;
}

function getActiveWeightsMap() {
  const map = {};
  simulatorConstraints.forEach(c => {
    if (c.questionId && c.weights && Object.keys(c.weights).length > 0) {
      map[c.questionId] = { ...c.weights };
      // Force 0 for excluded options
      if (c.excludedOptions && c.excludedOptions.length > 0) {
        c.excludedOptions.forEach(opt => {
          map[c.questionId][opt] = 0;
        });
      }
    }
  });
  return map;
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;');
}

function setSimCount(n) {
  document.getElementById('simCountInput').value = n;
}

function toggleSimSpeedOptions() {
  const mode = document.getElementById('simModeSelect').value;
  document.getElementById('simSpeedGroup').style.display = mode === 'stream' ? 'block' : 'none';
}

async function startSimulation() {
  const surveyId = document.getElementById('simTargetSurveySelect').value;
  const count = parseInt(document.getElementById('simCountInput').value, 10) || 50;
  const mode = document.getElementById('simModeSelect').value;
  const intervalMs = parseInt(document.getElementById('simSpeedSelect').value, 10) || 200;
  const constraints = getActiveConstraintsMap();
  const weights = getActiveWeightsMap();

  if (!surveyId) {
    showToast('Lütfen bir hedef anket seçiniz', 'error');
    return;
  }

  if (count <= 0) {
    showToast('Geçerli bir sayı giriniz', 'error');
    return;
  }

  const startBtn = document.getElementById('simStartBtn');
  const stopBtn = document.getElementById('simStopBtn');
  const progressBox = document.getElementById('simProgressBox');
  const progressBar = document.getElementById('simProgressBar');
  const progressCount = document.getElementById('simProgressCount');
  const statusLabel = document.getElementById('simStatusLabel');
  const logTicker = document.getElementById('simLogTicker');

  progressBox.style.display = 'block';

  // Mode 1: Batch (Instant)
  if (mode === 'batch') {
    startBtn.disabled = true;
    startBtn.textContent = 'Üretiliyor...';
    statusLabel.textContent = 'Toplu yanıtlar ağırlık ve kısıt kurallarına uygun olarak üretiliyor...';
    progressBar.style.width = '50%';
    progressCount.textContent = `0 / ${count}`;

    try {
      let addedCount = 0;
      if (window.FirebaseService) {
        addedCount = await window.FirebaseService.simulateResponses(surveyId, count, constraints, weights);
      } else {
        const res = await fetch(`/api/surveys/${surveyId}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, constraints, weights })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Simülasyon başarısız');
        addedCount = data.addedCount;
      }

      progressBar.style.width = '100%';
      progressCount.textContent = `${count} / ${count}`;
      statusLabel.textContent = 'Tamamlandı!';
      logTicker.textContent = `✓ ${addedCount} adet anket yanıtı başarıyla eklendi!`;

      showToast(`${addedCount} adet ağırlıklı rastgele yanıt üretildi!`, 'success');
      await loadSurveysList();
      if (selectedAnalyticsSurveyId === surveyId) {
        await loadAnalyticsForSelectedSurvey();
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      startBtn.disabled = false;
      startBtn.textContent = '⚡ Doldurmayı Başlat';
    }
    return;
  }

  // Mode 2: Live Stream (Interactive Animation)
  isSimulating = true;
  simTargetCount = count;
  simCompletedCount = 0;

  startBtn.style.display = 'none';
  stopBtn.style.display = 'inline-flex';
  statusLabel.textContent = 'Canlı simülasyon akışı ağırlık kurallarıyla aktif...';

  simInterval = setInterval(async () => {
    if (!isSimulating || simCompletedCount >= simTargetCount) {
      stopLiveSimulation();
      return;
    }

    try {
      let response = null;
      if (window.FirebaseService && window.SurveySimulator) {
        const targetSurvey = allSurveys.find(s => String(s.id) === String(surveyId));
        const simData = window.SurveySimulator.generateResponseForSurvey(targetSurvey, constraints, weights);
        response = await window.FirebaseService.addResponse(surveyId, simData.answers, true);
      } else {
        const res = await fetch(`/api/surveys/${surveyId}/simulate-one`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ constraints, weights })
        });
        if (res.ok) {
          const result = await res.json();
          response = result.response;
        }
      }

      if (response) {
        simCompletedCount++;
        const pct = Math.round((simCompletedCount / simTargetCount) * 100);

        progressBar.style.width = `${pct}%`;
        progressCount.textContent = `${simCompletedCount} / ${simTargetCount} (${pct}%)`;

        // Pick sample answer for ticker
        const sampleAnswer = Object.values(response.answers || {})[0] || 'Yanıt';
        logTicker.textContent = `[#${simCompletedCount}] Kaydedildi: "${sampleAnswer}" (${response.ip || 'Bulut'})`;

        if (simCompletedCount >= simTargetCount) {
          stopLiveSimulation();
          showToast(`Tüm ${simTargetCount} simülasyon yanıtı tamamlandı!`, 'success');
          await loadSurveysList();
          if (selectedAnalyticsSurveyId === surveyId) {
            await loadAnalyticsForSelectedSurvey();
          }
        }
      }
    } catch (err) {
      console.error('Sim error:', err);
    }
  }, intervalMs);
}

function stopLiveSimulation() {
  isSimulating = false;
  if (simInterval) clearInterval(simInterval);

  const startBtn = document.getElementById('simStartBtn');
  const stopBtn = document.getElementById('simStopBtn');
  const statusLabel = document.getElementById('simStatusLabel');

  if (startBtn) startBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'none';
  if (statusLabel) statusLabel.textContent = 'Simülasyon durduruldu / tamamlandı.';

  loadSurveysList();
  if (selectedAnalyticsSurveyId) loadAnalyticsForSelectedSurvey();
}

// ================= 5. SHARING =================

function populateShareSurveySelect() {
  const select = document.getElementById('shareSurveySelect');
  if (!select) return;

  select.innerHTML = allSurveys.map(s => `
    <option value="${s.id}">[#${s.id}] ${escapeHtml(s.title)}</option>
  `).join('');
}

function updateShareLinks() {
  const select = document.getElementById('shareSurveySelect');
  const surveyId = select ? select.value : (allSurveys[0] ? allSurveys[0].id : '');
  if (!surveyId) return;

  const publicUrl = getSurveyPublicUrl(surveyId);
  const inputEl = document.getElementById('shareLanUrlInput');
  if (inputEl) inputEl.value = publicUrl;

  const openBtn = document.getElementById('shareOpenLinkBtn');
  if (openBtn) openBtn.href = publicUrl;
}

function copyDirectLink(url) {
  navigator.clipboard.writeText(url).then(() => {
    showToast('Bağlantı panoya kopyalandı!', 'success');
  }).catch(() => {
    prompt('Link:', url);
  });
}

function copyToClipboard(inputId) {
  const el = document.getElementById(inputId);
  if (!el) return;
  el.select();
  document.execCommand('copy');
  showToast('Bağlantı kopyalandı!', 'success');
}

// ================= MODALS & TOAST =================

let confirmCallback = null;

function openConfirmModal(title, desc, onConfirm) {
  document.getElementById('confirmModalTitle').textContent = title;
  document.getElementById('confirmModalDesc').textContent = desc;
  confirmCallback = onConfirm;

  const btn = document.getElementById('confirmModalActionBtn');
  btn.onclick = () => {
    if (confirmCallback) confirmCallback();
  };

  document.getElementById('confirmModal').classList.add('open');
}

function closeConfirmModal() {
  document.getElementById('confirmModal').classList.remove('open');
  confirmCallback = null;
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
    <span>${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ================= WORD / DOCX IMPORT CONTROLLER =================

let parsedWordSurveyData = null;

function openWordUploadModal() {
  parsedWordSurveyData = null;
  document.getElementById('wordPreviewBox').style.display = 'none';
  document.getElementById('wordParsingSpinner').style.display = 'none';
  document.getElementById('btnWordOpenInBuilder').style.display = 'none';
  document.getElementById('btnWordSaveDirect').style.display = 'none';
  document.getElementById('wordFileInput').value = '';
  document.getElementById('wordPasteInput').value = '';
  switchWordModalTab('file');

  document.getElementById('wordUploadModal').classList.add('open');
}

function closeWordUploadModal() {
  document.getElementById('wordUploadModal').classList.remove('open');
}

function switchWordModalTab(mode) {
  const btnFile = document.getElementById('btnWordTabFile');
  const btnPaste = document.getElementById('btnWordTabPaste');
  const secFile = document.getElementById('wordFileSection');
  const secPaste = document.getElementById('wordPasteSection');

  if (mode === 'file') {
    btnFile.className = 'btn btn-sm btn-primary';
    btnPaste.className = 'btn btn-sm btn-secondary';
    secFile.style.display = 'block';
    secPaste.style.display = 'none';
  } else {
    btnFile.className = 'btn btn-sm btn-secondary';
    btnPaste.className = 'btn btn-sm btn-primary';
    secFile.style.display = 'none';
    secPaste.style.display = 'block';
  }
}

function setupWordDropzone() {
  const dropzone = document.getElementById('wordDropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadWordFile(files[0]);
    }
  });
}

function handleWordFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    uploadWordFile(file);
  }
}

async function uploadWordFile(file) {
  const spinner = document.getElementById('wordParsingSpinner');
  const previewBox = document.getElementById('wordPreviewBox');

  spinner.style.display = 'block';
  previewBox.style.display = 'none';

  try {
    if (window.SurveyWordParser) {
      parsedWordSurveyData = await window.SurveyWordParser.parseDocxFile(file);
    } else {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/surveys/upload-word', { method: 'POST', body: formData });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Word dosyası okunamadı');
      parsedWordSurveyData = result.data;
    }

    renderWordPreview(parsedWordSurveyData);
    showToast(`${parsedWordSurveyData.questions.length} adet soru başarıyla tespit edildi!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    spinner.style.display = 'none';
  }
}

async function parsePastedText() {
  const text = document.getElementById('wordPasteInput').value.trim();
  if (!text) {
    showToast('Lütfen metin giriniz', 'error');
    return;
  }

  const spinner = document.getElementById('wordParsingSpinner');
  const previewBox = document.getElementById('wordPreviewBox');

  spinner.style.display = 'block';
  previewBox.style.display = 'none';

  try {
    if (window.SurveyWordParser) {
      parsedWordSurveyData = window.SurveyWordParser.parseSurveyText(text);
    } else {
      const res = await fetch('/api/surveys/parse-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Ayrıştırma hatası');
      parsedWordSurveyData = result.data;
    }

    renderWordPreview(parsedWordSurveyData);
    showToast(`${parsedWordSurveyData.questions.length} adet soru tespit edildi!`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    spinner.style.display = 'none';
  }
}

function renderWordPreview(data) {
  const previewBox = document.getElementById('wordPreviewBox');
  const titleInput = document.getElementById('wordPreviewTitle');
  const badge = document.getElementById('wordDetectedCountBadge');
  const questionsList = document.getElementById('wordPreviewQuestionsList');
  const btnOpenBuilder = document.getElementById('btnWordOpenInBuilder');
  const btnSaveDirect = document.getElementById('btnWordSaveDirect');

  titleInput.value = data.title || 'Word İle Yüklenen Anket';
  badge.textContent = `${(data.questions || []).length} Soru Tespit Edildi`;

  questionsList.innerHTML = (data.questions || []).map((q, idx) => {
    let typeLabel = 'Tekli Seçim';
    if (q.type === 'multiple') typeLabel = 'Çoktan Seçmeli';
    if (q.type === 'rating') typeLabel = 'Yıldız (1-5)';
    if (q.type === 'text') typeLabel = 'Yazılı Metin';

    return `
      <div style="background: rgba(255,255,255,0.04); padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 13px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="font-weight: 700; color: #fff;">${idx + 1}. ${escapeHtml(q.title)}</span>
          <span class="badge badge-primary" style="font-size: 10px; padding: 2px 6px;">${typeLabel}</span>
        </div>
        ${q.options && q.options.length > 0 ? `
          <div style="font-size: 11px; color: var(--text-dim); margin-top: 4px;">
            Şıklar: ${q.options.map(opt => escapeHtml(opt)).join(' • ')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  previewBox.style.display = 'block';
  btnOpenBuilder.style.display = 'inline-flex';
  btnSaveDirect.style.display = 'inline-flex';
}

function applyWordToBuilder() {
  if (!parsedWordSurveyData) return;

  const currentTitle = document.getElementById('wordPreviewTitle').value.trim();
  document.getElementById('editingSurveyId').value = '';
  document.getElementById('surveyInputTitle').value = currentTitle || parsedWordSurveyData.title;
  document.getElementById('surveyInputDesc').value = parsedWordSurveyData.description || '';
  document.getElementById('surveyInputTheme').value = '#6366f1';
  document.getElementById('surveyInputActive').value = 'true';
  document.getElementById('builderFormTitle').textContent = 'İçe Aktarılan Anketi Düzenle';

  builderQuestions = JSON.parse(JSON.stringify(parsedWordSurveyData.questions || []));
  renderBuilderQuestions();

  closeWordUploadModal();
  switchTab('tab-builder');
  showToast('Sorular düzenleyiciye aktarıldı, dilediğiniz gibi güncelleyebilirsiniz!', 'success');
}

async function saveWordSurveyDirectly() {
  if (!parsedWordSurveyData) return;

  const title = document.getElementById('wordPreviewTitle').value.trim() || parsedWordSurveyData.title;
  const payload = {
    title,
    description: parsedWordSurveyData.description || '',
    themeColor: '#4f46e5',
    active: true,
    questions: parsedWordSurveyData.questions
  };

  try {
    let saved;
    if (window.FirebaseService) {
      saved = await window.FirebaseService.saveSurvey(payload);
    } else {
      const res = await fetch('/api/surveys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Anket kaydedilemedi');
      saved = await res.json();
    }

    showToast(`"${saved.title}" başarıyla kaydedildi ve yayınlandı!`, 'success');
    closeWordUploadModal();
    await loadSurveysList();
    switchTab('tab-surveys');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Sync all local surveys to Firebase Firestore
async function syncSurveysToFirestore() {
  if (typeof firestoreDb === 'undefined' || !firestoreDb) {
    showToast('Firebase henüz başlatılamadı. Lütfen sayfayı yenileyiniz.', 'error');
    return;
  }

  showToast('Anketler Firebase bulutuna aktarılıyor...', 'info');

  try {
    const res = await fetch('/api/surveys');
    const surveys = await res.json();

    let count = 0;
    for (const s of surveys) {
      await firestoreDb.collection('surveys').doc(s.id).set(s, { merge: true });
      count++;
    }

    showToast(`${count} adet anket Firebase Firestore bulutuna başarıyla yüklendi!`, 'success');
  } catch (err) {
    console.error('Firebase sync error:', err);
    showToast('Firebase Hatası: ' + err.message, 'error');
  }
}

// ================= SINGLE-ADMIN AUTHENTICATION =================

const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'anketor2026.',
  firebaseEmail: 'admin@anketor.com'
};

function initAuth() {
  const isSessionActive = sessionStorage.getItem('anketor_admin_active') === 'true';

  if (isSessionActive) {
    updateAuthUI({ username: ADMIN_CREDENTIALS.username });
    ensureFirebaseAuth();
    loadSurveysList();
  } else {
    updateAuthUI(null);
  }
}

async function ensureFirebaseAuth() {
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      if (!firebase.auth().currentUser) {
        try {
          await firebase.auth().signInWithEmailAndPassword(ADMIN_CREDENTIALS.firebaseEmail, ADMIN_CREDENTIALS.password);
        } catch (err) {
          if (err.code === 'auth/user-not-found') {
            await firebase.auth().createUserWithEmailAndPassword(ADMIN_CREDENTIALS.firebaseEmail, ADMIN_CREDENTIALS.password);
          }
        }
      }
    } catch (fbErr) {
      console.warn('Firebase Auth senkronizasyon bilgisi:', fbErr);
    }
  }
}

function updateAuthUI(user) {
  const authGate = document.getElementById('authGateContainer');
  const appContainer = document.getElementById('authenticatedAppContainer');
  const userPill = document.getElementById('adminUserPill');
  const userEmail = document.getElementById('adminUserEmail');
  const authButtons = document.querySelectorAll('.auth-required');

  if (user) {
    if (authGate) authGate.style.display = 'none';
    if (appContainer) appContainer.style.display = 'block';
    if (userPill) userPill.style.display = 'inline-flex';
    if (userEmail) userEmail.textContent = 'admin';
    authButtons.forEach(btn => btn.style.display = 'inline-flex');
  } else {
    if (authGate) authGate.style.display = 'block';
    if (appContainer) appContainer.style.display = 'none';
    if (userPill) userPill.style.display = 'none';
    authButtons.forEach(btn => btn.style.display = 'none');
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = (document.getElementById('authUsernameInput').value || '').trim();
  const password = document.getElementById('authPasswordInput').value;
  const errorMsg = document.getElementById('authErrorMsg');
  const submitBtn = document.getElementById('btnAuthSubmit');

  errorMsg.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.textContent = 'Doğrulanıyor...';

  // Strict single-account verification
  const isMatch = (username.toLowerCase() === ADMIN_CREDENTIALS.username || username.toLowerCase() === ADMIN_CREDENTIALS.firebaseEmail) && password === ADMIN_CREDENTIALS.password;

  if (!isMatch) {
    errorMsg.textContent = 'Hatalı kullanıcı adı veya parola! Yalnızca yetkili yönetici giriş yapabilir.';
    errorMsg.style.display = 'block';
    submitBtn.disabled = false;
    submitBtn.textContent = 'Giriş Yap ➔';
    return;
  }

  // Set active session
  sessionStorage.setItem('anketor_admin_active', 'true');

  // Sync Firebase Auth in background to acquire Firestore write token
  await ensureFirebaseAuth();

  updateAuthUI({ username: 'admin' });
  showToast('Yönetici girişi başarılı! Hoş geldiniz.', 'success');
  await loadSurveysList();

  submitBtn.disabled = false;
  submitBtn.textContent = 'Giriş Yap ➔';
}

async function handleLogout() {
  sessionStorage.removeItem('anketor_admin_active');
  if (typeof firebase !== 'undefined' && firebase.auth) {
    try {
      await firebase.auth().signOut();
    } catch (e) {}
  }
  updateAuthUI(null);
  showToast('Yönetici oturumu kapatıldı.', 'info');
}
