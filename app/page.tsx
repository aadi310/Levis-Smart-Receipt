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
 * What's in this version (ported from the "Red Tab, Light" receipt)
 *  - Transaction history lists every receipt passed in `receipts`; tapping a row opens that
 *    receipt in place (the whole page switches to it and scrolls back to the top).
 *  - Download builds a standalone receipt document for the receipt on screen. It has a
 *    "Save as PDF" button that opens the print dialog.
 *
 * Needs (in /public/images): levis-logo.png, rdep-logo.png
 * Stack: Next.js (app router) + Tailwind. No other dependencies.
 *
 * Usage:  app/levis-receipt/page.tsx
 *   import LevisReceiptV1 from "@/components/LevisReceiptV1";
 *   export default function Page() { return <LevisReceiptV1 />; }
 *
 * With real data: <LevisReceiptV1 receipts={[...]} data={currentReceipt} />
 *   `receipts` = every receipt of this customer (the history popup is built from it).
 *   `data`     = the receipt to open first (defaults to the newest one in `receipts`).
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
  /** "DD-MM-YYYY HH:mm:ss" — the date part is used to sort the history */
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
  contact: {
    tollFree: string;
    hours: string;
    email: string;
    /** Number opened by "Talk to us" */
    callTo: string;
    /** Address opened by "Write to us" */
    writeTo: string;
  };
  referral: { code: string; signupUrl: string };
  tax: {
    lines: { type: "CGST" | "SGST"; rate: number; base: number; amount: number }[];
    customerGst: string;
    placeOfSupply: string;
    reverseCharge: string;
  };
  terms: { intro: string; list: string[]; note: string };
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
  /** Receipt to open first. Defaults to the newest receipt in `receipts`. */
  data?: LevisReceipt;
  /** All receipts of this customer. Drives the history popup; tapping a row opens that receipt. */
  receipts?: LevisReceipt[];
  /** Real QR image URL (a placeholder is drawn if omitted) */
  qrSrc?: string;
  /** Real barcode image URL (a placeholder is drawn if omitted) */
  barcodeSrc?: string;
  logoSrc?: string;
  rdepLogoSrc?: string;
  /** Overrides the built-in download. Receives the receipt currently on screen. */
  onDownloadPdf?: (receipt: LevisReceipt) => void;
  onSendEmail?: (email: string, receipt: LevisReceipt) => void;
  onUpdateProfile?: (values: ProfileForm) => void;
  onSubmitFeedback?: (values: FeedbackValues) => void;
  onRefer?: () => void;
  /** Fires when a receipt is opened from the history popup */
  onSelectReceipt?: (invoiceNo: string) => void;
}

type IconName =
  | "history" | "mail" | "download" | "star" | "users" | "coins" | "trend"
  | "gift" | "alert" | "phone" | "close" | "chevron" | "ticket" | "check"
  | "pin" | "clock" | "hash" | "store";
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

const buildReferralMessage = (code: string, url: string, points: number): string =>
  `Hey, Use my referral code *${code}* and register for Levi's Redtab member program to enjoy exclusive benefits like earning points on every transaction, birthday surprises, special offers & more! Sign up here: ${url} We both earn ${points} reward points once you register successfully. Let's shop together! *T&C apply.`;

/** Groups items by GST slab. Base + CGST + SGST adds up exactly to the items' net amounts. */
function buildTax(items: ReceiptItem[]) {
  const by = new Map<number, { net: number; base: number }>();
  items.forEach((item) => {
    const d = derive(item);
    const row = by.get(d.rate) ?? { net: 0, base: 0 };
    row.net += item.net;
    row.base += d.base;
    by.set(d.rate, row);
  });
  const slabs = [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, v]) => {
      const base = round2(v.base);
      const tax = round2(v.net - base);
      const cgst = round2(tax / 2);
      return { rate, base, cgst, sgst: round2(tax - cgst) };
    });
  return {
    subTotal: round2(slabs.reduce((a, x) => a + x.base, 0)),
    lines: [
      ...slabs.map((x) => ({ type: "CGST" as const, rate: x.rate / 2, base: x.base, amount: x.cgst })),
      ...slabs.map((x) => ({ type: "SGST" as const, rate: x.rate / 2, base: x.base, amount: x.sgst })),
    ],
  };
}

