import {
  ChevronDown,
  Coffee,
  Fish,
  Frame,
  LayoutGrid,
  Layers,
  Lightbulb,
  MoreHorizontal,
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
  { value: "match", label: "Groups", icon: Sparkles },
  { value: "speed", label: "Pairs", icon: Timer },
  { value: "cafe", label: "Rotate", icon: Coffee },
]

/** Everything beyond the three everyday formats (groups, pairs, rotations) lives under "More" to keep the dashboard calm. */
export const MORE: Item[] = [
  { value: "oneTwoFour", label: "1-2-4-All", icon: Layers, description: "Think alone, then pairs, then fours, then everyone" },
  { value: "openSpace", label: "Pick a room", icon: LayoutGrid, description: "People choose the topic room they want" },
  { value: "tps", label: "Think, pair, share", icon: Lightbulb, description: "Think alone, talk in pairs, share with everyone" },
  { value: "gallery", label: "Gallery walk", icon: Frame, description: "Groups visit each idea in turn and leave notes (needs the app)" },
  { value: "fishbowl", label: "Fishbowl", icon: Fish, description: "A few people talk on screen while everyone else listens" },
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
