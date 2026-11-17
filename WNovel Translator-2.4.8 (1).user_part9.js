class SettingsModalComponent extends BaseUIComponent {
        constructor(uiManager, configManager) {
            super(uiManager, configManager, "SETTINGS_MODAL");
            this.modalKey = "SETTINGS_MODAL";
            this._isRendered = false;
        }
        render() {
            if (this._isRendered) return this.element;
            const prefix = this.configManager.getScriptPrefix();
            const cfg = this.configManager;

            // 1. Tab definitions
            const tabs = [
                { id: 'api', title: 'API & Models', content: [this._renderApiAndModelSection(prefix, cfg)] },
                { id: 'prompt', title: 'Prompt', content: [this._renderTemplateSection(prefix, cfg)] },
                { id: 'spec', title: 'Specification', content: [this._renderAIModelConfigSection(prefix, cfg), this._renderChunkingConfigSection(prefix, cfg), this._renderSafetySection(prefix, cfg)] },
                { id: 'display', title: 'Display', content: [this._renderDisplaySection(prefix, cfg)] },
                { id: 'data', title: 'Data', content: [this._renderDataManagementSection(prefix, cfg)] }
            ];

            // 2. Create tab buttons
            const tabButtons = tabs.map((tab, index) =>
                this.domBuilder.createEl('button', {
                    className: `${prefix}settings-tab-btn` + (index === 0 ? ' active' : ''),
                    textContent: tab.title,
                    role: 'tab',
                    'aria-selected': index === 0 ? 'true' : 'false',
                    dataset: { tabId: tab.id },
                    onClick: (e) => this._handleTabClick(e)
                })
            );
            const tabsContainer = this.domBuilder.createEl('div', { className: `${prefix}settings-tabs-container`, role: 'tablist' }, tabButtons);

            // 3. Create tab panels
            const tabPanels = tabs.map((tab, index) =>
                this.domBuilder.createEl('div', {
                    className: `${prefix}settings-tab-panel` + (index === 0 ? ' active' : ''),
                    role: 'tabpanel',
                    dataset: { tabId: tab.id }
                }, tab.content)
            );
            const panelsContainer = this.domBuilder.createEl('div', { className: `${prefix}settings-tab-panels-container` }, tabPanels);

            // 4. Assemble the body with tabs
            const body = this.domBuilder.createEl('div', { className: `${prefix}modal-body ${prefix}modal-body--with-tabs` }, [
                tabsContainer,
                panelsContainer
            ]);


            // 5. Create Header and Footer (same as before)
            const titleEl = this.domBuilder.createEl('h2', { textContent: 'WNovel Translator Settings' });
            const closeBtn = this.domBuilder.createButton({
                id: cfg.getUiId('SETTINGS_MODAL_CLOSE_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('x'),
                title: 'Close Settings (Esc)',
                className: `${prefix}modal-close-btn`,
                onClick: () => this.uiManager.toggleModal(this.modalKey, false)
            });
            const header = this.domBuilder.createEl('div', { className: `${prefix}modal-header` }, [titleEl, closeBtn]);

            const saveBtn = this.domBuilder.createButton({
                id: cfg.getUiId('SETTINGS_SAVE_BTN'),
                text: 'Save All Settings',
                className: `${prefix}button ${prefix}button-primary`,
                onClick: () => this._handleSaveSettings()
            });
            const footer = this.domBuilder.createEl('div', { className: `${prefix}modal-footer` }, [saveBtn]);

            // 6. Assemble the final modal
            // --- FIX MOBILE UX: CLICK OUTSIDE TO CLOSE TOOLTIP ---
// Gán sự kiện click cho toàn bộ modal content để bắt sự kiện click ra ngoài tooltip
const modalContentDiv = this.domBuilder.createEl('div', { className: `${prefix}modal-content`, tabindex: "-1" }, [header, body, footer]);

modalContentDiv.addEventListener('click', (e) => {
    // Nếu click không trúng vào trigger tooltip nào
    if (!e.target.closest(`.${prefix}tooltip-trigger`)) {
        // Tìm và đóng tất cả các tooltip đang active
        const activeTooltips = modalContentDiv.querySelectorAll(`.${prefix}tooltip-trigger.tooltip-active`);
        if (activeTooltips.length > 0) {
            activeTooltips.forEach(el => el.classList.remove('tooltip-active'));
        }
    }
});
// ---------------------------------------------------

// [NEW] Code mới: Thêm sự kiện click cho overlay
this.element = this.domBuilder.createEl('div', { id: this.id, className: `${prefix}modal-overlay` }, [modalContentDiv]);

// Lắng nghe sự kiện click trên lớp phủ (overlay)
this.element.addEventListener('click', (e) => {
    // Chỉ đóng nếu người dùng click trực tiếp vào overlay (vùng tối)
    // chứ không phải click vào nội dung bên trong (modalContentDiv)
    if (e.target === this.element) {
        this.uiManager.toggleModal(this.modalKey, false);
    }
});

this._isRendered = true;
return this.element;
}

        _handleTabClick(event) {
            const clickedButton = event.currentTarget;
            const tabId = clickedButton.dataset.tabId;
            if (!tabId) return;

            const prefix = this.configManager.getScriptPrefix();
            const modalContent = clickedButton.closest(`.${prefix}modal-content`);
            if (!modalContent) return;

            // Update buttons
            modalContent.querySelectorAll(`.${prefix}settings-tab-btn`).forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            clickedButton.classList.add('active');
            clickedButton.setAttribute('aria-selected', 'true');

            // Scroll tab button smoothly into view inside tab bar without shifting the modal
            if (typeof clickedButton.scrollIntoView === 'function') {
                clickedButton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            }

            // Update panels
            modalContent.querySelectorAll(`.${prefix}settings-tab-panel`).forEach(panel => {
                panel.classList.remove('active');
            });
            const activePanel = modalContent.querySelector(`.${prefix}settings-tab-panel[data-tab-id="${tabId}"]`);
            if (activePanel) {
                activePanel.classList.add('active');
            }

            // Lock horizontal scroll and reset scroll positions to completely eliminate layout shifts
            const panelsContainer = modalContent.querySelector(`.${prefix}settings-tab-panels-container`);
            if (panelsContainer) {
                panelsContainer.scrollLeft = 0;
                panelsContainer.scrollTop = 0;
            }
        }


    // --- START OF NEW HELPER METHODS ---

     _createLabelWithTooltip(prefix, forId, labelText, tooltipText) {
        // Renamed internally but keeping method signature to avoid breaking existing calls
        const label = this.domBuilder.createEl('label', { htmlFor: forId, textContent: labelText, style: { fontWeight: '600' } });
        const helperText = this.domBuilder.createEl('div', {
            className: `${prefix}setting-desc`,
            textContent: tooltipText
        });

        return this.domBuilder.createEl('div', {
            className: `${prefix}label-with-desc`
        }, [label, helperText]);
    }

    _renderApiAndModelSection(prefix, cfg) {
        const apiKeySectionTitle = this.domBuilder.createEl('h3', { textContent: 'API & Model Configuration' });

        // Provider Selection
        const providerSelectLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('PROVIDER_SELECT'), textContent: 'Provider:' });
        const providerSelect = this.domBuilder.createEl('select', { id: cfg.getUiId('PROVIDER_SELECT'), className: `${prefix}select`, onChange: (e) => this._handleProviderSelectChange(e) });
        const providerManageBtn = this.domBuilder.createButton({ id: cfg.getUiId('PROVIDER_MANAGE_BTN'), text: 'Manage Custom Providers', className: `${prefix}button ${prefix}button-small`, onClick: () => this._handleManageProvidersClick() });
        const providerRow = this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [
            providerSelectLabel,
            this.domBuilder.createEl('div', { className: `${prefix}button-group-inline`, style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } }, [providerSelect, providerManageBtn])
        ]);

        // API Key Section (For both Gemini and Custom)
        const apiKeySelectLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('API_KEY_SELECT'), textContent: 'API Key (Gemini):', id: `${prefix}api_key_select_label` });
        const apiKeySelect = this.domBuilder.createEl('select', { id: cfg.getUiId('API_KEY_SELECT'), className: `${prefix}select`, onChange: (e) => this._handleApiKeySelectChange(e) });
        const apiKeyAddBtn = this.domBuilder.createButton({
            id: cfg.getUiId('API_KEY_ADD_BTN'),
            innerHTML: /* trusted-static: no user input */ `${this.uiManager.iconManager.getIcon('plus', { width: 13, height: 13 })}<span>Add New Key</span>`,
            className: `${prefix}button ${prefix}button-small`,
            onClick: () => this._handleAddApiKeyClick()
        });
        const apiKeyRemoveBtn = this.domBuilder.createButton({
            id: cfg.getUiId('API_KEY_REMOVE_BTN'),
            innerHTML: /* trusted-static: no user input */ `${this.uiManager.iconManager.getIcon('trash', { width: 13, height: 13 })}<span>Delete Selected Key</span>`,
            className: `${prefix}button ${prefix}button-small ${prefix}button-danger`,
            onClick: () => this._handleRemoveApiKeyClick()
        });
        const apiKeyButtonsRow = this.domBuilder.createEl('div', { className: `${prefix}button-group-inline`}, [apiKeyAddBtn, apiKeyRemoveBtn]);
        const apiKeySectionContent = this.domBuilder.createEl('div', { id: `${prefix}api_key_section` }, [apiKeySelectLabel, apiKeySelect, apiKeyButtonsRow]);

        // Model Selection
        const modelLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('MODEL_SELECT'), textContent: 'Current Model:'});
        const modelSelect = this.domBuilder.createEl('select', { id: cfg.getUiId('MODEL_SELECT'), className: `${prefix}select`, onChange: (e) => this._handleModelSelectChange(e) });
        const testConnectionBtn = this.domBuilder.createButton({ id: cfg.getUiId('TEST_CONNECTION_BTN'), text: 'Test Connection', className: `${prefix}button ${prefix}button-small`, onClick: () => this._handleTestConnectionClick() });
        const modelRow = this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [
            modelLabel,
            this.domBuilder.createEl('div', { className: `${prefix}button-group-inline`, style: { display: 'flex', flexWrap: 'wrap', gap: '10px' } }, [modelSelect, testConnectionBtn])
        ]);

        // Fetch Models Section
        const fetchModelsBtn = this.domBuilder.createButton({ id: cfg.getUiId('FETCH_MODELS_BTN'), text: 'Fetch Models', className: `${prefix}button ${prefix}button-small`, onClick: () => this._handleFetchModelsClick() });
        const fetchModelsSearch = this.domBuilder.createEl('input', { id: cfg.getUiId('FETCH_MODELS_SEARCH'), type: 'text', placeholder: 'Search models...', className: `${prefix}input`, style: { display: 'none', marginTop: '10px' }, onInput: (e) => this._handleFetchModelsSearch(e) });
        const fetchModelsList = this.domBuilder.createEl('div', { id: cfg.getUiId('FETCH_MODELS_LIST'), className: `${prefix}models-list`, style: { display: 'none', maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', marginTop: '5px', padding: '5px' } });
        const fetchModelsSection = this.domBuilder.createEl('div', { className: `${prefix}settings-row`, style: { flexDirection: 'column', alignItems: 'stretch' } }, [
            this.domBuilder.createEl('div', { style: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } }, [
                this.domBuilder.createEl('label', { textContent: 'Model List (From Provider):' }),
                fetchModelsBtn
            ]),
            fetchModelsSearch,
            fetchModelsList
        ]);

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [apiKeySectionTitle, providerRow, apiKeySectionContent, modelRow, fetchModelsSection]);
    }

    _renderTemplateSection(prefix, cfg) {
        const templateSectionTitle = this.domBuilder.createEl('h3', { textContent: 'Prompt Templates' });
        const templateSelectLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('CONTEXT_TEMPLATE_SELECT'), textContent: 'Selected Prompt Template:' });
        const templateSelect = this.domBuilder.createEl('select', { id: cfg.getUiId('CONTEXT_TEMPLATE_SELECT'), className: `${prefix}select`, onChange: (e) => this._handleTemplateSelectChange(e) });
        const templateTextareaLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('CONTEXT_TEMPLATE_TEXTAREA'), textContent: 'Prompt Template Content:' });
        const templateTextarea = this.domBuilder.createEl('textarea', { id: cfg.getUiId('CONTEXT_TEMPLATE_TEXTAREA'), rows: 6, className: `${prefix}textarea`, placeholder: "Enter prompt context..." });
        const templateSaveNewBtn = this.domBuilder.createButton({ id: cfg.getUiId('CONTEXT_TEMPLATE_SAVE_NEW_BTN'), text: 'Save New', className: `${prefix}button ${prefix}button-small`, onClick: () => this._handleSaveNewTemplateClick() });
        const templateUpdateBtn = this.domBuilder.createButton({ id: cfg.getUiId('CONTEXT_TEMPLATE_UPDATE_BTN'), text: 'Update Selected', className: `${prefix}button ${prefix}button-small`, onClick: () => this._handleUpdateTemplateClick() });
        const templateDeleteBtn = this.domBuilder.createButton({
            id: cfg.getUiId('CONTEXT_TEMPLATE_DELETE_BTN'),
            innerHTML: /* trusted-static: no user input */ `${this.uiManager.iconManager.getIcon('trash', { width: 13, height: 13 })}<span>Delete Selected</span>`,
            className: `${prefix}button ${prefix}button-small ${prefix}button-danger`,
            onClick: () => this._handleDeleteTemplateClick()
        });
        const templateApplyBtn = this.domBuilder.createButton({ id: cfg.getUiId('CONTEXT_TEMPLATE_APPLY_BTN'), text: 'Apply & Set as Default', className: `${prefix}button ${prefix}button-small ${prefix}button-primary`, onClick: () => this._handleApplyContextClick() });
        const templateButtonsRow = this.domBuilder.createEl('div', {className: `${prefix}button-group-inline ${prefix}button-group-space-between`}, [templateSaveNewBtn, templateUpdateBtn, templateDeleteBtn, templateApplyBtn]);

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [templateSectionTitle, templateSelectLabel, templateSelect, templateTextareaLabel, templateTextarea, templateButtonsRow]);
    }

    _renderAIModelConfigSection(prefix, cfg) {
        const modelConfigTitle = this.domBuilder.createEl('h3', { textContent: 'AI Model Parameters' });
        const modelConfigItems = [];
        const createModelInput = (labelText, tooltipText, idKey, type = 'number', props = {}, subKey) => {
             const inputId = cfg.getUiId(idKey);
             const labelWithTooltip = this._createLabelWithTooltip(prefix, inputId, labelText, tooltipText);
             const inputElement = this.domBuilder.createEl('input', {type, id: inputId, className: `${prefix}input`, ...props, dataset: { subKey }});
             modelConfigItems.push(this.domBuilder.createEl('div', { className: `${prefix}setting-item-stack` }, [labelWithTooltip, inputElement]));
        };
        createModelInput('Temperature (0-2):', 'Higher values (e.g., 1.2) produce more diverse results, while lower values (e.g., 0.5) produce more consistent results.', 'MODEL_CONFIG_TEMP_INPUT', 'number', { step: 0.1, min:0, max:2 }, 'temperature');
        createModelInput('Top P (0-1):', 'Another way to control randomness. The AI will only consider tokens whose cumulative probability reaches this value.', 'MODEL_CONFIG_TOP_P_INPUT', 'number', { step: 0.05, min:0, max:1 }, 'topP');
        createModelInput('Top K (min 1):', 'The AI will choose the next token from the top K most likely candidates. Lower values make the output less random.', 'MODEL_CONFIG_TOP_K_INPUT', 'number', { step: 1, min:1 }, 'topK');
        createModelInput('Maximum Output Tokens:', 'The maximum number of tokens (words/characters) the AI can generate in a single response.', 'MODEL_CONFIG_MAX_TOKENS_INPUT', 'number', { step: 128, min: 1 }, 'maxOutputTokens');
        const modelParamsGrid = this.domBuilder.createEl('div', { className: `${prefix}settings-grid` }, modelConfigItems);

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [modelConfigTitle, modelParamsGrid]);
    }

    _renderChunkingConfigSection(prefix, cfg) {
        const configTitle = this.domBuilder.createEl('h3', { textContent: 'Text Segmentation Configuration' });
        const configItems = [];
        const createModelInput = (labelText, tooltipText, idKey, type = 'number', props = {}, subKey) => {
             const inputId = cfg.getUiId(idKey);
             const labelWithTooltip = this._createLabelWithTooltip(prefix, inputId, labelText, tooltipText);
             const inputElement = this.domBuilder.createEl('input', {type, id: inputId, className: `${prefix}input`, ...props, dataset: { subKey }});
             configItems.push(this.domBuilder.createEl('div', { className: `${prefix}setting-item-stack` }, [labelWithTooltip, inputElement]));
        };
        createModelInput('Minimum length for segmentation:', 'If the source text exceeds this number of characters, it will be automatically split into smaller segments for translation.', 'MODEL_CONFIG_CHUNK_MIN_LENGTH_INPUT', 'number', { step: 1000, min: 1000 }, 'minTextLengthForChunking');
        createModelInput('Character limit per segment:', 'The maximum estimated length of each segment after splitting.', 'MODEL_CONFIG_CHUNK_LIMIT_INPUT', 'number', { step: 100, min: 1000 }, 'chunkInputCharLimit');
        createModelInput('Allowed character overflow:', 'The number of extra characters allowed beyond the limit above to find a natural sentence break, avoiding mid-sentence cuts.', 'MODEL_CONFIG_CHUNK_OVERSIZE_INPUT', 'number', { step: 10, min: 0 }, 'chunkOversizeAllowance');
        createModelInput('Context words between segments:', 'The number of words taken from the end of the previous translated segment as context for the next segment, helping maintain translation continuity.', 'MODEL_CONFIG_CHUNK_CONTEXT_WORDS_INPUT', 'number', { step: 10, min: 0 }, 'chunkContextWords');
        createModelInput('Delay between segments (ms):', 'The wait time (milliseconds) between sending translation segments. Helps avoid API rate limits.', 'MODEL_CONFIG_CHUNK_DELAY_INPUT', 'number', { step: 50, min: 0 }, 'delayBetweenChunksMs');
        const paramsGrid = this.domBuilder.createEl('div', { className: `${prefix}settings-grid` }, configItems);

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [configTitle, paramsGrid]);
    }

    _renderDisplaySection(prefix, cfg) {
        const displaySectionTitle = this.domBuilder.createEl('h3', { textContent: 'Display' });

        // --- Theme (Light/Dark) Section ---
        const uiThemeLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('DISPLAY_THEME_SELECT'), textContent: 'Interface (UI Theme):' });
        const uiThemeSelect = this.domBuilder.createEl('select', {
            id: cfg.getUiId('DISPLAY_THEME_SELECT'),
            className: `${prefix}select`,
            onChange: (e) => this.uiManager.applyTheme(e.target.value)
        }, [
            this.domBuilder.createEl('option', { value: 'light', textContent: 'Light' }),
            this.domBuilder.createEl('option', { value: 'dark', textContent: 'Dark' })
        ]);
        const uiThemeRow = this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [uiThemeLabel, uiThemeSelect]);

        // --- Color Palette Section ---
        const paletteSectionTitle = this.domBuilder.createEl('label', { textContent: 'Color Scheme (Reading Panel):' });
        const themes = cfg.getColorThemes();
        const paletteContainer = this.domBuilder.createEl('div', { className: `${prefix}theme-palette-container` });

        themes.forEach(theme => {
            const paletteItem = this.domBuilder.createEl('button', {
                className: `${prefix}theme-palette-item`,
                title: theme.name,
                dataset: { themeId: theme.id },
                onClick: (e) => this._handleThemeSelect(e)
            }, [
                this.domBuilder.createEl('div', {
                    className: `${prefix}theme-palette-preview`,
                    style: { backgroundColor: theme.bgColor, color: theme.textColor },
                    textContent: 'Aa'
                })
            ]);
            paletteContainer.appendChild(paletteItem);
        });

        // Custom Theme Button
        const customThemeButton = this.domBuilder.createButton({
            className: `${prefix}theme-palette-item ${prefix}theme-palette-item-custom`,
            title: 'Customize Colors',
            dataset: { themeId: 'custom' },
            onClick: (e) => this._handleThemeSelect(e),
            innerHTML: /* trusted-static: no user input */ `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a7 7 0 1 0 10 10"></path></svg>`
        });
        paletteContainer.appendChild(customThemeButton);

        // Custom Color Pickers (initially hidden)
        const bgColorLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('DISPLAY_BG_COLOR_INPUT'), textContent: 'Background Color:' });
        const bgColorInput = this.domBuilder.createEl('input', { type: 'color', id: cfg.getUiId('DISPLAY_BG_COLOR_INPUT'), className: `${prefix}input-color`, dataset: { setting: 'bgColor' }, onInput: (e) => this._handleCustomColorChange(e) });
        const textColorLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('DISPLAY_TEXT_COLOR_INPUT'), textContent: 'Text Color:' });
        const textColorInput = this.domBuilder.createEl('input', { type: 'color', id: cfg.getUiId('DISPLAY_TEXT_COLOR_INPUT'), className: `${prefix}input-color`, dataset: { setting: 'textColor' }, onInput: (e) => this._handleCustomColorChange(e) });

        const customColorPickersContainer = this.domBuilder.createEl('div', {
            className: `${prefix}custom-color-pickers-container`,
            style: { display: 'none' }
        }, [
            this.domBuilder.createEl('div', { className: `${prefix}settings-row-inline` }, [bgColorLabel, bgColorInput]),
            this.domBuilder.createEl('div', { className: `${prefix}settings-row-inline` }, [textColorLabel, textColorInput]),
        ]);

        // --- Font Section ---
        const fontFamilyLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('DISPLAY_FONT_FAMILY_SELECT'), textContent: 'Font (Reading Panel):' });
        const fontFamilySelect = this.domBuilder.createEl('select', { id: cfg.getUiId('DISPLAY_FONT_FAMILY_SELECT'), className: `${prefix}select`});
        cfg.getDisplayFonts().forEach(font => { fontFamilySelect.appendChild(this.domBuilder.createEl('option', {value: font, textContent: font})); });
        const fontSizeLabel = this.domBuilder.createEl('label', { htmlFor: cfg.getUiId('DISPLAY_FONT_SIZE_INPUT'), textContent: 'Font Size (px, Reading Panel):' });
        const fontSizeInput = this.domBuilder.createEl('input', { type: 'number', id: cfg.getUiId('DISPLAY_FONT_SIZE_INPUT'), className: `${prefix}input`, min: 8, max: 72, step: 1});
        const fontSettingsRows = [
            this.domBuilder.createEl('div', {className: `${prefix}settings-row`}, [fontFamilyLabel, fontFamilySelect]),
            this.domBuilder.createEl('div', {className: `${prefix}settings-row`}, [fontSizeLabel, fontSizeInput]),
        ];

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [
            displaySectionTitle,
            uiThemeRow,
            this.domBuilder.createEl('div', {className: `${prefix}settings-row`}, [paletteSectionTitle, paletteContainer, customColorPickersContainer]),
            ...fontSettingsRows
        ]);
    }

    _handleThemeSelect(event) {
        const button = event.currentTarget;
        const themeId = button.dataset.themeId;
        const prefix = this.configManager.getScriptPrefix();
        const paletteContainer = button.closest(`.${prefix}theme-palette-container`);
        if (!paletteContainer) return;
        const customPickersContainer = paletteContainer.closest(`.${prefix}settings-row`).querySelector(`.${prefix}custom-color-pickers-container`);

        // Update active state
        paletteContainer.querySelectorAll(`.${prefix}theme-palette-item`).forEach(item => item.classList.remove('active'));
        button.classList.add('active');

        if (customPickersContainer) {
            if (themeId === 'custom') {
                customPickersContainer.style.display = 'grid';
            } else {
                customPickersContainer.style.display = 'none';
                const theme = this.configManager.getColorThemes().find(t => t.id === themeId);
                if (theme) {
                    const bgColorInput = this.getEl('DISPLAY_BG_COLOR_INPUT');
                    const textColorInput = this.getEl('DISPLAY_TEXT_COLOR_INPUT');
                    if (bgColorInput) bgColorInput.value = theme.bgColor;
                    if (textColorInput) textColorInput.value = theme.textColor;
                }
            }
        }
    }

    _handleCustomColorChange(event) {
        // This function is reserved for potential future use, like live previews.
        // The current logic reads values on save, so this can be empty.
    }


    _renderSafetySection(prefix, cfg) {
        const safetySectionTitle = this.domBuilder.createEl('h3', {textContent: 'Content Safety Settings'});
        const enableSafetyCheckbox = this.domBuilder.createEl('input', {
            type: 'checkbox',
            id: cfg.getUiId('SAFETY_SETTINGS_ENABLE_CHECKBOX'),
            role: 'switch',
            'aria-checked': 'false'
        });
        const toggleSlider = this.domBuilder.createEl('span', { className: `${prefix}slider` });
        const toggleSwitch = this.domBuilder.createEl('label', { className: `${prefix}switch` }, [enableSafetyCheckbox, toggleSlider]);

        const enableSafetyLabelAndTooltip = this._createLabelWithTooltip(
            prefix,
            cfg.getUiId('SAFETY_SETTINGS_ENABLE_CHECKBOX'),
            'Enable Safety Filter:',
            'Enable/disable Google sensitive content filter. Disabling the filter may violate the service terms of use.'
        );
        const enableSafetyRow = this.domBuilder.createEl('div', {className: `${prefix}settings-row`, style: { display: 'flex', alignItems: 'center', gap: '8px' }}, [enableSafetyLabelAndTooltip, toggleSwitch]);

        const safetyCategoryItems = [];
        const safetyCategoriesMap = cfg.getConstant('SAFETY_CATEGORIES_MAP');
        const safetyThresholdsMap = cfg.getConstant('SAFETY_THRESHOLDS_MAP');
        for (const [apiKeyVal, UIName] of Object.entries(safetyCategoriesMap)) {
            const selectId = cfg.getSafetySelectId(apiKeyVal);
            const label = this.domBuilder.createEl('label', {htmlFor: selectId, textContent: `${UIName}:`});
            const select = this.domBuilder.createEl('select', {id: selectId, className: `${prefix}select`, dataset: { categoryApiKey: apiKeyVal } });
            Object.entries(safetyThresholdsMap).forEach(([thresholdUIName, thresholdApiValue]) => { select.appendChild(this.domBuilder.createEl('option', {value: thresholdApiValue, textContent: thresholdUIName})); });
            safetyCategoryItems.push(this.domBuilder.createEl('div', {className: `${prefix}settings-row`}, [label, select]));
        }
        const safetyControlsDiv = this.domBuilder.createEl('div', { className: `${prefix}settings-sub-group` }, safetyCategoryItems);
        enableSafetyCheckbox.addEventListener('change', (e) => {
            safetyControlsDiv.style.opacity = e.target.checked ? '1' : '0.5';
            safetyControlsDiv.querySelectorAll('select').forEach(s => s.disabled = !e.target.checked);
            e.target.setAttribute('aria-checked', e.target.checked.toString());
        });

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [safetySectionTitle, enableSafetyRow, safetyControlsDiv]);
    }

    _renderDataManagementSection(prefix, cfg) {
        const dataManagementTitle = this.domBuilder.createEl('h3', { textContent: 'Data Management' });
        const exportBtn = this.domBuilder.createButton({ id: cfg.getUiId('SETTINGS_EXPORT_ALL_DATA_BTN'), text: 'Export All Settings', className: `${prefix}button`, onClick: () => this._handleExportDataClick() });
        const importBtn = this.domBuilder.createButton({ id: cfg.getUiId('SETTINGS_IMPORT_ALL_DATA_BTN'), text: 'Import All Settings', className: `${prefix}button`, onClick: () => this.getEl('SETTINGS_IMPORT_FILE_INPUT')?.click() });
        const importFileInput = this.domBuilder.createEl('input', { type: 'file', id: cfg.getUiId('SETTINGS_IMPORT_FILE_INPUT'), accept: '.json', style: { display: 'none' }, onChange: (e) => this._handleImportDataChange(e) });
        const dataManagementButtons = this.domBuilder.createEl('div', {className: `${prefix}button-group-inline`, style: { justifyContent: 'space-around', flexWrap: 'wrap', gap: '10px', marginTop: '8px' }}, [exportBtn, importBtn, importFileInput] );

        return this.domBuilder.createEl('div', {className: `${prefix}setting-card`}, [dataManagementTitle, dataManagementButtons]);
        }

        async _handleProviderSelectChange(event) {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const newProviderId = event.target.value;
            settings.set(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID, newProviderId);
            await settings.saveSettings();
            this._updateProviderUI();
            this._updateSavedModelsUI();

            const fetchModelsSearch = this.getEl('FETCH_MODELS_SEARCH');
            const fetchModelsList = this.getEl('FETCH_MODELS_LIST');
            if (fetchModelsSearch) fetchModelsSearch.style.display = 'none';
            if (fetchModelsList) fetchModelsList.style.display = 'none';
        }

        _updateProviderUI() {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const activeProvider = providers.find(p => p.id === activeProviderId);

            const apiKeySection = this.element.querySelector(`#${cfg.getScriptPrefix()}api_key_section`);
            const apiKeyLabel = this.element.querySelector(`#${cfg.getScriptPrefix()}api_key_select_label`);

            if (apiKeySection) {
                apiKeySection.style.display = 'block'; // Show for all providers
            }
            if (apiKeyLabel && activeProvider) {
                apiKeyLabel.textContent = `API Key (${activeProvider.name}):`;
            }

            this._populateApiKeySelect();
        }

        async _handleFetchModelsClick() {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            await this._fetchModelsForProvider(activeProviderId);
        }

        _handleFetchModelsSearch(event) {
            const searchTerm = event.target.value.toLowerCase();
            const fetchModelsList = this.getEl('FETCH_MODELS_LIST');
            if (!fetchModelsList) return;

            const items = fetchModelsList.querySelectorAll('div');
            items.forEach(item => {
                const modelName = item.textContent.toLowerCase();
                if (modelName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        }

        async _handleAddModel(modelId, modelName) {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);

            let savedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};
            if (!savedModelsMap[activeProviderId]) {
                savedModelsMap[activeProviderId] = [];
            }

            if (!savedModelsMap[activeProviderId].some(m => m.id === modelId)) {
                savedModelsMap[activeProviderId].push({ id: modelId, name: modelName });
                settings.set(cfg.SETTING_KEYS.SAVED_MODELS_MAP, savedModelsMap);
                await settings.saveSettings();
                this._updateSavedModelsUI();
            }
        }

        async _handleRemoveModel(modelId) {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);

            let savedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};
            if (savedModelsMap[activeProviderId]) {
                savedModelsMap[activeProviderId] = savedModelsMap[activeProviderId].filter(m => m.id !== modelId);
                settings.set(cfg.SETTING_KEYS.SAVED_MODELS_MAP, savedModelsMap);

                // If the removed model was the selected one, update selected model
                const currentSelected = settings.get(cfg.SETTING_KEYS.SELECTED_MODEL);
                if (currentSelected === modelId) {
                    const newSelected = savedModelsMap[activeProviderId].length > 0 ? savedModelsMap[activeProviderId][0].id : "";
                    settings.set(cfg.SETTING_KEYS.SELECTED_MODEL, newSelected);

                    let lastSelectedMap = settings.get(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP) || {};
                    lastSelectedMap[activeProviderId] = newSelected;
                    settings.set(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP, lastSelectedMap);
                }

                await settings.saveSettings();
                this._updateSavedModelsUI();
            }
        }

        _updateSavedModelsUI() {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const prefix = cfg.getScriptPrefix();
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            let savedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};

            const savedModels = savedModelsMap[activeProviderId] || [];

            const modelSelect = this.getEl('MODEL_SELECT');

            if (modelSelect) {
                modelSelect.innerHTML = '';
                if (savedModels.length === 0) {
                    modelSelect.appendChild(this.domBuilder.createEl('option', { textContent: 'No models available. Please fetch the model list.', value: '' }));
                    modelSelect.disabled = true;
                } else {
                    modelSelect.disabled = false;
                    savedModels.forEach(m => {
                        modelSelect.appendChild(this.domBuilder.createEl('option', { value: m.id, textContent: m.name }));
                    });

                    let lastSelectedMap = settings.get(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP) || {};
                    let lastModelForProvider = lastSelectedMap[activeProviderId];

                    if (lastModelForProvider && savedModels.some(m => m.id === lastModelForProvider)) {
                        modelSelect.value = lastModelForProvider;
                        settings.set(cfg.SETTING_KEYS.SELECTED_MODEL, lastModelForProvider);
                    } else {
                        modelSelect.value = savedModels[0].id;
                        settings.set(cfg.SETTING_KEYS.SELECTED_MODEL, savedModels[0].id);

                        lastSelectedMap[activeProviderId] = savedModels[0].id;
                        settings.set(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP, lastSelectedMap);
                    }
                    settings.saveSettings();
                }
            }
        }

        async _fetchModelsForProvider(providerId) {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const prefix = cfg.getScriptPrefix();
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const provider = providers.find(p => p.id === providerId);

            const fetchModelsSearch = this.getEl('FETCH_MODELS_SEARCH');
            const fetchModelsList = this.getEl('FETCH_MODELS_LIST');
            const fetchModelsBtn = this.getEl('FETCH_MODELS_BTN');

            if (!fetchModelsList || !fetchModelsSearch || !fetchModelsBtn) return;

            fetchModelsSearch.style.display = 'block';
            fetchModelsList.style.display = 'block';
            fetchModelsList.innerHTML = '';
            fetchModelsList.appendChild(this.domBuilder.createEl('div', { textContent: 'Loading models...', style: { color: '#888', fontStyle: 'italic' } }));
            fetchModelsBtn.disabled = true;

            let models = [];

            if (provider && provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                try {
                    let apiKey = this.appServices.apiService._getNextApiKey(provider);
                    if (!apiKey) throw new Error("API Key is missing");

                    const baseUrl = cfg.getGeminiBaseUrl().replace(/\/$/, '');
                    const response = await fetch(`${baseUrl}?key=${apiKey}`);
                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const data = await response.json();
                    if (data && data.models && Array.isArray(data.models)) {
                        models = data.models
                            .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
                            .map(m => {
                                const id = m.name.replace('models/', '');
                                return { id: id, name: m.displayName || id };
                            });
                    } else {
                        throw new Error("Invalid response format from Gemini API");
                    }
                } catch (error) {
                    this.logger.error("Failed to fetch models for Gemini provider:", error);
                    fetchModelsList.innerHTML = '';
                    fetchModelsList.appendChild(this.domBuilder.createEl('div', { textContent: 'Failed to load models. Check your API Key.', style: { color: 'red' } }));
                    fetchModelsBtn.disabled = false;
                    return;
                }
            } else if (provider && provider.type === cfg.getConstant('PROVIDER_TYPES').CUSTOM) {
                try {
                    let baseUrl = provider.baseUrl;
                    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

                    let apiKey = this.appServices.apiService._getNextApiKey(provider);

                    const response = await fetch(`${baseUrl}/models`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${apiKey}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const data = await response.json();
                    if (data && data.data && Array.isArray(data.data)) {
                        models = data.data.map(m => ({ id: m.id, name: m.id }));
                    } else {
                        throw new Error("Invalid response format from Custom Provider");
                    }
                } catch (error) {
                    this.logger.error("Failed to fetch models for custom provider:", error);
                    fetchModelsList.innerHTML = '';
                    fetchModelsList.appendChild(this.domBuilder.createEl('div', { textContent: 'Failed to load models. Check the URL/API Key.', style: { color: 'red' } }));
                    fetchModelsBtn.disabled = false;
                    return;
                }
            }

            fetchModelsList.innerHTML = '';
            fetchModelsBtn.disabled = false;

            if (models.length === 0) {
                fetchModelsList.appendChild(this.domBuilder.createEl('div', { textContent: 'No models available', style: { color: '#888', fontStyle: 'italic' } }));
            } else {
                const savedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};
                const savedModels = savedModelsMap[providerId] || [];

                models.forEach(m => {
                    const isSaved = savedModels.some(saved => saved.id === m.id);
                    const addBtn = this.domBuilder.createButton({
                        text: isSaved ? '-' : '+',
                        className: `${prefix}button ${prefix}button-small ${isSaved ? prefix + 'button-danger' : ''}`,
                        style: { padding: '2px 8px', marginLeft: '10px' },
                        onClick: () => {
                            const currentSavedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};
                            const currentSavedModels = currentSavedModelsMap[providerId] || [];
                            const currentlySaved = currentSavedModels.some(saved => saved.id === m.id);

                            if (currentlySaved) {
                                this._handleRemoveModel(m.id);
                                addBtn.textContent = '+';
                                addBtn.classList.remove(`${prefix}button-danger`);
                            } else {
                                this._handleAddModel(m.id, m.name);
                                addBtn.textContent = '-';
                                addBtn.classList.add(`${prefix}button-danger`);
                            }
                        }
                    });

                    const item = this.domBuilder.createEl('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px', borderBottom: '1px solid #eee' } }, [
                        this.domBuilder.createEl('span', { textContent: m.name }),
                        addBtn
                    ]);
                    fetchModelsList.appendChild(item);
                });
            }
        }

        async _handleModelSelectChange(event) {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const selectedModel = event.target.value;

            settings.set(cfg.SETTING_KEYS.SELECTED_MODEL, selectedModel);

            let lastSelectedMap = settings.get(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP) || {};
            lastSelectedMap[activeProviderId] = selectedModel;
            settings.set(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP, lastSelectedMap);

            await settings.saveSettings();
        }

        async _handleTestConnectionClick() {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const prefix = cfg.getScriptPrefix();
            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const savedModelsMap = settings.get(cfg.SETTING_KEYS.SAVED_MODELS_MAP) || {};
            const savedModels = savedModelsMap[activeProviderId] || [];

            if (savedModels.length === 0) {
                this.logger.notify('No models available for testing.', 'Warning', 'warn');
                return;
            }

            const modalOverlay = this.domBuilder.createEl('div', { id: cfg.getUiId('TEST_CONNECTION_MODAL'), className: `${prefix}modal-overlay` });
            const modalContent = this.domBuilder.createEl('div', { className: `${prefix}modal-content`, style: { width: '400px', maxWidth: '90%' } });

            const header = this.domBuilder.createEl('div', { className: `${prefix}modal-header` }, [
                this.domBuilder.createEl('h2', { textContent: 'Test Connection' }),
                this.domBuilder.createButton({ id: cfg.getUiId('TEST_CONNECTION_MODAL_CLOSE_BTN'), text: '×', className: `${prefix}close-btn`, onClick: () => modalOverlay.remove() })
            ]);

            const listContainer = this.domBuilder.createEl('div', { id: cfg.getUiId('TEST_CONNECTION_LIST'), style: { maxHeight: '300px', overflowY: 'auto', marginTop: '10px' } });

            const modelStatusEls = {};

            savedModels.forEach(m => {
                const statusIcon = this.domBuilder.createEl('span', { textContent: '⏳', style: { marginLeft: '10px' } });
                modelStatusEls[m.id] = statusIcon;

                const item = this.domBuilder.createEl('div', { style: { display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #eee' } }, [
                    this.domBuilder.createEl('span', { textContent: m.name }),
                    statusIcon
                ]);
                listContainer.appendChild(item);
            });

            modalContent.appendChild(header);
            modalContent.appendChild(listContainer);
            modalOverlay.appendChild(modalContent);

            const shadowHost = document.getElementById(cfg.getUiId('SHADOW_HOST'));
            if (shadowHost && shadowHost.shadowRoot) {
                shadowHost.shadowRoot.appendChild(modalOverlay);
            } else {
                (document.documentElement || document.body).appendChild(modalOverlay);
            }

            const apiService = this.appServices.apiService;
            const testPromises = savedModels.map(async m => {
                try {
                    await apiService.testConnection(m.id, true);
                    if (modelStatusEls[m.id]) {
                        modelStatusEls[m.id].textContent = '✓';
                        modelStatusEls[m.id].style.color = 'green';
                    }
                } catch (error) {
                    if (modelStatusEls[m.id]) {
                        modelStatusEls[m.id].textContent = 'X';
                        modelStatusEls[m.id].style.color = 'red';
                    }
                }
            });
            await Promise.all(testPromises);
        }

        _populateProviderSelect() {
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;
            const providerSelect = this.getEl('PROVIDER_SELECT');
            if (!providerSelect) return;

            providerSelect.innerHTML = '';
            let providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST);
            if (!providers || providers.length === 0) {
                providers = cfg.getDefaultSetting(cfg.SETTING_KEYS.PROVIDERS_LIST);
                settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, providers);
            }

            let activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            if (!providers.some(p => p.id === activeProviderId)) {
                activeProviderId = providers[0].id;
                settings.set(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID, activeProviderId);
            }

            providers.forEach(p => {
                providerSelect.appendChild(this.domBuilder.createEl('option', { textContent: p.name, value: p.id }));
            });
            providerSelect.value = activeProviderId;

            this._updateProviderUI();
            this._updateSavedModelsUI();

            const fetchModelsSearch = this.getEl('FETCH_MODELS_SEARCH');
            const fetchModelsList = this.getEl('FETCH_MODELS_LIST');
            if (fetchModelsSearch) fetchModelsSearch.style.display = 'none';
            if (fetchModelsList) fetchModelsList.style.display = 'none';
        }

        _handleManageProvidersClick() {
            this._showProviderManagementModal();
        }

        _showProviderManagementModal() {
            const prefix = this.configManager.getScriptPrefix();
            const cfg = this.configManager;
            const settings = this.appServices.settingsService;

            const existingModal = this.uiManager.shadowRoot.getElementById(cfg.getUiId('PROVIDER_MODAL'));
            if (existingModal) existingModal.remove();

            const titleEl = this.domBuilder.createEl('h2', { textContent: 'Manage Custom Providers' });
            const closeBtn = this.domBuilder.createButton({
                id: cfg.getUiId('PROVIDER_MODAL_CLOSE_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('x'),
                className: `${prefix}modal-close-btn`,
                onClick: () => {
                    const modal = this.uiManager.shadowRoot.getElementById(cfg.getUiId('PROVIDER_MODAL'));
                    if (modal) modal.remove();
                }
            });
            const header = this.domBuilder.createEl('div', { className: `${prefix}modal-header` }, [titleEl, closeBtn]);

            const listContainer = this.domBuilder.createEl('div', { id: cfg.getUiId('PROVIDER_LIST'), className: `${prefix}provider-list`, style: { marginBottom: '15px', maxHeight: '200px', overflowY: 'auto' } });

            const renderList = () => {
                listContainer.innerHTML = '';
                const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
                providers.forEach(p => {
                    const nameEl = this.domBuilder.createEl('span', { textContent: p.name + (p.isCustom ? ' (Custom)' : ' (Default)') });
                    const deleteBtn = p.isCustom ? this.domBuilder.createButton({
                        text: 'Delete',
                        className: `${prefix}button ${prefix}button-small ${prefix}button-danger`,
                        onClick: async () => {
                            const isConfirmed = await this.uiManager.showConfirmDialog(`Delete Provider ${p.name}?`);
                            if (isConfirmed) {
                                const newProviders = providers.filter(prov => prov.id !== p.id);
                                settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, newProviders);
                                if (settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID) === p.id) {
                                    settings.set(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID, newProviders[0].id);
                                }
                                await settings.saveSettings();
                                renderList();
                                this._populateProviderSelect();
                            }
                        }
                    }) : this.domBuilder.createEl('span');

                    const item = this.domBuilder.createEl('div', { className: `${prefix}settings-row`, style: { justifyContent: 'space-between', padding: '5px', borderBottom: '1px solid #ccc' } }, [nameEl, deleteBtn]);
                    listContainer.appendChild(item);
                });
            };
            renderList();

            const addTitle = this.domBuilder.createEl('h3', { textContent: 'Add New Custom Provider' });
            const nameInput = this.domBuilder.createEl('input', { id: cfg.getUiId('PROVIDER_NAME_INPUT'), className: `${prefix}input`, placeholder: 'Provider Name (e.g., My Proxy)' });
            const urlInput = this.domBuilder.createEl('input', { id: cfg.getUiId('PROVIDER_BASE_URL_INPUT'), className: `${prefix}input`, placeholder: 'API Base URL (VD: https://api.example.com/v1)' });
            const keyInput = this.domBuilder.createEl('input', { type: 'password', id: cfg.getUiId('PROVIDER_API_KEY_INPUT'), className: `${prefix}input`, placeholder: 'API Key' });

            const saveBtn = this.domBuilder.createButton({
                id: cfg.getUiId('PROVIDER_SAVE_BTN'),
                text: 'Save Provider',
                className: `${prefix}button ${prefix}button-primary`,
                onClick: async () => {
                    const name = nameInput.value.trim();
                    const url = urlInput.value.trim();
                    const key = keyInput.value.trim();
                    if (!name || !url || !key) {
                        alert('Please fill in all required fields!');
                        return;
                    }

                    // Validate URL before persisting — prevents SSRF and accidental
                    // API key transmission to attacker-controlled endpoints.
                    const _validateUrl = (raw) => {
                        let parsed;
                        try { parsed = new URL(raw); }
                        catch { return { ok: false, fatal: 'Invalid URL. Enter a complete URL, for example: https://api.example.com/v1' }; }
                        if (!['http:', 'https:'].includes(parsed.protocol)) {
                            return { ok: false, fatal: `Protocol "${parsed.protocol}" is not supported. Only http:// and https:// are supported.` };
                        }
                        const h = parsed.hostname;
                        const isLocal = /^(localhost|127\.|::1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h);
                        if (parsed.protocol === 'http:' && !isLocal) {
                            return { ok: true, warn: 'Warning: Unencrypted HTTP connection.\nYour API Key will be sent in plaintext.\nHTTPS is strongly recommended.' };
                        }
                        return { ok: true, warn: null };
                    };
                    const urlCheck = _validateUrl(url);
                    if (!urlCheck.ok) {
                        await this.uiManager.showConfirmDialog(urlCheck.fatal + '\n\nPlease correct the URL and try again.');
                        urlInput.focus(); return;
                    }
                    if (urlCheck.warn) {
                        const proceed = await this.uiManager.showConfirmDialog(urlCheck.warn + '\n\nDo you still want to continue?');
                        if (!proceed) { urlInput.focus(); return; }
                    }

                    const newProvider = {
                        id: 'custom-' + Date.now(),
                        type: cfg.getConstant('PROVIDER_TYPES').CUSTOM,
                        name: name,
                        baseUrl: url,
                        apiKey: key,
                        apiKeys: [key],
                        selectedApiKey: key,
                        isCustom: true
                    };
                    const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
                    providers.push(newProvider);
                    settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, providers);
                    settings.set(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID, newProvider.id);
                    await settings.saveSettings();

                    nameInput.value = '';
                    urlInput.value = '';
                    keyInput.value = '';
                    renderList();
                    this._populateProviderSelect();
                }
            });

            const formContainer = this.domBuilder.createEl('div', { className: `${prefix}setting-card` }, [
                addTitle,
                this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [this.domBuilder.createEl('label', { textContent: 'Name:' }), nameInput]),
                this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [this.domBuilder.createEl('label', { textContent: 'Base URL:' }), urlInput]),
                this.domBuilder.createEl('div', { className: `${prefix}settings-row` }, [this.domBuilder.createEl('label', { textContent: 'API Key:' }), keyInput]),
                this.domBuilder.createEl('div', { className: `${prefix}settings-row`, style: { justifyContent: 'flex-end' } }, [saveBtn])
            ]);

            const body = this.domBuilder.createEl('div', { className: `${prefix}modal-body` }, [listContainer, formContainer]);
            const modalContent = this.domBuilder.createEl('div', { className: `${prefix}modal-content`, style: { maxWidth: '500px' } }, [header, body]);
            const overlay = this.domBuilder.createEl('div', { id: cfg.getUiId('PROVIDER_MODAL'), className: `${prefix}modal-overlay`, style: { zIndex: 10001 } }, [modalContent]);

            this.uiManager.shadowRoot.appendChild(overlay);
        }

        _populateApiKeySelect() {
            const cfg = this.configManager; const settings = this.appServices.settingsService;
            const apiKeySelect = this.getEl('API_KEY_SELECT'); const apiKeyRemoveBtn = this.getEl('API_KEY_REMOVE_BTN');
            if (!apiKeySelect || !apiKeyRemoveBtn) return;

            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const activeProvider = providers.find(p => p.id === activeProviderId);

            apiKeySelect.innerHTML = '';

            let apiKeysList = [];
            let selectedApiKey = null;

            if (activeProvider) {
                if (activeProvider.apiKeys) {
                    apiKeysList = activeProvider.apiKeys;
                } else if (activeProvider.apiKey) {
                    apiKeysList = [activeProvider.apiKey];
                } else if (activeProvider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                    apiKeysList = settings.get(cfg.SETTING_KEYS.API_KEYS_LIST) || [];
                }

                selectedApiKey = activeProvider.selectedApiKey;
                if (!selectedApiKey && activeProvider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                    selectedApiKey = settings.get(cfg.SETTING_KEYS.SELECTED_API_KEY);
                }
            }

            if (apiKeysList.length === 0) {
                apiKeySelect.appendChild(this.domBuilder.createEl('option', { textContent: "No API Keys available", value: "" }));
                apiKeySelect.disabled = true; apiKeyRemoveBtn.disabled = true;
            } else {
                apiKeySelect.disabled = false;
                apiKeysList.forEach(key => {
                    const maskedKey = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : key;
                    apiKeySelect.appendChild(this.domBuilder.createEl('option', { textContent: maskedKey, value: key }));
                });
                apiKeySelect.value = selectedApiKey || "";
                apiKeyRemoveBtn.disabled = !selectedApiKey || apiKeysList.length === 0;
            }
        }
        _populateTemplateSelect() {
            const cfg = this.configManager; const settings = this.appServices.settingsService;
            const templateSelect = this.getEl('CONTEXT_TEMPLATE_SELECT'); const templateTextarea = this.getEl('CONTEXT_TEMPLATE_TEXTAREA'); const updateBtn = this.getEl('CONTEXT_TEMPLATE_UPDATE_BTN'); const deleteBtn = this.getEl('CONTEXT_TEMPLATE_DELETE_BTN');
            if (!templateSelect || !templateTextarea || !updateBtn || !deleteBtn) return;
            templateSelect.innerHTML = ''; const templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP) || {}; let selectedTemplateName = settings.get(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME) || cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
            if (!templatesMap.hasOwnProperty(selectedTemplateName)) { selectedTemplateName = Object.keys(templatesMap).sort()[0] || cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME); settings.set(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME, selectedTemplateName); }

            const protectedNames = cfg.getProtectedTemplateNames();
            const allTemplateNames = Object.keys(templatesMap);
            const defaultPrompts = protectedNames.filter(name => allTemplateNames.includes(name));
            const customPrompts = allTemplateNames
                .filter(name => !protectedNames.includes(name))
                .sort((a, b) => a.localeCompare(b));
            const sortedTemplateNames = [...defaultPrompts, ...customPrompts];

            sortedTemplateNames.forEach(name => {
                templateSelect.appendChild(this.domBuilder.createEl('option', { textContent: name, value: name }));
            });

            templateSelect.value = selectedTemplateName;
            templateTextarea.value = templatesMap[selectedTemplateName] || "";
            const isProtected = cfg.getProtectedTemplateNames().includes(selectedTemplateName); updateBtn.disabled = !selectedTemplateName; deleteBtn.disabled = !selectedTemplateName || isProtected;
        }
        _populateSettings() {
            if (!this._isRendered && this.element) this.render();
             if (!this.element) { this.logger.error("SettingsModal _populateSettings called but element is not rendered."); return;}
            const settingsService = this.appServices.settingsService;
            const cfg = this.configManager;

            this._populateProviderSelect();
            this._populateApiKeySelect();
            this._populateTemplateSelect();

            const modelSelectEl = this.getEl('MODEL_SELECT');
            if (modelSelectEl) modelSelectEl.value = settingsService.get(cfg.SETTING_KEYS.SELECTED_MODEL) || cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_MODEL);

            const modelCfgDefaults = cfg.getDefaultSetting(cfg.SETTING_KEYS.MODEL_CONFIG);
            const modelCfgSaved = settingsService.get(cfg.SETTING_KEYS.MODEL_CONFIG) || {};
            const modelConfig = { ...modelCfgDefaults, ...modelCfgSaved };
            for (const key in modelConfig) {
                if (modelConfig.hasOwnProperty(key)) {
                    const inputEl = this.element.querySelector(`input[data-sub-key="${key}"], select[data-sub-key="${key}"], textarea[data-sub-key="${key}"]`);
                    if(inputEl) inputEl.value = modelConfig[key];
                }
            }

            const themeSelectEl = this.getEl('DISPLAY_THEME_SELECT');
            if(themeSelectEl) themeSelectEl.value = settingsService.get(cfg.SETTING_KEYS.SELECTED_THEME) || cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_THEME);

            const displayDefaults = cfg.getDefaultSetting(cfg.SETTING_KEYS.DISPLAY_SETTINGS);
            const displaySaved = settingsService.get(cfg.SETTING_KEYS.DISPLAY_SETTINGS) || {};
            const displayConfig = { ...displayDefaults, ...displaySaved };

            // --- New Theme Palette Logic ---
            const prefix = this.configManager.getScriptPrefix();
            const paletteContainer = this.element.querySelector(`.${prefix}theme-palette-container`);
            const customPickersContainer = this.element.querySelector(`.${prefix}custom-color-pickers-container`);

            if (paletteContainer) {
                paletteContainer.querySelectorAll(`.${prefix}theme-palette-item`).forEach(item => item.classList.remove('active'));
                const activeThemeButton = paletteContainer.querySelector(`[data-theme-id="${displayConfig.themeId}"]`);
                if (activeThemeButton) {
                    activeThemeButton.classList.add('active');
                }
            }

            if (customPickersContainer) {
                customPickersContainer.style.display = displayConfig.themeId === 'custom' ? 'grid' : 'none';
            }

            const bgColorInputEl = this.getEl('DISPLAY_BG_COLOR_INPUT'); if(bgColorInputEl) bgColorInputEl.value = displayConfig.bgColor;
            const textColorInputEl = this.getEl('DISPLAY_TEXT_COLOR_INPUT'); if(textColorInputEl) textColorInputEl.value = displayConfig.textColor;
            // --- End New Theme Palette Logic ---

            const fontFamilySelectEl = this.getEl('DISPLAY_FONT_FAMILY_SELECT'); if(fontFamilySelectEl) fontFamilySelectEl.value = displayConfig.fontFamily;
            const fontSizeInputEl = this.getEl('DISPLAY_FONT_SIZE_INPUT'); if(fontSizeInputEl) fontSizeInputEl.value = parseInt(displayConfig.fontSize, 10) || parseInt(displayDefaults.fontSize, 10);

            const safetyDefaults = cfg.getDefaultSetting(cfg.SETTING_KEYS.SAFETY_CONFIG);
            const safetySaved = settingsService.get(cfg.SETTING_KEYS.SAFETY_CONFIG) || {};
            const safetyConfig = {
                enabled: safetySaved.enabled !== undefined ? safetySaved.enabled : safetyDefaults.enabled,
                settings: { ...safetyDefaults.settings, ...(safetySaved.settings || {}) }
            };
            const enableCheckbox = this.getEl('SAFETY_SETTINGS_ENABLE_CHECKBOX');
            if (enableCheckbox) {
                enableCheckbox.checked = safetyConfig.enabled;
                enableCheckbox.setAttribute('aria-checked', safetyConfig.enabled.toString());
            }

            const prefix_safety = cfg.getScriptPrefix();
            const safetySectionEl = enableCheckbox ? enableCheckbox.closest(`.${prefix_safety}setting-card`) : null;
            const safetyControlsDiv = safetySectionEl ? safetySectionEl.querySelector(`.${prefix_safety}settings-sub-group`) : null;

            if (safetyControlsDiv && enableCheckbox) {
                 safetyControlsDiv.style.opacity = enableCheckbox.checked ? '1' : '0.5';
                 safetyControlsDiv.querySelectorAll('select').forEach(s => s.disabled = !enableCheckbox.checked);
            }
            for (const [categoryApiKey, thresholdValue] of Object.entries(safetyConfig.settings)) {
                const selectEl = this.element.querySelector(`select[data-category-api-key="${categoryApiKey}"]`);
                if(selectEl) selectEl.value = thresholdValue;
            }
        }
        async _handleAddApiKeyClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const newKey = await this.uiManager.showPromptDialog("Enter a new API Key:");
            if (newKey && newKey.trim()) {
                const keyToAdd = newKey.trim();

                const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
                const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
                const providerIndex = providers.findIndex(p => p.id === activeProviderId);

                if (providerIndex !== -1) {
                    const provider = providers[providerIndex];
                    let currentKeys = [];
                    if (provider.apiKeys) {
                        currentKeys = provider.apiKeys;
                    } else if (provider.apiKey) {
                        currentKeys = [provider.apiKey];
                    } else if (provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                        currentKeys = settings.get(cfg.SETTING_KEYS.API_KEYS_LIST) || [];
                    }

                    if (!currentKeys.includes(keyToAdd)) {
                        currentKeys.push(keyToAdd);
                        provider.apiKeys = currentKeys;
                        if (!provider.selectedApiKey) {
                            provider.selectedApiKey = keyToAdd;
                        }
                        providers[providerIndex] = provider;
                        settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, providers);

                        // Also update global for Gemini fallback
                        if (provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                            settings.set(cfg.SETTING_KEYS.API_KEYS_LIST, currentKeys);
                            if (!settings.get(cfg.SETTING_KEYS.SELECTED_API_KEY)) {
                                settings.set(cfg.SETTING_KEYS.SELECTED_API_KEY, keyToAdd);
                            }
                        }

                        await settings.saveSettings();
                        if (this.appServices.apiService.resetProviderIndex) {
                            this.appServices.apiService.resetProviderIndex(activeProviderId);
                        }
                        this._populateApiKeySelect();
                        this.logger.notify("API Key has been added.", "Settings");
                    } else {
                        this.logger.notify("This API Key already exists.", "Settings Warning", "warn");
                    }
                }
            } else if (newKey !== null) { this.logger.notify("API Key cannot be empty.", "Settings Warning", "warn"); }
        }
        async _handleRemoveApiKeyClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService;

            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const providerIndex = providers.findIndex(p => p.id === activeProviderId);

            if (providerIndex === -1) return;
            const provider = providers[providerIndex];

            let selectedKey = provider.selectedApiKey;
            if (!selectedKey && provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                selectedKey = settings.get(cfg.SETTING_KEYS.SELECTED_API_KEY);
            }

            if (!selectedKey) { this.logger.notify("No API Key selected for deletion.", "Settings Info", "info"); return; }
            const masked = selectedKey.length > 8 ? `${selectedKey.substring(0, 4)}...${selectedKey.substring(selectedKey.length - 4)}` : selectedKey;
            const isConfirmed = await this.uiManager.showConfirmDialog(`Are you sure you want to delete API Key: ${masked}?`);
            if (isConfirmed) {
                let currentKeys = [];
                if (provider.apiKeys) {
                    currentKeys = provider.apiKeys;
                } else if (provider.apiKey) {
                    currentKeys = [provider.apiKey];
                } else if (provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                    currentKeys = settings.get(cfg.SETTING_KEYS.API_KEYS_LIST) || [];
                }

                currentKeys = currentKeys.filter(k => k !== selectedKey);
                provider.apiKeys = currentKeys;
                provider.selectedApiKey = currentKeys[0] || null;
                providers[providerIndex] = provider;
                settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, providers);

                // Also update global for Gemini fallback
                if (provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                    settings.set(cfg.SETTING_KEYS.API_KEYS_LIST, currentKeys);
                    settings.set(cfg.SETTING_KEYS.SELECTED_API_KEY, currentKeys[0] || null);
                }

                await settings.saveSettings();
                if (this.appServices.apiService.resetProviderIndex) {
                    this.appServices.apiService.resetProviderIndex(activeProviderId);
                }
                this._populateApiKeySelect();
                this.logger.notify("API Key has been deleted.", "Settings");
            }
        }
        async _handleApiKeySelectChange(event) {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const newSelectedKey = event.target.value;

            const activeProviderId = settings.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
            const providers = settings.get(cfg.SETTING_KEYS.PROVIDERS_LIST) || [];
            const providerIndex = providers.findIndex(p => p.id === activeProviderId);

            if (providerIndex !== -1) {
                const provider = providers[providerIndex];
                provider.selectedApiKey = newSelectedKey || null;
                providers[providerIndex] = provider;
                settings.set(cfg.SETTING_KEYS.PROVIDERS_LIST, providers);

                if (provider.type === cfg.getConstant('PROVIDER_TYPES').GEMINI) {
                    settings.set(cfg.SETTING_KEYS.SELECTED_API_KEY, newSelectedKey || null);
                }

                await settings.saveSettings();
                this._populateApiKeySelect();
                this.logger.info(`Selected API Key changed to: ${newSelectedKey ? '****' + newSelectedKey.slice(-4) : 'None'}`);
            }
        }
        _handleTemplateSelectChange(event) {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const newSelectedTemplateName = event.target.value;
            settings.set(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME, newSelectedTemplateName);
            const templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP); const templateTextarea = this.getEl('CONTEXT_TEMPLATE_TEXTAREA'); templateTextarea.value = templatesMap[newSelectedTemplateName] || "";
            const updateBtn = this.getEl('CONTEXT_TEMPLATE_UPDATE_BTN'); const deleteBtn = this.getEl('CONTEXT_TEMPLATE_DELETE_BTN');
            const isProtected = cfg.getProtectedTemplateNames().includes(newSelectedTemplateName); updateBtn.disabled = !newSelectedTemplateName; deleteBtn.disabled = !newSelectedTemplateName || isProtected; this.logger.info(`Selected template changed to: ${newSelectedTemplateName}`);
        }
        async _handleSaveNewTemplateClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const templateTextarea = this.getEl('CONTEXT_TEMPLATE_TEXTAREA'); const newName = await this.uiManager.showPromptDialog("Enter a name for the new prompt template:"); if (!newName || !newName.trim()) { if (newName !== null) this.logger.notify("Prompt template name cannot be empty.", "Settings Warning", "warn"); return; }
            const trimmedName = newName.trim(); let templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP) || {}; if (templatesMap.hasOwnProperty(trimmedName)) { this.logger.notify(`Prompt template name "${trimmedName}" already exists.`, "Settings Warning", "warn"); return; }
            if (cfg.getProtectedTemplateNames().map(n=>n.toLowerCase()).includes(trimmedName.toLowerCase())){ this.logger.notify(`The reserved name "${trimmedName}" cannot be used for a prompt template.`, "Settings Error", "error"); return; }
            templatesMap[trimmedName] = templateTextarea.value; settings.set(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP, templatesMap); settings.set(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME, trimmedName); this._populateTemplateSelect(); this.logger.notify(`Prompt template "${trimmedName}" has been staged. Save settings to apply permanently.`, "Settings");
        }
        async _handleUpdateTemplateClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const selectedTemplateName = settings.get(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME); if (!selectedTemplateName) { this.logger.notify("No prompt template selected for update.", "Settings Info", "info"); return; }
            const templateTextarea = this.getEl('CONTEXT_TEMPLATE_TEXTAREA'); let templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP);
            if (templatesMap[selectedTemplateName] === templateTextarea.value) { this.logger.notify(`Prompt template "${selectedTemplateName}" content is unchanged.`, "Settings Info", "info"); return; }
            templatesMap[selectedTemplateName] = templateTextarea.value; settings.set(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP, templatesMap); this.logger.notify(`Prompt template "${selectedTemplateName}" content has been staged. Save settings to apply permanently.`, "Settings");
        }
        async _handleDeleteTemplateClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const selectedTemplateName = settings.get(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME); if (!selectedTemplateName) { this.logger.notify("No prompt template selected for deletion.", "Settings Info", "info"); return; }
            if (cfg.getProtectedTemplateNames().includes(selectedTemplateName)) { this.logger.notify(`Prompt template "${selectedTemplateName}" is protected and cannot be deleted.`, "Settings Error", "error"); return; }
            const isConfirmed = await this.uiManager.showConfirmDialog(`Are you sure you want to delete prompt template "${selectedTemplateName}"? This change will take effect after you save all settings.`);
            if (isConfirmed) {
                let templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP); delete templatesMap[selectedTemplateName]; settings.set(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP, templatesMap);
                settings.set(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME, cfg.getDefaultSetting(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME)); this._populateTemplateSelect(); this.logger.notify(`Prompt template "${selectedTemplateName}" has been marked for deletion. Save settings to apply permanently.`, "Settings");
            }
        }
        async _handleApplyContextClick() {
            const cfg = this.configManager; const settings = this.appServices.settingsService; const templateTextarea = this.getEl('CONTEXT_TEMPLATE_TEXTAREA'); const selectedTemplateName = settings.get(cfg.SETTING_KEYS.SELECTED_TEMPLATE_NAME);
            if(!selectedTemplateName){ this.logger.notify("No prompt template selected to apply. Please select or save a prompt template.", "Settings Error", "error"); return; }
            let templatesMap = settings.get(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP); templatesMap[selectedTemplateName] = templateTextarea.value; settings.set(cfg.SETTING_KEYS.CONTEXT_TEMPLATES_MAP, templatesMap);
            this.logger.notify(`Prompt context for "${selectedTemplateName}" has been staged and will be set as the default after saving.`, "Settings");
        }
        _downloadFileHelper(filename, content, mimeType = 'text/plain') {
            const blob = new Blob([content], { type: mimeType });
            const url = URL.createObjectURL(blob);
            const a = this.domBuilder.createEl('a', { href: url, download: filename });
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            }, 15000);
            this.logger.info(`File "${filename}" download initiated.`);
        }
        _handleExportDataClick() {
            this.logger.info("Exporting all settings...");
            try {
                const allSettingsKeys = this.configManager.getAllSettingKeys();
                const settingsToExport = {};
                for (const internalKey of Object.keys(allSettingsKeys)) {
                    const settingKeyConstant = allSettingsKeys[internalKey];
                    // Skip exporting resultModalState as it's transient and page-specific
                    if (settingKeyConstant === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) continue;
                    settingsToExport[settingKeyConstant] = this.appServices.settingsService.get(settingKeyConstant);
                }
                const allData = {
                    settings: settingsToExport,
                    exportFormatVersion: "WNVT_V1_SettingsBackup_v1.0" // Version specific to this structure
                };
                const jsonData = JSON.stringify(allData, null, 2);
                const timestamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
                this._downloadFileHelper(`wnvt_v1_settings_backup_${timestamp}.json`, jsonData, 'application/json');
                this.logger.notify("All settings exported successfully.", "Export Successful");
            } catch (error) {
                this.logger.error("Error exporting settings:", error);
                this.logger.notify("Unable to export settings. Check the console.", "Export Error", "error");
            }
        }
        _handleImportDataChange(event) {
            const file = event.target.files?.[0];
            if (!file) { this.logger.warn("No file selected for import."); return; }
            this.logger.info(`Importing settings from file: ${file.name}`);
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const fileContent = e.target?.result;
                    if (typeof fileContent !== 'string') throw new Error("Unable to read file contents as a string.");
                    const parsedData = JSON.parse(fileContent);

                    const expectedVersionPrefix = "WNVT_V1_SettingsBackup_"; // Allow importing from any v1 backup
                    // For migration: Check older versions like "WNVT_V2_SettingsBackup_v1.2"
                    const v2Version = "WNVT_V2_SettingsBackup_v1.2";

                    if (!parsedData || typeof parsedData.settings !== 'object') {
                        throw new Error("Invalid backup file format. Missing 'settings' object.");
                    }

                    const fileVersion = parsedData.exportFormatVersion || 'Unknown';

                    if (!fileVersion.startsWith(expectedVersionPrefix) && fileVersion !== v2Version) {
                        this.logger.warn(`Importing data from a potentially incompatible format version: ${fileVersion}.`);
                        const isVersionConfirmed = await this.uiManager.showConfirmDialog(`Backup file format version is '${fileVersion}'. This script expects '${expectedVersionPrefix}x.x' or '${v2Version}'.\n\nContinuing the import may result in unexpected behavior. Are you sure you want to continue?`);
                        if (!isVersionConfirmed) {
                            this.logger.info("User canceled the import due to version mismatch concerns.");
                            if(event.target) event.target.value = null; return;
                        }
                    }
                    const isOverwriteConfirmed = await this.uiManager.showConfirmDialog("This will OVERWRITE ALL current settings. This action CANNOT be undone. Are you sure you want to continue?");
                    if (!isOverwriteConfirmed) {
                        this.logger.info("User canceled the settings import.");
                        if(event.target) event.target.value = null; return;
                    }
                    this.logger.info("User confirmed settings import...");

                    if (this.uiManager && this.modalKey) {
                        this.uiManager.toggleModal(this.modalKey, false);
                    } else if (this.uiManager) {
                        this.uiManager.toggleModal('SETTINGS_MODAL', false);
                    }

                    const skippedKeys = [];

                    for (const key in parsedData.settings) {
                        let value = parsedData.settings[key];
                        let isValid = true;

                        if (Object.values(this.configManager.SETTING_KEYS).includes(key) &&
                            key !== this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {

                            // 3.3.a Validation
                            if (key === this.configManager.SETTING_KEYS.MODEL_CONFIG && typeof value === 'object' && value !== null) {
                                if (typeof value.temperature !== 'number' || value.temperature < 0 || value.temperature > 2) isValid = false;
                                if (!Number.isInteger(value.maxOutputTokens) || value.maxOutputTokens <= 0) isValid = false;
                                if (typeof value.chunkInputCharLimit !== 'number' || value.chunkInputCharLimit < 1000) isValid = false;
                            } else if (key === this.configManager.SETTING_KEYS.API_KEYS_LIST) {
                                if (!Array.isArray(value) || !value.every(v => typeof v === 'string')) isValid = false;
                            } else if (key === this.configManager.SETTING_KEYS.SELECTED_THEME) {
                                if (value !== 'light' && value !== 'dark') isValid = false;
                            } else if (key === this.configManager.SETTING_KEYS.DISPLAY_SETTINGS && typeof value === 'object' && value !== null) {
                                const size = parseInt(value.fontSize, 10);
                                if (isNaN(size) || size < 8 || size > 72) isValid = false;
                            } else if (key === this.configManager.SETTING_KEYS.PROVIDERS_LIST && Array.isArray(value)) {
                                // Filter providers individually instead of dropping the whole key
                                const validProviders = value.filter(p => p && p.id && p.type && p.name);
                                if (validProviders.length !== value.length) {
                                    this.logger.warn(`Filtered out some invalid providers during import.`);
                                }
                                value = validProviders;
                            }

                            if (!isValid) {
                                this.logger.warn(`Skipped setting '${key}' due to invalid value:`, value);
                                skippedKeys.push(key);
                            } else {
                                this.appServices.settingsService.set(key, value);
                            }
                        } else if (key === this.configManager.SETTING_KEYS.RESULT_MODAL_STATE) {
                            // Skip
                        }
                        else {
                            this.logger.warn(`Skipped unknown setting during import: ${key}`);
                        }
                    }
                    await this.appServices.settingsService.saveSettings();
                    this.logger.info("Settings have been imported and saved.");

                    if (skippedKeys.length > 0) {
                        this.logger.notify(`Import successful. Some invalid values were skipped: ${skippedKeys.join(', ')}`, "Import Successful (With Warnings)", "warn");
                    } else {
                        this.logger.notify("Settings imported successfully! The page will automatically reload to apply the changes.", "Import Successful");
                    }

                    setTimeout(() => {
                        window.location.reload();
                    }, 1500);
                } catch (error) {
                    this.logger.error("Error importing settings:", error);
                    this.logger.notify(`Unable to import settings: ${error.message}. Check the console.`, "Import Error", "error");
                } finally { if (event.target) event.target.value = null; } // Reset file input
            };
            reader.onerror = (e) => { this.logger.error("Error reading file:", e); this.logger.notify("Unable to read the backup file.", "File Read Error", "error"); if(event.target) event.target.value = null; };
            reader.readAsText(file);
        }
        async _handleSaveSettings() {
            const settingsService = this.appServices.settingsService;
            const cfg = this.configManager;

            const modelSelectEl = this.getEl('MODEL_SELECT');
            if(modelSelectEl) {
                const selectedModel = modelSelectEl.value;
                settingsService.set(cfg.SETTING_KEYS.SELECTED_MODEL, selectedModel);

                const activeProviderId = settingsService.get(cfg.SETTING_KEYS.ACTIVE_PROVIDER_ID);
                let lastSelectedMap = settingsService.get(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP) || {};
                lastSelectedMap[activeProviderId] = selectedModel;
                settingsService.set(cfg.SETTING_KEYS.LAST_SELECTED_MODEL_MAP, lastSelectedMap);
            }

            const newModelConfig = {};
            const modelConfigDefaults = cfg.getDefaultSetting(cfg.SETTING_KEYS.MODEL_CONFIG);
            this.element.querySelectorAll(`input[data-sub-key]`).forEach(input => {
                const subKey = input.dataset.subKey;
                if (modelConfigDefaults.hasOwnProperty(subKey)) {
                    let value = input.value;
                    if (input.type === 'number') {
                        value = parseFloat(value);
                        const min = parseFloat(input.min); const max = parseFloat(input.max);
                        if (isNaN(value) || (input.min !== undefined && !isNaN(min) && value < min) || (input.max !== undefined && !isNaN(max) && value > max)) {
                            this.logger.warn(`Invalid value for modelConfig.${subKey}: ${input.value}. Using default: ${modelConfigDefaults[subKey]}`);
                            value = modelConfigDefaults[subKey]; input.value = value;
                        }
                    }
                    newModelConfig[subKey] = value;
                }
            });
            settingsService.set(cfg.SETTING_KEYS.MODEL_CONFIG, newModelConfig);

            const themeSelectEl = this.getEl('DISPLAY_THEME_SELECT');
            if (themeSelectEl) settingsService.set(cfg.SETTING_KEYS.SELECTED_THEME, themeSelectEl.value);

            const prefix = this.configManager.getScriptPrefix();
            const displayDefaultsResolved = cfg.getDefaultSetting(cfg.SETTING_KEYS.DISPLAY_SETTINGS);
            const newDisplaySettings = {
                themeId: 'custom',
                bgColor: displayDefaultsResolved.bgColor,
                textColor: displayDefaultsResolved.textColor,
                fontFamily: (this.getEl('DISPLAY_FONT_FAMILY_SELECT') ? this.getEl('DISPLAY_FONT_FAMILY_SELECT').value : displayDefaultsResolved.fontFamily),
                fontSize: (this.getEl('DISPLAY_FONT_SIZE_INPUT') ? this.getEl('DISPLAY_FONT_SIZE_INPUT').value : displayDefaultsResolved.fontSize)
            };

            const activeThemeButton = this.element.querySelector(`.${prefix}theme-palette-item.active`);
            if (activeThemeButton) {
                const themeId = activeThemeButton.dataset.themeId;
                newDisplaySettings.themeId = themeId;
                if (themeId === 'custom') {
                    newDisplaySettings.bgColor = this.getEl('DISPLAY_BG_COLOR_INPUT').value;
                    newDisplaySettings.textColor = this.getEl('DISPLAY_TEXT_COLOR_INPUT').value;
                } else {
                    const theme = cfg.getColorThemes().find(t => t.id === themeId);
                    if (theme) {
                        newDisplaySettings.bgColor = theme.bgColor;
                        newDisplaySettings.textColor = theme.textColor;
                    }
                }
            }

            const fontSizeVal = parseInt(newDisplaySettings.fontSize, 10);
            if (isNaN(fontSizeVal) || fontSizeVal < 8 || fontSizeVal > 72) {
                 this.logger.warn(`Invalid font size: '${newDisplaySettings.fontSize}'. Reset to: '${displayDefaultsResolved.fontSize}'`);
                 newDisplaySettings.fontSize = displayDefaultsResolved.fontSize;
                 if(this.getEl('DISPLAY_FONT_SIZE_INPUT')) this.getEl('DISPLAY_FONT_SIZE_INPUT').value = newDisplaySettings.fontSize;
            } else { newDisplaySettings.fontSize = fontSizeVal.toString(); }
            settingsService.set(cfg.SETTING_KEYS.DISPLAY_SETTINGS, newDisplaySettings);

            const enableSafetyCheckboxEl = this.getEl('SAFETY_SETTINGS_ENABLE_CHECKBOX');
            const newSafetyConfig = { enabled: enableSafetyCheckboxEl ? enableSafetyCheckboxEl.checked : true, settings: {} };
            this.element.querySelectorAll(`select[data-category-api-key]`).forEach(select => {
                newSafetyConfig.settings[select.dataset.categoryApiKey] = select.value;
            });
            settingsService.set(cfg.SETTING_KEYS.SAFETY_CONFIG, newSafetyConfig);
            await settingsService.saveSettings();
            this.logger.notify("Settings saved successfully!", "Success");
            this.uiManager.toggleModal(this.modalKey, false); // Close settings modal
            const resultModalComp = this.uiManager.getComponent('RESULT_MODAL');
            if (resultModalComp && resultModalComp.element) { resultModalComp.applyDisplaySettings(); } // Apply display settings immediately
        }
        show() { // Called by UIManager when this modal is to be shown
            if (!this._isRendered && !this.element) this.render();
            if (!this.element) { this.logger.error("SettingsModal cannot be shown, element not rendered."); return; }
            this._populateSettings(); // Populate with current settings when shown
        }
    }