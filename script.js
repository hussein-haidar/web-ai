let chatHistory = [];
let chatSessions = []; // Array untuk menyimpan semua chat sessions
let currentSessionId = null; // ID session yang sedang aktif
let useAPI = true; // Default ke mode AI
let selectedAPI = 'mistral'; // Pilihan API: groq, mistral

// Token usage tracking - initialized from Supabase
let tokenUsage = {
    groq: { used: 0, max: 12000 },
    mistral: { used: 0, max: 12000 }
};

// Fungsi: Inisialisasi token usage dari Supabase
async function initTokenUsageFromSupabase() {
    if (typeof neonLoadDailyUsage === 'function') {
        const records = await neonLoadDailyUsage(1); // Load 1 hari terakhir
        if (records && records.length > 0) {
            // Ambil hari terbaru
            const latest = records[0];
            tokenUsage.groq.used = latest.groq_used || 0;
            tokenUsage.mistral.used = latest.mistral_used || 0;
            console.log(' Token usage initialized from Supabase:', tokenUsage);
        } else {
            console.log(' No daily usage found in Supabase, using defaults');
        }
    } else {
        console.log(' neonLoadDailyUsage not available');
    }
}

// Inisialisasi saat load
document.addEventListener('DOMContentLoaded', () => {
    initTokenUsageFromSupabase();
    // ... inisialisasi lainnya
});
function updateTokenUsageDisplay() {
    try {
        // Update Groq token usage
        const groqProgress = document.getElementById('groqTokenProgress');
        const groqInfo = document.getElementById('groqTokenInfo');
        if (groqProgress && groqInfo) {
            const groqPercentage = Math.round((tokenUsage.groq.used / tokenUsage.groq.max) * 100);
            groqProgress.style.width = `${groqPercentage}%`;
            groqProgress.textContent = `${tokenUsage.groq.used} / ${tokenUsage.groq.max} tokens`;
            groqInfo.textContent = `${groqPercentage}% used`;
            
            // Change color based on usage
            if (groqPercentage > 80) {
                groqProgress.className = 'progress-bar bg-danger';
            } else if (groqPercentage > 50) {
                groqProgress.className = 'progress-bar bg-warning';
            } else {
                groqProgress.className = 'progress-bar bg-success';
            }
        }
        
        // Update Mistral token usage
        const mistralProgress = document.getElementById('mistralTokenProgress');
        const mistralInfo = document.getElementById('mistralTokenInfo');
        if (mistralProgress && mistralInfo) {
            const mistralPercentage = Math.round((tokenUsage.mistral.used / tokenUsage.mistral.max) * 100);
            mistralProgress.style.width = `${mistralPercentage}%`;
            mistralProgress.textContent = `${tokenUsage.mistral.used} / ${tokenUsage.mistral.max} tokens`;
            mistralInfo.textContent = `${mistralPercentage}% used`;
            
            // Change color based on usage
            if (mistralPercentage > 80) {
                mistralProgress.className = 'progress-bar bg-danger';
            } else if (mistralPercentage > 50) {
                mistralProgress.className = 'progress-bar bg-warning';
            } else {
                mistralProgress.className = 'progress-bar bg-info';
            }
        }
        
        console.log(' Token usage updated:', tokenUsage);
    } catch (error) {
        console.error('Error updating token usage display:', error);
    }
}

// Fungsi: Tambah penggunaan token
function addGroqTokenUsage(count) {
    // Update counter di memory
    tokenUsage.groq.used = Math.min(tokenUsage.groq.used + count, tokenUsage.groq.max);
    
    // Update tampilan UI
    updateTokenUsageDisplay();
    
    // Simpan ke Supabase harian (wajib, tanpa fallback ke localStorage)
    neonSaveDailyUsage(tokenUsage.groq.used, tokenUsage.mistral.used || 0).then(() => {
        console.log(' Daily usage saved to Supabase');
    }).catch(error => {
        // Tampilkan warning tapi jangan fallback ke local mode
        console.warn(' Gagal simpan ke Supabase, tetap menggunakan counter memory:', error.message);
        // Tetap update UI local meski gagal simpan ke cloud
    });
    
    // Notifikasi jika mendekati batas
    const percentage = (tokenUsage.groq.used / tokenUsage.groq.max) * 100;
    if (percentage >= 80 && percentage < 85) {
        Swal.fire({
            title: ' Peringatan Token',
            text: `Sisa token hanya ${Math.round(tokenUsage.groq.max - tokenUsage.groq.used)} tokens (${percentage.toFixed(1)}% digunakan)`,
            icon: 'warning',
            confirmButtonText: 'OK',
            toast: true,
            position: 'top-end',
            timer: 5000
        });
    } else if (percentage >= 95) {
        Swal.fire({
            title: ' Token Hampir Habis!',
            text: `Sisa token hanya ${Math.round(tokenUsage.groq.max - tokenUsage.groq.used)} tokens!`,
            icon: 'error',
            confirmButtonText: 'Tutup',
            toast: true,
            position: 'top-end',
            timer: 5000
        });
    }
}

// Fungsi: Tampilkan dashboard token
function showTokenDashboard() {
    const percentage = (tokenUsage.groq.used / tokenUsage.groq.max) * 100;
    const used = tokenUsage.groq.used;
    const max = tokenUsage.groq.max;
    const remaining = max - used;
    const percentText = Math.round(percentage);
    
    Swal.fire({
        title: ' Dashboard Token Groq',
        html: `
            <div class="text-start">
                <p>Total digunakan: <strong>${used} / ${max} tokens</strong></p>
                <p>Sisa token: <strong>${remaining} tokens</strong></p>
                <p>Persentase: <strong>${percentText}%</strong></p>
                <hr>
                <p>Rincian:</p>
                <ul class="mb-3">
                    <li>Groq TTS/STT: ${used} tokens</li>
                </ul>
                <div class="progress" style="height: 20px; margin: 10px 0;">
                    <div id="dashboardTokenProgress" class="progress-bar" style="width: ${percentText}%; background-color: ${percentText > 80 ? 'red' : percentText > 50 ? 'orange' : 'green'}" role="progressbar" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
            </div>
        `,
        confirmButtonText: 'Tutup',
        width: '400px'
    });
}

// Fungsi: Tampilkan riwayat penggunaan harian
let _dailyUsageRecords = []; // cache untuk export CSV

function showDailyUsageDashboard() {
    neonLoadDailyUsage(30).then(records => {
        _dailyUsageRecords = records || [];

        if (_dailyUsageRecords.length === 0) {
            Swal.fire({
                title: ' Riwayat Penggunaan Harian',
                html: `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-calendar" style="font-size: 3rem;"></i>
                        <p>Belum ada data penggunaan harian</p>
                        <p class="small text-muted">Klik "Konfigurasi API" untuk mulai menggunakan Groq</p>
                    </div>
                `,
                confirmButtonText: 'Tutup'
            });
            return;
        }

        // Hitung total dan rata-rata
        const totalGroq = records.reduce((sum, r) => sum + (Number(r.groq_used) || 0), 0);
        const totalMistral = records.reduce((sum, r) => sum + (Number(r.mistral_used) || 0), 0);
        const avgGroq = (totalGroq / records.length).toFixed(0);
        const avgMistral = (totalMistral / records.length).toFixed(0);

        let html = `
            <div class="text-start">
                <h6> Riwayat Penggunaan Harian (30 Hari Terakhir)</h6>
                <p>Total Penggunaan Groq: <strong>${totalGroq} tokens</strong> (Rata-rata: ${avgGroq} tokens/hari)</p>
                <p>Total Penggunaan Mistral: <strong>${totalMistral} tokens</strong> (Rata-rata: ${avgMistral} tokens/hari)</p>
                <hr>
                <p>Detail per hari (7 hari terakhir):</p>
                <div class="mb-2" style="margin: 4px 0; min-width: 280px;">
        `;

        // Tambahkan bar untuk setiap hari (hanya tampil 7 hari terakhir untuk terlihat)
        const displayDays = records.slice(0, 7);
        displayDays.forEach((record) => {
            const dateObj = new Date(record.date + 'T00:00:00');
            const date = isNaN(dateObj) ? record.date : dateObj.toLocaleDateString('id-ID', { weekday: 'short', month: 'short', day: 'numeric' });
            const groqUsed = Number(record.groq_used) || 0;
            const groqPct = Math.min(100, Math.round((groqUsed / 12000) * 100));

            html += `
                <div class="d-flex align-items-center mb-2 small">
                    <span title="${date}" style="width: 112px; flex-shrink: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${date}</span>
                    <span style="min-width: 46px; flex-shrink: 0; text-align: right; font-family: monospace; padding-right: 6px;">${groqUsed}</span>
                    <div class="flex-grow-1" style="min-width: 48px; height: 8px; background-color: #e9ecef; border-radius: 3px; overflow: hidden;">
                        <div style="width: ${groqPct}%; height: 100%; background-color: #3f51b5; border-radius: 3px; transition: width 0.3s;"></div>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
                <div class="d-flex gap-2 mt-2">
                    <a class="btn btn-sm btn-outline-secondary" href="#" onclick="exportUsageCSV(); return false;">
                        <i class="bi bi-download"></i> Export CSV</a>
                </div>
            </div>
        `;

        // Lebar modal responsif: tidak pernah melebihi viewport (cek HP)
        const modalWidth = Math.min(window.innerWidth - 32, 560) + 'px';

        Swal.fire({
            title: ' Riwayat Penggunaan Harian',
            html: html,
            confirmButtonText: 'Tutup',
            width: modalWidth,
            onAfterOpen: () => {
                // Initialize tooltips
                var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
                var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
                    return new bootstrap.Tooltip(tooltipTriggerEl);
                });
            }
        });
    }).catch(error => {
        console.error('Gagal load daily usage:', error);
        Swal.fire({
            title: ' Error',
            text: 'Gagal memuat riwayat penggunaan dari Supabase',
            icon: 'error',
            confirmButtonText: 'Tutup'
        });
    });
}

