class TranslationOrchestrator {
    constructor(apiService, contentExtractorService, settingsService, uiManager, logger, configManager, workerPool) {
        this.apiService = apiService;
        this.contentExtractorService = contentExtractorService;
        this.settingsService = settingsService;
        this.uiManager = uiManager;
        this.logger = logger;
        this.configManager = configManager;
        this.workerPool = workerPool; // WorkerPool instance

        this.isOverallTranslating = false;
        this.isCancelled = false;
        this.currentAbortController = null;
        this.lastOriginalTextForMain = null;
        this.currentAccumulatedTextForMain = "";
        this.lastGeneratedTitleForSave = null;
    }

    abortTranslation() {
        this.logger.info("abortTranslation called.");
        this.isCancelled = true;
        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = null;
        }
        this.isOverallTranslating = false;
        this.uiManager.setTranslatingState(false);

        // Ensure result modal transitions to SHOWING_RESULT or IDLE based on existing text
        const resultModal = this.uiManager.getComponent('RESULT_MODAL');
        if (resultModal && (resultModal._state.status === resultModal.MODAL_STATE.TRANSLATING || resultModal._state.status === resultModal.MODAL_STATE.PREVIEWING)) {
            const finalState = resultModal._state.committedText
                           ? resultModal.MODAL_STATE.SHOWING_RESULT
                           : resultModal.MODAL_STATE.IDLE;

            // If going back to IDLE, this will automatically clear it via hooks
            resultModal._transitionTo(finalState, {
                previewText: null,
                pendingOperationType: null
            });
        }
    }

    async translateFullPage() {
        this.logger.info("translateFullPage initiated.");
        const content = await this.contentExtractorService.extractMainContent();
        if (!content || content.trim().length < (this.configManager.getConstant('MIN_PARAGRAPH_CONTENT_LENGTH') || 20)) {
            this.logger.warn("Extracted content is too short or empty.", content ? content.substring(0, 100) : "EMPTY");
            this.logger.notify("Content is too short or empty to translate.", "Extraction Warning", "warn");
            this.uiManager.showResultModal("Extracted content is too short or empty to translate.", "Content Warning", true, false);
            return;
        }
        this.lastOriginalTextForMain = content;
        this.lastGeneratedTitleForSave = this.contentExtractorService.generateIntelligentChapterName(content);
        this.logger.info(`Content extracted for full page. Length: ${content.length}. Title: "${this.lastGeneratedTitleForSave}"`);

        const mainControls = this.uiManager.getComponent('MAIN_CONTROLS');
        if (mainControls && !mainControls.isMinimized) {
            mainControls._toggleMinimizeMainControls();
        }

        await this._startMainTranslation(content, this.lastGeneratedTitleForSave, "page");
    }

    async translateSelection() {
        this.logger.info("translateSelection initiated.");
        const selectedText = window.getSelection()?.toString().trim();
        if (!selectedText) {
            this.logger.warn("No text selected for translation.");
            this.logger.notify("Please select text to translate.", "No Text Selected", "warn");
            return;
        }
        this.lastOriginalTextForMain = selectedText;
        this.lastGeneratedTitleForSave = "Selective Translation";
        this.logger.info(`Text selected for translation. Length: ${selectedText.length}`);

        const mainControls = this.uiManager.getComponent('MAIN_CONTROLS');
        if (mainControls && !mainControls.isMinimized) {
            mainControls._toggleMinimizeMainControls();
        }

        await this._startMainTranslation(selectedText, this.lastGeneratedTitleForSave, "selection");
    }

    async exportExtractedContent() {
        this.logger.info("exportExtractedContent initiated.");
        if (this.isOverallTranslating) {
            this.logger.warn("Cannot export while translation is in progress.");
            this.logger.notify("A translation task is currently running.", "Busy", "warn");
            return;
        }

        const selectedText = window.getSelection()?.toString().trim();
        let content = selectedText;
        let title = "Selective Export";

        if (!content) {
            content = await this.contentExtractorService.extractMainContent();
            if (content && content.trim().length >= (this.configManager.getConstant('MIN_PARAGRAPH_CONTENT_LENGTH') || 20)) {
                title = this.contentExtractorService.generateIntelligentChapterName(content);
            }
        }

        if (!content || content.trim().length < (this.configManager.getConstant('MIN_PARAGRAPH_CONTENT_LENGTH') || 20)) {
            this.logger.warn("Extracted content is too short or empty.", content ? content.substring(0, 100) : "EMPTY");
            this.logger.notify("Content is too short or empty to export.", "Extraction Warning", "warn");
            this.uiManager.showResultModal("Extracted content is too short or empty to export.", "Content Warning", true, false);
            return;
        }

        this.lastOriginalTextForMain = content;
        this.lastGeneratedTitleForSave = title || "Extracted Content";
        this.logger.info(`Content extracted for export. Length: ${content.length}. Title: "${this.lastGeneratedTitleForSave}"`);

        const mainControls = this.uiManager.getComponent('MAIN_CONTROLS');
        if (mainControls && !mainControls.isMinimized) {
            mainControls._toggleMinimizeMainControls();
        }

        const displayTitle = this.lastGeneratedTitleForSave;
        this.uiManager.showResultModal(content, displayTitle, false, false);
        this.logger.notify("Original content extracted and displayed.", "Export Ready", "success");
    }

