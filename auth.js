// Authentication System
let currentUser = null;

const DEFAULT_AVATAR = 'https://picsum.photos/seed/user/40/40.jpg';

function getUsersFromStorage() {
    try {
        return JSON.parse(localStorage.getItem('users') || '[]');
    } catch (error) {
        console.error('Error reading users:', error);
        return [];
    }
}

function saveUsersToStorage(users) {
    localStorage.setItem('users', JSON.stringify(users));
}

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
    } catch (error) {
        return '-';
    }
}

function getProviderLabel(provider) {
    if (provider === 'google') return 'Google';
    return 'Email';
}

// Check auth status
function checkAuthStatus() {
    const userToken = localStorage.getItem('userToken');
    const userInfo = localStorage.getItem('userInfo');
    
    if (userToken && userInfo) {
        try {
            currentUser = JSON.parse(userInfo);
            
            if (currentUser.provider === 'google') {
                console.log('Google user logged in:', currentUser.email);
            }
            
            return true;
        } catch (error) {
            console.error('Error parsing user info:', error);
            logout();
            return false;
        }
    }
    return false;
}

// Get current user
function getCurrentUser() {
    return currentUser;
}

// Track previous login state to detect login transitions
let _wasLoggedIn = false;

// Update UI based on auth status
function updateAuthUI() {
    const isLoggedIn = checkAuthStatus();
    const userDisplay = document.getElementById('userDisplay');
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    console.log('Updating auth UI - Logged in:', isLoggedIn, 'User:', currentUser);
    
    if (isLoggedIn && currentUser) {
        // Auto-sync keys from Supabase when user logs in or on fresh device
        if (!_wasLoggedIn && typeof syncKeysFromSupabase === 'function') {
            console.log(' Login detected - syncing keys from Supabase...');
            syncKeysFromSupabase();
        }
        _wasLoggedIn = true;
        const avatar = currentUser.picture || getDefaultAvatar(currentUser.email);
        
        if (userDisplay) {
            const userName = currentUser.name || 'User';
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

function showProfileModal() {
    if (!checkAuthStatus() || !currentUser) {
        showLoginRequired('profil');
        return;
    }
    
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
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function showEditProfileModal() {
    if (!checkAuthStatus() || !currentUser) {
        showLoginRequired('edit profil');
        return;
    }
    
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
    
    const emailInput = document.getElementById('profileEditEmail');
    const emailHint = document.getElementById('profileEditEmailHint');
    emailInput.readOnly = isGoogleUser;
    emailHint.textContent = isGoogleUser
        ? 'Email Google tidak dapat diubah.'
        : 'Email digunakan untuk login.';
    
    document.getElementById('profileEditCurrentPassword').value = '';
    document.getElementById('profileEditNewPassword').value = '';
    document.getElementById('profileEditConfirmPassword').value = '';
    
    const passwordSection = document.getElementById('profilePasswordSection');
    passwordSection.style.display = isGoogleUser ? 'none' : 'block';
    
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

function updateProfileAvatarPreview() {
    const preview = document.getElementById('profileEditAvatarPreview');
    const pictureInput = document.getElementById('profileEditPicture');
    if (!preview || !pictureInput) return;
    
    const url = pictureInput.value.trim();
    preview.src = url || getDefaultAvatar(currentUser?.email);
}

function saveProfile(event) {
    event.preventDefault();
    
    if (!checkAuthStatus() || !currentUser) {
        showLoginRequired('edit profil');
        return;
    }
    
    const name = document.getElementById('profileEditName').value.trim();
    const email = document.getElementById('profileEditEmail').value.trim();
    const phone = document.getElementById('profileEditPhone').value.trim();
    const bio = document.getElementById('profileEditBio').value.trim();
    const picture = document.getElementById('profileEditPicture').value.trim();
    const currentPassword = document.getElementById('profileEditCurrentPassword').value;
    const newPassword = document.getElementById('profileEditNewPassword').value;
    const confirmPassword = document.getElementById('profileEditConfirmPassword').value;
    
    if (!name) {
        Swal.fire({ icon: 'warning', title: 'Nama wajib diisi', toast: true, position: 'top-end', timer: 2500, showConfirmButton: false });
        return;
    }
    
    const isGoogleUser = currentUser.provider === 'google';
    const users = getUsersFromStorage();
    const originalEmail = currentUser.email;
    let dbUser = users.find(u => u.email === originalEmail);
    
    if (!isGoogleUser) {
        if (email !== originalEmail && users.some(u => u.email === email)) {
            Swal.fire({ icon: 'error', title: 'Email sudah digunakan', text: 'Gunakan email lain.' });
            return;
        }
        
        if (newPassword || confirmPassword || currentPassword) {
            if (!currentPassword) {
                Swal.fire({ icon: 'warning', title: 'Masukkan password saat ini' });
                return;
            }
            if (newPassword.length < 6) {
                Swal.fire({ icon: 'warning', title: 'Password baru minimal 6 karakter' });
                return;
            }
            if (newPassword !== confirmPassword) {
                Swal.fire({ icon: 'warning', title: 'Konfirmasi password tidak cocok' });
                return;
            }
            if (!dbUser || dbUser.password !== currentPassword) {
                Swal.fire({ icon: 'error', title: 'Password saat ini salah' });
                return;
            }
            dbUser.password = newPassword;
        }
    }
    
    currentUser.name = name;
    currentUser.phone = phone;
    currentUser.bio = bio;
    currentUser.picture = picture || getDefaultAvatar(isGoogleUser ? originalEmail : email);
    
    if (!isGoogleUser) {
        currentUser.email = email;
    }
    
    if (dbUser) {
        dbUser.name = name;
        dbUser.phone = phone;
        dbUser.bio = bio;
        dbUser.picture = currentUser.picture;
        if (!isGoogleUser) dbUser.email = email;
        saveUsersToStorage(users);
    } else if (!isGoogleUser) {
        users.push({
            id: currentUser.id || Date.now(),
            name,
            email,
            phone,
            bio,
            picture: currentUser.picture,
            password: dbUser?.password || '',
            createdAt: currentUser.createdAt || new Date().toISOString()
        });
        saveUsersToStorage(users);
    }
    
    persistCurrentUser();
    updateAuthUI();

    // Sync profile to Neon (cross-device)
    if (typeof neonSaveProfile === 'function') {
        neonSaveProfile({
            name: currentUser.name,
            email: currentUser.email,
            phone: currentUser.phone,
            bio: currentUser.bio,
            picture: currentUser.picture,
            provider: currentUser.provider || 'email'
        });
    }

    const editModal = bootstrap.Modal.getInstance(document.getElementById('profileEditModal'));
    if (editModal) editModal.hide();
    
    Swal.fire({
        icon: 'success',
        title: 'Profil berhasil diperbarui!',
        toast: true,
        position: 'top-end',
        timer: 2500,
        showConfirmButton: false
    });
}

// Sinkronisasi profil dari Neon (cross-device)  dipanggil saat load/login
async function syncProfileFromNeon() {
    if (typeof neonLoadProfile !== 'function') return false;
    if (!checkAuthStatus() || !currentUser) return false;
    try {
        const cloud = await neonLoadProfile();
        if (cloud && (cloud.name || cloud.phone || cloud.bio || cloud.picture || cloud.email)) {
            currentUser.name = cloud.name || currentUser.name;
            currentUser.phone = cloud.phone || currentUser.phone;
            currentUser.bio = cloud.bio || currentUser.bio;
            currentUser.picture = cloud.picture || currentUser.picture;
            currentUser.provider = currentUser.provider || cloud.provider;
            if (cloud.email && currentUser.provider !== 'google') {
                currentUser.email = cloud.email;
            }
            persistCurrentUser();
            updateAuthUI();
            return true;
        }
    } catch (e) {
        console.warn(' Profile sync failed:', e.message);
    }
    return false;
}

// Enable features for logged-in users
function enableFeatures() {
    const chatInput = document.getElementById('messageInput');
    const sttBtn = document.getElementById('sttButton');
    const ttsBtn = document.getElementById('ttsButton');
    
    if (chatInput) chatInput.disabled = false;
    if (sttBtn) sttBtn.disabled = false;
    if (ttsBtn) ttsBtn.disabled = false;
}

// Disable features for non-logged-in users
function disableFeatures() {
    const chatInput = document.getElementById('messageInput');
    const sttBtn = document.getElementById('sttButton');
    const ttsBtn = document.getElementById('ttsButton');
    
    if (chatInput) {
        chatInput.disabled = true;
        chatInput.placeholder = 'Silakan login terlebih dahulu...';
    }
    if (sttBtn) sttBtn.disabled = true;
    if (ttsBtn) ttsBtn.disabled = true;
}

// Logout function
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
            cancelButtonColor: '#6c757d'
        }).then((result) => {
            if (result.isConfirmed) {
                performLogout();
            }
        });
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
            icon: 'success',
            title: 'Logout Berhasil',
            text: 'Anda telah keluar dari sistem.',
            timer: 2000,
            showConfirmButton: false,
            willClose: () => {
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 500);
            }
        });
    } else {
        alert('Logout berhasil! Anda akan dialihkan ke halaman login.');
        setTimeout(() => {
            window.location.href = 'login.html';
        }, 1000);
    }
}

function redirectToLogin() {
    window.location.href = 'login.html';
}

function initAuth() {
    updateAuthUI();
    
    const loginBtn = document.getElementById('loginBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    if (loginBtn) loginBtn.addEventListener('click', redirectToLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
}

function canAccessFeature() {
    return checkAuthStatus();
}

function showLoginRequired(featureName) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'warning',
            title: 'Login Diperlukan',
            text: `Anda harus login untuk menggunakan fitur ${featureName}.`,
            confirmButtonText: 'Login',
            cancelButtonText: 'Batal',
            showCancelButton: true,
            confirmButtonColor: '#667eea'
        }).then((result) => {
            if (result.isConfirmed) {
                redirectToLogin();
            }
        });
    }
}

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
    initAuth
};
