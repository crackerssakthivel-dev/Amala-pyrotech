function preloadImage(src, priority = 'auto') {
  if (!src) return Promise.resolve(false);

  return new Promise(resolve => {
    const img = new Image();

    try {
      img.decoding = 'async';
      img.fetchPriority = priority;
    } catch (e) {}

    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);

    img.src = src;
  });
}

function preloadImages(urls) {
  const list = (urls || []).filter(Boolean);

  return Promise.all(
    list.map((url, index) =>
      preloadImage(url, index === 0 ? 'high' : 'auto')
    )
  );
}

async function loadAmalaHome() {
  try {
    /*
     * LOAD SETTINGS + HERO IMAGES FIRST
     * Gallery must NOT block Logo or Hero.
     */
    const [settingsResult, bannersResult] =
      await Promise.all([
        sb
          .from('site_settings')
          .select('*')
          .eq('id', 1)
          .maybeSingle(),

        sb
          .from('hero_banners')
          .select('*')
          .order('sort_order')
          .order('id')
      ]);

    if (settingsResult.error) {
      console.error(
        'SITE SETTINGS ERROR:',
        settingsResult.error
      );
    }

    if (bannersResult.error) {
      console.error(
        'HERO BANNERS ERROR:',
        bannersResult.error
      );
    }

    const settings = settingsResult.data || {};
    const banners = bannersResult.data || [];

    /*
     * BASIC SETTINGS
     */
    const companyName =
      settings.company_name || 'AMALA PYROTECH';

    const logoUrl =
      mediaUrl(settings.logo_path) || '';

    const announcement =
      settings.announcement ||
      'Welcome to Amala Pyrotech! Direct Sivakasi Factory Wholesale Crackers.';

    const whatsappNumber =
      settings.whatsapp_number || '+919344265054';

    const callNumber =
      settings.call_number || '7780942656';

    const instagramLink =
      settings.instagram_link ||
      'https://instagram.com/amalapyrotech';

    const youtubeLink =
      settings.youtube_link ||
      'https://youtube.com/@amalapyrotech';

    /*
     * REAL SUPABASE HERO IMAGES
     */
    const heroImages = banners
      .map(item => mediaUrl(item.storage_path))
      .filter(Boolean);

    /*
     * PRELOAD FIRST HERO IMAGE
     */
    if (heroImages.length > 0) {
      preloadImage(heroImages[0], 'high');
    }

    /*
     * SET COMPANY TEXT
     */
    const companyElements = [
      'display-company-name',
      'footer-company-name',
      'trust-company-title',
      'gallery-title-text'
    ];

    companyElements.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerText = companyName;
    });

    /*
     * SET LOGO
     * Header logo is embedded directly in HTML.
     * Only Trust Card and Footer use Supabase logo.
     */
    if (logoUrl) {
      const logoIds = [
        'trust-card-logo',
        'footer-logo'
      ];

      logoIds.forEach(id => {
        const el = document.getElementById(id);

        if (el) {
          el.src = logoUrl;
          el.removeAttribute('data-src');

          try {
            el.fetchPriority = 'high';
            el.loading = 'eager';
            el.decoding = 'async';
          } catch (e) {}

          el.onload = () => {
            el.style.visibility = 'visible';
            el.style.opacity = '1';
          };
        }
      });
    }

    /*
     * ANNOUNCEMENT
     */
    const announcementEl =
      document.getElementById('display-announcement');

    if (announcementEl) {
      announcementEl.innerText = announcement;
    }

    /*
     * CONTACT LINKS
     */
    const cleanWa =
      String(whatsappNumber).replace(/[^0-9]/g, '');

    const links = {
      'header-whatsapp-btn':
        `https://wa.me/${cleanWa}`,

      'header-call-btn':
        `tel:${callNumber}`,

      'float-call-link':
        `tel:${callNumber}`,

      'float-whatsapp-link':
        `https://wa.me/${cleanWa}`,

      'nav-whatsapp-link':
        `https://wa.me/${cleanWa}`,

      'nav-call-link':
        `tel:${callNumber}`,

      'float-insta-link':
        instagramLink,

      'float-youtube-link':
        youtubeLink
    };

    Object.keys(links).forEach(id => {
      const el = document.getElementById(id);

      if (el) {
        el.href = links[id];
      }
    });

    /*
     * FOOTER CONTACT
     */
    const phoneDisplay =
      document.getElementById('footer-phone-display');

    if (phoneDisplay) {
      phoneDisplay.innerText = whatsappNumber;
    }

    const callDisplay =
      document.getElementById('footer-call-display');

    if (callDisplay) {
      callDisplay.innerText = callNumber;
    }

    /*
     * HERO SLIDER
     */
    const sliderContainer =
      document.getElementById('hero-slider-container');

    if (sliderContainer && heroImages.length > 0) {

      let slidesHTML = '';

      heroImages.forEach((imgSrc, index) => {

        slidesHTML += `
          <div
            class="hero-slide ${index === 0 ? 'active' : ''}"
            style="background-image: url('${imgSrc}');"
          ></div>
        `;

      });

      const arrowsHTML = `
        <button
          class="slider-arrow prev"
          onclick="changeSlide(-1)"
        >
          <i class="fas fa-chevron-left"></i>
        </button>

        <button
          class="slider-arrow next"
          onclick="changeSlide(1)"
        >
          <i class="fas fa-chevron-right"></i>
        </button>
      `;

      sliderContainer.innerHTML =
        slidesHTML + arrowsHTML;

    } else {

      console.warn(
        'No Hero Banner found in Supabase.'
      );

    }

    /*
     * PRELOAD CATALOG DATA IN BACKGROUND
     * Catalog should be ready before customer clicks it.
     */
    setTimeout(async () => {

      try {

        const { data: products, error } =
          await sb
            .from('products')
            .select('id,code,name,pack,mrp,price,image_path,category_id,categories(name,offer_percent)')
            .eq('active', true)
            .order('id');

        if (error) {
          console.error(
            'CATALOG PRELOAD ERROR:',
            error
          );
          return;
        }

        sessionStorage.setItem(
          'amala_catalog_cache',
          JSON.stringify({
            settings: null,
            banners: [],
            products: products || [],
            savedAt: Date.now()
          })
        );

      } catch (error) {

        console.error(
          'CATALOG PRELOAD FAILED:',
          error
        );

      }

    }, 0);

    /*
     * LOAD GALLERY SEPARATELY.
     * Gallery must NOT block Logo or Hero.
     */
    setTimeout(async () => {

      try {

        const { data: gallery, error } =
          await sb
            .from('gallery_images')
            .select('*')
            .order('sort_order')
            .order('id');

        if (error) {
          console.error(
            'GALLERY ERROR:',
            error
          );
          return;
        }

        const galleryImages = (gallery || [])
          .map(item => mediaUrl(item.storage_path))
          .filter(Boolean);

        /*
         * GALLERY
         */
        const galleryContainer =
          document.getElementById(
            'dynamic-gallery-container'
          );

        if (
          galleryContainer &&
          galleryImages.length > 0
        ) {

          galleryContainer.innerHTML =
            galleryImages
              .map(img => `
                <div class="dynamic-gallery-item">
                  <img
                    src="${img}"
                    alt="Fireworks Gallery"
                    loading="eager"
                    decoding="async"
                  >
                </div>
              `)
              .join('');

        }

        /*
         * BACKGROUND PRELOAD
         */
        preloadImages([
          ...heroImages,
          ...galleryImages
        ]);

      } catch (error) {

        console.error(
          'GALLERY LOAD ERROR:',
          error
        );

      }

    }, 0);

  } catch (error) {

    console.error(
      'AMALA PYROTECH HOME LOAD ERROR:',
      error
    );

  }

  /*
   * Keep existing fireworks animation.
   */
  if (typeof animateFireworks === 'function') {
    animateFireworks();
  }
}


/*
 * START AS SOON AS HTML IS READY.
 * Do NOT wait for window load.
 */
if (document.readyState === 'loading') {

  document.addEventListener(
    'DOMContentLoaded',
    () => {
      loadAmalaHome();
    },
    { once: true }
  );

} else {

  loadAmalaHome();

}
