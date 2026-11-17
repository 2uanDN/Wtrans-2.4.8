class SimpleZipWriter {
        constructor() {
            this.entries = [];
        }

        static _makeCrcTable() {
            const table = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
                let c = i;
                for (let k = 0; k < 8; k++) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c >>> 0;
            }
            return table;
        }

        static get crcTable() {
            if (!this._crcTable) this._crcTable = this._makeCrcTable();
            return this._crcTable;
        }

        static crc32(bytes) {
            const table = this.crcTable;
            let crc = 0 ^ (-1);
            for (let i = 0; i < bytes.length; i++) {
                crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xFF];
            }
            return (crc ^ (-1)) >>> 0;
        }

        static getDosDateTime(date = new Date()) {
            const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
            const year = Math.max(1980, safeDate.getFullYear());
            const month = safeDate.getMonth() + 1;
            const day = safeDate.getDate();
            const dosDate = ((year - 1980) << 9) | (month << 5) | day;

            const hours = safeDate.getHours();
            const minutes = safeDate.getMinutes();
            const seconds = Math.floor(safeDate.getSeconds() / 2);
            const dosTime = (hours << 11) | (minutes << 5) | seconds;

            return { dosDate: dosDate & 0xFFFF, dosTime: dosTime & 0xFFFF };
        }

        /**
         * Thêm một file vào zip archive.
         * @param {string} filename - Tên file trong zip (ví dụ: "001_chuong_1.txt")
         * @param {string|Uint8Array} content - Nội dung text hoặc byte array
         * @param {Date} [date] - Thời gian tạo file
         */
        addFile(filename, content, date = new Date()) {
            const encoder = new TextEncoder();
            const fileData = typeof content === "string"
                ? encoder.encode(content)
                : (content instanceof Uint8Array ? content : encoder.encode(String(content || "")));
            const fileNameBytes = encoder.encode(String(filename || "untitled.txt"));
            const crc = SimpleZipWriter.crc32(fileData);
            const { dosDate, dosTime } = SimpleZipWriter.getDosDateTime(date);

            this.entries.push({
                nameBytes: fileNameBytes,
                data: fileData,
                crc: crc,
                size: fileData.length,
                dosDate: dosDate,
                dosTime: dosTime
            });
        }

        /**
         * Tạo Blob file .zip hoàn chỉnh.
         * @returns {Blob}
         */
        generateBlob() {
            let totalSize = 0;
            let centralDirSize = 0;
            for (const entry of this.entries) {
                totalSize += 30 + entry.nameBytes.length + entry.size;
                centralDirSize += 46 + entry.nameBytes.length;
            }
            totalSize += centralDirSize + 22; // 22 bytes cho End of Central Directory

            const buffer = new Uint8Array(totalSize);
            const view = new DataView(buffer.buffer);
            let offset = 0;
            const localOffsets = [];

            // 1. Ghi Local File Headers & File Data
            for (const entry of this.entries) {
                localOffsets.push(offset);
                // Local File Header Signature 0x04034b50
                view.setUint32(offset, 0x04034b50, true);
                view.setUint16(offset + 4, 20, true);     // Version needed to extract (2.0)
                view.setUint16(offset + 6, 0x0800, true);  // General purpose bit flag (Bit 11: UTF-8)
                view.setUint16(offset + 8, 0, true);       // Compression method (0 = Store / no compression)
                view.setUint16(offset + 10, entry.dosTime, true);
                view.setUint16(offset + 12, entry.dosDate, true);
                view.setUint32(offset + 14, entry.crc, true);
                view.setUint32(offset + 18, entry.size, true); // Compressed size
                view.setUint32(offset + 22, entry.size, true); // Uncompressed size
                view.setUint16(offset + 26, entry.nameBytes.length, true);
                view.setUint16(offset + 28, 0, true);      // Extra field length
                offset += 30;

                buffer.set(entry.nameBytes, offset);
                offset += entry.nameBytes.length;

                buffer.set(entry.data, offset);
                offset += entry.size;
            }

            const centralDirStart = offset;

            // 2. Ghi Central Directory Headers
            for (let i = 0; i < this.entries.length; i++) {
                const entry = this.entries[i];
                const localOffset = localOffsets[i];

                // Central Directory File Header Signature 0x02014b50
                view.setUint32(offset, 0x02014b50, true);
                view.setUint16(offset + 4, 20, true);     // Version made by (2.0)
                view.setUint16(offset + 6, 20, true);     // Version needed to extract (2.0)
                view.setUint16(offset + 8, 0x0800, true); // General purpose bit flag (Bit 11: UTF-8)
                view.setUint16(offset + 10, 0, true);     // Compression method (0 = Store)
                view.setUint16(offset + 12, entry.dosTime, true);
                view.setUint16(offset + 14, entry.dosDate, true);
                view.setUint32(offset + 16, entry.crc, true);
                view.setUint32(offset + 20, entry.size, true); // Compressed size
                view.setUint32(offset + 24, entry.size, true); // Uncompressed size
                view.setUint16(offset + 28, entry.nameBytes.length, true);
                view.setUint16(offset + 30, 0, true);     // Extra field length
                view.setUint16(offset + 32, 0, true);     // File comment length
                view.setUint16(offset + 34, 0, true);     // Disk number start
                view.setUint16(offset + 36, 0, true);     // Internal file attributes
                view.setUint32(offset + 38, 0, true);     // External file attributes
                view.setUint32(offset + 42, localOffset, true); // Relative offset of local header
                offset += 46;

                buffer.set(entry.nameBytes, offset);
                offset += entry.nameBytes.length;
            }

            const centralDirEnd = offset;

            // 3. Ghi End of Central Directory Record (EOCD)
            view.setUint32(offset, 0x06054b50, true);
            view.setUint16(offset + 4, 0, true); // Number of this disk
            view.setUint16(offset + 6, 0, true); // Disk where central directory starts
            view.setUint16(offset + 8, this.entries.length, true); // Total entries on this disk
            view.setUint16(offset + 10, this.entries.length, true); // Total entries in central directory
            view.setUint32(offset + 12, centralDirEnd - centralDirStart, true); // Size of central directory
            view.setUint32(offset + 16, centralDirStart, true); // Offset of start of central directory
            view.setUint16(offset + 20, 0, true); // ZIP file comment length

            return new Blob([buffer], { type: "application/zip" });
        }
    }

    const workerScriptSource = () => {
        // 1. Worker Configuration & Imports
        const workerpoolJSPath = 'https://cdn.jsdelivr.net/npm/workerpool@7.0.0/dist/workerpool.min.js';

        try {
            importScripts(workerpoolJSPath);
            // SRI enforcement không khả thi cho importScripts() — dependency được pin qua @require header.
        } catch (e) {
            console.error(`Worker: Failed to import workerpool.`, e);
            throw e;
        }

        // --- Core Text Processing Logic ---
        // Identical to TextProcessingStrategies in main thread.
        // Keep in sync: any change here must be mirrored in TextProcessingStrategies.
        const SENTENCE_ENDINGS = new Set(['.', '!', '?', '…', '。', '！', '？']);
        const QUOTE_ENDINGS = new Set(['"', '”', "'", '’', '»', '」']);
        const PAUSE_MARKS = new Set([',', ';', ':', '—', '–', '，', '、']);

        const findOptimalSplitPointWorker = (text, maxLength, allowance = 0) => {
            const maxLimit = maxLength + allowance;
            if (text.length <= maxLimit) return text.length;

            const effectiveLimit = Math.min(maxLimit, text.length);
            const minSearchIndex = Math.floor(maxLength * 0.5);
            const searchStart = Math.max(minSearchIndex, effectiveLimit - (allowance || 200));

            // Tier 1: sentence endings
            for (let i = effectiveLimit - 1; i >= searchStart; i--) {
                const char = text[i];
                if (SENTENCE_ENDINGS.has(char)) {
                    let splitIndex = i + 1;
                    if (splitIndex < text.length && QUOTE_ENDINGS.has(text[splitIndex])) splitIndex++;
                    if (char === '.' && i > 1 && splitIndex < text.length) {
                        const prev = text[i - 1];
                        const next = text[splitIndex];
                        if (/[A-Z0-9]/.test(prev) && /[a-zA-Z0-9]/.test(next)) continue;
                    }
                    if (splitIndex >= text.length || /\s/.test(text[splitIndex])) return splitIndex;
                }
            }

            // Tier 2: pause marks
            for (let i = effectiveLimit - 1; i >= searchStart; i--) {
                if (PAUSE_MARKS.has(text[i])) return i + 1;
            }

            // Tier 3: whitespace
            for (let i = effectiveLimit - 1; i >= searchStart; i--) {
                if (/\s/.test(text[i])) return i + 1;
            }

            return effectiveLimit;
        };

        const splitTextIntoChunksWorker = (text, maxCharsPerChunk, oversizeAllowance) => {
            if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

            const chunks = [];
            const parts = text.split(/(\r?\n+)/);
            let currentChunk = '';

            const limit = maxCharsPerChunk + oversizeAllowance;

            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                if (part.length === 0) continue;

                if (currentChunk.length + part.length <= limit) {
                    currentChunk += part;
                } else {
                    if (currentChunk.length > 0) {
                        chunks.push(currentChunk);
                        currentChunk = '';
                    }

                    if (part.length > limit) {
                        let remaining = part;
                        while (remaining.length > 0) {
                            if (remaining.length <= limit) {
                                currentChunk = remaining;
                                remaining = '';
                            } else {
                                const idx = findOptimalSplitPointWorker(remaining, maxCharsPerChunk, oversizeAllowance);
                                chunks.push(remaining.substring(0, idx).trimEnd());
                                remaining = remaining.substring(idx).trimStart();
                            }
                        }
                    } else {
                        currentChunk = part;
                    }
                }
            }

            if (currentChunk.trim().length > 0) chunks.push(currentChunk);

            return chunks.filter(c => c && c.trim().length > 0);
        };

        // --- Readability Worker (Vẫn giữ để trích xuất text nền, không phải render view) ---
        const loadedLibraries = {};
        function ensureLibrary(libName, codeString) {
            if (!loadedLibraries[libName] && codeString) {
                try { (new Function(codeString))(); loadedLibraries[libName] = true; }
                catch (e) { throw new Error(`Worker: Library ${libName} init failed.`); }
            }
            return loadedLibraries[libName];
        }

        function runReadabilityWorker(htmlString, readabilityCodeString, readabilityOptions = {}) {
            if (!ensureLibrary('Readability', readabilityCodeString)) throw new Error("Worker: Readability library not available.");
            const parser = new self.DOMParser();
            const doc = parser.parseFromString(htmlString, 'text/html');
            const reader = new self.Readability(doc, readabilityOptions);
            return reader.parse();
        }

        // 3. Register with Workerpool (Loại bỏ markdownToHtmlWorker)
        if (self.workerpool) {
            self.workerpool.worker({
                splitTextIntoChunksWorker: splitTextIntoChunksWorker,
                runReadabilityWorker: runReadabilityWorker
            });
        }
    };

    const workerScriptBlobUrl = URL.createObjectURL(new Blob([`(${workerScriptSource.toString()})();`], { type: 'application/javascript' }));

    const readabilityJsCodeString = (typeof GM_getResourceText === 'function' && GM_getResourceText('Readability_js')) ? GM_getResourceText('Readability_js') : "";
    const showdownJsCodeString = (typeof GM_getResourceText === 'function' && GM_getResourceText('Showdown_js')) ? GM_getResourceText('Showdown_js') : "";

    if (!readabilityJsCodeString) console.warn("WNovel Translator: Readability.js code not found via GM_getResourceText. Readability in worker might fail.");
    if (!showdownJsCodeString) console.warn("WNovel Translator: Showdown.js code not found via GM_getResourceText. Markdown rendering in worker might fail.");

    // --- 3. CORE SERVICES ---

