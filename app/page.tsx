"use client";

/**
 * Levi's x RDEP — Receipt redesign, Option 1: "Red Tab"
 *
 * Concept: the receipt hangs off a dark indigo header the way the red tab hangs off a
 * back pocket. Everything is held in a stitched "pocket" outline (tan dashed borders).
 * Content is exactly what the current Levi's receipt already has — nothing new.
 *
 * Stack: Next.js (app router) + Tailwind. No extra dependencies (icons are inline SVG).
 * Fonts: Barlow + Barlow Condensed via next/font/google.
 *
 * Usage:  app/levis-receipt/page.tsx
 *   import LevisReceiptV1 from "@/components/LevisReceiptV1";
 *   export default function Page() { return <LevisReceiptV1 />; }
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Barlow, Barlow_Condensed } from "next/font/google";

const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

/* Brand tokens. Solid colours use CSS vars; where an alpha is needed the hex is inlined. */
const theme = {
  "--lv-red": "#C41230", // Levi's red tab
  "--lv-ink": "#0F1A2B", // raw indigo denim
  "--lv-denim": "#2B4568", // washed denim
  "--lv-slate": "#5B6678", // secondary text
  "--lv-wash": "#F2F4F8", // light wash
  "--lv-stitch": "#D4A24C", // contrast stitching
} as CSSProperties;

/* ------------------------------- types ------------------------------------------- */
export interface ReceiptItem {
  name: string;
  qty: number;
  mrp: number;
  net: number;
  code: string;
  hsn: string;
  size: string;
  inseam?: string;
}

export interface LevisReceipt {
  invoiceNo: string;
  receiptId: string;
  date: string;
  cashier: string;
  store: {
    name: string;
    branch: string;
    address: string;
    code: string;
    phone: string;
    timing: string;
    legalName: string;
  };
  customer: { firstName: string; mobile: string };
  items: ReceiptItem[];
  subTotal: number;
  netTotal: number;
  pieces: number;
  payments: { mode: string; amount: number }[];
  points: {
    available: number;
    earned: number;
    redeemed: number;
    expiring: { points: number; on: string };
  };
  rewards: { feedback: number; refer: number; profile: number };
  contact: { tollFree: string; hours: string; email: string };
  terms: { intro: string; list: string[]; note: string };
  history: { invoiceNo: string; date: string; store: string; amount: number; current?: boolean }[];
}

export interface ProfileForm {
  firstName: string;
  lastName: string;
  birthday: string;
  gender: string;
  email: string;
}

export interface LevisReceiptProps {
  data?: LevisReceipt;
  /** Real QR image URL (placeholder is drawn if omitted) */
  qrSrc?: string;
  /** Real barcode image URL (placeholder is drawn if omitted) */
  barcodeSrc?: string;
  /** White Levi's wordmark for the red tab (text wordmark if omitted) */
  logoSrc?: string;
  onDownloadPdf?: () => void;
  onSendEmail?: (email: string) => void;
  onUpdateProfile?: (values: ProfileForm) => void;
  onFeedback?: () => void;
  onRefer?: () => void;
}

type IconName =
  | "history" | "mail" | "download" | "star" | "users" | "coins" | "trend"
  | "gift" | "alert" | "phone" | "close" | "chevron" | "ticket" | "check";
type TabId = "points" | "profile" | "coupon";
type ModalId = "history" | "email" | "tax" | null;

/* ----------------------------------------------------------------------------------
 * Sample data (shape mirrors the current receipt)
 * Items 2–11: item code / HSN / size are SAMPLE values; tax + discount are derived.
 * -------------------------------------------------------------------------------- */
