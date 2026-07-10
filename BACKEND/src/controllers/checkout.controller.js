// src/controllers/checkout.controller.js
const { z } = require('zod');
const path = require('path');
const jwt = require('jsonwebtoken');
const Order = require('../models/Order');
const Product = require('../models/Product');
const RestockRequest = require('../models/RestockRequest');
const StockTransaction = require('../models/StockTransaction');
const { sendMail, hasSMTP } = require('../utils/email');
const { quoteOptions } = require('../utils/shipping');
const { generateReceiptPDF } = require('../utils/pdf');

// ===== Schemas =====
const itemSchema = z.object({
  id: z.string(),
  qty: z.number().min(1),
  size: z.string().min(1).nullable().optional(),
  color: z.string().min(1).nullable().optional(),
  colorLabel: z.string().min(1).nullable().optional(),   // ✅ NUEVO: etiqueta legible
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
const Coupon = require('../models/Coupon');
const User = require('../models/User');

async function applyDiscount(subtotal, code, userId) {
  let discountAmount = 0;
  let finalCode = null;
  let isMember = false;

  if (userId) {
    const user = await User.findById(userId);
    if (user && user.memberId && user.memberId.trim() !== '') {
      isMember = true;
    }
  }

  const normalized = String(code || '').trim().toUpperCase();
  if (normalized) {
    const coupon = await Coupon.findOne({ code: normalized, isActive: true });
    if (coupon) {
      if (coupon.validUntil && coupon.validUntil < new Date()) {
        return { discountCode: normalized, discountAmount: 0, error: 'EXPIRED' };
      }
      discountAmount = +(subtotal * (coupon.discountPercent / 100)).toFixed(2);
      finalCode = normalized;
    }
  }

  if (isMember && discountAmount === 0) {
    discountAmount = +(subtotal * 0.10).toFixed(2);
    finalCode = 'SOCIO10';
  }

  return { discountCode: finalCode, discountAmount };
}

function resolveUser(req) {
  try {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clvt_secret_key_12345');
      return decoded.id;
    }
  } catch (e) {
    return null;
  }
  return null;
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

async function buildSummary(req, { items, buyer, discountCode, shipping }) {
  const ids = items.map(i => i.id);
  const dbProducts = await Product.find({ _id: { $in: ids } }).lean();

  const lines = items.map(i => {
    const p = dbProducts.find(d => String(d._id) === String(i.id));
    if (!p) throw Object.assign(new Error('product_not_found'), { status: 400 });
    if (Array.isArray(p.sizes) && p.sizes.length && (!i.size || !p.sizes.includes(String(i.size)))) {
      throw Object.assign(new Error('invalid_size'), { status: 400 });
    }

    // Check stock for variant
    if (p.variants && p.variants.length) {
      const variant = p.variants.find(v => 
        (v.size || '') === (i.size || '') && 
        (v.color || '') === (i.color || '')
      );
      if (!variant || variant.stock < i.qty) {
        const variantDesc = `${i.size ? 'Talla ' + i.size : ''}${i.colorLabel || i.color ? (i.size ? ', ' : '') + 'Color ' + (i.colorLabel || i.color) : ''}`;
        const err = new Error('insufficient_stock');
        err.status = 400;
        err.message = `Stock insuficiente para ${p.name} (${variantDesc || 'General'}). Stock disponible: ${variant ? variant.stock : 0}.`;
        throw err;
      }
    }

    return {
      productId: p._id,
      name: p.name,
      price: Number(p.price),
      qty: Math.max(1, Number(i.qty || 1)),
      size: i.size ?? null,
      color: i.color ?? null,               // ✅ PROPAGAR color
      colorLabel: i.colorLabel ?? null,     // ✅ PROPAGAR etiqueta legible
      img: p.images?.[0] || null,
    };
  });

  // precios base YA incluyen IVA
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  
  const userId = resolveUser(req);
  const { discountCode: disc, discountAmount } = await applyDiscount(subtotal, discountCode, userId);

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
    const s = await buildSummary(req, input);
    const order = await Order.create({ ...s, status: 'review' });
    return res.json({ orderId: order._id, ...s, shippingOptions: s.shippingOptions });
  } catch (e) {
    next(e);
  }
};

exports.finalize = async (req, res, next) => {
  try {
    const input = summarySchema.parse(req.body);
    const s = await buildSummary(req, input);

    // Resolve optional userId from token
    let userId = null;
    try {
      let token = null;
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        token = req.headers.authorization.split(' ')[1];
      } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
      }
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clvt_secret_key_12345');
        userId = decoded.id;
      }
    } catch (e) {
      // Ignore token verification errors during checkout finalization (runs as guest)
    }

    // Decrement stock & check alert thresholds
    for (const item of s.items) {
      const product = await Product.findById(item.productId);
      if (!product) continue;

      if (product.variants && product.variants.length) {
        const variant = product.variants.find(v => 
          (v.size || '') === (item.size || '') && 
          (v.color || '') === (item.color || '')
        );

        if (variant) {
          variant.stock = Math.max(0, variant.stock - item.qty);

          // Create stock transaction
          await StockTransaction.create({
            productId: product._id,
            size: item.size || '',
            color: item.color || '',
            quantityChange: -item.qty,
            reason: 'purchase'
          });

          // Check if stock falls below or equal to 5
          if (variant.stock <= 5) {
            const alreadyAlerted = await RestockRequest.findOne({
              productId: product._id,
              size: item.size || '',
              color: item.color || '',
              status: 'pending'
            });

            if (!alreadyAlerted) {
              await RestockRequest.create({
                productId: product._id,
                size: item.size || '',
                color: item.color || '',
                currentStock: variant.stock,
                status: 'pending'
              });

              // Send email if SMTP is configured
              if (hasSMTP()) {
                try {
                  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
                  const variantDesc = `${item.size ? 'Talla ' + item.size : ''}${item.colorLabel || item.color ? (item.size ? ', ' : '') + 'Color ' + (item.colorLabel || item.color) : ''}` || 'General';
                  await sendMail({
                    to: adminEmail,
                    subject: `[ALERTA STOCK BAJO] ${product.name} - ${variantDesc}`,
                    text: `El producto "${product.name}" (${variantDesc}) ha alcanzado un stock de ${variant.stock} unidades. Se ha añadido a la lista de reposición para proveedores.`,
                    html: `<h3>Alerta de Bajo Stock</h3>
                           <p>El producto <strong>${product.name}</strong> (${variantDesc}) ha alcanzado un stock de <strong>${variant.stock}</strong> unidades.</p>
                           <p>Se ha añadido automáticamente a la lista de pedidos a proveedores del panel de administración.</p>`
                  });
                } catch (emailError) {
                  console.error('Error sending stock alert email:', emailError);
                }
              }
            }
          }
        }
      }

      // Recalculate available sizes
      product.availableSizes = [...new Set(
        product.variants.filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
      )];

      await product.save();
    }

    const orderData = { ...s, userId, status: 'awaiting_payment' };
    const order = req.body.orderId
      ? await Order.findByIdAndUpdate(req.body.orderId, orderData, { new: true })
      : await Order.create(orderData);

    // Genera PDF
    const outDir = process.env.RECEIPTS_DIR || path.join(__dirname, '../../uploads/receipts');
    const baseOrder = order.toObject ? order.toObject() : order;
    const { filename } = await generateReceiptPDF(
      { ...baseOrder, items: s.items },     // ✅ fuerza items con color/colorLabel
      { outDir, brandLogoUrl: process.env.BRAND_LOGO_URL }
    );

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
