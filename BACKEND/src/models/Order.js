const { Schema, model } = require('mongoose');

const OrderItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product' },
  name: String,
  price: Number,
  qty: Number,
  size: { type: String, default: null },
  img: { type: String, default: null },
}, { _id: false });

const AddressSchema = new Schema({
  fullName: String, phone: String, email: String,
  line1: String, line2: String, city: String, province: String,
  postalCode: String, country: { type: String, default: 'ES' },
}, { _id: false });

const ShippingSchema = new Schema({
  carrier: String, service: String, zone: String, cost: Number,
}, { _id: false });

const OrderSchema = new Schema({
  items: [OrderItemSchema],
  subtotal: Number,
  discountCode: { type: String, default: null },
  discountAmount: { type: Number, default: 0 },
  vatRate: { type: Number, default: 0.21 },
  vatAmount: Number,
  shipping: ShippingSchema,
  total: Number,
  buyer: AddressSchema,
  status: { type: String, enum: ['review','awaiting_payment','paid','canceled'], default: 'review' },
  receiptPath: { type: String, default: null },
}, { timestamps: true });

module.exports = model('Order', OrderSchema);
