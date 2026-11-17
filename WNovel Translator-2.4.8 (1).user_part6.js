class MainControlsComponent extends BaseUIComponent {
         constructor(uiManager, configManager) {
            super(uiManager, configManager, "MAIN_CONTAINER");
            this.statusIndicatorElement = null;
            this.isMinimized = false;
            this.toggleMinimizeBtn = null;
            this.restoreResultIconBtn = null;
            this.statusTimeoutId = null;
        }

        render() {
            const prefix = this.configManager.getScriptPrefix();
            const cfg = this.configManager;

            this.isMinimized = this.appServices.settingsService.getMainControlsMinimizedState();
            this.statusIndicatorElement = this.domBuilder.createEl('div', {
            id: cfg.getUiId('STATUS_INDICATOR'),
            className: `${prefix}status-indicator`,
            style: { display: 'none' }
        });

            const translateBtn = this.domBuilder.createButton({
                id: cfg.getUiId('TRANSLATE_BTN'), text: 'Translate', title: 'Translate current page content',
                onClick: () => this.appServices.translationOrchestrator.translateFullPage(), className: `${prefix}button ${prefix}button-primary`
            });

            const translateSelectionBtn = this.domBuilder.createButton({
                id: cfg.getUiId('TRANSLATE_SELECTION_BTN'), text: 'Selection', title: 'Translate selected text',
                onClick: () => this.appServices.translationOrchestrator.translateSelection(),
                disabled: !window.getSelection()?.toString().trim(), className: `${prefix}button`
            });

            const exportBtn = this.domBuilder.createButton({
                id: cfg.getUiId('EXPORT_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('download', { width: 18, height: 18 }),
                title: 'Export / Extract original content',
                onClick: () => this.appServices.translationOrchestrator.exportExtractedContent(),
                className: `${prefix}button ${prefix}icon-button`
            });

            const historyBtn = this.domBuilder.createButton({
                id: cfg.getUiId('HISTORY_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('history', { width: 18, height: 18 }),
                title: 'History / Projects',
                onClick: () => this.uiManager.toggleModal('HISTORY_MODAL'),
                className: `${prefix}button ${prefix}icon-button`
            });

            const settingsBtn = this.domBuilder.createButton({
                id: cfg.getUiId('SETTINGS_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('settings', { width: 18, height: 18 }),
                title: 'Settings',
                onClick: () => this.uiManager.toggleModal('SETTINGS_MODAL'),
                className: `${prefix}button ${prefix}icon-button`
            });

            this.toggleMinimizeBtn = this.domBuilder.createButton({
                id: cfg.getUiId('TOGGLE_MAIN_CONTROLS_MINIMIZE_BTN'),
                onClick: () => this._toggleMinimizeMainControls(),
                className: `${prefix}button ${prefix}icon-button ${prefix}toggle-minimize-button`
            });

            const controlsWrapper = this.domBuilder.createEl('div', { className: `${prefix}main-controls-wrapper`},
                [translateBtn, translateSelectionBtn, exportBtn, historyBtn, settingsBtn]
            );

            const mainControlsInnerContainer = this.domBuilder.createEl('div', { className: `${prefix}main-controls-inner`},
                [controlsWrapper, this.toggleMinimizeBtn]
            );

            this.restoreResultIconBtn = this.domBuilder.createButton({
                id: cfg.getUiId('MAIN_CONTROLS_RESTORE_RESULT_BTN'),
                title: 'Restore result window',
                className: `${prefix}button ${prefix}restore-result-icon-btn`,
                style: { display: 'none' },
                onClick: () => {
                    const resultModal = this.uiManager.getComponent('RESULT_MODAL');
                    if (resultModal) {
                        resultModal.wasMinimizedAndRestored = true;
                        this.uiManager.toggleModal('RESULT_MODAL', true);
                    } else {
                        this.logger.warn("Restore button clicked, but ResultModal component not found.");
                    }
                }
            });

            this.element = this.domBuilder.createEl('div', {id: this.id, className: `${prefix}main-controls`},
                [this.restoreResultIconBtn, this.statusIndicatorElement, mainControlsInnerContainer]
            );

            this._applyMainControlsMinimizedVisuals();
            return this.element;
        }

        _toggleMinimizeMainControls() {
            this.isMinimized = !this.isMinimized;
            this.appServices.settingsService.setMainControlsMinimizedState(this.isMinimized);
            this._applyMainControlsMinimizedVisuals();
        }

        _applyMainControlsMinimizedVisuals() {
            if (!this.element || !this.toggleMinimizeBtn) return;
            const prefix = this.configManager.getScriptPrefix();
            const mainControlsInner = this.element.querySelector(`.${prefix}main-controls-inner`);

            if (this.isMinimized) {
                this.element.classList.add(`${prefix}main-controls-compact`);
                this.toggleMinimizeBtn.innerHTML = /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('chevron-up', { width: 18, height: 18 });
                this.toggleMinimizeBtn.title = 'Expand control panel';
                if (mainControlsInner) {
                    const wrapper = mainControlsInner.querySelector(`.${prefix}main-controls-wrapper`);
                    if (wrapper) wrapper.style.display = 'none';
                }
            } else {
                this.element.classList.remove(`${prefix}main-controls-compact`);
                this.toggleMinimizeBtn.innerHTML = /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('chevron-down', { width: 18, height: 18 });
                this.toggleMinimizeBtn.title = 'Collapse control panel';
                if (mainControlsInner) {
                    const wrapper = mainControlsInner.querySelector(`.${prefix}main-controls-wrapper`);
                    if (wrapper) wrapper.style.display = 'flex';
                }
            }
            if(!this.appServices.translationOrchestrator.isOverallTranslating) this.updateSelectionButtonState();
        }

        showRestoreIcon(show, titleSnippet = "Result minimized") {
            if (this.restoreResultIconBtn) {
                this.restoreResultIconBtn.style.display = show ? 'flex' : 'none';
                if (show) {
                    const iconHTML = this.uiManager.iconManager.getIcon('restore', { width: 16, height: 16 });
                    const textHTML = `<span style="margin-left: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${titleSnippet.substring(0,22)}${titleSnippet.length > 22 ? '…' : ''}</span>`;
                    this.restoreResultIconBtn.innerHTML = iconHTML + textHTML;
                    this.restoreResultIconBtn.title = `Restore: ${titleSnippet}`;
                }
            }
        }

        updateStatus(message, level = 'info') {
            if (this.statusIndicatorElement) {
                if (this.statusTimeoutId) {
                clearTimeout(this.statusTimeoutId);
                this.statusTimeoutId = null;
            }

                this.statusIndicatorElement.textContent = message.substring(0, 100) + (message.length > 100 ? '...' : '');
                this.statusIndicatorElement.className = `${this.configManager.getScriptPrefix()}status-indicator status-${level.toLowerCase()}`;
                this.statusIndicatorElement.title = message;
                this.statusIndicatorElement.style.display = 'block';
                if (level === 'success' || level === 'info' && message !== 'Ready.') {
                this.statusTimeoutId = setTimeout(() => {
                    this.statusIndicatorElement.style.display = 'none';
                    this.statusTimeoutId = null;
                }, 3000);
            }
        }
    }

        setTranslatingState(isTranslating, message = "") {
            const translateBtn = this.getEl('TRANSLATE_BTN');
            const translateSelectionBtn = this.getEl('TRANSLATE_SELECTION_BTN');
            const exportBtn = this.getEl('EXPORT_BTN');
            const settingsBtn = this.getEl('SETTINGS_BTN');
            const toggleMinimizeBtnEl = this.toggleMinimizeBtn;
            const historyBtn = this.getEl('HISTORY_BTN');

            const disableBasicButtons = isTranslating;
            if (translateBtn) translateBtn.disabled = disableBasicButtons;
            if (translateSelectionBtn) translateSelectionBtn.disabled = disableBasicButtons || !window.getSelection()?.toString().trim();
            if (exportBtn) exportBtn.disabled = disableBasicButtons;
            if (settingsBtn) settingsBtn.disabled = disableBasicButtons;
            if (historyBtn) historyBtn.disabled = disableBasicButtons;
            if (toggleMinimizeBtnEl) toggleMinimizeBtnEl.disabled = disableBasicButtons;

            if (isTranslating) {
                this.updateStatus(message || "Processing...", "info");
            } else {
                if (this.statusIndicatorElement) {
                    this.statusIndicatorElement.style.display = 'none';
                }
                this.updateSelectionButtonState();
            }
            this._applyMainControlsMinimizedVisuals();
        }

        updateSelectionButtonState() {
            const translateSelectionBtn = this.getEl('TRANSLATE_SELECTION_BTN');
            if (translateSelectionBtn && !this.appServices.translationOrchestrator.isOverallTranslating) {
                translateSelectionBtn.disabled = !window.getSelection()?.toString().trim();
            }
        }
    }

class TranslationViewComponent extends BaseUIComponent {
        constructor(uiManager, configManager) {
            super(uiManager, configManager, 'TRANSLATION_VIEW_PANEL');
            this.currentMode = 'editing';
            this.storedText = "";
            this.shouldAutoScroll = true;
            this.element = null;

            this.isRendering = false;
            this.pendingRender = false;
            this.lastRenderTime = 0;
            this.RENDER_THROTTLE_MS = 100;
            this.renderLoopId = null;
            this._lastRenderedText = null;

            // [SCROLL RESTORE VARIABLES]
            this.queuedScrollTop = null;

            // [MAIN THREAD] Khởi tạo Converter một lần để tái sử dụng (Performance)
            this.showdownConverter = null;
            this._initShowdown();
        }

        _initShowdown() {
            if (typeof showdown !== 'undefined') {
                // [FIX] Ngăn Showdown subParser 'ellipsis' thay thế "..." thành "…" bị lỗi encoding thành â¦ / â€¦
                try {
                    if (typeof showdown.subParser === 'function') {
                        showdown.subParser('ellipsis', function(text) {
                            return text;
                        });
                    }
                } catch (e) {
                    console.warn('[WNovel Translator] Failed to override showdown ellipsis subparser:', e);
                }

                this.showdownConverter = new showdown.Converter({
                    ellipsis: false, // Tắt tự động biến đổi dấu ba chấm
                    simpleLineBreaks: true, // Bảo toàn xuống dòng tự nhiên của web novel, tránh dính liền các câu/dòng thoại
                    ghCompatibleHeaderId: true,
                    tables: true,
                    strikethrough: true,
                    tasklists: true,
                    emoji: true,
                    openLinksInNewWindow: true,
                    literalMidWordUnderscores: true,
                    ghMentions: false
                });
            } else {
                // Retry later if library not loaded yet
                setTimeout(() => { if (!this.showdownConverter) this._initShowdown(); }, 1000);
            }
        }

        setQueuedScrollTop(scrollTop) {
            if (scrollTop === null || scrollTop === undefined) return;
            this.queuedScrollTop = scrollTop;
            this.shouldAutoScroll = false; // Exclusivity logic: if queued restore, don't auto-scroll
            this._attemptScrollRestorationLoop();
        }

        _attemptScrollRestorationLoop(attempts = 0) {
            if (this.queuedScrollTop === null || !this.element || attempts >= 5) {
                // If we hit attempt limit, just drop it to prevent infinite loop
                this.queuedScrollTop = null;
                return;
            }

            const el = this.element;
            const target = this.queuedScrollTop;

            if (target > 0 && el.scrollHeight <= el.clientHeight && attempts < 5) {
                requestAnimationFrame(() => this._attemptScrollRestorationLoop(attempts + 1));
                return;
            }

            el.scrollTop = target;
            const maxScroll = el.scrollHeight - el.clientHeight;
            const currentScroll = el.scrollTop;

            const reachedTarget = Math.abs(currentScroll - target) <= 10;
            const reachedBottom = (target >= maxScroll) && (Math.abs(currentScroll - maxScroll) <= 10);

            if (reachedTarget || reachedBottom) {
                this.queuedScrollTop = null;
                return;
            }

            // Retry until attempt limit
            requestAnimationFrame(() => this._attemptScrollRestorationLoop(attempts + 1));
        }

        render() {
            const prefix = this.configManager.getScriptPrefix();
            this.element = this.domBuilder.createEl('div', {
                id: this.configManager.getUiId('RESULT_MODAL_BODY'),
                className: `${prefix}modal-text-area`,
            });

            this.element.addEventListener('click', (e) => {
                const retryBtn = e.target.closest(`.${prefix}inline-retry-btn`);
                if (retryBtn) {
                    const originalText = decodeURIComponent(retryBtn.dataset.originalText || '');
                    if (originalText && this.appServices.translationOrchestrator) {
                        e.preventDefault();
                        retryBtn.disabled = true;
                        retryBtn.textContent = 'Queued...';
                        // Khởi động sub-task, or remove error and restart that chunk.
                        // However, sub-translation opens PREVIEW.
                        // To keep it simple, we push it to Result Modal custom sub-translation:
                        const resultModal = this.appServices.uiManager.getComponent('RESULT_MODAL');
                        if (resultModal && !this.appServices.translationOrchestrator.isOverallTranslating) {
                            // We mock the "lastOriginalTextForMain" temporarily
                            const oldOrig = this.appServices.translationOrchestrator.lastOriginalTextForMain;
                            this.appServices.translationOrchestrator.lastOriginalTextForMain = originalText;
                            resultModal._executeSubTranslationTask(
                                this.configManager.CONSTANTS.OPERATION_TYPE.RETRY,
                                this.configManager.CONSTANTS.TEXT_SOURCE.ORIGINAL,
                                null
                            );
                            // Restore after kick-off (synced partly but mostly okay for preview)
                            setTimeout(() => {
                                this.appServices.translationOrchestrator.lastOriginalTextForMain = oldOrig;
                            }, 500);
                        } else {
                            this.appServices.logger.notify("Another translation task is currently running.", "Notice", "warn");
                            retryBtn.disabled = false;
                            retryBtn.textContent = 'Please try translating this segment again';
                        }
                    }
                }
            });

            this.element.addEventListener('scroll', () => {
                if (!this.appServices.translationOrchestrator.isOverallTranslating || this.queuedScrollTop !== null) return;
                const el = this.element;
                const isScrolledToBottom = el.scrollHeight - el.clientHeight <= el.scrollTop + 50;
                this.shouldAutoScroll = isScrolledToBottom;
            });

            this._renderContent(true);
            this.applyDisplaySettings();
            return this.element;
        }

        setText(text) {
            const newText = (text === null || typeof text === 'undefined') ? "" : String(text);
            if (this.storedText !== newText) {
                this.storedText = newText;
                this.pendingRender = true;
                this._scheduleRender();
            }
        }

        setMode(mode) {
            if (mode === this.currentMode || !this.element || (mode !== 'editing' && mode !== 'reader')) return;
            this.currentMode = mode;
            this.pendingRender = true;
            this._renderContent(true);
            this.logger.debug(`TranslationView switched to ${this.currentMode} mode.`);
        }

        getText() { return this.storedText; }

        _scheduleRender() {
            if (this.renderLoopId) return;
            const renderLoop = () => {
                const now = Date.now();
                const isTranslating = this.appServices.translationOrchestrator.isOverallTranslating;

                if (this.pendingRender && !this.isRendering &&
                   ((now - this.lastRenderTime >= this.RENDER_THROTTLE_MS) || !isTranslating)) {
                    this._renderContent();
                }

                if (isTranslating || this.pendingRender) {
                    this.renderLoopId = requestAnimationFrame(renderLoop);
                } else {
                    this.renderLoopId = null;
                }
            };
            this.renderLoopId = requestAnimationFrame(renderLoop);
        }

        async _renderContent(force = false) {
            if (!this.element) return;
            if (!force && this.isRendering) return;

            this.isRendering = true;
            this.pendingRender = false;
            this.lastRenderTime = Date.now();
            const prefix = this.configManager.getScriptPrefix();

            // --- LOADING STATE ---
            if (this.storedText === this.configManager.getConstant('PROCESSING_MESSAGE_IDENTIFIER') || this.storedText === this.configManager.getConstant('RETRYING_MESSAGE_IDENTIFIER')) {
                const isRetrying = this.storedText === this.configManager.getConstant('RETRYING_MESSAGE_IDENTIFIER');
                const loadingMessage = isRetrying ? 'Retrying segment…' : 'Initializing AI...';
                const textColor = isRetrying ? 'var(--wnvt-err, #dc2626)' : 'currentColor';
                this.element.classList.remove(`${prefix}editor-mode`);
                this.element.classList.remove(`${prefix}reader-mode`);
                this.element.innerHTML = `<div class="${prefix}loading-container" role="status" aria-live="polite" style="display:flex; justify-content:center; align-items:center; height:100%; min-height:150px; flex-direction:column; gap: 15px; color: ${textColor};">
                    <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="${prefix}loading-spin">
                        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    <div class="${prefix}loading-pulse" style="font-weight: 500; font-size: 1.1em;">${loadingMessage}</div>
                </div>`;
                this.isRendering = false;
                return;
            }

            // --- A. EDITOR MODE (Plain Text) ---
            if (this.currentMode === 'editing') {
                this.element.classList.remove(`${prefix}reader-mode`);
                this.element.classList.add(`${prefix}editor-mode`);
                this.element.contentEditable = 'false'; // Hoặc true nếu muốn cho sửa

                // Chỉ update textContent nếu có thay đổi để tránh mất vị trí con trỏ (nếu editable)
                if (force || this.element.textContent !== this.storedText || this._lastRenderedMode !== 'editing') {
                    // Cắt bỏ các tag HTML nội bộ nếu show trong edit mode
                    let displayText = this.storedText || "";
                    if (displayText.includes('streaming-text')) {
                        displayText = displayText.replace(new RegExp(`<span class="[^"]*streaming-text">([\\s\\S]*?)</span>`, 'g'), '$1');
                    }
                    if (displayText.includes('inline-error-block')) {
                        displayText = displayText.replace(new RegExp(`<div class="[^"]*inline-error-block">[\\s\\S]*?Please try translating this segment again</button>\\s*</div>`, 'g'), '\n\n[SEGMENT TRANSLATION ERROR - Please review]\n\n');
                    }
                    this.element.textContent = displayText;
                    if (this.appServices.translationOrchestrator.isOverallTranslating && this.shouldAutoScroll && this.queuedScrollTop === null) {
                        this.element.scrollTop = this.element.scrollHeight;
                    }
                    this._lastRenderedMode = 'editing';
                }
            }
            // --- B. READER MODE (Markdown + KaTeX on Main Thread) ---
            else {
                this.element.classList.remove(`${prefix}editor-mode`);
                this.element.classList.add(`${prefix}reader-mode`);
                this.element.contentEditable = 'false';

                if (!force && this.storedText === this._lastRenderedText && this._lastRenderedMode === 'reader') {
                    this.isRendering = false;
                    return;
                }

                try {
                    // Chuẩn bị text: bóc tách các thẻ streaming hoặc error block nội bộ nếu có
                    let rawText = this.storedText || "";
                    if (rawText.includes('streaming-text')) {
                        rawText = rawText.replace(new RegExp(`<span class="[^"]*streaming-text">([\\s\\S]*?)</span>`, 'g'), '$1');
                    }
                    if (rawText.includes('inline-error-block')) {
                        rawText = rawText.replace(new RegExp(`<div class="[^"]*inline-error-block">[\\s\\S]*?Please try translating this segment again</button>\\s*</div>`, 'g'), '\n\n[SEGMENT TRANSLATION ERROR - Please review]\n\n');
                    }

                    // 1. Markdown Parsing (Main Thread)
                    let finalHtml = "";
                    if (this.showdownConverter) {
                        finalHtml = this.showdownConverter.makeHtml(rawText);
                    } else if (typeof showdown !== 'undefined') {
                        // Fallback khởi tạo nếu chưa có
                        this._initShowdown();
                        if (this.showdownConverter) finalHtml = this.showdownConverter.makeHtml(rawText);
                        else finalHtml = `<p>${rawText.replace(/\n/g, '<br>')}</p>`; // Fallback tối thiểu
                    } else {
                         // Fallback khi thư viện chưa load
                        finalHtml = rawText.split(/\n+/).map(line => `<p>${line}</p>`).join('');
                    }

                    // [FIX] Khử triệt để mọi tàn dư ký tự mojibake như â¦, â€¦ nếu có từ trước hoặc do charset trang
                    if (finalHtml.includes('â')) {
                        finalHtml = finalHtml
                            .replace(/â[\x80\u0080]?¦/g, '...')
                            .replace(/â€¦/g, '...')
                            .replace(/â€[“”]/g, '"')
                            .replace(/â€˜|â€™/g, "'")
                            .replace(/â€”|â€“/g, '—');
                    }

                    // 2. Sanitization (DOMPurify - Main Thread)
                    const cleanHtml = Utils.sanitizeHtml(finalHtml);

                    // 3. DOM Update & Math Rendering
                    this.element.innerHTML = `<div class="${prefix}reader-mode-content">${cleanHtml}</div>`;
                    this._lastRenderedText = this.storedText;
                    this._lastRenderedMode = 'reader';

                    // 4. KaTeX Rendering (Main Thread - Directly on DOM)
                    // [FIX] Loại bỏ delimiter single dollar '$' để tránh nhận nhầm giá tiền ($10, $50, 100$) trong tiểu thuyết thành công thức toán lỗi
                    if (typeof renderMathInElement === 'function') {
                        renderMathInElement(this.element, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '\\(', right: '\\)', display: false},
                                {left: '\\[', right: '\\]', display: true}
                            ],
                            ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
                            throwOnError: false,
                            errorColor: 'var(--wnvt-err, #dc2626)'
                        });
                    }

                    // Auto-scroll logic
                    if (this.appServices.translationOrchestrator.isOverallTranslating && this.shouldAutoScroll && this.queuedScrollTop === null) {
                        this.element.scrollTop = this.element.scrollHeight;
                    }
                } catch (e) {
                    this.logger.error("Error in _renderContent (Reader Mode):", e);
                    // Fallback to text if render fails
                    this.element.textContent = this.storedText;
                }
            }

            this.isRendering = false;
        }

        applyDisplaySettings() {
            if (!this.element) return;
            const settings = this.appServices.settingsService.get(this.configManager.SETTING_KEYS.DISPLAY_SETTINGS);
            if (!settings) return;

            const defaults = this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.DISPLAY_SETTINGS);
            const bgColor = settings.bgColor || defaults.bgColor;
            const textColor = settings.textColor || defaults.textColor;
            const fontFamily = (settings.fontFamily === 'System Default' ? 'inherit' : settings.fontFamily) || defaults.fontFamily;
            const fontSize = (settings.fontSize || defaults.fontSize) + "px";

            // Áp dụng styles
            this.element.style.backgroundColor = bgColor;
            this.element.style.color = textColor;
            this.element.style.fontFamily = fontFamily;
            this.element.style.fontSize = fontSize;

            // [Fix] Đảm bảo KaTeX cũng nhận màu chữ tương ứng
            this.element.style.setProperty('--wnvt-math-color', textColor);
        }

        getNativeElement() { return this.element; }
    }