async function loadAdminState(){
  // Phase 1: Fast Initial Load (Logo & Dashboard Metrics in parallel)
  try {
    const [settingRes, pendingRes, confirmedRes] = await Promise.all([
      sb.from('site_settings').select('logo_path, whatsapp_number, call_number, instagram_link, youtube_link').eq('id', 1).maybeSingle(),
      sb.from('orders').select('grand_total').eq('status', 'pending'),
      sb.from('orders').select('grand_total').eq('status', 'confirmed')
    ]);

    const s = settingRes.data;
    appState.logo = mediaUrl(s?.logo_path) || 'https://via.placeholder.com/150';
    appState.whatsapp = s?.whatsapp_number || '+919344265054';
    appState.contact = s?.call_number || '7780942656';
    appState.instagram = s?.instagram_link || 'https://instagram.com/amalapyrotech';
    appState.youtube = s?.youtube_link || 'https://youtube.com/@amalapyrotech';

    const logoImg = document.getElementById('headerLogo');
    if (logoImg) logoImg.src = appState.logo;

    const pendingOrdersList = pendingRes.data || [];
    const confirmedOrdersList = confirmedRes.data || [];

    // Temporary or partial counts/amounts for immediate dashboard rendering
    appState.pendingOrders = pendingOrdersList.map(o => ({ grandTotal: Number(o.grand_total) }));
    appState.confirmedOrders = confirmedOrdersList.map(o => ({ grandTotal: Number(o.grand_total) }));
    updateDashboardMetrics();
  } catch (e) {
    console.error('Initial load metrics/logo error:', e);
  }

  // Phase 2: Background Load (Non-blocking rest of the data)
  (async () => {
    try {
      const [bRes, gRes, cRes, pRes, cpRes, osRes] = await Promise.all([
        sb.from('hero_banners').select('*').order('sort_order').order('id').catch(() => ({ data: [] })),
        sb.from('gallery_images').select('*').order('sort_order').order('id').catch(() => ({ data: [] })),
        sb.from('categories').select('*').order('id').catch(() => ({ data: [] })),
        sb.from('products').select('*,categories(name)').order('id').catch(() => ({ data: [] })),
        sb.from('coupons').select('*').order('id').catch(() => ({ data: [] })),
        sb.from('orders').select('*').order('created_at', { ascending: false }).catch(() => ({ data: [] }))
      ]);

      const b = bRes.data || [];
      const g = gRes.data || [];
      const c = cRes.data || [];
      const p = pRes.data || [];
      const cp = cpRes.data || [];
      const os = osRes.data || [];

      const map = os.map(o => ({
          id: o.id,
          orderId: o.order_id,
          customer: o.customer_name,
          district: o.district,
          address: [o.address, o.town, o.district, o.state].filter(Boolean).join(', '),
          phone: o.mobile,
          pincode: o.pincode,
          state: o.state,
          town: o.town,
          status: o.status,
          total: Number(o.grand_total),
          mrpTotal: Number(o.total_mrp),
          savings: Number(o.savings),
          netTotal: Number(o.net_total),
          packing: o.packing_charges,
          grandTotal: Number(o.grand_total),
          invoiceSnapshot: o.invoice_snapshot,
          transportName: o.transport_name || '',
          transportMobile: o.transport_mobile || '',
          transportNumber: o.transport_number || '',
          items: [] // Loaded lazily on demand when viewing order details
      }));

      appState.heroBanners = b.map(x => ({ id: x.id, url: mediaUrl(x.storage_path), storage_path: x.storage_path }));
      appState.gallery = g.map(x => ({ id: x.id, url: mediaUrl(x.storage_path), storage_path: x.storage_path }));
      appState.categories = c;
      appState.products = p.map(x => ({ id: x.id, code: x.code, name: x.name, category: x.categories?.name || '', cat: x.categories?.name || '', pack: x.pack || '1 Pkt', mrp: Number(x.mrp), price: Number(x.price), image: mediaUrl(x.image_path), img: mediaUrl(x.image_path), category_id: x.category_id }));
      appState.coupons = cp;
      appState.pendingOrders = map.filter(o => o.status === 'pending');
      appState.confirmedOrders = map.filter(o => o.status === 'confirmed');
      appState.cancelledOrders = map.filter(o => o.status === 'cancelled');

      updateDashboardMetrics();
    } catch (bgError) {
      console.error('Background load error:', bgError);
    }
  })();
}

