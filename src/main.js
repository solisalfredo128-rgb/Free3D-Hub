/**
 * Free3D Hub - Main Application
 * AI时代免费3D资源共享平台
 */

import './style.css';
import { MODELS, CATEGORIES, SORT_OPTIONS, FORMAT_FILTERS } from './models-data.js';
import { createPreviewScene, createDetailScene, createHeroScene } from './preview-renderer.js';
import { renderUploadModal, initUploadModal } from './upload-modal.js';
import { getAllModels, getModelFiles, createFileURL } from './model-store.js';
import { createPBRViewer } from './pbr-renderer.js';

// Professional Console Greeting
console.log(
  '%c Free3D Hub %c v1.0.0 %c',
  'background:#6c5ce7; padding: 4px 8px; border-radius: 4px 0 0 4px;  color: #fff; font-weight: bold;',
  'background:#a29bfe; padding: 4px 8px; border-radius: 0 4px 4px 0;  color: #fff;',
  'background:transparent'
);
console.log('欢迎使用 Free3D Hub - 为AI时代开发者打造的无门槛3D资源库。');


// ============================================
// State
// ============================================
const state = {
  activeCategory: 'all',
  activeSort: 'popular',
  activeFormats: [],
  searchQuery: '',
  previewScenes: [],
  detailScene: null,
  heroScene: null,
  uploadedModels: [],
  uploadModalActions: null,
};

// ============================================
// Utility
// ============================================
function formatNumber(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function getAllCombinedModels() {
  return [...MODELS, ...state.uploadedModels];
}

function getFilteredModels() {
  let models = getAllCombinedModels();

  // Category filter
  if (state.activeCategory !== 'all') {
    models = models.filter(m => m.category === state.activeCategory);
  }

  // Format filter
  if (state.activeFormats.length > 0) {
    models = models.filter(m => state.activeFormats.includes(m.format));
  }

  // Search 
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.toLowerCase();
    models = models.filter(m =>
      m.name.toLowerCase().includes(q) ||
      m.author.toLowerCase().includes(q) ||
      m.tags.some(t => t.toLowerCase().includes(q)) ||
      m.description.toLowerCase().includes(q) ||
      m.category.toLowerCase().includes(q)
    );
  }

  // Sort
  switch (state.activeSort) {
    case 'popular':
      models.sort((a, b) => b.likes - a.likes);
      break;
    case 'newest':
      models.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case 'downloads':
      models.sort((a, b) => b.downloads - a.downloads);
      break;
    case 'name':
      models.sort((a, b) => a.name.localeCompare(b.name));
      break;
  }

  return models;
}

