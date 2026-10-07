"use client";

import { useEffect, useState } from "react";
import { Download, CheckCircle2 } from "lucide-react";
import { Button } from "@balm/ui";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  };

  if (installed) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-brand)]">
        <CheckCircle2 className="h-4 w-4" /> Installed — launch it from your Start menu.
      </p>
    );
  }

  if (deferred) {
    return (
      <Button size="lg" onClick={install}>
        <Download className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        Install POS App
      </Button>
    );
  }

  return (
    <p className="text-sm text-[var(--color-text-secondary)]">
      In <strong>Edge</strong> or <strong>Chrome</strong>, open the <strong>⋯</strong> menu →{" "}
      <strong>Apps → Install this site as an app</strong> (or click the install icon in the address
      bar). The POS opens in its own window like a native app.
    </p>
  );
}
