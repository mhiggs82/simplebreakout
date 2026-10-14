import { BreakoutDashboard } from "@/components/breakout-dashboard"
import { ZoomSdkProvider } from "@/hooks/use-zoom-sdk"

export default function App() {
  return (
    <ZoomSdkProvider>
      <main className="flex min-h-svh items-start justify-center bg-background p-4 text-foreground sm:items-center">
        <BreakoutDashboard />
      </main>
    </ZoomSdkProvider>
  )
}
