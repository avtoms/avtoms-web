"use client";
// Where someone lands when their code was right but their account is not active — either
// it has never been approved, or an admin has switched it off.
//
// It is a page rather than a toast on the login screen because it is a dead end, not a
// retry: nothing the person types will change the outcome, and leaving them on a form with
// six empty boxes invites them to keep trying a code that was never the problem.
import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLang } from "@/components/providers";
import { formatNational } from "@/lib/phone";

function PendingBody() {
  const { t } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  // Carried over from the login screen so the person can read their number straight off the
  // page when they contact the shop — it is the one thing an admin needs to find them.
  const phone = params.get("phone") ?? "";

  return (
    <div className="pend-root">
      <style>{CSS}</style>
      <div className="pend-card">
        <div className="pend-icon" aria-hidden>⏳</div>
        <h1 className="pend-title">{t("account_pending_title")}</h1>
        <p className="pend-sub">{t("account_pending_sub")}</p>

        {phone && (
          <div className="pend-phone">
            <div className="pend-phone-label">{t("phone")}</div>
            <div className="pend-phone-value">+998 {formatNational(phone)}</div>
          </div>
        )}

        <button className="pend-btn" onClick={() => router.replace("/login")}>
          {t("back_to_login")}
        </button>
      </div>
    </div>
  );
}

export default function PendingPage() {
  // useSearchParams needs a Suspense boundary for a statically rendered route.
  return (
    <Suspense fallback={null}>
      <PendingBody />
    </Suspense>
  );
}

const CSS = `
  .pend-root { min-height: 100dvh; display: flex; align-items: center; justify-content: center;
               padding: 24px; background: var(--bg); box-sizing: border-box; }
  .pend-card { width: 100%; max-width: 420px; background: var(--surface); border: 1px solid var(--line);
               border-radius: var(--radius); padding: 32px 26px; text-align: center; box-shadow: var(--shadow); }
  .pend-icon { font-size: 44px; line-height: 1; margin-bottom: 14px; }
  .pend-title { margin: 0 0 10px; font-size: calc(23px * var(--scale)); font-weight: 800;
                letter-spacing: -0.02em; color: var(--ink); }
  .pend-sub { margin: 0; font-size: calc(15px * var(--scale)); line-height: 1.6; color: var(--ink-2); }
  .pend-phone { margin: 22px 0 0; padding: 12px 14px; border-radius: var(--radius-sm);
                background: var(--surface-2); }
  .pend-phone-label { font-size: 11px; text-transform: uppercase; letter-spacing: .06em;
                      font-weight: 700; color: var(--ink-3); }
  .pend-phone-value { margin-top: 3px; font-family: var(--font-mono); font-size: 17px;
                      font-weight: 700; color: var(--ink); }
  .pend-btn { margin-top: 22px; width: 100%; padding: 13px 22px; border: 1px solid var(--line-2);
              border-radius: var(--radius-sm); background: var(--surface); color: var(--ink);
              font: inherit; font-size: calc(14.5px * var(--scale)); font-weight: 600; cursor: pointer; }
`;
