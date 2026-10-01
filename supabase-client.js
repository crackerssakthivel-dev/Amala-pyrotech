(function () {
  const url = window.SUPABASE_URL;
  const key = window.SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('YOUR-PROJECT') || key.includes('YOUR_SUPABASE')) {
    console.warn('Supabase is not configured. Edit supabase-config.js.');
  }
  window.sb = window.supabase.createClient(url, key);
  window.MEDIA_BUCKET = 'site-media';
  window.money = n => `₹${Number(n || 0).toFixed(2)}`;
  window.cleanPhone = p => String(p || '').replace(/\D/g, '').slice(-10);
  window.mediaUrl = path => {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    return window.sb.storage.from(window.MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  };
  window.uploadMedia = async (file, folder) => {
    if (!file) throw new Error('No file selected');
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await window.sb.storage.from(window.MEDIA_BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
  };
})();
