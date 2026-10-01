async function preloadImage(src, priority = 'auto') {
  if (!src) return;

  return new Promise(resolve => {
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = priority;

    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);

    img.src = src;
  });
}

async function preloadImages(urls) {
  const list = (urls || []).filter(Boolean);
  if (!list.length) return;

  await Promise.all(
    list.map((url, index) =>
      preloadImage(url, index === 0 ? 'high' : 'auto')
    )
  );
}

async function loadSettings() {
  const [
    settingsResult,
    bannersResult,
    galleryResult
  ] = await Promise.all([
    sb.from('site_settings').select('*').eq('id', 1).maybeSingle(),
    sb.from('hero_banners').select('*').order('sort_order').order('id'),
    sb.from('gallery_images').select('*').order('sort_order').order('id')
  ]);

  const { data: s, error } = settingsResult;
  const { data: banners } = bannersResult;
  const { data: gallery } = galleryResult;

  if (error) console.error(error);

  const settings = s || {};

  settings.companyName =
    settings.company_name || 'AMALA PYROTECH';

  settings.logoUrl =
    mediaUrl(settings.logo_path) ||
    'https://via.placeholder.com/50';

  settings.announcement =
    settings.announcement ||
    'Welcome to Amala Pyrotech! Direct Sivakasi Factory Wholesale Crackers.';

  settings.whatsappNumber =
    settings.whatsapp_number || '+919344265054';

  settings.callNumber =
    settings.call_number || '7780942656';

  settings.instagramLink =
    settings.instagram_link ||
    'https://instagram.com/amalapyrotech';

  settings.youtubeLink =
    settings.youtube_link ||
    'https://youtube.com/@amalapyrotech';

  settings.heroImages =
    (banners || []).map(x => mediaUrl(x.storage_path)).filter(Boolean);

  settings.galleryImages =
    (gallery || []).map(x => mediaUrl(x.storage_path)).filter(Boolean);

  /*
   * PRELOAD LOGO + FIRST HERO FIRST
   * These are the most important images visible immediately.
   */
  await Promise.all([
    preloadImage(settings.logoUrl, 'high'),
    preloadImage(settings.heroImages[0], 'high')
  ]);

  document.getElementById('display-company-name').innerText =
    settings.companyName;

  document.getElementById('footer-company-name').innerText =
    settings.companyName;

  document.getElementById('trust-company-title').innerText =
    settings.companyName;

  document.getElementById('gallery-title-text').innerText =
    settings.companyName;

  document.getElementById('display-logo').src =
    settings.logoUrl;

  document.getElementById('trust-card-logo').src =
    settings.logoUrl;

  document.getElementById('footer-logo').src =
    settings.logoUrl;

  document.getElementById('display-announcement').innerText =
    settings.announcement;

  const cleanWa =
    settings.whatsappNumber.replace(/[^0-9]/g, '');

  document.getElementById('header-whatsapp-btn').href =
    `https://wa.me/${cleanWa}`;

  document.getElementById('header-call-btn').href =
    `tel:${settings.callNumber}`;

  document.getElementById('float-call-link').href =
    `tel:${settings.callNumber}`;

  document.getElementById('float-whatsapp-link').href =
    `https://wa.me/${cleanWa}`;

  document.getElementById('nav-whatsapp-link').href =
    `https://wa.me/${cleanWa}`;

  document.getElementById('nav-call-link').href =
    `tel:${settings.callNumber}`;

  document.getElementById('float-insta-link').href =
    settings.instagramLink;

  document.getElementById('float-youtube-link').href =
    settings.youtubeLink;

  document.getElementById('footer-phone-display').innerText =
    settings.whatsappNumber;

  document.getElementById('footer-call-display').innerText =
    settings.callNumber;

  /*
   * HERO SLIDER
   */
  const sliderContainer =
    document.getElementById('hero-slider-container');

  let slidesHTML = '';

  settings.heroImages.forEach((imgSrc, index) => {
    slidesHTML += `
      <div class="hero-slide ${index === 0 ? 'active' : ''}">
        <img
          src="${imgSrc}"
          alt="AMALA PYROTECH"
          loading="${index === 0 ? 'eager' : 'lazy'}"
          fetchpriority="${index === 0 ? 'high' : 'auto'}"
          decoding="async"
        >
      </div>
    `;
  });

  sliderContainer.innerHTML =
    slidesHTML +
    `
      <button class="slider-arrow prev"
        onclick="changeSlide(-1)">
        <i class="fas fa-chevron-left"></i>
      </button>

      <button class="slider-arrow next"
        onclick="changeSlide(1)">
        <i class="fas fa-chevron-right"></i>
      </button>
    `;

  /*
   * GALLERY
   */
  document.getElementById('dynamic-gallery-container').innerHTML =
    settings.galleryImages.map(img => `
      <img
        src="${img}"
        alt="AMALA PYROTECH"
        loading="lazy"
        decoding="async"
      >
    `).join('');

  /*
   * PRELOAD ALL REMAINING IMAGES IN BACKGROUND
   * This does not block the visible page.
   */
  setTimeout(() => {
    preloadImages([
      ...settings.heroImages.slice(1),
      ...settings.galleryImages
    ]);
  }, 0);
}

window.addEventListener('load', async () => {
  try {
    await loadSettings();
  } catch (e) {
    console.error(e);
    animateFirework();
  }
});