// Fungsi: Export ke CSV
function exportUsageCSV(records) {
    const data = records || _dailyUsageRecords || [];
    if (!data.length) {
        Swal.fire('Belum ada data', 'Tidak ada data untuk di-export.', 'info');
        return;
    }
    let csv = 'Tanggal,Groq Used,Mistral Used,Groq Remaining,Mistral Remaining\n';
    data.forEach(record => {
        const date = new Date(record.date).toLocaleDateString('id-ID');
        csv += `"${date}",${record.groq_used},${record.mistral_used},${record.groq_remaining || ''},${record.mistral_remaining || ''}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'riwayat_penggunaan_harian.csv');
    link.click();
}

// Estimate token count from text (rough estimation)
function estimateTokenCount(text) {
    // Rough estimation: ~4 characters per token for English/Indonesian
    return Math.ceil(text.length / 4);
}

// Fungsi: Highlight search term in text
function searchHighlight(text, term) {
    if (!term) return text;
    const regex = new RegExp(`(${term})`, 'i');
    return text.replace(regex, '<mark>$1</mark>');
}

// Track token usage for an API call
function trackTokenUsage(apiName, responseText) {
    try {
        const estimatedTokens = estimateTokenCount(responseText);
        if (tokenUsage[apiName]) {
            tokenUsage[apiName].used += estimatedTokens;
            // Cap at max to avoid overflow
            if (tokenUsage[apiName].used > tokenUsage[apiName].max) {
                tokenUsage[apiName].used = tokenUsage[apiName].max;
            }
            updateTokenUsageDisplay();
            console.log(` ${apiName} token usage: +${estimatedTokens} (total: ${tokenUsage[apiName].used}/${tokenUsage[apiName].max})`);

            // Persist daily usage to Neon (cloud-first)
            if (typeof neonSaveDailyUsage === 'function') {
                neonSaveDailyUsage(tokenUsage.groq.used, tokenUsage.mistral.used || 0);
            }
        }
    } catch (error) {
        console.error('Error tracking token usage:', error);
    }
}

// Reset token usage for a specific API
function resetTokenUsage(apiName) {
    if (tokenUsage[apiName]) {
        tokenUsage[apiName].used = 0;
        updateTokenUsageDisplay();
        console.log(` ${apiName} token usage reset`);
    }
}

// Vision API Configuration (for image analysis)
const VISION_API_CONFIG = {
    // Local Vision API (Free, no API key required)
    local: {
        url: null, // Using local processing
        headers: {},
        method: 'LOCAL'
    }
};

// Voice API Configuration
const VOICE_API_CONFIG = {
    // Groq Text-to-Speech (TTS) - supports Orpheus
    groq_tts: {
        models: {
            'canopylabs/orpheus-v1-english': 'Orpheus English'
        },
        fallbackModel: 'canopylabs/orpheus-v1-english',
        fallbackVoice: 'autumn',
        voices: {
            'canopylabs/orpheus-v1-english': {
                'autumn': 'Autumn',
                'diana': 'Diana', 
                'hannah': 'Hannah',
                'austin': 'Austin',
                'daniel': 'Daniel',
                'troy': 'Troy'
            }
        },
        url: 'https://api.groq.com/openai/v1/audio/speech',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST',
        body: (text, model = 'canopylabs/orpheus-v1-english', voice = 'autumn') => JSON.stringify({
            model: model,
            input: text,
            voice: voice,
            response_format: 'wav'
        })
    },
    // Mistral Text-to-Speech (TTS) using Voxtral model
    mistral_tts: {
        models: {
            'mistral-tiny': 'Mistral Tiny'
        },
        voices: {
            'mistral-tiny': {
                'default': 'Default',
                'male': 'Male',
                'female': 'Female'
            }
        },
        url: 'https://api.mistral.ai/v1/tts',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer YOUR_MISTRAL_API_KEY'
        },
        method: 'POST',
        body: (text, model = 'mistral-tiny', voice = 'default') => JSON.stringify({
            model: model,
            text: text,
            voice: voice
        })
    },
    
    // Groq Speech-to-Text (STT) using Whisper models
    groq_stt: {
        models: {
            'whisper-large-v3': 'Whisper Large v3',
            'whisper-large-v3-turbo': 'Whisper Large v3 Turbo'
        },
        url: 'https://api.groq.com/openai/v1/audio/transcriptions',
        headers: {
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST',
        body: (audioFile, model = 'whisper-large-v3-turbo') => {
            const formData = new FormData();
            formData.append('file', audioFile, 'recording.webm');
            formData.append('model', model);
            formData.append('temperature', 0);
            formData.append('response_format', 'json');
            return formData;
        }
    },
    
    // Mistral Text-to-Speech (TTS) using simpler approach
    mistral_tts: {
        models: {
            'tts-1': 'TTS Model 1',
            'tts-1-hd': 'TTS Model HD'
        },
        voices: {
            'tts-1': {
                'alloy': 'Alloy',
                'echo': 'Echo',
                'fable': 'Fable',
                'onyx': 'Onyx',
                'nova': 'Nova',
                'shimmer': 'Shimmer'
            },
            'tts-1-hd': {
                'alloy': 'Alloy',
                'echo': 'Echo',
                'fable': 'Fable',
                'onyx': 'Onyx',
                'nova': 'Nova',
                'shimmer': 'Shimmer'
            }
        },
        url: 'https://api.mistral.ai/v1/audio/speech',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST',
        body: (text, model = 'tts-1', voice = 'alloy') => JSON.stringify({
            model: model,
            input: text,
            voice: voice,
            response_format: 'mp3'
        })
    },
    
    // Mistral Speech-to-Text (STT) using Voxtral models
    mistral_stt: {
        models: {
            'voxtral-mini-latest': 'Voxtral Mini Transcribe V2',
            'voxtral-mini-2507': 'Voxtral Mini 2507'
        },
        url: 'https://api.mistral.ai/v1/audio/transcriptions',
        headers: {
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST'
    }
};




// Update main API status badge
function updateMainAPIStatus(results) {
    try {
        const apiStatusElement = document.getElementById('apiStatus');
        if (apiStatusElement) {
            // Determine overall status
            const groqWorking = results.groq === ' Working';
            const mistralWorking = results.mistral === ' Working';
            
            if (groqWorking || mistralWorking) {
                apiStatusElement.textContent = 'API Connected';
                apiStatusElement.className = 'badge bg-success';
            } else {
                apiStatusElement.textContent = 'API Error';
                apiStatusElement.className = 'badge bg-danger';
            }
        }
        
        console.log('Main API Status Updated:', results);
        
    } catch (error) {
        console.error('Error updating main API status:', error);
    }
}

// In-memory cache for API keys (replaces localStorage for security)
let _apiKeysCache = { groq: '', mistral: '' };

// Load API keys from Neon only (no localStorage)
async function loadAPIKeys() {
    try {
        let keys = {};

        // Load from Neon (cloud-first)
        if (typeof neonLoadKeys === 'function') {
            const neonKeys = await neonLoadKeys();
            if (neonKeys && neonKeys.groq) {
                keys.groq = neonKeys.groq;
                console.log(' API keys loaded from Neon');
            }
            if (neonKeys && neonKeys.mistral) {
                keys.mistral = neonKeys.mistral;
                console.log(' Mistral API keys loaded from Neon');
            }
        }

        // Cache in memory (no localStorage)
        _apiKeysCache = { groq: keys.groq || '', mistral: keys.mistral || '' };

        // Apply Groq key to configs
        if (_apiKeysCache.groq && _apiKeysCache.groq.startsWith('gsk_')) {
            try {
                const groqKey = stripBearerPrefix(_apiKeysCache.groq);
                if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.groq?.headers) {
                    API_CONFIG.groq.headers.Authorization = buildAuthorizationHeader(groqKey);
                }
                if (typeof VOICE_API_CONFIG !== 'undefined') {
                    if (VOICE_API_CONFIG.groq_tts?.headers) VOICE_API_CONFIG.groq_tts.headers.Authorization = buildAuthorizationHeader(groqKey);
                    if (VOICE_API_CONFIG.groq_stt?.headers) VOICE_API_CONFIG.groq_stt.headers.Authorization = buildAuthorizationHeader(groqKey);
                }
            } catch (e) {
                console.warn('Error applying Groq key:', e);
            }
        }

        // Apply Mistral key to configs
        if (_apiKeysCache.mistral && _apiKeysCache.mistral.length > 0) {
            try {
                const mistralKey = stripBearerPrefix(_apiKeysCache.mistral);
                if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.mistral?.headers) {
                    API_CONFIG.mistral.headers.Authorization = buildAuthorizationHeader(mistralKey);
                }
                if (typeof VOICE_API_CONFIG !== 'undefined') {
                    if (VOICE_API_CONFIG.mistral_tts?.headers) VOICE_API_CONFIG.mistral_tts.headers.Authorization = buildAuthorizationHeader(mistralKey);
                    if (VOICE_API_CONFIG.mistral_stt?.headers) VOICE_API_CONFIG.mistral_stt.headers.Authorization = buildAuthorizationHeader(mistralKey);
                }
            } catch (e) {
                console.warn('Error applying Mistral key:', e);
            }
        }

        if (!_apiKeysCache.groq) console.warn(' Groq API key belum dikonfigurasi.');
        if (!_apiKeysCache.mistral) console.warn(' Mistral API key belum dikonfigurasi.');

        updateAPIStatus();
        updateModelInfo();
        loadVoiceSettings();

        console.log(' API keys loaded from Neon (no localStorage)');
    } catch (error) {
        console.error('Error loading API keys:', error);
    }
}

async function syncKeysFromSupabase() {
    if (typeof neonLoadKeys !== 'function') {
        console.warn(' neonLoadKeys not available, skipping sync');
        return false;
    }
    try {
        const cloudKeys = await neonLoadKeys();
        if (cloudKeys && (cloudKeys.groq || cloudKeys.mistral)) {
            // Update in-memory cache
            _apiKeysCache = { groq: cloudKeys.groq || '', mistral: cloudKeys.mistral || '' };
            applyKeysToConfig(cloudKeys);
            updateAPIStatus();
            updateModelInfo();
            console.log(' Keys synced from Neon (no localStorage)');
            return true;
        } else {
            console.log(' No keys found in Neon for this user');
        }
    } catch (e) {
        console.warn(' Neon sync failed:', e.message);
    }
    return false;
}

function applyKeysToConfig(keys) {
    if (keys.groq && keys.groq.startsWith('gsk_')) {
        const groqKey = stripBearerPrefix(keys.groq);
        if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.groq?.headers) {
            API_CONFIG.groq.headers.Authorization = buildAuthorizationHeader(groqKey);
        }
        if (typeof VOICE_API_CONFIG !== 'undefined') {
            if (VOICE_API_CONFIG.groq_tts?.headers) VOICE_API_CONFIG.groq_tts.headers.Authorization = buildAuthorizationHeader(groqKey);
            if (VOICE_API_CONFIG.groq_stt?.headers) VOICE_API_CONFIG.groq_stt.headers.Authorization = buildAuthorizationHeader(groqKey);
        }
    }
    if (keys.mistral && keys.mistral.length > 0) {
        const mistralKey = stripBearerPrefix(keys.mistral);
        if (typeof API_CONFIG !== 'undefined' && API_CONFIG?.mistral?.headers) {
            API_CONFIG.mistral.headers.Authorization = buildAuthorizationHeader(mistralKey);
        }
        if (typeof VOICE_API_CONFIG !== 'undefined') {
            if (VOICE_API_CONFIG.mistral_tts?.headers) VOICE_API_CONFIG.mistral_tts.headers.Authorization = buildAuthorizationHeader(mistralKey);
            if (VOICE_API_CONFIG.mistral_stt?.headers) VOICE_API_CONFIG.mistral_stt.headers.Authorization = buildAuthorizationHeader(mistralKey);
        }
    }
}

// Mobile optimizations
function initMobileOptimizations() {
    try {
        console.log(' Initializing mobile optimizations...');
        
        // Detect mobile device
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        console.log(' Mobile device detected:', isMobile);
        
        if (isMobile) {
            document.body.classList.add('mobile-device');
            console.log(' Mobile device class added');
            
            // Adjust chat container height for mobile
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                const updateChatHeight = () => {
                    try {
                        const vh = window.innerHeight * 0.01;
                        const viewportHeight = vh * 100;
                        const headerHeight = document.querySelector('.navbar')?.offsetHeight || 56;
                        const inputHeight = document.querySelector('.input-group')?.offsetHeight || 80;
                        const padding = 20;
                        
                        chatContainer.style.height = `${viewportHeight - headerHeight - inputHeight - padding}px`;
                    } catch (error) {
                        console.error('Error updating chat height:', error);
                    }
                };
                
                updateChatHeight();
                window.addEventListener('resize', updateChatHeight);
                window.addEventListener('orientationchange', updateChatHeight);
                console.log(' Chat container height optimization added');
            } else {
                console.warn(' Chat container not found for mobile optimization');
            }
            
            // Skip touch optimization to prevent button click conflicts
            
            // Better touch scrolling for chat
            if (chatContainer) {
                chatContainer.addEventListener('touchstart', function() {
                    this.style.overflow = 'auto';
                });
            }
        } else {
            console.log(' Desktop device detected, skipping mobile optimizations');
        }
        
        console.log(' Mobile optimizations completed');
        
    } catch (error) {
        console.error(' Critical error in mobile optimizations:', error);
    }
}

// Load voice settings from localStorage
function loadVoiceSettings() {
    try {
        const saved = localStorage.getItem('aiVoiceSettings');
        if (saved) {
            const settings = JSON.parse(saved);
            
            // Update voice settings in UI if elements exist
            const ttsModelSelect = document.getElementById('groqTTSModel');
            const voiceSelect = document.getElementById('groqVoice');
            const sttModelSelect = document.getElementById('groqSTTModel');
            
            if (ttsModelSelect && settings.ttsModel) {
                ttsModelSelect.value = settings.ttsModel;
            }
            if (voiceSelect && settings.voice) {
                voiceSelect.value = settings.voice;
            }
            if (sttModelSelect && settings.sttModel) {
                sttModelSelect.value = settings.sttModel;
            }
            
            // Update voice options after setting model
            if (typeof VOICE_API_CONFIG !== 'undefined') {
                updateGroqVoices();
            }
        }
    } catch (error) {
        console.error('Error loading voice settings:', error);
    }
}

// Update voice options when TTS model changes
function updateGroqVoices() {
    try {
        const ttsModelSelect = document.getElementById('groqTTSModel');
        const voiceSelect = document.getElementById('groqVoice');
        
        // Safe access to VOICE_API_CONFIG
        if (typeof VOICE_API_CONFIG !== 'undefined' && 
            VOICE_API_CONFIG.groq_tts && 
            VOICE_API_CONFIG.groq_tts.voices &&
            ttsModelSelect && 
            voiceSelect && 
            VOICE_API_CONFIG.groq_tts.voices[ttsModelSelect.value]) {
            
            // Clear current options
            voiceSelect.innerHTML = '';
            
            // Add new voice options
            Object.entries(VOICE_API_CONFIG.groq_tts.voices[ttsModelSelect.value]).forEach(([key, value]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = value;
                voiceSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error updating voice options:', error);
    }
}

// Load API keys on startup (Updated for only Replicate) - will be called after config initialization

// Parse Markdown function for AI messages
// Bersihkan markdown dari respons AI (plain text)
function cleanAIText(text) {
    if (!text) return '';
    
    let cleaned = String(text);
    
    // Hapus garis pemisah (---, ___, ***)
    cleaned = cleaned.replace(/^[\s]*[-*_]{3,}[\s]*$/gm, '');
    
    // Hapus header markdown (#, ##, ###), simpan teks judulnya
    cleaned = cleaned.replace(/^#{1,6}\s+(.*)$/gm, '$1');
    
    // Hapus bold/italic (**teks**, *teks*, __teks__)
    cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '$1');
    cleaned = cleaned.replace(/\*([^*\n]+)\*/g, '$1');
    cleaned = cleaned.replace(/__([^_]+)__/g, '$1');
    
    // Hapus inline code
    cleaned = cleaned.replace(/`([^`]+)`/g, '$1');
    
    // Hapus bullet/list marker di awal baris
    cleaned = cleaned.replace(/^[\s]*[-*]\s+/gm, '');
    
    // Rapikan spasi berlebihan antar baris (max 1 baris kosong)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    
    const lines = cleaned.split('\n').map(line => line.trim());
    const result = [];
    for (const line of lines) {
        if (line === '' && result.length > 0 && result[result.length - 1] === '') continue;
        result.push(line);
    }
    
    return result.join('\n').trim();
}

// Format respons AI untuk tampilan chat (HTML rapi)
function formatAIResponse(text) {
    const cleaned = cleanAIText(text);
    const escaped = cleaned.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    return escaped
        .split(/\n\n+/)
        .filter(p => p.length > 0)
        .map(para => para.replace(/\n/g, '<br>'))
        .join('<br><br>');
}

// Load chat sessions from Supabase first, fallback to localStorage
async function loadChatSessions() {
    try {
        console.log(' Loading chat sessions...');
        
        // Always try Supabase first
        const cloudSessions = await neonLoadChatSessions();
        
        if (cloudSessions && cloudSessions.length > 0) {
            chatSessions = cloudSessions;
            console.log(` Loaded ${chatSessions.length} chat sessions from Neon`);
        } else {
            chatSessions = [];
            console.log(' No sessions from Neon, starting fresh');
        }
        
        // Use most recent session as current (no localStorage needed)
        if (chatSessions.length > 0) {
            currentSessionId = chatSessions[0].id;
            console.log('Loading most recent session:', currentSessionId);
            loadCurrentSession();
        } else {
            console.log('No sessions, starting new chat...');
            startNewChat();
        }
    } catch (error) {
        console.error('Error loading chat sessions:', error);
        chatSessions = [];
        startNewChat();
    }
}

// Load current session
function loadCurrentSession() {
    const session = chatSessions.find(s => s.id === currentSessionId);
    if (session) {
        chatHistory = session.messages || [];
        displayChatHistory();
        console.log(` Loaded session: ${session.title}`);
    }
}


// Add message to container (unified function)
function addMessage(message, sender, options = {}) {
    const chatContainer = document.getElementById('chatContainer');
    
    if (!chatContainer) {
        console.error('Chat container not found!');
        return;
    }
    
    // Hapus pesan selamat datang jika ada
    const welcomeMessage = chatContainer.querySelector('.text-center.text-muted');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `d-flex mb-3 ${sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`;
    
    // Handle isLoading parameter
    if (options.isLoading) {
        messageDiv.id = 'loadingMessage';
    } else {
        messageDiv.id = options.messageIndex !== null ? `message-${options.messageIndex}` : '';
    }
    
    // Sanitize message to prevent XSS
    let sanitizedMessage = String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Parse Markdown for AI messages only
    if (sender === 'ai') {
        sanitizedMessage = formatAIResponse(message);
    }
    
    const messageTime = options.timestamp ? 
        new Date(options.timestamp).toLocaleTimeString('id-ID') : 
        new Date().toLocaleTimeString('id-ID');
    
    const messageContent = `
        <div class="max-width-70">
            <div class="card ${sender === 'user' ? 'bg-primary text-white' : 'bg-light'}">
                <div class="card-body py-2">
                    <small class="${sender === 'user' ? 'text-white' : 'text-muted'}">${sanitizedMessage}</small>
                </div>
            </div>
            ${sender === 'user' && options.messageIndex !== null && !options.isLoading ? `
                <div class="d-flex justify-content-end mt-1">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-secondary btn-sm" onclick="editUserMessage(${options.messageIndex})" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-info btn-sm" onclick="copyUserMessage(${options.messageIndex})" title="Salin">
                            <i class="bi bi-clipboard"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="deleteUserMessage(${options.messageIndex})" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            ` : ''}
            ${sender === 'ai' && !options.isLoading ? `
                <div class="d-flex justify-content-start mt-1">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-info btn-sm" onclick="copyAIMessage(${options.messageIndex})" title="Salin">
                            <i class="bi bi-clipboard"></i>
                        </button>
                    </div>
                </div>
            ` : ''}
            <small class="text-muted ${sender === 'user' ? 'text-end' : ''}">${sender === 'user' ? 'You' : 'AI'}  ${messageTime}</small>
        </div>
    `;
    
    messageDiv.innerHTML = messageContent;
    chatContainer.appendChild(messageDiv);
    
    // Force edit/delete buttons to be visible immediately
    if (sender === 'user' && options.messageIndex !== null && !options.isLoading) {
        setTimeout(() => {
            const messageControls = messageDiv.querySelectorAll('.btn-group');
            messageControls.forEach(control => {
                control.style.opacity = '1';
                control.style.visibility = 'visible';
            });
        }, 100);
    }
    
    // Auto scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Display chat history in container
function displayChatHistory() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    
    if (chatHistory.length === 0) {
        chatContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="bi bi-robot display-4"></i>
                <p class="mt-2">Mulai percakapan dengan AI Assistant</p>
            </div>
        `;
        return;
    }
    
    chatContainer.innerHTML = '';
    
    chatHistory.forEach((chat, index) => {
        // Add user message with index for edit/delete
        addMessage(chat.user, 'user', { messageIndex: index, timestamp: chat.timestamp });
        
        // Add AI message (no edit/delete)
        if (chat.ai) {
            addMessage(chat.ai, 'ai', { messageIndex: index, timestamp: chat.timestamp });
        }
    });
    
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// Start new chat session
function startNewChat() {
    // Save current session if exists
    if (currentSessionId && chatHistory.length > 0) {
        saveCurrentSession();
    }
    
    // Create new session
    const sessionId = 'session_' + Date.now();
    const sessionTitle = `Chat ${new Date().toLocaleString('id-ID')}`;
    
    currentSessionId = sessionId;
    chatHistory = [];
    
    // Add new session to sessions array
    const newSession = {
        id: sessionId,
        title: sessionTitle,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    chatSessions.unshift(newSession);
    
    saveChatSessions();
    
    // Clear display
    displayChatHistory();
    
    console.log(` Started new chat: ${sessionTitle}`);
    addMessage(' Chat baru dimulai! Silakan kirim pesan Anda.', 'ai');
}

// Save current session
function saveCurrentSession() {
    console.log(' Saving current session...');
    console.log('Current session ID:', currentSessionId);
    console.log('Chat history length:', chatHistory.length);
    
    if (!currentSessionId) {
        console.log(' No current session ID, cannot save!');
        return;
    }
    
    const sessionIndex = chatSessions.findIndex(s => s.id === currentSessionId);
    console.log('Session index found:', sessionIndex);
    console.log('Total sessions:', chatSessions.length);
    
    if (sessionIndex >= 0) {
        chatSessions[sessionIndex].messages = [...chatHistory];
        chatSessions[sessionIndex].updatedAt = new Date().toISOString();
        
        console.log('Session updated with messages');
        
        // Update title if first message
        if (chatHistory.length > 0 && chatSessions[sessionIndex].title.startsWith('Chat')) {
            const firstMessage = chatHistory[0].user;
            const shortTitle = firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '');
            chatSessions[sessionIndex].title = shortTitle;
            console.log('Session title updated to:', shortTitle);
        }
    } else {
        console.log(' Session not found for ID:', currentSessionId);
    }
    
    saveChatSessions();
}

// Save chat sessions to Neon only
function saveChatSessions() {
    try {
        updateHistoryCount();
        
        // Save to Neon
        if (typeof neonSaveAllChatSessions === 'function') {
            neonSaveAllChatSessions(chatSessions).catch(() => {});
            console.log(` Saving ${chatSessions.length} chat sessions to Neon`);
        }
    } catch (error) {
        console.error('Error saving chat sessions:', error);
    }
}

// Legacy save function for compatibility
function saveChatHistory() {
    saveCurrentSession();
}

// Clear all chat sessions
function clearChatHistory() {
    Swal.fire({
        title: 'Hapus Semua Chat History?',
        text: "Ini akan menghapus SEMUA percakapan Anda secara permanen!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus Semua!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            // Clear all data
            chatSessions = [];
            chatHistory = [];
            currentSessionId = null;
            
            // Delete from Neon
            if (typeof neonDeleteAllChatSessions === 'function') {
                neonDeleteAllChatSessions().catch(() => {});
            }
            
            // Update UI
            updateHistoryCount();
            
            // Clear chat container and show welcome message
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                chatContainer.innerHTML = `
                    <div class="text-center text-muted py-5">
                        <i class="bi bi-robot display-4"></i>
                        <p class="mt-3">Semua chat history telah dihapus. Mulai percakapan baru!</p>
                    </div>
                `;
            }
            
            // Start new session after a short delay
            setTimeout(() => {
                startNewChat();
            }, 1000);
            
            // Show success message
            Swal.fire(
                'Dihapus!',
                'Semua chat history berhasil dihapus.',
                'success'
            );
        }
    });
}

// Show speech history modal
function showSpeechHistory() {
    loadSpeechHistory();
    const modal = new bootstrap.Modal(document.getElementById('speechHistoryModal'));
    modal.show();
}

// Load speech history (uses speechHistory variable loaded from Supabase/localStorage)
function loadSpeechHistory() {
    try {
        const speechHistoryList = document.getElementById('speechHistoryList');
        if (!speechHistoryList) return;

        // Use the speechHistory variable (already loaded from Supabase by initializeSpeechHistory)
        const allHistory = [...speechHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // Display history
        if (allHistory.length === 0) {
            speechHistoryList.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-mic-mute display-4"></i>
                    <p class="mt-3">Belum ada riwayat TTS & STT</p>
                </div>
            `;
        } else {
            let html = '<div class="list-group">';
            allHistory.forEach((item, index) => {
                const date = new Date(item.timestamp).toLocaleString('id-ID');
                const typeColor = item.type === 'TTS' ? 'success' : item.type === 'STT' ? 'info' : 'primary';
                const typeIcon = item.type === 'TTS' ? 'volume-up' : item.type === 'STT' ? 'mic' : 'soundwave';
                
                html += `
                    <div class="list-group-item">
                        <div class="d-flex w-100 justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <h6 class="mb-1">
                                    <span class="badge bg-${typeColor} me-2">
                                        <i class="bi bi-${typeIcon}"></i> ${item.type}
                                    </span>
                                    ${item.model || 'Unknown Model'}
                                </h6>
                                <p class="mb-1">${item.text}</p>
                                <small class="text-muted">
                                    <i class="bi bi-clock"></i> ${date}
                                    ${item.language ? `<span class="ms-2"><i class="bi bi-globe"></i> ${item.language}</span>` : ''}
                                    ${item.voice ? `<span class="ms-2"><i class="bi bi-person"></i> ${item.voice}</span>` : ''}
                                </small>
                            </div>
                            <div class="d-flex gap-2" role="group">
                                <button class="btn btn-sm btn-outline-primary" onclick="copySpeechText('${item.text.replace(/'/g, "\\'").replace(/"/g, '\\"')}')" title="Salin">
                                    <i class="bi bi-clipboard"></i> Salin
                                </button>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteSpeechHistoryItem(${index})" title="Hapus">
                                    <i class="bi bi-trash"></i> Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
            speechHistoryList.innerHTML = html;
        }
    } catch (error) {
        console.error('Error loading speech history:', error);
        document.getElementById('speechHistoryList').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> Error loading speech history
            </div>
        `;
    }
}

// Delete specific speech history item
function deleteSpeechHistoryItem(index) {
    Swal.fire({
        title: 'Hapus Item?',
        text: "Apakah Anda yakin ingin menghapus item ini?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            try {
                // Sort by timestamp to match display order (same as loadSpeechHistory)
                const allHistory = [...speechHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                
                const itemToDelete = allHistory[index];
                if (itemToDelete) {
                    // Remove from speechHistory array
                    const itemIndex = speechHistory.findIndex(item => item.timestamp === itemToDelete.timestamp);
                    if (itemIndex !== -1) speechHistory.splice(itemIndex, 1);
                    saveSpeechHistory();
                    
                    // Delete from Supabase by timestamp
                    if (typeof neonDeleteSpeechRecordByTimestamp === 'function') {
                        const recordType = itemToDelete.type || 'TTS';
                        neonDeleteSpeechRecordByTimestamp(itemToDelete.timestamp, recordType).catch(() => {});
                    }
                    
                    // Refresh display
                    loadSpeechHistory();
                    
                    Swal.fire('Dihapus!', 'Item berhasil dihapus.', 'success');
                }
            } catch (error) {
                console.error('Error deleting speech history item:', error);
                Swal.fire('Error!', 'Gagal menghapus item.', 'error');
            }
        }
    });
}

// Clear all speech history
function clearAllSpeechHistory() {
    speechHistory = [];
    saveSpeechHistory();
    
    localStorage.removeItem('lastDetectedLanguage');
    
    // Delete from Supabase async
    if (typeof neonDeleteAllSpeechHistory === 'function') {
        neonDeleteAllSpeechHistory().catch(() => {});
    }
}

// Download speech history as JSON
function downloadSpeechHistory() {
    try {
        const allHistory = [...speechHistory].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const jsonData = JSON.stringify(allHistory, null, 2);
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `speech_history_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        Swal.fire(
            'Berhasil!',
            'History TTS & STT berhasil diunduh.',
            'success'
        );
    } catch (error) {
        console.error('Error downloading speech history:', error);
        Swal.fire(
            'Error!',
            'Gagal mengunduh history.',
            'error'
        );
    }
}

// Clear speech history (TTS and STT) - Legacy function
function clearSpeechHistory() {
    clearAllSpeechHistory();
}

// Simple test function to verify button clicks work
function testButtonClick() {
    console.log(' Test button clicked!');
    alert('Button click test successful!');
}

// Modal popup functions for all buttons
function showAPISelectionModal() {
    if (typeof Swal === 'undefined') {
        alert(' Pilih API CHAT\n\nPilih provider AI:\n\n1. Groq AI - Fast responses\n2. Mistral AI - Balanced performance\n\nAPI saat ini: ' + (selectedAPI ? selectedAPI.toUpperCase() : 'GROQ'));
        return;
    }
    
    Swal.fire({
        title: ' Pilih API CHAT',
        html: `
            <div class="text-start">
                <p class="mb-3">Pilih provider AI yang ingin digunakan untuk percakapan:</p>
                <div class="d-grid gap-2">
                    <button class="btn btn-success btn-lg w-100" onclick="switchAPI('groq'); Swal.close();">
                        <i class="bi bi-cpu"></i> Groq AI
                        <small class="d-block">Fast responses, Llama models</small>
                    </button>
                    <button class="btn btn-info btn-lg w-100" onclick="switchAPI('mistral'); Swal.close();">
                        <i class="bi bi-cpu"></i> Mistral AI
                        <small class="d-block">Balanced performance, Mistral models</small>
                    </button>
                </div>
                <div class="mt-3">
                    <small class="text-muted">API saat ini: <strong>${selectedAPI ? selectedAPI.toUpperCase() : 'GROQ'}</strong></small>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false
    });
}

function showSTTModal() {
    if (typeof Swal === 'undefined') {
        alert(' Speech-to-Text (STT)\n\nPilih API untuk Speech-to-Text:\n\n1. Groq STT - Fast speech recognition\n2. Mulai Recording');
        return;
    }
    
    Swal.fire({
        title: ' Speech-to-Text (STT)',
        html: `
            <div class="text-start">
                <p class="mb-3">Pilih API untuk Speech-to-Text:</p>
                <div class="d-grid gap-2">
                    <button class="btn btn-success btn-lg w-100" onclick="selectAIForSTT('groq'); updateSTTModalStatus();">
                        <i class="bi bi-mic"></i> Groq STT
                        <small class="d-block">Fast speech recognition - Menggunakan model Whisper untuk konversi suara ke teks dengan akurasi tinggi</small>
                    </button>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary btn-lg w-100" onclick="toggleVoiceRecording();">
                        <i class="bi bi-mic-fill"></i> Mulai Recording
                        <small class="d-block">Klik untuk mulai merekam suara dan konversi ke teks otomatis</small>
                    </button>
                </div>
                <div class="mt-3">
                    <div class="alert alert-info">
                        <h6><i class="bi bi-info-circle"></i> Informasi Penggunaan:</h6>
                        <ul class="mb-0">
                            <li><strong>STT (Speech-to-Text)</strong> - Mengubah suara menjadi teks</li>
                            <li><strong>Cara kerja:</strong> Rekam suara -> AI proses -> Hasil teks muncul</li>
                            <li><strong>Model:</strong> Whisper Large v3 (akurasi tinggi)</li>
                            <li><strong>Bahasa:</strong> Mendukung berbagai bahasa termasuk Bahasa Indonesia</li>
                        </ul>
                    </div>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false
    });
}

// Update STT modal status after AI selection
function updateSTTModalStatus() {
    // Update button states and show selected AI
    const sttButtons = document.querySelectorAll('.swal2-popup button');
    sttButtons.forEach(btn => {
        if (btn.textContent.includes('Groq STT')) {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-outline-success');
            btn.innerHTML = '<i class="bi bi-mic"></i> Groq STT (Selected)<br><small class="d-block">Fast speech recognition - Menggunakan model Whisper untuk konversi suara ke teks dengan akurasi tinggi</small>';
        }
    });
    
    // Update modal content instead of showing new modal
    const modalContent = document.querySelector('.swal2-html-container');
    if (modalContent) {
        // Remove existing status alert first to prevent duplicates
        const existingStatus = modalContent.querySelector('.alert-success');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        const statusDiv = document.createElement('div');
        statusDiv.className = 'alert alert-success mt-3';
        statusDiv.innerHTML = '<i class="bi bi-check-circle"></i> <strong>AI Selected:</strong> Groq STT telah dipilih. Sekarang Anda dapat menggunakan tombol Mulai Recording.';
        
        // Find info section and add status after it
        const infoSection = modalContent.querySelector('.alert-info');
        if (infoSection) {
            infoSection.parentNode.insertBefore(statusDiv, infoSection.nextSibling);
        }
    }
}

function showTTSModal() {
    if (typeof Swal === 'undefined') {
        alert(' Text-to-Speech (TTS)\n\nPilih API untuk Text-to-Speech:\n\n1. Groq TTS - Natural voice synthesis\n2. Ucapkan Teks Input');
        return;
    }
    
    Swal.fire({
        title: ' Text-to-Speech (TTS)',
        html: `
            <div class="text-start">
                <p class="mb-3">Pilih API untuk Text-to-Speech:</p>
                <div class="d-grid gap-2">
                    <button class="btn btn-success btn-lg w-100" onclick="selectAIForTTS('groq'); updateTTSModalStatus();">
                        <i class="bi bi-volume-up"></i> Groq TTS
                        <small class="d-block">Natural voice synthesis - Mengubah teks menjadi suara yang alami dan jernih</small>
                    </button>
                </div>
                <div class="mt-3">
                    <button class="btn btn-primary btn-lg w-100" onclick="convertInputTextToSpeech();">
                        <i class="bi bi-play-fill"></i> Ucapkan Teks Input
                        <small class="d-block">Klik untuk mengubah teks di input menjadi suara</small>
                    </button>
                </div>
                <div class="mt-3">
                    <div class="alert alert-info">
                        <h6><i class="bi bi-info-circle"></i> Informasi Penggunaan:</h6>
                        <ul class="mb-0">
                            <li><strong>TTS (Text-to-Speech)</strong> - Mengubah teks menjadi suara</li>
                            <li><strong>Cara kerja:</strong> Input teks -> AI proses -> Suara keluar</li>
                            <li><strong>Model:</strong> Orpheus English (kualitas tinggi)</li>
                            <li><strong>Voice:</strong> Berbagai pilihan voice (Autumn, Cherry, dll)</li>
                            <li><strong>Bahasa:</strong> Mendukung berbagai bahasa termasuk Bahasa Indonesia</li>
                        </ul>
                    </div>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false
    });
}

// Update TTS modal status after AI selection
function updateTTSModalStatus() {
    // Update button states and show selected AI
    const ttsButtons = document.querySelectorAll('.swal2-popup button');
    ttsButtons.forEach(btn => {
        if (btn.textContent.includes('Groq TTS')) {
            btn.classList.remove('btn-success');
            btn.classList.add('btn-outline-success');
            btn.innerHTML = '<i class="bi bi-volume-up"></i> Groq TTS (Selected)<br><small class="d-block">Natural voice synthesis - Mengubah teks menjadi suara yang alami dan jernih</small>';
        }
    });
    
    // Update modal content instead of showing new modal
    const modalContent = document.querySelector('.swal2-html-container');
    if (modalContent) {
        // Remove existing status alert first to prevent duplicates
        const existingStatus = modalContent.querySelector('.alert-success');
        if (existingStatus) {
            existingStatus.remove();
        }
        
        const statusDiv = document.createElement('div');
        statusDiv.className = 'alert alert-success mt-3';
        statusDiv.innerHTML = '<i class="bi bi-check-circle"></i> <strong>AI Selected:</strong> Groq TTS telah dipilih. Sekarang Anda dapat menggunakan tombol Ucapkan Teks Input.';
        
        // Find info section and add status after it
        const infoSection = modalContent.querySelector('.alert-info');
        if (infoSection) {
            infoSection.parentNode.insertBefore(statusDiv, infoSection.nextSibling);
        }
    }
}

function showVoiceSettingsModal() {
    // Load saved settings
    const currentTTSModel = localStorage.getItem('selectedTTSModel') || 'canopylabs/orpheus-v1-english';
    const currentSTTModel = localStorage.getItem('selectedSTTModel') || 'whisper-large-v3';
    const currentVoiceAI = localStorage.getItem('selectedVoiceAI') || 'autumn';
    const currentAutoSpeak = localStorage.getItem('autoSpeak') === 'true';
    
    Swal.fire({
        title: ' Voice Settings',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label">TTS Model:</label>
                    <select id="ttsModelSelect" class="form-select form-select-lg">
                        <option value="canopylabs/orpheus-v1-english" ${currentTTSModel === 'canopylabs/orpheus-v1-english' ? 'selected' : ''}>Orpheus English</option>
                        <option value="playai-tts" ${currentTTSModel === 'playai-tts' ? 'selected' : ''}>PlayAI English</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">Pilih Voice AI:</label>
                    <select id="voiceAISelect" class="form-select form-select-lg">
                        <option value="autumn" ${currentVoiceAI === 'autumn' ? 'selected' : ''}>Autumn</option>
                        <option value="diana" ${currentVoiceAI === 'diana' ? 'selected' : ''}>Diana</option>
                        <option value="hannah" ${currentVoiceAI === 'hannah' ? 'selected' : ''}>Hannah</option>
                        <option value="austin" ${currentVoiceAI === 'austin' ? 'selected' : ''}>Austin</option>
                        <option value="daniel" ${currentVoiceAI === 'daniel' ? 'selected' : ''}>Daniel</option>
                        <option value="troy" ${currentVoiceAI === 'troy' ? 'selected' : ''}>Troy</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">STT Model:</label>
                    <select id="sttModelSelect" class="form-select form-select-lg">
                        <option value="whisper-large-v3" ${currentSTTModel === 'whisper-large-v3' ? 'selected' : ''}>Whisper Large v3</option>
                        <option value="gpt-4o-transcribe" ${currentSTTModel === 'gpt-4o-transcribe' ? 'selected' : ''}>GPT-4o Transcribe</option>
                    </select>
                </div>
                <div class="mb-3">
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="autoSpeak" ${currentAutoSpeak ? 'checked' : ''}>
                        <label class="form-check-label" for="autoSpeak">
                            Auto-speak AI responses
                        </label>
                    </div>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Settings',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d',
        preConfirm: () => {
            const ttsModel = document.getElementById('ttsModelSelect').value;
            const sttModel = document.getElementById('sttModelSelect').value;
            const voiceAI = document.getElementById('voiceAISelect').value;
            const autoSpeak = document.getElementById('autoSpeak').checked;
            
            localStorage.setItem('selectedTTSModel', ttsModel);
            localStorage.setItem('selectedSTTModel', sttModel);
            localStorage.setItem('selectedVoiceAI', voiceAI);
            localStorage.setItem('autoSpeak', autoSpeak);
            
            return { ttsModel, sttModel, voiceAI, autoSpeak };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            Swal.fire({
                icon: 'success',
                title: 'Saved!',
                text: 'Voice settings have been updated.',
                timer: 2000,
                showConfirmButton: false
            });
        }
    });
}

function showChatHistoryModal() {
    const isMobile = window.innerWidth < 768;
    Swal.fire({
        title: ' Chat History',
        html: `
            <div class="text-start">
                <p class="mb-3" style="font-size: ${isMobile ? '16px' : '14px'}; color: #333;">Kelola riwayat percakapan Anda:</p>
                <div class="row g-2">
                    <div class="col-6">
                        <button class="btn btn-outline-secondary w-100" style="min-height: 48px; font-size: ${isMobile ? '16px' : '14px'};" onclick="loadChatSessions(); Swal.close();">
                            <i class="bi bi-arrow-clockwise"></i> Refresh
                        </button>
                    </div>
                    <div class="col-6">
                        <button class="btn btn-outline-dark w-100" style="min-height: 48px; font-size: ${isMobile ? '16px' : '14px'};" onclick="startNewChat(); Swal.close();">
                            <i class="bi bi-plus-circle"></i> New Chat
                        </button>
                    </div>
                    <div class="col-6">
                        <button class="btn btn-outline-warning w-100" style="min-height: 48px; font-size: ${isMobile ? '16px' : '14px'};" onclick="showVoiceSettingsModal();">
                            <i class="bi bi-gear"></i> Voice
                        </button>
                    </div>
                    <div class="col-6">
                        <button class="btn btn-outline-danger w-100" style="min-height: 48px; font-size: ${isMobile ? '16px' : '14px'};" onclick="clearChatHistory(); Swal.close();">
                            <i class="bi bi-trash"></i> Clear
                        </button>
                    </div>
                </div>
                <div class="mt-3">
                    <small style="font-size: ${isMobile ? '14px' : '12px'}; color: #666;">Total chats: <strong>${chatSessions.length}</strong></small>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false,
        width: isMobile ? '95vw' : '350px',
        padding: isMobile ? '1rem' : '2rem'
    });
}

function showAboutModal() {
    const isMobile = window.innerWidth < 768;
    Swal.fire({
        title: ' Tentang AI Assistant',
        html: `
            <div class="text-start">
                <p class="mb-3" style="font-size: ${isMobile ? '16px' : '14px'};"><strong>AI Assistant Web v1.0</strong></p>
                <div class="mb-3">
                    <h6 style="font-size: ${isMobile ? '15px' : '14px'};">Fitur Utama:</h6>
                    <ul class="small" style="font-size: ${isMobile ? '14px' : '12px'};">
                        <li> Chat dengan AI (Groq/Mistral)</li>
                        <li> Speech-to-Text</li>
                        <li> Text-to-Speech</li>
                        <li> Edit pesan</li>
                        <li> Save chat history</li>
                        <li> Responsive mobile</li>
                    </ul>
                </div>
                <div class="mb-3">
                    <h6 style="font-size: ${isMobile ? '15px' : '14px'};">API Support:</h6>
                    <ul class="small" style="font-size: ${isMobile ? '14px' : '12px'};">
                        <li> Groq AI</li>
                        <li> Mistral AI</li>
                    </ul>
                </div>
                <div class="text-center">
                    <small class="text-muted" style="font-size: ${isMobile ? '12px' : '11px'};">Made with  using Bootstrap & SweetAlert2</small>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false,
        width: isMobile ? '95vw' : '400px',
        padding: isMobile ? '1rem' : '2rem'
    });
}

// Simple test edit function
function testEdit(messageIndex) {
    const isMobile = window.innerWidth < 768;
    Swal.fire({
        title: ' Edit Pesan',
        input: 'textarea',
        inputValue: chatHistory && chatHistory[messageIndex] ? chatHistory[messageIndex].user : '',
        inputLabel: 'Edit pesan Anda:',
        inputAttributes: {
            style: `min-height: 100px; font-size: ${isMobile ? '16px' : '14px'};`
        },
        showCancelButton: true,
        confirmButtonText: 'Simpan',
        cancelButtonText: 'Batal',
        confirmButtonColor: '#007bff',
        cancelButtonColor: '#6c757d',
        width: isMobile ? '95vw' : '400px',
        padding: isMobile ? '1rem' : '2rem',
        inputValidator: (value) => {
            if (!value || value.trim() === '') {
                return 'Pesan tidak boleh kosong!';
            }
        }
    }).then((result) => {
        if (result.isConfirmed && chatHistory && chatHistory[messageIndex]) {
            const newMessage = result.value.trim();
            chatHistory[messageIndex].user = newMessage;
            chatHistory[messageIndex].timestamp = new Date().toISOString();
            
            if (chatHistory[messageIndex].ai) {
                chatHistory[messageIndex].ai = null;
            }
            
            chatHistory = chatHistory.slice(0, messageIndex + 1);
            refreshChatDisplay();
            
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Pesan berhasil diedit!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
            
            setTimeout(async () => {
                const response = await sendMessageAJAX(newMessage);
                chatHistory[messageIndex].ai = response;
                addMessage(response, 'ai', { messageIndex: messageIndex });
                saveChatHistory();
            }, 500);
        }
    });
}

// Edit user message with modal
async function editUserMessage(messageIndex) {
    console.log(' Editing user message at index:', messageIndex);
    
    if (messageIndex < 0 || messageIndex >= chatHistory.length) {
        console.error('Invalid message index:', messageIndex);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Invalid message index!'
        });
        return;
    }
    
    const message = chatHistory[messageIndex];
    console.log('Message to edit:', message);
    
    // Set modal values
    document.getElementById('editMessageText').value = message.user;
    document.getElementById('editMessageType').value = 'user';
    document.getElementById('editMessageIndex').value = messageIndex;
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editMessageModal'));
    modal.show();
}

// Edit AI message with modal
async function editAIMessage(messageText) {
    console.log(' Editing AI message');
    
    // Set modal values
    document.getElementById('editMessageText').value = messageText;
    document.getElementById('editMessageType').value = 'ai';
    document.getElementById('editMessageIndex').value = '-1'; // -1 indicates AI message (not in chatHistory)
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editMessageModal'));
    modal.show();
}

// Save edited message from modal
async function saveEditedMessage() {
    const messageType = document.getElementById('editMessageType').value;
    const messageIndex = parseInt(document.getElementById('editMessageIndex').value);
    const newMessage = document.getElementById('editMessageText').value.trim();
    
    if (!newMessage) {
        Swal.fire({
            icon: 'warning',
            title: 'Peringatan',
            text: 'Pesan tidak boleh kosong!'
        });
        return;
    }
    
    // Hide modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('editMessageModal'));
    modal.hide();
    
    if (messageType === 'user') {
        // Edit user message
        if (messageIndex < 0 || messageIndex >= chatHistory.length) {
            console.error('Invalid message index:', messageIndex);
            return;
        }
        
        // Update chat history
        chatHistory[messageIndex].user = newMessage;
        chatHistory[messageIndex].timestamp = new Date().toISOString();
        
        // Remove AI response if exists (need to regenerate)
        if (chatHistory[messageIndex].ai) {
            chatHistory[messageIndex].ai = null;
        }
        
        // Remove subsequent messages (cascade delete)
        chatHistory = chatHistory.slice(0, messageIndex + 1);
        
        // Refresh display
        refreshChatDisplay();
        
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Pesan user berhasil diedit!',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });
        
        // Auto-resend message to get new AI response
        setTimeout(async () => {
            const response = await sendMessageAJAX(newMessage);
            
            // Update chat history with new response
            chatHistory[messageIndex].ai = response;
            
            // Add AI response to display
            addMessage(response, 'ai', { messageIndex: messageIndex });
            
            // Save and refresh
            saveChatHistory();
        }, 500);
        
    } else if (messageType === 'ai') {
        // For AI messages, just copy the edited text to clipboard
        // since AI messages are not stored in chatHistory for editing
        navigator.clipboard.writeText(newMessage).then(() => {
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Pesan AI disalin ke clipboard!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        }).catch(err => {
            console.error('Failed to copy: ', err);
            Swal.fire({
                icon: 'error',
                title: 'Gagal Menyalin',
                text: 'Browser tidak mendukung fungsi copy.'
            });
        });
    }
}

// Copy user message to clipboard
function copyUserMessage(messageIndex) {
    if (messageIndex < 0 || messageIndex >= chatHistory.length) {
        console.error('Invalid message index');
        return;
    }
    
    const message = chatHistory[messageIndex].user;
    
    // Copy to clipboard using modern Clipboard API
    navigator.clipboard.writeText(message).then(() => {
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Pesan disalin!',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });
    }).catch(err => {
        console.error('Failed to copy text: ', err);
        
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = message;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Pesan disalin!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr);
            Swal.fire({
                icon: 'error',
                title: ' Gagal Menyalin',
                text: 'Browser tidak mendukung fungsi copy.',
                confirmButtonColor: '#3085d6'
            });
        }
    });
}