const ITEMS: ReceiptItem[] = [
  { name: "BLR_MT_STANDARD FIT TEE SP VARSITY BRAND", qty: 1, mrp: 2199, net: 1889.97, code: "A797302560M", hsn: "61091000", size: "M" },
  { name: "BLR MB 511 SLIM ALOKI", qty: 1, mrp: 3789, net: 3256.52, code: "A112340071", hsn: "62034200", size: "32", inseam: "32" },
  { name: "BNG MT CL1PKT_TRIM SHRT L/S CLASSIC REGU", qty: 1, mrp: 3299, net: 2835.38, code: "A558120044", hsn: "62052000", size: "L" },
  { name: "BLR MT RL NOAH SLIM LADD IRISH CREAM+GRE", qty: 1, mrp: 4599, net: 3952.69, code: "A640210093", hsn: "62052000", size: "L" },
  { name: "BNG MB 527 NEW 1 ICY-01", qty: 1, mrp: 4199, net: 3608.9, code: "A223450018", hsn: "62034200", size: "32", inseam: "32" },
  { name: "BLRMB_512CLASSIC5PKT FRESHNESS", qty: 1, mrp: 4799, net: 4124.59, code: "A334560027", hsn: "62034200", size: "34", inseam: "32" },
  { name: "BLR MB WINIX 517 BABBLE", qty: 1, mrp: 4199, net: 3608.9, code: "A445670036", hsn: "62034200", size: "32", inseam: "34" },
  { name: "MT BLR SELF FLD PLK POLO SPRING CAMOU A", qty: 1, mrp: 2599, net: 2233.76, code: "A771230052", hsn: "61051000", size: "M" },
  { name: "BLR_MT_STANDARD FIT TEE SP VARSITY BRAND", qty: 1, mrp: 2199, net: 1889.97, code: "A797302560L", hsn: "61091000", size: "L" },
  { name: "BLR_MT_STANDARD FIT TEE THE ORIGINAL OD", qty: 1, mrp: 1699, net: 1460.24, code: "A882340065", hsn: "61091000", size: "M" },
  { name: "MT BLR SET-ON PLKT POLO COOLTEK POLO VIN", qty: 1, mrp: 1999, net: 1718.08, code: "A993450071", hsn: "61051000", size: "M" },
];

export const sampleLevisReceipt: LevisReceipt = {
  invoiceNo: "7019",
  receiptId: "202605244369017019",
  date: "24-05-2026 20:34:17",
  cashier: "475117",
  store: {
    name: "Levi's Exclusive Store",
    branch: "SSIPL - Durgapur-Junction Mall",
    address: "Levi's Store, UGF-12, Junction Mall, City Center, Durgapur, West Bengal",
    code: "0020043690",
    phone: "03432544257",
    timing: "10:00 AM to 10:00 PM",
    legalName: "SSIPL LIFESTYLE PRIVATE LIMITED",
  },
  customer: { firstName: "Rashad", mobile: "7250230751" },
  items: ITEMS,
  subTotal: 26878.8,
  netTotal: 30579,
  pieces: 11,
  payments: [
    { mode: "CASH", amount: 579 },
    { mode: "QCLVR", amount: 10000 },
  ],
  points: { available: 1951, earned: 917, redeemed: 0, expiring: { points: 1034, on: "12 Jan 2027" } },
  rewards: { feedback: 50, refer: 100, profile: 50 },
  contact: { tollFree: "1800 1020 501", hours: "Mon-Fri, 10AM to 6 PM", email: "feedback@levi.com" },
  terms: {
    intro:
      "We hope you love your Levi's® product. In case you are not satisfied, you may present the sale invoice and exchange the product within 14 days from the date of purchase*. Subject to the terms and conditions listed below, products can only be exchanged and under no circumstances can any amount be refunded.",
    list: [
      "Products may be exchanged only if returned in saleable condition. The store reserves the right to decide if the item is in saleable conditions and can be exchanged.",
      "Product can only be exchanged with another Product of the same or higher value, with the price difference being paid by the customer.",
      "All product hang tags including price tags and labels must be intact while requesting for exchange.",
      "Products purchased during the End of Season sale cannot be exchanged.",
      "Accessories and Innerwear cannot be exchanged.",
      "Products purchased from a Levi's exclusive store can be exchanged across any Levi's exclusive store in India.",
      "Products personalized, customized, or altered by the customer cannot be exchanged.",
      "Please follow care/ usage instructions.",
      "This Exchange and Return Policy and these Terms and Conditions are subject to applicable laws, regulations, and Govt. notifications, issued from time to time.",
      "Red Tab+ Members may exchange any product within 90 days from the date of purchase.",
    ],
    note: "Note: Any disputes will be subject to the exclusive jurisdictions of the courts in Bangalore, Karnataka.",
  },
  // SAMPLE rows for the transaction history popup — replace with the real API response
  history: [
    { invoiceNo: "7019", date: "24-05-2026", store: "Durgapur - Junction Mall", amount: 30579, current: true },
    { invoiceNo: "6488", date: "11-02-2026", store: "Durgapur - Junction Mall", amount: 4299 },
    { invoiceNo: "5921", date: "29-12-2025", store: "Kolkata - Quest Mall", amount: 7897 },
  ],
};

