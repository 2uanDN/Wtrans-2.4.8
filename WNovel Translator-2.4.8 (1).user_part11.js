class UIManager {
    /**
     * @param {AppServices} appServices - Centralized service locator
     * @param {Logger} logger
     * @param {ConfigManager} configManager
     */
    constructor(appServices, logger, configManager) {
        if (!appServices) {
            throw new Error("UIManager requires appServices to be injected during construction.");
        }
        this.appServices = appServices;
        this.logger = logger;
        this.configManager = configManager;
        this.domBuilder = new DOMBuilder(this.logger);
        this.iconManager = new IconManager(); // Must follow Lucide-only principle
        this.shadowHost = null;
        this.shadowRoot = null;
        this.components = {};
        this._isInitialized = false;
        this._activeModalKeydownListener = null;
        this._elementToRestoreFocusTo = null;
        this._systemThemeListener = null;   // NEW: for auto dark mode via prefers-color-scheme

        // Pre-built dialog template (reusable) — avoids DOM recreation every call
        this._dialogTemplate = null;
        this._dialogResolve = null;

        // Pre-built debounced updater for status indicator.
        // Errors and successes bypass this and flush immediately — they are
        // time-sensitive and low-frequency. Info/warn messages during chunked
        // translation can arrive at 10+ Hz; debouncing prevents UI jank.
        this._debouncedStatusUpdate = Utils.debounce((message, level) => {
            const mc = this.getComponent('MAIN_CONTROLS');
            if (mc?.updateStatus) mc.updateStatus(message, level);
        }, 150);
    }

    /* ------------------------------------------------------------------ */
    /*  Public API                                                         */
    /* ------------------------------------------------------------------ */

    isInitialized() {
        return this._isInitialized;
    }

    getComponent(modalKeyOrIdKey) {
        if (this._componentAliasMap && this._componentAliasMap[modalKeyOrIdKey]) {
            return this._componentAliasMap[modalKeyOrIdKey];
        }
        return this.components[modalKeyOrIdKey];
    }

    /**
     * Async initialization to allow asynchronous stylesheet loading (CSP-safe).
     */
    async initialize() {
        if (this._isInitialized) {
            this.logger.warn("UIManager has been initialized.");
            return;
        }
        this.logger.info("Initializing UIManager...");

        const shadowHostId = this.configManager.getUiId('SHADOW_HOST');
        this.shadowHost = document.getElementById(shadowHostId);
        if (!this.shadowHost) {
            this.shadowHost = this.domBuilder.createEl('div', { id: shadowHostId });
            const mountTarget = document.documentElement || document.body;
            mountTarget.appendChild(this.shadowHost);
        } else if (this.shadowHost.parentElement !== document.documentElement && document.documentElement) {
            document.documentElement.appendChild(this.shadowHost);
        }

        // Apply bulletproof inline styles to shadowHost to override host page CSS rules (Cascade & Specificity)
        this.shadowHost.style.cssText = [
            'all: initial !important',
            'position: fixed !important',
            'top: 0 !important',
            'left: 0 !important',
            'width: 0 !important',
            'height: 0 !important',
            'margin: 0 !important',
            'padding: 0 !important',
            'border: none !important',
            'outline: none !important',
            'background: transparent !important',
            'z-index: 2147483647 !important',
            'pointer-events: none !important',
            'display: block !important',
            'transform: none !important',
            'filter: none !important',
            'perspective: none !important',
            'contain: none !important',
            'will-change: auto !important',
            'overflow: visible !important'
        ].join('; ');
        this.shadowHost.setAttribute('translate', 'no');
        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });

        // Prevent host page from intercepting keyboard events inside Shadow DOM
        this.shadowRoot.addEventListener('keydown', e => e.stopPropagation());
        this.shadowRoot.addEventListener('keyup', e => e.stopPropagation());
        this.shadowRoot.addEventListener('keypress', e => e.stopPropagation());

        // Load base styles (async, uses Constructable Stylesheets or fallback)
        await this._loadBaseStyles();

        // Theme resolution: user setting > system preference
        const userTheme = this.appServices.settingsService.get(
            this.configManager.SETTING_KEYS.SELECTED_THEME
        );
        if (!userTheme) {
            this._applySystemTheme();
        } else {
            this.applyTheme(userTheme);
        }

        // Instantiate components
        this.components['MAIN_CONTROLS'] = new MainControlsComponent(this, this.configManager);
        this.shadowRoot.appendChild(this.components['MAIN_CONTROLS'].render());

        this.components['RESULT_MODAL'] = new ResultModalComponent(this, this.configManager);
        this.shadowRoot.appendChild(this.components['RESULT_MODAL'].render());
        this.toggleModal('RESULT_MODAL', false); // Start hidden

        this.components['SETTINGS_MODAL'] = new SettingsModalComponent(this, this.configManager);
        this.shadowRoot.appendChild(this.components['SETTINGS_MODAL'].render());
        this.toggleModal('SETTINGS_MODAL', false);

        this.components['HISTORY_MODAL'] = new HistoryModalComponent(this, this.configManager);
        this.shadowRoot.appendChild(this.components['HISTORY_MODAL'].render());
        this.toggleModal('HISTORY_MODAL', false);

        // Build component alias map for flexible lookup
        this._componentAliasMap = {};
        for (const key of Object.keys(this.components)) {
            this._componentAliasMap[key] = this.components[key];
            const baseId = this.configManager.UI_IDS[key];
            if (baseId) {
                this._componentAliasMap[baseId] = this.components[key];
            }
        }

        // Pre-build reusable dialog template
        this._buildDialogTemplate();

        // Selection change listener (debounced, optimized for main thread)
        const handleSelectionEnd = Utils.debounce(() => {
            const mc = this.getComponent('MAIN_CONTROLS');
            if (mc?.updateSelectionButtonState) {
                mc.updateSelectionButtonState();
            }
        }, 150);

        document.addEventListener('pointerup', handleSelectionEnd);
        document.addEventListener('keyup', (e) => {
            if (e.shiftKey || ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'Home', 'End'].includes(e.key)) {
                handleSelectionEnd();
            }
        });

        this.logger.info("UIManager initialized.");
        this._isInitialized = true;
    }

    /**
     * Apply light/dark theme on the host element.
     * @param {string} themeName - 'dark' or any other string (defaults to light)
     */
    applyTheme(themeName) {
        if (!this.shadowHost) return;
        this.logger.info(`Applying theme: ${themeName}`);
        const theme = themeName === 'dark' ? 'dark' : 'light';
        this.shadowHost.classList.toggle('dark-theme', theme === 'dark');
    }

    /* ------------------------------------------------------------------ */
    /*  Modal Management                                                   */
    /* ------------------------------------------------------------------ */

    /**
     * Toggle visibility of a modal, handling focus trap, ARIA, overlay click.
     * @param {string} modalKeyOrIdKey - Component key or element ID
     * @param {boolean} [forceState] - Explicitly show/hide
     */
    toggleModal(modalKeyOrIdKey, forceState) {
        const component = this.getComponent(modalKeyOrIdKey);
        if (!component || !component.element) {
            if (modalKeyOrIdKey === 'RESULT_MODAL' || modalKeyOrIdKey === 'SETTINGS_MODAL') {
                this.logger.warn(`Modal component for key '${modalKeyOrIdKey}' not found or not rendered.`);
            }
            return;
        }

        const modalId = component.id;
        const modalEl = component.element;

        // Cache modal content element for focus trap
        if (!component.modalContentEl) {
            component.modalContentEl = modalEl.querySelector(`.${this.configManager.getScriptPrefix()}modal-content`);
        }
        const modalContentEl = component.modalContentEl;
        if (!modalContentEl) {
            this.logger.error(`Modal content for ${modalId} not found.`);
            return;
        }

        const isCurrentlyVisible = modalEl.style.display === 'flex';
        const shouldShow = typeof forceState === 'boolean' ? forceState : !isCurrentlyVisible;

        if (shouldShow) {
            // Hide other visible modals except the result modal (can coexist minimized)
            Object.values(this.components).forEach(comp => {
                if (comp && comp.element && comp.id !== modalId && comp.modalKey &&
                    comp.element.style.display === 'flex' &&
                    comp.id !== this.configManager.getUiId('RESULT_MODAL')) {
                    this.toggleModal(comp.modalKey, false);
                }
            });

            this._elementToRestoreFocusTo = this.shadowRoot.activeElement || document.activeElement;
            modalEl.style.display = 'flex';

            if (typeof component.onShow === 'function') {
                component.onShow();
            } else if (typeof component.show === 'function') {
                component.show();
            }

            // Attach focus trap and Escape listener
            if (this._activeModalKeydownListener && modalEl) {
                modalEl.removeEventListener('keydown', this._activeModalKeydownListener);
            }

            this._activeModalKeydownListener = (event) => {
                if (event.key === 'Tab') {
                    const focusableElements = this._getFocusableElements(modalContentEl);
                    const firstFocusable = focusableElements[0];
                    const lastFocusable = focusableElements[focusableElements.length - 1];

                    if (!firstFocusable && !lastFocusable) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }

                    if (event.shiftKey) {
                        if (this.shadowRoot.activeElement === firstFocusable || focusableElements.length === 1) {
                            lastFocusable?.focus();
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    } else {
                        if (this.shadowRoot.activeElement === lastFocusable || focusableElements.length === 1) {
                            firstFocusable?.focus();
                            event.preventDefault();
                            event.stopPropagation();
                        }
                    }
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleModal(modalKeyOrIdKey, false);
                }
            };
            modalEl.addEventListener('keydown', this._activeModalKeydownListener);

            // Close when clicking overlay (but not when clicking modal content)
            const overlayClickHandler = (e) => {
                if (e.target === modalEl) {
                    this.toggleModal(modalKeyOrIdKey, false);
                }
            };
            modalEl.addEventListener('click', overlayClickHandler, { once: true }); // once to avoid buildup
            component._overlayClickHandler = overlayClickHandler; // store reference to clean up if needed
        } else {
            // Hide
            modalEl.style.display = 'none';

            if (this._activeModalKeydownListener && modalEl) {
                modalEl.removeEventListener('keydown', this._activeModalKeydownListener);
                this._activeModalKeydownListener = null;
            }
            if (component._overlayClickHandler) {
                modalEl.removeEventListener('click', component._overlayClickHandler);
                component._overlayClickHandler = null;
            }

            const isResultMinimized = (component.modalKey === 'RESULT_MODAL' && component.isMinimized);

            if (typeof component.onClose === 'function' && !isResultMinimized) {
                component.onClose();
            }

            if (!isResultMinimized) {
                if (this._elementToRestoreFocusTo && typeof this._elementToRestoreFocusTo.focus === 'function') {
                    if (document.body.contains(this._elementToRestoreFocusTo) || this.shadowRoot.contains(this._elementToRestoreFocusTo)) {
                        this._elementToRestoreFocusTo.focus();
                    } else {
                        this.logger.debug("Element to restore focus to is no longer in the DOM.");
                    }
                }
                this._elementToRestoreFocusTo = null;
            }
        }

        const action = shouldShow ? 'show' : ((component.modalKey === 'RESULT_MODAL' && component.isMinimized) ? 'minimize' : 'close');
        this.logger.info(`Modal "${modalId}" ${action}.`);
    }

    isModalVisible(modalId) {
        const modalComponent = this.getComponent(modalId);
        const modalEl = modalComponent ? modalComponent.element : this.shadowRoot.getElementById(modalId);
        return modalEl && modalEl.style.display === 'flex';
    }

    /* ------------------------------------------------------------------ */
    /*  Result Modal Convenience Methods                                   */
    /* ------------------------------------------------------------------ */

    showResultModal(text, title, isError = false, isPartial = false) {
        const resultModal = this.getComponent('RESULT_MODAL');
        if (resultModal) {
            resultModal.show(text, title, isError, isPartial);
        } else {
            this.logger.error("Result modal component not found in UIManager when trying to show.");
        }
    }

    updateResultModalTitle(newTitle) {
        const resultModal = this.getComponent('RESULT_MODAL');
        if (resultModal) resultModal.updateTitle(newTitle);
    }

    clearResultModal() {
        const resultModal = this.getComponent('RESULT_MODAL');
        if (resultModal) {
            resultModal.clearContent();
        } else {
            this.logger.warn("Result modal component not found to clear.");
        }
    }

    showRestoreResultIcon(show, titleSnippet = "Result minimized") {
        const mainControls = this.getComponent('MAIN_CONTROLS');
        if (mainControls && typeof mainControls.showRestoreIcon === 'function') {
            mainControls.showRestoreIcon(show, titleSnippet);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  Status Indicator & Translation State                               */
    /* ------------------------------------------------------------------ */

    /**
     * Update status indicator in main controls.
     * Errors and successes bypass debounce for immediate feedback.
     */
    updateStatusIndicator(message, level = 'info') {
        if (level === 'error' || level === 'success') {
            const mc = this.getComponent('MAIN_CONTROLS');
            if (mc?.updateStatus) mc.updateStatus(message, level);
            this._debouncedStatusUpdate?.cancel();
            return;
        }
        this._debouncedStatusUpdate?.(message, level);
    }

    setTranslatingState(isTranslating, message = "") {
        const mainControls = this.getComponent('MAIN_CONTROLS');
        if (mainControls) mainControls.setTranslatingState(isTranslating, message);

        const resultModal = this.getComponent('RESULT_MODAL');
        if (resultModal) resultModal.updateButtonStates();
    }

    /* ------------------------------------------------------------------ */
    /*  Custom Dialogs (Confirm / Prompt) – Award-Caliber Rewrite          */
    /* ------------------------------------------------------------------ */

    /**
     * Build the reusable dialog template once.
     * All styles are class-based — no inline styles, no CSP violation.
     * Icons from Lucide only.
     */
    _buildDialogTemplate() {
        const prefix = this.configManager.getScriptPrefix();

        // Overlay
        const overlay = document.createElement('div');
        overlay.className = `${prefix}dialog-overlay`;
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.style.display = 'none'; // Hidden by default

        // Dialog box
        const dialogBox = document.createElement('div');
        dialogBox.className = `${prefix}dialog-box`;

        // Icon container (Lucide icon will be inserted dynamically)
        const iconContainer = document.createElement('div');
        iconContainer.className = `${prefix}dialog-icon`;
        dialogBox.appendChild(iconContainer);

        // Message
        const messageEl = document.createElement('div');
        messageEl.className = `${prefix}dialog-message`;
        dialogBox.appendChild(messageEl);

        // Input (for prompt dialogs)
        const inputEl = document.createElement('input');
        inputEl.type = 'text';
        inputEl.className = `${prefix}dialog-input`;
        inputEl.style.display = 'none'; // Hidden by default, shown for prompt
        dialogBox.appendChild(inputEl);

        // Button container
        const btnContainer = document.createElement('div');
        btnContainer.className = `${prefix}dialog-btn-container`;

        const cancelBtn = document.createElement('button');
        cancelBtn.className = `${prefix}button ${prefix}dialog-btn-cancel`;
        cancelBtn.textContent = 'Cancel';
        btnContainer.appendChild(cancelBtn);

        const confirmBtn = document.createElement('button');
        confirmBtn.className = `${prefix}button ${prefix}button-primary ${prefix}dialog-btn-confirm`;
        confirmBtn.textContent = 'Confirm';
        btnContainer.appendChild(confirmBtn);

        dialogBox.appendChild(btnContainer);
        overlay.appendChild(dialogBox);

        // Store references for later use
        this._dialogTemplate = {
            overlay,
            iconContainer,
            messageEl,
            inputEl,
            cancelBtn,
            confirmBtn,
            btnContainer
        };

        // Append to shadow root but keep hidden
        this.shadowRoot.appendChild(overlay);
    }

    /**
     * Show a confirmation dialog.
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    async showConfirmDialog(message) {
        return new Promise(resolve => {
            this._showCustomDialog('confirm', message, null, () => resolve(true), () => resolve(false));
        });
    }

    /**
     * Show a prompt dialog.
     * @param {string} message
     * @param {string} defaultValue
     * @returns {Promise<string|null>}
     */
    async showPromptDialog(message, defaultValue = "") {
        return new Promise(resolve => {
            this._showCustomDialog('prompt', message, defaultValue, (val) => resolve(val), () => resolve(null));
        });
    }

    /**
     * Internal method to show reusable dialog with icon, focus trap, ARIA.
     * @param {'confirm'|'prompt'} type
     * @param {string} message
     * @param {string|null} defaultValue
     * @param {Function} onConfirm
     * @param {Function} onCancel
     */
    _showCustomDialog(type, message, defaultValue, onConfirm, onCancel) {
        const t = this._dialogTemplate;
        if (!t) {
            this.logger.error("Dialog template not built.");
            onCancel();
            return;
        }

        const prefix = this.configManager.getScriptPrefix();

        // Update content
        t.messageEl.textContent = message;

        // Set icon: AlertTriangle for confirm, MessageSquare for prompt
        let iconName = 'alert-triangle';
        if (type === 'prompt') iconName = 'message-square';
        t.iconContainer.innerHTML = this.iconManager.getIcon(iconName, { className: `${prefix}dialog-icon-svg` });

        // Handle input visibility
        if (type === 'prompt') {
            t.inputEl.style.display = 'block';
            t.inputEl.value = defaultValue || '';
            t.inputEl.setAttribute('aria-label', 'Input value');
        } else {
            t.inputEl.style.display = 'none';
        }

        // Reset dialog role attribute for accessibility
        t.overlay.setAttribute('aria-label', type === 'confirm' ? 'Confirmation dialog' : 'Prompt dialog');

        // Show overlay
        t.overlay.style.display = 'flex';

        // Focus management: focus confirm button for confirm, input for prompt
        if (type === 'prompt') {
            setTimeout(() => t.inputEl.focus(), 10);
        } else {
            setTimeout(() => t.confirmBtn.focus(), 10);
        }

        // Focus trap function
        const focusableSelector = [
            'a[href]:not([disabled])', 'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])', 'textarea:not([disabled])',
            '[tabindex]:not([disabled]):not([tabindex="-1"])'
        ].join(',');

        const trapFocus = (e) => {
            if (e.key !== 'Tab') return;
            const focusable = Array.from(t.overlay.querySelectorAll(focusableSelector)).filter(el => el.offsetParent !== null);
            if (focusable.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                last.focus();
                e.preventDefault();
            } else if (!e.shiftKey && document.activeElement === last) {
                first.focus();
                e.preventDefault();
            }
        };

        // Keydown handler for Enter / Escape
        const handleKeydown = (e) => {
            if (e.key === 'Escape') {
                cleanup();
                onCancel();
            } else if (e.key === 'Enter' && type === 'prompt' && document.activeElement === t.inputEl) {
                e.preventDefault();
                cleanup();
                onConfirm(t.inputEl.value);
            } else if (e.key === 'Enter' && type === 'confirm') {
                e.preventDefault();
                cleanup();
                onConfirm();
            }
            trapFocus(e);
        };

        t.overlay.addEventListener('keydown', handleKeydown);

        // Click overlay background to cancel (but not dialog box)
        const clickOutside = (e) => {
            if (e.target === t.overlay) {
                cleanup();
                onCancel();
            }
        };
        t.overlay.addEventListener('click', clickOutside);

        // Button handlers
        const onCancelClick = () => {
            cleanup();
            onCancel();
        };
        const onConfirmClick = () => {
            cleanup();
            if (type === 'prompt') {
                onConfirm(t.inputEl.value);
            } else {
                onConfirm();
            }
        };

        t.cancelBtn.addEventListener('click', onCancelClick);
        t.confirmBtn.addEventListener('click', onConfirmClick);

        // Cleanup all listeners and hide dialog
        const cleanup = () => {
            t.overlay.removeEventListener('keydown', handleKeydown);
            t.overlay.removeEventListener('click', clickOutside);
            t.cancelBtn.removeEventListener('click', onCancelClick);
            t.confirmBtn.removeEventListener('click', onConfirmClick);
            t.overlay.style.display = 'none';
        };
    }

    /* ------------------------------------------------------------------ */
    /*  Utility                                                            */
    /* ------------------------------------------------------------------ */

    /**
     * Retrieve focusable elements inside a container, filtering invisible/disabled ones.
     * Used by modal and dialog focus traps.
     */
    _getFocusableElements(parentElement) {
        if (!parentElement) return [];
        const selectors = [
            'a[href]:not([disabled])', 'button:not([disabled])',
            'input:not([disabled]):not([type="hidden"])', 'textarea:not([disabled])', 'select:not([disabled])',
            'details:not([disabled]) summary:first-of-type', '[tabindex]:not([disabled]):not([tabindex="-1"])'
        ];

        const elements = Array.from(parentElement.querySelectorAll(selectors.join(',')));

        return elements.filter(el => {
            return el.style.display !== 'none' &&
                   el.style.visibility !== 'hidden' &&
                   el.offsetParent !== null &&
                   !el.hasAttribute('disabled');
        });
    }

    /* ------------------------------------------------------------------ */
    /*  Base Styles (CSP Compliant, Award-Caliber)                         */
    /* ------------------------------------------------------------------ */

    /**
     * Load all base styles into the shadow root.
     * Uses Constructable Stylesheets when available (async replace for perf),
     * falls back to traditional <style> tag. No external fonts, no inline styles.
     */
    async _loadBaseStyles() {
        try {
            // KaTeX CSS (if provided via userscript resources)
            if (typeof GM_getResourceText === 'function' && GM_getResourceText('katex_css')) {
                const katexCss = GM_getResourceText('katex_css');
                const katexStyleEl = this.domBuilder.createEl('style', {
                    id: 'katex-styles',
                    textContent: katexCss
                });
                this.shadowRoot.appendChild(katexStyleEl);
                this.logger.info("KaTeX CSS loaded into Shadow DOM.");
            } else {
                this.logger.warn("KaTeX CSS resource not found or GM_getResourceText not available.");
            }
        } catch (e) {
            this.logger.error("Failed to load KaTeX CSS.", e);
        }

        const prefix = this.configManager.getScriptPrefix();

        // Complete CSS, revised to meet all principles.
        // - No @import, uses system font stack.
        // - Semantic CSS variables, no hardcoded colors.
        // - Accessibility: ARIA selectors, reduced motion, focus consistency.
        // - Mobile-first with safe-area insets.
        // - Touch targets >= 44px, font pairing with display serif, modular scale.
        const cssContent = `
            :host {
                all: initial !important;
                display: block !important;
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 0 !important;
                height: 0 !important;
                z-index: 2147483647 !important;
                isolation: isolate !important;
                pointer-events: none !important;

                /* Typography & Inherited text properties reset to neutralize host document leaks */
                font-family: var(--wnvt-font-sans) !important;
                font-size: 16px !important;
                font-style: normal !important;
                font-variant: normal !important;
                font-weight: 400 !important;
                line-height: 1.5 !important;
                text-align: left !important;
                text-align-last: auto !important;
                letter-spacing: normal !important;
                word-spacing: normal !important;
                text-transform: none !important;
                text-indent: 0 !important;
                text-shadow: none !important;
                text-decoration: none !important;
                direction: ltr !important;
                writing-mode: horizontal-tb !important;
                white-space: normal !important;
                word-break: normal !important;
                overflow-wrap: break-word !important;
                hyphens: manual !important;
                tab-size: 4 !important;
                color: var(--wnvt-text-primary) !important;
                cursor: auto !important;
                -webkit-font-smoothing: antialiased !important;
                -moz-osx-font-smoothing: grayscale !important;
                -webkit-text-size-adjust: 100% !important;
                text-size-adjust: 100% !important;

                /* ---- Light Theme (Zinc & Indigo) ---- */
                --wnvt-surface-base: #FAFAFA;
                --wnvt-surface-raised: #F4F4F5;
                --wnvt-surface-overlay: rgba(250, 250, 250, 0.85);

                --wnvt-bg-primary: var(--wnvt-surface-base);
                --wnvt-bg-secondary: var(--wnvt-surface-raised);
                --wnvt-bg-tertiary: #E4E4E7;
                --wnvt-bg-overlay: rgba(9, 9, 11, 0.45);

                --wnvt-text-primary: #18181B;
                --wnvt-text-secondary: #71717A;
                --wnvt-text-on-accent: #FFFFFF;

                --wnvt-accent-primary: #6366F1;
                --wnvt-accent-primary-hover: #4F46E5;
                --wnvt-accent-danger: #DC2626;
                --wnvt-accent-danger-hover: #B91C1C;
                --wnvt-accent-success: #10B981;
                --wnvt-accent-success-hover: #059669;
                --wnvt-accent-warn: #D97706;

                --wnvt-border-primary: #E4E4E7;
                --wnvt-border-secondary: #D4D4D8;
                --wnvt-border-subtle: rgba(24, 24, 27, 0.08);

                --wnvt-focus-ring: rgba(99, 102, 241, 0.25);
                --wnvt-box-shadow: 0 10px 25px -5px rgba(24, 24, 27, 0.08), 0 8px 10px -6px rgba(24, 24, 27, 0.04);
                --wnvt-box-shadow-sm: 0 1px 2px 0 rgba(24, 24, 27, 0.05);
                --wnvt-elevation-1: 0 1px 3px rgba(24, 24, 27, 0.08);
                --wnvt-elevation-2: 0 4px 12px -2px rgba(24, 24, 27, 0.1);
                --wnvt-elevation-3: 0 12px 24px -4px rgba(24, 24, 27, 0.14);

                /* Semantic color tokens for button visual hierarchy */
                --wnvt-danger-subtle: rgba(220, 38, 38, 0.22);
                --wnvt-danger-bg: rgba(220, 38, 38, 0.08);
                --wnvt-danger-bg-hover: rgba(220, 38, 38, 0.14);
                --wnvt-danger-bg-active: rgba(220, 38, 38, 0.22);
                --wnvt-danger-text: #DC2626;
                --wnvt-danger-text-hover: #B91C1C;

                --wnvt-primary-subtle: rgba(99, 102, 241, 0.25);
                --wnvt-primary-bg: rgba(99, 102, 241, 0.08);
                --wnvt-primary-bg-hover: rgba(99, 102, 241, 0.14);
                --wnvt-primary-bg-active: rgba(99, 102, 241, 0.22);

                --wnvt-success-subtle: rgba(16, 185, 129, 0.25);
                --wnvt-success-bg: rgba(16, 185, 129, 0.08);
                --wnvt-success-bg-hover: rgba(16, 185, 129, 0.14);
                --wnvt-knob-bg: #FFFFFF;
                --wnvt-knob-shadow: 0 1px 3px rgba(24, 24, 27, 0.2);

                /* Typography — system font stack, base 16px, modular scale */
                font-family: var(--wnvt-font-sans);
                font-size: 16px;
                line-height: 1.5;
                color: var(--wnvt-text-primary);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;

                --wnvt-border-radius: 8px;

                /* Font families: sans for body, display for headings */
                --wnvt-font-sans: system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                --wnvt-font-display: Georgia, 'Times New Roman', serif;

                /* Modular scale (fixed px values immune to host rem changes) */
                --wnvt-text-xs: 12px;
                --wnvt-text-sm: 14px;
                --wnvt-text-base: 16px;
                --wnvt-text-lg: 20px;
                --wnvt-text-xl: 24px;
                --wnvt-text-2xl: 32px;
                --wnvt-text-3xl: 40px;
                --wnvt-text-4xl: 48px;
                --wnvt-text-5xl: 64px;
            }

            :host(.dark-theme) {
                /* ---- Dark Theme (Zinc & Indigo) ---- */
                --wnvt-surface-base: #09090B;
                --wnvt-surface-raised: #18181B;
                --wnvt-surface-overlay: rgba(9, 9, 11, 0.85);

                --wnvt-bg-primary: var(--wnvt-surface-base);
                --wnvt-bg-secondary: var(--wnvt-surface-raised);
                --wnvt-bg-tertiary: #27272A;
                --wnvt-bg-overlay: rgba(0, 0, 0, 0.75);

                --wnvt-text-primary: #FAFAFA;
                --wnvt-text-secondary: #A1A1AA;

                --wnvt-accent-primary: #818CF8;
                --wnvt-accent-primary-hover: #A5B4FC;
                --wnvt-accent-danger: #F87171;
                --wnvt-accent-danger-hover: #FCA5A5;
                --wnvt-accent-success: #34D399;
                --wnvt-accent-success-hover: #6EE7B7;
                --wnvt-accent-warn: #FBBF24;

                --wnvt-border-primary: #27272A;
                --wnvt-border-secondary: #3F3F46;
                --wnvt-border-subtle: rgba(255, 255, 255, 0.08);

                --wnvt-focus-ring: rgba(129, 140, 248, 0.35);
                --wnvt-box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.8);
                --wnvt-box-shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.5);
                --wnvt-elevation-1: 0 2px 4px rgba(0, 0, 0, 0.5);
                --wnvt-elevation-2: 0 8px 16px -4px rgba(0, 0, 0, 0.6);
                --wnvt-elevation-3: 0 20px 32px -8px rgba(0, 0, 0, 0.7);

                /* Semantic color tokens for button visual hierarchy */
                --wnvt-danger-subtle: rgba(248, 113, 113, 0.30);
                --wnvt-danger-bg: rgba(248, 113, 113, 0.12);
                --wnvt-danger-bg-hover: rgba(248, 113, 113, 0.20);
                --wnvt-danger-bg-active: rgba(248, 113, 113, 0.28);
                --wnvt-danger-text: #F87171;
                --wnvt-danger-text-hover: #FCA5A5;

                --wnvt-primary-subtle: rgba(129, 140, 248, 0.30);
                --wnvt-primary-bg: rgba(129, 140, 248, 0.12);
                --wnvt-primary-bg-hover: rgba(129, 140, 248, 0.20);
                --wnvt-primary-bg-active: rgba(129, 140, 248, 0.28);

                --wnvt-success-subtle: rgba(52, 211, 153, 0.30);
                --wnvt-success-bg: rgba(52, 211, 153, 0.12);
                --wnvt-success-bg-hover: rgba(52, 211, 153, 0.20);
                --wnvt-knob-bg: #27272A;
                --wnvt-knob-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
            }

            /* Universal CSS Reset inside Shadow DOM to shield all child elements */
            *, *::before, *::after {
                box-sizing: border-box;
                border-color: var(--wnvt-border-primary);
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                -webkit-text-size-adjust: 100%;
                text-size-adjust: 100%;
            }

            /* Comprehensive CSS Reset for HTML tags inside Shadow DOM to prevent host body inheritance */
            h1, h2, h3, h4, h5, h6,
            p, span, label,
            ul, ol, li,
            dl, dt, dd,
            blockquote, figure, fieldset, legend,
            hr {
                margin: 0;
                padding: 0;
                font-family: inherit;
                font-size: inherit;
                font-weight: inherit;
                line-height: inherit;
                color: inherit;
                text-align: left;
                text-align-last: auto;
                letter-spacing: normal;
                word-spacing: normal;
                text-transform: none;
                text-indent: 0;
            }

            ul, ol {
                list-style: none;
            }

            /* Normalize form controls and interactive elements */
            button, input, optgroup, select, textarea {
                margin: 0;
                font-family: inherit;
                font-size: inherit;
                line-height: inherit;
                color: inherit;
                letter-spacing: normal;
                word-spacing: normal;
                text-transform: none;
                text-indent: 0;
            }

            button, [type="button"], [type="reset"], [type="submit"] {
                -webkit-appearance: button;
                appearance: button;
                background-color: transparent;
                background-image: none;
            }

            img, svg {
                vertical-align: middle;
            }

            /* Firefox custom scrollbar */
            * {
                scrollbar-width: thin;
                scrollbar-color: var(--wnvt-border-secondary) transparent;
            }

            /* Webkit scrollbars */
            *::-webkit-scrollbar {
                width: 6px;
                height: 6px;
            }
            *::-webkit-scrollbar-track {
                background: transparent;
            }
            *::-webkit-scrollbar-thumb {
                background: var(--wnvt-border-secondary);
                border-radius: 999px;
                transition: background 0.2s ease;
            }
            *::-webkit-scrollbar-thumb:hover {
                background: var(--wnvt-accent-primary);
            }

            /* Buttons — Unified Visual Hierarchy & Motion */
            .${prefix}button {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                font-family: inherit;
                font-weight: 500;
                font-size: var(--wnvt-text-sm, 14px);
                padding: 0 14px;
                margin: 0;
                border: 1px solid var(--wnvt-border-secondary);
                border-radius: var(--wnvt-border-radius);
                cursor: pointer;
                height: 34px;
                min-height: 34px;
                white-space: nowrap;
                background-color: var(--wnvt-bg-secondary);
                color: var(--wnvt-text-primary);
                transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, transform 0.1s ease;
                will-change: transform, box-shadow;
                outline: none;
                box-sizing: border-box;
                user-select: none;
                pointer-events: auto;
            }
            .${prefix}button svg {
                flex-shrink: 0;
                pointer-events: none;
            }
            .${prefix}button:focus-visible {
                outline: 2px solid var(--wnvt-accent-primary);
                outline-offset: 2px;
            }
            .${prefix}button:hover:not(:disabled) {
                background-color: var(--wnvt-bg-tertiary);
                border-color: var(--wnvt-border-secondary);
                box-shadow: var(--wnvt-box-shadow-sm);
                transform: translateY(-1px);
            }
            .${prefix}button:active:not(:disabled) {
                transform: translateY(0) scale(0.98);
                box-shadow: none;
            }

            /* Comprehensive neutralization of :disabled state:
               Eliminates "sunken grey body with floating colored border" defect */
            .${prefix}button:disabled,
            .${prefix}button[disabled],
            .${prefix}button-primary:disabled,
            .${prefix}button-danger:disabled,
            .${prefix}button-danger-outline:disabled,
            .${prefix}button-danger-solid:disabled,
            .${prefix}button-success:disabled {
                background-color: var(--wnvt-bg-secondary) !important;
                color: var(--wnvt-text-secondary) !important;
                border-color: var(--wnvt-border-primary) !important;
                box-shadow: none !important;
                cursor: not-allowed !important;
                opacity: 0.45 !important;
                pointer-events: none !important;
                transform: none !important;
            }

            /* Primary Button — High visual hierarchy call-to-action */
            .${prefix}button-primary {
                background-color: var(--wnvt-accent-primary);
                color: var(--wnvt-text-on-accent);
                border: 1px solid var(--wnvt-accent-primary);
                font-weight: 550;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(99, 102, 241, 0.25);
            }
            .${prefix}button-primary:hover:not(:disabled) {
                background-color: var(--wnvt-accent-primary-hover);
                border-color: var(--wnvt-accent-primary-hover);
                box-shadow: 0 4px 10px -2px rgba(99, 102, 241, 0.35);
                transform: translateY(-1px);
            }
            .${prefix}button-primary:active:not(:disabled) {
                transform: translateY(0) scale(0.98);
                box-shadow: 0 1px 2px 0 rgba(99, 102, 241, 0.2);
            }
            .${prefix}button-primary:focus-visible {
                outline: 2px solid var(--wnvt-accent-primary);
                outline-offset: 2px;
            }

            /* Soft Danger Button — In-form destructive actions (Delete Selected Key, Delete Selected) */
            .${prefix}button-danger {
                background-color: var(--wnvt-danger-bg);
                color: var(--wnvt-danger-text);
                border: 1px solid var(--wnvt-danger-subtle);
                font-weight: 500;
                box-shadow: none;
            }
            .${prefix}button-danger:hover:not(:disabled) {
                background-color: var(--wnvt-danger-bg-hover);
                color: var(--wnvt-danger-text-hover);
                border-color: var(--wnvt-accent-danger);
                box-shadow: 0 2px 6px -1px rgba(220, 38, 38, 0.15);
                transform: translateY(-1px);
            }
            .${prefix}button-danger:active:not(:disabled) {
                background-color: var(--wnvt-danger-bg-active);
                transform: translateY(0) scale(0.98);
                box-shadow: none;
            }
            .${prefix}button-danger:focus-visible {
                outline: 2px solid var(--wnvt-accent-danger);
                outline-offset: 2px;
            }

            /* Solid Danger Button — High-alert destructive confirmation for critical dialogs */
            .${prefix}button-danger-solid {
                background-color: var(--wnvt-accent-danger);
                color: var(--wnvt-text-on-accent);
                border: 1px solid var(--wnvt-accent-danger);
                font-weight: 550;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(220, 38, 38, 0.25);
            }
            .${prefix}button-danger-solid:hover:not(:disabled) {
                background-color: var(--wnvt-accent-danger-hover);
                border-color: var(--wnvt-accent-danger-hover);
                box-shadow: 0 4px 10px -2px rgba(220, 38, 38, 0.35);
                transform: translateY(-1px);
            }
            .${prefix}button-danger-solid:active:not(:disabled) {
                transform: translateY(0) scale(0.98);
                box-shadow: 0 1px 2px 0 rgba(220, 38, 38, 0.2);
            }
            .${prefix}button-danger-solid:focus-visible {
                outline: 2px solid var(--wnvt-accent-danger);
                outline-offset: 2px;
            }

            /* Outline Danger Button — Subtle secondary destructive or inline retry action */
            .${prefix}button-danger-outline {
                background-color: transparent;
                color: var(--wnvt-danger-text);
                border: 1px solid var(--wnvt-danger-subtle);
                font-weight: 500;
            }
            .${prefix}button-danger-outline:hover:not(:disabled) {
                background-color: var(--wnvt-danger-bg);
                color: var(--wnvt-danger-text-hover);
                border-color: var(--wnvt-accent-danger);
                transform: translateY(-1px);
                box-shadow: var(--wnvt-box-shadow-sm);
            }
            .${prefix}button-danger-outline:active:not(:disabled) {
                background-color: var(--wnvt-danger-bg-hover);
                transform: translateY(0) scale(0.98);
            }
            .${prefix}button-danger-outline:focus-visible {
                outline: 2px solid var(--wnvt-accent-danger);
                outline-offset: 2px;
            }

            /* Small button modifier */
            .${prefix}button-small {
                font-size: 13px;
                padding: 0 11px;
                height: 30px;
                min-height: 30px;
                border-radius: calc(var(--wnvt-border-radius) - 2px);
            }

            /* Success Button */
            .${prefix}button-success {
                background-color: var(--wnvt-accent-success);
                color: var(--wnvt-text-on-accent);
                border: 1px solid var(--wnvt-accent-success);
                font-weight: 550;
                box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(16, 185, 129, 0.25);
            }
            .${prefix}button-success:hover:not(:disabled) {
                background-color: var(--wnvt-accent-success-hover);
                border-color: var(--wnvt-accent-success-hover);
                box-shadow: 0 4px 10px -2px rgba(16, 185, 129, 0.35);
                transform: translateY(-1px);
            }
            .${prefix}button-success:active:not(:disabled) {
                transform: translateY(0) scale(0.98);
                box-shadow: 0 1px 2px 0 rgba(16, 185, 129, 0.2);
            }
            .${prefix}button-success:focus-visible {
                outline: 2px solid var(--wnvt-accent-success);
                outline-offset: 2px;
            }

            .${prefix}icon-button {
                width: 34px;
                height: 34px;
                min-height: 34px;
                padding: 0;
                border-radius: var(--wnvt-border-radius);
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .${prefix}icon-button svg {
                width: 18px;
                height: 18px;
            }

            .${prefix}button-active {
                background-color: var(--wnvt-bg-tertiary);
                border-color: var(--wnvt-border-secondary);
                box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.06);
            }

            /* Inputs, Selects, Textareas */
            .${prefix}input,
            .${prefix}select {
                font-family: inherit;
                font-size: var(--wnvt-text-sm, 14px);
                width: 100%;
                height: 34px;
                min-height: 34px;
                max-height: 38px;
                padding: 6px 12px;
                margin: 4px 0;
                border: 1px solid var(--wnvt-border-primary);
                border-radius: var(--wnvt-border-radius);
                background-color: var(--wnvt-bg-primary);
                color: var(--wnvt-text-primary);
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
                appearance: none;
                -webkit-appearance: none;
                -moz-appearance: none;
                outline: none;
                box-sizing: border-box;
                pointer-events: auto;
                flex-shrink: 0;
            }
            .${prefix}select {
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2371717A'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
                background-repeat: no-repeat;
                background-position: right 14px center;
                background-size: 16px;
                padding-right: 40px;
                cursor: pointer;
            }
            :host(.dark-theme) .${prefix}select {
                background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23A1A1AA'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E");
            }
            .${prefix}input:focus-visible,
            .${prefix}select:focus-visible,
            .${prefix}textarea:focus-visible {
                outline: 2px solid var(--wnvt-accent-primary);
                outline-offset: 2px;
                border-color: var(--wnvt-accent-primary);
            }
            .${prefix}textarea {
                font-family: inherit;
                font-size: var(--wnvt-text-sm, 14px);
                width: 100%;
                padding: 10px 12px;
                margin: 4px 0;
                border: 1px solid var(--wnvt-border-primary);
                border-radius: var(--wnvt-border-radius);
                background-color: var(--wnvt-bg-primary);
                color: var(--wnvt-text-primary);
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
                appearance: none;
                outline: none;
                resize: vertical;
                min-height: 90px;
                line-height: 1.5;
                box-sizing: border-box;
                pointer-events: auto;
            }

            /* Main Controls (floating bar) */
            .${prefix}main-controls {
                position: fixed;
                bottom: max(16px, env(safe-area-inset-bottom, 16px));
                right: max(16px, env(safe-area-inset-right, 16px));
                z-index: 1000;
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                gap: 10px;
                pointer-events: auto;
            }
            .${prefix}main-controls-inner {
                display: flex;
                align-items: center;
                padding: 6px;
                gap: 6px;
                background: rgba(250, 250, 250, 0.82);
                backdrop-filter: blur(24px) saturate(200%);
                -webkit-backdrop-filter: blur(24px) saturate(200%);
                border-radius: var(--wnvt-border-radius);
                box-shadow: 0 10px 25px -4px rgba(24, 24, 27, 0.12), 0 4px 10px -2px rgba(24, 24, 27, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.12);
                border: 1px solid var(--wnvt-border-subtle);
                transition: all 0.25s ease;
            }
            :host(.dark-theme) .${prefix}main-controls-inner {
                background: rgba(9, 9, 11, 0.82);
                box-shadow: 0 14px 32px -4px rgba(0, 0, 0, 0.6), 0 4px 12px -2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12);
                border: 1px solid var(--wnvt-border-subtle);
            }
            .${prefix}main-controls-wrapper {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            .${prefix}status-indicator {
                font-size: var(--wnvt-text-xs);
                font-weight: 600;
                line-height: 1.4;
                padding: 6px 16px;
                border-radius: 9999px; /* animated toast pill */
                background-color: var(--wnvt-accent-primary);
                color: #FFFFFF;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 320px;
                box-shadow: 0 4px 14px -2px rgba(0, 0, 0, 0.2), 0 2px 6px -1px rgba(0, 0, 0, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.18);
                animation: wnvt-toast-in 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
                pointer-events: none;
            }
            .${prefix}status-indicator.status-info {
                background-color: var(--wnvt-accent-primary);
                color: #FFFFFF;
            }
            .${prefix}status-indicator.status-warn {
                background-color: #D97706;
                color: #FFFFFF;
            }
            .${prefix}status-indicator.status-error {
                background-color: #DC2626;
                color: #FFFFFF;
            }
            .${prefix}status-indicator.status-success {
                background-color: #059669;
                color: #FFFFFF;
            }
            :host(.dark-theme) .${prefix}status-indicator.status-info {
                background-color: var(--wnvt-accent-primary);
                color: #FFFFFF;
            }
            :host(.dark-theme) .${prefix}status-indicator.status-warn {
                background-color: #D97706;
                color: #FFFFFF;
            }
            :host(.dark-theme) .${prefix}status-indicator.status-error {
                background-color: #DC2626;
                color: #FFFFFF;
            }
            :host(.dark-theme) .${prefix}status-indicator.status-success {
                background-color: #059669;
                color: #FFFFFF;
            }

            /* Animations */
            @keyframes wnvt-spin { 100% { transform: rotate(360deg); } }
            @keyframes wnvt-pulse-text { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
            .${prefix}loading-spin { animation: wnvt-spin 1s linear infinite; transform-origin: center; }
            .${prefix}loading-pulse { animation: wnvt-pulse-text 1.5s ease-in-out infinite; }

            /* Modal */
            .${prefix}modal-overlay {
                position: fixed;
                inset: 0;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100%;
                height: 100%;
                height: 100dvh;
                min-width: 100%;
                min-height: 100%;
                background-color: var(--wnvt-bg-overlay);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 2000;
                backdrop-filter: blur(4px);
                -webkit-backdrop-filter: blur(4px);
                pointer-events: auto;
                overflow: hidden;
                box-sizing: border-box;
            }
            .${prefix}modal-content {
                background-color: var(--wnvt-bg-primary);
                border-radius: 12px;
                box-shadow: var(--wnvt-box-shadow);
                width: min(800px, 94vw);
                max-width: 94vw;
                min-width: 0;
                display: flex;
                flex-direction: column;
                max-height: min(90vh, 90dvh);
                border: 1px solid var(--wnvt-border-primary);
                transform-origin: center;
                animation: wnvt-modal-enter 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                box-sizing: border-box;
                overflow: hidden;
            }
            .${prefix}modal-header {
                padding: 12px 24px;
                display: flex; justify-content: space-between; align-items: center;
                border-bottom: 1px solid var(--wnvt-border-primary);
                flex-shrink: 0;
            }
            .${prefix}modal-header h2 {
                margin: 0;
                font-family: var(--wnvt-font-display);  /* display font for headings */
                font-size: var(--wnvt-text-xl);         /* 24px */
                font-weight: 700;
                line-height: 1.3;
                color: var(--wnvt-text-primary);
                white-space: normal;
                overflow: visible;
                text-overflow: clip;
                word-break: break-word;
                padding-right: 15px;
            }
            .${prefix}modal-header-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            .${prefix}modal-minimize-btn,
            .${prefix}modal-close-btn {
                background: none;
                border: none;
                cursor: pointer;
                color: var(--wnvt-text-secondary);
                padding: 0;
                border-radius: var(--wnvt-border-radius);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: color 0.2s ease, background-color 0.2s ease;
                width: 34px;
                height: 34px;
                min-height: 34px;
                box-sizing: border-box;
            }
            .${prefix}modal-minimize-btn svg,
            .${prefix}modal-close-btn svg {
                width: 18px;
                height: 18px;
            }
            .${prefix}modal-minimize-btn:hover,
            .${prefix}modal-close-btn:hover {
                color: var(--wnvt-text-primary);
                background-color: var(--wnvt-bg-tertiary);
            }
            .${prefix}modal-body {
                display: flex;
                overflow-y: auto;
                overflow-x: hidden;
                padding: 24px;
                flex-direction: column;
                flex-grow: 1;
                min-width: 0;
                min-height: 0;
                box-sizing: border-box;
            }
            .${prefix}modal-body--flex-layout {
                display: flex;
                flex-direction: column;
                padding: 0;
                overflow-y: hidden;
            }
            .${prefix}modal-text-area {
                white-space: pre-wrap;
                word-wrap: break-word;
                line-height: 1.7;
                flex-grow: 1;
                overflow-y: auto;
                min-height: 150px;
            }
            .${prefix}reader-mode {
                padding: 32px 16px;
                text-align: left !important;
                background-color: var(--wnvt-bg-secondary);
                display: block;
            }
            .${prefix}reader-mode p {
                margin-bottom: 1em;
                line-height: 1.75;
            }
            .${prefix}reader-mode h1,
            .${prefix}reader-mode h2,
            .${prefix}reader-mode h3,
            .${prefix}reader-mode h4 {
                margin-top: 1.5em;
                margin-bottom: 0.5em;
                font-weight: 600;
                color: var(--wnvt-text-primary);
                line-height: 1.35;
            }
            .${prefix}reader-mode blockquote {
                margin: 1em 0;
                padding: 0.5em 1em;
                border-left: 3px solid var(--wnvt-primary);
                background-color: var(--wnvt-surface-raised);
                color: var(--wnvt-text-secondary);
                font-style: italic;
                border-radius: 0 var(--wnvt-border-radius) var(--wnvt-border-radius) 0;
            }
            .${prefix}reader-mode hr {
                border: 0;
                height: 1px;
                background-color: var(--wnvt-border-primary);
                margin: 2em 0;
            }
            .${prefix}reader-mode ul {
                list-style: disc;
                padding-left: 1.5em;
                margin-bottom: 1em;
            }
            .${prefix}reader-mode ol {
                list-style: decimal;
                padding-left: 1.5em;
                margin-bottom: 1em;
            }
            .${prefix}reader-mode-content {
                max-width: 65ch;
                margin: 0 auto;
            }
            .${prefix}reader-mode pre {
                background-color: var(--wnvt-bg-secondary);
                padding: 1em;
                border-radius: var(--wnvt-border-radius);
                border: 1px solid var(--wnvt-border-primary);
                white-space: pre-wrap;
                word-break: break-word;
            }

            .${prefix}inline-error-block {
                border: 1px solid var(--wnvt-danger-subtle);
                background-color: var(--wnvt-danger-bg);
                border-radius: var(--wnvt-border-radius);
                padding: 12px;
                margin: 10px 0;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .${prefix}floating-action-bar {
                position: absolute;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                background-color: var(--wnvt-surface-overlay);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                padding: 8px 12px 8px 16px;
                border-radius: 32px;
                box-shadow: var(--wnvt-elevation-3);
                border: 1px solid var(--wnvt-border-subtle);
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 12px;
                white-space: nowrap;
                animation: wnvt-slideUp 0.3s ease forwards;
            }
            .${prefix}floating-message {
                font-weight: 600;
                color: var(--wnvt-text-primary);
                font-size: var(--wnvt-text-base);
                margin-right: 8px;
            }

            @keyframes wnvt-slideUp {
                from { transform: translate(-50%, 20px) scale(0.95); opacity: 0; }
                to { transform: translate(-50%, 0) scale(1); opacity: 1; }
            }

            .${prefix}result-modal-main-content {
                display: flex;
                flex-direction: column;
                flex-grow: 1;
                overflow-y: hidden;
                padding: 0px 24px;
            }
            .${prefix}modal-footer {
                padding: 10px 16px;
                background-color: var(--wnvt-bg-secondary);
                text-align: right;
                border-bottom-left-radius: 12px;
                border-bottom-right-radius: 12px;
                border-top: 1px solid var(--wnvt-border-primary);
                flex-shrink: 0;
                overflow: visible;
            }
            .${prefix}modal-footer-actions-wrapper {
                display: flex;
                flex-direction: column;
                gap: 8px;
                width: auto;
            }
            .${prefix}button-group-row {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                justify-content: center;
                align-items: center;
            }
            .${prefix}button-group-inline {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }
            .${prefix}button-group-space-between {
                justify-content: space-between;
            }

            /* Settings Modal */
            .${prefix}settings-row {
                display: flex;
                flex-direction: column;
                gap: 6px;
                margin-bottom: 14px;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}settings-row:last-child {
                margin-bottom: 0;
            }
            .${prefix}settings-row > label {
                font-weight: 600;
                font-size: var(--wnvt-text-sm, 14px);
                color: var(--wnvt-text-primary);
                line-height: 1.4;
                word-break: break-word;
            }
            .${prefix}settings-row .${prefix}button-group-inline,
            .${prefix}button-group-inline {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}button-group-inline .${prefix}select,
            .${prefix}button-group-inline .${prefix}input {
                flex: 1 1 200px;
                min-width: 0;
                max-width: 100%;
                height: 34px;
            }
            .${prefix}settings-row > .${prefix}select,
            .${prefix}settings-row > .${prefix}input {
                width: 100%;
                flex: none;
                height: 34px;
            }
            .${prefix}settings-sub-group {
                display: flex;
                flex-direction: column;
                gap: 12px;
                margin-top: 10px;
                width: 100%;
                box-sizing: border-box;
                transition: opacity 0.2s ease;
            }
            .${prefix}settings-row .${prefix}button {
                flex-shrink: 0;
                max-width: 100%;
            }
            .${prefix}setting-card {
                background-color: var(--wnvt-surface-raised);
                border: 1px solid var(--wnvt-border-subtle);
                border-radius: var(--wnvt-border-radius);
                padding: 16px;
                margin-bottom: 16px;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
                overflow: hidden;
            }
            .${prefix}setting-card:last-child {
                margin-bottom: 0;
            }
            .${prefix}setting-card h3 {
                margin-top: 0; margin-bottom: 12px;
                font-family: var(--wnvt-font-display); /* display font for subheadings */
                font-size: var(--wnvt-text-lg);        /* 20px */
                font-weight: 600;
                border-bottom: 1px solid var(--wnvt-border-primary);
                padding-bottom: 8px;
                word-break: break-word;
            }
            .${prefix}settings-grid {
                display: grid;
                grid-template-columns: 1fr;
                gap: 16px;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}setting-item-stack {
                display: flex;
                flex-direction: column;
                gap: 6px;
                min-width: 0;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}label-with-desc {
                display: flex;
                flex-direction: column;
                gap: 4px;
                margin-bottom: 6px;
                min-width: 0;
                max-width: 100%;
            }
            .${prefix}setting-desc {
                font-size: var(--wnvt-text-sm);
                color: var(--wnvt-text-secondary);
                line-height: 1.4;
                margin-bottom: 4px;
                word-break: break-word;
            }
            .${prefix}settings-row-inline {
                display: flex;
                align-items: center;
                gap: 10px;
                justify-content: space-between;
                flex-wrap: wrap;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}theme-palette-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 8px;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }
            .${prefix}custom-color-pickers-container {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                margin-top: 10px;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
            }

            /* Toggle Switch — now ARIA-aware */
            .${prefix}switch {
                position: relative;
                display: inline-block;
                width: 44px;
                height: 24px;
                flex-shrink: 0;
            }
            .${prefix}switch input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            .${prefix}slider {
                position: absolute;
                cursor: pointer;
                top: 0; left: 0; right: 0; bottom: 0;
                background-color: var(--wnvt-bg-tertiary);
                transition: 0.3s;
                border-radius: 24px;
                border: 1px solid var(--wnvt-border-primary);
            }
            .${prefix}slider:before {
                position: absolute;
                content: "";
                height: 18px;
                width: 18px;
                left: 2px;
                bottom: 2px;
                background-color: var(--wnvt-knob-bg);
                transition: 0.3s;
                border-radius: 50%;
                box-shadow: var(--wnvt-knob-shadow);
            }
            .${prefix}switch input:checked + .${prefix}slider {
                background-color: var(--wnvt-accent-primary);
                border-color: var(--wnvt-accent-primary);
            }
            .${prefix}switch input:checked + .${prefix}slider:before {
                transform: translateX(20px);
            }
            .${prefix}switch input:focus-visible + .${prefix}slider {
                outline: 2px solid var(--wnvt-accent-primary);
                outline-offset: 2px;
            }
            /* ARIA switch support (when role="switch") */
            .${prefix}slider[aria-checked="true"] {
                background-color: var(--wnvt-accent-primary);
                border-color: var(--wnvt-accent-primary);
            }
            .${prefix}slider[aria-checked="true"]:before {
                transform: translateX(20px);
            }

            /* Segmented Switch (Pill Control) */
            .${prefix}mode-toggle-container {
                display: flex;
                align-items: center;
            }
            .${prefix}segmented-switch {
                position: relative;
                display: inline-flex;
                align-items: center;
                background-color: var(--wnvt-surface-raised);
                border: 1px solid var(--wnvt-border-subtle);
                border-radius: 20px;
                padding: 2px;
                cursor: pointer;
                font-size: 0.85em;
                font-weight: 500;
                user-select: none;
                box-sizing: border-box;
            }
            .${prefix}segmented-switch input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
                margin: 0;
                width: 0;
                height: 0;
            }
            .${prefix}segmented-option {
                position: relative;
                z-index: 2;
                flex: 1 1 0;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 4px 16px;
                color: var(--wnvt-text-secondary);
                transition: color 0.25s ease;
                white-space: nowrap;
                box-sizing: border-box;
            }
            .${prefix}segmented-option:hover {
                color: var(--wnvt-text-primary);
            }
            .${prefix}segmented-slider {
                position: absolute;
                top: 2px;
                bottom: 2px;
                left: 2px;
                width: calc(50% - 2px);
                background-color: var(--wnvt-bg-primary);
                border-radius: 16px;
                box-shadow: var(--wnvt-elevation-1);
                transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                z-index: 1;
                pointer-events: none;
                box-sizing: border-box;
            }
            .${prefix}segmented-switch input:not(:checked) ~ .${prefix}segmented-option--edit,
            .${prefix}segmented-switch input:not(:checked) ~ .${prefix}segmented-option:nth-of-type(2) {
                color: var(--wnvt-text-primary);
                font-weight: 600;
            }
            .${prefix}segmented-switch input:checked ~ .${prefix}segmented-option--reader,
            .${prefix}segmented-switch input:checked ~ .${prefix}segmented-option:nth-of-type(3) {
                color: var(--wnvt-text-primary);
                font-weight: 600;
            }
            .${prefix}segmented-switch input:checked ~ .${prefix}segmented-slider {
                transform: translateX(100%);
            }

            /* Theme Palette */
            .${prefix}theme-palette-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-top: 8px;
            }
            .${prefix}theme-palette-item {
                padding: 4px;
                border: 2px solid transparent;
                border-radius: var(--wnvt-border-radius);
                background-color: transparent;
                cursor: pointer;
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                width: 50px;
                height: 50px;
                color: var(--wnvt-text-secondary);
            }
            .${prefix}theme-palette-item:hover {
                border-color: var(--wnvt-border-secondary);
                transform: translateY(-2px);
            }
            .${prefix}theme-palette-item.active,
            .${prefix}theme-palette-item[aria-selected="true"] {
                border-color: var(--wnvt-accent-primary);
                box-shadow: 0 0 0 2px var(--wnvt-accent-primary);
            }
            .${prefix}theme-palette-preview {
                width: 100%;
                height: 100%;
                border-radius: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid color-mix(in srgb, var(--wnvt-border-primary) 50%, transparent);
            }
            .${prefix}theme-palette-item-custom {
                background-color: var(--wnvt-bg-secondary);
                border: 2px dashed var(--wnvt-border-secondary);
            }
            .${prefix}theme-palette-item-custom:hover {
                border-color: var(--wnvt-accent-primary);
                border-style: solid;
            }
            .${prefix}theme-palette-item-custom.active {
                border-style: solid;
            }
            .${prefix}theme-palette-item-custom svg {
                stroke: var(--wnvt-text-secondary);
            }

            /* Settings Tabs */
            .${prefix}modal-body--with-tabs {
                padding: 0;
                overflow: hidden !important;
                display: flex;
                flex-direction: column;
                flex-grow: 1;
                min-width: 0;
                min-height: 0;
                box-sizing: border-box;
            }
            .${prefix}settings-tabs-container {
                display: flex;
                border-bottom: 1px solid var(--wnvt-border-primary);
                padding: 0 16px;
                flex-shrink: 0;
                overflow-x: auto;
                overflow-y: hidden;
                white-space: nowrap;
                scrollbar-width: none;
                -ms-overflow-style: none;
                -webkit-overflow-scrolling: touch;
                gap: 4px;
                background-color: var(--wnvt-bg-secondary);
                border-top-left-radius: 12px;
                border-top-right-radius: 12px;
                box-sizing: border-box;
                max-width: 100%;
            }
            .${prefix}settings-tabs-container::-webkit-scrollbar {
                display: none;
                width: 0;
                height: 0;
            }
            .${prefix}settings-tab-btn {
                padding: 10px 14px;
                cursor: pointer;
                border: none;
                background-color: transparent;
                color: var(--wnvt-text-secondary);
                font-weight: 500;
                font-size: var(--wnvt-text-sm, 13px);
                line-height: 1.4;
                position: relative;
                transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
                border-bottom: 2px solid transparent;
                margin-bottom: -1px;
                white-space: nowrap;
                flex-shrink: 0;
                user-select: none;
                border-radius: var(--wnvt-border-radius, 6px) var(--wnvt-border-radius, 6px) 0 0;
                box-sizing: border-box;
            }
            .${prefix}settings-tab-btn:hover {
                color: var(--wnvt-text-primary);
                background-color: rgba(0, 0, 0, 0.04);
            }
            :host(.dark-theme) .${prefix}settings-tab-btn:hover {
                background-color: rgba(255, 255, 255, 0.04);
            }
            .${prefix}settings-tab-btn.active {
                color: var(--wnvt-accent-primary);
                border-bottom-color: var(--wnvt-accent-primary);
                font-weight: 600;
                background-color: var(--wnvt-bg-primary);
            }
            .${prefix}settings-tab-panels-container {
                flex-grow: 1;
                overflow-y: auto;
                overflow-x: hidden !important;
                min-width: 0;
                min-height: 0;
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
                overscroll-behavior: contain;
            }
            .${prefix}settings-tab-panel {
                display: none;
                padding: 20px;
                box-sizing: border-box;
                width: 100%;
                max-width: 100%;
                overflow-x: hidden;
                animation: wnvt-fadeIn 0.2s ease;
            }
            .${prefix}settings-tab-panel.active {
                display: block;
            }

            /* History Modal — mobile-first */
            .${prefix}history-modal-body {
                display: flex;
                flex-direction: column;
                height: 70vh;
                min-height: 400px;
                max-height: 600px;
                padding: 16px;
            }
            @media (min-width: 601px) {
                .${prefix}history-modal-body {
                    flex-direction: row;
                    height: 50vh;
                }
            }
            .${prefix}history-project-list {
                width: 100%;
                min-width: 220px;
                border-right: none;
                border-bottom: 1px solid var(--wnvt-border-primary);
                padding-right: 0;
                padding-bottom: 16px;
                margin-bottom: 16px;
                flex: 1;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
                box-sizing: border-box;
            }
            @media (min-width: 601px) {
                .${prefix}history-project-list {
                    width: 35%;
                    min-width: 220px;
                    border-right: 1px solid var(--wnvt-border-primary);
                    border-bottom: none;
                    padding-right: 16px;
                    padding-bottom: 0;
                    margin-bottom: 0;
                    flex: none;
                }
            }
            .${prefix}history-chapter-list {
                flex: 1;
                padding-left: 0;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            @media (min-width: 601px) {
                .${prefix}history-chapter-list {
                    padding-left: 16px;
                }
            }
            .${prefix}history-item {
                padding: 10px 14px;
                cursor: pointer;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border-radius: var(--wnvt-border-radius);
                border: 1px solid transparent;
                transition: background-color 0.15s ease, border-color 0.15s ease;
                gap: 12px;
                background-color: transparent;
            }
            .${prefix}history-item:hover {
                background-color: var(--wnvt-bg-secondary);
            }
            .${prefix}history-item.active {
                background-color: var(--wnvt-bg-secondary);
                border-color: var(--wnvt-border-primary);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            }
            .${prefix}history-item-name {
                flex: 1;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                text-overflow: ellipsis;
                line-height: 1.4;
                font-weight: 500;
                color: var(--wnvt-text-primary);
                font-family: var(--wnvt-font-sans);
                font-size: var(--wnvt-text-sm);
                transition: color 0.15s ease;
            }
            .${prefix}history-item.active .${prefix}history-item-name {
                color: var(--wnvt-accent-primary);
                font-weight: 600;
            }
            .${prefix}history-item-actions {
                display: flex;
                gap: 6px;
                flex-shrink: 0;
                align-items: center;
                opacity: 0;
                transition: opacity 0.2s ease-in-out;
            }
            .${prefix}history-item:hover .${prefix}history-item-actions {
                opacity: 1;
            }
            .${prefix}history-item:focus-within .${prefix}history-item-actions {
                opacity: 1;
            }

            /* 2-Tier Professional Architecture for Project Item */
            .${prefix}history-item.${prefix}history-project-item {
                display: flex;
                flex-direction: column;
                align-items: stretch;
                justify-content: flex-start;
                padding: 10px 12px;
                gap: 8px;
                box-sizing: border-box;
            }
            .${prefix}history-project-row {
                display: flex;
                align-items: center;
                width: 100%;
                min-width: 0;
                box-sizing: border-box;
            }
            .${prefix}history-project-header-row {
                gap: 8px;
            }
            .${prefix}history-project-avatar {
                width: 24px;
                height: 24px;
                min-width: 24px;
                min-height: 24px;
                border-radius: var(--wnvt-border-radius, 6px);
                background-color: var(--wnvt-bg-tertiary);
                color: var(--wnvt-accent-primary);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 11px;
                line-height: 1;
                flex-shrink: 0;
                user-select: none;
                border: 1px solid var(--wnvt-border-subtle);
            }
            .${prefix}history-item.active .${prefix}history-project-avatar {
                background-color: var(--wnvt-accent-primary);
                color: var(--wnvt-text-on-accent);
                border-color: transparent;
            }
            .${prefix}history-project-folder-icon {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                color: var(--wnvt-text-secondary);
                flex-shrink: 0;
            }
            .${prefix}history-project-folder-icon svg {
                width: 14px;
                height: 14px;
                stroke: currentColor;
            }
            .${prefix}history-item.active .${prefix}history-project-folder-icon {
                color: var(--wnvt-accent-primary);
            }
            .${prefix}history-project-name {
                flex: 1;
                min-width: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                font-size: var(--wnvt-text-sm);
                font-weight: 500;
                color: var(--wnvt-text-primary);
                line-height: 1.3;
            }
            .${prefix}history-item.active .${prefix}history-project-name {
                color: var(--wnvt-accent-primary);
                font-weight: 600;
            }
            .${prefix}history-project-badge {
                font-size: 10px;
                font-weight: 600;
                padding: 1px 6px;
                min-width: 18px;
                height: 18px;
                border-radius: 9px;
                background-color: var(--wnvt-bg-tertiary);
                color: var(--wnvt-text-secondary);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                line-height: 1;
                box-sizing: border-box;
            }
            .${prefix}history-item.active .${prefix}history-project-badge {
                background-color: var(--wnvt-surface-base);
                color: var(--wnvt-accent-primary);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            }
            .${prefix}history-project-sub-row {
                justify-content: space-between;
                gap: 8px;
            }
            .${prefix}history-project-date {
                font-size: 11.5px;
                color: var(--wnvt-text-secondary);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                flex: 1;
                min-width: 0;
            }
            .${prefix}history-project-actions {
                display: flex;
                gap: 4px;
                align-items: center;
                flex-shrink: 0;
            }
            .${prefix}history-project-item .${prefix}history-item-actions {
                opacity: 0.5;
            }
            .${prefix}history-project-item:hover .${prefix}history-item-actions,
            .${prefix}history-project-item.active .${prefix}history-item-actions,
            .${prefix}history-project-item:focus-within .${prefix}history-item-actions {
                opacity: 1;
            }
            @media (max-width: 600px) {
                .${prefix}history-project-item .${prefix}history-item-actions {
                    opacity: 1;
                }
            }
            .${prefix}history-action-btn {
                width: 26px !important;
                height: 26px !important;
                min-width: 26px !important;
                min-height: 26px !important;
                max-width: 26px !important;
                max-height: 26px !important;
                padding: 0 !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                border-radius: var(--wnvt-border-radius, 6px) !important;
                flex-shrink: 0 !important;
                box-sizing: border-box !important;
            }
            .${prefix}history-action-btn svg {
                width: 13px !important;
                height: 13px !important;
                flex-shrink: 0 !important;
            }
            /* Empty state — small centered composition */
            .${prefix}history-empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 16px;
                padding: 48px 24px;
                color: var(--wnvt-text-secondary);
                text-align: center;
            }
            .${prefix}history-empty-state svg {
                width: 48px;
                height: 48px;
                stroke: var(--wnvt-text-secondary);
                opacity: 0.6;
                flex-shrink: 0;
            }

            /* Dropdown */
            .${prefix}dropdown-container {
                position: relative;
                display: inline-block;
            }
            .${prefix}dropdown-menu {
                display: none;
                position: absolute;
                bottom: 100%;
                left: 0;
                right: auto;
                background-color: var(--wnvt-bg-primary);
                min-width: 200px;
                box-shadow: var(--wnvt-box-shadow);
                border-radius: var(--wnvt-border-radius);
                border: 1px solid var(--wnvt-border-primary);
                z-index: 2050;
                margin-bottom: 8px;
                padding: 4px;
                transform-origin: bottom left;
            }
            .${prefix}dropdown-menu.show {
                display: flex;
                flex-direction: column;
                gap: 2px;
                animation: wnvt-dropdown-enter 0.15s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .${prefix}dropdown-menu .${prefix}button {
                width: 100%;
                justify-content: flex-start;
                padding: 0 12px;
                margin: 0;
                background-color: transparent;
                border: none;
                box-shadow: none;
                transform: none !important;
                height: 34px;
                min-height: 34px;
            }
            .${prefix}dropdown-menu .${prefix}button:hover:not(:disabled) {
                background-color: var(--wnvt-bg-secondary);
            }

            /* Dialog (Confirm/Prompt) — class-based, no inline styles */
            .${prefix}dialog-overlay {
                position: fixed;
                inset: 0;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                width: 100vw;
                height: 100vh;
                height: 100dvh;
                min-width: 100vw;
                min-height: 100vh;
                background-color: var(--wnvt-bg-overlay);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 30000;
                font-family: inherit;
                pointer-events: auto;
            }
            .${prefix}dialog-box {
                background-color: var(--wnvt-bg-primary);
                color: var(--wnvt-text-primary);
                padding: 24px;
                border-radius: var(--wnvt-border-radius);
                box-shadow: var(--wnvt-box-shadow);
                border: 1px solid var(--wnvt-border-primary);
                max-width: 400px;
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 16px;
                transform-origin: center;
                animation: wnvt-modal-enter 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
            }
            .${prefix}dialog-icon {
                display: flex;
                justify-content: center;
            }
            .${prefix}dialog-icon-svg {
                width: 32px;
                height: 32px;
                stroke: var(--wnvt-text-secondary);
            }
            .${prefix}dialog-message {
                font-size: var(--wnvt-text-base);
                line-height: 1.5;
            }
            .${prefix}dialog-input {
                padding: 0 12px;
                height: 34px;
                min-height: 34px;
                border: 1px solid var(--wnvt-border-primary);
                border-radius: var(--wnvt-border-radius);
                font-size: var(--wnvt-text-base);
                background-color: var(--wnvt-bg-secondary);
                color: var(--wnvt-text-primary);
                width: 100%;
                box-sizing: border-box;
                outline: none;
            }
            .${prefix}dialog-input:focus-visible {
                outline: 2px solid var(--wnvt-accent-primary);
                outline-offset: 2px;
                border-color: var(--wnvt-accent-primary);
            }
            .${prefix}dialog-btn-container {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
                margin-top: 8px;
            }
            .${prefix}dialog-btn-cancel {
                background-color: var(--wnvt-bg-secondary);
                color: var(--wnvt-text-primary);
                border: 1px solid var(--wnvt-border-primary);
            }
            .${prefix}dialog-btn-cancel:hover:not(:disabled) {
                background-color: var(--wnvt-bg-tertiary);
            }
            .${prefix}dialog-btn-confirm {
                /* inherits button-primary */
            }

            /* Restore result icon */
            .${prefix}restore-result-icon-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--wnvt-accent-primary);
                color: var(--wnvt-text-on-accent);
                border: none;
                box-shadow: 0 4px 12px color-mix(in srgb, var(--wnvt-accent-primary) 30%, transparent);
                transition: all 0.2s ease-out;
                padding: 0 14px;
                border-radius: 9999px;
                height: 34px;
                min-height: 34px;
                gap: 6px;
                animation: wnvt-pulse 2s infinite;
            }
            .${prefix}restore-result-icon-btn svg {
                width: 18px;
                height: 18px;
            }
            .${prefix}restore-result-icon-btn:hover {
                background-color: var(--wnvt-accent-primary-hover);
                transform: translateY(-2px) scale(1.03);
                box-shadow: 0 6px 16px color-mix(in srgb, var(--wnvt-accent-primary) 40%, transparent);
                animation-play-state: paused;
            }

            @keyframes wnvt-pulse {
                0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--wnvt-accent-primary) 60%, transparent), var(--wnvt-box-shadow); }
                70% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--wnvt-accent-primary) 0%, transparent), var(--wnvt-box-shadow); }
                100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--wnvt-accent-primary) 0%, transparent), var(--wnvt-box-shadow); }
            }

            @keyframes wnvt-fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes wnvt-modal-enter {
                0% {
                    opacity: 0;
                    transform: scale(0.96) translateY(10px);
                }
                100% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            @keyframes wnvt-dropdown-enter {
                0% {
                    opacity: 0;
                    transform: scale(0.94) translateY(6px);
                }
                100% {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            @keyframes wnvt-toast-in {
                0% {
                    opacity: 0;
                    transform: translateY(12px) scale(0.92);
                }
                60% {
                    opacity: 1;
                    transform: translateY(-2px) scale(1.02);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* Reduced motion: respect user preference */
            @media (prefers-reduced-motion: reduce) {
                *, *::before, *::after {
                    animation-duration: 0.01ms !important;
                    animation-iteration-count: 1 !important;
                    transition-duration: 0.01ms !important;
                    scroll-behavior: auto !important;
                }
            }

            /* KaTeX customization */
            .katex { font-size: 1.1em; }
            .katex-display { overflow-x: auto; overflow-y: hidden; padding: 1em 0; }

            /* Settings modal responsive hardening for high browser zoom and small viewports */
            @media (max-width: 680px) {
                .${prefix}modal-content {
                    width: 95vw;
                    max-width: 95vw;
                    max-height: 92vh;
                    max-height: 92dvh;
                    border-radius: 8px;
                }
                .${prefix}modal-header {
                    padding: 10px 14px;
                }
                .${prefix}modal-header h2 {
                    font-size: 18px;
                }
                .${prefix}settings-tabs-container {
                    padding: 0 8px;
                    gap: 2px;
                }
                .${prefix}settings-tab-btn {
                    padding: 8px 10px;
                    font-size: 12px;
                }
                .${prefix}settings-tab-panel {
                    padding: 14px;
                }
                .${prefix}setting-card {
                    padding: 12px;
                    margin-bottom: 12px;
                }
                .${prefix}setting-card h3 {
                    font-size: 15px;
                    margin-bottom: 8px;
                    padding-bottom: 6px;
                }
                .${prefix}modal-footer {
                    padding: 8px 14px;
                }
                .${prefix}button {
                    height: 32px;
                    min-height: 32px;
                    font-size: 13px;
                    padding: 0 10px;
                }
            }
            @media (max-width: 440px) {
                .${prefix}modal-content {
                    width: 98vw;
                    max-width: 98vw;
                    max-height: 95vh;
                    max-height: 95dvh;
                    border-radius: 6px;
                }
                .${prefix}modal-header {
                    padding: 8px 10px;
                }
                .${prefix}modal-header h2 {
                    font-size: 16px;
                }
                .${prefix}settings-tabs-container {
                    padding: 0 4px;
                }
                .${prefix}settings-tab-btn {
                    padding: 6px 8px;
                    font-size: 11px;
                }
                .${prefix}settings-tab-panel {
                    padding: 10px;
                }
                .${prefix}setting-card {
                    padding: 10px;
                    margin-bottom: 10px;
                }
                .${prefix}modal-footer {
                    padding: 6px 10px;
                }
            }
        `;

        // Apply styles using Constructable Stylesheets (async replace for performance)
        try {
            if ('adoptedStyleSheets' in Document.prototype && 'replace' in CSSStyleSheet.prototype) {
                const sheet = new CSSStyleSheet();
                await sheet.replace(cssContent);
                this.shadowRoot.adoptedStyleSheets = [sheet];
                this.logger.info("Styles applied via async Constructable Stylesheet.");
            } else {
                throw new Error("Constructable Stylesheets async replace not supported");
            }
        } catch (e) {
            // Fallback to traditional <style> tag
            this.logger.debug("Using a traditional <style> tag because Constructable Stylesheets are unavailable.");
            const styleEl = this.domBuilder.createEl('style', { textContent: cssContent });
            this.shadowRoot.appendChild(styleEl);
        }
    }

    /* ------------------------------------------------------------------ */
    /*  System Theme Auto-Detection (NEW)                                  */
    /* ------------------------------------------------------------------ */

    /**
     * Apply system‑level light/dark theme based on prefers-color-scheme.
     * Listens for changes and updates automatically.
     */
    _applySystemTheme() {
        const darkModeMq = window.matchMedia('(prefers-color-scheme: dark)');

        const apply = () => {
            this.applyTheme(darkModeMq.matches ? 'dark' : 'light');
        };

        apply(); // Initial application

        if (!this._systemThemeListener) {
            this._systemThemeListener = apply;
            darkModeMq.addEventListener('change', apply);
        }
    }
}