import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // If there is a token in localStorage, we can trust it for the client routing check,
  // the actual API requests are verified on the backend anyway.
  if (auth.getToken() || auth.isLoggedIn()) {
    return true;
  }

  router.navigate(['/login']);
  return false;
};

export const adminGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // For admin routes, we check if the user is authenticated and is an admin
  if (auth.getToken() && (auth.isAdmin() || (auth.currentUser()?.role === 'admin'))) {
    return true;
  }

  router.navigate(['/']);
  return false;
};
