const fs = require('fs');

const adminCtrlAppend = `
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
`;

fs.appendFileSync('BACKEND/src/controllers/admin.controller.js', adminCtrlAppend, 'utf8');
console.log('Appended admin.controller.js');
