const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const RestockRequest = require('../models/RestockRequest');
const StockTransaction = require('../models/StockTransaction');

// GET /api/admin/analytics
exports.getAnalytics = async (req, res, next) => {
  try {
    // Total income from paid orders
    const paidOrders = await Order.find({ status: { $in: ['paid', 'shipped'] } });
    const totalSales = paidOrders.reduce((acc, order) => acc + (order.total || 0), 0);

    const totalOrders = await Order.countDocuments({});
    const averageOrderValue = totalOrders > 0 ? (totalSales / paidOrders.length || 0) : 0;

    const totalMembers = await User.countDocuments({ role: 'member', status: 'active' });

    // Low stock warnings
    const products = await Product.find({});
    const lowStockAlerts = [];
    products.forEach(p => {
      if (p.variants && p.variants.length) {
        p.variants.forEach(v => {
          if (v.stock <= 5) {
            lowStockAlerts.push({
              _id: p._id,
              name: p.name,
              size: v.size,
              color: v.color,
              stock: v.stock
            });
          }
        });
      }
    });

    // Recent orders
    const recentOrders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      totalSales: +totalSales.toFixed(2),
      totalOrders,
      averageOrderValue: +averageOrderValue.toFixed(2),
      totalMembers,
      lowStockAlerts,
      recentOrders
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const { role, status, fullName, phone, memberId } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ error: 'not_found', message: 'Usuario no encontrado.' });

    if (role) user.role = role;
    if (status) user.status = status;
    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (memberId !== undefined) user.memberId = (memberId && memberId.trim() !== '') ? memberId.trim() : null;

    await user.save();

    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/restock-requests
