import { redirect } from "next/navigation";

// The standalone admin dashboard was removed from the nav; landing on the
// /settings/global root sends the admin to the first item of the section so
// they always end up on a real page (and bookmarks to /admin keep working via
// the next.config redirect chain).
export default function GlobalSettingsRoot() {
  redirect("/settings/global/contexts");
}
