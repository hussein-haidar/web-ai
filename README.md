# AI Assistant Web Sederhana

Aplikasi web AI sederhana yang dibuat dengan Bootstrap tanpa CSS kustom.

## 🚀 Fitur

- **Chat Interface**: Interface percakapan yang menarik dengan Bootstrap
- **AI Responses**: Respons AI simulasi dengan berbagai jenis jawaban
- **Real-time**: Indikator typing saat AI sedang "berpikir"
- **Responsive**: Desain yang responsif untuk desktop dan mobile
- **Interactive**: Berbagai perintah yang bisa digunakan

## 📋 Persyaratan

- Web browser modern (Chrome, Firefox, Safari, Edge)
- Koneksi internet (untuk CDN Bootstrap)
- Web server lokal (opsional, seperti XAMPP, WAMP, atau Live Server)

## 🛠️ Cara Menjalankan

### Opsi 1: Menggunakan XAMPP (jika sudah terinstall)
1. Salin folder `web_ai` ke `htdocs` di direktori XAMPP Anda
2. Start Apache server dari XAMPP Control Panel
3. Buka browser dan akses `http://localhost/web_ai`

### Opsi 2: Menggunakan Live Server (VS Code)
1. Install ekstensi "Live Server" di VS Code
2. Klik kanan pada `index.html` dan pilih "Open with Live Server"
3. Aplikasi akan terbuka di browser

### Opsi 3: Buka Langsung di Browser
1. Klik dua kali file `index.html`
2. Aplikasi akan terbuka di browser

## 💬 Perintah yang Tersedia

Coba gunakan perintah-perintah berikut untuk berinteraksi dengan AI:

| Perintah | Deskripsi |
|----------|-----------|
| `halo` atau `hai` | Sapaan dari AI |
| `apa kabar` | AI menanyakan kabar Anda |
| `siapa kamu` | Info tentang AI Assistant |
| `jam` | Menampilkan waktu sekarang |
| `tanggal` | Menampilkan tanggal hari ini |
| `bantuan` | Menampilkan panduan bantuan |
| `bye` atau `selamat tinggal` | Mengakhiri percakapan |

## 🎨 Komponen

### 📁 Struktur File
```
web_ai/
├── index.html          # Halaman utama dengan Bootstrap
├── script.js           # Logika JavaScript untuk AI
└── README.md          # Dokumentasi ini
```

### 🔧 Teknologi yang Digunakan
- **HTML5**: Struktur halaman
- **Bootstrap 5.3**: Framework CSS untuk UI
- **Bootstrap Icons**: Ikon untuk interface
- **Vanilla JavaScript**: Logika aplikasi
- **CDN**: Bootstrap dan icons dari CDN

## 🎯 Cara Penggunaan

1. **Mengirim Pesan**: Ketik pesan di input field dan tekan Enter atau klik tombol "Kirim"
2. **Hapus Chat**: Klik tombol "Hapus Chat" untuk membersihkan semua percakapan
3. **Bantuan**: Klik tombol "Bantuan" untuk melihat panduan penggunaan
4. **Respons AI**: AI akan merespons dengan delay simulasi 1-2 detik

## 🔧 Kustomisasi

### Menambah Respons AI Baru
Edit file `script.js` dan tambahkan respons baru di objek `responses`:

```javascript
const responses = {
    // ... respons yang sudah ada
    'kata_kunci_baru': 'Respons baru untuk kata kunci ini',
};
```

### Mengubah Tampilan
Aplikasi menggunakan Bootstrap, jadi Anda bisa:
- Mengubah kelas Bootstrap di `index.html`
- Menambahkan kelas kustom jika needed
- Mengubah warna tema dengan mengubah kelas Bootstrap (misal: `bg-primary` ke `bg-success`)

## 📱 Responsif

Aplikasi ini sudah responsif dan akan bekerja dengan baik di:
- Desktop (1920x1080 ke atas)
- Tablet (768px - 1024px)
- Mobile (320px - 768px)

## 🚨 Catatan

- Ini adalah AI simulasi, bukan AI yang terhubung ke API eksternal
- Respons bersifat acak dan sudah diprogram sebelumnya
- Tidak memerlukan API key atau konfigurasi server
- Aplikasi berjalan sepenuhnya di browser

## 🤝 Kontribusi

Ini adalah proyek pembelajaran sederhana. Jika Anda ingin mengembangkan lebih lanjut:
- Tambahkan lebih banyak respons AI
- Integrasi dengan API AI (OpenAI, dll)
- Tambahkan fitur voice-to-text
- Simpan history chat di localStorage

## 📄 Lisensi

Proyek ini untuk tujuan pembelajaran dan dapat digunakan secara bebas.
