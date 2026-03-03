/**
 * Free3D Hub - Upload Modal
 * 
 * Full-featured upload form with:
 * - Drag & drop model file upload  
 * - PBR texture slots (Albedo, Normal, Metallic, Roughness, AO, Emissive, Height)
 * - Live 3D preview using PBR renderer
 * - Model metadata form
 * - IndexedDB persistence
 */

import { saveModel, generateModelId, readFileAsBlob, createFileURL, getModelFiles } from './model-store.js';
import { createPBRViewer } from './pbr-renderer.js';
import { CATEGORIES, GEOMETRY_TYPES } from './models-data.js';

// PBR texture channel definitions
const PBR_CHANNELS = [
    { id: 'albedo', label: 'Base Color', desc: '基础颜色/漫反射贴图', icon: '🎨', accept: 'image/*' },
    { id: 'normal', label: 'Normal', desc: '法线贴图 (切线空间)', icon: '🔵', accept: 'image/*' },
    { id: 'metallic', label: 'Metallic', desc: '金属度贴图', icon: '⚙️', accept: 'image/*' },
    { id: 'roughness', label: 'Roughness', desc: '粗糙度贴图', icon: '🪨', accept: 'image/*' },
    { id: 'ao', label: 'AO', desc: '环境光遮蔽贴图', icon: '🌑', accept: 'image/*' },
    { id: 'emissive', label: 'Emissive', desc: '自发光贴图', icon: '✨', accept: 'image/*' },
    { id: 'height', label: 'Height', desc: '高度/置换贴图', icon: '📐', accept: 'image/*' },
];

// Supported 3D file formats
const MODEL_FORMATS = {
    'glb': { label: 'GLB', mime: 'model/gltf-binary', canPreview: true },
    'gltf': { label: 'GLTF', mime: 'model/gltf+json', canPreview: true },
    'fbx': { label: 'FBX', mime: 'application/octet-stream', canPreview: false },
    'obj': { label: 'OBJ', mime: 'application/octet-stream', canPreview: false },
    'blend': { label: 'BLEND', mime: 'application/octet-stream', canPreview: false },
};

/**
 * Upload modal state
 */
let uploadState = {
    modelFile: null,
    modelFileUrl: null,
    textureFiles: {},
    textureUrls: {},
    thumbnailFile: null,
    thumbnailUrl: null,
    previewViewer: null,
    // Form data
    name: '',
    author: '',
    category: 'props',
    license: 'CC0',
    description: '',
    tags: '',
};

/**
 * Render the upload modal HTML
 */
