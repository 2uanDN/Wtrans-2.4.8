// ==UserScript==
// @name         WNovel Translator
// @namespace    http://tampermonkey.net/
// @version      2.4.8
// @description  Translate web novel chapters using Gemini AI
// @author       QĐN
// @match        *://*/*
// @exclude      *://*.facebook.com/*
// @exclude      *://*.x.com/*
// @exclude      *://*.twitter.com/*
// @exclude      *://*.reddit.com/*
// @exclude      *://*.youtube.com/*
// @exclude      *://*.tiktok.com/*
// @exclude      *://*.instagram.com/*
// @exclude      *://*.threads.com/*
// @exclude      *://*.pinterest.com/*
// @icon         https://cdn-icons-png.flaticon.com/512/12886/12886036.png
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @require      https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.0.11/purify.min.js
// @require      https://cdn.jsdelivr.net/npm/workerpool@7.0.0/dist/workerpool.min.js
// @require      https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// @require      https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.js
// @require      https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/contrib/auto-render.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @resource     Readability_js https://cdn.jsdelivr.net/npm/@mozilla/readability@0.5.0/Readability.js
// @resource     Showdown_js https://cdn.jsdelivr.net/npm/showdown@2.1.0/dist/showdown.min.js
// @resource     katex_css https://cdn.jsdelivr.net/npm/katex@0.16.10/dist/katex.min.css
// ==/UserScript==

