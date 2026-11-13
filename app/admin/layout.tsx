import type { ReactNode } from "react";

import { AdminNav } from "@/components/admin/admin-nav";

/** Keeps the admin area's original blue accent (the public site's accent is now BRYT VISION red). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="admin-scope">
      <AdminNav />
      {children}
    </div>
  );
}