/* ------------------------------- helpers ----------------------------------------- */
const inr = (n: number): string => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trim = (n: number): string => String(Number(n.toFixed(2)));

// Apparel GST slab: 5% up to ₹2,500 per piece, 18% above (matches the figures on the current receipt)
const slabFor = (item: ReceiptItem): number => (item.net / item.qty > 2500 ? 18 : 5);

function derive(item: ReceiptItem) {
  const rate = slabFor(item);
  const base = item.net / (1 + rate / 100);
  const half = rate / 2;
  const tax = (base * half) / 100;
  const gross = item.mrp * item.qty;
  const disc = gross - item.net;
  return {
    rate,
    base,
    discountPct: (disc / gross) * 100,
    discountAmt: disc,
    sgstPct: half,
    sgstBase: base,
    sgstAmt: tax,
    cgstPct: half,
    cgstBase: base,
    cgstAmt: tax,
  };
}

function seeded(seed: string): () => number {
  let s = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    s ^= seed.charCodeAt(i);
    s = Math.imul(s, 16777619);
  }
  s = s || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/* -------------------------------- icons ------------------------------------------ */
const PATHS: Record<IconName, ReactNode> = {
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M5 20h14" />
    </>
  ),
  star: <path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2-6.2 3.2L7 14.2 2 9.3l6.9-1z" />,
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  coins: (
    <>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </>
  ),
  trend: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  gift: (
    <>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9h14v-9" />
      <path d="M12 8v13" />
      <path d="M12 8c-1-3-5-4-5-1.5S10 8 12 8Zm0 0c1-3 5-4 5-1.5S14 8 12 8Z" />
    </>
  ),
  alert: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
      <path d="M12 13v3M12 18.5h.01" />
    </>
  ),
  phone: (
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />
  ),
  close: <path d="M18 6 6 18M6 6l12 12" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  ticket: (
    <>
      <path d="M3 9a2 2 0 0 0 0 6v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3a2 2 0 0 1 0-6V6a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1z" />
      <path d="M9 9h6M9 12h6M9 15h3" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
};

function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

/* ------------------------- placeholder QR + barcode ------------------------------ */
function PlaceholderQR({ seed }: { seed: string }) {
  const N = 25;
  const cells = useMemo(() => {
    const rnd = seeded(seed);
    const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
    const out: [number, number][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!inFinder(x, y) && rnd() > 0.5) out.push([x, y]);
    return out;
  }, [seed]);
  const finder = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width="7" height="7" />
      <rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
      <rect x={x + 2} y={y + 2} width="3" height="3" />
    </g>
  );
  return (
    <svg viewBox={`-1 -1 ${N + 2} ${N + 2}`} fill="#0F1A2B" shapeRendering="crispEdges" role="img" aria-label="Receipt QR code" className="h-full w-full">
      <rect x="-1" y="-1" width={N + 2} height={N + 2} fill="#fff" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />
      ))}
      {finder(0, 0)}
      {finder(N - 7, 0)}
      {finder(0, N - 7)}
    </svg>
  );
}

function PlaceholderBarcode({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    const rnd = seeded(seed);
    const out: [number, number][] = [];
    let x = 0;
    while (x < 240) {
      const w = 1 + Math.floor(rnd() * 3);
      out.push([x, w]);
      x += w + 1 + Math.floor(rnd() * 2);
    }
    return out;
  }, [seed]);
  return (
    <svg viewBox="0 0 244 56" fill="#0F1A2B" shapeRendering="crispEdges" role="img" aria-label="Receipt barcode" className="h-14 w-full max-w-xs">
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y="0" width={w} height="56" />
      ))}
    </svg>
  );
}