class Logger {
        constructor(configManager) {
            this.configManager = configManager;
            this.prefix = `[${this.configManager.getScriptPrefix().replace(/_$/, '')}]`;
            this.uiManager = null;
        }

        _log(level, args) {
            let consoleFuncToUse;
            switch (level.toLowerCase()) {
                case 'success': consoleFuncToUse = console.info; break;
                case 'info':    consoleFuncToUse = console.info; break;
                case 'warn':    consoleFuncToUse = console.warn; break;
                case 'error':   consoleFuncToUse = console.error; break;
                case 'debug':   consoleFuncToUse = console.debug; break;
                default:        consoleFuncToUse = console.log;
            }
            consoleFuncToUse(this.prefix, ...args.map(arg => (arg instanceof Error ? `${arg.name}: ${arg.message}` : arg)));
            if (this.uiManager && this.uiManager.isInitialized() && level.toLowerCase() !== 'debug') {
                this.uiManager.updateStatusIndicator(args.map(arg =>
                    typeof arg === 'string' ? arg : (arg instanceof Error ? arg.message : JSON.stringify(arg))
                ).join(' '), level);
            }
        }
        debug(...args) { this._log('debug', args); }
        info(...args) { this._log('info', args); }
        warn(...args) { this._log('warn', args); }
        error(...args) { this._log('error', args); }
        success(...args) { this._log('success', args); }

