import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../services/auth.service';
import { ProductService } from '../services/product.service';
import { environment } from '../../environments/environment';

interface VariantInput {
  size: string;
  color: string;
  stock: number;
}

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss']
})
export class AdminComponent implements OnInit {
  auth = inject(AuthService);
  private fb = inject(FormBuilder);
  router = inject(Router);
  private http = inject(HttpClient);
  private base = environment.apiUrl.replace(/\/$/, '');

  // Navigation tab
  activeTab = signal<'analytics' | 'catalog' | 'restock' | 'users'>('analytics');

  // Data signals
  analyticsData = signal<any>(null);
  productSvc = inject(ProductService);
  products = computed(() => this.productSvc.products());
  users = signal<any[]>([]);
  restockRequests = signal<any[]>([]);
  stockTransactions = signal<any[]>([]);
  coupons = signal<any[]>([]);
  stockPagination = signal<any>({ page: 1, total: 0, pages: 1 });

  // UI state
  isLoading = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  // Forms & Modals
  showProductModal = signal(false);
  editingProduct = signal<any | null>(null);
  productForm!: FormGroup;

  showUserModal = signal(false);
  editingUser = signal<any | null>(null);
  userForm!: FormGroup;

  showCouponModal = signal(false);
  editingCoupon = signal<any | null>(null);
  couponForm!: FormGroup;

  // Custom product options lists for variants grid
  enteredSizes = signal<string[]>([]);
  enteredColors = signal<string[]>([]);
  variantStockMap = new Map<string, number>(); // key: 'size:color' -> stock

  // RESTOCK MODAL
  showRestockReceiveModal = signal(false);
  selectedRestockRequest = signal<any | null>(null);
  receiveStockQty = 1;

  // SHIP ORDER FORM
  showShipModal = signal(false);
  selectedOrderToShip = signal<any | null>(null);
  shipForm = this.fb.group({
    carrier: ['Correos', Validators.required],
    trackingNumber: ['', Validators.required]
  });

  ngOnInit() {
    this.fetchAnalytics();
    this.fetchProducts();
    this.fetchRestockRequests();
    this.fetchUsers();
    this.fetchTransactions();
    this.initProductForm();
    this.initUserForm();
  }

  // --- Fetch Methods ---
  fetchAnalytics() {
    this.http.get<any>(`${this.base}/api/admin/analytics`).subscribe(res => {
      this.analyticsData.set(res);
    });
  }

  fetchProducts() {
    this.productSvc.refresh();
  }

  fetchRestockRequests() {
    this.http.get<any[]>(`${this.base}/api/admin/restock-requests?t=${Date.now()}`).subscribe(res => {
      this.restockRequests.set(res);
    });
  }

  fetchUsers() {
    this.http.get<any[]>(`${this.base}/api/admin/users`).subscribe(res => {
      this.users.set(res);
    });
  }

  fetchTransactions(page: number = 1) {
    this.http.get<any>(`${this.base}/api/admin/stock-transactions?page=${page}&limit=10&t=${Date.now()}`).subscribe(res => {
      this.stockTransactions.set(res.data);
      this.stockPagination.set(res.pagination);
    });
  }

  fetchCoupons() {
    this.http.get<any[]>(`${this.base}/api/admin/coupons`).subscribe(res => {
      this.coupons.set(res);
    });
  }

  generateRestockAlerts() {
    if(!confirm('Â¿Generar alertas de stock para variantes con 5 o menos unidades?')) return;
    this.http.post(`${this.base}/api/admin/restock-requests/generate`, {}).subscribe({
      next: (res: any) => {
        this.successMessage.set(`Se han generado ${res.generated} alertas de stock.`);
        if (this.activeTab() === 'restock') this.fetchRestockRequests();
      },
      error: err => this.errorMessage.set(err.error?.error || 'Error al generar alertas')
    });
  }

