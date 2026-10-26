import { MessageSquare, Plus, Send, Shuffle, Tags, Trash2, UserPlus, Users } from "lucide-react"
import { useId, useState } from "react"

import { LinesField } from "@/components/round-fields"
import { RoomSizeField } from "@/components/room-size-field"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { HostSession } from "@/hooks/use-host-session"
import type { CategoryDef, MatchConfig, MatchMode } from "@/lib/matchmaking/types"
import { MAX_MESSAGE_BYTES } from "@/lib/messages"
import { nameTagInstructions } from "@/lib/name-tags"

const NO_ANCHOR = "__none"

const newId = (prefix: string) => `${prefix}${Date.now().toString(36).slice(-5)}`

function parseOptions(text: string): string[] {
  return [...new Set(text.split(",").map((o) => o.trim()).filter(Boolean))]
}

function RolesEditor({ config, update }: { config: MatchConfig; update: (patch: Partial<MatchConfig>) => void }) {
  const anchorId = useId()
  const setLabel = (id: string, label: string) =>
    update({ roles: config.roles.map((r) => (r.id === id ? { ...r, label } : r)) })
  const remove = (id: string) =>
    update({
      roles: config.roles.filter((r) => r.id !== id),
      anchorRoleId: config.anchorRoleId === id ? null : config.anchorRoleId,
    })

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Each person picks a role, e.g. mentor or mentee. Every room gets a fair mix of roles.
      </p>
      <ul className="space-y-2" aria-label="Roles">
        {config.roles.map((role, i) => (
          <li key={role.id} className="flex gap-2">
            <Input
              aria-label={`Role ${i + 1} name`}
              value={role.label}
              maxLength={30}
              onChange={(e) => setLabel(role.id, e.target.value)}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove role ${role.label}`}
              disabled={config.roles.length <= 2}
              onClick={() => remove(role.id)}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        disabled={config.roles.length >= 6}
        onClick={() => update({ roles: [...config.roles, { id: newId("r"), label: "New role" }] })}
      >
        <Plus /> Add role
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor={anchorId}>Give each of these their own room</Label>
        <Select
          value={config.anchorRoleId ?? NO_ANCHOR}
          onValueChange={(v) => update({ anchorRoleId: v === NO_ANCHOR ? null : v })}
        >
          <SelectTrigger id={anchorId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_ANCHOR}>Nobody (use people per room)</SelectItem>
            {config.roles.map((role) => (
              <SelectItem key={role.id} value={role.id}>
                {role.label || "Untitled role"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          e.g. every mentor gets their own room, and mentees are shared out evenly.
        </p>
      </div>
    </div>
  )
}

function CategoryRow({
  category,
  matched,
  onChange,
  onToggle,
  onRemove,
  canRemove,
}: {
  category: CategoryDef
  matched: boolean
  onChange: (next: CategoryDef) => void
  onToggle: (on: boolean) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const id = useId()
  // Options are edited as free text and parsed when the field loses focus,
  // so typing commas and spaces isn't disrupted.
  const [optionsText, setOptionsText] = useState(category.options.join(", "))

  return (
    <li className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Question"
          value={category.label}
          maxLength={30}
          onChange={(e) => onChange({ ...category, label: e.target.value })}
        />
        <Button variant="ghost" size="icon" aria-label={`Remove ${category.label}`} disabled={!canRemove} onClick={onRemove}>
          <Trash2 />
        </Button>
      </div>
      <Input
        aria-label={`${category.label} options, comma separated`}
        value={optionsText}
        placeholder="Option A, Option B, Other"
        onChange={(e) => setOptionsText(e.target.value)}
        onBlur={() => {
          const options = parseOptions(optionsText)
          setOptionsText(options.join(", "))
          onChange({ ...category, options })
        }}
      />
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="font-normal text-muted-foreground">
          Use this to make rooms
        </Label>
        <Switch id={id} checked={matched} onCheckedChange={onToggle} />
      </div>
    </li>
  )
}

function AttributesEditor({ config, update }: { config: MatchConfig; update: (patch: Partial<MatchConfig>) => void }) {
  // Match priority follows the order of the questions.
  const setMatchOn = (categories: CategoryDef[], on: Set<string>) =>
    categories.filter((c) => on.has(c.id)).map((c) => c.id)
  const matchSet = new Set(config.matchOn)

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        People answer each question. Rooms are made from the answers you switch on. The top question matters most;
        if there aren't enough exact matches, people go to the closest room.
      </p>
      <ul className="space-y-2" aria-label="Questions">
        {config.categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            matched={matchSet.has(category.id)}
            canRemove={config.categories.length > 1}
            onChange={(next) =>
              update({ categories: config.categories.map((c) => (c.id === next.id ? next : c)) })
            }
            onToggle={(on) => {
              const next = new Set(matchSet)
              if (on) next.add(category.id)
              else next.delete(category.id)
              update({ matchOn: setMatchOn(config.categories, next) })
            }}
            onRemove={() => {
              const categories = config.categories.filter((c) => c.id !== category.id)
              update({ categories, matchOn: setMatchOn(categories, matchSet) })
            }}
          />
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        disabled={config.categories.length >= 6}
        onClick={() =>
          update({
            categories: [...config.categories, { id: newId("c"), label: "New question", options: ["Yes", "No"] }],
          })
        }
      >
        <Plus /> Add question
      </Button>
      <RadioGroup
        aria-label="How to use answers"
        value={config.attributeStrategy}
        onValueChange={(v) => update({ attributeStrategy: v as MatchConfig["attributeStrategy"] })}
        className="pt-1"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="similar" id="strategy-similar" />
          <Label htmlFor="strategy-similar" className="font-normal">Put people with the same answers together</Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="diverse" id="strategy-diverse" />
          <Label htmlFor="strategy-diverse" className="font-normal">Mix different answers in each room</Label>
        </div>
      </RadioGroup>
    </div>
  )
}

export function MatchSettingsCard({ session, disabled }: { session: HostSession; disabled: boolean }) {
  const { config, setConfig } = session
  const [sendError, setSendError] = useState<string | null>(null)
  const [invited, setInvited] = useState(false)
  const [asked, setAsked] = useState(false)
  const nameTagText = nameTagInstructions(config)
  const update = (patch: Partial<MatchConfig>) => setConfig((prev) => ({ ...prev, ...patch }))
  const asksQuestions = config.mode !== "random"
  const tooLarge = session.questionsBytes > MAX_MESSAGE_BYTES
  const groupSizeUnused = config.mode === "roles" && config.anchorRoleId !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Groups</CardTitle>
        <CardDescription>
          Split everyone into breakout rooms once. Mix everyone at random, or let people tell you who they are
          and group them by that.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={disabled} className="space-y-4">
          <Tabs value={config.mode} onValueChange={(v) => update({ mode: v as MatchMode })}>
            <TabsList className="w-full">
              <TabsTrigger value="random"><Shuffle /> Mix</TabsTrigger>
              <TabsTrigger value="roles"><Users /> By role</TabsTrigger>
              <TabsTrigger value="attributes"><Tags /> By answers</TabsTrigger>
            </TabsList>
            <TabsContent value="random" className="pt-2">
              <p className="text-sm text-muted-foreground">Everyone is mixed at random into rooms of the same size.</p>
            </TabsContent>
            <TabsContent value="roles" className="pt-2">
              <RolesEditor config={config} update={update} />
            </TabsContent>
            <TabsContent value="attributes" className="pt-2">
              <AttributesEditor config={config} update={update} />
            </TabsContent>
          </Tabs>

          <LinesField
            label="Room names (optional)"
            hint="One per line. Used instead of Room 1, Room 2… in order."
            value={config.roomLabels ?? []}
            maxLength={40}
            placeholder={"Lagos\nLima"}
            onChange={(roomLabels) => update({ roomLabels })}
          />

          {!groupSizeUnused && (
            <RoomSizeField
              value={config.groupSize}
              onChange={(groupSize) => update({ groupSize })}
              people={session.candidates.length}
            />
          )}
        </fieldset>
      </CardContent>

      {asksQuestions && (
        <CardFooter className="flex-col items-stretch gap-2">
          <Button
            variant={session.collecting && !session.questionsOutdated ? "outline" : "default"}
            disabled={disabled || tooLarge}
            onClick={() => {
              setSendError(null)
              session.sendQuestions().catch((err: Error) => setSendError(err.message))
            }}
          >
            <Send />
            {session.collecting ? "Send the questions again" : "Send the questions to people with the app"}
          </Button>
          {nameTagText && (
            <>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  setAsked(true)
                  session.askForNameTags().catch(() => setAsked(false))
                }}
              >
                <MessageSquare /> {asked ? "Asked in chat. Ask again" : "Ask everyone in chat to add it to their name"}
              </Button>
              <p className="text-xs text-muted-foreground">
                No app needed. People rename themselves in Zoom, and you see their answers in Participants. Chat
                message: <q>{nameTagText}</q>
              </p>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled || invited}
            onClick={() => {
              setInvited(true)
              session.inviteEveryone().catch(() => setInvited(false))
            }}
          >
            <UserPlus /> {invited ? "Invitation sent" : "Invite people to open the app"}
          </Button>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
            {session.questionsOutdated && <Badge variant="secondary">Questions changed: send them again</Badge>}
            {tooLarge && (
              <span className="text-destructive">
                Questions are {session.questionsBytes} bytes; Zoom allows {MAX_MESSAGE_BYTES}. Shorten some options.
              </span>
            )}
            {sendError && <span className="text-destructive">{sendError}</span>}
          </div>
        </CardFooter>
      )}
    </Card>
  )
}
