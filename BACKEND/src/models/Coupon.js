const { Schema, model } = require('mongoose');

const CouponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, required: true, default: 10, min: 1, max: 100 },
  isActive: { type: Boolean, default: true },
  validUntil: { type: Date, default: null },
  usedCount: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = model('Coupon', CouponSchema);
