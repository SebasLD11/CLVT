const { Schema, model } = require('mongoose');

const StockTransactionSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  quantityChange: { type: Number, required: true }, // positive for additions, negative for sales
  reason: { type: String, required: true }, // 'purchase', 'supplier_restock', 'manual_adjustment'
  performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

module.exports = model('StockTransaction', StockTransactionSchema);
