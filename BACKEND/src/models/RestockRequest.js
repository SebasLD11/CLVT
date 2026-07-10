const { Schema, model } = require('mongoose');

const RestockRequestSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  currentStock: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'ordered', 'received'], default: 'pending' }
}, { timestamps: true });

module.exports = model('RestockRequest', RestockRequestSchema);
