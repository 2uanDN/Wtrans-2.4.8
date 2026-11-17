const EXTRACTORS = {
    'default': {
    name: "Generic (Refactored Pipeline v3.1 - Production Ready)",

    // ============================================================================
    // 1. CONFIGURATION CONSTANTS
    // ============================================================================
    EXTRACTION_CONSTANTS: {
        DYNAMIC_WAIT: {
            MAX_AJAX_TIME_MS: 1200,
            DOM_STABILITY_MS: 800
        },
        READABILITY: {
            CHAR_THRESHOLD: 100,
            TOP_CANDIDATES: 5,
            WORKER_TIMEOUT_MS: 3000
        },
        FILTERING: {
            JUNK_LINE_MAX_LENGTH: 150, // Chỉ lọc dòng ngắn
            TITLE_DEDUP_CHECK_LENGTH: 200 // Độ dài chuỗi kiểm tra lặp tiêu đề
        }
    },

    // ============================================================================
    // 2. JUNK PATTERN DETECTION (Enhanced Multilingual & Robust Structural Logic)
    // ============================================================================
    JUNK_PATTERNS: {
        // Fast Path: O(1) Set Lookup hỗ trợ đa ngôn ngữ (Anh, Việt, Trung, Nhật, Hàn)
        EXACT_KEYWORDS: new Set([
            // English
            'advertisement', 'advertisements', 'ad', 'ads', 'sponsored', 'sponsor', 'subscribe',
            'login', 'sign up', 'sign in', 'register', 'share', 'follow us', 'read more', 'read less',
            'copyright', 'all rights reserved', 'terms of service', 'terms of use', 'privacy policy', 'cookie policy',
            'next chapter', 'previous chapter', 'prev chapter', 'next ch', 'prev ch', 'next page', 'previous page',
            'table of contents', 'toc', 'report error', 'report chapter', 'report broken',
            'bookmark', 'add to library', 'vote', 'vote for this novel', 'support the author',
            'support us', 'join discord', 'join our discord', 'discord server',
            // Vietnamese
            'quảng cáo', 'tài trợ', 'đăng nhập', 'đăng ký', 'chia sẻ', 'theo dõi', 'đọc tiếp',
            'bản quyền', 'điều khoản sử dụng', 'chính sách bảo mật', 'chính sách cookie',
            'chương sau', 'chương trước', 'chương tiếp', 'chương kế', 'hồi sau', 'hồi trước',
            'trang sau', 'trang trước', 'mục lục', 'báo lỗi', 'báo lỗi chương', 'báo chương lỗi',
            'đánh dấu', 'thêm vào tủ', 'bình chọn', 'đề cử', 'ủng hộ', 'tham gia discord', 'kênh discord',
            // Chinese
            '广告', '下一章', '上一章', '下章', '上章', '上一页', '下一页',
            '目录', '书签', '加入书签', '投推荐票', '投月票', '打赏', '催更',
            '报错', '举报', '加入书架', '返回目录', '返回书页', '最新章节',
            // Japanese
            '広告', '次の話', '前の話', '次へ', '前へ', '目次', 'しおり', 'しおりを挟む',
            'ブックマーク', '評価する', '感想を書く', 'レビューを書く',
            // Korean
            '광고', '다음 화', '이전 화', '다음화', '이전화', '목차', '북마크', '댓글', '추천'
        ]),

        // Slow Path: Mảng Regex cấu trúc bao quát điều hướng, quảng cáo, mạng xã hội, bản quyền, thông báo
        REGEX_PATTERNS: [
            // 1. Điều hướng chương (Next/Prev Chapter) kèm dấu mũi tên, nút, ngoặc, hoặc "Chapter 10 (Next Chapter)"
            /^\s*(?:<<|<|«|‹|←|◄|\b(?:go\s+to|read)?\s*)\s*(?:next|prev(?:ious)?)\s+(?:chapter|ch\.?|page|episode)\b.*$/i,
            /^\s*(?:next|prev(?:ious)?)\s+(?:chapter|ch\.?|page|episode)\s*(?:>>|>|»|›|→|►|:|\||-).*$/i,
            /^\s*(?:chapter\s+\d+\s*)?[\[\(【]\s*(?:next|prev(?:ious)?|last|first)\s+(?:chapter|ch\.?|page)\s*[\]\)】]\s*$/i,
            /^\s*(?:<<|<|«|‹|←|◄)?\s*(?:chương\s+(?:sau|trước|tiếp|kế)|trang\s+(?:sau|trước)|hồi\s+(?:sau|trước))\s*(?:>>|>|»|›|→|►|:|\||-)?\s*$/i,
            /^\s*(?:<<|<|«|‹|←|◄)?\s*(?:上一[章页回]|下一[章页回]|第[0-9一二三四五六七八九十百千]+[章回]\s*(?:上一[章页回]|下一[章页回]))\s*(?:>>|>|»|›|→|►)?\s*$/i,
            /^\s*(?:<<|<|«|‹|←|◄)?\s*(?:다음\s*[화장회편]|이전\s*[화장회편])\s*(?:>>|>|»|›|→|►)?\s*$/i,
            /^\s*(?:<<|<|«|‹|←|◄)?\s*(?:前の[話章]|次の[話章])\s*(?:>>|>|»|›|→|►)?\s*$/i,

            // 2. Nhãn quảng cáo có dấu phân tách hoặc bọc ngoặc: [Advertisement], Advertisement:, v.v.
            /^\s*[\[\(【\-_–—*#]*\s*(?:advertisement|advertisements|sponsored|ads?|sponsor|quảng\s*cáo|tài\s*trợ|广告|広告|광고)\s*[\]\)】\-_–—*#]*\s*[:\-–—]?\s*$/i,
            /^\s*(?:google\s*ads?|ads\s*by\s*google|taboola|outbrain|ezoic|mediavine)\b.*$/i,

            // 3. Chính sách, bản quyền, ghi chú nguồn & nhóm dịch
            /^\s*(?:\b(?:cookie|privacy)\s+policy|\b(?:gdpr|dmca)\s+notice|posted\s+by|published\s+on|nguồn\s*[:\-]|người\s*dịch\s*[:\-]|biên\s*tập\s*[:\-])/i,
            /^\s*(?:copyright|all\s+rights\s+reserved|tất\s+cả\s+quyền\s+được\s+bảo\s+lưu|©|\(c\))\s+[0-9]{4}/i,
            /^\s*(?:source|translated\s+by|tl\s*note|translator['’]?s?\s*note|trans\s*note|ed\s*note|editor['’]?s?\s*note)\s*[:\-]/i,

            // 4. Kêu gọi quyên góp, Patreon, Ko-fi, Discord
            /^\s*(?:support\s+(?:us|the\s+author|the\s+translator)\s+(?:on|at)|join\s+(?:our\s+)?discord|join\s+us\s+on\s+discord|become\s+a\s+patron)\b.*$/i,
            /^\s*(?:ủng\s+hộ\s+(?:nhóm\s+dịch|tác\s+giả)|tham\s+gia\s+discord|kênh\s+discord)\b.*$/i,
            /^\s*(?:https?:\/\/)?(?:www\.)?(?:patreon\.com|ko-fi\.com|paypal\.me|discord\.(?:gg|com\/invite))\/\S+\s*$/i,

            // 5. Watermark chống trộm / Anti-scraping
            /^\s*(?:if\s+you\s+(?:are\s+reading|find)\s+this\s+(?:story|novel|chapter)\s+on\s+(?:another|any\s+other)\s+(?:site|platform)|this\s+chapter\s+is\s+(?:stolen|taken)\s+from|read\s+(?:only\s+)?at\s+(?:the\s+original|official)\s+source)\b.*$/i,
            /^\s*(?:truyện\s+(?:được\s+đăng|chỉ\s+được\s+đăng)\s+tại|đọc\s+truyện\s+tại\s+trang\s+chính\s+chủ|vui\s+lòng\s+không\s+re-?up|bản\s+dịch\s+thuộc\s+về)\b.*$/i,
            /^\s*(?:本书由[^\n]{1,20}收集整理|首发于[^\n]{1,20}|转载请注明出处|小说首发|最新网址)\b.*$/i,

            // 6. Báo lỗi chương & đánh giá
            /^\s*(?:report\s+(?:broken|missing|wrong)\s+chapter|báo\s+lỗi\s+chương|báo\s+chương\s+lỗi|đánh\s+giá\s+chương\s+này)\s*[:\-]??\s*$/i
        ]
    },

    // ============================================================================
    // 3. MAIN EXTRACTION PIPELINE
    // ============================================================================
    extractContent: async (docBody, logger, configManager, serviceInstance) => {
        // Safe Reference to Config Constants
        // Sử dụng đường dẫn tuyệt đối để tránh lỗi context 'this'
        const SELF = EXTRACTORS['default'];
        const C = configManager.CONSTANTS;
        const EC = SELF.EXTRACTION_CONSTANTS;

        // Performance tracking
        const perf = { start: performance.now(), steps: {} };
        const markStep = (name) => { perf.steps[name] = (performance.now() - perf.start).toFixed(1); };

        // ========================================================================
        // STEP 1: PRE-FLIGHT - Dynamic Content Wait
        // ========================================================================
        await ContentExtractorService.waitForDynamicContent(logger, {
            MIN_ARTICLE_CONTENT_LENGTH: C.MIN_ARTICLE_CONTENT_LENGTH,
            MAX_AJAX_WAIT_TIME: EC.DYNAMIC_WAIT.MAX_AJAX_TIME_MS,
            DOM_STABILITY_THRESHOLD: EC.DYNAMIC_WAIT.DOM_STABILITY_MS
        });
        markStep('wait');

        // ========================================================================
        // STEP 2: PREPARATION - Clone & Clean DOM (OPTIMIZED)
        // ========================================================================
        // [FIX v1.0.2] jsonLdData khai báo ở scope ngoài để Strategy A luôn
        // có access, bất kể reuse-mode hay prepareDocument-mode.
        let workingDoc, successfulSelectors, activeSelectors;
        let jsonLdData = []; // default an toàn cho cả 2 nhánh
        let coreDefaults = [];

        // [OPTIMIZATION] Kiểm tra xem docBody truyền vào đã là bản clone (workingDoc) chưa?
        // Điều kiện: Là thẻ BODY và ownerDocument không phải là document gốc (Live DOM)
        if (docBody && docBody.tagName === 'BODY' && docBody.ownerDocument !== document) {
            logger.info("[Generic] Detected pre-cloned WorkingDoc. Reuse mode ON.");
            workingDoc = docBody.ownerDocument;
            successfulSelectors = new Set();
            activeSelectors = [];
            coreDefaults = [
                ...(C.DOM_CLEANUP_SELECTOR_GROUPS?.CRITICAL_SCRIPTS_STYLES || []),
                ...(C.DOM_CLEANUP_SELECTOR_GROUPS?.ADVERTISEMENTS_PROMOTIONS || [])
            ];
            // Reuse mode: doc title và JSON-LD vẫn phải đọc từ live document
            serviceInstance.lastExtractionOriginalDocTitle = document.title;
            jsonLdData = Array.from(
                document.querySelectorAll('script[type="application/ld+json"]')
            ).map(s => s.textContent);
        } else {
            // Logic cũ: Tự gọi prepareDocument nếu input là Live DOM
            const prepResult = await serviceInstance.prepareDocument();
            workingDoc = prepResult.workingDoc;
            successfulSelectors = prepResult.successfulSelectors;
            activeSelectors = prepResult.activeSelectors;
            coreDefaults = prepResult.uniqueDefaults || [];
            // [FIX v1.0.2] prepareDocument trả về pageTitle string, không phải originalDoc object.
            // Sử dụng trực tiếp thay vì originalDoc.title (undefined → TypeError).
            serviceInstance.lastExtractionOriginalDocTitle = prepResult.pageTitle;
            jsonLdData = prepResult.jsonLdData || [];
        }
        markStep('prepare');

        // ========================================================================
        // STEP 3: EXTRACTION STRATEGIES (Chain of Responsibility)
        // ========================================================================
        let extractedHtml = null;
        let source = "None";

        // ------------------------------------------------------------------------
        // Strategy A: JSON-LD Structured Data (Fastest, Deterministic)
        // ------------------------------------------------------------------------
        if (!extractedHtml) {
            try {
                const docBodyTextLength = (workingDoc?.body || docBody || document.body)?.textContent?.trim()?.length || 0;
                const minJsonLdLength = C.MIN_JSON_LD_CONTENT_LENGTH || 1000;

                // [CHANGE]: Duyệt qua mảng dữ liệu text đã trích xuất sẵn
                // Thay vì querySelectorAll trên DOM gốc
                for (let i = 0; i < jsonLdData.length; i++) {
                    try {
                        const jsonData = JSON.parse(jsonLdData[i]); // Parse string JSON

                        // Hàm đệ quy duyệt sâu vào JSON Graph (Giữ nguyên logic cũ)
                        const extractArticleBody = (node) => {
                            if (!node || typeof node !== 'object') return null;
                            if (node.articleBody) return node.articleBody;
                            if (node.text && (node['@type'] === 'Article' || node['@type'] === 'Chapter' || node['@type'] === 'BlogPosting')) {
                                return node.text;
                            }
                            for (const key in node) {
                                if (node.hasOwnProperty(key)) {
                                    const found = extractArticleBody(node[key]);
                                    if (found) return found;
                                }
                            }
                            return null;
                        };

                        const bodyText = extractArticleBody(jsonData);

                        if (!bodyText) continue;

                        if (bodyText.length < minJsonLdLength) {
                            logger.warn(`[Generic] Strategy A: JSON-LD candidate rejected (length ${bodyText.length} < MIN_JSON_LD_CONTENT_LENGTH ${minJsonLdLength}).`);
                            continue;
                        }

                        // So sánh tương quan dung lượng văn bản giữa JSON-LD với DOM thực tế (docBodyTextLength)
                        if (docBodyTextLength > 1200 && bodyText.length < Math.min(docBodyTextLength * 0.4, 2500)) {
                            logger.warn(`[Generic] Strategy A: JSON-LD candidate rejected as teaser/summary. JSON-LD length: ${bodyText.length}, DOM text length: ${docBodyTextLength} (< threshold ${Math.min(docBodyTextLength * 0.4, 2500)}). Delegating to DOM strategies.`);
                            continue;
                        }

                        const hasHtmlTags = /<[a-z][\s\S]*>/i.test(bodyText);

                        if (hasHtmlTags) {
                            extractedHtml = bodyText;
                            source = "JSON-LD Structured Data (HTML)";
                        } else {
                            extractedHtml = bodyText
                                .split(/\r?\n+/)
                                .filter(p => p.trim())
                                .map(p => `<p>${p}</p>`)
                                .join('');
                            source = "JSON-LD Structured Data (Text)";
                        }

                        const schemaTitle = jsonData.headline || jsonData.name || jsonData.title;
                        if (schemaTitle) {
                            serviceInstance.lastExtractionReadabilityTitle = schemaTitle;
                        }

                        markStep('extract_json_ld_success');
                        break;
                    } catch (parseError) {
                        continue;
                    }
                }
            } catch (e) {
                logger.debug(`[Generic] JSON-LD extraction skipped: ${e.message}`);
                markStep('extract_json_ld_fail');
            }
        }

        // ------------------------------------------------------------------------
        // Strategy B: Readability via Worker Thread (Non-blocking)
        // ------------------------------------------------------------------------
        if (!extractedHtml && serviceInstance.appServices?.workerPool) {
            const stratStart = performance.now();
            try {
                // Optimization: Send outerHTML directly
                const htmlPayload = workingDoc.documentElement.outerHTML;

                const result = await serviceInstance.appServices.workerPool.exec(
                    'runReadabilityWorker',
                    [
                        htmlPayload,
                        serviceInstance.appServices.readabilityJsCodeString,
                        {
                            charThreshold: EC.READABILITY.CHAR_THRESHOLD,
                            nbTopCandidates: EC.READABILITY.TOP_CANDIDATES
                        }
                    ],
                    { timeout: EC.READABILITY.WORKER_TIMEOUT_MS }
                );

                if (result?.content && result.content.length > C.MIN_PARAGRAPH_CONTENT_LENGTH) {
                    extractedHtml = result.content;
                    serviceInstance.lastReadabilityArticle = result;
                    serviceInstance.lastExtractionReadabilityTitle = result.title;
                    source = "Readability (Worker)";
                    markStep('extract_worker_success');
                }
            } catch (e) {
                // Log debug only, worker failure is expected fallback scenario
                logger.debug(`[Generic] Worker Readability skipped: ${e.message}`);
                markStep('extract_worker_fail');
            }
        }

        // ------------------------------------------------------------------------
        // Strategy C: Readability Main Thread (TỐI ƯU: Sử dụng trực tiếp WorkingDoc nhẹ)
        // ------------------------------------------------------------------------
        if (!extractedHtml && typeof Readability !== 'undefined') {
            const stratStart = performance.now();
            try {
                // TỐI ƯU HÓA: Không tạo clone nữa. workingDoc TỪ prepareDocument ĐÃ LÀ minimalDoc rồi.
                // Điều này tiết kiệm 100% thời gian clone lần 2.
                const reader = new Readability(workingDoc, {
                    charThreshold: EC.READABILITY.CHAR_THRESHOLD
                });
                const article = reader.parse();

                if (article?.content && article.content.length > C.MIN_PARAGRAPH_CONTENT_LENGTH) {
                    extractedHtml = article.content;
                    serviceInstance.lastReadabilityArticle = article;
                    serviceInstance.lastExtractionReadabilityTitle = article.title;
                    source = "Readability (Main Thread)";
                    markStep('extract_main_success');
                }
            } catch (e) {
                logger.warn("[Generic] Main Thread Readability error:", e);
                markStep('extract_main_error');
            }
        }

        // ------------------------------------------------------------------------
        // Strategy D: DOM Analysis (Heuristic Fallback)
        // ------------------------------------------------------------------------
        if (!extractedHtml) {
            const candidate = await Utils.analyzeDOMForMainContent(workingDoc.body, {
                minTextLength: C.MIN_ARTICLE_CONTENT_LENGTH / 2
            }, logger, C, serviceInstance.contentCacheManager);

            if (candidate) {
                extractedHtml = candidate.innerHTML;
                source = "DOM Analysis (Heuristic)";
                markStep('extract_heuristic');
            }
        }

        // ------------------------------------------------------------------------
        // Strategy E: Body Fallback (Last Resort)
        // ------------------------------------------------------------------------
        if (!extractedHtml) {
            extractedHtml = workingDoc.body.innerHTML;
            source = "Body Fallback";
        }

        // ========================================================================
        // STEP 4: FINALIZATION - Convert & Filter
        // ========================================================================

        // 4.1 HTML to Plain Text (Integrated DOMPurify)
        let finalCleanText = Utils.htmlToPlainText(extractedHtml);
        markStep('html_to_text');

        // 4.2 Junk Line Filtering (CRITICAL FIX v3.1 - Enhanced Multilingual & Punctuation Resilient)
        if (finalCleanText) {
            const exactKeywords = SELF.JUNK_PATTERNS.EXACT_KEYWORDS;
            const regexPatterns = SELF.JUNK_PATTERNS.REGEX_PATTERNS;

            finalCleanText = finalCleanText.split('\n').filter(line => {
                const trimmed = line.trim();

                // Rule 1: Keep empty lines (formatting) and long lines (content)
                if (trimmed.length === 0 || trimmed.length >= EC.FILTERING.JUNK_LINE_MAX_LENGTH) {
                    return true;
                }

                const lower = trimmed.toLowerCase();

                // Rule 2: Fast Path - Exact Match & Punctuation-Decorated Check
                // Loại bỏ ký tự bao bọc: [Advertisement] -> advertisement, Next Chapter >> -> next chapter
                const normalized = lower
                    .replace(/^[\s\-_–—~*#=[\](){}<>«»‹›→←►◄:|/\\•·]+|[\s\-_–—~*#=[\](){}<>«»‹›→←►◄:|/\\•·]+$/gu, '')
                    .trim();

                if (exactKeywords.has(lower) || (normalized && exactKeywords.has(normalized))) {
                    return false;
                }

                // Rule 3: Slow Path - Comprehensive Regex Pattern Matching
                if (Array.isArray(regexPatterns)) {
                    if (regexPatterns.some(pattern => pattern.test(trimmed))) {
                        return false;
                    }
                } else if (regexPatterns && regexPatterns.test(trimmed)) {
                    return false;
                }

                return true;
            }).join('\n');
        }
        markStep('filter_junk');

        // ========================================================================
        // STEP 5: CACHE UPDATE (Async & Fire-and-Forget)
        // ========================================================================
        if (serviceInstance.domainCacheManager) {
            // Simplified logic: Just try to update, if it fails, log and ignore.
            // Truyền coreDefaults để không phạt bộ selector nòng cốt
            serviceInstance.domainCacheManager
                .updateCache(Array.from(successfulSelectors), activeSelectors, coreDefaults)
                .then(() => serviceInstance.domainCacheManager.checkAndResetCacheIfNeeded(
                    activeSelectors,
                    Array.from(successfulSelectors),
                    coreDefaults
                ))
                .catch(err => logger.debug("[Cache] Update skipped:", err));
        }

        // ========================================================================
        // RESULT LOGGING
        // ========================================================================
        const totalTime = (performance.now() - perf.start).toFixed(1);
        logger.info(
            `Extraction Complete. Source: ${source}. Time: ${totalTime}ms. Length: ${finalCleanText.length}. Steps: ${JSON.stringify(perf.steps)}`
        );

        return finalCleanText;
    }
    },
    // EXTRACTORS['xenforo_generic']
'xenforo_generic': {
    name: 'XenForo Generic (Thread + Comments)',

    // [OPTIMIZATION] Detect an toàn hơn, sử dụng check class trên <html> body trước khi query sâu
    detectXenForo: function() {
        const docEl = document.documentElement;
        const body = document.body;
        // Fast checks first (attributes/classes)
        const isXfApp = docEl.getAttribute('data-app') === 'public';
        const isXfThread = body.classList.contains('job_thread_view') || body.classList.contains('thread_view');

        if (isXfApp || isXfThread) return true;

        // Slower checks (Content search)
        const hasCopyright = document.querySelector('.copyright')?.textContent?.includes('XenForo');
        return !!hasCopyright && !!document.querySelector('.message-body, .bbWrapper');
    },

    selectors: { contentBox: null },

    // [CRITICAL FIX] Input `docBody` bây giờ là CLONE từ extractMainContent
    extractContent: async function(docBody, loggerInstance, configManagerInstance, serviceInstance) {
        loggerInstance.info("XenForo Extractor: Starting extraction on Working Document...");

        const containerSelector = 'article.message, li.message, .post';
        const contentSelector = '.bbWrapper, .messageText, .message-content';
        const authorSelector = '.message-name, .username, .author';
        const signatureSelector = '.message-signature, .signature';
        const junkSelector = '.message-footer, .message-attribution, .reactionsBar, .shareControls, script, style, .message-header';

        // [CRITICAL FIX] Query trên docBody (Clone), KHÔNG phải document (Live)
        const posts = docBody.querySelectorAll(containerSelector);

        if (!posts || posts.length === 0) {
            loggerInstance.warn("XenForo Extractor: No posts found in WorkingDoc. Falling back.");
            return await ContentExtractorService.GENERIC_READABILITY_CONFIG.extractContent(docBody, loggerInstance, configManagerInstance, serviceInstance);
        }

        let fullThreadContent = "";
        let commentCount = 0;

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];

            // [OPTIMIZATION] Không cần cloneNode(true) nữa vì `post` đã nằm trong workingDoc (là bản clone)
            // Ta có thể thao tác trực tiếp (remove child) trên `post` mà không ảnh hưởng UI thật

            // A. Dọn dẹp rác trực tiếp trên node clone này
            post.querySelectorAll(signatureSelector).forEach(el => el.remove());
            post.querySelectorAll(junkSelector).forEach(el => el.remove());

            // B. Lấy thông tin
            const author = post.querySelector(authorSelector)?.textContent?.trim() || "Unknown";
            const contentEl = post.querySelector(contentSelector);

            if (contentEl) {
                let text = Utils.htmlToPlainText(contentEl.innerHTML);
                if (text.length < 5) continue;

                if (i === 0) {
                    fullThreadContent += `${text}\n\n====================================\n--- BÌNH LUẬN / THẢO LUẬN ---\n====================================\n\n`;
                } else {
                    commentCount++;
                    fullThreadContent += `[${author}]:\n${text}\n\n------------------------------------\n\n`;
                }
            }
        }

        loggerInstance.info(`XenForo Extractor: Processed 1 main post and ${commentCount} comments.`);
        return fullThreadContent;
    }
},
// EXTRACTORS['voz_specific']
'voz_specific': {
    name: 'Voz.vn (Clean: Thread + Comments)',
    matchHostIncludes: ['voz.vn'],
    selectors: { contentBox: null },

    // [CRITICAL FIX] Sử dụng docBody (Clone) được truyền vào
    extractContent: async function(docBody, loggerInstance, configManagerInstance, serviceInstance) {
        loggerInstance.info("Voz.vn Extractor: Processing on Safe Clone...");

        const postContainerSelector = '.message--post';
        const contentSelector = '.bbWrapper';
        const authorSelector = '.message-name';

        const junkSelectors = [
            'time', '.u-dt', '.message-attribution', '.message-attribution-opposite',
            '.message-minorHighlight', '.message-signature', '.message-footer',
            '.message-newIndicator', '.reactionsBar', 'script', 'style'
        ];

        // [CRITICAL FIX] Query trên docBody (Clone)
        const posts = docBody.querySelectorAll(postContainerSelector);

        if (!posts || posts.length === 0) {
            return await EXTRACTORS['default'].extractContent(docBody, loggerInstance, configManagerInstance, serviceInstance);
        }

        let fullContent = "";
        let postCount = 0;

        for (let i = 0; i < posts.length; i++) {
            const post = posts[i]; // Đã là element trong workingDoc
            if (post.textContent.length < 10) continue; // Skip rác nhẹ

            // [OPTIMIZATION] Thao tác trực tiếp trên workingDoc element
            if (i === 0) {
                const expandLinks = post.querySelectorAll('.bbCodeBlock-expandLink');
                expandLinks.forEach(el => el.remove());
            } else {
                post.querySelectorAll('.bbCodeBlock--quote').forEach(el => el.remove());
            }

            junkSelectors.forEach(sel => {
                post.querySelectorAll(sel).forEach(el => el.remove());
            });

            const author = post.querySelector(authorSelector)?.textContent?.trim() || "Unknown";
            const postNum = `#${i+1}`;
            const contentEl = post.querySelector(contentSelector);

            if (contentEl) {
                let text = Utils.htmlToPlainText(contentEl.innerHTML);
                text = text.replace(/Click to expand\.\.\./gi, '');

                if (text.trim().length === 0) continue;
                postCount++;

                if (i === 0) {
                    fullContent += `[${postNum}] CHỦ THREAD: ${author}\n====================================\n${text}\n====================================\n\n--- MỤC BÌNH LUẬN ---\n\n`;
                } else {
                    fullContent += `[${postNum}] ${author}:\n${text}\n\n-------------------\n\n`;
                }
            }
        }

        // [CRITICAL FIX] Lấy title từ serviceInstance (đã cache trước khi prep), KHÔNG đọc document.title
        let pageTitle = serviceInstance.lastExtractionOriginalDocTitle || "Voz Thread";
        pageTitle = pageTitle.replace(/\| vozForums|\| theNEXTvoz/g, '').trim();

        if (fullContent.trim().length === 0) {
             return await EXTRACTORS['default'].extractContent(docBody, loggerInstance, configManagerInstance, serviceInstance);
        }

        return `CHỦ ĐỀ: ${pageTitle}\n\n` + fullContent;
    }
},
// EXTRACTORS['sangtacviet_specific']
'sangtacviet_specific': {
    name: 'SangTacViet',
    matchHostIncludes: ['sangtacviet.app', '14.225.254.182', 'sangtacviet.com'],
    selectors: { contentBox: "#content-container .contentbox[id^='cld-']" },

    // [CRITICAL FIX] Input `safeContentBox` là element từ WorkingDoc (đã được clone an toàn)
    extractContent: async function(safeContentBox, loggerInstance, configManagerInstance, serviceInstance) {
        if (!safeContentBox) {
            loggerInstance.warn('SangTacViet Specific: No contentBoxElement found in WorkingDoc. Returning empty.');
            return "";
        }

        // [OPTIMIZATION] Không cần clone lại lần nữa. safeContentBox đã nằm trong WorkingDoc.
        // Ta thao tác trực tiếp trên nó để tiết kiệm bộ nhớ.
        loggerInstance.info(`SangTacViet Specific: Processing Safe Clone <${safeContentBox.tagName}>`);

        // 1. Dọn dẹp rác (Async Safe)
        const junkPatterns = ["@Bạn đang đọc bản lưu trong hệ thống", "Bạn đang xem văn bản gốc chưa dịch", "Vì vấn đề nội dung, nguồn này không hỗ trợ xem văn bản gốc"];
        const otherJunkSelectors = '.adsbygoogle, script, style';

        safeContentBox.querySelectorAll(otherJunkSelectors).forEach(el => el.remove());

        // Hàm walk để duyệt và xóa text node chứa junk
        const walkAndClean = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                for (const pattern of junkPatterns) {
                    if (node.textContent.includes(pattern)) {
                        const parent = node.parentNode;
                        if (parent && ['P', 'DIV', 'CENTER'].includes(parent.tagName) && parent.textContent.trim() === pattern) {
                            parent.remove();
                        } else {
                            node.textContent = node.textContent.replace(pattern, '').trim();
                        }
                        break;
                    }
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                Array.from(node.childNodes).forEach(walkAndClean);
            }
        };

        walkAndClean(safeContentBox);

        // 2. Xử lý các node `<i>` đặc biệt
        const iTags = safeContentBox.querySelectorAll('i[t]');
        for (let i = 0; i < iTags.length; i++) {
            const iTag = iTags[i];
            const textContent = iTag.getAttribute('t') || iTag.textContent || "";

            if (textContent) {
                // [CRITICAL FIX] Tạo TextNode từ ownerDocument của element hiện tại (WorkingDoc)
                // Thay vì dùng document.createTextNode (Live DOM)
                const textNode = safeContentBox.ownerDocument.createTextNode(textContent + " ");
                iTag.parentNode.replaceChild(textNode, iTag);
            } else {
                iTag.remove();
            }
        }

        // 3. Trích xuất text từ DOM sạch
        const cleanedText = Utils.htmlToPlainText(safeContentBox.innerHTML);

        loggerInstance.info(`SangTacViet specific processing applied. Final Length: ${cleanedText.length}`);
        return cleanedText;
    }
}
}
class DOMBuilder {
        /**
         * @param {Logger} logger - Instance của hệ thống logging
         */
        constructor(logger) {
            this.logger = logger;
        }

        /**
         * Cấp 1.2 (DRY): Tạo một DOM Element với các thuộc tính và phần tử con.
         * @param {string} tag - Tên thẻ HTML (ví dụ: 'div', 'span')
         * @param {Object} attributes - Object chứa các thuộc tính (id, className, style, dataset, v.v.)
         * @param {Array|Node|string} children - Các phần tử con (Node, chuỗi, hoặc mảng các Node/chuỗi)
         * @returns {HTMLElement} Element đã được khởi tạo
         */
        createEl(tag, attributes = {}, children = []) {
            const el = document.createElement(tag);

            for (const key in attributes) {
                if (!attributes.hasOwnProperty(key)) continue;

                const value = attributes[key];

                if (key === 'className') {
                    el.className = value;
                } else if (key === 'textContent') {
                    el.textContent = value;
                } else if (key === 'innerHTML') {
                    if (typeof value === 'string') {
                        if (typeof DOMPurify !== 'undefined') {
                            // [GUARD v1.0.3] Auto-sanitize using DOMPurify
                            el.innerHTML = DOMPurify.sanitize(value, {
                                ADD_TAGS: ['svg', 'path', 'circle', 'line', 'polyline', 'rect', 'g', 'polygon'],
                                ADD_ATTR: ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'cx', 'cy', 'r', 'd']
                            });
                        } else {
                            throw new Error(`DOMPurify is not available. Safe assignment of innerHTML on <${el.tagName}> is blocked.`);
                        }
                    } else {
                        el.innerHTML = value;
                    }
                } else if (key === 'style' && typeof value === 'object') {
                    Object.assign(el.style, value);
                } else if (key === 'dataset' && typeof value === 'object') {
                    for (const dataKey in value) {
                        el.dataset[dataKey] = value[dataKey];
                    }
                } else if (key.startsWith('on') && typeof value === 'function') {
                    // Cấp 1.3: Chuyển đổi 'onClick' thành 'click' và dùng addEventListener
                    const eventName = key.substring(2).toLowerCase();
                    el.addEventListener(eventName, value);
                } else if (typeof value === 'boolean') {
                    // Xử lý an toàn các boolean attributes (disabled, checked, v.v.)
                    const lowerKey = key.toLowerCase();
                    const specialBooleans = ['draggable', 'contenteditable', 'readonly'];

                    if (specialBooleans.includes(lowerKey)) {
                        if (lowerKey === 'draggable') el.draggable = value;
                        else if (lowerKey === 'contenteditable') el.contentEditable = value ? 'true' : 'false';
                        else if (lowerKey === 'readonly') el.readOnly = value;
                    } else if (['disabled', 'checked', 'selected', 'multiple', 'required', 'hidden'].includes(lowerKey)) {
                        el[lowerKey] = value;
                    } else {
                        if (value) el.setAttribute(key, '');
                        else el.removeAttribute(key);
                    }
                } else if (key === 'htmlFor') {
                    el.htmlFor = value;
                } else if (value !== null && value !== undefined && value !== false) {
                    el.setAttribute(key, value);
                }
            }

            this._appendChildren(el, children);
            return el;
        }

        /**
         * Cấp 1.5.1 (Hiệu năng): Thêm các phần tử con vào phần tử cha, tối ưu hóa bằng DocumentFragment.
         * @private
         * @param {HTMLElement} parent - Phần tử cha
         * @param {Array|Node|string} children - Phần tử con hoặc mảng phần tử con
         */
        _appendChildren(parent, children) {
            if (!children) return;

            // Đảm bảo children luôn là mảng để xử lý đồng nhất
            const childrenArray = Array.isArray(children) ? children : [children];

            // Fast fail: Nếu mảng rỗng, dừng ngay lập tức để tiết kiệm CPU
            if (childrenArray.length === 0) return;

            // SỬ DỤNG DOCUMENT FRAGMENT: Batch tất cả node trước khi đẩy vào parent
            const fragment = document.createDocumentFragment();

            childrenArray.forEach(child => {
                if (child instanceof Node) {
                    fragment.appendChild(child);
                } else if (typeof child === 'string' || typeof child === 'number') {
                    fragment.appendChild(document.createTextNode(String(child)));
                } else if (child) {
                    // Cấp 2.3 (Error Handling): Bắt lỗi âm thầm và log nếu truyền sai kiểu dữ liệu
                    if (this.logger) this.logger.warn(`DOMBuilder: Skipping invalid child of type '${typeof child}'`, child);
                }
            });

            // Chỉ thực hiện 1 lần DOM mutation duy nhất lên parent thực tế
            parent.appendChild(fragment);
        }

        /**
         * Cấp 1.2 (DRY): Helper chuyên dụng để tạo Button với các thiết lập chuẩn.
         * @param {Object} options - Cấu hình nút
         * @returns {HTMLButtonElement}
         */
        createButton({ id, text, title, onClick, className, disabled = false, innerHTML = null, dataset = {}, style = {} }) {
            const effectiveClassName = className || `wnvt_v1_button_default`;

            const attrs = {
                id,
                title,
                className: effectiveClassName,
                type: 'button', // RÀNG BUỘC KIẾN TRÚC: Luôn set type='button' để ngăn chặn hành vi submit form mặc định
                disabled,
                dataset,
                style
            };

            if (innerHTML) {
                attrs.innerHTML = innerHTML;
            } else if (text !== undefined) {
                attrs.textContent = text;
            }

            if (onClick) {
                attrs.onClick = onClick;
            }

            return this.createEl('button', attrs);
        }
    }

class IconManager {
    constructor() {
        this.icons = {
            'settings': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 0 2.4l-.15.08a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1 0-2.4l.15.08a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
            'x': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
            'minus': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            'chevron-up': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
            'chevron-down': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`,
            'restore': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/></svg>`,
            'alert-circle': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
            'copy': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`,
            'history': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>`,
            'folder': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
            'file-text': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
            'download': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
            'trash': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
            'plus': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
            'arrow-down-up': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>`,
            'export': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
            'alert-triangle': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
            'message-square': `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`
        };
    }

    /**
     * Get an SVG icon by name, with optional attributes.
     * @param {string} name - The name of the icon (e.g., 'settings', 'x').
     * @param {object} [options] - Optional attributes for the SVG tag.
     * @param {string} [options.className] - CSS class to add to the SVG.
     * @param {number} [options.width=16] - SVG width.
     * @param {number} [options.height=16] - SVG height.
     * @returns {string} The full SVG string, or a fallback icon if not found.
     */
    getIcon(name, options = {}) {
        const { className = '', width = 16, height = 16 } = options;
        const baseSvg = this.icons[name];

        if (!baseSvg) {
            console.warn(`[IconManager] Icon "${name}" not found.`);
            // Return a fallback "alert" icon
            return this.getIcon('alert-circle', { className: 'fallback-icon', width, height });
        }

        // Inject attributes into the <svg> tag safely
        let svgString = baseSvg.replace(/<svg\s+([^>]+)>/i, (match, p1) => {
            // Remove existing width, height, and class to avoid duplicates
            let newAttrs = p1.replace(/\b(?:width|height|class)\s*=\s*"[^"]*"/gi, '').trim();
            const classAttr = className ? ` class="${className}"` : '';
            return `<svg${classAttr} width="${width}" height="${height}" ${newAttrs}>`;
        });
        return svgString;
    }
}

class BaseUIComponent {
        constructor(uiManager, configManager, idKey) {
            this.uiManager = uiManager;
            this.domBuilder = uiManager.domBuilder;
            this.logger = uiManager.logger;
            this.appServices = uiManager.appServices;
            this.configManager = configManager;
            this.id = this.configManager.getUiId(idKey);
            this.element = null;
        }
        render() { throw new Error("Render method must be implemented by subclass."); }
        attachEventListeners() {}
        updateUI() {}
        getEl(uiIdKeyWithinComponent) {
            const fullId = uiIdKeyWithinComponent.startsWith(this.configManager.getScriptPrefix())
                           ? uiIdKeyWithinComponent
                           : this.configManager.getUiId(uiIdKeyWithinComponent);
            const baseElement = this.element || (this.uiManager && this.uiManager.shadowRoot);
            if (!baseElement) {
                this.logger.warn(`Base element (this.element or shadowRoot) not found when trying to get '${fullId}' in component '${this.constructor.name}'. Ensure component is rendered or attached.`);
                return null;
            }
            const foundEl = baseElement.querySelector(`#${fullId}`);
            return foundEl;
        }
    }