// ============================================
// Render Functions
// ============================================
function renderApp() {
  const app = document.getElementById('app');
  const allModels = getAllCombinedModels();

  app.innerHTML = `
    <!-- Background Effects -->
    <div class="bg-grid"></div>
    <div class="bg-glow bg-glow--purple"></div>
    <div class="bg-glow bg-glow--cyan"></div>
    <div class="bg-glow bg-glow--pink"></div>

    <!-- Navigation -->
    <nav class="navbar" id="navbar">
      <div class="navbar__inner">
        <a href="#" class="navbar__logo">
          <div class="navbar__logo-icon">◆</div>
          <div class="navbar__logo-text">Free3D <span>Hub</span></div>
        </a>

        <div class="navbar__search">
          <span class="navbar__search-icon">🔍</span>
          <input 
            type="text" 
            class="navbar__search-input" 
            id="searchInput"
            placeholder="搜索模型、作者、标签..."
            autocomplete="off"
          />
        </div>

        <div class="navbar__stats">
          <div class="navbar__stat">
            <span>📦</span>
            <span class="navbar__stat-value">${allModels.length}</span>
            <span>模型</span>
          </div>
          <div class="navbar__stat">
            <span>📥</span>
            <span class="navbar__stat-value">${formatNumber(allModels.reduce((s, m) => s + m.downloads, 0))}</span>
            <span>总下载</span>
          </div>
        </div>

        <div class="navbar__actions">
          <button class="navbar__btn navbar__btn--upload" id="uploadBtn">
            <span>⬆️</span> 上传模型
          </button>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero" id="hero">
      <canvas class="hero__canvas" id="heroCanvas"></canvas>
      <div class="hero__content">
        <div class="hero__badge animate-in">
          <span class="hero__badge-dot"></span>
          AI时代 · 开源共享
        </div>
        <h1 class="hero__title animate-in animate-delay-1">
          免费3D资源<br/>
          <span class="hero__title-gradient">无偿共享平台</span>
        </h1>
        <p class="hero__subtitle animate-in animate-delay-2">
          为AI时代开发者打造的无门槛3D资源库。无需注册，即刻浏览、预览、下载。
          GLB / FBX / OBJ 多格式支持，助力你的创意快速落地。
        </p>
        <div class="hero__cta-group animate-in animate-delay-3">
          <button class="hero__cta hero__cta--primary" id="browseBtn">
            <span>🎮</span> 浏览资源
          </button>
          <button class="hero__cta hero__cta--secondary" id="heroUploadBtn">
            <span>📤</span> 上传模型
          </button>
        </div>
        <div class="hero__metrics animate-in animate-delay-4">
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricModels">0</div>
            <div class="hero__metric-label">3D 模型</div>
          </div>
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricDownloads">0</div>
            <div class="hero__metric-label">总下载次数</div>
          </div>
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricAuthors">0</div>
            <div class="hero__metric-label">贡献作者</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Categories & Filters -->
    <section class="categories" id="categoriesSection">
      <div class="categories__header">
        <h2 class="categories__title">🗂️ 浏览分类</h2>
        <span class="categories__count" id="modelCount"></span>
      </div>
      <div class="categories__list" id="categoryList"></div>
      
      <div class="controls">
        <div class="controls__sort" id="sortControls"></div>
        <div class="controls__format-filters" id="formatFilters"></div>
      </div>
    </section>

    <!-- Model Grid -->
    <div class="model-grid" id="modelGrid"></div>

    <!-- Features Section -->
    <section class="features">
      <h2 class="features__title">✨ 为什么选择 Free3D Hub</h2>
      <div class="features__grid">
        <div class="feature-card animate-in">
          <div class="feature-card__icon feature-card__icon--purple">🚀</div>
          <h3 class="feature-card__title">零门槛访问</h3>
          <p class="feature-card__desc">无需注册、无需付费、无需等待。打开网页即可浏览和下载所有3D资源。</p>
        </div>
        <div class="feature-card animate-in animate-delay-1">
          <div class="feature-card__icon feature-card__icon--cyan">🎨</div>
          <h3 class="feature-card__title">PBR 渲染预览</h3>
          <p class="feature-card__desc">Sketchfab 风格的在线 PBR 渲染器，支持 IBL 环境光照、法线、金属度、粗糙度等完整贴图通道。</p>
        </div>
        <div class="feature-card animate-in animate-delay-2">
          <div class="feature-card__icon feature-card__icon--pink">📤</div>
          <h3 class="feature-card__title">自由上传</h3>
          <p class="feature-card__desc">一键上传你的模型和 PBR 贴图，支持 GLB、FBX、OBJ 等主流格式，立即在线预览。</p>
        </div>
        <div class="feature-card animate-in animate-delay-3">
          <div class="feature-card__icon feature-card__icon--orange">🤖</div>
          <h3 class="feature-card__title">AI开发友好</h3>
          <p class="feature-card__desc">专为AI时代开发者优化。提供API接口（即将上线），方便程序化批量下载和集成。</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer__inner">
        <div class="footer__text">
          © 2025 Free3D Hub · 所有资源遵循 CC0 / CC-BY 协议 · 为AI时代开发者而生
        </div>
        <div class="footer__links">
          <a href="#" class="footer__link">关于我们</a>
          <a href="#" class="footer__link">使用条款</a>
          <a href="#" class="footer__link">贡献指南</a>
          <a href="#" class="footer__link">API 文档</a>
          <a href="https://github.com" class="footer__link" target="_blank">GitHub</a>
        </div>
      </div>
    </footer>

    <!-- Detail Modal -->
    <div class="modal-overlay" id="modalOverlay">
      <div class="modal" id="modal">
        <div class="modal__preview" id="modalPreview">
          <button class="modal__close" id="modalClose">✕</button>
        </div>
        <div class="modal__body" id="modalBody"></div>
      </div>
    </div>

    <!-- Upload Modal -->
    ${renderUploadModal()}

    <!-- Toast -->
    <div class="toast" id="toast">
      <span class="toast__icon">✅</span>
      <span id="toastMessage">操作成功</span>
    </div>
  `;

  // Initialize all sections
  renderCategories();
  renderSortControls();
  renderFormatFilters();
  renderModelGrid();
  initHeroScene();
  initEventListeners();
  animateMetrics();

  // Initialize upload modal
  state.uploadModalActions = initUploadModal(onModelUploaded, showToast);
}

