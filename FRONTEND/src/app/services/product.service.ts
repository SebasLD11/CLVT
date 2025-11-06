import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { Product } from '../models/product.model';
import { environment } from '../../environments/environment.prod';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private http = inject(HttpClient);

  list(): Observable<Product[]> {
    return this.http.get<any>(`${environment.apiUrl}/api/products`).pipe(
      map((data: any) => Array.isArray(data) ? data : (data?.items ?? []))
    );
  }
}
