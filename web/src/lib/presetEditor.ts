import { generateJson } from "./aoai";
import type { FsPreset } from "./preset";

const SYSTEM_PROMPT = `You are an editing assistant for a Microsoft Dynamics 365 Field Service demo data preset. The user will give you a natural-language instruction describing one or more changes they want to make to the preset (add/remove/rename items, change durations, swap territories, retitle the company, etc.). You return the COMPLETE updated preset as JSON.

Rules:
- Always return the entire preset object, not a diff.
- Preserve every field that wasn't asked to be changed.
- Keep the same JSON shape and field names as the input.
- Territory codes must be UPPERCASE; technicians' primaryTerritoryCode must match a territories[].code; technicians' primarySkill must match a characteristics[].name.
- Incident durations stay in 15..480 minutes; service tasks stay 2..6 entries.
- All names must be realistic — never lorem ipsum, never "Sample".
- If the instruction is ambiguous, make a reasonable choice and reflect it in the rationale field.
- If asked to undo or reset, restore sensible defaults but keep the company name and vertical.`;

const USER_TEMPLATE = (preset: FsPreset, instruction: string) =>
  `Current preset JSON:
${JSON.stringify(preset, null, 2)}

Edit instruction:
${instruction}

Return the FULL updated preset object as JSON, with the same shape.`;

export async function editPreset(
  preset: FsPreset,
  instruction: string,
): Promise<FsPreset> {
  return generateJson<FsPreset>({
    systemPrompt: SYSTEM_PROMPT,
    prompt: USER_TEMPLATE(preset, instruction),
    maxCompletionTokens: 9000,
    reasoningEffort: "low",
  });
}
