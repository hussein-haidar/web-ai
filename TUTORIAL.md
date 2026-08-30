 # 🤖 AI Assistant Web - Tutorial Setup Lengkap

## 📋 Daftar Isi
- [Opsi 1: Groq (Primary API)](#opsi-1-groq-primary-api)
- [Opsi 2: Mistral (Alternative API)](#opsi-2-mistral-alternative-api)
- [Cara Dapatkan API Key](#cara-dapatkan-api-key)
- [Cara Update API Key](#cara-update-api-key)
- [Troubleshooting](#troubleshooting)

---

## 🚀 Opsi 1: Groq (Primary API)

### Keuntungan:
- ✅ **Cepat** - Response time sangat cepat
- ✅ **Gratis** - 14,000 requests/hari
- ✅ Support CORS
- ✅ Llama 3.1 models
- ✅ Support TTS & STT (Text-to-Speech & Speech-to-Text)

### Model yang Tersedia:
- **Chat:** Llama 3.1 8B Instant
- **TTS:** Orpheus models (English)
- **STT:** Whisper Large v3, Whisper Large v3 Turbo

### Cara Setup:
1. Buka web AI Assistant
2. Klik tombol "🤖 API" untuk memilih API
3. Pilih "Groq"
4. **Selesai! Langsung bisa digunakan** (API key default sudah tersedia)

### Best For:
- Daily use
- Fast response
- Voice features (TTS/STT)
- Production

---

## 🔄 Opsi 2: Mistral (Alternative API)

### Keuntungan:
- ✅ **Alternative** - Sebagai backup jika Groq down
- ✅ **Mudah** - Easy API key access
- ✅ Support CORS
- ✅ Mistral Tiny model
- ✅ Support TTS & STT

### Model yang Tersedia:
- **Chat:** Mistral Tiny
- **TTS:** Mistral Tiny, TTS Model 1, TTS Model HD
- **STT:** Voxtral Mini Transcribe V2, Voxtral Mini 2507

### Cara Setup:
1. Buka web AI Assistant
2. Klik tombol "🤖 API" untuk memilih API
3. Pilih "Mistral"
4. **Selesai! Langsung bisa digunakan** (API key default sudah tersedia)

### Best For:
- Backup API
- Alternative models
- Voice features (TTS/STT)
- Testing different providers

---

## 🔑 Cara Dapatkan API Key

### 🟢 Groq (Primary - Recommended)

#### Cara Dapatkan API Key:
1. **Sign Up**
   - Kunjungi: https://groq.com/
   - Click "Get Started" → "Sign Up"
   - Use Google/GitHub atau email

2. **Get API Key**
   - Dashboard → "API Keys"
   - Click "Create API Key"
   - Copy key
   **Format:** `gsk_xxxxxxxxxxxxx`

#### Free Tier:
- ✅ **14,000 requests/hari**
- ✅ Llama 3.1 models
- ✅ Support CORS
- ✅ No credit card required
- ✅ Support TTS & STT

---

### 🟢 Mistral (Alternative)

#### Cara Dapatkan API Key:
1. **Sign Up**
   - Kunjungi: https://console.mistral.ai/
   - Click "Sign Up"
   - Use Google/GitHub atau email

2. **Get API Key**
   - Dashboard → "API Keys"
   - Click "Create API Key"
   - Copy key
   **Format:** `xxxxxxxxxxxxx`

#### Free Tier:
- ✅ **Free credits** untuk testing
- ✅ Mistral models
- ✅ Support CORS
- ✅ Support TTS & STT

---

## 📋 API Comparison

| Provider | Free Tier | CORS Support | TTS/STT | Setup Time | Recommended |
|----------|-----------|--------------|---------|-------------|-------------|
| Groq | 14K/hari | ✅ | ✅ | 5 menit | 🏆 Primary |
| Mistral | Free credits | ✅ | ✅ | 5 menit | 🥈 Backup |

---

## 🎯 Quick Setup Guide

### **Option 1: Groq (Primary)**
```cmd
1. Buka: https://groq.com/
2. Sign up dengan email
3. Dashboard → API Keys  
4. Create key: gsk_xxxxxxxxxxxxx
5. Test di AI Assistant
```

### **Option 2: Mistral (Backup)**
```cmd
1. Buka: https://console.mistral.ai/
2. Sign up free
3. Dashboard → API Keys
4. Create key: xxxxxxxxxxxxx
5. Test di AI Assistant
```

---

## 🔧 Cara Update API Key

### **Melalui UI:**
1. Buka AI Assistant
2. Klik tombol "Keys" di bagian Control Buttons
3. Masukkan API key untuk Groq dan/atau Mistral
4. Klik "Save"

### **Melalui localStorage (Advanced):**
```javascript
// Buka browser console (F12)
// Set API key untuk Groq
localStorage.setItem('aiApiKeys', JSON.stringify({
    groq: 'YOUR_GROQ_API_KEY_HERE',
    mistral: 'YOUR_MISTRAL_API_KEY_HERE'
}));
// Refresh halaman
```

---

## 💡 Tips API Key

### **Security:**
- 🔒 Jangan share API key
- 🔒 Use environment variables di production
- 🔒 Rotate key setiap 3 bulan

### **Usage Monitoring:**
- 📊 Dashboard untuk tracking usage
- 📊 Rate limit notifications
- 📊 Cost monitoring (jika berbayar)

### **Best Practices:**
- ✅ Gunakan Groq sebagai primary
- ✅ Gunakan Mistral sebagai backup
- ✅ Monitor usage di dashboard
- ✅ Switch provider jika rate limit

---

## 🎯 Rekomendasi Penggunaan

#### 🏃‍♂️ Untuk Daily Use:
- **Groq** - Cepat, gratis, reliable

#### 🛡️ Untuk Backup:
- **Mistral** - Sebagai alternative jika Groq down

#### 🎤 Untuk Voice Features:
- **Groq** - Whisper untuk STT, Orpheus untuk TTS
- **Mistral** - Voxtral untuk STT, Mistral Tiny untuk TTS

---

##  Troubleshooting

### 🚨 Status: API Failed

#### Groq Error:
- **API Key Error:** Check API key di localStorage
- **Rate Limit:** Tunggu beberapa menit atau switch ke Mistral
- **Connection Failed:** Check internet connection
- **Solution:** Refresh browser atau switch ke Mistral

#### Mistral Error:
- **API Key Error:** Check API key di localStorage
- **Rate Limit:** Switch ke Groq
- **Connection Failed:** Check internet connection
- **Solution:** Refresh browser atau switch ke Groq

#### General Solutions:
1. **Refresh browser** - Clear cache dan reload
2. **Check console** - F12 untuk debugging
3. **Switch API** - Coba provider lain (Groq ↔ Mistral)
4. **Check API key** - Pastikan key valid

---

### 📊 Error Messages & Solutions

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "API Failed" | Connection issue | Refresh browser |
| "Invalid API Key" | Key expired/wrong | Update API key |
| "Rate Limit" | Too many requests | Switch provider |
| "Network Error" | No internet | Check connection |

---

### 🎯 Quick Fix Guide

#### Step 1: Check Status
- Lihat badge status di informasi card
- **Green:** API Connected ✅
- **Yellow:** API Mode ⚠️
- **Red:** API Failed ❌

#### Step 2: Check Console
- Buka F12 → Console tab
- Cari error messages
- Note API yang gagal

#### Step 3: Try Solutions
1. **Refresh browser**
2. **Switch API** (Groq ↔ Mistral)
3. **Check internet connection**
4. **Update API key** via tombol "Keys"

#### Step 4: Use Alternative
- Switch ke provider lain
- Check API key validity
- Monitor usage dashboard

---

### 🆘 Advanced Troubleshooting

#### For Groq:
```javascript
// Test di console
fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_GROQ_API_KEY'
    },
    body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{role: 'user', content: 'hello'}]
    })
})
```

#### For Mistral:
```javascript
// Test di console
fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_MISTRAL_API_KEY'
    },
    body: JSON.stringify({
        model: 'mistral-tiny',
        messages: [{role: 'user', content: 'hello'}]
    })
})
```

---

## 🆘 Bantuan

Jika masih ada masalah:
1. Cek console log (F12)
2. Pastikan internet connection
3. Coba refresh browser
4. Switch ke API provider lain
5. Update API key melalui tombol "Keys"

**Happy Coding! 🚀**