export function renderUploadModal() {
    return `
    <div class="upload-overlay" id="uploadOverlay">
      <div class="upload-modal" id="uploadModal">
        
        <!-- Header -->
        <div class="upload-modal__header">
          <div class="upload-modal__header-left">
            <span class="upload-modal__icon">📤</span>
            <div>
              <h2 class="upload-modal__title">上传3D模型</h2>
              <p class="upload-modal__subtitle">支持 GLB / GLTF / FBX / OBJ 格式，可附带完整 PBR 贴图</p>
            </div>
          </div>
          <button class="upload-modal__close" id="uploadClose">✕</button>
        </div>

        <!-- Content - Two Column Layout -->
        <div class="upload-modal__content">
          
          <!-- Left: Preview -->
          <div class="upload-modal__preview-col">
            <div class="upload-modal__3d-preview" id="uploadPreviewContainer">
              <div class="upload-modal__preview-placeholder" id="previewPlaceholder">
                <div class="upload-modal__preview-placeholder-icon">🎮</div>
                <div class="upload-modal__preview-placeholder-text">上传模型后预览</div>
                <div class="upload-modal__preview-placeholder-hint">支持 GLB/GLTF 实时 PBR 渲染</div>
              </div>
            </div>
            
            <!-- PBR Texture Grid -->
            <div class="upload-modal__pbr-section">
              <h3 class="upload-modal__section-title">
                <span>🎨</span> PBR 贴图通道
                <span class="upload-modal__section-badge">Sketchfab 风格</span>
              </h3>
              <div class="upload-modal__pbr-grid" id="pbrTextureGrid">
                ${PBR_CHANNELS.map(ch => `
                  <div class="pbr-slot" id="pbrSlot-${ch.id}" data-channel="${ch.id}">
                    <div class="pbr-slot__preview" id="pbrPreview-${ch.id}">
                      <span class="pbr-slot__icon">${ch.icon}</span>
                    </div>
                    <div class="pbr-slot__info">
                      <span class="pbr-slot__label">${ch.label}</span>
                      <span class="pbr-slot__desc">${ch.desc}</span>
                    </div>
                    <input type="file" accept="${ch.accept}" class="pbr-slot__input" id="pbrInput-${ch.id}" data-channel="${ch.id}" />
                    <button class="pbr-slot__remove" id="pbrRemove-${ch.id}" data-channel="${ch.id}" style="display:none">✕</button>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- Right: Form -->
          <div class="upload-modal__form-col">
            
            <!-- Model File Upload -->
            <div class="upload-modal__dropzone" id="modelDropzone">
              <div class="upload-modal__dropzone-content" id="dropzoneContent">
                <div class="upload-modal__dropzone-icon">
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                    <rect x="4" y="8" width="40" height="32" rx="4" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
                    <path d="M24 16V32M16 24H32" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
                  </svg>
                </div>
                <div class="upload-modal__dropzone-text">
                  <strong>拖拽模型文件到此处</strong>
                  <span>或 <label for="modelFileInput" class="upload-modal__file-link">浏览文件</label></span>
                </div>
                <div class="upload-modal__dropzone-formats">
                  支持: GLB · GLTF · FBX · OBJ · BLEND
                </div>
              </div>
              <div class="upload-modal__dropzone-file" id="dropzoneFile" style="display:none">
                <div class="upload-modal__file-info">
                  <span class="upload-modal__file-icon">📦</span>
                  <div class="upload-modal__file-details">
                    <span class="upload-modal__file-name" id="fileName">-</span>
                    <span class="upload-modal__file-size" id="fileSize">-</span>
                  </div>
                  <button class="upload-modal__file-remove" id="fileRemove">✕</button>
                </div>
              </div>
              <input type="file" id="modelFileInput" accept=".glb,.gltf,.fbx,.obj,.blend" style="display:none" />
            </div>

            <!-- Model Info Form -->
            <div class="upload-modal__form">
              <div class="upload-form__group">
                <label class="upload-form__label" for="uploadName">模型名称 <span class="upload-form__required">*</span></label>
                <input type="text" class="upload-form__input" id="uploadName" placeholder="e.g. Sci-Fi Robot Guardian" maxlength="100" />
              </div>

              <div class="upload-form__row">
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadAuthor">作者名 <span class="upload-form__required">*</span></label>
                  <input type="text" class="upload-form__input" id="uploadAuthor" placeholder="你的昵称" maxlength="50" />
                </div>
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadCategory">分类</label>
                  <select class="upload-form__select" id="uploadCategory">
                    ${CATEGORIES.filter(c => c.id !== 'all').map(c =>
        `<option value="${c.id}">${c.icon} ${c.name}</option>`
    ).join('')}
                  </select>
                </div>
              </div>

              <div class="upload-form__row">
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadLicense">许可协议</label>
                  <select class="upload-form__select" id="uploadLicense">
                    <option value="CC0">CC0 (公共领域)</option>
                    <option value="CC-BY">CC-BY (署名)</option>
                    <option value="CC-BY-SA">CC-BY-SA (署名-相同方式共享)</option>
                    <option value="CC-BY-NC">CC-BY-NC (署名-非商业)</option>
                    <option value="MIT">MIT</option>
                  </select>
                </div>
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadTags">标签</label>
                  <input type="text" class="upload-form__input" id="uploadTags" placeholder="用逗号分隔: 科幻, PBR, 动画" />
                </div>
              </div>

              <div class="upload-form__group">
                <label class="upload-form__label" for="uploadDesc">描述</label>
                <textarea class="upload-form__textarea" id="uploadDesc" rows="4" placeholder="描述你的模型特点、用途、技术细节..." maxlength="500"></textarea>
              </div>

              <!-- Vertices/Polygons (optional) -->
              <div class="upload-form__row">
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadVerts">顶点数</label>
                  <input type="text" class="upload-form__input" id="uploadVerts" placeholder="e.g. 12,450" />
                </div>
                <div class="upload-form__group">
                  <label class="upload-form__label" for="uploadPolys">多边形数</label>
                  <input type="text" class="upload-form__input" id="uploadPolys" placeholder="e.g. 24,800" />
                </div>
              </div>
            </div>

            <!-- Submit -->
            <div class="upload-modal__actions">
              <button class="upload-modal__btn upload-modal__btn--cancel" id="uploadCancel">取消</button>
              <button class="upload-modal__btn upload-modal__btn--submit" id="uploadSubmit" disabled>
                <span>🚀</span> 发布模型
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize upload modal event listeners
 */
export function initUploadModal(onModelUploaded, showToast) {
    const overlay = document.getElementById('uploadOverlay');
    const closeBtn = document.getElementById('uploadClose');
    const cancelBtn = document.getElementById('uploadCancel');
    const submitBtn = document.getElementById('uploadSubmit');
    const dropzone = document.getElementById('modelDropzone');
    const fileInput = document.getElementById('modelFileInput');
    const fileRemove = document.getElementById('fileRemove');

    // Reset state
    resetUploadState();

    // ---- Open/Close ----
    function openUploadModal() {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeUploadModal() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        disposePreview();
        resetUploadState();
    }

    closeBtn.addEventListener('click', closeUploadModal);
    cancelBtn.addEventListener('click', closeUploadModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeUploadModal();
    });

    // Escape key
    const onKeyDown = (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeUploadModal();
        }
    };
    document.addEventListener('keydown', onKeyDown);

    // ---- Drag & Drop ----
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleModelFileSelect(files[0]);
        }
    });

    // ---- File Input ----
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleModelFileSelect(e.target.files[0]);
        }
    });

    // ---- File Remove ----
    fileRemove.addEventListener('click', () => {
        uploadState.modelFile = null;
        if (uploadState.modelFileUrl) {
            URL.revokeObjectURL(uploadState.modelFileUrl);
            uploadState.modelFileUrl = null;
        }
        document.getElementById('dropzoneContent').style.display = '';
        document.getElementById('dropzoneFile').style.display = 'none';
        disposePreview();
        updatePreviewPlaceholder(true);
        validateForm();
    });

    // ---- PBR Texture Inputs ----
    PBR_CHANNELS.forEach(ch => {
        const slot = document.getElementById(`pbrSlot-${ch.id}`);
        const input = document.getElementById(`pbrInput-${ch.id}`);
        const removeBtn = document.getElementById(`pbrRemove-${ch.id}`);

        // Click to upload
        slot.addEventListener('click', (e) => {
            if (e.target.closest('.pbr-slot__remove')) return;
            input.click();
        });

        // File selected
        input.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleTextureSelect(ch.id, e.target.files[0]);
            }
        });

        // Remove texture
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeTexture(ch.id);
        });

        // Drag & Drop on individual slot
        slot.addEventListener('dragover', (e) => {
            e.preventDefault();
            slot.classList.add('dragover');
        });
        slot.addEventListener('dragleave', () => {
            slot.classList.remove('dragover');
        });
        slot.addEventListener('drop', (e) => {
            e.preventDefault();
            slot.classList.remove('dragover');
            if (e.dataTransfer.files.length > 0) {
                handleTextureSelect(ch.id, e.dataTransfer.files[0]);
            }
        });
    });

    // ---- Form Validation ----
    ['uploadName', 'uploadAuthor'].forEach(id => {
        document.getElementById(id).addEventListener('input', validateForm);
    });

    // ---- Submit ----
    submitBtn.addEventListener('click', async () => {
        if (!validateForm()) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="upload-spinner"></span> 保存中...';

        try {
            const modelId = generateModelId();

            // Read files into blobs
            const files = {};

            if (uploadState.modelFile) {
                files.modelFile = await readFileAsBlob(uploadState.modelFile);
            }

            for (const [channel, file] of Object.entries(uploadState.textureFiles)) {
                if (file) {
                    files[channel] = await readFileAsBlob(file);
                }
            }

            // Determine format
            const ext = uploadState.modelFile
                ? uploadState.modelFile.name.split('.').pop().toLowerCase()
                : 'glb';

            // Build model data
            const now = new Date();
            const modelData = {
                id: modelId,
                name: document.getElementById('uploadName').value.trim(),
                author: document.getElementById('uploadAuthor').value.trim(),
                authorInitial: document.getElementById('uploadAuthor').value.trim().charAt(0).toUpperCase(),
                category: document.getElementById('uploadCategory').value,
                format: ext,
                license: document.getElementById('uploadLicense').value,
                fileSize: uploadState.modelFile
                    ? formatFileSize(uploadState.modelFile.size)
                    : '0 KB',
                vertices: document.getElementById('uploadVerts').value || '-',
                polygons: document.getElementById('uploadPolys').value || '-',
                textures: buildTextureLabel(),
                description: document.getElementById('uploadDesc').value.trim() || '社区上传的3D模型',
                tags: document.getElementById('uploadTags').value
                    .split(/[,，]/)
                    .map(t => t.trim())
                    .filter(t => t.length > 0),
                downloads: 0,
                likes: 0,
                views: 0,
                date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
                // Preview metadata
                geometryType: GEOMETRY_TYPES[Math.floor(Math.random() * GEOMETRY_TYPES.length)],
                color: '#6c5ce7',
                secondaryColor: '#00cec9',
                // Source flag
                isUploaded: true,
                hasPBR: Object.keys(uploadState.textureFiles).length > 0,
                hasModel: !!uploadState.modelFile,
            };

            await saveModel(modelData, files);

            showToast(`✅ 模型 "${modelData.name}" 发布成功！`);
            closeUploadModal();

            if (onModelUploaded) {
                onModelUploaded(modelData);
            }
        } catch (err) {
            console.error('Upload failed:', err);
            showToast('❌ 上传失败: ' + err.message);
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>🚀</span> 发布模型';
        }
    });

    return { openUploadModal, closeUploadModal };
}

