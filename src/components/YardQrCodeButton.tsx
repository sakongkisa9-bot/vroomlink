import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function YardQrCodeButton({
  yardName,
  slug,
}: {
  yardName: string;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState("");
  const codeRef = useRef<HTMLDivElement>(null);
  useEffect(() => setOrigin(window.location.origin), []);
  const marketplaceUrl = origin
    ? `${origin}/yard/${encodeURIComponent(slug)}`
    : "";

  function downloadQrCode() {
    const svg = codeRef.current?.querySelector("svg");
    if (!svg) {
      toast.error("The yard QR code is not ready to download.");
      return;
    }

    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], {
      type: "image/svg+xml;charset=utf-8",
    });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `${slug}-marketplace-qr.svg`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
  }

  async function copyMarketplaceLink() {
    try {
      await navigator.clipboard.writeText(marketplaceUrl);
      toast.success("Yard marketplace link copied.");
    } catch (error) {
      console.error("Could not copy yard marketplace link", error);
      toast.error("Clipboard access is unavailable in this browser.");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-9 rounded-lg border px-3 text-sm font-semibold hover:bg-accent"
      >
        Yard QR code
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{yardName} marketplace QR code</DialogTitle>
            <DialogDescription>
              Scan this code to open this yard&apos;s own public marketplace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            <div
              ref={codeRef}
              className="flex min-h-[288px] min-w-[288px] items-center justify-center rounded-xl border bg-white p-4"
            >
              {marketplaceUrl ? (
                <QRCodeSVG
                  value={marketplaceUrl}
                  size={256}
                  level="M"
                  includeMargin
                />
              ) : (
                <span className="text-sm text-muted-foreground">
                  Preparing QR code…
                </span>
              )}
            </div>
            <p className="max-w-full break-all text-center text-sm text-muted-foreground">
              {marketplaceUrl}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => void copyMarketplaceLink()}
                className="h-10 rounded-lg border px-4 text-sm font-semibold"
              >
                Copy marketplace link
              </button>
              <button
                type="button"
                onClick={downloadQrCode}
                className="h-10 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
              >
                Download QR (SVG)
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