/** "24-05-2026 20:34:17" -> timestamp (date part only), used to sort the history newest first. */
function dateValue(d: string): number {
  const [dd, mm, yyyy] = d.split(" ")[0].split("-").map(Number);
  return Date.UTC(yyyy, (mm || 1) - 1, dd || 1);
}

const shortStore = (branch: string): string => branch.replace(/^SSIPL\s*-\s*/i, "").replace(/-/g, " - ");

/* ---------------------------- downloadable receipt ------------------------------- */
const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Standalone, print-ready HTML for one receipt. The "Save as PDF" button inside it opens the print dialog. */
function buildReceiptHtml(r: LevisReceipt, logoSrc: string, rdepLogoSrc: string): string {
  const abs = (p: string) => (/^(https?:|data:)/.test(p) ? p : `${window.location.origin}${p}`);
  const cgst = round2(r.tax.lines.filter((l) => l.type === "CGST").reduce((a, l) => a + l.amount, 0));
  const sgst = round2(r.tax.lines.filter((l) => l.type === "SGST").reduce((a, l) => a + l.amount, 0));

  const itemRows = r.items
    .map((item) => {
      const d = derive(item);
      return `<tr>
        <td><div class="n">${esc(item.name)}</div>
          <div class="s">Code ${esc(item.code)} &middot; HSN ${esc(item.hsn)} &middot; Size ${esc(item.size)}${item.inseam ? ` &middot; Inseam ${esc(item.inseam)}` : ""}</div></td>
        <td class="r">${item.qty}</td>
        <td class="r">${inr(item.mrp * item.qty)}</td>
        <td class="r">${trim(d.discountPct)}%</td>
        <td class="r b">${inr(item.net)}</td>
      </tr>`;
    })
    .join("");

  const taxRows = r.tax.lines
    .map((l) => `<tr><td>${l.type} @ ${l.rate}%</td><td class="r">${inr(l.base)}</td><td class="r">${inr(l.amount)}</td></tr>`)
    .join("");

  const payRows = r.payments
    .map((p) => `<div class="row"><span>${esc(p.mode)}</span><strong>${inr(p.amount)}</strong></div>`)
    .join("");

  const terms = r.terms.list.map((t) => `<li>${esc(t)}</li>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Levi's Receipt ${esc(r.invoiceNo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Inter',Arial,sans-serif;font-size:14px;color:#2E2E2E;background:#FAF9F7;max-width:780px;margin:0 auto;padding:24px;}
.bar{display:flex;justify-content:flex-end;margin-bottom:16px;}
.bar button{background:#C41230;color:#fff;border:0;border-radius:8px;padding:10px 18px;font:600 13px 'Inter',Arial,sans-serif;cursor:pointer;}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding-bottom:16px;border-bottom:4px solid #C41230;margin-bottom:20px;}
.head img{height:48px;width:auto;}
.head h1{font-size:26px;color:#C41230;text-transform:uppercase;letter-spacing:.5px;margin-top:10px;}
.meta{text-align:right;font-size:12px;line-height:1.7;}
.store{background:#F0EEEB;border-left:4px solid #2E2E2E;padding:12px 14px;margin-bottom:20px;font-size:12px;line-height:1.6;color:#666666;}
.store h2{font-size:15px;color:#2E2E2E;}
.cust{margin-bottom:18px;font-size:13px;}
table{width:100%;border-collapse:collapse;}
.items th{background:#2E2E2E;color:#fff;text-align:left;padding:9px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.5px;}
.items td{padding:11px 8px;border-bottom:1px solid #E2DED9;vertical-align:top;font-size:12px;}
.r{text-align:right;} .b{font-weight:700;}
.items th.r{text-align:right;}
.n{font-weight:600;text-transform:uppercase;} .s{font-size:11px;color:#666666;margin-top:3px;}
.cols{display:flex;gap:28px;margin-top:22px;align-items:flex-start;}
.col{flex:1;}
.col h3{font-size:12px;text-transform:uppercase;letter-spacing:.6px;border-bottom:2px solid #2E2E2E;padding-bottom:6px;margin-bottom:8px;}
.row{display:flex;justify-content:space-between;padding:4px 0;font-size:13px;}
.tax th{text-align:left;font-size:11px;color:#666666;padding:4px 0;border-bottom:1px solid #E2DED9;}
.tax th.r{text-align:right;} .tax td{padding:5px 0;font-size:12px;}
.net{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:12px 14px;background:#C41230;color:#fff;}
.net span{font-size:14px;text-transform:uppercase;letter-spacing:.6px;font-weight:600;} .net strong{font-size:24px;}
.pts{margin-top:18px;font-size:12px;color:#666666;}
.terms{margin-top:26px;padding-top:14px;border-top:1px dashed #E2DED9;font-size:10px;color:#666666;line-height:1.6;}
.terms ol{padding-left:16px;margin:6px 0;}
.foot{margin-top:24px;padding-top:16px;border-top:1px dashed #E2DED9;text-align:center;font-size:12px;color:#666666;}
.foot img{height:20px;width:auto;vertical-align:middle;margin-left:6px;}
@media print{.bar{display:none;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;max-width:none;padding:0;}}
</style>
</head>
<body>

<div class="head">
  <div>
    <img src="${esc(abs(logoSrc))}" alt="Levi's" onerror="this.style.display='none'">
    <h1>Tax invoice</h1>
  </div>
  <div class="meta">
    <div><strong>Invoice no:</strong> ${esc(r.invoiceNo)}</div>
    <div><strong>Receipt ID:</strong> ${esc(r.receiptId)}</div>
    <div><strong>Date:</strong> ${esc(r.date)}</div>
    <div><strong>Cashier:</strong> ${esc(r.cashier)}</div>
  </div>
</div>

<div class="store">
  <h2>${esc(r.store.name)} &ndash; ${esc(r.store.branch)}</h2>
  <div>${esc(r.store.address)}</div>
  <div>Store code ${esc(r.store.code)} &middot; Phone ${esc(r.store.phone)} &middot; ${esc(r.store.timing)}</div>
  <div>${esc(r.store.legalName)}</div>
</div>

<div class="cust"><strong>Customer:</strong> ${esc(r.customer.firstName)} &middot; ${esc(r.customer.mobile)}</div>

<table class="items">
  <thead><tr><th style="width:46%">Item</th><th class="r">Qty</th><th class="r">MRP</th><th class="r">Disc.</th><th class="r">Net amount</th></tr></thead>
  <tbody>${itemRows}</tbody>
</table>

<div class="cols">
  <div class="col">
    <h3>Tax calculation</h3>
    <table class="tax">
      <thead><tr><th>Tax</th><th class="r">Base amount</th><th class="r">Tax amount</th></tr></thead>
      <tbody>${taxRows}</tbody>
    </table>
    <div class="pts">Customer GST: ${esc(r.tax.customerGst)} &middot; Place of supply: ${esc(r.tax.placeOfSupply)} &middot; Reverse charge: ${esc(r.tax.reverseCharge)}</div>
  </div>
  <div class="col">
    <h3>Summary</h3>
    <div class="row"><span>Sub total</span><strong>${inr(r.subTotal)}</strong></div>
    <div class="row"><span>CGST</span><strong>+ ${inr(cgst)}</strong></div>
    <div class="row"><span>SGST</span><strong>+ ${inr(sgst)}</strong></div>
    <div class="net"><span>Net total</span><strong>&#8377;${inr(r.netTotal)}</strong></div>
    <div class="row" style="margin-top:8px"><span>Pieces purchased</span><strong>${r.pieces}</strong></div>
    <h3 style="margin-top:16px">Payment</h3>
    ${payRows}
  </div>
</div>

<div class="pts">RedTab points &mdash; earned: ${r.points.earned} &middot; redeemed: ${r.points.redeemed} &middot; available: ${r.points.available}</div>

<div class="terms">
  <strong>Terms and conditions</strong>
  <p>${esc(r.terms.intro)}</p>
  <ol>${terms}</ol>
  <p>Customer toll free no- ${esc(r.contact.tollFree)}, ${esc(r.contact.hours)} &middot; Email &ndash; ${esc(r.contact.email)}</p>
  <p>${esc(r.terms.note)}</p>
</div>

<div class="foot">Thank you for shopping at Levi's!<br><br>Powered by <img src="${esc(abs(rdepLogoSrc))}" alt="rdep" onerror="this.style.display='none'"></div>
</body>
</html>`;
}

function downloadReceipt(r: LevisReceipt, logoSrc: string, rdepLogoSrc: string) {
  const blob = new Blob([buildReceiptHtml(r, logoSrc, rdepLogoSrc)], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Levis_Receipt_${r.invoiceNo}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/* ----------------------------------------------------------------------------------
 * Sample data (shape mirrors the current receipt). Receipt 7019 is the real one; the other
 * two receipts (and the codes / HSN / sizes of the extra items) are SAMPLE values for the
 * history popup. Replace with the real API response.
 * -------------------------------------------------------------------------------- */
const SAMPLE_COMMON = {
  customer: { firstName: "Rashid", mobile: "9993587328" },
  rewards: { feedback: 50, refer: 100, profile: 50 },
  contact: {
    tollFree: "1800 1020 501",
    hours: "Mon-Fri, 10AM to 6 PM",
    email: "feedback@levi.com",
    callTo: "+919620921294",
    writeTo: "sagar.p@proenx.com",
  },
  referral: { code: "LEV12WU0SE", signupUrl: "https://levisredtabmemberin.erlpaas.com/" },
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
};

const STORE_DURGAPUR: LevisReceipt["store"] = {
  name: "Levi's Exclusive Store",
  branch: "SSIPL - Durgapur-Junction Mall",
  address: "Levi's Store, UGF-12, Junction Mall, City Center, Durgapur, West Bengal",
  code: "0020043690",
  phone: "03432544257",
  timing: "10:00 AM to 10:00 PM",
  legalName: "SSIPL LIFESTYLE PRIVATE LIMITED",
};

// SAMPLE store details
const STORE_KOLKATA: LevisReceipt["store"] = {
  name: "Levi's Exclusive Store",
  branch: "SSIPL - Kolkata-Quest Mall",
  address: "Levi's Store, Quest Mall, Syed Amir Ali Avenue, Park Circus, Kolkata, West Bengal",
  code: "0020043721",
  phone: "03322878800",
  timing: "11:00 AM to 10:00 PM",
  legalName: "SSIPL LIFESTYLE PRIVATE LIMITED",
};

function makeReceipt(o: {
  invoiceNo: string;
  receiptId: string;
  date: string;
  cashier: string;
  store: LevisReceipt["store"];
  items: ReceiptItem[];
  payments: LevisReceipt["payments"];
  points: LevisReceipt["points"];
}): LevisReceipt {
  const tax = buildTax(o.items);
  return {
    ...SAMPLE_COMMON,
    invoiceNo: o.invoiceNo,
    receiptId: o.receiptId,
    date: o.date,
    cashier: o.cashier,
    store: o.store,
    items: o.items,
    subTotal: tax.subTotal,
    netTotal: round2(o.items.reduce((s, i) => s + i.net, 0)),
    pieces: o.items.reduce((s, i) => s + i.qty, 0),
    payments: o.payments,
    points: o.points,
    tax: { lines: tax.lines, customerGst: "Unregistered", placeOfSupply: "West Bengal", reverseCharge: "No" },
  };
}

export const sampleLevisReceipts: LevisReceipt[] = [
  makeReceipt({
    invoiceNo: "7019",
    receiptId: "202605244369017019",
    date: "24-05-2026 20:34:17",
    cashier: "475117",
    store: STORE_DURGAPUR,
    items: [
      { name: "BLR_MT_STANDARD FIT TEE SP VARSITY BRAND", qty: 1, mrp: 2199, net: 1889.97, code: "A797302560M", hsn: "61091000", size: "M" },
      { name: "BLR MB 511 SLIM ALOKI", qty: 1, mrp: 3789, net: 3256.52, code: "A112340071", hsn: "62034200", size: "32", inseam: "32" },
      { name: "BNG MT CL1PKT_TRIM SHRT L/S CLASSIC REGU", qty: 1, mrp: 3299, net: 2835.38, code: "A558120044", hsn: "62052000", size: "L" },
    ],
    payments: [
      { mode: "CASH", amount: 1981.87 },
      { mode: "QCLVR", amount: 6000 },
    ],
    points: { available: 1951, earned: 917, redeemed: 0, expiring: { points: 1034, on: "12 Jan 2027" } },
  }),
  makeReceipt({
    invoiceNo: "6488",
    receiptId: "202602114369016488",
    date: "11-02-2026 18:12:45",
    cashier: "475102",
    store: STORE_DURGAPUR,
    items: [
      { name: "BLR MB 512 SLIM TAPER ARMANI", qty: 1, mrp: 4999, net: 4299, code: "A346780012", hsn: "62034200", size: "32", inseam: "32" },
    ],
    payments: [{ mode: "QCLVR", amount: 4299 }],
    points: { available: 1034, earned: 430, redeemed: 0, expiring: { points: 604, on: "30 Nov 2026" } },
  }),
  makeReceipt({
    invoiceNo: "5921",
    receiptId: "202512294372015921",
    date: "29-12-2025 16:05:09",
    cashier: "475231",
    store: STORE_KOLKATA,
    items: [
      { name: "BLR MT SLIM FIT TEE CORE LOGO", qty: 1, mrp: 2299, net: 1899, code: "A203450087", hsn: "61091000", size: "L" },
      { name: "BLR MJ TRUCKER JACKET RINSE", qty: 1, mrp: 6999, net: 5998, code: "A671120931", hsn: "62019300", size: "M" },
    ],
    payments: [
      { mode: "CASH", amount: 1897 },
      { mode: "QCLVR", amount: 6000 },
    ],
    points: { available: 604, earned: 790, redeemed: 0, expiring: { points: 604, on: "05 Dec 2026" } },
  }),
];

/** Kept for backwards compatibility: the newest sample receipt. */
export const sampleLevisReceipt: LevisReceipt = sampleLevisReceipts[0];

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
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  hash: <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />,
  store: (
    <>
      <path d="m3 9 1.5-5h15L21 9" />
      <path d="M4 9v11h16V9" />
      <path d="M3 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
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

function ItemRow({ item, index, open, onToggle }: { item: ReceiptItem; index: number; open: boolean; onToggle: () => void }) {
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
        <span className={`${display.className} w-7 shrink-0 pt-px text-xl font-semibold leading-none tabular-nums text-[var(--lv-red)]`}>
          {String(index + 1).padStart(2, "0")}
        </span>
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
        <div className="ml-10 mt-3 border-l-2 border-[var(--lv-red)] pl-3">
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
                      : "border-[var(--lv-line)] bg-white hover:border-[var(--lv-red)] hover:text-[var(--lv-red)]"
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

/* ------------------------------ receipt view ------------------------------------- */
interface ReceiptViewProps extends Omit<LevisReceiptProps, "data" | "receipts" | "onSelectReceipt"> {
  data: LevisReceipt;
  history: { invoiceNo: string; date: string; store: string; amount: number; current: boolean }[];
  onSelect: (invoiceNo: string) => void;
}

function ReceiptView({
  data,
  history,
  onSelect,
  qrSrc,
  barcodeSrc,
  logoSrc = "/images/levis-logo.png",
  rdepLogoSrc = "/images/rdep-logo.png",
  onDownloadPdf,
  onSendEmail,
  onUpdateProfile,
  onSubmitFeedback,
  onRefer,
}: ReceiptViewProps) {
  const [openItem, setOpenItem] = useState(-1);
  const [modal, setModal] = useState<ModalId>(null);
  const [termsOpen, setTermsOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState("");
  const closeModal = useCallback(() => setModal(null), []);
  const termsId = useId();

  const { store, rewards, contact, terms, referral } = data;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(buildReferralMessage(referral.code, referral.signupUrl, rewards.refer))}`;

  const taxTotals = useMemo(() => {
    const sum = (t: "CGST" | "SGST") =>
      round2(data.tax.lines.filter((l) => l.type === t).reduce((acc, l) => acc + l.amount, 0));
    return { cgst: sum("CGST"), sgst: sum("SGST") };
  }, [data.tax.lines]);

  const handleDownload = () => (onDownloadPdf ? onDownloadPdf(data) : downloadReceipt(data, logoSrc, rdepLogoSrc));

  return (
    <div style={theme} className={`${body.className} min-h-screen bg-[var(--lv-wash)] text-[var(--lv-black)] sm:py-8`}>
      <main className="mx-auto w-full max-w-md bg-white pb-8 sm:rounded-3xl sm:shadow-[0_24px_60px_-24px_rgba(17,17,17,0.35)]">
        <div className="space-y-6 px-4 pt-5">
          {/* ---------- Store (logo lives here) ---------- */}
          <section aria-label="Store" className="rounded-2xl border border-[var(--lv-line)] p-4">
            <div className="flex items-center gap-3">
              <Image src={logoSrc} alt="Levi's" width={160} height={64} priority className="h-12 w-auto shrink-0" />
              <div className="min-w-0">
                <h2 className={`${display.className} text-2xl font-semibold leading-tight`}>{store.name}</h2>
                <p className="text-sm font-semibold">{store.branch}</p>
              </div>
            </div>

            <p className="mt-4 flex items-start gap-2 text-sm leading-snug text-[var(--lv-gray)]">
              <Icon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--lv-red)]" />
              {store.address}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[var(--lv-wash)] p-3">
                <dt className="flex items-center gap-1.5 text-xs text-[var(--lv-gray)]">
                  <Icon name="hash" className="h-3.5 w-3.5 text-[var(--lv-red)]" />
                  Store code
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">{store.code}</dd>
              </div>
              <div className="rounded-xl bg-[var(--lv-wash)] p-3">
                <dt className="flex items-center gap-1.5 text-xs text-[var(--lv-gray)]">
                  <Icon name="phone" className="h-3.5 w-3.5 text-[var(--lv-red)]" />
                  Phone no.
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums">
                  <a href={`tel:${store.phone}`} className={`rounded hover:text-[var(--lv-red)] ${focusRing}`}>
                    {store.phone}
                  </a>
                </dd>
              </div>
              <div className="col-span-2 rounded-xl bg-[var(--lv-wash)] p-3">
                <dt className="flex items-center gap-1.5 text-xs text-[var(--lv-gray)]">
                  <Icon name="clock" className="h-3.5 w-3.5 text-[var(--lv-red)]" />
                  Store timing
                </dt>
                <dd className="mt-1 text-sm font-semibold">{store.timing}</dd>
              </div>
            </dl>

            <p className="mt-4 border-t border-dashed border-[var(--lv-line)] pt-3 text-xs text-[var(--lv-gray)]">
              Legal name: <span className="font-semibold text-[var(--lv-black)]">{store.legalName}</span>
            </p>
          </section>

          {/* ---------- Invoice: compact greeting card ---------- */}
          <section aria-label="Invoice" className="rounded-3xl bg-[var(--lv-red)] p-4 text-white">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-medium text-white/90">Tax invoice</p>
                <h1 className={`${display.className} mt-0.5 text-3xl font-semibold leading-none`}>Hello {data.customer.firstName}!</h1>
              </div>
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-white p-1">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrSrc} alt="Receipt QR code" className="h-full w-full object-contain" />
                ) : (
                  <PlaceholderQR seed={data.receiptId} />
                )}
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-dashed border-white/60 pt-3">
              {[
                ["Invoice no", data.invoiceNo],
                ["Date", data.date],
                ["Receipt ID", data.receiptId],
                ["Cashier", data.cashier],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[11px] text-white/90">{k}</dt>
                  <dd className="break-all text-[13px] font-semibold leading-tight tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* ---------- Items + totals: one bill card ---------- */}
          <section aria-label="Items purchased" className="overflow-hidden rounded-2xl border border-[var(--lv-line)]">
            <div className="h-1 bg-[var(--lv-red)]" />
            <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
              <h2 className={`${display.className} text-xl font-semibold`}>Items</h2>
              <p className="text-xs text-[var(--lv-gray)]">Pieces purchased: {data.pieces}</p>
            </div>

            <ul className="divide-y divide-[var(--lv-line)] px-4">
              {data.items.map((item, i) => (
                <ItemRow key={`${item.code}-${i}`} item={item} index={i} open={openItem === i} onToggle={() => setOpenItem(openItem === i ? -1 : i)} />
              ))}
            </ul>

            <div className="border-t border-[var(--lv-line)] px-4 py-3">
              <dl className="space-y-1.5 text-sm tabular-nums">
                <div className="flex items-baseline justify-between">
                  <dt className="text-[var(--lv-gray)]">Sub total</dt>
                  <dd className="font-semibold">{inr(data.subTotal)}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[var(--lv-gray)]">CGST</dt>
                  <dd className="font-semibold">+ {inr(taxTotals.cgst)}</dd>
                </div>
                <div className="flex items-baseline justify-between">
                  <dt className="text-[var(--lv-gray)]">SGST</dt>
                  <dd className="font-semibold">+ {inr(taxTotals.sgst)}</dd>
                </div>
              </dl>
              <button
                type="button"
                onClick={() => setModal("tax")}
                className={`mt-2 rounded-md py-1 text-sm font-semibold text-[var(--lv-red)] underline-offset-4 hover:underline ${focusRing}`}
              >
                View tax calculation
              </button>
            </div>

            <div className="flex items-center justify-between bg-[var(--lv-black)] px-4 py-4 text-white">
              <span className={`${display.className} text-xl font-semibold`}>Net total</span>
              <span className={`${display.className} text-3xl font-bold tabular-nums`}>₹{inr(data.netTotal)}</span>
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

          {/* ---------- Receipt actions ---------- */}
          <section aria-label="Receipt actions" className="grid grid-cols-3 gap-2">
            {(
              [
                { icon: "history", label: "Transaction history", onClick: () => setModal("history") },
                { icon: "mail", label: "Email receipt", onClick: () => setModal("email") },
                { icon: "download", label: "Download PDF", onClick: handleDownload },
              ] as { icon: IconName; label: string; onClick: () => void }[]
            ).map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className={`group flex flex-col items-center gap-2 rounded-2xl border border-[var(--lv-line)] px-2 py-3.5 text-center text-xs font-semibold leading-tight transition-colors hover:border-[var(--lv-red)] hover:text-[var(--lv-red)] motion-reduce:transition-none ${focusRing}`}
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#C41230]/10 text-[var(--lv-red)] transition-colors group-hover:bg-[var(--lv-red)] group-hover:text-white motion-reduce:transition-none">
                  <Icon name={a.icon} className="h-5 w-5" />
                </span>
                {a.label}
              </button>
            ))}
          </section>

          {/* ---------- Feedback + refer ---------- */}
          <FeedbackCard name={data.customer.firstName} points={rewards.feedback} onSubmit={onSubmitFeedback} />

          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onRefer?.()}
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
          </a>

          {/* ---------- RedTab ---------- */}
          <RedTabSection data={data} onUpdateProfile={onUpdateProfile} />

          {/* ---------- Reach out ---------- */}
          <section aria-label="Reach out to us">
            <h2 className={`${display.className} text-xl font-semibold`}>Reach out to us</h2>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <a
                href={`tel:${contact.callTo}`}
                className={`flex items-center justify-center gap-2 rounded-xl border border-[var(--lv-black)] py-3 text-sm font-semibold transition-colors hover:border-[var(--lv-red)] hover:bg-[var(--lv-red)] hover:text-white motion-reduce:transition-none ${focusRing}`}
              >
                <Icon name="phone" className="h-[18px] w-[18px]" />
                Talk to us
              </a>
              <a
                href={`mailto:${contact.writeTo}`}
                className={`flex items-center justify-center gap-2 rounded-xl border border-[var(--lv-black)] py-3 text-sm font-semibold transition-colors hover:border-[var(--lv-red)] hover:bg-[var(--lv-red)] hover:text-white motion-reduce:transition-none ${focusRing}`}
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
                className={`${display.className} flex w-full items-center justify-between py-4 text-xl font-semibold transition-colors motion-reduce:transition-none ${focusRing} ${termsOpen ? "text-[var(--lv-red)]" : ""}`}
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
            {history.map((h) => (
              <li key={h.invoiceNo}>
                <button
                  type="button"
                  disabled={h.current}
                  onClick={() => {
                    closeModal();
                    onSelect(h.invoiceNo);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded py-3 text-left transition-colors motion-reduce:transition-none ${focusRing} ${
                    h.current ? "cursor-default" : "hover:bg-[var(--lv-wash)]"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">Invoice no: {h.invoiceNo}</p>
                    <p className="text-xs text-[var(--lv-gray)]">
                      {h.date}, {h.store}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums">₹{inr(h.amount)}</p>
                      {h.current && <p className="text-xs font-semibold text-[var(--lv-red)]">This receipt</p>}
                    </div>
                    {!h.current && <Icon name="chevron" className="h-4 w-4 -rotate-90 text-[var(--lv-red)]" />}
                  </div>
                </button>
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
              onSendEmail?.(email, data);
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
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-[var(--lv-black)] text-xs text-[var(--lv-gray)]">
                <th className="py-2 text-left font-semibold">Tax</th>
                <th className="py-2 text-right font-semibold">Base amount</th>
                <th className="py-2 text-right font-semibold">Tax amount</th>
              </tr>
            </thead>
            <tbody>
              {data.tax.lines.map((l) => (
                <tr key={`${l.type}-${l.rate}`} className="border-b border-[var(--lv-line)]">
                  <td className="py-2.5 font-semibold">
                    {l.type} @ {l.rate}%
                  </td>
                  <td className="py-2.5 text-right">{inr(l.base)}</td>
                  <td className="py-2.5 text-right">{inr(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3" colSpan={2}>
                  Total tax
                </td>
                <td className="pt-3 text-right">{inr(taxTotals.cgst + taxTotals.sgst)}</td>
              </tr>
            </tfoot>
          </table>

          <dl className="mt-4 space-y-2 rounded-xl bg-[var(--lv-wash)] p-3 text-[13px]">
            {[
              ["Customer GST Registered/Unregistered", data.tax.customerGst],
              ["Place of supply", data.tax.placeOfSupply],
              ["Whether the tax is payable on Reverse Charge Basis", data.tax.reverseCharge],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="text-[var(--lv-gray)]">{k}</dt>
                <dd className="shrink-0 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-4 flex items-baseline justify-between rounded-2xl bg-[var(--lv-black)] px-4 py-3 text-white">
            <span className={`${display.className} text-lg font-semibold`}>Net total</span>
            <span className={`${display.className} text-2xl font-bold`}>₹{inr(data.netTotal)}</span>
          </p>
        </Modal>
      )}
    </div>
  );
}

/* --------------------------------- main ------------------------------------------ */
/** Holds which receipt is open. Each receipt is a keyed ReceiptView, so switching resets the
 *  open item, popups, tabs and forms instead of carrying them over from the previous receipt. */
export default function LevisReceiptV1({ data, receipts, onSelectReceipt, ...rest }: LevisReceiptProps) {
  const list = useMemo(() => {
    const base = receipts ?? (data ? [data] : sampleLevisReceipts);
    const merged = data && !base.some((r) => r.invoiceNo === data.invoiceNo) ? [data, ...base] : base;
    return [...merged].sort((a, b) => dateValue(b.date) - dateValue(a.date));
  }, [data, receipts]);

  const [currentId, setCurrentId] = useState(data?.invoiceNo ?? list[0].invoiceNo);
  const current = list.find((r) => r.invoiceNo === currentId) ?? list[0];

  const history = useMemo(
    () =>
      list.map((r) => ({
        invoiceNo: r.invoiceNo,
        date: r.date.split(" ")[0],
        store: shortStore(r.store.branch),
        amount: r.netTotal,
        current: r.invoiceNo === current.invoiceNo,
      })),
    [list, current.invoiceNo],
  );

  const select = useCallback(
    (invoiceNo: string) => {
      setCurrentId(invoiceNo);
      onSelectReceipt?.(invoiceNo);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [onSelectReceipt],
  );

  return <ReceiptView key={current.invoiceNo} data={current} history={history} onSelect={select} {...rest} />;
}
