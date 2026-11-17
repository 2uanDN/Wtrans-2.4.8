class Utils {
    // === ID GENERATION ===

    /**
     * Generates unique ID with collision resistance
     * @returns {string} Unique identifier
     */
    static generateId() {
        try {
            // Use crypto API if available for better randomness
            if (window.crypto && crypto.getRandomValues) {
                const array = new Uint8Array(16);
                crypto.getRandomValues(array);
                return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('') +
                       Date.now().toString(36);
            }
            // Fallback to original method
            return Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        } catch (error) {
            console.error('[UserScript] ID generation failed:', error);
            return 'id-' + Date.now();
        }
    }

    // === ASYNC UTILITIES ===

    /**
     * Debounce function with improved cancellation and state tracking
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in milliseconds
     * @param {Object} options - Optional configuration
     * @returns {Function} Debounced function
     */
    static debounce(func, wait, options = {}) {
        let timeout = null;
        let lastArgs = null;
        let lastThis = null;
        let lastCallTime = 0;

        const { leading = false, trailing = true, maxWait = null } = options;

        function invokeFunc(time) {
            const args = lastArgs;
            const context = lastThis;

            lastArgs = lastThis = null;
            lastCallTime = time;

            return func.apply(context, args);
        }

        function shouldInvoke(time) {
            if (lastArgs === null) return false;
            const timeSinceLastCall = time - lastCallTime;
            const timeSinceLastInvoke = time - (timeout ? timeout._startTime : 0);

            return (timeSinceLastCall >= wait) ||
                   (maxWait !== null && timeSinceLastInvoke >= maxWait);
        }

        function timerExpired() {
            const time = Date.now();
            if (shouldInvoke(time)) {
                return trailingEdge(time);
            }
            // Restart the timer
            timeout = setTimeout(timerExpired, wait - (time - lastCallTime));
        }

        function trailingEdge(time) {
            timeout = null;

            // Only invoke if we have `lastArgs` which means `func` has been
            // debounced at least once
            if (trailing && lastArgs) {
                return invokeFunc(time);
            }
            lastArgs = lastThis = null;
            return undefined;
        }

        function leadingEdge(time) {
            // Reset any `maxWait` timer
            if (maxWait !== null) {
                timeout._startTime = time;
            }

            // Invoke the leading edge
            if (leading) {
                return invokeFunc(time);
            }

            lastCallTime = time;
            // Start the timer for the trailing edge
            timeout = setTimeout(timerExpired, wait);
            return undefined;
        }

        function debounced(...args) {
            const time = Date.now();
            const isInvoking = shouldInvoke(time);

            lastArgs = args;
            lastThis = this;

            if (isInvoking) {
                if (timeout === null) {
                    return leadingEdge(time);
                }
                if (maxWait !== null) {
                    // Handle invocations in maxWait wait time
                    timeout._startTime = time;
                    setTimeout(timerExpired, wait);
                    return leadingEdge(time);
                }
            }
            if (timeout === null) {
                timeout = setTimeout(timerExpired, wait);
            }

            return undefined;
        }

        debounced.cancel = function() {
            if (timeout !== null) {
                clearTimeout(timeout);
            }
            lastArgs = lastThis = timeout = null;
        };

        debounced.flush = function() {
            return timeout === null ? undefined : trailingEdge(Date.now());
        };

        debounced.pending = function() {
            return timeout !== null;
        };

        return debounced;
    }

    /**
     * Async delay with optional cleanup
     * @param {number} ms - Milliseconds to delay
     * @param {AbortSignal} [signal] - Optional AbortSignal for cancellation
     * @returns {Promise<void>}
     */
    static delay(ms, signal = null) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                return reject(new DOMException('Aborted', 'AbortError'));
            }

            let onAbort;
            const timeoutId = setTimeout(() => {
                if (signal && onAbort) {
                    signal.removeEventListener('abort', onAbort);
                }
                resolve();
            }, ms);

            if (signal) {
                onAbort = () => {
                    clearTimeout(timeoutId);
                    reject(new DOMException('Aborted', 'AbortError'));
                };
                signal.addEventListener('abort', onAbort, { once: true });
            }
        });
    }

