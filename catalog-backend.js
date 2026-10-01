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

  const doc =
    new jsPDF({
      unit: 'mm',
      format: 'a4'
    });

  const left = 14;
  let y = 16;

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(18);

  doc.setTextColor(
    169,
    0,
    90
  );

  doc.text(
    s.company_name,
    left,
    y
  );

  y += 7;

  doc.setFontSize(9);

  doc.setTextColor(
    70,
    70,
    70
  );

  doc.text(
    s.tagline,
    left,
    y
  );

  y += 5;

  doc.text(
    s.address,
    left,
    y
  );

  y += 5;

  doc.text(
    `WhatsApp: ${s.whatsapp} | Phone: ${s.phone}`,
    left,
    y
  );

  y += 9;

  doc.setDrawColor(
    169,
    0,
    90
  );

  doc.line(
    left,
    y,
    196,
    y
  );

  y += 8;

  doc.setFontSize(10);

  doc.setTextColor(
    40,
    40,
    40
  );

  doc.text(
    'Customer Details:',
    left,
    y
  );

  doc.setFont(
    'helvetica',
    'normal'
  );

  y += 5;

  doc.text(
    `Name: ${s.customer.name}`,
    left,
    y
  );

  doc.text(
    `Order ID: ${s.order_id}`,
    130,
    y
  );

  y += 5;

  doc.text(
    `Mobile: ${s.customer.mobile}`,
    left,
    y
  );

  doc.text(
    `Date: ${new Date(s.date).toLocaleDateString('en-IN')}`,
    130,
    y
  );

  y += 5;