  // --- Tab Control ---
  setTab(tab: 'analytics' | 'catalog' | 'restock' | 'users') {
    this.activeTab.set(tab);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    // Refresh active data
    if (tab === 'analytics') this.fetchAnalytics();
    if (tab === 'catalog') { this.fetchProducts(); this.fetchTransactions(); }
    if (tab === 'restock') this.fetchRestockRequests();
    if (tab === 'users') this.fetchUsers();
    if (tab === 'coupons') this.fetchCoupons();
  }

  // --- Product CRUD ---
  private initProductForm() {
    this.productForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      price: [0, [Validators.required, Validators.min(0.01)]],
      tag: ['new'],
      collectionTitle: ['Sin colecciÃ³n'],
      imageUrlInput: [''], // raw input to add to images list
      sizesInput: [''],    // comma-separated
      colorsInput: ['']    // comma-separated
    });
    
    this.enteredSizes.set([]);
    this.enteredColors.set([]);
    this.variantStockMap.clear();
  }

  private initUserForm() {
    this.userForm = this.fb.group({
      fullName: ['', Validators.required],
      email: [''],
      phone: [''],
      memberId: [''],
      role: ['member', Validators.required],
      status: ['active', Validators.required]
    });
  }

  onSizesOrColorsChange() {
    const sVal = this.productForm.get('sizesInput')?.value || '';
    const cVal = this.productForm.get('colorsInput')?.value || '';

    const sizes = sVal.split(',').map((s: string) => s.trim()).filter(Boolean);
    const colors = cVal.split(',').map((c: string) => c.trim()).filter(Boolean);

    this.enteredSizes.set(sizes);
    this.enteredColors.set(colors);
  }

  getVariantKey(size: string, color: string): string {
    return `${size || ''}:${color || ''}`;
  }

  getVariantStock(size: string, color: string): number {
    const key = this.getVariantKey(size, color);
    return this.variantStockMap.get(key) || 0;
  }

  setVariantStock(size: string, color: string, event: Event) {
    const qty = Number((event.target as HTMLInputElement).value || 0);
    const key = this.getVariantKey(size, color);
    this.variantStockMap.set(key, Math.max(0, qty));
  }

  openAddProduct() {
    this.editingProduct.set(null);
    this.initProductForm();
    this.showProductModal.set(true);
  }

  openEditProduct(p: any) {
    this.editingProduct.set(p);
    this.productForm.patchValue({
      name: p.name,
      description: p.description,
      price: p.price,
      tag: p.tag,
      collectionTitle: p.collectionTitle,
      imageUrlInput: (p.images || []).join(', '),
      sizesInput: (p.sizes || []).join(', '),
      colorsInput: (p.colors || []).join(', ')
    });

    this.enteredSizes.set(p.sizes || []);
    this.enteredColors.set(p.colors || []);
    this.variantStockMap.clear();

    if (p.variants && p.variants.length) {
      p.variants.forEach((v: any) => {
        const key = this.getVariantKey(v.size, v.color);
        this.variantStockMap.set(key, v.stock);
      });
    }

    this.showProductModal.set(true);
  }

  closeProductModal() {
    this.showProductModal.set(false);
  }

  onSaveProduct() {
    if (this.productForm.invalid) return;
    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    // Sync input fields to enteredSizes and enteredColors
    this.onSizesOrColorsChange();

    const formVal = this.productForm.value;
    
    // Build variants array
    const variants: VariantInput[] = [];
    const sizes = this.enteredSizes();
    const colors = this.enteredColors();

    if (sizes.length === 0 && colors.length === 0) {
      // General product stock (no size, no color)
      const stock = this.variantStockMap.get(':') || 0;
      variants.push({ size: '', color: '', stock });
    } else if (sizes.length > 0 && colors.length === 0) {
      sizes.forEach(s => {
        const stock = this.variantStockMap.get(`${s}:`) || 0;
        variants.push({ size: s, color: '', stock });
      });
    } else if (sizes.length === 0 && colors.length > 0) {
      colors.forEach(c => {
        const stock = this.variantStockMap.get(`:${c}`) || 0;
        variants.push({ size: '', color: c, stock });
      });
    } else {
      sizes.forEach(s => {
        colors.forEach(c => {
          const stock = this.variantStockMap.get(`${s}:${c}`) || 0;
          variants.push({ size: s, color: c, stock });
        });
      });
    }

    // Images parsing
    let images: string[] = [];
    if (formVal.imageUrlInput) {
      images = formVal.imageUrlInput.split(',').map((img: string) => img.trim()).filter(Boolean);
    } else {
      images = ['assets/img/placeholder.png'];
    }

    const payload = {
      name: formVal.name,
      description: formVal.description,
      price: formVal.price,
      tag: formVal.tag,
      collectionTitle: formVal.collectionTitle,
      images,
      sizes: sizes,
      colors: colors,
      variants
    };

    const req$ = this.editingProduct()
      ? this.http.put(`${this.base}/api/admin/products/${this.editingProduct()._id}`, payload)
      : this.http.post(`${this.base}/api/admin/products`, payload);

    req$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.showProductModal.set(false);
        this.successMessage.set(this.editingProduct() ? 'Producto modificado con Ã©xito.' : 'Producto aÃ±adido con Ã©xito.');
        this.fetchProducts();
        this.fetchTransactions();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.message || 'Error al guardar el producto.');
      }
    });
  }

  deleteProduct(id: string) {
    if (!confirm('Â¿EstÃ¡s seguro de que deseas eliminar este producto?')) return;
    this.http.delete(`${this.base}/api/admin/products/${id}`).subscribe({
      next: () => {
        this.successMessage.set('Producto eliminado correctamente.');
        this.fetchProducts();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al eliminar el producto.');
      }
    });
  }

  // --- Restocking controls ---
  updateRestockStatus(req: any, status: 'ordered' | 'received') {
    if (status === 'ordered') {
      this.http.put(`${this.base}/api/admin/restock-requests/${req._id}`, { status }).subscribe({
        next: () => {
          this.successMessage.set('ReposiciÃ³n marcada como Pedido.');
          this.fetchRestockRequests();
        }
      });
    } else if (status === 'received') {
      this.selectedRestockRequest.set(req);
      this.receiveStockQty = 10; // Default count suggestion
      this.showRestockReceiveModal.set(true);
    }
  }

  onReceiveStockSubmit() {
    const req = this.selectedRestockRequest();
    if (!req) return;

    this.http.put(`${this.base}/api/admin/restock-requests/${req._id}`, {
      status: 'received',
      addedQuantity: this.receiveStockQty
    }).subscribe({
      next: () => {
        this.showRestockReceiveModal.set(false);
        this.successMessage.set('Stock agregado correctamente.');
        this.fetchRestockRequests();
        this.fetchProducts();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al ingresar el stock.');
      }
    });
  }

  // --- Users Auditing ---
  openEditUser(u: any) {
    this.editingUser.set(u);
    this.userForm.patchValue({
      fullName: u.fullName,
      email: u.email,
      phone: u.phone,
      memberId: u.memberId,
      role: u.role,
      status: u.status
    });
    this.showUserModal.set(true);
  }

  closeUserModal() {
    this.showUserModal.set(false);
  }

  onSaveUser() {
    if (this.userForm.invalid) return;
    const u = this.editingUser();
    if (!u) return;

    const updates = this.userForm.value;
    this.http.put(`${this.base}/api/admin/users/${u._id}`, updates).subscribe({
      next: () => {
        this.fetchUsers();
        this.showUserModal.set(false);
        this.successMessage.set('Usuario actualizado.');
      },
      error: err => {
        this.errorMessage.set(err.error?.error || 'Error actualizando usuario');
        this.showUserModal.set(false);
      }
    });
  }

  toggleUserRole(user: any) {
    const newRole = user.role === 'admin' ? 'member' : 'admin';
    if (!confirm(`Â¿Quieres cambiar el rol de ${user.fullName} a ${newRole}?`)) return;

    this.http.put(`${this.base}/api/admin/users/${user._id}`, { role: newRole }).subscribe({
      next: () => {
        this.successMessage.set(`Rol de usuario actualizado a ${newRole}.`);
        this.fetchUsers();
      }
    });
  }

  toggleUserStatus(user: any) {
    const newStatus = user.status === 'active' ? 'inactive' : 'active';
    if (!confirm(`Â¿Quieres cambiar el estado de ${user.fullName} a ${newStatus}?`)) return;

    this.http.put(`${this.base}/api/admin/users/${user._id}`, { status: newStatus }).subscribe({
      next: () => {
        this.successMessage.set(`Estado de usuario actualizado a ${newStatus}.`);
        this.fetchUsers();
      }
    });
  }

  // --- Logistics Shipping ---
  openShipModal(order: any) {
    this.selectedOrderToShip.set(order);
    this.shipForm.patchValue({ carrier: 'Correos', trackingNumber: '' });
    this.showShipModal.set(true);
  }

  onShipSubmit() {
    if (this.shipForm.invalid) return;
    const order = this.selectedOrderToShip();
    if (!order) return;

    this.http.put(`${this.base}/api/admin/orders/${order._id}/ship`, this.shipForm.value).subscribe({
      next: () => {
        this.showShipModal.set(false);
        this.successMessage.set('Pedido marcado como enviado.');
        this.fetchAnalytics();
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al actualizar el envÃ­o.');
      }
    });

  }

  resolveImageSrc(src: string): string {
    if (!src) return 'assets/img/placeholder.png';
    if (/^https?:\/\//i.test(src)) return src;
    const cleaned = src.replace(/^\/+/, '');
    if (cleaned.startsWith('uploads/')) {
      return `${this.base}/${cleaned}`;
    }
    return `/${cleaned}`;
  }

  getLiveVariantStock(req: any): number {
    const productId = req.productId?._id || req.productId;
    if (!productId) return req.currentStock;

    const product = this.products().find((p: any) => String(p._id) === String(productId));
    if (!product || !Array.isArray(product.variants)) {
      return req.currentStock;
    }
    const variant = product.variants.find((v: any) => 
      (v.size || '') === (req.size || '') && 
      (v.color || '') === (req.color || '')
    );
    return variant ? variant.stock : 0;

  }

  goHome() {
    this.router.navigate(['/']);
  }
}

     i n i t C o u p o n F o r m ( )   { 
         t h i s . c o u p o n F o r m   =   t h i s . f b . g r o u p ( { 
             c o d e :   [ " " ,   V a l i d a t o r s . r e q u i r e d ] , 
             d i s c o u n t P e r c e n t :   [ 1 0 ,   V a l i d a t o r s . r e q u i r e d ] , 
             i s A c t i v e :   [ t r u e ] , 
             v a l i d U n t i l :   [ " " ] 
         } ) ; 
     } 
     o p e n A d d C o u p o n ( )   { 
         t h i s . e d i t i n g C o u p o n . s e t ( n u l l ) ; 
         i f   ( ! t h i s . c o u p o n F o r m )   t h i s . i n i t C o u p o n F o r m ( ) ; 
         e l s e   t h i s . c o u p o n F o r m . r e s e t ( {   d i s c o u n t P e r c e n t :   1 0 ,   i s A c t i v e :   t r u e   } ) ; 
         t h i s . s h o w C o u p o n M o d a l . s e t ( t r u e ) ; 
     } 
     o p e n E d i t C o u p o n ( c :   a n y )   { 
         t h i s . e d i t i n g C o u p o n . s e t ( c ) ; 
         i f   ( ! t h i s . c o u p o n F o r m )   t h i s . i n i t C o u p o n F o r m ( ) ; 
         t h i s . c o u p o n F o r m . p a t c h V a l u e ( { 
             c o d e :   c . c o d e , 
             d i s c o u n t P e r c e n t :   c . d i s c o u n t P e r c e n t , 
             i s A c t i v e :   c . i s A c t i v e , 
             v a l i d U n t i l :   c . v a l i d U n t i l   ?   n e w   D a t e ( c . v a l i d U n t i l ) . t o I S O S t r i n g ( ) . s p l i t ( " T " ) [ 0 ]   :   " " 
         } ) ; 
         t h i s . s h o w C o u p o n M o d a l . s e t ( t r u e ) ; 
     } 
     s a v e C o u p o n ( )   { 
         i f   ( t h i s . c o u p o n F o r m . i n v a l i d )   r e t u r n ; 
         c o n s t   d a t a   =   t h i s . c o u p o n F o r m . v a l u e ; 
         c o n s t   c   =   t h i s . e d i t i n g C o u p o n ( ) ; 
         c o n s t   r e q   =   c   ?   t h i s . h t t p . p u t ( ` $ { t h i s . b a s e } / a p i / a d m i n / c o u p o n s / $ { c . _ i d } ` ,   d a t a )   
                                     :   t h i s . h t t p . p o s t ( ` $ { t h i s . b a s e } / a p i / a d m i n / c o u p o n s ` ,   d a t a ) ; 
         r e q . s u b s c r i b e ( { 
             n e x t :   ( )   = >   { 
                 t h i s . f e t c h C o u p o n s ( ) ; 
                 t h i s . s h o w C o u p o n M o d a l . s e t ( f a l s e ) ; 
                 t h i s . s u c c e s s M e s s a g e . s e t ( " C u p ó n   g u a r d a d o . " ) ; 
             } , 
             e r r o r :   e r r   = >   t h i s . e r r o r M e s s a g e . s e t ( e r r . e r r o r ? . e r r o r   | |   " E r r o r   g u a r d a n d o   c u p ó n " ) 
         } ) ; 
     } 
     d e l e t e C o u p o n ( i d :   s t r i n g )   { 
         i f ( ! c o n f i r m ( " ¿ E l i m i n a r   c u p ó n ? " ) )   r e t u r n ; 
         t h i s . h t t p . d e l e t e ( ` $ { t h i s . b a s e } / a p i / a d m i n / c o u p o n s / $ { i d } ` ) . s u b s c r i b e ( { 
             n e x t :   ( )   = >   {   t h i s . f e t c h C o u p o n s ( ) ;   t h i s . s u c c e s s M e s s a g e . s e t ( " C u p ó n   e l i m i n a d o . " ) ;   } , 
             e r r o r :   e r r   = >   t h i s . e r r o r M e s s a g e . s e t ( e r r . e r r o r ? . e r r o r   | |   " E r r o r   a l   e l i m i n a r " ) 
         } ) ; 
       initCouponForm() {
    this.couponForm = this.fb.group({
      code: ['', Validators.required],
      discountPercent: [10, Validators.required],
      isActive: [true],
      validUntil: ['']
    });
  }
  openAddCoupon() {
    this.editingCoupon.set(null);
    if (!this.couponForm) this.initCouponForm();
    else this.couponForm.reset({ discountPercent: 10, isActive: true });
    this.showCouponModal.set(true);
  }
  openEditCoupon(c: any) {
    this.editingCoupon.set(c);
    if (!this.couponForm) this.initCouponForm();
    this.couponForm.patchValue({
      code: c.code,
      discountPercent: c.discountPercent,
      isActive: c.isActive,
      validUntil: c.validUntil ? new Date(c.validUntil).toISOString().split('T')[0] : ''
    });
    this.showCouponModal.set(true);
  }
  saveCoupon() {
    if (this.couponForm.invalid) return;
    const data = this.couponForm.value;
    const c = this.editingCoupon();
    const req = c ? this.http.put(${this.base}/api/admin/coupons/, data) 
                  : this.http.post(${this.base}/api/admin/coupons, data);
    req.subscribe({
      next: () => {
        this.fetchCoupons();
        this.showCouponModal.set(false);
        this.successMessage.set('Cupón guardado.');
      },
      error: err => this.errorMessage.set(err.error?.error || 'Error guardando cupón')
    });
  }
  deleteCoupon(id: string) {
    if(!confirm('¿Eliminar cupón?')) return;
    this.http.delete(${this.base}/api/admin/coupons/).subscribe({
      next: () => { this.fetchCoupons(); this.successMessage.set('Cupón eliminado.'); },
      error: err => this.errorMessage.set(err.error?.error || 'Error al eliminar')
    });
  }
}
