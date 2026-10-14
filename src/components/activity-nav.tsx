import {
  BarChart3,
  ChevronDown,
  Coffee,
  Fish,
  Frame,
  LayoutGrid,
  Layers,
  Lightbulb,
  MoreHorizontal,
  SlidersHorizontal,
  Sparkles,
  Timer,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Activity } from "@/lib/matchmaking/types"

type Item = { value: Activity; label: string; icon: typeof Sparkles; description?: string }

const MAIN: Item[] = [
  { value: "match", label: "Match", icon: Sparkles },
  { value: "cafe", label: "Café", icon: Coffee },
  { value: "speed", label: "Speed", icon: Timer },
]

/** Everything beyond the three everyday formats lives under "More" to keep the dashboard calm. */
export const MORE: Item[] = [
  { value: "oneTwoFour", label: "1-2-4-All", icon: Layers, description: "Reflect alone, then pairs, fours, everyone" },
  { value: "openSpace", label: "Open Space", icon: LayoutGrid, description: "People pick a named table themselves" },
  { value: "tps", label: "Think-Pair-Share", icon: Lightbulb, description: "Think, discuss in pairs, harvest insights" },
  { value: "pulse", label: "Polls & word cloud", icon: BarChart3, description: "Quick pulse checks, results when you're ready" },
  { value: "spectrum", label: "Spectrum line", icon: SlidersHorizontal, description: "Place yourself 1–10, then pair opposites" },
  { value: "gallery", label: "Gallery walk", icon: Frame, description: "Groups rotate through stations leaving notes" },
  { value: "fishbowl", label: "Fishbowl", icon: Fish, description: "Inner circle on stage; others watch and swap in" },
]

export function ActivityNav({
  value,
  onChange,
  locked,
}: {
  value: Activity
  onChange: (value: Activity) => void
  /** While something is running, only the current activity can be selected. */
  locked: boolean
}) {
  const more = MORE.find((item) => item.value === value)
  const MoreIcon = more?.icon ?? MoreHorizontal

  return (
    <nav aria-label="Activity" className="flex gap-2">
      <Tabs value={value} onValueChange={(v) => onChange(v as Activity)} className="min-w-0 flex-1">
        <TabsList className="w-full">
          {MAIN.map(({ value: item, label, icon: Icon }) => (
            <TabsTrigger key={item} value={item} disabled={locked && item !== value}>
              <Icon aria-hidden="true" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant={more ? "default" : "outline"}
            className="max-w-[45%] shrink-0"
            aria-label={more ? `More formats, ${more.label} selected` : "More formats"}
          >
            <MoreIcon aria-hidden="true" />
            <span className="truncate">{more?.label ?? "More"}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel>More formats</DropdownMenuLabel>
          {MORE.map(({ value: item, label, icon: Icon, description }) => (
            <DropdownMenuItem
              key={item}
              disabled={locked && item !== value}
              onSelect={() => onChange(item)}
              className="items-start gap-3 py-2"
            >
              <Icon className="mt-0.5" aria-hidden="true" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{description}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  )
}