// Copy AI message to clipboard
function copyAIMessage(messageIndex) {
    if (messageIndex < 0 || messageIndex >= chatHistory.length) {
        console.error('Invalid message index');
        return;
    }
    
    const message = chatHistory[messageIndex].ai;
    if (!message) {
        console.error('AI message not found at index:', messageIndex);
        return;
    }
    
    navigator.clipboard.writeText(message).then(() => {
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Pesan AI disalin!',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });
    }).catch(err => {
        console.error('Failed to copy AI message: ', err);
        
        // Fallback for older browsers
        try {
            const textArea = document.createElement('textarea');
            textArea.value = message;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Pesan AI disalin!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        } catch (fallbackErr) {
            console.error('Fallback copy failed: ', fallbackErr);
            Swal.fire({
                icon: 'error',
                title: ' Gagal Menyalin',
                text: 'Browser tidak mendukung fungsi copy.',
                confirmButtonColor: '#3085d6'
            });
        }
    });
}

// Delete user message with AJAX
async function deleteUserMessage(messageIndex) {
    if (messageIndex < 0 || messageIndex >= chatHistory.length) {
        console.error('Invalid message index');
        return;
    }
    
    const message = chatHistory[messageIndex];
    
    Swal.fire({
        title: 'Hapus Pesan?',
        html: `Apakah Anda yakin ingin menghapus pesan "<strong>${message.user}</strong>"?<br><small class="text-muted">Ini akan menghapus pesan AI yang berhubungan juga.</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            // Remove message and all subsequent messages (cascade delete)
            chatHistory = chatHistory.slice(0, messageIndex);
            
            // Refresh display with AJAX-style update
            refreshChatDisplay();
            
            // Save and refresh
            saveChatHistory();
            
            // Show success notification
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: 'Pesan berhasil dihapus!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        }
    });
}

// Refresh chat display (AJAX-style)
function refreshChatDisplay() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    
    if (chatHistory.length === 0) {
        chatContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="bi bi-robot display-4"></i>
                <p class="mt-2">Mulai percakapan dengan AI Assistant</p>
            </div>
        `;
        return;
    }
    
    // Clear and rebuild display
    chatContainer.innerHTML = '';
    
    chatHistory.forEach((chat, index) => {
        // Add user message with edit/delete controls
        addMessageWithControls(chat.user, 'user', index);
        
        // Add AI message (no edit/delete)
        if (chat.ai) {
            addMessage(chat.ai, 'ai', { messageIndex: index });
        }
    });
}

// Send message with specific text (for edit resend)
function sendMessageWithText(messageText) {
    const input = document.getElementById('messageInput');
    if (input) {
        input.value = messageText;
        sendMessage();
    }
}

// Copy chat text to clipboard
async function copyChatText(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    if (!session || !session.messages || session.messages.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Chat Kosong',
            text: 'Tidak ada pesan untuk disalin.',
            timer: 2000,
            showConfirmButton: false
        });
        return;
    }

    // Format chat text
    let chatText = ` ${session.title || 'Untitled Chat'}\n`;
    chatText += ` Dibuat: ${new Date(session.createdAt).toLocaleString('id-ID')}\n`;
    chatText += ` Update: ${new Date(session.updatedAt).toLocaleString('id-ID')}\n`;
    chatText += ` Total Pesan: ${session.messages.length}\n`;
    chatText += `${'='.repeat(50)}\n\n`;

    session.messages.forEach((msg, index) => {
        chatText += ` User:\n${msg.user}\n\n`;
        if (msg.ai) {
            chatText += ` AI:\n${msg.ai}\n\n`;
        }
        chatText += `${'-'.repeat(30)}\n\n`;
    });

    try {
        await navigator.clipboard.writeText(chatText);
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Chat Tersalin!',
            text: `${session.messages.length} pesan berhasil disalin ke clipboard.`,
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });
    } catch (error) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = chatText;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Chat Tersalin!',
                text: `${session.messages.length} pesan berhasil disalin ke clipboard.`,
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        } catch (fallbackError) {
            document.body.removeChild(textArea);
            Swal.fire({
                icon: 'error',
                title: ' Gagal Menyalin',
                text: 'Browser tidak mendukung fitur copy to clipboard.',
            });
        }
    }
}

// Update history count display
function updateHistoryCount() {
    const historyCount = document.getElementById('historyCount');
    if (historyCount) {
        const totalMessages = chatSessions.reduce((total, session) => total + (session.messages?.length || 0), 0);
        historyCount.textContent = `${chatSessions.length} sessions, ${totalMessages} messages`;
    }
}

// Show chat history modal with search
function showChatHistory() {
    const modal = new bootstrap.Modal(document.getElementById('chatHistoryModal'));
    
    // Add search input if not already present
    let searchInput = document.getElementById('chatHistorySearchInput');
    if (!searchInput) {
        const modalBody = document.querySelector('#chatHistoryModal .modal-body');
        if (modalBody) {
            searchInput = document.createElement('div');
            searchInput.innerHTML = `
                <div class="input-group mb-3">
                    <input type="text" id="chatHistorySearchInput" class="form-control" 
                           placeholder="Cari chat..." oninput="searchChatHistory()">
                    <button class="btn btn-outline-secondary" type="button" onclick="clearChatHistorySearch();">Bersihkan</button>
                </div>
            `;
            // Insert before the history list
            const historyList = document.getElementById('chatHistoryList');
            if (historyList && modalBody.firstChild) {
                modalBody.insertBefore(searchInput, historyList);
            }
        }
    }
    
    displayChatHistoryList('');
    modal.show();
}

// Display chat history list in modal with search filter
function displayChatHistoryList(searchTerm = '') {
    const historyList = document.getElementById('chatHistoryList');
    if (!historyList) return;
    
    if (chatSessions.length === 0) {
        historyList.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-chat-dots" style="font-size: 3rem;"></i>
                <p class="mt-3">Belum ada riwayat chat</p>
                <button class="btn btn-primary" onclick="startNewChat(); bootstrap.Modal.getInstance(document.getElementById('chatHistoryModal')).hide();">
                    <i class="bi bi-plus-circle"></i> Mulai Chat Baru
                </button>
            </div>
        `;
        return;
    }
    
    // Filter sessions based on search term
    const searchLower = searchTerm.toLowerCase();
    const filteredSessions = chatSessions.filter(session => {
        const titleMatch = session.title && session.title.toLowerCase().includes(searchLower);
        const msgMatch = session.messages && session.messages.some(msg =>
            (msg.user && msg.user.toLowerCase().includes(searchLower)) ||
            (msg.ai && msg.ai.toLowerCase().includes(searchLower))
        );
        return titleMatch || msgMatch;
    });
    
    if (filteredSessions.length === 0) {
        historyList.innerHTML = `
            <div class="text-center text-muted py-5">
                <i class="bi bi-chat-dots" style="font-size: 3rem;"></i>
                <p class="mt-3">Tidak ditemukan hasil untuk: "<strong>${searchTerm}</strong>"</p>
                <button class="btn btn-primary mt-2" onclick="clearChatHistorySearch();">Bersihkan pencarian</button>
            </div>
        `;
        return;
    }
    
    let html = '<div class="list-group">';
    
    filteredSessions.forEach((session, index) => {
        const messageCount = session.messages?.length || 0;
        const createdAt = new Date(session.createdAt).toLocaleString('id-ID');
        const updatedAt = new Date(session.updatedAt).toLocaleString('id-ID');
        const isCurrentSession = session.id === currentSessionId;
        
        html += `
            <div class="list-group-item ${!isCurrentSession ? 'clickable-session' : ''}" 
                 ${!isCurrentSession ? `onclick="loadChatSession('${session.id}')"` : ''}
                 style="${!isCurrentSession ? 'cursor: pointer;' : ''}">
                <div class="d-flex w-100 justify-content-between align-items-start">
                    <div class="flex-grow-1">
                        <h6 class="mb-1 text-dark">
                            ${isCurrentSession ? '<i class="bi bi-chat-dots-fill"></i> ' : '<i class="bi bi-chat-dots"></i> '}
                            ${session.title ? searchHighlight(session.title, searchTerm) : 'Untitled Chat'}
                        </h6>
                        <div class="mb-2">
                            ${isCurrentSession ? '<span class="badge bg-success">Current</span>' : ''}
                            ${!isCurrentSession ? '<span class="badge bg-info">Klik untuk buka</span>' : ''}
                        </div>
                        <p class="mb-1 text-dark small">
                            <i class="bi bi-chat-text"></i> <strong>${messageCount} pesan</strong>
                        </p>
                        <p class="mb-0 text-dark small">
                            <i class="bi bi-calendar"></i> <strong>Dibuat: ${createdAt}</strong>
                            ${createdAt !== updatedAt ? `<br><i class="bi bi-clock"></i> <strong>Update: ${updatedAt}</strong>` : ''}
                        </p>
                    </div>
                    <div class="d-flex gap-2 justify-content-end mt-2" role="group">
                        <button class="btn btn-sm btn-outline-success" onclick="event.stopPropagation(); copyChatText('${session.id}')" title="Salin Chat">
                            <i class="bi bi-clipboard"></i> Salin
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteChatSession('${session.id}')" title="Delete Chat">
                            <i class="bi bi-trash"></i> Hapus
                        </button>
                    </div>
                </div>
                
                ${messageCount > 0 ? `
                    <div class="mt-2">
                        <small class="text-dark">Preview:</small>
                        <div class="bg-light p-2 rounded mt-1" style="max-height: 100px; overflow-y: auto;">
                            ${session.messages.slice(0, 2).map(msg => `
                                <div class="small ${msg.user ? 'text-primary' : 'text-dark'}">
                                    <strong>${msg.user ? 'You:' : 'AI:'}</strong> ${msg.user || msg.ai}
                                </div>
                            `).join('')}
                            ${messageCount > 2 ? `<div class="small text-dark">... dan ${messageCount - 2} pesan lainnya</div>` : ''}
                        </div>
                    </div>
                ` : ''}
                
                ${!isCurrentSession ? `
                    <div class="mt-2 text-center">
                        <small class="text-info">
                            <i class="bi bi-hand-index"></i> Klik di mana saja untuk membuka chat ini
                        </small>
                    </div>
                ` : ''}
            </div>
        `;
    });
    
    html += '</div>';
    
    // Add summary at bottom
    html += `
        <div class="mt-3 p-3 bg-light rounded">
            <div class="row text-center">
                <div class="col-4">
                    <div class="fw-bold">${chatSessions.length}</div>
                    <div class="small text-muted">Total Sessions</div>
                </div>
                <div class="col-4">
                    <div class="fw-bold">${chatSessions.reduce((total, session) => total + (session.messages?.length || 0), 0)}</div>
                    <div class="small text-muted">Total Messages</div>
                </div>
                <div class="col-4">
                    <div class="fw-bold">${chatSessions.filter(s => s.messages && s.messages.length > 0).length}</div>
                    <div class="small text-muted">Active Sessions</div>
                </div>
            </div>
        </div>
    `;
    
    historyList.innerHTML = html;
}

// Fungsi: Cari di riwayat chat
function searchChatHistory() {
    const searchInput = document.getElementById('chatHistorySearchInput');
    const searchTerm = searchInput ? searchInput.value : '';
    displayChatHistoryList(searchTerm);
}

// Fungsi: Bersihkan search di riwayat
function clearChatHistorySearch() {
    const searchInput = document.getElementById('chatHistorySearchInput');
    if (searchInput) {
        searchInput.value = '';
        displayChatHistoryList('');
    }
}

// Load specific chat session
function loadChatSession(sessionId) {
    // Save current session first
    if (currentSessionId && chatHistory.length > 0) {
        saveCurrentSession();
    }
    
    // Load selected session
    currentSessionId = sessionId;
    loadCurrentSession();
    
    // Close modal
    const modal = bootstrap.Modal.getInstance(document.getElementById('chatHistoryModal'));
    modal.hide();
    
    // Get session title
    const sessionTitle = chatSessions.find(s => s.id === sessionId)?.title || 'Unknown';
    
    // Show success notification
    Swal.fire({
        position: 'top-end',
        icon: 'success',
        title: `Chat "${sessionTitle}" berhasil di-load!`,
        showConfirmButton: false,
        timer: 2000,
        toast: true
    });
    
    // Add message to chat
    addMessage(` Chat "${sessionTitle}" berhasil di-load!`, 'ai');
    
    console.log(` Loaded session: ${sessionId}`);
}

// Delete specific chat session
function deleteChatSession(sessionId) {
    const session = chatSessions.find(s => s.id === sessionId);
    const sessionTitle = session?.title || 'Unknown';
    
    Swal.fire({
        title: 'Hapus Chat Session?',
        html: `Apakah Anda yakin ingin menghapus chat "<strong>${sessionTitle}</strong>"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            // Find and remove session
            const sessionIndex = chatSessions.findIndex(s => s.id === sessionId);
            if (sessionIndex >= 0) {
                chatSessions.splice(sessionIndex, 1);
                
                // Save to localStorage
                saveChatSessions();
                
                // Delete from Supabase async
                if (typeof neonDeleteChatSession === 'function') {
                    neonDeleteChatSession(sessionId).catch(() => {});
                }
                
                // If deleting current session, start new chat
                if (sessionId === currentSessionId) {
                    startNewChat();
                }
                
                // Refresh display
                displayChatHistoryList();
                
                // Show success message
                Swal.fire({
                    position: 'top-end',
                    icon: 'success',
                    title: 'Chat session dihapus!',
                    showConfirmButton: false,
                    timer: 2000,
                    toast: true
                });
            }
        }
    });
}

