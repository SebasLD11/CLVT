// src/app/services/cart.service.ts
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, map } from 'rxjs'; // 👈 map para itemCount$
import { Product } from '../models/product.model';
import { colorLabel as clabel, colorValue as cvalue } from '../utils/color.util';

export interface CartItem {
  key: string; id: string; name: string; price: number; qty: number;
  img?: string; size?: string | null; color?: string | null; colorLabel?: string | null;
}

@Injectable({ providedIn: 'root' })
export class CartService {
  private key = 'bk-cart';
  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);

  private _items$ = new BehaviorSubject<CartItem[]>([]);
  items$ = this._items$.asObservable();

  /** (opcional) total de unidades para la badgeta del carrito */
  itemCount$ = this.items$.pipe(map(items => items.reduce((s, i) => s + i.qty, 0)));
  total$ = this.items$.pipe(
    map(items => Math.round(items.reduce((s,i)=> s + i.price * i.qty, 0) * 100) / 100)
  );
  constructor() {
    const initial = this.safeLoad();
    this._items$.next(this.normalizeLegacy(initial));
    this.save(this._items$.value);

    // 👇 opcional: sincroniza entre pestañas
    if (this.isBrowser) {
      window.addEventListener('storage', (e) => {
        if (e.key === this.key && e.newValue) {
          try { this._items$.next(JSON.parse(e.newValue)); } catch {}
        }
      });
    }
  }

  /** lee localStorage sin romper la app si hay JSON inválido */
  private safeLoad(): any[] {
    if (!this.isBrowser) return [];
    try { return JSON.parse(localStorage.getItem(this.key) ?? '[]'); }
    catch { return []; }
  }

  private normalizeLegacy(items: any[]): CartItem[] {
    if (!Array.isArray(items)) return [];
    return items.map((i: any) => {
      const id   = String(i?.id ?? '');
      const name = String(i?.name ?? '');
      const price= Number(i?.price ?? 0);
      const qty  = Math.max(1, Number(i?.qty ?? 1));
      const img  = i?.img ? String(i.img) : undefined;
      const sizeRaw = typeof i?.size === 'string' ? i.size : null;
      const size = sizeRaw ? String(sizeRaw).trim() : null; // 👈 normaliza talla
      const colorRaw = typeof i?.color === 'string' ? i.color : null;
      const color = colorRaw ? String(colorRaw).trim() : null; // 👈 normaliza color
      const colorLabel = typeof i?.colorLabel === 'string' && i.colorLabel.trim()
        ? i.colorLabel.trim()
        : (color ? clabel(color) : null);
      // 🔁 Migración: si la clave antigua no trae color (formato id__size),
      // genera la nueva (id__size__color). Usamos 'ANY' cuando no hay color.
      let key = String(i?.key ?? '');
      const parts = key.split('__');
      if (!key || parts.length < 3) {
        key = `${id}__${size ?? 'ONE'}__${color ?? 'ANY'}`;
      }

      return { key, id, name, price, qty, img, size, color, colorLabel  };
    }).filter(i => i.id);
  }

  private save(items: CartItem[]) {
    if (this.isBrowser) localStorage.setItem(this.key, JSON.stringify(items));
    this._items$.next(items);
  }

  add(p: Product, size: string | null = null, color: string | null = null, qty = 1) {
    const normSize = size ? size.trim() : null;             // 👈 normaliza talla
    const normColorRaw = color ? color.trim() : null;       // puede ser '#FF0000' o 'Rojo' o 'Rojo|#F00'
    const normColor = cvalue(normColorRaw);                 // valor real para clave/swatch
    const normColorLabel = clabel(normColorRaw);            // etiqueta legible
    const key = `${p._id}__${normSize ?? 'ONE'}__${normColor ?? 'ANY'}`;
    const items = [...this._items$.value];
    const idx = items.findIndex(x => x.key === key);

    if (idx >= 0) {
      items[idx] = { ...items[idx], qty: items[idx].qty + Math.max(1, qty) };
    } else {
      items.push({
        key,
        id: String(p._id),
        name: p.name,
        price: Number(p.price) || 0,
        qty: Math.max(1, qty),
        img: p.images?.[0],
        size: normSize,
        color: normColor,
        colorLabel: normColorLabel
      });
    }
    this.save(items);
  }

  inc(key: string) {
    this.save(this._items$.value.map(i => i.key === key ? { ...i, qty: i.qty + 1 } : i));
  }
  dec(key: string) {
    this.save(
      this._items$.value.flatMap(i =>
        i.key !== key ? i : (i.qty > 1 ? { ...i, qty: i.qty - 1 } : [])
      )
    );
  }

  /** 👇 nuevo: setea cantidad exacta (para inputs numéricos) */
  setQty(key: string, qty: number) {
    const q = Math.max(1, Math.floor(Number(qty) || 1));
    this.save(this._items$.value.map(i => i.key === key ? { ...i, qty: q } : i));
  }

  remove(key: string) {
    this.save(this._items$.value.filter(i => i.key !== key));
  }
  clear() { this.save([]); }

  /** total “bonito” para UI (redondeado a 2 decimales) */
  total() {
    const n = this._items$.value.reduce((s, i) => s + i.price * i.qty, 0);
    return Math.round(n * 100) / 100;
  }

  snapshot() { return this._items$.value; }

  /** payload para el checkout (shape que espera la API) */
  toCheckoutItems() {
    return this._items$.value.map(i => ({ id: i.id, qty: i.qty, size: i.size ?? null, color: i.color ?? null, colorLabel: i.colorLabel ?? clabel(i.color) }));
  }
}
