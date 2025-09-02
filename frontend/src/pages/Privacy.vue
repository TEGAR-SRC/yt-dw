<template>
  <section class="min-h-[60vh] flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 py-16 px-0 w-full">
    <div class="max-w-2xl w-full mx-auto bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <h1 class="text-3xl font-bold text-primary-700 mb-6 text-center">Kebijakan Privasi</h1>
      <div class="space-y-6">
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Data yang Tidak Disimpan</h2>
          <p class="text-gray-700">Kami tidak menyimpan URL video yang Anda masukkan atau hasil unduhan. Log server hanya digunakan untuk debug (error & performa) dan dibersihkan berkala.</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Data yang Diproses</h2>
          <ul class="list-disc pl-5 text-gray-700">
            <li>Permintaan HTTP standar (IP, user-agent) untuk keperluan keamanan.</li>
            <li>Tidak ada cookie pelacakan pihak ketiga.</li>
          </ul>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Pihak Ketiga</h2>
          <p class="text-gray-700">Video diambil langsung dari server YouTube untuk diproses sementara (streaming), tanpa penyimpanan permanen.</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Kontak</h2>
          <p class="text-gray-700">Untuk permintaan penghapusan atau pertanyaan, hubungi admin domain ini.</p>
        </div>
      </div>
    </div>
  </section>
</template>
<script>
export default { name: 'PrivacyPage' }
</script>
