"use client";

/**
 * Levi's x RDEP — Receipt redesign, Option 1
 *
 * Layout: logo bar -> red "ticket" hero (greeting, QR, invoice details) -> store ->
 * compact item list with inline details -> black net-total bar -> payment ->
 * feedback (stars + what you liked) -> refer -> RedTab segmented tabs -> reach out ->
 * terms (collapsible) -> barcode + rdep logo.
 *
 * Colours: Levi's red, black and white only (plus neutral greys for hairlines and muted text).
 *
 * Needs (in /public/images): levis-logo.png, rdep-logo.png
 * Stack: Next.js (app router) + Tailwind. No other dependencies.
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
  type FormEvent,
  type ReactNode,
} from "react";
import Image from "next/image";
import { Barlow, Barlow_Condensed } from "next/font/google";

const body = Barlow({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

/* Brand tokens: red, black, white + neutral greys. Alpha tints inline the hex. */
const theme = {
  "--lv-red": "#C41230",
  "--lv-red-dark": "#A50F28",
  "--lv-black": "#111111",
  "--lv-gray": "#6B6B6B",
  "--lv-line": "#E4E4E4",
  "--lv-wash": "#F5F5F5",
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

export interface FeedbackValues {
  rating: number;
  liked: string[];
}

export interface LevisReceiptProps {
  data?: LevisReceipt;
  /** Real QR image URL (a placeholder is drawn if omitted) */
  qrSrc?: string;
  /** Real barcode image URL (a placeholder is drawn if omitted) */
  barcodeSrc?: string;
  logoSrc?: string;
  rdepLogoSrc?: string;
  onDownloadPdf?: () => void;
  onSendEmail?: (email: string) => void;
  onUpdateProfile?: (values: ProfileForm) => void;
  onSubmitFeedback?: (values: FeedbackValues) => void;
  onRefer?: () => void;
}

type IconName =
  | "history" | "mail" | "download" | "star" | "users" | "coins" | "trend"
  | "gift" | "alert" | "phone" | "close" | "chevron" | "ticket" | "check";
type TabId = "points" | "profile" | "coupon";
type ModalId = "history" | "email" | "tax" | null;

/* ------------------------------- helpers ----------------------------------------- */
const inr = (n: number): string => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const trim = (n: number): string => String(Number(n.toFixed(2)));
const round2 = (n: number): number => Math.round(n * 100) / 100;

// Apparel GST slab: 5% up to ₹2,500 per piece, 18% above (matches the figures on the current receipt)
const slabFor = (item: ReceiptItem): number => (item.net / item.qty > 2500 ? 18 : 5);

function derive(item: ReceiptItem) {
  const rate = slabFor(item);
  const base = item.net / (1 + rate / 100);
  const half = rate / 2;
  const tax = (base * half) / 100;
  const gross = item.mrp * item.qty;
  const disc = gross - item.net;
  return { rate, base, half, tax, discountPct: (disc / gross) * 100, discountAmt: disc };
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

/* ----------------------------------------------------------------------------------
 * Sample data (shape mirrors the current receipt). Item 1 is the real line from the
 * current receipt; item codes / HSN / sizes for items 2–3 are SAMPLE values.
 * -------------------------------------------------------------------------------- */
const ITEMS: ReceiptItem[] = [
  { name: "BLR_MT_STANDARD FIT TEE SP VARSITY BRAND", qty: 1, mrp: 2199, net: 1889.97, code: "A797302560M", hsn: "61091000", size: "M" },
  { name: "BLR MB 511 SLIM ALOKI", qty: 1, mrp: 3789, net: 3256.52, code: "A112340071", hsn: "62034200", size: "32", inseam: "32" },
  { name: "BNG MT CL1PKT_TRIM SHRT L/S CLASSIC REGU", qty: 1, mrp: 3299, net: 2835.38, code: "A558120044", hsn: "62052000", size: "L" },
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
  subTotal: round2(ITEMS.reduce((s, i) => s + derive(i).base, 0)),
  netTotal: round2(ITEMS.reduce((s, i) => s + i.net, 0)),
  pieces: ITEMS.reduce((s, i) => s + i.qty, 0),
  payments: [
    { mode: "CASH", amount: 1981.87 },
    { mode: "QCLVR", amount: 6000 },
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
    { invoiceNo: "7019", date: "24-05-2026", store: "Durgapur - Junction Mall", amount: 7981.87, current: true },
    { invoiceNo: "6488", date: "11-02-2026", store: "Durgapur - Junction Mall", amount: 4299 },
    { invoiceNo: "5921", date: "29-12-2025", store: "Kolkata - Quest Mall", amount: 7897 },
  ],
};

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

function Icon({ name, className = "h-5 w-5", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
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
    <svg viewBox={`-1 -1 ${N + 2} ${N + 2}`} fill="#111111" shapeRendering="crispEdges" role="img" aria-label="Receipt QR code" className="h-full w-full">
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
    <svg viewBox="0 0 244 56" fill="#111111" shapeRendering="crispEdges" role="img" aria-label="Receipt barcode" className="h-14 w-full max-w-xs">
      {bars.map(([x, w]) => (
        <rect key={x} x={x} y="0" width={w} height="56" />
      ))}
    </svg>
  );
}

/* --------------------------------- shared ---------------------------------------- */
const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lv-red)]";
const inputCls = `w-full rounded-xl border border-[var(--lv-line)] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--lv-red)] focus:ring-2 focus:ring-[#C41230]/20`;
const primaryBtn = `w-full rounded-xl bg-[var(--lv-red)] py-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--lv-red-dark)] motion-reduce:transition-none ${focusRing}`;

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#111111]/60 sm:items-center sm:p-4"
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
            className={`grid h-9 w-9 place-items-center rounded-full bg-[var(--lv-wash)] hover:bg-[var(--lv-line)] ${focusRing}`}
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Height-animated disclosure body (no layout jump, respects reduced motion). */
function Collapse({ open, id, children }: { open: boolean; id: string; children: ReactNode }) {
  return (
    <div
      id={id}
      aria-hidden={!open}
      className={`grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
    >
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

/* ------------------------------ item row ----------------------------------------- */
function Spec({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1.5 rounded-md border border-[var(--lv-line)] px-2 py-1 text-xs">
      <span className="text-[var(--lv-gray)]">{label}</span>
      <span className={`font-semibold tabular-nums ${accent ? "text-[var(--lv-red)]" : ""}`}>{value}</span>
    </span>
  );
}

function ItemRow({ item, open, onToggle }: { item: ReceiptItem; open: boolean; onToggle: () => void }) {
  const d = useMemo(() => derive(item), [item]);
  const panelId = useId();
  return (
    <li className="py-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex w-full items-start gap-3 rounded-lg text-left ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold leading-snug">{item.name}</span>
          <span className="mt-1 flex gap-4 text-xs text-[var(--lv-gray)]">
            <span>Qty {item.qty}</span>
            <span>MRP {item.mrp.toLocaleString("en-IN")}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-sm font-bold tabular-nums">{inr(item.net)}</span>
          <span className="mt-1 inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--lv-red)]">
            Details
            <Icon
              name="chevron"
              className={`h-3.5 w-3.5 transition-transform duration-300 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
            />
          </span>
        </span>
      </button>

      <Collapse open={open} id={panelId}>
        <div className="mt-3 border-l-2 border-[var(--lv-red)] pl-3">
          <div className="flex flex-wrap gap-1.5">
            <Spec label="Item code" value={item.code} />
            <Spec label="HSN" value={item.hsn} />
            <Spec label="UoM" value="Pcs" />
            <Spec label="Size" value={item.size} />
            <Spec label="Inseam" value={item.inseam ?? "-"} />
            <Spec label="Discount %" value={trim(d.discountPct)} accent />
            <Spec label="Discount amount" value={trim(d.discountAmt)} accent />
          </div>
          <table className="mt-2 w-full text-xs tabular-nums">
            <thead>
              <tr className="text-[var(--lv-gray)]">
                <th className="py-1 text-left font-medium">Tax</th>
                <th className="py-1 text-right font-medium">%</th>
                <th className="py-1 text-right font-medium">Base amount</th>
                <th className="py-1 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(["SGST", "CGST"] as const).map((t) => (
                <tr key={t} className="border-t border-[var(--lv-line)]">
                  <td className="py-1.5 font-semibold">{t}</td>
                  <td className="py-1.5 text-right">{trim(d.half)}</td>
                  <td className="py-1.5 text-right">{trim(d.base)}</td>
                  <td className="py-1.5 text-right">{trim(d.tax)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Collapse>
    </li>
  );
}

/* ------------------------------- feedback ---------------------------------------- */
const STAR_LABELS = ["Poor", "Fair", "Good", "Very good", "Excellent"];
const LIKES = [
  "Product quality",
  "Fit and comfort",
  "Style and range",
  "Staff service",
  "Store ambience",
  "Trial rooms",
  "Billing speed",
  "Pricing and offers",
];

function FeedbackCard({
  name,
  points,
  onSubmit,
}: {
  name: string;
  points: number;
  onSubmit?: (values: FeedbackValues) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const groupName = useId();
  const shown = hover || rating;

  const toggle = (label: string) =>
    setLiked((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    onSubmit?.({ rating, liked });
    setDone(true);
  };

  return (
    <section aria-label="Shopping experience feedback" className="rounded-2xl border border-[var(--lv-line)] p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#C41230]/10 text-[var(--lv-red)]">
          <Icon name="star" className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-sm font-semibold text-[var(--lv-red)]">Shopping Experience Feedback</h2>
          <p className="mt-0.5 text-[13px] leading-snug text-[var(--lv-gray)]">
            Tell us a little bit about your recent shopping experience and earn {points} RedTab points
          </p>
        </div>
      </div>

      {done ? (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-xl bg-[#C41230]/10 p-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--lv-red)] text-white">
            <Icon name="check" className="h-5 w-5" />
          </span>
          <p className="text-sm leading-snug">
            <span className="block font-semibold">Thank you, {name}!</span>
            Your feedback has been submitted. You will earn {points} RedTab points.
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4">
          <fieldset>
            <legend className="sr-only">Rate your shopping experience</legend>
            <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
              {[1, 2, 3, 4, 5].map((n) => (
                <label key={n} className="relative cursor-pointer" onMouseEnter={() => setHover(n)}>
                  <input
                    type="radio"
                    name={groupName}
                    value={n}
                    checked={rating === n}
                    onChange={() => setRating(n)}
                    className="peer sr-only"
                  />
                  <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
                  <Icon
                    name="star"
                    filled={n <= shown}
                    className={`h-9 w-9 rounded transition-colors motion-reduce:transition-none peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--lv-red)] ${
                      n <= shown ? "text-[var(--lv-red)]" : "text-[#C9C9C9]"
                    }`}
                  />
                </label>
              ))}
              <p aria-live="polite" className="ml-2 text-sm font-semibold">
                {shown ? STAR_LABELS[shown - 1] : "Tap a star to rate"}
              </p>
            </div>
          </fieldset>

          <p className="mt-4 text-sm font-semibold">What did you like?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {LIKES.map((label) => {
              const on = liked.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(label)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors motion-reduce:transition-none ${focusRing} ${
                    on
                      ? "border-[var(--lv-red)] bg-[var(--lv-red)] text-white"
                      : "border-[var(--lv-line)] bg-white hover:border-[var(--lv-black)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={rating === 0}
            className={`mt-4 w-full rounded-xl py-3 text-sm font-semibold transition-colors motion-reduce:transition-none ${focusRing} ${
              rating === 0
                ? "cursor-not-allowed bg-[var(--lv-line)] text-[var(--lv-gray)]"
                : "bg-[var(--lv-red)] text-white hover:bg-[var(--lv-red-dark)]"
            }`}
          >
            Submit feedback
          </button>
        </form>
      )}
    </section>
  );
}

/* --------------------------- RedTab tabs section --------------------------------- */
const TABS: { id: TabId; label: string }[] = [
  { id: "points", label: "My RedTab Points" },
  { id: "profile", label: "Update Profile" },
  { id: "coupon", label: "Available Coupon" },
];

const labelCls = "mb-1 block text-xs font-medium text-[var(--lv-gray)]";

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
    <section aria-label="RedTab">
      <div role="tablist" aria-label="RedTab" className="grid grid-cols-3 gap-1 rounded-full bg-[var(--lv-wash)] p-1">
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
              className={`rounded-full px-2 py-2.5 text-xs font-semibold leading-tight transition-colors motion-reduce:transition-none ${focusRing} ${
                active ? "bg-[var(--lv-red)] text-white" : "text-[var(--lv-gray)] hover:text-[var(--lv-black)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="mt-3">
        {tab === "points" && (
          <div role="tabpanel" id="panel-points" aria-labelledby="tab-points" className="space-y-3">
            <div className="rounded-2xl border border-[var(--lv-line)] p-4">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--lv-gray)]">Available points</p>
                  <p className={`${display.className} mt-1 text-6xl font-bold leading-none tabular-nums text-[var(--lv-red)]`}>
                    {points.available.toLocaleString("en-IN")}
                  </p>
                </div>
                <Icon name="coins" className="h-10 w-10 text-[var(--lv-red)]" />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[var(--lv-line)] pt-4">
                <div className="flex items-center gap-3">
                  <Icon name="trend" className="h-6 w-6 shrink-0" />
                  <div>
                    <dd className={`${display.className} text-2xl font-semibold leading-none tabular-nums`}>{points.earned.toLocaleString("en-IN")}</dd>
                    <dt className="mt-1 text-xs text-[var(--lv-gray)]">Earned points</dt>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Icon name="gift" className="h-6 w-6 shrink-0" />
                  <div>
                    <dd className={`${display.className} text-2xl font-semibold leading-none tabular-nums`}>{points.redeemed.toLocaleString("en-IN")}</dd>
                    <dt className="mt-1 text-xs text-[var(--lv-gray)]">Redeemed points</dt>
                  </div>
                </div>
              </dl>
            </div>
            <div className="flex items-center gap-3 rounded-2xl bg-[#C41230]/10 p-4">
              <Icon name="alert" className="h-7 w-7 shrink-0 text-[var(--lv-red)]" />
              <p className="text-sm">
                <span className="block font-bold text-[var(--lv-red)]">{points.expiring.points.toLocaleString("en-IN")} points</span>
                Expiring on <span className="font-semibold">{points.expiring.on}</span>
              </p>
            </div>
          </div>
        )}

        {tab === "profile" && (
          <form
            role="tabpanel"
            id="panel-profile"
            aria-labelledby="tab-profile"
            className="space-y-4 rounded-2xl border border-[var(--lv-line)] p-4"
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
              <span className={labelCls}>Mobile</span>
              <p className="text-sm font-semibold tabular-nums">{data.customer.mobile}</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={labelCls}>First name</span>
                <input className={inputCls} value={form.firstName} onChange={set("firstName")} autoComplete="given-name" />
              </label>
              <label>
                <span className={labelCls}>Last name</span>
                <input className={inputCls} value={form.lastName} onChange={set("lastName")} autoComplete="family-name" />
              </label>
              <label>
                <span className={labelCls}>Birthday</span>
                <input type="date" className={inputCls} value={form.birthday} onChange={set("birthday")} autoComplete="bday" />
              </label>
              <label>
                <span className={labelCls}>Gender</span>
                <select className={inputCls} value={form.gender} onChange={set("gender")}>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </label>
            </div>
            <label className="block">
              <span className={labelCls}>Email</span>
              <input type="email" className={inputCls} value={form.email} onChange={set("email")} autoComplete="email" />
            </label>
            <button type="submit" className={primaryBtn}>
              Update
            </button>
            <p aria-live="polite" className="min-h-5 text-center text-xs font-semibold text-[var(--lv-red)]">
              {saved ? "Profile updated." : ""}
            </p>
          </form>
        )}

        {tab === "coupon" && (
          <div
            role="tabpanel"
            id="panel-coupon"
            aria-labelledby="tab-coupon"
            className="flex flex-col items-center rounded-2xl border border-dashed border-[var(--lv-gray)] px-6 py-10 text-center"
          >
            <Icon name="ticket" className="h-9 w-9 text-[var(--lv-red)]" />
            <p className={`${display.className} mt-3 text-2xl font-semibold`}>No coupons available.</p>
            <p className="mt-1 text-sm text-[var(--lv-gray)]">Please check this section later.</p>
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
  logoSrc = "/images/levis-logo.png",
  rdepLogoSrc = "/images/rdep-logo.png",
  onDownloadPdf = () => window.print(),
  onSendEmail,
  onUpdateProfile,
  onSubmitFeedback,
  onRefer,
}: LevisReceiptProps) {
  const [openItem, setOpenItem] = useState(0);
  const [modal, setModal] = useState<ModalId>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const closeModal = useCallback(() => setModal(null), []);
  const termsId = useId();

  const { store, rewards, contact, terms } = data;

  const taxRows = useMemo(() => {
    const by = new Map<number, { rate: number; base: number; sgst: number; cgst: number }>();
    data.items.forEach((item) => {
      const d = derive(item);
      const row = by.get(d.rate) ?? { rate: d.rate, base: 0, sgst: 0, cgst: 0 };
      row.base += d.base;
      row.sgst += d.tax;
      row.cgst += d.tax;
      by.set(d.rate, row);
    });
    return [...by.values()].sort((a, b) => a.rate - b.rate);
  }, [data.items]);

  const roundBtn = `grid h-10 w-10 place-items-center rounded-full border border-[var(--lv-line)] transition-colors hover:border-[var(--lv-black)] motion-reduce:transition-none ${focusRing}`;
  const heroRow = "flex items-baseline justify-between gap-4";

  return (
    <div style={theme} className={`${body.className} min-h-screen bg-[var(--lv-wash)] text-[var(--lv-black)] sm:py-8`}>
      <main className="mx-auto w-full max-w-md bg-white pb-8 sm:rounded-3xl sm:shadow-[0_24px_60px_-24px_rgba(17,17,17,0.35)]">
        {/* ---------- Logo bar + quick actions ---------- */}
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <Image src={logoSrc} alt="Levi's" width={160} height={64} priority className="h-10 w-auto" />
          <div className="flex gap-2">
            <button type="button" className={roundBtn} aria-label="Transaction history" title="Transaction history" onClick={() => setModal("history")}>
              <Icon name="history" className="h-[18px] w-[18px]" />
            </button>
            <button type="button" className={roundBtn} aria-label="Email receipt" title="Email receipt" onClick={() => setModal("email")}>
              <Icon name="mail" className="h-[18px] w-[18px]" />
            </button>
            <button type="button" className={roundBtn} aria-label="Download PDF" title="Download PDF" onClick={onDownloadPdf}>
              <Icon name="download" className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* ---------- Hero: greeting, QR, invoice details ---------- */}
        <section className="mx-4 rounded-3xl bg-[var(--lv-red)] p-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/90">Tax invoice</p>
              <h1 className={`${display.className} mt-1 text-4xl font-semibold leading-none`}>Hello {data.customer.firstName}!</h1>
            </div>
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-white p-1.5">
              {qrSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain" />
              ) : (
                <PlaceholderQR seed={data.receiptId} />
              )}
            </div>
          </div>

          <dl className="mt-5 space-y-2 border-t border-dashed border-white/60 pt-4 text-sm">
            <div className={heroRow}>
              <dt className="text-white/90">Invoice no</dt>
              <dd className="font-semibold tabular-nums">{data.invoiceNo}</dd>
            </div>
            <div className={heroRow}>
              <dt className="shrink-0 text-white/90">Receipt ID</dt>
              <dd className="break-all text-right font-semibold tabular-nums">{data.receiptId}</dd>
            </div>
            <div className={heroRow}>
              <dt className="text-white/90">Date</dt>
              <dd className="font-semibold tabular-nums">{data.date}</dd>
            </div>
            <div className={heroRow}>
              <dt className="text-white/90">Cashier</dt>
              <dd className="font-semibold tabular-nums">{data.cashier}</dd>
            </div>
          </dl>
        </section>

        <div className="space-y-6 px-4 pt-6">
          {/* ---------- Store ---------- */}
          <section aria-label="Store">
            <h2 className={`${display.className} text-2xl font-semibold leading-tight`}>{store.name}</h2>
            <p className="mt-1 text-sm font-medium">{store.branch}</p>
            <p className="mt-0.5 text-sm leading-snug text-[var(--lv-gray)]">{store.address}</p>
            <dl className="mt-4 grid grid-cols-3 divide-x divide-[var(--lv-line)] border-y border-[var(--lv-line)] py-3 text-center">
              {[
                ["Store code", store.code],
                ["Phone no.", store.phone],
                ["Store timing", store.timing],
              ].map(([k, v]) => (
                <div key={k} className="px-2">
                  <dt className="text-xs text-[var(--lv-gray)]">{k}</dt>
                  <dd className="mt-0.5 text-[13px] font-semibold leading-tight tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-[var(--lv-gray)]">
              Legal name: <span className="font-medium text-[var(--lv-black)]">{store.legalName}</span>
            </p>
          </section>

          {/* ---------- Items + totals ---------- */}
          <section aria-label="Items purchased">
            <ul className="divide-y divide-[var(--lv-line)] border-t border-[var(--lv-black)]">
              {data.items.map((item, i) => (
                <ItemRow key={`${item.code}-${i}`} item={item} open={openItem === i} onToggle={() => setOpenItem(openItem === i ? -1 : i)} />
              ))}
            </ul>

            <div className="flex items-baseline justify-between border-t border-[var(--lv-black)] pt-3 text-sm">
              <span className="text-[var(--lv-gray)]">Sub total</span>
              <span className="font-semibold tabular-nums">{inr(data.subTotal)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-2xl bg-[var(--lv-black)] px-4 py-3.5 text-white">
              <span className={`${display.className} text-xl font-semibold`}>Net total</span>
              <span className={`${display.className} text-3xl font-bold tabular-nums`}>₹{inr(data.netTotal)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-[var(--lv-gray)]">Pieces purchased: {data.pieces}</p>
              <button
                type="button"
                onClick={() => setModal("tax")}
                className={`rounded-md py-1 text-sm font-semibold text-[var(--lv-red)] underline-offset-4 hover:underline ${focusRing}`}
              >
                View tax calculation
              </button>
            </div>
          </section>

          {/* ---------- Payment ---------- */}
          <section aria-label="Payment">
            <h2 className={`${display.className} text-xl font-semibold`}>Payment</h2>
            <ul className="mt-1 divide-y divide-[var(--lv-line)] border-y border-[var(--lv-line)]">
              {data.payments.map((p) => (
                <li key={p.mode} className="flex items-baseline justify-between py-2.5 text-sm">
                  <span className="font-semibold">{p.mode}</span>
                  <span className="tabular-nums">{inr(p.amount)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- Feedback + refer ---------- */}
          <FeedbackCard name={data.customer.firstName} points={rewards.feedback} onSubmit={onSubmitFeedback} />

          <button
            type="button"
            onClick={onRefer}
            className={`flex w-full items-center gap-3 rounded-2xl border border-[var(--lv-line)] p-4 text-left transition-colors hover:border-[var(--lv-red)] motion-reduce:transition-none ${focusRing}`}
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#C41230]/10 text-[var(--lv-red)]">
              <Icon name="users" className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-[var(--lv-red)]">Refer a friend</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-[var(--lv-gray)]">
                Refer a friend and both of you earn {rewards.refer} RedTab points
              </span>
            </span>
          </button>

          {/* ---------- RedTab ---------- */}
          <RedTabSection data={data} onUpdateProfile={onUpdateProfile} />

          {/* ---------- Reach out ---------- */}
          <section aria-label="Reach out to us">
            <h2 className={`${display.className} text-xl font-semibold`}>Reach out to us</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <a
                href={`tel:${contact.tollFree.replace(/\s/g, "")}`}
                className={`flex items-center justify-center gap-2 rounded-xl border border-[var(--lv-black)] py-3 text-sm font-semibold transition-colors hover:bg-[var(--lv-black)] hover:text-white motion-reduce:transition-none ${focusRing}`}
              >
                <Icon name="phone" className="h-[18px] w-[18px]" />
                Talk to us
              </a>
              <a
                href={`mailto:${contact.email}`}
                className={`flex items-center justify-center gap-2 rounded-xl border border-[var(--lv-black)] py-3 text-sm font-semibold transition-colors hover:bg-[var(--lv-black)] hover:text-white motion-reduce:transition-none ${focusRing}`}
              >
                <Icon name="mail" className="h-[18px] w-[18px]" />
                Write to us
              </a>
            </div>
          </section>

          {/* ---------- Terms (collapsible) ---------- */}
          <section aria-label="Terms and conditions" className="border-y border-[var(--lv-line)]">
            <h2>
              <button
                type="button"
                aria-expanded={termsOpen}
                aria-controls={termsId}
                onClick={() => setTermsOpen((o) => !o)}
                className={`${display.className} flex w-full items-center justify-between py-4 text-xl font-semibold ${focusRing}`}
              >
                Terms and conditions
                <Icon name="chevron" className={`h-5 w-5 transition-transform duration-300 motion-reduce:transition-none ${termsOpen ? "rotate-180" : ""}`} />
              </button>
            </h2>
            <Collapse open={termsOpen} id={termsId}>
              <div className="space-y-3 pb-4 text-xs leading-relaxed text-[var(--lv-gray)]">
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
            </Collapse>
          </section>

          {/* ---------- Footer ---------- */}
          <footer className="flex flex-col items-center gap-3 pt-2">
            {barcodeSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={barcodeSrc} alt="Receipt barcode" className="h-14 w-full max-w-xs object-contain" />
            ) : (
              <PlaceholderBarcode seed={data.receiptId} />
            )}
            <div className="flex items-center gap-2 text-xs text-[var(--lv-gray)]">
              <span>Powered by</span>
              <Image src={rdepLogoSrc} alt="rdep" width={96} height={32} className="h-5 w-auto" />
            </div>
          </footer>
        </div>
      </main>

      {/* ---------------------------- Modals ---------------------------------------- */}
      {modal === "history" && (
        <Modal title="Transaction history" onClose={closeModal}>
          <ul className="divide-y divide-[var(--lv-line)]">
            {data.history.map((h) => (
              <li key={h.invoiceNo} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Invoice no: {h.invoiceNo}</p>
                  <p className="text-xs text-[var(--lv-gray)]">
                    {h.date}, {h.store}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">₹{inr(h.amount)}</p>
                  {h.current && <p className="text-xs font-semibold text-[var(--lv-red)]">This receipt</p>}
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
              <span className={labelCls}>Email address</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setSentTo("");
                  setEmail(e.target.value);
                }}
                className={inputCls}
                autoComplete="email"
              />
            </label>
            <button type="submit" className={primaryBtn}>
              Send receipt
            </button>
            <p aria-live="polite" className="flex min-h-5 items-center justify-center gap-1.5 text-xs font-semibold text-[var(--lv-red)]">
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
                <tr className="border-b border-[var(--lv-black)] text-xs text-[var(--lv-gray)]">
                  <th className="py-2 text-left font-semibold">GST slab</th>
                  <th className="py-2 text-right font-semibold">Taxable value</th>
                  <th className="py-2 text-right font-semibold">SGST</th>
                  <th className="py-2 text-right font-semibold">CGST</th>
                </tr>
              </thead>
              <tbody>
                {taxRows.map((r) => (
                  <tr key={r.rate} className="border-b border-[var(--lv-line)]">
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
          <p className="mt-4 flex items-baseline justify-between rounded-2xl bg-[var(--lv-black)] px-4 py-3 text-white">
            <span className={`${display.className} text-lg font-semibold`}>Net total</span>
            <span className={`${display.className} text-2xl font-bold`}>₹{inr(data.netTotal)}</span>
          </p>
        </Modal>
      )}
    </div>
  );
}
