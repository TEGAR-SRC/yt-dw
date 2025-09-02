const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ytdlp = require('yt-dlp-exec');

const fs = require('fs-extra');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);
// Cache for yt-dlp results (in-memory)
const ytDlpCache = new Map(); // key: videoId -> { timestamp, formats }
const YT_DLP_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function setYtDlpCache(videoId, formats) {
  if (!videoId || !formats) return;
  ytDlpCache.set(videoId, { timestamp: Date.now(), formats });
}

function getYtDlpCache(videoId) {
  const entry = ytDlpCache.get(videoId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > YT_DLP_CACHE_TTL_MS) {
    ytDlpCache.delete(videoId);
    return null;
  }
  return entry.formats;
}

const app = express();
const PORT = process.env.PORT || 3000;

// Debug logger (enable with env DEBUG=1)
const DEBUG = process.env.DEBUG === '1';
function dlog(...args){ if (DEBUG) console.log(...args); }

// Disable global etag to avoid 304 caching for dynamic video info
app.set('etag', false);

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('frontend/dist'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

// Utility function to clean filename
function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Safer filename (preserve case & spaces) removing only illegal Windows characters
function buildSafeBaseTitle(rawTitle) {
  if (!rawTitle) return 'video';
  return rawTitle
    .replace(/[<>:"/\\|?*]+/g, ' ') // remove illegal chars
    .replace(/[\r\n\t]+/g, ' ')     // remove control whitespace
    .replace(/\s{2,}/g, ' ')         // collapse spaces
    .trim()
    .slice(0, 180); // avoid overly long names
}

function buildDownloadFilename({ title, ext, qualityTag }) {
  const base = buildSafeBaseTitle(title) || 'video';
  const tag = qualityTag ? ` [${qualityTag}]` : '';
  return `${base}${tag}.${ext}`;
}

// Advanced quality detection and upscaling function
function getAdvancedQualityOptions(formats) {
  const progressive = [];
  const videoOnly = [];
  const audioFormats = [];

  formats.forEach(format => {
    if (format.hasVideo && format.hasAudio) {
      progressive.push({
        itag: format.itag,
        quality: format.qualityLabel || 'Unknown',
        container: format.container,
        size: format.contentLength ? `${(format.contentLength / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
        fps: format.fps || 'Unknown',
        width: format.width || 0,
        height: format.height || 0,
        bitrate: format.bitrate || 0,
        hasAudio: true,
        hasVideo: true,
        resolution: format.width && format.height ? `${format.width}x${format.height}` : 'Unknown',
        qualityScore: calculateQualityScore(format),
        type: 'progressive'
      });
    } else if (format.hasVideo && !format.hasAudio) {
      videoOnly.push({
        itag: format.itag,
        quality: format.qualityLabel || 'Unknown',
        container: format.container,
        size: format.contentLength ? `${(format.contentLength / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
        fps: format.fps || 'Unknown',
        width: format.width || 0,
        height: format.height || 0,
        bitrate: format.bitrate || 0,
        hasAudio: false,
        hasVideo: true,
        resolution: format.width && format.height ? `${format.width}x${format.height}` : 'Unknown',
        qualityScore: calculateQualityScore(format) - 5, // slight penalty for needing merge
        type: 'video_only'
      });
    } else if (format.hasAudio && !format.hasVideo) {
      audioFormats.push({
        itag: format.itag,
        quality: format.audioBitrate ? `${format.audioBitrate}kbps` : 'Unknown',
        container: format.container,
        size: format.contentLength ? `${(format.contentLength / 1024 / 1024).toFixed(2)} MB` : 'Unknown',
        bitrate: format.audioBitrate || 0,
        hasAudio: true,
        hasVideo: false,
        qualityScore: calculateAudioQualityScore(format),
        type: 'audio_only'
      });
    }
  });

  // Sort
  progressive.sort((a, b) => b.qualityScore - a.qualityScore);
  videoOnly.sort((a, b) => b.qualityScore - a.qualityScore);
  audioFormats.sort((a, b) => b.qualityScore - a.qualityScore);

  // Merge progressive + videoOnly for UI (higher qualities first)
  const videoFormats = [...progressive, ...videoOnly];

  // Deduplicate by resolution+fps+type (keep first which is highest score already)
  const seen = new Set();
  const deduped = [];
  videoFormats.forEach(f => {
    const key = `${f.resolution}_${f.fps}_${f.type}`;
    if (!seen.has(key)) { seen.add(key); deduped.push(f); }
  });

  // Debug logging to diagnose missing higher resolutions
  try {
    const progRes = progressive.map(f=>`${f.quality||f.qualityLabel||'?'}:${f.resolution}:${f.itag}`).join(', ');
    const videoOnlyRes = videoOnly.map(f=>`${f.quality||f.qualityLabel||'?'}:${f.resolution}:${f.itag}`).join(', ');
  dlog('[DEBUG] Progressive formats:', progRes || 'NONE');
  dlog('[DEBUG] Video-only formats:', videoOnlyRes || 'NONE');
  } catch (e) {
  dlog('[DEBUG] format logging error', e.message);
  }

  return { videoFormats: deduped, audioFormats };
}

// Build standardized quality list (144p-1080p). If a resolution is missing but a higher source exists, we create a synthetic downscale option.
function buildStandardizedVideoList(videoFormats) {
  if (!videoFormats || !videoFormats.length) return [];
  // Base ladder (extendable) – we'll trim above highest actual
  const ladder = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
  const highestActual = Math.max(...videoFormats.filter(f=>f.height).map(f=>f.height));
  // If no valid height just return originals
  if (!isFinite(highestActual) || highestActual === 0) return videoFormats.map(f => ({ ...f, id: `itag_${f.itag}`, standardized:false, synthetic:false }));
  const targetHeights = ladder.filter(h => h <= highestActual);

  // Index best existing format per height
  const byHeight = new Map();
  videoFormats.forEach(f => {
    if (!f.height) return;
    const existing = byHeight.get(f.height);
    if (!existing) byHeight.set(f.height, f);
    else {
      if (!existing.hasAudio && f.hasAudio) byHeight.set(f.height, f);
      else if ((f.bitrate||0) < (f.bitrate||0)) byHeight.set(f.height, f);
    }
  });

  const bestSource = [...videoFormats].sort((a,b)=> (b.width*b.height)-(a.width*a.height))[0];
  const result = [];
  targetHeights.forEach(h => {
    if (byHeight.has(h)) {
      const f = byHeight.get(h);
      result.push({ ...f, standardized:true, targetHeight:h, synthetic:false, id:`itag_${f.itag}` });
    } else if (bestSource && bestSource.height > h) { // only downscale, NO upscale beyond highest actual
      const aspect = bestSource.width / bestSource.height;
      const targetWidth = Math.max(2, Math.round(h * aspect / 2) * 2);
      result.push({
        itag: null,
        quality: `${h}p (Downscale)`,
        container: 'mp4',
        size: 'Dynamic',
        fps: bestSource.fps,
        width: targetWidth,
        height: h,
        bitrate: bestSource.bitrate,
        hasAudio: true,
        hasVideo: true,
        resolution: `${targetWidth}x${h}`,
        qualityScore: h,
        type: 'synthetic_downscale',
        standardized: true,
        synthetic: true,
        sourceItag: bestSource.itag,
        targetHeight: h,
        id: `scale_${h}`
      });
    }
  });

  // Also include any actual heights that are not on the ladder (e.g., 432, 288) to not hide them.
  videoFormats.forEach(f => {
    if (!targetHeights.includes(f.height) && f.height < highestActual) {
      result.push({ ...f, standardized:false, synthetic:false, id:`itag_${f.itag}` });
    }
  });

  // Sort ascending by height then synthetic last within same height
  return result.sort((a,b)=> (a.height - b.height) || (a.synthetic - b.synthetic));
}

// Calculate quality score for video
function calculateQualityScore(format) {
  let score = 0;
  
  // Resolution score (higher resolution = higher score)
  if (format.width && format.height) {
    const pixels = format.width * format.height;
    if (pixels >= 3840 * 2160) score += 100; // 4K
    else if (pixels >= 1920 * 1080) score += 80; // 1080p
    else if (pixels >= 1280 * 720) score += 60; // 720p
    else if (pixels >= 854 * 480) score += 40; // 480p
    else score += 20;
  }
  
  // FPS score
  if (format.fps) {
    if (format.fps >= 60) score += 20;
    else if (format.fps >= 30) score += 15;
    else if (format.fps >= 24) score += 10;
    else score += 5;
  }
  
  // Bitrate score
  if (format.bitrate) {
    score += Math.min(format.bitrate / 1000, 20); // Max 20 points for bitrate
  }
  
  return score;
}

// Calculate quality score for audio
function calculateAudioQualityScore(format) {
  let score = 0;
  
  // Bitrate score
  if (format.audioBitrate) {
    if (format.audioBitrate >= 320) score += 100;
    else if (format.audioBitrate >= 256) score += 80;
    else if (format.audioBitrate >= 192) score += 60;
    else if (format.audioBitrate >= 128) score += 40;
    else score += 20;
  }
  
  return score;
}

// Get video info endpoint
app.get('/api/video-info', async (req, res) => {
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({ error: 'URL YouTube diperlukan' });
    }

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'URL YouTube tidak valid' });
    }

    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    // Use advanced quality detection
    let { videoFormats, audioFormats: audioFormatsList } = getAdvancedQualityOptions(info.formats);

    // If highest resolution <=360p, fallback to yt-dlp JSON for more formats
    const highest = videoFormats.sort((a,b)=> (b.width*b.height)-(a.width*a.height))[0];
    if (!highest || highest.height <= 360) {
  dlog('[yt-dlp] Fallback triggered (highest <=360p)');
      try {
        const json = await ytdlp(url, { dumpSingleJson: true, skipDownload: true, noWarnings: true, preferFreeFormats: false });
        if (json && json.formats) {
          // Map yt-dlp formats to our structure
          const mappedVideo = [];
          const mappedAudio = [];
          json.formats.forEach(f => {
            if (!f.ext) return;
            const width = f.width || 0;
            const height = f.height || 0;
            const fps = f.fps || f.video_fps || null;
            const hasVideo = !!height;
            const hasAudio = !!f.acodec && f.acodec !== 'none';
            if (hasVideo) {
              mappedVideo.push({
                itag: f.format_id,
                quality: f.format_note || f.resolution || `${height}p`,
                container: f.ext,
                size: f.filesize ? `${(f.filesize/1024/1024).toFixed(2)} MB` : 'Unknown',
                fps: fps || 'Unknown',
                width,
                height,
                bitrate: f.tbr || 0,
                hasAudio,
                hasVideo,
                resolution: width && height ? `${width}x${height}` : 'Unknown',
                qualityScore: (width*height) + (fps||0)*100 + (f.tbr||0),
                type: hasAudio ? 'progressive' : 'video_only'
              });
            } else if (hasAudio && !hasVideo) {
              mappedAudio.push({
                itag: f.format_id,
                quality: f.abr ? `${f.abr}kbps` : 'Audio',
                container: f.ext,
                size: f.filesize ? `${(f.filesize/1024/1024).toFixed(2)} MB` : 'Unknown',
                bitrate: (f.abr || 0)*1000,
                hasAudio: true,
                hasVideo: false,
                qualityScore: f.abr || 0,
                type: 'audio_only'
              });
            }
          });
          if (mappedVideo.length) videoFormats = mappedVideo;
          if (mappedAudio.length) audioFormatsList = mappedAudio;
          try { setYtDlpCache(json.id || videoDetails.videoId, json.formats); } catch(_){}
        }
      } catch (e) {
        console.error('[yt-dlp] Fallback error:', e.message || e);
      }
    }

    const standardizedVideoFormats = buildStandardizedVideoList(videoFormats);
    
  dlog(`Found ${videoFormats.length} video formats and ${audioFormatsList.length} audio formats`);
  dlog('Top video quality:', videoFormats[0]?.quality, videoFormats[0]?.resolution);
  dlog('Top audio quality:', audioFormatsList[0]?.quality);

    // Get video ID for thumbnail
    const videoId = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
    
    // Use our thumbnail proxy endpoint
    let thumbnailUrl = '';
    if (videoId) {
      thumbnailUrl = `/api/thumbnail/${videoId}?quality=maxresdefault`;
  dlog('Using thumbnail proxy:', thumbnailUrl);
    }

  // Prevent caching
  res.set('Cache-Control', 'no-store');
  res.json({
      title: videoDetails.title,
      thumbnail: thumbnailUrl,
      duration: videoDetails.lengthSeconds,
      author: videoDetails.author.name,
      viewCount: videoDetails.viewCount,
      videoFormats: standardizedVideoFormats,
      audioFormats: audioFormatsList
    });

  } catch (error) {
    console.error('Error getting video info:', error);
    res.status(500).json({ error: 'Gagal mendapatkan informasi video' });
  }
});

