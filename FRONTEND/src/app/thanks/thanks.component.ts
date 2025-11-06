// src/app/thanks/thanks.component.ts
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-thanks',
  imports: [CommonModule],
  templateUrl: './thanks.component.html',
  styleUrls: ['./thanks.component.scss']
})
export class ThanksComponent {
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  oid        = signal<string | null>(null);
  receiptUrl = signal<string | null>(null);
  waVendor   = signal<string | null>(null);
  waHref     = signal<string | null>(null); // normalizado api.whatsapp.com

  constructor() {
    const qp = this.route.snapshot.queryParamMap;
    const v  = (k:string) => qp.get(k) || null;

    this.oid.set(v('oid'));
    this.receiptUrl.set(v('r'));

    const raw = v('wav') || v('wa') || '';

    // Solo aceptamos dominios esperados y normalizamos wa.me → api.whatsapp.com
    const safe = (() => {
      if (!raw) return null;
      try {
        const u = new URL(raw);
        const host = u.host.toLowerCase();
        if (host === 'wa.me') {
          // wa.me/<digits>?text=...
          const m = raw.match(/^https:\/\/wa\.me\/(\d+)\?text=(.+)$/i);
          return m ? `https://api.whatsapp.com/send?phone=${m[1]}&text=${m[2]}` : null;
        }
        if (host === 'api.whatsapp.com') return raw;
        return null; // rechazamos otros hosts
      } catch { return null; }
    })();

    this.waVendor.set(raw || null);
    this.waHref.set(safe);
  }

  openPdf() {
    const u = this.receiptUrl();
    if (u) window.open(u, '_blank');
  }

  openWhatsApp() {
    const u = this.waHref();
    if (u) window.location.href = u; // mismo tab = menos bloqueos popup
  }

  backToShop(){ this.router.navigate(['/'], { fragment: 'shopTop' }); }
}
