class ApiService {
        constructor(settingsService, logger, configManager) {
            this.settingsService = settingsService;
            this.logger = logger;
            this.configManager = configManager;
            this.roundRobinIndices = {};
        }

        resetProviderIndex(providerId) {
            delete this.roundRobinIndices[providerId];
        }

        _getNextApiKey(provider) {
            let keys = [];
            if (provider.apiKeys && provider.apiKeys.length > 0) {
                keys = provider.apiKeys;
            } else if (provider.apiKey) {
                keys = [provider.apiKey];
            } else if (provider.type === this.configManager.getConstant('PROVIDER_TYPES').GEMINI) {
                // Fallback to global API_KEYS_LIST for legacy support
                keys = this.settingsService.get(this.configManager.SETTING_KEYS.API_KEYS_LIST) || [];
            }

            if (!keys || keys.length === 0) return null;
            if (keys.length === 1) return keys[0];

            if (this.roundRobinIndices[provider.id] === undefined || this.roundRobinIndices[provider.id] >= keys.length) {
                this.roundRobinIndices[provider.id] = 0;
            }

            const key = keys[this.roundRobinIndices[provider.id]];
            this.roundRobinIndices[provider.id] = (this.roundRobinIndices[provider.id] + 1) % keys.length;
            this.logger.debug(`Round Robin: Using key index ${this.roundRobinIndices[provider.id] === 0 ? keys.length - 1 : this.roundRobinIndices[provider.id] - 1} for provider ${provider.id}`);
            return key;
        }

        /**
         * Composes a caller-supplied AbortSignal with an auto-expiring timeout.
         * The returned dispose() MUST be called once the operation completes —
         * whether it succeeds, fails, or is cancelled — to clear the timer.
         *
         * @param {AbortSignal|null} userSignal - Signal from TranslationOrchestrator.
         * @param {number} timeoutMs            - Hard cap in milliseconds.
         * @returns {{ signal: AbortSignal, dispose: () => void }}
         */
        _createTimedSignal(userSignal, timeoutMs) {
            const controller = new AbortController();
            let timeoutId = null;
            let forwardFn = null;

            // Already-aborted signal: propagate immediately, no timer needed.
            if (userSignal?.aborted) {
                controller.abort(userSignal.reason);
                return { signal: controller.signal, dispose: () => {} };
            }

            timeoutId = setTimeout(() => {
                controller.abort(new DOMException(
                    `API call timed out after ${timeoutMs / 1000}s`, 'TimeoutError'
                ));
            }, timeoutMs);

            if (userSignal) {
                forwardFn = () => {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                    controller.abort(userSignal.reason ?? new DOMException('Aborted', 'AbortError'));
                };
                userSignal.addEventListener('abort', forwardFn, { once: true });
            }

            return {
                signal: controller.signal,
                dispose: () => {
                    if (timeoutId !== null) { clearTimeout(timeoutId); timeoutId = null; }
                    if (forwardFn && userSignal) userSignal.removeEventListener('abort', forwardFn);
                }
            };
        }

        async testConnection(modelId, useActualConfig = false) {
            const cfg = this.configManager;
            const settings = this.settingsService;

            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const provider = providers.find(p => p.id === activeProviderId);

            if (!provider) throw new Error("No active provider found.");

            const isGemini = provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI;
            let apiKey = this._getNextApiKey(provider);
            if (!apiKey) throw new Error("API Key is missing.");

            const testContext = "Reply with 'OK'";
            const testText = "Hello";
            let modelParams = { temperature: 0.1, topP: 0.9, topK: 10, maxOutputTokens: 10 };
            let safetySettingsConfig = { enabled: false };

            if (useActualConfig) {
                modelParams = this.settingsService.get(this.configManager.SETTING_KEYS.MODEL_CONFIG) || modelParams;
                safetySettingsConfig = this.settingsService.get(this.configManager.SETTING_KEYS.SAFETY_CONFIG) || safetySettingsConfig;
            }

            return new Promise((resolve, reject) => {
                const callbacks = {
                    onChunk: () => {},
                    onComplete: () => resolve(true),
                    onError: (err) => reject(err)
                };

                if (isGemini) {
                    this._callGeminiStream(apiKey, modelId, testContext, testText, modelParams, safetySettingsConfig, callbacks).catch(reject);
                } else {
                    // Pass apiKey to _callCustomStream
                    this._callCustomStream(provider, apiKey, modelId, testContext, testText, modelParams, callbacks).catch(reject);
                }
            });
        }

