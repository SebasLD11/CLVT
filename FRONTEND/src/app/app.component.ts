import { Component, HostBinding, HostListener, inject, signal, computed, effect  } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, NavigationEnd  } from '@angular/router';
import { filter } from 'rxjs/operators'; // 👈
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
    private productSvc = inject(ProductService);
    cartSvc = inject(CartService);
    checkout = inject(CheckoutService);
    router = inject(Router);   // 👈 añade esta línea
    /** ¿Estamos en /checkout? (reactivo) */
    isRouted = signal(false);
    // Guarda el último foco para devolverlo al cerrar (opcional)
    private _lastFocus: HTMLElement | null = null;

    @HostBinding('class.dark') 
    dark = typeof window !== 'undefined' && localStorage.getItem('bk-theme') === 'dark';

    tab = signal<'home'|'shop'|'about'>('shop');
    products = signal<Product[]>([]);
    selected: Product | null = null;
    imgIndex = 0;
    cartOpen = false;
    selectedSize: string | null = null;
    selectedColor: string | null = null;
    colorLabel = colorLabel;
    // (opcional) si usas el swatch con hex
    colorValue = colorValue;
    // === Helpers de tallas disponibles ===
    /** Devuelve la lista de tallas disponibles del producto.
     *  Soporta availableSizes, alias 'Disponibles' o cae a sizes.
     */
    availableSizesOf(p: Product): string[] {
        const anyP: any = p as any;
        const src = Array.isArray(anyP.availableSizes) ? anyP.availableSizes
                : (Array.isArray(anyP.Disponibles) ? anyP.Disponibles
                : (Array.isArray(anyP.sizes) ? anyP.sizes : []));
        return src.map((s: any) => String(s));
    }
    /** ¿La talla s está disponible en p? Si no hay info, se asume disponible. */
    isSizeAvailable(p: Product, s: string): boolean {
        const av = this.availableSizesOf(p);
        return av.length ? av.includes(s) : true;
    }
    /** Primera talla disponible o null */
    firstAvailableSize(p: Product): string | null {
        const av = this.availableSizesOf(p); return av.length ? av[0] : null;
    }
    // Muestra el banner solo la primera vez por sesión
    showEntry = !(typeof window !== 'undefined' && sessionStorage.getItem('bk-entry') === '1');

    // ✅ fallback centralizado
    readonly FALLBACK_IMG = 'assets/img/placeholder.png';
    onImgErr = (e: Event) => ((e.target as HTMLImageElement).src = this.FALLBACK_IMG);

     // ===== Filtros =====
    filtersOpen = false;                    // drawer de filtros en móvil
    search = signal<string>('');           // búsqueda por nombre
    selectedTags = signal<Set<string>>(new Set());
    priceMin = signal(0);
    priceMax = signal(0);
    filterMin = signal(0);
    filterMax = signal(0);

    // Tags detectados (new, best, sale, drop…)
    readonly allTags = computed<string[]>(() => {
        const set = new Set<string>();
        for (const p of this.products()) if (p.tag) set.add(p.tag);
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

    // Estado de colecciones colapsadas (por título)
    collapsed = signal<Set<string>>(new Set());
    toggleCollection(title: string) {
        const s = new Set(this.collapsed());
        s.has(title) ? s.delete(title) : s.add(title);
        this.collapsed.set(s);
    }
    isCollapsed(title: string) { return this.collapsed().has(title); }

    constructor(){
        // Inicializa y mantén sincronizado el flag de ruta
        const isR = (u: string) => u.startsWith('/checkout') || u.startsWith('/thanks');
        this.isRouted.set(isR(this.router.url));
        this.router.events.pipe(filter(e => e instanceof NavigationEnd))
        .subscribe(() => this.isRouted.set(isR(this.router.url)));
        this.productSvc.list().subscribe(ps => {
            const normalized = ps.map(p => ({ ...p, images: (p.images ?? []).map(src => this.normalizeAsset(src)) }));
            this.products.set(normalized);
            const prices = normalized.map(p => Number(p.price)).filter(n => !isNaN(n));
            const min = prices.length ? Math.min(...prices) : 0;
            const max = prices.length ? Math.max(...prices) : 0;
            this.priceMin.set(min); this.priceMax.set(max);
            this.filterMin.set(min); this.filterMax.set(max);
        });
        // ✅ Mejora accesible (opcional): bloquear scroll y hacer inerte el fondo
        effect(() => {
            console.log('Orden colecciones →', this.groups().map(g => ({ title: g.title, n: g.items.length })));
            // en el effect(): ya no depende de tab
            const overlayOpen = this.cartOpen || this.filtersOpen || !!this.selected;

            // Bloquea scroll del body
            document.body.classList.toggle('no-scroll', overlayOpen);

            // Marca fondo como inert cuando hay MODAL (producto) o CARRITO
            const main = document.querySelector('main') as HTMLElement | null;
            const topnav = document.querySelector('.topnav') as HTMLElement | null;
            const inert = !!(this.selected || this.cartOpen );
            if (main) (main as any).inert = inert;
            if (topnav) (topnav as any).inert = inert;

            // Gestión de foco: al abrir, enfoca botón cerrar del overlay
            queueMicrotask(() => {
                if (this.cartOpen) {
                    this._focusById('cartClose');
                } else if (this.selected) {
                    this._focusById('modalClose');
                } else if (this._lastFocus) {
                // al cerrar, devolvemos el foco donde estaba
                    this._lastFocus.focus();
                    this._lastFocus = null;
                }
            });
        });
    }

    // ===============================
    //  ORDEN POR FECHA DE COLECCIÓN
    // ===============================

    /** Normaliza fecha: ISO string | Date | Firestore Timestamp -> epoch (ms). Devuelve 0 si no válido. */
    private toTs(v: any): number {
        try {
        if (!v) return 0;
        // Firestore Timestamp
        if (v && typeof (v as any).toDate === 'function') v = (v as any).toDate();
        if (v instanceof Date && !isNaN(v.getTime())) return v.getTime();
        const t = new Date(v as string).getTime();
        return Number.isFinite(t) ? t : 0;
        } catch {
        return 0;
        }
    }

    /** Grupos por colección ordenados por fecha desc:
     * - Usa p.collectionAt || p.collectionDate si existe (misma para todos los items recomendable).
     * - Si no, cae a p.createdAt || p.updatedAt.
     * - "Sin colección" va al final.
     */
    readonly groups = computed(() => {
        // title -> { items, date }
        const map = new Map<string, { items: Product[]; date: number }>();

        for (const p of this.filteredProducts()) {
        const anyP: any = p as any;
        const key = (anyP.collectionTitle || 'Sin colección').trim() || 'Sin colección';

        // 1) fecha explícita de colección si viene
        const collectionTs = this.toTs(anyP.collectionAt) || this.toTs(anyP.collectionDate);
        // 2) fallback a fechas del producto
        const productTs = collectionTs || this.toTs(anyP.createdAt) || this.toTs(anyP.updatedAt);

        const entry = map.get(key);
        if (!entry) {
            map.set(key, { items: [p], date: productTs });
        } else {
            entry.items.push(p);
            // representantes por la MÁS RECIENTE de la colección
            entry.date = Math.max(entry.date, productTs);
        }
        }

        return Array.from(map.entries())
        .sort((a, b) => {
            // 1) fecha DESC
            const d = b[1].date - a[1].date;
            if (d !== 0) return d;
            // 2) "Sin colección" al final
            if (a[0] === 'Sin colección') return 1;
            if (b[0] === 'Sin colección') return -1;
            // 3) desempate alfabético estable
            return a[0].localeCompare(b[0], 'es', { sensitivity: 'base' });
        })
        .map(([title, { items }]) => ({ title, items }));
    });

    private normalizeAsset(src: string): string {
        if (!src) return this.FALLBACK_IMG;
        if (/^https?:\/\//i.test(src)) return src; // ya es absoluta
        return src.replace(/^\/+/, ''); // quita / inicial -> assets/...
    }

    trackById = (_: number, p: Product) => p._id;

    // Helpers filtros
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

    toggleTheme(){ 
        this.dark = !this.dark; 
        localStorage.setItem('bk-theme', this.dark? 'dark':'light'); 
    }

    openProduct(p: Product){ 
        // Guarda el foco ANTES de abrir el modal
        this._rememberFocus();

        this.selected = p;
        this.imgIndex = 0;
        // preselecciona primera talla si hay
        // ✅ preselecciona la PRIMERA talla DISPONIBLE (o null si no hay)
        this.selectedSize = this.firstAvailableSize(p);
        this.selectedColor = Array.isArray((p as any)?.colors) && (p as any).colors.length ? (p as any).colors[0] : null;
    }
    closeProduct(){ 
        this.selected = null;
        this.selectedSize = null; 
        this.selectedColor = null;
    }                  // 👈 NUEVO
    next(){ if(this.selected) this.imgIndex = (this.imgIndex + 1) % this.selected.images.length; }
    prev(){ if(this.selected) this.imgIndex = (this.imgIndex - 1 + this.selected.images.length) % this.selected.images.length; }

    // Guarda el foco actual antes de abrir overlays
    private _rememberFocus() {
        this._lastFocus = (document.activeElement as HTMLElement) ?? null;
    }
    private _focusById(id: string) {
        const el = document.getElementById(id) as HTMLElement | null;
        if (el) el.focus();
    }
    addFromModal(){
        if(!this.selected) return;
        const p: any = this.selected as any;
        // Si el producto maneja tallas, exige una talla DISPONIBLE
        const needsSize = Array.isArray(p?.sizes) && p.sizes.length > 0;
        const size = needsSize ? (this.selectedSize ?? null) : null;
        if (needsSize && (!size || !this.isSizeAvailable(p, size))) return; // guard-rail
        const color = (this.selected?.colors?.length ? this.selectedColor : null) || null;

        // Guarda el foco ANTES de abrir el carrito
        this._rememberFocus();

        this.cartSvc.add(this.selected, size, color);
        this.closeProduct();      // <- basta con esto (evita el set null duplicado)
        this.cartOpen = true;     // abre el carrito para feedback inmediato
    }

    checkoutNow(){
        const items = this.cartSvc.toCheckoutItems();
        if(!items.length) return;
        this.cartOpen = false;              // cierra el drawer
        this.router.navigate(['/checkout']); // navega
    }

    enterShop(){
        this.showEntry = false;
        this.tab.set('shop');

        // 🔧 HOTFIX: limpia el bloqueo que dejó el effect inicial
        try {
            document.body.classList.remove('no-scroll');
            const main = document.querySelector('main') as HTMLElement | null;
            const topnav = document.querySelector('.topnav') as HTMLElement | null;
            if (main) (main as any).inert = false;
            if (topnav) (topnav as any).inert = false;
        } catch {}

        if (typeof window !== 'undefined') {
            sessionStorage.setItem('bk-entry','1');
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    const target = document.getElementById('shopTop') || (document.querySelector('.shop') as HTMLElement | null);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    else window.scrollTo({ top: 0, behavior: 'smooth' });
                });
            });
        }
    }


    // ⌨️ Accesos rápidos: ← → y Escape
    @HostListener('window:keydown', ['$event'])
    handleKey(e: KeyboardEvent){
        if (this.selected) {
            if (e.key === 'ArrowRight') this.next();
            if (e.key === 'ArrowLeft') this.prev();
            if (e.key === 'Escape') this.closeProduct();
        } else if (this.cartOpen && e.key === 'Escape') {
            this.cartOpen = false;
        }
    }
}