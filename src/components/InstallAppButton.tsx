import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export function InstallAppButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    const standaloneQuery = window.matchMedia("(display-mode: standalone)");
    const checkInstalled = () => {
      const navigatorWithStandalone = navigator as Navigator & {
        standalone?: boolean;
      };
      setIsInstalled(
        standaloneQuery.matches || navigatorWithStandalone.standalone === true,
      );
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    checkInstalled();
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    standaloneQuery.addEventListener("change", checkInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
      standaloneQuery.removeEventListener("change", checkInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setIsIos(
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      );
      setInstructionsOpen(true);
      return;
    }

    const prompt = installPrompt;
    setInstallPrompt(null);
    try {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      if (outcome === "accepted") setIsInstalled(true);
    } catch (error) {
      console.error("Could not prompt to install VroomLink", error);
      setInstructionsOpen(true);
    }
  };

  return (
    <>
      {!isInstalled && (
        <button
          type="button"
          onClick={handleInstall}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border bg-card px-3 text-sm font-semibold shadow-sm outline-none transition hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring sm:px-4"
          aria-label="Install VroomLink"
          title="Install VroomLink"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Install</span>
        </button>
      )}
      <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install VroomLink</DialogTitle>
            <DialogDescription>
              {isIos
                ? "Tap the Share button in your browser, then choose Add to Home Screen."
                : "Open your browser menu and choose Install app or Add to Home Screen."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
