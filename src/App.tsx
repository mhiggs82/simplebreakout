import { BreakoutDashboard } from "@/components/breakout-dashboard"
import { ZoomSdkProvider } from "@/hooks/use-zoom-sdk"

export default function App() {
  return (
    <ZoomSdkProvider>
      <main className="mx-auto flex min-h-svh w-full max-w-md items-start justify-center bg-background p-4 text-foreground">
        <BreakoutDashboard />
      </main>
    </ZoomSdkProvider>
  )
}