async function initApp(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session){ window.location.href='admin-login.html'; return; }
  try{ await loadAdminState(); }catch(e){ console.error(e); alert('Supabase connection failed. Check configuration and login.'); }
}
async function refreshAdmin(){ await loadAdminState(); }

function showPreviewFile(input,imgId){ const f=input.files?.[0]; if(f){ document.getElementById(imgId).src=URL.createObjectURL(f); } }
function previewLogoFile(event){ showPreviewFile(event.target,'logoPreviewImg'); }
async function saveLogoFile(){ const f=document.getElementById('logoFileInput').files?.[0]; if(!f)return alert('Please select an image file first.'); try{const path=await uploadMedia(f,'logo'); await sb.from('site_settings').upsert({id:1,logo_path:path,updated_at:new Date().toISOString()}); await refreshAdmin(); renderHomeManagement(document.getElementById('dynamicContentArea')); alert('Logo updated successfully.');}catch(e){console.error(e);alert('Logo upload failed.');} }
async function addBannerFile(){ const f=document.getElementById('bannerFileInput').files?.[0]; if(!f)return alert('Please select an image file to upload.'); try{const path=await uploadMedia(f,'banners'); const max=(appState.heroBanners||[]).reduce((m,x)=>Math.max(m,x.id||0),0); await sb.from('hero_banners').insert({storage_path:path,sort_order:max+1}); await refreshAdmin(); renderHomeManagement(document.getElementById('dynamicContentArea')); alert('Banner uploaded successfully.');}catch(e){console.error(e);alert('Banner upload failed.');} }
async function deleteBanner(id){ if(!confirm('Delete this banner?'))return; await sb.from('hero_banners').delete().eq('id',id); await refreshAdmin(); renderHomeManagement(document.getElementById('dynamicContentArea')); }
async function saveContactSettings(){ const row={id:1,whatsapp_number:document.getElementById('settingWhatsapp').value.trim(),call_number:document.getElementById('settingContact').value.trim(),instagram_link:document.getElementById('settingInsta').value.trim(),youtube_link:document.getElementById('settingYoutube').value.trim(),updated_at:new Date().toISOString()}; const {error}=await sb.from('site_settings').upsert(row); if(error)return alert(error.message); await refreshAdmin(); alert('Contact & Social settings updated centrally.'); }
async function addCategory(){ const name=document.getElementById('newCatName').value.trim(); if(!name)return; const {error}=await sb.from('categories').insert({name}); if(error)return alert(error.message); await refreshAdmin(); renderCatalogManagement(document.getElementById('dynamicContentArea')); }
async function deleteCategory(id){ if(!confirm('Delete this category?'))return; await sb.from('categories').delete().eq('id',id); await refreshAdmin(); renderCatalogManagement(document.getElementById('dynamicContentArea')); }
function openAddProductModal(){ showModal(`<div class="space-y-3 text-xs"><h3 class="font-bold text-sm text-[#263447]">Add New Product with Gallery Image</h3><input type="text" id="prodCode" placeholder="Product Code (e.g. OSC-003)" class="w-full border p-2 rounded"><input type="text" id="prodName" placeholder="Product Name" class="w-full border p-2 rounded"><input type="number" id="prodMrp" placeholder="MRP Price" class="w-full border p-2 rounded"><input type="number" id="prodPrice" placeholder="Selling Price" class="w-full border p-2 rounded"><input type="text" id="prodPack" placeholder="Pack (e.g. 1 Pkt)" value="1 Pkt" class="w-full border p-2 rounded"><select id="prodCategory" class="w-full border p-2 rounded">${appState.categories.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select><div><label class="block font-semibold text-[#70777D] mb-1">Upload Product Image from Device</label><input type="file" id="prodImgFile" accept="image/*" class="w-full border p-2 rounded bg-white"></div><div class="flex justify-end space-x-2 pt-2"><button onclick="closeModal()" class="px-3 py-1.5 bg-gray-200 rounded font-bold">Cancel</button><button onclick="saveNewProductFile()" class="px-3 py-1.5 bg-[#0B6B4F] text-white rounded font-bold">Save Product</button></div></div>`); }
async function saveNewProductFile(){ const code=document.getElementById('prodCode').value.trim(),name=document.getElementById('prodName').value.trim(),mrp=Number(document.getElementById('prodMrp').value||0),price=Number(document.getElementById('prodPrice').value||0),pack=document.getElementById('prodPack').value.trim()||'1 Pkt',category_id=Number(document.getElementById('prodCategory').value||0),f=document.getElementById('prodImgFile').files?.[0]; if(!code||!name||!price)return alert('Please enter product code, name and price.'); try{let image_path=null;if(f)image_path=await uploadMedia(f,'products');const {error}=await sb.from('products').insert({code,name,mrp,price,pack,category_id,image_path,active:true});if(error)throw error;closeModal();await refreshAdmin();renderCatalogManagement(document.getElementById('dynamicContentArea'));}catch(e){console.error(e);alert(e.message||'Product save failed.');} }
async function deleteProduct(id){ if(!confirm('Delete this product?'))return; await sb.from('products').update({active:false}).eq('id',id); await refreshAdmin(); renderCatalogManagement(document.getElementById('dynamicContentArea')); }
async function addNewCoupon(){const code=document.getElementById('couponCode').value.trim().toUpperCase(),discount=Number(document.getElementById('couponDiscount').value||0);if(!code||!discount)return;const {error}=await sb.from('coupons').insert({code,discount,type:'percent',active:true});if(error)return alert(error.message);await refreshAdmin();renderCouponManagement(document.getElementById('dynamicContentArea'));}
async function deleteCoupon(id){await sb.from('coupons').update({active:false}).eq('id',id);await refreshAdmin();renderCouponManagement(document.getElementById('dynamicContentArea'));}

