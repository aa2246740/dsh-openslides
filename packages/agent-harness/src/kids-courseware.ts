/**
 * Compatibility shim. Classroom produce uses official playbook recipes.
 * Do not add homemade doodles here — see playbook-recipes.ts.
 */
export {
  ensureOfficialRecipePage as ensureKidsCoursewarePage,
  fallbackTitle,
  isCoursewareBodyPage,
  isHostNoteCopy,
  KIDS_INK,
  paintOfficialRecipePage as paintKidsCoursewarePage,
  PAPER_WHITE,
} from "./playbook-recipes.js";
export type { RecipeKind as PageKind, RecipeOpts as KidsCoursewareOpts } from "./playbook-recipes.js";
