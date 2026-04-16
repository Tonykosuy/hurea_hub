const API_URL = 'https://script.google.com/macros/s/AKfycbx002vezB-aD9o-czvnMURfqtCwP4l8rUCffrngZbT38ZSX8QZHvS3UF0n796UTYFoA/exec';
let ADMIN_PASSWORD = '1'; // Loaded from API config

const state = {
    theme: localStorage.getItem('hurea-theme') || 'light',
    currentTerm: null,
    terms: [], members: [], projects: [],
    evaluations: [], clubScores: [], deptScores: [],
    confessions: [], evidences: {},
    commonFolders: [],
    bugReports: [],
    meetingPolls: [],
    meetingVotes: [],
    meetingPollFilter: 'all',
    activePollId: null,
    myTimeSelections: {},
    activeProjectParticipantsSetup: [],
    activeProjectTeamsSetup: [],
    activeProjectTargetTeam: null,
    scoreDeptFilter: 'ALL',
    currentDetailMemberId: null,
    evidenceDeptFilter: 'ALL',
    msDeptFilter: 'ALL',
    loginDeptFilter: 'ALL',
    passwordDeptFilter: 'ALL',
    msSelectedIds: [],
    // Project V2 State
    projectTypeFilter: 'ALL',
    projectStatusFilter: 'ALL',
    activeProjectData: null,
    mpTarget: null,
    mpFilter: 'ALL',
    currentEvidenceMemberId: null,
    // View Modes
    memberViewMode: localStorage.getItem('member-view-mode') || 'grid',
    pickerViewMode: localStorage.getItem('picker-view-mode') || 'grid',
    // Auth
    currentUser: null,
    userRole: 'guest',
    userPasswords: [],
    config: {},
    initialLoading: true,
    tempPickerData: { memberId: null, teamId: null },
    selectedPickerIds: []
};

// --- DATA HELPERS ---
function safeJsonParse(val, fallback) {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    if (typeof val !== 'string') return fallback;

    const trimmed = val.trim();
    if (trimmed === '') return fallback;

    // Attempt standard parse
    try { return JSON.parse(trimmed); } catch (e) { /* continue */ }

    // Aggressive Smart Parse for manual sheet edits & Google Apps Script's {a=b} format
    try {
        let cleaned = trimmed
            .replace(/[\u201C\u201D\u201E\u201F]/g, '"') // Smart double quotes
            .replace(/[\u2018\u2019\u201A\u201B]/g, "'") // Smart single quotes
            .replace(/=/g, ':')                          // GAS uses '=' instead of ':'
            .replace(/'/g, '"')                          // Replace single with double
            .replace(/(\w+):/g, '"$1":')                // Quote unquoted keys
            .replace(/:\s*([^",}\]]+)(?=[,}\]])/g, ':"$1"'); // Quote unquoted values (simple strings)

        return JSON.parse(cleaned);
    } catch (e2) {
        console.warn("Recoverable JSON parse failure, using fallback. String:", trimmed);
        return fallback;
    }
}

function ensureArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim().startsWith('[')) {
        return safeJsonParse(val, []);
    }
    return [];
}

function ensureObject(val) {
    if (!val) return {};
    if (typeof val === 'object' && !Array.isArray(val)) return val;
    if (typeof val === 'string' && val.trim().startsWith('{')) {
        return safeJsonParse(val, {});
    }
    return {};
}

function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 1).toUpperCase();
    return (parts[0].substring(0, 1) + parts[parts.length - 1].substring(0, 1)).toUpperCase();
}

/**
 * Normalizes keys that might have been lowercased by the backend (Google Sheets headers)
 * to the camelCase names expected by the frontend logic.
 */
function normalizeDataKeys(data) {
    if (!data) return data;
    if (Array.isArray(data)) return data.map(item => normalizeDataKeys(item));
    if (typeof data !== 'object') return data;

    const mapping = {
        'memberid': 'memberId',
        'plid': 'plId',
        'haspl': 'hasPL',
        'createdat': 'createdAt',
        'updatedat': 'updatedAt',
        'totalscore': 'totalScore',
        'teamname': 'teamName',
        'prjid': 'prjId',
        'raterid': 'raterId',
        'targetid': 'targetId',
        'raterrole': 'raterRole',
        'targetrole': 'targetRole',
        'folderid': 'folderId',
        'folderlabel': 'folderLabel',
        // Member field mappings
        'lastname': 'lastName',
        'firstname': 'firstName',
        'studentid': 'studentId',
        'mssv': 'studentId',
        'faculty': 'major',
        'emailpersonal': 'personalEmail',
        'emailclub': 'clubEmail',
        'personalemail': 'personalEmail',
        'clubemail': 'clubEmail',
        'ban': 'dept',
        // Meeting scheduler field mappings
        'pollid': 'pollId',
        'userid': 'userId',
        'username': 'userName',
        'creatorid': 'creatorId',
        'creatorname': 'creatorName',
        'startdate': 'startDate',
        'enddate': 'endDate',
        'starthour': 'startHour',
        'endhour': 'endHour',
        'votedat': 'votedAt'
    };

    const newData = {};
    for (let key in data) {
        const normalizedKey = mapping[key.toLowerCase()] || key;
        newData[normalizedKey] = data[key];
    }
    return newData;
}

document.addEventListener('DOMContentLoaded', async () => {
    initTheme(); setupNavigation(); setupEvalTabs(); setupSearchableDropdowns();
    initToast();
    if (API_URL) { await loadDataFromAPI(); } else { seedMockData(); }
    initMeetingScheduler();
    // initPinInputs(); // Replaced by standard password fields
    showLoginScreen();
});

function renderAllViews() {
    const views = [
        { name: 'Terms', fn: renderTerms },
        { name: 'Members', fn: renderMembers },
        { name: 'Projects', fn: renderProjects },
        { name: 'Stats', fn: updateDashboardStats },
        { name: 'Dropdowns', fn: populateSelectDropdowns },
        { name: 'Evidence', fn: renderEvidenceFolders },
        { name: 'Passwords', fn: renderPasswordManagement },
        { name: 'LoginSelector', fn: renderLoginMemberSelector },
        { name: 'EvalTasks', fn: renderEvaluationTasks },
        { name: 'Feedbacks', fn: renderFeedbacks },
        { name: 'BugReports', fn: renderBugReports },
        { name: 'Confessions', fn: renderConfessions },
        { name: 'MeetingPolls', fn: renderMeetingPolls }
    ];

    views.forEach(v => {
        try { v.fn(); } catch (e) { console.error(`Render Error in ${v.name}:`, e); }
    });
}

async function loadDataFromAPI() {
    state.initialLoading = true;
    renderAllViews();

    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'flex';
    try {
        const r = await fetch(API_URL);
        const d = await r.json();
        if (d.status === 'success') {
            state.terms = normalizeDataKeys(d.terms || []); state.members = normalizeDataKeys(d.members || []);
            state.projects = normalizeDataKeys(d.projects || []); state.evaluations = normalizeDataKeys(d.evaluations || []);
            state.clubScores = normalizeDataKeys(d.clubScores || []); state.deptScores = normalizeDataKeys(d.deptScores || []);
            state.announcements = normalizeDataKeys(d.announcements || []);
            state.bugReports = normalizeDataKeys(d.bugReports || []);
            state.userPasswords = normalizeDataKeys(d.userPasswords || []);
            state.commonFolders = normalizeDataKeys(d.commonFolders || []);
            state.confessions = normalizeDataKeys(d.confessions || []);
            state.meetingPolls = normalizeDataKeys(d.meetingPolls || []);
            state.meetingVotes = normalizeDataKeys(d.meetingVotes || []);
            state.config = normalizeDataKeys(d.config || {});
            if (state.config.adminPassword) ADMIN_PASSWORD = String(state.config.adminPassword);
            if (d.evidences) {
                d.evidences.forEach(ev => {
                    if (ev.memberId) {
                        state.evidences[ev.memberId] = { photos: [], newPhotos: [], label: ev.label || '', photoCount: ev.photoCount || 0 };
                    }
                });
            }
            if (d.evidenceImages) {
                state.evidenceImages = ensureArray(d.evidenceImages).map(normalizeDataKeys);
            }
            if (state.terms && state.terms.length > 0) {
                // Safe term picking: use d.config if available, otherwise last term
                state.currentTerm = (d.config && d.config.currentTerm) ? d.config.currentTerm : state.terms[state.terms.length - 1].id;
                const activeTerm = state.terms.find(t => t.id === state.currentTerm) || state.terms[state.terms.length - 1];
                const labelEl = document.getElementById('active-term-label');
                if (labelEl) labelEl.innerText = activeTerm.name;
            } else {
                const labelEl = document.getElementById('active-term-label');
                if (labelEl) labelEl.innerText = 'Kho dữ liệu TRỐNG';
            }
            // Diagnostic info
            console.log('--- API SYNC DIAGNOSTIC ---');
            console.log('Projects loaded:', state.projects.length);
            console.log('Members loaded:', state.members.length);
            console.log('Current Term ID:', state.currentTerm);
            console.log('---------------------------');

            if (state.projects.length === 0 && (state.members.length > 0 || state.terms.length > 0)) {
                console.warn('Warning: Projects tab is empty but other data loaded. Check sheet tab name "Projects".');
            }
        } else {
            console.error('API Error:', d.message);
        }
    } catch (e) {
        console.error('Network Error:', e.message);
    } finally {
        state.initialLoading = false;
        if (loader) loader.style.display = 'none';
        renderAllViews();
    }
}

function retryLoadData() {
    loadDataFromAPI();
}

async function syncToBackend(action, payload) {
    if (!API_URL) return;
    try {
        const response = await fetch(`${API_URL}?action=${action}`, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        console.log(`Sync (${action}):`, res);
        if (res.status !== 'success') {
            console.error(`Sync Error (${action}):`, res.message);
            showToast('Lỗi đồng bộ dữ liệu: ' + res.message, 'error');
            throw new Error(res.message);
        }
        return res;
    } catch (e) {
        console.error(`Sync failed (${action}):`, e);
        throw e;
    }
}

function initToast() {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:999999;display:flex;flex-direction:column;gap:12px;pointer-events:none;';
    document.body.appendChild(container);
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const colors = {
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6'
    };
    toast.style.cssText = `background:${colors[type]};color:white;padding:12px 20px;border-radius:12px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.1);font-weight:600;font-size:0.9rem;pointer-events:all;animation:toastIn 0.3s ease forwards;`;
    toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : (type === 'error' ? 'fa-circle-exclamation' : 'fa-info-circle')}"></i> ${msg}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// THEME
function initTheme() {
    const savedTheme = localStorage.getItem('hurea-theme') || 'light';
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', state.theme);
    updateThemeIcon();
}

function toggleTheme() {
    state.theme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', state.theme);
    localStorage.setItem('hurea-theme', state.theme);
    updateThemeIcon();

    // Refresh charts to update colors for the new theme
    if (typeof updateDashboardStats === 'function') {
        // Delay slightly to let CSS variables transition if any
        setTimeout(updateDashboardStats, 100);
    }
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-btn');
    if (!btn) return;
    btn.innerHTML = state.theme === 'dark'
        ? '<i class="fa-solid fa-sun"></i>'
        : '<i class="fa-solid fa-moon"></i>';
}

// VIEW SWITCHERS
function toggleMemberView(mode) {
    state.memberViewMode = mode;
    localStorage.setItem('member-view-mode', mode);
    renderMembers();
}

function togglePickerView(mode) {
    state.pickerViewMode = mode;
    localStorage.setItem('picker-view-mode', mode);
    renderMemberPicker();
}

// NAVIGATION
function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', e => {
            e.preventDefault();
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
            item.classList.add('active');
            const targetId = item.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active');
            if (targetId === 'eval-view') calculateFinalScores();
            if (targetId === 'dashboard-view') updateDashboardStats();
            if (targetId === 'feedback-view') { renderFeedbacks(); renderConfessions(); }
            if (targetId === 'evidence-view') renderEvidenceFolders();
            if (targetId === 'meeting-scheduler-view') renderMeetingPolls();
            if (targetId === 'bug-report-view') renderBugReports();
            if (targetId === 'pin-management-view') renderPinManagement();

            // Auto-close sidebar on mobile after navigation
            if (window.innerWidth <= 850) {
                closeMobileSidebar();
            }
        });
    });
}

function toggleMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.toggle('mobile-open');
    backdrop.classList.toggle('active');
    document.body.classList.toggle('sidebar-locked');
}

function closeMobileSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.remove('mobile-open');
    backdrop.classList.remove('active');
    document.body.classList.remove('sidebar-locked');
}

function setupEvalTabs() {
    document.querySelectorAll('.eval-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-eval');
            switchEvalTab(tabId);
        });
    });
}

function switchEvalTab(paneId) {
    document.querySelectorAll('.eval-tab').forEach(t => {
        if (t.getAttribute('data-eval') === paneId) {
            t.classList.add('active');
        } else {
            t.classList.remove('active');
        }
    });
    document.querySelectorAll('.eval-pane').forEach(p => {
        if (p.id === paneId) {
            p.classList.add('active');
        } else {
            p.classList.remove('active');
        }
    });

    // If switching to evaluation tabs, decide which screen to show
    if (paneId === 'eval-club' || paneId === 'eval-dept') {
        const type = paneId.replace('eval-', '');
        const mInput = document.getElementById(`eval-${type}-member`);
        const mId = mInput ? mInput.value : '';
        
        const methodSelection = document.getElementById(`${type}-method-selection`);
        const formContainer = document.getElementById(`${type}-form-container`);
        
        if (methodSelection && formContainer) {
            if (!mId) {
                methodSelection.style.display = 'grid';
                formContainer.style.display = 'none';
            } else {
                methodSelection.style.display = 'none';
                formContainer.style.display = 'block';
            }
        }
    }
}

// MODALS
function openModal(id, extra) {
    document.getElementById(id).classList.add('active');
    if (id === 'project-modal') { state.activeProjectParticipantsSetup = []; renderParticipantList(); }
    if (id === 'announcement-modal') {
        const idField = document.getElementById('ann-id');
        // Chỉ reset nếu có extra (tức là mở từ nút Tạo mới, còn nếu truyền từ editAnnouncement thì không được gọi với extra là GLOBAL/DEPT bởi vì editAnnouncement mở trực tiếp không qua extra)
        if (extra) {
            if (idField) idField.value = '';
            document.getElementById('ann-title').value = '';
            document.getElementById('ann-content').value = '';
            document.getElementById('ann-type').value = extra;
            document.getElementById('ann-modal-title').innerText = extra === 'GLOBAL' ? 'Đăng Tin Toàn CLB' : 'Đăng Tin Ban';
            document.getElementById('ann-dept-group').style.display = extra === 'DEPT' ? 'block' : 'none';
            document.getElementById('ann-preview').style.display = 'flex';
            document.getElementById('ann-preview').innerHTML = `
                <div class="drop-circle" style="width:40px;height:40px;font-size:1rem;">
                    <i class="fa-solid fa-cloud-arrow-up"></i>
                </div>
                <div class="drop-text" style="flex-direction:row;align-items:center;gap:12px;">
                    <strong>Nhấn để tải ảnh</strong>
                </div>`;
        }
    }
}
function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    const f = document.querySelector(`#${id} form`);
    if (f) f.reset();
}

// MOCK DATA
function seedMockData() {
    state.terms = [{ id: 'term_12', name: 'Nhiệm kỳ 12 (2024-2025)', bcn: { pres: 'Admin', vp: '', ld: '', rr: '', er: '', eb: '' } }];
    state.currentTerm = 'term_12';
    state.members = [
        { id: 'm1', name: 'Nguyễn Văn A', class: 'CQ60-HR', cohort: '12', dept: 'L&D', major: 'Quản trị NNL' },
        { id: 'm2', name: 'Trần Thị B', class: 'CQ60-MKT', cohort: '12', dept: 'ER', major: 'Marketing' },
        { id: 'm3', name: 'Lê Văn C', class: 'CQ61-KT', cohort: '12', dept: 'R&R', major: 'Kế toán' },
        { id: 'm4', name: 'Phạm Bình D', class: 'CQ61-HR', cohort: '12', dept: 'L&D', major: 'Quản trị NNL' },
        { id: 'm5', name: 'Hoàng Thái E', class: 'CQ61-MKT', cohort: '12', dept: 'EB', major: 'Truyền thông' },
    ];
    state.projects = [
        {
            id: 'p1', name: 'Teambuilding 2024', term: 'term_12', type: 'internal', status: 'finish', hasPL: true,
            participants: [{ memberId: 'm1', role: 'PL' }, { memberId: 'm2', role: 'CT' }, { memberId: 'm3', role: 'CT' }]
        },
        {
            id: 'p2', name: 'Job Fair 2025', term: 'term_12', type: 'event', status: 'running', hasPL: true,
            participants: [{ memberId: 'm2', role: 'TL' }, { memberId: 'm4', role: 'CT' }, { memberId: 'm5', role: 'SP' }]
        }
    ];
    document.getElementById('active-term-label').innerText = state.terms[0].name;
}

// SEARCHABLE DROPDOWNS
function setupSearchableDropdowns() {
    document.addEventListener('click', e => {
        if (!e.target.closest('.searchable-dropdown-container'))
            document.querySelectorAll('.searchable-dropdown').forEach(d => d.classList.remove('active'));
    });
    document.querySelectorAll('.searchable-input').forEach(inp => {
        inp.addEventListener('keyup', function () {
            const f = this.value.toLowerCase();
            this.nextElementSibling.querySelectorAll('li').forEach(li => {
                li.style.display = li.textContent.toLowerCase().includes(f) ? '' : 'none';
            });
        });
    });
}

function toggleDropdown(id) {
    document.querySelectorAll('.searchable-dropdown').forEach(d => { if (d.id !== id) d.classList.remove('active'); });
    document.getElementById(id).classList.toggle('active');
    if (document.getElementById(id).classList.contains('active'))
        document.getElementById(id).querySelector('input').focus();
}

function fillSearchableDropdown(listId, data, valKey, labelKey, fmtCb, hiddenId, btnId, cb) {
    const ul = document.getElementById(listId);
    if (!ul) return;
    ul.innerHTML = '';
    data.forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = fmtCb ? fmtCb(item) : item[labelKey];
        li.dataset.val = item[valKey];
        li.dataset.label = fmtCb ? item[labelKey] : item[labelKey];
        li.onclick = () => {
            document.getElementById(hiddenId).value = li.dataset.val;
            document.getElementById(btnId).innerHTML = fmtCb ? fmtCb(item) : item[labelKey];
            document.getElementById(btnId).nextElementSibling.classList.remove('active');
            if (cb) cb(li.dataset.val);
        };
        ul.appendChild(li);
    });
}

function populateSelectDropdowns() {
    fillSearchableDropdown('list-club-member', state.members, 'id', 'name',
        m => `<strong>${m.name}</strong> - ${m.dept}`, 'eval-club-member', 'btn-club-member');
    fillSearchableDropdown('list-dept-member', state.members, 'id', 'name',
        m => `<strong>${m.name}</strong> - ${m.dept}`, 'eval-dept-member', 'btn-dept-member');
    const termProjects = state.projects.filter(p => p.term === state.currentTerm);
    fillSearchableDropdown('list-prj', termProjects, 'id', 'name',
        p => `<strong>${p.name}</strong>`, 'eval-prj-id', 'btn-prj');
    const fb = document.getElementById('filter-feedback-prj');
    let opts = '<option value="ALL">Toàn bộ Dự án</option>';
    termProjects.forEach(p => opts += `<option value="${p.id}">${p.name}</option>`);
    fb.innerHTML = opts;
}

// ==========================================
// MEMBERS MODULE
// ==========================================
function renderMembers() {
    const grid = document.getElementById('members-grid-v2');
    const empty = document.getElementById('members-empty');
    if (!grid || !empty) return;

    // Update switcher active states
    const btnGrid = document.getElementById('btn-member-grid');
    const btnList = document.getElementById('btn-member-list');
    if (btnGrid) btnGrid.classList.toggle('active', state.memberViewMode === 'grid');
    if (btnList) btnList.classList.toggle('active', state.memberViewMode === 'list');

    const txt = (document.getElementById('search-member')?.value || '').toLowerCase();
    const dept = document.getElementById('filter-dept')?.value || 'ALL';

    grid.innerHTML = '';
    const filtered = state.members.filter(m =>
        m.name.toLowerCase().includes(txt) &&
        (dept === 'ALL' || m.dept === dept));

    // Update total count display
    const countDisplay = document.getElementById('members-active-count');
    if (countDisplay) countDisplay.innerText = filtered.length;

    if (filtered.length === 0) {
        empty.style.display = 'flex';
        grid.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = state.memberViewMode === 'grid' ? 'grid' : 'flex';
    grid.className = state.memberViewMode === 'grid' ? 'members-grid-v2' : 'members-list-v2-container';

    filtered.forEach((m, idx) => {
        const initials = getInitials(m.name);
        const deptClass = m.dept ? `tag-${m.dept.toLowerCase().replace(/&/g, '')}` : '';

        const item = document.createElement('div');
        if (state.memberViewMode === 'grid') {
            item.className = 'member-card-v2';
            item.style.animation = `fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards ${idx * 0.05}s`;
            item.innerHTML = `
                <div class="m-card-stt">${idx + 1}</div>
                <div class="m-card-avatar">${initials}</div>
                <h3 class="m-card-name">${m.name}</h3>
                <div class="m-card-dept"><span class="dept-tag ${deptClass}">${m.dept}</span></div>
                <div class="m-card-title-sub">${m.title || 'Thành viên'}</div>
                <div class="m-card-tags">
                    <span class="m-tag-chip">${m.class || 'Chưa rõ'}</span>
                </div>
                <div class="m-card-actions">
                    <button class="btn-icon" onclick="openMemberDetail('${m.id}')" title="Chi tiết"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-icon" onclick="editMember('${m.id}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="deleteMember('${m.id}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        } else {
            item.className = 'member-list-item';
            item.style.animation = `memberSlideIn 0.5s ease forwards ${idx * 0.03}s`;
            item.innerHTML = `
                <div class="m-list-stt">${idx + 1}</div>
                <div class="m-list-avatar">${initials}</div>
                <div class="m-list-info">
                    <div class="m-list-name">${m.name}</div>
                    <div class="m-list-dept">${m.dept} • ${m.title || 'Thành viên'} • ${m.class || 'Chưa rõ'} • ${m.major || m.faculty || ''}</div>
                </div>
                <div class="m-list-actions">
                    <button class="btn-icon" onclick="openMemberDetail('${m.id}')"><i class="fa-solid fa-eye"></i></button>
                    <button class="btn-icon" onclick="editMember('${m.id}')"><i class="fa-solid fa-pen"></i></button>
                    <button class="btn-icon delete" onclick="deleteMember('${m.id}')"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
        }
        grid.appendChild(item);
    });
}

function saveMember() {
    const id = document.getElementById('member-id').value;
    const lastName = document.getElementById('m-lastName').value.trim();
    const firstName = document.getElementById('m-firstName').value.trim();
    const m = {
        id: id || 'm_' + Date.now(),
        lastName: lastName,
        firstName: firstName,
        name: (lastName + ' ' + firstName).trim(),
        title: document.getElementById('m-title').value,
        gender: document.getElementById('m-gender').value,
        class: document.getElementById('m-class-cohort').value,
        major: document.getElementById('m-faculty').value,
        studentId: document.getElementById('m-studentId').value,
        dept: document.getElementById('m-dept').value,
        phone: document.getElementById('m-phone').value,
        dob: document.getElementById('m-dob').value,
        personalEmail: document.getElementById('m-personalEmail').value,
        clubEmail: document.getElementById('m-clubEmail').value,
        ethnicity: document.getElementById('m-ethnicity').value,
        religion: document.getElementById('m-religion').value,
        hometown: document.getElementById('m-hometown').value,
    };
    if (id) state.members = state.members.map(x => x.id === id ? m : x);
    else state.members.push(m);
    syncToBackend('save_member', m);
    closeModal('member-modal'); renderMembers(); populateSelectDropdowns(); renderEvidenceFolders();
}

function processBatchMembers() {
    const raw = document.getElementById('bm-data').value.trim();
    if (!raw) return alert('Vui lòng paste dữ liệu!');
    const lines = raw.split('\n');
    let added = [], dupes = [];

    // Columns: LastName, FirstName, Title, Gender, Class/Cohort, Faculty, StudentID, PersonalEmail, ClubEmail, Phone, DOB, Ethnicity, Religion, Hometown (14 cols)
    lines.forEach((line, idx) => {
        if (!line.trim()) return;
        const cols = line.split('\t');
        if (cols.length < 3) return; // Skip invalid lines

        const lastName = cols[0] ? cols[0].trim() : '';
        const firstName = cols[1] ? cols[1].trim() : '';
        const fullName = (lastName + ' ' + firstName).trim();
        
        if (!fullName || fullName.toLowerCase().includes('họ và tên')) return; // Skip header

        // Duplicate check
        const isDupe = state.members.some(m => m.name.toLowerCase().trim() === fullName.toLowerCase().trim());
        if (isDupe) { 
            dupes.push(fullName); 
            return; 
        }

        const m = { 
            id: 'm_' + Date.now() + '_' + idx, 
            lastName: lastName,
            firstName: firstName,
            name: fullName,
            title: cols[2] ? cols[2].trim() : '',
            gender: cols[3] ? cols[3].trim() : '',
            class: cols[4] ? cols[4].trim() : '',
            major: cols[5] ? cols[5].trim() : '',
            studentId: cols[6] ? cols[6].trim() : '',
            personalEmail: cols[7] ? cols[7].trim() : '',
            clubEmail: cols[8] ? cols[8].trim() : '',
            phone: cols[9] ? cols[9].trim() : '',
            dob: cols[10] ? cols[10].trim() : '',
            ethnicity: cols[11] ? cols[11].trim() : '',
            religion: cols[12] ? cols[12].trim() : '',
            hometown: cols[13] ? cols[13].trim() : '',
            dept: '' 
        };
        
        const upTitle = m.title.toUpperCase();
        if (upTitle.includes('L&D') || upTitle.includes('LD')) m.dept = 'L&D';
        else if (upTitle.includes('R&R') || upTitle.includes('RR')) m.dept = 'R&R';
        else if (upTitle.includes('ER')) m.dept = 'ER';
        else if (upTitle.includes('EB')) m.dept = 'EB';
        else if (upTitle.includes('BCN') || upTitle.includes('CHỦ NHIỆM')) m.dept = 'BCN';

        added.push(m);
    });

    if (added.length === 0 && dupes.length === 0) return alert('Không phân tích được dữ liệu hợp lệ.');

    if (added.length > 0) {
        showToast(`Đang gửi ${added.length} thành viên lên hệ thống...`, 'info');
        syncToBackend('save_batch', { sheetName: 'Members', records: added }, (res) => {
            if (res && res.status === 'success') {
                state.members.push(...added);
                document.getElementById('bm-data').value = '';
                closeModal('batch-member-modal');
                renderMembers(); populateSelectDropdowns(); renderEvidenceFolders();
                
                let msg = `✅ Đã lưu thành công ${added.length} thành viên lên Google Sheets.`;
                if (dupes.length > 0) msg += `\n⚠️ ${dupes.length} tên BỊ BỎ QUA vì đã tồn tại:\n${dupes.join(', ')}`;
                alert(msg);
            } else {
                showToast('Lỗi khi lưu danh sách thành viên hàng loạt!', 'error');
            }
        });
    } else if (dupes.length > 0) {
        alert(`⚠️ Toàn bộ ${dupes.length} tên BỊ BỎ QUA vì đã tồn tại:\n${dupes.join(', ')}`);
    }
}

function editMember(id) {
    const m = state.members.find(x => x.id === id);
    if (!m) return;
    document.getElementById('member-id').value = m.id;
    
    // Support existing or lowercased properties from backend (handled by normalizeDataKeys, but fallbacks for safety)
    document.getElementById('m-lastName').value = m.lastName || m.lastname || '';
    document.getElementById('m-firstName').value = m.firstName || m.firstname || '';
    
    // Auto-split if both are missing but full name exists
    if (!m.lastName && !m.firstName && m.name) {
        const parts = m.name.split(' ');
        document.getElementById('m-firstName').value = parts.pop() || '';
        document.getElementById('m-lastName').value = parts.join(' ') || '';
    }

    document.getElementById('m-title').value = m.title || '';
    document.getElementById('m-gender').value = m.gender || 'Nam';
    document.getElementById('m-class-cohort').value = m.class || '';
    document.getElementById('m-faculty').value = m.major || m.faculty || '';
    document.getElementById('m-studentId').value = m.studentId || m.mssv || '';
    document.getElementById('m-dept').value = m.dept || 'L&D';
    document.getElementById('m-phone').value = m.phone || '';
    document.getElementById('m-dob').value = m.dob || '';
    document.getElementById('m-personalEmail').value = m.personalEmail || m.emailpersonal || '';
    document.getElementById('m-clubEmail').value = m.clubEmail || m.emailclub || '';
    document.getElementById('m-ethnicity').value = m.ethnicity || '';
    document.getElementById('m-religion').value = m.religion || '';
    document.getElementById('m-hometown').value = m.hometown || '';
    openModal('member-modal');
}

function deleteMember(id) {
    if (confirm('Chắc chắn xoá?')) {
        state.members = state.members.filter(x => x.id !== id);
        renderMembers(); populateSelectDropdowns(); renderEvidenceFolders();
    }
}

function openMemberDetail(mId) {
    const m = state.members.find(x => x.id === mId);
    if (!m) return;
    document.getElementById('md-name').innerText = m.name;
    document.getElementById('md-title').innerText = m.title || 'Thành viên';
    document.getElementById('md-dept').innerText = m.dept || 'Chưa rõ';
    document.getElementById('md-class-cohort').innerText = m.class || 'Chưa rõ';
    document.getElementById('md-faculty').innerText = m.major || m.faculty || 'Chưa rõ';
    document.getElementById('md-student-id').innerText = m.studentId || m.mssv || 'Chưa rõ';
    
    document.getElementById('md-gender').innerText = m.gender || 'Chưa rõ';
    document.getElementById('md-dob').innerText = m.dob || 'Chưa rõ';
    document.getElementById('md-ethnicity').innerText = m.ethnicity || 'Chưa rõ';
    document.getElementById('md-religion').innerText = m.religion || 'Chưa rõ';
    document.getElementById('md-hometown').innerText = m.hometown || 'Chưa rõ';
    
    document.getElementById('md-personal-email').innerText = m.personalEmail || m.emailpersonal || 'Chưa rõ';
    document.getElementById('md-club-email').innerText = m.clubEmail || m.emailclub || 'Chưa rõ';
    const tbody = document.getElementById('md-projects-tbody');
    tbody.innerHTML = '';
    let joined = 0;
    state.projects.filter(p => p.term === state.currentTerm).forEach(p => {
        const participants = ensureArray(p.participants);
        const px = participants.find(x => x.memberId === mId);
        if (px) {
            joined++;
            const team = px.teamName ? ` (${px.teamName})` : '';
            tbody.innerHTML += `<tr><td><strong>${p.name}</strong></td><td>${p.type === 'internal' ? '2.3 Nội bộ' : '2.2 Sự kiện'}</td><td>${px.role}${team}</td></tr>`;
        }
    });
    if (joined === 0) tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">Chưa tham gia CT nào</td></tr>';
    openModal('member-detail-modal');
}

// ==========================================
// PROJECTS MODULE V2
// ==========================================
function setProjectFilter(btn, type, val) {
    if (type === 'type') state.projectTypeFilter = val;
    else state.projectStatusFilter = val;

    // Update UI
    const containerId = type === 'type' ? 'project-type-pills' : 'project-status-pills';
    document.querySelectorAll(`#${containerId} .pill`).forEach(p => p.classList.remove('active'));
    btn.classList.add('active');

    renderProjects();
}

function renderProjects() {
    const grid = document.getElementById('projects-grid');
    const empty = document.getElementById('projects-empty');
    const searchEl = document.getElementById('search-project');

    if (!grid || !empty) return;

    const txt = searchEl ? searchEl.value.toLowerCase() : '';
    grid.innerHTML = '';

    const allProjectsInDatabase = (state.projects && Array.isArray(state.projects)) ? state.projects.length : 0;

    // Filter projects for the CURRENT term display
    const curTerm = String(state.currentTerm || '').substring(0, 10);
    const termProjects = state.projects.filter(p => String(p.term || '').substring(0, 10) === curTerm);

    // Update dashboard header stats
    updateProjectDashboardStats(termProjects);

    const list = termProjects.filter(p => {
        const matchesSearch = (p.name || '').toLowerCase().includes(txt);
        const matchesType = state.projectTypeFilter === 'ALL' || p.type === state.projectTypeFilter;
        const matchesStatus = state.projectStatusFilter === 'ALL' || p.status === state.projectStatusFilter;
        return matchesSearch && matchesType && matchesStatus;
    });

    if (list.length === 0) {
        empty.style.display = 'flex';
        if (termProjects.length > 0) {
            empty.innerHTML = `<i class="fa-solid fa-folder-open" style="font-size:3rem;margin-bottom:16px;color:var(--text-muted);"></i><p>Không tìm thấy dự án phù hợp với bộ lọc</p>`;
        } else if (allProjectsInDatabase > 0) {
            empty.innerHTML = `
                <i class="fa-solid fa-filter-circle-xmark" style="font-size:3rem;margin-bottom:16px;color:var(--primary);"></i>
                <p>Không có dự án trong <strong>Nhiệm kỳ hiện tại</strong>.</p>
                <p style="font-size:0.85rem;color:var(--text-muted);margin-top:8px;">Vui lòng chuyển Nhiệm kỳ ở Sidebar hoặc tạo dự án mới.</p>`;
        } else {
            empty.innerHTML = `<i class="fa-solid fa-plus-circle" style="font-size:3rem;margin-bottom:16px;color:var(--text-muted);"></i><p>Chưa có dữ liệu dự án nào</p>`;
        }
        return;
    }

    empty.style.display = 'none';
    list.forEach((p, idx) => {
        const isInt = p.type === 'internal';
        const typeLabel = isInt ? 'Nội bộ' : 'Sự kiện';
        const typeBadge = isInt ? 'badge-internal' : 'badge-event';
        const statusMap = {
            setup: ['badge-setup', '<i class="fa-solid fa-gear"></i> Setup'],
            running: ['badge-running', '<i class="fa-solid fa-bolt"></i> Running'],
            finish: ['badge-finish', '<i class="fa-solid fa-check-double"></i> Finish']
        };
        const [sCls, sLbl] = statusMap[p.status || 'setup'] || statusMap['setup'];

        // Count personnel
        const teams = ensureArray(p.teams);
        let totalPersonnel = 0;
        teams.forEach(t => totalPersonnel += ensureArray(t.members).length);

        const plIds = ensureArray(p.plIds || (p.plId ? [p.plId] : []));
        let plDisplayText = 'Chưa phân công';
        
        if (plIds.length > 0) {
            const plNames = plIds.map(id => {
               const m = state.members.find(x => x.id === id);
               return m ? m.name : 'Unknown';
            });
            if (plNames.length <= 2) {
                plDisplayText = plNames.join(', ');
            } else {
                plDisplayText = `${plNames[0]}, ${plNames[1]} +${plNames.length - 2}`;
            }
        } else if (!p.hasPL) {
            plDisplayText = 'Không có PL';
        }

        const div = document.createElement('div');
        div.className = 'project-card-v2';
        div.style.animation = `fadeIn 0.5s ease forwards ${idx * 0.1}s`;
        div.style.opacity = '0';
        div.innerHTML = `
            <div class="p-card-header">
                <div class="p-badges">
                    <span class="p-badge ${typeBadge}">${typeLabel}</span>
                    <span class="p-badge ${sCls}">${sLbl}</span>
                </div>
                <div class="p-actions">
                    <button class="btn-icon" onclick="editProjectV2('${p.id}')" title="Chỉnh sửa"><i class="fa-solid fa-pen-to-square"></i></button>
                    ${state.userRole === 'admin' ? `<button class="btn-icon delete" onclick="deleteProject('${p.id}')" title="Xóa"><i class="fa-solid fa-trash-can"></i></button>` : ''}
                </div>
            </div>
            <div class="p-card-body">
                <h3 class="p-name">${p.name}</h3>
                <div class="p-pl-info">
                    <i class="fa-solid fa-user-tie"></i>
                    <span title="${plDisplayText}">PL: <strong>${plDisplayText}</strong></span>
                </div>
            </div>
            <div class="p-card-footer">
                <div class="p-stat">
                    <i class="fa-solid fa-users"></i>
                    <span><strong>${totalPersonnel}</strong> NS</span>
                </div>
                <div class="p-stat">
                    <i class="fa-solid fa-layer-group"></i>
                    <span><strong>${teams.length}</strong> Teams</span>
                </div>
            </div>
            <div class="p-card-highlight"></div>
        `;
        grid.appendChild(div);
    });
}

function updateProjectDashboardStats(termProjects) {
    const totalEl = document.getElementById('stat-total-p');
    const runningEl = document.getElementById('stat-running-p');
    const finishEl = document.getElementById('stat-finish-p');

    if (!totalEl || !runningEl || !finishEl) return;

    const total = termProjects.length;
    const running = termProjects.filter(p => p.status === 'running').length;
    const finish = termProjects.filter(p => p.status === 'finish').length;

    totalEl.innerText = total;
    runningEl.innerText = running;
    finishEl.innerText = finish;
}


// Project Modal V2 Logic
function openCreateProjectModal() {
    state.activeProjectData = {
        id: '', name: '', term: state.currentTerm, type: 'internal', status: 'setup',
        hasPL: true, plIds: [], teams: []
    };
    showProjectModal();
}

function editProjectV2(id) {
    const p = state.projects.find(x => x.id === id);
    if (!p) return;

    // Deep clone to avoid direct state mutation during edit
    state.activeProjectData = JSON.parse(JSON.stringify(p));

    // Support legacy plId conversion to plIds
    if (state.activeProjectData.plId && (!state.activeProjectData.plIds || state.activeProjectData.plIds.length === 0)) {
        state.activeProjectData.plIds = [state.activeProjectData.plId];
    }
    if (!state.activeProjectData.plIds) state.activeProjectData.plIds = [];

    // Ensure nested data is safe
    state.activeProjectData.teams = ensureArray(state.activeProjectData.teams);
    state.activeProjectData.teams.forEach(t => t.members = ensureArray(t.members));

    showProjectModal();
}

function showProjectModal() {
    const p = state.activeProjectData;
    document.getElementById('p-id').value = p.id;
    document.getElementById('p-name').value = p.name;
    document.getElementById('p-term').value = p.term || state.currentTerm;
    document.getElementById('p-type').value = p.type || 'internal';
    document.getElementById('p-status').value = p.status || 'setup';
    document.getElementById('p-has-pl').checked = p.hasPL;

    const isAdmin = state.userRole === 'admin';
    document.getElementById('project-modal-title').innerText = isAdmin ? (p.id ? 'Cập nhật Chương trình' : 'Khởi tạo Dự án mới') : 'Thông tin Chương trình';

    // Update Save button text to emphasize overwrite
    const saveBtnText = document.getElementById('btn-save-project-text');
    if (saveBtnText) {
        saveBtnText.innerText = p.id ? 'Cập nhật & Ghi đè' : 'Lưu Dự Án';
    }

    togglePLSection();
    renderTeamsV2();
    openModal('project-modal');

    // Handle read-only for non-admin
    const form = document.getElementById('project-form');
    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = !isAdmin);

    // Specialized disabling for buttons
    document.querySelectorAll('#project-modal .btn-lux-primary, #project-modal .btn-primary-xs, #project-modal .btn-primary, #project-modal .rename-team-btn').forEach(btn => {
        if (!btn.closest('.modal-header') && !btn.closest('#project-modal-footer')) {
            btn.style.display = isAdmin ? 'inline-flex' : 'none';
        }
    });

    const saveBtn = document.querySelector('#project-modal-footer .btn-primary');
    if (saveBtn) saveBtn.style.display = isAdmin ? 'block' : 'none';
}

