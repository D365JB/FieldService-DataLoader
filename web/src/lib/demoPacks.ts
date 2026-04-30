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

const MEDICAL_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "medical_equipment",
  companyName: "Contoso Medical Imaging Service",
  companyDescription:
    "Hospital biomedical engineering and medical-imaging service provider — MRI/CT, infusion pumps, sterilizers, and ventilator fleets across regional health systems.",
  rationale:
    "Medical pack: serialized FDA-regulated assets with annual JCAHO/Joint Commission PMs, recall management, and emergency repair on patient-impacting equipment.",
  characteristics: [
    { name: "Biomedical Equipment Tech (BMET)", description: "AAMI-recognized BMET certification" },
    { name: "Imaging Service Engineer", description: "OEM-trained on MRI/CT/X-ray" },
    { name: "Joint Commission Trained", description: "JCAHO survey-ready PM documentation" },
    { name: "BLS / Hospital Credentialed", description: "Vendor credentialing system access" },
    { name: "ISO 13485 Aware" },
  ],
  incidentTypes: [
    {
      name: "Annual JCAHO PM",
      description: "Joint Commission preventative maintenance with documentation.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Verify asset tag", "Run OEM PM checklist", "Electrical safety test", "Update PM sticker", "Submit JCAHO record"],
    },
    {
      name: "Imaging Down — STAT",
      description: "MRI/CT down with patients scheduled.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Triage with radiology", "Diagnose subsystem", "Replace FRU", "Phantom scan QA", "Return to clinical"],
    },
    {
      name: "Tube / Detector Replacement",
      description: "Scheduled X-ray tube or detector swap.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["Lockout/tagout", "Crane in tube", "Calibrate", "QA phantom imaging", "Document install"],
    },
    {
      name: "Infusion Pump PM",
      description: "Annual infusion pump electrical safety + flow accuracy.",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Electrical leakage test", "Flow accuracy test", "Battery test", "Tag and return"],
    },
    {
      name: "FDA Recall — Field Action",
      description: "Vendor field action / recall remediation.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Verify serial in scope", "Apply update or swap", "Document FDA disposition", "Return to service"],
    },
  ],
  products: [
    { name: "X-Ray Tube — CT 64-Slice", productNumber: "MED-XTUBE-64", listPrice: 142000.0 },
    { name: "MRI Cold Head", productNumber: "MED-MRICH-01", listPrice: 38500.0 },
    { name: "Infusion Pump Battery", productNumber: "MED-INFB-01", listPrice: 185.0 },
    { name: "Sterilizer Door Gasket", productNumber: "MED-STDG-01", listPrice: 92.0 },
    { name: "Ventilator Flow Sensor", productNumber: "MED-VFS-01", listPrice: 320.0 },
    { name: "Phantom — CT Daily QA", productNumber: "MED-PHCT-01", listPrice: 1250.0 },
    { name: "Biomed Service (Hour)", productNumber: "LBR-BIOMED-HR", listPrice: 195.0 },
    { name: "Imaging Engineer (Hour)", productNumber: "LBR-IMG-HR", listPrice: 285.0 },
  ],
};

