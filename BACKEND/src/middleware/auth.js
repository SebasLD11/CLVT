const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'clvt_secret_key_12345';

exports.authenticate = async (req, res, next) => {
  try {
    let token = null;

    // Check Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check cookies as fallback
    else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({ error: 'unauthorized', message: 'No se ha proporcionado un token de acceso.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'unauthorized', message: 'Usuario no encontrado.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'forbidden', message: 'Esta cuenta ha sido desactivada por el administrador.' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'unauthorized', message: 'El token de acceso no es válido o ha expirado.' });
    }
    next(error);
  }
};

exports.requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Se requiere autenticación.' });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', message: 'Acceso denegado: se requieren permisos de administrador.' });
  }

  next();
};