function togglePLSection() {
    const hasPL = document.getElementById('p-has-pl').checked;
    state.activeProjectData.hasPL = hasPL;
    const section = document.getElementById('p-pl-selection');
    if (section) section.style.display = hasPL ? 'flex' : 'none';

    if (hasPL) {
        renderPLList();
    }
}

function renderPLList() {
    const listContainer = document.getElementById('p-pl-list');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const plIds = state.activeProjectData.plIds || [];
    
    if (plIds.length === 0) {
        listContainer.innerHTML = '<div class="pl-empty-hint">Chưa chọn PL</div>';
        return;
    }

    plIds.forEach(id => {
        const m = state.members.find(member => member.id === id);
        if (!m) return;

        const capsule = document.createElement('div');
        capsule.className = 'pl-display-capsule';
        capsule.innerHTML = `
            <div class="pl-avatar-mini">${getInitials(m.name)}</div>
            <div class="pl-info-mini">
                <div class="pl-name-mini">${m.name}</div>
                <div class="pl-role-mini">PROJECT LEADER</div>
            </div>
            ${state.userRole === 'admin' ? `<button type="button" class="btn-remove-pl" onclick="removePL('${id}')" title="Gỡ bỏ"><i class="fa-solid fa-times"></i></button>` : ''}
        `;
        listContainer.appendChild(capsule);
    });
}

function removePL(id) {
    if (state.userRole !== 'admin') return;
    state.activeProjectData.plIds = (state.activeProjectData.plIds || []).filter(plId => plId !== id);
    renderPLList();
}

// Team Management V2
function addNewTeam() {
    const name = prompt('Nhập tên Team mới (VD: Team Design, Team Tech...):');
    if (!name) return;
    const cleanName = name.trim();
    if (state.activeProjectData.teams.find(t => t.name.toLowerCase() === cleanName.toLowerCase())) return alert('Team này đã tồn tại!');

    state.activeProjectData.teams.push({
        id: 'team_' + Date.now(),
        name: cleanName,
        members: []
    });
    renderTeamsV2();
}

function renameTeamV2(teamId) {
    const team = state.activeProjectData.teams.find(t => t.id === teamId);
    if (!team) return;
    const newName = prompt('Nhập tên mới cho Team:', team.name);
    if (!newName || newName.trim() === team.name) return;
    team.name = newName.trim();
    renderTeamsV2();
}

function deleteTeamV2(teamId) {
    if (!confirm('Bạn có chắc muốn xóa Team này và toàn bộ phân công nhân sự bên trong?')) return;
    state.activeProjectData.teams = state.activeProjectData.teams.filter(t => t.id !== teamId);
    renderTeamsV2();
}

// Helper: Get initials from name
function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderTeamsV2() {
    const grid = document.getElementById('p-teams-grid-v2');
    if (!grid) return;
    grid.innerHTML = '';

    if (!state.activeProjectData.teams || state.activeProjectData.teams.length === 0) {
        grid.innerHTML = `
            <div class="lux-empty-team">
                <i class="fa-solid fa-cubes-stacked" style="font-size:3rem; margin-bottom:16px; opacity:0.3; display:block;"></i>
                <p>Chưa có team nào được tạo.</p>
                <p style="font-size:0.85rem; font-weight:400; margin-top:8px;">Nhấn "Thêm Team mới" để thiết lập cấu trúc nhân sự.</p>
            </div>
        `;
        return;
    }

    state.activeProjectData.teams.forEach((team, tIdx) => {
        const card = document.createElement('div');
        card.className = 'team-card-premium';
        card.style.animation = `fadeInUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards ${tIdx * 0.1}s`;

        card.innerHTML = `
            <div class="team-header-premium">
                <div class="team-title-premium">
                    <div class="team-icon-orb"><i class="fa-solid fa-folder-tree"></i></div>
                    <span class="lux-team-name">${team.name}</span>
                    <button type="button" class="btn-icon-xs" onclick="renameTeamV2('${team.id}')" title="Đổi tên"><i class="fa-solid fa-pen-square"></i></button>
                </div>
                <div class="lux-team-actions">
                    <button type="button" class="btn-premium-xs btn-add-ns" onclick="openMemberPicker('Team', '${team.id}')" title="Thêm nhân sự">
                        <i class="fa-solid fa-user-plus"></i> NS
                    </button>
                    <button type="button" class="btn-premium-xs btn-delete-team" onclick="deleteTeamV2('${team.id}')" title="Xóa team">
                        <i class="fa-solid fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="team-members-list">
                ${team.members.length === 0 ? `
                    <div class="team-empty-placeholder">
                        <i class="fa-solid fa-ghost" style="margin-bottom:8px; display:block; opacity:0.5;"></i>
                        Chưa phân công nhân sự
                    </div>
                ` : ''}
                ${team.members.map((tm, mIdx) => {
            const m = state.members.find(x => x.id === tm.memberId);
            const name = m ? m.name : 'Unknown';
            const initials = getInitials(name);
            const roles = ['Core Team', 'Leader'];
            return `
                        <div class="member-row-premium" style="animation: memberSlideIn 0.5s ease forwards ${tIdx * 0.1 + mIdx * 0.05}s; opacity:0;">
                            <div class="member-stt">${mIdx + 1}</div>
                            <div class="member-avatar-mini">${initials}</div>
                            <div class="member-info-mini">
                                <div class="member-name-mini">${name}</div>
                                <select class="lux-role-select" onchange="updateMemberRole('${team.id}', '${tm.memberId}', this.value)" ${state.userRole !== 'admin' ? 'disabled' : ''}>
                                    ${roles.map(r => `<option value="${r}" ${tm.role === r ? 'selected' : ''}>${r}</option>`).join('')}
                                </select>
                            </div>
                            <button type="button" class="btn-icon delete" style="width:28px; height:28px; background:rgba(0,0,0,0.03);" onclick="removeMemberFromTeam('${team.id}', '${tm.memberId}')" ${state.userRole !== 'admin' ? 'style="display:none"' : ''} title="Gỡ khỏi team">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
        grid.appendChild(card);
    });
}

function togglePLSection() {
    const hasPL = document.getElementById('p-has-pl').checked;
    state.activeProjectData.hasPL = hasPL;
    const section = document.getElementById('p-pl-selection');
    if (section) section.style.display = hasPL ? 'block' : 'none';

    if (hasPL) {
        renderPLList();
    }
}

function updateMemberRole(teamId, memberId, newRole) {
    const team = state.activeProjectData.teams.find(t => t.id === teamId);
    if (!team) return;
    const tm = team.members.find(m => m.memberId === memberId);
    if (tm) tm.role = newRole;
}

function removeMemberFromTeam(teamId, memberId) {
    const team = state.activeProjectData.teams.find(t => t.id === teamId);
    if (!team) return;
    team.members = team.members.filter(m => m.memberId !== memberId);
    renderTeamsV2();
}

// Member Picker V2 Logic
function openMemberPicker(type, teamId = null) {
    state.mpTarget = { type, teamId };
    state.mpFilter = 'ALL';
    state.selectedPickerIds = []; // Clear previous selection
    document.getElementById('mp-search').value = '';

    // Set active pill
    document.querySelectorAll('#member-picker-modal .pill').forEach(p => p.classList.toggle('active', p.innerText === 'All'));

    // Show/Hide footer based on type
    const footer = document.getElementById('mp-footer');
    if (footer) {
        footer.style.display = type === 'Team' ? 'flex' : 'none';
        updatePickerCount();
    }

    renderMemberPicker();
    openModal('member-picker-modal');
}

function updatePickerCount() {
    const countEl = document.getElementById('mp-count');
    if (countEl) countEl.innerText = state.selectedPickerIds.length;
}

function setMpFilter(btn, dept) {
    state.mpFilter = dept;
    document.querySelectorAll('#member-picker-modal .pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    renderMemberPicker();
}

function renderMemberPicker() {
    const grid = document.getElementById('mp-list');
    const search = document.getElementById('mp-search').value.toLowerCase();
    const dept = state.mpFilter;

    if (!grid) return;

    // Update switcher active states
    const btnGrid = document.getElementById('btn-picker-grid');
    const btnList = document.getElementById('btn-picker-list');
    if (btnGrid) btnGrid.classList.toggle('active', state.pickerViewMode === 'grid');
    if (btnList) btnList.classList.toggle('active', state.pickerViewMode === 'list');

    const filtered = state.members.filter(m => {
        const mDept = getMemberDept(m);
        const matchesSearch = m.name.toLowerCase().includes(search) || mDept.toLowerCase().includes(search);
        const matchesDept = dept === 'ALL' || mDept === dept;
        return matchesSearch && matchesDept;
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    grid.innerHTML = '';
    grid.className = state.pickerViewMode === 'grid' ? 'picker-grid card-scroll' : 'picker-list-v2 card-scroll';

    filtered.forEach((m, idx) => {
        const item = document.createElement('div');
        const initials = getInitials(m.name);
        const mDept = getMemberDept(m);
        const isSelected = state.selectedPickerIds.includes(m.id) || (state.mpTarget.type === 'PL' && (state.activeProjectData.plIds || []).includes(m.id));

        if (state.pickerViewMode === 'grid') {
            item.className = `picker-member-card ${isSelected ? 'selected' : ''}`;
            item.style.animation = `fadeIn 0.3s ease forwards ${idx * 0.03}s`;
            item.innerHTML = `
                <div class="lux-avatar">${initials}</div>
                <div class="picker-m-name">${m.name}</div>
                <div class="picker-m-dept">${mDept}</div>
                <div class="selection-check"><i class="fa-solid fa-check-circle"></i></div>
            `;
        } else {
            item.className = `picker-list-item ${isSelected ? 'selected' : ''}`;
            item.innerHTML = `
                <div class="p-list-avatar">${initials}</div>
                <div class="p-list-info">
                    <div class="p-list-name">${m.name}</div>
                    <div class="p-list-dept">${mDept}</div>
                </div>
                <div class="selection-check"><i class="fa-solid fa-check-circle"></i></div>
            `;
        }

        item.onclick = () => confirmMemberSelection(m.id);
        grid.appendChild(item);
    });
}

function confirmMemberSelection(memberId) {
    const { type, teamId } = state.mpTarget;
    const m = state.members.find(x => x.id === memberId);
    if (!m) return;

    if (type === 'PL') {
        if (!state.activeProjectData.plIds) state.activeProjectData.plIds = [];
        
        // Multi-select toggle for PLs
        const idx = state.activeProjectData.plIds.indexOf(memberId);
        if (idx > -1) {
            state.activeProjectData.plIds.splice(idx, 1);
        } else {
            state.activeProjectData.plIds.push(memberId);
        }
        
        renderPLList();
        renderMemberPicker(); // Keep picker open for multi-select, user can close manually or it closes automatically if single-select logic was there
        // closeModal('member-picker-modal'); // Don't close immediately to allow picking multiple
    } else {
        // Multi-select for Teams
        const index = state.selectedPickerIds.indexOf(memberId);
        if (index > -1) {
            state.selectedPickerIds.splice(index, 1);
        } else {
            state.selectedPickerIds.push(memberId);
        }
        updatePickerCount();
        renderMemberPicker();
    }
}

function openBatchRolePicker() {
    if (state.selectedPickerIds.length === 0) return showToast('Vui lòng chọn ít nhất 1 nhân sự!', 'warning');
    renderBatchRolePicker();
    openModal('batch-role-modal');
}

function renderBatchRolePicker() {
    const container = document.getElementById('batch-role-list');
    if (!container) return;

    container.innerHTML = '';
    const roles = ['Core Team', 'Leader'];

    state.selectedPickerIds.forEach((id, idx) => {
        const m = state.members.find(x => x.id === id);
        if (!m) return;

        const row = document.createElement('div');
        row.className = 'batch-role-row';
        row.style.animation = `memberSlideIn 0.4s ease forwards ${idx * 0.05}s`;
        row.innerHTML = `
            <div class="br-avatar">${getInitials(m.name)}</div>
            <div class="br-info">
                <div class="br-name">${m.name}</div>
                <div class="br-dept">${getMemberDept(m)}</div>
            </div>
            <div class="br-assign">
                <select class="styled-select batch-role-select" data-id="${id}">
                    ${roles.map(r => `<option value="${r}" ${r === 'Core Team' ? 'selected' : ''}>${r}</option>`).join('')}
                </select>
            </div>
            <button class="btn-icon delete" onclick="removeFromBatchSelection('${id}')"><i class="fa-solid fa-times"></i></button>
        `;
        container.appendChild(row);
    });
}

function removeFromBatchSelection(id) {
    state.selectedPickerIds = state.selectedPickerIds.filter(x => x !== id);
    if (state.selectedPickerIds.length === 0) {
        closeModal('batch-role-modal');
    } else {
        renderBatchRolePicker();
    }
    updatePickerCount();
    renderMemberPicker();
}

function saveBatchRoles() {
    const { teamId } = state.mpTarget;
    const team = state.activeProjectData.teams.find(t => t.id === teamId);
    if (!team) return;

    team.members = ensureArray(team.members);
    const selects = document.querySelectorAll('.batch-role-select');

    selects.forEach(sel => {
        const memberId = sel.dataset.id;
        const role = sel.value;
        if (!team.members.find(tm => tm.memberId === memberId)) {
            team.members.push({ memberId, role });
        }
    });

    renderTeamsV2();
    closeModal('batch-role-modal');
    closeModal('member-picker-modal');
    showToast(`Đã thêm ${selects.length} nhân sự vào team!`, 'success');
}

function saveSelectedRole() {
    const { memberId, teamId } = state.tempPickerData;
    const role = document.getElementById('rp-role').value;

    if (!memberId || !teamId) return;

    const team = state.activeProjectData.teams.find(t => t.id === teamId);
    if (team) {
        team.members = ensureArray(team.members);
        if (!team.members.find(m => m.memberId === memberId)) {
            team.members.push({ memberId, role });
        } else {
            // Update role if already exists (optional, depends on preference)
            const tm = team.members.find(m => m.memberId === memberId);
            tm.role = role;
        }
    }

    renderTeamsV2();
    closeModal('role-picker-modal');
    closeModal('member-picker-modal');
    showToast('Đã thêm nhân sự vào team!', 'success');
}


async function saveProjectV2() {
    const p = state.activeProjectData;
    p.name = document.getElementById('p-name').value;
    p.term = document.getElementById('p-term').value;
    p.type = document.getElementById('p-type').value;
    p.status = document.getElementById('p-status').value;

    if (!p.name) return showToast('Vui lòng nhập tên chương trình!', 'error');

    // Ensure we send plIds (multi-PL support)
    // We can also keep plId (first one) for very old logic compatibility if needed
    if (p.plIds && p.plIds.length > 0) {
        p.plId = p.plIds[0];
    } else {
        p.plId = '';
    }

    // Legacy support: We still keep p.participants as a flat list for scoring logic
    const allParticipants = [];
    p.teams.forEach(t => {
        t.members.forEach(tm => {
            allParticipants.push({
                memberId: tm.memberId,
                role: tm.role,
                teamName: t.name
            });
        });
    });
    // Add PLs to participants if not already there (optional, but good for tracking)
    (p.plIds || []).forEach(id => {
        if (!allParticipants.some(x => x.memberId === id)) {
            allParticipants.push({ memberId: id, role: 'PL', teamName: 'Leadership' });
        }
    });

    p.participants = allParticipants;

    const isUpdate = !!p.id;
    showToast(isUpdate ? 'Đang cập nhật chương trình...' : 'Đang lưu chương trình...');
    try {
        if (!p.id) p.id = 'p_' + Date.now();
        await syncToBackend('save_project', p);

        // Update local state
        const idx = state.projects.findIndex(x => x.id === p.id);
        if (idx > -1) state.projects[idx] = p;
        else state.projects.push(p);

        showToast(isUpdate ? 'Đã cập nhật & ghi đè thành công!' : 'Đã lưu thành công!', 'success');
        closeModal('project-modal');
        renderProjects();
        updateDashboardStats();
    } catch (err) {
        showToast('Lỗi khi lưu dữ liệu!', 'error');
        console.error(err);
    }
}

function deleteProject(id) {
    if (confirm('Bạn có chắc chắn muốn xóa chương trình này?')) {
        state.projects = state.projects.filter(x => x.id !== id);
        syncToBackend('delete_project', { id: id });
        renderProjects(); updateDashboardStats(); populateSelectDropdowns();
    }
}


// ==========================================
// TERMS MODULE
// ==========================================
function renderTerms() {
    const list = document.getElementById('terms-list');
    if (!list) return;
    list.innerHTML = '';
    state.terms.forEach(t => {
        const isActive = t.id === state.currentTerm;
        const bcn = ensureObject(t.bcn);
        list.innerHTML += `
            <div class="term-item">
                <div class="term-info">
                    <h4>${t.name}</h4>
                    <p>Chủ nhiệm: <strong>${bcn.pres || '...'}</strong> | Phó CN: <strong>${bcn.vp || '...'}</strong></p>
                </div>
                <div>
                    ${isActive ? '<span class="badge-active">Đang hoạt động</span>' : `<button class="btn-secondary btn-sm" onclick="setActiveTerm('${t.id}')">Chọn làm hiện tại</button>`}
                    <button class="btn-icon" onclick="editTerm('${t.id}')"><i class="fa-solid fa-pen"></i></button>
                </div>
            </div>`;
    });
    let opts = '';
    state.terms.forEach(t => opts += `<option value="${t.id}">${t.name}</option>`);
    document.getElementById('p-term').innerHTML = opts;
}

function setActiveTerm(id) {
    state.currentTerm = id;
    const t = state.terms.find(x => x.id === id);
    document.getElementById('active-term-label').innerText = t.name;
    renderTerms(); renderProjects(); updateDashboardStats(); populateSelectDropdowns();
}

function editTerm(id) {
    const t = state.terms.find(x => x.id === id);
    if (!t) return;
    const bcn = ensureObject(t.bcn);
    document.getElementById('t-id').value = t.id;
    document.getElementById('t-name').value = t.name;
    document.getElementById('t-bcn-president').value = bcn.pres || '';
    document.getElementById('t-bcn-vp').value = bcn.vp || '';
    document.getElementById('t-head-ld').value = bcn.ld || '';
    document.getElementById('t-head-rr').value = bcn.rr || '';
    document.getElementById('t-head-er').value = bcn.er || '';
    document.getElementById('t-head-eb').value = bcn.eb || '';
    openModal('term-modal');
}

function saveTerm() {
    const id = document.getElementById('t-id').value;
    const t = {
        id: id || 't_' + Date.now(),
        name: document.getElementById('t-name').value,
        bcn: {
            pres: document.getElementById('t-bcn-president').value,
            vp: document.getElementById('t-bcn-vp').value,
            ld: document.getElementById('t-head-ld').value,
            rr: document.getElementById('t-head-rr').value,
            er: document.getElementById('t-head-er').value,
            eb: document.getElementById('t-head-eb').value
        }
    };
    if (id) state.terms = state.terms.map(x => x.id === id ? t : x);
    else state.terms.push(t);
    syncToBackend('save_term', t);
    closeModal('term-modal'); renderTerms();
}

// BATCH PROJECT LOGIC
function processBatchProjects() {
    const data = document.getElementById('bp-data').value.trim();
    if (!data) {
        showToast('Vui lòng nhập danh sách dự án!', 'error');
        return;
    }

    // Split by newline or tab
    const names = data.split(/[\n\t]+/).map(n => n.trim()).filter(n => n !== '');
    if (names.length === 0) {
        showToast('Không tìm thấy tên dự án hợp lệ!', 'error');
        return;
    }

    showToast(`Đang tạo ${names.length} dự án...`, 'info');
    
    const newProjects = names.map((name, index) => ({
        id: 'p_' + Date.now() + '_' + index,
        name: name,
        term: state.currentTerm,
        type: 'internal',
        status: 'setup',
        hasPL: false,
        plIds: [],
        teams: []
    }));

    syncToBackend('save_batch', { sheetName: 'Projects', records: newProjects }, (res) => {
        if (res && res.status === 'success') {
            state.projects.push(...newProjects);
            showToast(`Đã tạo thành công ${newProjects.length} dự án!`, 'success');
            closeModal('batch-project-modal');
            document.getElementById('bp-data').value = '';
            fetchData();
        } else {
            showToast('Lỗi khi tạo dự án hàng loạt!', 'error');
        }
    });
}

// BATCH TEAM MEMBER LOGIC
function processBatchTeamMembers() {
    const data = document.getElementById('btm-data').value.trim();
    if (!data) {
        showToast('Vui lòng nhập danh sách nhân sự!', 'error');
        return;
    }

    const lines = data.split('\n').map(l => l.trim()).filter(l => l !== '');
    const errors = [];
    let addedCount = 0;

    lines.forEach(line => {
        const query = line.trim().toLowerCase();
        
        // Find match by name or studentId
        const match = state.members.find(m => 
            m.name.toLowerCase() === query || 
            (m.studentId && m.studentId.toString().toLowerCase() === query) ||
            (m.mssv && m.mssv.toString().toLowerCase() === query)
        );

        if (match) {
            if (!state.selectedPickerIds.includes(match.id)) {
                state.selectedPickerIds.push(match.id);
                addedCount++;
            }
        } else {
            errors.push(line);
        }
    });

    if (errors.length > 0) {
        const errorLog = document.getElementById('btm-error-log');
        const errorList = document.getElementById('btm-error-list');
        errorList.innerHTML = errors.map(e => `<li>${e}</li>`).join('');
        errorLog.style.display = 'block';
        showToast(`Tìm thấy ${addedCount} người, nhưng có ${errors.length} lỗi.`, 'warning');
    } else {
        showToast(`Đã khớp và chọn thành công ${addedCount} nhân sự!`, 'success');
        closeModal('batch-team-member-modal');
        document.getElementById('btm-data').value = '';
        if (document.getElementById('btm-error-log')) {
            document.getElementById('btm-error-log').style.display = 'none';
        }
    }

    renderMemberPicker();
}

// ==========================================
// DASHBOARD & ANNOUNCEMENTS
// ==========================================
let dashboardCharts = {};
let currentAnnDeptFilter = 'ALL';

function updateDashboardStats() {
    document.getElementById('stat-total-members').innerText = state.members.length;
    document.getElementById('stat-total-projects').innerText = state.projects.filter(p => p.term === state.currentTerm).length;
    document.getElementById('stat-evaluated').innerText = state.evaluations.filter(e => e.term === state.currentTerm).length;
    renderAnnouncements();
    initDashboardCharts();
}

function initDashboardCharts() {
    // Helper to get variable colors
    const getStyle = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const primary = getStyle('--primary') || '#0ea5e9';
    const accentGreen = getStyle('--accent-green') || '#10b981';
    const accentYellow = getStyle('--accent-yellow') || '#f59e0b';
    const accentRed = getStyle('--accent-red') || '#f43f5e';
    const accentPurple = getStyle('--accent-purple') || '#8b5cf6';
    const textColor = getStyle('--text-main') || '#0f172a';

    const ctxOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { color: textColor, font: { family: 'Times New Roman', size: 11 } } }
        }
    };

    const termEvals = state.evaluations.filter(e => e.term === state.currentTerm);
    const depts = ['L&D', 'R&R', 'ER', 'EB', 'BCN'];
    const deptColors = [primary, accentGreen, accentYellow, accentRed, accentPurple];

    // Helper: Map evaluations to departments
    const evalDataByDept = {};
    depts.forEach(d => evalDataByDept[d] = { scores: [0, 0, 0, 0, 0], count: 0, totalAvg: 0 });

    termEvals.forEach(ev => {
        const m = state.members.find(member => member.id === ev.targetId);
        if (m && evalDataByDept[m.dept]) {
            evalDataByDept[m.dept].count++;
            evalDataByDept[m.dept].totalAvg += (ev.avgScore || 0);
            const critScores = safeJsonParse(ev.scores, {});
            Object.values(critScores).forEach((val, idx) => {
                if (idx < 5) evalDataByDept[m.dept].scores[idx] += val;
            });
        }
    });

    // --- 1. Inter-Dept Radar ---
    const radarDatasets = depts.map((d, i) => {
        const dData = evalDataByDept[d];
        const averages = dData.scores.map(s => dData.count > 0 ? (s / dData.count).toFixed(1) : 0);
        return {
            label: `Ban ${d}`,
            data: averages,
            backgroundColor: deptColors[i] + '22',
            borderColor: deptColors[i],
            pointBackgroundColor: deptColors[i],
            borderWidth: 2
        };
    }).filter(ds => ds.data.some(v => v > 0));

    if (dashboardCharts.deptRadar) dashboardCharts.deptRadar.destroy();
    dashboardCharts.deptRadar = new Chart(document.getElementById('chart-dept-radar'), {
        type: 'radar',
        data: {
            labels: ['Chuyên môn', 'Trách nhiệm', 'Giao tiếp', 'Sáng tạo', 'Thái độ'],
            datasets: radarDatasets
        },
        options: {
            ...ctxOptions,
            scales: {
                r: {
                    angleLines: { color: 'rgba(0,0,0,0.1)' },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    pointLabels: { color: textColor, font: { family: 'Times New Roman', size: 10, weight: 'bold' } },
                    suggestedMin: 0, suggestedMax: 10
                }
            }
        }
    });

    // --- 2. Dept Score Rank ---
    const rankLabels = depts;
    const rankData = depts.map(d => {
        const dData = evalDataByDept[d];
        return dData.count > 0 ? (dData.totalAvg / dData.count).toFixed(2) : 0;
    });

    if (dashboardCharts.deptScoreRank) dashboardCharts.deptScoreRank.destroy();
    dashboardCharts.deptScoreRank = new Chart(document.getElementById('chart-dept-score-rank'), {
        type: 'bar',
        data: {
            labels: rankLabels,
            datasets: [{
                label: 'Điểm trung bình',
                data: rankData,
                backgroundColor: deptColors,
                borderRadius: 8
            }]
        },
        options: {
            ...ctxOptions,
            scales: {
                y: { beginAtZero: true, max: 10, ticks: { color: textColor, font: { family: 'Times New Roman' } } },
                x: { ticks: { color: textColor, font: { family: 'Times New Roman' } } }
            }
        }
    });

    // --- 3. Score Distribution ---
    const scoreBuckets = [0, 0, 0, 0, 0]; // <5, 5-7, 7-8, 8-9, 9-10
    state.members.forEach(m => {
        // Find most recent avgScore for this member in current term
        const mEvals = termEvals.filter(e => e.targetId === m.id);
        if (mEvals.length > 0) {
            const avg = mEvals[0].avgScore || 0;
            if (avg < 5) scoreBuckets[0]++;
            else if (avg < 7) scoreBuckets[1]++;
            else if (avg < 8) scoreBuckets[2]++;
            else if (avg < 9) scoreBuckets[3]++;
            else scoreBuckets[4]++;
        }
    });

    if (dashboardCharts.scoreDist) dashboardCharts.scoreDist.destroy();
    dashboardCharts.scoreDist = new Chart(document.getElementById('chart-score-dist'), {
        type: 'bar',
        data: {
            labels: ['<5', '5-7', '7-8', '8-9', '9-10'],
            datasets: [{
                label: 'Số lượng thành viên',
                data: scoreBuckets,
                backgroundColor: accentGreen,
                borderRadius: 8,
                barThickness: 30
            }]
        },
        options: {
            ...ctxOptions,
            scales: {
                y: { beginAtZero: true, stepSize: 1, ticks: { color: textColor, font: { family: 'Times New Roman' } } },
                x: { ticks: { color: textColor, font: { family: 'Times New Roman' } } }
            }
        }
    });

    // --- 4. Member Mix (Same as before but refreshed) ---
    const memberCounts = depts.map(d => state.members.filter(m => m.dept === d).length);
    if (dashboardCharts.memberDept) dashboardCharts.memberDept.destroy();
    dashboardCharts.memberDept = new Chart(document.getElementById('chart-member-dept'), {
        type: 'doughnut',
        data: {
            labels: depts,
            datasets: [{
                data: memberCounts,
                backgroundColor: deptColors,
                borderWidth: 0
            }]
        },
        options: { ...ctxOptions, cutout: '75%' }
    });

    // --- 5. Project Health ---
    const prjStatus = { 'Chưa chạy': 0, 'Đang chạy': 0, 'Hoàn thành': 0 };
    state.projects.filter(p => p.term === state.currentTerm).forEach(p => prjStatus[p.status || 'Chưa chạy']++);

    if (dashboardCharts.projectStatus) dashboardCharts.projectStatus.destroy();
    dashboardCharts.projectStatus = new Chart(document.getElementById('chart-project-status'), {
        type: 'bar',
        data: {
            labels: Object.keys(prjStatus),
            datasets: [{
                label: 'Số lượng',
                data: Object.values(prjStatus),
                backgroundColor: [accentYellow, primary, accentGreen],
                borderRadius: 8
            }]
        },
        options: {
            ...ctxOptions,
            scales: {
                y: { beginAtZero: true, stepSize: 1, ticks: { color: textColor, font: { family: 'Times New Roman' } } },
                x: { ticks: { color: textColor, font: { family: 'Times New Roman' } } }
            }
        }
    });
}

