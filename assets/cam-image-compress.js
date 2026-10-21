/* CAM Sports · Compresión de fotos antes de subirlas (21 oct 2026)
 *
 * Las fotos se sirven desde Supabase Storage, cuyo plan gratuito tiene una
 * cuota mensual de descarga. Una foto de móvil o una captura PNG de 1,5–3 MB
 * se convierte aquí, en el navegador del editor, en un JPEG de ~150–350 KB
 * (lado mayor ≤ 1600 px, calidad 0,82), visualmente igual en la web.
 *
 * - Imágenes con transparencia (logos, PNG recortados): se conservan como PNG
 *   (solo se reducen si son enormes), para no rellenar el fondo.
 * - Si la conversión no ahorra al menos un 10 %, o el navegador no puede
 *   decodificar la imagen, se sube el archivo original sin cambios.
 * - Se mantiene JPEG (no WebP) porque las redes sociales de CAM Sports
 *   solo aceptan JPG/PNG para las publicaciones automáticas.
 */
(function () {
  'use strict';
  var MAX_SIDE = 1600;
  var QUALITY = 0.82;
  var LIGHT_ENOUGH = 300 * 1024;
  var TYPES = { 'image/jpeg': 1, 'image/png': 1, 'image/webp': 1 };

  function loadImage(file) {
    if (typeof createImageBitmap === 'function') {
      return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () {
        return createImageBitmap(file);
      }).catch(function () { return loadWithElement(file); });
    }
    return loadWithElement(file);
  }

  function loadWithElement(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  function hasTransparency(ctx, w, h) {
    try {
      var data = ctx.getImageData(0, 0, w, h).data;
      var step = 4 * Math.max(1, Math.floor((w * h) / 40000));
      for (var i = 3; i < data.length; i += step) if (data[i] < 250) return true;
      return false;
    } catch (e) { return true; }
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) {
      try { canvas.toBlob(function (b) { resolve(b); }, type, quality); } catch (e) { resolve(null); }
    });
  }

  function renamed(name, ext) {
    var base = String(name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
    return base + ext;
  }

  async function compress(file, options) {
    if (!file || !TYPES[file.type]) return file;
    var maxSide = (options && options.maxSide) || MAX_SIDE;
    var img;
    try { img = await loadImage(file); } catch (e) { return file; }
    var w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
    if (!w0 || !h0) return file;
    var scale = Math.min(1, maxSide / Math.max(w0, h0));
    if (scale === 1 && file.size <= LIGHT_ENOUGH) return file;
    var w = Math.max(1, Math.round(w0 * scale)), h = Math.max(1, Math.round(h0 * scale));

    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    if (img.close) try { img.close(); } catch (e) { /* ignore */ }

    var transparent = file.type !== 'image/jpeg' && hasTransparency(ctx, w, h);
    var blob, type, ext;
    if (transparent) {
      if (scale === 1) return file;
      blob = await toBlob(canvas, 'image/png'); type = 'image/png'; ext = '.png';
    } else {
      // JPEG sin canal alfa: fondo blanco por si quedara algún píxel semitransparente.
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      blob = await toBlob(canvas, 'image/jpeg', QUALITY); type = 'image/jpeg'; ext = '.jpg';
    }
    if (!blob || blob.type !== type || blob.size > file.size * 0.9) return file;
    try {
      return new File([blob], renamed(file.name, ext), { type: type, lastModified: Date.now() });
    } catch (e) {
      blob.name = renamed(file.name, ext);
      return blob;
    }
  }

  window.camCompressImage = compress;
})();
