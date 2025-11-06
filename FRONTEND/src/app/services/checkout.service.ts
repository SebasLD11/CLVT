import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface CheckoutItem { id:string; qty:number; size?:string|null; }
export interface Buyer{
  fullName:string; email:string; phone:string; line1:string; line2?:string|null;
  city:string; province:string; postalCode:string; country:string;
}
export interface ShippingSel{ carrier:string; service:string; zone:string; cost:number; }

export interface FinalizeResponse {
  ok: true;
  orderId: string;
  receiptUrl: string;
  waVendor?: string;
  share?: { waVendor?: string };
}

@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private http = inject(HttpClient);
  private base = environment.apiUrl.replace(/\/$/, '');

  summary(payload: { items: CheckoutItem[]; buyer: Buyer; discountCode?: string|null }) {
    return this.http.post<any>(`${this.base}/api/pay/summary`, payload);
  }
  finalize(payload: {
    orderId?: string;
    items: CheckoutItem[];
    buyer: Buyer;
    discountCode?: string|null;
    shipping: ShippingSel
  }) {
    return this.http.post<FinalizeResponse>(`${this.base}/api/pay/finalize`, payload);
  }
}
