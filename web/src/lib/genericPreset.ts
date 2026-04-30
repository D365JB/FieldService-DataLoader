import type { FsPreset } from "./preset";

/**
 * Generic, vertical-agnostic Field Service preset used when the user clicks
 * "Skip" instead of analyzing a customer URL. Realistic enough to demo end-to-end
 * without picking an industry.
 */
export const GENERIC_PRESET: FsPreset = {
  vertical: "generic",
  companyName: "Contoso Field Services",
  companyDescription:
    "A regional field service provider handling installations, repairs, and preventative maintenance for commercial customers across the United States.",
  rationale:
    "Generic preset selected — covers the most common Field Service entities and flows so you can demo the platform without industry-specific tailoring.",
  territories: [
    { name: "Northeast", code: "NE", description: "NY, NJ, PA, MA, CT" },
    { name: "Southeast", code: "SE", description: "FL, GA, NC, SC" },
    { name: "Midwest", code: "MW", description: "IL, OH, MI, WI" },
    { name: "Southwest", code: "SW", description: "TX, AZ, NM" },
    { name: "West", code: "W", description: "CA, WA, OR, NV" },
  ],
  workOrderTypes: [
    { name: "Installation", code: "INSTALL", description: "New equipment install" },
    { name: "Preventative Maintenance", code: "PM", description: "Scheduled service visit" },
    { name: "Repair", code: "REPAIR", description: "Reactive break/fix" },
    { name: "Inspection", code: "INSPECT", description: "Compliance or warranty inspection" },
    { name: "Emergency", code: "EMRG", description: "Same-day emergency response" },
  ],
  incidentTypes: [
    {
      name: "Equipment Not Working",
      description: "Unit completely down — customer cannot operate.",
      estimatedDurationMinutes: 120,
      serviceTasks: ["Diagnose root cause", "Replace failed component", "Test operation", "Document findings"],
    },
    {
      name: "Intermittent Failure",
      description: "Unit operates inconsistently or trips offline periodically.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Review logs", "Reproduce issue", "Measure key signals", "Apply fix"],
    },
    {
      name: "Annual Inspection",
      description: "Yearly preventative inspection per customer contract.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Visual inspection", "Performance test", "Update inspection record"],
    },
    {
      name: "New Installation",
      description: "Install and commission new equipment at customer site.",
      estimatedDurationMinutes: 240,
      serviceTasks: ["Verify site readiness", "Install equipment", "Commission", "Train customer"],
    },
    {
      name: "Filter Change",
      description: "Routine consumable replacement.",
      estimatedDurationMinutes: 30,
      serviceTasks: ["Remove old filter", "Install new filter", "Verify operation"],
    },
    {
      name: "Software / Firmware Update",
      description: "Apply manufacturer firmware patch.",
      estimatedDurationMinutes: 45,
      serviceTasks: ["Backup config", "Apply update", "Verify version", "Restore config"],
    },
    {
      name: "Warranty Claim",
      description: "Service event covered under manufacturer warranty.",
      estimatedDurationMinutes: 90,
      serviceTasks: ["Document defect", "Photograph nameplate", "Replace under warranty", "Submit claim paperwork"],
    },
    {
      name: "Customer Training",
      description: "On-site walkthrough and operator training.",
      estimatedDurationMinutes: 60,
      serviceTasks: ["Walk through controls", "Demonstrate routine maintenance", "Hand off documentation"],
    },
  ],
  characteristics: [
    { name: "Senior Technician", description: "5+ years field experience" },
    { name: "Apprentice", description: "Trainee, must work supervised" },
    { name: "Electrical License", description: "State electrical license required" },
    { name: "OSHA-30", description: "OSHA 30-hour construction safety" },
    { name: "Forklift Certified", description: "Powered industrial truck cert" },
    { name: "EPA Certified", description: "EPA Section 608 universal" },
  ],
  products: [
    { name: "Standard Filter Pack", productNumber: "FILT-STD-01", description: "Pack of 4", listPrice: 49.99 },
    { name: "Premium Filter Pack", productNumber: "FILT-PRM-01", description: "Pack of 4 HEPA", listPrice: 119.99 },
    { name: "Service Visit (Hour)", productNumber: "LBR-SVC-HR", description: "Standard labor", listPrice: 145.0 },
    { name: "Emergency Visit (Hour)", productNumber: "LBR-EMRG-HR", description: "After-hours labor", listPrice: 245.0 },
    { name: "Diagnostic Fee", productNumber: "FEE-DIAG-01", description: "Flat diagnostic", listPrice: 95.0 },
    { name: "Replacement Sensor", productNumber: "PART-SNSR-01", description: "Universal sensor", listPrice: 78.5 },
    { name: "Replacement Pump", productNumber: "PART-PUMP-01", description: "1HP pump", listPrice: 380.0 },
    { name: "Control Board", productNumber: "PART-CTRL-01", description: "Universal control board", listPrice: 615.0 },
  ],
  sampleAccounts: [
    { name: "Northwind Manufacturing", city: "Albany", state: "NY", siteDescription: "Two-building manufacturing campus" },
    { name: "Tailspin Distribution", city: "Atlanta", state: "GA", siteDescription: "Regional distribution center" },
    { name: "Fabrikam Office Tower", city: "Chicago", state: "IL", siteDescription: "30-story commercial office" },
    { name: "Adventure Works Hotel", city: "Dallas", state: "TX", siteDescription: "Full-service hotel" },
    { name: "Wide World Importers", city: "Los Angeles", state: "CA", siteDescription: "Coastal warehouse" },
    { name: "Proseware Health Clinic", city: "Boston", state: "MA", siteDescription: "Outpatient medical center" },
    { name: "Lucerne Logistics", city: "Phoenix", state: "AZ", siteDescription: "Cross-dock facility" },
    { name: "Wingtip Toys Retail", city: "Miami", state: "FL", siteDescription: "Flagship retail store" },
    { name: "Litware Tech Park", city: "Seattle", state: "WA", siteDescription: "Tech-tenant office park" },
    { name: "Contoso Lumber Yard", city: "Detroit", state: "MI", siteDescription: "Outdoor lumber yard" },
  ],
  sampleTechnicians: [
    { name: "Alex Carter", primarySkill: "Senior Technician", primaryTerritoryCode: "NE" },
    { name: "Jamie Liu", primarySkill: "EPA Certified", primaryTerritoryCode: "NE" },
    { name: "Morgan Reyes", primarySkill: "Senior Technician", primaryTerritoryCode: "SE" },
    { name: "Taylor Brooks", primarySkill: "Electrical License", primaryTerritoryCode: "MW" },
    { name: "Jordan Singh", primarySkill: "Senior Technician", primaryTerritoryCode: "SW" },
    { name: "Casey Nguyen", primarySkill: "OSHA-30", primaryTerritoryCode: "W" },
    { name: "Riley Patel", primarySkill: "Forklift Certified", primaryTerritoryCode: "MW" },
    { name: "Sam Cohen", primarySkill: "Apprentice", primaryTerritoryCode: "NE" },
  ],
};