const MANUFACTURING_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "industrial",
  companyName: "Adatum Industrial Robotics Service",
  companyDescription:
    "OEM field-service organization for industrial automation — CNC machining centers, palletizers, conveyors, and robotic cells installed at manufacturing customers.",
  rationale:
    "Manufacturing OEM pack: serialized capital equipment under warranty + service contract, IoT-monitored cycle counts, and unplanned-downtime response that hits customer OEE.",
  characteristics: [
    { name: "FANUC Certified", description: "FANUC robot programming + maintenance" },
    { name: "Siemens TIA Trained", description: "Siemens PLC / drive maintenance" },
    { name: "Allen-Bradley / Rockwell" },
    { name: "Arc Flash 70E" },
    { name: "Lockout/Tagout — Authorized" },
  ],
  incidentTypes: [
    {
      name: "Spindle PM",
      description: "Quarterly machining-center spindle preventative maintenance.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Verify cycle count", "Vibration analysis", "Lubrication", "Coolant flush", "Issue PM report"],
    },
    {
      name: "Unplanned Downtime",
      description: "Customer line down — OEE impact.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Remote diag with controls", "Onsite triage", "Replace failed FRU", "Restart and validate cycle"],
    },
    {
      name: "Warranty Claim Service",
      description: "Service performed under OEM warranty.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Verify warranty status", "Capture failure data", "Replace covered part", "Submit warranty claim"],
    },
    {
      name: "Robot Calibration",
      description: "Robot mastering / TCP recalibration after collision or service.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Mastering procedure", "TCP touch-up", "Run validation program", "Sign-off with customer"],
    },
    {
      name: "Commissioning — New Cell",
      description: "Install and commission a new robotic cell.",
      estimatedDurationMinutes: 480,
      serviceTasks: ["Mechanical install", "Electrical termination", "Program load", "Cycle validation", "Customer training"],
    },
  ],
  products: [
    { name: "Spindle Motor — 22kW", productNumber: "IND-SPDL-22", listPrice: 18500.0 },
    { name: "Servo Drive — Axis", productNumber: "IND-DRV-AX", listPrice: 4200.0 },
    { name: "Robot Teach Pendant", productNumber: "IND-PEND-01", listPrice: 5800.0 },
    { name: "Way-Lube — Drum", productNumber: "IND-LUBE-D", listPrice: 285.0 },
    { name: "Coolant Concentrate (Gal)", productNumber: "IND-CLNT-G", listPrice: 42.0 },
    { name: "Encoder Module", productNumber: "IND-ENC-01", listPrice: 1850.0 },
    { name: "Field Engineer (Hour)", productNumber: "LBR-FE-HR", listPrice: 235.0 },
    { name: "Controls Engineer (Hour)", productNumber: "LBR-CTRL-HR", listPrice: 305.0 },
  ],
};

const FIRE_SAFETY_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "fire_safety",
  companyName: "Litware Fire Protection",
  companyDescription:
    "Fire and life-safety service contractor — sprinkler, fire alarm, suppression, and extinguisher inspection across commercial, retail, and healthcare buildings.",
  rationale:
    "Fire & life-safety pack: every customer has code-mandated annual / 5-year inspections, making this the strongest agreements + recurrence story of any vertical.",
  characteristics: [
    { name: "NICET I — Sprinkler" },
    { name: "NICET II — Fire Alarm" },
    { name: "NICET III — Inspection & Testing" },
    { name: "Backflow Tester Certified" },
    { name: "OSHA-30" },
  ],
  incidentTypes: [
    {
      name: "NFPA 25 Annual Inspection",
      description: "Annual sprinkler system inspection per NFPA 25.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Verify riser tags", "Trip test main drain", "Inspect heads / gauges", "Issue NFPA 25 report", "Update AHJ tag"],
    },
    {
      name: "5-Year Internal Inspection",
      description: "5-year internal pipe / valve inspection.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["Drain system", "Open valves for internal inspection", "Photograph corrosion", "Refill and air test", "Submit AHJ paperwork"],
    },
    {
      name: "Fire Alarm Annual Test",
      description: "Annual fire alarm functional test (NFPA 72).",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Notify monitoring", "Test all initiating devices", "Test notification appliances", "Battery load test", "Issue NFPA 72 report"],
    },
    {
      name: "Extinguisher Inspection",
      description: "Monthly / annual portable extinguisher service.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Inspect each unit", "Tag and date", "Recharge if needed", "Update inventory log"],
    },
    {
      name: "Out-of-Service / Impairment",
      description: "Tag system out of service for repair or modification.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Notify AHJ + monitoring", "Tag impairment", "Coordinate fire watch", "Restore service", "Clear impairment ticket"],
    },
  ],
  products: [
    { name: "Sprinkler Head — Pendant", productNumber: "FIRE-SPRK-PD", listPrice: 18.0 },
    { name: "Sprinkler Head — Upright", productNumber: "FIRE-SPRK-UP", listPrice: 18.0 },
    { name: "Smoke Detector — Photo", productNumber: "FIRE-DET-PH", listPrice: 64.0 },
    { name: "Heat Detector — 135F", productNumber: "FIRE-DET-HT", listPrice: 48.0 },
    { name: "ABC Extinguisher 10lb", productNumber: "FIRE-EXT-10", listPrice: 95.0 },
    { name: "FACP Battery — 12V 18Ah", productNumber: "FIRE-BAT-18", listPrice: 78.0 },
    { name: "Inspector (Hour)", productNumber: "LBR-INSP-HR", listPrice: 145.0 },
    { name: "After Hours Call (Hour)", productNumber: "LBR-AHRS-HR", listPrice: 245.0 },
  ],
};

