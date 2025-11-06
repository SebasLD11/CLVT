// src/controllers/checkout.controller.js
const { z } = require('zod');
const path = require('path');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { quoteOptions } = require('../utils/shipping');
const { generateReceiptPDF } = require('../utils/pdf');

// ===== Schemas =====
const itemSchema = z.object({
  id: z.string(),
  qty: z.number().min(1),
  size: z.string().min(1).nullable().optional(),
});
const buyerSchema = z.object({
  fullName: z.string().min(2),
  email: z.email(),            // helper que evita el warning de deprecación
  phone: z.string().min(6),
  line1: z.string().min(3),
  line2: z.string().optional().nullable(),
  city: z.string().min(2),
  province: z.string().min(2),
  postalCode: z.string().min(3),
  country: z.string().length(2).default('ES'),
});
const summarySchema = z.object({
  items: z.array(itemSchema).min(1),
  buyer: buyerSchema,
  discountCode: z.string().optional().nullable(),
  shipping: z.object({
    carrier: z.string(),
    service: z.string(),
    zone: z.string(),
    cost: z.number().nonnegative(),
  }).optional(),
});

// ===== Helpers =====
function applyDiscount(subtotal, code) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { discountCode: null, discountAmount: 0 };
  if (['BK10', 'BYE10', 'DISCOUNT10'].includes(normalized)) {
    return { discountCode: normalized, discountAmount: +(subtotal * 0.09).toFixed(2) };
  }
  return { discountCode: normalized, discountAmount: 0 };
}

function waLinkForVendor(number, order, receiptUrl) {
  const digits = String(number || '').replace(/\D+/g, '');
  if (!digits) return null;
  const text = [
    'Nuevo pedido Bizum:',
    `Cliente: ${order?.buyer?.fullName || ''} (${order?.buyer?.phone || ''})`,
    `Total: €${(order?.total || 0).toFixed(2)}`,
    `Recibo: ${receiptUrl}`,
  ].join('\n');
  const qs = new URLSearchParams({ text }).toString();
  return `https://wa.me/${digits}?${qs}`;
}

async function buildSummary({ items, buyer, discountCode, shipping }) {
  const ids = items.map(i => i.id);
  const dbProducts = await Product.find({ _id: { $in: ids } }).lean();

  const lines = items.map(i => {
    const p = dbProducts.find(d => String(d._id) === String(i.id));
    if (!p) throw Object.assign(new Error('product_not_found'), { status: 400 });
    if (Array.isArray(p.sizes) && p.sizes.length && (!i.size || !p.sizes.includes(String(i.size)))) {
      throw Object.assign(new Error('invalid_size'), { status: 400 });
    }
    return {
      productId: p._id,
      name: p.name,
      price: Number(p.price),
      qty: Math.max(1, Number(i.qty || 1)),
      size: i.size ?? null,
      img: p.images?.[0] || null,
    };
  });

  // precios base YA incluyen IVA
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const { discountCode: disc, discountAmount } = applyDiscount(subtotal, discountCode);

  const vatRate = Number(process.env.DEFAULT_VAT_RATE || 0.21);
  const baseGross = +(subtotal - discountAmount).toFixed(2); // bruto con IVA
  const vatAmount = +((baseGross) - (baseGross / (1 + vatRate))).toFixed(2); // informativo (IVA incluido)

  // Envío
  const FREE_SHIPPING = Number(process.env.FREE_SHIPPING_THRESHOLD || 100);
  let shippingOptions = [];
  let shippingSel = shipping || null;

  if (!shippingSel) shippingOptions = quoteOptions(buyer);
  if (baseGross >= FREE_SHIPPING) {
    shippingOptions = (shippingOptions || []).map(o => ({ ...o, cost: 0 }));
    if (shippingSel) shippingSel = { ...shippingSel, cost: 0 };
  }

  const shippingCost = shippingSel?.cost || 0;
  const total = +(baseGross + shippingCost).toFixed(2); // NO sumamos IVA de nuevo

  return {
    items: lines,
    subtotal,
    discountCode: disc,
    discountAmount,
    vatRate,
    vatAmount,
    shipping: shippingSel,
    buyer,
    total,
    shippingOptions,
  };
}

// ===== Routes =====
exports.summary = async (req, res, next) => {
  try {
    const input = summarySchema.omit({ shipping: true }).parse(req.body);
    const s = await buildSummary(input);
    const order = await Order.create({ ...s, status: 'review' });
    return res.json({ orderId: order._id, ...s, shippingOptions: s.shippingOptions });
  } catch (e) {
    next(e);
  }
};

exports.finalize = async (req, res, next) => {
  try {
    const input = summarySchema.parse(req.body);
    const s = await buildSummary(input);

    const order = req.body.orderId
      ? await Order.findByIdAndUpdate(req.body.orderId, { ...s, status: 'awaiting_payment' }, { new: true })
      : await Order.create({ ...s, status: 'awaiting_payment' });

    // Genera PDF
    const outDir = process.env.RECEIPTS_DIR || path.join(__dirname, '../../uploads/receipts');
    const { filename } = await generateReceiptPDF(order.toObject(), {
      outDir,
      brandLogoUrl: process.env.BRAND_LOGO_URL,
    });

    // URL absoluta al PDF
    const base = `${req.protocol}://${req.get('host')}`;
    const receiptUrl = `${base}/receipts/${filename}`;
    await Order.findByIdAndUpdate(order._id, { receiptPath: filename });

    // Link de WhatsApp para el flujo de 2 pasos
    const waVendor = waLinkForVendor(process.env.VENDOR_WHATSAPP_NUMBER, order.toObject(), receiptUrl);

    // Devolvemos waVendor duplicado: raíz + share (compatibilidad hacia atrás)
    return res.json({
      ok: true,
      orderId: order._id,
      receiptUrl,
      waVendor,
      share: { waVendor },
    });
  } catch (e) {
    next(e);
  }
};