/**
     * Làm sạch các thuộc tính nguy hiểm trên Element để chống XSS
     * Được gọi bởi removeFuzzyJunkElements
     * @param {Element} el - Element cần làm sạch
     */
    static cleanAttributes(el) {
        if (!el || !el.attributes) return;
        // Duyệt ngược để xóa an toàn (tránh lỗi lệch index khi DOM thay đổi)
        for (let i = el.attributes.length - 1; i >= 0; i--) {
            const attrName = el.attributes[i].name.toLowerCase();
            // Xóa tất cả các inline event handlers (onclick, onload, onmouseover...)
            if (attrName.startsWith('on')) {
                el.removeAttribute(attrName);
            }
        }
    }

    // === DOM CLEANUP & AD REMOVAL ===

    /**
     * Remove fuzzy pattern matching elements (ads, banners, etc.)
     * @param {Element} container - Root element to search within
     * @param {Array<RegExp>} [customPatterns] - Additional patterns
     * @returns {number} Number of elements removed
     */
    static removeFuzzyJunkElements(container, customPatterns = []) {
        if (!container || !container.getElementsByTagName) return 0;

        const DEFAULT_PATTERNS = [
            /(?:^|[_\-\s])google[-_]?ads?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])ad[-_]?(wrapper|box|container|slot|unit|zone)(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])banner[-_]?(top|bottom|side|float|ad)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])sponsored[-_]?(content|item|link|post)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])text[-_]?advertising(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])bottom[-_]?adv(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])rc[-_]unit(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])adsby(?:google|[_\-\s]|$)/i,
            /(?:^|[_\-\s])taboola(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])outbrain(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])doubleclick(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])amazon[-_]?ads?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])facebook[-_]?ads?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])ezoic(?:[-_]?ad)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])mediavine(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])monetag(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])adsterra(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])popads(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])propeller(?:ads?)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])mgid(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])exoclick(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])patreon(?:[-_]widget)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])ko-?fi(?:[-_]widget)?(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])donate[-_]?(?:box|button|widget)(?:[_\-\s]|$)/i,
            /(?:^|[_\-\s])chapter[-_]nav(?:[_\-\s]|$)/i
        ];

        const patterns = [...DEFAULT_PATTERNS, ...customPatterns];
        // Query only elements with an id or class — the only ones our regex patterns
        // can ever match. This avoids iterating thousands of bare structural elements
        // (e.g., <p>, <span>, <td>) on content-heavy pages. Static NodeList is safe
        // for backward removal since indices are captured at query time.
        const allElements = container.querySelectorAll('[id],[class]');
        let removedCount = 0;

        // Cache content-like patterns to avoid false positives
        const CONTENT_PATTERNS = [
            /header/i,
            /content/i,
            /main/i,
            /article/i,
            /section/i,
            /footer/i,
            /sidebar/i,
            /navigation/i,
            /menu/i
        ];

        // Iterate backwards for safe removal
        for (let i = allElements.length - 1; i >= 0; i--) {
            const el = allElements[i];

            // Skip if already disconnected
            if (!el.isConnected) continue;

            // Security: Clean attributes first
            this.cleanAttributes(el);

            // Get identifiers
            const id = el.id || '';
            const className = (typeof el.className === 'string') ? el.className :
                            (el.getAttribute('class') || '');
            const identifierString = `${id} ${className}`.toLowerCase();

            if (!identifierString.trim()) continue;

            // Check for fuzzy junk patterns
            let isJunk = false;
            for (const pattern of patterns) {
                if (pattern.test(identifierString)) {
                    // Additional validation to avoid false positives
                    const isLikelyContent = CONTENT_PATTERNS.some(
                        contentPattern => contentPattern.test(identifierString)
                    );

                    if (!isLikelyContent || pattern.source.includes('ad') || pattern.source.includes('banner')) {
                        isJunk = true;
                        break;
                    }
                }
            }

            if (isJunk) {
                el.remove();
                removedCount++;
            }
        }

        return removedCount;
    }

    /**
     * Làm sạch chuỗi HTML để show an toàn trên UI (dùng cho Reader Mode).
     * Thay thế regex cũ bằng DOMPurify.
     * @param {string} htmlString - Chuỗi HTML chưa an toàn (từ Markdown).
     * @returns {string} Chuỗi HTML đã được làm sạch.
     */
    static sanitizeHtml(htmlString) {
        if (!htmlString) return "";
        if (typeof htmlString !== 'string') htmlString = String(htmlString);

        // Sanitize mojibake remnants (như â¦, â€¦ từ lỗi charset/subparser)
        if (htmlString.includes('â')) {
            htmlString = htmlString
                .replace(/â[\x80\u0080]?¦/g, '...')
                .replace(/â€¦/g, '...')
                .replace(/â€[“”]/g, '"')
                .replace(/â€˜|â€™/g, "'")
                .replace(/â€”|â€“/g, '—');
        }

        if (typeof DOMPurify !== 'undefined') {
            // Cấu hình: Trả về STRING (mặc định), cho phép các thẻ định dạng an toàn
            return DOMPurify.sanitize(htmlString, {
                USE_PROFILES: { html: true },
                ADD_TAGS: ['button', 'span', 'div', 'strong'],
                ADD_ATTR: ['target', 'data-original-text', 'class'] // Cho phép data attributes và class cho internal UI
            });
        }

        // Fallback tối thiểu nếu DOMPurify chưa load (hiếm khi xảy ra do @require)
        console.warn("[Utils] DOMPurify not loaded. Using minimal fallback.");
        return htmlString
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/on\w+="[^"]*"/g, "");
    }

    static getBadKeywordsSet(weights, config) {
        return new Set([
            ...(weights.BAD_KEYWORDS || []),
            ...(config?.badKeywords || [])
        ].map(k => typeof k === 'string' ? k.toLowerCase() : ''));
    }

    static get TEXT_PARSER_CONFIG() {
        return {
            BLOCK_TAGS: new Set([
                'P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
                'BLOCKQUOTE', 'PRE', 'UL', 'OL', 'LI', 'HR',
                'TABLE', 'TR', 'ARTICLE', 'SECTION', 'MAIN', 'HEADER', 'FOOTER'
            ]),
            IGNORE_TAGS: new Set([
                'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
                'SVG', 'CANVAS', 'MAP', 'AREA', 'FORM', 'BUTTON',
                'SELECT', 'OPTION', 'OPTGROUP', 'DATALIST', 'META', 'LINK'
            ])
        };
    }

    // === 3. LOGIC TRÍCH XUẤT TEXT (TỐI ƯU HÓA CHUỖI & REGEX) ---
    static htmlToPlainText(html) {
        if (!html) return "";

        let cleanRoot;
        if (typeof DOMPurify !== 'undefined') {
            cleanRoot = DOMPurify.sanitize(html, {
                RETURN_DOM: true,
                WHOLE_DOCUMENT: false
            });
        } else {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            cleanRoot = doc.body;
        }

        const { BLOCK_TAGS, IGNORE_TAGS } = Utils.TEXT_PARSER_CONFIG;
        let textResult = [];

        const processNode = (node) => {
            const type = node.nodeType;
            const tagName = node.tagName ? node.tagName.toUpperCase() : '';

            if (type === Node.ELEMENT_NODE) {
                if (IGNORE_TAGS.has(tagName)) return;

                const isBlock = BLOCK_TAGS.has(tagName);
                const isBr = tagName === 'BR';

                if (isBlock) textResult.push('\n');

                if (isBr) {
                    textResult.push('\n');
                } else {
                    let child = node.firstChild;
                    while (child) {
                        processNode(child);
                        child = child.nextSibling;
                    }
                }

                if (isBlock) textResult.push('\n');
            }
            else if (type === Node.TEXT_NODE) {
                const content = node.textContent;
                // TỐI ƯU HÓA: Làm sạch text ngay tại đây thay vì đợi gom thành cục lớn
                if (content && content.trim().length > 0) {
                    // Xóa khoảng trắng thừa liền kề nhưng không cắt bỏ khoảng trắng hai đầu để giữ tính liên tục
                    textResult.push(content.replace(/[ \t\u00A0]+/g, ' '));
                }
            }
        };

        processNode(cleanRoot);

        // TỐI ƯU HÓA: Thay thế Regex chậm bằng logic nối mảng (Array Join) kết hợp Regex nhẹ
        return textResult
            .join('')
            .replace(/ *\n */g, '\n') // Xóa dấu cách thừa quanh dấu xuống dòng
            .replace(/\n{3,}/g, '\n\n') // Rút gọn các dòng trống liên tiếp (chỉ giữ tối đa 2 dòng)
            .trim();
    }

