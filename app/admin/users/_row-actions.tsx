"use client";
// Per-row mutations for a staff member: active toggle + role select. Calls the client api,
// then router.refresh() to re-run the SSR fetch on the users page.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { Spinner } from "@/components/ui-kit/misc";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui-kit/select";
import { api, ApiError } from "@/lib/api";
import { roleFromProto, type Role } from "@/lib/enums";
import type { Staff } from "@/lib/types";

const ROLE_OPTS: { value: Role; label: string }[] = [
  { value: "owner", label: "Egasi" },
  { value: "mechanic", label: "Usta" },
  { value: "admin", label: "Admin" },
];

export function RowActions({ staff }: { staff: Staff }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "active" | "role">("");
  const role = roleFromProto(staff.role);

  const toggleActive = async () => {
    if (busy) return;
    setBusy("active");
    try {
      await api.setStaffActive(staff.id, !staff.active);
      toast.success(staff.active ? "Faolsizlantirildi" : "Faollashtirildi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy("");
    }
  };

  const changeRole = async (next: Role) => {
    if (busy || next === role) return;
    setBusy("role");
    try {
      await api.setStaffRole(staff.id, next);
      toast.success("Rol o'zgartirildi");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Xatolik");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={role} disabled={busy === "role"} onValueChange={(v) => changeRole(v as Role)}>
        <SelectTrigger size="sm" className="w-[118px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {ROLE_OPTS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant={staff.active ? "destructive" : "soft"}
        disabled={busy === "active"}
        onClick={toggleActive}
        className="w-[132px]"
      >
        {busy === "active" ? <Spinner /> : staff.active ? <><X /> Faolsizlantirish</> : <><Check /> Faollashtirish</>}
      </Button>
    </div>
  );
}
