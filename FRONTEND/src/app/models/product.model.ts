export interface Product {
    _id: string;
    name: string;
    description?: string;  // 👈 NUEVO
    price: number;
    tag: 'new'|'best'|'sale'|'drop';
    images: string[]; // hasta 5
    sizes: string[];
    /** Subconjunto de sizes que está disponible para la compra */
    availableSizes?: string[];
    /** Colores disponibles (nombre o código). Ej.: 'Negro', 'White', '#000' */
    colors?: string[];
    // 👇 NUEVO
    collectionTitle?: string; // fallback en UI si viene vacío
    variants?: Array<{ size: string; color: string; stock: number; }>;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}