/**
 * Curated vertical-specific demo packs (Phase 7). Each pack is a complete
 * FsPreset tuned for a specific industry so a presenter can pick the closest
 * match without running web analysis. They derive most fields from the generic
 * preset and override only the vertical-specific bits (incidentTypes, products,
 * accounts, assets, agreements, warehouses).
 */
import type { FsPreset } from "@/lib/preset";
import { GENERIC_PRESET } from "@/lib/genericPreset";

const HVAC_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "hvac",
  companyName: "Contoso HVAC Services",
  companyDescription:
    "Commercial HVAC service contractor — installation, scheduled maintenance, and emergency repair across the southeast US.",
  rationale:
    "HVAC pack: chiller / RTU / boiler maintenance with seasonal preventative cadence and refrigerant/EPA-regulated work.",
  characteristics: [
    { name: "EPA 608 Universal", description: "Refrigerant handling certification" },
    { name: "NATE Certified", description: "HVAC technician certification" },
    { name: "Boiler License", description: "State boiler operator license" },
    { name: "Lift Truck Certified" },
    { name: "OSHA-10" },
  ],
  incidentTypes: [
    {
      name: "Annual PM — RTU",
      description: "Yearly preventative maintenance on rooftop unit.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Inspect belts/coils", "Clean condenser", "Check refrigerant pressures", "Calibrate thermostat"],
    },
    {
      name: "No Cooling Call",
      description: "Customer reports cooling failure.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Diagnose root cause", "Recover refrigerant if needed", "Replace component", "Verify operation"],
    },
    {
      name: "Filter Change",
      description: "Quarterly filter rotation.",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Remove old filters", "Install new filters", "Document MERV rating"],
    },
    {
      name: "Boiler Inspection",
      description: "Annual boiler safety inspection.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Check pressure relief", "Inspect burner", "Test cutoffs", "Update inspection sticker"],
    },
    {
      name: "Refrigerant Leak Repair",
      description: "Detect and repair refrigerant leak.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Pressure test", "Locate leak", "Braze repair", "Recharge system", "Submit EPA log"],
    },
  ],
  products: [
    { name: "MERV-13 Filter Pack (4)", productNumber: "FILT-M13-04", listPrice: 89.0 },
    { name: "MERV-8 Filter Pack (4)", productNumber: "FILT-M08-04", listPrice: 39.0 },
    { name: "R-410A Refrigerant (lb)", productNumber: "REF-R410A-LB", listPrice: 18.5 },
    { name: "R-32 Refrigerant (lb)", productNumber: "REF-R32-LB", listPrice: 22.0 },
    { name: "Compressor — 5 Ton", productNumber: "COMP-5T-01", listPrice: 1480.0 },
    { name: "Condenser Fan Motor", productNumber: "PART-FANM-01", listPrice: 220.0 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", listPrice: 145.0 },
    { name: "Emergency Visit (Hour)", productNumber: "LBR-EMRG-HR", listPrice: 245.0 },
  ],
};

const TELECOM_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "telecom",
  companyName: "Northwind Telecom Field Ops",
  companyDescription:
    "Wireless tower and small-cell field operations — install, generator maintenance, and 5G cabinet refresh across the eastern US.",
  rationale:
    "Telecom pack: tower/site visits, RF safety, generator PM, and battery-bank cycling — typical of carrier field ops.",
  characteristics: [
    { name: "Tower Climber Certified", description: "Comp-Trained tower climber" },
    { name: "RF Safety Trained", description: "FCC RF exposure awareness" },
    { name: "Authority to Work at Height" },
    { name: "Fiber Splicing", description: "Fusion splicing certification" },
    { name: "Generator PM Certified" },
  ],
  incidentTypes: [
    {
      name: "Tower Inspection",
      description: "Annual structural and RF safety inspection.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Climb safety check", "Visual structural inspection", "RF pattern test", "Submit photos"],
    },
    {
      name: "Generator Quarterly PM",
      description: "Backup generator preventative maintenance.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Oil change", "Coolant check", "Battery test", "Test transfer switch"],
    },
    {
      name: "Battery Bank Replacement",
      description: "Cycle and replace battery banks.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Disconnect battery bank", "Swap cells", "Verify rectifier output", "Document load test"],
    },
    {
      name: "5G Cabinet Refresh",
      description: "Add or upgrade 5G radio in existing cabinet.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["RF survey", "Mount radio", "Fiber splice", "Commission and verify KPIs"],
    },
    {
      name: "Site Down — Emergency",
      description: "Site is down, customer impact active.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Isolate fault", "Restore power if needed", "Replace failed unit", "Verify return to service"],
    },
  ],
  products: [
    { name: "12V Battery Cell", productNumber: "BAT-12V-CELL", listPrice: 320.0 },
    { name: "Diesel — 50 Gal Drum", productNumber: "FUEL-D50", listPrice: 215.0 },
    { name: "Generator Oil Filter", productNumber: "PART-OILF-01", listPrice: 28.0 },
    { name: "Coax Connector Kit", productNumber: "PART-COAX-01", listPrice: 95.0 },
    { name: "Fiber Splice Tray", productNumber: "PART-FIBR-01", listPrice: 145.0 },
    { name: "5G Radio Module", productNumber: "RADIO-5G-01", listPrice: 4250.0 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", listPrice: 165.0 },
    { name: "Tower Climb (Hour)", productNumber: "LBR-CLMB-HR", listPrice: 285.0 },
  ],
};

