export type TemplateCategory =
  | "all"
  | "consulting"
  | "finance"
  | "work-report"
  | "promotion"
  | "academic";

export type TemplateItem = {
  id: string;
  name: string;
  category: Exclude<TemplateCategory, "all">;
  cover: string;
};

export const TEMPLATE_CATEGORIES: { id: TemplateCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "consulting", label: "Consulting" },
  { id: "finance", label: "Finance" },
  { id: "work-report", label: "Work Report" },
  { id: "promotion", label: "Promotion" },
  { id: "academic", label: "Academic" },
];

/** Brand-free demo covers under public/assets/templates */
export const TEMPLATES: TemplateItem[] = [
  {
    id: "freestyle",
    name: "Freestyle",
    category: "consulting",
    cover: "/assets/templates/template-freestyle.jpg",
  },
  {
    id: "meridian",
    name: "Meridian",
    category: "consulting",
    cover: "/assets/templates/template-meridian.jpg",
  },
  {
    id: "indigo",
    name: "Indigo",
    category: "finance",
    cover: "/assets/templates/template-indigo.jpg",
  },
  {
    id: "lead-grey",
    name: "Lead Grey",
    category: "finance",
    cover: "/assets/templates/template-lead-grey.jpg",
  },
  {
    id: "moss",
    name: "Moss",
    category: "work-report",
    cover: "/assets/templates/template-moss.jpg",
  },
  {
    id: "pine",
    name: "Pine",
    category: "work-report",
    cover: "/assets/templates/template-pine.jpg",
  },
  {
    id: "orange-tech",
    name: "Orange Tech",
    category: "promotion",
    cover: "/assets/templates/template-orange-tech.jpg",
  },
  {
    id: "color-bars",
    name: "Color Bars",
    category: "promotion",
    cover: "/assets/templates/template-color-bars.jpg",
  },
  {
    id: "fresh",
    name: "Fresh",
    category: "academic",
    cover: "/assets/templates/template-fresh.jpg",
  },
];

export const DEFAULT_TEMPLATE_ID = "freestyle";

export function getTemplate(id: string): TemplateItem | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function filterTemplates(category: TemplateCategory): TemplateItem[] {
  if (category === "all") return TEMPLATES;
  return TEMPLATES.filter((t) => t.category === category);
}
