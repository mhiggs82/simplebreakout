import { CheckCircle2 } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * Shown in the browser after someone adds the app: Zoom sends them to the
 * OAuth redirect URL (this page with `?code=`). The app itself only runs
 * inside the Zoom client, so this just tells them where to find it.
 */
export function InstalledPage() {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          Global Breakout is added to your Zoom
        </CardTitle>
        <CardDescription>You can close this tab.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open the Zoom desktop app and start or join a meeting.</li>
          <li>
            Click <strong>Apps</strong> in the meeting toolbar.
          </li>
          <li>
            Choose <strong>Global Breakout</strong>.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