function renderCategories() {
  const list = document.getElementById('categoryList');

  // Update category counts based on combined models
  const allModels = getAllCombinedModels();
  const updatedCategories = CATEGORIES.map(cat => {
    if (cat.id === 'all') {
      return { ...cat, count: allModels.length };
    }
    return { ...cat, count: allModels.filter(m => m.category === cat.id).length };
  });

  list.innerHTML = updatedCategories.map(cat => `
    <button 
      class="categories__item ${cat.id === state.activeCategory ? 'active' : ''}" 
      data-category="${cat.id}"
    >
      <span>${cat.icon}</span>
      ${cat.name}
      <span class="categories__item-count">${cat.count}</span>
    </button>
  `).join('');
}

function renderSortControls() {
  const container = document.getElementById('sortControls');
  container.innerHTML = SORT_OPTIONS.map(opt => `
    <button 
      class="controls__sort-btn ${opt.id === state.activeSort ? 'active' : ''}" 
      data-sort="${opt.id}"
    >
      ${opt.label}
    </button>
  `).join('');
}

function renderFormatFilters() {
  const container = document.getElementById('formatFilters');
  container.innerHTML = FORMAT_FILTERS.map(f => `
    <button 
      class="format-tag format-tag--${f.id} ${state.activeFormats.includes(f.id) ? 'active' : ''}"
      data-format="${f.id}"
    >
      ${f.label}
    </button>
  `).join('');
}

