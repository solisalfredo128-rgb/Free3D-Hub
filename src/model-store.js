/**
 * Free3D Hub - Model Store (IndexedDB)
 * 
 * Stores uploaded 3D models and PBR textures locally using IndexedDB.
 * In production, this would be replaced with a cloud storage backend.
 */

const DB_NAME = 'Free3DHubDB';
const DB_VERSION = 1;
const STORE_MODELS = 'models';
const STORE_FILES = 'files';

let dbInstance = null;

/**
 * Open / create the IndexedDB database
 */
function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;

            // Models metadata store
            if (!db.objectStoreNames.contains(STORE_MODELS)) {
                const modelStore = db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
                modelStore.createIndex('category', 'category', { unique: false });
                modelStore.createIndex('date', 'date', { unique: false });
                modelStore.createIndex('name', 'name', { unique: false });
            }

            // Binary files store (model files + textures)
            if (!db.objectStoreNames.contains(STORE_FILES)) {
                db.createObjectStore(STORE_FILES, { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            dbInstance = e.target.result;
            resolve(dbInstance);
        };

        request.onerror = (e) => {
            reject(new Error('Failed to open IndexedDB: ' + e.target.error));
        };
    });
}

/**
 * Save a model record + associated files to IndexedDB
 */
export async function saveModel(modelData, files) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_MODELS, STORE_FILES], 'readwrite');
        const modelStore = tx.objectStore(STORE_MODELS);
        const fileStore = tx.objectStore(STORE_FILES);

        // Save model metadata
        modelStore.put(modelData);

        // Save files (model file + PBR textures)
        for (const [key, fileData] of Object.entries(files)) {
            if (fileData) {
                fileStore.put({
                    id: `${modelData.id}_${key}`,
                    modelId: modelData.id,
                    type: key,
                    blob: fileData.blob,
                    name: fileData.name,
                    mimeType: fileData.mimeType,
                    size: fileData.size,
                });
            }
        }

        tx.oncomplete = () => resolve(modelData);
        tx.onerror = (e) => reject(new Error('Failed to save model: ' + e.target.error));
    });
}

/**
 * Get all uploaded models
 */
export async function getAllModels() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readonly');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (e) => reject(new Error('Failed to get models: ' + e.target.error));
    });
}

/**
 * Get a specific model by ID
 */
export async function getModel(id) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_MODELS, 'readonly');
        const store = tx.objectStore(STORE_MODELS);
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(new Error('Failed to get model: ' + e.target.error));
    });
}

/**
 * Get a file associated with a model
 */
export async function getFile(modelId, fileType) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FILES, 'readonly');
        const store = tx.objectStore(STORE_FILES);
        const request = store.get(`${modelId}_${fileType}`);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(new Error('Failed to get file: ' + e.target.error));
    });
}

/**
 * Get all files for a model
 */
export async function getModelFiles(modelId) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_FILES, 'readonly');
        const store = tx.objectStore(STORE_FILES);
        const request = store.getAll();

        request.onsuccess = () => {
            const files = (request.result || []).filter(f => f.modelId === modelId);
            const fileMap = {};
            files.forEach(f => { fileMap[f.type] = f; });
            resolve(fileMap);
        };
        request.onerror = (e) => reject(new Error('Failed to get files: ' + e.target.error));
    });
}

/**
 * Delete a model and all its files
 */
export async function deleteModel(id) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_MODELS, STORE_FILES], 'readwrite');
        const modelStore = tx.objectStore(STORE_MODELS);
        const fileStore = tx.objectStore(STORE_FILES);

        modelStore.delete(id);

        // Delete all associated files
        const fileTypes = ['modelFile', 'albedo', 'normal', 'metallic', 'roughness', 'ao', 'emissive', 'height', 'thumbnail'];
        fileTypes.forEach(type => {
            fileStore.delete(`${id}_${type}`);
        });

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(new Error('Failed to delete model: ' + e.target.error));
    });
}

/**
 * Generate a unique model ID
 */
export function generateModelId() {
    return 'usr-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
}

/**
 * Read a File as an ArrayBuffer and return blob info
 */
export function readFileAsBlob(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve({
                blob: new Blob([reader.result], { type: file.type }),
                name: file.name,
                mimeType: file.type,
                size: file.size,
            });
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Create an object URL from a stored file
 */
export function createFileURL(fileRecord) {
    if (!fileRecord || !fileRecord.blob) return null;
    return URL.createObjectURL(fileRecord.blob);
}
