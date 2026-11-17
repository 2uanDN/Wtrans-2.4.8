class CustomPromptPanelComponent extends BaseUIComponent {
        constructor(uiManager, configManager, resultModalInstance) {
            super(uiManager, configManager, "CUSTOM_PROMPT_PANEL_CONTAINER");
            this.resultModalInstance = resultModalInstance;
            this._isRendered = false;
        }

        render() {
            if (this._isRendered) return this.element;
            const cfg = this.configManager;
            const prefix = cfg.getScriptPrefix();
            const panelTitle = this.domBuilder.createEl('h4', {
                id: cfg.getUiId('CUSTOM_PROMPT_PANEL_TITLE'),
                textContent: 'Custom Prompt',
                style: {
                    textAlign: 'center',
                    margin: '0',
                    width: '100%'
                }
            });
            const panelHeader = this.domBuilder.createEl('div', {
                id: cfg.getUiId('CUSTOM_PROMPT_PANEL_HEADER'),
                className: `${prefix}panel-header`,
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingBottom: '6px',
                    marginBottom: '6px'
                }
            }, [panelTitle]);

            const selectLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('CUSTOM_PROMPT_SELECT'), textContent: 'Select a saved prompt:' });
            const promptSelect = this.domBuilder.createEl('select', { id: cfg.getUiId('CUSTOM_PROMPT_SELECT'), className: `${prefix}select`, onChange: (e) => this._handlePromptSelectChange(e) });
            const textareaLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('CUSTOM_PROMPT_TEXTAREA'), textContent: 'Prompt content (applied to the current finalized content in the result):' });
            const promptTextarea = this.domBuilder.createEl('textarea', { id: cfg.getUiId('CUSTOM_PROMPT_TEXTAREA'), rows: 4, className: `${prefix}textarea`, placeholder: 'Enter a custom prompt here, or select a saved one. This prompt will be applied to the current content in the result panel to generate a preview.' });
            const updateSavedBtn = this.domBuilder.createButton({
                id: cfg.getUiId('CUSTOM_PROMPT_UPDATE_SAVED_BTN'),
                text: 'Update Selected Prompt',
                className: `${prefix}button ${prefix}button-small`,
                style: { marginRight: 'auto' },
                onClick: () => this._handleUpdateSavedPromptClick()
            });
            const cancelBtn = this.domBuilder.createButton({
                id: cfg.getUiId('CUSTOM_PROMPT_CANCEL_BTN'),
                text: 'Cancel',
                className: `${prefix}button`,
                onClick: () => this.resultModalInstance._toggleCustomPromptPanel(false)
            });
            const executeBtn = this.domBuilder.createButton({
                id: cfg.getUiId('CUSTOM_PROMPT_EXECUTE_BTN'),
                text: 'Execute Prompt',
                className: `${prefix}button ${prefix}button-primary`,
                onClick: () => this._handleExecutePromptClick()
            });
            const buttonGroup = this.domBuilder.createEl('div', {
                className: `${prefix}button-group-inline`,
                style: {
                    marginTop: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap'
                }
            }, [updateSavedBtn, cancelBtn, executeBtn]);
            const panelBody = this.domBuilder.createEl('div', { className: `${prefix}panel-body` }, [ selectLabel, promptSelect, textareaLabel, promptTextarea, buttonGroup ]);
            this.element = this.domBuilder.createEl('div', { className: `${prefix}custom-prompt-panel-content` }, [panelHeader, panelBody]);
            this._isRendered = true;
            return this.element;
        }
        show() {
            if (!this._isRendered) { this.logger.error("CustomPromptPanel.show() called before render."); return; }
            this._populatePromptSelect();
            const textarea = this.getEl('CUSTOM_PROMPT_TEXTAREA');
            if (textarea) requestAnimationFrame(() => textarea.focus());
            this.updateUpdateButtonState();
        }
        _populatePromptSelect() {
            const promptSelect = this.getEl('CUSTOM_PROMPT_SELECT');
            if (!promptSelect) { this.logger.warn("CustomPromptPanel: Select element not found."); return; }
            const currentSelectedValue = promptSelect.value;
            promptSelect.innerHTML = '';
            promptSelect.appendChild(this.domBuilder.createEl('option', { textContent: "-- Select or Type Below --", value: "" }));
            const savedPrompts = this.appServices.settingsService.getSavedCustomPrompts();
            savedPrompts.forEach(prompt => {
                promptSelect.appendChild(this.domBuilder.createEl('option', { textContent: prompt.name, value: prompt.id }));
            });
            if (savedPrompts.find(p => p.id === currentSelectedValue)) {
                promptSelect.value = currentSelectedValue;
            } else { this._handlePromptSelectChange({ target: promptSelect }); }
        }
        _handlePromptSelectChange(event) {
            const promptTextarea = this.getEl('CUSTOM_PROMPT_TEXTAREA');
            const selectedId = event.target.value;
            if (promptTextarea) {
                if (selectedId) {
                    const savedPrompts = this.appServices.settingsService.getSavedCustomPrompts();
                    const selectedPrompt = savedPrompts.find(p => p.id === selectedId);
                    promptTextarea.value = selectedPrompt ? selectedPrompt.content : "";
                } else {
                    promptTextarea.value = "";
                }
            }
            this.updateUpdateButtonState();
        }
        updateUpdateButtonState() {
            const updateBtn = this.getEl('CUSTOM_PROMPT_UPDATE_SAVED_BTN');
            const promptSelect = this.getEl('CUSTOM_PROMPT_SELECT');
            if (updateBtn && promptSelect) {
                updateBtn.disabled = !promptSelect.value ||
                                   this.appServices.translationOrchestrator.isOverallTranslating ||
                                   (this.resultModalInstance && this.resultModalInstance._state && this.resultModalInstance._state.previewText !== null);
            }
        }

        _handleExecutePromptClick() {
            const promptTextarea = this.getEl('CUSTOM_PROMPT_TEXTAREA');
            const customPromptText = promptTextarea ? promptTextarea.value : "";
            if (!customPromptText.trim()) {
                this.logger.notify("Custom prompt content cannot be empty.", "Prompt Error", "warn");
                promptTextarea?.focus();
                return;
            }
            this.resultModalInstance._executeSubTranslationTask(this.configManager.CONSTANTS.OPERATION_TYPE.CUSTOM_PROMPT, this.configManager.CONSTANTS.TEXT_SOURCE.COMMITTED, null, customPromptText);
        }
        async _handleUpdateSavedPromptClick() {
            const promptSelect = this.getEl('CUSTOM_PROMPT_SELECT');
            const promptTextarea = this.getEl('CUSTOM_PROMPT_TEXTAREA');
            const selectedPromptId = promptSelect ? promptSelect.value : null;

            if (!selectedPromptId) { this.logger.notify("Please select a saved prompt from the list to update.", "Update Error", "warn"); promptSelect?.focus(); return; }

            const currentPrompts = this.appServices.settingsService.getSavedCustomPrompts();
            const currentPromptObject = currentPrompts.find(p => p.id === selectedPromptId);
            if (!currentPromptObject) { this.logger.error(`Prompt with ID ${selectedPromptId} not found for update.`); return; }

            const newName = await this.appServices.uiManager.showPromptDialog("Enter a new name for this saved prompt (or leave blank to keep the current name):", currentPromptObject.name);
            if (newName === null) return;

            const newContent = promptTextarea ? promptTextarea.value : "";
            if (!newContent.trim()) {
                 const isConfirmed = await this.appServices.uiManager.showConfirmDialog("Prompt content is empty. Do you want to save the empty prompt content for '" + (newName.trim() || currentPromptObject.name) + "'?");
                 if(!isConfirmed) { return; }
            }
            const finalName = newName.trim() || currentPromptObject.name;

            try {
                await this.appServices.settingsService.updateSavedCustomPrompt(selectedPromptId, finalName, newContent);
                this.logger.notify(`Saved prompt "${finalName}" has been updated.`, "Success");
                const currentSelectVal = promptSelect.value;
                this._populatePromptSelect();
                if(promptSelect.querySelector(`option[value="${currentSelectVal}"]`)) {
                    promptSelect.value = currentSelectVal;
                } else {
                    promptSelect.value = "";
                    if (promptTextarea) promptTextarea.value = "";
                }
                this.updateUpdateButtonState();
            } catch (err) {
                this.logger.error("Unable to update the saved prompt:", err);
                this.logger.notify("Error updating the saved prompt. Check the console.", "Error", "error");
            }
        }
    }