function renderAnnouncements() {
    const gList = document.getElementById('global-announcements-list');
    const dList = document.getElementById('dept-announcements-list');
    if (!gList || !dList) return;

    const globalAnns = (state.announcements || []).filter(a => a.type === 'GLOBAL').reverse();
    const deptAnns = (state.announcements || []).filter(a => a.type === 'DEPT' && (currentAnnDeptFilter === 'ALL' || a.dept === currentAnnDeptFilter)).reverse();

    gList.innerHTML = globalAnns.length ? globalAnns.map(a => renderAnnCard(a)).join('') : '<div class="empty-mini">Chưa có thông báo toàn CLB.</div>';
    dList.innerHTML = deptAnns.length ? deptAnns.map(a => renderAnnCard(a)).join('') : '<div class="empty-mini">Chưa có thông báo ban này.</div>';
}

function renderAnnCard(ann) {
    const date = new Date(ann._timestamp || Date.now()).toLocaleDateString('vi-VN');
    const isDept = ann.type === 'DEPT';
    const imgHtml = ann.image ? `<img src="${ann.image}" class="ann-card-image" alt="Announcement Image">` : '';
    return `
        <div class="announcement-card prio-${ann.priority}">
            ${imgHtml}
            <h4 style="color:var(--primary);">${ann.title}</h4>
            <p>${ann.content}</p>
            <div class="ann-card-footer">
                <span class="ann-dept-tag"><i class="fa-solid fa-building-user"></i> ${ann.dept || 'Toàn CLB'}</span>
                <span class="ann-date-tag"><i class="fa-solid fa-clock"></i> ${date}</span>
                <div class="action-btns" style="margin-left:auto; display:flex; gap:8px;">
                     <button class="btn-icon" onclick="editAnnouncement('${ann.id}')" title="Sửa"><i class="fa-solid fa-pen"></i></button>
                     <button class="btn-icon delete" onclick="deleteAnnouncement('${ann.id}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
        </div>
    `;
}

function filterDeptAnn(dept) {
    currentAnnDeptFilter = dept;
    document.querySelectorAll('.dept-pills .pill').forEach(p => {
        p.classList.toggle('active', p.innerText.includes(dept) || (dept === 'ALL' && p.innerText === 'Tất cả'));
    });
    renderAnnouncements();
}

async function saveAnnouncement() {
    const hiddenId = document.getElementById('ann-id') ? document.getElementById('ann-id').value : '';
    const title = document.getElementById('ann-title').value;
    const content = document.getElementById('ann-content').value;
    const imgPreview = document.querySelector('#ann-preview img');
    const imageBase64 = imgPreview ? imgPreview.src : null;

    if (!title || !content) return alert('Vui lòng nhập đủ tiêu đề và nội dung');

    const ann = {
        id: hiddenId || 'ann_' + Date.now(),
        type: document.getElementById('ann-type').value,
        title: title,
        content: content,
        image: imageBase64,
        dept: document.getElementById('ann-dept-select').value,
        priority: document.getElementById('ann-priority').value,
        term: state.currentTerm
    };

    if (!state.announcements) state.announcements = [];

    if (hiddenId) {
        state.announcements = state.announcements.map(x => x.id === hiddenId ? { ...ann, _timestamp: x._timestamp } : x);
        syncToBackend('save_announcement', ann);
    } else {
        const newAnn = { ...ann, _timestamp: new Date().toISOString() };
        state.announcements.push(newAnn);
        syncToBackend('save_announcement', newAnn);
    }

    closeModal('announcement-modal');
    renderAnnouncements();

    document.getElementById('ann-preview').style.display = 'flex';
    document.getElementById('ann-preview').innerHTML = `
        <div class="drop-circle" style="width:40px;height:40px;font-size:1rem;">
            <i class="fa-solid fa-cloud-arrow-up"></i>
        </div>
        <div class="drop-text" style="flex-direction:row;align-items:center;gap:12px;">
            <strong>Nhấn để tải ảnh</strong>
        </div>`;
    document.getElementById('ann-image-input').value = '';
}

function editAnnouncement(id) {
    const ann = (state.announcements || []).find(x => x.id === id);
    if (!ann) return;
    document.getElementById('ann-id').value = ann.id;
    document.getElementById('ann-type').value = ann.type;
    document.getElementById('ann-title').value = ann.title;
    document.getElementById('ann-content').value = ann.content;
    document.getElementById('ann-dept-select').value = ann.dept || 'L&D';
    document.getElementById('ann-priority').value = ann.priority || 'NORMAL';

    const preview = document.getElementById('ann-preview');
    if (ann.image) {
        preview.style.display = 'flex';
        preview.innerHTML = `
            <div class="preview-img-wrapper" style="width:100%; height:100%; display:flex; justify-content:center; align-items:center;">
                <img src="${ann.image}" style="max-height:80px; max-width:100%; border-radius:8px; object-fit:contain;">
                <button class="remove-img-btn" onclick="removeImagePreview('ann-preview', 'ann-image-input')">&times;</button>
            </div>`;
    } else {
        preview.style.display = 'flex';
        preview.innerHTML = `
            <div class="drop-circle" style="width:40px;height:40px;font-size:1rem;">
                <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div class="drop-text" style="flex-direction:row;align-items:center;gap:12px;">
                <strong>Nhấn để tải ảnh</strong>
            </div>`;
    }

    document.getElementById('ann-modal-title').innerText = ann.type === 'GLOBAL' ? 'Sửa Tin Toàn CLB' : 'Sửa Tin Ban';
    document.getElementById('ann-dept-group').style.display = ann.type === 'DEPT' ? 'block' : 'none';

    document.getElementById('announcement-modal').classList.add('active');
}

function deleteAnnouncement(id) {
    if (confirm('Chắc chắn xoá thông báo này?')) {
        state.announcements = state.announcements.filter(x => x.id !== id);
        syncToBackend('delete_announcement', { id: id });
        renderAnnouncements();
    }
}


