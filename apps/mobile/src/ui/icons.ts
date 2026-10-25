/**
 * lucide icons used by the app, imported one file each so Metro only bundles
 * what we use (the barrel import pulls in ~1,500 icons).
 * Stroke 2 everywhere (brand.md § 6).
 */
import type { LucideIcon, LucideProps } from "lucide-react-native";
import { createElement } from "react";
import { useLocale } from "../lib/i18n";

import Coffee from "lucide-react-native/icons/coffee";
import UtensilsCrossed from "lucide-react-native/icons/utensils-crossed";
import Croissant from "lucide-react-native/icons/croissant";
import Beer from "lucide-react-native/icons/beer";
import ShoppingBasket from "lucide-react-native/icons/shopping-basket";
import Pill from "lucide-react-native/icons/pill";
import ShoppingBag from "lucide-react-native/icons/shopping-bag";
import BookOpen from "lucide-react-native/icons/book-open";
import Flower2 from "lucide-react-native/icons/flower-2";
import PawPrint from "lucide-react-native/icons/paw-print";
import Sparkles from "lucide-react-native/icons/sparkles";
import Scissors from "lucide-react-native/icons/scissors";
import Leaf from "lucide-react-native/icons/leaf";
import Dumbbell from "lucide-react-native/icons/dumbbell";
import MonitorSmartphone from "lucide-react-native/icons/monitor-smartphone";
import Car from "lucide-react-native/icons/car";
import Ruler from "lucide-react-native/icons/ruler";
import Shirt from "lucide-react-native/icons/shirt";
import Printer from "lucide-react-native/icons/printer";
import Store from "lucide-react-native/icons/store";
import Gift from "lucide-react-native/icons/gift";
import BadgePercent from "lucide-react-native/icons/badge-percent";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleAlert from "lucide-react-native/icons/circle-alert";
import CloudOff from "lucide-react-native/icons/cloud-off";
import WifiOff from "lucide-react-native/icons/wifi-off";
import Wifi from "lucide-react-native/icons/wifi";
import Clock3 from "lucide-react-native/icons/clock-3";
import Flashlight from "lucide-react-native/icons/flashlight";
import Info from "lucide-react-native/icons/info";
import Sprout from "lucide-react-native/icons/sprout";
import MapPin from "lucide-react-native/icons/map-pin";
import Bell from "lucide-react-native/icons/bell";
import BellOff from "lucide-react-native/icons/bell-off";
import QrCodeIcon from "lucide-react-native/icons/qr-code";
import House from "lucide-react-native/icons/house";
import Map from "lucide-react-native/icons/map";
import User from "lucide-react-native/icons/user";
import Delete from "lucide-react-native/icons/delete";
import X from "lucide-react-native/icons/x";
import Check from "lucide-react-native/icons/check";
import ChevronRightLtr from "lucide-react-native/icons/chevron-right";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeftLtr from "lucide-react-native/icons/chevron-left";
import Phone from "lucide-react-native/icons/phone";
import Navigation from "lucide-react-native/icons/navigation";
import Globe from "lucide-react-native/icons/globe";
import Share2 from "lucide-react-native/icons/share-2";
import Wallet from "lucide-react-native/icons/wallet";
import Ticket from "lucide-react-native/icons/ticket";
import Wrench from "lucide-react-native/icons/wrench";
import FileText from "lucide-react-native/icons/file-text";
import PackageCheck from "lucide-react-native/icons/package-check";
import Hourglass from "lucide-react-native/icons/hourglass";
import Search from "lucide-react-native/icons/search";
import LocateFixed from "lucide-react-native/icons/locate-fixed";
import Camera from "lucide-react-native/icons/camera";
import Users from "lucide-react-native/icons/users";
import Settings from "lucide-react-native/icons/settings";
import Lock from "lucide-react-native/icons/lock";
import Moon from "lucide-react-native/icons/moon";
import Sun from "lucide-react-native/icons/sun";
import Plus from "lucide-react-native/icons/plus";
import Minus from "lucide-react-native/icons/minus";
import Award from "lucide-react-native/icons/award";
import History from "lucide-react-native/icons/rotate-ccw-clock";
import LogOut from "lucide-react-native/icons/log-out";
import Download from "lucide-react-native/icons/download";
import Trash2 from "lucide-react-native/icons/trash";
import Ellipsis from "lucide-react-native/icons/ellipsis";
import RotateCcw from "lucide-react-native/icons/rotate-ccw";
import Keyboard from "lucide-react-native/icons/keyboard";
import Tablet from "lucide-react-native/icons/tablet";
import ShoppingCart from "lucide-react-native/icons/shopping-cart";
import Clock from "lucide-react-native/icons/clock";
import Receipt from "lucide-react-native/icons/receipt";
import Star from "lucide-react-native/icons/star";
import List from "lucide-react-native/icons/list";
import UserPlus from "lucide-react-native/icons/user-plus";
import CreditCard from "lucide-react-native/icons/credit-card";
import Heart from "lucide-react-native/icons/heart";
import Shield from "lucide-react-native/icons/shield";
import CircleHelp from "lucide-react-native/icons/circle-question-mark";
import Mail from "lucide-react-native/icons/mail";
import Pencil from "lucide-react-native/icons/pencil";
import Trophy from "lucide-react-native/icons/trophy";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import Flag from "lucide-react-native/icons/flag";
import Timer from "lucide-react-native/icons/timer";

