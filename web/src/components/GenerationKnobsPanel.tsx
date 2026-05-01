import { Sliders } from "@phosphor-icons/react";
import {
  generationKnobs,
  type GenerationKnobs,
} from "@/lib/generationKnobs";

interface Props {
  orgUrl: string;
  value: GenerationKnobs;
  onChange: (next: GenerationKnobs) => void;
}

/**
 * Generation knobs — controls the WO count, status mix, priority mix, and
 * scheduling window for the next run. Persists per-org so a reload picks
 * up the same settings.
 */
export function GenerationKnobsPanel({ orgUrl, value, onChange }: Props) {
  function update(patch: Partial<GenerationKnobs>) {
    const next = { ...value, ...patch };
    onChange(next);
    generationKnobs.save(orgUrl, next);
  }
  function updateStatus(patch: Partial<GenerationKnobs["statusMix"]>) {
    update({ statusMix: { ...value.statusMix, ...patch } });
  }
  function updatePriority(patch: Partial<GenerationKnobs["priorityMix"]>) {
    update({ priorityMix: { ...value.priorityMix, ...patch } });
  }

  const statusTotal =
    value.statusMix.openUnscheduled +
    value.statusMix.scheduled +
    value.statusMix.closedPosted;
  const priorityTotal =
    value.priorityMix.low +
    value.priorityMix.medium +
    value.priorityMix.high +
    value.priorityMix.critical;

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <Sliders size={18} weight="duotone" className="text-accent" />
        <h3 className="font-semibold text-white">Generation knobs</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        Tune the next run's volume and shape. All settings persist per-org.
      </p>

      {/* WO count + schedule window */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <NumberInput
          label="Work orders"
          hint="2 – 60"
          value={value.woCount}
          min={2}
          max={60}
          onChange={(n) => update({ woCount: n })}
        />
        <NumberInput
          label="Days forward"
          hint="Future bookings"
          value={value.daysForward}
          min={1}
          max={60}
          onChange={(n) => update({ daysForward: n })}
        />
        <NumberInput
          label="Days backward"
          hint="Closed-Posted history depth"
          value={value.daysBackward}
          min={1}
          max={120}
          onChange={(n) => update({ daysBackward: n })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <NumberInput
          label="Workday starts at"
          hint="Hour 0–23 (local)"
          value={value.workdayStartHour}
          min={0}
          max={23}
          onChange={(n) => update({ workdayStartHour: n })}
        />
      </div>

      {/* Status mix */}
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold text-white">WO status mix</div>
          <div className={`text-xs ${statusTotal === 100 ? "text-muted" : "text-amber-400"}`}>
            Total: {statusTotal}% {statusTotal !== 100 && "(normalised at run-time)"}
          </div>
        </div>
        <PercentSlider
          label="Open – Unscheduled"
          value={value.statusMix.openUnscheduled}
          onChange={(n) => updateStatus({ openUnscheduled: n })}
        />
        <PercentSlider
          label="Scheduled"
          value={value.statusMix.scheduled}
          onChange={(n) => updateStatus({ scheduled: n })}
        />
        <PercentSlider
          label="Closed – Posted"
          value={value.statusMix.closedPosted}
          onChange={(n) => updateStatus({ closedPosted: n })}
        />
      </div>

      {/* Priority mix */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-sm font-semibold text-white">WO priority mix</div>
          <div className={`text-xs ${priorityTotal === 100 ? "text-muted" : "text-amber-400"}`}>
            Total: {priorityTotal}% {priorityTotal !== 100 && "(normalised at run-time)"}
          </div>
        </div>
        <PercentSlider
          label="Low"
          value={value.priorityMix.low}
          onChange={(n) => updatePriority({ low: n })}
        />
        <PercentSlider
          label="Medium"
          value={value.priorityMix.medium}
          onChange={(n) => updatePriority({ medium: n })}
        />
        <PercentSlider
          label="High"
          value={value.priorityMix.high}
          onChange={(n) => updatePriority({ high: n })}
        />
        <PercentSlider
          label="Critical"
          value={value.priorityMix.critical}
          onChange={(n) => updatePriority({ critical: n })}
        />
        <p className="text-xs text-muted mt-2">
          Priorities resolve to <code>msdyn_priority</code> records by name. Orgs
          missing a given priority skip that WO's priority field.
        </p>
      </div>
    </div>
  );
}

function NumberInput(props: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs text-muted mb-1">{props.label}</div>
      <input
        type="number"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          const clamped = Math.max(props.min, Math.min(props.max, Math.round(n)));
          props.onChange(clamped);
        }}
        className="w-full bg-bg-elevated border border-border rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-accent"
      />
      {props.hint && <div className="text-xs text-muted mt-1">{props.hint}</div>}
    </label>
  );
}

function PercentSlider(props: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className="w-36 text-xs text-slate-300">{props.label}</div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="flex-1 accent-accent"
        aria-label={props.label}
      />
      <div className="w-10 text-right text-xs text-white tabular-nums">
        {props.value}%
      </div>
    </div>
  );
}