/* --------------------------------- modal ----------------------------------------- */
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (previous as HTMLElement | null)?.focus?.();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F1A2B]/60 sm:items-center sm:p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 outline-none sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className={`${display.className} text-2xl font-semibold`}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-full bg-[var(--lv-wash)] text-[var(--lv-ink)] hover:bg-[#E3E7EF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------ item row ----------------------------------------- */
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_1.75rem_3.75rem_5rem] items-start gap-x-2";

function DetailGroup({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="rounded-lg bg-[var(--lv-wash)] px-3 py-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4 py-0.5">
          <dt className="text-[var(--lv-slate)]">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ItemRow({ item, open, onToggle }: { item: ReceiptItem; open: boolean; onToggle: () => void }) {
  const d = useMemo(() => derive(item), [item]);
  const panelId = useId();
  return (
    <li className="border-b border-dashed border-[#D4A24C]/70 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`${ROW_GRID} w-full rounded-md py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]`}
      >
        <span className="flex min-w-0 items-start gap-1.5">
          <Icon
            name="chevron"
            className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--lv-red)] transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
          <span className="text-[13px] font-medium leading-snug">{item.name}</span>
        </span>
        <span className="text-center text-sm tabular-nums">{item.qty}</span>
        <span className="text-right text-sm tabular-nums text-[var(--lv-slate)]">{item.mrp.toLocaleString("en-IN")}</span>
        <span className="text-right text-sm font-semibold tabular-nums">{inr(item.net)}</span>
      </button>

      <div
        id={panelId}
        aria-hidden={!open}
        className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pb-3 text-[13px]">
            <DetailGroup
              rows={[
                ["Item code", item.code],
                ["HSN", item.hsn],
                ["UoM", "Pcs"],
                ["Size", item.size],
                ["Inseam", item.inseam ?? "-"],
              ]}
            />
            <DetailGroup rows={[["Discount %", trim(d.discountPct)], ["Discount amount", trim(d.discountAmt)]]} />
            <DetailGroup
              rows={[
                ["SGST %", trim(d.sgstPct)],
                ["SGST base amount", trim(d.sgstBase)],
                ["SGST amount", trim(d.sgstAmt)],
                ["CGST %", trim(d.cgstPct)],
                ["CGST base amount", trim(d.cgstBase)],
                ["CGST amount", trim(d.cgstAmt)],
              ]}
            />
          </div>
        </div>
      </div>
    </li>
  );
}

/* --------------------------- RedTab tabs section --------------------------------- */
const TABS: { id: TabId; label: string }[] = [
  { id: "points", label: "My RedTab Points" },
  { id: "profile", label: "Update Profile" },
  { id: "coupon", label: "Available Coupon" },
];