// ==========================================
// SCORE FILTER
// ==========================================
function setScoreDeptFilter(btn, dept) {
    state.scoreDeptFilter = dept;
    document.querySelectorAll('[data-score-dept]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    calculateFinalScores();
}

// ==========================================
// EVALUATION ENGINE
// ==========================================
function avgArr(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((a, c) => a + c.score, 0) / arr.length;
}

function calculateMemberProjectScore(mId) {
    const termProjects = state.projects.filter(p => p.term === state.currentTerm);
    let totalScore = 0;
    let projectCount = 0;

    const checkPL = (r) => r === 'PL' || r === 'Project Leader';
    const checkLeader = (r) => r && r.toLowerCase().includes('leader') && !checkPL(r);

    termProjects.forEach(prj => {
        const participants = ensureArray(prj.participants);
        const pt = participants.find(p => String(p.memberId) === String(mId));
        if (!pt || pt.role === 'SP') return;

        const role = pt.role || 'Thành viên';
        const team = pt.teamName;
        const hasPL = participants.some(p => checkPL(p.role));

        const evals = (state.evaluations || []).filter(e => 
            String(e.prjId || e.prjid) === String(prj.id) && 
            String(e.targetId || e.targetid) === String(mId)
        );

        if (evals.length === 0) return;

        // Categorize evaluations
        let selfScore = null;
        let peerScores = [];
        let leaderOfTeamScores = [];
        let otherLeaderScores = [];
        let plScores = [];

        evals.forEach(e => {
            const raterId = e.raterId || e.raterid;
            if (String(raterId) === String(mId)) {
                selfScore = e.score;
                return;
            }

            const raterPt = participants.find(p => String(p.memberId) === String(raterId));
            if (!raterPt) return;

            const rRole = raterPt.role;
            const rTeam = raterPt.teamName;

            if (checkPL(rRole)) {
                plScores.push(e.score);
            } else if (checkLeader(rRole)) {
                if (rTeam === team) {
                    leaderOfTeamScores.push(e.score);
                } else {
                    otherLeaderScores.push(e.score);
                }
            } else {
                // Everything else is treated as teammate/core-team peer
                if (rTeam === team) {
                    peerScores.push(e.score);
                }
            }
        });

        // Apply Categorical Average formulas
        let categories = [];
        if (selfScore !== null) categories.push(selfScore);

        const getAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

        if (checkPL(role)) {
            // PL Score: (Self + All Leaders)
            const leadersAvg = getAvg([...leaderOfTeamScores, ...otherLeaderScores]);
            if (leadersAvg !== null) categories.push(leadersAvg);
        } else if (checkLeader(role)) {
            // Leader Score: (Self + Teammates + PL) or (Self + Teammates + Other Leaders)
            const teammatesAvg = getAvg(peerScores);
            if (teammatesAvg !== null) categories.push(teammatesAvg);
            
            if (hasPL) {
                const plAvg = getAvg(plScores);
                if (plAvg !== null) categories.push(plAvg);
            } else {
                const othersAvg = getAvg(otherLeaderScores);
                if (othersAvg !== null) categories.push(othersAvg);
            }
        } else {
            // CT Score: (Self + Teammates + Leader)
            const teammatesAvg = getAvg(peerScores);
            if (teammatesAvg !== null) categories.push(teammatesAvg);
            const myLeaderAvg = getAvg(leaderOfTeamScores);
            if (myLeaderAvg !== null) categories.push(myLeaderAvg);
        }

        if (categories.length > 0) {
            const prjAvg = categories.reduce((a, b) => a + b, 0) / categories.length;
            totalScore += prjAvg;
            projectCount++;
        }
    });

    return projectCount > 0 ? totalScore / projectCount : 0;
}

function calculateMemberClubScore(mId) {
    let disc = 10;
    const ce = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
    if (ce) disc += ce.disciplinePoints;
    disc = Math.max(0, Math.min(10, disc));
    const termProjects = state.projects.filter(p => p.term === state.currentTerm);
    let evCt = 0, evSp = 0, inCt = 0;
    termProjects.forEach(prj => {
        const participants = ensureArray(prj.participants);
        const pt = participants.find(p => p.memberId === mId);
        if (!pt) return;
        if (prj.type === 'event') { if (pt.role === 'SP') evSp++; else evCt++; }
        else if (prj.type === 'internal') inCt++;
    });
    function mapE(c) { if (c >= 3) return 10; if (c === 2) return 9; if (c === 1) return 8; return 6; }
    function mapI(c) { if (c >= 3) return 10; if (c === 2) return 9; if (c === 1) return 8; return 7; }
    const evScore = Math.max(mapE(evCt), mapE(evSp));
    const inScore = mapI(inCt);
    const brand = ce ? ce.brandScore : 7;
    return disc * 0.3 + evScore * 0.3 + inScore * 0.2 + brand * 0.2;
}

function calculateFinalScores() {
    const tbody = document.getElementById('score-tbody');
    tbody.innerHTML = '';
    const searchTxt = (document.getElementById('search-score') ? document.getElementById('search-score').value : '').toLowerCase();
    const dFilter = state.scoreDeptFilter;
    const filtered = state.members.filter(m =>
        m.name.toLowerCase().includes(searchTxt) && (dFilter === 'ALL' || m.dept === dFilter));
    filtered.forEach(member => {
        const mId = member.id;
        const prjScore = calculateMemberProjectScore(mId);
        const clubScore = calculateMemberClubScore(mId);
        const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        const deptScore = de ? de.totalScore : 0;
        const total = (prjScore + clubScore + deptScore) / 3;
        let grade = 'Can co gang';
        let gradeVi = 'Cần Cố Gắng';
        if (total >= 8.5) { grade = 'Xuat Sac'; gradeVi = 'Xuất Sắc'; }
        else if (total >= 7) { grade = 'Kha'; gradeVi = 'Khá'; }
        else if (total >= 5) { grade = 'Dat'; gradeVi = 'Đạt'; }
        const gradeColors = { 'Xuat Sac': '#f59e0b', 'Kha': '#10b981', 'Dat': '#0D8ABC', 'Can co gang': '#ef4444' };
        const gc = gradeColors[grade] || '#ef4444';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${member.name}</strong><br><span style="font-size:0.75rem;color:#94a3b8">Ban ${member.dept} - ${member.class}</span></td>
            <td><span style="color:#38bdf8;font-weight:700">${prjScore.toFixed(2)}</span></td>
            <td><span style="color:#10b981;font-weight:700">${clubScore.toFixed(2)}</span></td>
            <td><span style="color:#f59e0b;font-weight:700">${deptScore.toFixed(2)}</span></td>
            <td><strong style="font-size:1.2rem;color:var(--primary)">${total.toFixed(2)}</strong></td>
            <td><span style="background:${gc}22;color:${gc};border:1px solid ${gc}44;padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700">${gradeVi}</span></td>
            <td><button class="btn-secondary btn-sm" onclick="showScoreDetail('${mId}')"><i class="fa-solid fa-list-ul"></i> Chi tiết</button></td>`;
        tbody.appendChild(tr);
    });
}

// ==========================================
// SCORE DETAIL MODAL
// ==========================================
function showScoreDetail(mId) {
    const member = state.members.find(m => m.id === mId);
    if (!member) return;
    document.getElementById('score-detail-title').innerText = 'Chi tiết điểm: ' + member.name;
    const prjScore = calculateMemberProjectScore(mId);
    const clubScore = calculateMemberClubScore(mId);
    const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
    const deptScore = de ? de.totalScore : 0;
    const total = ((prjScore + clubScore + deptScore) / 3).toFixed(2);
    const termProjects = state.projects.filter(p => p.term === state.currentTerm);

    let prjRows = '';
    termProjects.forEach(prj => {
        const participants = ensureArray(prj.participants);
        const pt = participants.find(p => p.memberId === mId);
        if (!pt || pt.role === 'SP') return;
        const evals = state.evaluations.filter(e => e.prjId === prj.id && e.targetId === mId);
        if (evals.length === 0) {
            prjRows += `<tr><td><strong>${prj.name}</strong></td><td>${pt.role}</td><td colspan="5" style="color:var(--text-muted)">Chưa có đánh giá</td></tr>`;
            return;
        }
        const avg = n => (evals.reduce((s, e) => s + (e[n] || 0), 0) / evals.length).toFixed(1);
        const sc = (evals.reduce((s, e) => s + (e.score || 0), 0) / evals.length).toFixed(2);
        prjRows += `<tr>
            <td style="white-space:normal;"><strong>${prj.name}</strong></td>
            <td>${pt.role}</td>
            <td class="text-center">${evals.length} TV</td>
            <td class="text-center">${avg('c4')}</td>
            <td class="text-center">${avg('c1')}</td>
            <td class="text-center">${avg('c2')}</td>
            <td><strong style="color:var(--primary)">${sc}</strong></td>
        </tr>`;
    });

    const ce = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
    let disc = 10 + (ce ? ce.disciplinePoints : 0);
    disc = Math.max(0, Math.min(10, disc));
    let evCt = 0, evSp = 0, inCt = 0;
    termProjects.forEach(prj => {
        const participants = ensureArray(prj.participants);
        const pt = participants.find(p => p.memberId === mId);
        if (!pt) return;
        if (prj.type === 'event') { if (pt.role === 'SP') evSp++; else evCt++; }
        else if (prj.type === 'internal') inCt++;
    });
    const mapE2 = c => c >= 3 ? 10 : c === 2 ? 9 : c === 1 ? 8 : 6;
    const mapI2 = c => c >= 3 ? 10 : c === 2 ? 9 : c === 1 ? 8 : 7;
    const evScore = Math.max(mapE2(evCt), mapE2(evSp));
    const inScore = mapI2(inCt);
    const brand = ce ? ce.brandScore : 7;
    const reasons = (ce && ce.reasons && ce.reasons.length > 0)
        ? ce.reasons.map(r => `<span style="display:inline-block;background:var(--secondary);padding:2px 8px;border-radius:6px;font-size:0.78rem;margin:2px">${r}</span>`).join('')
        : '<i style="color:var(--text-muted)">Không có ghi chú kỷ luật</i>';

    const deptCri = de && de.criteria ? de.criteria : null;
    const deptRemarks = de && de.remarks ? de.remarks : '<i style="color:var(--text-muted)">Không có nhận xét từ Trưởng/Phó Ban</i>';
    let deptRows = '';
    if (deptCri) {
        const criArr = [
            ['Tinh thần trách nhiệm (x0.1)', deptCri.rule, 0.1],
            ['Quan hệ TB/PB (x0.1)', deptCri.hRel, 0.1],
            ['Quan hệ TV ban (x0.1)', deptCri.mRel, 0.1],
            ['Hỗ trợ team khác (x0.2)', deptCri.sup, 0.2],
            ['CV Chuyên môn 1 (x0.1)', deptCri.q1, 0.1],
            ['CV Chuyên môn 2 (x0.2)', deptCri.q2, 0.2],
            ['CV Chuyên môn 3 (x0.2)', deptCri.q3, 0.2]
        ];
        deptRows = criArr.map(([lbl, val, w]) => `<tr><td>${lbl}</td><td>${val || 0}/10</td><td>${((val || 0) * w).toFixed(2)}</td></tr>`).join('');
        if (deptCri.bonus) deptRows += `<tr><td>Điểm cộng đóng góp</td><td>+${deptCri.bonus}</td><td>${deptCri.bonus}</td></tr>`;
    } else {
        deptRows = `<tr><td colspan="3" style="color:var(--text-muted);text-align:center;padding:40px;">Chưa nhập điểm Ban. Tạm tính: ${deptScore.toFixed(2)}</td></tr>`;
    }

    state.currentDetailMemberId = mId;

    const prjScoreVal = prjScore.toFixed(2);
    const clubScoreVal = clubScore.toFixed(2);
    const deptScoreVal = deptScore.toFixed(2);

    document.getElementById('score-detail-body').innerHTML = `
        <div class="lux-detail-header" style="margin-bottom:24px;">
            <div style="display:grid; grid-template-columns: 1fr auto; align-items: center; gap:20px;">
                <div>
                    <h2 style="font-size:1.8rem; margin-bottom:4px; color:var(--text-main);">${member.name}</h2>
                    <p style="color:var(--text-muted); font-size:0.95rem;">Ban ${member.dept} • Lớp ${member.class || 'N/A'} • Khóa ${member.cohort || 'N/A'}</p>
                </div>
                <div style="background:var(--lux-gradient); color:white; padding:12px 24px; border-radius:20px; text-align:center; box-shadow:var(--lux-glow);">
                    <div style="font-size:0.7rem; text-transform:uppercase; opacity:0.9; font-weight:700; letter-spacing:1px; margin-bottom:2px;">Điểm Tổng Kết</div>
                    <div style="font-size:2rem; font-weight:900; line-height:1;">${total}</div>
                </div>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 32px;">
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div class="stat-mini-card" style="margin:0; background:rgba(14, 165, 233, 0.05); border:1px solid rgba(14, 165, 233, 0.15);">
                    <div class="stat-mini-icon" style="background:var(--primary);"><i class="fa-solid fa-diagram-project"></i></div>
                    <div class="stat-mini-info">
                        <span class="stat-mini-val" style="color:#0ea5e9;">${prjScoreVal}</span>
                        <span class="stat-mini-label">ĐIỂM PROJECT</span>
                    </div>
                </div>
                <div class="stat-mini-card" style="margin:0; background:rgba(16, 185, 129, 0.05); border:1px solid rgba(16, 185, 129, 0.15);">
                    <div class="stat-mini-icon" style="background:var(--accent-green);"><i class="fa-solid fa-users"></i></div>
                    <div class="stat-mini-info">
                        <span class="stat-mini-val" style="color:#10b981;">${clubScoreVal}</span>
                        <span class="stat-mini-label">ĐIỂM CLB</span>
                    </div>
                </div>
                <div class="stat-mini-card" style="margin:0; background:rgba(245, 158, 11, 0.05); border:1px solid rgba(245, 158, 11, 0.15);">
                    <div class="stat-mini-icon" style="background:var(--accent-yellow);"><i class="fa-solid fa-building-user"></i></div>
                    <div class="stat-mini-info">
                        <span class="stat-mini-val" style="color:#f59e0b;">${deptScoreVal}</span>
                        <span class="stat-mini-label">ĐIỂM BAN</span>
                    </div>
                </div>
            </div>
            
            <div style="background: var(--bg-sidebar); padding: 24px; border-radius: 24px; border: 1px solid var(--border-color); display: flex; justify-content: center; align-items: center; box-shadow: var(--shadow-sm); position: relative;">
                <div style="position:absolute; top:12px; left:20px; font-size:0.75rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Biểu đồ năng lực</div>
                <canvas id="member-radar-chart" style="max-height: 240px; width: 100%;"></canvas>
            </div>
        </div>

        <div class="lux-tabs" style="margin-bottom:20px;">
            <div class="lux-tab-nav" style="display:flex; gap:12px; border-bottom:1px solid var(--border-color); padding-bottom:12px;">
                <button class="pill active" onclick="switchDetailTab(this, 'prj')">Dự án</button>
                <button class="pill" onclick="switchDetailTab(this, 'clb')">CLB</button>
                <button class="pill" onclick="switchDetailTab(this, 'ban')">Ban Chuyên Môn</button>
            </div>
        </div>

        <div id="detail-tab-prj" class="detail-tab-pane active">
            <div class="table-container" style="border:1px solid var(--border-color); border-radius:16px;">
                <table class="data-table">
                    <thead><tr><th>Dự án</th><th>Vai trò</th><th>Đánh giá</th><th>Kỹ năng</th><th>Thái độ</th><th>T.Nhiệm</th><th>Kết quả</th></tr></thead>
                    <tbody>${prjRows || '<tr><td colspan="7" style="color:var(--text-muted);text-align:center;padding:40px;">Chưa tham gia project nào</td></tr>'}</tbody>
                </table>
            </div>
        </div>

        <div id="detail-tab-clb" class="detail-tab-pane" style="display:none;">
            <div class="table-container" style="border:1px solid var(--border-color); border-radius:16px;">
                <table class="data-table">
                    <thead><tr><th>Tiêu chí</th><th>Giá trị</th><th>Trọng số</th><th>Thành phần</th></tr></thead>
                    <tbody>
                        <tr><td>Kỷ luật nội quy</td><td>${disc}/10</td><td>30%</td><td>${(disc * 0.3).toFixed(2)}</td></tr>
                        <tr><td>Sự kiện Tổ chức</td><td>${evScore}/10</td><td>30%</td><td>${(evScore * 0.3).toFixed(2)}</td></tr>
                        <tr><td>Chương trình Nội bộ</td><td>${inScore}/10</td><td>20%</td><td>${(inScore * 0.2).toFixed(2)}</td></tr>
                        <tr><td>Hình ảnh & Thương hiệu</td><td>${brand}/10</td><td>20%</td><td>${(brand * 0.2).toFixed(2)}</td></tr>
                    </tbody>
                </table>
            </div>
            <div class="score-formula-box" style="margin-top:12px; font-size:0.75rem; background:rgba(0,0,0,0.03); padding:10px; border-radius:8px; line-height:1.4;">
                <i class="fa-solid fa-sticky-note"></i> <strong>Ghi chú kỷ luật:</strong> ${reasons}
            </div>
        </div>

        <div id="detail-tab-ban" class="detail-tab-pane" style="display:none;">
            <div class="table-container" style="border:1px solid var(--border-color); border-radius:16px;">
                <table class="data-table">
                    <thead><tr><th>Tiêu chí đánh giá</th><th>Điểm</th><th>Thành phần</th></tr></thead>
                    <tbody>${deptRows}</tbody>
                </table>
            </div>
            <div class="score-formula-box" style="margin-top:12px; font-size:0.75rem; background:rgba(0,0,0,0.03); padding:10px; border-radius:8px; line-height:1.4;">
                <i class="fa-solid fa-comment-dots"></i> <strong>Nhận xét của TPB:</strong> ${deptRemarks}
            </div>
        </div>`;

    // Initialize Radar Chart
    setTimeout(() => {
        const ctx = document.getElementById('member-radar-chart');
        if (!ctx) return;

        const rs = (disc + (deptCri ? deptCri.rule : 10)) / 2;
        const ws = deptCri ? (deptCri.q1 + deptCri.q2 + deptCri.q3) / 3 : 0;
        const cas = (evScore + inScore) / 2;
        const rels = (brand + (deptCri ? (deptCri.hRel + deptCri.mRel + deptCri.sup) / 3 : 10)) / 2;

        if (window.memberRadarChart) window.memberRadarChart.destroy();
        window.memberRadarChart = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Dự án', 'Kỷ luật', 'Chuyên môn', 'CLB', 'Quan hệ'],
                datasets: [{
                    label: 'Năng lực',
                    data: [prjScoreVal, rs.toFixed(2), ws.toFixed(2), cas.toFixed(2), rels.toFixed(2)],
                    backgroundColor: 'rgba(14, 165, 233, 0.2)',
                    borderColor: '#0ea5e9',
                    pointBackgroundColor: '#0ea5e9',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        min: 0, max: 10,
                        ticks: { display: false },
                        pointLabels: { font: { family: 'Inter', size: 10, weight: 'bold' } }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    }, 100);
    openModal('score-detail-modal');
}

async function downloadPDF(mId) {
    const member = state.members.find(m => m.id === mId);
    if (!member) return;

    showToast('Đang khởi tạo báo cáo Premium...', 'info');

    // Data Calculation
    const prjScore = calculateMemberProjectScore(mId);
    const clubScore = calculateMemberClubScore(mId);
    const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
    const deptScore = de ? de.totalScore : 0;
    const total = ((prjScore + clubScore + deptScore) / 3).toFixed(2);

    const evals = state.evaluations.filter(e => e.targetId === mId);
    let c1 = 0, c2 = 0, c3 = 0, c4 = 0, c5 = 0, c6 = 0, c7 = 0;
    if (evals.length > 0) {
        c1 = evals.reduce((s, e) => s + (e.c1 || 0), 0) / evals.length;
        c2 = evals.reduce((s, e) => s + (e.c2 || 0), 0) / evals.length;
        c3 = evals.reduce((s, e) => s + (e.c3 || 0), 0) / evals.length;
        c4 = evals.reduce((s, e) => s + (e.c4 || 0), 0) / evals.length;
        c5 = evals.reduce((s, e) => s + (e.c5 || 0), 0) / evals.length;
        c6 = evals.reduce((s, e) => s + (e.c6 || 0), 0) / evals.length;
        c7 = evals.reduce((s, e) => s + (e.c7 || 0), 0) / evals.length;
    }

    const ce = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
    let disc = 10 + (ce ? ce.disciplinePoints : 0);
    disc = Math.max(0, Math.min(10, disc));
    const termProjects = state.projects.filter(p => p.term === state.currentTerm);
    let evCt = 0, evSp = 0, inCt = 0;
    termProjects.forEach(prj => {
        const participants = ensureArray(prj.participants);
        const pt = participants.find(p => p.memberId === mId);
        if (!pt) return;
        if (prj.type === 'event') { if (pt.role === 'SP') evSp++; else evCt++; }
        else if (prj.type === 'internal') inCt++;
    });
    const mapE2 = c => c >= 3 ? 10 : c === 2 ? 9 : c === 1 ? 8 : 6;
    const mapI2 = c => c >= 3 ? 10 : c === 2 ? 9 : c === 1 ? 8 : 7;
    const evScore = Math.max(mapE2(evCt), mapE2(evSp));
    const inScore = mapI2(inCt);
    const brand = ce ? ce.brandScore : 7;
    const reasons = (ce && ce.reasons && ce.reasons.length > 0) ? ce.reasons.join(', ') : 'Chấp hành tốt các quy định.';
    const deptCri = de && de.criteria ? de.criteria : null;
    const deptRemarksText = (de && de.remarks) ? de.remarks : 'Thành viên hoàn thành tốt các nhiệm vụ được giao, có tinh thần trách nhiệm cao trong công việc.';

    // Generate Radar Chart Image for PDF
    const generateChartDataURL = () => {
        return new Promise((resolve) => {
            const canvas = document.createElement('canvas');
            canvas.width = 600;
            canvas.height = 400;
            canvas.style.display = 'none';
            document.body.appendChild(canvas);

            const ruleS = (disc * 0.5 + (deptCri ? deptCri.rule : 10) * 0.5);
            const workS = deptCri ? (deptCri.q1 + deptCri.q2 + deptCri.q3) / 3 : 8;
            const clubS = (evScore + inScore) / 2;
            const relS = (brand + (deptCri ? (deptCri.hRel + deptCri.mRel + deptCri.sup) / 3 : 8)) / 2;

            new Chart(canvas, {
                type: 'radar',
                data: {
                    labels: ['Project', 'Kỷ luật', 'Chuyên môn', 'HĐ CLB', 'Công hiến'],
                    datasets: [{
                        label: 'Năng lực',
                        data: [prjScore, ruleS, workS, clubS, relS],
                        backgroundColor: 'rgba(197, 160, 89, 0.35)',
                        borderColor: '#c5a059',
                        borderWidth: 3,
                        pointRadius: 5,
                        pointBackgroundColor: '#fff',
                        pointBorderColor: '#c5a059',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    animation: false,
                    responsive: false,
                    scales: {
                        r: {
                            min: 0, max: 10,
                            ticks: { display: false },
                            grid: { color: 'rgba(197, 160, 89, 0.15)' },
                            angleLines: { color: 'rgba(197, 160, 89, 0.15)' },
                            pointLabels: {
                                font: { size: 14, weight: 'bold', family: 'Times New Roman' },
                                color: '#8e6d2c'
                            }
                        }
                    },
                    plugins: { legend: { display: false } }
                },
                plugins: [{
                    beforeDraw: (chart) => {
                        const ctx = chart.ctx;
                        ctx.fillStyle = "white";
                        ctx.fillRect(0, 0, chart.width, chart.height);
                    }
                }]
            });

            setTimeout(() => {
                const img = canvas.toDataURL('image/png');
                document.body.removeChild(canvas);
                resolve(img);
            }, 600);
        });
    };

    const chartImgUrl = await generateChartDataURL();
    const wrapper = document.getElementById('individual-report-template');

    const memberProjects = state.projects.filter(prj => {
        const participants = ensureArray(prj.participants);
        return participants.some(p => p.memberId === mId) && prj.term === state.currentTerm;
    }).map(prj => {
        const pt = ensureArray(prj.participants).find(p => p.memberId === mId);
        let roleName = 'Thành viên';
        if (pt.role === 'PL') roleName = 'Project Leader';
        if (pt.role === 'TL') roleName = 'Team Leader';
        if (pt.role === 'SP') roleName = 'Supporter';
        return { name: prj.name, role: roleName };
    });

    const projectRowsHtml = memberProjects.length > 0
        ? memberProjects.map(p => `<tr><td>${p.name}</td><td>${p.role}</td></tr>`).join('')
        : '<tr><td colspan="2">Chưa tham gia chương trình nào</td></tr>';

    wrapper.innerHTML = `
        <div class="report-formal-wrapper" id="premium-pdf-content">
            <div class="report-gold-header">
                <h1>CLB CHUYÊN VIÊN NHÂN SỰ TẬP SỰ HuReA</h1>
                <h2>BẢNG ĐÁNH GIÁ NHÂN SỰ </h2>
            </div>

            <div class="report-content-container">
                <div class="report-section-wrapper">
                    <div class="report-two-col">
                        <table class="report-info-table">
                            <thead><tr><th colspan="2">THÔNG TIN CÁ NHÂN</th></tr></thead>
                            <tbody>
                                <tr><td class="label">Họ & Tên</td><td class="value">${member.name}</td></tr>
                                <tr><td class="label">Lớp - Khóa</td><td class="value">${member.class || '-'} - K${member.cohort || '-'}</td></tr>
                                <tr><td class="label">Chức danh</td><td class="value">${member.role || 'CTV'}</td></tr>
                                <tr><td class="label">Ban hoạt động</td><td class="value">${member.dept || '-'}</td></tr>
                            </tbody>
                        </table>
                        <table class="report-info-table">
                            <thead><tr><th colspan="2">QUY ƯỚC ĐÁNH GIÁ</th></tr></thead>
                            <tbody>
                                <tr><td colspan="2" style="font-size: 10px; line-height: 1.4; background:#fffdf1;">
                                    • Điểm được đánh giá trên thang điểm 10<br>
                                    • Điểm được làm tròn đến số thập phân thứ 2<br>
                                    • Mỗi chỉ tiêu đánh giá có trọng số tương ứng<br>
                                    • Công tác đánh giá dựa trên nguyên tắc công bằng và khách quan
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header">THAM GIA TỔ CHỨC PROJECT</div>
                    <table class="report-section-table">
                        <thead>
                            <tr>
                                <th style="width:20%">TIÊU CHÍ</th>
                                <th style="width:50%">CHỈ TIÊU</th>
                                <th style="width:10%">TRỌNG SỐ</th>
                                <th style="width:20%">KẾT QUẢ ĐÁNH GIÁ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td rowspan="3" class="row-category">THÁI ĐỘ</td><td class="text-left">Nhiệt tình, chủ động trong công việc</td><td>0.15</td><td>${c1.toFixed(2)}</td></tr>
                            <tr><td class="text-left">Trách nhiệm, kịp tiến độ, đúng deadline</td><td>0.2</td><td>${c2.toFixed(2)}</td></tr>
                            <tr><td class="text-left">Tư duy tích cực, đề xuất và tiếp thu ý kiến</td><td>0.1</td><td>${c3.toFixed(2)}</td></tr>
                            <tr><td class="row-category">KỸ NĂNG LÀM VIỆC</td><td class="text-left">Trình độ, chuyên môn phục vụ for công việc</td><td>0.1</td><td>${c4.toFixed(2)}</td></tr>
                            <tr><td rowspan="2" class="row-category">CHẤT LƯỢNG CÔNG VIỆC</td><td class="text-left">Đầu tư nghiên cứu</td><td>0.1</td><td>${c5.toFixed(2)}</td></tr>
                            <tr><td class="text-left">Mức độ hoàn thành công việc</td><td>0.2</td><td>${c6.toFixed(2)}</td></tr>
                            <tr><td class="row-category">MỐI QUAN HỆ TRONG PROJECT</td><td class="text-left">Với Care/Leader, thành viên trong coreteam</td><td>0.15</td><td>${c7.toFixed(2)}</td></tr>
                            <tr class="row-total">
                                <td colspan="2">ĐIỂM TRUNG BÌNH</td>
                                <td colspan="2" class="score-red">${prjScore.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header">HOẠT ĐỘNG TRONG CLB</div>
                    <table class="report-section-table">
                        <thead>
                            <tr>
                                <th style="width:25%">TIÊU CHÍ</th>
                                <th style="width:45%">CHỈ TIÊU</th>
                                <th style="width:10%">TRỌNG SỐ</th>
                                <th style="width:20%">BỘ PHẬN TOTAL REWARDS ĐÁNH GIÁ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td class="row-category">TINH THẦN TRÁCH NHIỆM</td><td class="text-left">Chấp hành kỷ luật, nội quy, văn hóa CLB</td><td>0.3</td><td>${disc.toFixed(2)}</td></tr>
                            <tr><td class="row-category">THAM GIA VÀ HỖ TRỢ CÁC CÔNG VIỆC CỦA CLB</td><td class="text-left">Tổ chức, hỗ trợ các chương trình của CLB</td><td>0.3</td><td>${evScore.toFixed(2)}</td></tr>
                            <tr><td>&nbsp;</td><td class="text-left">Tích cực tham gia chương trình nội bộ</td><td>0.2</td><td>${inScore.toFixed(2)}</td></tr>
                            <tr><td class="row-category">PHÁT TRIỂN HÌNH ẢNH CLB</td><td class="text-left">Tuyên truyền, phát triển hình ảnh CLB</td><td>0.2</td><td>${brand.toFixed(2)}</td></tr>
                            <tr><td class="row-category">MẶT KHÁC</td><td colspan="2">Điểm cộng</td><td>${(ce ? ce.disciplinePoints : 0).toFixed(2)}</td></tr>
                            <tr class="row-total">
                                <td colspan="2">ĐIỂM TRUNG BÌNH</td>
                                <td colspan="2" class="score-red">${clubScore.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header">PHÂN TÍCH NĂNG LỰC CÁ NHÂN</div>
                    <div class="report-radar-wrapper">
                        <img src="${chartImgUrl}" style="width: 360px; height: auto;">
                    </div>
                </div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header">HOẠT ĐỘNG TRONG BAN</div>
                    <table class="report-section-table">
                        <thead>
                            <tr>
                                <th style="width:25%">TIÊU CHÍ</th>
                                <th style="width:45%">CHỈ TIÊU</th>
                                <th style="width:10%">TRỌNG SỐ</th>
                                <th style="width:20%">TRƯỞNG/PHÓ BAN ĐÁNH GIÁ</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td class="row-category">TINH THẦN TRÁCH NHIỆM, KỈ LUẬT</td><td class="text-left">Thực hiện nội quy bộ phận</td><td>0.1</td><td>${(deptCri ? deptCri.rule : 0).toFixed(2)}</td></tr>
                            <tr><td rowspan="2" class="row-category">MỐI QUAN HỆ VỚI BAN</td><td class="text-left">Với trưởng phó ban</td><td>0.1</td><td>${(deptCri ? deptCri.hRel : 0).toFixed(2)}</td></tr>
                            <tr><td class="text-left">Với thành viên/CTV ban</td><td>0.1</td><td>${(deptCri ? deptCri.mRel : 0).toFixed(2)}</td></tr>
                            <tr><td class="row-category">THAM GIA VÀ HỖ TRỢ CÔNG VIỆC CỦA BAN</td><td class="text-left">Tham gia đóng góp, hỗ trợ tích cực các hoạt động, chương trình của team khác trong ban</td><td>0.2</td><td>${(deptCri ? deptCri.sup : 0).toFixed(2)}</td></tr>
                            <tr><td rowspan="3" class="row-category">CHẤT LƯỢNG CÔNG VIỆC</td><td class="text-left">Teambuilding</td><td>0.1</td><td>${(deptCri ? deptCri.q1 : 0).toFixed(2)}</td></tr>
                            <tr><td class="text-left">Tình nguyện trung thu HureAMour</td><td>0.2</td><td>${(deptCri ? deptCri.q2 : 0).toFixed(2)}</td></tr>
                            <tr><td class="text-left">Tìm kiếm CTV Tháng 10/2025</td><td>0.2</td><td>${(deptCri ? deptCri.q3 : 0).toFixed(2)}</td></tr>
                            <tr><td class="row-category">ĐÓNG GÓP PHÁT TRIỂN BAN</td><td colspan="2">Điểm cộng</td><td>${(deptCri ? deptCri.bonus : 0).toFixed(2)}</td></tr>
                            <tr class="row-total">
                                <td colspan="2">ĐIỂM TRUNG BÌNH</td>
                                <td colspan="2" class="score-red">${deptScore.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="report-page-break"></div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header" style="margin-top:20px;">BẢNG ĐIỂM TỔNG HỢP</div>
                    <table class="report-section-table">
                        <tbody>
                            <tr><td class="text-left" style="width:70%">Đánh giá Tham gia tổ chức Project</td><td>${prjScore.toFixed(2)}</td></tr>
                            <tr><td class="text-left">Đánh giá Hoạt động trong CLB</td><td>${clubScore.toFixed(2)}</td></tr>
                            <tr><td class="text-left">Đánh giá Hoạt động trong Ban</td><td>${deptScore.toFixed(2)}</td></tr>
                            <tr class="row-total" style="background: #fff9ea;">
                                <td class="text-left">ĐIỂM TRUNG BÌNH</td>
                                <td class="score-red" style="font-size: 16px;">${total}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="report-section-wrapper">
                    <div class="report-gold-sub-header">NHẬT XÉT CHUNG CỦA CLB</div>
                    <div class="report-comment-box">
                        <div class="report-comment-label">Trưởng/phó ban ${member.dept || 'R&R'} đánh giá</div>
                        <div class="report-comment-content">
                            ${deptRemarksText}
                        </div>
                    </div>
                </div>

                <div class="report-section-wrapper">
                    <table class="report-footer-table">
                        <thead>
                            <tr><th colspan="2" style="background: linear-gradient(90deg, #c5a059, #e8d5b5); color: #fff;">CÁC CHƯƠNG TRÌNH ĐÃ THAM GIA HỖ TRỢ</th></tr>
                            <tr><th style="background: #f1f1f1;">TÊN CHƯƠNG TRÌNH</th><th style="background: #f1f1f1;">VAI TRÒ</th></tr>
                        </thead>
                        <tbody>
                            ${projectRowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    const opt = {
        margin: [0, 0],
        filename: `Bao_Cao_${member.name.replace(/ /g, '_')}_Pro.pdf`,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            backgroundColor: '#ffffff',
            logging: false
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const element = document.getElementById('premium-pdf-content');
    element.parentElement.style.display = 'block';

    try {
        await html2pdf().set(opt).from(element).save();
        showToast('Xuất báo cáo PDF thành công!', 'success');
    } catch (err) {
        console.error('PDF Error:', err);
        showToast('Lỗi khi xuất PDF, vui lòng thử lại.', 'error');
    } finally {
        element.parentElement.style.display = 'none';
        wrapper.innerHTML = '';
    }
}

function exportIndividualPDFFromModal() {
    if (state.currentDetailMemberId) {
        downloadPDF(state.currentDetailMemberId);
    }
}

function switchDetailTab(btn, paneId) {
    btn.parentElement.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const modal = btn.closest('.modal-wrapper');
    modal.querySelectorAll('.detail-tab-pane').forEach(p => p.style.display = 'none');
    modal.querySelector(`#detail-tab-${paneId}`).style.display = 'block';
}





function selectEvalMethod(type, method) {
    if (method === 'form') {
        document.getElementById(`${type}-method-selection`).style.display = 'none';
        document.getElementById(`${type}-form-container`).style.display = 'block';
    } else {
        openBatchEvalModal(type);
    }
}

function backToMethodSelection(type) {
    document.getElementById(`${type}-method-selection`).style.display = 'grid';
    document.getElementById(`${type}-form-container`).style.display = 'none';
    
    // Clear current selection
    const hiddenInput = document.getElementById(`eval-${type}-member`);
    if (hiddenInput) {
        hiddenInput.value = '';
        checkExistingScore(type, '');
    }
    const btnDisp = document.getElementById(`btn-${type}-member`);
    if (btnDisp) btnDisp.innerText = '-- Tìm & chọn người --';
}

// ==========================================
// CLUB & DEPT EVAL
// ==========================================
let isEditingEval = { club: false, dept: false };

function checkExistingScore(type, mId) {
    if (!mId) {
        document.getElementById(`${type}-eval-history`).style.display = 'none';
        document.getElementById(`${type}-eval-form`).style.display = 'block';
        return;
    }

    const member = state.members.find(m => m.id === mId);
    let historyHtml = '';
    let exists = false;

    if (type === 'club') {
        const ce = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        if (ce) {
            exists = true;
            historyHtml = `
                <div class="history-stat-grid">
                    <div class="history-stat-item">
                        <span class="history-stat-label">Điểm Kỷ luật</span>
                        <span class="history-stat-val">${ce.disciplinePoints >= 0 ? '+' : ''}${ce.disciplinePoints}</span>
                    </div>
                    <div class="history-stat-item">
                        <span class="history-stat-label">Điểm Hình ảnh</span>
                        <span class="history-stat-val">${ce.brandScore}/10</span>
                    </div>
                </div>
                <div class="history-remarks">
                    <strong>Ghi chú kỷ luật:</strong><br>
                    ${ce.reasons.length ? ce.reasons.join('<br>') : 'Không có ghi chú'}
                </div>`;
        }
    } else {
        const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        if (de) {
            exists = true;
            historyHtml = `
                <div class="history-stat-grid">
                    <div class="history-stat-item">
                        <span class="history-stat-label">Tổng điểm Ban</span>
                        <span class="history-stat-val">${de.totalScore.toFixed(2)} / 10</span>
                    </div>
                </div>
                <div class="history-remarks">
                    <strong>Nhận xét của TPB:</strong><br>
                    ${de.remarks || 'Không có nhận xét'}
                </div>`;
        }
    }

    const historyEl = document.getElementById(`${type}-eval-history`);
    const formEl = document.getElementById(`${type}-eval-form`);

    if (exists && !isEditingEval[type]) {
        document.getElementById(`${type}-history-content`).innerHTML = historyHtml;
        historyEl.style.display = 'block';
        formEl.style.display = 'none';
    } else {
        historyEl.style.display = 'none';
        formEl.style.display = 'block';
    }
}

function editEval(type) {
    const mId = document.getElementById(`eval-${type}-member`).value;
    if (!mId) return;

    isEditingEval[type] = true;
    
    // Populate form with existing data
    if (type === 'club') {
        const ce = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        if (ce) {
            // Club evaluation is incremental in the old logic, 
            // but for "Edit" we'll treat it as editing the total points or just adding more.
            // Requirement says "chỉnh sửa được", let's clear inputs but show cancel.
            document.getElementById('club-discipline-score').value = '';
            document.getElementById('club-discipline-reason').value = '';
            document.getElementById('club-brand-score').value = ce.brandScore;
        }
    } else {
        const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        if (de && de.criteria) {
            document.getElementById('dept-rule-score').value = de.criteria.rule;
            document.getElementById('dept-head-rel').value = de.criteria.hRel;
            document.getElementById('dept-mem-rel').value = de.criteria.mRel;
            document.getElementById('dept-support').value = de.criteria.sup;
            document.getElementById('dept-q1').value = de.criteria.q1;
            document.getElementById('dept-q2').value = de.criteria.q2;
            document.getElementById('dept-q3').value = de.criteria.q3;
            document.getElementById('dept-comment').value = de.remarks || '';
        }
    }

    document.getElementById(`${type}-eval-history`).style.display = 'none';
    document.getElementById(`${type}-eval-form`).style.display = 'block';
    document.getElementById(`btn-cancel-${type}-edit`).style.display = 'inline-block';
}

function cancelEvalEdit(type) {
    isEditingEval[type] = false;
    document.getElementById(`btn-cancel-${type}-edit`).style.display = 'none';
    checkExistingScore(type, document.getElementById(`eval-${type}-member`).value);
}

async function saveClubEval() {
    const mId = document.getElementById('eval-club-member').value;
    if (!mId) return alert('Chưa chọn thành viên');

    // Admin or Board Member check
    if (state.userRole !== 'admin' && !isBoardMember()) {
        return alert('Bạn không có quyền thực hiện đánh giá này.');
    }

    const dScore = parseFloat(document.getElementById('club-discipline-score').value || 0);
    const dReason = document.getElementById('club-discipline-reason').value;
    const bScore = parseFloat(document.getElementById('club-brand-score').value);

    // Initial check for brand score
    if (isNaN(bScore)) return alert('Vui lòng nhập điểm Hình ảnh (2.4)');

    const btn = document.querySelector('#eval-club .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        let entry = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        if (!entry) {
            entry = { 
                id: 'cs' + Date.now(), 
                memberId: mId, 
                term: state.currentTerm, 
                disciplinePoints: 0, 
                brandScore: 7, 
                reasons: [] 
            };
        }

        // Apply changes
        if (dScore !== 0) {
            entry.disciplinePoints += dScore;
            const rText = (dScore >= 0 ? '+' : '') + dScore + ': ' + (dReason || 'Điều chỉnh điểm kỷ luật');
            entry.reasons.push(rText);
        }
        entry.brandScore = bScore;

        await syncToBackend('save_score_club', entry);
        showToast('Lưu điểm CLB thành công!', 'success');

        // Update local state if not already there
        const idx = state.clubScores.findIndex(x => x.memberId === mId && x.term === state.currentTerm);
        if (idx === -1) state.clubScores.push(entry);

        isEditingEval.club = false;
        document.getElementById('btn-cancel-club-edit').style.display = 'none';
        
        // Reset discipline inputs
        document.getElementById('club-discipline-score').value = '';
        document.getElementById('club-discipline-reason').value = '';
        
        checkExistingScore('club', mId);
    } catch (err) {
        showToast('Lỗi khi lưu dữ liệu!', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function saveDeptEval() {
    const mId = document.getElementById('eval-dept-member').value;
    if (!mId) return alert('Chua chon thanh vien');
    
    // Amin or Board Member check
    if (state.userRole !== 'admin' && !isBoardMember()) {
        return alert('Bạn không có quyền thực hiện đánh giá này.');
    }

    const rule = parseFloat(document.getElementById('dept-rule-score').value || 0);
    const hRel = parseFloat(document.getElementById('dept-head-rel').value || 0);
    const mRel = parseFloat(document.getElementById('dept-mem-rel').value || 0);
    const sup = parseFloat(document.getElementById('dept-support').value || 0);
    const q1 = parseFloat(document.getElementById('dept-q1').value || 0);
    const q2 = parseFloat(document.getElementById('dept-q2').value || 0);
    const q3 = parseFloat(document.getElementById('dept-q3').value || 0);
    const bonus = parseFloat(document.getElementById('dept-bonus') ? document.getElementById('dept-bonus').value : 0);
    const remarks = document.getElementById('dept-comment').value;

    const btn = document.querySelector('#eval-dept .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
    btn.disabled = true;

    try {
        let totalScore = 0.1 * (rule + hRel + mRel + q1) + 0.2 * (sup + q2 + q3) + bonus;
        if (totalScore > 10) totalScore = 10;
        
        state.deptScores = state.deptScores.filter(x => !(x.memberId === mId && x.term === state.currentTerm));
        const entry = { 
            memberId: mId, 
            term: state.currentTerm, 
            totalScore, 
            remarks,
            criteria: { rule, hRel, mRel, sup, q1, q2, q3, bonus } 
        };
        state.deptScores.push(entry);
        
        await syncToBackend('save_score_dept', entry);
        showToast('Lưu điểm Ban thành công: ' + totalScore.toFixed(2), 'success');
        
        isEditingEval.dept = false;
        document.getElementById('btn-cancel-dept-edit').style.display = 'none';
        checkExistingScore('dept', mId);
    } catch (err) {
        showToast('Lỗi khi đồng bộ dữ liệu!', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// BATCH EVALUATION (EXCEL-LIKE)
// ==========================================
let currentBatchType = 'club';

function openBatchEvalModal(type) {
    currentBatchType = type;
    document.getElementById('batch-eval-title').innerText = type === 'club' ? 'Nhập Đánh giá CLB hàng loạt' : 'Nhập Đánh giá Ban hàng loạt';
    document.getElementById('batch-paste-area').value = '';
    
    // Clear errors
    const errorLog = document.getElementById('batch-paste-errors');
    if (errorLog) errorLog.style.display = 'none';
    const errorList = document.getElementById('batch-error-list');
    if (errorList) errorList.innerHTML = '';

    renderEvalGrid(type);
    openModal('batch-eval-modal');
}

function renderEvalGrid(type) {
    const table = document.getElementById('batch-eval-table');
    const members = state.members.filter(m => state.scoreDeptFilter === 'ALL' || m.dept === state.scoreDeptFilter);
    
    let html = '<thead><tr><th>#</th><th>Thành viên</th>';
    
    if (type === 'club') {
        html += '<th>Kỷ luật (+/-)</th><th>Lý do</th><th>Hình ảnh (0-10)</th></tr></thead><tbody>';
    } else {
        html += '<th>Kỷ luật (x0.1)</th><th>TB/PB (x0.1)</th><th>TV (x0.1)</th><th>Hỗ trợ (x0.2)</th><th>Q1 (x0.1)</th><th>Q2 (x0.2)</th><th>Q3 (x0.2)</th><th>Nhận xét</th></tr></thead><tbody>';
    }

    members.forEach((m, idx) => {
        const ce = state.clubScores.find(x => x.memberId === m.id && x.term === state.currentTerm);
        const de = state.deptScores.find(x => x.memberId === m.id && x.term === state.currentTerm);
        
        html += `<tr data-mid="${m.id}">
            <td>${idx + 1}</td>
            <td><strong>${m.name}</strong><br><small style="color:var(--text-muted)">Ban ${m.dept}</small></td>`;
        
        if (type === 'club') {
            const clubBrand = (ce && ce.brandScore !== undefined) ? ce.brandScore : '';
            html += `
                <td><input type="number" class="grid-input num-center score-val" data-field="discipline" placeholder="0" value=""></td>
                <td><input type="text" class="grid-input score-val" data-field="reason" placeholder="Lý do..."></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="brand" placeholder="7" value="${clubBrand}"></td>`;
        } else {
            const c = (de && de.criteria) ? de.criteria : {};
            html += `
                <td><input type="number" class="grid-input num-center score-val" data-field="rule" value="${c.rule !== undefined ? c.rule : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="hRel" value="${c.hRel !== undefined ? c.hRel : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="mRel" value="${c.mRel !== undefined ? c.mRel : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="sup" value="${c.sup !== undefined ? c.sup : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="q1" value="${c.q1 !== undefined ? c.q1 : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="q2" value="${c.q2 !== undefined ? c.q2 : ''}"></td>
                <td><input type="number" class="grid-input num-center score-val" data-field="q3" value="${c.q3 !== undefined ? c.q3 : ''}"></td>
                <td><input type="text" class="grid-input score-val" data-field="remarks" value="${de ? de.remarks || '' : ''}"></td>`;
        }
        html += '</tr>';
    });
    
    html += '</tbody>';
    table.innerHTML = html;
    document.getElementById('batch-row-count').innerText = members.length;
}

function removeDiacritics(str) {
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

function handleBatchPaste(e) {
    const clipboardData = e.clipboardData || window.clipboardData;
    const pastedData = clipboardData.getData('text');
    if (!pastedData) return;
    
    // Split into rows
    const rows = pastedData.split(/\r?\n/).filter(r => r.trim() !== '');
    const gridRows = document.querySelectorAll('#batch-eval-table tbody tr');
    
    document.getElementById('batch-grid-loading').style.display = 'flex';
    
    // Clear errors
    const errorList = document.getElementById('batch-error-list');
    const errorLog = document.getElementById('batch-paste-errors');
    errorList.innerHTML = '';
    errorLog.style.display = 'none';
    const unmatched = [];

    setTimeout(() => {
        rows.forEach(rowText => {
            const rowLower = rowText.toLowerCase().trim();
            const rowNorm = removeDiacritics(rowLower);
            if (!rowLower) return;

            let matchFound = false;
            let targetTr = null;
            let scoreParts = [];

            // Step 1: Try logical splitting (Tab or Multiple Spaces)
            let cols = rowText.split('\t');
            if (cols.length < 2) cols = rowText.split(/\s{2,}/).filter(c => c.trim() !== '');

            if (cols.length >= 2) {
                const nameAttempt = cols[0].trim().toLowerCase();
                const nameNormAttempt = removeDiacritics(nameAttempt);
                for (let tr of gridRows) {
                    const rowName = tr.cells[1].querySelector('strong').innerText.toLowerCase();
                    const rowNormName = removeDiacritics(rowName);
                    if (rowName === nameAttempt || rowNormName === nameNormAttempt) {
                        targetTr = tr;
                        scoreParts = cols.slice(1);
                        matchFound = true;
                        break;
                    }
                }
            }

            // Step 2: Fallback to Prefix Matching (if Column 1 was not a clean split)
            if (!matchFound) {
                for (let tr of gridRows) {
                    const rowName = tr.cells[1].querySelector('strong').innerText.toLowerCase();
                    const rowNormName = removeDiacritics(rowName);
                    // Check if row starts with a known member name
                    if (rowNorm.startsWith(rowNormName)) {
                        targetTr = tr;
                        const splitIdx = rowNorm.indexOf(rowNormName) + rowNormName.length;
                        const remaining = rowText.substring(splitIdx).trim();
                        // Split remaining part (scores) by any whitespace
                        scoreParts = remaining.split(/\s+/).filter(s => s.trim() !== '');
                        matchFound = true;
                        break;
                    }
                }
            }

            // Execute fill if match was found
            if (matchFound && targetTr) {
                const inputs = targetTr.querySelectorAll('.grid-input');
                scoreParts.forEach((val, i) => {
                    if (inputs[i]) {
                        // Clean numeric values (remove characters, keep decimals/signs)
                        let cleaned = val.trim().replace(/,/g, '');
                        // Check if it's a number for score fields
                        if (inputs[i].type === 'number' && isNaN(parseFloat(cleaned))) return;
                        inputs[i].value = cleaned;
                    }
                });
                // Visual feedback
                targetTr.classList.remove('row-highlight');
                void targetTr.offsetWidth; 
                targetTr.classList.add('row-highlight');
            } else {
                // REPORT AS ERROR: No member matched this row
                unmatched.push(rowText.length > 30 ? rowText.substring(0, 27) + '...' : rowText);
            }
        });

        if (unmatched.length > 0) {
            unmatched.forEach(name => {
                const li = document.createElement('li');
                li.innerText = name;
                errorList.appendChild(li);
            });
            errorLog.style.display = 'block';
        }

        document.getElementById('batch-grid-loading').style.display = 'none';
        if (unmatched.length > 0) {
            showToast(`Đã xử lý xong. Không tìm thấy ${unmatched.length} thành viên.`, 'warning');
        } else {
            showToast('Đã xử lý dữ liệu dán thành công!', 'success');
        }
    }, 300);
}

async function saveBatchEval() {
    const type = currentBatchType;
    const rows = document.querySelectorAll('#batch-eval-table tbody tr');
    const records = [];
    
    rows.forEach(tr => {
        const mId = tr.getAttribute('data-mid');
        const inputs = tr.querySelectorAll('.grid-input');
        
        if (type === 'club') {
            const dScore = parseFloat(inputs[0].value || 0);
            const dReason = inputs[1].value;
            const bScore = parseFloat(inputs[2].value);
            
            // Only save if there's actual data input
            if (dScore !== 0 || !isNaN(bScore)) {
                let entry = state.clubScores.find(x => x.memberId === mId && x.term === state.currentTerm);
                if (!entry) {
                    entry = { id: 'cs' + Date.now(), memberId: mId, term: state.currentTerm, disciplinePoints: 0, brandScore: 7, reasons: [] };
                }
                
                if (dScore !== 0) {
                    entry.disciplinePoints += dScore;
                    if (dReason) entry.reasons.push((dScore >= 0 ? '+' : '') + dScore + ': ' + dReason);
                    else entry.reasons.push((dScore >= 0 ? '+' : '') + dScore + ': Điều chỉnh điểm kỷ luật');
                }
                if (!isNaN(bScore)) entry.brandScore = bScore;
                
                records.push(entry);
            }
        } else {
            const rule = parseFloat(inputs[0].value);
            const hRel = parseFloat(inputs[1].value);
            const mRel = parseFloat(inputs[2].value);
            const sup = parseFloat(inputs[3].value);
            const q1 = parseFloat(inputs[4].value);
            const q2 = parseFloat(inputs[5].value);
            const q3 = parseFloat(inputs[6].value);
            const remarks = inputs[7].value;
            
            if (!isNaN(rule) || !isNaN(hRel) || remarks) {
                const bonus = 0; // Default in batch for now
                let totalScore = 0.1 * ((rule || 0) + (hRel || 0) + (mRel || 0) + (q1 || 0)) + 0.2 * ((sup || 0) + (q2 || 0) + (q3 || 0)) + bonus;
                if (totalScore > 10) totalScore = 10;
                
                records.push({
                    memberId: mId,
                    term: state.currentTerm,
                    totalScore,
                    remarks,
                    criteria: { rule, hRel, mRel, sup, q1, q2, q3, bonus }
                });
            }
        }
    });
    
    if (records.length === 0) return alert('Không có dữ liệu mới để lưu!');
    
    const btn = document.getElementById('btn-save-batch-eval');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đồng bộ...';
    btn.disabled = true;
    
    try {
        const sheetName = type === 'club' ? 'ScoreClub' : 'ScoreDept';
        await syncToBackend('save_score_batch', { type: sheetName, records });
        
        // Update local state
        if (type === 'club') {
            records.forEach(r => {
                const idx = state.clubScores.findIndex(x => x.memberId === r.memberId && x.term === r.term);
                if (idx > -1) state.clubScores[idx] = r;
                else state.clubScores.push(r);
            });
        } else {
            records.forEach(r => {
                state.deptScores = state.deptScores.filter(x => !(x.memberId === r.memberId && x.term === r.term));
                state.deptScores.push(r);
            });
        }
        
        showToast(`Đã lưu thành công ${records.length} đánh giá!`, 'success');
        closeModal('batch-eval-modal');
        // Refresh detail history if needed
        const currentMid = document.getElementById(`eval-${type}-member`).value;
        if (currentMid) checkExistingScore(type, currentMid);
        
    } catch (err) {
        showToast('Lỗi khi lưu hàng loạt!', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// EXPORT EXCEL
// ==========================================
function exportToExcel() {
    showToast('Đang chuẩn bị dữ liệu báo cáo...', 'info');

    // 1. Lấy trạng thái bộ lọc hiện tại để khớp với UI
    const searchTxt = (document.getElementById('search-score') ? document.getElementById('search-score').value : '').toLowerCase();
    const dFilter = state.scoreDeptFilter || 'ALL';

    // 2. Lọc danh sách thành viên giống như bảng đang hiển thị
    const filtered = state.members.filter(m =>
        m.name.toLowerCase().includes(searchTxt) && (dFilter === 'ALL' || m.dept === dFilter)
    );

    if (filtered.length === 0) {
        showToast('Không có dữ liệu để xuất!', 'error');
        return;
    }

    // 3. Tạo nội dung CSV
    const header = ['Họ & Tên', 'Ban', 'Lớp', 'Điểm Project', 'Điểm CLB', 'Điểm Ban', 'Tổng Điểm', 'Xếp Loại'];
    let csvContent = '\uFEFF'; // Thêm BOM để Excel hỗ trợ tiếng Việt (UTF-8)
    csvContent += header.join(',') + '\n';

    filtered.forEach(m => {
        const p = calculateMemberProjectScore(m.id).toFixed(2);
        const c = calculateMemberClubScore(m.id).toFixed(2);
        const de = state.deptScores.find(x => x.memberId === m.id && x.term === state.currentTerm);
        const d = de ? de.totalScore.toFixed(2) : '0.00';
        const t = ((parseFloat(p) + parseFloat(c) + parseFloat(d)) / 3).toFixed(2);

        let gradeVi = 'Cần Cố Gắng';
        if (t >= 8.5) gradeVi = 'Xuất Sắc';
        else if (t >= 7.0) gradeVi = 'Khá';
        else if (t >= 5.0) gradeVi = 'Đạt';

        const row = [
            `"${m.name}"`,
            `"${m.dept}"`,
            `"${m.class || ''}"`,
            p,
            c,
            d,
            t,
            `"${gradeVi}"`
        ];
        csvContent += row.join(',') + '\n';
    });

    // 4. Download an toàn bằng Blob và createObjectURL
    try {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const timestamp = new Date().toISOString().slice(0, 10);
        const filename = `HuReA_BangDiem_${state.currentTerm}_${timestamp}.csv`;

        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();

        // Dọn dẹp
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        showToast('Tải xuống báo cáo Excel thành công!', 'success');
    } catch (err) {
        console.error('Export Error:', err);
        showToast('Lỗi khi tải xuống, vui lòng thử lại.', 'error');
    }
}

/**
 * EXPORT SCOREBOARD PDF
 */
async function exportScoreboardToPDF() {
    showToast('Đang chuẩn bị báo cáo PDF...', 'info');

    // 1. Get filtered data (same as UI)
    const searchTxt = (document.getElementById('search-score') ? document.getElementById('search-score').value : '').toLowerCase();
    const dFilter = state.scoreDeptFilter || 'ALL';

    const filtered = state.members.filter(m =>
        m.name.toLowerCase().includes(searchTxt) && (dFilter === 'ALL' || m.dept === dFilter)
    );

    if (filtered.length === 0) {
        showToast('Không có dữ liệu để xuất!', 'error');
        return;
    }

    const template = document.getElementById('pdf-report-template');
    if (!template) return;

    template.style.display = 'block';

    // 2. Build PDF HTML
    template.innerHTML = `
        <div style="text-align:center; padding-bottom: 20px; border-bottom: 2px solid #0ea5e9; margin-bottom: 40px;">
            <h1 style="font-family:'Times New Roman', serif; font-size: 26px; color: #1e293b; margin: 0; font-weight: bold;">BẢNG ĐIỂM TỔNG HỢP NHÂN SỰ</h1>
            <p style="font-family:'Times New Roman', serif; font-size: 16px; color: #64748b; margin: 5px 0 0;">Câu lạc bộ HuReA - Nhiệm kỳ ${state.currentTerm}</p>
            <p style="font-family:'Times New Roman', serif; font-size: 14px; color: #94a3b8; margin-top: 5px;">Ban: ${dFilter === 'ALL' ? 'Toàn CLB' : dFilter} | Tìm kiếm: ${searchTxt || 'Tất cả'}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-family:'Times New Roman', serif; font-size: 12px;">
            <thead>
                <tr style="background-color: #f8fafc; border-bottom: 2px solid #e2e8f0;">
                    <th style="padding: 12px; text-align: left; border: 1px solid #e2e8f0;">Thành viên</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #e2e8f0;">3. Project</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #e2e8f0;">2. CLB</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #e2e8f0;">1. Ban</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #e2e8f0;">Tổng Điểm</th>
                    <th style="padding: 12px; text-align: center; border: 1px solid #e2e8f0;">Xếp Loại</th>
                </tr>
            </thead>
            <tbody>
                ${filtered.map(member => {
        const mId = member.id;
        const prjScore = calculateMemberProjectScore(mId).toFixed(2);
        const clubScore = calculateMemberClubScore(mId).toFixed(2);
        const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        const deptScore = de ? de.totalScore.toFixed(2) : '0.00';
        const total = ((parseFloat(prjScore) + parseFloat(clubScore) + parseFloat(deptScore)) / 3).toFixed(2);

        let gradeVi = 'Cần Cố Gắng';
        if (total >= 8.5) gradeVi = 'Xuất Sắc';
        else if (total >= 7.0) gradeVi = 'Khá';
        else if (total >= 5.0) gradeVi = 'Đạt';

        return `
                        <tr>
                            <td style="padding: 10px; border: 1px solid #e2e8f0;">
                                <strong style="font-size: 13px;">${member.name}</strong><br>
                                <span style="font-size: 11px; color: #64748b;">Ban ${member.dept} - ${member.class || ''}</span>
                            </td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">${prjScore}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">${clubScore}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #e2e8f0;">${deptScore}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #e2e8f0; font-weight: bold; font-size: 14px; color: #0ea5e9;">${total}</td>
                            <td style="padding: 10px; text-align: center; border: 1px solid #e2e8f0; font-weight: bold;">${gradeVi}</td>
                        </tr>
                    `;
    }).join('')}
            </tbody>
        </table>

        <div style="margin-top: 60px; display: flex; justify-content: space-between; font-family:'Times New Roman', serif;">
            <div style="text-align: center; width: 45%;">
                <p style="margin-bottom: 60px;">Người lập biểu</p>
                <strong>Admin Hệ Thống</strong>
            </div>
            <div style="text-align: center; width: 45%;">
                <p style="margin-bottom: 60px;">Ngày xuất: ${new Date().toLocaleDateString('vi-VN')}</p>
                <strong>Ban Chủ Nhiệm</strong>
            </div>
        </div>
        
        <div style="margin-top: 40px; text-align: center; font-size: 10px; font-family:'Times New Roman', serif; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 10px;">
            Hệ thống Quản trị HuReA Hub • Báo cáo tự động được bảo mật
        </div>
    `;

    // 3. Trigger PDF generation
    const opt = {
        margin: [15, 10],
        filename: `HuReA_BaoCao_Diem_${state.currentTerm}_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(template).save();
        showToast('Xuất báo cáo PDF thành công!', 'success');
    } catch (err) {
        console.error('PDF Export Error:', err);
        showToast('Lỗi khi xuất PDF, vui lòng thử lại.', 'error');
    } finally {
        template.style.display = 'none';
        template.innerHTML = '';
    }
}

// ==========================================
// FEEDBACK (Anonymous - no sender identity)
// ==========================================
function switchFbTab(btn, paneId) {
    document.querySelectorAll('.fb-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.fb-pane').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(paneId).classList.add('active');
    if (paneId === 'fb-pane-confession') renderConfessions();
    else renderFeedbacks();
}

function renderFeedbacks() {
    const grid = document.getElementById('feedback-grid');
    const empty = document.getElementById('feedback-empty');
    const filterPrj = document.getElementById('filter-feedback-prj').value;
    grid.innerHTML = '';
    let fbEvals = state.evaluations.filter(e => e.term === state.currentTerm && e.feedback && String(e.feedback).trim() !== '');
    if (filterPrj !== 'ALL') fbEvals = fbEvals.filter(e => e.prjId === filterPrj);
    if (fbEvals.length === 0) { empty.style.display = 'flex'; grid.style.display = 'none'; return; }
    empty.style.display = 'none';
    grid.style.display = 'grid';
    fbEvals.forEach(fb => {
        const prj = state.projects.find(p => p.id === fb.prjId);
        const prjName = prj ? prj.name : 'Du an an';
        grid.innerHTML += `
            <div class="feedback-card">
                <div class="fb-header">
                    <span><i class="fa-solid fa-folder"></i> ${prjName}</span>
                    <span><i class="fa-solid fa-user-secret"></i> An danh</span>
                </div>
                <div class="fb-content">"${fb.feedback}"</div>
            </div>`;
    });
}

// ==========================================
// CONFESSION
// ==========================================
function submitConfession() {
    const txt = document.getElementById('confession-text').value.trim();
    if (!txt) return alert('Hay viet gi do truoc khi gui!');
    const c = { id: 'cf_' + Date.now(), text: txt, term: state.currentTerm, createdAt: new Date().toLocaleDateString('vi-VN') };
    state.confessions.push(c);
    syncToBackend('save_confession', c);
    document.getElementById('confession-text').value = '';
    renderConfessions();
    alert('Da gui Confession! Cam on ban da chia se.');
}


function renderConfessions() {
    const grid = document.getElementById('confession-grid');
    const empty = document.getElementById('confession-empty');
    grid.innerHTML = '';
    const list = state.confessions.filter(c => !c.term || c.term === state.currentTerm);
    if (list.length === 0) { empty.style.display = 'flex'; return; }
    empty.style.display = 'none';
    list.slice().reverse().forEach(c => {
        const delBtn = state.userRole === 'admin' ? `<button class="conf-del-btn" onclick="deleteSyncedConfession('${c.id}')"><i class="fa-solid fa-trash-can"></i></button>` : '';
        grid.innerHTML += `
            <div class="confession-card">
                ${delBtn}
                <div class="confession-card-text">${c.text}</div>
                <div class="confession-card-meta">
                    <span>~ An danh</span>
                    <span>${c.createdAt || ''}</span>
                </div>
            </div>`;
    });
}

async function deleteSyncedConfession(id) {
    if (!confirm('Xóa confession này vĩnh viễn?')) return;
    try {
        showToast('Đang xóa confession...');
        await syncToBackend('delete_confession', { id });
        state.confessions = state.confessions.filter(c => c.id !== id);
        renderConfessions();
        showToast('Đã xóa confession!', 'success');
    } catch (e) {
        showToast('Không thể xóa confession!', 'error');
    }
}

// ==========================================
// MEMBER SELECT MODAL (for project)
// ==========================================
let msStep = 1;

function openMemberSelectModal(targetTeam = null) {
    state.activeProjectTargetTeam = targetTeam;
    msStep = 1;

    if (targetTeam !== null) {
        // Only pre-select members who are ALREADY in this team
        state.msSelectedIds = state.activeProjectParticipantsSetup
            .filter(p => p.teamName === targetTeam)
            .map(p => p.memberId);
    } else {
        // General selectionpre-selects all
        state.msSelectedIds = state.activeProjectParticipantsSetup.map(p => p.memberId);
    }

    state.msDeptFilter = 'ALL';
    document.getElementById('ms-step-1').style.display = 'block';
    document.getElementById('ms-step-2').style.display = 'none';
    document.getElementById('ms-back-btn').style.display = 'none';
    document.getElementById('ms-next-btn').innerText = 'Tiep theo';
    document.getElementById('ms-title').innerText = targetTeam ? 'Chon Nhan Su Team: ' + targetTeam : 'Chon Nhan Su Tham Gia';
    document.getElementById('ms-search').value = '';
    renderMsGrid();
    openModal('member-select-modal');
}

function setMsFilter(btn, dept) {
    state.msDeptFilter = dept;
    document.querySelectorAll('.ms-filter-bar .filter-quick-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderMsGrid();
}

function toggleMsSelect(mId, card) {
    if (state.msSelectedIds.includes(mId)) {
        state.msSelectedIds = state.msSelectedIds.filter(id => id !== mId);
        card.classList.remove('selected');
    } else {
        state.msSelectedIds.push(mId);
        card.classList.add('selected');
    }
    updateMsCountBadge();
}

function updateMsCountBadge() {
    const badge = document.getElementById('ms-selected-count');
    if (badge) badge.innerText = state.msSelectedIds.length;
}

function renderMsGrid() {
    const search = document.getElementById('ms-search').value.toLowerCase();
    grid.innerHTML = '';
    const filtered = state.members.filter(m =>
        m.name.toLowerCase().includes(search) &&
        (state.msDeptFilter === 'ALL' || m.dept === state.msDeptFilter));
    filtered.forEach(m => {
        const isSel = state.msSelectedIds.includes(m.id);
        const div = document.createElement('div');
        div.className = 'ms-member-card' + (isSel ? ' selected' : '');
        div.onclick = () => toggleMsSelect(m.id, div);
        div.innerHTML = `
            <div class="ms-check"><i class="fa-solid fa-check"></i></div>
            <div class="ms-member-avatar"><i class="fa-solid fa-user"></i></div>
            <div class="ms-member-name">${m.name}</div>
            <div class="ms-member-dept">${m.dept}</div>`;
        grid.appendChild(div);
    });
}

function msNextStep() {
    if (msStep === 1) {
        if (state.msSelectedIds.length === 0) return alert('Hay chon it nhat 1 thanh vien!');
        msStep = 2;
        document.getElementById('ms-step-1').style.display = 'none';
        document.getElementById('ms-step-2').style.display = 'block';
        document.getElementById('ms-back-btn').style.display = 'inline-flex';
        document.getElementById('ms-next-btn').innerText = 'Xac nhan Luu';
        document.getElementById('ms-title').innerText = 'Gan Vi Tri';
        renderMsRoleList();
    } else {
        confirmMsSelection();
    }
}

function msGoBack() {
    msStep = 1;
    document.getElementById('ms-step-1').style.display = 'block';
    document.getElementById('ms-step-2').style.display = 'none';
    document.getElementById('ms-back-btn').style.display = 'none';
    document.getElementById('ms-next-btn').innerText = 'Tiep theo';
    document.getElementById('ms-title').innerText = 'Chon Nhan Su Tham Gia';
}

function renderMsRoleList() {
    const list = document.getElementById('ms-role-list');
    list.innerHTML = '';
    state.msSelectedIds.forEach(mId => {
        const m = state.members.find(x => x.id === mId);
        if (!m) return;
        const existing = state.activeProjectParticipantsSetup.find(p => p.memberId === mId);
        const existingRole = existing?.role || 'CT';
        list.innerHTML += `
            <div class="ms-role-row">
                <div style="flex:1">
                    <strong>${m.name}</strong>
                    <span style="margin-left:8px;font-size:0.8rem;color:#94a3b8">${m.dept}</span>
                </div>
                <div style="display:flex;gap:8px;">
                    <select id="ms-role-${mId}" style="width:160px;padding:8px 12px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-main);color:var(--text-main);">
                        <option value="PL" ${existingRole === 'PL' ? 'selected' : ''}>PL (Project Leader)</option>
                        <option value="TL" ${existingRole === 'TL' ? 'selected' : ''}>TL (Team Leader)</option>
                        <option value="CT" ${existingRole === 'CT' ? 'selected' : ''}>CT (Core Team)</option>
                        <option value="SP" ${existingRole === 'SP' ? 'selected' : ''}>SP (Supporter)</option>
                    </select>
                </div>
            </div>`;
    });
}

function confirmMsSelection() {
    const newSelection = state.msSelectedIds.map(mId => {
        const role = document.getElementById('ms-role-' + mId)?.value || 'CT';
        const m = state.members.find(x => x.id === mId);

        // Find existing data if any (only to potentially keep role if not overriding)
        const existing = state.activeProjectParticipantsSetup.find(p => p.memberId === mId);

        // Team assignment logic: 
        // If we came from a target team, it IS that team. 
        // Otherwise, it's what they had or unassigned.
        let teamName = state.activeProjectTargetTeam !== null ? state.activeProjectTargetTeam : (existing ? existing.teamName : '');

        return { memberId: mId, role, teamName, name: m ? m.name : 'Unknown' };
    });

    if (state.activeProjectTargetTeam !== null) {
        // MERGE: Keep members belonging to OTHER teams, replace members of target team
        const otherTeamsMembers = state.activeProjectParticipantsSetup.filter(p => p.teamName !== state.activeProjectTargetTeam);
        state.activeProjectParticipantsSetup = [...otherTeamsMembers, ...newSelection];
    } else {
        // General selection replaces everything (intended for base project membership)
        state.activeProjectParticipantsSetup = newSelection;
    }

    closeModal('member-select-modal');
    renderProjectTeams();
}

// ==========================================
// EVIDENCE MODULE
// ==========================================
function setEvidenceFilter(btn, dept) {
    state.evidenceDeptFilter = dept;
    document.querySelectorAll('.evidence-filter-bar .filter-quick-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderEvidenceFolders();
}

function renderEvidenceFolders() {
    const grid = document.getElementById('evidence-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Admin Button visibility
    const addBtn = document.getElementById('btn-add-common-folder');
    if (addBtn) addBtn.style.display = state.userRole === 'admin' ? 'inline-flex' : 'none';

    if (state.commonFolders.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column:1/-1; padding:60px 20px;">
                <i class="fa-solid fa-folder-open" style="font-size:3.5rem; color:var(--text-muted); margin-bottom:16px;"></i>
                <p>Chưa có thư mục minh chứng nào được tạo.</p>
                ${state.userRole === 'admin' ? '<p style="font-size:0.9rem; color:var(--primary); margin-top:8px; cursor:pointer;" onclick="openCommonFolderModal()">+ Nhấn để tạo thư mục đầu tiên</p>' : ''}
            </div>`;
        return;
    }

    state.commonFolders.forEach(folder => {
        const folderPhotos = (state.evidenceImages || []).filter(img => img.folderId === folder.id);
        const count = folderPhotos.length;

        const card = document.createElement('div');
        card.className = 'folder-card lux-folder';
        card.style.position = 'relative';
        card.innerHTML = `
            <div class="folder-click-zone" onclick="openEvidenceFolder('${folder.id}')" style="cursor:pointer;">
                <div class="folder-icon"><i class="fa-solid fa-folder"></i></div>
                <div class="folder-name">${folder.name}</div>
                <div class="folder-meta">${count} minh chứng đã nộp</div>
            </div>
            ${state.userRole === 'admin' ? `
            <div class="folder-admin-actions" style="position:absolute; top:12px; right:12px; display:flex; gap:8px;">
                <button class="btn-icon-sm" onclick="editCommonFolder('${folder.id}')" title="Sửa tên"><i class="fa-solid fa-pen"></i></button>
                <button class="btn-icon-sm delete" onclick="deleteCommonFolder('${folder.id}')" title="Xóa thư mục"><i class="fa-solid fa-trash"></i></button>
            </div>` : ''}
        `;
        grid.appendChild(card);
    });
}

function openCommonFolderModal() {
    document.getElementById('cf-id').value = '';
    document.getElementById('cf-name').value = '';
    document.getElementById('cf-modal-title').innerText = 'Tạo Thư mục Chung Mới';
    openModal('common-folder-modal');
}

function editCommonFolder(id) {
    const folder = state.commonFolders.find(f => f.id === id);
    if (!folder) return;
    document.getElementById('cf-id').value = folder.id;
    document.getElementById('cf-name').value = folder.name;
    document.getElementById('cf-modal-title').innerText = 'Chỉnh sửa Thư mục';
    openModal('common-folder-modal');
}

async function saveCommonFolder() {
    const id = document.getElementById('cf-id').value;
    const name = document.getElementById('cf-name').value.trim();
    if (!name) return showToast('Vui lòng nhập tên thư mục!', 'error');

    const folder = {
        id: id || 'cf_' + Date.now(),
        name,
        term: state.currentTerm,
        _timestamp: new Date().toISOString()
    };

    try {
        await syncToBackend('save_common_folder', folder);
        if (id) {
            state.commonFolders = state.commonFolders.map(f => f.id === id ? folder : f);
        } else {
            state.commonFolders.push(folder);
        }
        closeModal('common-folder-modal');
        renderEvidenceFolders();
        showToast('Đã lưu thư mục thành công!', 'success');
    } catch (e) {
        showToast('Lỗi khi lưu thư mục!', 'error');
    }
}

async function deleteCommonFolder(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa thư mục này? Toàn bộ liên kết ảnh trong thư mục này sẽ bị ảnh hưởng.')) return;
    try {
        await syncToBackend('delete_common_folder', { id });
        state.commonFolders = state.commonFolders.filter(f => f.id !== id);
        renderEvidenceFolders();
        showToast('Đã xóa thư mục!', 'success');
    } catch (e) {
        showToast('Không thể xóa thư mục!', 'error');
    }
}

function openEvidenceFolder(folderId) {
    state.currentCommonFolderId = folderId;
    const folder = state.commonFolders.find(f => f.id === folderId);
    if (!folder) return;

    // Reset temporary queue
    state.tempEvidenceQueue = [];

    document.getElementById('evidence-folder-title').innerText = 'Thư mục: ' + folder.name;

    // Reset filters
    if (document.getElementById('cv-search-files')) document.getElementById('cv-search-files').value = '';
    if (document.getElementById('cv-filter-dept')) document.getElementById('cv-filter-dept').value = 'ALL';

    // Show view toggle only for admin
    const viewToggle = document.getElementById('cv-view-toggle');
    if (viewToggle) viewToggle.style.display = state.userRole === 'admin' ? 'flex' : 'none';

    renderEvidencePhotos();
    openModal('evidence-folder-modal');
}

function setEvidenceViewMode(mode) {
    state.evidenceViewMode = mode;
    localStorage.setItem('hurea_evidence_view', mode);
    renderEvidencePhotos();
}

function renderEvidencePhotos() {
    const folderId = state.currentCommonFolderId;
    const grid = document.getElementById('evidence-photo-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Apply view mode class
    grid.className = 'evidence-photo-grid view-' + (state.evidenceViewMode || 'grid');

    // Update toggle button states
    document.querySelectorAll('.toggle-btn-v2').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById('cv-btn-' + (state.evidenceViewMode || 'grid'));
    if (activeBtn) activeBtn.classList.add('active');

    const searchInput = document.getElementById('cv-search-files');
    const deptInput = document.getElementById('cv-filter-dept');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const dept = deptInput ? deptInput.value : 'ALL';

    // Filter synced photos
    let syncedPhotos = (state.evidenceImages || []).filter(img => img.folderId === folderId);
    syncedPhotos = syncedPhotos.filter(img => {
        const matchesSearch = !search || (img.filename || '').toLowerCase().includes(search);
        const matchesDept = dept === 'ALL' || (img.filename || '').includes(`_${dept}`);
        return matchesSearch && matchesDept;
    });

    syncedPhotos.forEach((img) => {
        const div = document.createElement('div');
        div.className = 'evidence-photo-item';
        const caption = img.filename ? `<div class="photo-caption">${img.filename}</div>` : '';

        // Ownership check: only uploader or admin can delete
        const canDelete = state.userRole === 'admin' || (state.currentUser && img.memberId === state.currentUser.id);
        const delBtn = canDelete ? `<button class="del-photo-btn" onclick="deleteSyncedEvidenceImage('${img.id}')"><i class="fa-solid fa-trash-can"></i></button>` : '';

        div.innerHTML = `
            <img src="${img.image}" alt="Evidence">
            <div class="photo-info-stack" style="flex:1;">
                ${caption}
                <div class="photo-badge">Đã đồng bộ ${img.memberId === state.currentUser?.id ? '(Của bạn)' : ''}</div>
            </div>
            ${delBtn}
        `;
        grid.appendChild(div);
    });

    // Render temporary queue (filtered too)
    if (state.tempEvidenceQueue && state.tempEvidenceQueue.length > 0) {
        state.tempEvidenceQueue.forEach((item, idx) => {
            const matchesSearch = !search || (item.filename || '').toLowerCase().includes(search);
            const matchesDept = dept === 'ALL' || (item.filename || '').includes(`_${dept}`);
            if (!matchesSearch || !matchesDept) return;

            const div = document.createElement('div');
            div.className = 'evidence-photo-item new-upload';
            div.innerHTML = `
                <img src="${item.image}" alt="New Preview">
                <div class="photo-info-stack" style="flex:1;">
                    <div class="photo-caption">${item.filename}</div>
                    <div class="photo-badge new">Chưa lưu</div>
                </div>
                <button class="del-photo-btn" onclick="deleteFromTempQueue(${idx})"><i class="fa-solid fa-xmark"></i></button>
            `;
            grid.appendChild(div);
        });
    }

    if (grid.innerHTML === '') {
        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--text-muted);">Không tìm thấy minh chứng nào phù hợp</div>';
    }
}

async function deleteSyncedEvidenceImage(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa minh chứng này vĩnh viễn?')) return;
    try {
        showToast('Đang xóa minh chứng...');
        await syncToBackend('delete_evidence_image', { id });
        state.evidenceImages = state.evidenceImages.filter(img => img.id !== id);
        renderEvidencePhotos();
        renderEvidenceFolders();
        showToast('Đã xóa minh chứng!', 'success');
    } catch (e) {
        showToast('Không thể xóa minh chứng!', 'error');
    }
}

function deleteFromTempQueue(idx) {
    state.tempEvidenceQueue.splice(idx, 1);
    renderEvidencePhotos();
}

function handleEvidenceUpload(inp) {
    const folderId = state.currentCommonFolderId;
    if (!state.currentUser) return showToast('Vui lòng đăng nhập để nộp minh chứng!', 'error');
    if (!state.tempEvidenceQueue) state.tempEvidenceQueue = [];

    const files = Array.from(inp.files);
    let loaded = 0;

    // Auto-generate filename: [Full Name]_[Dept]
    const m = state.currentUser;
    const autoFilename = `${m.name}_${m.dept}`;

    showToast(`Đang xử lý ${files.length} ảnh...`);

    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = e => {
            compressImage(e.target.result, 600, 0.7, (compressed) => {
                state.tempEvidenceQueue.push({
                    image: compressed,
                    filename: autoFilename,
                    uploaderId: m.id
                });
                loaded++;
                if (loaded === files.length) {
                    renderEvidencePhotos();
                    showToast('Đã chuẩn bị xong. Nhấn "Lưu & Sync" để nộp chính thức.', 'info');
                }
            });
        };
        reader.readAsDataURL(file);
    });
    inp.value = '';
}

async function saveEvidenceFolder() {
    const folderId = state.currentCommonFolderId;
    if (!state.tempEvidenceQueue || state.tempEvidenceQueue.length === 0) {
        return showToast('Không có ảnh mới để lưu!', 'warning');
    }

    const folder = state.commonFolders.find(f => f.id === folderId);
    showToast('Đang nộp minh chứng lên hệ thống...');

    try {
        const promises = state.tempEvidenceQueue.map(item => {
            const payload = {
                id: 'evi_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                memberId: item.uploaderId,
                folderId: folderId,
                folderLabel: folder.name,
                term: state.currentTerm,
                filename: item.filename,
                image: item.image,
                createdAt: new Date().toISOString()
            };
            return syncToBackend('save_evidence_image', payload).then(res => {
                if (res.status === 'success') {
                    // Update local state evidenceImages to reflect the sync
                    if (!state.evidenceImages) state.evidenceImages = [];
                    state.evidenceImages.push(payload);
                }
            });
        });

        await Promise.all(promises);
        state.tempEvidenceQueue = []; // Clear queue
        renderEvidencePhotos();
        renderEvidenceFolders();
        showToast('Nộp minh chứng thành công! Cảm ơn bạn.', 'success');
        closeModal('evidence-folder-modal');
    } catch (e) {
        showToast('Lỗi khi nộp minh chứng. Vui lòng thử lại.', 'error');
        console.error(e);
    }
}

// ==========================================
// PHOTOBOOTH
// ==========================================
let ptbStream = null;
let ptbFilter = '';
let ptbShots = [];
let ptbShooting = false;

function initPhotobooth() {
    // Camera starts when user navigates to view
}

async function startCamera() {
    if (ptbStream) return;
    try {
        ptbStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
        const video = document.getElementById('ptb-video');
        if (video) { video.srcObject = ptbStream; }
    } catch (e) {
        console.warn('Camera not available:', e.message);
    }
}

function setPtbFilter(btn, filterClass) {
    ptbFilter = filterClass;
    document.querySelectorAll('.ptb-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const video = document.getElementById('ptb-video');
    video.className = filterClass ? filterClass : '';
}

async function startPtbCountdown() {
    if (ptbShooting) return;
    if (ptbShots.length >= 3) return alert('Da du 3 anh! Bam "Chup lai" de chup moi.');
    ptbShooting = true;
    document.getElementById('ptb-shoot-btn').disabled = true;
    const cd = document.getElementById('ptb-countdown');
    cd.style.display = 'flex';
    for (let i = 3; i >= 1; i--) {
        cd.innerText = i;
        await sleep(1000);
    }
    cd.style.display = 'none';
    capturePhoto();
    ptbShooting = false;
    document.getElementById('ptb-shoot-btn').disabled = false;
}

function capturePhoto() {
    const video = document.getElementById('ptb-video');
    const canvas = document.getElementById('ptb-canvas');
    const flash = document.getElementById('ptb-flash');
    const W = 640, H = 480;
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.translate(W, 0); ctx.scale(-1, 1);
    if (ptbFilter === 'filter-bw') { ctx.filter = 'grayscale(1) contrast(1.1)'; }
    else if (ptbFilter === 'filter-vintage') { ctx.filter = 'sepia(0.5) contrast(1.1) brightness(0.9)'; }
    else if (ptbFilter === 'filter-warm') { ctx.filter = 'saturate(1.3) hue-rotate(-10deg) brightness(1.05)'; }
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    ptbShots.push(dataUrl);
    // Flash effect
    flash.style.opacity = '0.8';
    setTimeout(() => { flash.style.opacity = '0'; }, 150);
    // Update thumb
    const idx = ptbShots.length - 1;
    const thumb = document.getElementById('ptb-thumb-' + idx);
    if (thumb) {
        const tCtx = thumb.getContext('2d');
        const img = new Image();
        img.onload = () => tCtx.drawImage(img, 0, 0, 90, 68);
        img.src = dataUrl;
        thumb.classList.add('taken');
    }
    document.getElementById('ptb-count').innerText = ptbShots.length;
    if (ptbShots.length === 3) { renderPtbStrip(); document.getElementById('ptb-download-btn').style.display = 'flex'; }
}

function renderPtbStrip() {
    const strip = document.getElementById('ptb-strip');
    strip.innerHTML = '';
    ptbShots.forEach((src, i) => {
        const img = document.createElement('img');
        img.src = src;
        strip.appendChild(img);
        const lbl = document.createElement('div');
        lbl.className = 'ptb-strip-label';
        lbl.innerText = 'HuReA #' + (i + 1);
        strip.appendChild(lbl);
    });
}

function downloadStrip() {
    if (ptbShots.length < 3) return alert('Can chup du 3 anh!');
    const W = 260, photoH = 195, lblH = 24, padding = 12;
    const H = padding + (photoH + lblH + 8) * 3 + padding + 40;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    let y = padding;
    const loads = ptbShots.map((src, i) => new Promise(res => {
        const img = new Image();
        img.onload = () => {
            ctx.drawImage(img, padding, y, W - padding * 2, photoH);
            ctx.fillStyle = '#555555';
            ctx.font = '11px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('HuReA #' + (i + 1), W / 2, y + photoH + 18);
            y += photoH + lblH + 8;
            res();
        };
        img.src = src;
    }));
    Promise.all(loads).then(() => {
        ctx.fillStyle = '#0D8ABC';
        ctx.font = 'bold 13px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('HuReA Photobooth', W / 2, H - 14);
        const link = document.createElement('a');
        link.download = 'HuReA-PhotoStrip-' + Date.now() + '.png';
        link.href = c.toDataURL('image/png');
        link.click();
    });
}

function resetPhotobooth() {
    ptbShots = [];
    document.getElementById('ptb-count').innerText = '0';
    document.getElementById('ptb-strip').innerHTML = '<div style="color:#999;font-size:0.85rem;text-align:center;padding:20px">Chup 3 anh de tao strip</div>';
    document.getElementById('ptb-download-btn').style.display = 'none';
    [0, 1, 2].forEach(i => {
        const thumb = document.getElementById('ptb-thumb-' + i);
        if (thumb) {
            const ctx = thumb.getContext('2d');
            ctx.clearRect(0, 0, 90, 68);
            thumb.classList.remove('taken');
        }
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==========================================
// CINEMATIC 360 EVAL
// ==========================================
let cine_currentStep = 1, cine_totalSteps = 1, cine_targets = [];

function renderEvaluationTasks() {
    const pendingList = document.getElementById('eval-pending-tasks');
    const historyList = document.getElementById('eval-completed-history');
    if (!pendingList || !historyList) return;

    if (!state.currentUser) {
        pendingList.innerHTML = '<div class="empty-state">Vui lòng đăng nhập.</div>';
        historyList.innerHTML = '<div class="empty-state">Vui lòng đăng nhập.</div>';
        return;
    }

    const isAdmin = state.userRole === 'admin';
    const myProjects = state.projects.filter(p => {
        if (isAdmin) return true;
        const parts = ensureArray(p.participants);
        const myId = String(state.currentUser.id).trim();
        return parts.some(pt => String(pt.memberId).trim() === myId);
    });

    if (myProjects.length === 0) {
        pendingList.innerHTML = '<div class="empty-state">Không có nhiệm vụ.</div>';
        historyList.innerHTML = '<div class="empty-state">Không có lịch sử.</div>';
        return;
    }

    pendingList.innerHTML = '';
    historyList.innerHTML = '';

    const exportBtn = document.getElementById('btn-export-incomplete-evals');
    if (exportBtn) exportBtn.style.display = isAdmin ? 'block' : 'none';


    const myId = String(state.currentUser.id).trim();

    myProjects.forEach(p => {
        const prjIdStr = String(p.id).trim();
        const myIdStr = String(state.currentUser.id).trim();

        if (isAdmin) {
            // Admin View: Monitoring Progress
            const participants = ensureArray(p.participants);
            const totalRequired = participants.length;

            // Count unique raters who have submitted at least one record for this project
            state.evaluations.forEach(ev => {
                const evPrj = String(ev.prjId || ev.prjid).trim();
                if (evPrj === prjIdStr) {
                    submittedRaters.add(String(ev.raterId || ev.raterid).trim());
                }
            });
            const doneCount = submittedRaters.size;

            const card = document.createElement('div');
            card.className = 'eval-task-card admin-monitor';
            card.innerHTML = `
                <div class="task-info">
                    <div class="task-project-name">${p.name}</div>
                    <div class="task-status-tag" style="background:rgba(14,165,233,0.1); color:#0ea5e9;">
                        <i class="fa-solid fa-users"></i> Theo dõi tiến độ
                    </div>
                    <div style="margin-top:16px; font-size:0.9rem; color:#94a3b8;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            <span>Hoàn thành:</span>
                            <span style="color:#f8fafc; font-weight:700;">${doneCount} / ${totalRequired}</span>
                        </div>
                        <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:3px; overflow:hidden;">
                            <div style="width:${(doneCount / totalRequired) * 100}%; height:100%; background:var(--primary); transition:width 1s ease;"></div>
                        </div>
                    </div>
                </div>
            `;
            pendingList.appendChild(card);
        } else {
            // Member View: Actionable Tasks & History
            const evalRecord = state.evaluations.find(ev =>
                String(ev.prjId || ev.prjid).trim() === prjIdStr &&
                String(ev.raterId || ev.raterid).trim() === myIdStr
            );

            if (!evalRecord) {
                const card = document.createElement('div');
                card.className = 'eval-task-card pending';
                card.innerHTML = `
                    <div class="task-info">
                        <div class="task-project-name">${p.name}</div>
                        <div class="task-status-tag"><i class="fa-solid fa-rocket"></i> Sẵn sàng</div>
                    </div>
                    <button class="btn-primary" onclick="startCinematicEvaluation('${p.id}')">
                        Bắt đầu đánh giá
                    </button>
                `;
                pendingList.appendChild(card);
            } else {
                const row = document.createElement('div');
                row.className = 'history-item';
                row.innerHTML = `
                    <div class="history-info">
                        <div class="task-status-tag completed"><i class="fa-solid fa-check-circle"></i></div>
                        <div>
                            <div class="history-project-name">${p.name}</div>
                            <div class="history-date">Hoàn thành: ${new Date(evalRecord.createdAt).toLocaleDateString()}</div>
                        </div>
                    </div>
                    <div class="history-actions">
                        <button class="btn-lux-secondary" onclick="startCinematicEvaluation('${p.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Xem / Sửa
                        </button>
                    </div>
                `;
                historyList.appendChild(row);
            }
        }
    });

    if (pendingList.innerHTML === '') pendingList.innerHTML = isAdmin ? '' : '<div class="empty-state">Tất cả bài tập đã hoàn thành! 🎉</div>';
    if (historyList.innerHTML === '') historyList.innerHTML = isAdmin ? '' : '<div class="empty-state">Chưa có bài đánh giá nào được gửi.</div>';
}

function startCinematicEvaluation(prjId) {
    if (!state.currentUser) return alert('Vui lòng đăng nhập!');

    document.getElementById('eval-prj-id').value = prjId;
    document.getElementById('eval-prj-rater').value = state.currentUser.id;

    const prj = state.projects.find(x => x.id === prjId);
    if (!prj) return;

    const participants = ensureArray(prj.participants);
    const raterId = state.currentUser.id;
    const raterPt = participants.find(pt => String(pt.memberId) === String(raterId));
    
    if (!raterPt) {
        alert('Bạn không có tên trong danh sách tham gia dự án này!');
        return;
    }

    const raterTeam = raterPt.teamName;
    const raterRole = raterPt.role || 'Thành viên';
    
    const checkPL = (r) => r === 'PL' || r === 'Project Leader';
    const checkLeader = (r) => r && r.toLowerCase().includes('leader') && !checkPL(r);
    const hasPL = participants.some(pt => checkPL(pt.role));

    let targets = [];

    if (checkPL(raterRole)) {
        // Project Leader: Self + All Leaders
        targets = participants.filter(pt => {
            const isSelf = pt.memberId === raterId;
            const isAnyLeader = checkLeader(pt.role);
            return isSelf || isAnyLeader;
        });
    } else if (checkLeader(raterRole)) {
        // Leader: Self + Other Leaders + Teammates (CTs in same team) + PL
        targets = participants.filter(pt => {
            const isSelf = pt.memberId === raterId;
            const isOtherLeader = checkLeader(pt.role) && pt.memberId !== raterId;
            const isTeammate = pt.teamName === raterTeam && !checkLeader(pt.role) && !checkPL(pt.role);
            const isMyPL = checkPL(pt.role);
            return isSelf || isOtherLeader || isTeammate || isMyPL;
        });
    } else {
        // Core Team: Self + Leader of their team + Teammates (CTs in same team)
        targets = participants.filter(pt => {
            const isSelf = pt.memberId === raterId;
            const isMyLeader = pt.teamName === raterTeam && checkLeader(pt.role);
            const isTeammate = pt.teamName === raterTeam && !checkLeader(pt.role) && !checkPL(pt.role) && pt.memberId !== raterId;
            return isSelf || isMyLeader || isTeammate;
        });
    }

    cine_targets = targets;

    if (cine_targets.length === 0) return alert('Không có ai để đánh giá trong dự án này!');
    document.getElementById('cine-project-name').innerText = 'Đánh giá dự án: ' + prj.name;
    cine_currentStep = 1;
    cine_totalSteps = cine_targets.length + 1;

    renderCineSteps();
    document.getElementById('eval-project-setup-view').style.display = 'none';
    document.getElementById('cinematic-eval-inline').style.display = 'block';
    updateCineUI();
}

function closeCinematicEval() {
    document.getElementById('cinematic-eval-inline').style.display = 'none';
    document.getElementById('eval-project-setup-view').style.display = 'block';
    document.getElementById('cine-success-overlay').style.display = 'none';
}

function renderCineSteps() {
    const c = document.getElementById('cine-form-steps-container');
    c.innerHTML = '';
    cine_targets.forEach((pt, idx) => {
        const m = state.members.find(x => x.id === pt.memberId);
        const name = m ? m.name : 'Unknown';
        const stepNum = idx + 1;
        const isSelf = pt.memberId === document.getElementById('eval-prj-rater').value;
        const targetLabel = isSelf ? `<span style="color:#10b981">Bản thân (Self-Eval)</span>` : `<span style="color:#f59e0b">${name}</span>`;

        // Find existing evaluation for this target in this project
        const prjId = document.getElementById('eval-prj-id').value;
        const raterId = document.getElementById('eval-prj-rater').value;
        const existing = (state.evaluations || []).find(ev =>
            String(ev.prjId || ev.prjid).trim() === String(prjId).trim() &&
            String(ev.raterId || ev.raterid).trim() === String(raterId).trim() &&
            String(ev.targetId || ev.targetid).trim() === String(pt.memberId).trim()
        );

        c.innerHTML += `<section class="cine-section" data-step="${stepNum}">
            <div class="cine-sec-header">
                <span class="cine-step-badge">${stepNum}</span>
                <h2 class="cine-sec-title">Đánh giá: ${targetLabel} <span style="font-size:1rem;color:#94a3b8">(${pt.role})</span></h2>
            </div>
            <input type="hidden" name="targetId_${stepNum}" value="${pt.memberId}">
            <div class="cine-eval-loop">
                ${renderRangeItem(stepNum, 'c1', 'Nhiệt tình, chủ động trong công việc', existing?.c1 || 5)}
                ${renderRangeItem(stepNum, 'c2', 'Trách nhiệm, đúng deadline', existing?.c2 || 5)}
                ${renderRangeItem(stepNum, 'c3', 'Tư duy tích cực, đề xuất ý kiến', existing?.c3 || 5)}
                ${renderRangeItem(stepNum, 'c4', 'Trình độ, chuyên môn', existing?.c4 || 5)}
                ${renderRangeItem(stepNum, 'c5', 'Đầu tư nghiên cứu, học hỏi', existing?.c5 || 5)}
                ${renderRangeItem(stepNum, 'c6', 'Mức độ hoàn thành công việc', existing?.c6 || 5)}
                ${renderRangeItem(stepNum, 'c7', 'Quan hệ với Care/Leader/Thành viên CT', existing?.c7 || 5)}
            </div>
            <div class="cine-footer-nav">
                ${stepNum > 1 ? '<button type="button" class="cine-btn cine-btn-secondary" onclick="cinePrev()">Quay lại</button>' : '<div></div>'}
                <button type="button" class="cine-btn cine-btn-primary" onclick="cineNext(${stepNum})">Người tiếp theo</button>
            </div>
        </section>`;

        // If first step (self evaluation), we also care about general feedback
        if (idx === 0) {
            cine_prefilled_feedback = existing?.feedback || '';
        }
    });
    const finalStep = cine_totalSteps;
    c.innerHTML += `<section class="cine-section" data-step="${finalStep}">
        <div class="cine-sec-header">
            <span class="cine-step-badge"><i class="fa-solid fa-flag-checkered"></i></span>
            <h2 class="cine-sec-title">Góp ý Tổng quan Dự án</h2>
        </div>
        <div style="margin-bottom:32px;">
            <label class="cine-label-text">Góp ý ẩn danh (cho BTC / Ban / Dự án)</label>
            <textarea id="cine-final-feedback" rows="4" placeholder="Những suy nghĩ, cảm nhận của bạn... Sẽ hoàn toàn ẩn danh.">${cine_prefilled_feedback || ''}</textarea>
        </div>
        <div class="cine-footer-nav">
            <button type="button" class="cine-btn cine-btn-secondary" onclick="cinePrev()">Quay lại</button>
            <button type="button" class="cine-btn cine-btn-primary" onclick="submitCinematicEvaluation()">Gửi Toàn Bộ Đánh Giá</button>
        </div>
    </section>`;

}

function renderRangeItem(stepNum, critKey, label, initialValue = 6) {
    const val5 = Math.max(1, Math.min(5, Math.round(initialValue / 2)));
    const name = `target_${stepNum}_${critKey}`;
    
    let html = `
    <div class="rating-item">
        <div class="rating-label" style="margin-bottom: 8px;">
            <span style="font-weight:600; font-size: 0.95rem; color: var(--text-main);">${label}</span>
        </div>
        <div class="rating-group">`;
        
    for (let i = 1; i <= 5; i++) {
        const checked = i === val5 ? 'checked' : '';
        html += `
            <div class="rating-opt">
                <input type="radio" id="radio_${stepNum}_${critKey}_${i}" name="${name}" value="${i}" ${checked}>
                <label for="radio_${stepNum}_${critKey}_${i}">
                    <span class="point-val">${i}</span>
                </label>
            </div>`;
    }
    
    html += `</div></div>`;
    return html;
}

function updateCineUI() {
    document.querySelectorAll('.cine-section').forEach(s => s.classList.remove('active'));
    const active = document.querySelector('.cine-section[data-step="' + cine_currentStep + '"]');
    if (active) active.classList.add('active');
    const progress = (cine_currentStep / cine_totalSteps) * 100;
    document.getElementById('lux-progress-bar').style.width = progress + '%';
    document.getElementById('lux-step-indicator').innerText = 'BƯỚC ' + cine_currentStep + ' / ' + cine_totalSteps;
    document.getElementById('cinematic-eval-inline').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function cineNext() { cine_currentStep++; updateCineUI(); }
function cinePrev() { if (cine_currentStep > 1) { cine_currentStep--; updateCineUI(); } }

function cineAutofill(stepNum) {
    const sec = document.querySelector('.cine-section[data-step="' + stepNum + '"]');
    if (!sec) return;
    sec.querySelectorAll('input[type=range]').forEach(s => {
        const v = Math.floor(Math.random() * 3) + 8;
        s.value = v;
        s.parentElement.querySelector('.rating-val-display').innerText = v;
    });
}

async function submitCinematicEvaluation() {
    const term = state.currentTerm;
    const prjId = document.getElementById('eval-prj-id').value;
    const raterId = document.getElementById('eval-prj-rater').value;
    const prj = state.projects.find(x => x.id === prjId);
    if (!prj) return;

    const participants = ensureArray(prj.participants);
    const raterRole = participants.find(x => x.memberId === raterId)?.role || 'Unknown';
    const commonFeedback = (document.getElementById('cine-final-feedback')?.value || '').trim();

    const overlay = document.getElementById('cine-success-overlay');
    const card = overlay.querySelector('.cine-success-card');

    // Show Loading State
    overlay.style.display = 'flex';
    card.innerHTML = `
        <div class="loader-v2" style="margin-bottom:20px;"></div>
        <h2 id="cine-sync-status">Đang đồng bộ...</h2>
        <p>Hệ thống đang gửi dữ liệu lên Google Sheets. Vui lòng không đóng tab.</p>
    `;

    const allRecords = [];
    cine_targets.forEach((pt, idx) => {
        const sn = idx + 1;
        const getVal = (crit) => {
            const el = document.querySelector(`input[name="target_${sn}_${crit}"]:checked`);
            return (parseFloat(el ? el.value : 3)) * 2;
        };

        const c1 = getVal('c1');
        const c2 = getVal('c2');
        const c3 = getVal('c3');
        const c4 = getVal('c4');
        const c5 = getVal('c5');
        const c6 = getVal('c6');
        const c7 = getVal('c7');
        const score = (c1 + c2 + c3 + c4 + c5 + c6 + c7) / 7;
        const record = {
            id: `ev_${prjId}_${raterId}_${pt.memberId}`,
            term, prjId, raterId, targetId: pt.memberId,
            raterRole, targetRole: pt.role,
            c1, c2, c3, c4, c5, c6, c7, score,
            feedback: idx === 0 ? commonFeedback : '',
            createdAt: new Date().toISOString()
        };

        // Update local state
        const existingIdx = state.evaluations.findIndex(e => e.id === record.id);
        if (existingIdx > -1) {
            state.evaluations[existingIdx] = record;
        } else {
            state.evaluations.push(record);
        }

        allRecords.push(record);
    });

    try {
        await syncToBackend('save_eval_batch', { evals: allRecords });

        // Success State
        card.innerHTML = `
            <i class="fa-solid fa-circle-check checkmark-icon"></i>
            <h2>Đã hoàn thành!</h2>
            <p>Dữ liệu đã được nạp thành công vào Google Sheets.</p>
            <button class="btn-secondary" style="margin-top:24px;"
                onclick="closeCinematicEval()">Hoàn tất &amp; Đóng</button>
        `;

        renderEvaluationTasks();
        switchEvalTab('eval-project');
        updateDashboardStats();
        calculateFinalScores();
    } catch (err) {
        console.error('Eval Sync Error:', err);
        card.innerHTML = `
            <i class="fa-solid fa-circle-exclamation" style="font-size:3rem; color:#ef4444; margin-bottom:16px;"></i>
            <h2>Lỗi đồng bộ</h2>
            <p>Có lỗi xảy ra khi lưu dữ liệu. Vui lòng thử lại sau.</p>
            <button class="btn-secondary" style="margin-top:24px;"
                onclick="overlay.style.display='none'">Quay lại</button>
        `;
    }
}
// ==========================================
// IMAGE & BUG REPORT MODULE
// ==========================================
function handleImagePreview(input, previewId) {
    const file = input.files[0];
    const previewArea = document.getElementById(previewId);
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        // Nén ảnh xuống tối đa 400px, chất lượng 0.5 để đảm bảo Base64 chuỗi ảnh < 50,000 ký tự (Giới hạn của Google Sheets cell)
        compressImage(e.target.result, 400, 0.5, (compressedData) => {
            previewArea.innerHTML = `
                <div class="preview-img-wrapper">
                    <img src="${compressedData}">
                    <button class="remove-img-btn" onclick="removeImagePreview('${previewId}', '${input.id}')">&times;</button>
                </div>`;
            previewArea.style.display = 'block';
        });
    };
    reader.readAsDataURL(file);
}

function removeImagePreview(previewId, inputId) {
    const previewArea = document.getElementById(previewId);
    document.getElementById(inputId).value = '';

    if (previewId === 'bug-preview') {
        previewArea.innerHTML = `
            <div class="drop-circle">
                <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div class="drop-text">
                <strong>Nhấp để tải ảnh lên</strong>
                <span>Hỗ trợ định dạng JPG, PNG</span>
            </div>`;
    } else if (previewId === 'ann-preview') {
        previewArea.innerHTML = `
            <div class="drop-circle" style="width:40px;height:40px;font-size:1rem;">
                <i class="fa-solid fa-cloud-arrow-up"></i>
            </div>
            <div class="drop-text" style="flex-direction:row;align-items:center;gap:12px;">
                <strong>Nhấn để tải ảnh</strong>
            </div>`;
        previewArea.style.display = 'flex';
    }
}

function compressImage(base64, maxWidth, quality, callback) {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        callback(canvas.toDataURL('image/jpeg', quality));
    };
}

async function submitBugReport() {
    const title = document.getElementById('bug-title').value;
    const priority = document.getElementById('bug-priority').value;
    const area = document.getElementById('bug-area').value;
    const desc = document.getElementById('bug-desc').value;
    const imgPreview = document.querySelector('#bug-preview img');
    const screenshot = imgPreview ? imgPreview.src : null;

    if (!title || !desc) return alert('Vui lòng nhập tiêu đề và mô tả lỗi!');

    const bug = {
        id: 'bug_' + Date.now(),
        title, priority, area, desc, screenshot,
        status: 'OPEN',
        createdAt: new Date().toLocaleDateString('vi-VN'),
        term: state.currentTerm
    };

    state.bugReports.push(bug);
    syncToBackend('save_bug_report', bug);

    // Reset form
    document.getElementById('bug-title').value = '';
    document.getElementById('bug-area').value = '';
    document.getElementById('bug-desc').value = '';
    removeImagePreview('bug-preview', 'bug-screenshot');

    renderBugReports();
    alert('Báo cáo lỗi đã được gửi. Cảm ơn bạn!');
}

function renderBugReports() {
    const list = document.getElementById('bug-list');
    if (!list) return;
    list.innerHTML = '';

    if (state.bugReports.length === 0) {
        list.innerHTML = `
            <div class="empty-feed">
                <i class="fa-solid fa-clipboard-check"></i>
                <p>Tạm thời chưa có báo cáo nào. Hệ thống của bạn đang rất ổn định!</p>
            </div>`;
        return;
    }

    state.bugReports.slice().reverse().forEach(bug => {
        const priorityLabel = bug.priority === 'HIGH' ? 'Nghiêm trọng' : (bug.priority === 'MEDIUM' ? 'Trung bình' : 'Thấp');
        list.innerHTML += `
            <div class="bug-item prio-${bug.priority}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                    <h5 style="color:var(--text-main);margin:0;">${bug.title}</h5>
                    <span class="bug-status-tag prio-${bug.priority}">${priorityLabel}</span>
                </div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:10px;display:flex;gap:12px;">
                    <span><i class="fa-solid fa-location-dot" style="margin-right:4px;"></i> ${bug.area || 'Hệ thống'}</span>
                    <span><i class="fa-solid fa-circle-info" style="margin-right:4px;"></i> ${bug.status}</span>
                </div>
                <p style="font-size:0.85rem;line-height:1.5;color:var(--text-muted);margin-bottom:12px;">${bug.desc}</p>
                ${bug.screenshot ? `<div style="margin-top:12px;"><img src="${bug.screenshot}" style="width:100%;max-height:180px;object-fit:cover;border-radius:12px;border:1px solid rgba(0,0,0,0.1);"></div>` : ''}
                <div class="bug-meta">
                    <span style="opacity:0.6;"><i class="fa-solid fa-calendar-day"></i> ${bug.createdAt}</span>
                    <span style="color:var(--primary);cursor:pointer;font-weight:600;" onclick="openBugDetail('${bug.id}')"><i class="fa-solid fa-circle-chevron-right"></i> Chi tiết</span>
                </div>
            </div>`;
    });
}

function openBugDetail(bugId) {
    const bug = state.bugReports.find(b => b.id === bugId);
    if (!bug) return;

    const modal = document.getElementById('bug-detail-modal');
    const content = document.getElementById('bug-detail-content');
    if (!modal || !content) return;

    const priorityLabel = bug.priority === 'HIGH' ? 'Nghiêm trọng' : (bug.priority === 'MEDIUM' ? 'Trung bình' : 'Thấp');

    content.innerHTML = `
        <div class="bug-detail-header">
            <div style="flex:1;">
                <h3 style="margin-bottom:8px;font-size:1.4rem;">${bug.title}</h3>
                <div style="display:flex;gap:12px;font-size:0.85rem;align-items:center;">
                    <span class="bug-status-tag prio-${bug.priority}">${priorityLabel}</span>
                    <span style="color:var(--text-muted);display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-layer-group"></i> ${bug.area || 'Hệ thống'}</span>
                    <span style="color:var(--text-muted);display:flex;align-items:center;gap:4px;"><i class="fa-solid fa-clock"></i> ${bug.createdAt}</span>
                </div>
            </div>
            <div class="bug-detail-status">
                <label style="font-size:0.75rem;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:6px;">Trạng thái</label>
                <div style="font-weight:700;color:var(--primary);">${bug.status}</div>
            </div>
        </div>

        <div class="bug-detail-body">
            <h4 style="margin-bottom:12px;color:var(--text-main);">Mô tả chi tiết</h4>
            <p style="white-space:pre-wrap;line-height:1.6;color:var(--text-muted);">${bug.desc}</p>
            
            ${bug.screenshot ? `
            <h4 style="margin-top:24px;margin-bottom:12px;color:var(--text-main);">Ảnh chụp màn hình</h4>
            <div class="bug-screenshot-detail">
                <img src="${bug.screenshot}" style="width:100%;border-radius:12px;border:1px solid var(--border-color);">
            </div>` : ''}
        </div>

        <div class="bug-detail-admin" style="display:${state.userRole === 'admin' ? 'block' : 'none'};margin-top:32px;padding-top:24px;border-top:1px solid var(--border-color);">
            <h4 style="margin-bottom:16px;">Cập nhật trạng thái (Admin)</h4>
            <div style="display:flex;gap:12px;">
                <select id="update-bug-status" class="styled-select" style="flex:1;">
                    <option value="OPEN" ${bug.status === 'OPEN' ? 'selected' : ''}>Mở (Đang chờ)</option>
                    <option value="IN_PROGRESS" ${bug.status === 'IN_PROGRESS' ? 'selected' : ''}>Đang xử lý</option>
                    <option value="RESOLVED" ${bug.status === 'RESOLVED' ? 'selected' : ''}>Đã khắc phục</option>
                    <option value="CLOSED" ${bug.status === 'CLOSED' ? 'selected' : ''}>Đã đóng</option>
                </select>
                <button class="btn-primary" onclick="saveBugUpdate('${bug.id}')">Cập nhật</button>
            </div>
        </div>
    `;

    openModal('bug-detail-modal');
}

function saveBugUpdate(bugId) {
    const select = document.getElementById('update-bug-status');
    if (!select) return;
    const status = select.value;
    const bug = state.bugReports.find(b => b.id === bugId);
    if (!bug) return;

    bug.status = status;
    syncToBackend('update_bug_status', { id: bugId, status: status });

    showToast('Đã cập nhật trạng thái lỗi thành công!', 'success');
    closeModal('bug-detail-modal');
    renderBugReports();
}

// ==========================================
// AUTH & LOGIN SYSTEM
// ==========================================

function getMemberDept(m) {
    if (!m) return '';
    return m.dept || m.Ban || m.Department || m['Bộ phận'] || '';
}

function setLoginDeptFilter(btn, dept) {
    state.loginDeptFilter = dept;
    document.querySelectorAll('#login-dept-pills .login-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderLoginMemberSelector();
}

function openLoginSelector() {
    state.loginDeptFilter = 'ALL';
    document.querySelectorAll('#login-dept-pills .login-pill').forEach(p => {
        p.classList.toggle('active', p.innerText === 'Tất cả');
    });

    document.getElementById('login-member-search').value = '';
    renderLoginMemberSelector();
    document.getElementById('login-selector-overlay').classList.remove('hidden');
    setTimeout(() => document.getElementById('login-member-search').focus(), 400);
}

function closeLoginSelector() {
    document.getElementById('login-selector-overlay').classList.add('hidden');
}

function renderLoginMemberSelector() {
    const list = document.getElementById('login-member-list');
    if (!list) return;

    // Loading State
    if (state.initialLoading && state.members.length === 0) {
        list.innerHTML = `
            <div class="login-member-loading">
                <div class="loading-text">Đang kết nối với máy chủ...</div>
                <div class="progress-container">
                    <div class="progress-bar-fill"></div>
                </div>
                <p style="color: #64748b; font-size: 0.8rem;">Vui lòng đợi trong giây lát</p>
            </div>
        `;
        return;
    }

    const search = document.getElementById('login-member-search').value.toLowerCase();
    const dept = state.loginDeptFilter;
    const selectedId = document.getElementById('login-member-id').value;

    const filtered = state.members.filter(m => {
        const mDept = getMemberDept(m);
        const searchTerms = search.split(' ').filter(t => t.trim() !== '');
        if (searchTerms.length === 0) return (dept === 'ALL' || (dept === 'BCN' ? !['L&D', 'R&R', 'ER', 'EB'].includes(mDept) : mDept === dept));

        const matchesSearch = searchTerms.every(term =>
            m.name.toLowerCase().includes(term) ||
            (m.id && m.id.toLowerCase().includes(term)) ||
            (m.memberId && m.memberId.toLowerCase().includes(term))
        );

        return matchesSearch &&
            (dept === 'ALL' || (dept === 'BCN' ? !['L&D', 'R&R', 'ER', 'EB'].includes(mDept) : mDept === dept));
    }).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

    list.innerHTML = '';

    // Empty State after loading
    if (filtered.length === 0) {
        if (!state.initialLoading && state.members.length === 0) {
            list.innerHTML = `
                <div class="login-member-loading">
                    <div class="loading-error-icon"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <div class="loading-text">Không thể tải danh sách thành viên</div>
                    <button class="btn-retry" onclick="retryLoadData()">
                        <i class="fa-solid fa-rotate-right"></i> Thử lại ngay
                    </button>
                </div>
            `;
        } else {
            list.innerHTML = '<div class="login-member-loading" style="grid-column: 1 / -1;">Không tìm thấy thành viên phù hợp.</div>';
        }
        return;
    }

    filtered.forEach(m => {
        const item = document.createElement('div');
        item.className = 'login-member-item' + (selectedId === m.id ? ' selected' : '');
        item.onclick = () => selectLoginMember(m.id);
        const mDept = getMemberDept(m);
        item.innerHTML = `
            <div class="login-member-avatar"><i class="fa-solid fa-user"></i></div>
            <div class="login-member-info">
                <span class="login-member-name">${m.name}</span>
            </div>
            ${selectedId === m.id ? '<i class="fa-solid fa-circle-check" style="color:#38bdf8"></i>' : ''}
        `;
        list.appendChild(item);
    });
}

function selectLoginMember(mId) {
    const member = state.members.find(m => m.id === mId);
    if (!member) return;

    document.getElementById('login-member-id').value = mId;

    // Update display card
    document.getElementById('display-name').innerText = member.name;
    document.getElementById('display-dept').innerText = member.class || '';
    document.getElementById('selected-member-display').classList.add('selected');

    // Close selector
    closeLoginSelector();

    // Check Password status
    const authRec = state.userPasswords.find(p => String(p.memberId) === String(mId));
    if (authRec) {
        document.getElementById('login-password-section').style.display = 'block';
        document.getElementById('login-create-password-section').style.display = 'none';
        document.getElementById('login-password').value = '';
        setTimeout(() => document.getElementById('login-password').focus(), 100);
    } else {
        document.getElementById('login-password-section').style.display = 'none';
        document.getElementById('login-create-password-section').style.display = 'block';
        document.getElementById('create-password').value = '';
        document.getElementById('confirm-password').value = '';
        setTimeout(() => document.getElementById('create-password').focus(), 100);
    }
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('create-error').style.display = 'none';
}

function showLoginScreen() {
    const overlay = document.getElementById('login-overlay');
    overlay.classList.remove('hidden');

    // Reset selected member UI
    document.getElementById('login-member-id').value = '';
    document.getElementById('display-name').innerText = 'Chưa chọn thành viên';
    document.getElementById('display-dept').innerText = 'Nhấn để chọn tên của bạn';
    document.getElementById('selected-member-display').classList.remove('selected');

    // Reset UI sections
    document.getElementById('login-password-section').style.display = 'none';
    document.getElementById('login-create-password-section').style.display = 'none';
    document.getElementById('admin-login-form').style.display = 'none';
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('admin-error').style.display = 'none';
    document.getElementById('admin-password').value = '';
}

function handleLogin() {
    const memberId = document.getElementById('login-member-id').value;
    if (!memberId) return alert('Vui lòng chọn tên của bạn!');

    const password = document.getElementById('login-password').value;
    if (!password) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error-text').innerText = 'Vui lòng nhập mật khẩu';
        return;
    }

    const stored = state.userPasswords.find(p => String(p.memberId) === String(memberId));

    if (!stored || String(stored.password) !== password) {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('login-error-text').innerText = 'Sai mật khẩu, vui lòng thử lại';
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
        return;
    }

    // Success - login as user
    const member = state.members.find(m => m.id === memberId);
    state.currentUser = member;
    state.userRole = 'user';
    completeLogin();
}

function handleCreatePassword() {
    const memberId = document.getElementById('login-member-id').value;
    if (!memberId) return alert('Vui lòng chọn tên của bạn!');

    const password = document.getElementById('create-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!password || password.length < 4) {
        document.getElementById('create-error').style.display = 'block';
        document.getElementById('create-error-text').innerText = 'Mật khẩu phải có ít nhất 4 ký tự';
        return;
    }

    if (password !== confirmPassword) {
        document.getElementById('create-error').style.display = 'block';
        document.getElementById('create-error-text').innerText = 'Mật khẩu xác nhận không khớp!';
        return;
    }

    // Save Password
    const member = state.members.find(m => m.id === memberId);
    const authRecord = {
        id: 'auth_' + Date.now(),
        memberId: memberId,
        name: member ? member.name : '',
        password: password,
        createdAt: new Date().toISOString()
    };

    state.userPasswords.push(authRecord);
    syncToBackend('save_user_password', authRecord);

    // Login as user
    state.currentUser = member;
    state.userRole = 'user';
    completeLogin();
}

function handleAdminLogin() {
    const pw = document.getElementById('admin-password').value;
    if (pw !== ADMIN_PASSWORD) {
        document.getElementById('admin-error').style.display = 'block';
        document.getElementById('admin-password').value = '';
        setTimeout(() => document.getElementById('admin-error').style.display = 'none', 3000);
        return;
    }

    // Success - login as admin
    state.currentUser = { id: 'admin', name: 'Admin', dept: 'BCN' };
    state.userRole = 'admin';
    completeLogin();
}

function completeLogin() {
    // Hide login overlay
    document.getElementById('login-overlay').classList.add('hidden');

    // Update header
    updateHeaderUser();

    // Apply permissions
    applyPermissions(state.userRole);

    // Now render all views
    renderAllViews();

    // Update welcome message
    const welcomeH2 = document.querySelector('.welcome-content h2');
    if (welcomeH2) {
        const hour = new Date().getHours();
        let greeting = 'Chào buổi sáng';
        if (hour >= 12 && hour < 18) greeting = 'Chào buổi chiều';
        else if (hour >= 18) greeting = 'Chào buổi tối';
        welcomeH2.innerText = `${greeting}, ${state.currentUser.name}! 👋`;
    }
    const welcomeP = document.querySelector('.welcome-content p');
    if (welcomeP) {
        welcomeP.innerText = state.userRole === 'admin'
            ? 'Chào mừng bạn trở lại hệ thống quản trị HuReA. Bạn có quyền truy cập toàn bộ.'
            : 'Chào mừng bạn đến với hệ thống HuReA. Hãy theo dõi tiến độ hoạt động của mình.';
    }
}

function isBoardMember() {
    if (!state.currentUser || state.userRole === 'admin') return false;
    const activeTerm = state.terms.find(t => t.id === state.currentTerm);
    if (!activeTerm || !activeTerm.bcn) return false;
    const bcnNames = Object.values(activeTerm.bcn).map(n => String(n).toLowerCase().trim());
    return bcnNames.includes(state.currentUser.name.toLowerCase().trim());
}

function updateHeaderUser() {
    const name = state.currentUser ? state.currentUser.name : 'Guest';
    const encodedName = encodeURIComponent(name);
    document.getElementById('header-username').innerText = name;
    document.getElementById('header-avatar').src = `https://ui-avatars.com/api/?name=${encodedName}&background=${state.userRole === 'admin' ? 'f59e0b' : '0D8ABC'}&color=fff`;

    const badge = document.getElementById('header-role-badge');
    if (state.userRole === 'admin') {
        badge.innerText = 'Admin';
        badge.className = 'header-role-badge role-admin';
    } else {
        badge.innerText = 'Member';
        badge.className = 'header-role-badge role-user';
    }

    // Update version badge
    const versionBadge = document.querySelector('.version-badge');
    if (versionBadge) {
        versionBadge.innerText = state.userRole === 'admin' ? 'Admin V19' : 'Member';
    }
}

function applyPermissions(role) {
    const isAdmin = role === 'admin';
    const fbAdmin = document.getElementById('feedback-admin-actions');
    if (fbAdmin) fbAdmin.style.display = isAdmin ? 'block' : 'none';

    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('nav-hidden');
    });

    if (role === 'user') {
        const boardMember = isBoardMember();

        navItems.forEach(item => {
            const target = item.getAttribute('data-target');
            // Members and Terms are Admin only
            if (target === 'members-view' || target === 'terms-view') {
                item.classList.add('nav-hidden');
            }
            // Eval view is visible for board members (BCN) but tabs inside will be filtered
            if (target === 'eval-view' && boardMember) {
                item.classList.remove('nav-hidden');
            }
        });

        // Evaluation Tabs visibility
        document.querySelectorAll('.eval-tab').forEach(tab => {
            const evalTarget = tab.getAttribute('data-eval');
            if (evalTarget === 'eval-club') {
                // Club Activity Eval is STRICTLY Admin only
                tab.style.display = 'none';
            } else if (evalTarget === 'eval-dept') {
                // Dept Eval is for Admin and Board Members (BCN)
                tab.style.display = boardMember ? '' : 'none';
            } else {
                // Peer Eval (360) is for everyone
                tab.style.display = '';
            }
        });

        const deptComment = document.getElementById('dept-comment');
        if (deptComment) {
            deptComment.disabled = !boardMember;
            deptComment.placeholder = boardMember ? "Nhập nhận xét chi tiết..." : "Chỉ Admin và Trưởng/Phó Ban mới có quyền nhập nhận xét.";
        }

        const deptSaveBtn = document.querySelector('#eval-dept .btn-primary');
        if (deptSaveBtn) {
            deptSaveBtn.style.display = boardMember ? 'block' : 'none';
        }

        const evalCalcActions = document.querySelector('#eval-calc .pane-header div[style*="gap:12px"]');
        if (evalCalcActions) evalCalcActions.style.display = 'none';

        const prjAddBtn = document.querySelector('#projects-view .btn-primary');
        if (prjAddBtn) prjAddBtn.style.display = 'none';

        document.querySelectorAll('.btn-create-ann').forEach(btn => btn.style.display = 'none');

        const pwNav = document.getElementById('pw-mgmt-nav');
        if (pwNav) pwNav.classList.add('nav-hidden');

        const prjForm = document.querySelector('#project-modal form');
        if (prjForm) {
            prjForm.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        }
        const prjSaveBtn = document.querySelector('#project-modal .modal-footer .btn-lux-primary');
        if (prjSaveBtn) prjSaveBtn.style.display = 'none';

        const prjStaffBtn = document.querySelector('.participant-manager .btn-primary');
        if (prjStaffBtn) prjStaffBtn.style.display = 'none';

        document.querySelectorAll('.project-card .btn-secondary').forEach(btn => {
            if (btn.innerText.includes('Quản lý')) btn.innerHTML = '<i class="fa-solid fa-eye"></i> Xem nhân sự';
        });
        document.querySelectorAll('.project-card .btn-icon.delete').forEach(btn => btn.style.display = 'none');

    } else {
        document.querySelectorAll('.eval-tab').forEach(tab => tab.style.display = '');
        const evalCalcActions = document.querySelector('#eval-calc .pane-header div[style*="gap:12px"]');
        if (evalCalcActions) evalCalcActions.style.display = 'flex';
        const prjAddBtn = document.querySelector('#projects-view .btn-primary');
        if (prjAddBtn) prjAddBtn.style.display = '';
        document.querySelectorAll('.btn-create-ann').forEach(btn => btn.style.display = '');

        const prjForm = document.querySelector('#project-modal form');
        if (prjForm) {
            prjForm.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
        }
        const prjSaveBtn = document.querySelector('#project-modal .modal-footer .btn-primary');
        if (prjSaveBtn) prjSaveBtn.style.display = 'inline-block';
        const prjStaffBtn = document.querySelector('.participant-manager .btn-primary');
        if (prjStaffBtn) prjStaffBtn.style.display = 'inline-flex';

        const pwNav = document.getElementById('pw-mgmt-nav');
        if (pwNav) pwNav.classList.remove('nav-hidden');
    }
}

function toggleAdminLogin() {
    const form = document.getElementById('admin-login-form');
    if (form.style.display === 'none') {
        form.style.display = 'block';
        document.getElementById('admin-password').focus();
    } else {
        form.style.display = 'none';
    }
}

function togglePwVisibility(inputId, btn) {
    const inp = document.getElementById(inputId);
    if (inp.type === 'password') {
        inp.type = 'text';
        btn.innerHTML = '<i class="fa-solid fa-eye-slash"></i>';
    } else {
        inp.type = 'password';
        btn.innerHTML = '<i class="fa-solid fa-eye"></i>';
    }
}

function logout() {
    state.currentUser = null;
    state.userRole = 'guest';

    // Reset to dashboard view
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    const dashNav = document.querySelector('.nav-item[data-target="dashboard-view"]');
    if (dashNav) dashNav.classList.add('active');
    const dashView = document.getElementById('dashboard-view');
    if (dashView) dashView.classList.add('active');

    showLoginScreen();
}


// ==========================================
// FINAL SCORES
// ==========================================
// Override calculateFinalScores to filter by user
const _originalCalculateFinalScores = calculateFinalScores;
calculateFinalScores = function () {
    if (state.userRole === 'user' && state.currentUser) {
        const tbody = document.getElementById('score-tbody');
        tbody.innerHTML = '';
        const member = state.currentUser;
        const mId = member.id;

        const prjScore = calculateMemberProjectScore(mId);
        const clubScore = calculateMemberClubScore(mId);
        const de = state.deptScores.find(x => x.memberId === mId && x.term === state.currentTerm);
        const deptScore = de ? de.totalScore : 0;
        const total = (prjScore + clubScore + deptScore) / 3;
        let grade = 'Can co gang';
        let gradeVi = 'Cần Cố Gắng';
        if (total >= 8.5) { grade = 'Xuat Sac'; gradeVi = 'Xuất Sắc'; }
        else if (total >= 7) { grade = 'Kha'; gradeVi = 'Khá'; }
        else if (total >= 5) { grade = 'Dat'; gradeVi = 'Đạt'; }
        const gradeColors = { 'Xuat Sac': '#f59e0b', 'Kha': '#10b981', 'Dat': '#0D8ABC', 'Can co gang': '#ef4444' };
        const gc = gradeColors[grade] || '#ef4444';
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${member.name}</strong><br><span style="font-size:0.75rem;color:#94a3b8">Ban ${member.dept} - ${member.class}</span></td>
            <td><span style="color:#38bdf8;font-weight:700">${prjScore.toFixed(2)}</span></td>
            <td><span style="color:#10b981;font-weight:700">${clubScore.toFixed(2)}</span></td>
            <td><span style="color:#f59e0b;font-weight:700">${deptScore.toFixed(2)}</span></td>
            <td><strong style="font-size:1.2rem;color:var(--primary)">${total.toFixed(2)}</strong></td>
            <td><span style="background:${gc}22;color:${gc};border:1px solid ${gc}44;padding:3px 10px;border-radius:12px;font-size:0.8rem;font-weight:700">${gradeVi}</span></td>
            <td><button class="btn-secondary btn-sm" onclick="showScoreDetail('${mId}')"><i class="fa-solid fa-list-ul"></i> Chi tiết</button></td>`;
        tbody.appendChild(tr);
    } else {
        _originalCalculateFinalScores();
    }
};

// Override renderProjects to hide edit/delete for user
const _originalRenderProjects = renderProjects;
renderProjects = function () {
    _originalRenderProjects();
    if (state.userRole === 'user') {
        // Remove edit/delete from project cards
        document.querySelectorAll('#projects-grid .project-card').forEach(card => {
            const actionDiv = card.querySelector('div[style*="justify-content:flex-end"]');
            if (actionDiv) actionDiv.style.display = 'none';
        });
    }
};

// ==========================================
// PASSWORD MANAGEMENT (Admin Only)
// ==========================================
function setPasswordDeptFilter(btn, dept) {
    state.passwordDeptFilter = dept;
    document.querySelectorAll('#password-dept-pills .pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderPasswordManagement();
}

function renderPasswordManagement() {
    const tbody = document.getElementById('password-mgmt-tbody');
    const empty = document.getElementById('password-mgmt-empty');
    if (!tbody) return;

    const search = (document.getElementById('search-password-mgmt')?.value || '').toLowerCase();
    const dept = state.passwordDeptFilter;
    tbody.innerHTML = '';

    const filtered = state.members.filter(m => {
        const matchesSearch = m.name.toLowerCase().includes(search);
        const mDept = getMemberDept(m);
        const matchesDept = (dept === 'ALL' || mDept === dept);
        return matchesSearch && matchesDept;
    });

    if (filtered.length === 0) {
        if (empty) empty.style.display = 'block';
        return;
    }
    if (empty) empty.style.display = 'none';

    filtered.forEach(m => {
        const authRec = state.userPasswords.find(p => String(p.memberId) === String(m.id));
        const hasPassword = !!authRec;
        const passValStr = authRec ? authRec.password : '';
        const passValDisplay = authRec ? '••••••••' : '<span style="color:#ef4444">Chưa tạo</span>';
        const tr = document.createElement('tr');
        const mDept = getMemberDept(m);

        tr.innerHTML = `
            <td><strong>${m.name}</strong></td>
            <td><span class="version-badge">${mDept}</span></td>
            <td>
                <span class="status-pill ${hasPassword ? 'status-active' : 'status-pending'}">
                    ${hasPassword ? 'Đã có' : 'Chưa có'}
                </span>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:10px;">
                    <span id="pass-display-${m.id}" data-pass="${passValStr}">${passValDisplay}</span>
                    ${authRec ? `<button class="btn-icon" onclick="togglePassReveal('${m.id}')" title="Hiện/Ẩn"><i class="fa-solid fa-eye" style="color:var(--text-muted)"></i></button>` : ''}
                </div>
            </td>
            <td>
                <button class="btn-secondary btn-sm" onclick="openEditPasswordModal('${m.id}')">
                    <i class="fa-solid fa-pen-to-square"></i> Sửa
                </button>
                <button class="btn-icon-v2 btn-danger" onclick="resetUserPassword('${m.id}')" title="Xóa mật khẩu">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function togglePassReveal(mId) {
    const span = document.getElementById('pass-display-' + mId);
    if (!span) return;
    const realPass = span.getAttribute('data-pass');
    if (span.innerText === '••••••••') {
        span.innerText = realPass;
    } else {
        span.innerText = '••••••••';
    }
}

function openEditPasswordModal(mId) {
    const m = state.members.find(x => x.id === mId);
    if (!m) return;

    document.getElementById('edit-password-m-id').value = mId;
    document.getElementById('edit-password-member-info').innerText = `Thành viên: ${m.name} (Ban ${getMemberDept(m)})`;
    document.getElementById('admin-password-error').style.display = 'none';
    document.getElementById('admin-new-password').value = '';

    openModal('edit-password-modal');
}

async function saveUserPasswordAdmin() {
    const mId = document.getElementById('edit-password-m-id').value;
    const newPass = document.getElementById('admin-new-password').value;

    if (!newPass || newPass.length < 4) {
        const err = document.getElementById('admin-password-error');
        err.innerText = 'Mật khẩu phải từ 4 ký tự trở lên';
        err.style.display = 'block';
        return;
    }

    const btn = document.querySelector('#edit-password-modal .btn-primary');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang cập nhật...';
    btn.disabled = true;

    try {
        const member = state.members.find(m => m.id === mId);
        let authRec = state.userPasswords.find(p => String(p.memberId) === String(mId));

        if (!authRec) {
            // Create new auth record if they never had one
            authRec = {
                id: 'auth_' + Date.now(),
                memberId: mId,
                name: member ? member.name : '',
                password: newPass,
                createdAt: new Date().toISOString()
            };
            state.userPasswords.push(authRec);
        } else {
            // Update existing
            authRec.password = newPass;
        }

        await syncToBackend('update_user_password', authRec);

        showToast(`Đã cấp lại mật khẩu cho ${member ? member.name : mId}`, 'success');
        renderPasswordManagement(); // Refresh the list
        closeModal('edit-password-modal');
    } catch (e) {
        console.error('Password reset error:', e);
        const err = document.getElementById('admin-password-error');
        err.innerText = 'Lỗi khi đồng bộ Google Sheets: ' + e.message;
        err.style.display = 'block';
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}


/**
 * GENERATE PDF REPORT
 */
async function generatePDFReport() {
    const fromDate = document.getElementById('export-from-date').value;
    const toDate = document.getElementById('export-to-date').value;
    const btn = document.querySelector('#export-report-modal .btn-primary');

    if (!fromDate || !toDate) {
        showToast('Vui lòng chọn khoảng thời gian!', 'error');
        return;
    }

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xử lý...';
        }

        showToast('Đang tổng hợp dữ liệu báo cáo...');

        const start = new Date(fromDate);
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);

        const filteredEvals = state.evaluations.filter(e => {
            const d = new Date(e.createdAt);
            return d >= start && d <= end;
        });

        const filteredConfessions = state.confessions.filter(c => {
            const d = new Date(c.createdAt);
            return d >= start && d <= end;
        });

        if (filteredEvals.length === 0 && filteredConfessions.length === 0) {
            showToast('Không có dữ liệu trong khoảng thời gian này!', 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fa-solid fa-download"></i> Tạo PDF & Tải xuống';
            }
            return;
        }

        const template = document.getElementById('pdf-report-template');
        template.style.display = 'block';

        // Build Stunning Report HTML
        template.innerHTML = `
            <div style="text-align:center; margin-bottom:40px; border-bottom: 2px solid #0ea5e9; padding-bottom: 20px;">
                <h1 style="color:#0ea5e9; font-size:28px; margin-bottom:8px; font-family: 'Times New Roman', serif; font-weight: bold;">BÁO CÁO TỔNG HỢP HUREA HUB</h1>
                <p style="color:#64748b; font-size:14px; font-family: 'Times New Roman', serif;">Khoảng thời gian: ${fromDate} — ${toDate}</p>
            </div>

            <div style="margin-bottom:40px;">
                <h2 style="color:#1e293b; border-left:4px solid #0ea5e9; padding-left:12px; margin-bottom:20px; font-family: 'Times New Roman', serif; font-weight: bold;">1. Đánh giá dự án chéo (${filteredEvals.length})</h2>
                <table style="width:100%; border-collapse:collapse; font-size: 13px; font-family: 'Times New Roman', serif;">
                    <thead>
                        <tr style="background:#f8fafc; text-align:left; color: #475569;">
                            <th style="padding:12px; border:1px solid #e2e8f0;">Dự án</th>
                            <th style="padding:12px; border:1px solid #e2e8f0;">Người đánh giá</th>
                            <th style="padding:12px; border:1px solid #e2e8f0;">Người nhận</th>
                            <th style="padding:12px; border:1px solid #e2e8f0;">Điểm TB</th>
                            <th style="padding:12px; border:1px solid #e2e8f0;">Nhận xét chi tiết</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredEvals.map(e => `
                            <tr>
                                <td style="padding:10px; border:1px solid #e2e8f0;">${e.projectName || '-'}</td>
                                <td style="padding:10px; border:1px solid #e2e8f0;">${e.raterName}</td>
                                <td style="padding:10px; border:1px solid #e2e8f0;">${e.targetName}</td>
                                <td style="padding:10px; border:1px solid #e2e8f0; font-weight:bold; color:#0ea5e9;">${e.averageScore}</td>
                                <td style="padding:10px; border:1px solid #e2e8f0; color: #64748b; font-style: italic;">"${e.comments || 'Không có nhận xét'}"</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>

            <div style="page-break-before: always; margin-top: 40px;">
                <h2 style="color:#1e293b; border-left:4px solid #f59e0b; padding-left:12px; margin-bottom:20px; font-family: 'Times New Roman', serif; font-weight: bold;">2. Confessions & Góp ý (${filteredConfessions.length})</h2>
                <div style="display: grid; grid-template-columns: 1fr; gap: 16px; font-family: 'Times New Roman', serif;">
                    ${filteredConfessions.map(c => `
                        <div style="background:#fdfcfb; padding:20px; border-radius:12px; border:1px solid #f3f4f6; position: relative; margin-bottom: 12px;">
                            <div style="font-size:11px; color:#94a3b8; margin-bottom:8px; text-transform: uppercase;">Gửi vào: ${c.createdAt || 'N/A'}</div>
                            <div style="font-size:14px; color:#334155; line-height:1.6;">${c.text}</div>
                            <div style="margin-top: 12px; font-size: 12px; color: #f59e0b; font-weight: 600;">— Người gửi: Ẩn danh</div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <div style="margin-top:80px; text-align:center; font-size:11px; color:#cbd5e1; border-top: 1px solid #f1f5f9; padding-top: 20px; font-family: 'Times New Roman', serif;">
                Hệ thống Quản trị HuReA Hub • Báo cáo tự động • ${new Date().toLocaleString()}
            </div>
        `;

        const opt = {
            margin: [15, 15],
            filename: `Hurea_Hub_Report_${fromDate}_${toDate}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
        };

        await html2pdf().set(opt).from(template).save();

        showToast('Xuất báo cáo PDF thành công!', 'success');
        closeModal('export-report-modal');

    } catch (e) {
        console.error('PDF Error:', e);
        showToast('Lỗi khi xuất PDF, vui lòng thử lại.', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Tạo PDF & Tải xuống';
        }
        const template = document.getElementById('pdf-report-template');
        if (template) {
            template.style.display = 'none';
            template.innerHTML = '';
        }
    }
}

/**
 * BATCH TEAM PASTE
 */
function processTeamBatchPaste() {
    const text = document.getElementById('batch-team-paste-text').value;
    if (!text.trim()) return;

    const lines = text.split('\n').map(l => l.trim().toLowerCase()).filter(l => l);
    let count = 0;

    lines.forEach(line => {
        const member = state.members.find(m =>
            m.name.toLowerCase() === line ||
            (m.id && m.id.toLowerCase() === line) ||
            m.name.toLowerCase().includes(line)
        );

        if (member) {
            if (!state.msSelectedIds.includes(member.id)) {
                state.msSelectedIds.push(member.id);
                count++;
            }
        }
    });

    if (count > 0) {
        renderMsGrid();
        showToast(`Đã nhận diện và chọn ${count} thành viên.`, 'success');
        closeModal('batch-team-paste-modal');
        document.getElementById('batch-team-paste-text').value = '';
    } else {
        showToast('Không tìm thấy thành viên nào khớp với danh sách.', 'error');
    }
}
// ADMIN: EXPORT INCOMPLETE EVALUATIONS
async function exportIncompleteEvaluationsPDF() {
    if (!state.currentUser || state.currentUser.role !== 'ADMIN') return;

    const term = state.activeTerm || 'Unknown';
    const projects = state.projects;
    const evaluations = state.evaluations;

    let html = `
        <div style="text-align:center; margin-bottom:30px; border-bottom:2px solid #333; padding-bottom:20px;">
            <h1 style="margin:0; font-size:24px; color:#1a202c;">DANH SÁCH CHƯA HOÀN THÀNH ĐÁNH GIÁ CHÉO</h1>
            <p style="margin:5px 0; color:#4a5568; font-size:16px;">Nhiệm kỳ: ${term} | Xuất ngày: ${new Date().toLocaleDateString('vi-VN')}</p>
        </div>
    `;

    let totalMissed = 0;
    let foundAny = false;

    projects.forEach(p => {
        const prjId = String(p.id).trim();
        const participants = ensureArray(p.participants);
        
        // Find unique raters for this project
        const submittedRaters = new Set();
        evaluations.forEach(ev => {
            const evPrj = String(ev.prjId || ev.prjid).trim();
            if (evPrj === prjId) {
                submittedRaters.add(String(ev.raterId || ev.raterid).trim());
            }
        });

        const missed = participants.filter(pt => !submittedRaters.has(String(pt.memberId).trim()));

        if (missed.length > 0) {
            foundAny = true;
            totalMissed += missed.length;
            html += `
                <div style="margin-bottom:25px; page-break-inside: avoid;">
                    <h2 style="background:#edf2f7; padding:8px 12px; border-left:4px solid #3182ce; font-size:18px; margin-bottom:10px;">
                        Dự án: ${p.name} <span style="font-weight:normal; font-size:14px;">(${missed.length} người chưa làm)</span>
                    </h2>
                    <table style="width:100%; border-collapse: collapse; margin-bottom:10px;">
                        <thead>
                            <tr style="background:#f7fafc;">
                                <th style="border:1px solid #e2e8f0; padding:10px; text-align:left;">Họ và Tên</th>
                                <th style="border:1px solid #e2e8f0; padding:10px; text-align:left;">Ban / Team</th>
                                <th style="border:1px solid #e2e8f0; padding:10px; text-align:left;">Vai trò</th>
                            </tr>
                        </thead>
                        <tbody>
            `;

            missed.forEach(m => {
                html += `
                    <tr>
                        <td style="border:1px solid #e2e8f0; padding:8px 10px;">${m.name || 'Không tên'}</td>
                        <td style="border:1px solid #e2e8f0; padding:8px 10px;">${m.teamName || m.dept || '-'}</td>
                        <td style="border:1px solid #e2e8f0; padding:8px 10px;">${m.role || 'Thành viên'}</td>
                    </tr>
                `;
            });

            html += `
                        </tbody>
                    </table>
                </div>
            `;
        }
    });

    if (!foundAny) {
        html += `<div style="text-align:center; padding:40px; color:#718096;">🎉 Tất cả mọi người đã hoàn thành nhiệm vụ!</div>`;
    } else {
        html += `<div style="margin-top:30px; border-top:1px solid #e2e8f0; padding-top:10px; text-align:right; font-weight:bold;">
            Tổng cộng: ${totalMissed} lượt chưa hoàn thành
        </div>`;
    }

    const reportContainer = document.getElementById('incomplete-eval-template');
    reportContainer.innerHTML = html;

    const opt = {
        margin: 10,
        filename: `DS_Chua_Danh_Gia_Cheo_${term}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        await html2pdf().set(opt).from(reportContainer).save();
    } catch (err) {
        console.error('PDF Export Error:', err);
        alert('Có lỗi xảy ra khi xuất PDF. Vui lòng thử lại.');
    }
}

// ==========================================
// MEETING SCHEDULER MODULE — When2Meet Style
// ==========================================

let msGridDragging = false;
let msGridDragMode = 'select'; // 'select' or 'deselect'

function initMeetingScheduler() {
    // Check URL hash for deep link
    checkMeetingDeepLink();
    window.addEventListener('hashchange', checkMeetingDeepLink);
}

function checkMeetingDeepLink() {
    const hash = window.location.hash;
    if (hash.startsWith('#poll=')) {
        const pollId = hash.replace('#poll=', '');
        if (pollId) {
            state._pendingPollId = pollId;
        }
    }
}

function handlePendingPollDeepLink() {
    if (state._pendingPollId) {
        const pollId = state._pendingPollId;
        delete state._pendingPollId;
        // Navigate to meeting scheduler
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        const navItem = document.querySelector('.nav-item[data-target="meeting-scheduler-view"]');
        if (navItem) navItem.classList.add('active');
        const view = document.getElementById('meeting-scheduler-view');
        if (view) view.classList.add('active');
        // Open poll detail
        setTimeout(() => openPollDetail(pollId), 300);
    }
}

function setMeetingFilter(btn, filter) {
    state.meetingPollFilter = filter;
    document.querySelectorAll('.ms-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderMeetingPolls();
}

function renderMeetingPolls() {
    const grid = document.getElementById('meeting-polls-grid');
    const empty = document.getElementById('meeting-polls-empty');
    if (!grid || !empty) return;

    const now = new Date();
    const filter = state.meetingPollFilter || 'all';

    let polls = [...state.meetingPolls].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    if (filter === 'active') {
        polls = polls.filter(p => new Date(p.deadline) > now);
    } else if (filter === 'expired') {
        polls = polls.filter(p => new Date(p.deadline) <= now);
    }

    grid.innerHTML = '';

    if (polls.length === 0) {
        empty.style.display = 'flex';
        grid.style.display = 'none';
        return;
    }

    empty.style.display = 'none';
    grid.style.display = 'grid';

    polls.forEach((poll, idx) => {
        const isExpired = new Date(poll.deadline) <= now;
        const voterCount = getUniqueVoters(poll.id).length;
        const deadlineStr = formatDateTimeVN(poll.deadline);
        const rangeStr = `${formatDateVN(poll.startDate)} → ${formatDateVN(poll.endDate)}`;
        const creatorName = poll.creatorName || 'Ẩn danh';

        const card = document.createElement('div');
        card.className = `poll-card ${isExpired ? 'expired' : ''}`;
        card.style.animationDelay = `${idx * 0.08}s`;
        card.innerHTML = `
            <div class="poll-card-title">
                <i class="fa-solid fa-calendar-check" style="color:${isExpired ? '#64748b' : 'var(--primary)'}"></i>
                ${poll.title || 'Cuộc họp không tên'}
                <span class="poll-status-badge ${isExpired ? 'expired' : 'active'}">${isExpired ? 'Đã kết thúc' : 'Đang diễn ra'}</span>
            </div>
            ${poll.content ? `<div class="poll-card-content">${poll.content}</div>` : ''}
            <div class="poll-card-meta">
                <div class="poll-meta-row"><i class="fa-solid fa-user-pen"></i> Người tạo: <strong>${creatorName}</strong></div>
                <div class="poll-meta-row"><i class="fa-solid fa-hourglass-half"></i> Deadline: <strong>${deadlineStr}</strong></div>
                <div class="poll-meta-row"><i class="fa-solid fa-calendar-days"></i> Khoảng: <strong>${rangeStr}</strong></div>
                <div class="poll-meta-row"><i class="fa-solid fa-users"></i> <strong>${voterCount}</strong> người đã vote</div>
            </div>
            <div class="poll-card-footer">
                <button class="btn-lux-primary" onclick="openPollDetail('${poll.id}')" style="padding:10px 20px; font-size:0.85rem;">
                    <i class="fa-solid fa-arrow-right"></i> ${isExpired ? 'Xem kết quả' : 'Vào Vote'}
                </button>
                <button class="btn-secondary btn-sm" onclick="event.stopPropagation(); copyPollShareLinkById('${poll.id}')" title="Sao chép link">
                    <i class="fa-solid fa-link"></i>
                </button>
                <span class="poll-voters-count"><i class="fa-solid fa-users"></i> ${voterCount}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function getUniqueVoters(pollId) {
    const voters = new Set();
    state.meetingVotes.forEach(v => {
        if (String(v.pollId || v.pollid) === String(pollId)) {
            voters.add(String(v.userId || v.userid));
        }
    });
    return Array.from(voters);
}

function formatDateVN(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTimeVN(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateFull(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return dateStr;
    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    return `${days[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ==========================================
// CREATE POLL
// ==========================================
function openCreatePollModal() {
    // Set default values
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const weekLater = new Date(now);
    weekLater.setDate(weekLater.getDate() + 7);
    const deadlineDt = new Date(now);
    deadlineDt.setDate(deadlineDt.getDate() + 3);

    document.getElementById('poll-title').value = '';
    document.getElementById('poll-content').value = '';
    document.getElementById('poll-deadline').value = deadlineDt.toISOString().slice(0, 16);
    document.getElementById('poll-start-date').value = tomorrow.toISOString().slice(0, 10);
    document.getElementById('poll-end-date').value = weekLater.toISOString().slice(0, 10);
    openModal('create-poll-modal');
}

async function saveMeetingPoll() {
    const title = document.getElementById('poll-title').value.trim();
    const content = document.getElementById('poll-content').value.trim();
    const deadline = document.getElementById('poll-deadline').value;
    const startDate = document.getElementById('poll-start-date').value;
    const endDate = document.getElementById('poll-end-date').value;
    const startHour = parseInt(document.getElementById('poll-start-hour').value) || 8;
    const endHour = parseInt(document.getElementById('poll-end-hour').value) || 22;

    if (!title || !deadline || !startDate || !endDate) {
        showToast('Vui lòng điền đầy đủ thông tin bắt buộc!', 'error');
        return;
    }

    if (new Date(startDate) > new Date(endDate)) {
        showToast('Ngày bắt đầu phải trước ngày kết thúc!', 'error');
        return;
    }

    // Check date span limit (max 14 days)
    const daysDiff = Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)) + 1;
    if (daysDiff > 14) {
        showToast('Khoảng thời gian vote không quá 14 ngày!', 'error');
        return;
    }

    const poll = {
        id: 'poll_' + Date.now(),
        title,
        content,
        deadline,
        startDate,
        endDate,
        startHour,
        endHour,
        creatorId: state.currentUser ? state.currentUser.id : '',
        creatorName: state.currentUser ? state.currentUser.name : 'Ẩn danh',
        createdAt: new Date().toISOString()
    };

    // Save locally
    state.meetingPolls.push(poll);

    // Save to backend
    try {
        await syncToBackend('save_meeting_poll', poll);
        showToast('Đã tạo vote lịch họp thành công!', 'success');
    } catch (e) {
        showToast('Lỗi khi lưu: ' + e.message, 'error');
    }

    closeModal('create-poll-modal');
    renderMeetingPolls();
}

// ==========================================
// POLL DETAIL & TIME GRID
// ==========================================
function openPollDetail(pollId) {
    state.activePollId = pollId;
    const poll = state.meetingPolls.find(p => String(p.id) === String(pollId));
    if (!poll) {
        showToast('Không tìm thấy vote lịch họp này!', 'error');
        return;
    }

    // Switch views
    document.getElementById('meeting-polls-list-view').style.display = 'none';
    document.getElementById('meeting-poll-detail-view').style.display = 'block';

    // Fill info
    const isExpired = new Date(poll.deadline) <= new Date();
    const infoEl = document.getElementById('poll-detail-info');
    infoEl.innerHTML = `
        <h2>${poll.title || 'Cuộc họp'}</h2>
        ${poll.content ? `<div class="poll-desc">${poll.content}</div>` : ''}
        <div class="poll-info-chips">
            <span class="info-chip"><i class="fa-solid fa-user-pen"></i> ${poll.creatorName || 'Ẩn danh'}</span>
            <span class="info-chip"><i class="fa-solid fa-hourglass-half"></i> Deadline: ${formatDateTimeVN(poll.deadline)}</span>
            <span class="info-chip"><i class="fa-solid fa-calendar-days"></i> ${formatDateVN(poll.startDate)} → ${formatDateVN(poll.endDate)}</span>
            <span class="info-chip"><i class="fa-solid fa-clock"></i> ${poll.startHour || 8}:00 — ${poll.endHour || 22}:00</span>
            <span class="poll-status-badge ${isExpired ? 'expired' : 'active'}">${isExpired ? 'Đã kết thúc' : 'Đang diễn ra'}</span>
        </div>
    `;

    // Load existing vote for current user
    loadMyExistingVote(pollId);

    // Build time grids
    buildMyTimeGrid(poll);
    buildHeatmapGrid(poll);

    // Show/hide submit based on expiry
    const submitBtn = document.getElementById('btn-submit-vote');
    if (submitBtn) submitBtn.style.display = isExpired ? 'none' : 'inline-flex';
}

function closePollDetail() {
    state.activePollId = null;
    document.getElementById('meeting-polls-list-view').style.display = '';
    document.getElementById('meeting-poll-detail-view').style.display = 'none';
    // Clear hash
    if (window.location.hash.startsWith('#poll=')) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }
}

function loadMyExistingVote(pollId) {
    const userId = state.currentUser ? state.currentUser.id : '';
    const existing = state.meetingVotes.find(v =>
        String(v.pollId || v.pollid) === String(pollId) &&
        String(v.userId || v.userid) === String(userId)
    );

    if (existing) {
        const avail = safeJsonParse(existing.availability, {});
        state.myTimeSelections = avail;
        const statusEl = document.getElementById('vote-status-text');
        if (statusEl) statusEl.innerText = '✓ Bạn đã vote. Chọn lại và bấm Gửi để cập nhật.';
    } else {
        state.myTimeSelections = {};
        const statusEl = document.getElementById('vote-status-text');
        if (statusEl) statusEl.innerText = '';
    }
}

function getDaysArray(startDate, endDate) {
    const days = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push(new Date(d).toISOString().slice(0, 10));
    }
    return days;
}

function buildMyTimeGrid(poll) {
    const gridEl = document.getElementById('my-time-grid');
    if (!gridEl) return;

    const days = getDaysArray(poll.startDate, poll.endDate);
    const startHour = parseInt(poll.startHour) || 8;
    const endHour = parseInt(poll.endHour) || 22;
    const hourCount = endHour - startHour;
    const colCount = days.length + 1; // +1 for hour labels

    gridEl.style.gridTemplateColumns = `60px repeat(${days.length}, minmax(52px, 1fr))`;
    gridEl.innerHTML = '';

    // Header row
    const cornerCell = document.createElement('div');
    cornerCell.className = 'time-grid-header-cell';
    cornerCell.textContent = 'Giờ';
    gridEl.appendChild(cornerCell);

    days.forEach(day => {
        const hdr = document.createElement('div');
        hdr.className = 'time-grid-header-cell';
        hdr.innerHTML = `${formatDateFull(day)}`;
        gridEl.appendChild(hdr);
    });

    // Time rows
    for (let h = startHour; h < endHour; h++) {
        // Hour label
        const label = document.createElement('div');
        label.className = 'time-grid-hour-label';
        label.textContent = `${String(h).padStart(2, '0')}:00`;
        gridEl.appendChild(label);

        // Day cells for this hour
        days.forEach(day => {
            const key = `${day}_${h}`;
            const cell = document.createElement('div');
            cell.className = 'time-cell';
            cell.dataset.key = key;
            if (state.myTimeSelections[key]) {
                cell.classList.add('selected');
            }

            // Mouse events
            cell.addEventListener('mousedown', (e) => {
                e.preventDefault();
                msGridDragging = true;
                msGridDragMode = cell.classList.contains('selected') ? 'deselect' : 'select';
                toggleTimeCell(cell, key);
            });
            cell.addEventListener('mouseenter', () => {
                if (msGridDragging) {
                    toggleTimeCell(cell, key);
                }
            });

            // Touch events
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                msGridDragging = true;
                msGridDragMode = cell.classList.contains('selected') ? 'deselect' : 'select';
                toggleTimeCell(cell, key);
            }, { passive: false });
            cell.addEventListener('touchmove', (e) => {
                e.preventDefault();
                if (!msGridDragging) return;
                const touch = e.touches[0];
                const el = document.elementFromPoint(touch.clientX, touch.clientY);
                if (el && el.classList.contains('time-cell') && el.dataset.key) {
                    toggleTimeCell(el, el.dataset.key);
                }
            }, { passive: false });

            gridEl.appendChild(cell);
        });
    }

    // Global mouse/touch end
    document.addEventListener('mouseup', () => { msGridDragging = false; });
    document.addEventListener('touchend', () => { msGridDragging = false; });
}

function toggleTimeCell(cell, key) {
    if (msGridDragMode === 'select') {
        cell.classList.add('selected');
        state.myTimeSelections[key] = true;
    } else {
        cell.classList.remove('selected');
        delete state.myTimeSelections[key];
    }
}

function clearAllTimeSelections() {
    state.myTimeSelections = {};
    document.querySelectorAll('#my-time-grid .time-cell.selected').forEach(cell => {
        cell.classList.remove('selected');
    });
    const statusEl = document.getElementById('vote-status-text');
    if (statusEl) statusEl.innerText = '';
    showToast('Đã xóa tất cả lựa chọn.', 'success');
}

// ==========================================
// SUBMIT VOTE
// ==========================================
async function submitMeetingVote() {
    const pollId = state.activePollId;
    if (!pollId) return;

    if (!state.currentUser) {
        showToast('Bạn cần đăng nhập để vote!', 'error');
        return;
    }

    const selectedKeys = Object.keys(state.myTimeSelections).filter(k => state.myTimeSelections[k]);
    if (selectedKeys.length === 0) {
        showToast('Vui lòng chọn ít nhất 1 khung giờ bạn rảnh!', 'error');
        return;
    }

    const btn = document.getElementById('btn-submit-vote');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...';
    }

    const vote = {
        id: 'vote_' + state.currentUser.id + '_' + pollId,
        pollId: pollId,
        userId: state.currentUser.id,
        userName: state.currentUser.name,
        availability: JSON.stringify(state.myTimeSelections),
        votedAt: new Date().toISOString()
    };

    // Update local state
    const existingIdx = state.meetingVotes.findIndex(v =>
        String(v.pollId || v.pollid) === String(pollId) &&
        String(v.userId || v.userid) === String(state.currentUser.id)
    );
    if (existingIdx > -1) {
        state.meetingVotes[existingIdx] = vote;
    } else {
        state.meetingVotes.push(vote);
    }

    try {
        await syncToBackend('save_meeting_vote', vote);
        showToast('Đã gửi vote thành công!', 'success');
        const statusEl = document.getElementById('vote-status-text');
        if (statusEl) statusEl.innerText = '✓ Vote đã được lưu!';
    } catch (e) {
        showToast('Lỗi khi lưu vote: ' + e.message, 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Gửi Vote';
        }
    }

    // Refresh heatmap
    const poll = state.meetingPolls.find(p => String(p.id) === String(pollId));
    if (poll) buildHeatmapGrid(poll);
    renderMeetingPolls();
}

// ==========================================
// HEATMAP 
// ==========================================
function buildHeatmapGrid(poll) {
    const gridEl = document.getElementById('heatmap-time-grid');
    const summaryEl = document.getElementById('heatmap-voters-summary');
    const optimalCard = document.getElementById('optimal-times-card');
    const optimalList = document.getElementById('optimal-times-list');
    if (!gridEl) return;

    const days = getDaysArray(poll.startDate, poll.endDate);
    const startHour = parseInt(poll.startHour) || 8;
    const endHour = parseInt(poll.endHour) || 22;
    const pollId = poll.id;

    // Calculate vote counts per cell
    const cellCounts = {};
    const cellVoters = {};
    const allVoterNames = [];
    let maxCount = 0;

    state.meetingVotes.forEach(v => {
        if (String(v.pollId || v.pollid) !== String(pollId)) return;
        const avail = safeJsonParse(v.availability, {});
        const name = v.userName || v.username || 'Ẩn danh';
        if (!allVoterNames.includes(name)) allVoterNames.push(name);

        Object.keys(avail).forEach(key => {
            if (avail[key]) {
                cellCounts[key] = (cellCounts[key] || 0) + 1;
                if (!cellVoters[key]) cellVoters[key] = [];
                cellVoters[key].push(name);
                if (cellCounts[key] > maxCount) maxCount = cellCounts[key];
            }
        });
    });

    // Render voters summary
    if (summaryEl) {
        if (allVoterNames.length === 0) {
            summaryEl.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">Chưa có ai vote.</span>';
        } else {
            summaryEl.innerHTML = allVoterNames.map(n =>
                `<span class="voter-chip"><span class="voter-dot"></span> ${n}</span>`
            ).join('');
        }
    }

    // Build grid
    gridEl.style.gridTemplateColumns = `60px repeat(${days.length}, minmax(52px, 1fr))`;
    gridEl.innerHTML = '';

    // Header row
    const cornerCell = document.createElement('div');
    cornerCell.className = 'time-grid-header-cell';
    cornerCell.textContent = 'Giờ';
    gridEl.appendChild(cornerCell);
    days.forEach(day => {
        const hdr = document.createElement('div');
        hdr.className = 'time-grid-header-cell';
        hdr.innerHTML = formatDateFull(day);
        gridEl.appendChild(hdr);
    });

    // Time rows
    const allSlots = [];
    for (let h = startHour; h < endHour; h++) {
        const label = document.createElement('div');
        label.className = 'time-grid-hour-label';
        label.textContent = `${String(h).padStart(2, '0')}:00`;
        gridEl.appendChild(label);

        days.forEach(day => {
            const key = `${day}_${h}`;
            const count = cellCounts[key] || 0;
            const heatLevel = maxCount > 0 ? Math.ceil((count / maxCount) * 5) : 0;

            const cell = document.createElement('div');
            cell.className = `time-cell heat-${heatLevel} heat-count ${count > 0 ? 'has-voters' : ''}`;
            cell.textContent = count > 0 ? count : '';
            cell.style.position = 'relative';
            cell.style.cursor = count > 0 ? 'pointer' : 'default';

            // Tooltip on hover
            if (count > 0) {
                cell.addEventListener('mouseenter', () => {
                    const voters = cellVoters[key] || [];
                    const tooltip = document.createElement('div');
                    tooltip.className = 'heat-tooltip';
                    tooltip.innerHTML = `<strong>${count} người rảnh</strong><br>${voters.join(', ')}`;
                    cell.appendChild(tooltip);
                });
                cell.addEventListener('mouseleave', () => {
                    const tt = cell.querySelector('.heat-tooltip');
                    if (tt) tt.remove();
                });
            }

            gridEl.appendChild(cell);

            if (count > 0) {
                allSlots.push({
                    key, count, day, hour: h,
                    voters: cellVoters[key] || []
                });
            }
        });
    }

    // Optimal times
    if (optimalCard && optimalList) {
        if (allSlots.length === 0) {
            optimalCard.style.display = 'none';
        } else {
            optimalCard.style.display = 'block';
            // Group consecutive hours on same day
            allSlots.sort((a, b) => b.count - a.count || a.day.localeCompare(b.day) || a.hour - b.hour);
            const top = allSlots.slice(0, 5);
            optimalList.innerHTML = top.map((slot, i) => `
                <div class="optimal-time-item">
                    <div class="optimal-time-rank">${i + 1}</div>
                    <div class="optimal-time-info">
                        <div class="optimal-time-label">${formatDateFull(slot.day)} — ${String(slot.hour).padStart(2, '0')}:00 → ${String(slot.hour + 1).padStart(2, '0')}:00</div>
                        <div class="optimal-time-voters">${slot.voters.join(', ')}</div>
                    </div>
                    <div class="optimal-time-count">${slot.count} <span style="font-size:0.7rem;color:var(--text-muted)">người</span></div>
                </div>
            `).join('');
        }
    }
}

// ==========================================
// SHARE LINK
// ==========================================
function copyPollShareLinkById(pollId) {
    const url = `${window.location.origin}${window.location.pathname}#poll=${pollId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast('Đã sao chép link vote vào clipboard!', 'success');
    }).catch(() => {
        prompt('Sao chép link này:', url);
    });
}

function copyPollShareLink() {
    if (state.activePollId) {
        copyPollShareLinkById(state.activePollId);
    }
}

// Patch completeLogin to handle deep link after auth
const _originalCompleteLoginForMeeting = completeLogin;
completeLogin = function() {
    _originalCompleteLoginForMeeting.apply(this, arguments);
    setTimeout(handlePendingPollDeepLink, 500);
};
