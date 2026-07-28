"use client";
// The counter for a worker the owner trusted with it. Same console the owner sees — the
// gateway is what decides whether this person may sell, so there is nothing to fork here.
import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui-kit/button";
import { SalesConsole } from "@/components/sales-console";
import { useLang } from "@/components/providers";

export default function MechanicSalesPage() {
  const router = useRouter();
  const { t } = useLang();
  return (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" size="sm" className="self-start" onClick={() => router.push("/m")}>
        <ArrowLeft />{t("my_jobs")}
      </Button>
      <SalesConsole />
    </div>
  );
}
