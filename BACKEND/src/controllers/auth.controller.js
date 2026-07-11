const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Order = require('../models/Order');

const JWT_SECRET = process.env.JWT_SECRET || 'clvt_secret_key_12345';

exports.register = async (req, res, next) => {
  try {
    const { email, password, fullName, phone, memberId, address } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'missing_fields', message: 'Por favor, rellene todos los campos obligatorios.' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'user_exists', message: 'El correo electrónico ya está registrado.' });
    }

    if (memberId) {
      const existingMember = await User.findOne({ memberId: memberId.trim() });
      if (existingMember) {
        return res.status(400).json({ error: 'member_id_exists', message: 'El número de asociado ya está registrado por otro usuario.' });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // If it's the very first user in the database, make them admin for easier setup
    const isFirstUser = (await User.countDocuments({})) === 0;
    const role = isFirstUser ? 'admin' : 'member';

    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      fullName,
      phone: phone || '',
      memberId: memberId && memberId.trim() !== '' ? memberId.trim() : null,
      role,
      status: 'active',
      address: address || {}
    });

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        memberId: user.memberId,
        role: user.role,
        status: user.status,
        address: user.address
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'missing_fields', message: 'Por favor, proporcione correo y contraseña.' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'inactive_account', message: 'Su cuenta ha sido desactivada. Póngase en contacto con soporte.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
    }

    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        memberId: user.memberId,
        role: user.role,
        status: user.status,
        address: user.address
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = req.user;
    res.json({
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        memberId: user.memberId,
        role: user.role,
        status: user.status,
        address: user.address
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.updateMe = async (req, res, next) => {
  try {
    const { fullName, phone, address } = req.body;

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: 'not_found', message: 'Usuario no encontrado.' });

    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (address) {
      user.address = {
        line1: address.line1 !== undefined ? address.line1 : user.address.line1,
        line2: address.line2 !== undefined ? address.line2 : user.address.line2,
        city: address.city !== undefined ? address.city : user.address.city,
        province: address.province !== undefined ? address.province : user.address.province,
        postalCode: address.postalCode !== undefined ? address.postalCode : user.address.postalCode,
        country: address.country !== undefined ? address.country : user.address.country,
      };
    }

    await user.save();

    res.json({
      ok: true,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        phone: user.phone,
        memberId: user.memberId,
        role: user.role,
        status: user.status,
        address: user.address
      }
    });
  } catch (error) {
    next(error);
  }
};

exports.getMyOrders = async (req, res, next) => {
  try {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 }).populate({ path: 'items.productId', select: 'collectionTitle tags' });
    res.json(orders);
  } catch (error) {
    next(error);
  }
};