        async callAPIStream(textToTranslate, { onChunk, onComplete, onError, abortSignal }, customContext = null) {
            const cfg = this.configManager;
            const settings = this.settingsService;

            let baseContext = "";
             if (!customContext) {
                const contextTemplatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP);
                const selectedTemplateName = settings.get(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
                if (contextTemplatesMap && selectedTemplateName && contextTemplatesMap[selectedTemplateName]) {
                    baseContext = contextTemplatesMap[selectedTemplateName];
                } else {
                    baseContext = cfg.getDefaultSetting(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP)[cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME)];
                    this.logger.warn(`Selected context template "${selectedTemplateName}" not found. Using default translation prompt.`);
                }
            }
            const effectiveContext = customContext || baseContext;

            if (!textToTranslate && !effectiveContext) {
                 const noInputError = new Error("No text to translate and no effective context provided."); if (onError) onError(noInputError); throw noInputError;
            }

            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const provider = providers.find(p => p.id === activeProviderId);

            if (!provider) {
                const err = new Error("No active provider found.");
                if (onError) onError(err); throw err;
            }

            const isGemini = provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI;

            let apiKey = this._getNextApiKey(provider);

            const model = settings.get(cfg.SETTING_KEYS.SELECTED_MODEL);
            const modelParams = settings.get(cfg.SETTING_KEYS.MODEL_CONFIG) || {};
            const safetySettingsConfig = settings.get(cfg.SETTING_KEYS.SAFETY_CONFIG) || cfg.getDefaultSetting(cfg.SETTING_KEYS.SAFETY_CONFIG);

            if (!apiKey) { const noApiKeyError = new Error("API Key is missing or not selected."); if (onError) onError(noApiKeyError); throw noApiKeyError; }