// ============================================
// Internal Helpers
// ============================================

function resetUploadState() {
    // Revoke old URLs
    if (uploadState.modelFileUrl) URL.revokeObjectURL(uploadState.modelFileUrl);
    Object.values(uploadState.textureUrls).forEach(url => {
        if (url) URL.revokeObjectURL(url);
    });

    uploadState = {
        modelFile: null,
        modelFileUrl: null,
        textureFiles: {},
        textureUrls: {},
        thumbnailFile: null,
        thumbnailUrl: null,
        previewViewer: null,
        name: '',
        author: '',
        category: 'props',
        license: 'CC0',
        description: '',
        tags: '',
    };
}

function handleModelFileSelect(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const formatInfo = MODEL_FORMATS[ext];

    if (!formatInfo) {
        alert('不支持的文件格式。请使用 GLB, GLTF, FBX, OBJ, 或 BLEND 文件。');
        return;
    }

    uploadState.modelFile = file;

    // Update UI
    document.getElementById('dropzoneContent').style.display = 'none';
    document.getElementById('dropzoneFile').style.display = '';
    document.getElementById('fileName').textContent = file.name;
    document.getElementById('fileSize').textContent = formatFileSize(file.size);

    // Auto-fill name if empty
    const nameInput = document.getElementById('uploadName');
    if (!nameInput.value.trim()) {
        const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
        nameInput.value = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    }

    // Create preview for GLB/GLTF
    if (formatInfo.canPreview) {
        uploadState.modelFileUrl = URL.createObjectURL(file);
        updatePreview();
    } else {
        updatePreviewPlaceholder(false, `${formatInfo.label} 格式暂不支持在线预览`);
    }

    validateForm();
}

