import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environments/environment';

export interface UserAddress {
  line1?: string;
  line2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  memberId?: string;
  role: 'member' | 'admin';
  status: 'active' | 'inactive';
  address?: UserAddress;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl.replace(/\/$/, '');

  // User session signals
  currentUser = signal<User | null>(null);
  isLoggedIn = computed(() => !!this.currentUser());
  isAdmin = computed(() => this.currentUser()?.role === 'admin');

  constructor() {
    this.loadToken();
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('clvt_token');
    }
    return null;
  }

  private loadToken() {
    const token = this.getToken();
    if (token) {
      // Fetch user profile immediately
      this.getMe().subscribe({
        next: (res) => this.currentUser.set(res.user),
        error: () => this.logout()
      });
    }
  }

  register(payload: any): Observable<any> {
    return this.http.post<any>(`${this.base}/api/auth/register`, payload).pipe(
      tap(res => {
        if (res.token) {
          localStorage.setItem('clvt_token', res.token);
          this.currentUser.set(res.user);
        }
      })
    );
  }

  login(payload: any): Observable<any> {
    return this.http.post<any>(`${this.base}/api/auth/login`, payload).pipe(
      tap(res => {
        if (res.token) {
          localStorage.setItem('clvt_token', res.token);
          this.currentUser.set(res.user);
        }
      })
    );
  }

  logout() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('clvt_token');
    }
    this.currentUser.set(null);
    this.router.navigate(['/']);
  }

  getMe(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.base}/api/auth/me`);
  }

  updateMe(payload: any): Observable<{ ok: boolean; user: User }> {
    return this.http.put<{ ok: boolean; user: User }>(`${this.base}/api/auth/me`, payload).pipe(
      tap(res => {
        if (res.ok) {
          this.currentUser.set(res.user);
        }
      })
    );
  }
}
