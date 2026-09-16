// Authentication System
let currentUser = null;

const DEFAULT_AVATAR = 'https://picsum.photos/seed/user/40/40.jpg';

function persistCurrentUser() {
    if (currentUser) {
        localStorage.setItem('userInfo', JSON.stringify(currentUser));
    }
}

function getDefaultAvatar(email) {
    const seed = encodeURIComponent(email || 'user');
    return `https://picsum.photos/seed/${seed}/100/100.jpg`;
}

function formatProfileDate(dateString) {
    if (!dateString) return '-';
    try {
        return new Date(dateString).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    } catch {
        return '-';
    }
}

function getProviderLabel(provider) {
    return provider === 'google' ? 'Google' : 'Email';
}

// ------------------------------------------------------------------
// Backend auth calls (login/register/googleLogin/authCheck)
// ------------------------------------------------------------------

const _AUTH_URL = (() => {
    const h = window.location.hostname || '';
    return (h.indexOf('netlify.app') !== -1) ? '/.netlify/functions/api' : 'api.php';
})();

async function authBackendPost(body) {
    const token = localStorage.getItem('userToken');
    const res = await fetch(_AUTH_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!res.ok) {
        const err = new Error(data?.message || data?.error || ('Auth error ' + res.status));
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

/** Login via backend; returns { token, user }. Throws on failure. */
async function authBackendLogin(email, password, remember) {
    const data = await authBackendPost({ action: 'login', email, password, remember: !!remember });
    localStorage.setItem('userToken', data.token);
    localStorage.setItem('userInfo', JSON.stringify(data.user));
    return data;
}

async function authBackendRegister(name, email, password, remember) {
    const data = await authBackendPost({ action: 'register', name, email, password, remember: !!remember });
    localStorage.setItem('userToken', data.token);
    localStorage.setItem('userInfo', JSON.stringify(data.user));
    return data;
}

async function authBackendGoogleLogin(credential) {
    const data = await authBackendPost({ action: 'googleLogin', credential });
    localStorage.setItem('userToken', data.token);
    localStorage.setItem('userInfo', JSON.stringify(data.user));
    return data;
}

/** Validate stored token with backend (call on page load). */
async function authBackendValidateSession() {
    try {
        await authBackendPost({ action: 'authCheck' });
        return true;
    } catch {
        return false;
    }
}

// ------------------------------------------------------------------
// Check local auth state (localStorage) — dipanggil setiap kali UI diupdate
// ------------------------------------------------------------------
let _wasLoggedIn = false;

function checkAuthStatus() {
    const token = localStorage.getItem('userToken');
    const info  = localStorage.getItem('userInfo');
    if (token && info) {
        try {
            currentUser = JSON.parse(info);
            return true;
        } catch {
            performLogout();
            return false;
        }
    }
    return false;
}

function getCurrentUser() {
    return currentUser;
}

function updateAuthUI() {
    const isLoggedIn = checkAuthStatus();
    const userDisplay = document.getElementById('userDisplay');
    const loginBtn    = document.getElementById('loginBtn');
    const logoutBtn   = document.getElementById('logoutBtn');

    if (isLoggedIn && currentUser) {
        if (!_wasLoggedIn && typeof syncKeysFromSupabase === 'function') {
            syncKeysFromSupabase();
        }
        _wasLoggedIn = true;
        const avatar = currentUser.picture || getDefaultAvatar(currentUser.email);
        if (userDisplay) {
            const userName  = currentUser.name || 'User';
            const userEmail = currentUser.email || '';
            userDisplay.innerHTML = `
                <div class="dropdown">
                    <button class="btn btn-link p-0 d-flex align-items-center" type="button" id="userDropdown" data-bs-toggle="dropdown" aria-expanded="false" style="text-decoration: none; cursor: pointer;" aria-label="Menu akun ${userName}">
                        <span class="text-white user-name d-none d-md-inline-block me-2" title="${userName}">${userName}</span>
                        <img src="${avatar}" alt="${userName}" class="rounded-circle user-avatar">
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow border-0" aria-labelledby="userDropdown">
                        <li>
                            <div class="user-menu-header">
                                <img src="${avatar}" alt="${userName}" class="rounded-circle">
                                <div class="min-w-0">
                                    <div class="fw-bold text-truncate">${userName}</div>
                                    <small class="text-muted text-truncate d-block" style="max-width: 200px;">${userEmail}</small>
                                </div>
                            </div>
                        </li>
                        <li><hr class="dropdown-divider my-1"></li>
                        <li><a class="dropdown-item" href="#" onclick="showProfileModal(); return false;"><i class="bi bi-person-circle"></i> Lihat Profil</a></li>
                        <li><a class="dropdown-item" href="#" onclick="showEditProfileModal(); return false;"><i class="bi bi-pencil-square"></i> Edit Profil</a></li>
                        <li><hr class="dropdown-divider my-1"></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="logout(); return false;"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
                    </ul>
                </div>
            `;
            userDisplay.style.display = 'flex';
        }
        if (loginBtn) loginBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'none';
        enableFeatures();
    } else {
        _wasLoggedIn = false;
        if (userDisplay) userDisplay.style.display = 'none';
        if (loginBtn) loginBtn.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        disableFeatures();
    }
}

// ------------------------------------------------------------------
// Profil modals
// ------------------------------------------------------------------
function showProfileModal() {
    if (!checkAuthStatus() || !currentUser) { showLoginRequired('profil'); return; }
    const modalEl = document.getElementById('profileViewModal');
    if (!modalEl) return;
    const avatar = currentUser.picture || getDefaultAvatar(currentUser.email);
    document.getElementById('profileViewAvatar').src = avatar;
    document.getElementById('profileViewName').textContent = currentUser.name || '-';
    document.getElementById('profileViewEmail').textContent = currentUser.email || '-';
    document.getElementById('profileViewPhone').textContent = currentUser.phone || '-';
    document.getElementById('profileViewBio').textContent = currentUser.bio || '-';
    document.getElementById('profileViewJoined').textContent = formatProfileDate(currentUser.createdAt);
    const providerBadge = document.getElementById('profileViewProvider');
    providerBadge.textContent = getProviderLabel(currentUser.provider);
    providerBadge.className = `badge mb-3 ${currentUser.provider === 'google' ? 'bg-danger' : 'bg-primary'}`;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function showEditProfileModal() {
    if (!checkAuthStatus() || !currentUser) { showLoginRequired('edit profil'); return; }
    const viewModalEl = document.getElementById('profileViewModal');
    if (viewModalEl) {
        const viewModal = bootstrap.Modal.getInstance(viewModalEl);
        if (viewModal) viewModal.hide();
    }
    const modalEl = document.getElementById('profileEditModal');
    if (!modalEl) return;
    const avatar = currentUser.picture || getDefaultAvatar(currentUser.email);
    const isGoogleUser = currentUser.provider === 'google';
    document.getElementById('profileEditAvatarPreview').src = avatar;
    document.getElementById('profileEditName').value = currentUser.name || '';
    document.getElementById('profileEditEmail').value = currentUser.email || '';
    document.getElementById('profileEditPhone').value = currentUser.phone || '';
    document.getElementById('profileEditBio').value = currentUser.bio || '';
    document.getElementById('profileEditPicture').value = currentUser.picture || '';
    const emailInput  = document.getElementById('profileEditEmail');
    const emailHint   = document.getElementById('profileEditEmailHint');
    emailInput.readOnly = isGoogleUser;
    emailHint.textContent = isGoogleUser ? 'Email Google tidak dapat diubah.' : 'Email digunakan untuk login.';
    document.getElementById('profileEditCurrentPassword').value = '';
    document.getElementById('profileEditNewPassword').value = '';
    document.getElementById('profileEditConfirmPassword').value = '';
    document.getElementById('profilePasswordSection').style.display = isGoogleUser ? 'none' : 'block';
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function updateProfileAvatarPreview() {
    const preview     = document.getElementById('profileEditAvatarPreview');
    const pictureInput = document.getElementById('profileEditPicture');
    if (!preview || !pictureInput) return;
    preview.src = pictureInput.value.trim() || getDefaultAvatar(currentUser?.email);
}

async function saveProfile(event) {
    event.preventDefault();
    if (!checkAuthStatus() || !currentUser) { showLoginRequired('edit profil'); return; }
    const name     = document.getElementById('profileEditName').value.trim();
    const email    = document.getElementById('profileEditEmail').value.trim();
    const phone    = document.getElementById('profileEditPhone').value.trim();
    const bio      = document.getElementById('profileEditBio').value.trim();
    const picture  = document.getElementById('profileEditPicture').value.trim();
    const currentPw = document.getElementById('profileEditCurrentPassword').value;
    const newPw     = document.getElementById('profileEditNewPassword').value;
    const confirmPw = document.getElementById('profileEditConfirmPassword').value;

    if (!name) {
        Swal.fire({ icon: 'warning', title: 'Nama wajib diisi', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
        return;
    }
    const isGoogleUser = currentUser.provider === 'google';

    // Ubah password via backend (hanya email user)
    if (!isGoogleUser && (newPw || confirmPw || currentPw)) {
        if (!currentPw) { Swal.fire({ icon: 'warning', title: 'Masukkan password saat ini' }); return; }
        if (newPw.length < 6) { Swal.fire({ icon: 'warning', title: 'Password baru minimal 6 karakter' }); return; }
        if (newPw !== confirmPw) { Swal.fire({ icon: 'warning', title: 'Konfirmasi password tidak cocok' }); return; }
        try {
            await authBackendPost({ action: 'changePassword', current_password: currentPw, new_password: newPw });
            Swal.fire({ icon: 'success', title: 'Password diubah', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
        } catch (e) {
            Swal.fire({ icon: 'error', title: e.message || 'Gagal mengubah password' });
            return;
        }
    }

    // Update profile via Neon (kebutuhan cross-device)
    currentUser.name = name;
    currentUser.phone = phone;
    currentUser.bio   = bio;
    currentUser.picture = picture || getDefaultAvatar(isGoogleUser ? (currentUser.email || email) : email);
    if (!isGoogleUser) currentUser.email = email;
    persistCurrentUser();
    updateAuthUI();
    if (typeof neonSaveProfile === 'function') {
        neonSaveProfile({
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.phone,
            bio: currentUser.bio,
            picture: currentUser.picture,
            provider: currentUser.provider || 'email',
        });
    }
    const editModal = bootstrap.Modal.getInstance(document.getElementById('profileEditModal'));
    if (editModal) editModal.hide();
    Swal.fire({ icon: 'success', title: 'Profil berhasil diperbarui!', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
}

async function syncProfileFromNeon() {
    if (typeof neonLoadProfile !== 'function') return false;
    if (!checkAuthStatus() || !currentUser) return false;
    try {
        const cloud = await neonLoadProfile();
        if (cloud && (cloud.name || cloud.phone || cloud.bio || cloud.picture || cloud.email)) {
            currentUser.name    = cloud.name    || currentUser.name;
            currentUser.phone   = cloud.phone   || currentUser.phone;
            currentUser.bio     = cloud.bio     || currentUser.bio;
            currentUser.picture = cloud.picture || currentUser.picture;
            currentUser.provider = currentUser.provider || cloud.provider;
            if (cloud.email && currentUser.provider !== 'google') currentUser.email = cloud.email;
            persistCurrentUser();
            updateAuthUI();
            return true;
        }
    } catch (e) { console.warn('Profile sync failed:', e.message); }
    return false;
}

// ------------------------------------------------------------------
// Features gating
// ------------------------------------------------------------------
function enableFeatures() {
    const chatInput = document.getElementById('messageInput');
    if (chatInput) chatInput.disabled = false;
}

function disableFeatures() {
    const chatInput = document.getElementById('messageInput');
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Silakan login terlebih dahulu...';
    }
}

// ------------------------------------------------------------------
// Logout
// ------------------------------------------------------------------
function logout() {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'question',
            title: 'Konfirmasi Logout',
            text: 'Apakah Anda yakin ingin keluar dari sistem?',
            showCancelButton: true,
            confirmButtonText: 'Ya, Logout',
            cancelButtonText: 'Batal',
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
        }).then((r) => { if (r.isConfirmed) performLogout(); });
    } else if (confirm('Apakah Anda yakin ingin keluar dari sistem?')) {
        performLogout();
    }
}

function performLogout() {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('aiApiKeys');
    currentUser = null;
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'success', title: 'Logout Berhasil', text: 'Anda telah keluar dari sistem.',
            timer: 2000, showConfirmButton: false,
            willClose: () => setTimeout(() => window.location.href = 'login.html', 500),
        });
    } else {
        alert('Logout berhasil! Anda akan dialihkan ke halaman login.');
        setTimeout(() => window.location.href = 'login.html', 1000);
    }
}

function redirectToLogin() { window.location.href = 'login.html'; }

function initAuth() {
    updateAuthUI();
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    if (loginBtn) loginBtn.addEventListener('click', redirectToLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);

    // Validasi token dengan backend saat halaman pertama kali dimuat.
    // Jika token tidak valid → logout client.
    if (checkAuthStatus()) {
        authBackendValidateSession().then(valid => {
            if (!valid) { console.warn('Session expired'); performLogout(); }
        }).catch(() => {});
    }
}

function canAccessFeature() { return checkAuthStatus(); }

function showLoginRequired(featureName) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'warning', title: 'Login Diperlukan',
            text: `Anda harus login untuk menggunakan fitur ${featureName}.`,
            confirmButtonText: 'Login', cancelButtonText: 'Batal',
            showCancelButton: true, confirmButtonColor: '#667eea',
        }).then((r) => { if (r.isConfirmed) redirectToLogin(); });
    }
}

// Legacy login/register functions (hanya tampil di login.html — login.html dipisah)
// Di script.js / index.html: tidak dipanggil lagi karena auth.js menyediakan yang baru.

window.authSystem = {
    checkAuthStatus,
    getCurrentUser,
    updateAuthUI,
    showProfileModal,
    showEditProfileModal,
    saveProfile,
    updateProfileAvatarPreview,
    logout,
    redirectToLogin,
    canAccessFeature,
    showLoginRequired,
    initAuth,
};