const RESTAURANT_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "restaurant",
  companyName: "Tailwind Kitchen Service",
  companyDescription:
    "Commercial kitchen and refrigeration service contractor — walk-in coolers, fryers, ice machines, combi ovens, and hood systems for QSR, restaurant, and grocery accounts.",
  rationale:
    "Restaurant-equipment pack: many small accounts, lots of emergency calls (food at risk), strong after-hours rate story, and CFESA-certified technicians.",
  characteristics: [
    { name: "CFESA Certified", description: "Commercial Food Equipment Service Association" },
    { name: "EPA 608 Universal", description: "Refrigerant handling certification" },
    { name: "ServSafe Aware" },
    { name: "Gas Appliance Trained" },
    { name: "Hood Cleaning IKECA" },
  ],
  incidentTypes: [
    {
      name: "Ice Machine Down",
      description: "Customer reports ice machine not producing.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Check water supply", "Inspect condenser", "Test harvest cycle", "Sanitize and verify"],
    },
    {
      name: "Fryer No-Heat",
      description: "Fryer not reaching set temp.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Test gas supply / element", "Check thermopile / igniter", "Replace component", "Calibrate setpoint"],
    },
    {
      name: "Walk-In Temp Alarm",
      description: "Walk-in cooler / freezer over-temp alarm — food at risk.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Verify thermometer", "Inspect evaporator coil / fan", "Recharge if needed", "Confirm pull-down"],
    },
    {
      name: "Hood Cleaning — Quarterly",
      description: "Quarterly exhaust-hood degrease and inspection.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Cover equipment", "Degrease hood / filters / duct", "Inspect ANSUL", "Issue IKECA sticker"],
    },
    {
      name: "Combi Oven PM",
      description: "Semi-annual combi oven preventative maintenance.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Descale boiler", "Clean steam jets", "Replace gaskets", "Calibrate probes"],
    },
  ],
  products: [
    { name: "Ice Machine Water Filter", productNumber: "RES-WFLT-01", listPrice: 78.0 },
    { name: "Fryer Thermopile", productNumber: "RES-THRM-01", listPrice: 38.0 },
    { name: "Walk-In Door Gasket (ft)", productNumber: "RES-GSKT-01", listPrice: 14.0 },
    { name: "Hood Filter — Baffle", productNumber: "RES-HDFT-01", listPrice: 42.0 },
    { name: "Combi Oven Door Gasket", productNumber: "RES-COBG-01", listPrice: 165.0 },
    { name: "R-404A Refrigerant (lb)", productNumber: "REF-R404A-LB", listPrice: 28.0 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", listPrice: 135.0 },
    { name: "Emergency / After Hours (Hour)", productNumber: "LBR-EMRG-HR", listPrice: 235.0 },
  ],
};

