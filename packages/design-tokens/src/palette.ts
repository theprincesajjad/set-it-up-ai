/**
 * Raw palette. Apps should NOT use these directly in components; use the
 * semantic roles in `colors.ts` (they switch for dark mode and are contrast
 * tested). Raw scales exist for illustration, marketing and charts.
 *
 * Names come from the street:
 *  - pine     : Ontario white pine / shop-door green. Brand primary. Trust, local, calm.
 *  - marigold : sun on a striped awning. Accent for stamps, points, "you earned" moments.
 *  - brick    : Toronto storefront brick. Secondary warm colour for illustration and marketing.
 *  - stone    : warm paper/neutral greys (never blue-grey, never pure black).
 *  - leaf, ochre, cherry, lake : semantic success / warning / danger / info.
 */

export const palette = {
  pine: {
    50: "#EEF6F2",
    100: "#D6EBE1",
    200: "#AED6C4",
    300: "#7DBBA0",
    400: "#4E9C7D",
    500: "#2F8063",
    600: "#1F6A50", // brand
    700: "#195841",
    800: "#144634",
    900: "#0F3527",
    950: "#09221A",
  },
  marigold: {
    50: "#FFF8E8",
    100: "#FEEDC6",
    200: "#FDDA8E",
    300: "#FBC255",
    400: "#F5A524", // accent
    500: "#E08B0B",
    600: "#B86E06",
    700: "#8F5408",
    800: "#6E410C",
    900: "#4F2F0C",
  },
  brick: {
    50: "#FDF2EE",
    100: "#FADFD5",
    200: "#F4BBA8",
    300: "#EB9479",
    400: "#DD6E4E",
    500: "#C65334",
    600: "#A64128",
    700: "#843421",
    800: "#63281A",
    900: "#431C13",
  },
  stone: {
    0: "#FFFFFF",
    25: "#FDFBF7",
    50: "#FAF6EF", // "paper" canvas
    100: "#F3EDE3",
    200: "#E7DFD2",
    300: "#D4C9B8",
    400: "#A99D8B",
    500: "#857867",
    600: "#655A4C",
    700: "#4A4238",
    800: "#332D26",
    850: "#29241E",
    900: "#1F1B16", // ink
    950: "#16130F",
    1000: "#0F0D0A",
  },
  leaf: {
    50: "#ECF8EF",
    100: "#D2EFDA",
    300: "#7FCB95",
    400: "#4FB06E",
    600: "#1D7A3D",
    700: "#17633A",
    800: "#124D2D",
    900: "#0D3820",
  },
  ochre: {
    50: "#FFF6E0",
    100: "#FDE8B5",
    300: "#F6C35A",
    400: "#EBAA2E",
    600: "#A35A06",
    700: "#7F4507",
    800: "#5E3409",
    900: "#3F2408",
  },
  cherry: {
    50: "#FEF2F1",
    100: "#FDE0DD",
    300: "#F59A90",
    400: "#EE6B5E",
    600: "#B42318",
    700: "#932018",
    800: "#701A14",
    900: "#4E130F",
  },
  lake: {
    50: "#EEF4FB",
    100: "#D8E6F6",
    300: "#8DB7E6",
    400: "#5F98D9",
    600: "#1D5FA8",
    700: "#184E8A",
    800: "#133D6C",
    900: "#0E2C4E",
  },
} as const;

export type Palette = typeof palette;