async function viewOrderDetail(orderId,type){
  let order=(type==='pending'?appState.pendingOrders:type==='confirmed'?appState.confirmedOrders:appState.cancelledOrders).find(o=>o.id===orderId);
  if(!order)return;

  if(!order.items || order.items.length === 0){
    try {
      const { data: itemRows } = await sb.from('order_items').select('*').eq('order_id', orderId);
      order.items = (itemRows || []).map(i => ({
        productId: i.product_id,
        code: i.code,
        name: i.name,
        qty: i.qty,
        price: Number(i.price),
        amount: Number(i.amount),
        mrp: Number(i.mrp),
        pack: i.pack
      }));
    } catch(err) {
      console.error('Failed to fetch order items lazily:', err);
      order.items = [];
    }
  }
  
  let transportSection = '';
  if (type === 'confirmed') {
      transportSection = `
      <div class="mt-4 pt-3 border-t border-custom bg-[#EFFBF4] p-3.5 rounded-xl space-y-3">
          <div class="flex justify-between items-center">
              <span class="font-extrabold text-xs text-[#0B6B4F] uppercase tracking-wide flex items-center">
                  <i class="fa-solid fa-truck-fast mr-2"></i> Transport Details
              </span>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
              <div>
                  <label class="block font-semibold text-[#70777D] mb-1">Transport Name</label>
                  <input type="text" id="transportNameInput" value="${order.transportName || ''}" placeholder="e.g. ABC Transport" class="w-full border p-2 rounded-lg bg-white">
              </div>
              <div>
                  <label class="block font-semibold text-[#70777D] mb-1">Mobile Number</label>
                  <input type="text" id="transportMobileInput" value="${order.transportMobile || ''}" placeholder="e.g. 9876543210" class="w-full border p-2 rounded-lg bg-white">
              </div>
              <div>
                  <label class="block font-semibold text-[#70777D] mb-1">Transport / LR Number</label>
                  <input type="text" id="transportNumberInput" value="${order.transportNumber || ''}" placeholder="e.g. LR123456" class="w-full border p-2 rounded-lg bg-white">
              </div>
          </div>
          <div class="flex justify-end space-x-2 pt-1">
              <button onclick="clearTransportDetails(${order.id})" class="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-[#263447] rounded-lg font-bold text-xs transition">Clear</button>
              <button onclick="saveTransportDetails(${order.id}, '${type}')" class="px-4 py-1.5 bg-[#0B6B4F] hover:bg-[#064C3A] text-white rounded-lg font-bold text-xs transition shadow-sm">
                  ${(order.transportName || order.transportMobile || order.transportNumber) ? 'Update Transport Details' : 'Save Transport Details'}
              </button>
          </div>
      </div>`;
  }

  let html=`<div class="space-y-4">
      <div class="flex justify-between items-center border-b pb-2">
          <h3 class="font-extrabold text-[#263447] text-base">Order #${order.orderId||order.id} Details</h3>
          <button onclick="closeModal()" class="text-gray-500 font-bold text-xl">&times;</button>
      </div>
      <div class="text-xs space-y-1 text-[#263447] bg-[#F5F7F8] p-3 rounded-lg">
          <p><strong>Customer:</strong> ${order.customer}</p>
          <p><strong>District:</strong> ${order.district}</p>
          <p><strong>Address:</strong> ${order.address}</p>
          <p><strong>Contact:</strong> ${order.phone}</p>
      </div>
      <div class="border rounded-lg overflow-x-auto">
          <table class="w-full text-left text-xs whitespace-nowrap">
              <thead class="bg-[#EFFBF4] text-[#0B6B4F]">
                  <tr>
                      <th class="p-2">S.No</th>
                      <th class="p-2">Product Code</th>
                      <th class="p-2">Item Name</th>
                      <th class="p-2">Qty</th>
                      <th class="p-2">Price</th>
                      <th class="p-2">Amount</th>
                  </tr>
              </thead>
              <tbody class="divide-y">
                  ${order.items.map((i,n)=>`<tr><td class="p-2 font-bold">${n+1}</td><td class="p-2">${i.code}</td><td class="p-2 font-medium">${i.name}</td><td class="p-2">${i.qty}</td><td class="p-2">₹${i.price.toFixed(2)}</td><td class="p-2 font-semibold">₹${i.amount.toFixed(2)}</td></tr>`).join('')}
              </tbody>
          </table>
      </div>
      <div class="text-right font-extrabold text-sm text-[#263447] pt-1">Order Total: ₹${order.total.toFixed(2)}</div>
      ${transportSection}
      ${type==='pending'?`<div class="flex space-x-2 pt-3 border-t"><button onclick="confirmPendingOrder(${order.id})" class="flex-1 py-2 bg-[#0B6B4F] text-white rounded font-bold text-xs">Confirm Order</button><button onclick="promptCancelOrder(${order.id})" class="flex-1 py-2 bg-[#D9364F] text-white rounded font-bold text-xs">Cancel Order</button></div>`:type==='confirmed'?`<div class="pt-3 border-t"><button onclick="downloadInvoice(${order.id})" class="w-full py-2 bg-[#263447] text-white rounded font-bold text-xs"><i class="fa-solid fa-download"></i> Download / Print Invoice</button></div>`:`<p class="text-center text-xs text-red-500 font-medium italic">Cancelled Record (No Invoice Available)</p>`}
  </div>`;
  showModal(html);
}

