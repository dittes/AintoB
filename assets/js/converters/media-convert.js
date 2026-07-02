/**
 * Audio / video / TIFF / GIF converter powered by ffmpeg.wasm.
 *
 * The page loads the small @ffmpeg/ffmpeg + @ffmpeg/util UMD wrappers from CDN;
 * the ~31 MB single-threaded engine core is fetched lazily on the first
 * conversion (as blob URLs, so it works cross-origin on GitHub Pages) and
 * cached by the browser afterwards. Everything runs locally — no uploads.
 *
 * Formats are read from section[data-from] / section[data-to].
 */
(function () {
  'use strict';

  var FFMPEG_VERSION = '0.12.10';
  var CORE_VERSION   = '0.12.6';
  var FFMPEG_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@' + FFMPEG_VERSION + '/dist/umd';
  // The class worker is a module worker, so the core must be the ESM build
  // (the UMD core has no default export and importScripts is unavailable there)
  var CORE_BASE   = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@' + CORE_VERSION + '/dist/esm';

  var EXT = {
    MP3: 'mp3', WAV: 'wav', M4A: 'm4a', OGG: 'ogg',
    MP4: 'mp4', MOV: 'mov', AVI: 'avi', WEBM: 'webm',
    GIF: 'gif', PNG: 'png', JPG: 'jpg', JPEG: 'jpg',
    WEBP: 'webp', TIFF: 'tiff', BMP: 'bmp',
  };

  var MIME = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', ogg: 'audio/ogg',
    mp4: 'video/mp4', mov: 'video/quicktime', avi: 'video/x-msvideo', webm: 'video/webm',
    gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp',
    tiff: 'image/tiff', bmp: 'image/bmp',
  };

  // Encoder arguments per output format (input format rarely matters to ffmpeg)
  var OUT_ARGS = {
    // Audio — -vn drops any video stream (e.g. when extracting audio from MP4)
    mp3:  ['-vn', '-c:a', 'libmp3lame', '-q:a', '2'],
    wav:  ['-vn', '-c:a', 'pcm_s16le'],
    m4a:  ['-vn', '-c:a', 'aac', '-b:a', '192k'],
    ogg:  ['-vn', '-c:a', 'libvorbis', '-q:a', '5'],
    // Video — dimensions forced even for yuv420p; veryfast keeps wasm times sane
    mp4:  ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
           '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '128k', '-movflags', 'faststart'],
    mov:  ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
           '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-pix_fmt', 'yuv420p',
           '-c:a', 'aac', '-b:a', '128k'],
    webm: ['-c:v', 'libvpx', '-b:v', '1M', '-deadline', 'realtime', '-cpu-used', '5',
           '-c:a', 'libvorbis', '-q:a', '4'],
    avi:  ['-c:v', 'mpeg4', '-q:v', '5', '-c:a', 'libmp3lame', '-q:a', '4'],
    // Animated GIF — capped at 480px wide / 12 fps to keep sizes reasonable
    gif:  ['-vf', 'fps=12,scale=min(480\\,iw):-2:flags=lanczos'],
    // Still images (TIFF pairs the canvas API cannot handle)
    png:  [],
    jpg:  ['-q:v', '3'],
    webp: ['-q:v', '80'],
    tiff: [],
    bmp:  [],
  };

  var enginePromise = null;
  var logTail = [];

  function setButtonText(text) {
    var btn = document.getElementById('convertBtn');
    if (btn && btn.disabled) {
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>' + text;
    }
  }

  function loadEngine() {
    if (enginePromise) return enginePromise;
    if (!window.FFmpegWASM || !window.FFmpegUtil) {
      return Promise.reject(new Error('Conversion engine failed to load. Check your connection and reload the page.'));
    }
    var toBlobURL = window.FFmpegUtil.toBlobURL;
    var ffmpeg = new window.FFmpegWASM.FFmpeg();

    ffmpeg.on('log', function (e) {
      logTail.push(e.message);
      if (logTail.length > 30) logTail.shift();
    });
    ffmpeg.on('progress', function (e) {
      var pct = Math.round((e.progress || 0) * 100);
      if (pct > 0 && pct <= 100) setButtonText('Converting… ' + pct + '%');
    });

    setButtonText('Loading engine (~31 MB, first time only)…');
    enginePromise = Promise.all([
      toBlobURL(CORE_BASE + '/ffmpeg-core.js', 'text/javascript'),
      toBlobURL(CORE_BASE + '/ffmpeg-core.wasm', 'application/wasm'),
      toBlobURL(FFMPEG_BASE + '/814.ffmpeg.js', 'text/javascript'),
    ]).then(function (urls) {
      return ffmpeg.load({ coreURL: urls[0], wasmURL: urls[1], classWorkerURL: urls[2] });
    }).then(function () {
      return ffmpeg;
    }).catch(function (err) {
      enginePromise = null; // allow retry
      throw new Error('Could not load the conversion engine: ' + (err && err.message || err));
    });
    return enginePromise;
  }

  window.performConversion = async function (input) {
    var widget = document.querySelector('.section-converter');
    var FROM = (widget && widget.dataset.from || '').toUpperCase().replace('JPEG', 'JPG');
    var TO   = (widget && widget.dataset.to   || '').toUpperCase().replace('JPEG', 'JPG');

    var outExt = EXT[TO];
    var args   = OUT_ARGS[outExt];
    if (!outExt || !args) throw new Error('Unsupported output format: ' + TO);

    // Use the real file extension when available so ffmpeg picks the right demuxer
    var inExt = EXT[FROM] || 'bin';
    if (input && input.name) {
      var m = input.name.match(/\.([a-z0-9]+)$/i);
      if (m) inExt = m[1].toLowerCase();
    }
    var base = (input && input.name ? input.name.replace(/\.[^.]+$/, '') : 'converted') || 'converted';

    var ffmpeg = await loadEngine();
    var inFile  = 'input.' + inExt;
    var outFile = 'output.' + outExt;

    setButtonText('Converting…');
    logTail = [];
    var data = new Uint8Array(await input.arrayBuffer());
    await ffmpeg.writeFile(inFile, data);

    try {
      var code = await ffmpeg.exec(['-i', inFile].concat(args, ['-y', outFile]));
      if (code !== 0) {
        var hint = logTail.filter(function (l) { return /error|invalid|unsupported|could not/i.test(l); }).slice(-2).join(' ');
        throw new Error('FFmpeg could not convert this file.' + (hint ? ' ' + hint : ''));
      }
      var out = await ffmpeg.readFile(outFile);
      if (!out || !out.length) throw new Error('Conversion produced an empty file.');
      return {
        blob: new Blob([out.buffer], { type: MIME[outExt] || 'application/octet-stream' }),
        filename: base + '.' + outExt,
      };
    } finally {
      // Free MEMFS — ignore errors for files that were never created
      try { await ffmpeg.deleteFile(inFile); } catch (e) {}
      try { await ffmpeg.deleteFile(outFile); } catch (e) {}
    }
  };
})();
