/**
 * Local (no-AI) removal of preset entries with referential cleanup.
 *
 * Mirrors the cascade rules the Edit-with-AI system prompt enforces, so the
 * user can delete a row from the Review & Tweak screen instantly without
 * waiting for a model round-trip. Always returns a fresh preset object.
 *
 * Rules (kept in sync with web/src/lib/presetEditor.ts):
 *  - territory:        repoint sampleTechnicians[].primaryTerritoryCode
 *                      from the removed code to the first surviving code.
 *  - characteristic:   repoint sampleTechnicians[].primarySkill from the
 *                      removed name to the first surviving name.
 *  - incidentType:     remove from agreements[].coveredIncidentTypeNames.
 *  - product:          clear customerAssets[].productNumber that matched
 *                      and remove from agreements[].coveredProductNumbers.
 *  - account:          drop dependent customerAssets / functionalLocations
 *                      / agreements that referenced the account by name.
 *  - functionalLocation: clear customerAssets[].functionalLocationName
 *                      references that pointed at it.
 *  - everything else (workOrderType, serviceTaskType, agreement,
 *    technician, customerAsset, warehouse) just drops the row.
 */

import type { FsPreset } from "./preset";

export type RemoveKind =
  | "territory"
  | "workOrderType"
  | "incidentType"
  | "characteristic"
  | "product"
  | "sampleAccount"
  | "sampleTechnician"
  | "functionalLocation"
  | "customerAsset"
  | "serviceTaskType"
  | "agreement"
  | "warehouse";

export function removePresetItem(
  preset: FsPreset,
  kind: RemoveKind,
  index: number,
): FsPreset {
  // Deep-clone via structuredClone so React sees a brand-new tree and the
  // caller's previous reference (used for Undo) stays intact.
  const next: FsPreset = structuredClone(preset);

  switch (kind) {
    case "territory": {
      const removed = next.territories[index];
      if (!removed) return preset;
      next.territories.splice(index, 1);
      const fallback = next.territories[0]?.code ?? "";
      for (const t of next.sampleTechnicians ?? []) {
        if (t.primaryTerritoryCode === removed.code) {
          t.primaryTerritoryCode = fallback;
        }
      }
      break;
    }
    case "workOrderType": {
      if (!next.workOrderTypes[index]) return preset;
      next.workOrderTypes.splice(index, 1);
      break;
    }
    case "incidentType": {
      const removed = next.incidentTypes[index];
      if (!removed) return preset;
      next.incidentTypes.splice(index, 1);
      for (const a of next.agreements ?? []) {
        if (a.coveredIncidentTypeNames) {
          a.coveredIncidentTypeNames = a.coveredIncidentTypeNames.filter(
            (n) => n !== removed.name,
          );
        }
      }
      break;
    }
    case "characteristic": {
      const removed = next.characteristics[index];
      if (!removed) return preset;
      next.characteristics.splice(index, 1);
      const fallback = next.characteristics[0]?.name ?? "";
      for (const t of next.sampleTechnicians ?? []) {
        if (t.primarySkill === removed.name) t.primarySkill = fallback;
      }
      break;
    }
    case "product": {
      const removed = next.products[index];
      if (!removed) return preset;
      next.products.splice(index, 1);
      for (const a of next.customerAssets ?? []) {
        if (a.productNumber === removed.productNumber) {
          a.productNumber = undefined;
        }
      }
      for (const ag of next.agreements ?? []) {
        if (ag.coveredProductNumbers) {
          ag.coveredProductNumbers = ag.coveredProductNumbers.filter(
            (p) => p !== removed.productNumber,
          );
        }
      }
      break;
    }
    case "sampleAccount": {
      const removed = next.sampleAccounts[index];
      if (!removed) return preset;
      next.sampleAccounts.splice(index, 1);
      next.customerAssets = (next.customerAssets ?? []).filter(
        (a) => a.accountName !== removed.name,
      );
      next.functionalLocations = (next.functionalLocations ?? []).filter(
        (fl) => fl.accountName !== removed.name,
      );
      next.agreements = (next.agreements ?? []).filter(
        (ag) => ag.accountName !== removed.name,
      );
      break;
    }
    case "sampleTechnician": {
      if (!next.sampleTechnicians[index]) return preset;
      next.sampleTechnicians.splice(index, 1);
      break;
    }
    case "functionalLocation": {
      const removed = next.functionalLocations?.[index];
      if (!removed || !next.functionalLocations) return preset;
      next.functionalLocations.splice(index, 1);
      // Also drop child FLs that pointed at this one as their parent.
      next.functionalLocations = next.functionalLocations.filter(
        (fl) => fl.parentName !== removed.name,
      );
      for (const a of next.customerAssets ?? []) {
        if (a.functionalLocationName === removed.name) {
          a.functionalLocationName = undefined;
        }
      }
      break;
    }
    case "customerAsset": {
      if (!next.customerAssets?.[index]) return preset;
      next.customerAssets.splice(index, 1);
      break;
    }
    case "serviceTaskType": {
      if (!next.serviceTaskTypes?.[index]) return preset;
      next.serviceTaskTypes.splice(index, 1);
      break;
    }
    case "agreement": {
      if (!next.agreements?.[index]) return preset;
      next.agreements.splice(index, 1);
      break;
    }
    case "warehouse": {
      if (!next.warehouses?.[index]) return preset;
      next.warehouses.splice(index, 1);
      break;
    }
  }
  return next;
}