const UTILITIES_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "utilities",
  companyName: "Northwind Electric Field Ops",
  companyDescription:
    "Investor-owned electric utility distribution operations — meter exchange, transformer maintenance, outage restoration, and substation inspection across multiple service territories.",
  rationale:
    "Electric utility pack: regulated assets, switching authority, and outage-driven storm response — distinct from contractor-style verticals.",
  characteristics: [
    { name: "Journeyman Lineman", description: "IBEW journeyman classification" },
    { name: "Switching Authority — Class A" },
    { name: "Substation Qualified" },
    { name: "OSHA 1910.269" },
    { name: "AMI Smart Meter Trained" },
  ],
  incidentTypes: [
    {
      name: "Meter Exchange",
      description: "Customer meter swap (AMI rollout or change-out).",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Verify customer notify", "Pull old meter", "Install new meter", "Confirm AMI handshake"],
    },
    {
      name: "Outage Restoration",
      description: "Restore service after outage (storm or equipment failure).",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Patrol circuit", "Isolate fault", "Replace damaged equipment", "Re-energize", "Confirm customer back"],
    },
    {
      name: "Substation Inspection",
      description: "Quarterly substation walk-down inspection.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Visual inspection", "Battery readings", "Oil / SF6 levels", "Thermal scan", "Submit report"],
    },
    {
      name: "Transformer Replacement",
      description: "Pad-mount or pole transformer change-out.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["Switching / clearance", "Drain old transformer", "Set new unit", "Re-terminate", "Restore and test"],
    },
    {
      name: "Vegetation Encroachment",
      description: "Coordinate tree trimming on encroaching circuit.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Patrol affected span", "Mark trim zones", "Coordinate vegetation crew", "Verify clearance restored"],
    },
  ],
  products: [
    { name: "AMI Smart Meter — 200A", productNumber: "UTL-MTR-200", listPrice: 285.0 },
    { name: "Pad-Mount Transformer 75kVA", productNumber: "UTL-XFMR-75", listPrice: 8400.0 },
    { name: "Recloser — 15kV", productNumber: "UTL-RCL-15", listPrice: 18500.0 },
    { name: "Capacitor Bank — 600kVAR", productNumber: "UTL-CAP-600", listPrice: 6800.0 },
    { name: "Lineman Hot Stick", productNumber: "UTL-HSTK-01", listPrice: 425.0 },
    { name: "Splice Kit — URD", productNumber: "UTL-SPL-URD", listPrice: 145.0 },
    { name: "Lineman (Hour)", productNumber: "LBR-LINE-HR", listPrice: 185.0 },
    { name: "Storm Premium (Hour)", productNumber: "LBR-STRM-HR", listPrice: 285.0 },
  ],
};

const SOLAR_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "solar",
  companyName: "Helios Solar O&M",
  companyDescription:
    "Operations and maintenance provider for commercial and utility-scale solar PV — string inverter service, panel cleaning, IV-curve diagnostics, and battery storage.",
  rationale:
    "Solar O&M pack: production-loss-driven SLAs, drone thermal inspections, and mixed PV + BESS asset fleet — ideal for IoT alert + agreement story.",
  characteristics: [
    { name: "NABCEP PV Installation" },
    { name: "NABCEP O&M" },
    { name: "Part 107 Drone Pilot" },
    { name: "Arc Flash 70E" },
    { name: "BESS Safety Trained" },
  ],
  incidentTypes: [
    {
      name: "Inverter Down",
      description: "String inverter offline — production loss.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Remote diag via portal", "Onsite verify fault", "Replace failed unit", "Commission and verify production"],
    },
    {
      name: "Annual PV PM",
      description: "Annual visual + electrical PM on PV array.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Drone thermal scan", "Torque check combiner", "IV-curve sample", "Issue PM report"],
    },
    {
      name: "Module Cleaning",
      description: "Soiling-driven module cleaning campaign.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["Site safety brief", "Wash modules", "Verify production lift", "Document soiling rate"],
    },
    {
      name: "BESS Inspection",
      description: "Battery energy storage quarterly inspection.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["BMS check", "Cell voltage scan", "Thermal imaging", "Verify fire suppression"],
    },
    {
      name: "Underperformance Investigation",
      description: "Investigate underperforming string vs PVsyst expected.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Pull production data", "IV-curve string", "Identify hotspot / shading", "Remediate and re-baseline"],
    },
  ],
  products: [
    { name: "String Inverter — 60kW", productNumber: "SOL-INV-60", listPrice: 7800.0 },
    { name: "PV Module — 540W Mono", productNumber: "SOL-MOD-540", listPrice: 215.0 },
    { name: "MC4 Connector Pair", productNumber: "SOL-MC4-PR", listPrice: 4.5 },
    { name: "Combiner Box — 12 String", productNumber: "SOL-CMB-12", listPrice: 1450.0 },
    { name: "BESS Module — 50kWh", productNumber: "SOL-BESS-50", listPrice: 18500.0 },
    { name: "IV-Curve Tracer Rental (Day)", productNumber: "SOL-IVC-D", listPrice: 245.0 },
    { name: "Field Tech (Hour)", productNumber: "LBR-PVT-HR", listPrice: 165.0 },
    { name: "Drone Inspection (Site)", productNumber: "LBR-DRN-SITE", listPrice: 850.0 },
  ],
};

