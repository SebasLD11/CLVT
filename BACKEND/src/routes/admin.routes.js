const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/products');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage });

// All routes here require authentication and admin role
router.use(authenticate, requireAdmin);

router.get('/analytics', ctrl.getAnalytics);
router.get('/users', ctrl.getUsers);
router.put('/users/:id', ctrl.updateUser);
router.get('/restock-requests', ctrl.getRestockRequests);
router.post('/restock-requests/generate', ctrl.generateRestockAlerts);
router.post('/restock-requests/manual', ctrl.createManualRestockAlert);
router.put('/restock-requests/:id', ctrl.updateRestockRequest);
router.post('/products', ctrl.addProduct);
router.put('/products/:id', ctrl.updateProduct);
router.delete('/products/:id', ctrl.deleteProduct);
router.get('/stock-transactions', ctrl.getStockTransactions);
router.put('/orders/:id/pay', ctrl.payOrder);
router.put('/orders/:id/ship', ctrl.shipOrder);

router.get('/coupons', ctrl.getCoupons);
router.post('/coupons', ctrl.addCoupon);
router.put('/coupons/:id', ctrl.updateCoupon);
router.delete('/coupons/:id', ctrl.deleteCoupon);

router.post('/upload-image', upload.array('images', 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'no_file', message: 'No se han proporcionado imágenes.' });
  }
  const paths = req.files.map(f => `uploads/products/${f.filename}`);
  res.json({ ok: true, paths });
});

module.exports = router;