async function saveTransportDetails(orderId, type) {
    let tName = document.getElementById('transportNameInput').value.trim();
    let tMobile = document.getElementById('transportMobileInput').value.trim();
    let tNumber = document.getElementById('transportNumberInput').value.trim();

    if (!tName || !tMobile || !tNumber) {
        return alert('Transport Name, Mobile Number, and Transport / LR Number are all required.');
    }

    try {
        const { error } = await sb
            .from('orders')
            .update({
                transport_name: tName,
                transport_mobile: tMobile,
                transport_number: tNumber
            })
            .eq('id', orderId);

        if (error) throw error;

        await refreshAdmin();
        viewOrderDetail(orderId, type);
        alert('Transport details saved successfully.');
    } catch (e) {
        console.error(e);
        alert(e.message || 'Failed to save transport details.');
    }
}

async function clearTransportDetails(orderId) {
    if (!confirm('Clear transport details for this order?')) return;

    try {
        const { error } = await sb
            .from('orders')
            .update({
                transport_name: null,
                transport_mobile: null,
                transport_number: null
            })
            .eq('id', orderId);

        if (error) throw error;

        await refreshAdmin();
        viewOrderDetail(orderId, 'confirmed');
        alert('Transport details cleared successfully.');
    } catch (e) {
        console.error(e);
        alert(e.message || 'Failed to clear transport details.');
    }
}

