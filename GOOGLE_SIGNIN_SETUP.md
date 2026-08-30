# Google Sign-In Setup Guide

## Overview
Project ini telah dikonfigurasi untuk menggunakan Google Sign-In dengan Google Identity Services.

## Langkah-langkah Setup

### 1. Buat Project di Google Cloud Console

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih project yang sudah ada
3. Pastikan Google Identity Services API sudah diaktifkan:
   - Pergi ke "APIs & Services" > "Library"
   - Cari "Google Identity Services"
   - Klik "Enable"

### 2. Siapkan OAuth Consent Screen

1. Pergi ke "APIs & Services" > "OAuth consent screen"
2. Isi field wajib:
   - **App name**
   - **User support email**
   - **Developer contact information**
3. Untuk tahap awal, gunakan mode **Testing**
4. Tambahkan email Anda ke **Test users**

### 3. Buat OAuth 2.0 Credentials

1. Pergi ke "APIs & Services" > "Credentials"
2. Klik "Create Credentials" > "OAuth client ID"
3. Pilih **Web application**
4. Konfigurasi:
   - **Name**: AI Assistant Web (atau nama lain)
   - **Authorized JavaScript origins**: 
     - `http://localhost`
     - `http://127.0.0.1`
     - `http://localhost:80`
     - `http://127.0.0.1:80`
     - `https://yourdomain.com` (untuk production)
5. Klik "Create"
6. Salin **Client ID** yang muncul

Catatan:
- Untuk implementasi di project ini yang memakai `google.accounts.id`, fokus utama ada di **Authorized JavaScript origins**
- Jangan gunakan credential bertipe selain **Web application**
- Jangan pakai Client ID milik project orang lain, karena sering diblokir oleh kebijakan Google atau terbatas untuk test user tertentu

### 4. Konfigurasi Client ID di Project

1. Buka file `google-auth-config.js`
2. Cari baris:
   ```javascript
   clientId: 'YOUR_GOOGLE_CLIENT_ID_HERE',
   ```
3. Ganti `YOUR_GOOGLE_CLIENT_ID_HERE` dengan Client ID dari Google Cloud Console:
   ```javascript
   window.GOOGLE_AUTH_CONFIG = {
       clientId: '123456789-abcdef.apps.googleusercontent.com',
       allowedOrigins: [
           'http://localhost',
           'http://127.0.0.1'
       ]
   };
   ```
4. Jika Anda memakai domain lain saat development, tambahkan origin tersebut ke `allowedOrigins`

### 5. Testing

1. Jalankan project lewat web server, misalnya XAMPP
2. Buka halaman lewat URL web, misalnya:
   - `http://localhost/web_ai_1/login.html`
   - `http://127.0.0.1/web_ai_1/login.html`
3. Jangan buka file langsung dengan `file:///.../login.html`
4. Klik tombol "Masuk dengan Google"
5. Jika konfigurasi benar, akan muncul popup Google Sign-In
6. Setelah login sukses, user akan diarahkan ke `index.html`

## Troubleshooting

### Error: "Google Client ID belum dikonfigurasi"
- Pastikan Client ID sudah di-set di `login.html`
- Pastikan Client ID tidak masih berupa `YOUR_GOOGLE_CLIENT_ID_HERE`

### Error: "Google Sign-In popup diblokir"
- Izinkan popup untuk website di browser settings
- Pastikan tidak ada popup blocker yang aktif

### Error: "origin_not_allowed"
- Pastikan domain/origin sudah ditambahkan di Authorized JavaScript origins di Google Cloud Console
- Untuk localhost, gunakan `http://localhost` atau `http://127.0.0.1`

### Error: "redirect_uri_mismatch"
- Pastikan redirect URI sudah ditambahkan di Authorized redirect URIs di Google Cloud Console
- Pastikan URI sesuai dengan yang digunakan di browser

### Error: "Access blocked: Authorization Error" / "Error 400: invalid_request"
- Pastikan OAuth Client bertipe **Web application**
- Pastikan halaman dibuka lewat `http://localhost/...` atau `https://domain`, bukan `file://...`
- Pastikan **Authorized JavaScript origins** berisi origin yang sedang dipakai
- Pastikan OAuth consent screen sudah diisi lengkap
- Jika consent screen masih **Testing**, tambahkan akun Google Anda ke daftar **Test users**
- Jika memakai Client ID bawaan project lama/shared, ganti dengan Client ID milik project Google Cloud Anda sendiri
- Pastikan file `google-auth-config.js` sudah berisi `clientId` yang benar dan `allowedOrigins` sesuai origin yang dipakai

## Catatan Penting

- **Development**: Gunakan `http://localhost` atau `http://127.0.0.1` untuk testing lokal
- **Production**: Ganti dengan domain production Anda dan pastikan menggunakan HTTPS
- **Security**: Jangan share Client ID Anda secara publik. Client ID bisa dilihat di source code, tapi tidak masalah untuk aplikasi web.
- **Token Validation**: Token Google disimpan di localStorage. Untuk production, pertimbangkan untuk menambahkan validasi token di backend.

## Fitur yang Telah Diimplementasikan

✅ Google Sign-In dengan Google Identity Services
✅ Auto-redirect setelah login berhasil
✅ Menyimpan user info (email, name, picture) di localStorage
✅ Logout dengan revoke Google token
✅ Error handling untuk berbagai skenario
✅ Fallback mode jika Google Sign-In gagal

## Support

Jika mengalami masalah:
1. Cek console browser untuk error messages
2. Pastikan Google Identity Services API sudah di-enable
3. Pastikan Client ID sudah benar
4. Pastikan origin dan redirect URI sudah dikonfigurasi dengan benar
