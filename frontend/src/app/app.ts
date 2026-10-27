import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';

interface Product {
  id: number;
  name: string;
  description: string;
  price: number;
}

type ProductInput = Omit<Product, 'id'>;

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/products';

  protected readonly products = signal<Product[]>([]);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly editingId = signal<number | null>(null);
  protected form: ProductInput = this.emptyForm();

  ngOnInit(): void {
    this.loadProducts();
  }

  protected loadProducts(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<Product[]>(this.apiUrl).subscribe({
      next: (products) => {
        this.products.set(products);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(this.errorMessage(error));
        this.loading.set(false);
      },
    });
  }

  protected saveProduct(): void {
    this.saving.set(true);
    this.error.set('');
    const editingId = this.editingId();
    const request = editingId === null
      ? this.http.post<Product>(this.apiUrl, this.form)
      : this.http.put<Product>(`${this.apiUrl}/${editingId}`, this.form);

    request.subscribe({
      next: () => {
        this.cancelEdit();
        this.saving.set(false);
        this.loadProducts();
      },
      error: (error: HttpErrorResponse) => {
        this.error.set(this.errorMessage(error));
        this.saving.set(false);
      },
    });
  }

  protected editProduct(product: Product): void {
    this.editingId.set(product.id);
    this.form = {
      name: product.name,
      description: product.description,
      price: product.price,
    };
    this.error.set('');
  }

  protected deleteProduct(product: Product): void {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) {
      return;
    }

    this.error.set('');
    this.http.delete<void>(`${this.apiUrl}/${product.id}`).subscribe({
      next: () => {
        if (this.editingId() === product.id) {
          this.cancelEdit();
        }
        this.loadProducts();
      },
      error: (error: HttpErrorResponse) => this.error.set(this.errorMessage(error)),
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.form = this.emptyForm();
  }

  private emptyForm(): ProductInput {
    return { name: '', description: '', price: 0 };
  }

  private errorMessage(error: HttpErrorResponse): string {
    if (error.status === 0) {
      return 'Could not reach the API. Make sure the Spring Boot server is running on port 8080.';
    }
    if (error.status === 400) {
      return 'Please check the product details and try again.';
    }
    if (error.status === 404) {
      return 'That product no longer exists. Refresh the list and try again.';
    }
    return `The request failed (${error.status}). Please try again.`;
  }
}