function handleTextureSelect(channel, file) {
    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件作为贴图');
        return;
    }

    uploadState.textureFiles[channel] = file;

    // Create preview URL
    if (uploadState.textureUrls[channel]) {
        URL.revokeObjectURL(uploadState.textureUrls[channel]);
    }
    uploadState.textureUrls[channel] = URL.createObjectURL(file);

    // Update slot UI
    const preview = document.getElementById(`pbrPreview-${channel}`);
    preview.style.backgroundImage = `url(${uploadState.textureUrls[channel]})`;
    preview.style.backgroundSize = 'cover';
    preview.style.backgroundPosition = 'center';
    preview.querySelector('.pbr-slot__icon').style.display = 'none';

    const slot = document.getElementById(`pbrSlot-${channel}`);
    slot.classList.add('has-texture');

    const removeBtn = document.getElementById(`pbrRemove-${channel}`);
    removeBtn.style.display = '';

    // Update 3D preview with new texture
    updatePreviewTextures();
}

function removeTexture(channel) {
    if (uploadState.textureUrls[channel]) {
        URL.revokeObjectURL(uploadState.textureUrls[channel]);
    }
    delete uploadState.textureFiles[channel];
    delete uploadState.textureUrls[channel];

    // Reset slot UI
    const preview = document.getElementById(`pbrPreview-${channel}`);
    preview.style.backgroundImage = '';
    preview.querySelector('.pbr-slot__icon').style.display = '';

    const slot = document.getElementById(`pbrSlot-${channel}`);
    slot.classList.remove('has-texture');

    const removeBtn = document.getElementById(`pbrRemove-${channel}`);
    removeBtn.style.display = 'none';

    const input = document.getElementById(`pbrInput-${channel}`);
    input.value = '';

    // Update 3D preview
    updatePreviewTextures();
}

