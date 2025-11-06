const router = require('express').Router();
const ctrl = require('../controllers/product.controller');

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);

module.exports = router;