exports.getRestockRequests = async (req, res, next) => {
  try {
    const alerts = await RestockRequest.find({})
      .populate('productId', 'name images')
      .sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/restock-requests/:id
exports.updateRestockRequest = async (req, res, next) => {
  try {
    const { status, addedQuantity } = req.body;
    const request = await RestockRequest.findById(req.params.id);

    if (!request) return res.status(404).json({ error: 'not_found', message: 'Petición no encontrada.' });

    if (status === 'received' && request.status !== 'received') {
      const qty = Number(addedQuantity || 0);
      if (qty <= 0) {
        return res.status(400).json({ error: 'invalid_quantity', message: 'Por favor, ingrese una cantidad mayor que cero.' });
      }

      // Update product variant stock
      const product = await Product.findById(request.productId);
      if (product) {
        let variantFound = false;
        if (product.variants && product.variants.length) {
          product.variants.forEach(v => {
            if (v.size === request.size && v.color === request.color) {
              v.stock += qty;
              variantFound = true;
            }
          });
        }

        if (!variantFound) {
          // Add variant if it didn't exist for some reason
          product.variants.push({
            size: request.size,
            color: request.color,
            stock: qty
          });
        }

        // Recalculate available sizes
        product.availableSizes = [...new Set(
          product.variants.filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
        )];

        await product.save();

        // Create transaction record
        await StockTransaction.create({
          productId: product._id,
          size: request.size,
          color: request.color,
          quantityChange: qty,
          reason: 'supplier_restock',
          performedBy: req.user._id
        });
      }
    }

    request.status = status;
    await request.save();

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/products
exports.addProduct = async (req, res, next) => {
  try {
    const { name, description, price, tag, images, sizes, colors, collectionTitle, variants } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'missing_fields', message: 'Nombre y precio son obligatorios.' });
    }

    const calculatedAvailableSizes = [...new Set(
      (variants || []).filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
    )];

    const product = await Product.create({
      name,
      description: description || '',
      price: Number(price),
      tag: tag || 'new',
      images: images || [],
      sizes: sizes || [],
      availableSizes: calculatedAvailableSizes.length ? calculatedAvailableSizes : (sizes || []),
      colors: colors || [],
      collectionTitle: collectionTitle || 'Sin colección',
      variants: variants || []
    });

    // Create manual adjustment transactions for initial stock
    if (variants && variants.length) {
      for (const v of variants) {
        if (v.stock > 0) {
          await StockTransaction.create({
            productId: product._id,
            size: v.size,
            color: v.color,
            quantityChange: v.stock,
            reason: 'manual_adjustment',
            performedBy: req.user._id
          });
        }
      }
    }

    res.status(201).json({ ok: true, product });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/products/:id
exports.updateProduct = async (req, res, next) => {
  try {
    const { name, description, price, tag, images, sizes, colors, collectionTitle, variants } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ error: 'not_found', message: 'Producto no encontrado.' });

    // Track stock changes for transaction logs
    if (variants) {
      const oldVariants = product.variants || [];
      for (const newV of variants) {
        const oldV = oldVariants.find(o => o.size === newV.size && o.color === newV.color);
        const oldStock = oldV ? oldV.stock : 0;
        const diff = newV.stock - oldStock;

        if (diff !== 0) {
          await StockTransaction.create({
            productId: product._id,
            size: newV.size,
            color: newV.color,
            quantityChange: diff,
            reason: 'manual_adjustment',
            performedBy: req.user._id
          });
        }
      }
      product.variants = variants;
    }

    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (price) product.price = Number(price);
    if (tag) product.tag = tag;
    if (images) product.images = images;
    if (sizes) product.sizes = sizes;
    if (colors) product.colors = colors;
    if (collectionTitle) product.collectionTitle = collectionTitle;

    // Recalculate available sizes
    product.availableSizes = [...new Set(
      product.variants.filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
    )];

    await product.save();

    res.json({ ok: true, product });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/products/:id
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'not_found', message: 'Producto no encontrado.' });
    res.json({ ok: true, message: 'Producto eliminado correctamente.' });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/stock-transactions
exports.getStockTransactions = async (req, res, next) => {
  try {
    const txs = await StockTransaction.find({})
      .populate('productId', 'name')
      .populate('performedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(txs);
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/orders/:id/ship
exports.shipOrder = async (req, res, next) => {
  try {
    const { carrier, trackingNumber } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: 'not_found', message: 'Pedido no encontrado.' });

    order.status = 'shipped';
    order.shippingTracker = {
      carrier: carrier || 'Correos',
      trackingNumber: trackingNumber || '',
      trackingUrl: trackingNumber ? `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?q=${trackingNumber}` : ''
    };

    await order.save();

    res.json({ ok: true, order });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/coupons
exports.getCoupons = async (req, res, next) => {
  try {
    const Coupon = require('../models/Coupon');
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (error) { next(error); }
};

// POST /api/admin/coupons
exports.addCoupon = async (req, res, next) => {
  try {
    const Coupon = require('../models/Coupon');
    const c = new Coupon(req.body);
    await c.save();
    res.json(c);
  } catch (error) { next(error); }
};

// PUT /api/admin/coupons/:id
exports.updateCoupon = async (req, res, next) => {
  try {
    const Coupon = require('../models/Coupon');
    const c = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(c);
  } catch (error) { next(error); }
};

// DELETE /api/admin/coupons/:id
exports.deleteCoupon = async (req, res, next) => {
  try {
    const Coupon = require('../models/Coupon');
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) { next(error); }
};

// POST /api/admin/restock-requests/generate
exports.generateRestockAlerts = async (req, res, next) => {
  try {
    const Product = require('../models/Product');
    const RestockRequest = require('../models/RestockRequest');
    const products = await Product.find().lean();
    let generated = 0;

    for (const p of products) {
      if (!p.variants || !p.variants.length) {
        if (p.stock <= 5) {
          const exist = await RestockRequest.findOne({ productId: p._id, status: 'pending' });
          if (!exist) {
            await RestockRequest.create({ productId: p._id, size: '', color: '', currentStock: p.stock });
            generated++;
          }
        }
        continue;
      }
      for (const v of p.variants) {
        if (v.stock <= 5) {
          const exist = await RestockRequest.findOne({ productId: p._id, size: v.size, color: v.color, status: 'pending' });
          if (!exist) {
            await RestockRequest.create({ productId: p._id, size: v.size, color: v.color, currentStock: v.stock });
            generated++;
          }
        }
      }
    }
    res.json({ ok: true, generated });
  } catch (error) { next(error); }
};

// POST /api/admin/restock-requests/manual
exports.createManualRestockAlert = async (req, res, next) => {
  try {
    const { productId, size, color, currentStock } = req.body;
    const RestockRequest = require('../models/RestockRequest');
    const exist = await RestockRequest.findOne({ productId, size: size || '', color: color || '', status: 'pending' });
    if (!exist) {
      const alert = await RestockRequest.create({ productId, size: size || '', color: color || '', currentStock });
      return res.json({ ok: true, alert });
    }
    return res.json({ ok: false, message: 'La alerta ya existe' });
  } catch (error) { next(error); }
};
