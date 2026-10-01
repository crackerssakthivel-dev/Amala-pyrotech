async function loadCatalogBackend() {
  const { data, error } = await sb.from('products').select('id,code,name,pack,mrp,price,image_path,category_id,categories(name,offer_percent)').eq('active', true).order('id');
  if (error) throw error;

  productsData = (data || []).map(p => {
    const mrp = Number(p.mrp);
    const price = Number(p.price);

    // Discount is calculated ONLY from MRP and Net Rate.
    // Net Rate (price) is never changed.
    let discountPercent = 0;

    if (mrp > 0 && price < mrp) {
      discountPercent = Math.round(((mrp - price) / mrp) * 10000) / 100;
    }

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      cat: p.categories?.name || 'Uncategorized',
      offerPercent: discountPercent,
      pack: p.pack || '1 Pkt',
      mrp: Number.isFinite(mrp) ? mrp : 0,
      price: Number.isFinite(price) ? price : 0,
      img: mediaUrl(p.image_path) || 'https://via.placeholder.com/200'
    };
  });

  const cats = [...new Set(productsData.map(p => p.cat))];
  const chips = document.getElementById('categoryChipsContainer');

  if (chips) {
    chips.innerHTML =
      `<div class="cat-chip active" onclick="filterCategory('All')">All Products</div>` +
      cats.map(c =>
        `<div class="cat-chip" onclick="filterCategory('${String(c).replace(/'/g, "\\'")}')">${c}</div>`
      ).join('');
  }
}


async function applyCoupon() {
  const code = document.getElementById('couponCode').value.trim().toUpperCase();

  if (!code) return alert('Please enter a coupon code.');

  const { data, error } = await sb
    .from('coupons')
    .select('*')
    .eq('code', code)
    .eq('active', true)
    .maybeSingle();

  if (error || !data) {
    couponDiscount = 0;
    updateAllCalculations();
    return alert('Invalid coupon code.');
  }

  let base = 0;

  for (const id in cart) {
    const p = productsData.find(x => x.id == id);

    if (p) {
      base += Number(cart[id]) * p.price;
    }
  }

  couponDiscount =
    data.type === 'percent'
      ? base * Number(data.discount) / 100
      : Number(data.discount);

  alert('Coupon applied successfully!');
  updateAllCalculations();
}


function buildInvoiceSnapshot(o, items) {
  return {
    company_name: 'AMALA PYROTECH',
    tagline: 'Direct Sivakasi Factory Wholesale Crackers',
    address: 'TNC Alangulam Main Road, Kundayiruppu, Sivakasi, Tamil Nadu - 626131',
    whatsapp: '+91 9344265054',
    phone: '7780942656',

    customer: {
      name: o.name,
      mobile: o.mobile,
      address: o.address,
      town: o.town,
      district: o.district,
      state: o.state,
      pincode: o.pincode
    },

    order_id: o.orderId,
    date: new Date().toISOString(),

    items,

    totals: {
      mrp_total: Number(o.mrpTotal || 0),
      savings: Number(
        String(o.savings || 0).replace(/[^0-9.-]/g, '')
      ),
      net_total: Number(o.netTotal || 0),
      packing: o.packing,

      packing_display:
        Number(o.packing) === 0
          ? '₹0.00 (100% FREE 🎉)'
          : `₹${Number(o.packing).toFixed(2)} (3%)`,

      transport: 'To-Pay at Lorry Hub',
      grand_total: Number(o.grandTotal || 0)
    }
  };
}


