import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, MessageCircle, ShieldCheck } from "lucide-react";
import { createBookingDeposit, getPublicVehicle } from "@/lib/catalog.functions";
import { formatKsh, STATUS_LABEL } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const vehicleQuery = (id: string) =>
  queryOptions({ queryKey: ["public-vehicle", id], queryFn: () => getPublicVehicle({ data: { id } }) });

export const Route = createFileRoute("/cars/$id")({
  validateSearch: z.object({ ref: z.string().optional() }),
  loader: async ({ context, params }) => {
    if (!z.string().uuid().safeParse(params.id).success) throw notFound();
    const v = await context.queryClient.ensureQueryData(vehicleQuery(params.id));
    if (!v) throw notFound();
    return { title: `${v.year} ${v.make} ${v.model}`, price: v.price_ksh };
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.title} — ${formatKsh(loaderData.price)} | VroomLink` },
          { name: "description", content: `${loaderData.title} for ${formatKsh(loaderData.price)} on VroomLink.` },
          { property: "og:title", content: `${loaderData.title} | VroomLink` },
          { property: "og:description", content: `Available for ${formatKsh(loaderData.price)}. Book with a deposit.` },
        ]
      : [{ title: "Car unavailable | VroomLink" }, { name: "robots", content: "noindex" }],
  }),
  notFoundComponent: () => (
    <div className="p-12 text-center">
      <p className="mb-4 text-muted-foreground">This car is no longer listed.</p>
      <Link to="/" className="font-medium text-primary">Back to catalog</Link>
    </div>
  ),
  component: CarDetails,
});

function CarDetails() {
  const { id } = Route.useParams();
  const { ref } = Route.useSearch();
  const { data: v } = useSuspenseQuery(vehicleQuery(id));
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  if (!v) return null;
  const imgs = v.images.length ? v.images : ["/images/cars/prado.jpg"];
  const title = `${v.year} ${v.make} ${v.model}`;
  const waText = encodeURIComponent(`Hi, I'm interested in the ${title} (${formatKsh(v.price_ksh)}) on VroomLink.${ref ? ` Ref: ${ref}` : ""}`);
  const waPhone = v.yard?.whatsapp_phone ?? "254700000000";

  const specs: [string, string][] = [
    ["Year", String(v.year)],
    ["Mileage", `${v.mileage_km.toLocaleString()} km`],
    ["Engine", v.engine_cc ? `${v.engine_cc.toLocaleString()} cc` : "—"],
    ["Transmission", v.transmission],
    ["Fuel", v.fuel],
    ["Drive", v.drive ?? "—"],
    ["Body", v.body_type ?? "—"],
    ["Colour", v.color ?? "—"],
    ["Status", STATUS_LABEL[v.status]],
    ["ETA", v.eta_date ? new Date(v.eta_date).toLocaleDateString("en-KE", { dateStyle: "medium" }) : "Available now"],
  ];

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6">
        <Link to="/" search={ref ? { ref } : {}} className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" /> All cars
        </Link>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
              <img src={imgs[idx]} alt={title} width={1280} height={832} className="h-full w-full object-cover" />
              <StatusBadge status={v.status} className="absolute left-4 top-4" />
              {imgs.length > 1 && (
                <>
                  <button aria-label="Previous photo" onClick={() => setIdx((idx - 1 + imgs.length) % imgs.length)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-card/90 p-2 shadow"><ChevronLeft className="h-5 w-5" /></button>
                  <button aria-label="Next photo" onClick={() => setIdx((idx + 1) % imgs.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-card/90 p-2 shadow"><ChevronRight className="h-5 w-5" /></button>
                </>
              )}
            </div>
            <div className="mt-3 flex gap-3">
              {imgs.map((src, i) => (
                <button key={i} onClick={() => setIdx(i)}
                  className={`h-16 w-24 overflow-hidden rounded-lg border-2 ${i === idx ? "border-primary" : "border-transparent opacity-70"}`}>
                  <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{v.yard?.name} · {v.yard?.location}</p>
              <p className="mt-4 text-3xl font-bold text-primary">{formatKsh(v.price_ksh)}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <a href={`https://wa.me/${waPhone}?text=${waText}`} target="_blank" rel="noreferrer"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-whatsapp font-semibold text-whatsapp-foreground transition hover:opacity-90">
                <MessageCircle className="h-5 w-5" /> WhatsApp Agent
              </a>
              <Button size="lg" className="h-12 rounded-xl font-semibold" onClick={() => setOpen(true)}>
                Pay Booking Deposit
              </Button>
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" /> Booking deposit of {formatKsh(v.booking_deposit_ksh)} reserves this car.
            </p>
            <div className="overflow-hidden rounded-2xl border bg-card">
              <table className="w-full text-sm">
                <tbody>
                  {specs.map(([k, val]) => (
                    <tr key={k} className="border-b last:border-0">
                      <th className="w-1/3 bg-muted/50 px-4 py-2.5 text-left font-medium text-muted-foreground">{k}</th>
                      <td className="px-4 py-2.5 font-medium">{val}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {v.description && <p className="text-sm leading-relaxed text-muted-foreground">{v.description}</p>}
          </div>
        </div>
      </div>
      <DepositDialog open={open} onOpenChange={setOpen} vehicleId={v.id} amount={v.booking_deposit_ksh} title={title} referral={ref} />
    </div>
  );
}

function DepositDialog({ open, onOpenChange, vehicleId, amount, title, referral }: {
  open: boolean; onOpenChange: (o: boolean) => void; vehicleId: string; amount: number; title: string; referral?: string | undefined;
}) {
  const pay = useServerFn(createBookingDeposit);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const ref = referral && z.string().uuid().safeParse(referral).success ? referral : undefined;
      const res = await pay({ data: { vehicleId, customerName: String(fd.get("name")), customerPhone: String(fd.get("phone")), ref } });
      setDone(res.reference);
    } catch (err) {
      toast.error(err instanceof Error && err.message.includes("phone") ? "Enter a valid Kenyan phone number" : "Payment could not be completed");
    } finally {
      setBusy(false);
    }
  }

  const field = "h-11 w-full rounded-lg border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setDone(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{done ? "Deposit received" : "Pay booking deposit"}</DialogTitle>
          <DialogDescription>
            {done ? `Reference ${done}. The yard will call you shortly about the ${title}.` : `${formatKsh(amount)} via M-Pesa (test mode, no money is charged).`}
          </DialogDescription>
        </DialogHeader>
        {!done && (
          <form onSubmit={submit} className="space-y-3">
            <input name="name" required minLength={2} placeholder="Full name" className={field} />
            <input name="phone" required placeholder="M-Pesa phone e.g. 0712345678" className={field} />
            <Button type="submit" disabled={busy} className="h-11 w-full">{busy ? "Processing…" : `Pay ${formatKsh(amount)}`}</Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