function Stat({ icon, value, label, tone }: { icon: IconName; value: number; label: string; tone: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className={`grid h-12 w-12 place-items-center rounded-full ${tone}`}>
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <span className={`${display.className} mt-2 text-3xl font-semibold leading-none tabular-nums`}>{value.toLocaleString("en-IN")}</span>
      <span className="mt-1 text-xs text-[var(--lv-slate)]">{label}</span>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#C9D0DC] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[var(--lv-red)] focus:ring-2 focus:ring-[#C41230]/20";

function RedTabSection({
  data,
  onUpdateProfile,
}: {
  data: LevisReceipt;
  onUpdateProfile?: (values: ProfileForm) => void;
}) {
  const [tab, setTab] = useState<TabId>("points");
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<ProfileForm>({ firstName: data.customer.firstName, lastName: "", birthday: "", gender: "", email: "" });
  const set = (k: keyof ProfileForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setSaved(false);
    setForm((f) => ({ ...f, [k]: e.target.value }));
  };
  const { points, rewards } = data;

  return (
    <section className="mx-4 mt-6">
      <div role="tablist" aria-label="RedTab" className="flex items-end justify-between border-b-2 border-[var(--lv-red)]">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              type="button"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`rounded-t-lg px-3 py-2 text-[13px] font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)] ${
                active ? "bg-[var(--lv-red)] text-white" : "text-[var(--lv-slate)] hover:text-[var(--lv-ink)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-b-2xl bg-[var(--lv-wash)] p-4">
        {tab === "points" && (
          <div role="tabpanel" id="panel-points" aria-labelledby="tab-points">
            <div className="grid grid-cols-3 gap-2 rounded-2xl bg-white px-2 py-5">
              <Stat icon="coins" value={points.available} label="Available points" tone="bg-[#C41230]/10 text-[var(--lv-red)]" />
              <Stat icon="trend" value={points.earned} label="Earned points" tone="bg-[#2B4568]/10 text-[var(--lv-denim)]" />
              <Stat icon="gift" value={points.redeemed} label="Redeemed points" tone="bg-[#5B6678]/10 text-[var(--lv-slate)]" />
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[#D4A24C] bg-white px-4 py-3">
              <Icon name="alert" className="h-7 w-7 shrink-0 text-[var(--lv-red)]" />
              <p className="text-sm text-[var(--lv-slate)]">
                <span className="block font-semibold text-[var(--lv-red)]">{points.expiring.points.toLocaleString("en-IN")} points</span>
                Expiring on <span className="font-semibold text-[var(--lv-ink)]">{points.expiring.on}</span>
              </p>
            </div>
          </div>
        )}

        {tab === "profile" && (
          <form
            role="tabpanel"
            id="panel-profile"
            aria-labelledby="tab-profile"
            className="space-y-3 rounded-2xl bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateProfile?.(form);
              setSaved(true);
            }}
          >
            <p className="text-sm font-semibold leading-snug text-[var(--lv-red)]">
              Update your profile now to earn {rewards.profile} RedTab points, get personalised offers and more!
            </p>
            <div>
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Mobile</span>
              <p className="text-sm font-medium tabular-nums">{data.customer.mobile}</p>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">First name</span>
              <input className={inputCls} value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Last name</span>
              <input className={inputCls} value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Birthday</span>
              <input type="date" className={inputCls} value={form.birthday} onChange={set("birthday")} autoComplete="bday" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Gender</span>
              <select className={inputCls} value={form.gender} onChange={set("gender")}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Email</span>
              <input type="email" className={inputCls} value={form.email} onChange={set("email")} autoComplete="email" />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-[var(--lv-red)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A50F28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]"
            >
              Update
            </button>
            <p aria-live="polite" className="min-h-5 text-center text-xs text-[var(--lv-denim)]">
              {saved ? "Profile updated." : ""}
            </p>
          </form>
        )}

        {tab === "coupon" && (
          <div
            role="tabpanel"
            id="panel-coupon"
            aria-labelledby="tab-coupon"
            className="flex flex-col items-center rounded-2xl border-2 border-dashed border-[#D4A24C] bg-white px-6 py-12 text-center"
          >
            <Icon name="ticket" className="h-9 w-9 text-[var(--lv-red)]" />
            <p className={`${display.className} mt-3 text-2xl font-semibold`}>No coupons available.</p>
            <p className="mt-1 text-sm text-[var(--lv-slate)]">Please check this section later.</p>
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- main ------------------------------------------ */
export default function LevisReceiptV1({
  data = sampleLevisReceipt,
  qrSrc,
  barcodeSrc,
  logoSrc,
  onDownloadPdf = () => window.print(),
  onSendEmail,
  onUpdateProfile,
  onFeedback,
  onRefer,
}: LevisReceiptProps) {
  const [openItem, setOpenItem] = useState(0);
  const [modal, setModal] = useState<ModalId>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const closeModal = useCallback(() => setModal(null), []);

  const { store, rewards, contact, terms } = data;

  const taxRows = useMemo(() => {
    const by = new Map<number, { rate: number; base: number; sgst: number; cgst: number }>();
    data.items.forEach((item) => {
      const d = derive(item);
      const row = by.get(d.rate) ?? { rate: d.rate, base: 0, sgst: 0, cgst: 0 };
      row.base += d.base;
      row.sgst += d.sgstAmt;
      row.cgst += d.cgstAmt;
      by.set(d.rate, row);
    });
    return [...by.values()].sort((a, b) => a.rate - b.rate);
  }, [data.items]);

  const headerBtn =
    "grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

  return (
    <div style={theme} className={`${body.className} min-h-screen bg-[var(--lv-wash)] text-[var(--lv-ink)] sm:py-8`}>
      <main className="mx-auto w-full max-w-md overflow-hidden bg-white pb-8 sm:rounded-3xl sm:shadow-[0_24px_60px_-24px_rgba(15,26,43,0.4)]">
        {/* ---------- Header: QR, invoice meta, quick actions ---------- */}
        <header className="relative bg-[var(--lv-ink)] px-5 pb-8 pt-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-white p-1.5">
              {qrSrc ? <img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain" /> : <PlaceholderQR seed={data.receiptId} />}
            </div>

            <div className="min-w-0 text-right">
              <p className={`${display.className} text-2xl font-semibold leading-none`}>Tax invoice</p>
              <dl className="mt-2 space-y-0.5 text-xs text-white/70">
                <div className="flex justify-end gap-1.5">
                  <dt>Invoice no:</dt>
                  <dd className="text-white">{data.invoiceNo}</dd>
                </div>
                <div className="flex justify-end gap-1.5">
                  <dt className="shrink-0">Receipt ID:</dt>
                  <dd className="break-all text-white">{data.receiptId}</dd>
                </div>
                <div className="flex justify-end gap-1.5">
                  <dt>Date:</dt>
                  <dd className="text-white">{data.date}</dd>
                </div>
                <div className="flex justify-end gap-1.5">
                  <dt>Cashier:</dt>
                  <dd className="text-white">{data.cashier}</dd>
                </div>
              </dl>
              <div className="mt-3 flex justify-end gap-2">
                <button type="button" className={headerBtn} aria-label="Transaction history" title="Transaction history" onClick={() => setModal("history")}>
                  <Icon name="history" className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className={headerBtn} aria-label="Email receipt" title="Email receipt" onClick={() => setModal("email")}>
                  <Icon name="mail" className="h-[18px] w-[18px]" />
                </button>
                <button type="button" className={headerBtn} aria-label="Download PDF" title="Download PDF" onClick={onDownloadPdf}>
                  <Icon name="download" className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          </div>

          {/* The red tab, hanging from the seam */}
          <div className="absolute left-1/2 top-full z-10 -translate-x-1/2">
            <div className="relative flex h-16 w-28 items-center justify-center rounded-b-md bg-[var(--lv-red)] text-white">
              <span aria-hidden="true" className="pointer-events-none absolute inset-1.5 rounded-b border border-dashed border-white/40" />
              {logoSrc ? (
                <img src={logoSrc} alt="Levi's" className="relative h-6 w-auto" />
              ) : (
                <span className={`${display.className} relative text-[28px] font-bold leading-none tracking-tight`}>
                  Levi&apos;s<sup className="ml-0.5 align-top text-[9px] font-medium">®</sup>
                </span>
              )}
            </div>
          </div>
        </header>

        {/* ---------- Store details + greeting ---------- */}
        <section className="px-5 pb-6 pt-12 text-center">
          <h2 className={`${display.className} text-2xl font-semibold`}>{store.name}</h2>
          <p className="mt-1 text-sm font-medium">{store.branch}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm leading-snug text-[var(--lv-slate)]">{store.address}</p>

          <dl className="mt-4 grid grid-cols-3 gap-2 border-y border-dashed border-[#D4A24C] py-3 text-center">
            {[
              ["Store code", store.code],
              ["Phone no.", store.phone],
              ["Store timing", store.timing],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs text-[var(--lv-slate)]">{k}</dt>
                <dd className="mt-0.5 text-[13px] font-medium leading-tight tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-[var(--lv-slate)]">
            Legal name: <span className="text-[var(--lv-ink)]">{store.legalName}</span>
          </p>

          <h1 className={`${display.className} mt-6 text-4xl font-semibold`}>Hello {data.customer.firstName}!</h1>
        </section>

        {/* ---------- Items: the stitched pocket ---------- */}
        <section aria-label="Items purchased" className="mx-4 rounded-2xl border-2 border-dashed border-[var(--lv-stitch)] px-3 pb-4 pt-3">
          <div className={`${ROW_GRID} border-b border-[var(--lv-ink)] pb-2 text-xs font-semibold text-[var(--lv-slate)]`}>
            <span>Item name</span>
            <span className="text-center">Qty</span>
            <span className="text-right">MRP</span>
            <span className="text-right">Net amount</span>
          </div>

          <ul>
            {data.items.map((item, i) => (
              <ItemRow key={`${item.code}-${i}`} item={item} open={openItem === i} onToggle={() => setOpenItem(openItem === i ? -1 : i)} />
            ))}
          </ul>

          <dl className="mt-3 space-y-1 border-t border-[var(--lv-ink)] pt-3">
            <div className="flex items-baseline justify-between text-sm">
              <dt className="text-[var(--lv-slate)]">Sub total</dt>
              <dd className="tabular-nums">{inr(data.subTotal)}</dd>
            </div>
            <div className="flex items-baseline justify-between">
              <dt className={`${display.className} text-xl font-semibold`}>Net total</dt>
              <dd className={`${display.className} text-3xl font-bold tabular-nums text-[var(--lv-red)]`}>₹{inr(data.netTotal)}</dd>
            </div>
            <p className="text-right text-xs text-[var(--lv-slate)]">Pieces purchased: {data.pieces}</p>
          </dl>

          <button
            type="button"
            onClick={() => setModal("tax")}
            className="mt-3 w-full rounded-lg border border-[var(--lv-red)] py-2.5 text-sm font-semibold text-[var(--lv-red)] transition-colors hover:bg-[#C41230]/10 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]"
          >
            View tax calculation
          </button>
        </section>

        {/* ---------- Payment ---------- */}
        <section aria-label="Payment" className="mx-4 mt-4 rounded-2xl bg-[var(--lv-wash)] px-4 py-3">
          <h2 className={`${display.className} text-lg font-semibold`}>Payment</h2>
          <ul className="mt-1 divide-y divide-dashed divide-[#D4A24C]/70">
            {data.payments.map((p) => (
              <li key={p.mode} className="flex items-baseline justify-between py-2 text-sm">
                <span className="font-medium">{p.mode}</span>
                <span className="tabular-nums">{inr(p.amount)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Earn-points actions ---------- */}
        <section aria-label="Earn RedTab points" className="mx-4 mt-4 space-y-2">
          {([
            { icon: "star", title: "Shopping Experience Feedback", text: `Tell us a little bit about your recent shopping experience and earn ${rewards.feedback} RedTab points`, onClick: onFeedback },
            { icon: "users", title: "Refer a friend", text: `Refer a friend and both of you earn ${rewards.refer} RedTab points`, onClick: onRefer },
          ] as { icon: IconName; title: string; text: string; onClick?: () => void }[]).map((a) => (
            <button
              key={a.title}
              type="button"
              onClick={a.onClick}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#E1E5EC] bg-white p-3 text-left transition-colors hover:border-[var(--lv-red)] motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]"
            >
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#C41230]/10 text-[var(--lv-red)]">
                <Icon name={a.icon} className="h-6 w-6" />
              </span>
              <span>
                <span className="block text-sm font-semibold text-[var(--lv-red)]">{a.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lv-slate)]">{a.text}</span>
              </span>
            </button>
          ))}
        </section>

        {/* ---------- RedTab tabs ---------- */}
        <RedTabSection data={data} onUpdateProfile={onUpdateProfile} />

        {/* ---------- Reach out ---------- */}
        <section aria-label="Reach out to us" className="mx-4 mt-6 rounded-2xl bg-[var(--lv-ink)] px-4 py-4 text-white">
          <h2 className={`${display.className} text-xl font-semibold`}>Reach out to us</h2>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <a
              href={`tel:${contact.tollFree.replace(/\s/g, "")}`}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm transition-colors hover:bg-white/20 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Icon name="phone" />
              Talk to us
            </a>
            <a
              href={`mailto:${contact.email}`}
              className="flex flex-col items-center gap-1.5 rounded-xl bg-white/10 py-3 text-sm transition-colors hover:bg-white/20 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <Icon name="mail" />
              Write to us
            </a>
          </div>
        </section>

        {/* ---------- Terms and conditions ---------- */}
        <section aria-label="Terms and conditions" className="mx-4 mt-6">
          <h2 className={`${display.className} text-xl font-semibold`}>Terms and conditions</h2>
          <div className="mt-2 space-y-3 text-xs leading-relaxed text-[var(--lv-slate)]">
            <p>{terms.intro}</p>
            <ol className="list-decimal space-y-2 pl-5">
              {terms.list.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
            <p>
              Customer toll free no- {contact.tollFree}, {contact.hours}
            </p>
            <p>Email – {contact.email}</p>
            <p>{terms.note}</p>
          </div>
        </section>

        {/* ---------- Footer ---------- */}
        <footer className="mt-8 flex flex-col items-center gap-3 px-4">
          {barcodeSrc ? <img src={barcodeSrc} alt="Receipt barcode" className="h-14 w-full max-w-xs object-contain" /> : <PlaceholderBarcode seed={data.receiptId} />}
          <p className="text-xs text-[var(--lv-slate)]">
            Powered by <span className={`${display.className} text-lg font-bold text-[var(--lv-ink)]`}>rdep</span>
          </p>
        </footer>
      </main>

      {/* ---------------------------- Modals ---------------------------------------- */}
      {modal === "history" && (
        <Modal title="Transaction history" onClose={closeModal}>
          <ul className="divide-y divide-dashed divide-[#D4A24C]/70">
            {data.history.map((h) => (
              <li key={h.invoiceNo} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Invoice no: {h.invoiceNo}</p>
                  <p className="text-xs text-[var(--lv-slate)]">
                    {h.date}, {h.store}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">₹{inr(h.amount)}</p>
                  {h.current && <p className="text-xs font-medium text-[var(--lv-red)]">This receipt</p>}
                </div>
              </li>
            ))}
          </ul>
        </Modal>
      )}

      {modal === "email" && (
        <Modal title="Email this receipt" onClose={closeModal}>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              onSendEmail?.(email);
              setSentTo(email);
            }}
          >
            <label className="block">
              <span className="mb-1 block text-xs text-[var(--lv-slate)]">Email address</span>
              <input type="email" required value={email} onChange={(e) => { setSentTo(""); setEmail(e.target.value); }} className={inputCls} autoComplete="email" />
            </label>
            <button
              type="submit"
              className="w-full rounded-lg bg-[var(--lv-red)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A50F28] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]"
            >
              Send receipt
            </button>
            <p aria-live="polite" className="flex min-h-5 items-center justify-center gap-1.5 text-xs text-[var(--lv-denim)]">
              {sentTo && (
                <>
                  <Icon name="check" className="h-4 w-4" /> Receipt sent to {sentTo}
                </>
              )}
            </p>
          </form>
        </Modal>
      )}

      {modal === "tax" && (
        <Modal title="Tax calculation" onClose={closeModal}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-[var(--lv-ink)] text-xs text-[var(--lv-slate)]">
                  <th className="py-2 text-left font-semibold">GST slab</th>
                  <th className="py-2 text-right font-semibold">Taxable value</th>
                  <th className="py-2 text-right font-semibold">SGST</th>
                  <th className="py-2 text-right font-semibold">CGST</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map((r) => (
                  <tr key={r.rate} className="border-b border-dashed border-[#D4A24C]/70">
                    <td className="py-2.5">{r.rate}%</td>
                    <td className="py-2.5 text-right">{inr(r.base)}</td>
                    <td className="py-2.5 text-right">{inr(r.sgst)}</td>
                    <td className="py-2.5 text-right">{inr(r.cgst)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right">{inr(taxRows.reduce((s, r) => s + r.base, 0))}</td>
                  <td className="pt-3 text-right">{inr(taxRows.reduce((s, r) => s + r.sgst, 0))}</td>
                  <td className="pt-3 text-right">{inr(taxRows.reduce((s, r) => s + r.cgst, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-4 flex items-baseline justify-between border-t border-[var(--lv-ink)] pt-3">
            <span className={`${display.className} text-lg font-semibold`}>Net total</span>
            <span className={`${display.className} text-2xl font-bold text-[var(--lv-red)]`}>₹{inr(data.netTotal)}</span>
          </p>
        </Modal>
      )}
    </div>
  );
}