function renderModelGrid() {
  // Dispose old scenes
  state.previewScenes.forEach(s => s.dispose());
  state.previewScenes = [];

  const models = getFilteredModels();
  const grid = document.getElementById('modelGrid');
  const countEl = document.getElementById('modelCount');

  countEl.textContent = `${models.length} 个模型`;

  if (models.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 16px;">🔍</div>
        <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary);">未找到匹配的模型</div>
        <div>试试其他搜索词或分类筛选</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = models.map((model, index) => `
    <div class="model-card animate-in" style="animation-delay: ${index * 0.05}s" data-model-id="${model.id}">
      <div class="model-card__preview" id="preview-${model.id}">
        <div class="model-card__preview-overlay"></div>
        <span class="model-card__format model-card__format--${model.format}">${model.format.toUpperCase()}</span>
        <span class="model-card__license">${model.license}</span>
        ${model.isUploaded ? '<span class="model-card__uploaded-badge">📤 社区上传</span>' : ''}
        ${model.hasPBR ? '<span class="model-card__pbr-badge">🎨 PBR</span>' : ''}
        <div class="model-card__actions-overlay">
          <button class="model-card__action-btn" title="全屏预览" data-action="fullscreen" data-id="${model.id}">🔍</button>
          <button class="model-card__action-btn" title="分享" data-action="share" data-id="${model.id}">🔗</button>
        </div>
      </div>
      <div class="model-card__body">
        <div class="model-card__name">${model.name}</div>
        <div class="model-card__author">
          <span class="model-card__author-avatar">${model.authorInitial}</span>
          ${model.author}
        </div>
        <div class="model-card__tags">
          ${model.tags.slice(0, 3).map(t => `<span class="model-card__tag">${t}</span>`).join('')}
        </div>
        <div class="model-card__meta">
          <div class="model-card__stats">
            <span class="model-card__stat">📥 ${formatNumber(model.downloads)}</span>
            <span class="model-card__stat">❤️ ${formatNumber(model.likes)}</span>
            <span class="model-card__stat">👁️ ${formatNumber(model.views)}</span>
          </div>
          <button class="model-card__download-btn" data-action="download" data-id="${model.id}">
            ⬇️ 下载
            <span class="model-card__size">${model.fileSize}</span>
          </button>
        </div>
      </div>
    </div>
  `).join('');

  // Create 3D previews with IntersectionObserver for lazy loading
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const container = entry.target;
        const modelId = container.id.replace('preview-', '');
        const modelData = getAllCombinedModels().find(m => m.id === modelId);
        if (modelData && !container.querySelector('canvas')) {
          const scene = createPreviewScene(container, modelData);
          state.previewScenes.push(scene);
        }
        observer.unobserve(container);
      }
    });
  }, { rootMargin: '100px' });

  models.forEach(model => {
    const el = document.getElementById(`preview-${model.id}`);
    if (el) observer.observe(el);
  });
}

function initHeroScene() {
  const canvas = document.getElementById('heroCanvas');
  if (canvas) {
    state.heroScene = createHeroScene(canvas);
  }
}

function animateMetrics() {
  const allModels = getAllCombinedModels();
  const targets = {
    metricModels: allModels.length,
    metricDownloads: allModels.reduce((s, m) => s + m.downloads, 0),
    metricAuthors: new Set(allModels.map(m => m.author)).size,
  };

  Object.entries(targets).forEach(([id, target]) => {
    const el = document.getElementById(id);
    if (!el) return;

    let current = 0;
    const step = Math.ceil(target / 60);
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = formatNumber(current);
      if (current >= target) clearInterval(interval);
    }, 20);
  });
}

