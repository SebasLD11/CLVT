import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, HttpInterceptorFn, withInterceptors } from '@angular/common/http';
import { provideRouter, Routes, withInMemoryScrolling } from '@angular/router';
import { authGuard, adminGuard } from './guards/auth.guard';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('clvt_token');
    if (token) {
      req = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
    }
  }
  return next(req);
};

export const routes: Routes = [
  {
    path: 'checkout',
    loadComponent: () => import('./checkout/checkout-summary.component').then(m => m.CheckoutSummaryComponent)
  },
  {
    path: 'thanks',
    loadComponent: () => import('./thanks/thanks.component').then(m => m.ThanksComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard]
  },
  {
    path: 'admin',
    loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent),
    canActivate: [adminGuard]
  }
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling:'enabled', scrollPositionRestoration:'top' })),
  ]
};
