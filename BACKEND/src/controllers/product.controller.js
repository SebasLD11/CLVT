// BACKEND/src/controllers/product.controller.js
const Product = require('../models/Product');
const FRONT = (process.env.FRONT_URL || 'http://localhost:4200').replace(/\/$/, '');
const abs = p => /^https?:\/\//i.test(p) ? p : `${FRONT}/${String(p||'').replace(/^\//,'')}`;

const serialize = p => ({
  _id: String(p._id),
  name: p.name,
  price: p.price,
  tag: p.tag,
  images: (Array.isArray(p.images)? p.images:[]).map(abs),
  sizes: (Array.isArray(p.sizes) ? p.sizes : []).map(String), // ✅ tallas = texto
  // ✅ NUEVO: expone availableSizes; acepta alias 'Disponibles' si viniera en el doc
  availableSizes: Array.isArray(p.availableSizes)
    ? p.availableSizes.map(String)
    : (Array.isArray(p.Disponibles) ? p.Disponibles.map(String) : []),
  // 👇 incluir colores en respuesta (texto libre: 'black', 'rojo', '#000000'…)
  colors: (Array.isArray(p.colors) ? p.colors : []).map(String),
  // 👇 incluir en respuesta
  collectionTitle: p.collectionTitle || 'Sin colección',
  // 👇 añade timestamps; lean() te los deja como Date, OK para el front
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

exports.list = async (_req, res, next) => {
  try {
    const docs = await Product
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    // (opcional) cache corta para CDN/proxy
    res.set('Cache-Control', 'public, max-age=60, s-maxage=300');
    return res.json(docs.map(serialize));
  }catch (e) { next(e); }
};


// GET /api/products/:id
exports.getOne = async (req, res, next) => {
  try {
    const id = String(req.params.id || '');
    if (!/^[0-9a-fA-F]{24}$/.test(id)) return res.status(400).json({ error: 'bad_id' });

    const doc = await Product.findById(id).lean();
    if (!doc) return res.status(404).json({ error: 'not_found' });

    res.set('Cache-Control', 'public, max-age=120, s-maxage=600');
    res.json(serialize(doc));
  } catch (e) { next(e); }
};