const PROPERTY_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "facilities",
  companyName: "Fabrikam Facilities Management",
  companyDescription:
    "Multi-tenant commercial property facilities management — janitorial, light electrical, plumbing, and elevator coordination.",
  rationale:
    "Property pack: facility tickets covering plumbing, electrical, lighting, elevator, and HVAC issues from tenant requests — typical of commercial REIT field ops.",
  characteristics: [
    { name: "Master Electrician" },
    { name: "Master Plumber" },
    { name: "Locksmith Certified" },
    { name: "Elevator Mechanic License" },
    { name: "Lockout/Tagout Trained" },
  ],
  incidentTypes: [
    {
      name: "Lighting Out",
      description: "Tenant reports lighting failure.",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Identify fixture", "Replace lamp / driver", "Verify operation"],
    },
    {
      name: "Plumbing — Leak",
      description: "Tenant reports active leak.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Shut off water", "Diagnose source", "Repair", "Verify dry"],
    },
    {
      name: "HVAC Comfort Call",
      description: "Tenant reports too hot / too cold.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Check zone setpoint", "Verify damper", "Adjust setpoint", "Confirm with tenant"],
    },
    {
      name: "Lock Issue",
      description: "Tenant lockout, lost key, or rekey request.",
      estimatedDurationMinutes: 45,
      serviceTasks: ["Verify tenant authority", "Rekey or open", "Cut new keys", "Update key log"],
    },
    {
      name: "Elevator Coordination",
      description: "Coordinate elevator vendor for repair / inspection.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Lock out car", "Coordinate vendor access", "Verify return to service", "Update inspection log"],
    },
  ],
  products: [
    { name: "LED T8 Tube — Pack of 25", productNumber: "LIGHT-LED-T8", listPrice: 145.0 },
    { name: "LED Driver — 40W", productNumber: "LIGHT-DRV-40", listPrice: 38.0 },
    { name: "Toilet Fill Valve", productNumber: "PLMB-FILL-01", listPrice: 22.0 },
    { name: "Wax Ring — Standard", productNumber: "PLMB-WAX-01", listPrice: 8.5 },
    { name: "Mortise Lock Set", productNumber: "LOCK-MORT-01", listPrice: 285.0 },
    { name: "Re-key Pin Kit", productNumber: "LOCK-PIN-01", listPrice: 42.0 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", listPrice: 125.0 },
    { name: "After Hours Call (Hour)", productNumber: "LBR-AHRS-HR", listPrice: 195.0 },
  ],
};

export interface DemoPack {
  id: string;
  label: string;
  blurb: string;
  preset: FsPreset;
}

export const DEMO_PACKS: DemoPack[] = [
  {
    id: "generic",
    label: "Generic",
    blurb: "Vendor-agnostic baseline. Works for any vertical out of the box.",
    preset: GENERIC_PRESET,
  },
  {
    id: "hvac",
    label: "HVAC",
    blurb: "Commercial HVAC contractor — RTUs, chillers, refrigerant handling.",
    preset: HVAC_PACK,
  },
  {
    id: "telecom",
    label: "Telecom",
    blurb: "Wireless field ops — towers, generators, 5G cabinet refresh.",
    preset: TELECOM_PACK,
  },
  {
    id: "facilities",
    label: "Property / Facilities",
    blurb: "Multi-tenant commercial property — lighting, plumbing, elevator coord.",
    preset: PROPERTY_PACK,
  },
];