// ============================================
// Modal (with PBR support)
// ============================================
async function openModal(modelId) {
  const allModels = getAllCombinedModels();
  const model = allModels.find(m => m.id === modelId);
  if (!model) return;

  const overlay = document.getElementById('modalOverlay');
  const preview = document.getElementById('modalPreview');
  const body = document.getElementById('modalBody');

  // Render modal body
  body.innerHTML = `
    <h2 class="modal__title">${model.name}</h2>
    <div class="modal__author-row">
      <span class="model-card__author-avatar" style="width:24px;height:24px;font-size:0.7rem">${model.authorInitial}</span>
      <span>${model.author}</span>
      <span>·</span>
      <span>${model.date}</span>
      <span>·</span>
      <span>${model.license}</span>
      ${model.isUploaded ? '<span style="color: var(--accent-green); font-weight: 600;">· 社区上传</span>' : ''}
      ${model.hasPBR ? '<span style="color: var(--accent-secondary); font-weight: 600;">· PBR 贴图</span>' : ''}
    </div>
    <p class="modal__description">${model.description}</p>
    <div class="modal__info-grid">
      <div class="modal__info-item">
        <div class="modal__info-label">格式</div>
        <div class="modal__info-value">${model.format.toUpperCase()}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">文件大小</div>
        <div class="modal__info-value">${model.fileSize}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">顶点数</div>
        <div class="modal__info-value">${model.vertices}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">多边形</div>
        <div class="modal__info-value">${model.polygons}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">贴图</div>
        <div class="modal__info-value">${model.textures}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">下载次数</div>
        <div class="modal__info-value">${formatNumber(model.downloads)}</div>
      </div>
    </div>
    <div class="modal__download-section">
      <button class="modal__download-btn" data-action="download" data-id="${model.id}">
        ⬇️ 免费下载 ${model.format.toUpperCase()} · ${model.fileSize}
      </button>
      <button class="modal__copy-link" data-action="copyLink" data-id="${model.id}">
        🔗 复制链接
      </button>
    </div>
  `;

  // Create detail 3D scene
  if (state.detailScene) {
    state.detailScene.dispose();
    state.detailScene = null;
  }

  // Remove old canvases from preview
  const oldCanvases = preview.querySelectorAll('canvas');
  oldCanvases.forEach(c => c.remove());

  // Remove old toolbar if any
  const oldToolbar = preview.querySelector('.pbr-toolbar');
  if (oldToolbar) oldToolbar.remove();
  const oldLoading = preview.querySelector('.pbr-loading');
  if (oldLoading) oldLoading.remove();

  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Decide which renderer to use
  if (model.isUploaded) {
    // Use PBR renderer for uploaded models
    setTimeout(async () => {
      try {
        const files = await getModelFiles(model.id);

        // Create object URLs for model and textures
        let modelUrl = null;
        const textureUrls = {};
        const urlsToRevoke = [];

        if (files.modelFile) {
          modelUrl = createFileURL(files.modelFile);
          if (modelUrl) urlsToRevoke.push(modelUrl);
        }

        const textureTypes = ['albedo', 'normal', 'metallic', 'roughness', 'ao', 'emissive', 'height'];
        for (const type of textureTypes) {
          if (files[type]) {
            const url = createFileURL(files[type]);
            if (url) {
              textureUrls[type] = url;
              urlsToRevoke.push(url);
            }
          }
        }

        const viewer = createPBRViewer(preview, {
          modelUrl,
          textures: textureUrls,
          modelData: model,
          autoRotate: true,
          showGrid: true,
        });

        state.detailScene = {
          dispose: () => {
            viewer.dispose();
            urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
          }
        };
      } catch (err) {
        console.error('Failed to load uploaded model:', err);
        // Fallback to procedural preview
        state.detailScene = createDetailScene(preview, model);
      }
    }, 100);
  } else {
    // Use standard procedural renderer for built-in models
    setTimeout(() => {
      state.detailScene = createDetailScene(preview, model);
    }, 100);
  }
}

function closeModal() {
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('active');
  document.body.style.overflow = '';

  if (state.detailScene) {
    state.detailScene.dispose();
    state.detailScene = null;
  }
}

// ============================================
// Toast
// ============================================
function showToast(message) {
  const toast = document.getElementById('toast');
  const msg = document.getElementById('toastMessage');
  msg.textContent = message;
  toast.classList.add('active');
  setTimeout(() => toast.classList.remove('active'), 3000);
}

// ============================================
// Upload Callback
// ============================================
function onModelUploaded(modelData) {
  state.uploadedModels.push(modelData);

  // Switch to 'newest' sorting so the user can see their uploaded model immediately at the top
  state.activeSort = 'newest';

  // Also clear any active search or format filters that might hide the new model
  state.activeCategory = 'all';
  state.activeFormats = [];
  state.searchQuery = '';
  const searchInput = document.getElementById('searchInput');
  if (searchInput) searchInput.value = '';

  // Update controls UI
  renderSortControls();
  renderFormatFilters();

  // Update categories count
  renderCategories();

  // Re-render grid to include the new model
  renderModelGrid();

  // Scroll to the top of the grid
  document.getElementById('categoriesSection').scrollIntoView({ behavior: 'smooth' });
}

