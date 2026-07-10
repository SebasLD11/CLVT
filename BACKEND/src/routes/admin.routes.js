const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

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

module.exports = router;
