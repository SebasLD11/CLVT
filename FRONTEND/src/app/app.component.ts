import { Component, HostBinding, HostListener, inject, signal, computed, effect  } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common';
import { Title, Meta } from '@angular/platform-browser';
import { Router, RouterOutlet, NavigationEnd  } from '@angular/router';
import { filter } from 'rxjs/operators';
import { ProductService } from './services/product.service';
import { CartService } from './services/cart.service';
import { CheckoutService } from './services/checkout.service';
import { Product } from './models/product.model';
import { colorLabel, colorValue } from './utils/color.util';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  private document = inject(DOCUMENT);
  private titleSvc = inject(Title);
  private metaSvc = inject(Meta);

  // 👇 deja SOLO estos helpers; elimina _overlays y updateOverlayState()
  private _lockScroll() { document.body.classList.add('no-scroll'); }
  private _syncScrollLock() {
    const anyOpen = !!(this.selected() || this.cartOpen() || this.filtersOpen());
    document.body.classList.toggle('no-scroll', anyOpen);
  } 
  private productSvc = inject(ProductService);
  cartSvc = inject(CartService);
  checkout = inject(CheckoutService);
  router = inject(Router);

  // Ruta /checkout | /thanks
  isRouted = signal(false);

  // Tema
  @HostBinding('class.dark')
  dark = typeof window !== 'undefined' && localStorage.getItem('clvt-theme') === 'dark';

  // Estado UI
  tab = signal<'home'|'shop'|'about'>('shop');
  products = signal<Product[]>([]);
  selected = signal<Product | null>(null);
  imgIndex = 0;
  cartOpen = signal(false);
  filtersOpen = signal(false);
  selectedSize: string | null = null;
  selectedColor: string | null = null;

  // helpers expuestos al template
  colorLabel = colorLabel;
  colorValue = colorValue;

  // foco previo (para restaurar al cerrar overlays)
  private _lastFocus: HTMLElement | null = null;
  

  // Banner de entrada
  showEntry = !(typeof window !== 'undefined' && sessionStorage.getItem('clvt-entry') === '1');

  // Fallback img
  readonly FALLBACK_IMG = 'assets/img/placeholder.png';
  onImgErr = (e: Event) => ((e.target as HTMLImageElement).src = this.FALLBACK_IMG);

  // ===== Filtros =====
  search = signal<string>('');
  selectedTags = signal<Set<string>>(new Set());
  priceMin = signal(0);
  priceMax = signal(0);
  filterMin = signal(0);
  filterMax = signal(0);

  // Tags
  readonly allTags = computed<string[]>(() => {
    const set = new Set<string>();
    for (const p of this.products()) if ((p as any).tag) set.add((p as any).tag);
    return Array.from(set).sort();
  });

  // Lista filtrada
  readonly filteredProducts = computed<Product[]>(() => {
    const q = this.search().trim().toLowerCase();
    const tags = this.selectedTags();
    const min = this.filterMin();
    const max = this.filterMax();

    return this.products().filter((p: any) => {
      const byName = !q || String(p.name).toLowerCase().includes(q);
      const byTag = tags.size === 0 || tags.has(p.tag);
      const priceNum = Number(p.price);
      const byPrice = Number.isFinite(priceNum) && priceNum >= min && priceNum <= max;
      return byName && byTag && byPrice;
    });
  });

  // Colapsado por colección
  collapsed = signal<Set<string>>(new Set());
  toggleCollection(title: string) {
    const s = new Set(this.collapsed());
    s.has(title) ? s.delete(title) : s.add(title);
    this.collapsed.set(s);
  }
  isCollapsed(title: string) { return this.collapsed().has(title); }

  constructor(){
    // flag /checkout
    const isR = (u: string) => u.startsWith('/checkout') || u.startsWith('/thanks');
    this.isRouted.set(isR(this.router.url));
    this.router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.isRouted.set(isR(this.router.url)));

    // productos + rangos de precio
    this.productSvc.list().subscribe(ps => {
      const normalized = ps.map(p => ({ ...p, images: (p.images ?? []).map(src => this.normalizeAsset(src)) }));
      this.products.set(normalized);
      const prices = normalized.map(p => Number((p as any).price)).filter(n => !isNaN(n));
      const min = prices.length ? Math.min(...prices) : 0;
      const max = prices.length ? Math.max(...prices) : 0;
      this.priceMin.set(min); this.priceMax.set(max);
      this.filterMin.set(min); this.filterMax.set(max);
    });

    // ✅ deja el focus management como lo tenías si quieres
    effect(() => {
        const main = document.querySelector('main') as HTMLElement | null;
        const topnav = document.querySelector('.topnav') as HTMLElement | null;

        // ❗️Solo modal o carrito vuelven inerte el fondo. Filtros NO.
        const inert = !!(this.selected() || this.cartOpen());
        if (main)  (main  as any).inert = inert;
        if (topnav)(topnav as any).inert = inert;

        queueMicrotask(() => {
            if (this.cartOpen())      this._focusById('cartClose');
            else if (this.selected()) this._focusById('modalClose');
            else if (this._lastFocus) { try{ this._lastFocus.focus(); }catch{} this._lastFocus = null; }
        });
    });

    // Dynamic SEO, Title, Meta and JSON-LD Structured Data
    effect(() => {
      const isR = this.isRouted();
      const p = this.selected();
      const currentTab = this.tab();

      if (isR) {
        if (this.router.url.startsWith('/checkout')) {
          this.titleSvc.setTitle('Pasarela de Pago | CLVT');
          this.metaSvc.updateTag({ name: 'description', content: 'Finaliza tu compra de forma segura con Bizum o transferencia en CLVT.' });
        } else if (this.router.url.startsWith('/thanks')) {
          this.titleSvc.setTitle('¡Gracias por tu compra! | CLVT');
          this.metaSvc.updateTag({ name: 'description', content: 'Tu pedido se ha procesado con éxito. Ponte en contacto por WhatsApp para finalizar los detalles.' });
        }
        return;
      }

      if (p) {
        const titleStr = `${p.name} — CLVT`;
        const descStr = p.description || `Compra ${p.name} en la tienda oficial CLVT. Ropa urbana exclusiva, edición limitada.`;
        this.titleSvc.setTitle(titleStr);
        this.metaSvc.updateTag({ name: 'description', content: descStr });

        // Schema.org Product
        const image = p.images?.[0] ? (p.images[0].startsWith('http') ? p.images[0] : `https://www.asociacionclvt.com/${p.images[0]}`) : '';
        const productSchema = {
          '@context': 'https://schema.org',
          '@type': 'Product',
          'name': p.name,
          'image': image,
          'description': descStr,
          'offers': {
            '@type': 'Offer',
            'url': 'https://www.asociacionclvt.com/',
            'priceCurrency': 'EUR',
            'price': p.price,
            'itemCondition': 'https://schema.org/NewCondition',
            'availability': this.isSoldOut(p) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock'
          },
          'brand': {
            '@type': 'Brand',
            'name': 'CLVT'
          }
        };
        this.updateJsonLd(productSchema);
      } else {
        if (currentTab === 'shop') {
          this.titleSvc.setTitle('CLVT | Tienda de Ropa Streetwear & Comunidad de Skate/Scooter');
          this.metaSvc.updateTag({ name: 'description', content: 'Asociación CULTIVATE - Tienda Oficial CLVT. Descubre sudaderas, camisetas y accesorios urbanos exclusivos.' });
        } else if (currentTab === 'about') {
          this.titleSvc.setTitle('Sobre Nosotros — Asociación CULTIVATE | CLVT');
          this.metaSvc.updateTag({ name: 'description', content: 'Conoce la Asociación CULTIVATE, nuestro compromiso con la integración social a través del deporte urbano como el skate y scooter.' });
        }

        // Schema.org OnlineStore
        const storeSchema = {
          '@context': 'https://schema.org',
          '@type': 'OnlineStore',
          'name': 'CLVT',
          'url': 'https://www.asociacionclvt.com/',
          'logo': 'https://www.asociacionclvt.com/assets/img/LogoCLVT.png',
          'description': 'Tienda Oficial de CLVT (Asociación CULTIVATE). Ropa urbana exclusiva, sudaderas, camisetas y cultura de skate/scooter.',
          'sameAs': [
            'https://www.instagram.com/asociacion_clvt'
          ],
          'contactPoint': {
            '@type': 'ContactPoint',
            'telephone': '+34722331523',
            'contactType': 'customer service'
          }
        };
        this.updateJsonLd(storeSchema);
      }
    });

    if (typeof window !== 'undefined') {
      const accepted = localStorage.getItem('clvt-cookies-accepted');
      this.showCookiesBanner.set(!accepted);
    }
  }

  private updateJsonLd(schema: any) {
    if (typeof window === 'undefined') return;
    let script = this.document.getElementById('clvt-jsonld') as HTMLScriptElement;
    if (!script) {
      script = this.document.createElement('script') as HTMLScriptElement;
      script.id = 'clvt-jsonld';
      script.type = 'application/ld+json';
      this.document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schema);
  }

  // ===============================
  //  ORDEN POR FECHA DE COLECCIÓN
  // ===============================
  private toTs(v: any): number {
    try {
      if (!v) return 0;
      if (v && typeof (v as any).toDate === 'function') v = (v as any).toDate(); // Firestore Timestamp
      if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
      const t = new Date(v as string).getTime();
      return Number.isFinite(t) ? t : 0;
    } catch { return 0; }
  }

  readonly groups = computed(() => {
    const map = new Map<string, { items: Product[]; date: number }>();
    for (const p of this.filteredProducts()) {
      const anyP: any = p as any;
      const key = (anyP.collectionTitle || 'Sin colección').trim() || 'Sin colección';
      const collectionTs = this.toTs(anyP.collectionAt) || this.toTs(anyP.collectionDate);
      const productTs = collectionTs || this.toTs(anyP.createdAt) || this.toTs(anyP.updatedAt);
      const entry = map.get(key);
      if (!entry) map.set(key, { items: [p], date: productTs });
      else { entry.items.push(p); entry.date = Math.max(entry.date, productTs); }
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        const d = b[1].date - a[1].date; if (d !== 0) return d;
        if (a[0] === 'Sin colección') return 1;
        if (b[0] === 'Sin colección') return -1;
        return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' });
      })
      .map(([title, { items }]) => ({ title, items }));
  });

  // ===============================
  //  TALLAS DISPONIBLES / SOLD OUT
  // ===============================
  usesSizes(p: Product): boolean {
    const any: any = p as any;
    return Array.isArray(any.sizes) && any.sizes.length > 0;
  }

  /** ¿hay un array explícito de disponibilidad? (availableSizes | Disponibles) */
  private hasExplicitAvailArray(p: Product): boolean {
    const any: any = p as any;
    return ('availableSizes' in any) || ('Disponibles' in any);
  }

  /** Devuelve el array de tallas disponibles “real”:
    * - Si hay availableSizes (o Disponibles), usa ese.
    * - Si NO hay array explícito de availability pero sí hay tallas, asumimos todas (fallback → sizes).
  */
  availableSizesOf(p: Product): string[] {
    const any: any = p as any;
    if (Array.isArray(any.availableSizes)) return any.availableSizes.map((s: any) => String(s));
    if (Array.isArray(any.Disponibles))    return any.Disponibles.map((s: any) => String(s));
    if (Array.isArray(any.sizes))          return any.sizes.map((s: any) => String(s));
    return [];
  }

  /** true si el producto está agotado:
     * - Usa tallas
     * - Existe array explícito de disponibilidad
     * - Ese array está vacío
  */
  isSoldOut(p: Product): boolean {
    const any: any = p as any;
    if (!this.usesSizes(any)) return false;
    if (!this.hasExplicitAvailArray(any)) return false;
    return this.availableSizesOf(any).length === 0;
  }

  /** disponibilidad por talla para el modal */
  isSizeAvailable(p: Product, s: string): boolean {
    const any: any = p as any;
    if (!this.usesSizes(any)) return true; // no usa tallas
    // Si hay array explícito:
    if (this.hasExplicitAvailArray(any)) {
        const av = this.availableSizesOf(any);     // aquí sí respeta vacío = nada disponible
        return av.includes(s);
    }
    // Si NO hay array explícito, todas las sizes listadas se consideran disponibles
    return true;
  }

  firstAvailableSize(p: Product): string | null {
    const av = this.availableSizesOf(p);
    // Si está sold-out, no preseleccionar nada
    if (this.isSoldOut(p)) return null;
    return av.length ? av[0] : null;
  }

  // ===============================
  //  OVERLAYS (métodos sincrónicos)
  // ===============================
  // ===== Filtros =====
  openFilters(){
    this._rememberFocus();
    this.filtersOpen.set(true);
    this._lockScroll();          // bloquea scroll del body
  }
  closeFilters(){
    this.filtersOpen.set(false);
    this._syncScrollLock();      // desbloquea si no queda nada abierto
    this._restoreFocusIfNoOverlay();
  }

  // ===== Carrito =====
  openCart(){
    this._rememberFocus();
    this.cartOpen.set(true);
    this._lockScroll();
  }
  closeCart(){
    this.cartOpen.set(false);
    this._syncScrollLock();
    this._restoreFocusIfNoOverlay();
  }

  // ===== Modal producto =====
  openProduct(p: Product){
    this._rememberFocus();
    this.selected.set(p);
    this.imgIndex = 0;
    this.selectedSize  = this.firstAvailableSize(p);
    this.selectedColor = Array.isArray((p as any)?.colors) && (p as any).colors.length ? (p as any).colors[0] : null;
    this._lockScroll();
  }
  closeProduct(){
    this.selected.set(null);
    this.selectedSize = null;
    this.selectedColor = null;
    this._syncScrollLock();
    this._restoreFocusIfNoOverlay();
  }

  private anyOverlayOpen(){ return !!(this.selected() || this.cartOpen() || this.filtersOpen()); }

  private _restoreFocusIfNoOverlay(){
    if (!this.anyOverlayOpen() && this._lastFocus) {
      try { this._lastFocus.focus(); } catch {}
      this._lastFocus = null;
    }
  }

  // ===============================
  //  Acciones de catálogo / checkout
  // ===============================
  toggleTheme(){
    this.dark = !this.dark;
    localStorage.setItem('clvt-theme', this.dark? 'dark':'light');
  }

  addFromModal(){
    const current = this.selected();
    if(!current) return;
    if (this.isSoldOut(current)) return;  // ⛔️ no permitir añadir si está agotado

    const p: any = current;
    const needsSize = this.usesSizes(p);
    const size = needsSize ? (this.selectedSize ?? null) : null;
    if (needsSize && (!size || !this.isSizeAvailable(p, size))) return;

    const color = (Array.isArray(p?.colors) && p.colors.length ? this.selectedColor : null) || null;

    this.cartSvc.add(current, size, color);
    this.closeProduct();
    this.openCart();
  }

  onAddClicked(p: Product){
    // Si está agotado, no hace nada
    if (this.isSoldOut(p)) return;

    const any: any = p as any;
    const av = this.availableSizesOf(p);

    const needsChoice =
        (this.usesSizes(p) && av.length !== 1)   // si hay 0 o más de 1 → abre modal
        || (Array.isArray(any.colors) && any.colors.length > 0);

    if (needsChoice) {
        this.openProduct(p);
    } else {
        // exactly 1 size disponible, sin colores
        const only = av[0] || null;
        this.cartSvc.add(p, only, null);
        this.openCart();
    }
  }

  checkoutNow(){
    const items = this.cartSvc.toCheckoutItems();
    if(!items.length) return;
    this.closeCart();
    this.router.navigate(['/checkout']);
  }

  enterShop(){
    this.showEntry = false;
    this.tab.set('shop');
    try {
      document.body.classList.remove('no-scroll');
      const main = document.querySelector('main') as HTMLElement | null;
      const topnav = document.querySelector('.topnav') as HTMLElement | null;
      if (main) (main as any).inert = false;
      if (topnav) (topnav as any).inert = false;
    } catch {}
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('clvt-entry','1');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const target = document.getElementById('shopTop') || (document.querySelector('.shop') as HTMLElement | null);
          if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          else window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }
  }

  // ===============================
  //  Viewer / navegación
  // ===============================
  next(){ const current = this.selected(); if(current) this.imgIndex = (this.imgIndex + 1) % current.images.length; }
  prev(){ const current = this.selected(); if(current) this.imgIndex = (current.images.length - 1 + this.imgIndex) % current.images.length; }

  private _rememberFocus() { this._lastFocus = (document.activeElement as HTMLElement) ?? null; }
  private _focusById(id: string) { const el = document.getElementById(id) as HTMLElement | null; if (el) el.focus(); }

  // ===============================
  //  Utils
  // ===============================
  private normalizeAsset(src: string): string {
    if (!src) return this.FALLBACK_IMG;
    if (/^https?:\/\//i.test(src)) return src;
    return src.replace(/^\/+/, '');
  }

  // Accesos rápidos
  @HostListener('window:keydown', ['$event'])
  handleKey(e: KeyboardEvent){
    const current = this.selected();
    if (current) {
      if (e.key === 'ArrowRight') this.next();
      if (e.key === 'ArrowLeft') this.prev();
      if (e.key === 'Escape') this.closeProduct();
    } else if (this.cartOpen() && e.key === 'Escape') {
      this.closeCart();
    }
  }

  trackById = (_: number, p: Product) => p._id;
  toggleTag(tag: string){
    const s = new Set(this.selectedTags());
    s.has(tag) ? s.delete(tag) : s.add(tag);
    this.selectedTags.set(s);
  }
  tagChecked(tag: string){ return this.selectedTags().has(tag); }
  clearFilters(){
    this.search.set('');
    this.selectedTags.set(new Set());
    this.filterMin.set(this.priceMin());
    this.filterMax.set(this.priceMax());
  }

  activeLegalModal = signal<'aviso'|'privacidad'|'cookies'|null>(null);
  showCookiesBanner = signal<boolean>(false);
  
  openLegalModal(type: 'aviso'|'privacidad'|'cookies') {
    this.activeLegalModal.set(type);
  }

  closeLegalModal() {
    this.activeLegalModal.set(null);
  }

  acceptCookies() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clvt-cookies-accepted', 'true');
    }
    this.showCookiesBanner.set(false);
  }

  declineCookies() {
    if (typeof window !== 'undefined') {
      localStorage.setItem('clvt-cookies-accepted', 'false');
    }
    this.showCookiesBanner.set(false);
  }

  scrollToTop() {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  goToAbout() {
    this.tab.set('about');
    this.scrollToTop();
  }

  goToContact() {
    this.tab.set('about');
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        const target = document.getElementById('contactSection');
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 80);
    }
  }
}