            if (isGemini) {
                await this._callGeminiStream(apiKey, model, effectiveContext, textToTranslate, modelParams, safetySettingsConfig, { onChunk, onComplete, onError, abortSignal });
            } else {
                await this._callCustomStream(provider, apiKey, model, effectiveContext, textToTranslate, modelParams, { onChunk, onComplete, onError, abortSignal });
            }
        }

        async _callGeminiStream(apiKey, model, effectiveContext, textToTranslate, modelParams, safetySettingsConfig, { onChunk, onComplete, onError, abortSignal }) {
            // API key is transmitted via 'x-goog-api-key' request header, not as a URL
            // query parameter. This prevents the key from appearing in server/proxy access
            // logs, Referer headers, and URL-level caches.
            // Residual exposure: key is visible in browser DevTools request headers —
            // unavoidable for any direct client-side API integration. Route through a
            // server-side proxy to eliminate client-side key exposure entirely.
            const apiUrl = `${this.configManager.getGeminiBaseUrl()}${model}:streamGenerateContent?alt=sse`;

            let safetySettingsPayload = [];
            if (safetySettingsConfig.enabled && safetySettingsConfig.settings) {
                safetySettingsPayload = Object.entries(safetySettingsConfig.settings).map(([category, threshold]) => ({ category, threshold }));
            } else {
                 const allCategories = this.configManager.getConstant('SAFETY_CATEGORIES_MAP') || {};
                 safetySettingsPayload = Object.keys(allCategories).map(categoryApiName => ({ category: categoryApiName, threshold: 'BLOCK_NONE' }));
            }

            const contentParts = [];
            if (effectiveContext) contentParts.push({ text: effectiveContext });
            if (textToTranslate && textToTranslate.trim() !== "") {
                 contentParts.push({ text: (effectiveContext && !effectiveContext.toLowerCase().includes("original text:") ? "\n\n" : "") + "Original Text:\n" + textToTranslate });
            }

            const requestBody = {
                contents: [{ role: "user", parts: contentParts }],
                generationConfig: {
                    temperature: modelParams.temperature, topP: modelParams.topP, topK: modelParams.topK, maxOutputTokens: modelParams.maxOutputTokens,
                },
                safetySettings: safetySettingsPayload
            };

            const { signal: fetchSignal, dispose: disposeSignal } = this._createTimedSignal(abortSignal, 120_000);
            try {
                this.logger.info(`Calling Gemini API (stream) for model: ${model}. Safety Enabled: ${safetySettingsConfig.enabled}. Context: "${effectiveContext ? effectiveContext.substring(0,50) : 'N/A'}..."`);
                this.logger.debug("Request body:", JSON.stringify(requestBody).substring(0, 500) + "...");
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
                    body: JSON.stringify(requestBody),
                    signal: fetchSignal
                });

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') ?? response.headers.get('retry-after');
                    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
                    const err = Object.assign(
                        new Error(`Rate limit exceeded (429). Retry after ${Math.ceil(retryAfterMs / 1000)}s.`),
                        { isRateLimitError: true, retryAfterMs }
                    );
                    if (onError) onError(err);
                    throw err;
                }

                if (!response.ok) {
                    let errorBodyText = "Could not read error details from API response.";
                    try { errorBodyText = await response.text(); } catch (e) { this.logger.warn("Failed to read text from error response body", e); }
                    this.logger.error("API Stream Error:", response.status, response.statusText, "Body:", errorBodyText.substring(0, 500));
                    const apiError = new Error(`API request failed: ${response.status} ${response.statusText}. Details: ${errorBodyText.substring(0,200)}`);
                    if (onError) onError(apiError); throw apiError;
                }
                if (!response.body) { const noBodyError = new Error("API response has no body stream."); if (onError) onError(noBodyError); throw noBodyError; }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let fullAccumulatedText = "";
                let finalFinishReason = null;

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        this._flushSSEBuffer(buffer, (jsonString) => {
                            try {
                                const json = JSON.parse(jsonString);
                                const textPart = Utils.extractTextFromGeminiSSEChunk(json);
                                if (textPart) { if (onChunk) onChunk(textPart, true); fullAccumulatedText += textPart; }
                            } catch (e) { this.logger.warn("Error parsing JSON from final SSE buffer:", jsonString, e.message); }
                        });

                        if (finalFinishReason === null) {
                            const err = new Error("Stream ended abruptly without a finish reason (connection dropped).");
                            if (onError) onError(err);
                            throw err;
                        }

                        if (onComplete) onComplete({ finalText: fullAccumulatedText, finishReason: finalFinishReason });
                        return { finalText: fullAccumulatedText, finishReason: finalFinishReason };
                    }
                    buffer += decoder.decode(value, { stream: true });
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                        const line = buffer.substring(0, newlineIndex).trimEnd();
                        buffer = buffer.substring(newlineIndex + 1);
                        if (line.startsWith("data:")) {
                            const jsonString = line.substring(5).trimStart();
                            if (jsonString) {
                                try {
                                    const json = JSON.parse(jsonString);
                                    const textPart = Utils.extractTextFromGeminiSSEChunk(json);
                                    const candidate = json.candidates?.[0];
                                    if (candidate?.finishReason && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED') {
                                        finalFinishReason = candidate.finishReason;
                                    }
                                    if (textPart) {
                                        const isCandidateFinishChunk = !!(candidate?.finishReason && candidate.finishReason !== 'FINISH_REASON_UNSPECIFIED');
                                        if (onChunk) onChunk(textPart, isCandidateFinishChunk);
                                        fullAccumulatedText += textPart;
                                    }
                                } catch (e) {
                                    const parseError = new Error(`Error processing SSE stream data: "${e.message}" on line: "${jsonString.substring(0, 100)}..."`);
                                    if (onError) onError(parseError); throw parseError;
                                }
                            }
                        } else if (line.startsWith("event:") || line.startsWith("id:") || line.trim() === "") { continue;
                        } else if (line) { this.logger.warn("SSE stream: Unhandled or invalid line:", line); }
                    }
                }
            } catch (error) {
                if (onError) onError(error);
                throw error;
            } finally {
                disposeSignal();
            }
        }

        async _callCustomStream(provider, apiKey, model, effectiveContext, textToTranslate, modelParams, { onChunk, onComplete, onError, abortSignal }) {
            let baseUrl = provider.baseUrl;
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            const apiUrl = `${baseUrl}/chat/completions`;

            const messages = [];
            if (effectiveContext) {
                messages.push({ role: "system", content: effectiveContext });
            }
            if (textToTranslate) {
                messages.push({ role: "user", content: textToTranslate });
            }

            const requestBody = {
                model: model,
                messages: messages,
                temperature: modelParams.temperature,
                top_p: modelParams.topP,
                max_tokens: modelParams.maxOutputTokens,
                stream: true
            };

            const { signal: fetchSignal, dispose: disposeSignal } = this._createTimedSignal(abortSignal, 120_000);
            try {
                this.logger.info(`Calling Custom API (stream) for model: ${model}. Context: "${effectiveContext ? effectiveContext.substring(0,50) : 'N/A'}..."`);
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(requestBody),
                    signal: fetchSignal
                });

                if (response.status === 429) {
                    const retryAfter = response.headers.get('Retry-After') ?? response.headers.get('retry-after');
                    const retryAfterMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60_000;
                    const err = Object.assign(
                        new Error(`Rate limit exceeded (429). Retry after ${Math.ceil(retryAfterMs / 1000)}s.`),
                        { isRateLimitError: true, retryAfterMs }
                    );
                    if (onError) onError(err);
                    throw err;
                }

                if (!response.ok) {
                    let errorBodyText = "Could not read error details from API response.";
                    try { errorBodyText = await response.text(); } catch (e) {}
                    const apiError = new Error(`API request failed: ${response.status} ${response.statusText}. Details: ${errorBodyText.substring(0,200)}`);
                    if (onError) onError(apiError); throw apiError;
                }
                if (!response.body) { const noBodyError = new Error("API response has no body stream."); if (onError) onError(noBodyError); throw noBodyError; }

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                let fullAccumulatedText = "";
                let finalFinishReason = null;

                while (true) {
                    const { value, done } = await reader.read();
                    if (done) {
                        this._flushSSEBuffer(buffer, (jsonString) => {
                            try {
                                const json = JSON.parse(jsonString);
                                const choice = json.choices?.[0];
                                const textPart = choice?.delta?.content || "";
                                if (textPart) { if (onChunk) onChunk(textPart, false); fullAccumulatedText += textPart; }
                            } catch (e) { this.logger.warn("Error parsing JSON from final SSE buffer:", jsonString, e.message); }
                        });

                        if (finalFinishReason === null) {
                            const err = new Error("Stream ended abruptly without a finish reason (connection dropped).");
                            if (onError) onError(err);
                            throw err;
                        }

                        if (onComplete) onComplete({ finalText: fullAccumulatedText, finishReason: finalFinishReason });
                        return { finalText: fullAccumulatedText, finishReason: finalFinishReason };
                    }
                    buffer += decoder.decode(value, { stream: true });
                    let newlineIndex;
                    while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
                        const line = buffer.substring(0, newlineIndex).trimEnd();
                        buffer = buffer.substring(newlineIndex + 1);
                        if (line.startsWith("data:")) {
                            const jsonString = line.substring(5).trimStart();
                            if (jsonString === "[DONE]") continue;
                            if (jsonString) {
                                try {
                                    const json = JSON.parse(jsonString);
                                    const choice = json.choices?.[0];
                                    const textPart = choice?.delta?.content || "";
                                    if (choice?.finish_reason) {
                                        finalFinishReason = choice.finish_reason;
                                    }
                                    if (textPart) {
                                        if (onChunk) onChunk(textPart, false);
                                        fullAccumulatedText += textPart;
                                    }
                                } catch (e) {
                                    // Ignore parse errors for incomplete chunks
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                if (onError) onError(error);
                throw error;
            } finally {
                disposeSignal();
            }
        }

        _flushSSEBuffer(buffer, processJsonStringFn) {
            if (buffer.trim()) {
                const linesInBuffer = buffer.split('\n');
                 for (const lineFromBuffer of linesInBuffer) {
                    const trimmedLine = lineFromBuffer.trim();
                    if (trimmedLine.startsWith("data:")) {
                        const jsonString = trimmedLine.substring(5).trim();
                        // Only attempt parse if JSON looks structurally complete (starts/ends
                        // with braces). Guards against truncated payloads on abrupt stream close.
                        if (jsonString && jsonString !== "[DONE]"
                            && jsonString.charCodeAt(0) === 123   // '{'
                            && jsonString.charCodeAt(jsonString.length - 1) === 125) { // '}'
                            processJsonStringFn(jsonString);
                        }
                    }
                }
            }
        }
    }

class ContentExtractorService {
        constructor(logger, configManager, storageService) {
            this.logger = logger;
            this.configManager = configManager;
            this.storageService = storageService;
            this.currentExtractor = this._selectExtractor();
            this.lastExtractionOriginalDocTitle = null;
            this.lastExtractionReadabilityTitle = null;
            this.lastReadabilityArticle = null;
            this.domainCacheManager = new DomainCacheManager(
                location.hostname,
                this.logger,
                this.storageService,
                'cleanup',
                1
            );
            this.contentCacheManager = new DomainCacheManager(
                location.hostname,
                this.logger,
                this.storageService,
                'content',
                1,
                10 // MAX_CACHE_SIZE nhỏ hơn
            );
            this.logger.info("ContentExtractorService initialized. Setup with extractor:", this.currentExtractor.name);
        }

         _selectExtractor() {
            const hostname = window.location.hostname;
            const extractors = EXTRACTORS;

            // --- BƯỚC 1: ƯU TIÊN KIỂM TRA DOMAIN CỤ THỂ (High Specificity) ---
            // Logic này phải chạy TRƯỚC các logic detect chung chung
            for (const key in extractors) {
                // Bỏ qua các key generic hoặc default trong vòng lặp này
                if (key === 'default' || key === 'xenforo_generic') continue;

                const extractor = extractors[key];
                if (extractor.matchHostIncludes && extractor.matchHostIncludes.some(include => hostname.includes(include))) {
                    this.logger.info(`Matched Specific Extractor: ${extractor.name}`);
                    return extractor; // Tìm thấy Voz -> Return ngay tại đây
                }
            }

            // --- BƯỚC 2: KIỂM TRA NỀN TẢNG GENERIC (Medium Specificity) ---
            // Chỉ chạy nếu bước 1 không tìm thấy config nào
            const xenForoExtractor = extractors['xenforo_generic'];
            if (xenForoExtractor && typeof xenForoExtractor.detectXenForo === 'function') {
                if (xenForoExtractor.detectXenForo()) {
                    this.logger.info(`Matched Generic Platform Extractor: ${xenForoExtractor.name} (detected)`);
                    return xenForoExtractor;
                }
            }

            // --- BƯỚC 3: FALLBACK (Low Specificity) ---
            this.logger.info("No specific or platform extractor matched. Using default generic extractor.");
            return extractors['default'];
        }

        // ContentExtractorService method
async extractMainContent() {
    this.logger.info(`Extracting content using config: ${this.currentExtractor.name}`);

    this.lastExtractionOriginalDocTitle = document.title;
    this.lastExtractionReadabilityTitle = null;
    this.lastReadabilityArticle = null;

    // [OPTIMIZATION] Khởi tạo biến workingDoc ở scope ngoài để dùng cho catch block
    let workingDoc = null;

    try {
        // 1. PREPARE: Tạo bản sao sạch một lần duy nhất
        const prepResult = await this.prepareDocument();
        workingDoc = prepResult.workingDoc;
        this.lastWorkingDoc = workingDoc; // Cache for debug/future use

        // 2. SELECT STRATEGY
        if (this.currentExtractor === EXTRACTORS['default'] ||
            this.currentExtractor === EXTRACTORS['xenforo_generic']) {

            // [NOTE] Các extractor này cần được cập nhật để ưu tiên dùng tham số truyền vào
            // thay vì tự tạo clone mới.
            return await this.currentExtractor.extractContent(workingDoc.body, this.logger, this.configManager, this);

        } else if (this.currentExtractor.selectors?.contentBox) {
            // STRICT SAFETY: Chỉ tìm trên Clone
            const contentBoxElement = workingDoc.querySelector(this.currentExtractor.selectors.contentBox);

            if (contentBoxElement) {
                return await this.currentExtractor.extractContent(contentBoxElement, this.logger, this.configManager, this);
            } else {
                this.logger.warn(`Content box "${this.currentExtractor.selectors.contentBox}" not found in WorkingDoc. Fallback to Generic.`);
                // Reuse workingDoc.body, không clone lại
                return await EXTRACTORS['default'].extractContent(workingDoc.body, this.logger, this.configManager, this);
            }
        } else {
            // Custom extractor logic
            return await this.currentExtractor.extractContent(workingDoc.body, this.logger, this.configManager, this);
        }

    } catch (e) {
        this.logger.error(`Error during content extraction for ${this.currentExtractor.name}:`, e);

        // [OPTIMIZATION] Reuse workingDoc nếu đã tồn tại, chỉ clone mới nếu chưa có
        if (!workingDoc) {
            const prep = await this.prepareDocument();
            workingDoc = prep.workingDoc;
        }

        return await EXTRACTORS['default'].extractContent(workingDoc.body, this.logger, this.configManager, this);
    }
}

// --- 1. CONFIGURATION (Static Access) ---
    static get TITLE_CONFIG() {
        return {
            MIN_VALID_LEN: 3,
            MAX_VALID_LEN: 150,
            EDGE_THRESHOLD: 5,
            PATTERNS: {
                SUFFIXES: [
                    /-\s*Novel Updates$/i, /-\s*Scribble Hub$/i, /-\s*Royal Road$/i, /\s*on Royal Road$/i,
                    /\s*truyện chữ$/i, /\s*full text$/i, /\s*online$/i, /\s*novel$/i, /\s*truyện$/i,
                    /\s*web novel$/i, /\s*light novel$/i, /\s*audiobook$/i, /\s*audio$/i,
                    /\s*sangtacviet$/i, /\s*metruyencv$/i, /\s*truyenyy$/i, /\s*wattpad$/i,
                    /\s*tangthuvien$/i, /\s*bachngocsach$/i, /\s*wikisach$/i, /\s*fanqie$/i, /\s*qidian$/i,
                    /\s*read novel online$/i, /\s*free reading$/i
                ],
                PREFIXES: [
                    /^\[[^\]]+\]\s*/i,
                    /^(novel|truyện|story|read)\s*[:-]?\s*/i,
                ],
                // Regex phát hiện số La Mã (I, II, IV, VI...) để giữ viết hoa
                ROMAN_NUMERALS: /^(?=[MDCLXVI])M*(C[MD]|D?C{0,3})(X[CL]|L?X{0,3})(I[XV]|V?I{0,3})$/i
            },
            // Tập hợp từ không viết hoa (Minor/Stop Words)
            LOWERCASE_WORDS: new Set([
                // Tiếng Anh (English)
                'and', 'but', 'or', 'nor', 'for', 'yet',
                'at', 'by', 'of', 'on', 'up', 'as', 'via',
                'out', 'off', 'near', 'past', 'over', 'into', 'onto', 'down',
                'from', 'with', '&', 'vs', 'vs.', 'etc', 'v.',

                // Tiếng Việt (Vietnamese)
                'và', 'của', 'với',
                'ở', 'bởi',
                'nhưng', 'hoặc', 'nếu', 'thì', 'là',
            ])
        };
    }

    // --- 2. MAIN ORCHESTRATOR ---
    generateIntelligentChapterName(extractedText = "") {
        const config = ContentExtractorService.TITLE_CONFIG;

        // Step 1: Source Selection (Readability Title > Doc Title)
        const sourceData = this._selectSourceTitle();
        let currentTitle = sourceData.title;
        let sourceLog = sourceData.source;

        // Step 2: Fallback to text content if title is empty
        if (!currentTitle) {
            const fallback = this._getFallbackFromText(extractedText);
            currentTitle = fallback.title;
            sourceLog = fallback.source;
        }

        const finalName = currentTitle ? currentTitle.trim() : "New Translation";
        this.logger.info(`Extracted raw title: "${finalName}" (Source: ${sourceLog})`);
        return finalName.substring(0, config.MAX_VALID_LEN);
    }

    _selectSourceTitle() {
        const rTitle = this.lastExtractionReadabilityTitle;
        const oTitle = this.lastExtractionOriginalDocTitle;
        const minLen = ContentExtractorService.TITLE_CONFIG.MIN_VALID_LEN;

        // Ưu tiên Readability title vì nó thường sạch hơn
        if (rTitle && rTitle.trim().length > minLen) {
            return { title: rTitle.trim(), source: "Readability" };
        }
        if (oTitle && oTitle.trim().length > minLen) {
            return { title: oTitle.trim(), source: "Document Title" };
        }
        return { title: null, source: "None" };
    }

    _getFallbackFromText(text) {
        if (!text) return { title: "New Translation", source: "Default" };

        const firstLine = text.split('\n')[0].trim();
        const cfg = ContentExtractorService.TITLE_CONFIG;

        if (firstLine.length > cfg.MIN_VALID_LEN && firstLine.length < 100) {
            return { title: firstLine, source: "First Line" };
        }
        return { title: `Translation ${new Date().toLocaleTimeString()}`, source: "Timestamp" };
    }

static async waitForDynamicContent(logger, constants) {
    const {
        MIN_ARTICLE_CONTENT_LENGTH,
        MAX_AJAX_WAIT_TIME = 2000, // Tăng nhẹ để an toàn
        DOM_STABILITY_THRESHOLD = 1000
    } = constants;

    // Fast fail: Nếu nội dung đã đủ dài và không giống SPA -> Return ngay
    const initialLen = document.body.textContent.trim().length;
    const isSPA = document.querySelector('[data-reactroot], [ng-app], #__next, #app, .vue-app');

    if (initialLen > MIN_ARTICLE_CONTENT_LENGTH && !isSPA) {
        logger.debug("Content seems static and sufficient. Skipping wait.");
        return;
    }

    logger.info(`Initiating dynamic content wait. Initial len: ${initialLen}. Max wait: ${MAX_AJAX_WAIT_TIME}ms`);

    return new Promise(resolve => {
        let timer = null;
        let maxWaitTimeout = null;

        const observer = new MutationObserver(() => {
            // Debounce: Reset stability timer mỗi khi DOM thay đổi
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                logger.info("DOM stable.");
                cleanup();
                resolve();
            }, DOM_STABILITY_THRESHOLD);
        });

        const cleanup = () => {
            observer.disconnect();
            if (timer) clearTimeout(timer);
            if (maxWaitTimeout) clearTimeout(maxWaitTimeout);
        };

        // Hard stop: Dù DOM có ổn định hay không, sau MAX_TIME cũng phải dừng
        maxWaitTimeout = setTimeout(() => {
            logger.warn("Max AJAX wait time reached.");
            cleanup();
            resolve();
        }, MAX_AJAX_WAIT_TIME);

        observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
}

// Tìm phương thức static prepareDocument bên trong class ContentExtractorService
// Thay thế toàn bộ phương thức cũ bằng đoạn code sau:

    /**
     * Chuẩn bị DOM để trích xuất - FIX: Loại bỏ Live DOM Reference để đảm bảo an toàn và hiệu năng.
     * Tạo Snapshot dữ liệu ngay lập tức.
     */
    async prepareDocument() {
        // --- BƯỚC 1: SNAPSHOT DỮ LIỆU TỪ LIVE DOM ---
        // Lấy các dữ liệu meta cần thiết dưới dạng String/Array primitives.
        // Sau bước này, không còn truy cập vào 'document' gốc nữa.

        const pageTitle = document.title || "";
        const baseHref = document.querySelector('base')?.href || window.location.href;

        // Trích xuất JSON-LD ngay lập tức để tránh việc cleanup sau này vô tình xóa mất.
        // Lưu dưới dạng mảng string để parse sau.
        const jsonLdData = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
            .map(script => script.textContent);

        // --- BƯỚC 2: TẠO ISOLATED WORKING DOC ---
        const workingDoc = document.implementation.createHTMLDocument('');

        // Thiết lập Base URL cho workingDoc để resolve relative links chính xác
        const base = workingDoc.createElement('base');
        base.href = baseHref;
        workingDoc.head.appendChild(base);

        // Clone Body: Chỉ Clone 1 lần duy nhất từ Live DOM
        const bodyClone = document.body.cloneNode(true);
        workingDoc.body.replaceWith(bodyClone);

        // --- BƯỚC 3: AGGRESSIVE CLEANUP TRÊN WORKING DOC ---
        // (Logic dọn dẹp giữ nguyên, nhưng thực hiện trên workingDoc đã cách ly)

        const inlineHidden = workingDoc.querySelectorAll('[style*="display:none"], [style*="display: none"], [hidden], .hidden, .d-none, .invisible');
        inlineHidden.forEach(el => el.remove());

        const constants = this.configManager.CONSTANTS;
        const defaultSelectors = [
            ...constants.DOM_CLEANUP_SELECTOR_GROUPS.CRITICAL_SCRIPTS_STYLES,
            ...constants.DOM_CLEANUP_SELECTOR_GROUPS.ADVERTISEMENTS_PROMOTIONS
        ];

        const uniqueDefaults = [...new Set(defaultSelectors)];
        const activeSelectors = await this.domainCacheManager.getEffectiveSelectors(uniqueDefaults);
        const successfulSelectors = new Set();

        activeSelectors.forEach(selector => {
            try {
                const els = workingDoc.querySelectorAll(selector);
                if (els.length > 0) {
                    els.forEach(el => {
                        if (el && el !== workingDoc.body && el !== workingDoc.documentElement && el.parentNode) {
                            el.remove();
                            successfulSelectors.add(selector);
                        }
                    });
                }
            } catch (e) { /* Ignore invalid selectors */ }
        });

        // --- BƯỚC 3.1: FUZZY JUNK & AD REMOVAL (Kích hoạt bộ lọc mờ chuyên sâu trên WorkingDoc) ---
        if (typeof Utils !== 'undefined' && typeof Utils.removeFuzzyJunkElements === 'function') {
            try {
                const fuzzyCount = Utils.removeFuzzyJunkElements(workingDoc.body);
                if (fuzzyCount > 0) {
                    this.logger.info(`[Fuzzy Cleanup] Removed ${fuzzyCount} junk/ad elements matching fuzzy patterns on WorkingDoc.`);
                }
            } catch (fuzzyErr) {
                this.logger.warn("[Fuzzy Cleanup] Error executing removeFuzzyJunkElements:", fuzzyErr);
            }
        }

        // Trả về dữ liệu đã tách biệt hoàn toàn (Decoupled Data)
        return {
            workingDoc,
            pageTitle,        // String primitive
            jsonLdData,       // Array of strings
            uniqueDefaults,   // Danh sách selector mặc định nòng cốt
            activeSelectors,
            successfulSelectors
        };
    }

}