/**
 * Dashboard primitives, one import path for every team: `import { PageHeader, StatTile } from "@/components/dashboard"`.
 * Re-exports (and names) what already exists in kit.tsx and components/ui; see README.md.
 */
export {
  PageHeader, Section, Panel, QuietLink, QuietButton,
  StatBlock, StatGrid, StatTile, type StatItem,
  RowList, Row, DefList,
  Dot, StatusDot, StatusPill, Tag, Meter, type DotTone,
  Capsules, Segmented as SegmentedControl, Tabs, PageTabs, TabPanel,
  TableWrap, Table, Th, Td, Tr,
  SidePanel as Sheet, SidePanel as Drawer,
  EmptyState, Empty, SkeletonRows, ErrorLine, ToolbarButton, BackLink, Kbd, SaveBar,
} from "./kit";
export { PageSkeleton, LoadError, NoAccess, Async } from "./PageStates";
export { FeatureGate } from "./FeatureGate";
export { ConfirmDialog } from "./ConfirmDialog";
export { useMerchant } from "./MerchantContext";
export { DataTable, type Column, type DataTableProps } from "@/components/ui/DataTable";
export { FieldShell as FormField, TextField, inputBase } from "@/components/ui/TextField";
export { Select } from "@/components/ui/Select";
export { Switch } from "@/components/ui/Switch";