function updatePreview() {
    disposePreview();
    updatePreviewPlaceholder(false);

    const container = document.getElementById('uploadPreviewContainer');

    uploadState.previewViewer = createPBRViewer(container, {
        modelUrl: uploadState.modelFileUrl,
        textures: uploadState.textureUrls,
        modelData: { geometryType: 'sphere', color: '#6c5ce7', secondaryColor: '#00cec9' },
        autoRotate: true,
        showGrid: true,
    });
}

function updatePreviewTextures() {
    if (uploadState.previewViewer) {
        uploadState.previewViewer.applyTextures(uploadState.textureUrls);
    } else if (Object.keys(uploadState.textureUrls).length > 0 && !uploadState.modelFileUrl) {
        // Create a preview with procedural geometry + textures
        updatePreviewPlaceholder(false);
        const container = document.getElementById('uploadPreviewContainer');

        disposePreview();

        uploadState.previewViewer = createPBRViewer(container, {
            modelUrl: null,
            textures: uploadState.textureUrls,
            modelData: { geometryType: 'sphere', color: '#6c5ce7', secondaryColor: '#00cec9' },
            autoRotate: true,
            showGrid: true,
        });
    }
}

function updatePreviewPlaceholder(show, message = '') {
    const placeholder = document.getElementById('previewPlaceholder');
    if (placeholder) {
        placeholder.style.display = show ? '' : 'none';
        if (message) {
            placeholder.querySelector('.upload-modal__preview-placeholder-text').textContent = message;
        }
    }
}

function disposePreview() {
    if (uploadState.previewViewer) {
        uploadState.previewViewer.dispose();
        uploadState.previewViewer = null;
    }
}

function validateForm() {
    const name = document.getElementById('uploadName').value.trim();
    const author = document.getElementById('uploadAuthor').value.trim();
    const hasFile = !!uploadState.modelFile || Object.keys(uploadState.textureFiles).length > 0;

    const isValid = name.length > 0 && author.length > 0 && hasFile;

    const submitBtn = document.getElementById('uploadSubmit');
    if (submitBtn) {
        submitBtn.disabled = !isValid;
    }

    return isValid;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function buildTextureLabel() {
    const channels = Object.keys(uploadState.textureFiles);
    if (channels.length === 0) return '无贴图';

    const labels = channels.map(ch => {
        const def = PBR_CHANNELS.find(p => p.id === ch);
        return def ? def.label : ch;
    });

    return `PBR (${labels.join(', ')})`;
}
