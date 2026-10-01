async function loadSettings() {
  const { data: s, error } = await sb.from('site_settings').select('*').eq('id', 1).maybeSingle();
  if (error) console.error(error);
  const { data: banners } = await sb.from('hero_banners').select('*').order('sort_order').order('id');
  const { data: gallery } = await sb.from('gallery_images').select('*').order('sort_order').order('id');
  const settings = s || {};
  settings.companyName = settings.company_name || 'AMALA PYROTECH';
  settings.logoUrl = mediaUrl(settings.logo_path) || 'https://via.placeholder.com/50';
  settings.announcement = settings.announcement || 'Welcome to Amala Pyrotech! Direct Sivakasi Factory Wholesale Crackers. Massive discounts up to 85% OFF!';
  settings.whatsappNumber = settings.whatsapp_number || '+919344265054';
  settings.callNumber = settings.call_number || '7780942656';
  settings.instagramLink = settings.instagram_link || 'https://instagram.com/amalapyrotech';
  settings.youtubeLink = settings.youtube_link || 'https://youtube.com/@amalapyrotech';
  settings.heroImages = (banners || []).map(x => mediaUrl(x.storage_path));
  settings.galleryImages = (gallery || []).map(x => mediaUrl(x.storage_path));

  document.getElementById('display-company-name').innerText = settings.companyName;
  document.getElementById('footer-company-name').innerText = settings.companyName;
  document.getElementById('trust-company-title').innerText = settings.companyName;
  document.getElementById('gallery-title-text').innerText = settings.companyName;
  document.getElementById('display-logo').src = settings.logoUrl;
  document.getElementById('trust-card-logo').src = settings.logoUrl;
  document.getElementById('footer-logo').src = settings.logoUrl;
  document.getElementById('display-announcement').innerText = settings.announcement;
  const cleanWa = settings.whatsappNumber.replace(/[^0-9]/g, '');
  document.getElementById('header-whatsapp-btn').href = `https://wa.me/${cleanWa}`;
  document.getElementById('header-call-btn').href = `tel:${settings.callNumber}`;
  document.getElementById('float-call-link').href = `tel:${settings.callNumber}`;
  document.getElementById('float-whatsapp-link').href = `https://wa.me/${cleanWa}`;
  document.getElementById('nav-whatsapp-link').href = `https://wa.me/${cleanWa}`;
  document.getElementById('nav-call-link').href = `tel:${settings.callNumber}`;
  document.getElementById('float-insta-link').href = settings.instagramLink;
  document.getElementById('float-youtube-link').href = settings.youtubeLink;
  document.getElementById('footer-phone-display').innerText = settings.whatsappNumber;
  document.getElementById('footer-call-display').innerText = settings.callNumber;

  const sliderContainer = document.getElementById('hero-slider-container');
  let slidesHTML = '';
  settings.heroImages.forEach((imgSrc, index) => { slidesHTML += `<div class="hero-slide ${index === 0 ? 'active' : ''}" style="background-image: url('${imgSrc}');"></div>`; });
  sliderContainer.innerHTML = slidesHTML + `<button class="slider-arrow prev" onclick="changeSlide(-1)"><i class="fas fa-chevron-left"></i></button><button class="slider-arrow next" onclick="changeSlide(1)"><i class="fas fa-chevron-right"></i></button>`;
  document.getElementById('dynamic-gallery-container').innerHTML = settings.galleryImages.map(img => `<div class="dynamic-gallery-item"><img src="${img}" alt="Fireworks Gallery"></div>`).join('');
}
window.addEventListener('load', async () => { try { await loadSettings(); } catch(e) { console.error(e); } animateFireworks(); });