// Debug endpoint to inspect raw formats (untuk diagnosa kenapa hanya 360p)
app.get('/api/debug-formats', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL diperlukan' });
    if (!ytdl.validateURL(url)) return res.status(400).json({ error: 'URL tidak valid' });
    const info = await ytdl.getInfo(url);
    const raw = info.formats.map(f => ({
      itag: f.itag,
      qualityLabel: f.qualityLabel,
      mimeType: f.mimeType,
      hasVideo: f.hasVideo,
      hasAudio: f.hasAudio,
      width: f.width,
      height: f.height,
      fps: f.fps,
      bitrate: f.bitrate || f.averageBitrate,
      audioBitrate: f.audioBitrate,
      contentLength: f.contentLength,
      approxSizeMB: f.contentLength ? (Number(f.contentLength)/1024/1024).toFixed(2) : null
    }));

    // Group by height for quick view
    const byHeight = {};
    raw.forEach(r => {
      const key = r.height || 'unknown';
      byHeight[key] = byHeight[key] || [];
      byHeight[key].push(r.itag + (r.hasAudio && r.hasVideo ? ':prog' : r.hasVideo ? ':v' : r.hasAudio ? ':a' : ''));
    });

  res.set('Cache-Control', 'no-store');
  res.json({
      videoId: info.videoDetails.videoId,
      title: info.videoDetails.title,
      heights: byHeight,
      totalFormats: raw.length,
      raw
    });
  } catch (e) {
    console.error('Debug formats error:', e);
    res.status(500).json({ error: 'Gagal debug formats' });
  }
});