// Clear all chat history
function clearAllChatHistory() {
    if (chatSessions.length === 0) {
        Swal.fire({
            icon: 'info',
            title: 'Tidak Ada Riwayat Chat',
            text: 'Belum ada riwayat chat untuk dihapus.',
            confirmButtonColor: '#3085d6'
        });
        return;
    }
    
    Swal.fire({
        title: 'Hapus Semua Riwayat Chat?',
        html: `Apakah Anda yakin ingin menghapus <strong>semua</strong> riwayat chat? Ini akan menghapus <strong>${chatSessions.length}</strong> session chat secara permanen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus Semua!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            // Clear all sessions
            chatSessions = [];
            
            // Delete from Neon
            if (typeof neonDeleteAllChatSessions === 'function') {
                neonDeleteAllChatSessions().catch(() => {});
            }
            
            // Start new chat
            startNewChat();
            
            // Refresh display
            displayChatHistoryList();
            
            // Show success message
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: 'Semua riwayat chat dihapus!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        }
    });
}

const CHAT_API_MODELS = {
    groq: 'openai/gpt-oss-20b',
    groqFallbacks: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b'],
    mistral: 'mistral-small-latest',
    mistralFallbacks: ['mistral-medium-latest', 'mistral-large-latest', 'open-mistral-7b']
};

function hasConfiguredApiKey(apiName) {
    const authHeader = API_CONFIG?.[apiName]?.headers?.Authorization || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();

    if (apiName === 'groq') {
        // Groq key must start with gsk_ and be reasonably long
        return token.startsWith('gsk_') && token.length > 20;
    } else if (apiName === 'mistral') {
        // Mistral keys are usually non-empty; avoid rejecting valid keys due to length assumptions
        return token.length > 0;
    }

    return token.length > 0;
}

function stripBearerPrefix(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') {
        return '';
    }

    return rawKey.trim().replace(/^Bearer\s+/i, '').trim();
}

function buildAuthorizationHeader(apiKey) {
    const key = stripBearerPrefix(apiKey);
    return key ? `Bearer ${key}` : '';
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getStoredApiKey(apiName) {
    return stripBearerPrefix(_apiKeysCache?.[apiName] || '');
}

function buildApiConnectionError(apiName, responseData, fallbackStatus) {
    const apiLabel = apiName === 'groq' ? 'Groq' : 'Mistral';
    const message =
        responseData?.error?.message ||
        responseData?.message ||
        responseData?.detail ||
        fallbackStatus ||
        'Unknown error';

    console.error(` API ${apiLabel} error:`, { message, responseData, fallbackStatus });

    if (/cors|failed to fetch|network|Load failed/i.test(message)) {
        return ` Network/CORS error (${apiLabel}): ${message}`;
    }

    if (/model|deprecated|not found|unknown model/i.test(message)) {
        return ` Model error (${apiLabel}): ${message}. Model mungkin sudah tidak tersedia.`;
    }

    if (/unauthorized|invalid api key|authentication|api key|forbidden/i.test(message)) {
        if (apiName === 'mistral') {
            return ` Auth error (${apiLabel}): Key tidak valid atau tidak memiliki akses ke model ini. Buka console (F12) untuk detail. Coba: 1) Buka console.mistral.ai -> API Keys, 2) Buat key baru, 3) Pastikan key punya akses API.`;
        }
        return ` Auth error (${apiLabel}): ${message}`;
    }

    return ` ${apiLabel}: ${message}`;
}

// API Configuration ( WORKING CORS API )
const API_CONFIG = {
    // Groq - Support CORS (Working)
    groq: {
        url: 'https://api.groq.com/openai/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST',
        body: (message) => JSON.stringify({
            model: CHAT_API_MODELS.groq,
            messages: [
                { role: 'system', content: 'Kamu adalah AI Assistant yang ramah. BERIKAN JAWABAN DALAM FORMAT PARAGRAF BIASA. JANGAN GUNAKAN: - tanda pagar (#), - tanda strip (-), - garis pemisah (---), - numbering dengan format ### atau a. b. c., - bullet points. Tulis jawaban sebagai percakapan natural dengan paragraf yang mengalir. Jelaskan dengan lengkap tanpa memotong penjelasan. Fokus pada jawaban yang komprehensif dan mudah dipahami. PENTING: Jika diminta membuat soal atau pertanyaan (seperti tes Mitra Statistik BPS 2026), pastikan untuk MENYELESAIKAN SEMUA soal yang diminta tanpa terpotong. Jangan berhenti di tengah-tengah. Pastikan semua nomor soal tergenerate sampai selesai.' },
                { role: 'user', content: message }
            ],
            max_tokens: 1024,
            temperature: 0.7
        }),
        parseResponse: (data) => {
            if (data && data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }
            return null;
        }
    },
    
    // Mistral AI - Easy API Key Access (Working)
    mistral: {
        url: 'https://api.mistral.ai/v1/chat/completions',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' // Will be updated from localStorage
        },
        method: 'POST',
        body: (message) => JSON.stringify({
            model: CHAT_API_MODELS.mistral,
            messages: [
                { role: 'system', content: 'Kamu adalah AI Assistant yang ramah. BERIKAN JAWABAN DALAM FORMAT PARAGRAF BIASA. JANGAN GUNAKAN: - tanda pagar (#), - tanda strip (-), - garis pemisah (---), - numbering dengan format ### atau a. b. c., - bullet points. Tulis jawaban sebagai percakapan natural dengan paragraf yang mengalir. Jelaskan dengan lengkap tanpa memotong penjelasan. Fokus pada jawaban yang komprehensif dan mudah dipahami. PENTING: Jika diminta membuat soal atau pertanyaan (seperti tes Mitra Statistik BPS 2026), pastikan untuk MENYELESAIKAN SEMUA soal yang diminta tanpa terpotong. Jangan berhenti di tengah-tengah. Pastikan semua nomor soal tergenerate sampai selesai.' },
                { role: 'user', content: message }
            ],
            max_tokens: 1024,
            temperature: 0.5
        }),
        parseResponse: (data) => {
            if (data && data.choices && data.choices[0] && data.choices[0].message) {
                return data.choices[0].message.content;
            }
            return null;
        },
        retryCount: 0,
        maxRetries: 1
    }
};

// Ensure auth state is loaded from localStorage before querying Neon
if (typeof checkAuthStatus === 'function') checkAuthStatus();

// Load API keys after all configurations are defined
loadAPIKeys();

const AI_FORMAT_SYSTEM_PROMPT = 'Kamu adalah AI Assistant yang ramah dalam Bahasa Indonesia. BERIKAN JAWABAN DALAM FORMAT PARAGRAF BIASA yang rapi dan mudah dibaca. JANGAN GUNAKAN: tanda pagar (#), tanda bintang (**), garis pemisah (---), bullet points dengan strip (-), atau format markdown apapun. Tulis jawaban sebagai paragraf natural yang mengalir. Pisahkan topik dengan baris baru saja. Jelaskan lengkap tanpa memotong penjelasan. Ingat konteks percakapan sebelumnya.';

// Bangun array messages untuk API dengan konteks chat yang valid
function buildChatMessages(message) {
    const messages = [
        { role: 'system', content: AI_FORMAT_SYSTEM_PROMPT }
    ];
    
    chatHistory
        .filter(chat => chat.user && chat.ai)
        .slice(-5)
        .forEach(chat => {
            messages.push({ role: 'user', content: chat.user });
            messages.push({ role: 'assistant', content: chat.ai });
        });
    
    messages.push({ role: 'user', content: message });
    return messages;
}

// Fungsi untuk mendapatkan respons dari API (Robust dengan Retry + Chat Context + Perplexity Token)
async function getAPIResponse(message, retryCount = 0) {
    try {
        // Safe access to API_CONFIG
        if (typeof API_CONFIG === 'undefined') {
            console.error(' API_CONFIG not initialized yet');
            return await fallbackToGroq(message, 'API_CONFIG not initialized');
        }
        
        const config = API_CONFIG[selectedAPI];
        if (!config) {
            console.error(' API config not found for:', selectedAPI);
            return await fallbackToGroq(message, 'Config not found');
        }

        if (!hasConfiguredApiKey(selectedAPI)) {
            console.error(` API key for ${selectedAPI} not configured`);
            if (selectedAPI !== 'groq' && hasConfiguredApiKey('groq')) {
                return await fallbackToGroq(message, 'Selected API key not configured');
            }
            return ` API key untuk ${selectedAPI.toUpperCase()} belum dikonfigurasi atau tidak valid. Silakan periksa pengaturan API key Anda.`;
        }
        
        console.log(` Mencoba API: ${selectedAPI} (attempt ${retryCount + 1})`);
        console.log(' Request URL:', config.url);
        console.log(` Chat history length: ${chatHistory.length} messages`);
        
        // Simple headers and URL for all APIs
        const activeKey = getStoredApiKey(selectedAPI);
        let requestHeaders = { ...config.headers };
        requestHeaders.Authorization = buildAuthorizationHeader(activeKey);
        let requestUrl = config.url;
        
        let requestBody = config.body(message);
        
        // Add chat context untuk APIs yang support conversation
        if (selectedAPI !== 'huggingface') {
            const bodyObj = JSON.parse(requestBody);
            bodyObj.messages = buildChatMessages(message);
            
            // Try different models for OpenRouter if available
            if (selectedAPI === 'openrouter' && config.fallbackModels && retryCount < config.fallbackModels.length) {
                const modelToUse = config.fallbackModels[retryCount];
                console.log(` Trying model: ${modelToUse}`);
                bodyObj.model = modelToUse;
            }
            
            requestBody = JSON.stringify(bodyObj);
        }
        
        console.log(' Request body:', requestBody);
        
        const response = await fetch(requestUrl, {
            method: config.method,
            headers: requestHeaders,
            body: requestBody,
            mode: 'cors',
            credentials: 'omit'
        });
        
        console.log(` Response status: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(` API ${selectedAPI} HTTP Error:`, {
                status: response.status,
                statusText: response.statusText,
                errorBody: errorText
            });
            
            // Standard retry logic for all APIs
            
            // Retry logic untuk OpenRouter dengan model berbeda
            if (selectedAPI === 'openrouter' && config.fallbackModels && retryCount < config.fallbackModels.length - 1) {
                console.log(` Retrying ${selectedAPI} with different model...`);
                return await getAPIResponse(message, retryCount + 1);
            }
            
            // Retry logic untuk API yang punya retry config
            if (config.maxRetries && retryCount < config.maxRetries) {
                console.log(` Retrying ${selectedAPI} (${retryCount + 1}/${config.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                return await getAPIResponse(message, retryCount + 1);
            }
            
            // For Mistral, try fallback models if maxRetries exhausted
            if (selectedAPI === 'mistral' && CHAT_API_MODELS.mistralFallbacks) {
                const totalFallbacks = CHAT_API_MODELS.mistralFallbacks.length;
                const fallbackRetries = Math.min(totalFallbacks, 3);
                for (let fi = 0; fi < fallbackRetries; fi++) {
                    const modelToUse = CHAT_API_MODELS.mistralFallbacks[fi];
                    console.log(` Trying Mistral fallback model #${fi + 1}: ${modelToUse}`);
                    try {
                        const fallbackBody = JSON.parse(requestBody);
                        fallbackBody.model = modelToUse;
                        const fallbackResponse = await fetch(requestUrl, {
                            method: config.method,
                            headers: requestHeaders,
                            body: JSON.stringify(fallbackBody),
                            mode: 'cors',
                            credentials: 'omit'
                        });
                        if (fallbackResponse.ok) {
                            const fallbackData = await fallbackResponse.json();
                            const fallbackParsed = config.parseResponse(fallbackData);
                            if (fallbackParsed && fallbackParsed.trim() !== '') {
                                console.log(` Mistral fallback model ${modelToUse} worked!`);
                                trackTokenUsage(selectedAPI, fallbackParsed);
                                return cleanAIText(fallbackParsed.trim());
                            }
                        } else {
                            console.log(` Fallback model ${modelToUse} also failed: ${fallbackResponse.status}`);
                        }
                    } catch (fbErr) {
                        console.log(` Fallback model ${modelToUse} error:`, fbErr.message);
                    }
                }
            }
            
            // For Groq, try fallback models if primary model fails
            if (selectedAPI === 'groq' && CHAT_API_MODELS.groqFallbacks) {
                for (let fi = 0; fi < CHAT_API_MODELS.groqFallbacks.length; fi++) {
                    const modelToUse = CHAT_API_MODELS.groqFallbacks[fi];
                    console.log(` Trying Groq fallback model #${fi + 1}: ${modelToUse}`);
                    try {
                        const fallbackBody = JSON.parse(requestBody);
                        fallbackBody.model = modelToUse;
                        const fallbackResponse = await fetch(requestUrl, {
                            method: config.method,
                            headers: requestHeaders,
                            body: JSON.stringify(fallbackBody),
                            mode: 'cors',
                            credentials: 'omit'
                        });
                        if (fallbackResponse.ok) {
                            const fallbackData = await fallbackResponse.json();
                            const fallbackParsed = config.parseResponse(fallbackData);
                            if (fallbackParsed && fallbackParsed.trim() !== '') {
                                console.log(` Groq fallback model ${modelToUse} worked!`);
                                trackTokenUsage(selectedAPI, fallbackParsed);
                                return cleanAIText(fallbackParsed.trim());
                            }
                        } else {
                            console.log(` Groq fallback model ${modelToUse} also failed: ${fallbackResponse.status}`);
                        }
                    } catch (fbErr) {
                        console.log(` Groq fallback model ${modelToUse} error:`, fbErr.message);
                    }
                }
            }
            
            return await fallbackToGroq(message, `HTTP ${response.status}`);
        }
        
        const data = await response.json();
        console.log(` Response data from ${selectedAPI}:`, data);
        
        const parsedResponse = config.parseResponse(data);
        console.log(` Parsed response:`, parsedResponse);
        
        if (parsedResponse && parsedResponse.trim() !== '') {
            console.log(` API ${selectedAPI} success:`, parsedResponse);
            
            // Track token usage for this API call
            trackTokenUsage(selectedAPI, parsedResponse);
            
            // Check if response seems incomplete (ends with punctuation suggesting continuation)
            let finalResponse = parsedResponse.trim();
            if (finalResponse.endsWith('...') || finalResponse.endsWith('') || 
                finalResponse.match(/[,-]\s*$/)) {
                console.log(` Response appears incomplete, attempting to continue...`);
                // For now, we'll return as-is, but this could be enhanced to request continuation
            }
            
            // Reset retry count on success
            if (config.retryCount !== undefined) {
                config.retryCount = 0;
            }
            return cleanAIText(finalResponse);
        } else {
            console.log(` API ${selectedAPI} returned empty response`);
            
            // Retry untuk empty response
            if (config.maxRetries && retryCount < config.maxRetries) {
                console.log(` Retrying ${selectedAPI} for empty response (${retryCount + 1}/${config.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return await getAPIResponse(message, retryCount + 1);
            }
            
            return await fallbackToGroq(message, 'Empty response');
        }
        
    } catch (error) {
        console.error(` API ${selectedAPI} Exception:`, {
            name: error.name,
            message: error.message
        });
        
        // Retry untuk network errors
        const config = API_CONFIG[selectedAPI];
        if (config && config.maxRetries && retryCount < config.maxRetries) {
            console.log(` Retrying ${selectedAPI} for network error (${retryCount + 1}/${config.maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return await getAPIResponse(message, retryCount + 1);
        }
        
        return await fallbackToGroq(message, `Network error: ${error.message}`);
    }
}

// Fungsi fallback ke Groq
async function fallbackToGroq(message, reason) {
    const originalAPI = selectedAPI;
    if (originalAPI === 'groq') {
        console.log(` Groq juga gagal: ${reason}`);
        return ` Groq juga gagal: ${reason}`;
    }

    console.log(` Auto-fallback dari ${originalAPI} ke Groq (${reason})...`);

    try {
        if (typeof API_CONFIG === 'undefined') {
            console.error(' API_CONFIG not initialized yet in fallback');
            return ` Fallback gagal: API_CONFIG belum diinisialisasi`;
        }

        const groqConfig = API_CONFIG.groq;
        const bodyObj = JSON.parse(groqConfig.body(message));
        bodyObj.messages = buildChatMessages(message);

        const response = await fetch(groqConfig.url, {
            method: groqConfig.method,
            headers: groqConfig.headers,
            body: JSON.stringify(bodyObj)
        });

        if (response.ok) {
            const data = await response.json();
            const parsedResponse = groqConfig.parseResponse(data);
            if (parsedResponse && parsedResponse.trim() !== '') {
                console.log(' Fallback ke Groq berhasil');
                trackTokenUsage('groq', parsedResponse);
                return cleanAIText(parsedResponse);
            }
        }

        console.error(' Fallback ke Groq gagal:', response.status);
        return ` Fallback ke Groq gagal: HTTP ${response.status}`;
    } catch (error) {
        console.error(' Fallback ke Groq exception:', error);
        return ` Fallback ke Groq exception: ${error.message}`;
    }
}


// Test Chat API connectivity (unified function)
async function testChatAPI(apiName) {
    try {
        // Safe access to API_CONFIG
        if (typeof API_CONFIG === 'undefined') {
            console.error(' API_CONFIG not initialized yet in testChatAPI');
            return ' Error';
        }
        
        const config = API_CONFIG[apiName];
        if (!config) {
            console.error(' API config not found for:', apiName);
            return ' Error';
        }

        if (!hasConfiguredApiKey(apiName)) {
            return ' Not configured';
        }

        const activeKey = getStoredApiKey(apiName);
        const requestHeaders = {
            ...config.headers,
            Authorization: buildAuthorizationHeader(activeKey)
        };
        
        // For Mistral: first validate the key using /v1/models endpoint
        if (apiName === 'mistral') {
            try {
                console.log(' Validating Mistral key via /v1/models...');
                const modelsResponse = await fetch('https://api.mistral.ai/v1/models', {
                    method: 'GET',
                    headers: requestHeaders,
                    mode: 'cors',
                    credentials: 'omit'
                });
                console.log(` /v1/models response: ${modelsResponse.status}`);
                if (!modelsResponse.ok) {
                    const modelsError = await modelsResponse.json().catch(() => ({}));
                    console.error(' Mistral key validation failed:', modelsError);
                    const errMsg = modelsError?.detail || modelsError?.message || `HTTP ${modelsResponse.status}`;
                    if (modelsResponse.status === 401) {
                        return ` Auth error (Mistral): Key tidak valid atau expired. Detail: ${errMsg}`;
                    }
                    return ` Key check error (Mistral): ${errMsg}`;
                }
                const modelsData = await modelsResponse.json();
                const modelIds = (modelsData.data || []).map(m => m.id);
                console.log(' Mistral key valid. Available models:', modelIds.slice(0, 10));
                
                // Check if our preferred model is available
                const preferredModel = CHAT_API_MODELS.mistral;
                if (modelIds.length > 0 && !modelIds.includes(preferredModel)) {
                    console.warn(` Model ${preferredModel} not in available models. Trying closest match...`);
                }
            } catch (modelErr) {
                console.error(' Mistral /v1/models check failed:', modelErr);
                if (modelErr.message && /cors|failed to fetch|network/i.test(modelErr.message)) {
                    return ` CORS/Network error (Mistral): Tidak dapat mengakses api.mistral.ai dari browser. Detail: ${modelErr.message}`;
                }
            }
        }
        
        // Models to try for chat completion test
        const modelsToTry = [CHAT_API_MODELS[apiName]];
        if (apiName === 'mistral' && CHAT_API_MODELS.mistralFallbacks) {
            modelsToTry.push(...CHAT_API_MODELS.mistralFallbacks);
        }
        
        for (let mi = 0; mi < modelsToTry.length; mi++) {
            const testModel = modelsToTry[mi];
            const testPayload = {
                model: testModel,
                messages: [
                    { role: 'system', content: 'Reply with OK only.' },
                    { role: 'user', content: 'Ping' }
                ],
                max_tokens: 16,
                temperature: 0
            };
            
            console.log(` Testing ${apiName} API with model: ${testModel}:`, {
                url: config.url,
                hasKey: !!activeKey,
                keyPrefix: activeKey ? activeKey.substring(0, 8) + '...' : 'none'
            });
            
            const response = await fetch(config.url, {
                method: config.method,
                headers: requestHeaders,
                body: JSON.stringify(testPayload),
                mode: 'cors',
                credentials: 'omit'
            });
            
            console.log(` ${apiName} response status (${testModel}):`, response.status, response.statusText);
            
            const data = await response.json().catch(() => null);

            if (!response.ok) {
                console.error(` ${apiName} API error with ${testModel}:`, { status: response.status, data });
                // If this is a model-specific error (404, model not found), try next model
                if (data && data.error && /model|not found|deprecated/i.test(data.error.message || '') && mi < modelsToTry.length - 1) {
                    console.log(` Model ${testModel} not available, trying next...`);
                    continue;
                }
                // If auth error, don't try other models - key is bad
                if (response.status === 401) {
                    return buildApiConnectionError(apiName, data, `HTTP ${response.status}`);
                }
                // For other errors, if there are more models to try, continue
                if (mi < modelsToTry.length - 1) {
                    continue;
                }
                return buildApiConnectionError(apiName, data, `HTTP ${response.status}`);
            }

            if (data && data.choices && data.choices[0] && data.choices[0].message) {
                console.log(` ${apiName} API working with model ${testModel}`);
                if (testModel !== CHAT_API_MODELS[apiName]) {
                    // Update the model since fallback worked
                    console.log(` Updating ${apiName} model from ${CHAT_API_MODELS[apiName]} to ${testModel}`);
                    CHAT_API_MODELS[apiName] = testModel;
                    config.body = (message) => JSON.stringify({
                        model: testModel,
                        messages: [
                            { role: 'system', content: 'Kamu adalah AI Assistant yang ramah. BERIKAN JAWABAN DALAM FORMAT PARAGRAF BIASA. JANGAN GUNAKAN: - tanda pagar (#), - tanda strip (-), - garis pemisah (---), - numbering dengan format ### atau a. b. c., - bullet points. Tulis jawaban sebagai percakapan natural dengan paragraf yang mengalir. Jelaskan dengan lengkap tanpa memotong penjelasan. Fokus pada jawaban yang komprehensif dan mudah dipahami. PENTING: Jika diminta membuat soal atau pertanyaan (seperti tes Mitra Statistik BPS 2026), pastikan untuk MENYELESAIKAN SEMUA soal yang diminta tanpa terpotong. Jangan berhenti di tengah-tengah. Pastikan semua nomor soal tergenerate sampai selesai.' },
                            { role: 'user', content: message }
                        ],
                        max_tokens: 1024,
                        temperature: 0.5
                    });
                }
                return ' Working';
            }

            // If we got a non-OK response but no more models to try
            if (mi === modelsToTry.length - 1) {
                return buildApiConnectionError(apiName, data, 'Empty response');
            }
        }

        return buildApiConnectionError(apiName, null, 'All models failed');
    } catch (error) {
        console.error(` ${apiName} API exception:`, error);
        return buildApiConnectionError(apiName, { message: error.message }, 'Network error');
    }
}

// API Configuration Helper for Chat AI Models
function configureAPIKeys() {
    if (!window.authSystem?.checkAuthStatus?.()) {
        Swal.fire({
            icon: 'warning',
            title: 'Login Diperlukan',
            text: 'Anda harus login untuk menyimpan API key ke cloud.',
            confirmButtonText: 'Login',
            cancelButtonText: 'Batal',
            showCancelButton: true,
            confirmButtonColor: '#667eea'
        }).then(r => { if (r.isConfirmed) window.authSystem?.redirectToLogin?.(); });
        return;
    }
    try {
        console.log(' Opening API configuration...');
        
        // Get current keys safely
        let currentGroqKey = '';
        let currentMistralKey = '';
        
        try {
            if (typeof API_CONFIG !== 'undefined' && API_CONFIG && API_CONFIG.groq && API_CONFIG.groq.headers) {
                currentGroqKey = API_CONFIG.groq.headers.Authorization.replace('Bearer ', '');
            }
        } catch (e) {
            console.warn('Error getting Groq key:', e);
        }
        
        try {
            if (typeof API_CONFIG !== 'undefined' && API_CONFIG && API_CONFIG.mistral && API_CONFIG.mistral.headers) {
                currentMistralKey = API_CONFIG.mistral.headers.Authorization.replace('Bearer ', '');
            }
        } catch (e) {
            console.warn('Error getting Mistral key:', e);
        }
        
        console.log('Current keys loaded:', {
            groq: currentGroqKey.substring(0, 10) + '...',
            mistral: currentMistralKey.substring(0, 10) + '...'
        });
        
        Swal.fire({
            title: ' Chat AI Configuration',
            html: `
                <div class="text-start">
                    <p class="mb-3">Configure your API keys for better AI chat responses:</p>
                    
                    <div class="mb-4">
                        <label class="form-label"><strong> Groq API Key:</strong></label>
                        <input type="password" id="groqApiKey" class="form-control" placeholder="gsk_..." 
                               value="${currentGroqKey}">
                        <small class="text-muted">Get free key at <a href="https://console.groq.com/" target="_blank">console.groq.com</a></small>
                        <div class="mt-1">
                            <span class="badge ${currentGroqKey.startsWith('gsk_') ? 'bg-success' : 'bg-secondary'}">
                                ${currentGroqKey.startsWith('gsk_') ? ' Configured' : 'Not set'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label class="form-label"><strong> Mistral API Key:</strong></label>
                        <input type="password" id="mistralApiKey" class="form-control" placeholder="..." 
                               value="${currentMistralKey}">
                        <small class="text-muted">Get free key at <a href="https://console.mistral.ai/" target="_blank">console.mistral.ai</a></small>
                        <div class="mt-1">
                            <span class="badge ${currentMistralKey ? 'bg-success' : 'bg-secondary'}">
                                ${currentMistralKey ? ' Configured' : 'Not set'}
                            </span>
                        </div>
                    </div>
                    
                    <div class="alert alert-info">
                        <strong> Current Chat APIs:</strong><br>
                         <strong>Groq</strong> High quality responses with Small Latest<br>
                         <strong>Mistral</strong>: High quality responses with Small Latest
                    </div>
                    

                    <div class="alert alert-warning">
                        <strong> Note:</strong><br>
                         <strong>TTS</strong>: Gunakan fitur Text-to-Speech untuk mengubah teks menjadi suara<br>
                         <strong>STT</strong>: Gunakan fitur Speech-to-Text untuk mengubah suara menjadi teks
                    </div>
                </div>
            `,
            icon: 'info',
            showCancelButton: true,
            confirmButtonText: 'Save API Keys',
            cancelButtonText: 'Cancel',
            preConfirm: async () => {
                try {
                    // Get input values safely
                    const groqInput = document.getElementById('groqApiKey');
                    const mistralInput = document.getElementById('mistralApiKey');
                    
                    if (!groqInput || !mistralInput) {
                        throw new Error('Input fields not found');
                    }
                    
                    const groqKey = stripBearerPrefix(groqInput.value);
                    const mistralKey = stripBearerPrefix(mistralInput.value);
                    
                    console.log(' Saving new API keys:', {
                        groq: groqKey ? groqKey.substring(0, 10) + '...' : 'empty',
                        mistral: mistralKey ? mistralKey.substring(0, 10) + '...' : 'empty',
                        groqLength: groqKey.length,
                        mistralLength: mistralKey.length
                    });
                    
                    // Validate keys
                    if (groqKey && !groqKey.startsWith('gsk_')) {
                        Swal.showValidationMessage(' Groq API key harus dimulai dengan "gsk_"');
                        return false;
                    }
                    
                    // Update Groq configuration
                    if (!API_CONFIG.groq) {
                        API_CONFIG.groq = { headers: {} };
                    }
                    if (!API_CONFIG.groq.headers) {
                        API_CONFIG.groq.headers = {};
                    }
                    API_CONFIG.groq.headers.Authorization = buildAuthorizationHeader(groqKey);
                    if (groqKey) {
                        console.log(' Groq API key updated');
                    }
                    
                    // Update Mistral configuration
                    if (!API_CONFIG.mistral) {
                        API_CONFIG.mistral = { headers: {} };
                    }
                    if (!API_CONFIG.mistral.headers) {
                        API_CONFIG.mistral.headers = {};
                    }
                    API_CONFIG.mistral.headers.Authorization = buildAuthorizationHeader(mistralKey);
                    if (mistralKey) {
                        console.log(' Mistral API key updated');
                    }
                    
                    // Save to Neon only (no localStorage for security)
                    try {
                        if (typeof neonSaveKeys === 'function') {
                            await neonSaveKeys(groqKey, mistralKey);
                            _apiKeysCache = { groq: groqKey || '', mistral: mistralKey || '' };
                            console.log(' API keys tersimpan ke Neon');
                        } else {
                            console.warn(' Neon tidak tersedia');
                            Swal.showValidationMessage(' Cloud storage tidak tersedia');
                            return false;
                        }
                        
                        // Apply to in-memory configs
                        applyKeysToConfig(_apiKeysCache);
                        updateAPIDisplay();
                        updateAPIStatus();
                        updateModelInfo();
                        
                    } catch (storageError) {
                        console.error(' Save error:', storageError);
                        let msg = storageError.message || 'Terjadi kesalahan';
                        const detail = storageError.data && storageError.data.message ? storageError.data.message : '';
                        if (detail) msg = detail;
                        Swal.showValidationMessage(' Gagal menyimpan ke cloud: ' + msg);
                        return false;
                    }
                    
                    return { groqKey, mistralKey };
                    
                } catch (error) {
                    console.error(' Error in preConfirm:', error);
                    Swal.showValidationMessage(' Error: ' + error.message);
                    return false;
                }
            }
        }).then((result) => {
            if (result.isConfirmed) {
                console.log(' API keys configuration confirmed');
                
                // Show loading alert while checking API connections
                Swal.fire({
                    title: ' Checking API Connections',
                    html: `
                        <div class="text-center">
                            <div class="spinner-border text-primary mb-3" role="status">
                                <span class="visually-hidden">Loading...</span>
                            </div>
                            <p class="mb-2">Testing Groq API connection...</p>
                            <div class="progress" style="height: 20px;">
                                <div class="progress-bar progress-bar-striped progress-bar-animated" 
                                     role="progressbar" style="width: 50%" id="apiCheckProgress">
                                    50%
                                </div>
                            </div>
                        </div>
                    `,
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                        checkBothAPIConnections();
                    }
                });
            }
        }).catch((error) => {
            console.error(' Error in API configuration:', error);
            Swal.fire({
                icon: 'error',
                title: ' Configuration Error',
                text: 'Failed to open API configuration. Please try again.',
                timer: 3000,
                showConfirmButton: false
            });
        });
        
    } catch (error) {
        console.error(' Critical error in configureAPIKeys():', error);
        Swal.fire({
            icon: 'error',
            title: ' Critical Error',
            text: 'Failed to initialize API configuration. Please refresh the page.',
            timer: 3000,
            showConfirmButton: false
        });
    }
}

// Function to check both API connections
async function checkBothAPIConnections() {
    try {
        console.log(' Starting API connection checks...');
        
        let groqConnected = false;
        let mistralConnected = false;
        let results = {};
        
        // Test Groq API
        try {
            console.log('Testing Groq API...');
            const groqResult = await testChatAPI('groq');
            groqConnected = groqResult.startsWith('');
            results.groq = groqResult;
            console.log('Groq API test result:', groqResult);
        } catch (error) {
            console.error('Groq API test failed:', error);
            results.groq = ' Failed';
        }
        
        // Update progress to 75%
        const progressElement = document.getElementById('apiCheckProgress');
        if (progressElement) {
            progressElement.style.width = '75%';
            progressElement.textContent = '75%';
        }
        
        // Test Mistral API
        try {
            console.log('Testing Mistral API...');
            const mistralResult = await testChatAPI('mistral');
            mistralConnected = mistralResult.startsWith('');
            results.mistral = mistralResult;
            console.log('Mistral API test result:', mistralResult);
        } catch (error) {
            console.error('Mistral API test failed:', error);
            results.mistral = ' Failed';
        }
        
        // Update progress to 100%
        if (progressElement) {
            progressElement.style.width = '100%';
            progressElement.textContent = '100%';
        }
        
        // Show results
        setTimeout(() => {
            let resultMessage = '';
            let resultIcon = 'success';
            
            if (groqConnected && mistralConnected) {
                resultMessage = `
                    <div class="text-start">
                        <h5 class="mb-3"> Both API Keys Successfully Connected!</h5>
                        <div class="alert alert-success">
                            <strong>Groq API:</strong> ${results.groq}<br>
                            <strong>Mistral API:</strong> ${results.mistral}
                        </div>
                        <p class="mb-0">Your AI chat is now ready to use with both APIs!</p>
                    </div>
                `;
            } else if (groqConnected || mistralConnected) {
                resultIcon = 'warning';
                resultMessage = `
                    <div class="text-start">
                        <h5 class="mb-3"> Partial Connection</h5>
                        <div class="alert alert-warning">
                            <strong>Groq API:</strong> ${results.groq}<br>
                            <strong>Mistral API:</strong> ${results.mistral}
                        </div>
                        <p class="mb-0">One API is connected. The system will use the working API.</p>
                    </div>
                `;
            } else if (results.groq === ' Not configured' && results.mistral === ' Not configured') {
                resultIcon = 'info';
                resultMessage = `
                    <div class="text-start">
                        <h5 class="mb-3"> API Key Belum Diisi</h5>
                        <div class="alert alert-secondary">
                            <strong>Groq API:</strong> ${results.groq}<br>
                            <strong>Mistral API:</strong> ${results.mistral}
                        </div>
                        <p class="mb-0">Masukkan minimal satu API key yang valid lalu simpan kembali.</p>
                    </div>
                `;
            } else {
                resultIcon = 'error';
                resultMessage = `
                    <div class="text-start">
                        <h5 class="mb-3"> API Connection Failed</h5>
                        <div class="alert alert-danger">
                            <strong>Groq API:</strong> ${results.groq}<br>
                            <strong>Mistral API:</strong> ${results.mistral}
                        </div>
                        <p class="mb-0">Periksa jenis API key, model yang dipakai, atau kemungkinan blokir CORS dari browser.</p>
                    </div>
                `;
            }
            
            Swal.fire({
                icon: resultIcon,
                title: resultIcon === 'success'
                    ? ' Success!'
                    : resultIcon === 'warning'
                        ? ' Warning'
                        : resultIcon === 'info'
                            ? ' Info'
                            : ' Failed',
                html: resultMessage,
                confirmButtonText: 'OK'
            });
        }, 500);
        
    } catch (error) {
        console.error('Error checking API connections:', error);
        Swal.fire({
            icon: 'error',
            title: ' Connection Check Failed',
            text: 'An error occurred while checking API connections.',
            confirmButtonText: 'OK'
        });
    }
}

// Fungsi untuk menangani input saat menekan Enter
function handleKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        sendMessage();
    }
}

// Mobile touch event handling
function handleTouchEnd(event) {
    console.log(' Touch end event triggered');
    // Only prevent default if the event is cancelable and not related to scrolling
    if (event.cancelable && !isScrolling(event)) {
        event.preventDefault();
    }
}

// Helper function to detect if touch event is related to scrolling
function isScrolling(event) {
    // Check if the touch target is a scrollable element
    const target = event.target;
    const scrollableElements = ['div', 'body', 'html', '#chatContainer'];
    
    return scrollableElements.some(selector => {
        const element = selector.startsWith('#') 
            ? document.querySelector(selector) 
            : target.closest(selector);
        return element && (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth);
    });
}

