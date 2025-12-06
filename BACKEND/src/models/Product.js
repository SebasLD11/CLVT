const { Schema, model } = require('mongoose');

const ProductSchema = new Schema(
{
    name: { type: String, required: true },
    // 👇 NUEVO
    description: { type: String, default: '' },
    price: { type: Number, required: true }, // en EUR, por ejemplo 29.9
    tag: { type: String, enum: ['new', 'best', 'sale', 'drop'], default: 'new' },
    images: { type: [String], default: [] }, // hasta 5 imágenes
    sizes: { type: [String], default: []},
    // ✅ NUEVO: tallas disponibles (subset de sizes)
    availableSizes: { type: [String], default: [] },
    // 👇 Nuevos colores disponibles para la prenda
    colors: { type: [String], default: [] },
    // 👇 NUEVO: título de la colección a la que pertenece el producto
    collectionTitle: { type: String, default: 'Sin colección', index: true },
},
{ timestamps: true },
);
// en el schema, además de timestamps: true
ProductSchema.index({ collectionTitle: 1, createdAt: -1 });
module.exports = model('Product', ProductSchema);