// Download video endpoint
app.get('/api/download-video', async (req, res) => {
  try {
  const { url, format, quality, debug } = req.query;
  const debugMode = !!debug || process.env.FFMPEG_DEBUG;
  dlog('[DOWNLOAD] query:', { url, format, quality, debug: !!debug });
    
    if (!url || !format) {
      return res.status(400).json({ error: 'URL dan format diperlukan' });
    }

    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ error: 'URL YouTube tidak valid' });
    }

    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    let stream;
    let filename;
    
             if (format === 'mp3') {
      // Download audio with selected quality
      if (quality && quality !== 'best') {
        // Use specific itag for audio quality
        stream = ytdl(url, { 
          quality: quality,
          filter: 'audioonly' 
        });
  dlog(`Downloading MP3 with itag: ${quality}`);
      } else {
        // Use highest audio quality
        stream = ytdl(url, { 
          quality: 'highestaudio',
          filter: 'audioonly' 
        });
  dlog('Downloading MP3 dengan kualitas audio tertinggi');
      }
      
  filename = buildDownloadFilename({ title: videoDetails.title, ext: 'mp3', qualityTag: quality && quality!=='best' ? `audio ${quality}` : 'audio' });
      
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.setHeader('Content-Type', 'audio/mpeg');
      
      // Stream audio directly
      stream.pipe(res);
        
    } else if (format === 'mp4') {
      let allFormats = info.formats;
      let { videoFormats: vf } = getAdvancedQualityOptions(allFormats);
      let highest = vf.sort((a,b)=> (b.width*b.height)-(a.width*a.height))[0];
  let ytDlpFormats = null;
  if (!highest || highest.height <= 360) {
  dlog('[yt-dlp] Download fallback triggered');
        try {
          const json = await ytdlp(url, { dumpSingleJson: true, skipDownload: true, noWarnings: true });
          if (json && json.formats) {
    ytDlpFormats = json.formats;
    try { setYtDlpCache(json.id || info.videoDetails.videoId, json.formats); } catch(_){}
            allFormats = json.formats.map(f => ({
              itag: f.format_id,
              hasVideo: !!f.height,
              hasAudio: f.acodec && f.acodec !== 'none',
              width: f.width,
              height: f.height,
              bitrate: (f.tbr||0)*1000
            }));
            vf = json.formats.filter(f=>f.height).map(f=>({
              itag: f.format_id,
              width: f.width,
              height: f.height,
              hasVideo: !!f.height,
              hasAudio: f.acodec && f.acodec !== 'none',
              bitrate: (f.tbr||0)*1000
            }));
          }
        } catch(e){ console.error('[yt-dlp] download fallback error', e.message||e); }
      }
      const { videoFormats } = getAdvancedQualityOptions(allFormats);
      const standardized = buildStandardizedVideoList(videoFormats);

      function pickBestProgressive() {
        return allFormats
          .filter(f => f.hasVideo && f.hasAudio)
          .sort((a,b)=> (b.width*b.height) - (a.width*a.height) || (b.bitrate||0)-(a.bitrate||0))[0];
      }
      function pickBestVideoOnly() {
        return allFormats
          .filter(f => f.hasVideo && !f.hasAudio)
          .sort((a,b)=> (b.width*b.height) - (a.width*a.height) || (b.bitrate||0)-(a.bitrate||0))[0];
      }

      let chosenFormat;
      let syntheticTarget = null;
      if (quality && quality !== 'best') {
        if (quality.startsWith('scale_')) {
          const targetHeight = parseInt(quality.split('_')[1]);
            const bestSource = pickBestVideoOnly() || pickBestProgressive();
          if (!bestSource) return res.status(400).json({ error: 'Sumber video tidak ditemukan' });
          syntheticTarget = { targetHeight, source: bestSource };
          chosenFormat = bestSource; // for logging
          dlog(`Downscale request -> source itag ${bestSource.itag} to ${targetHeight}p`);
        } else if (quality.startsWith('itag_')) {
          const itag = quality.replace('itag_','');
          chosenFormat = allFormats.find(f => f.itag.toString() === itag.toString());
          if (!chosenFormat) return res.status(400).json({ error: 'Itag tidak ditemukan' });
        } else {
          // backward compatibility direct itag
          chosenFormat = allFormats.find(f => f.itag.toString() === quality.toString());
          if (!chosenFormat) return res.status(400).json({ error: 'Itag tidak ditemukan' });
        }
      } else {
        chosenFormat = pickBestProgressive() || pickBestVideoOnly();
  dlog('Auto selected itag:', chosenFormat?.itag, chosenFormat?.qualityLabel, chosenFormat?.width+'x'+chosenFormat?.height);
      }

      if (!chosenFormat) {
        return res.status(500).json({ error: 'Tidak dapat menentukan format video' });
      }

  // Prepare filename with quality info later after we know syntheticTarget / chosenFormat
  let qualityTagForName = '';
  // (set after chosenFormat resolution below)
      res.setHeader('Content-Type', 'video/mp4');

      // Direct yt-dlp cached URL handling (if chosenFormat.itag does not look numeric typical ytdl-core OR ytdl-core streaming fails)
      const videoIdForCache = url.match(/(?:v=|youtu\.be\/)([^&\n?#]+)/)?.[1];
      const cacheEntryFormats = videoIdForCache ? getYtDlpCache(videoIdForCache) : null;
      if (cacheEntryFormats) {
        const fmt = cacheEntryFormats.find(f=>f.format_id?.toString() === chosenFormat.itag?.toString());
        if (fmt) {
          dlog('[yt-dlp] Using cached direct URL for itag', chosenFormat.itag);
          const hasVideo = fmt.vcodec && fmt.vcodec !== 'none';
          const hasAudio = fmt.acodec && fmt.acodec !== 'none';
          if (hasVideo && hasAudio) {
            const cmd = ffmpeg().addInput(fmt.url).inputOptions(['-user_agent','Mozilla/5.0']);
            if (debugMode) cmd.addOption('-loglevel','debug'); else cmd.addOption('-loglevel','error');
            return cmd
              .videoCodec('copy')
              .audioCodec('copy')
              .outputOptions(['-movflags frag_keyframe+empty_moov'])
              .format('mp4')
              .on('start', c=> dlog('[yt-dlp] FFmpeg direct progressive start'))
              .on('stderr', line => { if (debugMode) console.log('[ffmpeg]', line); })
              .on('error', e=>{ console.error('FFmpeg direct progressive error:', e.message||e); if(!res.headersSent) res.status(500).json({error:'Gagal streaming'}); })
              .on('end', ()=> dlog('[yt-dlp] FFmpeg direct progressive selesai'))
              .pipe(res, { end: true });
          } else if (hasVideo) {
            const bestAudio = cacheEntryFormats.filter(f=>f.acodec && f.acodec!=='none' && (!f.vcodec || f.vcodec==='none'))
              .sort((a,b)=>(b.abr||0)-(a.abr||0))[0];
            let usedFallbackAudio = false;
            const cmd = ffmpeg();
            cmd.addInput(fmt.url);
            if (bestAudio) {
              cmd.addInput(bestAudio.url);
            } else {
              console.warn('[yt-dlp] No standalone audio format found in cache; using ytdl highestaudio');
              try {
                const fallbackAudio = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
                usedFallbackAudio = true;
                fallbackAudio.on('error', e=>console.error('[yt-dlp] fallback audio stream error:', e.message||e));
                cmd.addInput(fallbackAudio);
              } catch(e) {
                console.error('[yt-dlp] Failed to init fallback audio stream:', e.message||e);
              }
            }
            cmd.inputOptions(['-user_agent','Mozilla/5.0']);
            if (debugMode) cmd.addOption('-loglevel','debug'); else cmd.addOption('-loglevel','error');
            return cmd
              .videoCodec('copy')
              .audioCodec('aac')
              .outputOptions(['-movflags frag_keyframe+empty_moov','-shortest'])
              .format('mp4')
              .on('start', s=>dlog('[yt-dlp] FFmpeg merge start (cached video +', bestAudio?'cached audio':(usedFallbackAudio?'ytdl audio':'no audio'),')'))
              .on('stderr', line => { if (debugMode) console.log('[ffmpeg]', line); })
              .on('error', e=>{ console.error('FFmpeg direct merge cache error:', e.message||e); if(!res.headersSent) res.status(500).json({error:'Gagal merge'}); })
              .on('end', ()=>dlog('[yt-dlp] FFmpeg merge selesai (cached video)'))
              .pipe(res, { end: true });
          }
        }
      }

      if (syntheticTarget) {
        qualityTagForName = `${syntheticTarget.targetHeight}p`;
        const filenameMp4 = buildDownloadFilename({ title: videoDetails.title, ext: 'mp4', qualityTag: qualityTagForName });
        res.setHeader('Content-Disposition', `attachment; filename="${filenameMp4}"; filename*=UTF-8''${encodeURIComponent(filenameMp4)}`);
        // Perform downscale using ffmpeg
        const sourceVideo = ytdl(url, { quality: syntheticTarget.source.itag, filter: syntheticTarget.source.hasAudio ? 'audioandvideo' : 'videoonly' });
        const targetHeight = syntheticTarget.targetHeight;
        const targetWidth = Math.round((syntheticTarget.source.width / syntheticTarget.source.height) * targetHeight / 2) * 2;
  dlog(`Transcoding downscale to ${targetWidth}x${targetHeight}`);
        const cmd = ffmpeg();
        cmd.addInput(sourceVideo);
        // If source has no audio, prefer adding direct audio URL (avoids two Node stream inputs limitation)
        if (!syntheticTarget.source.hasAudio) {
          try {
            const bestAudioFormat = info.formats
              .filter(f => f.hasAudio && !f.hasVideo)
              .sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
            if (bestAudioFormat && bestAudioFormat.url) {
              dlog('[downscale] Using direct audio URL itag', bestAudioFormat.itag);
              cmd.addInput(bestAudioFormat.url);
            } else {
              logger.warn('downscale.no_direct_audio_url');
              const fallbackAudioStream = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
              fallbackAudioStream.on('error', e=>logger.error('downscale.fallback_audio_stream_error', { error: e.message }));
              cmd.addInput(fallbackAudioStream);
            }
          } catch(e) {
            logger.error('downscale.audio_selection_error', { error: e.message });
          }
        }
        cmd.videoCodec('libx264').audioCodec('aac')
          .outputOptions([
            '-preset veryfast',
            '-movflags frag_keyframe+empty_moov'
          ])
          .size(`${targetWidth}x${targetHeight}`)
          .format('mp4')
          .on('start', c => dlog('FFmpeg downscale start'))
          .on('error', e => { console.error('FFmpeg downscale error:', e.message||e); if(!res.headersSent) res.status(500).json({error:'Gagal transcode'}); })
          .on('end', () => dlog('FFmpeg downscale selesai'))
          .pipe(res, { end: true });

        sourceVideo.on('error', e=>console.error('Source video error:', e.message||e));
        return; // skip generic stream handler
      }

      // If progressive (has audio) simple pipe
      if (chosenFormat.hasAudio) {
        if (!qualityTagForName) {
          const h = chosenFormat.height || chosenFormat.qualityLabel || 'video';
          const fpsTag = chosenFormat.fps ? `${chosenFormat.fps}fps` : '';
          qualityTagForName = `${h}${fpsTag?','+fpsTag:''}`;
          const filenameProg = buildDownloadFilename({ title: videoDetails.title, ext: 'mp4', qualityTag: qualityTagForName });
          res.setHeader('Content-Disposition', `attachment; filename="${filenameProg}"; filename*=UTF-8''${encodeURIComponent(filenameProg)}`);
        }
        // Force ffmpeg pipeline even for progressive to unify behavior
  dlog(`[progressive] Using ffmpeg pipeline for itag=${chosenFormat.itag}`);
        try {
          const progStream = ytdl(url, { quality: chosenFormat.itag, filter: 'audioandvideo' });
          progStream.on('info', (i,f)=> dlog('[ytdl] progressive info selected itag', f?.itag, f?.qualityLabel));
          progStream.on('error', e=> console.error('[ytdl] progressive stream error:', e.message||e));
          const cmd = ffmpeg()
            .addInput(progStream)
            .videoCodec('copy')
            .audioCodec('copy')
            .outputOptions(['-movflags frag_keyframe+empty_moov'])
            .format('mp4')
            .on('start', c=>dlog('[progressive] ffmpeg start'))
            .on('stderr', line=> { if (debugMode) console.log('[ffmpeg]', line); })
            .on('error', e=> { console.error('[progressive] ffmpeg error:', e.message||e); if(!res.headersSent) res.status(500).json({ error: 'Gagal proses progressive' }); })
            .on('end', ()=> dlog('[progressive] ffmpeg selesai'));
          return cmd.pipe(res, { end: true });
        } catch(e) {
          console.error('[progressive] pipeline init error:', e.message||e);
          if (!res.headersSent) return res.status(500).json({ error: 'Gagal inisialisasi progressive pipeline' });
        }
      } else {
        if (!qualityTagForName) {
          const h = chosenFormat.height || chosenFormat.qualityLabel || 'video';
          const fpsTag = chosenFormat.fps ? `${chosenFormat.fps}fps` : '';
          qualityTagForName = `${h}${fpsTag?','+fpsTag:''}`;
          const filenameMerge = buildDownloadFilename({ title: videoDetails.title, ext: 'mp4', qualityTag: qualityTagForName });
          res.setHeader('Content-Disposition', `attachment; filename="${filenameMerge}"; filename*=UTF-8''${encodeURIComponent(filenameMerge)}`);
        }
        // Merge video-only + audio using direct URL when possible to avoid multi Node stream input issue
  dlog(`Merging video-only itag=${chosenFormat.itag} (prefer direct audio URL)`);
        const videoStream = ytdl(url, { quality: chosenFormat.itag, filter: 'videoonly' });
        let directAudio = info.formats
          .filter(f=>f.hasAudio && !f.hasVideo && f.url)
          .sort((a,b)=>(b.audioBitrate||0)-(a.audioBitrate||0))[0];
        if (!directAudio) console.warn('[merge] No direct audio url found, fallback to ytdl audio stream');
        const command = ffmpeg()
          .addInput(videoStream)
          .on('start', c=>dlog('FFmpeg merge started (video-only + audio)'))
          .on('error', err => {
            console.error('FFmpeg merge error:', err.message || err);
            if (!res.headersSent) res.status(500).json({ error: 'Gagal menggabungkan audio video' });
          })
          .on('end', () => dlog('FFmpeg merge selesai'));

        if (directAudio) {
          command.addInput(directAudio.url);
        } else {
          const fallbackAudio = ytdl(url, { quality: 'highestaudio', filter: 'audioonly' });
          fallbackAudio.on('error', e=> console.error('[merge] fallback audio stream error:', e.message||e));
          command.addInput(fallbackAudio);
        }

        command
          .videoCodec('copy')
          .audioCodec('aac')
          .outputOptions(['-movflags frag_keyframe+empty_moov','-shortest'])
          .format('mp4')
          .pipe(res, { end: true });

        videoStream.on('error', e=> console.error('Video stream error:', e.message||e));
      }
    } else {
      return res.status(400).json({ error: 'Format tidak didukung' });
    }

    // Add error handling for stream (guard in case stream undefined e.g., upscaling branch)
  if (stream && stream.on) {
      stream.on('error', (error) => {
        console.error('Stream error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Gagal mengunduh video' });
        }
      });
    }

  } catch (error) {
    console.error('Error downloading video:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Gagal mengunduh video' });
    }
  }
});