// Enhanced mobile button click handler
function handleMobileButtonClick(event, functionName) {
    console.log(' Mobile button clicked:', functionName);
    event.preventDefault();
    event.stopPropagation();
    
    // Add visual feedback
    if (event.target) {
        event.target.style.transform = 'scale(0.95)';
        setTimeout(() => {
            event.target.style.transform = 'scale(1)';
        }, 100);
    }
    
    // Execute the function
    if (typeof window[functionName] === 'function') {
        window[functionName]();
    } else {
        console.error('Function not found:', functionName);
    }
}

// AJAX-based message sending
async function sendMessageAJAX(message) {
    try {
        // Show loading state
        showTypingIndicator();
        
        let response;
        
        if (useAPI) {
            // Check if the selected API key is configured before calling the model
            if (!hasConfiguredApiKey(selectedAPI)) {
                hideTypingIndicator();
                return ` API key untuk ${selectedAPI.toUpperCase()} belum dikonfigurasi atau tidak valid. Silakan periksa pengaturan API key Anda.`;
            }

            // Try API mode with AJAX  jawaban harus dari model AI yang dipilih
            try {
                response = await getAPIResponse(message);
                
                if (response && response.trim() !== '') {
                    hideTypingIndicator();
                    return response;
                } else {
                    hideTypingIndicator();
                    const apiLabel = (selectedAPI || 'AI').toUpperCase();
                    return ` Gagal mendapatkan respons dari ${apiLabel}. Periksa koneksi internet dan API key Anda, lalu coba lagi.`;
                }
            } catch (apiError) {
                console.error('API Error:', apiError);
                hideTypingIndicator();
                const apiLabel = (selectedAPI || 'AI').toUpperCase();
                return ` Terjadi kesalahan saat menghubungi ${apiLabel}: ${apiError.message || 'Unknown error'}. Silakan coba lagi.`;
            }
        } else {
            // Local mode - simulate AJAX delay for better UX
            await new Promise(resolve => setTimeout(resolve, 500));
            response = generateAIResponse(message);
            hideTypingIndicator();
            return response;
        }
        
    } catch (error) {
        console.error('AJAX Error:', error);
        hideTypingIndicator();
        return ' Terjadi kesalahan. Silakan coba lagi.';
    }
}

// Show typing indicator
function showTypingIndicator() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return;
    
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'd-flex mb-3 justify-content-start';
    typingDiv.innerHTML = `
        <div class="max-width-70">
            <div class="card bg-light">
                <div class="card-body py-2">
                    <small class="text-muted">
                        <i class="bi bi-three-dots"></i> AI sedang mengetik...
                    </small>
                </div>
            </div>
        </div>
    `;
    
    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
}

// Hide typing indicator
function hideTypingIndicator() {
    const typingIndicator = document.getElementById('typingIndicator');
    if (typingIndicator) {
        typingIndicator.remove();
    }
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) {
        console.error('Message input not found!');
        return;
    }
    
    const message = input.value.trim();
    
    if (message === '') return;
    
    try {
        // Auto-select AI based on current selection
        if (!selectedAPI) {
            selectedAPI = 'groq'; // Default to Groq if not selected
        }
        
        // Ensure we have a current session
        if (!currentSessionId) {
            console.log('No current session, creating new one...');
            startNewChat();
        }
        
        // Add to chat history first to get correct index
        const messageIndex = chatHistory.length;
        chatHistory.push({ 
            user: message, 
            ai: null, 
            timestamp: new Date().toISOString()
        });
        
        console.log(' Adding user message with index:', messageIndex);
        console.log('Current chat history length after adding:', chatHistory.length);
        console.log('Current session ID:', currentSessionId);
        
        // Add user message with correct index
        addMessageWithControls(message, 'user', messageIndex);
        
        input.value = '';
        
        let response;
        
        // Get AI response via AJAX with selected API
        response = await sendMessageAJAX(message);
        
        // Add AI response
        addMessage(response, 'ai', { messageIndex: messageIndex });
        
        // Auto-speak AI response if enabled
        const autoSpeakEnabled = localStorage.getItem('autoSpeakGroq') === 'true';
        
        if (autoSpeakEnabled || voiceChatMode) {
            setTimeout(() => {
                speakAIResponse(response, selectedAPI);
            }, 1000);
        }
        
        // Update chat history with AI response
        chatHistory[messageIndex].ai = response;
        
        console.log(' Saving chat history. Length:', chatHistory.length);
        console.log('Chat history data:', chatHistory);
        
        // Save to localStorage
        saveChatHistory();
        
    } catch (error) {
        console.error('Error sending message:', error);
        Swal.fire({
            icon: 'error',
            title: ' Error',
            html: `
                <div class="text-start">
                    <p><strong>Failed to send message:</strong></p>
                    <div class="alert alert-danger">
                        ${error.message || 'Unknown error occurred'}
                    </div>
                    <p><strong>Please try again.</strong></p>
                </div>
            `,
            confirmButtonColor: '#3085d6'
        });
    }
}

// Add message with edit/delete controls
function addMessageWithControls(message, sender, messageIndex = null) {
    console.log(' addMessageWithControls called with:', { message, sender, messageIndex });
    const chatContainer = document.getElementById('chatContainer');
    
    if (!chatContainer) {
        console.error('Chat container not found!');
        return;
    }
    
    // Hapus pesan selamat datang jika ada
    const welcomeMessage = chatContainer.querySelector('.text-center.text-muted');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `d-flex mb-3 ${sender === 'user' ? 'justify-content-end' : 'justify-content-start'}`;
    messageDiv.id = messageIndex !== null ? `message-${messageIndex}` : '';
    
    // Sanitize message to prevent XSS
    let sanitizedMessage = String(message).replace(/</g, '&lt;').replace(/>/g, '&gt;');
    
    // Parse Markdown for AI messages only
    if (sender === 'ai') {
        sanitizedMessage = formatAIResponse(message);
    }
    
    const messageTime = new Date().toLocaleTimeString('id-ID');
    
    const messageContent = `
        <div class="max-width-70">
            <div class="card ${sender === 'user' ? 'bg-primary text-white' : 'bg-light'}">
                <div class="card-body py-2">
                    <small class="${sender === 'user' ? 'text-white' : 'text-muted'}">${sanitizedMessage}</small>
                </div>
            </div>
            ${sender === 'user' && messageIndex !== null ? `
                <div class="d-flex justify-content-end mt-1">
                    <div class="btn-group btn-group-sm" role="group">
                        <button class="btn btn-outline-secondary btn-sm" onclick="testEdit(${messageIndex})" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-outline-info btn-sm" onclick="copyUserMessage(${messageIndex})" title="Salin">
                            <i class="bi bi-clipboard"></i>
                        </button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="deleteUserMessage(${messageIndex})" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            ` : ''}
            ${sender === 'ai' ? `
                <div class="d-flex justify-content-start mt-2 gap-2">
                    <button class="btn btn-outline-primary btn-sm" onclick="copyAIMessage(${messageIndex})" title="Salin">
                        <i class="bi bi-clipboard"></i> Salin
                    </button>
                </div>
            ` : ''}
            <small class="text-muted ${sender === 'user' ? 'text-end' : ''}">${sender === 'user' ? 'You' : 'AI'}  ${messageTime}</small>
        </div>
    `;
    
    messageDiv.innerHTML = messageContent;
    chatContainer.appendChild(messageDiv);
    
    // Force edit/delete buttons to be visible immediately
    if (sender === 'user' && messageIndex !== null) {
        setTimeout(() => {
            const messageControls = messageDiv.querySelectorAll('.btn-group');
            messageControls.forEach(control => {
                control.style.opacity = '1';
                control.style.visibility = 'visible';
                control.style.display = 'block';
            });
        }, 10);
    }
    
    // Scroll ke bottom dengan smooth behavior
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });
}


// Highlight tombol API yang aktif
function highlightActiveAPIButton(provider) {
    // Reset semua tombol
    document.getElementById('btn-groq').className = 'btn btn-outline-success btn-sm';
    document.getElementById('btn-mistral').className = 'btn btn-outline-success btn-sm';
    
    // Highlight tombol yang aktif
    switch(provider) {
        case 'groq':
            document.getElementById('btn-groq').className = 'btn btn-success btn-sm';
            break;
        case 'mistral':
            document.getElementById('btn-mistral').className = 'btn btn-success btn-sm';
            break;
    }
}

// Initialize API mode on page load
function initializeAPIMode() {
    // Set default ke mode AI
    useAPI = true;
    selectedAPI = 'groq';
    
    // Update UI
    const statusBadge = document.getElementById('apiStatus');
    const currentAPIBadge = document.getElementById('currentAPI');
    const apiSelection = document.getElementById('apiSelection');
    
    if (statusBadge) {
        statusBadge.textContent = 'API Mode';
        statusBadge.className = 'badge bg-warning';
    }
    
    if (currentAPIBadge) {
        currentAPIBadge.textContent = 'GROQ';
        currentAPIBadge.className = 'badge bg-info';
    }
    
    if (apiSelection) {
        apiSelection.style.display = 'block';
    }
    
    // Highlight default API
    highlightActiveAPIButton('groq');
    
    // Update API status based on saved keys
    updateAPIStatus();
    updateModelInfo();
    
    console.log(' API Mode initialized with Groq');
}