// ============================================
// Event Listeners
// ============================================
function initEventListeners() {
  // Navbar scroll effect
  window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value;
      renderModelGrid();
    }, 300);
  });

  // Category clicks
  document.getElementById('categoryList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    state.activeCategory = btn.dataset.category;
    renderCategories();
    renderModelGrid();
  });

  // Sort clicks
  document.getElementById('sortControls').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-sort]');
    if (!btn) return;
    state.activeSort = btn.dataset.sort;
    renderSortControls();
    renderModelGrid();
  });

  // Format filter clicks
  document.getElementById('formatFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-format]');
    if (!btn) return;
    const format = btn.dataset.format;
    if (state.activeFormats.includes(format)) {
      state.activeFormats = state.activeFormats.filter(f => f !== format);
    } else {
      state.activeFormats.push(format);
    }
    renderFormatFilters();
    renderModelGrid();
  });

  // Model grid interactions (delegation)
  document.getElementById('modelGrid').addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('[data-action="download"]');
    if (downloadBtn) {
      e.stopPropagation();
      handleDownload(downloadBtn.dataset.id);
      return;
    }

    const shareBtn = e.target.closest('[data-action="share"]');
    if (shareBtn) {
      e.stopPropagation();
      handleShare(shareBtn.dataset.id);
      return;
    }

    const card = e.target.closest('.model-card');
    if (card) {
      openModal(card.dataset.modelId);
    }
  });

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModal();
  });

  // Modal body actions
  document.getElementById('modalBody').addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('[data-action="download"]');
    if (downloadBtn) {
      handleDownload(downloadBtn.dataset.id);
      return;
    }

    const copyBtn = e.target.closest('[data-action="copyLink"]');
    if (copyBtn) {
      handleCopyLink(copyBtn.dataset.id);
    }
  });

  // Browse button
  document.getElementById('browseBtn').addEventListener('click', () => {
    document.getElementById('categoriesSection').scrollIntoView({ behavior: 'smooth' });
  });

  // Upload button (navbar)
  document.getElementById('uploadBtn').addEventListener('click', () => {
    if (state.uploadModalActions) {
      state.uploadModalActions.openUploadModal();
    }
  });

  // Upload button (hero)
  document.getElementById('heroUploadBtn').addEventListener('click', () => {
    if (state.uploadModalActions) {
      state.uploadModalActions.openUploadModal();
    }
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === '/' && !e.ctrlKey) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Intersection Observer for animations
  const animObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.animationPlayState = 'running';
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.feature-card').forEach(card => {
    animObserver.observe(card);
  });
}

// ============================================
// Actions
// ============================================
async function handleDownload(modelId) {
  const allModels = getAllCombinedModels();
  const model = allModels.find(m => m.id === modelId);
  if (!model) return;

  showToast(`📥 正在下载: ${model.name} (${model.fileSize})`);

  if (model.isUploaded) {
    // Download from IndexedDB
    try {
      const files = await getModelFiles(model.id);
      if (files.modelFile && files.modelFile.blob) {
        const url = URL.createObjectURL(files.modelFile.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = files.modelFile.name || `${model.name.replace(/\s+/g, '_')}.${model.format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        showToast('⚠️ 该模型没有可下载的文件');
      }
    } catch (err) {
      console.error('Download failed:', err);
      showToast('❌ 下载失败');
    }
  } else {
    // Simulate download for demo models
    const blob = new Blob(
      [`Free3D Hub - Download Placeholder\n\nModel: ${model.name}\nFormat: ${model.format.toUpperCase()}\nSize: ${model.fileSize}\nAuthor: ${model.author}\nLicense: ${model.license}\n\n此为演示文件。实际部署时，此处将返回真实的3D模型文件。`],
      { type: 'text/plain' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name.replace(/\s+/g, '_')}.${model.format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

function handleShare(modelId) {
  const url = `${window.location.origin}?model=${modelId}`;
  navigator.clipboard?.writeText(url).then(() => {
    showToast('🔗 链接已复制到剪贴板');
  }).catch(() => {
    showToast('🔗 分享链接: ' + url);
  });
}

function handleCopyLink(modelId) {
  handleShare(modelId);
}

// ============================================
// Initialize
// ============================================
async function init() {
  // Load uploaded models from IndexedDB
  try {
    state.uploadedModels = await getAllModels();
  } catch (err) {
    console.warn('Could not load uploaded models:', err);
    state.uploadedModels = [];
  }

  renderApp();
}

init();
