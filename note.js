// =============================================
// Catatan (Notes) - fitur catatan pribadi ala smartphone
// Penyimpanan: localStorage selalu + sinkron Neon saat login.
// =============================================

const NOTE_COLORS = [
    { name: 'Default', value: '' },
    { name: 'Kuning', value: '#fff8c5' },
    { name: 'Hijau', value: '#d0f4de' },
    { name: 'Biru', value: '#d6eaff' },
    { name: 'Merah Muda', value: '#ffd9e8' },
    { name: 'Ungu', value: '#e6dcff' },
    { name: 'Oranye', value: '#ffe0c2' },
    { name: 'Abu', value: '#e4e6eb' },
];

const notesApp = {
    notes: [],
    searchQuery: '',
    categoryFilter: 'Semua',
    currentEditId: null,
    initialized: false,

    init() {
        if (this.initialized) return;
        this.initialized = true;
        this.loadFromLocal();
        this.syncFromNeon();
    },

    // ---------- Storage lokal ----------
    loadFromLocal() {
        try {
            const raw = localStorage.getItem('aiNotes');
            this.notes = raw ? JSON.parse(raw) : [];
        } catch (e) {
            console.warn('Gagal load notes lokal:', e);
            this.notes = [];
        }
    },

    saveToLocal() {
        try {
            localStorage.setItem('aiNotes', JSON.stringify(this.notes));
        } catch (e) {
            console.warn('Gagal simpan notes lokal:', e);
        }
    },

    // ---------- Sinkron Neon ----------
    async syncFromNeon() {
        if (typeof neonLoadNotes !== 'function') return;
        if (!window.authSystem?.checkAuthStatus?.()) return;
        try {
            const cloud = await neonLoadNotes();
            if (Array.isArray(cloud) && cloud.length > 0) {
                this.notes = cloud;
                this.saveToLocal();
                this.renderList();
                this.renderCategoryFilter();
            }
        } catch (e) {
            console.warn('Notes sync dari Neon gagal:', e.message);
        }
    },

    async saveToNeon() {
        if (typeof neonSaveAllNotes !== 'function') return;
        try {
            await neonSaveAllNotes(this.notes);
        } catch (e) {
            console.warn('Notes sync ke Neon gagal:', e.message);
        }
    },

    persist() {
        this.saveToLocal();
        this.saveToNeon();
    },

    // ---------- CRUD ----------
    createNote() {
        const now = new Date().toISOString();
        const note = {
            id: 'note_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            title: '',
            content: '',
            category: 'Umum',
            color: '',
            pinned: false,
            createdAt: now,
            updatedAt: now,
        };
        this.notes.unshift(note);
        this.persist();
        this.currentEditId = note.id;
        this.openEditor(note.id);
    },

    getNote(id) {
        return this.notes.find(n => n.id === id);
    },

    saveCurrentNote() {
        const note = this.getNote(this.currentEditId);
        if (!note) return;

        const title = document.getElementById('noteEditorTitle');
        const content = document.getElementById('noteEditorContent');
        const category = document.getElementById('noteEditorCategory');
        const colorSwatches = document.querySelectorAll('#noteColorSwatches .note-color');
        const pinned = document.getElementById('noteEditorPinned');

        note.title = title ? title.value.trim() : '';
        note.content = content ? content.value : '';
        note.category = category ? category.value.trim() || 'Umum' : 'Umum';
        note.pinned = pinned ? pinned.checked : false;
        note.updatedAt = new Date().toISOString();

        colorSwatches.forEach(sw => {
            if (sw.classList.contains('active')) note.color = sw.dataset.color || '';
        });

        this.persist();
        this.renderList();
        this.renderCategoryFilter();
    },

    deleteNote(id) {
        const note = this.getNote(id);
        if (!note) return;

        Swal.fire({
            title: 'Hapus Catatan?',
            text: note.title || 'Catatan tanpa judul',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Ya, Hapus',
            cancelButtonText: 'Batal',
        }).then((result) => {
            if (!result.isConfirmed) return;
            this.notes = this.notes.filter(n => n.id !== id);
            this.persist();
            if (typeof neonDeleteNote === 'function') {
                neonDeleteNote(id).catch(() => {});
            }
            if (this.currentEditId === id) this.currentEditId = null;
            this.renderList();
            this.renderCategoryFilter();
            if (this.currentEditId === null) this.closeEditor();
        });
    },

    deleteAllNotes() {
        if (this.notes.length === 0) return;
        Swal.fire({
            title: 'Hapus Semua Catatan?',
            text: `${this.notes.length} catatan akan dihapus permanen!`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#6c757d',
            confirmButtonText: 'Ya, Hapus Semua',
            cancelButtonText: 'Batal',
        }).then((result) => {
            if (!result.isConfirmed) return;
            this.notes = [];
            this.currentEditId = null;
            this.persist();
            if (typeof neonDeleteAllNotes === 'function') {
                neonDeleteAllNotes().catch(() => {});
            }
            this.renderList();
            this.renderCategoryFilter();
            this.closeEditor();
        });
    },

    togglePin(id) {
        const note = this.getNote(id);
        if (!note) return;
        note.pinned = !note.pinned;
        note.updatedAt = new Date().toISOString();
        this.persist();
        this.renderList();
    },

    // ---------- Filter ----------
    categories() {
        const set = new Set(this.notes.map(n => n.category || 'Umum'));
        return ['Semua', ...Array.from(set)];
    },

    filterNotes() {
        const q = this.searchQuery.trim().toLowerCase();
        const showCat = (this.categoryFilter !== 'Semua');
        return this.notes
            .filter(n => {
                if (showCat && (n.category || 'Umum') !== this.categoryFilter) return false;
                if (!q) return true;
                const title = (n.title || '').toLowerCase();
                const content = (n.content || '').toLowerCase();
                const category = (n.category || '').toLowerCase();
                return title.indexOf(q) !== -1 || content.indexOf(q) !== -1 || category.indexOf(q) !== -1;
            })
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return (b.updatedAt || '').localeCompare(a.updatedAt || '');
            });
    },

    // ---------- Render ----------
    renderCategoryFilter() {
        const wrap = document.getElementById('notesCategoryFilter');
        const searchWrap = document.getElementById('notesSearchWrap');
        if (!wrap) return;

        if (searchWrap) searchWrap.style.display = 'block';

        const cats = this.categories();
        if (cats.length <= 1) {
            wrap.innerHTML = '';
            return;
        }
        wrap.innerHTML = cats.map(c => `
            <button class="btn btn-sm ${c === this.categoryFilter ? 'btn-primary' : 'btn-outline-primary'}" onclick="notesApp.setCategory('${attrNoteEscape(c)}')">
                ${c === 'Semua' ? 'Semua' : escapeNoteHtml(c)}
            </button>
        `).join(' ');
    },

    setCategory(cat) {
        this.categoryFilter = cat;
        this.renderCategoryFilter();
        this.renderList();
    },

    renderList() {
        const list = document.getElementById('notesList');
        if (!list) return;

        const filtered = this.filterNotes();
        const countBadge = document.getElementById('notesCount');
        if (countBadge) countBadge.textContent = `${filtered.length} catatan`;

        if (filtered.length === 0) {
            list.innerHTML = `
                <div class="text-center text-muted py-5">
                    <i class="bi bi-journal-text" style="font-size: 3rem;"></i>
                    <p class="mt-2">${this.notes.length === 0 ? 'Belum ada catatan. Klik "Buat Catatan" untuk memulai.' : 'Tidak ada catatan yang cocok dengan pencarian.'}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = filtered.map(n => {
            const snippet = (n.content || '').replace(/\n/g, ' ').trim();
            const title = escapeNoteHtml(n.title || 'Tanpa Judul');
            const category = escapeNoteHtml(n.category || 'Umum');
            const date = formatNoteDate(n.updatedAt || n.createdAt);
            const color = n.color || '';
            const preview = snippet.length > 120 ? snippet.slice(0, 120) + '...' : snippet;

            return `
                <div class="col-12 col-sm-6 col-lg-4">
                    <div class="card note-card shadow-sm h-100" style="background-color: ${color || '#fff'}; cursor: pointer;" onclick="notesApp.openEditor('${attrNoteEscape(n.id)}')">
                        <div class="card-body d-flex flex-column">
                            <div class="d-flex justify-content-between align-items-start mb-1">
                                <span class="badge ${color ? 'bg-dark' : 'bg-primary'}">${category}</span>
                                <div class="btn-group btn-group-sm" onclick="event.stopPropagation()">
                                    <button class="btn btn-outline-secondary btn-sm" onclick="notesApp.togglePin('${attrNoteEscape(n.id)}')" title="${n.pinned ? 'Lepas semat' : 'Semat'}">
                                        <i class="bi ${n.pinned ? 'bi-pin-fill text-danger' : 'bi-pin'}"></i>
                                    </button>
                                    <button class="btn btn-outline-secondary btn-sm" onclick="notesApp.exportSingleNote('${attrNoteEscape(n.id)}')" title="Unduh sebagai teks">
                                        <i class="bi bi-download"></i>
                                    </button>
                                    <button class="btn btn-outline-danger btn-sm" onclick="notesApp.deleteNote('${attrNoteEscape(n.id)}')" title="Hapus">
                                        <i class="bi bi-trash"></i>
                                    </button>
                                </div>
                            </div>
                            <h6 class="card-title mb-1 text-truncate">${n.pinned ? '<i class="bi bi-pin-fill text-danger me-1"></i>' : ''}${title}</h6>
                            <p class="card-text small flex-grow-1 mb-2" style="white-space: pre-line;">${preview ? escapeNoteHtml(preview) : '<span class="text-muted fst-italic">Kosong...</span>'}</p>
                            <small class="text-muted">${date}</small>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ---------- Editor ----------
    openEditor(id) {
        const note = this.getNote(id);
        if (!note) return;

        this.currentEditId = id;
        const listView = document.getElementById('notesListView');
        const editView = document.getElementById('notesEditView');

        if (listView) listView.style.display = 'none';
        if (editView) editView.style.display = 'block';

        const title = document.getElementById('noteEditorTitle');
        const content = document.getElementById('noteEditorContent');
        const category = document.getElementById('noteEditorCategory');
        const pinned = document.getElementById('noteEditorPinned');
        const swatches = document.getElementById('noteColorSwatches');

        if (title) title.value = note.title || '';
        if (content) content.value = note.content || '';
        if (category) category.value = note.category || 'Umum';
        if (pinned) pinned.checked = !!note.pinned;

        if (swatches) {
            swatches.innerHTML = NOTE_COLORS.map(c => `
                <button type="button" class="btn btn-sm p-1 note-color ${(note.color || '') === c.value ? 'active' : ''}"
                    style="background-color: ${c.value || '#f8f9fa'}; border: 2px solid ${(note.color || '') === c.value ? '#0d6efd' : '#dee2e6'}; width: 30px; height: 30px;"
                    data-color="${c.value}" title="${c.name}" onclick="notesApp.pickColor(this)"></button>
            `).join('');
        }

        // Auto-resize textarea
        if (content) {
            content.style.height = 'auto';
            content.style.height = content.scrollHeight + 'px';
        }

        // Datalist kategor i dari catatan yang ada
        const dlist = document.getElementById('noteCategoryList');
        if (dlist) {
            const cats = Array.from(new Set(this.notes.map(n => n.category || 'Umum')));
            dlist.innerHTML = cats.map(c => `<option value="${escapeNoteHtml(c)}"></option>`).join('');
        }
    },

    pickColor(el) {
        document.querySelectorAll('#noteColorSwatches .note-color').forEach(s => s.classList.remove('active'));
        el.classList.add('active');
    },

    closeEditor() {
        this.currentEditId = null;
        const listView = document.getElementById('notesListView');
        const editView = document.getElementById('notesEditView');
        if (listView) listView.style.display = 'block';
        if (editView) editView.style.display = 'none';
        this.renderList();
        this.renderCategoryFilter();
    },

    // ---------- Export / Import ----------
    exportNotes() {
        if (this.notes.length === 0) {
            Swal.fire({ icon: 'info', title: 'Belum ada catatan', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
            return;
        }
        const payload = {
            app: 'AI Assistant Web',
            type: 'catatan',
            version: 1,
            exportedAt: new Date().toISOString(),
            notes: this.notes,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'catatan-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    exportSingleNote(id) {
        const note = this.getNote(id);
        if (!note) return;
        const text = `# ${note.title || 'Tanpa Judul'}\n\n${note.content || ''}\n\n— ${formatNoteDate(note.updatedAt || note.createdAt)} · ${note.category || 'Umum'}`;
        const safeTitle = (note.title || 'tanpa-judul').replace(/[^\w\d-_]+/g, '-').toLowerCase().slice(0, 40);
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = safeTitle + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importNotes(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                let incoming = null;
                if (Array.isArray(data)) {
                    incoming = data;
                } else if (data && Array.isArray(data.notes)) {
                    incoming = data.notes;
                }
                if (!incoming) {
                    Swal.fire({ icon: 'error', title: 'Format file tidak dikenali', text: 'Harap gunakan file hasil Export Catatan.' });
                    return;
                }

                // Normalisasi + merge (hindari duplikat id)
                const existing = new Map(this.notes.map(n => [n.id, n]));
                let added = 0, updated = 0;
                incoming.forEach(n => {
                    if (!n || typeof n !== 'object' || !n.id) return;
                    const clean = {
                        id: String(n.id),
                        title: typeof n.title === 'string' ? n.title : '',
                        content: typeof n.content === 'string' ? n.content : '',
                        category: typeof n.category === 'string' && n.category ? n.category : 'Umum',
                        color: typeof n.color === 'string' && NOTE_COLORS.some(c => c.value === n.color) ? n.color : '',
                        pinned: !!n.pinned,
                        createdAt: n.createdAt || new Date().toISOString(),
                        updatedAt: n.updatedAt || new Date().toISOString(),
                    };
                    if (existing.has(clean.id)) {
                        existing.set(clean.id, { ...existing.get(clean.id), ...clean, updatedAt: new Date().toISOString() });
                        updated++;
                    } else {
                        existing.set(clean.id, clean);
                        added++;
                    }
                });

                if (existing.size === this.notes.length && added === 0 && updated === 0) {
                    Swal.fire({ icon: 'info', title: 'Tidak ada catatan baru untuk diimpor.' });
                    return;
                }

                this.notes = Array.from(existing.values());
                this.persist();
                this.renderList();
                this.renderCategoryFilter();
                Swal.fire({
                    icon: 'success',
                    title: 'Import Berhasil',
                    text: `${added} catatan ditambahkan, ${updated} diperbarui.`,
                    toast: true,
                    position: 'top-end',
                    timer: 3000,
                    showConfirmButton: false,
                });
            } catch (e) {
                console.error('Import notes error:', e);
                Swal.fire({ icon: 'error', title: 'Gagal mengimpor', text: 'File tidak valid: ' + e.message });
            }
        };
        reader.readAsText(file);
    },
};

// ---------- Helper ----------
function escapeNoteHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function attrNoteEscape(str) {
    return escapeNoteHtml(String(str)).replace(/'/g, '&#39;');
}

function formatNoteDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const now = new Date();
    const diff = now - d;
    if (diff < 60 * 1000) return 'Baru saja';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' menit lalu';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' jam lalu';
    return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------- Global wrapper (dipanggil HTML) ----------
function showNotesModal() {
    notesApp.init();

    const modalEl = document.getElementById('notesModal');
    if (!modalEl) return;
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    // Reset ke tampilan daftar
    document.getElementById('notesSearch').value = '';
    notesApp.searchQuery = '';
    notesApp.categoryFilter = 'Semua';
    notesApp.currentEditId = null;
    document.getElementById('notesListView').style.display = 'block';
    document.getElementById('notesEditView').style.display = 'none';

    notesApp.renderCategoryFilter();
    notesApp.renderList();
    modal.show();
}

function setNotesSearch(value) {
    notesApp.searchQuery = value;
    notesApp.renderList();
}

function newNote() {
    notesApp.createNote();
}

function saveNoteFromEditor() {
    notesApp.saveCurrentNote();
}

function closeNoteEditor() {
    notesApp.closeEditor();
}

function importNotesFile(input) {
    if (input && input.files && input.files[0]) {
        notesApp.importNotes(input.files[0]);
        input.value = '';
    }
}

function autoGrowNote(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}

// Inisialisasi saat DOM siap
document.addEventListener('DOMContentLoaded', function() {
    notesApp.init();
});