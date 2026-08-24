import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Language-aware versions of Next's Link and router: they keep the /en or /ar
// prefix for you so no screen can accidentally drop the user's language.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
