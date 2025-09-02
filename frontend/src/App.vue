<template>
  <div id="app" class="min-h-screen">
    <!-- Header -->
  <header class="bg-gray-100/80 backdrop-blur-lg border-b border-gray-200/40 sticky top-0 z-50 supports-backdrop-blur:bg-gray-100/80 dark:bg-slate-900/10 dark:border-slate-700/40">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex justify-between items-center py-4">
          <a href="#" @click.prevent="goHome" class="flex items-center space-x-3 group">
            <div class="w-10 h-10 bg-gradient-to-br from-red-500 to-red-600 rounded-lg flex items-center justify-center">
              <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
              </svg>
            </div>
            <div>
              <h1 class="text-2xl font-bold gradient-text group-hover:opacity-90">YT Converter</h1>
              <p class="text-sm text-gray-600 dark:text-slate-400">Download YouTube Video & Audio</p>
            </div>
          </a>
          <nav class="hidden md:flex items-center space-x-1 text-sm font-medium">
            <a href="#features" @click.prevent="scrollTo('features')" :class="navClass('features')">Fitur</a>
            <a href="#/faq" :class="navClass('faq')">FAQ</a>
            <a href="#/privacy" :class="navClass('privacy')">Privasi</a>
            <a href="#/disclaimer" :class="navClass('disclaimer')">Disclaimer</a>
          </nav>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="flex-1">
      <!-- Simple hash router -->
      <component :is="currentPageComponent" v-if="routePage" />
      <template v-else>
      <!-- Hero Section -->
      <section class="py-20 px-0 w-full bg-gradient-to-b from-white to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div class="w-full text-center">
          <h2 class="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-6">
            Download Video YouTube dengan
            <span class="gradient-text">Mudah & Cepat</span>
          </h2>
          <p class="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Konversi video YouTube ke format MP4 atau MP3 dengan kualitas tinggi. 
            Tidak ada iklan, tidak ada batasan, hanya download yang cepat dan aman.
          </p>
          
          <!-- URL Input Form -->
          <div class="card max-w-2xl mx-auto">
            <form @submit.prevent="getVideoInfo" class="space-y-4">
              <div class="relative">
                <input
                  v-model="youtubeUrl"
                  type="url"
                  placeholder="Tempel URL YouTube di sini..."
                  class="input-field pr-12 text-lg focus:shadow focus:shadow-primary-500/20 dark:bg-slate-800 dark:placeholder-slate-400"
                  :class="{ 'border-red-500': urlError }"
                  required
                />
                <div class="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </div>
              </div>
              
              <div v-if="urlError" class="text-red-500 text-sm text-left">
                {{ urlError }}
              </div>
              
              <button 
                type="submit" 
                class="btn-gradient w-full text-lg"
                :disabled="isLoading"
              >
                <span v-if="isLoading" class="flex items-center justify-center">
                  <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Memproses...
                </span>
                <span v-else>Dapatkan Info Video</span>
              </button>
            </form>
          </div>
        </div>
  </section>

      <!-- Video Info Section -->
      <section v-if="videoInfo" class="py-8 px-4 sm:px-6 lg:px-8">
        <div class="max-w-4xl mx-auto">
          <div class="card">
            <div class="grid md:grid-cols-2 gap-6">
              <!-- Video Thumbnail & Info -->
              <div>
                                 <img 
                   :src="videoInfo.thumbnail" 
                   :alt="videoInfo.title"
                   class="w-full rounded-lg shadow-md mb-4"
                   @error="handleImageError"
                   @load="handleImageLoad"
                 />
                <h3 class="text-xl font-semibold text-gray-900 mb-2">{{ videoInfo.title }}</h3>
                <div class="space-y-2 text-sm text-gray-600">
                  <p><span class="font-medium">Channel:</span> {{ videoInfo.author }}</p>
                  <p><span class="font-medium">Durasi:</span> {{ formatDuration(videoInfo.duration) }}</p>
                  <p><span class="font-medium">Views:</span> {{ formatNumber(videoInfo.viewCount) }}</p>
                </div>
              </div>
              
              <!-- Download Options -->
              <div class="space-y-4">
                                 <h4 class="text-lg font-semibold text-gray-900">Pilih Format & Kualitas</h4>
                 
                 <!-- Quality Info Display -->
                 <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                   <div class="flex items-center space-x-2 text-sm text-blue-800">
                     <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                     </svg>
                     <span>
                       <strong>MP4:</strong> {{ selectedMp4Quality === 'best' ? 'Kualitas Terbaik' : `Itag: ${selectedMp4Quality}` }} | 
                       <strong>MP3:</strong> {{ selectedMp3Quality === 'best' ? 'Kualitas Terbaik' : `Itag: ${selectedMp3Quality}` }}
                     </span>
                   </div>
                 </div>
                
                <!-- MP4 Download dengan Quality Selector -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                      <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 2v14h14V5H5zm2 2h10v2H7V7zm0 4h10v2H7v-2zm0 4h7v2H7v-2z"/>
                      </svg>
                      <span class="font-medium">Video MP4</span>
                    </div>
                  </div>
                  
                                     <!-- Quality Selector untuk MP4 -->
                   <div class="mb-4">
                     <label class="block text-sm font-medium text-gray-700 mb-2">Pilih Kualitas Video:</label>
                     <select v-model="selectedMp4Quality" class="custom-select">
                       <option value="best">🎯 Kualitas Terbaik (Auto)</option>
                       <option v-for="format in videoInfo.videoFormats" :key="format.id" :value="format.synthetic ? format.id : ('itag_' + format.itag)">
                          📹 {{ format.synthetic ? format.quality : (format.quality || (format.height + 'p')) }} | {{ format.resolution }} | {{ format.fps }}fps | {{ format.synthetic ? 'Transcode' : format.size }}
                       </option>
                     </select>
                     <p class="text-xs text-gray-500 mt-1">Pilih kualitas video sesuai kebutuhan</p>
                   </div>
                  
                  <button 
                    @click="downloadVideo('mp4', selectedMp4Quality)"
                    class="btn-gradient w-full"
                    :disabled="isDownloading"
                  >
                    <span v-if="isDownloading" class="flex items-center justify-center">
                      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Downloading...
                    </span>
                    <span v-else>Download MP4</span>
                  </button>
                </div>
                
                <!-- MP3 Download dengan Quality Selector -->
                <div class="border border-gray-200 rounded-lg p-4">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center space-x-2">
                      <svg class="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                      <span class="font-medium">Audio MP3</span>
                    </div>
                  </div>
                  
                                     <!-- Quality Selector untuk MP3 -->
                   <div class="mb-4">
                     <label class="block text-sm font-medium text-gray-700 mb-2">Pilih Kualitas Audio:</label>
                     <select v-model="selectedMp3Quality" class="custom-select">
                       <option value="best">🎵 Kualitas Terbaik (Auto)</option>
                       <option v-for="format in videoInfo.audioFormats" :key="format.itag" :value="format.itag">
                         🎧 {{ format.quality }} | {{ format.size }}
                       </option>
                     </select>
                     <p class="text-xs text-gray-500 mt-1">Pilih kualitas audio sesuai kebutuhan</p>
                   </div>
                  
                  <button 
                    @click="downloadVideo('mp3', selectedMp3Quality)"
                    class="btn-gradient w-full"
                    :disabled="isDownloading"
                  >
                    <span v-if="isDownloading" class="flex items-center justify-center">
                      <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Converting...
                    </span>
                    <span v-else>Download MP3</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
  </section>
  </template>

      <!-- Progress Bar -->
      <section v-if="downloadProgress > 0 && downloadProgress < 100" class="py-4 px-4 sm:px-6 lg:px-8">
        <div class="max-w-4xl mx-auto">
          <div class="card">
            <div class="space-y-3">
              <div class="flex justify-between text-sm">
                <span>Download Progress</span>
                <span>{{ downloadProgress.toFixed(1) }}%</span>
              </div>
              <div class="w-full bg-gray-200 rounded-full h-3">
                <div 
                  class="progress-bar h-3 rounded-full transition-all duration-300"
                  :style="{ width: downloadProgress + '%' }"
                ></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Features Section -->
  <section id="features" class="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 scroll-mt-24">
        <div class="max-w-7xl mx-auto">
          <div class="text-center mb-12">
            <h3 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">Fitur Unggulan</h3>
            <p class="text-lg text-gray-600 dark:text-slate-400">Semua yang Anda butuhkan untuk download video YouTube</p>
          </div>
          
          <div class="grid md:grid-cols-3 gap-8">
            <div class="feature-card group" style="background:#23293a;color:#fff;">
              <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h4 class="text-xl font-semibold mb-2" style="color:#fff;">Download Cepat</h4>
              <p class="text-base" style="color:#fff;opacity:0.85;">Teknologi streaming yang dioptimalkan untuk download yang cepat dan efisien</p>
            </div>
            
            <div class="feature-card group" style="background:#23293a;color:#fff;">
              <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
              <h4 class="text-xl font-semibold mb-2" style="color:#fff;">Format Fleksibel</h4>
              <p class="text-base" style="color:#fff;opacity:0.85;">Pilih antara MP4 untuk video atau MP3 untuk audio sesuai kebutuhan Anda</p>
            </div>
            
            <div class="feature-card group" style="background:#23293a;color:#fff;">
              <div class="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg class="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h4 class="text-xl font-semibold mb-2" style="color:#fff;">100% Aman</h4>
              <p class="text-base" style="color:#fff;opacity:0.85;">Tidak ada iklan, tidak ada malware, hanya download yang bersih dan aman</p>
            </div>
          </div>
        </div>
      </section>


    </main>

    <!-- Footer -->
    <footer class="bg-gray-900 text-white py-8">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <p class="text-gray-400">
          © {{ currentYear }} YT Converter. Dibuat oleh ❤️ <a href="https://tegar-aja.xyz" target="_blank" rel="noopener" class="underline hover:text-white">tegar-aja</a>.
        </p>
        <p class="text-sm text-gray-500 mt-2">
          Hanya untuk penggunaan pribadi. Hormati hak cipta konten.
        </p>
      </div>
    </footer>
  </div>
