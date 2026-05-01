import { generateJson } from "./aoai";
import type { FsPreset } from "./preset";

const SYSTEM_PROMPT = `You are an editing assistant for a Microsoft Dynamics 365 Field Service demo data preset. The user will give you a natural-language instruction describing one or more changes they want to make to the preset (add/remove/rename items, change durations, swap territories, retitle the company, etc.). You return the COMPLETE updated preset as JSON.

Rules:
- Always return the entire preset object, not a diff.
- Apply the user's instruction LITERALLY. If they say "remove X", X must be gone from the returned JSON. If they say "add Y", Y must be present. Do not refuse or soften removals.
- Preserve every field that wasn't asked to be changed.
- Keep the same JSON shape and field names as the input.
- When you remove an item, you MUST also remove or repoint everything that references it so the preset stays internally consistent. Specifically:
  * Removing a territories[] entry → reassign every sampleTechnicians[].primaryTerritoryCode that pointed to it to a remaining territory code (round-robin across the survivors), and remove any other references.
  * Removing a characteristics[] entry → reassign every sampleTechnicians[].primarySkill that pointed to it to a remaining characteristic name.
  * Removing an incidentTypes[] entry → drop it from agreements[].coveredIncidentTypeNames.
  * Removing a products[] entry → drop it from customerAssets[].productNumber (set to undefined) and from agreements[].coveredProductNumbers.
  * Removing a sampleAccounts[] entry → drop customerAssets / functionalLocations / agreements that reference it by name.
  * Removing a functionalLocations[] entry → drop customerAssets[].functionalLocationName references.
- After any edit, the result must still satisfy: territory codes UPPERCASE; every sampleTechnicians[].primaryTerritoryCode matches a territories[].code; every sampleTechnicians[].primarySkill matches a characteristics[].name; every customerAssets[].accountName matches a sampleAccounts[].name; agreements references resolve.
- Incident durations stay in 15..480 minutes; service tasks stay 2..6 entries.
- All names must be realistic — never lorem ipsum, never "Sample".
- Update the rationale field to briefly note what changed (one sentence).
- If the instruction is ambiguous, make a reasonable choice and reflect it in rationale.
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
    maxCompletionTokens: 16000,
    reasoningEffort: "low",
  });
}