async function renderInvoicePdf(s) {
  const { jsPDF } = window.jspdf;

  const doc =
    new jsPDF({
      unit: 'mm',
      format: 'a4'
    });

  const pageWidth = 210;
  const left = 14;
  const right = 196;
  let y = 16;

  /* =========================
     COMPANY HEADER
  ========================= */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(18);

  doc.setTextColor(
    169,
    0,
    90
  );

  doc.text(
    s.company_name,
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  y += 6;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(9);

  doc.setTextColor(
    70,
    70,
    70
  );

  doc.text(
    s.tagline,
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  y += 4.5;

  doc.text(
    s.address,
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  y += 4.5;

  doc.text(
    `WhatsApp: ${s.whatsapp} | Phone: ${s.phone}`,
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  y += 6;

  /* =========================
     PINK HORIZONTAL LINE
  ========================= */

  doc.setDrawColor(
    169,
    0,
    90
  );

  doc.setLineWidth(0.6);

  doc.line(
    left,
    y,
    right,
    y
  );

  y += 7;

  /* =========================
     CUSTOMER / ORDER DETAILS
  ========================= */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(10);

  doc.setTextColor(
    40,
    40,
    40
  );

  doc.text(
    'Customer Details',
    left,
    y
  );

  doc.text(
    'Order Invoice',
    right,
    y,
    {
      align: 'right'
    }
  );

  y += 5;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(8.5);

  doc.text(
    `Name: ${s.customer.name}`,
    left,
    y
  );

  doc.text(
    `Order ID: ${s.order_id}`,
    right,
    y,
    {
      align: 'right'
    }
  );

  y += 4.5;

  doc.text(
    `Mobile: ${s.customer.mobile}`,
    left,
    y
  );

  doc.text(
    `Date: ${new Date(s.date).toLocaleDateString('en-IN')}`,
    right,
    y,
    {
      align: 'right'
    }
  );

  y += 4.5;

  const customerAddress =
    `Address: ${s.customer.address}, ${s.customer.town}, ${s.customer.district}, ${s.customer.state} - ${s.customer.pincode}`;

  const addressLines =
    doc.splitTextToSize(
      customerAddress,
      110
    );

  doc.text(
    addressLines,
    left,
    y
  );

  y +=
    (addressLines.length * 4) + 6;

  /* =========================
     PRODUCT TABLE
     GREEN HEADER + WHITE ROWS
  ========================= */

  const head = [
    [
      'S.No',
      'Code',
      'Product Name',
      'MRP',
      'Qty',
      'Offer Price',
      'Subtotal'
    ]
  ];

  const body =
    s.items.map(
      (i, n) => [
        String(n + 1),
        i.code,
        `${i.name}${i.pack ? ` (${i.pack})` : ''}`,
        Number(i.mrp) > 0
          ? money(i.mrp)
          : '',
        String(i.qty),
        money(i.price),
        money(i.amount)
      ]
    );

  doc.autoTable({
    startY: y,
    head,
    body,

    theme: 'grid',

    margin: {
      left,
      right: 14
    },

    styles: {
      font: 'helvetica',
      fontSize: 7.6,
      textColor: [45, 45, 45],
      cellPadding: 1.8,
      lineColor: [220, 220, 220],
      lineWidth: 0.2,
      valign: 'middle'
    },

    headStyles: {
      fillColor: [0, 91, 72],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
      halign: 'center',
      valign: 'middle',
      cellPadding: 2
    },

    bodyStyles: {
      fillColor: [255, 255, 255],
      textColor: [45, 45, 45]
    },

    alternateRowStyles: {
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
        halign: 'right'
      },

      4: {
        cellWidth: 12,
        halign: 'center'
      },

      5: {
        cellWidth: 27,
        halign: 'right'
      },

      6: {
        cellWidth: 29,
        halign: 'right'
      }
    },

    didDrawPage: function () {
      doc.setFont(
        'helvetica',
        'normal'
      );
    }
  });

  y =
    doc.lastAutoTable.finalY + 7;

  /* =========================
     TOTALS
  ========================= */

  const rows = [
    [
      'Total MRP',
      money(s.totals.mrp_total)
    ],

    [
      'Special Savings',
      `- ${money(s.totals.savings)}`
    ],

    [
      'Product Net Total',
      money(s.totals.net_total)
    ],

    [
      'Packing Charges',
      s.totals.packing_display ||
      (
        typeof s.totals.packing === 'number'
          ? money(s.totals.packing)
          : String(s.totals.packing)
      )
    ],

    [
      'Transport',
      s.totals.transport
    ],

    [
      'Grand Total',
      money(s.totals.grand_total)
    ]
  ];

  doc.autoTable({
    startY: y,
    body: rows,

    theme: 'plain',

    tableWidth: 82,

    margin: {
      left: 114
    },

    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: [45, 45, 45],
      cellPadding: 1.8,
      valign: 'middle'
    },

    columnStyles: {
      0: {
        fontStyle: 'bold',
        halign: 'left',
        cellWidth: 43
      },

      1: {
        halign: 'right',
        cellWidth: 39
      }
    },

    didParseCell: function (data) {
      if (
        data.section === 'body' &&
        data.row.index === 5
      ) {
        data.cell.styles.fillColor = [
          169,
          0,
          90
        ];

        data.cell.styles.textColor = [
          255,
          255,
          255
        ];

        data.cell.styles.fontStyle = 'bold';

        data.cell.styles.fontSize = 9;
      }
    }
  });

  y =
    doc.lastAutoTable.finalY + 8;

  /* =========================
     FOOTER LINE
  ========================= */

  doc.setDrawColor(
    169,
    0,
    90
  );

  doc.setLineWidth(0.5);

  doc.line(
    left,
    y,
    right,
    y
  );

  y += 6;

  /* =========================
     THANK YOU FOOTER
  ========================= */

  doc.setFont(
    'helvetica',
    'bold'
  );

  doc.setFontSize(8.5);

  doc.setTextColor(
    80,
    80,
    80
  );

  doc.text(
    'Thank you for shopping with AMALA PYROTECH!',
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  y += 4.5;

  doc.setFont(
    'helvetica',
    'normal'
  );

  doc.setFontSize(8);

  doc.setTextColor(
    110,
    110,
    110
  );

  doc.text(
    'Have a Safe and Happy Diwali.',
    pageWidth / 2,
    y,
    {
      align: 'center'
    }
  );

  /* =========================
     SAVE PDF
  ========================= */

  doc.save(
    `${s.order_id}-invoice.pdf`
  );
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