// [THÊM MỚI] Hàm chia task bất đồng bộ để không block main thread
    async _splitTextAsyncFallback(text, maxChars, allowance) {
        if (text.length < 20000) return Utils.splitTextIntoChunks(text, maxChars, allowance, this.logger);
        return new Promise(resolve => {
            setTimeout(() => {
                resolve(Utils.splitTextIntoChunks(text, maxChars, allowance, this.logger));
            }, 0);
        });
    }

    async _performChunking(textToChunk, modelConfig, operationName = "Translation") {
        this.logger.info(`${operationName}: Starting chunking process. Text length: ${textToChunk ? textToChunk.length : 0}`);
        let chunks = [];

        if (!textToChunk || typeof textToChunk !== 'string' || textToChunk.trim() === "") {
            this.logger.info(`${operationName}: No text provided or text is empty for chunking. Returning empty chunks.`);
            return chunks;
        }

        if (this.workerPool) {
            this.logger.info(`${operationName}: Attempting to use workerPool for text chunking.`);
            try {
                const resultFromWorker = await this.workerPool.exec('splitTextIntoChunksWorker', [
                    textToChunk,
                    modelConfig.chunkInputCharLimit,
                    modelConfig.chunkOversizeAllowance
                ]);

                if (Array.isArray(resultFromWorker)) {
                    chunks = resultFromWorker;
                    this.logger.info(`${operationName}: Successfully chunked text using workerPool. Number of chunks: ${chunks.length}. First chunk sample (if any): ${chunks[0] ? chunks[0].substring(0,50)+'...' : 'N/A'}`);
                } else {
                    this.logger.error(`${operationName}: WorkerPool returned non-array result for chunking. Type: ${typeof resultFromWorker}. Result: ${JSON.stringify(resultFromWorker)}. Falling back to main thread.`);
                    chunks = Utils.splitTextIntoChunks(textToChunk, modelConfig.chunkInputCharLimit, modelConfig.chunkOversizeAllowance, this.logger);
                    this.logger.info(`${operationName}: Chunked text using main thread (fallback due to worker invalid result). Number of chunks: ${chunks.length}`);
                }
            } catch (workerError) {
                this.logger.error(`${operationName}: WorkerPool execution for chunking failed. Falling back to main thread. Error:`, workerError);
                chunks = await this._splitTextAsyncFallback(textToChunk, modelConfig.chunkInputCharLimit, modelConfig.chunkOversizeAllowance);
                this.logger.info(`${operationName}: Chunked text using main thread (fallback due to worker error). Number of chunks: ${chunks.length}`);
            }
        } else {
            this.logger.warn(`${operationName}: WorkerPool not available. Using main thread for text chunking.`);
            chunks = await this._splitTextAsyncFallback(textToChunk, modelConfig.chunkInputCharLimit, modelConfig.chunkOversizeAllowance);
            this.logger.info(`${operationName}: Chunked text using main thread (no workerpool). Number of chunks: ${chunks.length}`);
        }

        if (!Array.isArray(chunks)) {
            this.logger.error(`${operationName}: Chunks is not an array after all processing. This should not happen. Resetting to empty. Original text length: ${textToChunk ? textToChunk.length : 0}`);
            chunks = [];
        }

        if (chunks.length === 0 && textToChunk.trim().length > 0) {
            this.logger.warn(`${operationName}: Chunking resulted in zero chunks, but original text was not empty. Using original text as a single chunk.`);
            chunks = [textToChunk];
        }
        this.logger.info(`${operationName}: Chunking process completed. Final number of chunks: ${chunks.length}`);
        return chunks;
    }

    // Thay thế phương thức _startMainTranslation trong class TranslationOrchestrator

    _buildTitleExtractionPrompt(originalText, displayTitle) {
        return `Title: ${displayTitle}\n\nContent to translate:\n${originalText}\n\n[Sub-prompt: You MUST translate the "Title" and place it on the VERY FIRST line of the response using the exact format: "Title: Translated Title".\n\nFor the "Translated Title", the target language MUST be the language used in the user's main instruction/prompt. English MUST NOT be used as the output language unless the user's main instruction/prompt is written in English.\n\nWhen the target language is not English, translate all non-technical words into the target language. Retain English only for technical terms, product names, APIs, programming languages, proper names, or established industry jargon that are conventionally used in English or would lose accuracy, clarity, or meaning if translated.\n\nNote: You MUST automatically remove clutter (advertising phrases, novel titles, chapter/arc/volume numbering, etc.), keeping only the core title content and capitalizing the first letter of each word.\n\nDo NOT add greetings, do NOT say "Understood," and do NOT include any unnecessary text.\n\nThen begin translating the "Content to translate" on the following lines.]`;
    }

    _extractTitleFromStream(accumulatedText) {
        if (!accumulatedText.includes('\n')) return { title: null, matchedLine: null };
        const lines = accumulatedText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let parsedTitle = null;
        let extractedTitleMatchedLine = null;

        // Strategy 1: Look for explicit markers like "Tiêu đề: "
        const explicitMatch = accumulatedText.match(/^(?:.*?\n)*?(?:Tiêu đề|Title):\s*\*?(.*?)\*?(?:\n|$)/i);
        if (explicitMatch) {
            parsedTitle = explicitMatch[1].trim();
            extractedTitleMatchedLine = explicitMatch[0];
        }
        // Strategy 2: Look for our requested format containing " | "
        else {
            const pipeLine = lines.find(l => l.includes(' | '));
            if (pipeLine) {
                parsedTitle = pipeLine.replace(/^\*\*|\*\*$/g, '').trim();
                extractedTitleMatchedLine = pipeLine;
            }
            // Strategy 3: Heuristic on first lines discarding typical AI junk
            else if (lines.length >= 2) {
                const firstLine = lines[0].toLowerCase();
                const junkRegex = /^(đã hiểu|dưới đây |dạ|vâng|chắc chắn|here is|translation|nội dung|bản dịch|okay|ok|sau đây|tiếp tục|bắt đầu|\[sub prompt)/i;
                if (junkRegex.test(firstLine)) {
                    parsedTitle = lines[1].replace(/^\*\*|\*\*$/g, '').trim();
                    extractedTitleMatchedLine = lines[0] + '\n' + lines[1];
                } else {
                    parsedTitle = lines[0].replace(/^\*\*|\*\*$/g, '').trim();
                    extractedTitleMatchedLine = lines[0];
                }
            }
        }

        if (parsedTitle) {
            // Xoá ngoặc vuông bao trọn (nếu có)
            if (parsedTitle.startsWith('[') && parsedTitle.endsWith(']')) {
                parsedTitle = parsedTitle.slice(1, -1).trim();
            }

            // Xoá định dạng đánh số [Chương/Hồi/Quyển] + [Số]: ở đầu (VD: Chương 1:, Hồi 2:...)
            parsedTitle = parsedTitle.replace(/^(Chương|Hồi|Quyển)\s+\d+[\s\-:.]*/i, '').trim();

            // Viết hoa chữ cái đầu của mỗi từ, xử lý cả dấu câu
            parsedTitle = parsedTitle.toLowerCase().replace(/(^|[\s\p{P}])(\p{L})/gu, function(match, separator, letter) {
                return separator + letter.toUpperCase();
            });
        }
        return { title: parsedTitle, matchedLine: extractedTitleMatchedLine };
    }

    async _startMainTranslation(textToTranslate, titleForDisplay, mode) {
        this.logger.info(`_startMainTranslation initiated. Mode: ${mode}. Text length: ${textToTranslate?.length || 0}`);

        if (this.isOverallTranslating) {
            this.logger.notify("Another task is currently being processed.", "Busy", "warn");
            return;
        }

        const cfg = this.configManager;
        const activeProviderId = this.settingsService.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
        const providers = this.settingsService.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
        const activeProvider = providers.find(p => p.id === activeProviderId);

        let hasApiKey = false;
        if (activeProvider) {
            hasApiKey = !!this.apiService._getNextApiKey(activeProvider);
        }

        if (!hasApiKey) {
            this.logger.notify("API Key is missing. Please configure it in Settings.", "API Key Error", "error");
            this.uiManager.toggleModal('SETTINGS_MODAL', true);
            return;
        }

        const selectedModel = this.settingsService.get(cfg.SETTING_KEYS.SELECTED_MODEL);
        if (!selectedModel) {
            this.logger.notify("No model selected. Please select a model in Settings.", "Model Error", "error");
            this.uiManager.toggleModal('SETTINGS_MODAL', true);
            return;
        }

        this.isOverallTranslating = true;
        this.isCancelled = false;
        this.currentAbortController = new AbortController();
        const abortSignal = this.currentAbortController.signal;
        this.currentAccumulatedTextForMain = "";
        this.uiManager.setTranslatingState(true, `Preparing translation (${mode})...`);

        const resultModal = this.uiManager.getComponent('RESULT_MODAL');
        if (!resultModal) {
            this.logger.error("ResultModal component is unavailable to start the main translation.");
            this.isOverallTranslating = false;
            this.uiManager.setTranslatingState(false);
            return;
        }

        resultModal.updateButtonStates();

        resultModal.show(
            this.configManager.getConstant('PROCESSING_MESSAGE_IDENTIFIER'),
            titleForDisplay,
            false, // isError
            true   // isPartial initially
        );

        const contextTemplatesMap = this.settingsService.get(this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP);
        const selectedTemplateName = this.settingsService.get(this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
        const baseContext = contextTemplatesMap?.[selectedTemplateName] ||
            this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP)[this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME)];

        const modelCfg = this.settingsService.get(this.configManager.SETTING_KEYS.MODEL_CONFIG);
        let chunks = [];
        const needsChunking = typeof textToTranslate === 'string' && textToTranslate.length > modelCfg.minTextLengthForChunking;

        // --- 1. PREPARE CHUNKS ---
        if (needsChunking) {
            try {
                chunks = await this._performChunking(textToTranslate, modelCfg, `MainTranslation (${mode})`);
            } catch (e) {
                this.logger.error(`Critical error while splitting text (${mode}):`, e);
                resultModal.show(`Error while splitting text: ${e.message}`, "Segmentation Error", true, false);
                this.isOverallTranslating = false;
                this.uiManager.setTranslatingState(false);
                resultModal.updateButtonStates();
                return;
            }
        } else {
            chunks = (textToTranslate && textToTranslate.trim() !== "") ? [textToTranslate] : [];
        }

        if (chunks.length === 0) {
            this.logger.warn(`MainTranslation (${mode}): No valid chunks to process.`);
            if (textToTranslate && textToTranslate.trim().length > 0) {
                this.logger.notify("Unable to process content for translation.", "Content Processing Error", "error");
                resultModal.show("Unable to process content for translation.", "Processing Error", true, false);
            }
            this.isOverallTranslating = false;
            this.uiManager.setTranslatingState(false);
            resultModal.updateButtonStates();
            return;
        }

        // --- 2. QUEUE PROCESSING WITH FAIL SOFTLY ---
        const chunkQueue = chunks.map(text => ({ text, retryCount: 0 }));
        let completedChunksCount = 0;
        let totalEstimatedChunks = chunkQueue.length;
        let previousChunkTranslatedText = ""; // Context tracker
        const MAX_RETRIES = this.configManager.getConstant('MAX_CHUNK_RETRIES') || 3;
        const RETRY_DELAY = this.configManager.getConstant('RETRY_DELAY_MS') || 2000;

        let extractedTitleTracker = false;
        let siteName = "Other Source";
        try {
            const hostname = window.location.hostname;
            if (hostname) {
                siteName = hostname.replace(/^www\./i, '').split('.')[0];
                siteName = siteName.charAt(0).toUpperCase() + siteName.slice(1).toLowerCase();
            }
        } catch(e) {}

        try {
            while (chunkQueue.length > 0) {
                if (this.isCancelled) {
                    this.logger.info("Translation cancelled by user.");
                    break;
                }

                // Peek trước, chỉ shift khi thành công hoặc chấp nhận thất bại
                const currentItem = chunkQueue[0];
                let chunkToTranslateLoop = currentItem.text;
                const currentRetryCount = currentItem.retryCount;
                // Kiểm tra title trên header nếu chưa có thì tiếp tục gửi kèm sub prompt
                const isFirstChunkAndPageMode = (completedChunksCount === 0 && mode === "page" && !extractedTitleTracker);

                if (!chunkToTranslateLoop || chunkToTranslateLoop.trim() === "") {
                    chunkQueue.shift(); // Remove empty
                    completedChunksCount++;
                    continue;
                }

                if (isFirstChunkAndPageMode) {
                    chunkToTranslateLoop = this._buildTitleExtractionPrompt(chunkToTranslateLoop, titleForDisplay);
                }

                let headerTitle = siteName ? `${titleForDisplay} | ${siteName}` : titleForDisplay;
                let chunkProgressTitle = totalEstimatedChunks > 1 ? `${headerTitle} (Segment ${completedChunksCount + 1}/${totalEstimatedChunks})` : headerTitle;
                let apiContextForThisChunk = baseContext;

                // [CONTEXT LOGIC] Chỉ thêm context nếu đoạn trước đó KHÔNG bị lỗi (previousChunkTranslatedText có nội dung)
                if (completedChunksCount > 0 && previousChunkTranslatedText && modelCfg.chunkContextWords > 0) {
                    const contextSegment = Utils.getPreviousTranslatedSegment(previousChunkTranslatedText, modelCfg.chunkContextWords);
                    if (contextSegment) apiContextForThisChunk = `This is the next segment. The previous segment ended with: "${contextSegment}". Continue naturally. Original prompt: ${baseContext}`;
                }

                let currentChunkStreamingText = "";
                let streamBuffer = "";
                let streamThrottleTimer = null;
                let chunkSuccess = false;
                let extractedTitleMatchedLine = null; // Biến lưu line title để xoá đi

                try {
                    await new Promise((resolveChunk, rejectChunk) => {
                        this.apiService.callAPIStream(chunkToTranslateLoop, {
                            onChunk: (textPart, isFinalSubChunkOfStream) => {
                                if (!textPart) return;
                                streamBuffer += textPart;
                                currentChunkStreamingText += textPart;

                                if (isFirstChunkAndPageMode && !extractedTitleTracker) {
                                    const { title, matchedLine } = this._extractTitleFromStream(currentChunkStreamingText);
                                    if (title) {
                                        titleForDisplay = title;
                                        this.lastGeneratedTitleForSave = title;
                                        extractedTitleTracker = true;
                                        extractedTitleMatchedLine = matchedLine;

                                        let headerTitleVal = siteName ? `${titleForDisplay} | ${siteName}` : titleForDisplay;
                                        chunkProgressTitle = totalEstimatedChunks > 1 ? `${headerTitleVal} (Segment ${completedChunksCount + 1}/${totalEstimatedChunks})` : headerTitleVal;
                                        if (resultModal && typeof resultModal.updateTitle === 'function') {
                                            resultModal.updateTitle(chunkProgressTitle);
                                        }
                                    }
                                }

                                if (!streamThrottleTimer || isFinalSubChunkOfStream) {
                                    streamThrottleTimer = setTimeout(() => {
                                        const temporaryRetryMessage = "";

                                        let cleanStreamText = currentChunkStreamingText;
                                        if (completedChunksCount === 0 && mode === "page") {
                                            if (extractedTitleMatchedLine) {
                                                cleanStreamText = cleanStreamText.replace(extractedTitleMatchedLine, "").replace(/^\s+/, "");
                                            } else {
                                                // Fallback xoá nếu chưa kịp match line chính xác nhưng có Tiêu đề
                                                cleanStreamText = cleanStreamText.replace(/^(?:.*?\n)*?(?:(?:Tiêu đề|Title):\s*[^\n]*\n*)/i, "").replace(/^\s+/, "");
                                            }
                                        }

                                        // Hiển thị: Nội dung cũ + Nội dung đang stream
                                        const streamBlock = cleanStreamText.trim().length > 0
                                            ? `<span class="${this.configManager.getScriptPrefix()}streaming-text">${cleanStreamText}</span>`
                                            : "";

                                        const textForUIDisplay = this.currentAccumulatedTextForMain +
                                            (this.currentAccumulatedTextForMain.trim().length > 0 && streamBlock.length > 0 ? "\n\n" : "") +
                                            streamBlock + temporaryRetryMessage;

                                        if(resultModal) resultModal.show(textForUIDisplay, chunkProgressTitle, false, !isFinalSubChunkOfStream);

                                        streamBuffer = "";
                                        streamThrottleTimer = null;
                                    }, 150);
                                }
                            },
                            onComplete: (result) => {
                                // [FIX] Ngăn chặn render thừa gây duplicate text
                                if (streamThrottleTimer) {
                                    clearTimeout(streamThrottleTimer);
                                    streamThrottleTimer = null;
                                }

                                const { finalText, finishReason } = result;
                                let completedTextForThisChunk = finalText || currentChunkStreamingText;

                                if (completedChunksCount === 0 && mode === "page") {
                                    if (extractedTitleMatchedLine) {
                                        completedTextForThisChunk = completedTextForThisChunk.replace(extractedTitleMatchedLine, "").replace(/^\s+/, "");
                                    } else {
                                        completedTextForThisChunk = completedTextForThisChunk.replace(/^(?:.*?\n)*?(?:(?:Tiêu đề|Title):\s*[^\n]*\n*)/i, "").replace(/^\s+/, "");
                                    }
                                }

                                // Handle MAX_TOKENS: Split remainder and re-queue
                                if (finishReason === 'MAX_TOKENS' && chunkToTranslateLoop.length > 0) {
                                    this.logger.warn(`Segment ${completedChunksCount + 1} stopped due to MAX_TOKENS.`);
                                    const translatedRatio = (completedTextForThisChunk.length / (chunkToTranslateLoop.length * 1.5)) * 0.9;
                                    const estimatedOriginalCharsTranslated = Math.floor(chunkToTranslateLoop.length * translatedRatio);

                                    if (estimatedOriginalCharsTranslated > 0 && estimatedOriginalCharsTranslated < chunkToTranslateLoop.length - (modelCfg.chunkOversizeAllowance || 50)) {
                                        const remainingOriginalText = chunkToTranslateLoop.substring(estimatedOriginalCharsTranslated);
                                         if (remainingOriginalText.trim().length > (this.configManager.getConstant('MIN_PARAGRAPH_CONTENT_LENGTH') || 20)) {
                                            // Chèn phần còn lại vào ngay sau phần tử hiện tại
                                            chunkQueue.splice(1, 0, { text: remainingOriginalText, retryCount: 0 });
                                            totalEstimatedChunks++;
                                        }
                                    }
                                }

                                // Update Global State
                                previousChunkTranslatedText = completedTextForThisChunk;
                                this.currentAccumulatedTextForMain += (this.currentAccumulatedTextForMain.trim().length > 0 && completedTextForThisChunk.trim().length > 0 ? "\n\n" : "") + completedTextForThisChunk;

                                chunkSuccess = true;
                                resolveChunk();
                            },
                            onError: (error) => { rejectChunk(error); },
                            abortSignal: abortSignal
                        }, apiContextForThisChunk);
                    });

                    // Thành công: Xóa khỏi hàng đợi và tăng đếm
                    chunkQueue.shift();
                    completedChunksCount++;
                    if(resultModal) resultModal.show(this.currentAccumulatedTextForMain, chunkProgressTitle, false, chunkQueue.length > 0);

                } catch (chunkError) {
                    if (chunkError.name === 'AbortError') {
                        this.logger.info("Chunk translation aborted.");
                        break;
                    }
                    this.logger.warn(`Error translating segment ${completedChunksCount + 1}. Error: ${chunkError.message}`);

                    if (currentRetryCount < MAX_RETRIES) {
                        // --- TRƯỜNG HỢP 1: THỬ LẠI ---
                        this.logger.info(`Retrying segment ${completedChunksCount + 1} (${currentRetryCount + 1}/${MAX_RETRIES})...`);
                        const retryMessageForUI = this.configManager.getConstant('RETRYING_MESSAGE_IDENTIFIER');
                        if(resultModal) resultModal.show(retryMessageForUI, chunkProgressTitle, false, true);

                        // Exponential back-off; honour rate-limit Retry-After when available.
                        const retryWaitMs = chunkError.isRateLimitError
                            ? (chunkError.retryAfterMs ?? Math.min(RETRY_DELAY * Math.pow(2, currentRetryCount + 1), 120_000))
                            : Math.min(RETRY_DELAY * Math.pow(1.5, currentRetryCount), 30_000);
                        this.logger.info(`Waiting ${Math.round(retryWaitMs / 1000)}s before retrying segment ${completedChunksCount + 1}...`);
                        await Utils.delay(retryWaitMs, abortSignal);
                        // Cập nhật retry count tại chỗ
                        chunkQueue[0].retryCount++;
                        // Continue vòng lặp để xử lý lại chunkQueue[0]
                        continue;

                    } else {
                        // --- TRƯỜNG HỢP 2: FAIL SOFTLY (CHẤP NHẬN LỖI) ---
                        this.logger.error(`Segment ${completedChunksCount + 1} failed permanently. Skipping and continuing.`);

                        const originalString = chunkQueue[0]?.text || '';

                        const errorPlaceholder = `\n\n<div class="${this.configManager.getScriptPrefix()}inline-error-block">
                            <strong>Error translating segment ${completedChunksCount + 1}</strong>
                            <span>Reason: ${chunkError.message}</span>
                            <button class="${this.configManager.getScriptPrefix()}button ${this.configManager.getScriptPrefix()}button-danger-outline ${this.configManager.getScriptPrefix()}inline-retry-btn" data-original-text="${encodeURIComponent(originalString)}">Please try translating this segment again</button>
                        </div>\n\n`;

                        this.currentAccumulatedTextForMain += errorPlaceholder;
                        previousChunkTranslatedText = ""; // Reset context để tránh gây nhiễu đoạn sau

                        chunkQueue.shift(); // Vứt bỏ đoạn lỗi
                        completedChunksCount++; // Vẫn tính là đã xử lý xong (dù lỗi)

                        if(resultModal) resultModal.show(this.currentAccumulatedTextForMain, chunkProgressTitle, false, chunkQueue.length > 0);
                    }
                }

                // Chờ delay giữa các chunk (nếu còn hàng đợi)
                if (chunkQueue.length > 0 && modelCfg.delayBetweenChunksMs > 0) {
                    await Utils.delay(modelCfg.delayBetweenChunksMs);
                }
            }

            // Hoàn tất toàn bộ
            let finalHeaderTitle = siteName ? `${titleForDisplay} | ${siteName}` : titleForDisplay;
            if (this.isCancelled) {
                this.logger.info(`Main translation '${mode}' was canceled.`);
                resultModal.updateTitle(finalHeaderTitle + " (Canceled)");
            } else {
                this.logger.info(`Main translation '${mode}' completed (with possible partial errors).`);
                this.logger.notify(`Translation completed!`, "Success", "success");
                resultModal.updateTitle(finalHeaderTitle);
            }

        } catch (error) {
            // Catch này chỉ bắt các lỗi hệ thống nghiêm trọng (logic code), không phải lỗi API từng đoạn
            this.logger.error(`System error during translation:`, error);
            let finalHeaderTitle = siteName ? `${titleForDisplay} | ${siteName}` : titleForDisplay;
            resultModal.show(this.currentAccumulatedTextForMain + `\n\n[SYSTEM ERROR]: ${error.message}`, finalHeaderTitle, true, false);
        } finally {
            this.isOverallTranslating = false;
            this.uiManager.setTranslatingState(false);
            resultModal.updateButtonStates();
        }
    }

    async _startSubTranslationProcess( textToProcess, operationModeWithSuffix, contextForOperation,
                                      previewUpdateCb, previewFinalizeCb, previewErrorCb ) {
        const operationType = operationModeWithSuffix.replace('_preview','');
        this.logger.info(`_startSubTranslationProcess initiated. Type: ${operationType}. Text length: ${textToProcess ? textToProcess.length : 0}`);

        if (this.isOverallTranslating && this.uiManager.getComponent('RESULT_MODAL')?._state?.pendingOperationType !== operationType) {
             previewErrorCb(new Error("Another task is currently being processed."), operationType);
             return;
        }
        const cfg = this.configManager;
        const activeProviderId = this.settingsService.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
        const providers = this.settingsService.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
        const activeProvider = providers.find(p => p.id === activeProviderId);

        let hasApiKey = false;
        if (activeProvider) {
            hasApiKey = !!this.apiService._getNextApiKey(activeProvider);
        }

        if (!hasApiKey) {
            previewErrorCb(new Error("API Key is missing."), operationType);
            return;
        }

        const selectedModel = this.settingsService.get(cfg.SETTING_KEYS.SELECTED_MODEL);
        if (!selectedModel) {
            previewErrorCb(new Error("No model selected. Please select a model in Settings."), operationType);
            return;
        }

        this.isOverallTranslating = true;
        this.isCancelled = false;
        this.currentAbortController = new AbortController();
        const abortSignal = this.currentAbortController.signal;
        const resultModalComp = this.uiManager.getComponent('RESULT_MODAL'); // Get component once
        this.uiManager.setTranslatingState(true, `Preparing task (${operationType})...`);
        if (resultModalComp) resultModalComp.updateButtonStates();

        const modelCfg = this.settingsService.get(this.configManager.SETTING_KEYS.MODEL_CONFIG);
        let chunks = [];
        const needsChunking = textToProcess && typeof textToProcess === 'string' && textToProcess.length > modelCfg.minTextLengthForChunking;

        if (textToProcess === null || textToProcess === undefined || (typeof textToProcess === 'string' && textToProcess.trim() === "")) {
            if (operationType === 'custom_prompt' && contextForOperation && contextForOperation.trim()) {
                chunks = [""];
                this.logger.info(`SubTranslation (${operationType}): Custom prompt with empty text. Using one empty chunk.`);
            } else {
                previewErrorCb(new Error("No content available to process for this task."), operationType);
                this.isOverallTranslating = false; this.uiManager.setTranslatingState(false); if(resultModalComp) resultModalComp.updateButtonStates(); return;
            }
        } else if (needsChunking) {
            try {
                chunks = await this._performChunking(textToProcess, modelCfg, `SubTranslation (${operationType})`);
            } catch (e) {
                this.logger.error(`Critical error while splitting text (secondary operation - ${operationType}) on the main thread:`, e);
                previewErrorCb(e, operationType);
                this.isOverallTranslating = false; this.uiManager.setTranslatingState(false); if(resultModalComp) resultModalComp.updateButtonStates(); return;
            }
        } else {
            chunks = (textToProcess && textToProcess.trim() !== "") ? [textToProcess] : [];
            this.logger.info(`SubTranslation (${operationType}): Text does not need chunking or is empty. Number of chunks: ${chunks.length}`);
        }

        if (chunks.length === 0) {
            this.logger.warn(`SubTranslation (${operationType}): No valid chunks to process. Aborting sub-translation.`);
            if (textToProcess && textToProcess.trim().length > 0) {
                 previewErrorCb(new Error("Unable to process content for this task."), operationType);
            }
            this.isOverallTranslating = false;
            this.uiManager.setTranslatingState(false);
            // The modal handles clearing pendingOperationType when transitioning out of PREVIEWING,
            // but we still update button states here.
            if (resultModalComp) resultModalComp.updateButtonStates();
            return;
        }
        this.logger.info(`SubTranslation (${operationType}): Starting sub-translation loop with ${chunks.length} chunks.`);

        let previousChunkPreviewText = "";
        let accumulatedFullPreviewText = "";
        // let anErrorOccurredInSub = false; // Not strictly needed if we rely on try/catch for flow

        try {
            for (let i = 0; i < chunks.length; i++) {
                if (this.isCancelled) {
                    this.logger.info(`SubTranslation (${operationType}): Cancelled by user.`);
                    break;
                }
                const chunkToProcessLoop = chunks[i];
                 if (!chunkToProcessLoop || chunkToProcessLoop.trim() === "") {
                    this.logger.info(`SubTranslation (${operationType}): Skipping empty chunk at index ${i}.`);
                    continue;
                }
                const isLastChunkOfOverallSubOperation = i === chunks.length - 1;
                let apiContextForThisSubChunk = contextForOperation;

                if (i > 0 && previousChunkPreviewText && modelCfg.chunkContextWords > 0 &&
                    ['retry','words','retranslate'].includes(operationType)) {
                    const contextSegment = Utils.getPreviousTranslatedSegment(previousChunkPreviewText, modelCfg.chunkContextWords);
                    if (contextSegment) {
                        apiContextForThisSubChunk = `This is the next part of an ongoing process. The previous segment ended with: "${contextSegment}". Continue naturally and coherently based on the original task. Original prompt for this part: ${contextForOperation}`;
                    }
                }
                // Retry loop — mirrors _startMainTranslation's chunk-level resilience.
                // Known limitation: if the first attempt streams partial text before failing,
                // that partial text remains visible in the preview until retry succeeds.
                // This is intentional: partial output is better than a spinner freeze.
                const MAX_SUB_RETRIES = this.configManager.getConstant('MAX_CHUNK_RETRIES') ?? 3;
                const SUB_RETRY_DELAY = this.configManager.getConstant('RETRY_DELAY_MS') ?? 2000;
                let subChunkRetry = 0;
                let completedTextForThisSubChunk = "";

                while (subChunkRetry <= MAX_SUB_RETRIES) {
                    let currentSubChunkStreamingText = "";
                    const isFirstAttempt = subChunkRetry === 0;
                    try {
                        await new Promise((resolveSubChunk, rejectSubChunk) => {
                            this.apiService.callAPIStream(chunkToProcessLoop, {
                                onChunk: (textPart, isFinalSubChunkOfApiStream) => {
                                    if (textPart === null || typeof textPart === 'undefined') return;
                                    currentSubChunkStreamingText += textPart;
                                    // Stream to preview only on first attempt to avoid duplicate text
                                    // from a partial first-attempt stream appearing in the preview.
                                    if (isFirstAttempt) previewUpdateCb(textPart, isFinalSubChunkOfApiStream, false);
                                },
                                onComplete: (result) => {
                                    completedTextForThisSubChunk = result.finalText || currentSubChunkStreamingText;
                                    resolveSubChunk();
                                },
                                onError: (error) => { rejectSubChunk(error); },
                                abortSignal
                            }, apiContextForThisSubChunk);
                        });

                        // On retry success push the full chunk text at once so preview is coherent.
                        if (!isFirstAttempt && completedTextForThisSubChunk.trim()) {
                            previewUpdateCb(completedTextForThisSubChunk, true, false);
                        }
                        break; // chunk succeeded

                    } catch (subErr) {
                        if (subErr.name === 'AbortError') throw subErr;
                        subChunkRetry++;
                        if (subChunkRetry > MAX_SUB_RETRIES) {
                            this.logger.error(`Sub-translation chunk ${i + 1} failed permanently after ${MAX_SUB_RETRIES} retries.`);
                            throw subErr;
                        }
                        const waitMs = subErr.isRateLimitError
                            ? (subErr.retryAfterMs ?? SUB_RETRY_DELAY * Math.pow(2, subChunkRetry))
                            : Math.min(SUB_RETRY_DELAY * subChunkRetry, 30_000);
                        this.logger.warn(`Sub-chunk ${i + 1} retry ${subChunkRetry}/${MAX_SUB_RETRIES} in ${Math.round(waitMs / 1000)}s. Reason: ${subErr.message}`);
                        await Utils.delay(waitMs, abortSignal);
                    }
                }

                previousChunkPreviewText = completedTextForThisSubChunk;
                accumulatedFullPreviewText += (accumulatedFullPreviewText.trim().length > 0 && completedTextForThisSubChunk.trim().length > 0 ? "\n\n" : "") + completedTextForThisSubChunk;

                if (!isLastChunkOfOverallSubOperation && chunks.length > 1 && modelCfg.delayBetweenChunksMs > 0 &&
                    ['retry','words','retranslate'].includes(operationType)) {
                    this.logger.info(`Preview Op '${operationType}': Waiting ${modelCfg.delayBetweenChunksMs}ms...`);
                    await Utils.delay(modelCfg.delayBetweenChunksMs);
                }
            }
            if (!this.isCancelled) {
                previewFinalizeCb(accumulatedFullPreviewText, operationType);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                this.logger.info(`SubTranslation (${operationType}): Aborted.`);
            } else {
                previewErrorCb(error, operationType);
            }
        } finally {
            this.isOverallTranslating = false;
            this.uiManager.setTranslatingState(false);
            // State machine enforces pendingOperationType cleanup when moving away from PREVIEWING
            if (resultModalComp) resultModalComp.updateButtonStates();
        }
    }
}

    class WNovelTranslatorApp {
    constructor() {
        this.configManager = new ConfigManager();
        this.logger = new Logger(this.configManager);
        this.configManager.logger = this.logger;
        this.utils = Utils;

        this.workerPool = null;

        this.storageService = new StorageService(this.logger);
        this.historyService = new HistoryService(this.storageService, this.logger);
        this.settingsService = new SettingsService(this.storageService, this.logger, this.configManager);
    }

    _buildAppServices() {
        this.contentExtractorService = new ContentExtractorService(this.logger, this.configManager, this.storageService);
        this.apiService = new ApiService(this.settingsService, this.logger, this.configManager);

        // Initialize without UIManager first, wire it in init()
        this.translationOrchestrator = new TranslationOrchestrator(
            this.apiService, this.contentExtractorService, this.settingsService,
            null, this.logger, this.configManager,
            this.workerPool
        );

        return {
            settingsService: this.settingsService, apiService: this.apiService,
            contentExtractorService: this.contentExtractorService, translationOrchestrator: this.translationOrchestrator,
            historyService: this.historyService,
            logger: this.logger, configManager: this.configManager, utils: this.utils,
            workerPool: this.workerPool,
            readabilityJsCodeString: readabilityJsCodeString,
            showdownJsCodeString: showdownJsCodeString
        };
    }

    async _initWorkerPool() {
        try {
            if (typeof workerpool === 'undefined') {
                this.logger.warn("Workerpool library is not loaded. Worker mode will be disabled.");
                this.workerPool = null;
                return;
            }

            // [CSP CHECK] Thử tạo Worker để xem có bị chặn bởi Content-Security-Policy không
            // Nhiều trang (như truyện) chặn 'blob:' hoặc 'unsafe-eval'
            try {
                // Tạo một worker dummy tối thiểu để test môi trường
                const testBlob = new Blob(["console.log('Test worker')"], { type: 'application/javascript' });
                const testUrl = URL.createObjectURL(testBlob);
                const testWorker = new Worker(testUrl);
                testWorker.terminate();
                URL.revokeObjectURL(testUrl);
            } catch (cspError) {
                this.logger.warn(`CSP blocked blob workers. Switching to Main Thread mode. Error: ${cspError.message}`);
                this.workerPool = null;
                return;
            }

            const numWorkers = Math.max(1, Math.floor(navigator.hardwareConcurrency / 2) || 1);

            // Khởi tạo workerpool thực sự
            this.workerPool = workerpool.pool(workerScriptBlobUrl, {
                minWorkers: 1,
                maxWorkers: numWorkers,
                workerType: 'web'
            });

            this.logger.info(`WorkerPool initialized with up to ${numWorkers} workers.`);

            // Warm-up: kiểm tra worker có thực sự chạy được không
            try {
                await this.workerPool.exec('splitTextIntoChunksWorker', ["test", 10, 0]);
                this.logger.debug("WorkerPool warm-up completed successfully.");
            } catch(err) {
                this.logger.warn("WorkerPool warm-up failed. Permanently switching to Main Thread mode.", err);
                try { this.workerPool.terminate(); } catch (_) {}
                this.workerPool = null;
            }

        } catch (e) {
            this.logger.error("Unable to initialize WorkerPool (Unknown error):", e);
            this.workerPool = null;
        }
    }

    async init() {
            this.logger.info(`Initializing WNovel Translator V1 v${GM_info?.script?.version || 'unknown'}`);
            await this.settingsService.loadSettings();
            await this._initWorkerPool();

            const appServices = this._buildAppServices();

            this.uiManager = new UIManager(appServices, this.logger, this.configManager);
            this.translationOrchestrator.uiManager = this.uiManager; // Wire up

            await this.uiManager.initialize();

            const savedResultState = await this.settingsService.loadResultModalState();
            const resultModal = this.uiManager.getComponent('RESULT_MODAL');
            const mainControls = this.uiManager.getComponent('MAIN_CONTROLS');

            if (resultModal && mainControls && savedResultState && savedResultState.isMinimized) {
                this.logger.info("Restoring minimized result window state from storage.");

                const newState = {
                    committedText: savedResultState.stableText || "",
                    sourceText: savedResultState.originalText,
                    title: savedResultState.title || "Result restored",
                    scrollTop: savedResultState.scrollTop || 0,
                    viewMode: savedResultState.viewMode || 'editing',
                    previewText: savedResultState.previewText !== null ? savedResultState.previewText : null,
                    pendingOperationType: savedResultState.previewText !== null ? savedResultState.currentPendingOpTypeForPreview : null,
                    preMinimizedStatus: savedResultState.preMinimizedStatus
                };

                resultModal._state = { ...resultModal._state, ...newState, status: resultModal.MODAL_STATE.MINIMIZED };

                const originalTextForRetry = (savedResultState.previewText !== null && savedResultState.previewOriginalSourceText)
                                           ? savedResultState.previewOriginalSourceText
                                           : savedResultState.originalText;

                if (this.translationOrchestrator && originalTextForRetry) {
                    this.translationOrchestrator.lastOriginalTextForMain = originalTextForRetry;
                }
                mainControls.showRestoreIcon(true, resultModal._state.title);
            } else if (savedResultState && !savedResultState.isMinimized) {
                this.logger.info("Invalid result modal state found (not minimized). Clearing.");
                await this.settingsService.clearResultModalState();
            }

            GM_registerMenuCommand(`WNovel Translator - Settings (V${GM_info?.script?.version?.split('.')[0] || '3'})`, () => this.uiManager.toggleModal('SETTINGS_MODAL'));
            this.logger.info("Application initialized successfully.");
        }
    }

    function main() {
         if (window.self !== window.top && !window.location.href.includes('pixiv.net/novel/show.php') && !window.__WNOVEL_ALLOW_IFRAME__) {
            const tempConfig = new ConfigManager();
            const tempLogger = new Logger(tempConfig);
            tempConfig.logger = tempLogger;
            tempLogger.info("Not allowed inside an iframe. Script will not run.");
            return;
         }
        const app = new WNovelTranslatorApp();
        app.init().catch(error => {
            const fbConfig = new ConfigManager(); const fbLogger = new Logger(fbConfig); fbConfig.logger = fbLogger;
            fbLogger.error("Failed to initialize application:", error.message, error.stack);
            try { GM_notification({ title: `[${fbConfig.getScriptPrefix().replace(/_$/,'')}] INITIALIZATION ERROR`, text: `Error: ${error.message.substring(0, 200)}.`, timeout: 10000 });
            } catch(e){ /* GM_notification có thể thất bại */ }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            const delay = new ConfigManager().getConstant('CONTENT_FETCH_DELAY') || 250;
            setTimeout(main, delay);
        });
    } else {
        const delay = new ConfigManager().getConstant('CONTENT_FETCH_DELAY') || 250;
        setTimeout(main, delay);
    }