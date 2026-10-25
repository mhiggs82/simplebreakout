import { useId, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MAX_ROOMS, roomCount, roomLimitWarning, roomSizeLabel, sizeForRooms } from "@/lib/matchmaking/engine"

const QUICK_SIZES = [2, 3, 4, 6]

/**
 * People per room, as quick buttons, or as a number of rooms (many hosts
 * think "I want 10 rooms"). Shows what the meeting will actually get.
 */
export function RoomSizeField({
  value,
  onChange,
  people,
  max = 20,
}: {
  value: number
  onChange: (groupSize: number) => void
  /** How many people will be put in rooms right now. */
  people: number
  max?: number
}) {
  const id = useId()
  const [byRooms, setByRooms] = useState(false)
  const rooms = people >= 2 ? roomCount(people, value) : 0
  const [roomsText, setRoomsText] = useState(String(rooms || 10))
  const limit = people >= 2 ? roomLimitWarning(people, value) : null

  return (
    <fieldset className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <legend className="text-sm font-medium">Room size</legend>
        <div className="flex gap-1" role="group" aria-label="Choose by">
          <Button type="button" size="sm" variant={byRooms ? "ghost" : "secondary"} aria-pressed={!byRooms} onClick={() => setByRooms(false)}>
            People per room
          </Button>
          <Button
            type="button"
            size="sm"
            variant={byRooms ? "secondary" : "ghost"}
            aria-pressed={byRooms}
            onClick={() => {
              setRoomsText(String(rooms || 10))
              setByRooms(true)
            }}
          >
            Number of rooms
          </Button>
        </div>
      </div>

      {byRooms ? (
        <div className="flex items-center gap-2">
          <Label htmlFor={id} className="font-normal">I want</Label>
          <Input
            id={id}
            type="number"
            min={1}
            max={MAX_ROOMS}
            className="w-20"
            value={roomsText}
            onChange={(e) => {
              setRoomsText(e.target.value)
              const n = Number(e.target.value)
              // The size cap is for typing a size by hand; a room count can need bigger rooms.
              if (n >= 1 && people >= 2) onChange(sizeForRooms(people, n))
            }}
          />
          <span className="text-sm">rooms</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {QUICK_SIZES.filter((size) => size <= max).map((size) => (
            <Button
              key={size}
              type="button"
              size="sm"
              variant={value === size ? "default" : "outline"}
              aria-pressed={value === size}
              aria-label={`${size} people per room`}
              onClick={() => onChange(size)}
            >
              {size}
            </Button>
          ))}
          <Label htmlFor={id} className="sr-only">Other number of people per room</Label>
          <Input
            id={id}
            type="number"
            min={2}
            max={max}
            className="w-20"
            aria-label="Other number of people per room"
            value={value}
            onChange={(e) => onChange(Math.min(max, Math.max(2, Number(e.target.value) || 2)))}
          />
        </div>
      )}

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {people < 2
          ? "Rooms are worked out when at least 2 people are here."
          : `${people.toLocaleString()} people → ${rooms} room${rooms === 1 ? "" : "s"} of ${roomSizeLabel(people, value)}.`}
      </p>
      {limit && <p className="text-sm text-destructive">{limit}</p>}
    </fieldset>
  )
}
