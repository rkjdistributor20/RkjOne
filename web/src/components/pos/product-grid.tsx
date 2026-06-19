'use client';

import { usePosStore } from '@/stores/pos-store';
import { formatRM } from '@/lib/pos/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function ProductGrid() {
  const categories = usePosStore((s) => s.categories);
  const selectedCategory = usePosStore((s) => s.selectedCategory);
  const setSelectedCategory = usePosStore((s) => s.setSelectedCategory);
  const filteredProducts = usePosStore((s) => s.filteredProducts());
  const addToCart = usePosStore((s) => s.addToCart);
  const shift = usePosStore((s) => s.shift);

  return (
    <div className="flex h-full flex-col gap-3">
      <Tabs
        value={selectedCategory ?? categories[0]}
        onValueChange={setSelectedCategory}
      >
        <ScrollArea className="w-full">
          <TabsList className="inline-flex h-auto w-max flex-wrap gap-1 bg-transparent p-0">
            {categories.map((cat) => (
              <TabsTrigger
                key={cat}
                value={cat}
                className="rounded-full border data-[state=active]:border-amber-500 data-[state=active]:bg-amber-50 data-[state=active]:text-amber-900"
              >
                {cat}
              </TabsTrigger>
            ))}
          </TabsList>
        </ScrollArea>
      </Tabs>

      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {filteredProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              disabled={!shift}
              onClick={() => addToCart(product)}
              className="flex flex-col items-start rounded-xl border bg-card p-3 text-left transition-all hover:border-amber-400 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]"
            >
              <Badge variant="outline" className="mb-2 text-[10px]">
                {product.sku}
              </Badge>
              <span className="line-clamp-2 text-sm font-medium leading-tight">
                {product.name}
              </span>
              <span className="mt-2 text-lg font-bold text-amber-600">
                {formatRM(Number(product.price))}
              </span>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
