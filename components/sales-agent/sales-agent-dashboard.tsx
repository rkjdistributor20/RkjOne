'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Building2,
  CreditCard,
  Factory,
  Package,
  RefreshCw,
  ShoppingCart,
  Store,
  Truck,
} from 'lucide-react';
import {
  confirmAgentPayment,
  createAgentOrder,
  createAgentPayment,
  fetchAgentDashboard,
  fetchStockCatalog,
  registerAgentAccount,
  registerAgentOutlet,
  startOutletSubscription,
} from '@/lib/sales-agent/api';
import type { AgentDashboardData, AgentStockOrder, StockCatalogItem } from '@/lib/sales-agent/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EmptyState,
  KpiCard,
  KpiGrid,
  ModuleHeader,
  ModuleLayout,
  PrimaryActionButton,
  SectionCard,
} from '@/components/shared/module-ui';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { formatRM } from '@/components/shared/module-ui';

const ORDER_STATUS: Record<string, string> = {
  DRAFT: 'Draf',
  PENDING_PAYMENT: 'Menunggu Bayaran',
  PAID: 'Dibayar',
  SUBMITTED_FACTORY: 'Dihantar Kilang',
  ACKNOWLEDGED: 'Kilang Terima',
  FULFILLED: 'Selesai',
  CANCELLED: 'Batal',
};

const PAY_METHODS = [
  { id: 'FPX', label: 'FPX (Online Banking)' },
  { id: 'CARD', label: 'Kad Kredit' },
  { id: 'DEBIT', label: 'Kad Debit' },
] as const;

