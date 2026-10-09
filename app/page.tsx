"use client"
import { useState, useEffect, useRef } from "react"
import type React from "react"

import Image from "next/image"
import { Carousel, CarouselContent, CarouselItem, type CarouselApi } from "@/components/ui/carousel"
import {
  Download,
  ExternalLink,
  FileText,
  History,
  Instagram,
  Mail,
  Facebook,
  Star,
  ShoppingBag,
  Smartphone,
  LifeBuoy,
  Zap,
  CheckCircle2,
  Clock,
  X,
  QrCode,
} from "lucide-react"

// Indian Rupee formatter
const fmt = (n: number) =>
  `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const APP_LINK = "https://onelink.to/bcvnnr"
const GST_RATE = 0.05 // 5% total = 2.5% CGST + 2.5% SGST

// Zigzag torn-paper edge — classic thermal-receipt tear
function ZigzagEdge({ flip = false }: { flip?: boolean }) {
  return (
    <div
      className="h-3 mx-3"
      style={{
        backgroundImage:
          "linear-gradient(-45deg, white 8px, transparent 0), linear-gradient(45deg, white 8px, transparent 0)",
        backgroundRepeat: "repeat-x",
        backgroundSize: "16px 16px",
        backgroundPosition: "left top",
        transform: flip ? "scaleY(-1)" : "none",
      }}
    />
  )
}

// Circular scalloped "PAID" stamp — brand purple
function PaidStamp() {
  return (
    <svg viewBox="0 0 100 100" width="46" height="46" className="shrink-0" style={{ transform: "rotate(-8deg)" }}>
      <defs>
        <path id="stampTopArc" d="M 12,50 A 38,38 0 1,1 88,50" fill="none" />
        <path id="stampBottomArc" d="M 12,52 A 38,38 0 1,0 88,52" fill="none" />
      </defs>
      {/* scalloped outer ring */}
      <circle cx="50" cy="50" r="47" fill="none" stroke="#3D1B78" strokeWidth="2.5" strokeDasharray="3.2 3.2" />
      {/* inner ring */}
      <circle cx="50" cy="50" r="34" fill="none" stroke="#3D1B78" strokeWidth="1.3" />
      {/* curved top text */}
      <text fontSize="6.5" fontWeight="800" fill="#3D1B78" letterSpacing="1">
        <textPath href="#stampTopArc" startOffset="50%" textAnchor="middle">
          THANK YOU
        </textPath>
      </text>
      {/* center PAID */}
      <text x="50" y="56" fontSize="17" fontWeight="900" fill="#3D1B78" textAnchor="middle" fontFamily="Poppins, sans-serif" letterSpacing="1">
        PAID
      </text>
      {/* curved bottom text — reversed arc so it reads right-side up */}
      <text fontSize="6.5" fontWeight="800" fill="#3D1B78" letterSpacing="1">
        <textPath href="#stampBottomArc" startOffset="50%" textAnchor="middle">
          CINÉPOLIS
        </textPath>
      </text>
    </svg>
  )
}

export default function Home() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const [showTerms, setShowTerms] = useState(false)
  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const receiptContainerRef = useRef<HTMLDivElement>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState("")
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [currentOrderId, setCurrentOrderId] = useState("current")

  const [promoApi, setPromoApi] = useState<CarouselApi>()

  useEffect(() => {
    if (!promoApi) return
    const interval = setInterval(() => {
      promoApi.scrollNext()
    }, 4000)
    return () => clearInterval(interval)
  }, [promoApi])

  useEffect(() => {
    if (!promoApi) return
    promoApi.on("select", () => {
      setCurrentSlide(promoApi.selectedScrollSnap())
    })
  }, [promoApi])

  // Simple auto-height for WordPress iframe
  useEffect(() => {
    const postHeight = () => {
      const marker = document.getElementById("height-marker")
      if (marker && window.parent) {
        const rect = marker.getBoundingClientRect()
        const newHeight = Math.ceil(rect.top + rect.height + window.scrollY)
        window.parent.postMessage({ frameHeight: newHeight }, "*")
      }
    }
    postHeight()
    const ro = new ResizeObserver(postHeight)
    ro.observe(document.body)
    window.addEventListener("resize", postHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", postHeight)
    }
  }, [])

  // Only the total order value (tax-inclusive) is source data — CGST/SGST/net are derived below
  const rawOrders = {
    current: {
      bookingId: "2216",
      bookingNo: "WGJHLNZ",
      cinema: "Cinepolis Ireo",
      orderDate: "07-05-2026",
      orderTime: "09:55 PM",
      paymentMethod: "Netbanking",
      items: [
        { name: "CINE SMILES 8PC NEW", qty: 1, price: 290.0 },
        { name: "SODAS 400ML", qty: 1, price: 460.0 },
      ],
      totalOrderValue: 750.0,
      gstin: "06AADCC2076J1ZQ",
      hsn: "9996",
      sac: "9963",
      fssai: "10820005000077",
    },
    hist1: {
      bookingId: "2109",
      bookingNo: "WGJHK21",
      cinema: "Cinepolis Saket, New Delhi",
      orderDate: "16-06-2026",
      orderTime: "07:40 PM",
      paymentMethod: "UPI",
      items: [
        { name: "REGULAR POPCORN COMBO", qty: 1, price: 380.0 },
        { name: "COLD COFFEE 300ML", qty: 2, price: 320.0 },
      ],
      totalOrderValue: 700.0,
      gstin: "07AADCC2076J1ZO",
      hsn: "9996",
      sac: "9963",
      fssai: "10820005000077",
    },
    hist2: {
      bookingId: "1988",
      bookingNo: "WGJH887",
      cinema: "Cinepolis Ireo",
      orderDate: "02-05-2026",
      orderTime: "06:10 PM",
      paymentMethod: "Credit Card",
      items: [
        { name: "NACHOS WITH CHEESE", qty: 1, price: 260.0 },
        { name: "MASALA POPCORN", qty: 1, price: 240.0 },
      ],
      totalOrderValue: 500.0,
      gstin: "06AADCC2076J1ZQ",
      hsn: "9996",
      sac: "9963",
      fssai: "10820005000077",
    },
  }

  // Derive net F&B price + CGST + SGST from the tax-inclusive total
  const withTaxBreakup = (order: (typeof rawOrders)["current"]) => {
    const totalTax = order.totalOrderValue - order.totalOrderValue / (1 + GST_RATE)
    const cgst = totalTax / 2
    const sgst = totalTax / 2
    const fbPrice = order.totalOrderValue - cgst - sgst
    return { ...order, fbPrice, cgst, sgst }
  }

  const orders = {
    current: withTaxBreakup(rawOrders.current),
    hist1: withTaxBreakup(rawOrders.hist1),
    hist2: withTaxBreakup(rawOrders.hist2),
  }

  const currentOrder = orders[currentOrderId]

  const orderHistory = [
    { id: "current", date: orders.current.orderDate, label: `${orders.current.items.length} items`, amount: orders.current.totalOrderValue },
    { id: "hist1", date: orders.hist1.orderDate, label: `${orders.hist1.items.length} items`, amount: orders.hist1.totalOrderValue },
    { id: "hist2", date: orders.hist2.orderDate, label: `${orders.hist2.items.length} items`, amount: orders.hist2.totalOrderValue },
  ]

  const totalItemsCount = currentOrder.items.reduce((sum, item) => sum + item.qty, 0)

  const handleFeedbackSubmit = () => {
    if (!rating) {
      alert("Please select a rating before submitting.")
      return
    }
    setFeedbackSubmitted(true)
    setTimeout(() => setFeedbackSubmitted(false), 5000)
  }

  const handleEmailReceipt = () => {
    window.open(`mailto:?subject=Your Cinépolis F&B Order&body=Booking ID: ${currentOrder.bookingId}`)
  }

  const handleDownloadReceipt = () => {
    const itemRows = currentOrder.items
      .map(
        (item) => `<tr><td>${item.name}</td><td>${item.qty}</td><td>${fmt(item.price)}</td></tr>`
      )
      .join("")

    const receiptContent = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Cinépolis F&B Bill</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box;}
body{font-family:'Poppins',sans-serif;font-size:14px;color:#111;background:#fff;width:800px;margin:0 auto;padding:24px;}
.receipt-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px dashed #7742D8;}
.company-info h1{font-size:30px;color:#3D1B78;font-weight:700;margin-bottom:4px;}
.company-info p{font-size:12px;color:#555;line-height:1.4;}
.bill-info{text-align:right;font-family:'Roboto Mono',monospace;font-size:12px;}
.bill-info div{margin-bottom:4px;}
.bill-id{font-weight:700;color:#3D1B78;}
.order-section{background:#F4EEFD;padding:14px;border-left:4px solid #7742D8;border-radius:0 8px 8px 0;margin-bottom:22px;}
.order-section h3{font-size:16px;color:#3D1B78;font-weight:700;margin-bottom:2px;}
.order-section p{font-size:12px;color:#666;}
.items-table{width:100%;border-collapse:collapse;margin-bottom:24px;font-family:'Roboto Mono',monospace;}
.items-table th{background:#3D1B78;color:#F9B233;padding:10px 8px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;}
.items-table th:last-child, .items-table td:last-child{text-align:right;}
.items-table th:nth-child(2), .items-table td:nth-child(2){text-align:center;}
.items-table td{padding:12px 8px;border-bottom:1px dashed #eee;font-size:12px;vertical-align:top;}
.totals-row td{color:#666;font-size:12px;border-bottom:none;padding:6px 8px;}
.net-total-row td{font-weight:700;color:#3D1B78;font-size:16px;border-top:2px solid #F9B233;padding:12px 8px 4px;}
.footer{text-align:center;margin-top:30px;padding-top:20px;border-top:1px dashed #ccc;font-size:12px;color:#555;}
.footer strong{color:#3D1B78;}
@media print{body{-webkit-print-color-adjust:exact;width:100%;padding:0;}}
</style>
</head>
<body>
<div class="receipt-header">
  <div class="company-info">
    <h1>cinépolis</h1>
    <p><strong>${currentOrder.cinema}</strong><br>F&amp;B Bill</p>
  </div>
  <div class="bill-info">
    <div><strong>Booking ID:</strong> <span class="bill-id">${currentOrder.bookingId}</span></div>
    <div><strong>Booking No.:</strong> ${currentOrder.bookingNo}</div>
    <div><strong>Order Date &amp; Time:</strong> ${currentOrder.orderDate} | ${currentOrder.orderTime}</div>
  </div>
</div>
<div class="order-section">
  <h3>Food &amp; Beverages</h3>
  <p>${currentOrder.items.length} items • Payment: ${currentOrder.paymentMethod}</p>
</div>
<table class="items-table">
  <thead><tr><th>Item Name</th><th>Qty</th><th>Total Price</th></tr></thead>
  <tbody>
    ${itemRows}
    <tr class="totals-row"><td colspan="2">F&amp;B Price</td><td>${fmt(currentOrder.fbPrice)}</td></tr>
    <tr class="totals-row"><td colspan="2">CGST (2.5%)</td><td>${fmt(currentOrder.cgst)}</td></tr>
    <tr class="totals-row"><td colspan="2">SGST (2.5%)</td><td>${fmt(currentOrder.sgst)}</td></tr>
    <tr class="net-total-row"><td colspan="2">Total Order Value</td><td>${fmt(currentOrder.totalOrderValue)}</td></tr>
  </tbody>
</table>
<div class="footer">
  <p><strong>Enjoy your snacks! See you again at Cinépolis.</strong></p>
  <p>GSTIN: ${currentOrder.gstin} | HSN: ${currentOrder.hsn} | SAC: ${currentOrder.sac}</p>
  <p>FSSAI: ${currentOrder.fssai}</p>
  <p style="margin-top:8px;">Powered by SmartBill</p>
</div>
</body>
</html>
  `
    const blob = new Blob([receiptContent], { type: "text/html" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `Cinepolis_FnB_Bill_${currentOrder.bookingId}.html`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleDownloadApp = () => window.open(APP_LINK, "_blank")
  const handleNeedHelp = () => window.open("https://wa.me/+919620921294", "_blank")
  const handleEmail = () => window.open("mailto:sagar.p@proenx.com", "_blank")
  const handleSocialLink = (url: string) => window.open(url, "_blank")

  return (
    <div className="min-h-screen bg-[#F6F2FB] flex justify-center">
      <div
        id="receipt-root"
        ref={receiptContainerRef}
        className="w-full max-w-md mx-auto bg-transparent relative overflow-hidden font-poppins"
      >
        <div className="flex flex-col w-full gap-3 pb-4 pt-4">

          {/* Header — straight bottom edge, same width as other cards */}
          <div className="mx-3 bg-gradient-to-br from-[#3D1B78] via-[#5B2A9E] to-[#7742D8] px-5 pt-7 pb-7 text-center text-white rounded-2xl">
            <img
              src="/images/design-mode/cinepolis.png"
              alt="Cinépolis"
              className="h-8 w-auto mx-auto mb-2 brightness-0 invert"
            />
            <div className="inline-flex items-center gap-1.5 bg-white/15 rounded-full px-3 py-1">
              <ShoppingBag className="h-3 w-3 text-[#F9B233]" />
              <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#F9B233]">Snack Bar Order</span>
            </div>
            <div className="text-sm font-medium opacity-90 mt-1.5">{currentOrder.cinema}</div>
          </div>

          {/* Receipt paper block — zigzag torn edges, monospace ticket styling */}
          <div className="mx-3 relative z-10">
            <ZigzagEdge />
            <div className="bg-white px-5 pt-5 pb-2 shadow-md">

              {/* Small classic QR + booking meta, side by side */}
              <div className="flex items-start gap-4 mb-4">
                <div className="shrink-0 text-center">
                  <div className="p-1.5 border border-[#F9B233] rounded-lg inline-block">
                    <Image
                      src="/images/design-mode/800px-QR_code_for_mobile_English_Wikipedia.svg.png"
                      alt="QR Code"
                      width={72}
                      height={72}
                    />
                  </div>
                  <div className="text-[8px] font-bold tracking-wider uppercase text-[#7742D8] mt-1">Scan to Enter</div>
                </div>
                <div className="font-mono text-xs space-y-1.5 text-[#4A3D63] pt-1">
                  <div className="flex gap-2"><span className="text-gray-400 w-20">Booking ID</span><span className="font-semibold">{currentOrder.bookingId}</span></div>
                  <div className="flex gap-2"><span className="text-gray-400 w-20">Booking No.</span><span className="font-semibold">{currentOrder.bookingNo}</span></div>
                  <div className="flex gap-2"><span className="text-gray-400 w-20">Date</span><span className="font-semibold">{currentOrder.orderDate}</span></div>
                  <div className="flex gap-2"><span className="text-gray-400 w-20">Time</span><span className="font-semibold">{currentOrder.orderTime}</span></div>
                </div>
              </div>

              <div className="h-px bg-[repeating-linear-gradient(90deg,#DCC7F5_0px,#DCC7F5_4px,transparent_4px,transparent_8px)] mb-4" />

              {/* Items — dot leader style */}
              <div className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#7742D8] mb-3">Items Ordered</div>
              <div className="space-y-2.5 mb-4">
                {currentOrder.items.map((item, idx) => (
                  <div key={idx}>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{item.name}</span>
                      <span className="flex-1 border-b border-dotted border-gray-300 translate-y-[-3px]" />
                      <span className="text-xs font-mono font-bold text-gray-900 whitespace-nowrap">{fmt(item.price)}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 font-mono">Qty x{item.qty}</div>
                  </div>
                ))}
              </div>

              <div className="h-px bg-[repeating-linear-gradient(90deg,#DCC7F5_0px,#DCC7F5_4px,transparent_4px,transparent_8px)] mb-4" />

              {/* Totals — labels left, amounts right, one consistent column */}
              <div className="font-mono text-xs space-y-1.5 mb-3">
                <div className="flex justify-between text-gray-500"><span>F&amp;B Price</span><span>{fmt(currentOrder.fbPrice)}</span></div>
                <div className="flex justify-between text-gray-500"><span>CGST (2.5%)</span><span>{fmt(currentOrder.cgst)}</span></div>
                <div className="flex justify-between text-gray-500 pb-1.5 border-b border-dashed border-gray-300"><span>SGST (2.5%)</span><span>{fmt(currentOrder.sgst)}</span></div>
              </div>

              {/* Total paid — label left, stamp directly beside amount on the right */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-sm font-bold text-gray-900">TOTAL PAID</span>
                <div className="flex items-center gap-2">
                  <PaidStamp />
                  <span className="text-lg font-bold text-[#3D1B78]">{fmt(currentOrder.totalOrderValue)}</span>
                </div>
              </div>
            </div>
            <ZigzagEdge flip />
          </div>

          {/* Pickup instructions — straight, not rotated */}
          <div className="mx-3 flex justify-center py-1">
            <div className="inline-flex items-center gap-2 bg-[#F4EEFD] border-2 border-dashed border-[#7742D8] rounded-lg px-4 py-2">
              <Clock className="h-4 w-4 text-[#3D1B78] shrink-0" />
              <p className="text-[11px] text-[#3D1B78] font-semibold leading-relaxed text-left">
                Check in via the app on arrival — we'll start preparing your order.
              </p>
            </div>
          </div>

          {/* Promo Banners — 1600x485 aspect ratio */}
          <div className="mx-3 relative rounded-xl overflow-hidden border border-gray-200 shadow-md">
            <Carousel className="w-full" setApi={setPromoApi} opts={{ loop: true }}>
              <CarouselContent>
                <CarouselItem>
                  <div className="relative w-full aspect-[1600/485] bg-[#F4EEFD]">
                    <a href="https://www.instagram.com/cinepolisindia/?hl=en" target="_blank" rel="noopener noreferrer" className="absolute inset-0">
                      <Image src="/images/design-mode/cinepolis-food-banner-1.png" alt="Now at Cinépolis Snack Bar" fill className="object-cover" priority />
                    </a>
                  </div>
                </CarouselItem>
                <CarouselItem>
                  <div className="relative w-full aspect-[1600/485] bg-[#F4EEFD]">
                    <a href="https://www.instagram.com/cinepolisindia/?hl=en" target="_blank" rel="noopener noreferrer" className="absolute inset-0">
                      <Image src="/images/design-mode/cinepolis-gift-card-banner-2.png" alt="Cinépolis Gift Cards" fill className="object-cover" />
                    </a>
                  </div>
                </CarouselItem>
              </CarouselContent>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
                {[0, 1].map((index) => (
                  <button key={index} onClick={() => promoApi?.scrollTo(index)}
                    className={`h-1.5 rounded-full transition-all duration-300 ${currentSlide === index ? "w-5 bg-[#F9B233]" : "w-1.5 bg-white/70"}`} />
                ))}
              </div>
            </Carousel>
          </div>

          {/* Rate Experience */}
          <div className="mx-3 bg-white rounded-xl border border-gray-200 shadow-md p-4">
            {feedbackSubmitted ? (
              <div className="text-center py-6 bg-green-50 rounded-xl border border-green-100">
                <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-sm font-semibold text-gray-900 mb-1">Thanks for your feedback!</div>
                <div className="text-xs text-gray-500">Your input helps us improve every Cinépolis order.</div>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-base font-semibold text-gray-900 text-center">How was your order?</h3>

                <div className="flex justify-center gap-3 py-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      onClick={() => {
                        setRating(star)
                        setSelectedTags([])
                      }}
                      className="transition-transform active:scale-90"
                    >
                      <Star className={`h-8 w-8 transition-colors ${star <= rating ? "fill-[#F9B233] text-[#F9B233]" : "text-gray-300"}`} />
                    </button>
                  ))}
                </div>

                {rating > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide text-center">Tell us more</div>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {(rating >= 4
                        ? ["Fresh & tasty", "Quick pickup", "Good portion size", "Friendly staff"]
                        : ["Order was cold", "Long wait time", "Wrong item", "Staff behaviour"]
                      ).map((item) => (
                        <button key={item}
                          onClick={() => setSelectedTags((prev) => prev.includes(item) ? prev.filter((tag) => tag !== item) : [...prev, item])}
                          className={`text-[11px] px-3 py-1.5 rounded-full border transition ${selectedTags.includes(item) ? "bg-[#3D1B78] text-white border-[#3D1B78]" : "border-gray-200 bg-gray-50"}`}>
                          {item}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <textarea rows={2} placeholder="Additional feedback (optional)"
                  className="w-full p-3 text-xs border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#7742D8] focus:border-[#7742D8] outline-none resize-none"
                  value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} />

                <button className="w-full bg-[#F9B233] hover:bg-[#e8a422] text-black h-10 text-xs font-semibold rounded-xl transition active:scale-[0.98]"
                  onClick={handleFeedbackSubmit} disabled={!rating}>
                  Submit Feedback
                </button>
              </div>
            )}
          </div>

          {/* Download App CTA */}
          <div className="mx-3 bg-gradient-to-br from-[#3D1B78] via-[#5B2A9E] to-[#7742D8] rounded-xl shadow-md p-5 text-white">
            <div className="flex items-center">
              <div className="bg-white/15 p-3 rounded-xl mr-4">
                <Smartphone className="h-6 w-6 text-[#F9B233]" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Get the Cinépolis App</div>
                <div className="text-[11px] opacity-80">Pre-order snacks & skip the counter queue</div>
              </div>
            </div>
            <button onClick={handleDownloadApp}
              className="w-full mt-4 bg-[#F9B233] hover:bg-[#e8a422] text-black h-10 text-xs font-bold rounded-xl transition active:scale-[0.98] flex items-center justify-center gap-2">
              <Download className="h-4 w-4" />
              Download App
            </button>
          </div>

          {/* Quick Actions — segmented tab bar */}
          <div className="mx-3 bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden">
            <div className="grid grid-cols-3">
              <button onClick={() => setShowOrderHistory(true)}
                className="flex flex-col items-center justify-center py-3.5 border-b-2 border-[#3D1B78] active:bg-gray-50">
                <History className="h-5 w-5 text-[#3D1B78] mb-1" />
                <span className="text-[11px] font-medium text-gray-700">Orders</span>
              </button>
              <button onClick={handleEmailReceipt}
                className="flex flex-col items-center justify-center py-3.5 border-b-2 border-transparent border-l border-r border-gray-100 active:bg-gray-50">
                <Mail className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-[11px] font-medium text-gray-700">Email</span>
              </button>
              <button onClick={handleDownloadReceipt}
                className="flex flex-col items-center justify-center py-3.5 border-b-2 border-transparent active:bg-gray-50">
                <FileText className="h-5 w-5 text-gray-400 mb-1" />
                <span className="text-[11px] font-medium text-gray-700">Bill</span>
              </button>
            </div>
          </div>

          {/* Help row — Terms & Not your bill */}
          <div className="mx-3 grid grid-cols-2 gap-3">
            <button onClick={() => setShowTerms(!showTerms)}
              className="bg-white border border-gray-200 rounded-full py-2.5 text-xs font-semibold text-gray-700 shadow-sm active:scale-[0.98]">
              Terms & Conditions
            </button>
            <button onClick={handleNeedHelp}
              className="bg-white border border-gray-200 rounded-full py-2.5 text-xs font-semibold text-gray-700 shadow-sm active:scale-[0.98] flex items-center justify-center gap-1.5">
              <LifeBuoy className="h-3.5 w-3.5" />
              Not your bill?
            </button>
          </div>

          {showTerms && (
            <div className="mx-3 bg-white rounded-xl border border-gray-200 shadow-md p-4 text-[11px] text-gray-500 space-y-1 font-medium">
              <p>• F&B orders once placed cannot be exchanged or refunded, subject to cinema policy.</p>
              <p>• Please collect your order at the counter within the show interval.</p>
              <p>• Pickup is permitted only against a valid QR code / order ID.</p>
              <p>• For support visit www.cinepolisindia.com.</p>
            </div>
          )}

          {/* GST / HSN / SAC / FSSAI */}
          <div className="mx-3 text-center text-[10px] text-gray-400 leading-relaxed font-mono">
            GSTIN: {currentOrder.gstin}<br />
            HSN: {currentOrder.hsn} &nbsp;|&nbsp; SAC: {currentOrder.sac}<br />
            FSSAI: {currentOrder.fssai}
          </div>

          {/* Stay Connected */}
          <div className="flex justify-center gap-6 mx-3">
            <button onClick={() => handleSocialLink("https://www.instagram.com/cinepolisindia/?hl=en")} className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 flex items-center justify-center mb-1">
                <Instagram className="h-4 w-4 text-white" />
              </div>
              <span className="text-[10px] font-medium text-gray-600">Instagram</span>
            </button>
            <button onClick={() => handleSocialLink("https://www.facebook.com/CinepolisIndia")} className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-[#1877F2] flex items-center justify-center mb-1">
                <Facebook className="h-4 w-4 text-white" />
              </div>
              <span className="text-[10px] font-medium text-gray-600">Facebook</span>
            </button>
            <button onClick={() => handleSocialLink("https://www.cinepolisindia.com")} className="flex flex-col items-center">
              <div className="w-9 h-9 rounded-full bg-[#3D1B78] flex items-center justify-center mb-1">
                <ExternalLink className="h-4 w-4 text-[#F9B233]" />
              </div>
              <span className="text-[10px] font-medium text-gray-600">Website</span>
            </button>
          </div>

          {/* Powered By footer */}
          <div className="flex items-center justify-center gap-1.5 py-2 text-gray-400">
            <Zap className="h-3 w-3 fill-gray-300" />
            <span className="text-[10px] font-medium">Digital billing powered by <span className="font-bold text-gray-500">SmartBill</span></span>
          </div>

          <div id="height-marker" style={{ height: "1px" }} />
        </div>

        {/* Order History Modal */}
        {showOrderHistory && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowOrderHistory(false)} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm mx-4 shadow-2xl border border-gray-200 overflow-hidden">
              <div className="flex justify-between items-center p-4 border-b border-gray-100">
                <div className="flex items-center">
                  <div className="bg-[#3D1B78] p-2 rounded-lg mr-3">
                    <History className="h-4 w-4 text-[#F9B233]" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Order History</h3>
                </div>
                <button className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100" onClick={() => setShowOrderHistory(false)}>
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto p-4 space-y-3">
                {orderHistory.map((order) => (
                  <button
                    key={order.id}
                    onClick={() => {
                      setCurrentOrderId(order.id)
                      setShowOrderHistory(false)
                      window.scrollTo({ top: 0, behavior: "smooth" })
                    }}
                    className="w-full flex items-center p-3 bg-gray-50 border border-gray-200 rounded-xl hover:border-[#7742D8] transition"
                  >
                    <div className="bg-white border border-gray-200 p-2 rounded-lg mr-3">
                      <ShoppingBag className="h-4 w-4 text-[#3D1B78]" />
                    </div>
                    <div className="flex-grow text-left">
                      <div className="text-sm font-semibold text-gray-900 line-clamp-1">{order.label}</div>
                      <div className="text-[11px] text-gray-500">{order.date}</div>
                    </div>
                    <div className="text-sm font-semibold text-[#3D1B78]">{fmt(order.amount)}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
