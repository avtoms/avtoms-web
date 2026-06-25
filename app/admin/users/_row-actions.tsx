"use client";
// Per-row mutations for a staff member: active toggle + role select. Calls the client api,
// then router.refresh() to re-run the SSR fetch on the users page.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Btn, SelectInput, Spinner } from "@/components/ui";
import { useToast } from "@/components/providers";
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
  const { toast } = useToast();
  const [busy, setBusy] = useState<"" | "active" | "role">("");
  const role = roleFromProto(staff.role);

  const toggleActive = async () => {
    if (busy) return;
    setBusy("active");
    try {
      await api.setStaffActive(staff.id, !staff.active);
      toast(staff.active ? "Faolsizlantirildi" : "Faollashtirildi", { icon: "check" });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setBusy("");
    }
  };

  const changeRole = async (next: Role) => {
    if (busy || next === role) return;
    setBusy("role");
    try {
      await api.setStaffRole(staff.id, next);
      toast("Rol o'zgartirildi", { icon: "check" });
      router.refresh();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Xatolik", { icon: "alert", tone: "danger" });
    } finally {
      setBusy("");
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flexShrink: 0 }}>
      <div style={{ flex: "0 1 132px", minWidth: 110 }}>
        <SelectInput
          value={role}
          disabled={busy === "role"}
          onChange={(e) => changeRole(e.target.value as Role)}
          style={{ padding: "7px 10px", fontSize: 13 }}
        >
          {ROLE_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </SelectInput>
      </div>
      <Btn
        size="sm"
        variant={staff.active ? "danger" : "soft"}
        icon={busy === "active" ? undefined : staff.active ? "x" : "check"}
        disabled={busy === "active"}
        onClick={toggleActive}
        style={{ minWidth: 116, flex: "0 0 auto" }}
      >
        {busy === "active" ? <Spinner size={15} /> : staff.active ? "Faolsizlantirish" : "Faollashtirish"}
      </Btn>
    </div>
  );
}