async function submitFinalOrder() {
  const name =
    document.getElementById('custName').value.trim();

  const mobile =
    document.getElementById('custMobile').value.trim();

  const pincode =
    document.getElementById('custPincode').value.trim();

  const address =
    document.getElementById('custAddress').value.trim();

  const userAns =
    parseInt(document.getElementById('mathAnswer').value.trim());

  if (!name || !mobile || !pincode || !address) {
    return alert(
      'Please fill out all required customer information fields!'
    );
  }

  if (userAns !== mathAns) {
    return alert(
      'Incorrect security verification math answer!'
    );
  }

  if (Object.keys(cart).length === 0) {
    return alert('Please select at least one product.');
  }

  const cleanMobile = cleanPhone(mobile);

  if (cleanMobile.length !== 10) {
    return alert(
      'Please enter a valid 10-digit WhatsApp number.'
    );
  }

  const orderId =
    'APT-' +
    new Date().getFullYear() +
    '-' +
    Date.now().toString().slice(-6);

  let mrp = 0;
  let net = 0;
  let items = [];

  for (const id in cart) {
    const p = productsData.find(x => x.id == id);

    if (!p) continue;

    const qty = Number(cart[id]);

    // Net Rate / Selling Price remains EXACTLY as stored.
    const amount = qty * p.price;

    // Products without MRP are not added to MRP total.
    if (Number(p.mrp) > 0) {
      mrp += qty * p.mrp;
    }

    net += amount;

    items.push({
      product_id: p.id,
      code: p.code,
      name: p.name,
      pack: p.pack,
      mrp: p.mrp,
      price: p.price,
      qty,
      amount
    });
  }

  const savings = Math.max(0, mrp - net);

  const packing =
    net >= 5000
      ? 0
      : net * 0.03;

  const grand =
    Math.max(
      0,
      net - couponDiscount + packing
    );

  const o = {
    orderId,
    name,
    mobile: cleanMobile,
    pincode,

    state:
      document.getElementById('custState').value,

    district:
      document.getElementById('custDistrict').value,

    town:
      document.getElementById('custTown').value,

    address,

    mrpTotal: mrp,
    savings,
    netTotal: net,
    couponDiscount,
    packing: packing,
    grandTotal: grand
  };

  const snapshot =
    buildInvoiceSnapshot(o, items);

  const payload = {
    order_id: orderId,
    name,
    mobile: cleanMobile,
    pincode: o.pincode,
    state: o.state,
    district: o.district,
    town: o.town,
    address: o.address,

    total_mrp: mrp,
    savings,
    net_total: net,
    coupon_discount: couponDiscount,
    packing_charges: packing,
    grand_total: grand,

    transport: 'To-Pay at Lorry Hub',

    invoice_snapshot: snapshot,

    items
  };

  const { error } =
    await sb.rpc(
      'create_checkout_order',
      {
        p_payload: payload
      }
    );

  if (error) {
    console.error(error);

    return alert(
      'Order could not be saved. Please try again.'
    );
  }

  lastSubmittedOrder = {
    ...o,
    items: snapshot.items,
    invoiceSnapshot: snapshot
  };

  document.getElementById(
    'modalCustGreeting'
  ).innerText =
    `Congratulations ${name}!`;

  document.getElementById(
    'modalOrderId'
  ).innerText = orderId;

  document.getElementById(
    'successModal'
  ).style.display = 'flex';
}


async function downloadInvoiceBill() {
  if (!lastSubmittedOrder) return;

  const snapshot =
    lastSubmittedOrder.invoiceSnapshot ||
    lastSubmittedOrder.invoice_snapshot;

  if (!snapshot) {
    return alert(
      'Invoice snapshot not available.'
    );
  }

  await renderInvoicePdf(snapshot);
}


