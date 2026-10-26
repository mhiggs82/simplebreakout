import { CheckCircle2 } from "lucide-react"

import mark from "@/assets/parentwise-mark-128.png"
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
        <img src={mark} alt="ParentWise" className="mb-2 size-10" />
        <CardTitle className="flex items-center gap-2 font-serif text-xl">
          <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
          Easy Breakouts is added to your Zoom
        </CardTitle>
        <CardDescription>Put people in the right breakout rooms, in one click. You can close this tab now.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Open the Zoom desktop app and start or join a meeting.</li>
          <li>
            Click <strong>Apps</strong> in the meeting toolbar.
          </li>
          <li>
            Choose <strong>Easy Breakouts</strong>.
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