const RETAIL_TECH_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "retail_tech",
  companyName: "Fourth Coffee Retail Tech Services",
  companyDescription:
    "Retail and hospitality technology break-fix — POS terminals, kitchen display systems, self-service kiosks, ATMs, and digital signage across thousands of small sites.",
  rationale:
    "Retail tech break-fix pack: high-volume small-ticket SLA model with thousands of sites, dispatch-driven 4-hour response, and tight per-site SLAs.",
  characteristics: [
    { name: "PCI Compliance Trained" },
    { name: "Network+ Certified" },
    { name: "POS OEM — NCR / Toshiba" },
    { name: "Background Check — Cleared" },
    { name: "Customer-Facing / Soft Skills" },
  ],
  incidentTypes: [
    {
      name: "POS Lane Down",
      description: "Single POS lane offline at retail site.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Remote diag triage", "Onsite swap component", "Verify card-reader handshake", "Lane back online"],
    },
    {
      name: "Kiosk Refresh",
      description: "Self-service kiosk OS / image refresh.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Apply new image", "Verify peripherals", "Test transactions", "Close ticket"],
    },
    {
      name: "ATM Cash Door Issue",
      description: "ATM not dispensing or cash-door fault.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Coordinate with cash vendor", "Diagnose dispenser", "Replace module", "Test and reconcile"],
    },
    {
      name: "Digital Signage Black Screen",
      description: "Digital signage display black or frozen.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Power-cycle media player", "Check HDMI / network", "Reload content", "Verify with site manager"],
    },
    {
      name: "Network Switch Swap",
      description: "Replace failed retail switch or AP.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Document existing config", "Swap hardware", "Apply config", "Verify all lanes online"],
    },
  ],
  products: [
    { name: "POS Terminal — Standard", productNumber: "RTL-POS-STD", listPrice: 1450.0 },
    { name: "Card Reader — EMV", productNumber: "RTL-CRDR-01", listPrice: 285.0 },
    { name: "Receipt Printer", productNumber: "RTL-RPRT-01", listPrice: 245.0 },
    { name: "Cash Drawer", productNumber: "RTL-DRWR-01", listPrice: 145.0 },
    { name: "Network Switch — 24-port", productNumber: "RTL-SW-24", listPrice: 685.0 },
    { name: "Wireless AP", productNumber: "RTL-AP-01", listPrice: 285.0 },
    { name: "Field Tech (Hour)", productNumber: "LBR-RTL-HR", listPrice: 95.0 },
    { name: "After Hours / 24x7 (Hour)", productNumber: "LBR-AHRS-HR", listPrice: 165.0 },
  ],
};