async function renderInvoicePdf(s) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 16;

  // Clean PDF amount format.
  // Using Rs. avoids broken ₹ glyphs in jsPDF built-in fonts.
  const pdfMoney = (value) => {
    const n = Number(value || 0);
    return n.toFixed(2);
};

  // =========================
  // COMPANY HEADER
  // =========================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(169, 0, 90);
  doc.text(String(s.company_name || 'AMALA PYROTECH'), 105, y, {
    align: 'center'
  });

  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(70, 70, 70);

  doc.text(String(s.tagline || ''), 105, y, {
    align: 'center'
  });

  y += 5;

  doc.text(String(s.address || ''), 105, y, {
    align: 'center'
  });

  y += 5;

  doc.text(
    `WhatsApp: ${s.whatsapp || ''} | Phone: ${s.phone || ''}`,
    105,
    y,
    { align: 'center' }
  );

  y += 8;

  // Pink separator
  doc.setDrawColor(169, 0, 90);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);

  y += 8;

  // =========================
  // CUSTOMER / ORDER DETAILS
  // =========================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);

  doc.text('Customer Details:', left, y);
  doc.text('Order Invoice', 130, y);

  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  doc.text(`Name: ${s.customer?.name || ''}`, left, y);
  doc.text(`Order ID: ${s.order_id || ''}`, 130, y);

  y += 5;

  doc.text(`Mobile: ${s.customer?.mobile || ''}`, left, y);

  const invoiceDate = s.date
    ? new Date(s.date).toLocaleDateString('en-IN')
    : '';

  doc.text(`Date: ${invoiceDate}`, 130, y);

  y += 5;

  const customerAddress =
    `${s.customer?.address || ''}, ` +
    `${s.customer?.town || ''}, ` +
    `${s.customer?.district || ''}, ` +
    `${s.customer?.state || ''} - ` +
    `${s.customer?.pincode || ''}`;

  doc.text(`Address: ${customerAddress}`, left, y, {
    maxWidth: 180
  });

  y += 9;

  // =========================
  // PRODUCT TABLE
  // =========================
  const head = [[
    'S.No',
    'Code',
    'Product Name',
    'MRP',
    'Qty',
    'Offer Price',
    'Subtotal'
  ]];

  const body = (s.items || []).map((i, n) => [
    String(n + 1),
    String(i.code || ''),
    `${i.name || ''}${i.pack ? ` (${i.pack})` : ''}`,
    Number(i.mrp) > 0 ? pdfMoney(i.mrp) : '',
    String(i.qty || 0),
    pdfMoney(i.price),
    pdfMoney(i.amount)
  ]);

  doc.autoTable({
    startY: y,
    head,
    body,
    theme: 'grid',

    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 2,
      textColor: [45, 45, 45],
      lineColor: [210, 210, 210],
      lineWidth: 0.25,
      valign: 'middle'
    },

    headStyles: {
      fillColor: [0, 91, 72],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle'
    },

    bodyStyles: {
      fillColor: [255, 255, 255]
    },

    columnStyles: {
      0: {
        cellWidth: 10,
        halign: 'center'
      },

      1: {
        cellWidth: 20,
        halign: 'center'
      },

      2: {
        cellWidth: 66,
        halign: 'left'
      },

      3: {
        cellWidth: 22,
        halign: 'right',
        fontStyle: 'bold'
      },

      4: {
        cellWidth: 12,
        halign: 'center',
        fontStyle: 'bold'
      },

      5: {
        cellWidth: 27,
        halign: 'right',
        fontStyle: 'bold'
      },

      6: {
        cellWidth: 29,
        halign: 'right',
        fontStyle: 'bold'
      }
    },

    margin: {
      left: 14,
      right: 14
    }
  });

  y = doc.lastAutoTable.finalY + 8;

  // =========================
  // TOTALS
  // =========================
  const packingText =
    s.totals?.packing_display ||
    (
      typeof s.totals?.packing === 'number'
        ? pdfMoney(s.totals.packing)
        : String(s.totals?.packing || '')
    );

  const rows = [
    [
      'Total MRP',
      pdfMoney(s.totals?.mrp_total)
    ],
    [
      'Special Savings',
      `- ${pdfMoney(s.totals?.savings)}`
    ],
    [
      'Product Net Total',
      pdfMoney(s.totals?.net_total)
    ],
    [
      'Packing Charges',
      packingText
    ],
    [
      'Transport',
      String(s.totals?.transport || '')
    ],
    [
      'Grand Total',
      pdfMoney(s.totals?.grand_total)
    ]
  ];

  doc.autoTable({
    startY: y,
    body: rows,
    theme: 'plain',
    tableWidth: 80,

    margin: {
      left: 116
    },

    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2,
      textColor: [45, 45, 45],
      valign: 'middle'
    },

    columnStyles: {
      0: {
        cellWidth: 40,
        fontStyle: 'bold',
        halign: 'left'
      },

      1: {
        cellWidth: 40,
        fontStyle: 'bold',
        halign: 'right'
      }
    },

    didParseCell: function (data) {
      if (data.section !== 'body') return;

      // Special Savings - exact website green
      if (data.row.index === 1) {
        data.cell.styles.textColor = [39, 174, 96];
      }

      // Transport - exact website blue
      if (data.row.index === 4) {
        data.cell.styles.textColor = [22, 118, 210];
      }

      // Grand Total - exact website --discount-red = #D9364F
      if (data.row.index === 5) {
        data.cell.styles.fillColor = [217, 54, 79];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.cellPadding = 3;
      }
    }
  });

  y = doc.lastAutoTable.finalY + 10;

  // =========================
  // FOOTER
  // =========================
  doc.setDrawColor(169, 0, 90);
  doc.setLineWidth(0.4);
  doc.line(left, y, right, y);

  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);

  doc.text(
    'Thank you for shopping with AMALA PYROTECH! Have a Safe and Happy Diwali.',
    105,
    y,
    { align: 'center' }
  );

  // =========================
  // DOWNLOAD
  // =========================
  doc.save(`${s.order_id}-invoice.pdf`);
}


window.addEventListener(
  'load',
  async () => {
    try {
      await loadCatalogBackend();

      generateMath();

      renderCatalog();

    } catch (e) {
      console.error(e);

      alert(
        'Catalog backend connection failed. Check supabase-config.js.'
      );
    }
  }
);
