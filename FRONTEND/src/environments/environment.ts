// src/environments/environment.prod.ts
export const environment = {
  production: false,
  apiUrl: 'https://clvt-e0a9be82df41.herokuapp.com',                 // ← sin backend en prod por ahora
  useLocalProducts: false,     // ← activamos mock local
  checkoutEnabled: true      // ← desactiva botón Checkout
};