const PEST_CONTROL_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "pest_control",
  companyName: "Sentinel Pest Management",
  companyDescription:
    "Commercial and residential pest management — recurring route-based treatment, termite warranty, and IPM programs for food-service, healthcare, and multifamily.",
  rationale:
    "Pest control pack: pure recurring-revenue route model — strongest agreement / route-density story, with regulated chemical use and detailed inspection logs.",
  characteristics: [
    { name: "Licensed Applicator", description: "State-licensed pesticide applicator" },
    { name: "ACE — Associate Certified Entomologist" },
    { name: "Bait Station Auditor" },
    { name: "AIB Food Safety" },
    { name: "Wildlife Removal Permit" },
  ],
  incidentTypes: [
    {
      name: "Monthly Route Service",
      description: "Recurring monthly preventative pest treatment.",
      estimatedDurationMinutes: 45,
      serviceTasks: ["Inspect bait stations", "Refresh / rotate bait", "Treat hotspots", "Issue service log"],
    },
    {
      name: "Quarterly Inspection",
      description: "Quarterly inspection for commercial accounts.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Full perimeter walk", "Document conducive conditions", "Treat as needed", "Issue inspection report"],
    },
    {
      name: "Termite Annual Renewal",
      description: "Annual termite inspection and warranty renewal.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Subterranean station check", "Probe wood members", "Document activity", "Renew warranty paperwork"],
    },
    {
      name: "Emergency Treatment",
      description: "Customer-reported active infestation.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Identify pest species", "Apply targeted treatment", "Schedule follow-up", "Educate customer"],
    },
    {
      name: "Wildlife Exclusion",
      description: "Trap and exclude nuisance wildlife.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Inspect entry points", "Set traps", "Seal exclusion points", "Schedule trap check"],
    },
  ],
  products: [
    { name: "Rodent Bait Station", productNumber: "PST-BAIT-ST", listPrice: 18.0 },
    { name: "Insect Monitor — Glue Board", productNumber: "PST-MON-GB", listPrice: 4.5 },
    { name: "Termite Bait Cartridge", productNumber: "PST-TBC-01", listPrice: 38.0 },
    { name: "Liquid Termiticide (Gal)", productNumber: "PST-TLIQ-G", listPrice: 145.0 },
    { name: "Aerosol Treatment Can", productNumber: "PST-AERO-01", listPrice: 12.0 },
    { name: "Live Trap — Medium", productNumber: "PST-TRAP-M", listPrice: 65.0 },
    { name: "Route Service (Visit)", productNumber: "LBR-RTE-VIS", listPrice: 75.0 },
    { name: "Emergency Treatment (Hour)", productNumber: "LBR-EMRG-HR", listPrice: 165.0 },
  ],
};

const ELEVATOR_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "elevator",
  companyName: "Vertex Vertical Transportation",
  companyDescription:
    "Elevator and escalator service contractor — monthly maintenance, code inspections, modernization, and emergency entrapment response across high-rise commercial buildings.",
  rationale:
    "Elevator pack: heavily regulated, monthly maintenance contracts, AHJ inspection coordination, and entrapment/24x7 response — distinct vendor-coordination story.",
  characteristics: [
    { name: "Licensed Elevator Mechanic", description: "State-licensed elevator mechanic" },
    { name: "QEI Inspector", description: "ASME QEI-1 certified inspector" },
    { name: "CAT-5 Load Test Trained" },
    { name: "OEM Trained — Otis / KONE / Schindler" },
    { name: "Confined Space Entry" },
  ],
  incidentTypes: [
    {
      name: "Monthly Maintenance",
      description: "Monthly elevator preventative maintenance per contract.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Machine room inspection", "Lubrication", "Door operator check", "Ride quality test", "Sign maintenance log"],
    },
    {
      name: "Annual Code Inspection",
      description: "Coordinate annual AHJ code inspection.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Pre-inspection walk", "Coordinate inspector", "Address findings", "Update certificate"],
    },
    {
      name: "Entrapment Response",
      description: "Passenger entrapment — emergency response.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Confirm passengers safe", "Recall car", "Diagnose root cause", "Restore service"],
    },
    {
      name: "Door Operator Adjustment",
      description: "Door not closing / opening — adjust or replace.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Diagnose detector edge / clutch", "Adjust operator", "Verify with full ride cycle"],
    },
    {
      name: "Modernization — Controller Swap",
      description: "Replace legacy relay controller with microprocessor.",
      estimatedDurationMinutes: 480,
      serviceTasks: ["Disable car", "Remove legacy controller", "Install + commission new", "Code inspection", "Return to service"],
    },
  ],
  products: [
    { name: "Door Operator Belt", productNumber: "ELV-DOB-01", listPrice: 145.0 },
    { name: "Detector Edge", productNumber: "ELV-DET-01", listPrice: 685.0 },
    { name: "Hoistway Position Sensor", productNumber: "ELV-HPS-01", listPrice: 425.0 },
    { name: "Microprocessor Controller", productNumber: "ELV-CTRL-MP", listPrice: 28500.0 },
    { name: "Hydraulic Oil — 5gal", productNumber: "ELV-OIL-5", listPrice: 145.0 },
    { name: "Brake Pad Set", productNumber: "ELV-BRK-01", listPrice: 285.0 },
    { name: "Mechanic (Hour)", productNumber: "LBR-ELVM-HR", listPrice: 215.0 },
    { name: "Entrapment Premium (Hour)", productNumber: "LBR-ENTR-HR", listPrice: 385.0 },
  ],
};