'use strict';

    // --- 1. CONFIGURATION MANAGER ---
    class ConfigManager {
        constructor() {
            this.SCRIPT_PREFIX = "wnvt_v1_"; // Updated prefix for v1
            this.logger = null;

            this.UI_IDS = Object.freeze({
                SHADOW_HOST: this.SCRIPT_PREFIX + "shadow_host",
                MAIN_CONTAINER: this.SCRIPT_PREFIX + "main_container",
                TOGGLE_MAIN_CONTROLS_MINIMIZE_BTN: this.SCRIPT_PREFIX + "toggle_main_controls_minimize_btn",
                TRANSLATE_BTN: this.SCRIPT_PREFIX + "translate_btn",
                TRANSLATE_SELECTION_BTN: this.SCRIPT_PREFIX + "translate_selection_btn",
                EXPORT_BTN: this.SCRIPT_PREFIX + "export_btn",
                SETTINGS_BTN: this.SCRIPT_PREFIX + "settings_btn",
                STATUS_INDICATOR: this.SCRIPT_PREFIX + "status_indicator",
                MAIN_CONTROLS_RESTORE_RESULT_BTN: this.SCRIPT_PREFIX + "main_controls_restore_result_btn",

                RESULT_MODAL: this.SCRIPT_PREFIX + "result_modal",
                RESULT_MODAL_HEADER: this.SCRIPT_PREFIX + "result_modal_header",
                RESULT_MODAL_TITLE: this.SCRIPT_PREFIX + "result_modal_title",
                RESULT_MODAL_BODY: this.SCRIPT_PREFIX + "result_modal_text_area",
                TRANSLATION_VIEW_PANEL: this.SCRIPT_PREFIX + "translation_view_panel",
                RESULT_ACTION_BAR: this.SCRIPT_PREFIX + "result_action_bar",
                RESULT_MODAL_FOOTER: this.SCRIPT_PREFIX + "result_modal_footer",
                RESULT_MODAL_CLOSE_BTN: this.SCRIPT_PREFIX + "result_modal_close_btn",
                RESULT_MODAL_SETTINGS_BTN: this.SCRIPT_PREFIX + "result_modal_settings_btn",
                RESULT_MODAL_MINIMIZE_BTN: this.SCRIPT_PREFIX + "result_modal_minimize_btn",
                RESULT_MODAL_RETRY_BTN: this.SCRIPT_PREFIX + "result_modal_retry_btn",
                RESULT_MODAL_WORDS_BTN: this.SCRIPT_PREFIX + "result_modal_words_btn",
                RESULT_MODAL_RETRANSLATE_BTN: this.SCRIPT_PREFIX + "result_modal_retranslate_btn",
                RESULT_MODAL_TOGGLE_CUSTOM_PROMPT_BTN: this.SCRIPT_PREFIX + "result_modal_toggle_custom_prompt_btn",
                RESULT_MODAL_TOGGLE_MODE_BTN: this.SCRIPT_PREFIX + "result_modal_toggle_mode_btn",
                RESULT_MODAL_APPLY_CHANGES_BTN: this.SCRIPT_PREFIX + "result_modal_apply_changes_btn",
                RESULT_MODAL_CANCEL_CHANGES_BTN: this.SCRIPT_PREFIX + "result_modal_cancel_changes_btn",

                CUSTOM_PROMPT_PANEL_CONTAINER: this.SCRIPT_PREFIX + "custom_prompt_panel_container",
                CUSTOM_PROMPT_PANEL_HEADER: this.SCRIPT_PREFIX + "custom_prompt_panel_header",
                CUSTOM_PROMPT_PANEL_TITLE: this.SCRIPT_PREFIX + "custom_prompt_panel_title",
                CUSTOM_PROMPT_PANEL_CLOSE_BTN: this.SCRIPT_PREFIX + "custom_prompt_panel_close_btn",
                CUSTOM_PROMPT_CANCEL_BTN: this.SCRIPT_PREFIX + "custom_prompt_cancel_btn",
                CUSTOM_PROMPT_SELECT: this.SCRIPT_PREFIX + "custom_prompt_select",
                CUSTOM_PROMPT_TEXTAREA: this.SCRIPT_PREFIX + "custom_prompt_textarea",
                CUSTOM_PROMPT_EXECUTE_BTN: this.SCRIPT_PREFIX + "custom_prompt_execute_btn",
                CUSTOM_PROMPT_UPDATE_SAVED_BTN: this.SCRIPT_PREFIX + "custom_prompt_update_saved_btn",

                SETTINGS_MODAL: this.SCRIPT_PREFIX + "settings_modal",
                HISTORY_BTN: this.SCRIPT_PREFIX + "history_btn",
                HISTORY_MODAL: this.SCRIPT_PREFIX + "history_modal",
                HISTORY_MODAL_CLOSE_BTN: this.SCRIPT_PREFIX + "history_modal_close_btn",
                HISTORY_PROJECT_LIST: this.SCRIPT_PREFIX + "history_project_list",
                HISTORY_CHAPTER_LIST: this.SCRIPT_PREFIX + "history_chapter_list",
                HISTORY_NEW_PROJECT_BTN: this.SCRIPT_PREFIX + "history_new_project_btn",
                RESULT_MODAL_ADD_HISTORY_BTN: this.SCRIPT_PREFIX + "result_modal_add_history_btn",
                RESULT_MODAL_OPEN_HISTORY_BTN: this.SCRIPT_PREFIX + "result_modal_open_history_btn",
                SETTINGS_MODAL_CLOSE_BTN: this.SCRIPT_PREFIX + "settings_modal_close_btn",
                PROVIDER_SELECT: this.SCRIPT_PREFIX + "provider_select",
                PROVIDER_MANAGE_BTN: this.SCRIPT_PREFIX + "provider_manage_btn",
                PROVIDER_MODAL: this.SCRIPT_PREFIX + "provider_modal",
                PROVIDER_MODAL_CLOSE_BTN: this.SCRIPT_PREFIX + "provider_modal_close_btn",
                PROVIDER_LIST: this.SCRIPT_PREFIX + "provider_list",
                PROVIDER_ADD_BTN: this.SCRIPT_PREFIX + "provider_add_btn",
                PROVIDER_FORM: this.SCRIPT_PREFIX + "provider_form",
                PROVIDER_NAME_INPUT: this.SCRIPT_PREFIX + "provider_name_input",
                PROVIDER_BASE_URL_INPUT: this.SCRIPT_PREFIX + "provider_base_url_input",
                PROVIDER_API_KEY_INPUT: this.SCRIPT_PREFIX + "provider_api_key_input",
                PROVIDER_SAVE_BTN: this.SCRIPT_PREFIX + "provider_save_btn",
                PROVIDER_CANCEL_BTN: this.SCRIPT_PREFIX + "provider_cancel_btn",
                API_KEY_SELECT: this.SCRIPT_PREFIX + "api_key_select",
                API_KEY_ADD_BTN: this.SCRIPT_PREFIX + "api_key_add_btn",
                API_KEY_REMOVE_BTN: this.SCRIPT_PREFIX + "api_key_remove_btn",
                MODEL_SELECT: this.SCRIPT_PREFIX + "model_select",
                TEST_CONNECTION_BTN: this.SCRIPT_PREFIX + "test_connection_btn",
                TEST_CONNECTION_MODAL: this.SCRIPT_PREFIX + "test_connection_modal",
                TEST_CONNECTION_MODAL_CLOSE_BTN: this.SCRIPT_PREFIX + "test_connection_modal_close_btn",
                TEST_CONNECTION_LIST: this.SCRIPT_PREFIX + "test_connection_list",
                FETCH_MODELS_BTN: this.SCRIPT_PREFIX + "fetch_models_btn",
                FETCH_MODELS_SEARCH: this.SCRIPT_PREFIX + "fetch_models_search",
                FETCH_MODELS_LIST: this.SCRIPT_PREFIX + "fetch_models_list",
                SAVED_MODELS_LIST: this.SCRIPT_PREFIX + "saved_models_list",

                CONTEXT_TEMPLATE_SELECT: this.SCRIPT_PREFIX + "context_template_select",
                CONTEXT_TEMPLATE_TEXTAREA: this.SCRIPT_PREFIX + "context_template_textarea",
                CONTEXT_TEMPLATE_SAVE_NEW_BTN: this.SCRIPT_PREFIX + "context_template_save_new_btn",
                CONTEXT_TEMPLATE_UPDATE_BTN: this.SCRIPT_PREFIX + "context_template_update_btn",
                CONTEXT_TEMPLATE_DELETE_BTN: this.SCRIPT_PREFIX + "context_template_delete_btn",
                CONTEXT_TEMPLATE_APPLY_BTN: this.SCRIPT_PREFIX + "context_template_apply_btn",

                DISPLAY_THEME_SELECT: this.SCRIPT_PREFIX + "display_theme_select",
                DISPLAY_BG_COLOR_INPUT: this.SCRIPT_PREFIX + "display_bg_color_input",
                DISPLAY_TEXT_COLOR_INPUT: this.SCRIPT_PREFIX + "display_text_color_input",
                DISPLAY_FONT_FAMILY_SELECT: this.SCRIPT_PREFIX + "display_font_family_select",
                DISPLAY_FONT_SIZE_INPUT: this.SCRIPT_PREFIX + "display_font_size_input",
                SETTINGS_SAVE_BTN: this.SCRIPT_PREFIX + "settings_save_btn",

                MODEL_CONFIG_TEMP_INPUT: this.SCRIPT_PREFIX + "model_config_temp_input",
                MODEL_CONFIG_TOP_P_INPUT: this.SCRIPT_PREFIX + "model_config_top_p_input",
                MODEL_CONFIG_TOP_K_INPUT: this.SCRIPT_PREFIX + "model_config_top_k_input",
                MODEL_CONFIG_MAX_TOKENS_INPUT: this.SCRIPT_PREFIX + "model_config_max_tokens_input",
                MODEL_CONFIG_CHUNK_MIN_LENGTH_INPUT: this.SCRIPT_PREFIX + "model_config_chunk_min_length_input",
                MODEL_CONFIG_CHUNK_LIMIT_INPUT: this.SCRIPT_PREFIX + "model_config_chunk_limit_input",
                MODEL_CONFIG_CHUNK_OVERSIZE_INPUT: this.SCRIPT_PREFIX + "model_config_chunk_oversize_input",
                MODEL_CONFIG_CHUNK_CONTEXT_WORDS_INPUT: this.SCRIPT_PREFIX + "model_config_chunk_context_words_input",
                MODEL_CONFIG_CHUNK_DELAY_INPUT: this.SCRIPT_PREFIX + "model_config_chunk_delay_input",

                SAFETY_SETTINGS_ENABLE_CHECKBOX: this.SCRIPT_PREFIX + "safety_settings_enable_checkbox",

                SETTINGS_EXPORT_ALL_DATA_BTN: this.SCRIPT_PREFIX + "settings_export_all_data_btn",
                SETTINGS_IMPORT_ALL_DATA_BTN: this.SCRIPT_PREFIX + "settings_import_all_data_btn",
                SETTINGS_IMPORT_FILE_INPUT: this.SCRIPT_PREFIX + "settings_import_file_input",
            });

            this.SETTINGS_SCHEMA = Object.freeze({
                PROVIDERS_LIST: {
                    key: "providersList",
                    storageKey: this.SCRIPT_PREFIX + "providers_list_v1",
                    default: [ { id: "default-gemini", type: "GEMINI", name: "Google Gemini", baseUrl: "", apiKey: "", isCustom: false } ]
                },
                ACTIVE_PROVIDER_ID: {
                    key: "activeProviderId",
                    storageKey: this.SCRIPT_PREFIX + "active_provider_id_v1",
                    default: "default-gemini"
                },
                AVAILABLE_MODELS: {
                    key: "availableModels",
                    storageKey: this.SCRIPT_PREFIX + "available_models_v1",
                    default: []
                },
                SAVED_MODELS_MAP: {
                    key: "savedModelsMap",
                    storageKey: this.SCRIPT_PREFIX + "saved_models_map_v1",
                    default: {
                        "default-gemini": []
                    }
                },
                API_KEYS_LIST: {
                    key: "apiKeysList",
                    storageKey: this.SCRIPT_PREFIX + "api_keys_list_v1",
                    default: []
                },
                SELECTED_API_KEY: {
                    key: "selectedApiKey",
                    storageKey: this.SCRIPT_PREFIX + "selected_api_key_v1",
                    default: null
                },
                SELECTED_MODEL: {
                    key: "selectedModel",
                    storageKey: this.SCRIPT_PREFIX + "selected_model_v1",
                    default: ""
                },
                LAST_SELECTED_MODEL_MAP: {
                    key: "lastSelectedModelMap",
                    storageKey: this.SCRIPT_PREFIX + "last_selected_model_map_v1",
                    default: {}
                },
                CONTEXT_TEMPLATES_MAP: {
                    key: "contextTemplatesMap",
                    storageKey: this.SCRIPT_PREFIX + "context_templates_map_v1",
                    default: {
                        "Default Translation": "Translate the following text (likely a web novel chapter or segment) from its original language into Vietnamese. Preserve the original paragraph structure and formatting (like line breaks) as much as possible. Output only the translated text.",
                        "Retranslate": "Improve the following Vietnamese translation. Focus on fluency, natural language, and accuracy. Preserve the original paragraph structure. Output only the improved translation.",
                        "Words": "Find and translate any remaining non-Vietnamese words/phrases in the following text into Vietnamese. Output the text with the translations integrated. Do not translate other parts of the text.",
                    }
                },
                SELECTED_TEMPLATE_NAME: {
                    key: "selectedTemplateName",
                    storageKey: this.SCRIPT_PREFIX + "selected_template_name_v1",
                    default: "Default Translation"
                },
                SELECTED_THEME: {
                    key: "selectedTheme",
                    storageKey: this.SCRIPT_PREFIX + "selected_theme_v1",
                    default: "light"
                },
                DISPLAY_SETTINGS: {
                    key: "displaySettings",
                    storageKey: this.SCRIPT_PREFIX + "display_settings_v1",
                    default: {
                        themeId: "soft_light",
                        bgColor: "#F5F5DC",
                        textColor: "#3C3C3C",
                        fontFamily: "'Lora', Georgia, serif",
                        fontSize: "17",
                    }
                },
                MODEL_CONFIG: {
                    key: "modelConfig",
                    storageKey: this.SCRIPT_PREFIX + "model_config_v1",
                    default: {
                        temperature: 1.0, topP: 0.95, topK: 30, maxOutputTokens: 64000,
                        minTextLengthForChunking: 15000, chunkInputCharLimit: 14000,
                        chunkContextWords: 500, chunkOversizeAllowance: 500,
                        delayBetweenChunksMs: 300
                    }
                },
                SAFETY_CONFIG: {
                    key: "safetyConfig",
                    storageKey: this.SCRIPT_PREFIX + "safety_config_v1",
                    default: {
                        enabled: true,
                        settings: {
                            'HARM_CATEGORY_HARASSMENT': 'BLOCK_NONE', 'HARM_CATEGORY_HATE_SPEECH': 'BLOCK_NONE',
                            'HARM_CATEGORY_SEXUALLY_EXPLICIT': 'BLOCK_NONE', 'HARM_CATEGORY_DANGEROUS_CONTENT': 'BLOCK_NONE',
                        }
                    }
                },
                SAVED_CUSTOM_PROMPTS: {
                    key: "savedCustomPrompts_v1",
                    storageKey: this.SCRIPT_PREFIX + "saved_custom_prompts_v1",
                    default: [
                        { id: "custom_prompt_clean", name: "Quick Trash Cleanup", content: "Remove phrases such as \"ABC\", \"DEF\", \"XYZ\", and similar advertising or source-related phrases from the following text. Keep all other content unchanged. Return only the final cleaned text." },
                        { id: "custom_prompt_keywords", name: "Replace Words", content: "In the following text, replace every occurrence of \"ABC\" with \"DEF\" and \"RST\" with \"XYZ\". Keep all other content unchanged. Return only the final edited text." },
                        { id: "custom_prompt_pronouns", name: "Change Pronouns", content: "Review and adjust the forms of address in the following text to match the context \"...\", for example: \"ABC\" -> \"DEF\", \"RST\" -> \"XYZ\". Keep all other content unchanged. Return only the final text with the adjusted forms of address." }
                    ]
                },
                MAIN_CONTROLS_MINIMIZED: {
                    key: "mainControlsMinimized_v1",
                    storageKey: this.SCRIPT_PREFIX + "main_controls_minimized_v1",
                    default: false
                },
                RESULT_MODAL_STATE: {
                    key: "resultModalState_v1",
                    storageKey: this.SCRIPT_PREFIX + "result_modal_state_v1",
                    default: null
                }
            });

            // Maintain property references to the setting keys for compatibility
            this.SETTING_KEYS = Object.freeze(Object.keys(this.SETTINGS_SCHEMA).reduce((acc, k) => {
                acc[k] = this.SETTINGS_SCHEMA[k].key;
                return acc;
            }, {}));
            this.PROTECTED_TEMPLATE_NAMES = Object.freeze(["Default Translation", "Retranslate", "Words"]);

            this.CONSTANTS = Object.freeze({
                PROVIDER_TYPES: {
                    GEMINI: 'GEMINI',
                    CUSTOM: 'CUSTOM'
                },
                TEXT_SOURCE: {
                    COMMITTED: 'committed',
                    ORIGINAL: 'original'
                },
                OPERATION_TYPE: {
                    RETRY: 'retry',
                    WORDS: 'words',
                    RETRANSLATE: 'retranslate',
                    CUSTOM_PROMPT: 'custom_prompt'
                },
                GEMINI_API_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/models/",
                DISPLAY_FONTS: ["System Default", "Inter", "Livvic", "Lora", "Merriweather", "Noto Serif", "Nunito", "Open Sans", "Roboto"],
                COLOR_THEMES: [
                    { id: 'soft_light', name: 'Soft Light', bgColor: '#F5F5DC', textColor: '#3C3C3C' },
                    { id: 'sepia', name: 'Sepia', bgColor: '#FBF0D9', textColor: '#5B4636' },
                    { id: 'gray_paper', name: 'Gray Paper', bgColor: '#E8E8E8', textColor: '#212121' },
                    { id: 'graphite_dark', name: 'Graphite Dark', bgColor: '#282C34', textColor: '#ABB2BF' },
                    { id: 'midnight_blue', name: 'Midnight Blue', bgColor: '#1A202C', textColor: '#E2E8F0' },
                    { id: 'solarized_light', name: 'Solarized Light', bgColor: '#FDF6E3', textColor: '#657B83' },
                    { id: 'solarized_dark', name: 'Solarized Dark', bgColor: '#002B36', textColor: '#839496' },
                    { id: 'nord', name: 'Nord', bgColor: '#2E3440', textColor: '#D8DEE9' },
                    { id: 'latte', name: 'Latte', bgColor: '#F2E5D5', textColor: '#4C4F69' },
                    { id: 'olive_dark', name: 'Olive Dark', bgColor: '#292D2E', textColor: '#C8C093' }
                ],
                SAFETY_CATEGORIES_MAP: {
                    'HARM_CATEGORY_HATE_SPEECH': "Hate Speech", 'HARM_CATEGORY_HARASSMENT': "Harassment",
                    'HARM_CATEGORY_SEXUALLY_EXPLICIT': "Sexually Explicit", 'HARM_CATEGORY_DANGEROUS_CONTENT': "Dangerous Content",
                },
                SAFETY_THRESHOLDS_MAP: {
                    "Block None": 'BLOCK_NONE', "Block Low+": 'BLOCK_LOW_AND_ABOVE',
                    "Block Medium+": 'BLOCK_MEDIUM_AND_ABOVE', "Block Only High": 'BLOCK_ONLY_HIGH',
                },
                CONTENT_FETCH_DELAY: 300,
                PROCESSING_MESSAGE_IDENTIFIER: "Processing...",
                RETRYING_MESSAGE_IDENTIFIER: "Segment error...",
                MIN_ARTICLE_CONTENT_LENGTH: 150,
                MIN_JSON_LD_CONTENT_LENGTH: 1000,
                MIN_PARAGRAPH_CONTENT_LENGTH: 25,
                PREFER_DOM_CANDIDATE_FOR_READABILITY_INPUT: false,
                MAX_CHUNK_RETRIES: 3,
                RETRY_DELAY_MS: 2000,
    SCORING_WEIGHTS:  {
    BASE_LOG_FACTOR: 20,
    LINK_DENSITY_THRESHOLD: 0.4,
    LINK_DENSITY_PENALTY: 100,
    LINK_DENSITY_BONUS: 30,
    P_TAG_BONUS: 10,
    AVG_P_LEN_THRESHOLD: 30,
    AVG_P_LEN_MAX_CAP: 600,
    AVG_P_LEN_BONUS_FACTOR: 0.2,
    SHORT_P_PENALTY_FACTOR: 2,
    TEXT_TO_TAG_RATIO_FACTOR: 0.1,
    IMAGE_PENALTY: 2,
    MIN_TEXT_LENGTH: 100,
    TAG_WEIGHTS: { article: 25, main: 20, section: 15, div: 0, p: 0 },
    BAD_KEYWORD_PENALTY: 25,
    BAD_KEYWORD_REGEX_PENALTY: 15,
    BAD_KEYWORDS: ['sidebar', 'footer', 'header', 'nav', 'menu', 'comment', 'discuss', 'share', 'social', 'hidden', 'modal', 'popup', 'login', 'register'],
    HIGH_LINK_COUNT_PENALTY: 2,
    STYLE_SCRIPT_PENALTY: 50,
},
                DOM_ANALYSIS_DEFAULT_CONFIG: {
                    minTextLength: 150, maxLinkDensity: 0.35, minPTagsRatio: 0.3, minDirectTextChildrenRatioForDiv: 0.2,
                    badKeywords: ['comment', 'comments', 'respond', 'reply', 'sidebar', 'aside', 'footer', 'header', 'nav', 'menu','related', 'social', 'share', 'author-bio', 'pagination', 'breadcrumb', 'widget','ad', 'ads', 'advert', 'sponsored', 'banner', 'popup', 'modal', 'cookie', 'consent','tag', 'category', 'meta', 'utility', 'toolbar', 'notice', 'alert', 'form', 'login', 'register','shopping', 'cart', 'price', 'shop', 'product', 'recommendation'],
                    candidateTags: ['article', 'main', 'section', 'div', 'p'],
                    contentChildTags: ['p', 'div', 'span', 'li', 'td', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre']
                },
                DOM_CLEANUP_SELECTOR_GROUPS: {
                    CRITICAL_SCRIPTS_STYLES: [ 'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'video', 'audio', 'object', 'embed' ],
                    ADVERTISEMENTS_PROMOTIONS: [
                        // Display & Google Ads
                        '.adsbygoogle',
                        '[id*="google_ads"]',
                        '[id*="google-ads"]',
                        '[class*="google-ads"]',
                        '.banner-ad',
                        '[class*="banner-ad"]',
                        '[id*="banner-ad"]',
                        '[class*="ad-banner"]',
                        '[id*="ad-banner"]',
                        '[id*="banner"]',
                        '[class*="banner"]',
                        '[id*="advert"]',
                        '[class*="advert"]',
                        '.ad-container',
                        '[class*="ad-container"]',
                        '[id*="ad-container"]',
                        '[class*="adbox"]',
                        '[id*="adbox"]',
                        '[class*="ad-box"]',
                        '[id*="ad-box"]',
                        '[class*="ad-wrapper"]',
                        '[id*="ad-wrapper"]',
                        '[class*="ad-slot"]',
                        '[id*="ad-slot"]',
                        '[class*="ad-unit"]',
                        '[id*="ad-unit"]',
                        '[class*="ad-zone"]',
                        '[id*="ad-zone"]',
                        '.sponsor',
                        '[class*="sponsored"]',
                        '[id*="sponsored"]',
                        // Pirate Novel Ad Networks
                        '.ezoic-ad',
                        '[class*="ezoic"]',
                        '[id*="ezoic"]',
                        '.mediavine',
                        '[class*="mediavine"]',
                        '[id*="mediavine"]',
                        '[class*="monetag"]',
                        '[id*="monetag"]',
                        '[class*="adsterra"]',
                        '[id*="adsterra"]',
                        '[class*="popads"]',
                        '[id*="popads"]',
                        '[class*="propeller"]',
                        '[id*="propeller"]',
                        '[class*="mgid"]',
                        '[id*="mgid"]',
                        '[class*="exoclick"]',
                        '[id*="exoclick"]',
                        '[class*="taboola"]',
                        '[id*="taboola"]',
                        '#taboola-below-article-thumbnails',
                        '[class*="outbrain"]',
                        '[id*="outbrain"]',
                        // Fixed UI, Navigation & Floating Toolbars
                        '.chapter-nav',
                        '[class*="chapter-nav"]',
                        '[id*="chapter-nav"]',
                        '.nav-links',
                        '[class*="nav-links"]',
                        '.next-prev-btn',
                        '[class*="next-prev"]',
                        '[class*="prev-next"]',
                        '.pagination',
                        '[class*="pagination"]',
                        '[id*="pagination"]',
                        '.floating-toolbar',
                        '[class*="floating-nav"]',
                        '[class*="sticky-nav"]',
                        // Donation, Crowdfunding & Call-to-Action Widgets
                        '.donate-box',
                        '[class*="donate-box"]',
                        '[id*="donate-box"]',
                        '[class*="donate"]',
                        '[id*="donate"]',
                        '.patreon-widget',
                        '[class*="patreon"]',
                        '[id*="patreon"]',
                        '.kofi',
                        '[class*="kofi"]',
                        '[id*="kofi"]',
                        '[class*="ko-fi"]',
                        '[id*="ko-fi"]',
                        '.vote-box',
                        '[class*="vote-box"]',
                        // Comment Sections
                        '.comments-area',
                        '[class*="comments-area"]',
                        '#disqus_thread',
                        '.fb-comments',
                        '[class*="fb-comments"]',
                        '#comments',
                        '.comment-section',
                        '[class*="comment-list"]',
                        // Social Share Buttons
                        '.share-buttons',
                        '[class*="share-buttons"]',
                        '.social-share',
                        '[class*="social-share"]',
                        '[class*="post-share"]'
                    ]
                }
            });
        }
        getProtectedTemplateNames() { return [...this.PROTECTED_TEMPLATE_NAMES]; }
        getScriptPrefix() { return this.SCRIPT_PREFIX; }
        getUiId(name) {
            if (this.UI_IDS[name]) return this.UI_IDS[name];
            throw new Error(`ConfigManager: Unknown UI ID key: ${name}`);
        }
        getSafetySelectId(categoryName) {
            return this.SCRIPT_PREFIX + 'safety_settings_' + categoryName.replace('HARM_CATEGORY_', '').toLowerCase() + "_select";
        }
        getAllUiIds() { return {...this.UI_IDS}; }
        getSettingKey(schemaKey) { return this.SETTINGS_SCHEMA[schemaKey]?.key; }
        getAllSettingKeys() {
            return Object.keys(this.SETTINGS_SCHEMA).reduce((acc, k) => {
                acc[k] = this.SETTINGS_SCHEMA[k].key;
                return acc;
            }, {});
        }
        getStorageKeyForSetting(internalSettingKey) {
            for (const schemaKey in this.SETTINGS_SCHEMA) {
                if (this.SETTINGS_SCHEMA[schemaKey].key === internalSettingKey) {
                    return this.SETTINGS_SCHEMA[schemaKey].storageKey;
                }
            }
            return null;
        }
        getAllStorageKeysMapping() {
            const mapping = {};
            for (const schemaKey in this.SETTINGS_SCHEMA) {
                mapping[this.SETTINGS_SCHEMA[schemaKey].key] = this.SETTINGS_SCHEMA[schemaKey].storageKey;
            }
            return mapping;
        }
        getDefaultSetting(internalSettingKey) {
            for (const schemaKey in this.SETTINGS_SCHEMA) {
                if (this.SETTINGS_SCHEMA[schemaKey].key === internalSettingKey) {
                    const setting = this.SETTINGS_SCHEMA[schemaKey].default;
                    return typeof setting === 'object' && setting !== null ? JSON.parse(JSON.stringify(setting)) : setting;
                }
            }
            return undefined;
        }
        getAllDefaultSettings() {
            const defaults = {};
            for (const schemaKey in this.SETTINGS_SCHEMA) {
                const setting = this.SETTINGS_SCHEMA[schemaKey].default;
                defaults[this.SETTINGS_SCHEMA[schemaKey].key] = typeof setting === 'object' && setting !== null ? JSON.parse(JSON.stringify(setting)) : setting;
            }
            return defaults;
        }
        getConstant(name) { return this.CONSTANTS[name]; }
        getGeminiBaseUrl() { return this.CONSTANTS.GEMINI_API_BASE_URL; }
        getDisplayFonts() { return [...this.CONSTANTS.DISPLAY_FONTS]; }
        getColorThemes() { return [...this.CONSTANTS.COLOR_THEMES]; }
        getSafetyCategoriesMap() { return {...this.CONSTANTS.SAFETY_CATEGORIES_MAP}; }
        getSafetyThresholdsMap() { return {...this.CONSTANTS.SAFETY_THRESHOLDS_MAP}; }
    }

    class DomainCacheManager {
    constructor(domain, logger, storageService, cacheType = 'cleanup', cacheVersion = 3, maxCacheSize = 50) {
        this.domain = domain;
        this.logger = logger;
        this.storageService = storageService;
        this.cacheType = cacheType;
        this.CACHE_VERSION = cacheVersion;
        this.CACHE_KEY = `wnvt_${this.cacheType}_cache_v${this.CACHE_VERSION}_${this.domain}`;
        this.MAX_CACHE_SIZE = maxCacheSize;
        this.logger.info(`DomainCacheManager (${this.cacheType}) initialized for ${this.domain} with cache key ${this.CACHE_KEY}.`);
    }

    async _getCache() { // Chuyển thành async
        try {
            // Mặc định cho _getCache nếu không tìm thấy hoặc lỗi
            const cachedData = await this.storageService.get(this.CACHE_KEY, null); // Lấy từ StorageService

            if (cachedData && typeof cachedData === 'object' && Array.isArray(cachedData.selectors)) {
                // Version check is implicitly handled by CACHE_KEY
                return cachedData;
            }
        } catch (e) {
            this.logger.error(`Error reading cache for ${this.domain} via StorageService:`, e);
            // Nếu có lỗi nghiêm trọng, có thể cân nhắc xóa cache hỏng
            // await this.storageService.delete(this.CACHE_KEY);
        }
        return { selectors: [] }; // Return default structure if no valid cache
    }

    async _saveCache(cacheData) { // Chuyển thành async
        try {
            cacheData.selectors.sort((a, b) => b.weight - a.weight);
            if (cacheData.selectors.length > this.MAX_CACHE_SIZE) {
                cacheData.selectors = cacheData.selectors.slice(0, this.MAX_CACHE_SIZE);
            }
            await this.storageService.set(this.CACHE_KEY, cacheData); // Lưu bằng StorageService
            this.logger.debug(`Cache saved for ${this.domain} via StorageService. Size: ${cacheData.selectors.length}`);
        } catch (e) {
            this.logger.error(`Error saving cache for ${this.domain} via StorageService:`, e);
        }
    }

    async getEffectiveSelectors(defaultSelectors = []) { // Chuyển thành async
        const cache = await this._getCache(); // Đợi _getCache
        const validCached = (cache.selectors || [])
            .filter(s => s && s.weight > 0)
            .map(s => s.selector);

        if (!defaultSelectors || defaultSelectors.length === 0) {
            return validCached;
        }

        // Luôn giữ bộ defaultSelectors làm nòng cốt; cache chỉ dùng để bổ sung selector riêng của domain
        const defaultSet = new Set(defaultSelectors);
        const supplementalDomainSelectors = validCached.filter(s => !defaultSet.has(s));
        const merged = [...defaultSelectors, ...supplementalDomainSelectors];

        if (supplementalDomainSelectors.length > 0) {
            this.logger.info(`Combined ${defaultSelectors.length} core default selectors with ${supplementalDomainSelectors.length} domain-cached selectors for ${this.domain}. Total: ${merged.length}.`);
        } else {
            this.logger.info(`Using core default selectors (${defaultSelectors.length}) for ${this.domain}.`);
        }
        return merged;
    }

    async updateCache(successfulSelectorsThisRun, attemptedSelectorsThisRun, defaultSelectors = []) { // Chuyển thành async
        const cache = await this._getCache(); // Đợi _getCache
        const successSet = new Set(successfulSelectorsThisRun);
        const defaultSet = new Set(defaultSelectors);

        attemptedSelectorsThisRun.forEach(selector => {
            // Đối với cache dọn dẹp, không trừ điểm / loại bỏ các selector mặc định phổ quát
            if (this.cacheType === 'cleanup' && defaultSet.has(selector)) {
                return;
            }

            let existingEntry = cache.selectors.find(item => item.selector === selector);
            if (successSet.has(selector)) {
                if (existingEntry) {
                    existingEntry.weight = Math.min(10, (existingEntry.weight || 0) + 2);
                } else {
                    cache.selectors.push({ selector, weight: 2 });
                }
            } else {
                if (existingEntry) {
                    existingEntry.weight = Math.max(0, (existingEntry.weight || 0) - 1);
                }
            }
        });

        cache.selectors = cache.selectors.filter(s => s.weight > 0);
        await this._saveCache(cache); // Đợi _saveCache
    }

    async checkAndResetCacheIfNeeded(cachedSelectorsAttempted, selectorsThatActuallyRemovedContent, defaultSelectors = []) { // Chuyển thành async
        const cache = await this._getCache();
        if (!cache.selectors || cache.selectors.length === 0) {
            return false;
        }

        const defaultSet = new Set(defaultSelectors);
        // Chỉ đánh giá tỷ lệ thất bại trên các selector học riêng của domain, KHÔNG phạt bộ mặc định
        const domainEntries = cache.selectors.filter(s => !defaultSet.has(s.selector));
        if (domainEntries.length < 3) {
            return false;
        }

        const failureThresholdRatio = 0.7;
        let failedCachedCount = 0;
        const successSet = new Set(selectorsThatActuallyRemovedContent);

        domainEntries.forEach(entry => {
            if (!successSet.has(entry.selector)) {
                failedCachedCount++;
            }
        });

        const failureRatio = failedCachedCount / domainEntries.length;

        if (failureRatio >= failureThresholdRatio) {
            this.logger.warn(`High failure rate (${(failureRatio * 100).toFixed(1)}%) for domain-specific cached selectors on ${this.domain}. Pruning ineffective domain selectors.`);
            // Chỉ xóa các selector domain không hiệu quả, tuyệt đối không ảnh hưởng selector mặc định
            cache.selectors = cache.selectors.filter(s => defaultSet.has(s.selector) || successSet.has(s.selector));
            await this._saveCache(cache);
            return true;
        }
        return false;
    }

    async resetCache() { // Chuyển thành async
        await this.storageService.delete(this.CACHE_KEY); // Xóa bằng StorageService
        this.logger.info(`Cache for ${this.domain} has been reset via StorageService.`);
    }
}

// --- CORE LOGIC: TEXT PROCESSING (Shared between Main Thread & Worker) ---
const TextProcessingStrategies = {
    // Character class constants — shared between findOptimalSplitPoint and any
    // future text analysis methods. Defined once to avoid drift.
    _SENTENCE_ENDINGS: new Set(['.', '!', '?', '…', '。', '！', '？']),
    _QUOTE_ENDINGS: new Set(['"', '”', "'", '’', '»', '」']),
    _PAUSE_MARKS: new Set([',', ';', ':', '—', '–', '，', '、']),

    findOptimalSplitPoint: function(text, maxLength, allowance = 0) {
        const maxLimit = maxLength + allowance;
        if (text.length <= maxLimit) return text.length;

        const effectiveLimit = Math.min(maxLimit, text.length);
        const minSearchIndex = Math.floor(maxLength * 0.5);
        const searchStart = Math.max(minSearchIndex, effectiveLimit - (allowance || 200));

        // Tier 1: sentence endings (strongest break signal)
        for (let i = effectiveLimit - 1; i >= searchStart; i--) {
            const char = text[i];
            if (this._SENTENCE_ENDINGS.has(char)) {
                let splitIndex = i + 1;
                // Absorb trailing quote after sentence ending
                if (splitIndex < text.length && this._QUOTE_ENDINGS.has(text[splitIndex])) splitIndex++;
                // Skip abbreviation-like patterns (e.g. "U.S. officials", "v1.0")
                if (char === '.' && i > 1 && splitIndex < text.length) {
                    const prev = text[i - 1];
                    const next = text[splitIndex];
                    if (/[A-Z0-9]/.test(prev) && /[a-zA-Z0-9]/.test(next)) continue;
                }
                if (splitIndex >= text.length || /\s/.test(text[splitIndex])) return splitIndex;
            }
        }

        // Tier 2: pause marks (commas, semicolons, colons, dashes)
        for (let i = effectiveLimit - 1; i >= searchStart; i--) {
            if (this._PAUSE_MARKS.has(text[i])) return i + 1;
        }

        // Tier 3: any whitespace (last resort before hard cut)
        for (let i = effectiveLimit - 1; i >= searchStart; i--) {
            if (/\s/.test(text[i])) return i + 1;
        }

        return effectiveLimit;
    },

    splitTextIntoChunks: function(text, maxCharsPerChunk, oversizeAllowance) {
        if (!text || typeof text !== 'string' || text.trim().length === 0) return [];

        const chunks = [];
        // \r?\n handles both Unix and Windows line endings
        const parts = text.split(/(\r?\n+)/);
        let currentChunk = '';

        const limit = maxCharsPerChunk + oversizeAllowance;
        const finder = this.findOptimalSplitPoint.bind(this);

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (part.length === 0) continue;

            if (currentChunk.length + part.length <= limit) {
                currentChunk += part;
            } else {
                // Flush current chunk before handling the oversized part
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
                            const idx = finder(remaining, maxCharsPerChunk, oversizeAllowance);
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
    }
};

// --- 2. UTILITY FUNCTIONS / CLASSES ---

/**
 * Core utility class following Separation of Concerns
 * Each method has single responsibility and clear purpose
 */