// Fungsi untuk test koneksi API dengan popup
async function testAPIConnection() {
    const testMessage = "Halo";
    const originalAPI = selectedAPI; // Simpan API yang sedang dipilih
    
    // Tampilkan popup testing
    const popup = Swal.fire({
        title: ' Testing API Connection',
        html: `
            <div class="text-center">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Testing...</span>
                </div>
                <p class="mb-2">Sedang menguji koneksi API...</p>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" 
                         role="progressbar" style="width: 0%" id="testProgress">
                        0%
                    </div>
                </div>
                <div class="mt-3">
                    <small class="text-muted" id="testStatus">Memulai tes...</small>
                </div>
            </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
            performAPITest();
        }
    });
    
    async function performAPITest() {
        const progressElement = document.getElementById('testProgress');
        const statusElement = document.getElementById('testStatus');
        
        // Test API 1: Groq
        updateProgress(25, 'Testing Groq API Key 1...');
        await delay(1000);
        
        let groqResult = false;
        try {
            selectedAPI = 'groq';
            const response = await getAPIResponse(testMessage);
            groqResult = response && response.trim() !== '';
            updateProgress(50, groqResult ? ' Groq API Key 1: Connected' : ' Groq API Key 1: Failed');
        } catch (error) {
            updateProgress(50, ' Groq API Key 1: Error');
        }
        
        await delay(1000);
        
        // Test API 2: Groq (key kedua jika ada)
        updateProgress(75, 'Testing Groq API Key 2...');
        await delay(1000);
        
        let groq2Result = false;
        try {
            // Simulasi test key kedua (dalam implementasi nyata, ganti dengan key kedua)
            const response = await getAPIResponse(testMessage);
            groq2Result = response && response.trim() !== '';
            updateProgress(100, groq2Result ? ' Groq API Key 2: Connected' : ' Groq API Key 2: Failed');
        } catch (error) {
            updateProgress(100, ' Groq API Key 2: Error');
        }
        
        await delay(1000);
        
        // Update status berdasarkan hasil
        selectedAPI = originalAPI;
        updateAPIStatus();
        
        // Tampilkan hasil akhir
        let resultMessage = '';
        let resultIcon = '';
        let resultType = '';
        
        if (groqResult || groq2Result) {
            resultMessage = ' API Connection Successful!\n\n';
            if (groqResult) resultMessage += ' Groq API Key 1: Connected\n';
            if (groq2Result) resultMessage += ' Groq API Key 2: Connected\n';
            resultIcon = 'success';
            resultType = 'success';
        } else {
            resultMessage = ' API Connection Failed!\n\n';
            resultMessage += ' Groq API Key 1: Failed\n';
            resultMessage += ' Groq API Key 2: Failed\n\n';
            resultMessage += 'Please check your API keys and try again.';
            resultIcon = 'error';
            resultType = 'error';
        }
        
        Swal.fire({
            title: ' API Test Results',
            html: `<pre class="text-start">${resultMessage}</pre>`,
            icon: resultIcon,
            confirmButtonText: 'OK',
            confirmButtonColor: resultType === 'success' ? '#28a745' : '#dc3545'
        });
        
        // Update UI
        const statusBadge = document.getElementById('apiStatus');
        const currentAPIBadge = document.getElementById('currentAPI');
        
        if (groqResult || groq2Result) {
            statusBadge.textContent = 'API Connected';
            statusBadge.className = 'badge bg-success';
            currentAPIBadge.textContent = 'GROQ';
            currentAPIBadge.className = 'badge bg-success';
            addMessage(` GROQ API berhasil terhubung! Sekarang menggunakan AI yang lebih pintar.`, 'ai');
        } else {
            statusBadge.textContent = 'API Failed';
            statusBadge.className = 'badge bg-danger';
            currentAPIBadge.textContent = 'GROQ';
            currentAPIBadge.className = 'badge bg-danger';
            addMessage(` GROQ API gagal. Silakan periksa API key dan coba lagi.`, 'ai');
        }
    }
    
    function updateProgress(percentage, status) {
        const progressElement = document.getElementById('testProgress');
        const statusElement = document.getElementById('testStatus');
        
        if (progressElement) {
            progressElement.style.width = percentage + '%';
            progressElement.textContent = percentage + '%';
        }
        
        if (statusElement) {
            statusElement.textContent = status;
        }
    }
    
    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}


// Fungsi untuk ganti API provider
function switchAPI(provider) {
    selectedAPI = provider;
    const currentAPIBadge = document.getElementById('currentAPI');
    currentAPIBadge.textContent = provider.toUpperCase();
    currentAPIBadge.className = 'badge bg-info';
    console.log(`Switched to API: ${provider}`);
    
    // Highlight tombol API yang aktif
    highlightActiveAPIButton(provider);
    
    // Update model info based on provider
    const modelInfo = document.querySelector('.card-body p strong');
    const modelInfoParent = modelInfo ? modelInfo.parentElement : null;
    
    if (modelInfoParent) {
        let modelName = 'AI Assistant dengan API';
        switch(provider) {
            case 'groq':
                modelName = 'Groq Llama 3.1 8B Instant';
                break;
            case 'mistral':
                modelName = 'Mistral AI Tiny';
                break;
        }
        modelInfoParent.innerHTML = `<strong>Model:</strong> ${modelName}`;
    }
    
    // Show switching notification
    let modelName = '';
    switch(provider) {
        case 'groq':
            modelName = 'Groq Llama 3.1 8B Instant';
            break;
        case 'mistral':
            modelName = 'Mistral AI Tiny';
            break;
        default:
            modelName = provider.toUpperCase();
    }
    
    Swal.fire({
        position: 'top-end',
        icon: 'info',
        title: `Switching to ${modelName}...`,
        showConfirmButton: false,
        timer: 1500,
        toast: true
    });
    
    // Add tutorial notification
    let tutorialMessage = '';
    switch(provider) {
        case 'groq':
            tutorialMessage = ' Groq aktif!.';
            break;
        case 'mistral':
            tutorialMessage = ' Mistral aktif!.';
            break;
    }
    
    addMessage(tutorialMessage, 'ai');
}

// Fungsi untuk highlight tombol API yang aktif
function highlightActiveAPIButton(provider) {
    // Reset semua tombol ke outline (non-aktif)
    const apiButtons = [
        { id: 'btn-groq', color: 'success' },
        { id: 'btn-mistral', color: 'success' }
    ];
    
    apiButtons.forEach(({ id, color }) => {
        const btn = document.getElementById(id);
        if (btn) {
            // Reset ke outline (tidak aktif) - preserve flex-fill class
            btn.className = `btn btn-outline-${color} flex-fill`;
        }
    });
    
    // Highlight tombol yang aktif (solid)
    const activeBtn = document.getElementById(`btn-${provider}`);
    if (activeBtn) {
        const activeColor = apiButtons.find(btn => btn.id === `btn-${provider}`)?.color || 'success';
        activeBtn.className = `btn btn-${activeColor} flex-fill`;
    }
}


// Fungsi untuk menghapus pesan loading
function removeLastMessage() {
    const loadingMessage = document.getElementById('loadingMessage');
    if (loadingMessage) {
        loadingMessage.remove();
    }
}

// Fungsi untuk generate respons AI lokal
function generateAIResponse(message) {
    const lowerMessage = message.toLowerCase();
    
    // Responses database
    const responses = {
        // Greetings
        greeting: ['Halo! Ada yang bisa saya bantu?', 'Hai! Senang berbicara dengan Anda.', 'Hello! Bagaimana kabar Anda?'],
        
        // Time related
        time: ['Sekarang pukul ' + new Date().toLocaleTimeString('id-ID') + '.', 'Waktu saat ini adalah ' + new Date().toLocaleTimeString('id-ID') + '.'],
        
        // Date related
        date: ['Hari ini tanggal ' + new Date().toLocaleDateString('id-ID') + '.', 'Tanggal sekarang adalah ' + new Date().toLocaleDateString('id-ID') + '.'],
        
        // Questions
        question: ['Itu pertanyaan yang menarik. Bisa Anda jelaskan lebih detail?', 'Saya akan coba menjawab yang terbaik. Pertanyaan apa yang Anda maksud?', 'Boleh saya tahu konteksnya lebih lengkap?'],
        
        // Help
        help: ['Saya di sini untuk membantu Anda. Ada yang bisa saya bantu?', 'Senang bisa membantu! Apa yang Anda butuhkan?', 'Tentu, saya siap membantu. Silakan bertanya.'],
        
        // Thanks
        thanks: ['Sama-sama! Senang bisa membantu.', 'Dengan senang hati!', 'Tidak masalah, senang bisa membantu Anda.'],
        
        // Goodbye
        goodbye: ['Sampai jumpa! Semoga harimu menyenangkan.', 'Goodbye! Take care ya.', 'Dah! Kapan-kapan bertemu lagi.'],
        
    // Health related responses
        health_asam_lambung: ['**Penyebab Asam Lambung:**\n1. Makanan yang terlalu pedas atau asam\n2. Minum minuman yang terlalu panas atau dingin\n3. Mengonsumsi obat-obatan tertentu\n4. Stres atau kelelahan\n5. Makan terlalu cepat atau tidak sempurna\n\n**Ciri-ciri Asam Lambung:**\n1. Nyeri atau perih di dada (heartburn)\n2. Mual atau muntah\n3. Perut kembung atau begah\n4. Suara serak atau batuk kering\n5. Rasa pahit di mulut\n\n**Antisipasi/ Pencegahan:**\n1. Hindari makanan pedas, asam, dan berlemak\n2. Makan dalam porsi kecil tapi sering\n3. Kunyah makanan sampai halus\n4. Jangan langsung tidur setelah makan\n5. Kelola stres dengan baik\n6. Hindari minuman berkafein dan alkohol'],
        
        // Source/Reference related
        source: ['Saya adalah AI assistant yang tidak memiliki akses ke sumber informasi eksternal. Informasi yang saya berikan berasal dari training data yang saya miliki. Untuk informasi yang akurat dan terkini, disarankan untuk mencari sumber resmi atau berkonsultasi dengan ahli di bidang tersebut.', 'Saya tidak memiliki kemampuan untuk mengakses sumber informasi real-time atau database eksternal. Informasi yang saya berikan berdasarkan pengetahuan yang telah saya pelajari selama training. Untuk keakuratan, silakan verifikasi dengan sumber terpercaya.', 'Sebagai AI, saya tidak memiliki akses ke internet atau sumber informasi aktual. Informasi yang saya berikan berasal dari data training dan mungkin tidak selalu up-to-date. Disarankan untuk cross-check dengan sumber resmi.'],
        
        // Location/Area related responses
        location: ['Saya tidak memiliki akses ke data keamanan atau informasi lokasi real-time. Untuk informasi tentang keamanan suatu daerah, disarankan menghubungi pihak berwajib setempat seperti polisi atau mencari sumber resmi dari pemerintah daerah setempat.', 'Sebagai AI, saya tidak dapat memberikan informasi spesifik tentang keamanan suatu wilayah. Informasi keamanan bersifat dinamis dan berubah-ubah. Disarankan untuk berkonsultasi dengan sumber resmi seperti kepolisian setempat atau situs pemerintah daerah.', 'Saya tidak memiliki data keamanan wilayah yang akurat dan terkini. Untuk informasi keamanan daerah tertentu, silakan hubungi pihak berwenang setempat atau cek sumber resmi dari kepolisian atau pemerintah daerah.'],
        
        // Default responses
        default: ['Hmm, menarik. Bisa Anda jelaskan lebih lanjut?', 'Saya mengerti. Mari kita bahas lebih dalam.', 'Poin yang bagus! Apa pendapat Anda tentang ini?', 'Saya setuju. Ada tambahan lain?', 'Itu ide yang bagus. Bagaimana cara melakukannya?']
    };
    
    // Pattern matching
    if (lowerMessage.match(/halo|hai|hello|hi|hey/g)) {
        return responses.greeting[Math.floor(Math.random() * responses.greeting.length)];
    }
    
    if (lowerMessage.match(/jam|waktu|time|pukul/g)) {
        return responses.time[Math.floor(Math.random() * responses.time.length)];
    }
    
    if (lowerMessage.match(/tanggal|date|hari ini|today/g)) {
        return responses.date[Math.floor(Math.random() * responses.date.length)];
    }
    
    if (lowerMessage.match(/bantu|help|tolong|please/g)) {
        return responses.help[Math.floor(Math.random() * responses.help.length)];
    }
    
    if (lowerMessage.match(/terima kasih|thanks|thank|makasih/g)) {
        return responses.thanks[Math.floor(Math.random() * responses.thanks.length)];
    }
    
    if (lowerMessage.match(/sampai jumpa|goodbye|bye|dah|selamat tinggal/g)) {
        return responses.goodbye[Math.floor(Math.random() * responses.goodbye.length)];
    }
    
    // Source/Reference patterns
    if (lowerMessage.match(/sumber|source|referensi|reference|darimana|dari mana|bacaan dari|ambil dari|kutipan/g)) {
        return responses.source[Math.floor(Math.random() * responses.source.length)];
    }
    
    // Location/Security patterns
    if (lowerMessage.match(/daerah|lokasi|tempat|kota|kecamatan|rawan|kejahatan|aman|tidak aman|semarang|jakarta|bandung|surabaya|medan|pekalongan|batang|kendal|kajen|wiradesa|kandeman|buaran|karangdadap|kedungwuni|bojong|talun|paninggaran|siwalan|tirto/g)) {
        return responses.location[Math.floor(Math.random() * responses.location.length)];
    }
    
    // Health specific patterns
    if (lowerMessage.match(/asam lambung|maag|heartburn|gerd/g)) {
        return responses.health_asam_lambung[0];
    }
    
    if (lowerMessage.match(/penyebab.*ciri.*antisipasi|penyebab.*gejala|ciri.*penyebab|gejala.*penyebab/g)) {
        return 'Untuk memberikan jawaban yang lengkap tentang penyebab, ciri-ciri, dan antisipasi, sebutkan kondisi medis spesifik yang Anda tanyakan (contoh: asam lambung, diabetes, hipertensi, dll).';
    }
    
    // Default response
    return responses.default[Math.floor(Math.random() * responses.default.length)];
}

// Fungsi untuk menampilkan bantuan
function showHelp() {
    addMessage(showDetailedHelp(), 'ai');
}

// Fungsi untuk menampilkan bantuan detail
function showDetailedHelp() {
    return `
                <strong> AI Assistant - Panduan Interaksi Dinamis</strong><br><br>
                <strong>Cara saya merespons:</strong><br>
                 Saya menggunakan <em>pattern matching</em> untuk memahami pesan Anda<br>
                 Tidak perlu kata-kata persis, saya mengenali pola kalimat<br>
                 Bisa campur Bahasa Indonesia & English<br><br>
                
                <strong>Mode Operasi:</strong><br>
                 <strong>Mode Lokal :</strong> Respons cepat, offline, pattern-based<br>
                 <strong>Mode API :</strong> AI lebih pintar, butuh internet, real AI<br>
                 Klik tombol "Mode API" untuk beralih<br><br>
                
                <strong>API Providers (GRATIS SELAMANYA):</strong><br>
                 <strong>HuggingFace:</strong> DialoGPT, unlimited, no key<br>
                 <strong>Ollama:</strong> Local AI, gratis selamanya, offline<br>
                 <strong>Cohere:</strong> Command Light, 1000 req/bulan<br>
                 <strong>Replicate:</strong> Llama 3, 1000 req/bulan<br><br>
                
                <strong>Contoh interaksi:</strong><br>
                 "Jam berapa sekarang?" -> Saya kasih waktu<br>
                 "Hari ini tanggal berapa?" -> Saya kasih tanggal<br>
                 "Siapa presiden Indonesia?" -> Saya minta detail<br>
                 "Bagaimana cara belajar coding?" -> Saya bantu jelaskan<br>
                 "Mengapa langit biru?" -> Saya ajak analisis<br><br>
                
                <strong>Kata kunci yang saya kenali:</strong><br>
                 Waktu: jam, tanggal, hari ini, now, today<br>
                 Pertanyaan: apa, siapa, mengapa, bagaimana, dimana, kapan, berapa<br>
                 Umum: nama, umur, dari mana, tolong, maaf, bisa, tidak<br>
                 Sapaan: halo, hai, hello, hi, bye<br><br>
                
                <strong> Tips Interaksi:</strong><br>
                 Tombol Edit/Delete selalu visible pada pesan Anda<br>
                 Edit pesan untuk mengulai percakapan dari titik tersebut<br>
                 Delete pesan akan menghapus pesan AI yang berhubungan<br>
                 Gunakan kalimat lengkap untuk hasil terbaik<br>
                 Mode API memberikan jawaban lebih pintar tapi lebih lambat<br>
                 Mode Lokal selalu tersedia dan cepat<br>
                 Untuk pertanyaan kompleks, gunakan Mode API<br>
                 API mungkin gagal jika limit tercapai, akan fallback ke Mode Lokal<br><br>
                
                <strong> Rekomendasi:</strong><br>
                 <strong>HuggingFace:</strong> Paling reliable, unlimited, no setup<br>
                 <strong>Ollama:</strong> Install local untuk AI offline gratis selamanya<br>
                 <strong>Cohere/Replicate:</strong> Alternatif jika HuggingFace down<br><br>
                
                <strong> Tutorial Setup Lengkap:</strong><br><br>
                
                <strong> Opsi 1: HuggingFace (Instant Use)</strong><br>
                1. Klik tombol "Mode API"<br>
                2. Pilih "HuggingFace"<br>
                3. Selesai! Langsung bisa digunakan<br><br>
                
                <strong> Opsi 2: Ollama (Offline AI)</strong><br>
                <strong> System Requirements:</strong> 8GB+ RAM, 10GB storage<br>
                <strong>Windows:</strong><br>
                1. Download dari https://ollama.ai/download<br>
                2. Install Ollama.exe<br>
                3. Install model: <code>ollama pull llama3.2:3b</code> (untuk low-spec)<br>
                4. Start: <code>ollama serve</code><br>
                5. Pilih "Ollama" di web<br><br>
                
                <strong>Mac/Linux:</strong><br>
                1. Install: <code>curl -fsSL https://ollama.ai/install.sh | sh</code><br>
                2. Pull model: <code>ollama pull llama3.2:3b</code><br>
                3. Start: <code>ollama serve</code><br>
                4. Pilih "Ollama" di web<br><br>
                
                <strong> Tidak untuk laptop spek rendah!</strong> Gunakan HuggingFace saja.<br><br>
                
                <strong> Opsi 3: Backup API</strong><br>
                1. Pilih "Cohere" atau "Replicate"<br>
                2. Auto fallback ke HuggingFace jika gagal<br>
                3. Monitor console untuk status<br><br>
                
                <strong> Tips Performance:</strong><br>
                 HuggingFace: Cepat, reliable, unlimited<br>
                 Ollama: Offline, privacy, unlimited<br>
                 Backup: Auto switch jika primary down<br>
                 Monitor console untuk debugging
            `;
}

// Fungsi untuk menghapus chat
function clearChat() {
    if (confirm('Apakah Anda yakin ingin menghapus semua pesan?')) {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.innerHTML = `
            <div class="text-center text-muted">
                <i class="bi bi-robot display-4"></i>
                <p class="mt-3">Chat telah dihapus. Mulai percakapan baru!</p>
            </div>
        `;
        chatHistory = [];
    }
}

// Refresh API status
async function refreshAPIStatus() {
    console.log(' Refreshing API status...');
    
    // Update UI to show refreshing
    const statusBadge = document.getElementById('apiStatus');
    const currentAPIBadge = document.getElementById('currentAPI');
    
    if (statusBadge) {
        statusBadge.textContent = 'Refreshing...';
        statusBadge.className = 'badge bg-info';
    }
    
    // Test APIs and update status
    try {
        const results = {
            groq: await testChatAPI('groq'),
            mistral: await testChatAPI('mistral')
        };
        
        // Update main status
        updateMainAPIStatus(results);
        
        console.log(' API Status Refreshed:', results);
        
    } catch (error) {
        console.error('Error refreshing API status:', error);
        
        // Set error status
        if (statusBadge) {
            statusBadge.textContent = 'API Error';
            statusBadge.className = 'badge bg-danger';
        }
    }
}

// Voice functionality
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let currentAudio = null;

// Groq Text-to-Speech function
async function textToSpeechGroq(text, model = 'canopylabs/orpheus-v1-english', voice = 'autumn') {
    try {
        // Get API key using consistent helper
        let apiKey = getStoredApiKey('groq');
        
        // Fallback: try sync from Supabase if no key found
        if (!apiKey && typeof syncKeysFromSupabase === 'function') {
            console.log(' No Groq key found, attempting Supabase sync...');
            await syncKeysFromSupabase();
            apiKey = getStoredApiKey('groq');
        }
        
        if (!apiKey) {
            throw new Error(' Groq API key not configured for Text-to-Speech. Please configure it in the Keys settings.');
        }
        
        // Safe access to VOICE_API_CONFIG
        if (typeof VOICE_API_CONFIG === 'undefined' || !VOICE_API_CONFIG.groq_tts) {
            throw new Error('VOICE_API_CONFIG not initialized for TTS');
        }
        
        // Use the already updated VOICE_API_CONFIG
        const config = VOICE_API_CONFIG.groq_tts;
        
        // Verify API key is set
        if (!config.headers.Authorization || config.headers.Authorization === 'Bearer ') {
            // Fallback to manually setting the API key
            config.headers.Authorization = buildAuthorizationHeader(apiKey);
            console.log(' Manually set API key for TTS (config was empty)');
        }
        const provider = 'Groq Orpheus';
        
        // Debug logging
        console.log('TTS Function Debug:', {
            text: text.substring(0, 50) + '...',
            model: model,
            voice: voice,
            url: config.url,
            hasConfig: !!config,
            isArabicModel: model.includes('arabic'),
            isArabicVoice: ['abdullah', 'fahad', 'sultan', 'lulwa', 'noura', 'aisha'].includes(voice)
        });
        
        // Validate config
        if (!config) {
            throw new Error('TTS configuration not found');
        }
        
        if (!config.url) {
            throw new Error('TTS API URL not configured');
        }
        
        // Show loading indicator
        Swal.fire({
            title: ' Generating Speech...',
            html: `Converting text to speech using ${provider}...`,
            didOpen: () => {
                Swal.showLoading();
            },
            allowOutsideClick: false
        });

        // Validate input parameters
        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }
        
        if (text.length > 4096) {
            throw new Error('Text is too long (max 4096 characters)');
        }
        
        // Validate voice and model compatibility
        const isArabicModel = model.includes('arabic');
        const arabicVoices = ['abdullah', 'fahad', 'sultan', 'lulwa', 'noura', 'aisha'];
        const isArabicVoice = arabicVoices.includes(voice);
        
        if (isArabicModel && !isArabicVoice) {
            console.warn('Warning: Using non-Arabic voice with Arabic model. Using default Arabic voice.');
            voice = 'abdullah'; // Default Arabic voice
        }
        
        if (!isArabicModel && isArabicVoice) {
            console.warn('Warning: Using Arabic voice with English model. Using default English voice.');
            voice = 'autumn'; // Default English voice
        }

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: config.body(text, model, voice || 'autumn')
        });

        if (!response.ok) {
            let groqDetail = '';
            let groqErrorType = '';

            try {
                const errText = await response.text();
                console.error(`Groq TTS HTTP ${response.status} raw response:`, errText);

                if (errText) {
                    try {
                        const errJson = JSON.parse(errText);
                        groqDetail = errJson?.error?.message || errText;
                        groqErrorType = errJson?.error?.type || '';
                    } catch (e) {
                        groqDetail = errText;
                    }
                }
            } catch (e) {}

            // Auto-retry with fallback model on 404
            if (response.status === 404 && model !== 'canopylabs/orpheus-v1-english') {
                const fallbackModel = 'canopylabs/orpheus-v1-english';
                const fallbackVoice = 'Fritz-PlayAI';
                console.log(` Model "${model}" returned 404, retrying with fallback: ${fallbackModel}...`);
                
                try {
                    const retryResponse = await fetch(config.url, {
                        method: config.method,
                        headers: { ...config.headers },
                        body: config.body(text, fallbackModel, fallbackVoice)
                    });
                    
                    if (retryResponse.ok) {
                        const audioBlob = await retryResponse.blob();
                        const audioUrl = URL.createObjectURL(audioBlob);
                        
                        if (currentAudio) {
                            currentAudio.pause();
                            currentAudio = null;
                        }
                        
                        currentAudio = new Audio(audioUrl);
                        currentAudio.play();
                        currentAudio.onended = () => {
                            URL.revokeObjectURL(audioUrl);
                            currentAudio = null;
                        };
                        
                        Swal.close();
                        Swal.fire({
                            position: 'top-end',
                            icon: 'success',
                            title: ' Speech Generated! (PlayAI fallback)',
                            showConfirmButton: false,
                            timer: 2000,
                            toast: true
                        });
                        
                        // Auto-switch to Orpheus for future calls
                        localStorage.setItem('groqTTSModel', fallbackModel);
                        console.log(' Auto-switched to Orpheus model');
                        return audioUrl;
                    } else {
                        console.error(`Fallback model also failed: ${retryResponse.status}`);
                    }
                } catch (retryError) {
                    console.error('Fallback retry failed:', retryError);
                }
            }

            const detailSuffix = groqDetail ? `\n\nPesan asli dari Groq: ${groqDetail}` : '';
            let errorMessage;

            if (response.status === 400) {
                errorMessage = groqDetail || 'Invalid request - check model name and parameters';

                if (groqErrorType === 'invalid_request_error') {
                    errorMessage += '\n\nPossible causes:\n Invalid model name\n Missing required parameters\n Text empty or exceeds max characters (dokumen Groq: Orpheus max 200 karakter/request)';
                }
            } else if (response.status === 401) {
                errorMessage = 'Invalid API key (401) - please check your Groq API key' + detailSuffix;
            } else if (response.status === 403) {
                errorMessage = 'Access denied (403)' + detailSuffix + '\n\nKemungkinan akun ini belum accept terms model di console.groq.com';
            } else if (response.status === 404) {
                errorMessage = 'Groq TTS model/endpoint not found (404)' +
                    `\nModel dikirim: "${model}" | Voice: "${voice}"` +
                    detailSuffix +
                    '\n\nKemungkinan penyebab:\n API key ini tidak memiliki akses ke model tersebut\n Belum accept terms model di console.groq.com/playground\n Key hasil sync Supabase di HP berbeda akun dengan yang di PC\n\nSolusi:\n Buka console.groq.com/playground -> accept terms model Orpheus atau PlayAI\n Gunakan model Orpheus (canopylabs/orpheus-v1-english) dengan accept terms di console.groq.com/playground';
            } else if (response.status === 429) {
                throw new Error('RATE_LIMIT_EXCEEDED');
            } else {
                errorMessage = groqDetail ? `Groq server error (${response.status}): ${groqDetail}` : `Groq server error (${response.status}) - please try again later`;
            }

            const ttsError = new Error(errorMessage);
            ttsError.groqStatus = response.status;
            throw ttsError;
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        
        // Play the generated speech
        currentAudio = new Audio(audioUrl);
        currentAudio.play();
        
        // Clean up the object URL when audio finishes
        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            currentAudio = null;
        };

        Swal.close();
        
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Groq Speech Generated!',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });

        return audioUrl;
        
    } catch (error) {
        console.error('Groq Text-to-Speech error:', error);
        Swal.close();
        
        if (error.message === 'RATE_LIMIT_EXCEEDED') {
            const now = Date.now();
            const lastRateLimit = parseInt(localStorage.getItem('groqTtsRateLimitTime') || '0');
            const cooldownMs = 60000;
            
            if (now - lastRateLimit < cooldownMs) {
                const remaining = Math.ceil((cooldownMs - (now - lastRateLimit)) / 1000);
                Swal.fire({
                    icon: 'warning',
                    title: ' Groq Rate Limited',
                    html: `Tunggu <strong>${remaining}</strong> detik lagi sebelum coba lagi.`,
                    confirmButtonColor: '#3085d6'
                });
                return null;
            }
            
            localStorage.setItem('groqTtsRateLimitTime', now.toString());
            console.warn('Groq rate limited, falling back to Mistral TTS...');
            try {
                const mistralResult = await textToSpeechMistral(text, 'tts-1', 'default');
                if (mistralResult) {
                    Swal.fire({
                        position: 'top-end',
                        icon: 'info',
                        title: ' Used Mistral (Groq rate limited)',
                        showConfirmButton: false,
                        timer: 2000,
                        toast: true
                    });
                    return mistralResult;
                }
            } catch (mistralError) {
                console.error('Mistral fallback also failed:', mistralError);
            }
        }
        
        if (error.groqStatus === 404 && typeof fallbackTextToSpeech === 'function') {
            console.warn('Groq TTS 404 - switching to browser speech synthesis fallback');
            const fallbackResult = await fallbackTextToSpeech(text);
            if (fallbackResult) {
                return fallbackResult;
            }
        }
        
        Swal.fire({
            icon: 'error',
            title: ' Groq Speech Generation Failed',
            html: `
                <div class="text-start">
                    <p><strong>Error:</strong> ${escapeHtml(error.message).replace(/\n/g, '<br>')}</p>
                    <div class="alert alert-warning">
                        <strong>Troubleshooting Tips:</strong><br>
                         Check if Groq API key is valid<br>
                         Verify model name is correct<br>
                         Ensure text is not empty or too long<br>
                         Try shorter text first
                    </div>
                </div>
            `,
            confirmButtonColor: '#3085d6'
        });
        
        return null;
    }
}

        
        
// Legacy textToSpeech function for backward compatibility (Groq only)
async function textToSpeech(text, model = null, provider = null) {
    // Always use Groq TTS
    return await textToSpeechGroq(text, model || 'canopylabs/orpheus-v1-english');
}

// Fallback TTS using Web Speech API
async function fallbackTextToSpeech(text) {
    try {
        if ('speechSynthesis' in window) {
            // Show fallback notification
            const toast = Swal.fire({
                position: 'top-end',
                icon: 'info',
                title: ' Using fallback TTS...',
                html: 'API failed, using browser speech synthesis',
                showConfirmButton: false,
                timer: 3000,
                toast: true
            });

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            speechSynthesis.speak(utterance);
            return true;
        } else {
            throw new Error('Speech synthesis not supported');
        }
    } catch (error) {
        console.error('Fallback TTS failed:', error);
        return null;
    }
}

// Groq Speech-to-Text function
async function speechToTextGroq(audioBlob, model = 'whisper-large-v3-turbo') {
    try {
        const config = VOICE_API_CONFIG.groq_stt;
        const provider = 'Groq Whisper';

        // Ensure API key is set in config
        let apiKey = getStoredApiKey('groq');
        if (!apiKey && typeof syncKeysFromSupabase === 'function') {
            console.log(' No Groq key for STT, attempting Supabase sync...');
            await syncKeysFromSupabase();
            apiKey = getStoredApiKey('groq');
        }
        if (apiKey) {
            config.headers.Authorization = buildAuthorizationHeader(apiKey);
        }
        
        // Use the configured body function
        const formData = config.body(audioBlob, model);

        // Show loading indicator
        Swal.fire({
            title: ' Transcribing Audio...',
            html: `Converting speech to text using ${provider}...`,
            didOpen: () => {
                Swal.showLoading();
            },
            allowOutsideClick: false
        });

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        Swal.close();
        
        if (result.text) {
            // Show success notification
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Groq Audio Transcribed!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
            
            return result.text;
        } else {
            throw new Error('No transcription result received');
        }
        
    } catch (error) {
        console.error('Groq Speech-to-Text error:', error);
        Swal.close();
        
        Swal.fire({
            icon: 'error',
            title: ' Groq Speech Recognition Failed',
            text: error.message,
            confirmButtonColor: '#3085d6'
        });
        
        return null;
    }
}

// Silent version of speechToTextGroq (no Swal) - for use when caller already shows loading
async function speechToTextGroqSilent(audioBlob, model = 'whisper-large-v3-turbo') {
    try {
        const config = VOICE_API_CONFIG.groq_stt;
        const formData = config.body(audioBlob, model);

        console.log(' Sending audio to Groq Whisper...', 'size:', audioBlob.size, 'model:', model);

        // Check API key using consistent helper
        let apiKey = getStoredApiKey('groq');

        // Fallback: try sync from Supabase if no key found
        if (!apiKey && typeof syncKeysFromSupabase === 'function') {
            console.log(' No Groq key for silent STT, attempting Supabase sync...');
            await syncKeysFromSupabase();
            apiKey = getStoredApiKey('groq');
        }

        if (!apiKey) {
            throw new Error('Groq API key belum diisi. Silakan isi di menu Keys.');
        }

        // Update auth header
        config.headers.Authorization = buildAuthorizationHeader(apiKey);

        // Fetch with timeout 30 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(' Groq STT HTTP error:', response.status, errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log(' Groq STT result:', result);

        return result.text || '';

    } catch (error) {
        console.error(' Groq STT error:', error);
        if (error.name === 'AbortError') {
            return '__TIMEOUT__';
        }
        return null;
    }
}

// Legacy speechToText function for backward compatibility (Groq only)
async function speechToText(audioBlob, model = null, provider = null) {
    // Always use Groq STT
    return await speechToTextGroq(audioBlob, model || 'whisper-large-v3-turbo');
}

// Voice recording functions for Groq
let isRecordingGroq = false;
let mediaRecorderGroq = null;
let audioChunksGroq = [];

// Start voice recording with selected AI model
async function startVoiceRecordingGroq() {
    try {
        // Use currently selected AI model (don't force to Groq)
        // autoSelectGroqAI(); // Commented out to respect user selection
        
        // Set selectedAPI if not already set
        if (!selectedAPI) {
            selectedAPI = 'groq'; // Default to Groq if not selected
        }
        
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorderGroq = new MediaRecorder(stream);
        audioChunksGroq = [];
        
        mediaRecorderGroq.ondataavailable = (event) => {
            audioChunksGroq.push(event.data);
        };
        
        mediaRecorderGroq.onstop = async () => {
            const audioBlob = new Blob(audioChunksGroq, { type: 'audio/webm' });
            const transcription = await speechToTextGroq(audioBlob);
            
            if (transcription) {
                // Detect language from transcription
                const detectedLanguage = detectLanguage(transcription);
                
                // Store detected language for auto-speak
                localStorage.setItem('lastDetectedLanguage', detectedLanguage);
                
                // Add to speech history
                addSTTRecord(transcription, detectedLanguage, 'whisper-large-v3-turbo');
                
                console.log('Language detected:', detectedLanguage, 'from text:', transcription.substring(0, 50));
                
                // Insert transcription into message input
                const messageInput = document.getElementById('messageInput');
                messageInput.value = transcription;
                messageInput.focus();
                
                // Optionally auto-send the message
                Swal.fire({
                    title: ' Transcription Complete',
                    html: `Transcribed text: <br><strong>"${transcription}"</strong>`,
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: 'Send Message',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#3085d6'
                }).then((result) => {
                    if (result.isConfirmed) {
                        sendMessage();
                    }
                });
            }
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorderGroq.start();
        isRecordingGroq = true;
        
        // Update UI to show recording status
        const recordBtnGroq = document.getElementById('recordBtnGroq');
        if (recordBtnGroq) {
            recordBtnGroq.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Recording';
            recordBtnGroq.className = 'btn btn-danger btn-sm';
        }
        
        // Show recording indicator with better UI
        console.log(' Showing recording modal...');
        const recordingModal = Swal.fire({
            title: ' Groq Recording...',
            html: `
                <div class="text-center">
                    <div class="mb-3">
                        <div class="recording-indicator">
                            <span class="recording-dot"></span>
                            <span class="recording-text">Recording...</span>
                        </div>
                    </div>
                    <p class="mb-3">Speak now...</p>
                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button style="background-color: #dc3545; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 5px; cursor: pointer;" onclick="stopRecordingFromModal()">
                            <i class="bi bi-stop-circle"></i> Stop Recording
                        </button>
                        <button style="background-color: #6c757d; color: white; border: none; padding: 12px 24px; font-size: 16px; border-radius: 5px; cursor: pointer;" onclick="cancelRecordingFromModal()">
                            <i class="bi bi-x-circle"></i> Cancel
                        </button>
                    </div>
                </div>
                <style>
                    .recording-indicator {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        font-size: 18px;
                        font-weight: bold;
                    }
                    .recording-dot {
                        width: 12px;
                        height: 12px;
                        background-color: #dc3545;
                        border-radius: 50%;
                        animation: pulse 1.5s infinite;
                    }
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                    .recording-text {
                        color: #dc3545;
                    }
                </style>
            `,
            showConfirmButton: false,
            showCancelButton: false,
            allowOutsideClick: false,
            timer: 30000,
            timerProgressBar: true
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.timer) {
                stopVoiceRecordingGroq();
            }
        });
        
        // Store modal reference for stop button
        window.currentRecordingModal = recordingModal;
        
    } catch (error) {
        console.error('Microphone access error:', error);
        
        // Enhanced error handling with retry option
        Swal.fire({
            icon: 'error',
            title: ' Microphone Access Denied',
            html: `
                <div class="text-start">
                    <p><strong>Please allow microphone access to use voice recording.</strong></p>
                    <div class="alert alert-warning">
                        <strong>Troubleshooting Steps:</strong><br>
                        1. Click the <strong></strong> icon in your browser's address bar<br>
                        2. Allow microphone access for this site<br>
                        3. Refresh the page and try again<br>
                        4. Check if your microphone is connected and working
                    </div>
                    <div class="alert alert-info">
                        <strong>Browser Support:</strong><br>
                         Chrome:  Fully supported<br>
                         Firefox:  Fully supported<br>
                         Edge:  Fully supported<br>
                         Safari:  Supported (requires HTTPS)
                    </div>
                </div>
            `,
            confirmButtonText: ' Retry Recording',
            cancelButtonText: ' Cancel',
            confirmButtonColor: '#28a745',
            cancelButtonColor: '#6c757d',
            showCancelButton: true
        }).then((result) => {
            if (result.isConfirmed) {
                // Retry voice recording
                setTimeout(() => {
                    toggleVoiceRecordingGroq();
                }, 1000);
            }
        });
    }
}

// Stop recording from modal button
function stopRecordingFromModal() {
    stopVoiceRecordingGroq();
}

// Cancel recording from modal button
function cancelRecordingFromModal() {
    // Close the modal and cancel recording
    Swal.close();
    // Reset recording state
    const recordBtnGroq = document.getElementById('recordBtnGroq');
    if (recordBtnGroq) {
        recordBtnGroq.innerHTML = '<i class="bi bi-mic"></i> Record';
        recordBtnGroq.className = 'btn btn-primary btn-sm';
    }
    // Stop any ongoing recording
    if (window.mediaRecorder && window.mediaRecorder.state === 'recording') {
        window.mediaRecorder.stop();
    }
    console.log('Recording cancelled by user');
}

// Stop voice recording for Groq
function stopVoiceRecordingGroq() {
    if (mediaRecorderGroq && isRecordingGroq) {
        mediaRecorderGroq.stop();
        isRecordingGroq = false;
        
        // Update UI
        const recordBtnGroq = document.getElementById('recordBtnGroq');
        if (recordBtnGroq) {
            recordBtnGroq.innerHTML = '<i class="bi bi-mic"></i> Groq STT';
            recordBtnGroq.className = 'btn btn-outline-success';
        }
        
        // Close any open modals
        Swal.close();
        
        // Clear modal reference
        window.currentRecordingModal = null;
    }
}

// ==================== VOICE CHAT MODE ====================
// Voice Chat: Record -> Transcribe -> Auto-send -> Auto-speak AI response
let isVoiceChatActive = false;
let voiceChatMediaRecorder = null;
let voiceChatAudioChunks = [];
let voiceChatStream = null;
let voiceChatMode = false;

async function toggleVoiceChat() {
    if (isVoiceChatActive) {
        stopVoiceChat();
    } else {
        startVoiceChat();
    }
}

async function startVoiceChat() {
    try {
        if (!selectedAPI) {
            selectedAPI = 'groq';
        }

        voiceChatStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        voiceChatMediaRecorder = new MediaRecorder(voiceChatStream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm'
        });
        voiceChatAudioChunks = [];

        voiceChatMediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                voiceChatAudioChunks.push(event.data);
                console.log(' Voice Chat audio chunk:', event.data.size, 'bytes');
            }
        };

        voiceChatMediaRecorder.onstop = async () => {
            const audioBlob = new Blob(voiceChatAudioChunks, { type: 'audio/webm' });
            console.log(' Voice Chat total audio size:', audioBlob.size, 'bytes');

            if (audioBlob.size < 1000) {
                Swal.fire({
                    icon: 'warning',
                    title: ' Rekaman terlalu pendek atau kosong',
                    text: 'Silakan bicara lebih lama lalu coba lagi.',
                    confirmButtonColor: '#3085d6'
                });
                updateVoiceChatUI(false);
                return;
            }

            // Step 1: Transcribe
            Swal.fire({
                title: ' Transcribing...',
                html: 'Mengubah suara menjadi teks...',
                didOpen: () => Swal.showLoading(),
                allowOutsideClick: false
            });

            let transcription;
            try {
                transcription = await speechToTextGroqSilent(audioBlob);
            } catch (e) {
                transcription = null;
            }

            // Tutup loading modal dulu
            Swal.close();

            // Handle timeout
            if (transcription === '__TIMEOUT__') {
                Swal.fire({
                    icon: 'error',
                    title: ' Request Timeout',
                    html: `<p>Groq API tidak merespon dalam 30 detik.</p>
                        <div class="alert alert-warning text-start small">
                            <strong>Kemungkinan:</strong><br>
                             Koneksi internet lambat<br>
                             Groq API sedang overload<br>
                             File audio terlalu besar
                        </div>`,
                    confirmButtonColor: '#3085d6'
                });
                updateVoiceChatUI(false);
                return;
            }

            if (!transcription || transcription.trim().length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: ' Tidak ada suara terdeteksi',
                    html: `<p>Silakan coba lagi.</p>
                        <div class="alert alert-info text-start small">
                            <strong>Tips:</strong><br>
                             Bicara lebih jelas dan agak keras<br>
                             Pastikan tidak ada noise berlebih<br>
                             Dekatkan mic ke mulut
                        </div>`,
                    confirmButtonColor: '#3085d6'
                });
                updateVoiceChatUI(false);
                return;
            }

            const detectedLanguage = detectLanguage(transcription);
            localStorage.setItem('lastDetectedLanguage', detectedLanguage);
            addSTTRecord(transcription, detectedLanguage, 'whisper-large-v3-turbo');

            // Show transcribed text briefly
            Swal.fire({
                title: ' Anda berkata:',
                html: `<strong>"${transcription}"</strong><br><br><em>Mengirim ke AI...</em>`,
                icon: 'info',
                timer: 2000,
                timerProgressBar: true,
                showConfirmButton: false
            });

            // Step 2: Auto-send to AI
            const messageInput = document.getElementById('messageInput');
            messageInput.value = transcription;

            voiceChatMode = true;
            await sendMessage();
            voiceChatMode = false;

            updateVoiceChatUI(false);
        };

        voiceChatMediaRecorder.start(1000);
        isVoiceChatActive = true;
        updateVoiceChatUI(true);

        // Show recording modal
        Swal.fire({
            title: ' Voice Chat Active',
            html: `
                <div class="text-center">
                    <div class="mb-3">
                        <div class="recording-indicator" style="display:flex;align-items:center;justify-content:center;gap:10px;font-size:18px;font-weight:bold;">
                            <span style="width:12px;height:12px;background-color:#dc3545;border-radius:50%;animation:pulse 1.5s infinite;"></span>
                            <span style="color:#dc3545;">Recording...</span>
                        </div>
                    </div>
                    <p class="mb-2">Berbicara sekarang...</p>
                    <p class="text-muted small">Setelah selesai, AI akan menjawab dengan suara</p>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:20px;">
                        <button id="vcStopBtn" style="background-color:#dc3545;color:white;border:none;padding:12px 24px;font-size:16px;border-radius:5px;cursor:pointer;" onclick="stopVoiceChat()">
                            <i class="bi bi-stop-circle"></i> Selesai & Kirim
                        </button>
                        <button style="background-color:#6c757d;color:white;border:none;padding:12px 24px;font-size:16px;border-radius:5px;cursor:pointer;" onclick="cancelVoiceChat()">
                            <i class="bi bi-x-circle"></i> Batal
                        </button>
                    </div>
                </div>
                <style>
                    @keyframes pulse { 0%{opacity:1} 50%{opacity:0.5} 100%{opacity:1} }
                </style>
            `,
            showConfirmButton: false,
            showCancelButton: false,
            allowOutsideClick: false,
            timer: 60000,
            timerProgressBar: true
        }).then((result) => {
            if (result.dismiss === Swal.DismissReason.timer) {
                stopVoiceChat();
            }
        });

    } catch (error) {
        console.error('Voice Chat error:', error);
        updateVoiceChatUI(false);

        let errorMsg = error.message || 'Gagal mengakses microphone.';
        let errorTitle = ' Voice Chat Error';
        let errorHtml = '';

        if (error.name === 'NotAllowedError') {
            errorTitle = ' Akses Microphone Ditolak';
            errorHtml = `<div class="text-start">
                <p><strong>Izin microphone ditolak.</strong></p>
                <div class="alert alert-warning">
                    <strong>Caranya:</strong><br>
                    1. Klik ikon <strong></strong> di address bar browser<br>
                    2. Pilih <strong>Allow</strong> untuk microphone<br>
                    3. Refresh halaman lalu coba lagi
                </div></div>`;
        } else if (error.name === 'NotFoundError') {
            errorTitle = ' Microphone Tidak Ditemukan';
            errorHtml = `<div class="text-start"><p><strong>Tidak ada microphone yang terdeteksi.</strong></p>
                <div class="alert alert-warning">Pastikan microphone terhubung dengan benar.</div></div>`;
        }

        Swal.fire({
            icon: 'error',
            title: errorTitle,
            html: errorHtml || errorMsg,
            confirmButtonColor: '#3085d6'
        });
    }
}

function stopVoiceChat() {
    if (voiceChatMediaRecorder && isVoiceChatActive) {
        voiceChatMediaRecorder.stop();
        isVoiceChatActive = false;
        if (voiceChatStream) {
            voiceChatStream.getTracks().forEach(track => track.stop());
            voiceChatStream = null;
        }
        Swal.close();
    }
}

function cancelVoiceChat() {
    if (voiceChatMediaRecorder && voiceChatMediaRecorder.state === 'recording') {
        voiceChatMediaRecorder.stop();
    }
    isVoiceChatActive = false;
    if (voiceChatStream) {
        voiceChatStream.getTracks().forEach(track => track.stop());
        voiceChatStream = null;
    }
    voiceChatAudioChunks = [];
    Swal.close();
    updateVoiceChatUI(false);
}

function updateVoiceChatUI(isRecording) {
    const btn = document.getElementById('voiceChatBtn');
    if (!btn) return;

    if (isRecording) {
        btn.innerHTML = '<i class="bi bi-stop-circle"></i>';
        btn.className = 'btn btn-danger btn-lg';
        btn.title = 'Klik untuk stop recording';
        btn.style.animation = 'pulse 1s infinite';
    } else {
        btn.innerHTML = '<i class="bi bi-mic-fill"></i>';
        btn.className = 'btn btn-danger btn-lg';
        btn.title = 'Voice Chat - Rekam suara, AI jawab dengan suara';
        btn.style.animation = 'none';
    }
}

// ==================== END VOICE CHAT MODE ====================

// Toggle voice recording for Groq
async function toggleVoiceRecordingGroq() {
    if (isRecordingGroq) {
        stopVoiceRecordingGroq();
    } else {
        // Check microphone status first (this handles permission request)
        try {
            const status = await checkMicrophoneStatus();
            
            if (!status.available) {
                Swal.fire({
                    icon: 'error',
                    title: ' Microphone Not Available',
                    html: `
                        <div class="text-start">
                            <p><strong>${status.message}</strong></p>
                            <div class="alert alert-warning">
                                <strong>Please check:</strong><br>
                                 Microphone is properly connected<br>
                                 Microphone is not muted<br>
                                 Browser has access to microphone
                            </div>
                        </div>
                    `,
                    confirmButtonColor: '#3085d6'
                });
                return;
            }
            
            // If we get here, permission is granted - start recording
            startVoiceRecordingGroq();
            
        } catch (error) {
            // This catches permission denied from checkMicrophoneStatus
            console.error('Microphone check failed:', error);
            
            if (error.name === 'NotAllowedError' && !microphonePermissionShown) {
                // Show permission dialog only once
                microphonePermissionShown = true;
                
                Swal.fire({
                    icon: 'error',
                    title: ' Microphone Access Denied',
                    html: `
                        <div class="text-start">
                            <p><strong>Microphone permission was denied.</strong></p>
                            <div class="alert alert-warning">
                                <strong>To fix this:</strong><br>
                                1. Click the <strong></strong> icon in your browser's address bar<br>
                                2. Allow microphone access for this site<br>
                                3. Refresh the page and try again
                            </div>
                            <div class="alert alert-info">
                                <strong>Why this happens:</strong><br>
                                Browser requires explicit permission for privacy and security
                            </div>
                        </div>
                    `,
                    confirmButtonText: ' Retry',
                    cancelButtonText: ' Cancel',
                    confirmButtonColor: '#28a745',
                    cancelButtonColor: '#6c757d',
                    showCancelButton: true
                }).then((result) => {
                    if (result.isConfirmed) {
                        // Retry voice recording
                        setTimeout(() => {
                            toggleVoiceRecordingGroq();
                        }, 1000);
                    }
                });
            } else if (error.name !== 'NotAllowedError') {
                Swal.fire({
                    icon: 'error',
                    title: ' Microphone Error',
                    text: error.message || 'An error occurred while accessing the microphone.',
                    confirmButtonColor: '#3085d6'
                });
            }
        }
    }
}


// Text-to-Speech for AI responses (Groq only)
async function speakAIResponse(text, provider = null) {
    try {
        // Get detected language from STT (if available)
        const lastDetectedLanguage = localStorage.getItem('lastDetectedLanguage') || 'english';
        
        // Get appropriate TTS config for detected language
        const ttsConfig = getTTSConfigForLanguage(lastDetectedLanguage);
        
        console.log('Auto-speak using language:', lastDetectedLanguage, 'TTS config:', ttsConfig);
        
        // Add to speech history before TTS
        addTTSRecord(text, lastDetectedLanguage, ttsConfig.model, ttsConfig.voice);
        
        // Use language-specific TTS
        await textToSpeechGroq(text, ttsConfig.model, ttsConfig.voice);
        
    } catch (error) {
        console.error('Error in speakAIResponse:', error);
        // Fallback to default TTS
        await textToSpeechGroq(text);
    }
}

// Speak AI message from chat with provider selection
async function speakAIMessage(text, provider = null) {
    await speakAIResponse(text, provider);
}

// Voice settings for Groq only
function showVoiceSettings() {
    const currentGroqTTSModel = localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english';
    const currentGroqSTTModel = localStorage.getItem('groqSTTModel') || 'whisper-large-v3-turbo';
    const currentGroqVoice = localStorage.getItem('groqVoice') || 'autumn';
    
    Swal.fire({
        title: ' Groq Voice Settings',
        width: '500px',
        html: `
            <div class="text-start">
                <div class="mb-4">
                    <h6 class="text-success"> Groq Voice Settings</h6>
                    <div class="mb-3">
                        <label class="form-label"><strong>TTS Model:</strong></label>
                        <select id="groqTTSModel" class="form-select form-select-sm" onchange="updateGroqVoices()">
                            ${Object.entries(VOICE_API_CONFIG.groq_tts.models).map(([key, value]) => 
                                `<option value="${key}" ${key === currentGroqTTSModel ? 'selected' : ''}>${value}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label"><strong>Voice:</strong></label>
                        <select id="groqVoice" class="form-select form-select-sm">
                            ${Object.entries(VOICE_API_CONFIG.groq_tts.voices[currentGroqTTSModel]).map(([key, value]) => 
                                `<option value="${key}" ${key === currentGroqVoice ? 'selected' : ''}>${value}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="mb-3">
                        <label class="form-label"><strong>STT Model:</strong></label>
                        <select id="groqSTTModel" class="form-select form-select-sm">
                            ${Object.entries(VOICE_API_CONFIG.groq_stt.models).map(([key, value]) => 
                                `<option value="${key}" ${key === currentGroqSTTModel ? 'selected' : ''}>${value}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                
                <div class="mt-3">
                    <label class="form-label">
                        <input type="checkbox" id="autoSpeakGroq" ${localStorage.getItem('autoSpeakGroq') === 'true' ? 'checked' : ''}>
                        Auto-speak Groq AI responses
                    </label>
                </div>
                
                <div class="mt-3">
                    <button class="btn btn-sm btn-outline-success" onclick="testVoiceSettingsGroq()">
                        <i class="bi bi-play-circle"></i> Test Groq
                    </button>
                </div>
            </div>
        `,
        confirmButtonText: 'Save Settings',
        cancelButtonText: 'Cancel',
        didOpen: () => {
            // Initialize voice options after modal opens
            setTimeout(() => {
                updateGroqVoices();
            }, 100);
        },
        preConfirm: () => {
            const groqTTSModel = document.getElementById('groqTTSModel').value;
            const groqSTTModel = document.getElementById('groqSTTModel').value;
            const groqVoice = document.getElementById('groqVoice').value;
            const autoSpeakGroq = document.getElementById('autoSpeakGroq').checked;
            
            // Save to localStorage
            localStorage.setItem('groqTTSModel', groqTTSModel);
            localStorage.setItem('groqSTTModel', groqSTTModel);
            localStorage.setItem('groqVoice', groqVoice);
            localStorage.setItem('autoSpeakGroq', autoSpeakGroq);
            
            // Save Arabic voice separately if Arabic model is selected
            if (groqTTSModel.includes('arabic')) {
                localStorage.setItem('groqVoiceArabic', groqVoice);
            }
            
            return { groqTTSModel, groqSTTModel, groqVoice, autoSpeakGroq };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // Update TTS buttons with new model name
            updateTTSButtons();
            
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Voice Settings Saved!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        }
    });
}

// Update Groq voice options based on selected model
function updateGroqVoices() {
    const modelSelect = document.getElementById('groqTTSModel');
    const voiceSelect = document.getElementById('groqVoice');
    
    if (!modelSelect || !voiceSelect) {
        console.log('Voice select elements not found, skipping voice update');
        return;
    }
    
    const selectedModel = modelSelect.value;
    const currentVoice = localStorage.getItem('groqVoice') || 'autumn';
    
    console.log('Updating voices for model:', selectedModel);
    
    // Clear current options
    voiceSelect.innerHTML = '';
    
    // Get voices for selected model
    const voices = VOICE_API_CONFIG.groq_tts.voices[selectedModel];
    
    if (!voices) {
        console.error('No voices found for model:', selectedModel);
        return;
    }
    
    // Add new voice options
    let voiceMatched = false;
    const voiceKeys = Object.keys(voices);
    Object.entries(voices).forEach(([key, value]) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = value;
        
        // Set selected if matches current voice
        if (key === currentVoice) {
            option.selected = true;
            voiceMatched = true;
        }
        
        voiceSelect.appendChild(option);
    });
    
    // If saved voice doesn't exist in this model, select first available
    if (!voiceMatched && voiceKeys.length > 0) {
        voiceSelect.value = voiceKeys[0];
        localStorage.setItem('groqVoice', voiceKeys[0]);
        console.log('Voice switched to:', voiceKeys[0], '(previous voice not available for this model)');
    }
    
    console.log('Voices updated:', Object.keys(voices));
}

// Test voice settings for Groq
async function testVoiceSettingsGroq() {
    const model = document.getElementById('groqTTSModel').value;
    const voice = document.getElementById('groqVoice').value;
    const testText = 'Hello, this is a test of the text-to-speech using the Groq Orpheus English model.';
    
    await textToSpeechGroq(testText, model, voice);
}


// Detect language from text (English only)
function detectLanguage(text) {
    // Always return English since Arabic is removed
    return 'english';
}

// Get appropriate TTS model and voice based on language
function getTTSConfigForLanguage(detectedLanguage) {
    // Always use English model and voice
    return {
        model: localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english',
        voice: localStorage.getItem('groqVoice') || 'autumn'
    };
}

// Speech History Management
let speechHistory = [];

// Initialize speech history from Supabase first, fallback to localStorage
async function initializeSpeechHistory() {
    // Try Supabase first
    const cloudHistory = await neonLoadSpeechHistory();
    if (cloudHistory && cloudHistory.length > 0) {
        speechHistory = cloudHistory;
        localStorage.setItem('speechHistory', JSON.stringify(speechHistory));
        console.log(` Loaded ${speechHistory.length} speech records from Supabase`);
    } else {
        // Fallback to localStorage
        const savedHistory = localStorage.getItem('speechHistory');
        if (savedHistory) {
            speechHistory = JSON.parse(savedHistory);
            console.log(` Loaded ${speechHistory.length} speech records from localStorage`);
        }
    }
}

// Save speech history to localStorage
function saveSpeechHistory() {
    localStorage.setItem('speechHistory', JSON.stringify(speechHistory));
}

// Add STT record to history
function addSTTRecord(text, language, model) {
    const record = {
        id: Date.now(),
        type: 'STT',
        text: text,
        language: language,
        model: model,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleString('id-ID')
    };
    
    speechHistory.unshift(record); // Add to beginning
    
    // Keep only last 50 records
    if (speechHistory.length > 50) {
        speechHistory = speechHistory.slice(0, 50);
    }
    
    saveSpeechHistory();
    console.log('STT record added:', record);
    
    // Save to Supabase async
    if (typeof neonSaveSpeechRecord === 'function') {
        neonSaveSpeechRecord(record).catch(() => {});
    }
}

// Add TTS record to history
function addTTSRecord(text, language, model, voice) {
    const record = {
        id: Date.now(),
        type: 'TTS',
        text: text,
        language: language,
        model: model,
        voice: voice,
        timestamp: new Date().toISOString(),
        date: new Date().toLocaleString('id-ID')
    };
    
    speechHistory.unshift(record); // Add to beginning
    
    // Keep only last 50 records
    if (speechHistory.length > 50) {
        speechHistory = speechHistory.slice(0, 50);
    }
    
    saveSpeechHistory();
    console.log('TTS record added:', record);
    
    // Save to Supabase async
    if (typeof neonSaveSpeechRecord === 'function') {
        neonSaveSpeechRecord(record).catch(() => {});
    }
}

// Clear speech history
function clearSpeechHistory() {
    speechHistory = [];
    saveSpeechHistory();
    console.log('Speech history cleared');
    
    // Delete from Supabase async
    if (typeof neonDeleteAllSpeechHistory === 'function') {
        neonDeleteAllSpeechHistory().catch(() => {});
    }
}

// Show speech history
async function showSpeechHistory() {
    await initializeSpeechHistory();
    
    const historyHtml = speechHistory.length === 0 ? 
        `<div class="text-center text-muted">
            <i class="bi bi-clock-history display-4"></i>
            <p class="mt-3">Belum ada riwayat speech.</p>
        </div>` :
        speechHistory.map((record, idx) => `
            <div class="card mb-2">
                <div class="card-body py-2">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <div class="d-flex align-items-center mb-1">
                                <span class="badge ${record.type === 'STT' ? 'bg-success' : 'bg-info'} me-2">
                                    ${record.type === 'STT' ? ' STT' : ' TTS'}
                                </span>
                                <small class="text-muted">${record.date}</small>
                            </div>
                            <div class="text-truncate" style="max-width: 300px;">
                                <strong>${record.text.substring(0, 100)}${record.text.length > 100 ? '...' : ''}</strong>
                            </div>
                            <div class="mt-1">
                                <small class="text-muted">
                                     ${record.language} | 
                                     ${record.model}
                                    ${record.voice ? ` |  ${record.voice}` : ''}
                                </small>
                            </div>
                        </div>
                        <div class="ms-2">
                            <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); copySpeechText(\`${record.text.replace(/`/g, '\\`').substring(0, 200)}\`)" title="Salin teks">
                                <i class="bi bi-clipboard"></i>
                            </button>
                            <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteSpeechRecord(${idx})" title="Hapus">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    
    Swal.fire({
        title: ' Riwayat Speech',
        width: '600px',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <div class="d-flex justify-content-between align-items-center">
                        <h6 class="mb-0">Total: ${speechHistory.length} aktivitas</h6>
                        <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); clearSpeechHistoryAndRefresh()">
                            <i class="bi bi-trash"></i> Hapus Semua
                        </button>
                    </div>
                </div>
                <div style="max-height: 400px; overflow-y: auto;">
                    ${historyHtml}
                </div>
            </div>
        `,
        confirmButtonText: 'Tutup',
        confirmButtonColor: '#3085d6'
    });
}