// Progress endpoint for real-time download progress
app.get('/api/download-progress', async (req, res) => {
  try {
    const { url, format } = req.query;
    
    if (!url || !format) {
      return res.status(400).json({ error: 'URL dan format diperlukan' });
    }

    const info = await ytdl.getInfo(url);
    const videoDetails = info.videoDetails;
    
    let stream;
    let totalBytes = 0;
    let downloadedBytes = 0;
    
    if (format === 'mp3') {
      stream = ytdl(url, { 
        quality: 'highestaudio',
        filter: 'audioonly' 
      });
    } else {
      stream = ytdl(url, { 
        quality: 'highest',
        filter: 'audioandvideo' 
      });
    }

    stream.on('info', (info, format) => {
      totalBytes = parseInt(format.contentLength);
    });

    stream.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = totalBytes > 0 ? (downloadedBytes / totalBytes * 100).toFixed(2) : 0;
      
      // Send progress via Server-Sent Events
      res.write(`data: ${JSON.stringify({ progress, downloadedBytes, totalBytes })}\n\n`);
    });

    stream.on('end', () => {
      res.write(`data: ${JSON.stringify({ progress: 100, downloadedBytes: totalBytes, totalBytes })}\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      console.error('Stream error:', error);
      res.write(`data: ${JSON.stringify({ error: 'Gagal mengunduh' })}\n\n`);
      res.end();
    });

  } catch (error) {
    console.error('Error in progress endpoint:', error);
    res.status(500).json({ error: 'Gagal mendapatkan progress' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Thumbnail proxy endpoint to bypass CORS
app.get('/api/thumbnail/:videoId', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { quality = 'maxresdefault' } = req.query;
    
    // Validate quality parameter
    const validQualities = ['maxresdefault', 'hqdefault', 'mqdefault', 'sddefault', 'default'];
    const thumbnailQuality = validQualities.includes(quality) ? quality : 'maxresdefault';
    
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/${thumbnailQuality}.jpg`;
    
  dlog('Proxying thumbnail:', thumbnailUrl);
    
    // Set headers for image
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    // Fetch and stream the thumbnail
    const https = require('https');
    https.get(thumbnailUrl, (thumbnailRes) => {
      if (thumbnailRes.statusCode === 200) {
        thumbnailRes.pipe(res);
      } else {
        // Fallback to default thumbnail
        const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        https.get(fallbackUrl, (fallbackRes) => {
          fallbackRes.pipe(res);
        }).on('error', (error) => {
          console.error('Fallback thumbnail error:', error);
          res.status(404).json({ error: 'Thumbnail tidak ditemukan' });
        });
      }
    }).on('error', (error) => {
      console.error('Thumbnail proxy error:', error);
      res.status(404).json({ error: 'Thumbnail tidak ditemukan' });
    });
    
  } catch (error) {
    console.error('Thumbnail proxy error:', error);
    res.status(500).json({ error: 'Gagal memproses thumbnail' });
  }
});

// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ error: 'Terjadi kesalahan internal server' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server berjalan di port ${PORT}`);
  console.log(`📱 Frontend tersedia di http://localhost:${PORT}`);
  console.log(`🔧 API tersedia di http://localhost:${PORT}/api`);
}); 