class ResultActionBarComponent extends BaseUIComponent {
    constructor(uiManager, configManager, callbacks = {}) {
        super(uiManager, configManager, 'RESULT_ACTION_BAR');
        this.callbacks = callbacks;
        this._retryBtnOriginalText = 'Retry';
        this._WordsBtnOriginalText = 'Words';
        this._retranslateBtnOriginalText = 'Retranslate';
        this.buttons = {};

        this.isDropdownOpen = false;
        this.dropdownContainer = null;
        this.dropdownMenu = null;
        this._handleOutsideClick = this._handleOutsideClick.bind(this);
    }

    _handleCopyClick() {
        const resultModal = this.uiManager.getComponent('RESULT_MODAL');
        const textToCopy = resultModal?.translationViewComponent?.getText();
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                this.logger.notify("Content copied to clipboard.", "Copied", "success");
            }).catch(err => {
                this.logger.error("Unable to copy text: ", err);
                this.logger.notify("Copy failed. Please try again or copy it manually.", "Copy Error", "error");
            });
        }
    }

    _toggleDropdown(forceState) {
        if (!this.dropdownMenu) return;
        const shouldShow = typeof forceState === 'boolean' ? forceState : !this.isDropdownOpen;

        if (shouldShow) {
            this.dropdownMenu.classList.add('show');
            this.isDropdownOpen = true;
            if (this.buttons.advanced) this.buttons.advanced.setAttribute('aria-expanded', 'true');
            // Thêm listener với setTimeout để tránh nhận ngay sự kiện click hiện tại
            setTimeout(() => {
                this.uiManager.shadowRoot.addEventListener('click', this._handleOutsideClick);
            }, 0);
        } else {
            this.dropdownMenu.classList.remove('show');
            this.isDropdownOpen = false;
            if (this.buttons.advanced) this.buttons.advanced.setAttribute('aria-expanded', 'false');
            // Dọn dẹp listener ngay lập tức
            this.uiManager.shadowRoot.removeEventListener('click', this._handleOutsideClick);
        }
    }

    _handleOutsideClick(event) {
        // Nếu không có container hoặc menu chưa mở, không làm gì cả
        if (!this.dropdownContainer || !this.isDropdownOpen) return;

        // LOGIC QUAN TRỌNG:
        // Nếu click xảy ra BÊN TRONG container (bao gồm cả nút Advanced và menu con),
        // ta KHÔNG làm gì cả tại đây. Hãy để sự kiện onClick của chính nút Advanced
        // hoặc các nút con tự xử lý logic của chúng.
        if (this.dropdownContainer.contains(event.composedPath()[0])) {
            return;
        }

        // Chỉ khi click RA NGOÀI container thì mới đóng menu
        this._toggleDropdown(false);
    }

