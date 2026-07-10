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
router.put('/restock-requests/:id', ctrl.updateRestockRequest);
router.post('/products', ctrl.addProduct);
router.put('/products/:id', ctrl.updateProduct);
router.delete('/products/:id', ctrl.deleteProduct);
router.get('/stock-transactions', ctrl.getStockTransactions);
router.put('/orders/:id/ship', ctrl.shipOrder);

router.post('/upload-image', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'no_file', message: 'No se ha proporcionado ninguna imagen.' });
  }
  const relativePath = `uploads/products/${req.file.filename}`;
  res.json({ ok: true, path: relativePath });
});

module.exports = router;
