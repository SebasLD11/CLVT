import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { Product } from '../models/product.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  products = signal<Product[]>([]);

  list(): Observable<Product[]> {
    return this.http.get<any>(`${environment.apiUrl}/api/products`).pipe(
      map((data: any) => Array.isArray(data) ? data : (data?.items ?? []))
    );
  }

  refresh() {
    this.list().subscribe(ps => {
      const normalized = ps.map(p => ({
        ...p,
        images: (p.images ?? []).map(src => {
          if (!src) return 'assets/img/placeholder.png';
          if (/^https?:\/\//i.test(src)) return src;
          const cleaned = src.replace(/^\/+/, '');
          if (cleaned.startsWith('uploads/')) {
            return `${environment.apiUrl.replace(/\/$/, '')}/${cleaned}`;
          }
          return `/${cleaned}`;
        })
      }));
      this.products.set(normalized);
    });
  }
}