async function confirmPendingOrder(id){const {error}=await sb.from('orders').update({status:'confirmed',confirmed_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await refreshAdmin();closeModal();openView('confirmedOrdersView');alert('Order confirmed successfully.');}
async function executeCancelOrder(id){const {error}=await sb.from('orders').update({status:'cancelled',cancelled_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);await refreshAdmin();closeModal();openView('cancelledOrdersView');alert('Order cancelled successfully and moved to Cancelled Archive.');}
async function downloadInvoice(orderId){const order=[...appState.confirmedOrders,...appState.pendingOrders].find(o=>o.id===orderId);if(!order||!order.invoiceSnapshot)return alert('Immutable invoice snapshot not found.');await renderAdminInvoicePdf(order.invoiceSnapshot);}
async function renderAdminInvoicePdf(s){const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'mm',format:'a4'});let y=16;doc.setFont('helvetica','bold');doc.setFontSize(18);doc.setTextColor(169,0,90);doc.text(s.company_name,14,y);y+=7;doc.setFontSize(9);doc.setTextColor(70,70,70);doc.text(s.tagline,14,y);y+=5;doc.text(s.address,14,y);y+=5;doc.text(`WhatsApp: ${s.whatsapp} | Phone: ${s.phone}`,14,y);y+=9;doc.setDrawColor(169,0,90);doc.line(14,y,196,y);y+=8;doc.setFontSize(10);doc.setTextColor(40,40,40);doc.text('Customer Details:',14,y);doc.setFont('helvetica','normal');y+=5;doc.text(`Name: ${s.customer.name}`,14,y);doc.text(`Order ID: ${s.order_id}`,130,y);y+=5;doc.text(`Mobile: ${s.customer.mobile}`,14,y);doc.text(`Date: ${new Date(s.date).toLocaleDateString('en-IN')}`,130,y);y+=5;doc.text(`Address: ${s.customer.address}, ${s.customer.town}, ${s.customer.district}, ${s.customer.state} - ${s.customer.pincode}`,14,y,{maxWidth:180});y+=9;const body=s.items.map((i,n)=>[n+1,i.code,`${i.name} (${i.pack||''})`,`₹${Number(i.mrp).toFixed(2)}`,i.qty,`₹${Number(i.price).toFixed(2)}`,`₹${Number(i.amount).toFixed(2)}`]);doc.autoTable({startY:y,head:[['S.No','Code','Product Name','MRP','Qty','Offer Price','Subtotal']],body,theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[0,91,72],textColor:255}});y=doc.lastAutoTable.finalY+8;doc.autoTable({startY:y,body:[['Total MRP',`₹${Number(s.totals.mrp_total).toFixed(2)}`],['Special Savings',`- ₹${Number(s.totals.savings).toFixed(2)}`],['Product Net Total',`₹${Number(s.totals.net_total).toFixed(2)}`],['Packing Charges',s.totals.packing_display || (typeof s.totals.packing==='number'?`₹${s.totals.packing.toFixed(2)}`:s.totals.packing)],['Transport',s.totals.transport],['Grand Total',`₹${Number(s.totals.grand_total).toFixed(2)}`]],theme:'plain',tableWidth:80,margin:{left:116},styles:{fontSize:9,cellPadding:2}});y=doc.lastAutoTable.finalY+10;doc.setFontSize(8);doc.setTextColor(120,120,120);doc.text('Thank you for shopping with AMALA PYROTECH! Have a Safe and Happy Diwali.',14,y);doc.save(`${s.order_id}-invoice.pdf`);}

