import type { AppRole } from "@/lib/auth";
import {
  LayoutDashboard, UserPlus, Users, CalendarDays, ClipboardList,
  ReceiptText, IdCard, Package, BarChart3, Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  /** Path WITHOUT the /en or /ar prefix. */
  href: string;
  /** Key inside messages.nav */
  key: string;
  icon: LucideIcon;
  roles: AppRole[];
  /** Which build phase delivers this screen; undefined means it is live now. */
  phase?: number;
};

export type NavSection = {
  key: "grow" | "operate" | "money" | "manage";
  items: NavItem[];
};

const OFFICE: AppRole[] = ["OWNER", "OPS_MANAGER"];
const OWNER_ONLY: AppRole[] = ["OWNER"];

export const NAV_SECTIONS: NavSection[] = [
  {
    key: "operate",
    items: [
      { href: "/dashboard", key: "dashboard", icon: LayoutDashboard, roles: OFFICE },
      { href: "/schedule", key: "schedule", icon: CalendarDays, roles: OFFICE, phase: 3 },
      { href: "/jobs", key: "jobs", icon: ClipboardList, roles: OFFICE, phase: 3 },
    ],
  },
  {
    key: "grow",
    items: [
      { href: "/leads", key: "leads", icon: UserPlus, roles: OFFICE },
      { href: "/clients", key: "clients", icon: Users, roles: OFFICE },
    ],
  },
  {
    key: "money",
    items: [
      { href: "/invoices", key: "invoices", icon: ReceiptText, roles: OWNER_ONLY, phase: 5 },
      { href: "/reports", key: "reports", icon: BarChart3, roles: OWNER_ONLY, phase: 8 },
    ],
  },
  {
    key: "manage",
    items: [
      { href: "/staff", key: "staff", icon: IdCard, roles: OFFICE, phase: 7 },
      { href: "/inventory", key: "inventory", icon: Package, roles: OFFICE, phase: 7 },
      { href: "/settings", key: "settings", icon: Settings, roles: OWNER_ONLY, phase: 8 },
    ],
  },
];

/** Only the sections and links this role is allowed to see. */
export function navFor(role: AppRole): NavSection[] {
  return NAV_SECTIONS
    .map((section) => ({ ...section, items: section.items.filter((i) => i.roles.includes(role)) }))
    .filter((section) => section.items.length > 0);
}
