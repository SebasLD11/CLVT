const router = require('express').Router();
const ctrl = require('../controllers/checkout.controller');

router.post('/summary', ctrl.summary);
router.post('/finalize', ctrl.finalize);

module.exports = router;
