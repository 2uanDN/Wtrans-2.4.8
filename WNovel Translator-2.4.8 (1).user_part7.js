class ResultModalComponent extends BaseUIComponent {
        constructor(uiManager, configManager) {
            super(uiManager, configManager, "RESULT_MODAL");
            this.modalKey = "RESULT_MODAL";
            this._isRendered = false;

            this.MODAL_STATE = {
                IDLE: 'IDLE',
                TRANSLATING: 'TRANSLATING',
                SHOWING_RESULT: 'SHOWING_RESULT',
                PREVIEWING: 'PREVIEWING',
                MINIMIZED: 'MINIMIZED'
            };

            this._state = {
                status: this.MODAL_STATE.IDLE,
                committedText: "",
                previewText: null,
                sourceText: null,
                title: "Translation Result",
                pendingOperationType: null,
                viewMode: 'editing',
                scrollTop: 0
            };

            this.translationViewComponent = new TranslationViewComponent(uiManager, configManager);
            this.customPromptPanelComponent = new CustomPromptPanelComponent(uiManager, configManager, this);
            this.resultActionBarComponent = new ResultActionBarComponent(uiManager, configManager, {
                onRetry: () => this._handleRetryClick(),
                onWords: () => this._handleWordsClick(),
                onRetranslate: () => this._handleRetranslateClick(),
                onToggleCustomPrompt: () => this._toggleCustomPromptPanel(),
                onApplyChanges: () => this._applyPreviewChanges(),
                onCancelChanges: () => this._cancelPreviewChanges()
            });
            this.isCustomPromptPanelVisible = false;
        }

        get isMinimized() { return this._state.status === this.MODAL_STATE.MINIMIZED; }
        set isMinimized(val) {
            if (val && this._state.status !== this.MODAL_STATE.MINIMIZED) this._state.status = this.MODAL_STATE.MINIMIZED;
            else if (!val && this._state.status === this.MODAL_STATE.MINIMIZED) this._state.status = this.MODAL_STATE.IDLE;
        }
        get stableTranslatedText() { return this._state.committedText; }
        set stableTranslatedText(val) { this._state.committedText = val; }
        get lastOriginalTextForState() { return this._state.sourceText; }
        set lastOriginalTextForState(val) { this._state.sourceText = val; }
        get currentTitleForState() { return this._state.title; }
        set currentTitleForState(val) { this._state.title = val; }
        get restoredScrollTop() { return this._state.scrollTop; }
        set restoredScrollTop(val) { this._state.scrollTop = val; }
        get restoredViewMode() { return this._state.viewMode; }
        set restoredViewMode(val) { this._state.viewMode = val; }

        _transitionTo(newStatus, statePartialUpdate = {}) {
            if (newStatus !== this._state.status) {
                const validTransitions = {
                    [this.MODAL_STATE.IDLE]: [this.MODAL_STATE.TRANSLATING, this.MODAL_STATE.SHOWING_RESULT],
                    [this.MODAL_STATE.TRANSLATING]: [this.MODAL_STATE.SHOWING_RESULT, this.MODAL_STATE.IDLE, this.MODAL_STATE.MINIMIZED],
                    [this.MODAL_STATE.SHOWING_RESULT]: [this.MODAL_STATE.PREVIEWING, this.MODAL_STATE.MINIMIZED, this.MODAL_STATE.IDLE],
                    [this.MODAL_STATE.PREVIEWING]: [this.MODAL_STATE.SHOWING_RESULT, this.MODAL_STATE.MINIMIZED],
                    [this.MODAL_STATE.MINIMIZED]: [this.MODAL_STATE.SHOWING_RESULT, this.MODAL_STATE.PREVIEWING, this.MODAL_STATE.TRANSLATING, this.MODAL_STATE.IDLE]
                };

                if (!validTransitions[this._state.status].includes(newStatus)) {
                    this.logger.error(`Invalid transition: ${this._state.status} -> ${newStatus}. Ignoring.`);
                    return;
                }
                this.logger.info(`[ResultModal] Transition: ${this._state.status} -> ${newStatus}`, statePartialUpdate);

                const oldStatus = this._state.status;
                Object.assign(this._state, statePartialUpdate);
                this._state.status = newStatus;

                // Enforce pendingOperationType invariant
                if (this._state.status !== this.MODAL_STATE.PREVIEWING && this._state.status !== this.MODAL_STATE.MINIMIZED) {
                    this._state.pendingOperationType = null;
                    this._state.previewText = null;
                }

                this._handleTransitionEffects(oldStatus, newStatus);
            } else {
                this.logger.info(`[ResultModal] Self-Transition (State Update): ${this._state.status}`, statePartialUpdate);
                Object.assign(this._state, statePartialUpdate);

                // Enforce pendingOperationType invariant
                if (this._state.status !== this.MODAL_STATE.PREVIEWING && this._state.status !== this.MODAL_STATE.MINIMIZED) {
                    this._state.pendingOperationType = null;
                    this._state.previewText = null;
                }

                // Also trigger persistence if we update while minimized
                if (this._state.status === this.MODAL_STATE.MINIMIZED) {
                    this._persistState();
                }
            }
        }

        _handleTransitionEffects(oldStatus, newStatus) {
            if (newStatus === this.MODAL_STATE.MINIMIZED) {
                this._persistState();

                let titleForIcon = this._state.title || "Translation Result";
                if (this._state.previewText !== null) {
                    const titleEl = this.getEl('RESULT_MODAL_TITLE');
                    if (titleEl) titleForIcon = titleEl.textContent;
                }
                if (titleForIcon.length > 70) titleForIcon = titleForIcon.substring(0, 67) + "...";

                this.uiManager.showRestoreResultIcon(true, titleForIcon);
                this.uiManager.toggleModal(this.modalKey, false);
            } else if (oldStatus === this.MODAL_STATE.MINIMIZED && newStatus !== this.MODAL_STATE.MINIMIZED) {
                (async () => {
                    await this.appServices.settingsService.clearResultModalState();
                })();
            } else if (newStatus === this.MODAL_STATE.IDLE) {
                (async () => {
                    await this.appServices.settingsService.clearResultModalState();
                })();
                this.uiManager.showRestoreResultIcon(false);
                this.uiManager.toggleModal(this.modalKey, false);
            }
        }

        async _persistState() {
            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            let fullTitle = this._state.title || "Translation Result";
            if (this._state.previewText !== null && titleEl) fullTitle = titleEl.textContent;

            const stateToSave = {
                isMinimized: true,
                title: fullTitle,
                originalText: this._state.sourceText,
                stableText: this._state.committedText,
                previewText: this._state.previewText,
                previewOriginalSourceText: this.appServices.translationOrchestrator?.lastOriginalTextForMain,
                currentPendingOpTypeForPreview: this._state.pendingOperationType,
                preMinimizedStatus: this._state.preMinimizedStatus,
                pageUrl: window.location.href,
                viewMode: this._state.viewMode,
                scrollTop: this._state.scrollTop
            };
            await this.appServices.settingsService.saveResultModalState(stateToSave);
        }

        // Thay thế toàn bộ phương thức render() trong class ResultModalComponent

render() {
    if (this._isRendered) return this.element;
    const prefix = this.configManager.getScriptPrefix();
    const cfg = this.configManager;

    // --- Header Construction (Giữ nguyên) ---
    const titleEl = this.domBuilder.createEl('h2', { id: cfg.getUiId('RESULT_MODAL_TITLE'), textContent: this.currentTitleForState });

    const minimizeBtn = this.domBuilder.createButton({
        id: cfg.getUiId('RESULT_MODAL_MINIMIZE_BTN'),
        innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('minus'),
        title: 'Minimize window (keep content)', className: `${prefix}modal-minimize-btn`,
        onClick: () => this._handleMinimizeClick()
    });
    const closeBtn = this.domBuilder.createButton({
        id: cfg.getUiId('RESULT_MODAL_CLOSE_BTN'),
        innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('x'),
        title: 'Close (Esc)', className: `${prefix}modal-close-btn`,
        onClick: () => this._handleCloseModal()
    });

    const headerControls = this.domBuilder.createEl('div', { className: `${prefix}modal-header-controls` }, [minimizeBtn, closeBtn]);
    const header = this.domBuilder.createEl('div', { id: cfg.getUiId('RESULT_MODAL_HEADER'), className: `${prefix}modal-header`}, [titleEl, headerControls]);

    // --- Body Construction (Giữ nguyên) ---
    const customPromptPanelElementItself = this.customPromptPanelComponent.render();
    const customPromptPanelContainer = this.domBuilder.createEl('div', {
        id: cfg.getUiId('CUSTOM_PROMPT_PANEL_CONTAINER'), className: `${prefix}custom-prompt-panel-container`,
        style: { display: 'none' }
    }, [customPromptPanelElementItself]);

    const translationViewElement = this.translationViewComponent.render();

    // Render actionBar early so its previewActionsGroup is available for insertion
    const actionBarElement = this.resultActionBarComponent.render();

    const mainContentArea = this.domBuilder.createEl('div', { className: `${prefix}result-modal-main-content`, style: { position: 'relative' } }, [
        customPromptPanelContainer, translationViewElement, this.resultActionBarComponent.previewActionsGroup
    ]);
    const bodyWrapper = this.domBuilder.createEl('div', {
        id: cfg.getUiId('RESULT_MODAL_BODY'),
        className: `${prefix}modal-body ${prefix}modal-body--flex-layout`
    }, [
        mainContentArea
    ]);

    // --- Footer Construction (CẬP NHẬT THEO THIẾT KẾ MỚI) ---

    // 1. Segmented Switch (Pill control)
    const toggleModeSwitchLabel = this.domBuilder.createEl('label', {
        className: `${prefix}segmented-switch`
    }, [
        this.domBuilder.createEl('input', {
            type: 'checkbox',
            id: cfg.getUiId('RESULT_MODAL_TOGGLE_MODE_BTN'),
            role: 'switch',
            'aria-checked': 'false',
            onChange: (e) => {
                this._handleToggleModeChange(e);
                e.target.setAttribute('aria-checked', e.target.checked.toString());
            }
        }),
        this.domBuilder.createEl('span', { className: `${prefix}segmented-slider` }),
        this.domBuilder.createEl('span', { className: `${prefix}segmented-option ${prefix}segmented-option--edit`, textContent: 'Edit' }),
        this.domBuilder.createEl('span', { className: `${prefix}segmented-option ${prefix}segmented-option--reader`, textContent: 'Reader' })
    ]);

    const toggleModeContainer = this.domBuilder.createEl('div', {
        className: `${prefix}mode-toggle-container`,
        title: 'Toggle between Editting and Reader mode'
    }, [toggleModeSwitchLabel]);

    // 2. Action Bar (Đã render ở trên)

    // 3. Settings Button (Neo ngoài cùng bên phải)
    const settingsBtn = this.domBuilder.createButton({
        id: cfg.getUiId('RESULT_MODAL_SETTINGS_BTN'),
        innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('settings'),
        title: 'Open Settings',
        className: `${prefix}button ${prefix}icon-button`,
        onClick: () => this.uiManager.toggleModal('SETTINGS_MODAL', true)
    });

    // 4. Add History Button
    const addHistoryBtn = this.domBuilder.createButton({
        id: cfg.getUiId('RESULT_MODAL_ADD_HISTORY_BTN'),
        innerHTML: /* trusted-static: no user input */ `${this.uiManager.iconManager.getIcon('plus', { width: 14, height: 14 })}<span>Add</span>`,
        title: 'Save current translation to History/Projects',
        className: `${prefix}button ${prefix}button-primary`,
        style: { display: 'none' }, // Only show in Edit mode
        onClick: () => this._handleAddHistoryClick()
    });

    const openHistoryBtn = this.domBuilder.createButton({
        id: cfg.getUiId('RESULT_MODAL_OPEN_HISTORY_BTN'),
        innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('history'),
        title: 'Open History/Projects',
        className: `${prefix}button ${prefix}icon-button`,
        style: { display: 'none' }, // Only show in Reader mode
        onClick: () => this.uiManager.toggleModal('HISTORY_MODAL', true)
    });

    const footerLeftContainer = this.domBuilder.createEl('div', {
        className: `${prefix}modal-footer-left`,
        style: { flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px' }
    }, [actionBarElement]);

    const footerCenterContainer = this.domBuilder.createEl('div', {
        className: `${prefix}modal-footer-center`,
        style: { flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }
    }, [toggleModeContainer]);

    const footerRightContainer = this.domBuilder.createEl('div', {
        className: `${prefix}modal-footer-right`,
        style: { flex: '1', minWidth: '0', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }
    }, [addHistoryBtn, openHistoryBtn, settingsBtn]);

    // 5. Unified Footer Container
    const footer = this.domBuilder.createEl('div', {
        id: cfg.getUiId('RESULT_MODAL_FOOTER'),
        className: `${prefix}modal-footer`,
        style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'nowrap'
        }
    }, [
        footerLeftContainer,
        footerCenterContainer,
        footerRightContainer
    ]);

    const modalContentDiv = this.domBuilder.createEl('div', { className: `${prefix}modal-content`, tabindex: "-1"}, [header, bodyWrapper, footer]);

    // Attach previewActionsGroup inside mainContentArea to float in the reading window body
    this.element = this.domBuilder.createEl('div', { id: this.id, className: `${prefix}modal-overlay`}, [
        modalContentDiv
    ]);

    this._isRendered = true;
    this.applyDisplaySettings();
    this.updateButtonStates();
    return this.element;
}

        showTranslationProgress(partialText, title) {
            this._ensureRendered();
            const processedText = (partialText === null || typeof partialText === 'undefined') ? "" : String(partialText);

            if (this._state.status === this.MODAL_STATE.MINIMIZED) {
                 this._transitionTo(this.MODAL_STATE.MINIMIZED, {
                     title: title,
                     committedText: this._state.committedText || "",
                     previewText: null,
                     pendingOperationType: null,
                     preMinimizedStatus: this.MODAL_STATE.TRANSLATING
                 });
                 if (this._state.pendingOperationType === null) {
                     this.updateTitle(title);
                     this.translationViewComponent.setText(processedText);
                 }
                 return;
            }

            if (this._state.status !== this.MODAL_STATE.TRANSLATING) {
                this._transitionTo(this.MODAL_STATE.TRANSLATING, {
                    previewText: null,
                    pendingOperationType: null
                });
                this._displayModal();
            }

            if (this._state.pendingOperationType === null) {
                this.updateTitle(title);
                this.translationViewComponent.setText(processedText);
            }
            this.updateButtonStates();
        }

        showCompletedTranslation(finalText, title) {
            this._ensureRendered();
            const processedText = (finalText === null || typeof finalText === 'undefined') ? "" : String(finalText);

            if (this._state.status === this.MODAL_STATE.MINIMIZED) {
                 if (this._state.pendingOperationType === null) {
                     try {
                         this._state.preMinimizedStatus = this.MODAL_STATE.SHOWING_RESULT;
                         this._transitionTo(this.MODAL_STATE.MINIMIZED, {
                             committedText: processedText,
                             title: title
                         });
                     } catch (e) {
                         this.logger.error("State transition failed:", e);
                         this._state.status = this.MODAL_STATE.IDLE;
                     }
                     this.updateTitle(title);
                     this.translationViewComponent.setText(processedText);
                 }
                 return;
            }

            const sourceText = this.appServices.translationOrchestrator ? this.appServices.translationOrchestrator.lastOriginalTextForMain : this._state.sourceText;

            if (this._state.pendingOperationType === null) {
                this.translationViewComponent.setText(processedText);
                this.updateTitle(title);
                try {
                    if (this._state.status === this.MODAL_STATE.IDLE || this._state.status === this.MODAL_STATE.TRANSLATING) {
                        this._transitionTo(this.MODAL_STATE.SHOWING_RESULT, {
                            committedText: processedText,
                            sourceText: sourceText,
                            previewText: null,
                            pendingOperationType: null
                        });
                    } else {
                        this._transitionTo(this._state.status, {
                            committedText: processedText,
                            sourceText: sourceText,
                            previewText: null,
                            pendingOperationType: null
                        });
                    }
                } catch (e) {
                    this.logger.error("State transition failed:", e);
                    this._state.status = this.MODAL_STATE.IDLE;
                }
            }

            if (processedText && processedText.trim().length > 0) {
                 this._displayModal();
            }
            this.updateButtonStates();
        }

        showError(errorText, title = "Error") {
            this._ensureRendered();
            const processedText = String(errorText);

            if (this._state.status === this.MODAL_STATE.MINIMIZED) {
                return;
            }

            if (this._state.pendingOperationType === null) {
                this.updateTitle(title);
                this.translationViewComponent.setText(processedText);
                const finalState = this._state.status === this.MODAL_STATE.TRANSLATING ? this.MODAL_STATE.SHOWING_RESULT : this._state.status;
                try {
                    this._transitionTo(finalState, { previewText: null, pendingOperationType: null });
                } catch (e) {
                    this.logger.error("State transition failed:", e);
                    this._state.status = this.MODAL_STATE.IDLE;
                }
            }

            this._displayModal();
            this.updateButtonStates();
        }

        _ensureRendered() {
            if (!this._isRendered && !this.element) {
                this.render();
            }
            if (!this.element || !this.translationViewComponent) {
                this.logger.error("ResultModal is not ready to show.");
            }
        }

        _displayModal() {
            if (!this.uiManager.isModalVisible(this.id)) {
                this.uiManager.toggleModal(this.modalKey, true);
            }
        }

        show(text, title = 'Translation', isError = false, isPartial = false) {
            if (isError) {
                this.showError(text, title);
            } else if (isPartial) {
                this.showTranslationProgress(text, title);
            } else {
                this.showCompletedTranslation(text, title);
            }
        }

        onShow() {
            const oldStatus = this._state.status;
            if (oldStatus === this.MODAL_STATE.MINIMIZED) {
                let restoreStatus = this._state.preMinimizedStatus || this.MODAL_STATE.SHOWING_RESULT;
                if(restoreStatus === this.MODAL_STATE.MINIMIZED) restoreStatus = this.MODAL_STATE.SHOWING_RESULT;
                this._transitionTo(restoreStatus);
            }
            this.uiManager.showRestoreResultIcon(false);

            const modeToApply = this._state.viewMode || this.translationViewComponent.currentMode;
            this.translationViewComponent.setMode(modeToApply);

            const processingMsg = this.configManager.getConstant('PROCESSING_MESSAGE_IDENTIFIER');
            const isCurrentlyProcessing = this.translationViewComponent.getText() === processingMsg;

            if (!isCurrentlyProcessing) {
                let textToDisplay = this._state.previewText !== null ? this._state.previewText : this._state.committedText;
                this.translationViewComponent.setText(textToDisplay);
            }

            if (this._state.title) {
                this.updateTitle(this._state.title);
            }

            this.applyDisplaySettings();
            this._toggleCustomPromptPanel(this.isCustomPromptPanelVisible);
            this.updateButtonStates();

            if (this._state.scrollTop !== null && this._state.scrollTop > 0) {
                this.translationViewComponent.setQueuedScrollTop(this._state.scrollTop);
                this._state.scrollTop = 0; // Reset after queueing
            }

            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            if (titleEl && !isCurrentlyProcessing) {
                if (this._state.previewText !== null) {
                    // Preview keeps its title changes
                } else if (titleEl.dataset.originalTitle) {
                    titleEl.textContent = titleEl.dataset.originalTitle;
                } else {
                    titleEl.textContent = this._state.title || "Translation Result";
                }
            }

            const modalContentEl = this.element.querySelector(`.${this.configManager.getScriptPrefix()}modal-content`);
            if (modalContentEl) {
                requestAnimationFrame(() => {
                    const focusableElements = this.uiManager._getFocusableElements(modalContentEl);
                    const firstFocusable = focusableElements[0];
                    if (!modalContentEl.contains(this.uiManager.shadowRoot.activeElement)) {
                        if (firstFocusable) { firstFocusable.focus(); }
                        else {
                            const closeButton = modalContentEl.querySelector(`.${this.configManager.getScriptPrefix()}modal-close-btn`);
                            if (closeButton) closeButton.focus();
                            else if (modalContentEl.hasAttribute('tabindex')) modalContentEl.focus();
                        }
                    }
                });
            }
        }

        _clearPreviewState(restoreViewToStable = true) {
            this._transitionTo(this.MODAL_STATE.SHOWING_RESULT, {
                previewText: null,
                pendingOperationType: null
            });
            if (restoreViewToStable && this.translationViewComponent) {
                this.translationViewComponent.setText(this._state.committedText);
            }
            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            if (titleEl && titleEl.dataset.originalTitle) {
                titleEl.textContent = titleEl.dataset.originalTitle;
            } else if (titleEl) {
                titleEl.textContent = this._state.title || "Translation Result";
            }
            this.updateButtonStates();
        }

        _applyPreviewChanges() {
            if (this._state.previewText !== null) {
                this._transitionTo(this.MODAL_STATE.SHOWING_RESULT, {
                    committedText: this._state.previewText
                });
                this.logger.info("Preview translation changes have been applied.");
            }
            this._clearPreviewState(false);
            this.logger.notify("Changes have been saved.", "Success", "success");
        }

        _cancelPreviewChanges() {
            if (this._state.previewText !== null) {
                this.logger.info("Preview translation changes have been discarded.");
            }
            this._clearPreviewState(true);
            this.logger.notify("Changes have been discarded.", "Discard");
        }

        async _handleMinimizeClick() {
            try {
                this._state.preMinimizedStatus = this._state.status;
                this._transitionTo(this.MODAL_STATE.MINIMIZED, {
                    viewMode: this.translationViewComponent.currentMode,
                    scrollTop: this.translationViewComponent.getNativeElement()?.scrollTop || 0
                });
            } catch (e) {
                this.logger.error("State transition failed:", e);
                this._state.status = this.MODAL_STATE.IDLE;
            }
            // Persistence and UI toggling handled automatically by _handleTransitionEffects
        }

        onClose() {
            this.logger.info("ResultModalComponent onClose triggered (e.g., via Escape key).");

            let isTranslating = this.appServices.translationOrchestrator && this.appServices.translationOrchestrator.isOverallTranslating;
            if (isTranslating) {
                if (this.appServices.translationOrchestrator && typeof this.appServices.translationOrchestrator.abortTranslation === 'function') {
                    this.appServices.translationOrchestrator.abortTranslation();
                }
            }

            if (this._state.previewText !== null) {
                 this._cancelPreviewChanges();
            }

            try {
                this._transitionTo(this.MODAL_STATE.IDLE, {
                    committedText: "",
                    sourceText: null,
                    previewText: null,
                    pendingOperationType: null,
                    title: "Translation Result"
                });

                if (this.translationViewComponent) {
                    this.translationViewComponent.setText("");
                    this.translationViewComponent.setMode('editing');
                }
                const titleEl = this.getEl('RESULT_MODAL_TITLE');
                if (titleEl) {
                    titleEl.textContent = "Translation Result";
                    titleEl.dataset.originalTitle = "Translation Result";
                }
                this.updateButtonStates();
            } catch (e) {
                this.logger.error("State transition failed in onClose:", e);
                this._state.status = this.MODAL_STATE.IDLE;
            }
        }

        async _handleCloseModal() {
            let isTranslating = this.appServices.translationOrchestrator && this.appServices.translationOrchestrator.isOverallTranslating;

            if (isTranslating) {
                this.appServices.translationOrchestrator.abortTranslation();
                // We'll let orchestrator drive state back, or push here.
            } else if (this._state.status === this.MODAL_STATE.PREVIEWING) {
                const isConfirmed = await this.appServices.uiManager.showConfirmDialog("You have unsaved changes in the preview. Are you sure you want to close and discard these changes?");
                if (!isConfirmed) {
                    return;
                }
            }

            if (this._state.status === this.MODAL_STATE.PREVIEWING) {
                this._cancelPreviewChanges();
            }

            try {
                this.clearContent(); // Will invoke transition to IDLE which clear settings
            } catch (e) {
                this.logger.error("State transition failed:", e);
                this._state.status = this.MODAL_STATE.IDLE;
                if (this.uiManager) {
                    this.uiManager.toggleModal(this.modalKey, false);
                }
            }

            if (this.isCustomPromptPanelVisible) this._toggleCustomPromptPanel(false);

            if (this.appServices.translationOrchestrator) {
                this.appServices.translationOrchestrator.currentAccumulatedTextForMain = "";
            }
        }

        clearContent() {
            if (!this._isRendered || !this.translationViewComponent) return;

            this._transitionTo(this.MODAL_STATE.IDLE, {
                committedText: "",
                sourceText: null,
                previewText: null,
                pendingOperationType: null,
                title: "Translation Result"
            });

            this.translationViewComponent.setText("");

            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            if (titleEl) {
                titleEl.textContent = "Translation Result";
                titleEl.dataset.originalTitle = "Translation Result";
            }
            this.translationViewComponent.setMode('editing');
            this.updateButtonStates();
        }

        _handleToggleModeChange(event) {
            if (this._state.status === this.MODAL_STATE.PREVIEWING) {
                this.logger.notify("Please save or discard your current changes before switching views.", "Notice", "warn");
                // Revert the visual state of the checkbox because the action is disallowed.
                event.target.checked = !event.target.checked;
                return;
            }
            // Determine the new mode from the input's state, which is the source of truth.
            const newMode = event.target.checked ? 'reader' : 'editing';
            this.translationViewComponent.setMode(newMode);
            if (newMode === 'reader' && this.isCustomPromptPanelVisible) {
                this._toggleCustomPromptPanel(false);
            }
            // updateButtonStates will now correctly reflect the new state without conflicts.
            this.updateButtonStates();
        }

        _handleAddHistoryClick() {
            const currentText = this.translationViewComponent.getText();
            if (!currentText || !currentText.trim()) {
                this.logger.notify("No content to save.", "Warning", "warn");
                return;
            }

            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            const currentTitle = titleEl ? (titleEl.dataset.originalTitle || titleEl.textContent || "New Chapter") : "New Chapter";

            const historyModal = this.uiManager.getComponent('HISTORY_MODAL');
            if (historyModal) {
                historyModal.showForAdding(currentText, currentTitle);
            } else {
                this.logger.notify("History feature not found.", "Error", "error");
            }
        }

        _toggleCustomPromptPanel(forceState) {
            const panelContainer = this.getEl('CUSTOM_PROMPT_PANEL_CONTAINER');
            if (!panelContainer || !this.customPromptPanelComponent) { return; }
            const shouldShow = typeof forceState === 'boolean' ? forceState : !this.isCustomPromptPanelVisible;
            if (shouldShow && this.translationViewComponent.currentMode !== 'editing') {
                this.translationViewComponent.setMode('editing');
            }
            panelContainer.style.display = shouldShow ? 'block' : 'none';
            if(shouldShow) this.customPromptPanelComponent.show();
            this.isCustomPromptPanelVisible = shouldShow;
            this.updateButtonStates();
        }

        forceReaderMode() {
            if (!this._isRendered) return;
            this._state.viewMode = 'reader';
            if (this.translationViewComponent) {
                this.translationViewComponent.setMode('reader');
            }
            const toggleModeInput = this.getEl('RESULT_MODAL_TOGGLE_MODE_BTN');
            if (toggleModeInput) {
                toggleModeInput.checked = true;
                toggleModeInput.setAttribute('aria-checked', 'true');
            }
            if (this.isCustomPromptPanelVisible) {
                this._toggleCustomPromptPanel(false);
            }
            this.updateButtonStates();
        }

         _handleActionRequiringEditMode(actionCallback) {
            if (this.translationViewComponent.currentMode !== 'editing') {
                this.translationViewComponent.setMode('editing');
                this.updateButtonStates();
            }
            actionCallback();
        }

        _stripErrorPlaceholders(text) {
            if (!text) return text;
            return text.replace(/\s*<div class="[^"]*inline-error-block">[\s\S]*?<\/div>\s*/g, '\n\n');
        }

        _executeSubTranslationTask(taskType, textSourceType, promptOrContextKey, customPromptText = null) {
            if (this.appServices.translationOrchestrator.isOverallTranslating) {
                this.logger.notify("Another task is currently running. Please wait.", "Busy", "warn");
                return;
            }
            this._handleActionRequiringEditMode(() => {
                const textForTask = textSourceType === this.configManager.CONSTANTS.TEXT_SOURCE.COMMITTED
                    ? this._stripErrorPlaceholders(this._state.committedText)  // <-- using state directly
                    : this.appServices.translationOrchestrator.lastOriginalTextForMain;

                if (!textForTask || !textForTask.trim()) {
                    if (!(taskType === this.configManager.CONSTANTS.OPERATION_TYPE.CUSTOM_PROMPT && customPromptText && customPromptText.trim())) {
                        this.logger.notify(`No ${textSourceType === this.configManager.CONSTANTS.TEXT_SOURCE.COMMITTED ? 'current' : 'original'} content available for this task.`, "Content Error", "warn");
                        return;
                    }
                }

                let contextForApi; let baseTitleForPreview;
                const contextTemplates = this.appServices.settingsService.get(this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP);
                const defaultContextTemplates = this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.CONTEXT_TEMPLATES_MAP);

                switch (taskType) {
                    case this.configManager.CONSTANTS.OPERATION_TYPE.RETRY:
                        const selectedTemplateName = this.appServices.settingsService.get(this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
                        contextForApi = contextTemplates?.[selectedTemplateName] || defaultContextTemplates[this.configManager.getDefaultSetting(this.configManager.SETTING_KEYS.SELECTED_TEMPLATE_NAME)];
                        baseTitleForPreview = "Retry";
                        break;
                    case this.configManager.CONSTANTS.OPERATION_TYPE.WORDS:
                        contextForApi = contextTemplates?.[promptOrContextKey] || defaultContextTemplates[promptOrContextKey];
                        baseTitleForPreview = "Words";
                        break;
                    case this.configManager.CONSTANTS.OPERATION_TYPE.RETRANSLATE:
                        contextForApi = contextTemplates?.[promptOrContextKey] || defaultContextTemplates[promptOrContextKey];
                        baseTitleForPreview = "Retranslate";
                        break;
                    case this.configManager.CONSTANTS.OPERATION_TYPE.CUSTOM_PROMPT:
                        contextForApi = customPromptText;
                        baseTitleForPreview = "Custom Prompt";
                        break;
                    default: this.logger.error(`Unknown subtask type: ${taskType}`); return;
                }
                if (!contextForApi) { this.logger.error(`Context/prompt not found for task '${taskType}'.`); return; }

                const procMsg = this.configManager.getConstant('PROCESSING_MESSAGE_IDENTIFIER');
                this._transitionTo(this.MODAL_STATE.PREVIEWING, {
                    pendingOperationType: taskType,
                    previewText: procMsg
                });
                // Ensure initial rendering displays loading indicator
                this.translationViewComponent.setText(procMsg);
                this.updateButtonStates();

                this.appServices.translationOrchestrator._startSubTranslationProcess(
                    textForTask || "",
                    `${taskType}_preview`,
                    contextForApi,
                    (textPart, isFinalChunkOfStream, isOverallFinal) => this.showPreviewUpdate(textPart, isFinalChunkOfStream, isOverallFinal, baseTitleForPreview),
                    (finalText) => this.finalizePreview(finalText, baseTitleForPreview, taskType),
                    (error) => this.handlePreviewError(error, baseTitleForPreview, taskType)
                );
            });
        }
        _handleRetryClick() { this._executeSubTranslationTask(this.configManager.CONSTANTS.OPERATION_TYPE.RETRY, this.configManager.CONSTANTS.TEXT_SOURCE.ORIGINAL, null); }
        _handleWordsClick() { this._executeSubTranslationTask(this.configManager.CONSTANTS.OPERATION_TYPE.WORDS, this.configManager.CONSTANTS.TEXT_SOURCE.COMMITTED, "Words"); }
        _handleRetranslateClick() { this._executeSubTranslationTask(this.configManager.CONSTANTS.OPERATION_TYPE.RETRANSLATE, this.configManager.CONSTANTS.TEXT_SOURCE.COMMITTED, "Retranslate"); }

        showPreviewUpdate(textPart, isFinalChunkOfStream, isOverallFinal, tempTitlePrefix = "Processing Preview") {
            if (textPart === null || typeof textPart === 'undefined') return;
            const procMsg = this.configManager.getConstant('PROCESSING_MESSAGE_IDENTIFIER');
            if (this._state.previewText === procMsg) {
                this._state.previewText = "";
            }
            this._state.previewText = (this._state.previewText || "") + textPart;
            this.translationViewComponent.setText(this._state.previewText);

            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            const originalTitle = titleEl?.dataset.originalTitle || this._state.title || "Translation Result";
            if (titleEl) titleEl.textContent = `${originalTitle} - ${tempTitlePrefix}... (Preview)`;
        }

        finalizePreview(finalText, baseTitle, operationType) {
            this._state.previewText = finalText;
            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            const originalTitle = titleEl?.dataset.originalTitle || this._state.title || "Translation Result";
            if (titleEl) titleEl.textContent = `${originalTitle} - Preview: ${baseTitle}`;
            this.updateButtonStates();
            this.logger.info(`Preview for '${operationType}' completed.`);
            this.logger.notify(`Preview for "${baseTitle}" is ready.`, "Preview Complete");
        }

        handlePreviewError(error, errorTitlePrefix, operationType) {
            this.logger.error(`Error creating preview for '${operationType}':`, error);
            const errorMessage = `--- ERROR CREATING PREVIEW FOR "${errorTitlePrefix.toUpperCase()}" ---\n${error.message}`;
            this.translationViewComponent.setText(this._state.committedText + `\n\n${errorMessage}`);

            this._transitionTo(this.MODAL_STATE.SHOWING_RESULT, {
                previewText: null,
                pendingOperationType: null
            });
            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            const originalTitle = titleEl?.dataset.originalTitle || this._state.title || "Translation Result";
            if (titleEl) titleEl.textContent = `${originalTitle} - Preview Error: ${errorTitlePrefix}`;
            this.updateButtonStates();
            this.logger.notify(`Error creating preview for "${errorTitlePrefix}": ${error.message.substring(0,50)}`, "Preview Error", "error");
        }

        updateTitle(newTitle) {
            const titleEl = this.getEl('RESULT_MODAL_TITLE');
            if (titleEl) {
                titleEl.textContent = newTitle;
                if(this._state.pendingOperationType === null) {
                    titleEl.dataset.originalTitle = newTitle;
                    this._state.title = newTitle;
                }
            }
        }

        applyDisplaySettings() {
            if (!this._isRendered || !this.translationViewComponent) return;
            this.translationViewComponent.applyDisplaySettings();
        }

        updateButtonStates() {
            if (!this._isRendered || !this.resultActionBarComponent || !this.translationViewComponent) return;
            const orchestrator = this.appServices.translationOrchestrator;
            const prefix = this.configManager.getScriptPrefix();
            const isOverallTranslating = orchestrator.isOverallTranslating;
            const hasPreviewInProgress = this._state.status === this.MODAL_STATE.PREVIEWING;
            const currentMode = this.translationViewComponent.currentMode;

            this.resultActionBarComponent.updateButtonStates(
                isOverallTranslating,
                this.translationViewComponent.getText(),
                this._state.committedText,
                this._state.sourceText || orchestrator.lastOriginalTextForMain,
                currentMode,
                this.isCustomPromptPanelVisible,
                hasPreviewInProgress,
                this._state.pendingOperationType
            );

            const toggleModeInput = this.getEl('RESULT_MODAL_TOGGLE_MODE_BTN');
            if (toggleModeInput) {
                toggleModeInput.disabled = isOverallTranslating || hasPreviewInProgress;
                const isReaderMode = currentMode === 'reader';
                toggleModeInput.checked = isReaderMode;
                toggleModeInput.setAttribute('aria-checked', isReaderMode.toString());
            }

            const addHistoryBtn = this.getEl('RESULT_MODAL_ADD_HISTORY_BTN');
            if (addHistoryBtn) {
                addHistoryBtn.style.display = currentMode === 'editing' ? 'inline-flex' : 'none';
                addHistoryBtn.disabled = isOverallTranslating || hasPreviewInProgress;
            }

            const openHistoryBtn = this.getEl('RESULT_MODAL_OPEN_HISTORY_BTN');
            if (openHistoryBtn) {
                openHistoryBtn.style.display = currentMode === 'reader' ? 'inline-flex' : 'none';
            }

            if (this.isCustomPromptPanelVisible && this.customPromptPanelComponent) {
                this.customPromptPanelComponent.updateUpdateButtonState();
                 const executeBtn = this.customPromptPanelComponent.getEl('CUSTOM_PROMPT_EXECUTE_BTN');
                 if (executeBtn) {
                     executeBtn.disabled = isOverallTranslating || hasPreviewInProgress;
                     executeBtn.innerHTML = (orchestrator.isOverallTranslating && this._state.pendingOperationType === this.configManager.CONSTANTS.OPERATION_TYPE.CUSTOM_PROMPT)
                                            ? '⏳ Executing...' : 'Execute Prompt';
                 }
            }
        }
    }