require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');
const Product = require('../src/models/Product');
const RestockRequest = require('../src/models/RestockRequest');
const StockTransaction = require('../src/models/StockTransaction');

async function seed() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || 'CLVT-BD';

  if (!uri) {
    console.error('MONGO_URI is missing in your .env file');
    process.exit(1);
  }

  console.log('[Seed] Connecting to MongoDB...');
  await mongoose.connect(uri, { dbName });
  console.log('[Seed] Connected.');

  // 1. Create Admin User if not exists
  console.log('[Seed] Checking admin user...');
  let adminUser = await User.findOne({ email: 'admin@clvt.com' });
  if (!adminUser) {
    console.log('[Seed] Creating admin user...');
    const hashedAdminPassword = await bcrypt.hash('adminpassword123', 10);
    adminUser = await User.create({
    email: 'admin@clvt.com',
    password: hashedAdminPassword,
    fullName: 'Administrador CLVT',
    phone: '+34 600 111 222',
    memberId: 'CLVT-0001',
    role: 'admin',
    status: 'active',
    address: {
      line1: 'Calle Falsa 123',
      city: 'Madrid',
      province: 'Madrid',
      postalCode: '28001',
    }
  });
  }

  // 2. Create Regular Member User if not exists
  console.log('[Seed] Checking member user...');
  let memberUser = await User.findOne({ email: 'socio@clvt.com' });
  if (!memberUser) {
    console.log('[Seed] Creating member user...');
    const hashedMemberPassword = await bcrypt.hash('memberpassword123', 10);
    memberUser = await User.create({
      email: 'socio@clvt.com',
      password: hashedMemberPassword,
      fullName: 'Socio Cultivate',
      phone: '+34 600 222 333',
      memberId: 'CLVT-0452',
      role: 'member',
      status: 'active',
      address: {
        line1: 'Avenida de la Constitución 15',
        city: 'Barcelona',
        province: 'Barcelona',
        postalCode: '08001',
        country: 'ES'
      }
    });
  }

  // 3. Create Products with Variants & Stock
  const productCount = await Product.countDocuments({});
  if (productCount === 0) {
    console.log('[Seed] Creating products with variants and stock levels...');
    
    const p1 = await Product.create({
    name: 'Sudadera CLVT Basic',
    description: 'Sudadera de algodón orgánico con capucha y logo CLVT bordado en el pecho.',
    price: 49.99,
    tag: 'new',
    collectionTitle: 'CLVT Originals',
    images: ['assets/img/sudCLVTB.png', 'assets/img/sudCLVTB2.png', 'assets/img/sudCLVTG.png'],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: ['Black', 'Grey'],
    availableSizes: ['S', 'M', 'L', 'XL'],
    variants: [
      { size: 'S', color: 'Black', stock: 10 },
      { size: 'M', color: 'Black', stock: 15 },
      { size: 'L', color: 'Black', stock: 4 }, // low stock (should alert!)
      { size: 'XL', color: 'Black', stock: 12 },
      { size: 'S', color: 'Grey', stock: 8 },
      { size: 'M', color: 'Grey', stock: 10 },
      { size: 'L', color: 'Grey', stock: 2 }, // low stock (should alert!)
      { size: 'XL', color: 'Grey', stock: 5 } // low stock (should alert!)
    ]
  });

  const p2 = await Product.create({
    name: 'Camiseta CLVT Logo',
    description: 'Camiseta clásica streetwear con logo serigrafiado CLVT.',
    price: 24.99,
    tag: 'best',
    collectionTitle: 'CLVT Originals',
    images: ['assets/img/camiseta.png', 'assets/img/cami.BK.jpg'],
    sizes: ['S', 'M', 'L'],
    colors: ['White', 'Black'],
    availableSizes: ['S', 'M', 'L'],
    variants: [
      { size: 'S', color: 'White', stock: 12 },
      { size: 'M', color: 'White', stock: 20 },
      { size: 'L', color: 'White', stock: 3 }, // low stock
      { size: 'S', color: 'Black', stock: 15 },
      { size: 'M', color: 'Black', stock: 25 },
      { size: 'L', color: 'Black', stock: 8 }
    ]
  });

  const p3 = await Product.create({
    name: 'Gorra CLVT Streetwear',
    description: 'Gorra de visera plana ajustable tipo snapback con logo CLVT.',
    price: 19.99,
    tag: 'drop',
    collectionTitle: 'Accesorios',
    images: ['assets/img/gorra.png', 'assets/img/GorraOlive.jpg'],
    sizes: [],
    colors: ['Black', 'Navy'],
    availableSizes: [],
    variants: [
      { size: '', color: 'Black', stock: 8 },
      { size: '', color: 'Navy', stock: 12 }
    ]
  });

  const p4 = await Product.create({
    name: 'Tabla Skateboard CLVT One',
    description: 'Tabla oficial de skate CLVT de 7 láminas de arce canadiense.',
    price: 54.99,
    tag: 'new',
    collectionTitle: 'Skateboards',
    images: ['assets/img/skate.png'],
    sizes: ['8.0', '8.25'],
    colors: [],
    availableSizes: ['8.0', '8.25'],
    variants: [
      { size: '8.0', color: '', stock: 6 },
      { size: '8.25', color: '', stock: 1 } // low stock (should alert!)
    ]
  });

  // 4. Create initial Stock Transactions for seeded products
  console.log('[Seed] Logging initial stock adjustments...');
  const seededProducts = [p1, p2, p3, p4];

  for (const p of seededProducts) {
    for (const v of p.variants) {
      await StockTransaction.create({
        productId: p._id,
        size: v.size,
        color: v.color,
        quantityChange: v.stock,
        reason: 'manual_adjustment',
        performedBy: adminUser._id
      });

      // Generate initial Restock Request alert for low stock items
      if (v.stock <= 5) {
        await RestockRequest.create({
          productId: p._id,
          size: v.size,
          color: v.color,
          currentStock: v.stock,
          status: 'pending'
        });
      }
    }
  }
  } else {
    console.log('[Seed] Database already has products. Skipping product seed.');
  }

  console.log('[Seed] Seeding completed successfully!');
  console.log('----------------------------------------------------');
  console.log('Credenciales de Acceso:');
  console.log('  Administrador:');
  console.log('    Email:    admin@clvt.com');
  console.log('    Password: adminpassword123');
  console.log('  Socio/Miembro:');
  console.log('    Email:    socio@clvt.com');
  console.log('    Password: memberpassword123');
  console.log('----------------------------------------------------');

  await mongoose.disconnect();
  console.log('[Seed] Disconnected.');
}

seed().catch(err => {
  console.error('[Seed] Error seeding database:', err);
  mongoose.disconnect();
});