const CONSTRUCTION_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "construction",
  companyName: "Trinity Heavy Equipment Service",
  companyDescription:
    "Heavy construction equipment dealer service — excavators, loaders, dozers, and articulated trucks under warranty + telematics-driven maintenance contracts.",
  rationale:
    "Heavy equipment pack: telematics + IoT alerts + warranty recovery + traveling-tech model — best of both manufacturing and field service.",
  characteristics: [
    { name: "Diesel Master Tech" },
    { name: "Hydraulic Specialist" },
    { name: "Telematics Trained" },
    { name: "DOT Brake Inspection" },
    { name: "Welder — Stick / MIG" },
  ],
  incidentTypes: [
    {
      name: "Telematics Hour-Based PM",
      description: "Hour-meter-triggered preventative maintenance from telematics.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Pull telematics report", "Drain fluids / replace filters", "Inspect undercarriage", "Update next-PM hour"],
    },
    {
      name: "Hydraulic Failure",
      description: "Customer-reported hydraulic failure on machine.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Onsite diag", "Pressure test circuits", "Replace pump / cylinder", "Flush system"],
    },
    {
      name: "Warranty Recovery",
      description: "Service performed under OEM warranty.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Verify warranty", "Capture failure photos", "Replace covered part", "Submit warranty claim"],
    },
    {
      name: "Track / Undercarriage",
      description: "Track tension, replacement, or undercarriage rebuild.",
      estimatedDurationMinutes: 360,
      serviceTasks: ["Measure wear", "Adjust tension or rebuild", "Verify alignment", "Customer sign-off"],
    },
    {
      name: "PDI — New Machine Delivery",
      description: "Pre-delivery inspection on new equipment.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Run PDI checklist", "Walk-around with customer", "Train on telematics portal", "Sign delivery"],
    },
  ],
  products: [
    { name: "Hydraulic Oil — 55gal Drum", productNumber: "CON-HYDO-55", listPrice: 685.0 },
    { name: "Air Filter — Heavy Equip", productNumber: "CON-AIRF-HE", listPrice: 145.0 },
    { name: "Track Pad Set", productNumber: "CON-TRK-01", listPrice: 1450.0 },
    { name: "Hydraulic Pump — Excavator", productNumber: "CON-HYDP-EX", listPrice: 8500.0 },
    { name: "Bucket Tooth", productNumber: "CON-TTH-01", listPrice: 185.0 },
    { name: "Telematics Module", productNumber: "CON-TLM-01", listPrice: 1250.0 },
    { name: "Field Service (Hour)", productNumber: "LBR-HEQ-HR", listPrice: 195.0 },
    { name: "Travel — Onsite (Mile)", productNumber: "LBR-TRVL-MI", listPrice: 2.5 },
  ],
};

