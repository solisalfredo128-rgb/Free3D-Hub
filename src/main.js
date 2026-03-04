/**
 * Free3D Hub - Main Application
 * Free 3D Resource Sharing Platform
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
console.log('Welcome to Free3D Hub - The zero-barrier 3D asset library for developers in the AI era.');


// ============================================
// State
// ============================================
const state = {
  activeCategory: 'all',
  activeSort: 'newest',
  activeFormats: [],
  searchQuery: '',
  previewScenes: [],
  detailScene: null,
  heroScene: null,
  uploadedModels: [],
  uploadModalActions: null,
  isAdmin: false,
};

// ============================================
// Utility
// ============================================
function formatNumber(num) {
  if (num >= 10000) return (num / 10000).toFixed(1) + 'k';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
}

function getAllCombinedModels() {
  // Deduplicate by id to prevent duplicates from IndexedDB + in-memory state
  const seen = new Set();
  const combined = [];
  for (const m of [...MODELS, ...state.uploadedModels]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      combined.push(m);
    }
  }
  return combined;
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
      (m.name || '').toLowerCase().includes(q) ||
      (m.author || '').toLowerCase().includes(q) ||
      (Array.isArray(m.tags) && m.tags.some(t => t.toLowerCase().includes(q))) ||
      (m.description || '').toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q)
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
            placeholder="Search models, authors, tags..."
            autocomplete="off"
          />
        </div>

        <div class="navbar__stats">
          <div class="navbar__stat">
            <span>📦</span>
            <span class="navbar__stat-value">${allModels.length}</span>
            <span>Models</span>
          </div>
          <div class="navbar__stat">
            <span>📥</span>
            <span class="navbar__stat-value">${formatNumber(allModels.reduce((s, m) => s + m.downloads, 0))}</span>
            <span>Total Downloads</span>
          </div>
        </div>

        <div class="navbar__actions">
          <button class="navbar__btn navbar__btn--upload" id="uploadBtn">
            <span>⬆️</span> Upload Models
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
          AI Era · Open Source Sharing
        </div>
        <h1 class="hero__title animate-in animate-delay-1">
          Free 3D Resources<br/>
          <span class="hero__title-gradient">Open Sharing Platform</span>
        </h1>
        <p class="hero__subtitle animate-in animate-delay-2">
          A zero-barrier 3D resource library built for developers in the AI era. No registration needed, instantly browse, preview, and download.
          GLB / FBX / OBJ multi-format support, accelerating your creative workflows.
        </p>
        <div class="hero__cta-group animate-in animate-delay-3">
          <button class="hero__cta hero__cta--primary" id="browseBtn">
            <span>🎮</span> Browse Resources
          </button>
          <button class="hero__cta hero__cta--secondary" id="heroUploadBtn">
            <span>📤</span> Upload Models
          </button>
        </div>
        <div class="hero__metrics animate-in animate-delay-4">
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricModels">0</div>
            <div class="hero__metric-label">3D Models</div>
          </div>
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricDownloads">0</div>
            <div class="hero__metric-label">Total Downloads</div>
          </div>
          <div class="hero__metric">
            <div class="hero__metric-value" id="metricAuthors">0</div>
            <div class="hero__metric-label">Contributors</div>
          </div>
        </div>
      </div>
    </section>

    <!-- Categories & Filters -->
    <section class="categories" id="categoriesSection">
      <div class="categories__header">
        <h2 class="categories__title">🗂️ Browse Categories</h2>
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
      <h2 class="features__title">✨ Why Choose Free3D Hub</h2>
      <div class="features__grid">
        <div class="feature-card animate-in">
          <div class="feature-card__icon feature-card__icon--purple">🚀</div>
          <h3 class="feature-card__title">Zero-Barrier Access</h3>
          <p class="feature-card__desc">No registration, no payment, no waiting. Just open the page and download any 3D resources.</p>
        </div>
        <div class="feature-card animate-in animate-delay-1">
          <div class="feature-card__icon feature-card__icon--cyan">🎨</div>
          <h3 class="feature-card__title">PBR Render Preview</h3>
          <p class="feature-card__desc">Sketchfab-style online PBR renderer, supporting IBL ambient lighting, normal, metallic, roughness, and other full texture channels.</p>
        </div>
        <div class="feature-card animate-in animate-delay-2">
          <div class="feature-card__icon feature-card__icon--pink">📤</div>
          <h3 class="feature-card__title">Free Uploading</h3>
          <p class="feature-card__desc">One-click upload of your models and PBR textures. Supports GLB, FBX, OBJ, and other popular formats with instant online preview.</p>
        </div>
        <div class="feature-card animate-in animate-delay-3">
          <div class="feature-card__icon feature-card__icon--orange">🤖</div>
          <h3 class="feature-card__title">AI-Development Friendly</h3>
          <p class="feature-card__desc">Optimized for developers in the AI era. Providing API interfaces (coming soon) for convenient programmatic batch downloading and integration.</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <div class="footer__inner">
        <div class="footer__text">
          © 2025 Free3D Hub · All resources follow CC0 / CC-BY licenses · Built for developers in the AI era
        </div>
        <div class="footer__links">
          <a href="#" class="footer__link">About Us</a>
          <a href="#" class="footer__link">Terms of Use</a>
          <a href="#" class="footer__link">Contribution Guide</a>
          <a href="#" class="footer__link">API Documentation</a>
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
      <span id="toastMessage">Success</span>
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

  countEl.textContent = `${models.length} Models`;

  if (models.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 80px 20px; color: var(--text-muted);">
        <div style="font-size: 3rem; margin-bottom: 16px;">🔍</div>
        <div style="font-size: 1.1rem; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary);">No models match your search</div>
        <div>Try different keywords or filters</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = models.map((model, index) => {
    // Defensive defaults for uploaded models loaded from IndexedDB
    const tags = Array.isArray(model.tags) ? model.tags : [];
    const downloads = model.downloads || 0;
    const likes = model.likes || 0;
    const views = model.views || 0;
    const authorInitial = model.authorInitial || (model.author ? model.author.charAt(0).toUpperCase() : '?');
    const format = model.format || 'glb';
    const license = model.license || 'CC0';
    const fileSize = model.fileSize || '-';

    return `
    <div class="model-card animate-in" style="animation-delay: ${Math.min(index, 10) * 0.05}s" data-model-id="${model.id}">
      <div class="model-card__preview" id="preview-${model.id}">
        <div class="model-card__preview-overlay"></div>
        <span class="model-card__format model-card__format--${format}">${format.toUpperCase()}</span>
        <span class="model-card__license">${license}</span>
        ${model.isUploaded ? '<span class="model-card__uploaded-badge">📤 Community Upload</span>' : ''}
        ${model.hasPBR ? '<span class="model-card__pbr-badge">🎨 PBR</span>' : ''}
        <div class="model-card__actions-overlay">
          <button class="model-card__action-btn" title="Fullscreen Preview" data-action="fullscreen" data-id="${model.id}">🔍</button>
          <button class="model-card__action-btn" title="Share" data-action="share" data-id="${model.id}">🔗</button>
          ${state.isAdmin && model.isUploaded ? `<button class="model-card__action-btn model-card__action-btn--delete" title="Delete Model (Admin Only)" data-action="delete" data-id="${model.id}">🗑️</button>` : ''}
        </div>
      </div>
      <div class="model-card__body">
        <div class="model-card__name">${model.name || 'Untitled Model'}</div>
        <div class="model-card__author">
          <span class="model-card__author-avatar">${authorInitial}</span>
          ${model.author || 'Anonymous'}
        </div>
        <div class="model-card__tags">
          ${tags.slice(0, 3).map(t => `<span class="model-card__tag">${t}</span>`).join('')}
          ${model.isUploaded && tags.length === 0 ? '<span class="model-card__tag">Community Upload</span>' : ''}
        </div>
        <div class="model-card__meta">
          <div class="model-card__stats">
            <span class="model-card__stat">📥 ${formatNumber(downloads)}</span>
            <span class="model-card__stat">❤️ ${formatNumber(likes)}</span>
            <span class="model-card__stat">👁️ ${formatNumber(views)}</span>
          </div>
          <button class="model-card__download-btn" data-action="download" data-id="${model.id}">
            ⬇️ Download
            <span class="model-card__size">${fileSize}</span>
          </button>
        </div>
      </div>
    </div>
  `;
  }).join('');

  // Create 3D previews with IntersectionObserver for lazy loading
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const container = entry.target;
        const modelId = container.id.replace('preview-', '');
        const modelData = getAllCombinedModels().find(m => m.id === modelId);
        if (modelData && !container.querySelector('canvas')) {
          if (modelData.isUploaded) {
            // Render actual model for uploaded items
            getModelFiles(modelData.id).then(files => {
              let modelUrl = null;
              const textureUrls = {};
              const urlsToRevoke = [];

              if (files.modelFile && files.modelFile.blob) {
                modelUrl = createFileURL(files.modelFile);
                if (modelUrl) urlsToRevoke.push(modelUrl);
              }

              const textureTypes = ['albedo', 'normal', 'metallic', 'roughness', 'ao', 'emissive', 'height'];
              textureTypes.forEach(type => {
                if (files[type] && files[type].blob) {
                  const url = createFileURL(files[type]);
                  if (url) {
                    textureUrls[type] = url;
                    urlsToRevoke.push(url);
                  }
                }
              });

              // Apply Sketchfab-style dark theme to the preview container
              container.style.background = 'radial-gradient(circle at center, #2d3436 0%, #000000 100%)';

              const viewer = createPBRViewer(container, {
                modelUrl,
                modelFormat: modelData.format || null,
                textures: textureUrls,
                modelData,
                autoRotate: true,
                showGrid: false, // cleaner look for grid
              });

              state.previewScenes.push({
                dispose: () => {
                  viewer.dispose();
                  urlsToRevoke.forEach(url => URL.revokeObjectURL(url));
                }
              });
            }).catch(err => {
              console.warn('Failed to load real model for grid preview, falling back:', err);
              const scene = createPreviewScene(container, modelData);
              state.previewScenes.push(scene);
            });
          } else {
            // Procedural placeholders for built-in models
            const scene = createPreviewScene(container, modelData);
            state.previewScenes.push(scene);
          }
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

  // Defensive defaults for uploaded models
  const format = (model.format || 'glb').toUpperCase();
  const fileSize = model.fileSize || '-';
  const authorInitial = model.authorInitial || (model.author ? model.author.charAt(0).toUpperCase() : '?');
  const description = model.description || 'Community uploaded 3D Models';
  const vertices = model.vertices || '-';
  const polygons = model.polygons || '-';
  const textures = model.textures || '-';
  const downloads = model.downloads || 0;
  const license = model.license || 'CC0';
  const date = model.date || 'Unknown date';

  // Render modal body
  body.innerHTML = `
    <h2 class="modal__title">${model.name || 'Untitled Model'}</h2>
    <div class="modal__author-row">
      <span class="model-card__author-avatar" style="width:24px;height:24px;font-size:0.7rem">${authorInitial}</span>
      <span>${model.author || 'Anonymous'}</span>
      <span>·</span>
      <span>${date}</span>
      <span>·</span>
      <span>${license}</span>
      ${model.isUploaded ? '<span style="color: var(--accent-green); font-weight: 600;">· Community Upload</span>' : ''}
      ${model.hasPBR ? '<span style="color: var(--accent-secondary); font-weight: 600;">· PBR Texture</span>' : ''}
    </div>
    <p class="modal__description">${description}</p>
    <div class="modal__info-grid">
      <div class="modal__info-item">
        <div class="modal__info-label">Format</div>
        <div class="modal__info-value">${format}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">File Size</div>
        <div class="modal__info-value">${fileSize}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">Vertices</div>
        <div class="modal__info-value">${vertices}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">Polygons</div>
        <div class="modal__info-value">${polygons}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">Texture</div>
        <div class="modal__info-value">${textures}</div>
      </div>
      <div class="modal__info-item">
        <div class="modal__info-label">Downloads</div>
        <div class="modal__info-value">${formatNumber(downloads)}</div>
      </div>
    </div>
    <div class="modal__download-section">
      <button class="modal__download-btn" data-action="download" data-id="${model.id}">
        ⬇️ Free Download ${format} · ${fileSize}
      </button>
      <button class="modal__copy-link" data-action="copyLink" data-id="${model.id}">
        🔗 Copy link
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
          modelFormat: model.format || null,  // pass format hint for blob URLs
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

  // Secret Admin Access: Click logo 5 times within 5 seconds
  let logoClicks = 0;
  let logoTimer;
  document.addEventListener('click', (e) => {
    const logo = e.target.closest('.navbar__logo');
    if (!logo) return;

    e.preventDefault();
    logoClicks++;
    console.log(`Admin Trigger: ${logoClicks}/5`);
    clearTimeout(logoTimer);
    logoTimer = setTimeout(() => {
      logoClicks = 0;
      console.log('Admin Trigger Reset');
    }, 5000);

    if (logoClicks >= 5) {
      logoClicks = 0;
      const pwd = prompt('Enter Admin Password:');
      if (pwd === 'admin888') {
        state.isAdmin = !state.isAdmin;
        showToast(state.isAdmin ? '🔓 Admin Mode Enabled' : '🔒 Admin Mode Disabled');
        renderModelGrid();
      } else if (pwd !== null) {
        showToast('❌ Incorrect Password');
      }
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

    const deleteBtn = e.target.closest('[data-action="delete"]');
    if (deleteBtn) {
      e.stopPropagation();
      handleDelete(deleteBtn.dataset.id);
      return;
    }

    const shareBtn = e.target.closest('[data-action="share"]');
    if (shareBtn) {
      e.stopPropagation();
      handleShare(shareBtn.dataset.id);
      return;
    }

    const zoomBtn = e.target.closest('[data-action="fullscreen"]');
    if (zoomBtn) {
      e.stopPropagation();
      openModal(zoomBtn.dataset.id);
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

/**
 * Handle model deletion (Admin)
 */
