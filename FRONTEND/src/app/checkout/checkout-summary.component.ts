// src/app/checkout/checkout-summary.component.ts
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CartService } from '../services/cart.service';
import { CheckoutService, ShippingSel } from '../services/checkout.service';
import { Router } from '@angular/router';
import { colorLabel } from '../utils/color.util';

@Component({
  standalone: true,
  selector: 'app-checkout-summary',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './checkout-summary.component.html',
  styleUrls: ['./checkout-summary.component.scss']
})
export class CheckoutSummaryComponent {
  getItemSizeLabel(item: any): string {
    if ((item.collectionTitle || item.productId?.collectionTitle) === 'SKATEBOARDS') return 'Medida';
    if (item.name?.toLowerCase().includes('taller')) return 'Horas';
    return 'Talla';
  }

  cart = inject(CartService);
  api = inject(CheckoutService);
  colorLabel = colorLabel;

  private fb = inject(NonNullableFormBuilder);
  private router = inject(Router);

  form = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    phone: ['', [Validators.required, Validators.minLength(6)]],
    line1: ['', [Validators.required, Validators.minLength(3)]],
    line2: [''],
    city: ['', [Validators.required, Validators.minLength(2)]],
    province: ['', [Validators.required, Validators.minLength(2)]],
    postalCode: ['', [Validators.required, Validators.minLength(3)]],
    country: ['ES', [Validators.required]],
    discountCode: ['']
  });

  loading = signal(false);
  orderId = signal<string|undefined>(undefined);
  shippingOptions = signal<ShippingSel[]>([]);
  shipping = signal<ShippingSel|undefined>(undefined);
  summary = signal<any|null>(null);

  items = computed(() =>
    this.cart.snapshot().map(i => ({
      id: i.id,
      qty: i.qty,
      size: (i.size && i.size.trim()) ? i.size.trim() : null,
      color: (i.color && i.color.trim()) ? i.color.trim() : null,
      colorLabel: (i.colorLabel && i.colorLabel.trim()) ? i.colorLabel.trim() : null
    }))
  );

  readonly grandTotal = computed(() => {
    const s = this.summary(); if (!s) return 0;
    const shipCost = this.shipping()?.cost ?? 0;
    return +(s.subtotal - s.discountAmount + shipCost).toFixed(2);
  });

  submitSummary() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    if (!this.items().length) return;
    this.loading.set(true);
    const buyer = this.form.getRawValue();

    this.api.summary({ items: this.items(), buyer, discountCode: buyer.discountCode || null })
      .subscribe({
        next: res => {
          this.orderId.set(res.orderId);
          this.summary.set(res);
          this.shippingOptions.set(res.shippingOptions || []);
          if (res.shipping) {
            this.shipping.set(res.shipping);
          } else if (res.shippingOptions && res.shippingOptions.length) {
            this.shipping.set(res.shippingOptions[0]);
          }
          this.loading.set(false);
        },
        error: err => {
          console.error('Error al calcular el resumen de compra:', err);
          this.loading.set(false);
        },
        complete: () => this.loading.set(false)
      });
  }

  chooseShipping(opt: ShippingSel) { this.shipping.set(opt); }

  finalize() {
    const id = this.orderId();
    const ship = this.shipping();
    const buyer = this.form.getRawValue();
    if (!id || !ship) return;

    this.loading.set(true);

    this.api.finalize({
      orderId: id,
      items: this.items(),
      buyer,
      discountCode: buyer.discountCode || null,
      shipping: ship
    }).subscribe({
        next: ({ orderId, receiptUrl, waVendor, share }) => {
            this.cart.clear();
            const wav = waVendor ?? share?.waVendor ?? null;
            const params: Record<string,string> = { oid: orderId, r: receiptUrl };
            if (wav) params['wav'] = wav;
            this.router.navigate(['thanks'], { queryParams: params, replaceUrl: true });
        },
        error: () => this.loading.set(false),
        complete: () => this.loading.set(false)
    });
  }

  backToShop(){ this.router.navigate(['/'], { fragment: 'shopTop' }); }
}