export function SalesAgentDashboard() {
  const [data, setData] = useState<AgentDashboardData | null>(null);
  const [catalog, setCatalog] = useState<StockCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [payMethod, setPayMethod] = useState<'FPX' | 'CARD' | 'DEBIT'>('FPX');
  const [outletForm, setOutletForm] = useState({
    outlet_code: '',
    outlet_name: '',
    address_line: '',
    city: '',
    state: '',
    postcode: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, cat] = await Promise.all([fetchAgentDashboard(), fetchStockCatalog()]);
      setData(dash);
      setCatalog(cat.items);
      if (!selectedDate && dash.production_days.length) {
        const open = dash.production_days.find((d) => d.window_open);
        setSelectedDate(open?.production_date ?? dash.production_days[0].production_date);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal muat dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const orderTotal = useMemo(() => {
    return catalog.reduce((sum, item) => {
      const q = quantities[item.id] ?? 0;
      return sum + q * item.unit_price_rm;
    }, 0);
  }, [catalog, quantities]);

  async function handleRegister() {
    if (!companyName.trim()) {
      toast.error('Masukkan nama syarikat');
      return;
    }
    setRegistering(true);
    try {
      await registerAgentAccount({ company_name: companyName.trim() });
      toast.success('Akaun ejen didaftarkan');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal daftar');
    } finally {
      setRegistering(false);
    }
  }

  async function handleCreateOrder() {
    if (!selectedDate) {
      toast.error('Pilih tarikh production');
      return;
    }
    const items = catalog
      .filter((c) => (quantities[c.id] ?? 0) > 0)
      .map((c) => ({ stock_item_id: c.id, quantity: quantities[c.id] }));
    if (!items.length) {
      toast.error('Masukkan kuantiti stok');
      return;
    }
    try {
      const { order } = await createAgentOrder({ production_date: selectedDate, items });
      toast.success(`Order ${order.order_number} dicipta — teruskan bayaran`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal cipta order');
    }
  }

  async function handlePay(purpose: 'STOCK_ORDER' | 'POS_SUBSCRIPTION', referenceId: string, successMsg: string) {
    try {
      const { payment, checkout } = await createAgentPayment({
        purpose,
        reference_id: referenceId,
        payment_method: payMethod,
      });
      if (checkout.checkout_url) {
        window.location.href = checkout.checkout_url;
        return;
      }
      await confirmAgentPayment(payment.id);
      toast.success(successMsg);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Bayaran gagal');
    }
  }

  async function handlePayOrder(order: AgentStockOrder) {
    await handlePay('STOCK_ORDER', order.id, 'Bayaran berjaya — order dihantar ke kilang');
  }

  async function handleRegisterOutlet() {
    if (!outletForm.outlet_code || !outletForm.outlet_name) {
      toast.error('Kod dan nama cawangan diperlukan');
      return;
    }
    try {
      await registerAgentOutlet(outletForm);
      toast.success('Cawangan didaftarkan — langgan POS RM150/bulan');
      setOutletForm({ outlet_code: '', outlet_name: '', address_line: '', city: '', state: '', postcode: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal daftar cawangan');
    }
  }

  async function handleSubscribe(outletId: string) {
    try {
      const { subscription } = await startOutletSubscription(outletId);
      await handlePay(
        'POS_SUBSCRIPTION',
        subscription.id,
        'Langganan POS aktif — akses penuh dibuka'
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Langganan gagal');
    }
  }

  if (loading && !data) {
    return (
      <ModuleLayout>
        <p className="text-sm text-muted-foreground">Memuatkan portal ejen…</p>
      </ModuleLayout>
    );
  }

  if (!data?.account) {
    return (
      <ModuleLayout>
        <ModuleHeader
          title="Portal Ejen Jualan"
          description="RKJ Distributor Sdn Bhd — order stok & langganan POS"
          icon={Store}
        />
        <Card className="max-w-lg border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white">
          <CardHeader>
            <div className="flex items-center gap-3">
              <LegalEntityLogo size={48} />
              <CardTitle className="text-lg">Daftar Akaun Ejen</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Daftar syarikat ejen jualan untuk order stok ke kilang (ikut jadual & cutoff) dan
              langgan POS RM150/cawangan/bulan.
            </p>
            <div className="space-y-2">
              <Label>Nama Syarikat Ejen</Label>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="Contoh: ABC Trading Sdn Bhd" />
            </div>
            <PrimaryActionButton onClick={handleRegister} disabled={registering}>
              Daftar & Mula
            </PrimaryActionButton>
          </CardContent>
        </Card>
      </ModuleLayout>
    );
  }

  return (
    <ModuleLayout>
      <ModuleHeader
        title="Portal Ejen Jualan"
        description={`${data.account.company_name} · RKJ Distributor Sdn Bhd`}
        icon={Store}
        actions={
          <Button variant="outline" size="sm" onClick={() => void load()}>
            <RefreshCw className="mr-1 h-4 w-4" /> Muat Semula
          </Button>
        }
      />

      <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-950 via-emerald-900 to-emerald-800 px-4 py-3 text-white">
        <LegalEntityLogo size={36} className="rounded-md bg-white/10 p-1" />
        <div>
          <p className="text-sm font-semibold">RKJ Distributor — Bekalan Stok Ejen</p>
          <p className="text-xs text-emerald-100">
            Order ikut tarikh production kilang · Bayaran FPX/Kad · Hantar automatik ke kilang selepas bayaran penuh
          </p>
        </div>
      </div>

      <KpiGrid>
        <KpiCard title="Order Menunggu" value={String(data.stats.pending_orders)} icon={Package} />
        <KpiCard title="Dihantar Kilang" value={String(data.stats.factory_submitted)} icon={Factory} />
        <KpiCard title="Cawangan POS Aktif" value={String(data.stats.active_outlets)} icon={ShoppingCart} />
        <KpiCard title="Langganan / cawangan" value={formatRM(data.subscription_monthly_rm)} icon={CreditCard} />
      </KpiGrid>

      <div className="mb-4 flex flex-wrap gap-2">
        <Label className="sr-only">Kaedah bayaran</Label>
        {PAY_METHODS.map((m) => (
          <Button
            key={m.id}
            size="sm"
            variant={payMethod === m.id ? 'default' : 'outline'}
            onClick={() => setPayMethod(m.id)}
          >
            {m.label}
          </Button>
        ))}
      </div>

      <Tabs defaultValue="orders" className="mt-4">
        <TabsList>
          <TabsTrigger value="orders">Order Stok</TabsTrigger>
          <TabsTrigger value="outlets">Cawangan POS</TabsTrigger>
          <TabsTrigger value="history">Sejarah</TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-4">
          <SectionCard title="Tarikh Production Kilang">
            <div className="flex flex-wrap gap-2">
              {data.production_days.map((d) => (
                <Button
                  key={d.production_date}
                  size="sm"
                  variant={selectedDate === d.production_date ? 'default' : 'outline'}
                  disabled={!d.window_open}
                  onClick={() => setSelectedDate(d.production_date)}
                >
                  {d.production_date}
                  {!d.window_open && ' (tutup)'}
                </Button>
              ))}
            </div>
            {data.production_days.length === 0 && (
              <p className="text-xs text-muted-foreground">Tiada jadual production diterbitkan — hubungi HQ.</p>
            )}
          </SectionCard>

          <SectionCard title="Senarai Stok">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="p-2">Item</th>
                    <th className="p-2">Harga/unit</th>
                    <th className="p-2 w-24">Kuantiti</th>
                  </tr>
                </thead>
                <tbody>
                  {catalog.map((item) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">
                        <p className="font-medium">{item.item_name}</p>
                        <p className="text-xs text-muted-foreground">{item.item_code}</p>
                      </td>
                      <td className="p-2">{formatRM(item.unit_price_rm)}</td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          className="h-8"
                          value={quantities[item.id] ?? ''}
                          onChange={(e) =>
                            setQuantities((prev) => ({
                              ...prev,
                              [item.id]: Number.parseInt(e.target.value, 10) || 0,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="font-semibold">Jumlah: {formatRM(orderTotal)}</p>
              <PrimaryActionButton onClick={handleCreateOrder} disabled={orderTotal <= 0}>
                Cipta Order & Bayar
              </PrimaryActionButton>
            </div>
          </SectionCard>

          <SectionCard title="Order Menunggu Bayaran">
            {data.orders.filter((o) => o.status === 'PENDING_PAYMENT').length === 0 ? (
              <EmptyState title="Tiada order menunggu" description="Cipta order stok di atas." />
            ) : (
              data.orders
                .filter((o) => o.status === 'PENDING_PAYMENT')
                .map((o) => (
                  <div key={o.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{o.order_number}</p>
                      <p className="text-xs text-muted-foreground">
                        Production {o.production_date} · {formatRM(o.total_amount_rm)}
                      </p>
                    </div>
                    <Button size="sm" onClick={() => void handlePayOrder(o)}>
                      Bayar & Hantar Kilang
                    </Button>
                  </div>
                ))
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="outlets" className="space-y-4">
          <SectionCard title="Daftar Cawangan POS">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Kod Cawangan</Label>
                <Input value={outletForm.outlet_code} onChange={(e) => setOutletForm((p) => ({ ...p, outlet_code: e.target.value }))} placeholder="AG-001" />
              </div>
              <div>
                <Label>Nama Cawangan</Label>
                <Input value={outletForm.outlet_name} onChange={(e) => setOutletForm((p) => ({ ...p, outlet_name: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Alamat</Label>
                <Input value={outletForm.address_line} onChange={(e) => setOutletForm((p) => ({ ...p, address_line: e.target.value }))} />
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Langganan POS: RM{data.subscription_monthly_rm}/cawangan/bulan — bayar ke RKJ Distributor sebelum akses penuh.
            </p>
            <PrimaryActionButton className="mt-3" onClick={handleRegisterOutlet}>
              Daftar Cawangan
            </PrimaryActionButton>
          </SectionCard>

          <SectionCard title="Cawangan Saya">
            {data.outlets.length === 0 ? (
              <EmptyState title="Tiada cawangan" description="Daftar cawangan untuk guna POS syarikat." />
            ) : (
              data.outlets.map((o) => (
                <div key={o.id} className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{o.outlet_name}</p>
                    <p className="text-xs text-muted-foreground">{o.outlet_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {o.subscription_active ? (
                      <Badge className="bg-emerald-600">POS Aktif</Badge>
                    ) : (
                      <>
                        <Badge variant="outline">Menunggu Langganan</Badge>
                        <Button size="sm" onClick={() => void handleSubscribe(o.id)}>
                          Bayar RM{data.subscription_monthly_rm}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="history">
          <SectionCard title="Order & Pembayaran">
            {data.orders.map((o) => (
              <div key={o.id} className="mb-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">{o.order_number}</span>
                  <Badge variant="outline">{ORDER_STATUS[o.status] ?? o.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {o.production_date} · {formatRM(o.total_amount_rm)}
                </p>
              </div>
            ))}
            {data.payments.map((p) => (
              <div key={p.id} className="mb-2 rounded-lg border p-3 text-sm">
                <div className="flex justify-between">
                  <span>{p.purpose === 'STOCK_ORDER' ? 'Bayaran Order' : 'Langganan POS'}</span>
                  <Badge variant={p.status === 'PAID' ? 'default' : 'outline'}>{p.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {p.payment_method} · {formatRM(p.amount_rm)}
                </p>
              </div>
            ))}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </ModuleLayout>
  );
}
