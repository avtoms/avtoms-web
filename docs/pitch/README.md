# AvtoNazorat — pitch deck (UZ / RU / EN)

Investor deck, also shaped for the **President Tech Award** (Uzbekistan national startup
contest). Sixteen slides, three fully parallel language versions.

| File | Language | Audience |
|---|---|---|
| `AvtoNazorat-Pitch-UZ.pptx` | Oʻzbekcha (Latin) | National jury, local partners |
| `AvtoNazorat-Pitch-RU.pptx` | Русский | Regional investors, CIS |
| `AvtoNazorat-Pitch-EN.pptx` | English | International investors |

The three languages match the ones the product's own landing page already ships
(`app/page.tsx`). The in-app interface additionally supports Uzbek Cyrillic.

## Slide order

1. Title · 2. Problem · 3. Solution · 4. Job lifecycle · 5. Four client apps ·
6. AI assistant + MCP · 7. Uzbekistan localisation · 8. Architecture · 9. Engineering proof ·
10. Security & tenancy · 11. Market · 12. Business model · 13. Traction · 14. Roadmap ·
15. Team · 16. Ask

Every slide carries speaker notes.

## You must fill these in before presenting

The deck deliberately contains **no invented business numbers**. Four places are blank
templates, marked with an amber outline:

- **Slide 11** — TAM / SAM / SOM
- **Slide 12** — price per tier, ARPU, gross margin, CAC and payback
- **Slide 13** — traction (shops live, vehicles, work orders, MRR, growth, pipeline)
- **Slide 15** — team members
- **Slide 16** — the ask and contact details

Slide 13 is the one a jury will test hardest. The platform's own lead / demo-request CRM
(`notification` service) is where those figures come from.

## Where the claims come from

Product and engineering claims are drawn from `main`/`master` across the ten repositories:

| Claim | Source |
|---|---|
| 7 Go microservices, 169 REST endpoints | `avtoms-gateway` route table; service repos |
| 259 automated tests, 84 migrations | `*_test.go` counts; `internal/db/migrations` |
| 8-state work-order lifecycle | `avtoms-proto` `WorkOrderState` |
| 9 report kinds | `avtoms-proto` `ReportKind` |
| 15 read-only AI tools, MCP server | `avtoms-gateway/internal/ai/{tools,mcp}.go` |
| Fiscal chek, OFD, STIR | `avtoms-invoice/internal/ofd`, `avtoms-web/components/fiscal-check.tsx` |
| PlayMobile SMS, Telegram Gateway OTP | `avtoms-notification/internal/channel/*` |
| 3 languages, 9 CIS plate formats | `avtoms-web/lib/i18n.ts`, `app/page.tsx` |
| Single-VPS sizing, Watchtower auto-update | `avtoms-deploy/README.md` |

Market figures on slide 11 are attributed on the slide itself: vehicle-fleet data from the
Statistics Agency under the President of the Republic of Uzbekistan (stat.uz, Oct 2025);
shop and parts-store counts from commercial business directories (2026).

**One caveat worth knowing before you present:** OFD fiscalisation is currently a stub
(`avtoms-invoice/internal/ofd/ofd.go` returns deterministic values). The deck does not claim
it is live — slide 14 lists wiring it up as the first roadmap item. Keep it that way.

## Rebuilding

```bash
npm install pptxgenjs
node build.js                                    # writes the three .pptx files
python3 postprocess.py AvtoNazorat-Pitch-*.pptx  # required — see below
```

`postprocess.py` is not optional. pptxgenjs writes `line: {type:"none"}` as an empty
`<a:ln></a:ln>` and `fill: {type:"none"}` as no fill element at all; in OOXML both mean
*inherit from the theme*, so PowerPoint and macOS Quick Look draw a theme outline and a
solid theme fill where the deck intends neither. LibreOffice guesses differently, which is
why the fault only appears in some viewers. The script rewrites those to explicit
`<a:noFill/>` and fails loudly if any shape is still left inheriting.

PDF exports of all three languages sit alongside the `.pptx` files. Use them when you just
need the deck to look right — a phone, a preview pane, an emailed submission.

`content.js` holds all copy for the three languages; `build.js` holds the layout and the
"garage signal" design system (navy dominant, product blue, signal amber). Edit copy in
`content.js` and re-run — the three decks stay structurally identical by construction.