async function handleDelete(modelId) {
  if (!confirm('Are you sure you want to delete this model? This action cannot be undone.')) return;

  try {
    const { deleteModel } = await import('./model-store.js');
    await deleteModel(modelId);

    // Update state
    state.uploadedModels = state.uploadedModels.filter(m => m.id !== modelId);

    showToast('🗑️ Model deleted successfully');
    renderModelGrid();
    renderCategories();
  } catch (err) {
    console.error('Delete failed:', err);
    showToast('❌ Failed to delete model');
  }
}

// ============================================
// Actions
// ============================================
async function handleDownload(modelId) {
  const allModels = getAllCombinedModels();
  const model = allModels.find(m => m.id === modelId);
  if (!model) return;

  showToast(`📥 Downloading: ${model.name} (${model.fileSize})`);

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
        showToast('⚠️ No downloadable files for this model');
      }
    } catch (err) {
      console.error('Download failed:', err);
      showToast('❌ Download failed');
    }
  } else {
    // Simulate download for demo models
    const blob = new Blob(
      [`Free3D Hub - Download Placeholder\n\nModel: ${model.name}\nFormat: ${model.format.toUpperCase()}\nSize: ${model.fileSize}\nAuthor: ${model.author}\nLicense: ${model.license}\n\nThis is a demo file. Actual deployment will return the real 3D model.`],
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
    showToast('🔗 Link copied to clipboard');
  }).catch(() => {
    showToast('🔗 Share Link: ' + url);
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
    const storedModels = await getAllModels();
    // Sanitize loaded models - ensure all required properties exist
    state.uploadedModels = storedModels.map(m => ({
      ...m,
      tags: Array.isArray(m.tags) ? m.tags : [],
      downloads: m.downloads || 0,
      likes: m.likes || 0,
      views: m.views || 0,
      authorInitial: m.authorInitial || (m.author ? m.author.charAt(0).toUpperCase() : '?'),
      geometryType: m.geometryType || 'sphere',
      color: m.color || '#6c5ce7',
      secondaryColor: m.secondaryColor || '#00cec9',
      format: m.format || 'glb',
      license: m.license || 'CC0',
      fileSize: m.fileSize || '-',
      isUploaded: true,
    }));
    console.log(`[Free3D Hub] Loaded ${state.uploadedModels.length} user uploaded models`);
  } catch (err) {
    console.warn('Could not load uploaded models:', err);
    state.uploadedModels = [];
  }

  renderApp();
}

init();