async function logoutAdmin(){await sb.auth.signOut();window.location.href='admin-login.html';}
function renderAdminCredentials(container){container.innerHTML=`<div class="bg-white p-6 rounded-xl shadow-sm border border-custom space-y-4 max-w-md mx-auto"><div class="flex justify-between items-center border-b pb-3"><h2 class="font-extrabold text-[#263447] text-base"><i class="fa-solid fa-key text-[#0B6B4F] mr-2"></i>Admin Security & Credentials</h2><button onclick="returnToDashboard()" class="text-xs bg-[#F5F7F8] px-3 py-1 rounded font-bold">Back</button></div><div class="space-y-3 text-xs"><div><label class="font-semibold text-[#70777D]">Current Username</label><input type="text" id="currUser" class="w-full border p-2 rounded mt-1"></div><div><label class="font-semibold text-[#70777D]">Current Password</label><input type="password" id="currPass" class="w-full border p-2 rounded mt-1"></div><hr class="my-2"><div><label class="font-semibold text-[#70777D]">New Username</label><input type="text" id="newUser" class="w-full border p-2 rounded mt-1"></div><div><label class="font-semibold text-[#70777D]">New Password</label><input type="password" id="newPass" class="w-full border p-2 rounded mt-1"></div><button onclick="updateAdminCredentials()" class="w-full py-2 bg-[#0B6B4F] text-white font-bold rounded mt-2">Update Credentials</button></div></div>`;}
async function updateAdminCredentials(){
  const currUser = document.getElementById('currUser').value.trim();
  const currPass = document.getElementById('currPass').value;
  const newUser = document.getElementById('newUser').value.trim();
  const newPass = document.getElementById('newPass').value;

  if(!currUser || !currPass){
    return alert('Please enter your current username and current password to verify your identity.');
  }

  if(!newUser && !newPass){
    return alert('Please enter a new username/email or new password to update.');
  }

  try {
    const { error: signInError } = await sb.auth.signInWithPassword({
      email: currUser,
      password: currPass
    });

    if(signInError){
      return alert('Current username or password is incorrect.');
    }

    const payload = {};
    if(newUser) payload.email = newUser;
    if(newPass) payload.password = newPass;

    if(Object.keys(payload).length > 0){
      const { error: updateError } = await sb.auth.updateUser(payload);
      if(updateError) throw updateError;
    }

    alert('Admin credentials updated successfully. If email confirmation is enabled, confirm the new email before the next login.');
    document.getElementById('currUser').value = '';
    document.getElementById('currPass').value = '';
    document.getElementById('newUser').value = '';
    document.getElementById('newPass').value = '';
  } catch(e) {
    console.error(e);
    alert(e.message || 'Failed to update credentials.');
  }
}
window.addEventListener('load', initApp);
async function renderCustomerManagement(container){
  const {data:customers,error}=await sb.from('customers').select('*').order('district').order('name');
  if(error)return container.innerHTML=`<div class="bg-white p-6 rounded-xl border border-custom"><p class="text-sm text-red-600">${error.message}</p></div>`;
  const districts={};(customers||[]).forEach(c=>{const d=c.district||'Unknown District';(districts[d] ||= []).push(c);});
  let html=`<div class="bg-white p-6 rounded-xl shadow-sm border border-custom space-y-6"><div class="flex justify-between items-center border-b pb-3"><h2 class="font-extrabold text-[#263447] text-lg"><i class="fa-solid fa-users text-[#0B6B4F] mr-2"></i>District-wise Customer Directory</h2><button onclick="returnToDashboard()" class="text-xs bg-[#F5F7F8] px-3 py-1 rounded font-bold">Back</button></div>`;
  if(!Object.keys(districts).length) html+=`<p class="text-sm text-[#70777D] text-center py-6">No customer checkout records available yet.</p>`;
  else for(const dist of Object.keys(districts)){html+=`<div class="border rounded-lg overflow-hidden"><div class="bg-[#EFFBF4] p-3 font-bold text-[#0B6B4F] text-sm">${dist} District</div><div class="divide-y p-3 space-y-2">`;districts[dist].forEach((c,i)=>{html+=`<div class="flex justify-between items-center text-xs pt-2"><span>${i+1}. <strong>${c.name}</strong></span><a href="https://wa.me/91${cleanPhone(c.mobile)}" target="_blank" class="px-3 py-1 bg-[#16A34A] text-white rounded font-bold flex items-center space-x-1"><i class="fa-brands fa-whatsapp"></i><span>${c.mobile}</span></a></div>`});html+=`</div></div>`;}
  html+=`</div>`;container.innerHTML=html;
}