        notify(message, title = "WNovel Translator", level = "info") {
            const siteName = this.uiManager?.appServices?.contentExtractorService?.currentSiteConfig?.name || 'Generic Mode';
            const logMessage = `Notification: ${title} - ${message}`;
            if (this[level.toLowerCase()] && typeof this[level.toLowerCase()] === 'function') {
                this[level.toLowerCase()](logMessage);
            } else {
                this.info(`(Loglevel: ${level}) ${logMessage}`);
            }
            GM_notification({ title: `[${siteName}] ${title}`, text: message, timeout: 4000 });
        }
    }

class StorageService {
        /**
         * @param {Logger} logger - Instance của hệ thống logging
         */
        constructor(logger) {
            this.logger = logger;
        }

        /**
         * Lấy giá trị từ storage một cách bất đồng bộ.
         * @param {string} key - Khóa lưu trữ (Storage Key)
         * @param {any} defaultValue - Giá trị dự phòng nếu khóa không tồn tại
         * @returns {Promise<any>}
         */
        async getOrDefault(key, defaultValue) {
            try {
                // Sử dụng API Promise-based native của Tampermonkey
                const value = await GM.getValue(key);
                return value !== undefined ? value : defaultValue;
            } catch (e) {
                this.logger.error(`StorageService: Error getting key '${key}'`, e);
                return defaultValue;
            }
        }