export type { LucideIcon };
export {
  Coffee,
  UtensilsCrossed,
  Croissant,
  Beer,
  ShoppingBasket,
  Pill,
  ShoppingBag,
  BookOpen,
  Flower2,
  PawPrint,
  Sparkles,
  Scissors,
  Leaf,
  Dumbbell,
  MonitorSmartphone,
  Car,
  Ruler,
  Shirt,
  Printer,
  Store,
  Gift,
  BadgePercent,
  CircleCheck,
  CircleAlert,
  CloudOff,
  WifiOff,
  Wifi,
  Clock3,
  Flashlight,
  Info,
  Sprout,
  MapPin,
  Bell,
  BellOff,
  QrCodeIcon,
  House,
  Map,
  User,
  Delete,
  X,
  Check,
  ChevronRightLtr,
  ChevronDown,
  ChevronLeftLtr,
  Phone,
  Navigation,
  Globe,
  Share2,
  Wallet,
  Ticket,
  Wrench,
  FileText,
  PackageCheck,
  Hourglass,
  Search,
  LocateFixed,
  Camera,
  Users,
  Settings,
  Lock,
  Moon,
  Sun,
  Plus,
  Minus,
  Award,
  History,
  LogOut,
  Download,
  Trash2,
  Ellipsis,
  RotateCcw,
  Keyboard,
  Tablet,
  ShoppingCart,
  Clock,
  Receipt,
  Star,
  List,
  UserPlus,
  CreditCard,
  Heart,
  Shield,
  CircleHelp,
  Mail,
  Pencil,
  Trophy,
  SlidersHorizontal,
  Flag,
  Timer,
};

/** Vertical → icon (matches verticalVisuals[v].iconComponent in @ll/design-tokens). */
export const verticalIcons: Record<string, LucideIcon> = {
  Coffee,
  UtensilsCrossed,
  Croissant,
  Beer,
  ShoppingBasket,
  Pill,
  ShoppingBag,
  BookOpen,
  Flower2,
  PawPrint,
  Sparkles,
  Scissors,
  Leaf,
  Dumbbell,
  MonitorSmartphone,
  Car,
  Ruler,
  Shirt,
  Printer,
  Store,
};

export function verticalIcon(componentName: string): LucideIcon {
  return verticalIcons[componentName] ?? Store;
}

/**
 * Directional chevrons point the other way in a right-to-left language (back is "forward", next is "back").
 * `ChevronLeftLtr` / `ChevronRightLtr` stay fixed for icons that rotate (accordions) rather than mean a direction.
 */
const FLIP = { transform: [{ scaleX: -1 }] } as const;
function mirrored(Icon: LucideIcon): LucideIcon {
  const C = (props: LucideProps) => {
    const { isRtl } = useLocale();
    return createElement(Icon, isRtl ? { ...props, style: [props.style, FLIP] } : props);
  };
  return C as unknown as LucideIcon;
}
export const ChevronRight = mirrored(ChevronRightLtr);
export const ChevronLeft = mirrored(ChevronLeftLtr);
