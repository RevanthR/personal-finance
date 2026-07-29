import { Share2, PlusSquare, MoreVertical, Download } from "lucide-react";

export function InstallInstructions() {
  return (
    <details className="w-full max-w-sm group">
      <summary className="flex items-center gap-1.5 justify-center text-sm text-muted-foreground py-2 cursor-pointer select-none marker:content-none list-none [&::-webkit-details-marker]:hidden hover:text-foreground transition-colors">
        <span className="underline underline-offset-2 decoration-dotted">How do I install this as an app?</span>
        <span className="group-open:rotate-180 transition-transform">⌄</span>
      </summary>

      <div className="space-y-3 pt-3 pb-2">
        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">iPhone / iPad (Safari)</p>
          <ol className="space-y-2">
            {[
              { icon: Share2, text: "Tap the Share button at the bottom of Safari" },
              { icon: PlusSquare, text: "Scroll down and tap \"Add to Home Screen\"" },
              { icon: Download, text: "Tap Add, the app icon appears on your home screen" },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex items-start gap-1.5 flex-1">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground">Android (Chrome)</p>
          <ol className="space-y-2">
            {[
              { icon: MoreVertical, text: "Tap the ⋮ menu in the top-right corner of Chrome" },
              { icon: Download, text: "Tap \"Add to Home screen\" or \"Install app\"" },
              { icon: PlusSquare, text: "Tap Install, Artha is added to your home screen" },
            ].map(({ icon: Icon, text }, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="w-4 h-4 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex items-start gap-1.5 flex-1">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <p className="text-center text-xs text-muted-foreground px-2">
          Once installed, it works like a native app: no browser chrome, faster load, works offline.
        </p>
      </div>
    </details>
  );
}
