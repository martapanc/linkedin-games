/**
 * Region colours and the names hints use to talk about them. Kept together so
 * the wording can never drift from what is actually on screen.
 */
export const REGIONS = [
  { hex: "#f6a6a0", name: "salmon" },
  { hex: "#ffcf8b", name: "orange" },
  { hex: "#f4ef92", name: "yellow" },
  { hex: "#b3e08d", name: "green" },
  { hex: "#95dcc6", name: "mint" },
  { hex: "#9fd4ef", name: "sky" },
  { hex: "#a8b4f2", name: "indigo" },
  { hex: "#cdaded", name: "purple" },
  { hex: "#f2aad4", name: "pink" },
  { hex: "#cfc3a8", name: "sand" },
  { hex: "#c3c9d1", name: "grey" },
  { hex: "#8fd9a8", name: "jade" },
] as const;

export const REGION_COLORS = REGIONS.map((r) => r.hex);

export const regionName = (g: number) => REGIONS[g % REGIONS.length].name;