/**
     * Tính điểm chất lượng cho một node DOM dựa trên SCORING_WEIGHTS.
     * TỐI ƯU HÓA: Single-pass DOM traversal (Độ phức tạp O(M) thay vì O(4M)).
     *
     * @param {Element} element - Node cần chấm điểm.
     * @param {Object} config - Cấu hình phân tích (minTextLength, etc.).
     * @param {Object} weights - Bộ trọng số SCORING_WEIGHTS.
     * @returns {number} Điểm số đánh giá.
     */
    static calculateElementScore(element, config, weights, badKeywordsSet = null) {
        let score = 0;

        // --- 1. Base Score (Logarithmic Text Length) ---
        const textContent = element.textContent || "";
        const textLen = textContent.length;

        // Fast fail: Nếu quá ngắn, không đáng để tính toán tiếp
        if (textLen < weights.MIN_TEXT_LENGTH) return -Infinity;

        // Giảm tốc độ tăng log với các đoạn text cực lớn
        let baseScore = Math.log(textLen + 1) * weights.BASE_LOG_FACTOR;

        const tagName = element.tagName.toLowerCase();
        if (weights.TAG_WEIGHTS && weights.TAG_WEIGHTS[tagName]) {
            baseScore += weights.TAG_WEIGHTS[tagName];
        }
        score += baseScore;

        // --- 2. SINGLE-PASS SUBTREE TRAVERSAL ---
        const allDescendants = element.getElementsByTagName('*');
        const allTagsCount = allDescendants.length;

        let linkCount = 0;
        let linkTextLen = 0;
        let pCount = 0;
        let brCount = 0;
        let validParagraphCount = 0;
        let totalValidParagraphLength = 0;
        let imgCount = 0;

        const MIN_P_LEN = 20;

        for (let i = 0; i < allTagsCount; i++) {
            const childTag = allDescendants[i].tagName;

            if (childTag === 'A') {
                linkCount++;
                linkTextLen += (allDescendants[i].textContent || "").length;
            } else if (childTag === 'P') {
                pCount++;
                const pLen = (allDescendants[i].textContent || "").length;
                if (pLen > MIN_P_LEN) {
                    validParagraphCount++;
                    totalValidParagraphLength += pLen;
                }
            } else if (childTag === 'BR') {
                brCount++;
            } else if (childTag === 'IMG') {
                imgCount++;
            }
        }

        // Text Nodes Direct-Level Counting
        const childNodes = element.childNodes;
        for (let i = 0; i < childNodes.length; i++) {
            const node = childNodes[i];
            if (node.nodeType === Node.TEXT_NODE) {
                const txt = node.textContent.trim();
                if (txt.length > MIN_P_LEN) {
                    validParagraphCount++;
                    totalValidParagraphLength += txt.length;
                }
            }
        }

        // Quy đổi thẻ BR thành paragraph equivalent
        validParagraphCount += Math.floor(brCount / 2);

        // --- 3. Link Density Analysis ---
        const linkDensity = textLen > 0 ? linkTextLen / textLen : 0;

        if (linkDensity > (config.maxLinkDensity || weights.LINK_DENSITY_THRESHOLD)) {
            score -= (linkDensity * weights.LINK_DENSITY_PENALTY);
            // Advanced Link Penalty: Penalty cấp số nhân
            if (linkCount > 50 && linkDensity > 0.5) {
                return -Infinity; // Chắc chắn là navigation / link list
            }
            if (linkCount > 50) {
                score -= weights.HIGH_LINK_COUNT_PENALTY * linkCount * 2;
            }
        } else {
            score += (1 - linkDensity) * weights.LINK_DENSITY_BONUS;
        }

        // --- 4. Paragraph Structure Analysis ---
        score += validParagraphCount * weights.P_TAG_BONUS;
        const avgParagraphLength = validParagraphCount > 0 ? totalValidParagraphLength / validParagraphCount : 0;

        if (avgParagraphLength > weights.AVG_P_LEN_THRESHOLD) {
            const cappedLen = Math.min(avgParagraphLength, weights.AVG_P_LEN_MAX_CAP || 600);
            score += cappedLen * weights.AVG_P_LEN_BONUS_FACTOR;
        } else if (pCount + validParagraphCount > 5) {
            score -= (weights.AVG_P_LEN_THRESHOLD - avgParagraphLength) * weights.SHORT_P_PENALTY_FACTOR;
        }

        // --- 5. Text-to-Tag Ratio (Content Density) ---
        const textToTagRatio = allTagsCount > 0 ? textLen / allTagsCount : textLen;
        score += Math.min(textToTagRatio, 200) * weights.TEXT_TO_TAG_RATIO_FACTOR;

        // --- 6. Attribute Negative Filters (Class/ID Check Tokenization) ---
        const classStr = (typeof element.className === 'string' ? element.className : (element.getAttribute('class') || '')).toLowerCase();
        const idStr = (element.id || "").toLowerCase();

        // Attribute Tokenization O(1)
        const combinedTokens = `${classStr} ${idStr}`.split(/[_\- \t\n]+/);
        const resolvedBadKeywordsSet = badKeywordsSet || this.getBadKeywordsSet(weights, config);

        for (let i = 0; i < combinedTokens.length; i++) {
            const token = combinedTokens[i];
            if (token && resolvedBadKeywordsSet.has(token)) {
                score -= weights.BAD_KEYWORD_PENALTY;
            }
        }

        // Semantic Role Inspection
        const roleAttr = (element.getAttribute('role') || "").toLowerCase();
        if (roleAttr === 'navigation' || roleAttr === 'banner' || roleAttr === 'contentinfo' || roleAttr === 'complementary') {
            score -= weights.BAD_KEYWORD_PENALTY * 3; // Áp phạt nặng bằng hệ số
        }

        // --- 7. Media Penalty ---
        score -= imgCount * weights.IMAGE_PENALTY;

        return score;
    }

    /**
     * Phân tích DOM để tìm phần tử chứa nội dung chính.
     * Áp dụng O(1) Cache Traversal.
     */
    static async analyzeDOMForMainContent(docBody, userConfig = {}, logger, constants, cacheManager = null) {
        // 1. Setup Config & Weights
        // Merge userConfig vào default config
        const config = { ...constants.DOM_ANALYSIS_DEFAULT_CONFIG, ...userConfig };
        // Lấy weights từ constants, fallback nếu thiếu
        const weights = constants.SCORING_WEIGHTS;

        if (!weights) {
            logger?.error("Missing SCORING_WEIGHTS in constants. Using fallback logic is not recommended.");
            return docBody; // Fail safe
        }

        const badKeywordsSet = this.getBadKeywordsSet(weights, config);
        let bestCandidate = null;

        // PHASE A: O(1) Fetching Cache Traversal
        let successfulCachedSelector = null;
        let activeCacheSelectors = [];
        if (cacheManager) {
            try {
                activeCacheSelectors = await cacheManager.getEffectiveSelectors([]);
                if (activeCacheSelectors.length > 0) {
                    for (const selector of activeCacheSelectors) {
                        try {
                            const el = docBody.querySelector(selector);
                            if (el && el.isConnected) {
                                const textLen = (el.textContent || "").length;
                                // Micro-Validation
                                if (textLen >= weights.MIN_TEXT_LENGTH) {
                                    const classStr = (typeof el.className === 'string' ? el.className : (el.getAttribute('class') || '')).toLowerCase();
                                    const idStr = (el.id || '').toLowerCase();
                                    const combinedTokens = `${classStr} ${idStr}`.split(/[_\- \t\n]+/);

                                    let badKeywordHits = false;

                                    for (let k = 0; k < combinedTokens.length; k++) {
                                        if (combinedTokens[k] && badKeywordsSet.has(combinedTokens[k])) {
                                            badKeywordHits = true;
                                            break;
                                        }
                                    }

                                    const roleAttr = (el.getAttribute('role') || "").toLowerCase();
                                    if (roleAttr === 'navigation' || roleAttr === 'banner' || roleAttr === 'contentinfo' || roleAttr === 'complementary') {
                                        badKeywordHits = true;
                                    }

                                    if (!badKeywordHits) {
                                        bestCandidate = el;
                                        successfulCachedSelector = selector;
                                        if (logger) logger.info(`[DOM Analyzer] O(1) Cache Hit: Winner by cached selector '${selector}'`);
                                        break;
                                    }
                                }
                            }
                        } catch (e) {
                            if (logger) logger.warn(`[DOM Analyzer] Invalid cached selector: ${selector}`, e);
                        }
                    }

                    if (successfulCachedSelector) {
                        await cacheManager.updateCache([successfulCachedSelector], activeCacheSelectors);
                        return bestCandidate;
                    }
                }
            } catch (e) {
                if (logger) logger.error(`[DOM Analyzer] Cache traversal failed:`, e);
            }
        }

        // PHASE B: Fallback O(N) DOM Scoring
        let maxScore = -Infinity;

        // Query once for all candidate tags.
        const selectorString = config.candidateTags.join(',');
        let candidates = Array.from(docBody.querySelectorAll(selectorString));

        // Guard against O(N²) blow-up on comment-heavy pages (forums, aggregators) where
        // querySelectorAll('article,main,section,div,p') can return 10k+ nodes and each
        // node's calculateElementScore runs getElementsByTagName('*') internally.
        const MAX_CANDIDATES = 600;
        if (candidates.length > MAX_CANDIDATES) {
            const semanticOnly = Array.from(docBody.querySelectorAll('article, main, section'));
            if (semanticOnly.length > 0 && semanticOnly.length <= MAX_CANDIDATES) {
                if (logger) logger.debug(`[DOM Analyzer] Large DOM (${candidates.length} nodes). Narrowed to ${semanticOnly.length} semantic candidates.`);
                candidates = semanticOnly;
            } else {
                if (logger) logger.debug(`[DOM Analyzer] Large DOM (${candidates.length} nodes). Capped to ${MAX_CANDIDATES}.`);
                candidates = candidates.slice(0, MAX_CANDIDATES);
            }
        }

        if (logger) logger.debug(`[DOM Analyzer] O(N) Evaluation. Scoring ${candidates.length} candidates.`);

        // 3. Evaluation Loop
        for (let i = 0; i < candidates.length; i++) {
            const el = candidates[i];

            // 3.1. Fast Fail Checks (Rất rẻ)
            if (!el.isConnected) continue;

            const textLen = (el.textContent || "").length;
            if (textLen < weights.MIN_TEXT_LENGTH) continue;

            // 3.2. Visibility Check
            if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;

            // 3.3. Scoring
            const score = this.calculateElementScore(el, config, weights, badKeywordsSet);

            // 3.4. Selection Logic
            if (score > maxScore) {
                maxScore = score;
                bestCandidate = el;
            }
        }

        if (logger) {
            if (bestCandidate) {
                logger.info(`[DOM Analyzer] Winner O(N): <${bestCandidate.tagName} id="${bestCandidate.id}" class="${bestCandidate.className}"> Score: ${maxScore.toFixed(2)}`);
            } else {
                logger.warn("[DOM Analyzer] No suitable candidate found.");
            }
        }

        // Tạo Selector Unique để nạp vào cache.
        if (bestCandidate && cacheManager) {
            const uniqueSelector = this.elementToUniqueSelector(bestCandidate);
            if (uniqueSelector) {
                if (logger) logger.info(`[DOM Analyzer] Generated unique selector for cache: ${uniqueSelector}`);
                const attemptedAndFailed = [...activeCacheSelectors, uniqueSelector];
                await cacheManager.updateCache([uniqueSelector], attemptedAndFailed);
            }
        }

        return bestCandidate;
    }

    /**
     * Tạo CSS Selector độc nhất cho element (Fallback Generation)
     */
    static elementToUniqueSelector(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;

        const isSafeId = (id) => {
            if (!id || typeof id !== 'string') return false;
            if (id.length > 50) return false;
            const isDynamic = /^(css-|jsx-|data-v-|ng-|svelte-|sc-|__)/i.test(id);
            const hasTooManyNumbers = /[0-9]{4,}/.test(id);
            const isHashLike = /[a-fA-F0-9]{8,}/.test(id);
            const isRandomReactClass = /[a-zA-Z0-9]{6,}/.test(id) && /^(css|sc)-/.test(id);
            return !isDynamic && !hasTooManyNumbers && !isHashLike && !isRandomReactClass && /^[a-zA-Z_-][a-zA-Z0-9_-]*$/.test(id);
        };

        // Tầng 1: An toàn tuyệt đối bằng ID tĩnh
        if (el.id) {
            const idStr = el.id.toString();
            if (isSafeId(idStr)) {
                return `#${CSS.escape(idStr)}`;
            }
        }

        const tagName = el.tagName.toLowerCase();
        if (tagName === 'body' || tagName === 'html') return tagName;

        // Cố gắng build chuỗi CSS Class ổn định
        const buildClassSelector = (element) => {
            if (!element.className || typeof element.className !== 'string') return element.tagName.toLowerCase();
            const classes = element.className.trim().split(/\s+/).filter(c => {
                const isUtility = /^(w-|h-|mt-|mb-|p-|text-|bg-|hover:|active:|focus:|css-|data-v-|ng-|svelte-|sc-|__)/i.test(c);
                const isHash = /[0-9a-fA-F]{6,}|[0-9]{3,}/.test(c);
                const isRandomReactClass = /[a-zA-Z0-9]{5,}/.test(c) && /^(css|sc)-/.test(c);
                return !isUtility && !isHash && !isRandomReactClass && c.length > 2;
            });
            if (classes.length === 0) return element.tagName.toLowerCase();
            return element.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
        };

        const targetClassSelector = buildClassSelector(el);

        try {
            if (el.ownerDocument && el.ownerDocument.querySelectorAll(targetClassSelector).length === 1) {
                return targetClassSelector;
            }
        } catch (e) {}

        // Tầng 3: Bám vào thẻ phân cấp (Parent chain)
        let current = el;
        const parts = [];
        let limit = 0;

        while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName.toLowerCase() !== 'body' && limit < 4) {
            const currentTag = current.tagName.toLowerCase();

            if (current.id && isSafeId(current.id.toString())) {
                parts.unshift(`#${CSS.escape(current.id.toString())}`);
                break;
            } else {
                let nth = 1;
                let sibling = current.previousElementSibling;
                while (sibling) {
                    if (sibling.tagName.toLowerCase() === currentTag) nth++;
                    sibling = sibling.previousElementSibling;
                }
                parts.unshift(`${currentTag}:nth-of-type(${nth})`);
            }

            current = current.parentElement;
            limit++;
        }

        if (parts.length > 0) {
            return parts.join(' > ');
        }

        return null;
    }


    /**
     * Tìm vị trí ngắt câu tối ưu.
     * DELEGATED to TextProcessingStrategies.
     */
    static findOptimalSplitPoint(text, maxLength, allowance = 0, logger = null) {
        const result = TextProcessingStrategies.findOptimalSplitPoint(text, maxLength, allowance);
        // Giữ lại logging nếu cần thiết cho debugging ở Main Thread
        if (logger && result === Math.min(maxLength + allowance, text.length) && text.length > maxLength) {
            // Chỉ log warning nếu nó thực sự là fallback cắt cứng và không tìm thấy điểm cắt đẹp
             // (Logic check này hơi duplicate nhưng giữ cho logger hoạt động đúng ý đồ cũ)
        }
        return result;
    }

    /**
     * Chia văn bản thành chunk.
     * DELEGATED to TextProcessingStrategies.
     */
    static splitTextIntoChunks(text, maxCharsPerChunk, oversizeAllowance, logger = null) {
        return TextProcessingStrategies.splitTextIntoChunks(text, maxCharsPerChunk, oversizeAllowance);
    }

    /**
     * Lấy N từ cuối cùng của văn bản để làm context.
     * Tối ưu hóa bộ nhớ: Không dùng split() tạo mảng lớn.
     */
    static getPreviousTranslatedSegment(text, numWords) {
        if (!text || numWords <= 0) return "";

        const trimmed = text.trimEnd(); // Chỉ trim cuối
        if (trimmed.length === 0) return "";

        let wordsFound = 0;
        let lastIndex = trimmed.length;

        // Duyệt ngược để đếm khoảng trắng
        for (let i = trimmed.length - 1; i >= 0; i--) {
            const char = trimmed[i];
            // Nếu gặp khoảng trắng và ký tự sau đó không phải khoảng trắng (bắt đầu 1 từ từ phía sau)
            if (/\s/.test(char) && (i + 1 < trimmed.length && !/\s/.test(trimmed[i+1]))) {
                wordsFound++;
                if (wordsFound >= numWords) {
                    lastIndex = i + 1; // Vị trí bắt đầu của đoạn văn bản cần lấy
                    break;
                }
            } else if (i === 0) {
                // Đã về đầu chuỗi
                lastIndex = 0;
            }
        }

        return trimmed.substring(lastIndex).trim();
    }

    /**
     * Trích xuất văn bản từ SSE Chunk của Gemini API.
     * Cải thiện khả năng đọc và xử lý lỗi.
     */
    static extractTextFromGeminiSSEChunk(jsonChunk) {
        // 1. Check Candidate Errors (Safety, etc.)
        const candidate = jsonChunk.candidates?.[0];
        if (candidate) {
            const reason = candidate.finishReason;
            if (reason && reason !== 'STOP' && reason !== 'MAX_TOKENS' && reason !== 'FINISH_REASON_UNSPECIFIED') {
                // Tạo thông báo lỗi chi tiết
                let msg = `API Error: ${reason}.`;
                if (reason === 'SAFETY') {
                    msg += ` Ratings: ${JSON.stringify(candidate.safetyRatings || 'N/A')}`;
                } else if (reason === 'RECITATION') {
                    msg += " (Citation policy violation)";
                }
                throw new Error(msg);
            }

            // Extract text content
            const partText = candidate.content?.parts?.[0]?.text;
            if (typeof partText === 'string') {
                return partText;
            }
        }

        // 2. Check Prompt Feedback Errors (Input blocked)
        if (jsonChunk.promptFeedback?.blockReason) {
            const reason = jsonChunk.promptFeedback.blockReason;
            const ratings = JSON.stringify(jsonChunk.promptFeedback.safetyRatings || 'N/A');
            throw new Error(`Input Blocked: ${reason}. Ratings: ${ratings}`);
        }

        // Return empty string if no content found (keep stream alive)
        return "";
    }
    }

    /**
     * Thuần JavaScript ZIP Archive Generator (Không phụ thuộc bất kỳ thư viện ngoài nào).
     * Hỗ trợ tạo file .zip theo chuẩn PKZip 2.0 (Store Method), hỗ trợ UTF-8 filename flag.
     * Hoạt động 100% offline, miễn nhiễm với CSP (Content Security Policy) và sandbox.
     */