</template>

<script>
import { ref, computed } from 'vue'
import FaqPage from './pages/Faq.vue'
import PrivacyPage from './pages/Privacy.vue'
import DisclaimerPage from './pages/Disclaimer.vue'
import axios from 'axios'

export default {
  name: 'App',
  setup() {
    const youtubeUrl = ref('')
    const routePage = ref('')
  const currentPageComponent = computed(()=>{
      switch(routePage.value){
        case 'faq': return FaqPage
        case 'privacy': return PrivacyPage
        case 'disclaimer': return DisclaimerPage
        default: return null
      }
    })

    const parseRoute = () => {
      const hash = window.location.hash || ''
      const m = hash.match(/^#\/(faq|privacy|disclaimer)/)
      routePage.value = m ? m[1] : ''
    }
    window.addEventListener('hashchange', parseRoute)
    parseRoute()
    const videoInfo = ref(null)
    const isLoading = ref(false)
    const isDownloading = ref(false)
    const downloadProgress = ref(0)
    const urlError = ref('')
    const selectedMp4Quality = ref('best')
    const selectedMp3Quality = ref('best')

    const getVideoInfo = async () => {
      if (!youtubeUrl.value.trim()) {
        urlError.value = 'URL YouTube diperlukan'
        return
      }

      if (!isValidYouTubeUrl(youtubeUrl.value)) {
        urlError.value = 'URL YouTube tidak valid'
        return
      }

      urlError.value = ''
      isLoading.value = true

      try {
        const response = await axios.get(`/api/video-info?url=${encodeURIComponent(youtubeUrl.value)}`)
        videoInfo.value = response.data
      } catch (error) {
        console.error('Error:', error)
        if (error.response?.data?.error) {
          urlError.value = error.response.data.error
        } else {
          urlError.value = 'Gagal mendapatkan informasi video'
        }
      } finally {
        isLoading.value = false
      }
    }

    const downloadVideo = async (format, quality = 'best') => {
      if (!videoInfo.value) return

      isDownloading.value = true
      downloadProgress.value = 0

      try {
        const downloadUrl = `/api/download-video?url=${encodeURIComponent(youtubeUrl.value)}&format=${format}&quality=${quality}`
        
        // Create a hidden link and trigger download
        const link = document.createElement('a')
        link.href = downloadUrl
        link.download = `${sanitizeFilename(videoInfo.value.title)}.${format}`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        // Simulate progress (in real app, you'd use Server-Sent Events)
        const progressInterval = setInterval(() => {
          if (downloadProgress.value < 90) {
            downloadProgress.value += Math.random() * 10
          }
        }, 200)

        setTimeout(() => {
          clearInterval(progressInterval)
          downloadProgress.value = 100
          setTimeout(() => {
            downloadProgress.value = 0
          }, 2000)
        }, 3000)

      } catch (error) {
        console.error('Download error:', error)
        alert('Gagal mengunduh video')
      } finally {
        isDownloading.value = false
      }
    }

    const isValidYouTubeUrl = (url) => {
      const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/
      return youtubeRegex.test(url)
    }

    const sanitizeFilename = (filename) => {
      return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()
    }

    const formatDuration = (seconds) => {
      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
    }

    const formatNumber = (num) => {
      if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M'
      } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K'
      }
      return num.toString()
    }

    const handleImageError = (event) => {
      console.log('Image failed to load:', event.target.src)
      // Fallback to our thumbnail proxy with different qualities
      const videoId = youtubeUrl.value.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1]
      if (videoId) {
        // Try multiple fallback thumbnails using our proxy
        const fallbackThumbnails = [
          `/api/thumbnail/${videoId}?quality=hqdefault`,
          `/api/thumbnail/${videoId}?quality=mqdefault`,
          `/api/thumbnail/${videoId}?quality=sddefault`,
          `/api/thumbnail/${videoId}?quality=default`
        ]
        
        let currentIndex = 0
        const tryNextThumbnail = () => {
          if (currentIndex < fallbackThumbnails.length) {
            event.target.src = fallbackThumbnails[currentIndex]
            currentIndex++
          }
        }
        
        event.target.onerror = tryNextThumbnail
        tryNextThumbnail()
      }
    }

    const handleImageLoad = (event) => {
      console.log('Image loaded successfully:', event.target.src)
    }

    const goHome = () => {
      window.location.hash = ''
      routePage.value = ''
      // Smooth scroll to top
      window.scrollTo({ top:0, behavior:'smooth' })
    }

    const scrollTo = (id) => {
      // if route page active, go home first
      if (routePage.value) {
        goHome()
        setTimeout(()=>scrollTo(id), 50)
        return
      }
      const el = document.getElementById(id)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const navClass = (name) => {
      const active = (name === 'features' && !routePage.value) || routePage.value === name
      return [
        'nav-pill-base',
        active ? 'nav-pill-active' : 'nav-pill-idle'
      ].join(' ')
    }

    const currentYear = new Date().getFullYear()
    return {
      youtubeUrl,
      videoInfo,
      isLoading,
      isDownloading,
      downloadProgress,
      urlError,
      selectedMp4Quality,
      selectedMp3Quality,
      getVideoInfo,
      downloadVideo,
      formatDuration,
      formatNumber,
      handleImageError,
      handleImageLoad,
  currentYear,
  routePage,
  currentPageComponent,
  goHome,
  scrollTo,
  navClass
    }
  }
}
</script> 