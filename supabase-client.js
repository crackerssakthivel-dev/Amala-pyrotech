(function () {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;

  if (
    !url ||
    !key ||
    url.includes('YOUR-PROJECT') ||
    key.includes('YOUR_SUPABASE')
  ) {
    console.warn('Supabase is not configured. Edit supabase-config.js.');
  }

  window.sb = window.supabase.createClient(url, key);

  window.MEDIA_BUCKET = 'site-media';

  window.money = n => `₹${Number(n || 0).toFixed(2)}`;

  window.cleanPhone = p =>
    String(p || '').replace(/\D/g, '').slice(-10);

  window.mediaUrl = path => {
    if (!path) return '';

    if (/^https?:\/\//i.test(path)) {
      return path;
    }

    return window.sb
      .storage
      .from(window.MEDIA_BUCKET)
      .getPublicUrl(path)
      .data
      .publicUrl;
  };


  /*
   * ---------------------------------------------------------
   * IMAGE OPTIMIZER
   * ---------------------------------------------------------
   * Large images are automatically resized and converted to
   * WebP before uploading.
   *
   * This keeps the website visually the same but makes images
   * load much faster on mobile.
   */

  async function optimizeImage(file, folder) {

    if (!file || !file.type || !file.type.startsWith('image/')) {
      return file;
    }

    /*
     * SVG / GIF / already small files are kept as-is.
     */
    if (
      file.type === 'image/svg+xml' ||
      file.type === 'image/gif'
    ) {
      return file;
    }

    /*
     * If the image is already reasonably small,
     * don't unnecessarily process it.
     */
    if (file.size <= 300 * 1024) {
      return file;
    }

    let bitmap;

    try {
      bitmap = await createImageBitmap(file);
    } catch (e) {
      return file;
    }

    let maxWidth = 1400;
    let maxHeight = 1400;

    /*
     * LOGO
     */
    if (folder === 'logo') {
      maxWidth = 512;
      maxHeight = 512;
    }

    /*
     * HERO BANNER
     */
    if (folder === 'banners') {
      maxWidth = 1600;
      maxHeight = 1000;
    }

    /*
     * GALLERY
     */
    if (folder === 'gallery') {
      maxWidth = 1400;
      maxHeight = 1400;
    }

    /*
     * PRODUCT IMAGES
     */
    if (folder === 'products') {
      maxWidth = 900;
      maxHeight = 900;
    }

    let width = bitmap.width;
    let height = bitmap.height;

    const scale = Math.min(
      1,
      maxWidth / width,
      maxHeight / height
    );

    width = Math.round(width * scale);
    height = Math.round(height * scale);

    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', {
      alpha: true
    });

    ctx.drawImage(
      bitmap,
      0,
      0,
      width,
      height
    );

    bitmap.close();

    const blob = await new Promise(resolve => {
      canvas.toBlob(
        resolve,
        'image/webp',
        0.82
      );
    });

    /*
     * If browser cannot create WebP,
     * keep original file.
     */
    if (!blob) {
      return file;
    }

    /*
     * If WebP somehow becomes larger than original,
     * keep the original.
     */
    if (blob.size >= file.size) {
      return file;
    }

    const newName =
      (file.name || 'image')
        .replace(/\.[^/.]+$/, '') +
      '.webp';

    return new File(
      [blob],
      newName,
      {
        type: 'image/webp',
        lastModified: Date.now()
      }
    );
  }


  /*
   * ---------------------------------------------------------
   * SUPABASE STORAGE UPLOAD
   * ---------------------------------------------------------
   */

  window.uploadMedia = async (file, folder) => {

    if (!file) {
      throw new Error('No file selected');
    }

    /*
     * Automatically optimize the image before upload.
     */
    const optimizedFile =
      await optimizeImage(file, folder);

    const ext =
      (optimizedFile.name.split('.').pop() || 'bin')
        .toLowerCase();

    const path =
      `${folder}/${crypto.randomUUID()}.${ext}`;

    /*
     * One year browser/CDN cache.
     * New uploads always receive a new UUID,
     * so old cached images will never conflict.
     */
    const { error } =
      await window.sb
        .storage
        .from(window.MEDIA_BUCKET)
        .upload(
          path,
          optimizedFile,
          {
            upsert: false,

            contentType:
              optimizedFile.type ||
              'application/octet-stream',

            cacheControl: '31536000'
          }
        );

    if (error) {
      throw error;
    }

    return path;
  };

})();
