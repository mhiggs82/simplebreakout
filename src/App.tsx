import { BreakoutDashboard } from "@/components/breakout-dashboard"
import { InstalledPage } from "@/components/installed-page"
import { ZoomSdkProvider } from "@/hooks/use-zoom-sdk"

// Zoom's "Add app" flow redirects here with ?code= in an ordinary browser.
const justInstalled = new URLSearchParams(window.location.search).has("code")

export default function App() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md items-start justify-center bg-background p-4 text-foreground">
      {justInstalled ? (
        <InstalledPage />
      ) : (
        <ZoomSdkProvider>
          <BreakoutDashboard />
        </ZoomSdkProvider>
      )}
    </main>
  )
}
