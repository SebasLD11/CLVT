const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  email: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  phone: { type: String, default: '' },
  memberId: { type: String, default: null, unique: true, sparse: true },
  role: { type: String, enum: ['member', 'admin'], default: 'member' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  address: {
    line1: { type: String, default: '' },
    line2: { type: String, default: '' },
    city: { type: String, default: '' },
    province: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'ES' },
  }
}, { timestamps: true });

module.exports = model('User', UserSchema);