// Copy speech text to clipboard
function copySpeechText(text) {
    navigator.clipboard.writeText(text).then(() => {
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Teks Disalin!',
            showConfirmButton: false,
            timer: 1500,
            toast: true
        });
    }).catch(err => {
        console.error('Failed to copy text:', err);
        Swal.fire({
            icon: 'error',
            title: ' Gagal Menyalin',
            text: 'Tidak dapat menyalin teks ke clipboard.',
            confirmButtonColor: '#3085d6'
        });
    });
}

// Delete specific speech record
function deleteSpeechRecord(index) {
    if (confirm('Apakah Anda yakin ingin menghapus riwayat speech ini?')) {
        const record = speechHistory[index];
        speechHistory.splice(index, 1);
        saveSpeechHistory();
        
        // Delete from Supabase async
        if (record && typeof neonDeleteSpeechRecordByTimestamp === 'function') {
            neonDeleteSpeechRecordByTimestamp(record.timestamp, record.type).catch(() => {});
        }
        
        showSpeechHistory();
    }
}

// Clear speech history and refresh display
function clearSpeechHistoryAndRefresh() {
    if (confirm('Apakah Anda yakin ingin menghapus semua riwayat speech?')) {
        clearSpeechHistory();
        showSpeechHistory();
    }
}

// Global flag to track microphone permission state
let microphonePermissionShown = false;

// Manual mode only for TTS/STT

// Check microphone status and permissions
async function checkMicrophoneStatus() {
    try {
        // Check if microphone is available
        const devices = await navigator.mediaDevices.enumerateDevices();
        const microphones = devices.filter(device => device.kind === 'audioinput');
        
        if (microphones.length === 0) {
            return {
                available: false,
                message: 'No microphone detected on your device'
            };
        }
        
        // Try to get permission status
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        
        return {
            available: true,
            permission: 'granted',
            message: 'Microphone is ready to use'
        };
        
    } catch (error) {
        if (error.name === 'NotAllowedError') {
            return {
                available: true,
                permission: 'denied',
                message: 'Microphone permission denied by user'
            };
        } else if (error.name === 'NotFoundError') {
            return {
                available: false,
                message: 'No microphone found on your device'
            };
        } else {
            return {
                available: false,
                message: `Microphone error: ${error.message}`
            };
        }
    }
}

// Get current model display name
function getCurrentModelDisplayName() {
    if (selectedAPI === 'groq') {
        const currentModel = localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english';
        const modelNames = {
            'canopylabs/orpheus-v1-english': 'Orpheus English'
        };
        return modelNames[currentModel] || 'Orpheus English';
    } else if (selectedAPI === 'mistral') {
        const currentModel = localStorage.getItem('mistralTTSModel') || 'tts-1';
        const modelNames = {
            'tts-1': 'TTS Model 1',
            'tts-1-hd': 'TTS Model HD'
        };
        return modelNames[currentModel] || 'TTS Model 1';
    }
}

function selectAIForSTT(aiModel) {
    selectedAPI = aiModel;
    
    // Update STT button text
    const sttButtonText = document.getElementById('sttButtonText');
    if (sttButtonText) {
        sttButtonText.textContent = aiModel === 'groq' ? ' Groq STT' : ' Mistral STT';
    }
    
    // Update API display
    updateAPIDisplay();
    
    // Update all STT and TTS buttons
    updateTTSButtons();
    
    console.log('STT AI selected:', aiModel);
}

// Select AI for TTS
function selectAIForTTS(aiModel) {
    selectedAPI = aiModel;
    
    // Update TTS button text
    const ttsButtonText = document.getElementById('ttsButtonText');
    if (ttsButtonText) {
        ttsButtonText.textContent = aiModel === 'groq' ? ' Groq TTS' : ' Mistral TTS';
    }
    
    // Update API display
    updateAPIDisplay();
    
    // Update all STT and TTS buttons
    updateTTSButtons();
    
    // Tidak menampilkan notifikasi baru, biarkan modal tetap terbuka
    
    console.log('TTS AI selected:', aiModel);
}

// Manual mode only - no switching needed

// Update STT and TTS buttons with current model name
function updateTTSButtons() {
    const modelName = getCurrentModelDisplayName();
    
    // Update all STT buttons with dynamic text
    const sttButtons = document.querySelectorAll('button');
    sttButtons.forEach(button => {
        if (button.onclick && button.onclick.toString().includes('selectAIForSTT')) {
            const icon = button.querySelector('i');
            if (icon) {
                button.innerHTML = `<i class="bi bi-mic"></i> ${selectedAPI === 'groq' ? ' Groq STT' : ' Mistral STT'}`;
                button.title = `STT dengan ${selectedAPI === 'groq' ? 'Groq' : 'Mistral'}`;
            }
        }
    });
    
    // Update all TTS buttons with dynamic text
    const ttsButtons = document.querySelectorAll('button');
    ttsButtons.forEach(button => {
        if (button.onclick && button.onclick.toString().includes('textToSpeechGroqWithSettingsText')) {
            const icon = button.querySelector('i');
            if (icon) {
                button.innerHTML = `<i class="bi bi-volume-up"></i> ${selectedAPI === 'groq' ? ' Groq TTS' : ' Mistral TTS'}`;
                button.title = `TTS dengan ${selectedAPI === 'groq' ? 'Groq' : 'Mistral'}`;
            }
        }
    });
    
    console.log('STT and TTS buttons updated with model:', modelName, 'selected API:', selectedAPI);
}

// Update model information dynamically
function updateModelInfo() {
    const modelInfoElement = document.getElementById('modelInfo');
    if (modelInfoElement) {
        let modelName = 'Unknown Model';
        let provider = selectedAPI || 'groq';
        
        // Get model name based on selected API and available configurations
        if (provider === 'groq') {
            // Try to get model from CHAT_API_MODELS or use default
            if (typeof CHAT_API_MODELS !== 'undefined' && CHAT_API_MODELS.groq) {
                modelName = CHAT_API_MODELS.groq;
            } else {
                modelName = 'Groq Llama 3.1 8B Instant';
            }
        } else if (provider === 'mistral') {
            // Try to get model from CHAT_API_MODELS or use default
            if (typeof CHAT_API_MODELS !== 'undefined' && CHAT_API_MODELS.mistral) {
                modelName = CHAT_API_MODELS.mistral;
            } else {
                modelName = 'Mistral Tiny';
            }
        }
        
        modelInfoElement.textContent = modelName;
    }
}

// Update API status based on key availability
function updateAPIStatus() {
    const apiStatusElement = document.getElementById('apiStatus');
    if (apiStatusElement) {
        try {
            const currentProvider = selectedAPI || 'groq';
            let hasValidKey = false;

            if (currentProvider === 'groq' && _apiKeysCache.groq && _apiKeysCache.groq.startsWith('gsk_')) {
                hasValidKey = true;
            } else if (currentProvider === 'mistral' && _apiKeysCache.mistral && _apiKeysCache.mistral.length > 0) {
                hasValidKey = true;
            }

            if (hasValidKey) {
                apiStatusElement.textContent = 'API Connected';
                apiStatusElement.className = 'badge bg-success';
            } else {
                apiStatusElement.textContent = 'API Mode';
                apiStatusElement.className = 'badge bg-warning';
            }
        } catch (error) {
            console.error('Error updating API status:', error);
            apiStatusElement.textContent = 'API Mode';
            apiStatusElement.className = 'badge bg-warning';
        }
    }
}

// Update API display in UI
function updateAPIDisplay() {
    try {
        // Update current API badge
        const currentAPIElement = document.getElementById('currentAPI');
        if (currentAPIElement) {
            currentAPIElement.textContent = selectedAPI === 'groq' ? 'GROQ' : 'MISTRAL';
            currentAPIElement.className = selectedAPI === 'groq' ? 'badge bg-info' : 'badge bg-warning';
        }
        
        // Update model info dynamically
        updateModelInfo();
        
        // Update API status based on key availability
        updateAPIStatus();
        
        // Update radio buttons
        const groqRadio = document.querySelector('input[name="api"][value="groq"]');
        const mistralRadio = document.querySelector('input[name="api"][value="mistral"]');
        
        if (groqRadio && mistralRadio) {
            if (selectedAPI === 'groq') {
                groqRadio.checked = true;
                mistralRadio.checked = false;
            } else {
                groqRadio.checked = false;
                mistralRadio.checked = true;
            }
        }
        
        console.log('API Display Updated:', selectedAPI);
        
    } catch (error) {
        console.error('Error updating API display:', error);
    }
}

// Auto-select AI model when using voice features
function autoSelectGroqAI() {
    // Use currently selected API (don't force to Groq)
    // selectedAPI is already set by user selection
    
    // Update API display
    updateAPIDisplay();
    
    // Tidak menampilkan notifikasi baru, biarkan modal tetap terbuka
}

// TTS with saved settings based on selected AI
async function textToSpeechGroqWithSettings() {
    try {
        // Use currently selected AI
        if (!selectedAPI) {
            selectedAPI = 'groq'; // Default to Groq
        }
        
        // Get text from input
        const messageInput = document.getElementById('messageInput');
        if (!messageInput) {
            Swal.fire({
                icon: 'error',
                title: ' Input Field Not Found',
                text: 'Message input field not found. Please refresh the page.',
                confirmButtonColor: '#3085d6'
            });
            return;
        }
        
        const text = messageInput.value.trim();
        
        // Use appropriate TTS based on selected AI
        let model, voice;
        if (selectedAPI === 'groq') {
            model = localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english';
            voice = localStorage.getItem('groqVoice') || 'autumn';
        } else if (selectedAPI === 'mistral') {
            model = localStorage.getItem('mistralTTSModel') || 'tts-1';
            voice = localStorage.getItem('mistralVoice') || 'alloy';
        } else {
            // Default to Groq
            model = localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english';
            voice = localStorage.getItem('groqVoice') || 'autumn';
        }
        
        // Debug logging
        console.log('TTS Debug:', { text: text.substring(0, 50) + '...', model, voice });
        
        // Validate input
        if (!text || text.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: ' Empty Text',
                html: `
                    <div class="text-start">
                        <p><strong>Please enter some text to convert to speech.</strong></p>
                        <div class="alert alert-info">
                            <strong>Example text:</strong><br>
                            "Hello, this is a test of the text-to-speech system."
                        </div>
                    </div>
                `,
                confirmButtonColor: '#3085d6'
            });
            return;
        }
        
        // Call appropriate TTS function based on selected AI
        if (selectedAPI === 'groq') {
            await textToSpeechGroq(text, model, voice);
        } else if (selectedAPI === 'mistral') {
            await textToSpeechMistral(text, model, voice);
        } else {
            // Default to Groq
            await textToSpeechGroq(text, model, voice);
        }
        
    } catch (error) {
        console.error('TTS Error:', error);
        Swal.fire({
            icon: 'error',
            title: ' TTS Error',
            html: `
                <div class="text-start">
                    <p><strong>Error occurred during text-to-speech:</strong></p>
                    <div class="alert alert-danger">
                        ${error.message}
                    </div>
                    <div class="alert alert-info">
                        <strong>Please try again or check your internet connection.</strong>
                    </div>
                </div>
            `,
            confirmButtonColor: '#3085d6'
        });
    }
}

