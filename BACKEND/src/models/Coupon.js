const { Schema, model } = require('mongoose');

const CouponSchema = new Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  discountPercent: { type: Number, required: true }, // e.g. 15 for 15% discount
  isActive: { type: Boolean, default: true },
  validUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = model('Coupon', CouponSchema);