const POOL_SPA_PACK: FsPreset = {
  ...GENERIC_PRESET,
  vertical: "pool_spa",
  companyName: "Crystal Waters Pool & Spa",
  companyDescription:
    "Residential and light-commercial pool and spa service — weekly route service, equipment repair, seasonal opening/closing, and chemical balancing.",
  rationale:
    "Pool & spa pack: simple residential vertical, weekly route + seasonal cadence, relatable visuals — good entry-level demo for SMB customers.",
  characteristics: [
    { name: "CPO — Certified Pool Operator" },
    { name: "Pool Heater Trained" },
    { name: "Salt System Certified" },
    { name: "Chemistry — Tested Up" },
    { name: "Customer Comm / Soft Skills" },
  ],
  incidentTypes: [
    {
      name: "Weekly Route Service",
      description: "Weekly residential pool maintenance.",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Test water chemistry", "Vacuum / brush", "Empty baskets", "Adjust chemicals", "Issue service log"],
    },
    {
      name: "Pump Repair",
      description: "Pool pump not running or leaking.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Diagnose motor / capacitor", "Replace seals or motor", "Prime and verify flow"],
    },
    {
      name: "Heater No-Heat",
      description: "Pool heater not igniting or not reaching set temp.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Test gas / igniter", "Inspect heat exchanger", "Replace component", "Verify run"],
    },
    {
      name: "Seasonal Opening",
      description: "Spring pool opening — uncover, restart, balance.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Remove cover", "Reinstall plugs / baskets", "Start equipment", "Balance chemistry", "Customer walkthrough"],
    },
    {
      name: "Seasonal Closing",
      description: "Fall pool closing — winterize and cover.",
      estimatedDurationMinutes: 180,
      serviceTasks: ["Lower water", "Blow out lines", "Add winterizing chemicals", "Install cover"],
    },
  ],
  products: [
    { name: "Chlorine Tabs — 50lb", productNumber: "POOL-CL-50", listPrice: 285.0 },
    { name: "Muriatic Acid (Gal)", productNumber: "POOL-ACID-G", listPrice: 14.0 },
    { name: "Pool Pump — 1.5HP", productNumber: "POOL-PMP-15", listPrice: 685.0 },
    { name: "Cartridge Filter", productNumber: "POOL-CFLT-01", listPrice: 165.0 },
    { name: "Salt Cell", productNumber: "POOL-SLT-01", listPrice: 685.0 },
    { name: "Heater Igniter", productNumber: "POOL-IGN-01", listPrice: 95.0 },
    { name: "Route Service (Visit)", productNumber: "LBR-RTE-VIS", listPrice: 65.0 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", listPrice: 125.0 },
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
  {
    id: "medical",
    label: "Medical / Biomed",
    blurb: "Hospital biomed + imaging service — JCAHO PMs, MRI/CT, infusion pumps.",
    preset: MEDICAL_PACK,
  },
  {
    id: "manufacturing",
    label: "Manufacturing OEM",
    blurb: "Industrial robotics + CNC OEM service — warranty, downtime, IoT.",
    preset: MANUFACTURING_PACK,
  },
  {
    id: "fire_safety",
    label: "Fire & Life Safety",
    blurb: "Sprinkler / alarm / extinguisher — NFPA 25 + 72 inspection contracts.",
    preset: FIRE_SAFETY_PACK,
  },
  {
    id: "restaurant",
    label: "Restaurant / Kitchen",
    blurb: "Commercial kitchen + refrigeration — fryers, ice machines, walk-ins.",
    preset: RESTAURANT_PACK,
  },
  {
    id: "utilities",
    label: "Electric Utility",
    blurb: "Distribution field ops — meters, transformers, outage restoration.",
    preset: UTILITIES_PACK,
  },
  {
    id: "solar",
    label: "Solar / Renewables O&M",
    blurb: "PV + BESS O&M — inverter service, drone thermal, IV-curve.",
    preset: SOLAR_PACK,
  },
  {
    id: "retail_tech",
    label: "Retail Tech Break-Fix",
    blurb: "POS / kiosk / ATM / signage — high-volume small-ticket SLAs.",
    preset: RETAIL_TECH_PACK,
  },
  {
    id: "pest_control",
    label: "Pest Control",
    blurb: "Route-based recurring pest management — IPM + termite warranty.",
    preset: PEST_CONTROL_PACK,
  },
  {
    id: "elevator",
    label: "Elevator / Vertical Trans",
    blurb: "Elevator service — monthly PM, code inspection, entrapment response.",
    preset: ELEVATOR_PACK,
  },
  {
    id: "construction",
    label: "Heavy Equipment",
    blurb: "Excavator / loader OEM service — telematics PM + warranty recovery.",
    preset: CONSTRUCTION_PACK,
  },
  {
    id: "pool_spa",
    label: "Pool & Spa",
    blurb: "Residential pool service — weekly route, seasonal open/close.",
    preset: POOL_SPA_PACK,
  },
];
