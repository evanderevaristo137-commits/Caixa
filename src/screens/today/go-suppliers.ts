/** Opens «Produtos» on its «Fornecedores» tab (what the shop owes and to whom). */
export function goToSuppliers() {
  try {
    sessionStorage.setItem('productsView', 'suppliers');
  } catch {
    // Without storage the products tab simply opens on its first view.
  }
  window.location.hash = '#/products';
}
