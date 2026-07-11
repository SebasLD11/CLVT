import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService, User } from '../services/auth.service';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  getItemSizeLabel(item: any): string {
    if ((item.collectionTitle || item.productId?.collectionTitle) === 'SKATEBOARDS') return 'Medida';
    if (item.name?.toLowerCase().includes('taller')) return 'Horas';
    return 'Talla';
  }

  auth = inject(AuthService);
  private fb = inject(FormBuilder);
  router = inject(Router);
  private http = inject(HttpClient);
  private base = environment.apiUrl.replace(/\/$/, '');

  orders = signal<any[]>([]);
  isLoadingOrders = signal(false);
  isEditing = signal(false);
  isSaving = signal(false);
  errorMessage = signal<string | null>(null);
  successMessage = signal<string | null>(null);

  profileForm!: FormGroup;

  ngOnInit() {
    this.initForm();
    this.fetchOrders();
  }

  private initForm() {
    const user = this.auth.currentUser();
    this.profileForm = this.fb.group({
      fullName: [user?.fullName || '', [Validators.required, Validators.minLength(2)]],
      phone: [user?.phone || ''],
      address: this.fb.group({
        line1: [user?.address?.line1 || ''],
        line2: [user?.address?.line2 || ''],
        city: [user?.address?.city || ''],
        province: [user?.address?.province || ''],
        postalCode: [user?.address?.postalCode || ''],
        country: [user?.address?.country || 'ES']
      })
    });
  }

  fetchOrders() {
    this.isLoadingOrders.set(true);
    this.http.get<any[]>(`${this.base}/api/auth/orders`).subscribe({
      next: (res) => {
        this.orders.set(res);
        this.isLoadingOrders.set(false);
      },
      error: () => {
        this.isLoadingOrders.set(false);
      }
    });
  }

  toggleEdit() {
    this.initForm(); // Always load latest currentUser values into the form
    this.isEditing.set(!this.isEditing());
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  onSave() {
    if (this.profileForm.invalid) return;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.auth.updateMe(this.profileForm.value).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.isEditing.set(false);
        this.successMessage.set('Perfil actualizado correctamente.');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(err.error?.message || 'Error al actualizar el perfil.');
      }
    });
  }

  downloadReceipt(receiptPath: string) {
    if (!receiptPath) return;
    const url = `${this.base}/receipts/${receiptPath}`;
    window.open(url, '_blank');
  }

  logout() {
    this.auth.logout();
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
