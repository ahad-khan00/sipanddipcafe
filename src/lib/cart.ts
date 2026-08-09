import { useCallback, useEffect, useState } from "react";

/**
 * Cart is transient client-side UI state only. Prices held here are for display;
 * the server recalculates every total from current database prices at checkout.
 */
export type CartLine = {
  menu_item_id: string;
  name: string;
  price_cents: number;
  quantity: number;
};

const keyFor = (token: string) => `cafe-cart:${token}`;

function read(token: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(keyFor(token));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartLine[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (l) => l && typeof l.menu_item_id === "string" && Number(l.quantity) > 0,
    );
  } catch {
    return [];
  }
}

function write(token: string, lines: CartLine[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(keyFor(token), JSON.stringify(lines));
  window.dispatchEvent(new CustomEvent("cafe-cart-change", { detail: token }));
}

export function useCart(token: string) {
  const [lines, setLines] = useState<CartLine[]>([]);

  useEffect(() => {
    setLines(read(token));
    const onChange = () => setLines(read(token));
    window.addEventListener("cafe-cart-change", onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("cafe-cart-change", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, [token]);

  const setQuantity = useCallback(
    (item: Omit<CartLine, "quantity">, quantity: number) => {
      const current = read(token);
      const next = current.filter((l) => l.menu_item_id !== item.menu_item_id);
      const qty = Math.max(0, Math.min(50, Math.round(quantity)));
      if (qty > 0) next.push({ ...item, quantity: qty });
      write(token, next);
    },
    [token],
  );

  const add = useCallback(
    (item: Omit<CartLine, "quantity">, delta = 1) => {
      const current = read(token);
      const existing = current.find((l) => l.menu_item_id === item.menu_item_id);
      setQuantity(item, (existing?.quantity ?? 0) + delta);
    },
    [token, setQuantity],
  );

  const remove = useCallback(
    (menu_item_id: string) => {
      write(
        token,
        read(token).filter((l) => l.menu_item_id !== menu_item_id),
      );
    },
    [token],
  );

  const clear = useCallback(() => write(token, []), [token]);

  const count = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.price_cents, 0);

  return { lines, add, setQuantity, remove, clear, count, subtotal };
}
