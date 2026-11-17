class HistoryModalComponent extends BaseUIComponent {
        constructor(uiManager, configManager) {
            super(uiManager, configManager, "HISTORY_MODAL");
            this.modalKey = "HISTORY_MODAL";
            this._isRendered = false;
            this.currentProjectId = null;
            this.pendingAddContent = null;
            this.searchQuery = "";
            this.sortOrder = 'asc';
        }

        render() {
            if (this._isRendered) return this.element;
            const prefix = this.configManager.getScriptPrefix();
            const cfg = this.configManager;

            const titleEl = this.domBuilder.createEl('h2', { textContent: 'History / Projects', style: { margin: '0' } });

            const searchInput = this.domBuilder.createEl('input', {
                type: 'text',
                placeholder: 'Search...',
                className: `${prefix}input`,
                style: { width: '200px', marginLeft: 'auto', marginRight: '10px' },
                onInput: (e) => {
                    this.searchQuery = e.target.value.toLowerCase();
                    this._refreshProjects();
                    if (this.currentProjectId) {
                        this._renderChapters(this.currentProjectId);
                    }
                }
            });

            const sortBtn = this.domBuilder.createButton({
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('arrow-down-up', {width: 16, height: 16}),
                title: 'Reverse Order',
                className: `${prefix}button`,
                style: { marginRight: '15px', padding: '6px' },
                onClick: () => {
                    this.sortOrder = this.sortOrder === 'desc' ? 'asc' : 'desc';
                    if (this.currentProjectId) {
                        this._renderChapters(this.currentProjectId);
                    }
                }
            });

            const closeBtn = this.domBuilder.createButton({
                id: cfg.getUiId('HISTORY_MODAL_CLOSE_BTN'),
                innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('x'),
                title: 'Close (Esc)',
                className: `${prefix}modal-close-btn`,
                onClick: () => {
                    this.pendingAddContent = null;
                    this.pendingAddTitle = null;
                    this.uiManager.toggleModal(this.modalKey, false);
                }
            });
            const header = this.domBuilder.createEl('div', { className: `${prefix}modal-header`, style: { display: 'flex', alignItems: 'center' } }, [titleEl, searchInput, sortBtn, closeBtn]);

            // Layout: Left (Projects), Right (Chapters)
            const projectListContainer = this.domBuilder.createEl('div', {
                id: cfg.getUiId('HISTORY_PROJECT_LIST'),
                className: `${prefix}history-project-list`
            });

            const chapterListContainer = this.domBuilder.createEl('div', {
                id: cfg.getUiId('HISTORY_CHAPTER_LIST'),
                className: `${prefix}history-chapter-list`
            });

            const body = this.domBuilder.createEl('div', {
                className: `${prefix}modal-body ${prefix}history-modal-body`
            }, [projectListContainer, chapterListContainer]);

            const newProjectBtn = this.domBuilder.createButton({
                id: cfg.getUiId('HISTORY_NEW_PROJECT_BTN'),
                text: 'New Project',
                className: `${prefix}button ${prefix}button-primary`,
                onClick: () => this._handleNewProject()
            });

            const footer = this.domBuilder.createEl('div', { className: `${prefix}modal-footer` }, [newProjectBtn]);

            const modalContentDiv = this.domBuilder.createEl('div', { className: `${prefix}modal-content`, tabindex: "-1" }, [header, body, footer]);

            this.element = this.domBuilder.createEl('div', { id: this.id, className: `${prefix}modal-overlay` }, [modalContentDiv]);

            this.element.addEventListener('click', (e) => {
                if (e.target === this.element) {
                    this.pendingAddContent = null;
                    this.pendingAddTitle = null;
                    this.uiManager.toggleModal(this.modalKey, false);
                }
            });

            this._isRendered = true;
            return this.element;
        }

        async show() {
            if (!this._isRendered && !this.element) this.render();
            if (!this.element) return;
            await this._refreshProjects();
        }

        async showForAdding(content, title = "New Chapter") {
            this.pendingAddContent = content;
            this.pendingAddTitle = title;
            this.uiManager.toggleModal(this.modalKey, true);
        }

        onClose() {
            this.pendingAddContent = null;
            this.pendingAddTitle = null;
        }

        async _refreshProjects() {
            const historyService = this.appServices.historyService;
            const projects = await historyService.loadProjects();
            const projectListContainer = this.getEl('HISTORY_PROJECT_LIST');
            const prefix = this.configManager.getScriptPrefix();

            if (!projectListContainer) return;
            projectListContainer.innerHTML = '';

            const filteredProjects = projects.filter(p => !this.searchQuery || p.name.toLowerCase().includes(this.searchQuery));
            if (filteredProjects.length === 0) {
                const text = this.searchQuery ? "No projects found." : "No projects yet.";
                const folderIcon = this.uiManager.iconManager.getIcon('folder', { width: 32, height: 32 });
                projectListContainer.innerHTML = `<div class="${prefix}history-empty-state">
                    ${folderIcon}
                    <div>${text}</div>
                </div>`;
            }

            filteredProjects.forEach(project => {
                const projectItem = this.domBuilder.createEl('div', {
                    className: `${prefix}history-item ${prefix}history-project-item ${this.currentProjectId === project.id ? 'active' : ''}`,
                    onClick: () => this._selectProject(project.id)
                });

                // Hàng 1 (Tiêu đề dự án): 100% chiều ngang cho avatar dự án, tên dự án đầy đủ (flex: 1, min-width: 0, hỗ trợ tooltip) & badge số lượng tệp
                const rawName = (project.name || 'P').trim();
                const firstChar = (rawName.charAt(0) || 'P').toUpperCase();

                const row1 = this.domBuilder.createEl('div', {
                    className: `${prefix}history-project-row ${prefix}history-project-header-row`
                });

                const avatar = this.domBuilder.createEl('div', {
                    className: `${prefix}history-project-avatar`,
                    textContent: firstChar,
                    title: `Project: ${project.name}`
                });

                const nameSpan = this.domBuilder.createEl('span', {
                    className: `${prefix}history-item-name ${prefix}history-project-name`,
                    textContent: project.name,
                    title: project.name
                });

                const chapterCount = Array.isArray(project.chapters) ? project.chapters.length : 0;
                const badge = this.domBuilder.createEl('span', {
                    className: `${prefix}history-project-badge`,
                    textContent: String(chapterCount),
                    title: `${chapterCount} ${chapterCount === 1 ? 'file' : 'files'}`
                });

                row1.appendChild(avatar);
                row1.appendChild(nameSpan);
                row1.appendChild(badge);

                // Hàng 2 (Thông tin & Thao tác nhanh): Ngày tạo bên trái, 3 nút thao tác gọn gàng (history-action-btn 26×26px) bên phải
                const row2 = this.domBuilder.createEl('div', {
                    className: `${prefix}history-project-row ${prefix}history-project-sub-row`
                });

                let dateText = 'N/A';
                let dateTooltip = 'N/A';
                const createdTime = project.createdAt || (Array.isArray(project.chapters) && project.chapters.length > 0 && project.chapters[0].createdAt);
                if (createdTime) {
                    const d = new Date(createdTime);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    const hrs = String(d.getHours()).padStart(2, '0');
                    const mins = String(d.getMinutes()).padStart(2, '0');
                    dateText = `${day}/${month}/${year}`;
                    dateTooltip = `${day}/${month}/${year} ${hrs}:${mins}`;
                }

                const dateSpan = this.domBuilder.createEl('span', {
                    className: `${prefix}history-item-date ${prefix}history-project-date`,
                    textContent: dateText,
                    title: dateTooltip !== 'N/A' ? `Created: ${dateTooltip}` : 'N/A'
                });

                const actionsDiv = this.domBuilder.createEl('div', {
                    className: `${prefix}history-item-actions ${prefix}history-project-actions`
                });

                const downloadZipBtn = this.domBuilder.createButton({
                    innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('download', {width: 13, height: 13}),
                    title: 'Download (.zip)',
                    className: `${prefix}button ${prefix}history-action-btn`,
                    onClick: (e) => { e.stopPropagation(); this._downloadProject(project); }
                });

                const downloadTxtBtn = this.domBuilder.createButton({
                    innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('file-text', {width: 13, height: 13}),
                    title: 'Download Merged (.txt)',
                    className: `${prefix}button ${prefix}history-action-btn`,
                    onClick: (e) => { e.stopPropagation(); this._downloadProjectMergedTxt(project); }
                });

                const deleteBtn = this.domBuilder.createButton({
                    innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('trash', {width: 13, height: 13}),
                    title: 'Delete Project',
                    className: `${prefix}button ${prefix}button-danger-outline ${prefix}history-action-btn`,
                    onClick: (e) => { e.stopPropagation(); this._deleteProject(project.id); }
                });

                actionsDiv.appendChild(downloadZipBtn);
                actionsDiv.appendChild(downloadTxtBtn);
                actionsDiv.appendChild(deleteBtn);

                row2.appendChild(dateSpan);
                row2.appendChild(actionsDiv);

                projectItem.appendChild(row1);
                projectItem.appendChild(row2);
                projectListContainer.appendChild(projectItem);
            });

            if (this.currentProjectId) {
                this._renderChapters(this.currentProjectId);
            } else {
                const chapterListContainer = this.getEl('HISTORY_CHAPTER_LIST');
                if (chapterListContainer) {
                    const prefix = this.configManager.getScriptPrefix();
                    const fileIcon = this.uiManager.iconManager.getIcon('file-text', { width: 32, height: 32 });
                    chapterListContainer.innerHTML = `<div class="${prefix}history-empty-state">
                        ${fileIcon}
                        <div>Select a project to view.</div>
                    </div>`;
                }
            }
        }

        async _selectProject(projectId) {
            this.currentProjectId = projectId;
            await this._refreshProjects(); // Re-render to update active state

            if (this.pendingAddContent) {
                const chapterName = this.pendingAddTitle || "New Chapter";
                await this.appServices.historyService.addChapterToProject(projectId, chapterName, this.pendingAddContent);
                this.logger.notify(`Successfully saved to project.`, "Success");
                this.pendingAddContent = null;
                this.pendingAddTitle = null;
                this.uiManager.toggleModal(this.modalKey, false);
            }
        }

        _renderChapters(projectId) {
            const project = this.appServices.historyService.getProject(projectId);
            const chapterListContainer = this.getEl('HISTORY_CHAPTER_LIST');
            const prefix = this.configManager.getScriptPrefix();

            if (!chapterListContainer || !project) return;
            chapterListContainer.innerHTML = '';

            if (project.chapters.length === 0) {
                const fileIcon = this.uiManager.iconManager.getIcon('file-text', { width: 32, height: 32 });
                chapterListContainer.innerHTML = `<div class="${prefix}history-empty-state">
                    ${fileIcon}
                    <div>Project is empty.</div>
                </div>`;
                return;
            }

            let filteredChapters = project.chapters.filter(c => !this.searchQuery || c.name.toLowerCase().includes(this.searchQuery));
            if (filteredChapters.length === 0 && this.searchQuery) {
                const fileIcon = this.uiManager.iconManager.getIcon('file-text', { width: 32, height: 32 });
                chapterListContainer.innerHTML = `<div class="${prefix}history-empty-state">
                    ${fileIcon}
                    <div>No chapters found.</div>
                </div>`;
                return;
            }

            filteredChapters.sort((a, b) => {
                const dateA = a.createdAt || 0;
                const dateB = b.createdAt || 0;
                return this.sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
            });

            filteredChapters.forEach((chapter, idx) => {
                const indexNum = this.sortOrder === 'asc' ? idx + 1 : filteredChapters.length - idx;
                const indexStr = String(indexNum).padStart(2, '0');

                const chapterItem = this.domBuilder.createEl('div', {
                    className: `${prefix}history-item`,
                    onClick: () => this._viewChapter(chapter)
                });

                const indexDiv = this.domBuilder.createEl('div', {
                    textContent: indexStr,
                    style: { fontFamily: 'monospace', color: 'var(--wnvt-text-secondary)', fontSize: '0.9em', marginRight: '4px', flexShrink: '0' }
                });

                const nameAndDateDiv = this.domBuilder.createEl('div', {
                    style: { display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }
                });

                const nameSpan = this.domBuilder.createEl('span', {
                    className: `${prefix}history-item-name`,
                    textContent: chapter.name
                });

                let dateText = 'N/A';
                if (chapter.createdAt) {
                    const d = new Date(chapter.createdAt);
                    const day = String(d.getDate()).padStart(2, '0');
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const year = d.getFullYear();
                    const hrs = String(d.getHours()).padStart(2, '0');
                    const mins = String(d.getMinutes()).padStart(2, '0');
                    dateText = `${day}/${month}/${year} · ${hrs}:${mins}`;
                }

                const dateSpan = this.domBuilder.createEl('span', {
                    className: `${prefix}history-item-date`,
                    textContent: dateText,
                    style: { fontSize: 'var(--tx-2xs, 0.7em)', color: 'var(--wnvt-text-secondary)', marginTop: '2px' }
                });

                nameAndDateDiv.appendChild(nameSpan);
                nameAndDateDiv.appendChild(dateSpan);

                const actionsDiv = this.domBuilder.createEl('div', {
                    className: `${prefix}history-item-actions`
                });

                const deleteBtn = this.domBuilder.createButton({
                    innerHTML: /* trusted-static: no user input */ this.uiManager.iconManager.getIcon('x', {width: 14, height: 14}),
                    title: 'Delete Chapter',
                    className: `${prefix}button ${prefix}button-small ${prefix}button-danger-outline`,
                    onClick: (e) => { e.stopPropagation(); this._deleteChapter(projectId, chapter.id); }
                });

                actionsDiv.appendChild(deleteBtn);

                chapterItem.appendChild(indexDiv);
                chapterItem.appendChild(nameAndDateDiv);
                chapterItem.appendChild(actionsDiv);
                chapterListContainer.appendChild(chapterItem);
            });
        }

        async _handleNewProject() {
            const name = await this.uiManager.showPromptDialog("Enter a new Project name:");
            if (name && name.trim()) {
                await this.appServices.historyService.createProject(name.trim());
                await this._refreshProjects();
            }
        }

        async _deleteProject(projectId) {
            const isConfirmed = await this.uiManager.showConfirmDialog("Are you sure you want to delete this project and all its contents?");
            if (isConfirmed) {
                await this.appServices.historyService.deleteProject(projectId);
                if (this.currentProjectId === projectId) this.currentProjectId = null;
                await this._refreshProjects();
            }
        }

        async _deleteChapter(projectId, chapterId) {
            const isConfirmed = await this.uiManager.showConfirmDialog("Are you sure you want to delete this chapter?");
            if (isConfirmed) {
                await this.appServices.historyService.deleteChapterFromProject(projectId, chapterId);
                this._renderChapters(projectId);
            }
        }

        async _viewChapter(chapter) {
            this.uiManager.toggleModal(this.modalKey, false);

            const resultModal = this.uiManager.getComponent('RESULT_MODAL');
            if (resultModal && resultModal.isMinimized) {
                resultModal.wasMinimizedAndRestored = true;
                this.uiManager.toggleModal('RESULT_MODAL', true);
            }

            let content = chapter.content;
            if (content === undefined) {
                content = await this.appServices.historyService.getChapterContent(chapter.id);
            }

            if (content === null || content === undefined) {
                this.logger.notify("Unable to load chapter content (it may have been deleted or the data is corrupted).", "Error", "error");
                return;
            }

            if (this.appServices && this.appServices.translationOrchestrator) {
                this.appServices.translationOrchestrator.lastOriginalTextForMain = null;
            }

            this.uiManager.showResultModal(content, chapter.name, false, false);
            if (resultModal && typeof resultModal.forceReaderMode === 'function') {
                resultModal.forceReaderMode();
            }
        }

        /**
         * Helper để kích hoạt tải file an toàn trên mọi trình duyệt mà không bị hủy Blob URL sớm.
         */
        _triggerDownload(blob, filename) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
            }, 15000);
        }

        /**
         * Tải toàn bộ project dưới dạng file .zip.
         * Sử dụng SimpleZipWriter (Zero-dependency, kháng CSP 100%) với fallback JSZip nếu có.
         */
        async _downloadProject(project) {
            if (!project.chapters || project.chapters.length === 0) {
                this.logger.notify("Project is empty. Nothing to download.", "Notice", "info");
                return;
            }

            const projectName = project.name || "Novel_Project";
            const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_').trim() || "Novel_Project";
            const totalChapters = project.chapters.length;

            this.logger.notify(`Packaging ${totalChapters} chapters for "${projectName}"...`, "Info", "info");

            try {
                // Kiểm tra xem SimpleZipWriter có sẵn không (được nhúng trực tiếp trong userscript)
                const hasSimpleZip = typeof SimpleZipWriter !== 'undefined';
                let JSZipCtor = null;

                if (!hasSimpleZip) {
                    // Fallback tìm JSZip nếu vì lý do nào đó SimpleZipWriter chưa sẵn sàng
                    JSZipCtor = (typeof JSZip !== 'undefined' ? JSZip : null)
                        || (typeof window !== 'undefined' ? window.JSZip : null)
                        || (typeof unsafeWindow !== 'undefined' ? unsafeWindow.JSZip : null);
                }

                let zipBlob = null;

                if (hasSimpleZip) {
                    const zip = new SimpleZipWriter();

                    for (let index = 0; index < totalChapters; index++) {
                        const chapter = project.chapters[index];
                        const chapterRawName = (chapter.name || `Chapter_${index + 1}`).trim();
                        const safeChapterName = chapterRawName.replace(/[\\/:*?"<>|]/g, '_');
                        const fileName = `${String(index + 1).padStart(3, '0')}_${safeChapterName}.txt`;

                        let content = chapter.content;
                        if (content === undefined && chapter.id) {
                            content = await this.appServices.historyService.getChapterContent(chapter.id);
                        }

                        zip.addFile(fileName, content || "");
                    }

                    zipBlob = zip.generateBlob();
                } else if (JSZipCtor) {
                    const zip = new JSZipCtor();

                    for (let index = 0; index < totalChapters; index++) {
                        const chapter = project.chapters[index];
                        const chapterRawName = (chapter.name || `Chapter_${index + 1}`).trim();
                        const safeChapterName = chapterRawName.replace(/[\\/:*?"<>|]/g, '_');
                        const fileName = `${String(index + 1).padStart(3, '0')}_${safeChapterName}.txt`;

                        let content = chapter.content;
                        if (content === undefined && chapter.id) {
                            content = await this.appServices.historyService.getChapterContent(chapter.id);
                        }

                        zip.file(fileName, content || "");
                    }

                    zipBlob = await zip.generateAsync({ type: "blob" });
                } else {
                    throw new Error("No ZIP engine available in runtime.");
                }

                this._triggerDownload(zipBlob, `${safeProjectName}.zip`);
                this.logger.notify(`Project "${projectName}" downloaded successfully (.zip)`, "Success", "success");
            } catch (error) {
                this.logger.error("Error creating ZIP file:", error);
                this.logger.notify(`Unable to create ZIP file: ${error.message}`, "Error", "error");
            }
        }

        /**
         * Tải toàn bộ project gộp thành 1 file .txt duy nhất.
         * Rất tiện lợi cho việc đọc offline, nạp vào máy đọc sách (Kindle, Kobo) hoặc app TTS.
         */
        async _downloadProjectMergedTxt(project) {
            if (!project.chapters || project.chapters.length === 0) {
                this.logger.notify("Project is empty. Nothing to download.", "Notice", "info");
                return;
            }

            const projectName = project.name || "Novel_Project";
            const safeProjectName = projectName.replace(/[\\/:*?"<>|]/g, '_').trim() || "Novel_Project";
            const totalChapters = project.chapters.length;

            this.logger.notify(`Merging ${totalChapters} chapters for "${projectName}"...`, "Info", "info");

            try {
                let mergedContent = `========================================\n`;
                mergedContent += `${projectName.toUpperCase()}\n`;
                mergedContent += `Total Chapters: ${totalChapters}\n`;
                mergedContent += `Exported: ${new Date().toLocaleString()}\n`;
                mergedContent += `========================================\n\n`;

                for (let index = 0; index < totalChapters; index++) {
                    const chapter = project.chapters[index];
                    const chapterTitle = (chapter.name || `Chapter ${index + 1}`).trim();

                    let content = chapter.content;
                    if (content === undefined && chapter.id) {
                        content = await this.appServices.historyService.getChapterContent(chapter.id);
                    }

                    mergedContent += `\n\n${'='.repeat(40)}\n`;
                    mergedContent += `${String(index + 1).padStart(3, '0')}. ${chapterTitle}\n`;
                    mergedContent += `${'='.repeat(40)}\n\n`;
                    mergedContent += (content || "").trim();
                    mergedContent += `\n`;
                }

                const blob = new Blob([mergedContent], { type: "text/plain;charset=utf-8" });
                this._triggerDownload(blob, `${safeProjectName}_merged.txt`);
                this.logger.notify(`Project "${projectName}" downloaded successfully (.txt)`, "Success", "success");
            } catch (error) {
                this.logger.error("Error creating merged TXT file:", error);
                this.logger.notify(`Unable to export merged TXT: ${error.message}`, "Error", "error");
            }
        }
    }