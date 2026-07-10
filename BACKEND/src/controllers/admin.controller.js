const User = require('../models/User');
const Product = require('../models/Product');
const Order = require('../models/Order');
const RestockRequest = require('../models/RestockRequest');
const StockTransaction = require('../models/StockTransaction');

// GET /api/admin/analytics
exports.getAnalytics = async (req, res, next) => {
  try {
    // Total income from paid orders
    const paidOrders = await Order.find({ status: { $in: ['paid', 'shipped'] } });
    const totalSales = paidOrders.reduce((acc, order) => acc + (order.total || 0), 0);

    const totalOrders = await Order.countDocuments({});
    const averageOrderValue = totalOrders > 0 ? (totalSales / paidOrders.length || 0) : 0;

    const totalMembers = await User.countDocuments({ role: 'member', status: 'active' });

    // Low stock warnings
    const products = await Product.find({});
    const lowStockAlerts = [];
    products.forEach(p => {
      if (p.variants && p.variants.length) {
        p.variants.forEach(v => {
          if (v.stock <= 5) {
            lowStockAlerts.push({
              _id: p._id,
              name: p.name,
              size: v.size,
              color: v.color,
              stock: v.stock
            });
          }
        });
      }
    });

    // Recent orders
    const recentOrders = await Order.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      totalSales: +totalSales.toFixed(2),
      totalOrders,
      averageOrderValue: +averageOrderValue.toFixed(2),
      totalMembers,
      lowStockAlerts,
      recentOrders
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/users/:id
exports.updateUser = async (req, res, next) => {
  try {
    const { role, status, fullName, phone, memberId } = req.body;
    const user = await User.findById(req.params.id);

    if (!user) return res.status(404).json({ error: 'not_found', message: 'Usuario no encontrado.' });

    if (role) user.role = role;
    if (status) user.status = status;
    if (fullName) user.fullName = fullName;
    if (phone !== undefined) user.phone = phone;
    if (memberId !== undefined) user.memberId = (memberId && memberId.trim() !== '') ? memberId.trim() : null;

    await user.save();

    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/restock-requests
exports.getRestockRequests = async (req, res, next) => {
  try {
    const alerts = await RestockRequest.find({})
      .populate('productId', 'name images')
      .sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/restock-requests/:id
exports.updateRestockRequest = async (req, res, next) => {
  try {
    const { status, addedQuantity } = req.body;
    const request = await RestockRequest.findById(req.params.id);

    if (!request) return res.status(404).json({ error: 'not_found', message: 'Petición no encontrada.' });

    if (status === 'received' && request.status !== 'received') {
      const qty = Number(addedQuantity || 0);
      if (qty <= 0) {
        return res.status(400).json({ error: 'invalid_quantity', message: 'Por favor, ingrese una cantidad mayor que cero.' });
      }

      // Update product variant stock
      const product = await Product.findById(request.productId);
      if (product) {
        let variantFound = false;
        if (product.variants && product.variants.length) {
          product.variants.forEach(v => {
            if (v.size === request.size && v.color === request.color) {
              v.stock += qty;
              variantFound = true;
            }
          });
        }

        if (!variantFound) {
          // Add variant if it didn't exist for some reason
          product.variants.push({
            size: request.size,
            color: request.color,
            stock: qty
          });
        }

        // Recalculate available sizes
        product.availableSizes = [...new Set(
          product.variants.filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
        )];

        await product.save();

        // Create transaction record
        await StockTransaction.create({
          productId: product._id,
          size: request.size,
          color: request.color,
          quantityChange: qty,
          reason: 'supplier_restock',
          performedBy: req.user._id
        });
      }
    }

    request.status = status;
    await request.save();

    res.json({ ok: true, request });
  } catch (error) {
    next(error);
  }
};

// POST /api/admin/products
exports.addProduct = async (req, res, next) => {
  try {
    const { name, description, price, tag, images, sizes, colors, collectionTitle, variants } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'missing_fields', message: 'Nombre y precio son obligatorios.' });
    }

    const calculatedAvailableSizes = [...new Set(
      (variants || []).filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
    )];

    const product = await Product.create({
      name,
      description: description || '',
      price: Number(price),
      tag: tag || 'new',
      images: images || [],
      sizes: sizes || [],
      availableSizes: calculatedAvailableSizes.length ? calculatedAvailableSizes : (sizes || []),
      colors: colors || [],
      collectionTitle: collectionTitle || 'Sin colección',
      variants: variants || []
    });

    // Create manual adjustment transactions for initial stock
    if (variants && variants.length) {
      for (const v of variants) {
        if (v.stock > 0) {
          await StockTransaction.create({
            productId: product._id,
            size: v.size,
            color: v.color,
            quantityChange: v.stock,
            reason: 'manual_adjustment',
            performedBy: req.user._id
          });
        }
      }
    }

    res.status(201).json({ ok: true, product });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/products/:id
exports.updateProduct = async (req, res, next) => {
  try {
    const { name, description, price, tag, images, sizes, colors, collectionTitle, variants } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) return res.status(404).json({ error: 'not_found', message: 'Producto no encontrado.' });

    // Track stock changes for transaction logs
    if (variants) {
      const oldVariants = product.variants || [];
      for (const newV of variants) {
        const oldV = oldVariants.find(o => o.size === newV.size && o.color === newV.color);
        const oldStock = oldV ? oldV.stock : 0;
        const diff = newV.stock - oldStock;

        if (diff !== 0) {
          await StockTransaction.create({
            productId: product._id,
            size: newV.size,
            color: newV.color,
            quantityChange: diff,
            reason: 'manual_adjustment',
            performedBy: req.user._id
          });
        }
      }
      product.variants = variants;
    }

    if (name) product.name = name;
    if (description !== undefined) product.description = description;
    if (price) product.price = Number(price);
    if (tag) product.tag = tag;
    if (images) product.images = images;
    if (sizes) product.sizes = sizes;
    if (colors) product.colors = colors;
    if (collectionTitle) product.collectionTitle = collectionTitle;

    // Recalculate available sizes
    product.availableSizes = [...new Set(
      product.variants.filter(v => v.stock > 0).map(v => v.size).filter(Boolean)
    )];

    await product.save();

    res.json({ ok: true, product });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/admin/products/:id
exports.deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'not_found', message: 'Producto no encontrado.' });
    res.json({ ok: true, message: 'Producto eliminado correctamente.' });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/stock-transactions
exports.getStockTransactions = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await StockTransaction.countDocuments({});
    const txs = await StockTransaction.find({})
      .populate('productId', 'name')
      .populate('performedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      data: txs,
      pagination: {
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/admin/orders/:id/ship
exports.shipOrder = async (req, res, next) => {
  try {
    const { carrier, trackingNumber } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: 'not_found', message: 'Pedido no encontrado.' });

    order.status = 'shipped';
    order.shippingTracker = {
      carrier: carrier || 'Correos',
      trackingNumber: trackingNumber || '',
      trackingUrl: trackingNumber ? `https://www.correos.es/es/es/herramientas/localizador/envios/detalle?q=${trackingNumber}` : ''
    };

    await order.save();

    res.json({ ok: true, order });
  } catch (error) {
    next(error);
  }
};

 / /   G E T   / a p i / a d m i n / c o u p o n s 
 e x p o r t s . g e t C o u p o n s   =   a s y n c   ( r e q ,   r e s ,   n e x t )   = >   { 
     t r y   { 
         c o n s t   C o u p o n   =   r e q u i r e ( " . . / m o d e l s / C o u p o n " ) ; 
         c o n s t   c o u p o n s   =   a w a i t   C o u p o n . f i n d ( ) . s o r t ( {   c r e a t e d A t :   - 1   } ) ; 
         r e s . j s o n ( c o u p o n s ) ; 
     }   c a t c h   ( e r r o r )   {   n e x t ( e r r o r ) ;   } 
 } ; 
 
 / /   P O S T   / a p i / a d m i n / c o u p o n s 
 e x p o r t s . a d d C o u p o n   =   a s y n c   ( r e q ,   r e s ,   n e x t )   = >   { 
     t r y   { 
         c o n s t   C o u p o n   =   r e q u i r e ( " . . / m o d e l s / C o u p o n " ) ; 
         c o n s t   {   c o d e ,   d i s c o u n t P e r c e n t ,   i s A c t i v e ,   v a l i d U n t i l   }   =   r e q . b o d y ; 
         i f   ( ! c o d e   | |   ! d i s c o u n t P e r c e n t )   r e t u r n   r e s . s t a t u s ( 4 0 0 ) . j s o n ( {   e r r o r :   " m i s s i n g _ f i e l d s "   } ) ; 
         c o n s t   c o u p o n   =   a w a i t   C o u p o n . c r e a t e ( {   c o d e ,   d i s c o u n t P e r c e n t ,   i s A c t i v e ,   v a l i d U n t i l   } ) ; 
         r e s . s t a t u s ( 2 0 1 ) . j s o n ( {   o k :   t r u e ,   c o u p o n   } ) ; 
     }   c a t c h   ( e r r o r )   {   n e x t ( e r r o r ) ;   } 
 } ; 
 
 / /   P U T   / a p i / a d m i n / c o u p o n s / : i d 
 e x p o r t s . u p d a t e C o u p o n   =   a s y n c   ( r e q ,   r e s ,   n e x t )   = >   { 
     t r y   { 
         c o n s t   C o u p o n   =   r e q u i r e ( " . . / m o d e l s / C o u p o n " ) ; 
         c o n s t   {   c o d e ,   d i s c o u n t P e r c e n t ,   i s A c t i v e ,   v a l i d U n t i l   }   =   r e q . b o d y ; 
         c o n s t   c o u p o n   =   a w a i t   C o u p o n . f i n d B y I d ( r e q . p a r a m s . i d ) ; 
         i f   ( ! c o u p o n )   r e t u r n   r e s . s t a t u s ( 4 0 4 ) . j s o n ( {   e r r o r :   " n o t _ f o u n d "   } ) ; 
         i f   ( c o d e )   c o u p o n . c o d e   =   c o d e ; 
         i f   ( d i s c o u n t P e r c e n t   ! = =   u n d e f i n e d )   c o u p o n . d i s c o u n t P e r c e n t   =   d i s c o u n t P e r c e n t ; 
         i f   ( i s A c t i v e   ! = =   u n d e f i n e d )   c o u p o n . i s A c t i v e   =   i s A c t i v e ; 
         i f   ( v a l i d U n t i l   ! = =   u n d e f i n e d )   c o u p o n . v a l i d U n t i l   =   v a l i d U n t i l ; 
         a w a i t   c o u p o n . s a v e ( ) ; 
         r e s . j s o n ( {   o k :   t r u e ,   c o u p o n   } ) ; 
     }   c a t c h   ( e r r o r )   {   n e x t ( e r r o r ) ;   } 
 } ; 
 
 / /   D E L E T E   / a p i / a d m i n / c o u p o n s / : i d 
 e x p o r t s . d e l e t e C o u p o n   =   a s y n c   ( r e q ,   r e s ,   n e x t )   = >   { 
     t r y   { 
         c o n s t   C o u p o n   =   r e q u i r e ( " . . / m o d e l s / C o u p o n " ) ; 
         c o n s t   c o u p o n   =   a w a i t   C o u p o n . f i n d B y I d A n d D e l e t e ( r e q . p a r a m s . i d ) ; 
         i f   ( ! c o u p o n )   r e t u r n   r e s . s t a t u s ( 4 0 4 ) . j s o n ( {   e r r o r :   " n o t _ f o u n d "   } ) ; 
         r e s . j s o n ( {   o k :   t r u e   } ) ; 
     }   c a t c h   ( e r r o r )   {   n e x t ( e r r o r ) ;   } 
 } ; 
  
 
 / /   P O S T   / a p i / a d m i n / r e s t o c k - r e q u e s t s / g e n e r a t e 
 e x p o r t s . g e n e r a t e R e s t o c k A l e r t s   =   a s y n c   ( r e q ,   r e s ,   n e x t )   = >   { 
     t r y   { 
         c o n s t   P r o d u c t   =   r e q u i r e ( " . . / m o d e l s / P r o d u c t " ) ; 
         c o n s t   R e s t o c k R e q u e s t   =   r e q u i r e ( " . . / m o d e l s / R e s t o c k R e q u e s t " ) ; 
         c o n s t   p r o d u c t s   =   a w a i t   P r o d u c t . f i n d ( ) ; 
         l e t   c o u n t   =   0 ; 
 
         f o r   ( c o n s t   p   o f   p r o d u c t s )   { 
             i f   ( p . v a r i a n t s   & &   p . v a r i a n t s . l e n g t h )   { 
                 f o r   ( c o n s t   v   o f   p . v a r i a n t s )   { 
                     i f   ( v . s t o c k   < =   5 )   { 
                         c o n s t   a l r e a d y P e n d i n g   =   a w a i t   R e s t o c k R e q u e s t . f i n d O n e ( { 
                             p r o d u c t I d :   p . _ i d , 
                             s i z e :   v . s i z e   | |   " " , 
                             c o l o r :   v . c o l o r   | |   " " , 
                             s t a t u s :   " p e n d i n g " 
                         } ) ; 
                         i f   ( ! a l r e a d y P e n d i n g )   { 
                             a w a i t   R e s t o c k R e q u e s t . c r e a t e ( { 
                                 p r o d u c t I d :   p . _ i d , 
                                 s i z e :   v . s i z e   | |   " " , 
                                 c o l o r :   v . c o l o r   | |   " " , 
                                 c u r r e n t S t o c k :   v . s t o c k , 
                                 s t a t u s :   " p e n d i n g " 
                             } ) ; 
                             c o u n t + + ; 
                         } 
                     } 
                 } 
             } 
         } 
         r e s . j s o n ( {   o k :   t r u e ,   g e n e r a t e d :   c o u n t   } ) ; 
     }   c a t c h   ( e r r o r )   {   n e x t ( e r r o r ) ;   } 
 } ; 
  
 