        /**
         * Lấy giá trị từ storage một cách bất đồng bộ, throw nếu có lỗi nghiêm trọng (để báo caller).
         * @param {string} key - Khóa lưu trữ (Storage Key)
         * @returns {Promise<any>} T hoặc undefined
         */
        async get(key) {
            return await GM.getValue(key);
        }

        /**
         * Lưu giá trị vào storage một cách bất đồng bộ.
         * @param {string} key - Khóa lưu trữ
         * @param {any} value - Giá trị cần lưu
         * @returns {Promise<void>}
         */
        async set(key, value) {
            try {
                await GM.setValue(key, value);
                this.logger.debug(`StorageService: Successfully set key '${key}'`);
            } catch (e) {
                this.logger.error(`StorageService: Error setting key '${key}'`, e);
            }
        }

        /**
         * Xóa giá trị khỏi storage một cách bất đồng bộ.
         * @param {string} key - Khóa lưu trữ cần xóa
         * @returns {Promise<void>}
         */
        async delete(key) {
            try {
                await GM.deleteValue(key);
                this.logger.debug(`StorageService: Successfully deleted key '${key}'`);
            } catch (e) {
                this.logger.error(`StorageService: Error deleting key '${key}'`, e);
            }
        }
    }

    class HistoryService {
        constructor(storageService, logger) {
            this.storage = storageService;
            this.logger = logger;
            this.META_KEY = 'wnovel_history_projects_meta';
            this.CONTENT_PREFIX = 'wnovel_content_';
            this.projects = [];
            this.cachedTotalSizeBytes = undefined;
        }

        async loadProjects() {
            try {
                // 3.1.a & 3.1.b: Migration transaction check
                const legacyData = await this.storage.getOrDefault('wnovel_history_projects', null);
                const currentData = await this.storage.getOrDefault(this.META_KEY, null);

                if (legacyData && currentData) {
                    this.logger.warn('HistoryService: Both legacy key and meta key exist (Interrupted Migration). Re-attempting migration...');
                }

                if (legacyData && Array.isArray(legacyData) && legacyData.length > 0) {
                    this.logger.info('HistoryService: Found legacy data, starting migration to sharded structure...');
                    // Deep copy to avoid mutating the pulled legacyData directly
                    this.projects = JSON.parse(JSON.stringify(legacyData));

                    let totalSize = 0;
                    let migrationHasErrors = false;

                    // 1 & 2. Write ALL sharded content keys (catch per key)
                    for (const proj of this.projects) {
                        for (const chap of proj.chapters) {
                            if (chap.hasOwnProperty('content')) {
                                try {
                                    await this.storage.set(this.CONTENT_PREFIX + chap.id, chap.content);
                                    totalSize += (chap.content ? chap.content.length * 2 : 0);
                                    delete chap.content; // Strip content from metadata
                                } catch (e) {
                                    migrationHasErrors = true;
                                    this.logger.error(`HistoryService: Error migrating content for chapter ${chap.id}`, e);
                                }
                            }
                        }
                    }

                    try {
                        // 3. Write NEW meta key (commit point)
                        await this.storage.set(this.META_KEY, this.projects);
                        this.cachedTotalSizeBytes = totalSize + (JSON.stringify(this.projects).length * 2);

                        // 4. Nếu step 3 thành công và không fail phần content -> xóa legacy key
                        if (!migrationHasErrors) {
                            await this.storage.delete('wnovel_history_projects');
                            this.logger.info('HistoryService: Migration completed successfully. Legacy key deleted.');
                        } else {
                            // 3.1.c: mark as partial, DO NOT delete legacy key
                            this.logger.warn('HistoryService: Migration partial due to content write errors. Legacy data retained.');
                            if (typeof this.logger.notify === 'function') {
                                this.logger.notify("Partial error while converting data. Some stored chapters may contain corrupted content. The system has preserved the original data for safety.", "Migration Warning", "warn");
                            }
                        }
                    } catch (metaErr) {
                        // 5. Nếu bước ghi meta key (commit) fail -> không xóa, báo lỗi, dùng nguyên dữ liệu legacy
                        this.logger.error('HistoryService: Error saving meta key during migration. Legacy key retained.', metaErr);
                        this.projects = legacyData;
                    }
                } else if (currentData) {
                    this.projects = Array.isArray(currentData) ? currentData : [];
                } else {
                    this.projects = [];
                }

                // Do a background limit check on initial load without blocking
                setTimeout(() => this.checkStorageLimit(), 5000);

                return this.projects;
            } catch (error) {
                this.logger.error('HistoryService: Error loading projects', error);
                return [];
            }
        }

        async saveProjects() {
            try {
                await this.storage.set(this.META_KEY, this.projects);
            } catch (error) {
                this.logger.error('HistoryService: Error saving projects meta', error);
            }
        }

        async createProject(name) {
            const newProject = {
                id: 'proj_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: name,
                createdAt: Date.now(),
                chapters: []
            };
            this.projects.push(newProject);
            await this.saveProjects();
            return newProject;
        }

        async deleteProject(projectId) {
            const project = this.projects.find(p => p.id === projectId);
            if (project) {
                // Delete sharded contents
                for (const chap of project.chapters) {
                    await this.storage.delete(this.CONTENT_PREFIX + chap.id);
                }
            }
            this.projects = this.projects.filter(p => p.id !== projectId);
            await this.saveProjects();
            this.cachedTotalSizeBytes = undefined; // Force recalc next time
        }

        async getChapterContent(chapterId) {
            try {
                return await this.storage.getOrDefault(this.CONTENT_PREFIX + chapterId, "");
            } catch (e) {
                this.logger.error(`HistoryService: Error getting content for chapter ${chapterId}`, e);
                return "";
            }
        }

        async addChapterToProject(projectId, chapterName, content) {
            const project = this.projects.find(p => p.id === projectId);
            if (!project) throw new Error('Project not found');

            const newChapter = {
                id: 'chap_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                name: chapterName,
                createdAt: Date.now()
            };

            project.chapters.push(newChapter);

            // Sharded Write
            await this.storage.set(this.CONTENT_PREFIX + newChapter.id, content);
            await this.saveProjects();

            this.checkStorageLimit(content ? content.length : 0);
            return newChapter;
        }

        async deleteChapterFromProject(projectId, chapterId) {
            const project = this.projects.find(p => p.id === projectId);
            if (!project) return;

            await this.storage.delete(this.CONTENT_PREFIX + chapterId);
            project.chapters = project.chapters.filter(c => c.id !== chapterId);
            await this.saveProjects();
            this.cachedTotalSizeBytes = undefined; // Force recalc next time
        }

        getProject(projectId) {
            return this.projects.find(p => p.id === projectId);
        }

        async checkStorageLimit(newContentLength = 0) {
            try {
                if (this.cachedTotalSizeBytes === undefined) {
                    // Lazy exact calculation
                    let estimatedBytes = JSON.stringify(this.projects).length * 2;
                    for (const proj of this.projects) {
                        for (const chap of proj.chapters) {
                            const val = await this.getChapterContent(chap.id);
                            estimatedBytes += (val ? val.length * 2 : 0);
                        }
                    }
                    this.cachedTotalSizeBytes = estimatedBytes;
                } else if (newContentLength > 0) {
                    // Incremental update
                    this.cachedTotalSizeBytes += (newContentLength * 2) + 150; // 150 is approx meta size
                }

                const FILE_LIMIT_MB = 5;
                const limitBytes = FILE_LIMIT_MB * 1024 * 1024;

                if (this.cachedTotalSizeBytes > limitBytes) {
                    const sizeMB = (this.cachedTotalSizeBytes / (1024 * 1024)).toFixed(2);
                    this.logger.notify(
                        `Translation cache (History) is currently using approximately ${sizeMB}MB (Recommended: < ${FILE_LIMIT_MB}MB). Please download completed projects and "Delete Chapters/Projects" to free up storage, helping prevent lag or data loss!`,
                        "Storage Warning",
                        "warn"
                    );
                }
            } catch (e) {
                this.logger.error('HistoryService: Error checking storage limit', e);
            }
        }
    }

    class SettingsService {
        constructor(storageService, logger, configManager) {
            this.storage = storageService;
            this.logger = logger;
            this.configManager = configManager;
            this.settings = {};
        }

        async loadSettings() {
            const defaultSettings = this.configManager.getAllDefaultSettings();
            const loadedSettings = {};
            let templatesUpdated = false;

            for (const internalKey of Object.keys(this.configManager.SETTING_KEYS)) {
                const settingKeyConstant = this.configManager.SETTING_KEYS[internalKey];

                // Skip RESULT_MODAL_STATE in initial bulk load; it's handled separately.
                if (settingKeyConstant === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                    continue;
                }

                const storageKey = this.configManager.getStorageKeyForSetting(settingKeyConstant);
                const defaultValue = defaultSettings[settingKeyConstant]; // Can be undefined if no default (like RESULT_MODAL_STATE)

                if (storageKey === undefined) {
                    this.logger.warn(`SettingsService: No storage key for internal key const '${internalKey}' (value: ${settingKeyConstant}). Using default.`);
                    if (defaultValue !== undefined) {
                        loadedSettings[settingKeyConstant] = typeof defaultValue === 'object' && defaultValue !== null ? JSON.parse(JSON.stringify(defaultValue)) : defaultValue;
                    }
                    continue;
                }
                let value;
                const isCritical = [this.configManager.SETTING_KEYS.API_KEYS_LIST, this.configManager.SETTING_KEYS.SELECTED_API_KEY, this.configManager.SETTING_KEYS.SELECTED_MODEL].includes(settingKeyConstant);

                if (isCritical) {
                    try {
                        const rawValue = await this.storage.get(storageKey);
                        value = rawValue !== undefined ? rawValue : defaultValue;
                    } catch (e) {
                        this.logger.warn(`SettingsService: Critical error reading critical setting '${internalKey}' (key: ${storageKey}). Reverted to default; previously saved data may be lost.`, e);
                        value = typeof defaultValue === 'object' && defaultValue !== null ? JSON.parse(JSON.stringify(defaultValue)) : defaultValue;
                    }
                } else {
                    value = await this.storage.getOrDefault(storageKey, defaultValue);
                }

                if (settingKeyConstant === this.configManager.SETTING_KEYS.API_KEYS_LIST && !Array.isArray(value)) {
                    this.logger.warn(`Stored API_KEYS_LIST (key: ${storageKey}) is not an array. Resetting to default.`);
                    value = JSON.parse(JSON.stringify(defaultValue));
                }
                if (settingKeyConstant === this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP && (typeof value !== 'object' || value === null || Array.isArray(value))) {
                    this.logger.warn(`Stored CONTEXT_TEMPLATES_MAP (key: ${storageKey}) is not an object. Resetting to default.`);
                    value = JSON.parse(JSON.stringify(defaultValue));
                }
                if (settingKeyConstant === this.configManager.SETTING_KEYS.SAVED_CUSTOM_PROMPTS) {
                    if (!Array.isArray(value) || !value.every(p => p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.content === 'string')) {
                        this.logger.warn(`Stored ${settingKeyConstant} (key: ${storageKey}) is not a valid array of prompts. Resetting to default.`);
                        value = JSON.parse(JSON.stringify(defaultValue));
                    } else {
                        const defaultPrompts = JSON.parse(JSON.stringify(defaultValue));
                        const userPromptIds = new Set(value.map(p => p.id));
                        let merged = false;
                        defaultPrompts.forEach(dp => {
                            if (!userPromptIds.has(dp.id)) {
                                value.push(dp); merged = true;
                            }
                        });
                        if (merged) this.logger.info(`Merged default custom prompts into user's saved prompts for ${settingKeyConstant}.`);
                    }
                }
                if (settingKeyConstant === this.configManager.SETTING_KEYS.MAIN_CONTROLS_MINIMIZED && typeof value !== 'boolean') {
                    this.logger.warn(`Stored ${settingKeyConstant} (key: ${storageKey}) is not a boolean. Resetting to default.`);
                    value = defaultValue;
                }

                if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
                     if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        if (settingKeyConstant === this.configManager.SETTING_KEYS.SAFETY_CONFIG && value.settings && defaultValue.settings) {
                            value.settings = { ...defaultValue.settings, ...value.settings };
                        }
                        value = { ...defaultValue, ...value };
                    } else if (defaultValue !== undefined) { // Ensure default is not undefined
                        this.logger.warn(`Stored value for ${settingKeyConstant} (key: ${storageKey}) is not a compatible object, but default is. Using full default object.`);
                        value = JSON.parse(JSON.stringify(defaultValue));
                    }
                }
                if (value !== undefined) { // Only assign if value (or default) is actually defined
                   loadedSettings[settingKeyConstant] = value;
                }
            }

            if (loadedSettings[this.configManager.SETTING_KEYS.API_KEYS_LIST] && !loadedSettings[this.configManager.SETTING_KEYS.API_KEYS_LIST].includes(loadedSettings[this.configManager.SETTING_KEYS.SELECTED_API_KEY])) {
                loadedSettings[this.configManager.SETTING_KEYS.SELECTED_API_KEY] = loadedSettings[this.configManager.SETTING_KEYS.API_KEYS_LIST][0] || null;
            }

            const defaultCtxTemplates = defaultSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP];
            if (loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP]) {
                for (const templateName in defaultCtxTemplates) {
                    if (!loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP].hasOwnProperty(templateName)) {
                        loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP][templateName] = defaultCtxTemplates[templateName];
                        templatesUpdated = true;
                    }
                }
                if (!loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP].hasOwnProperty(loadedSettings[this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME])) {
                    loadedSettings[this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME] = this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
                    if (!loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP].hasOwnProperty(loadedSettings[this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME])) {
                        loadedSettings[this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME] = Object.keys(loadedSettings[this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP])[0] || null;
                    }
                }
            }

            this.settings = loadedSettings;
            this.logger.info("Settings loaded (excluding modal state):", JSON.parse(JSON.stringify(this.settings)));
            if (templatesUpdated) {
                this.logger.info("Default context templates merged, saving settings...");
                await this.saveSettings();
            }
        }

        async saveSettings() {
            const pairsToSave = [];
            for (const internalKey in this.settings) {
                if (this.settings.hasOwnProperty(internalKey) &&
                    (this.configManager.getAllDefaultSettings().hasOwnProperty(internalKey) ||
                     internalKey === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE)
                   ) {
                    const storageKey = this.configManager.getStorageKeyForSetting(internalKey);
                    if (!storageKey) {
                        if (internalKey !== 'logger' && internalKey !== this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                           this.logger.warn(`SettingsService: Cannot save setting '${internalKey}', no storage key mapping found.`);
                        }
                        continue;
                    }
                    pairsToSave.push([storageKey, this.settings[internalKey]]);
                } else if (!this.configManager.getAllDefaultSettings().hasOwnProperty(internalKey) && internalKey !== 'logger' && internalKey !== this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                    this.logger.warn(`SettingsService: Attempted to save unknown setting '${internalKey}'. Skipping.`);
                }
            }

            const results = await Promise.allSettled(pairsToSave.map(([k, v]) => this.storage.set(k, v)));
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
                this.logger.error("Failed to save some settings:", failed.map(f => f.reason));
            }
            this.logger.info("Settings saved.");
        }

        get(internalSettingKey) {
            // RESULT_MODAL_STATE is not in DEFAULT_SETTINGS, handle separately
            if (internalSettingKey === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                const value = this.settings[internalSettingKey]; // Loaded by specific loader
                return typeof value === 'object' && value !== null ? JSON.parse(JSON.stringify(value)) : value;
            }
            if (this.configManager.getAllDefaultSettings().hasOwnProperty(internalSettingKey)) {
                const value = this.settings[internalSettingKey];
                if (typeof value === 'object' && value !== null) {
                    return JSON.parse(JSON.stringify(value));
                }
                return value;
            }
            this.logger.warn(`Attempted to get unknown setting: ${internalSettingKey}`);
            return undefined;
        }

        set(internalSettingKey, value) {
            if (internalSettingKey === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                this.settings[internalSettingKey] = value;
                // No deep merge logic for modal state; it's set as a whole or null.
                return;
            }
            if (this.configManager.getAllDefaultSettings().hasOwnProperty(internalSettingKey)) {
                 if ( (internalSettingKey === this.configManager.SETTING_KEYS.SAFETY_CONFIG ||
                       internalSettingKey === this.configManager.SETTING_KEYS.MODEL_CONFIG ||
                       internalSettingKey === this.configManager.SETTING_KEYS.DISPLAY_SETTINGS) &&
                    typeof value === 'object' && value !== null &&
                    typeof this.settings[internalSettingKey] === 'object' && this.settings[internalSettingKey] !== null) {
                    const oldSettings = this.settings[internalSettingKey];
                    this.settings[internalSettingKey] = { ...oldSettings, ...value };
                    if (internalSettingKey === this.configManager.SETTING_KEYS.SAFETY_CONFIG && value.settings) {
                         this.settings[internalSettingKey].settings = { ...(oldSettings.settings || {}), ...(value.settings || {}) };
                    }
                } else {
                    this.settings[internalSettingKey] = value;
                }
            } else {
                this.logger.warn(`Attempted to set unknown setting: ${internalSettingKey}. Ignoring.`);
            }
        }

        getSavedCustomPrompts() {
            const prompts = this.get(this.configManager.SETTING_KEYS.SAVED_CUSTOM_PROMPTS);
            return Array.isArray(prompts) ? JSON.parse(JSON.stringify(prompts)) : [];
        }
        async updateSavedCustomPrompt(promptId, newName, newContent) {
            const prompts = this.getSavedCustomPrompts();
            const index = prompts.findIndex(p => p.id === promptId);
            if (index === -1) {
                this.logger.warn(`Custom prompt with ID ${promptId} not found for update.`);
                return false;
            }
            prompts[index].name = newName.trim();
            prompts[index].content = newContent;
            this.set(this.configManager.SETTING_KEYS.SAVED_CUSTOM_PROMPTS, prompts);
            await this.saveSettings();
            this.logger.info(`Custom prompt "${newName}" (ID: ${promptId}) updated and settings saved.`);
            return true;
        }
        getMainControlsMinimizedState() {
            return this.get(this.configManager.SETTING_KEYS.MAIN_CONTROLS_MINIMIZED);
        }
        async setMainControlsMinimizedState(isMinimized) {
            if (typeof isMinimized !== 'boolean') {
                this.logger.warn(`Invalid value for setMainControlsMinimizedState: ${isMinimized}. Must be boolean.`);
                return;
            }
            this.set(this.configManager.SETTING_KEYS.MAIN_CONTROLS_MINIMIZED, isMinimized);
            await this.saveSettings();
            this.logger.info(`Main controls minimized state set to: ${isMinimized} and saved.`);
        }

        // --- New methods for ResultModal state ---
        async saveResultModalState(state) {
            if (!this.configManager || !this.storage) {
                console.warn("SettingsService.saveResultModalState: Dependencies not ready."); return;
            }
            const storageKey = this.configManager.getStorageKeyForSetting(this.configManager.SETTING_KEYS.RESULT_MODAL_STATE);
            if (!storageKey) {
                 this.logger.error("Storage key for RESULT_MODAL_STATE not found in ConfigManager."); return;
            }
            await this.storage.set(storageKey, state);
            this.logger.debug("Result modal state saved:", state ? "data present" : "cleared");
        }

        async loadResultModalState() {
            if (!this.configManager || !this.storage) {
                console.warn("SettingsService.loadResultModalState: Dependencies not ready."); return null;
            }
            const storageKey = this.configManager.getStorageKeyForSetting(this.configManager.SETTING_KEYS.RESULT_MODAL_STATE);
            if (!storageKey) {
                this.logger.error("Storage key for RESULT_MODAL_STATE not found in ConfigManager."); return null;
            }
            const state = await this.storage.getOrDefault(storageKey, null); // Default to null if not found
            this.logger.debug("Result modal state loaded:", state ? `data for ${state.pageUrl || 'unknown URL'}` : "null");
            return state;
        }

        async clearResultModalState() {
            if (!this.configManager || !this.storage) {
                 console.warn("SettingsService.clearResultModalState: Dependencies not ready."); return;
            }
            const storageKey = this.configManager.getStorageKeyForSetting(this.configManager.SETTING_KEYS.RESULT_MODAL_STATE);
            if (!storageKey) {
                 this.logger.error("Storage key for RESULT_MODAL_STATE not found in ConfigManager."); return;
            }
            await this.storage.delete(storageKey); // Use delete if available, or set to null
            this.logger.info("Result modal state cleared from storage.");
        }
    }