// -------------------------------------------------------------

    render() {
        const prefix = this.configManager.getScriptPrefix();
        const cfg = this.configManager;

        // Preview Actions
        this.buttons.applyChanges = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_APPLY_CHANGES_BTN'), text: 'Save Changes',
            title: 'Apply preview changes to the main result',
            onClick: () => this.callbacks.onApplyChanges && this.callbacks.onApplyChanges(),
            className: `${prefix}button ${prefix}button-primary`,
            style: { display: 'none' }
        });
        this.buttons.cancelChanges = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_CANCEL_CHANGES_BTN'), text: 'Discard Changes',
            title: 'Discard preview changes and revert to the previous result',
            onClick: () => this.callbacks.onCancelChanges && this.callbacks.onCancelChanges(),
            className: `${prefix}button ${prefix}button-danger-outline`,
            style: { display: 'none' }
        });

        // Visible Main Actions
        this.buttons.retry = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_RETRY_BTN'), text: this._retryBtnOriginalText,
            title: 'Retry the original translation with the default prompt (will generate a preview)',
            onClick: () => this.callbacks.onRetry && this.callbacks.onRetry(), className: `${prefix}button`
        });
        this.buttons.copy = this.domBuilder.createButton({
            id: prefix + 'result_modal_copy_btn',
            innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('copy', { width: 16, height: 16 }),
            title: 'Copy translated content',
            onClick: () => this._handleCopyClick(),
            className: `${prefix}button ${prefix}icon-button`
        });

        // Dropdown Setup
        this.buttons.advanced = this.domBuilder.createButton({
            id: prefix + 'result_modal_advanced_btn', text: 'Advanced',
            title: 'Advanced Actions',
            onClick: () => this._toggleDropdown(), className: `${prefix}button`
        });
        this.buttons.advanced.setAttribute('aria-haspopup', 'menu');
        this.buttons.advanced.setAttribute('aria-expanded', 'false');

        this.dropdownMenu = this.domBuilder.createEl('div', { className: `${prefix}dropdown-menu` });
        this.dropdownMenu.setAttribute('role', 'menu');

        this.dropdownContainer = this.domBuilder.createEl('div', { className: `${prefix}dropdown-container` },
            [this.buttons.advanced, this.dropdownMenu]
        );

        // Dropdown Items
        this.buttons.Words = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_WORDS_BTN'), text: this._WordsBtnOriginalText,
            title: 'Remove any fluff and advertising-style wording from the existing translation (will generate a preview)', className: `${prefix}button`,
            onClick: () => { this.callbacks.onWords && this.callbacks.onWords(); this._toggleDropdown(false); }
        });
        this.buttons.Words.setAttribute('role', 'menuitem');

        this.buttons.retranslate = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_RETRANSLATE_BTN'), text: this._retranslateBtnOriginalText,
            title: 'Send the current translation to AI for quality improvement (will generate a preview)', className: `${prefix}button`,
            onClick: () => { this.callbacks.onRetranslate && this.callbacks.onRetranslate(); this._toggleDropdown(false); }
        });
        this.buttons.retranslate.setAttribute('role', 'menuitem');

        this.buttons.toggleCustomPrompt = this.domBuilder.createButton({
            id: cfg.getUiId('RESULT_MODAL_TOGGLE_CUSTOM_PROMPT_BTN'), text: 'Custom Prompt',
            title: 'Show/Hide Custom Prompt Panel', className: `${prefix}button`,
            onClick: () => { this.callbacks.onToggleCustomPrompt && this.callbacks.onToggleCustomPrompt(); this._toggleDropdown(false); }
        });
        this.buttons.toggleCustomPrompt.setAttribute('role', 'menuitem');

        this.dropdownMenu.append(this.buttons.Words, this.buttons.retranslate, this.buttons.toggleCustomPrompt);

        // Floating Message Setup
        const floatingMessage = this.domBuilder.createEl('span', {
            textContent: 'You have unsaved changes',
            className: `${prefix}floating-message`
        });

        // Assembly
        this.previewActionsGroup = this.domBuilder.createEl('div',
            {
                className: `${prefix}floating-action-bar`,
                style: { display: 'none' }
            },
            [floatingMessage, this.buttons.applyChanges, this.buttons.cancelChanges]
        );
        const advancedActionsGroup = this.domBuilder.createEl('div',
            { className: `${prefix}button-group-row ${prefix}advanced-actions` },
            [this.buttons.retry, this.buttons.copy, this.dropdownContainer]
        );
        this.element = this.domBuilder.createEl('div', {
            id: this.id, className: `${prefix}modal-footer-actions-wrapper`
        }, [advancedActionsGroup]);

        return this.element;
    }

    updateButtonStates(isOverallTranslating, currentViewText, stableTextForComparison, lastOriginalTextForRetry, currentResultMode, isCustomPromptPanelVisible, hasPreviewInProgress, currentPendingOperationType) {
        const prefix = this.configManager.getScriptPrefix();
        const isReaderMode = currentResultMode === 'reader';

        const showPreviewButtons = hasPreviewInProgress && !isOverallTranslating;
        if (this.previewActionsGroup) {
            this.previewActionsGroup.style.display = showPreviewButtons ? 'flex' : 'none';
        }
        if (this.buttons.applyChanges) this.buttons.applyChanges.style.display = showPreviewButtons ? 'inline-flex' : 'none';
        if (this.buttons.cancelChanges) this.buttons.cancelChanges.style.display = showPreviewButtons ? 'inline-flex' : 'none';

        const disableOtherActions = isOverallTranslating || hasPreviewInProgress;

        const advancedActionsGroup = this.element.querySelector(`.${prefix}advanced-actions`);
        if (advancedActionsGroup) {
            advancedActionsGroup.style.display = isReaderMode ? 'none' : 'flex';
        }

        if (!isReaderMode) {
            if (this.buttons.retry) {
                this.buttons.retry.disabled = disableOtherActions || !(lastOriginalTextForRetry && lastOriginalTextForRetry.trim());
                this.buttons.retry.innerHTML = (isOverallTranslating && currentPendingOperationType === 'retry') ? `⏳ ${this._retryBtnOriginalText}...` : this._retryBtnOriginalText;
            }
            if (this.buttons.copy) {
                this.buttons.copy.disabled = isOverallTranslating || !(currentViewText && currentViewText.trim());
            }
            if (this.buttons.advanced) {
                this.buttons.advanced.disabled = disableOtherActions;
            }

            // Update dropdown items
            if (this.buttons.Words) {
                this.buttons.Words.disabled = disableOtherActions || !(stableTextForComparison && stableTextForComparison.trim());
                this.buttons.Words.innerHTML = (isOverallTranslating && currentPendingOperationType === 'words') ? `⏳ ${this._WordsBtnOriginalText}...` : this._WordsBtnOriginalText;
            }
            if (this.buttons.retranslate) {
                this.buttons.retranslate.disabled = disableOtherActions || !(stableTextForComparison && stableTextForComparison.trim());
                this.buttons.retranslate.innerHTML = (isOverallTranslating && currentPendingOperationType === 'retranslate') ? `⏳ ${this._retranslateBtnOriginalText}...` : this._retranslateBtnOriginalText;
            }
            if (this.buttons.toggleCustomPrompt) {
                this.buttons.toggleCustomPrompt.disabled = disableOtherActions;
                 if (!disableOtherActions && isCustomPromptPanelVisible) {
                    this.buttons.toggleCustomPrompt.classList.add(`${prefix}button-active`);
                } else {
                    this.buttons.toggleCustomPrompt.classList.remove(`${prefix}button-active`);
                }
            }
        }
    }
}