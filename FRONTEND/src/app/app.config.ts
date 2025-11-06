// src/app/app.config.ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideRouter, Routes, withInMemoryScrolling } from '@angular/router';

export const routes: Routes = [
  // solo la página de checkout; el resto de tu app sigue en AppComponent
   {
    path: 'checkout',
    loadComponent: () => import('./checkout/checkout-summary.component').then(m => m.CheckoutSummaryComponent)
  },
  {
    path: 'thanks',
    loadComponent: () => import('./thanks/thanks.component').then(m => m.ThanksComponent)
  },
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptorsFromDi()),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling:'enabled', scrollPositionRestoration:'top' })),
  ]
};
