import { Beer, CupSoda, Drumstick, Gift, IceCreamCone, Martini, ReceiptText, Utensils, Wine, type LucideIcon } from 'lucide-react';

/** Ícone conforme a categoria do produto cadastrada no CRM. */
function iconFor(categoria: string): LucideIcon {
  const c = categoria.toLowerCase();
  if (/cerveja|chope|chopp/.test(c)) return Beer;
  if (/drink|coquetel|destilad/.test(c)) return Martini;
  if (/vinho/.test(c)) return Wine;
  if (/petisco|porç|porc/.test(c)) return Drumstick;
  if (/sobremesa|doce/.test(c)) return IceCreamCone;
  if (/sem álcool|sem alcool|refrigerante|suco|bebida/.test(c)) return CupSoda;
  if (/recompensa/.test(c)) return Gift;
  if (/consumo|comanda/.test(c)) return ReceiptText;
  return Utensils;
}

export function ItemIcon({ categoria, size = 'md' }: { categoria: string; size?: 'md' | 'lg' | 'xl' }) {
  const Icon = iconFor(categoria);
  const px = size === 'xl' ? 34 : size === 'lg' ? 26 : 22;
  return (
    <div className={`thumb thumb--${size}`} aria-hidden="true">
      <Icon size={px} strokeWidth={1.5} />
    </div>
  );
}
