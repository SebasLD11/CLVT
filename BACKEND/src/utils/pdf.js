// src/utils/pdf.js
const PDFDocument = require('pdfkit');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const HEX2NAME = { '#000':'Negro','#000000':'Negro','#fff':'Blanco','#ffffff':'Blanco','#ff0000':'Rojo','#0000ff':'Azul','#ffff00':'Amarillo','#da70d6':'Orquídea' };

async function bufferFromUrl(url){
  const r = await axios.get(url,{ responseType:'arraybuffer' });
  return Buffer.from(r.data);
}

async function generateReceiptPDF(order, { outDir, brandLogoUrl }) {
  const filename = `receipt_${String(order._id).slice(-8)}_${Date.now()}.pdf`;
  const fullPath = path.join(outDir, filename);
  await fs.promises.mkdir(outDir, { recursive: true });

  const doc = new PDFDocument({ size:'A4', margin:40 });
  const stream = fs.createWriteStream(fullPath);
  doc.pipe(stream);

  // === Helpers comunes
  const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const L = doc.page.margins.left;
  const R = L + pageW;

  const Y = (val) => { doc.y = val; return val; };
  const line = (y) => { doc.moveTo(L, y).lineTo(R, y).strokeColor('#ddd').lineWidth(1).stroke(); };
  const textRight = (txt, x, y, w) => doc.text(txt, x, y, { width:w, align:'right' });
  const textCenter= (txt, x, y, w) => doc.text(txt, x, y, { width:w, align:'center' });

  // === Cabecera
  let yCursor = 40;
  if (brandLogoUrl) {
    try { doc.image(await bufferFromUrl(brandLogoUrl), L, yCursor, { width: 120 }); }
    catch {}
  }
  doc.font('Helvetica-Bold').fontSize(18).text('RECIBO', R - 120, yCursor, { width:120, align:'right' });
  yCursor += 40; // baja un poco tras la cabecera

  // === Bloques superiores (3 columnas): Vendedor / Pedido / Comprador
  doc.fontSize(10);

  const col1x = L;
  const col2x = L + pageW * 0.40;
  const col3x = L + pageW * 0.68;
  const col1w = pageW * 0.37;
  const col2w = pageW * 0.25;
  const col3w = pageW * 0.30;

  const topY = Y(yCursor);

  // Vendedor
  doc.font('Helvetica-Bold').text('Vendedor:', col1x, topY, { width: col1w });
  doc.font('Helvetica').text('BYE K1TTY — NIF/CIF: 48273903P', col1x, doc.y, { width: col1w });
  doc.text('C/Ripollès 87, La mora. Tarragona, 43008', col1x, doc.y, { width: col1w });
  doc.text('Email: aharonbj96@gmail.com · Tel: +34 634 183 862', col1x, doc.y, { width: col1w });
  const yVendEnd = doc.y;

  // Pedido
  doc.font('Helvetica-Bold').text('Pedido', col2x, topY, { width: col2w });
  doc.font('Helvetica').text(`Nº: ${order._id}`, col2x, doc.y, { width: col2w });
  doc.text(`Fecha: ${new Date(order.createdAt || Date.now()).toLocaleDateString('es-ES')}`, col2x, doc.y, { width: col2w });
  const yPedEnd = doc.y;

  // Comprador
  const b = order.buyer || {};
  doc.font('Helvetica-Bold').text('Comprador', col3x, topY, { width: col3w });
  doc.font('Helvetica').text(`${b.fullName || ''}`, col3x, doc.y, { width: col3w });
  doc.text(`${b.email || ''} — ${b.phone || ''}`, col3x, doc.y, { width: col3w });
  doc.text(`${b.line1 || ''} ${b.line2 || ''}`, col3x, doc.y, { width: col3w });
  doc.text(`${b.postalCode || ''} ${b.city || ''} (${b.province || ''})`, col3x, doc.y, { width: col3w });
  const yCompEnd = doc.y;

  // Cierra el bloque superior sin solapar
  yCursor = Math.max(yVendEnd, yPedEnd, yCompEnd) + 16;
  Y(yCursor);

  // Envío
  doc.font('Helvetica-Bold').text('Envío', L, yCursor);
  doc.font('Helvetica').text(`${order.shipping?.carrier || '—'} — ${order.shipping?.service || '—'}`, L, doc.y);
  if (order.shipping?.zone) doc.text(`Zona: ${order.shipping.zone}`, L, doc.y);
  yCursor = doc.y + 12;
  Y(yCursor);

  // === Tabla artículos
  line(doc.y); Y(doc.y + 8);

  // Columnas tabla
  const xProd = L;
  const wProd = Math.floor(pageW * 0.52);     // producto (multi-línea)
  const xQty  = L + Math.floor(pageW * 0.54);
  const wQty  = Math.floor(pageW * 0.08);     // cantidad
  const xPrice= L + Math.floor(pageW * 0.66);
  const wPrice= Math.floor(pageW * 0.14);     // precio unit.
  const xAmt  = L + Math.floor(pageW * 0.82);
  const wAmt  = Math.floor(pageW * 0.18);     // importe

  // Encabezados
  doc.font('Helvetica-Bold');
  const headerY = doc.y;
  doc.text('Producto', xProd, headerY, { width: wProd });
  textCenter('Cant.', xQty, headerY, wQty);
  textRight('Precio', xPrice, headerY, wPrice);
  textRight('Importe', xAmt, headerY, wAmt);

  Y(headerY + 12);
  line(doc.y); Y(doc.y + 6);
  doc.font('Helvetica');

  // Filas
  for (const it of (order.items || [])) {
    const parts = [it.name];
    if (it.size) parts.push(`Talla ${it.size}`);
    // 👇 preferimos etiqueta del front; si no, mapeamos HEX conocido
    if (it.color || it.colorLabel) {
      const raw = (it.colorLabel && String(it.colorLabel).trim()) || null;
      const hex = (it.color && String(it.color).trim().toLowerCase()) || null;
      const label = raw || (hex ? (HEX2NAME[hex] || hex) : null);
      if (label) parts.push(`Color ${label}`);
    }
    const name = parts.join(' — ');
    const rowTop = doc.y;

    // Calcula alto real de la celda de producto (multi-línea)
    const hProd = doc.heightOfString(name, { width: wProd });
    const hRow  = Math.max(hProd, 12); // al menos 1 línea

    // Escribe celdas alineadas al mismo y
    doc.text(name, xProd, rowTop, { width: wProd });
    textCenter(String(it.qty), xQty, rowTop, wQty);
    textRight(`€${Number(it.price).toFixed(2)}`, xPrice, rowTop, wPrice);
    textRight(`€${(Number(it.price) * Number(it.qty)).toFixed(2)}`, xAmt, rowTop, wAmt);

    // Avanza a la siguiente fila
    Y(rowTop + hRow + 6);
  }

  Y(doc.y + 4);
  line(doc.y);
  Y(doc.y + 10);

  // === Resumen (bloque a la derecha, SIN redeclaraciones)
  const sumW = 200;
  const sumX = R - sumW;

  const subtotal = Number(order.subtotal || 0);
  const discount = Number(order.discountAmount || 0);
  const vatAmt   = Number(order.vatAmount || 0); // informativo (IVA incluido)
  const shipCost = Number(order.shipping?.cost || 0);
  const total    = Number(order.total || (subtotal - discount + shipCost));

  doc.font('Helvetica');
  const lineGap = 12;

  // Subtotal
  doc.text('Subtotal (IVA incl.)', sumX, doc.y, { width: sumW / 2 });
  textRight(`€${subtotal.toFixed(2)}`, sumX, doc.y, sumW);

  // Descuento
  if (discount > 0) {
    Y(doc.y + lineGap);
    doc.text(`Descuento${order.discountCode ? ` (${order.discountCode})` : ''}`, sumX, doc.y, { width: sumW / 2 });
    textRight(`-€${discount.toFixed(2)}`, sumX, doc.y, sumW);
  }

  // IVA informativo
  Y(doc.y + lineGap);
  doc.text('IVA (informativo)', sumX, doc.y, { width: sumW / 2 });
  textRight(`€${vatAmt.toFixed(2)}`, sumX, doc.y, sumW);

  // Envío
  if (order.shipping) {
    Y(doc.y + lineGap);
    doc.text('Envío', sumX, doc.y, { width: sumW / 2 });
    textRight(`€${shipCost.toFixed(2)}`, sumX, doc.y, sumW);
  }

  // Total (negrita)
  Y(doc.y + lineGap + 2);
  doc.font('Helvetica-Bold');
  doc.text('Total', sumX, doc.y, { width: sumW / 2 });
  textRight(`€${total.toFixed(2)}`, sumX, doc.y, sumW);

  // Nota de pago
  Y(doc.y + 18);
  line(doc.y); Y(doc.y + 10);
  doc.font('Helvetica').fontSize(9).text(
    'Método de pago: Bizum pendiente de confirmación por el vendedor.\nGracias por tu compra. Cupón -10% para próxima compra: BK10',
    L, doc.y, { width: pageW }
  );

  doc.end();
  await new Promise(r => stream.on('finish', r));
  return { filename, fullPath };
}

module.exports = { generateReceiptPDF };
