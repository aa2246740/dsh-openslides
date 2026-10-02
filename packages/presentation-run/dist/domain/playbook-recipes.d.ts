/**
 * Official OpenKimi recipes for classroom produce.
 * Source: academic/paper-white-courseware + education-training.
 * Not kids-courseware doodles. write_page executes these page-by-page.
 */
import type { PptdElement } from "@open-slidestudio/pptd-v2";
import type { SkillPageInput } from "./skill-pages.js";
/** Paper-white PART B tokens. */
export declare const PAPER_WHITE: {
    readonly paper: "#FDFAF5";
    readonly title: "#44712E";
    readonly body: "#56687A";
    readonly muted: "#8A9690";
    readonly coral: "#F5987E";
    readonly leaf: "#D7EBCE";
    readonly blush: "#F9DED8";
    readonly white: "#FFFFFF";
};
/** @deprecated Use PAPER_WHITE. Kept so old imports keep compiling. */
export declare const KIDS_INK: {
    readonly paper: "#FDFAF5";
    readonly title: "#44712E";
    readonly body: "#56687A";
    readonly muted: "#8A9690";
    readonly coral: "#F5987E";
    readonly leaf: "#D7EBCE";
    readonly blush: "#F9DED8";
    readonly white: "#FFFFFF";
};
export type RecipeKind = "cover" | "route" | "concept" | "method" | "demo" | "transfer";
export type RecipeOpts = {
    brief: string;
    index: number;
    pageCount?: number;
    /** Ignored. Official recipes apply to every classroom page. */
    body?: boolean;
    /** Existing media src (search/generate/upload). Empty = official no-image layout. */
    imageSrc?: string;
    imageAvailable?: boolean;
};
/** YAML notes: and host scaffolding must never become visible title text. */
export declare function isHostNoteCopy(text: string): boolean;
export declare function fallbackTitle(brief: string, kind: RecipeKind): string;
export declare function isFragmentTitle(text: string): boolean;
/** One official name+note set per page type. Never mash leftovers onto a second list. */
export declare function officialCopyPairs(brief: string, kind: RecipeKind): Array<{
    name: string;
    note: string;
}>;
export declare function kindCopyMatches(elements: PptdElement[], kind: RecipeKind, brief: string): boolean;
export declare function recipeKind(page: SkillPageInput, index: number): RecipeKind;
export declare function paintOfficialRecipePage(page: SkillPageInput, opts: RecipeOpts): SkillPageInput;
/** Homemade 4-step numbered circles in a row — forbidden when list/tool exists. */
export declare function hasHomemadeFourCircles(elements: PptdElement[]): boolean;
/** Soil / sun / sprout cartoon — not an official recipe. */
export declare function hasKidsDoodle(elements: PptdElement[]): boolean;
/** Kind-specific official finish. List pills alone are not a concept/cover recipe. */
export declare function hasOfficialRecipeKind(elements: PptdElement[], kind: RecipeKind): boolean;
export declare function hasOfficialRecipe(elements: PptdElement[], kind?: RecipeKind): boolean;
/** Title rewrite only. Never replace the agent's written elements with a host recipe. */
export declare function keepWrittenClassroomPage(page: SkillPageInput, opts: RecipeOpts): {
    page: SkillPageInput;
    applied: boolean;
    painted: false;
    restamped: false;
};
/** Keep the agent's official header/list/box page. Only fix titles. Do not restamp leftovers. */
export declare function ensureOfficialRecipePage(page: SkillPageInput, opts: RecipeOpts): {
    page: SkillPageInput;
    applied: boolean;
    painted: boolean;
};
export declare function officialRecipesMarkdown(): string;
export declare function isCoursewareBodyPage(page: SkillPageInput, index: number, last: number): boolean;
//# sourceMappingURL=playbook-recipes.d.ts.map