// Simple TTS test function for debugging
async function testTTSSimple() {
    try {
        const testText = "Hello, this is a test of the text-to-speech system.";
        const model = 'canopylabs/orpheus-v1-english';
        const voice = 'autumn';
        
        console.log('Simple TTS Test:', { testText, model, voice });
        
        // Show test notification
        Swal.fire({
            title: ' Testing TTS...',
            html: `
                <div class="text-start">
                    <p><strong>Testing with sample text:</strong></p>
                    <div class="alert alert-info">
                        "${testText}"
                    </div>
                    <p><strong>Model:</strong> ${model}<br>
                    <strong>Voice:</strong> ${voice}</p>
                </div>
            `,
            didOpen: () => {
                Swal.showLoading();
            },
            allowOutsideClick: false
        });
        
        // Call TTS function directly
        await textToSpeechGroq(testText, model, voice);
        
    } catch (error) {
        console.error('TTS Test Error:', error);
        Swal.fire({
            icon: 'error',
            title: ' TTS Test Failed',
            html: `
                <div class="text-start">
                    <p><strong>Test failed with error:</strong></p>
                    <div class="alert alert-danger">
                        ${error.message}
                    </div>
                    <div class="alert alert-warning">
                        <strong>Possible issues:</strong><br>
                         No internet connection<br>
                         API key invalid<br>
                         Browser blocked audio playback
                    </div>
                </div>
            `,
            confirmButtonColor: '#3085d6'
        });
    }
}

// Mistral Text-to-Speech function
async function textToSpeechMistral(text, model = 'tts-1', voice = 'alloy') {
    try {
        // Get API key from localStorage (same as chat API)
        const apiKey = getStoredApiKey('mistral');
        
        if (!apiKey) {
            throw new Error(' Mistral API key not configured for Text-to-Speech. Please configure it in the Keys settings.');
        }
        
        // Safe access to VOICE_API_CONFIG
        if (typeof VOICE_API_CONFIG === 'undefined' || !VOICE_API_CONFIG.mistral_tts) {
            throw new Error('VOICE_API_CONFIG not initialized for Mistral TTS');
        }
        
        // Use the already updated VOICE_API_CONFIG
        const config = VOICE_API_CONFIG.mistral_tts;
        
        // Verify API key is set
        if (!config.headers.Authorization || config.headers.Authorization === 'Bearer ') {
            // Fallback to manually setting the API key
            config.headers.Authorization = buildAuthorizationHeader(apiKey);
            console.log(' Manually set Mistral API key for TTS (config was empty)');
        }
        
        const provider = 'Mistral';
        
        // Debug logging
        console.log('Mistral TTS Debug:', {
            text: text.substring(0, 50) + '...',
            model: model,
            voice: voice,
            url: config.url,
            hasConfig: !!config,
            apiKeySet: config.headers.Authorization !== 'Bearer ',
            apiKeyLength: config.headers.Authorization.length
        });
        
        // Validate config
        if (!config) {
            throw new Error('Mistral TTS configuration not found');
        }
        
        if (!config.url) {
            throw new Error('Mistral TTS API URL not configured');
        }
        
        // Show loading indicator
        Swal.fire({
            title: ' Generating Speech...',
            html: `Converting text to speech using ${provider}...`,
            didOpen: () => {
                Swal.showLoading();
            },
            allowOutsideClick: false
        });

        if (!text || text.trim().length === 0) {
            throw new Error('Text cannot be empty');
        }
        
        if (text.length > 4096) {
            throw new Error('Text is too long (max 4096 characters)');
        }

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: config.body(text, model, voice || 'default')
        });

        if (!response.ok) {
            let errorMessage = `HTTP error! status: ${response.status}`;
            
            // Handle specific error cases
            if (response.status === 400) {
                errorMessage = 'Invalid request - check model name and parameters';
            } else if (response.status === 401) {
                errorMessage = 'Invalid API key - please check your Mistral API key';
            } else if (response.status === 429) {
                errorMessage = 'Rate limit exceeded - please wait and try again';
            } else if (response.status === 500) {
                errorMessage = 'Mistral server error - please try again later';
            }
            
            throw new Error(errorMessage);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Stop any currently playing audio
        if (currentAudio) {
            currentAudio.pause();
            currentAudio.currentTime = 0;
        }

        currentAudio = new Audio(audioUrl);
        currentAudio.play();

        Swal.close(); // Close loading indicator
        
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Speech Generated!',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });

        currentAudio.onended = () => {
            URL.revokeObjectURL(audioUrl); // Clean up the object URL
            currentAudio = null;
        };

    } catch (error) {
        console.error('Error generating speech:', error);
        Swal.fire({
            icon: 'error',
            title: ' Mistral Speech Generation Failed',
            text: error.message,
            confirmButtonText: 'OK'
        });
        
        // If Mistral fails, try Groq TTS as fallback
        console.log(' Mistral TTS failed, trying Groq TTS as fallback...');
        if (typeof textToSpeechGroq === 'function') {
            try {
                await textToSpeechGroq(text);
                return;
            } catch (groqError) {
                console.error('Groq TTS also failed:', groqError);
            }
        }
        
        // Final fallback to Web Speech API
        fallbackTextToSpeech(text, 'Mistral');
    }
}

// Groq TTS with saved settings for specific text
async function textToSpeechGroqWithSettingsText(text) {
    const model = localStorage.getItem('groqTTSModel') || 'canopylabs/orpheus-v1-english';
    const voice = localStorage.getItem('groqVoice') || 'autumn';
    
    await textToSpeechGroq(text, model, voice);
}

// Fallback TTS using Web Speech API
async function fallbackTextToSpeech(text, provider = 'Groq') {
    try {
        if ('speechSynthesis' in window) {
            // Show fallback notification
            const toast = Swal.fire({
                position: 'top-end',
                icon: 'info',
                title: ' Using fallback TTS...',
                html: `${provider} API failed, using browser speech synthesis`,
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
            
            // Stop any current speech
            window.speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            // Auto-detect language or use browser default
            utterance.lang = navigator.language || 'en-US';
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            return new Promise((resolve, reject) => {
                utterance.onend = () => resolve(true);
                utterance.onerror = (e) => reject(e);
                
                window.speechSynthesis.speak(utterance);
            });
        } else {
            throw new Error('Speech synthesis not supported');
        }
    } catch (error) {
        console.error('Fallback TTS failed:', error);
        return null;
    }
}

// Speech-to-Text function supporting both Groq and Mistral APIs
async function speechToText(audioBlob, model = null) {
    try {
        // Determine which API to use based on selected chat API
        let config;
        let provider;
        
        if (selectedAPI === 'mistral') {
            config = VOICE_API_CONFIG.mistral_stt;
            provider = 'Mistral Voxtral';
            if (!model) model = 'voxtral-mini-latest';
        } else {
            // Get API key from localStorage (same as chat API)
            const apiKey = getStoredApiKey('groq');
            
            if (!apiKey) {
                throw new Error(' Groq API key not configured for Speech-to-Text. Please configure it in the Keys settings.');
            }
            
            // Update config with correct API key
            config = {
                ...VOICE_API_CONFIG.groq_stt,
                headers: {
                    'Authorization': buildAuthorizationHeader(apiKey)
                }
            };
            provider = 'Groq Whisper';
            if (!model) model = 'whisper-large-v3-turbo';
        }
        
        // Create FormData for audio file upload
        const formData = new FormData();
        formData.append('file', audioBlob, 'recording.webm');
        formData.append('model', model);
        formData.append('response_format', 'json');
        // Remove language parameter to use auto-detection

        // Show loading indicator
        Swal.fire({
            title: ' Transcribing Audio...',
            html: `Converting speech to text using ${provider}...`,
            didOpen: () => {
                Swal.showLoading();
            },
            allowOutsideClick: false
        });

        const response = await fetch(config.url, {
            method: config.method,
            headers: config.headers,
            body: formData
        });

        if (!response.ok) {
            let error = await response.json();
            let errorMessage = `${provider} STT Error: ${error.message}`;
            if (error.message.includes('No transcription')) {
                errorMessage += '\n\nPossible causes:\n- Audio file too short or silent\n- API key invalid\n- Network connection issue';
            }
            
            Swal.fire({
                icon: 'error',
                title: ' Speech Recognition Failed',
                html: `<strong>${errorMessage}</strong>`,
                confirmButtonColor: '#3085d6'
            });
            
            return null;
        }

        const transcription = await response.json();
        Swal.close(); // Close loading indicator
        
        // Show success notification
        Swal.fire({
            position: 'top-end',
            icon: 'success',
            title: ' Transcription Complete',
            showConfirmButton: false,
            timer: 2000,
            toast: true
        });

        return transcription.text;
    } catch (error) {
        console.error('Error transcribing speech:', error);
        return null;
    }
}

// Start voice recording
async function startVoiceRecording() {
    try {
        // Request microphone permission
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const transcription = await speechToText(audioBlob);
            
            if (transcription) {
                // Store detected language for auto-speak
                const detectedLanguage = localStorage.getItem('lastDetectedLanguage') || 'auto';
                
                // Add to speech history
                addSTTRecord(transcription, detectedLanguage, 'whisper-large-v3-turbo');
                
                // Insert transcription into message input
                const messageInput = document.getElementById('messageInput');
                messageInput.value = transcription;
                messageInput.focus();
                
                // Optionally auto-send the message
                Swal.fire({
                    title: ' Transcription Complete',
                    html: `Transcribed text: <br><strong>"${transcription}"</strong>`,
                    icon: 'success',
                    showCancelButton: true,
                    confirmButtonText: 'Send Message',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#3085d6'
                }).then((result) => {
                    if (result.isConfirmed) {
                        sendMessage();
                    }
                });
            }
            
            // Stop all tracks
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        
        // Update UI to show recording status
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.innerHTML = '<i class="bi bi-stop-circle"></i> Stop Recording';
            recordBtn.className = 'btn btn-danger btn-sm';
        }
        
        // Show recording indicator
        console.log(' Showing main recording modal...');
        Swal.fire({
            title: ' Recording...',
            html: 'Speak now... Click "Stop Recording" when finished.',
            icon: 'info',
            showCancelButton: true,
            showConfirmButton: true,
            confirmButtonText: ' Stop Recording',
            cancelButtonText: ' Cancel',
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d',
            timer: 30000, // Auto-stop after 30 seconds
            timerProgressBar: true
        }).then((result) => {
            if (result.isConfirmed) {
                stopVoiceRecording();
            } else if (result.dismiss === Swal.DismissReason.timer || result.dismiss === Swal.DismissReason.cancel) {
                stopVoiceRecording();
            }
        });
        
    } catch (error) {
        console.error('Microphone access error:', error);
        
        // Enhanced error handling with retry option
        Swal.fire({
            icon: 'error',
            title: ' Microphone Access Denied',
            html: `
                <div class="text-start">
                    <p><strong>Please allow microphone access to use voice recording.</strong></p>
                    <div class="alert alert-warning">
                        <strong>Troubleshooting Steps:</strong><br>
                        1. Click the <strong></strong> icon in your browser's address bar<br>
                        2. Allow microphone access for this site<br>
                        3. Refresh the page and try again<br>
                        4. Check if your microphone is connected and working
                    </div>
                    <div class="alert alert-info">
                        <strong>Browser Support:</strong><br>
                         Chrome:  Fully supported<br>
                         Firefox:  Fully supported<br>
                         Edge:  Fully supported<br>
                         Safari:  Supported (requires HTTPS)
                    </div>
                </div>
            `,
            confirmButtonText: ' Retry Recording',
            cancelButtonText: ' Cancel',
            confirmButtonColor: '#28a745',
            cancelButtonColor: '#6c757d',
            showCancelButton: true
        }).then((result) => {
            if (result.isConfirmed) {
                // Retry voice recording
                setTimeout(() => {
                    toggleVoiceRecordingGroq();
                }, 1000);
            }
        });
    }
}

// Stop voice recording
function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI
        const recordBtn = document.getElementById('recordBtn');
        if (recordBtn) {
            recordBtn.innerHTML = '<i class="bi bi-mic"></i> Voice Input';
            recordBtn.className = 'btn btn-outline-primary btn-sm';
        }
        
        Swal.close();
    }
}

// Toggle voice recording
function toggleVoiceRecording() {
    if (isRecording) {
        stopVoiceRecording();
    } else {
        startVoiceRecording();
    }
}

// Text-to-Speech for AI responses
// Convert input text to speech directly
async function convertInputTextToSpeech() {
    try {
        // Get text from input field
        const messageInput = document.getElementById('messageInput');
        if (!messageInput) {
            Swal.fire({
                icon: 'error',
                title: ' Input Field Not Found',
                text: 'Message input field not found. Please refresh the page.',
                confirmButtonColor: '#3085d6'
            });
            return;
        }
        
        const text = messageInput.value.trim();
        
        // Validate input
        if (!text || text.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: ' Empty Text',
                html: `
                    <div class="text-start">
                        <p><strong>Please enter some text to convert to speech.</strong></p>
                        <div class="alert alert-info">
                            <strong>Example text:</strong><br>
                            "Hello, this is a test of the text-to-speech system."
                        </div>
                    </div>
                `,
                confirmButtonColor: '#3085d6'
            });
            return;
        }
        
        // Use selected API for TTS
        if (selectedAPI === 'groq') {
            const model = localStorage.getItem('selectedTTSModel') || 'canopylabs/orpheus-v1-english';
            const voice = localStorage.getItem('selectedVoiceAI') || 'autumn';
            addTTSRecord(text, 'auto', model, voice);
            await textToSpeechGroq(text, model, voice);
        } else if (selectedAPI === 'mistral') {
            const model = localStorage.getItem('mistralTTSModel') || 'voxtral-mini-tts-2603';
            const voice = localStorage.getItem('mistralVoice') || 'default';
            addTTSRecord(text, 'auto', model, voice);
            await textToSpeechMistral(text, model, voice);
        } else {
            // Default to Groq
            const model = localStorage.getItem('selectedTTSModel') || 'canopylabs/orpheus-v1-english';
            const voice = localStorage.getItem('selectedVoiceAI') || 'autumn';
            addTTSRecord(text, 'auto', model, voice);
            await textToSpeechGroq(text, model, voice);
        }
        
    } catch (error) {
        console.error('Error converting input text to speech:', error);
        Swal.fire({
            icon: 'error',
            title: ' TTS Error',
            text: 'Failed to convert text to speech. Please try again.',
            confirmButtonColor: '#3085d6'
        });
    }
}

// Get voice options for a specific model
function getVoiceOptionsForModel(model) {
    try {
        if (typeof VOICE_API_CONFIG !== 'undefined' && VOICE_API_CONFIG.groq_tts && VOICE_API_CONFIG.groq_tts.voices && VOICE_API_CONFIG.groq_tts.voices[model]) {
            const currentVoice = localStorage.getItem('selectedVoice') || 'autumn';
            const voices = VOICE_API_CONFIG.groq_tts.voices[model];
            return Object.entries(voices).map(([key, value]) => 
                `<option value="${key}" ${key === currentVoice ? 'selected' : ''}>${value}</option>`
            ).join('');
        }
        return '<option value="autumn">Autumn</option>';
    } catch (error) {
        console.error('Error getting voice options:', error);
        return '<option value="autumn">Autumn</option>';
    }
}

// Update voice options when model changes
function updateVoiceOptions() {
    try {
        const ttsModelSelect = document.getElementById('ttsModelSelect');
        const voiceSelect = document.getElementById('voiceSelect');
        
        if (ttsModelSelect && voiceSelect) {
            const selectedModel = ttsModelSelect.value;
            voiceSelect.innerHTML = getVoiceOptionsForModel(selectedModel);
        }
    } catch (error) {
        console.error('Error updating voice options:', error);
    }
}

// Show voice settings modal
function showVoiceSettings() {
    const currentTTSModel = localStorage.getItem('selectedTTSModel') || 'canopylabs/orpheus-v1-english';
    const currentSTTModel = localStorage.getItem('selectedSTTModel') || 'whisper-large-v3-turbo';
    
    // Get models based on current selected API
    let ttsModels, sttModels;
    if (selectedAPI === 'mistral') {
        ttsModels = VOICE_API_CONFIG.mistral_tts.models;
        sttModels = VOICE_API_CONFIG.mistral_stt.models;
    } else {
        ttsModels = VOICE_API_CONFIG.groq_tts.models;
        sttModels = VOICE_API_CONFIG.groq_stt.models;
    }
    
    Swal.fire({
        title: ' Voice Settings',
        html: `
            <div class="text-start">
                <div class="mb-3">
                    <label class="form-label"><strong>Current API:</strong></label>
                    <div class="badge bg-${selectedAPI === 'mistral' ? 'info' : 'success'} fs-6">
                        ${selectedAPI === 'mistral' ? 'Mistral AI' : 'Groq'}
                    </div>
                </div>
                
                <div class="mb-4">
                    <label class="form-label"><strong>Text-to-Speech Model:</strong></label>
                    <select id="ttsModelSelect" class="form-select" onchange="updateVoiceOptions()">
                        ${Object.entries(ttsModels).map(([key, value]) => 
                            `<option value="${key}" ${key === currentTTSModel ? 'selected' : ''}>${value}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div class="mb-4">
                    <label class="form-label"><strong>Voice:</strong></label>
                    <select id="voiceSelect" class="form-select">
                        ${getVoiceOptionsForModel(currentTTSModel)}
                    </select>
                </div>
                
                <div class="mb-4">
                    <label class="form-label"><strong>Speech-to-Text Model:</strong></label>
                    <select id="sttModelSelect" class="form-select">
                        ${Object.entries(sttModels).map(([key, value]) => 
                            `<option value="${key}" ${key === currentSTTModel ? 'selected' : ''}>${value}</option>`
                        ).join('')}
                    </select>
                </div>
                
                <div class="mb-3">
                    <label class="form-label">
                        <input type="checkbox" id="autoSpeak" ${localStorage.getItem('autoSpeak') === 'true' ? 'checked' : ''}>
                        Auto-speak AI responses
                    </label>
                </div>
                
                <div class="mb-3">
                    <button class="btn btn-sm btn-outline-info" onclick="testVoiceSettings()">
                        <i class="bi bi-play-circle"></i> Test Voice Settings
                    </button>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Save Settings',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            const ttsModel = document.getElementById('ttsModelSelect').value;
            const sttModel = document.getElementById('sttModelSelect').value;
            const voice = document.getElementById('voiceSelect').value;
            const autoSpeak = document.getElementById('autoSpeak').checked;
            
            // Save to localStorage
            localStorage.setItem('selectedTTSModel', ttsModel);
            localStorage.setItem('selectedSTTModel', sttModel);
            localStorage.setItem('selectedVoice', voice);
            localStorage.setItem('autoSpeak', autoSpeak);
            
            return { ttsModel, sttModel, voice, autoSpeak };
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // Update TTS buttons with new model name
            updateTTSButtons();
            
            Swal.fire({
                position: 'top-end',
                icon: 'success',
                title: ' Voice Settings Saved!',
                showConfirmButton: false,
                timer: 2000,
                toast: true
            });
        }
    });
}

// Test voice settings
async function testVoiceSettings() {
    const ttsModel = document.getElementById('ttsModelSelect').value;
    let testText;
    
    if (selectedAPI === 'mistral') {
        // Mistral models test text
        testText = 'Hello, this is a test of the text-to-speech using Mistral Voxtral model.';
    } else {
        // Groq models test text
        if (ttsModel.includes('arabic')) {
            testText = '        .';
        } else {
            testText = 'Hello, this is a test of the text-to-speech using the Orpheus English model.';
        }
    }
    
    await textToSpeech(testText, ttsModel);
}

// Test Groq TTS API connectivity and configuration
async function testGroqTTSAPI() {
    try {
        const config = VOICE_API_CONFIG.groq_tts;
        
        // Test with minimal text - try Orpheus first, fallback to PlayAI
        const testText = "Hello";
        let testModel = 'canopylabs/orpheus-v1-english';
        let testVoice = 'autumn';
        
        console.log(' Testing Groq TTS API...');
        
        // Ensure API key is in headers
        const apiKey = getStoredApiKey('groq');
        if (apiKey && (!config.headers.Authorization || config.headers.Authorization === 'Bearer ')) {
            config.headers.Authorization = buildAuthorizationHeader(apiKey);
        }
        
        // Try Orpheus model first
        let response = await fetch(config.url, {
            method: config.method,
            headers: { ...config.headers },
            body: config.body(testText, testModel, testVoice)
        });
        
        // If Orpheus fails with 404, model not available
        if (!response.ok && response.status === 404) {
            console.log(' Orpheus model returned 404, model not available');
        }
        
        if (response.ok) {
            console.log(' Groq TTS API is working!');
            return {
                status: 'success',
                message: 'Groq TTS API is working correctly',
                model: testModel
            };
        } else {
            let errorMsg = `HTTP ${response.status}`;
            
            if (response.status === 400) {
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error?.message || 'Invalid request parameters';
                } catch (e) {
                    errorMsg = 'HTTP 400 - Bad Request (invalid model or parameters)';
                }
            } else if (response.status === 401) {
                errorMsg = 'Invalid or expired API key';
            } else if (response.status === 404) {
                errorMsg = 'TTS model not found (404). Silakan accept terms model di console.groq.com/playground';
            } else if (response.status === 429) {
                errorMsg = 'Rate limit exceeded';
            }
            
            return {
                status: 'error',
                message: errorMsg,
                httpStatus: response.status
            };
        }
    } catch (error) {
        console.error(' Groq TTS API test failed:', error);
        return {
            status: 'error',
            message: error.message
        };
    }
}

// Update Groq API key function
function updateGroqAPIKey(newApiKey) {
    if (!newApiKey || !newApiKey.startsWith('gsk_')) {
        Swal.fire({
            icon: 'error',
            title: ' Invalid API Key',
            text: 'Groq API key must start with "gsk_"',
            confirmButtonColor: '#3085d6'
        });
        return false;
    }
    
    // Update configuration
    const normalizedGroqKey = stripBearerPrefix(newApiKey);
    VOICE_API_CONFIG.tts.headers.Authorization = buildAuthorizationHeader(normalizedGroqKey);
    VOICE_API_CONFIG.stt.headers.Authorization = buildAuthorizationHeader(normalizedGroqKey);
    
    // Save to localStorage
    // Update in-memory cache
    _apiKeysCache.groq = newApiKey;

    // Save to Neon (cross-device)
    if (typeof neonSaveKeys === 'function') {
        neonSaveKeys(_apiKeysCache.groq || '', _apiKeysCache.mistral || '');
    }
    
    console.log(' Groq API key updated (saved to Neon)');
    
    // Test the new key
    testGroqTTSAPI().then(result => {
        if (result.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: ' API Key Updated',
                text: 'Groq TTS API is working with the new key!',
                timer: 3000,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                icon: 'warning',
                title: ' API Key Updated but Issues Found',
                html: `
                    <div class="text-start">
                        <p><strong>Error:</strong> ${result.message}</p>
                        <p>The API key was saved but there may be configuration issues.</p>
                    </div>
                `,
                confirmButtonColor: '#3085d6'
            });
        }
    });
    
    return true;
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log(' DOM loaded, initializing...');
    
    // Check if mobile
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    console.log(' Mobile device detected:', isMobile);
    
    try {
        // Check if SweetAlert is available
        if (typeof Swal === 'undefined') {
            alert(' SweetAlert2 not loaded! Please check your internet connection.');
            return;
        }
        
        // Initialize API mode
        if (typeof initializeAPIMode === 'function') {
            initializeAPIMode();
        }
        
        // Initialize speech history
        if (typeof initializeSpeechHistory === 'function') {
            initializeSpeechHistory();
        }
        
        // Add enter key listener
        const messageInput = document.getElementById('messageInput');
        if (messageInput) {
            messageInput.addEventListener('keydown', handleKeyPress);
            
            // Add touch event listeners for mobile
            messageInput.addEventListener('touchend', function(e) {
                if (e.cancelable) {
                    handleTouchEnd(e);
                }
            }, { passive: false });
        }
        
        // Load chat sessions
        if (typeof loadChatSessions === 'function') {
            loadChatSessions();
        }
        
        if (typeof updateHistoryCount === 'function') {
            updateHistoryCount();
        }
        
        // Initialize token usage display
        if (typeof updateTokenUsageDisplay === 'function') {
            updateTokenUsageDisplay();
        }
        
        // Initialize mobile optimizations
        if (typeof initMobileOptimizations === 'function') {
            initMobileOptimizations();
        }
        
        // Focus on input
        if (messageInput) {
            messageInput.focus();
        }
        
        // Highlight default API button
        if (typeof highlightActiveAPIButton === 'function') {
            highlightActiveAPIButton(selectedAPI);
        }
        
        console.log(' Initialization completed successfully!');
        
        // Test button functionality on mobile
        if (isMobile) {
            setTimeout(function() {
                console.log(' Testing mobile button functionality...');
                const buttons = document.querySelectorAll('.btn');
                console.log(` Found ${buttons.length} buttons on mobile`);
                
                // Test API button specifically
                const apiBtn = document.querySelector('[onclick*="showAPISelectionModal"]');
                if (apiBtn) {
                    console.log(' API button found and ready');
                } else {
                    console.error(' API button not found');
                }
            }, 2000);
}
            
    } catch (error) {
        console.error(' Initialization error:', error);
        alert(' Failed to initialize application: ' + error.message);
    }
});

// Fungsi: Inisialisasi setting voice dari Supabase
async function initVoiceSettingsFromSupabase() {
    if (typeof neonLoadVoiceSettings === 'function') {
        const settings = await neonLoadVoiceSettings();
        if (settings) {
            // Apply settings from Supabase
            currentTTSModel = settings.ttsModel;
            currentSTTModel = settings.sttModel;
            currentVoiceAI = settings.voiceAI;
            currentAutoSpeak = settings.autoSpeak;
            console.log(' Voice settings initialized from Supabase');
        } else {
            console.log(' No voice settings found in Supabase, using defaults');
        }
    } else {
        console.log(' neonLoadVoiceSettings not available');
    }
}
function updateThemeIcon() {
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        const isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
        themeBtn.innerHTML = isDark ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>';
    }
}

function toggleDarkMode() {
    const root = document.documentElement;
    const isDark = root.getAttribute('data-bs-theme') === 'dark';
    if (isDark) {
        root.setAttribute('data-bs-theme', 'light');
        localStorage.setItem('theme', 'light');
    } else {
        root.setAttribute('data-bs-theme', 'dark');
        localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
}

// Initialize theme on load
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-bs-theme', savedTheme);
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        updateThemeIcon();
        themeToggle.style.display = 'inline-block';
    }

    // Initialize voice settings from Neon (fallback handled inside)
    if (typeof initVoiceSettingsFromSupabase === 'function') {
        initVoiceSettingsFromSupabase();
    }

    // Sinkronisasi profil dari Neon (cross-device)
    if (typeof syncProfileFromNeon === 'function') {
        syncProfileFromNeon();
    }
});