<template>
  <section class="min-h-[60vh] flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 py-16 px-0 w-full">
    <div class="max-w-2xl w-full mx-auto bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
      <h1 class="text-3xl font-bold text-primary-700 mb-6 text-center">FAQ Converter YouTube</h1>
      <div class="space-y-6">
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Apakah layanan ini gratis?</h2>
          <p class="text-gray-700">Ya, gratis untuk penggunaan pribadi. Jangan gunakan untuk pelanggaran hak cipta.</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Format apa yang tersedia?</h2>
          <p class="text-gray-700">MP4 untuk video dan MP3 untuk audio. Kualitas menyesuaikan sumber asli YouTube.</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Kenapa kualitas tertentu tidak muncul?</h2>
          <p class="text-gray-700">Tidak semua video menyediakan semua resolusi. Sistem kami mencoba fallback format terbaik dan menambahkan opsi downscale.</p>
        </div>
        <div class="bg-gray-50 rounded-xl p-5 shadow-sm">
          <h2 class="text-lg font-semibold text-primary-600 mb-2">Apakah aman?</h2>
          <p class="text-gray-700">Kami tidak menyisipkan iklan atau malware. Selalu gunakan browser versi terbaru.</p>
        </div>
      </div>
    </div>
  </section>
</template>
<script>
export default { name: 'FaqPage' }
</script>
