import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Users, X, Search, Trash2, Printer, MessageCircle, Pencil, FileText, LayoutDashboard, Receipt, ClipboardList, ShoppingCart, Truck, Package, Factory, Calculator, Download, ShieldCheck, ChevronLeft, Activity, Lightbulb, Clock, MapPin, Mail, ScanLine, Sun, Moon, Monitor } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { storage } from "./storage";
import { useAuth, LoginScreen } from "./AuthContext";
import * as XLSX from "xlsx";

const PARTNERS = ["Pritam", "Ashish", "Kapil"];

function defaultOwnership() {
  const base = Math.floor((100 / PARTNERS.length) * 100) / 100;
  const result = {};
  let assigned = 0;
  PARTNERS.forEach((p, i) => {
    if (i === PARTNERS.length - 1) {
      result[p] = Math.round((100 - assigned) * 100) / 100;
    } else {
      result[p] = base;
      assigned += base;
    }
  });
  return result;
}

const PAYMENT_METHODS = ["cash", "bank", "esewa"];
const METHOD_LABELS = { cash: "Cash", bank: "Bank", esewa: "eSewa" };

const EXPENSE_CATEGORIES = [
  "Raw Materials (Potatoes/Oil)",
  "Seasoning (Cheese/Onion Powder)",
  "Packaging",
  "Machinery & Equipment",
  "Licensing & Registration",
  "Marketing",
  "Utilities",
  "Labor & Wages",
  "Rent",
  "Sales Return / Refund",
  "Other",
];

const INCOME_CATEGORIES = ["Sales Revenue", "Partner Capital Contribution", "Other Income"];

const TRASH_RETENTION_DAYS = 15;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

function isDeleted(entry) {
  return !!(entry && entry.deletedAt);
}

function notDeleted(entry) {
  return !isDeleted(entry);
}

function stampCreate(entry, actor) {
  const ts = nowISO();
  return { ...entry, createdBy: actor, createdAt: ts, updatedBy: actor, updatedAt: ts, deletedAt: null, deletedBy: null };
}

function stampUpdate(entry, actor) {
  return { ...entry, updatedBy: actor, updatedAt: nowISO() };
}

function stampDelete(entry, actor) {
  return { ...entry, deletedAt: nowISO(), deletedBy: actor };
}

function stampRestore(entry) {
  return { ...entry, deletedAt: null, deletedBy: null };
}

function daysRemaining(deletedAt) {
  if (!deletedAt) return null;
  const deletedTime = new Date(deletedAt).getTime();
  const purgeTime = deletedTime + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const msLeft = purgeTime - Date.now();
  return Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
}

function purgeExpired(list) {
  const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return list.filter((item) => !item.deletedAt || new Date(item.deletedAt).getTime() > cutoff);
}

function buildCodeMap(list, prefix) {
  const sorted = [...list].sort((a, b) => {
    const byDate = (a.createdAt || "").localeCompare(b.createdAt || "");
    if (byDate !== 0) return byDate;
    return (a.id || "").localeCompare(b.id || "");
  });
  const map = {};
  sorted.forEach((item, i) => {
    map[item.id] = `${prefix}-${String(i + 1).padStart(4, "0")}`;
  });
  return map;
}

// Type the code, the product resolves automatically — the whole point being
// that a code is unambiguous where a name isn't (two similar 50g bags of
// chips can look identical in a list; RM-0012 and FG-0003 never collide).
// The dropdown stays alongside it as a fallback for browsing when you don't
// have the code memorized, and both stay in sync with each other.
// Uses the browser's own built-in barcode reader (BarcodeDetector), not a
// hand-rolled decoder — this is the one piece of the barcode feature with
// zero correctness risk, since it's the browser reading a real, standard
// barcode rather than us decoding one ourselves. Available on Chrome/Edge/
// Android browsers; gracefully hidden everywhere else, since typing the
// code (already built) always works as the fallback.
// Renders a real, scannable Code 128 barcode via JsBarcode — a real,
// widely-used library, loaded on demand, rather than a hand-rolled
// encoder. A barcode's bar-width table is precise reference data; getting
// even one entry wrong from memory would produce something that looks
// right but silently fails to scan, with no way to catch that from here.
// A proper library removes that risk entirely. If it can't load (offline,
// or a restricted preview context), the code still displays clearly as
// text — every code-entry field in this app already accepts typed codes,
// so nothing stops working either way.
let jsBarcodeLoadPromise = null;
function loadJsBarcode() {
  if (window.JsBarcode) return Promise.resolve(window.JsBarcode);
  if (jsBarcodeLoadPromise) return jsBarcodeLoadPromise;
  jsBarcodeLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js";
    script.onload = () => resolve(window.JsBarcode);
    script.onerror = () => reject(new Error("JsBarcode failed to load"));
    document.head.appendChild(script);
  });
  return jsBarcodeLoadPromise;
}

function BarcodeLabel({ code, itemName }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!code) return;
    loadJsBarcode()
      .then((JsBarcode) => {
        if (cancelled || !canvasRef.current) return;
        JsBarcode(canvasRef.current, code, { format: "CODE128", width: 2, height: 60, fontSize: 14, margin: 8 });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (!code) return null;

  return (
    <div style={{ textAlign: "center", padding: "12px 0" }}>
      {!failed ? (
        <canvas ref={canvasRef} style={{ display: ready ? "inline-block" : "none", maxWidth: "100%" }} />
      ) : (
        <div style={{ padding: "16px 0" }}>
          <p className="mono-num" style={{ fontSize: "1.4rem", fontWeight: 700, letterSpacing: "0.1em" }}>{code}</p>
          <p style={{ fontSize: "0.7rem", opacity: 0.55 }}>Barcode image unavailable offline — the code above still works everywhere it's typed.</p>
        </div>
      )}
      {itemName && ready && !failed && <p style={{ fontSize: "0.78rem", marginTop: 2 }}>{itemName}</p>}
    </div>
  );
}

function BarcodeScannerModal({ onDetect, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState("");
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    let stream = null;
    let stop = false;
    let rafId = null;

    async function start() {
      if (!("BarcodeDetector" in window)) {
        setError("Camera scanning isn't supported in this browser — type the code instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stop) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const detector = new window.BarcodeDetector({ formats: ["code_128", "code_39", "ean_13", "qr_code"] });
        const tick = async () => {
          if (stop || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              onDetect(codes[0].rawValue);
              return;
            }
          } catch {
            // transient decode errors are normal mid-scan; keep trying
          }
          rafId = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) {
        setError("Couldn't access the camera — check permissions, or type the code instead.");
      }
    }
    start();

    return () => {
      stop = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      style={{ background: "rgba(var(--ink-rgb),0.8)", zIndex: 70 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className={closing ? "modal-panel-out" : "modal-panel"} style={{ background: "var(--ink-surface)", width: "100%", maxWidth: 420, padding: 16, borderRadius: 8 }}>
        <div className="flex justify-between items-center mb-3">
          <span style={{ color: "var(--on-dark)", fontSize: "0.85rem", fontWeight: 600 }}>Scan barcode</span>
          <button onClick={requestClose} style={{ color: "var(--on-dark)" }}>
            <X size={18} />
          </button>
        </div>
        {error ? (
          <p style={{ color: "var(--on-dark)", fontSize: "0.85rem", padding: "20px 0", textAlign: "center" }}>{error}</p>
        ) : (
          <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 6, background: "#000" }} />
        )}
        <p style={{ color: "var(--on-dark)", opacity: 0.7, fontSize: "0.72rem", marginTop: 8, textAlign: "center" }}>
          Point the camera at a printed item barcode.
        </p>
      </div>
    </div>
  );
}

// A normal dropdown that can grow itself: picking "+ Add new category"
// swaps in a small text field, and whatever's typed there gets added to
// the shared list (so it shows up in every other form using this same
// component too) and selected immediately — no separate settings screen
// needed to expand what "kind of expense" means.
function ExpenseCategorySelect({ categories, value, onChange, onAddCategory }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  function confirmAdd() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onAddCategory(trimmed);
    onChange(trimmed);
    setNewName("");
    setAdding(false);
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirmAdd()}
          placeholder="New category name"
          style={{ ...inputStyle, marginBottom: 0 }}
          autoFocus
        />
        <button onClick={confirmAdd} style={{ background: "var(--btn-forest)", color: "#fff", padding: "0 12px", flexShrink: 0 }}>
          Add
        </button>
        <button
          onClick={() => {
            setAdding(false);
            setNewName("");
          }}
          style={{ opacity: 0.5, flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => (e.target.value === "__add_new__" ? setAdding(true) : onChange(e.target.value))}
      style={inputStyle}
    >
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__add_new__">+ Add new category…</option>
    </select>
  );
}

function ItemCodeInput({ stockItems, stockItemCodes, categoryFilter, value, onChange, stockFIFO, placeholder }) {
  const items = categoryFilter ? stockItems.filter((i) => i.category === categoryFilter) : stockItems;
  const [codeText, setCodeText] = useState(() => (value ? stockItemCodes[value] || "" : ""));
  const [scanning, setScanning] = useState(false);
  const selected = stockItems.find((i) => i.id === value);
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;

  useEffect(() => {
    setCodeText(value ? stockItemCodes[value] || "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function handleCodeChange(raw) {
    const text = raw.toUpperCase();
    setCodeText(text);
    const trimmed = text.trim();
    if (!trimmed) {
      onChange("");
      return;
    }
    const match = items.find((i) => (stockItemCodes[i.id] || "").toUpperCase() === trimmed);
    if (match) onChange(match.id);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={codeText}
          onChange={(e) => handleCodeChange(e.target.value)}
          placeholder={placeholder || "e.g. FG-0001"}
          style={{ ...inputStyle, marginBottom: 0, fontFamily: "'Courier New', monospace", width: 130, flexShrink: 0 }}
        />
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={{ ...inputStyle, marginBottom: 0, flex: 1 }}>
          <option value="">Or choose by name…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
              {stockFIFO ? ` (${stockFIFO[i.id]?.currentQty || 0} ${i.unit})` : ""}
            </option>
          ))}
        </select>
        {canScan && (
          <button
            onClick={() => setScanning(true)}
            title="Scan a barcode"
            style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "0 10px", flexShrink: 0 }}
          >
            <ScanLine size={16} />
          </button>
        )}
      </div>
      {selected ? (
        <p style={{ fontSize: "0.76rem", color: "var(--accent-forest)", marginTop: 4, fontWeight: 600 }}>
          ✓ {selected.name} ({selected.unit})
        </p>
      ) : (
        codeText.trim() && (
          <p style={{ fontSize: "0.76rem", color: "var(--accent-red)", marginTop: 4 }}>No item matches that code.</p>
        )
      )}
      {scanning && (
        <BarcodeScannerModal
          onDetect={(raw) => {
            setScanning(false);
            handleCodeChange(raw);
          }}
          onClose={() => setScanning(false)}
        />
      )}
    </div>
  );
}

function formatNPR(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const parts = abs.toFixed(0).split("");
  // Nepali/Indian style comma grouping (lakh system) - simple approximation
  let str = abs.toFixed(0);
  let lastThree = str.substring(str.length - 3);
  let other = str.substring(0, str.length - 3);
  if (other !== "") lastThree = "," + lastThree;
  const formatted = other.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return `Rs. ${sign}${formatted}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Bikram Sambat (Nepali calendar) conversion — display only. Every date in
// this app is stored and computed in Gregorian ISO internally (FIFO,
// aging, expiry, sorting — all of it); BS is only ever derived for
// showing alongside the Gregorian date, never used as a source of truth.
//
// Unlike Gregorian, BS month lengths are fixed year-by-year by Nepal's
// official calendar, not by a formula — so this is a lookup table, not
// math. The table below was cross-checked against multiple independent
// sources (samarthak.com.np for BS 2078-2081, merokalam.com for BS
// 2082-2083) and verified against several known reference conversions
// before use. It covers BS 2078-2083 (AD 2021-04-14 through 2027-04-13).
// Outside that window, adToBs returns null and callers should just show
// the Gregorian date — if you need it extended, the same verification
// approach (cross-referencing multiple calendar sources) can cover more
// years on request.
const BS_CALENDAR_DATA = {
  2078: { start: "2021-04-14", months: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30] },
  2079: { start: "2022-04-14", months: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30] },
  2080: { start: "2023-04-14", months: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30] },
  2081: { start: "2024-04-13", months: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 30, 30] },
  2082: { start: "2025-04-14", months: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30] },
  2083: { start: "2026-04-14", months: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30] },
};
const BS_MONTH_NAMES = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];

function adToBs(adDateStr) {
  if (!adDateStr) return null;
  const target = new Date(adDateStr + "T00:00:00Z");
  const years = Object.keys(BS_CALENDAR_DATA).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < years.length; i++) {
    const y = years[i];
    const start = new Date(BS_CALENDAR_DATA[y].start + "T00:00:00Z");
    const nextY = years[i + 1];
    const end = nextY ? new Date(BS_CALENDAR_DATA[nextY].start + "T00:00:00Z") : null;
    if (target >= start && (!end || target < end)) {
      let daysPassed = Math.round((target - start) / 86400000);
      const months = BS_CALENDAR_DATA[y].months;
      for (let m = 0; m < 12; m++) {
        if (daysPassed < months[m]) return { year: y, month: m + 1, day: daysPassed + 1 };
        daysPassed -= months[m];
      }
    }
  }
  return null;
}

function formatBS(adDateStr, opts = {}) {
  const bs = adToBs(adDateStr);
  if (!bs) return null;
  const monthName = BS_MONTH_NAMES[bs.month - 1];
  return opts.short ? `${bs.day} ${monthName.slice(0, 3)} ${bs.year}` : `${bs.day} ${monthName} ${bs.year}`;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getFirstName(label) {
  if (!label) return "there";
  const beforeAt = label.split("@")[0];
  const firstPart = beforeAt.split(/[\s._-]+/)[0] || "";
  const lettersOnly = firstPart.replace(/[0-9]+$/, "");
  if (!lettersOnly) return "there";
  return lettersOnly.charAt(0).toUpperCase() + lettersOnly.slice(1).toLowerCase();
}

function useCountUp(target) {
  const [display, setDisplay] = useState(target);
  const prevRef = useRef(target);

  useEffect(() => {
    const from = prevRef.current;
    const to = Number(target) || 0;
    if (from === to) return;
    if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(to);
      prevRef.current = to;
      return;
    }
    const duration = 550;
    const start = performance.now();
    let raf;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
        setDisplay(to);
      }
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return display;
}

function computeFIFOForItem(itemId, txList) {
  const txForItem = txList
    .filter((t) => t.itemId === itemId)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  const batches = [];
  txForItem.forEach((t) => {
    if (t.type === "in") {
      batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0, date: t.date });
    } else {
      let toConsume = Number(t.quantity);
      while (toConsume > 0 && batches.length > 0) {
        const b = batches[0];
        const consumed = Math.min(b.qty, toConsume);
        b.qty -= consumed;
        toConsume -= consumed;
        if (b.qty <= 0.0000001) batches.shift();
      }
    }
  });
  return batches;
}

// Builds a proper accrual-basis Income Statement for a date range (either
// bound can be null for open-ended). Revenue is recognized at the full sale
// value (cash + credit) at time of sale — not just the cash portion — with
// Cost of Goods Sold computed by replaying the full FIFO history of finished
// goods so the cost matches the specific units actually sold in this range.
// This is what keeps the Income Statement and Balance Sheet consistent with
// each other (every asset/liability movement has a matching revenue/expense
// entry, or none at all when it's just an asset swap like a purchase).
function yearsBetweenDates(d1, d2) {
  return Math.max(0, (new Date(d2).getTime() - new Date(d1).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

// Straight-line depreciation (or appreciation, if ratePercent is negative) on
// the original cost. Depreciation is floored at 0 book value; appreciation is
// left open-ended since there's no natural ceiling.
function computeFixedAssetBookValue(asset, asOfDate) {
  if (asset.purchaseDate > asOfDate) return { bookValue: Number(asset.cost) || 0, accumulated: 0 };
  const years = yearsBetweenDates(asset.purchaseDate, asOfDate);
  const cost = Number(asset.cost) || 0;
  const rate = Number(asset.ratePercent) || 0;
  let accumulated = cost * (rate / 100) * years;
  if (rate > 0) accumulated = Math.min(accumulated, cost);
  return { bookValue: cost - accumulated, accumulated };
}

// Depreciation/appreciation expense recognized specifically within a date
// range — used so the Income Statement only counts the portion of an
// asset's life that falls inside the period being reported on.
function computeFixedAssetPeriodExpense(asset, startDate, endDate) {
  if (asset.purchaseDate > endDate) return 0;
  const effectiveStart = !startDate || asset.purchaseDate > startDate ? asset.purchaseDate : startDate;
  if (effectiveStart > endDate) return 0;
  const cost = Number(asset.cost) || 0;
  const rate = Number(asset.ratePercent) || 0;
  const years = yearsBetweenDates(effectiveStart, endDate);
  let expense = cost * (rate / 100) * years;
  if (rate > 0) {
    const priorAccumulated = computeFixedAssetBookValue(asset, effectiveStart).accumulated;
    expense = Math.min(expense, Math.max(0, cost - priorAccumulated));
  }
  return expense;
}

function daysBetween(d1, d2) {
  return Math.round((new Date(d2).getTime() - new Date(d1).getTime()) / (24 * 60 * 60 * 1000));
}

// Allocates payments against the oldest outstanding charges first (same
// FIFO principle as stock costing), so aging reflects how long the actual
// unpaid charges have been sitting — not just an even split of the balance.
function computeAgingBuckets(entries, asOfDate) {
  const sorted = [...entries].sort((a, b) => (a.date === b.date ? (a.id || "").localeCompare(b.id || "") : a.date.localeCompare(b.date)));
  const openCharges = [];
  sorted.forEach((e) => {
    if (e.date > asOfDate) return;
    if (e.type === "charge") {
      openCharges.push({ date: e.date, remaining: Number(e.amount) });
    } else {
      let toApply = Number(e.amount);
      while (toApply > 0 && openCharges.length > 0) {
        const oldest = openCharges[0];
        const consumed = Math.min(oldest.remaining, toApply);
        oldest.remaining -= consumed;
        toApply -= consumed;
        if (oldest.remaining <= 0.005) openCharges.shift();
      }
    }
  });

  const buckets = { current: 0, d31: 0, d61: 0, d90: 0 };
  openCharges.forEach((c) => {
    if (c.remaining <= 0.005) return;
    const age = daysBetween(c.date, asOfDate);
    if (age <= 30) buckets.current += c.remaining;
    else if (age <= 60) buckets.d31 += c.remaining;
    else if (age <= 90) buckets.d61 += c.remaining;
    else buckets.d90 += c.remaining;
  });
  return buckets;
}

// Builds a date -> COGS-that-day map in a single pass through stock history,
// rather than replaying the full FIFO ledger once per day (which is what
// calling computeIncomeStatement in a loop over 14+ days would mean). Used
// wherever we need a day-by-day accrual profit series, like the dashboard
// chart, without the repeated-replay cost.
function computeDailyCOGSMap(stockItems, stockTx) {
  const map = {};
  const add = (date, amount) => {
    map[date] = (map[date] || 0) + amount;
  };
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");
  finishedGoods.forEach((item) => {
    const txForItem = stockTx
      .filter((t) => t.itemId === item.id)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    const batches = [];
    txForItem.forEach((t) => {
      if (t.type === "in") {
        batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0 });
        if (t.returnId) add(t.date, -Number(t.quantity) * (Number(t.unitCost) || 0));
      } else {
        let toConsume = Number(t.quantity);
        let costConsumed = 0;
        while (toConsume > 0 && batches.length > 0) {
          const b = batches[0];
          const consumed = Math.min(b.qty, toConsume);
          costConsumed += consumed * b.unitCost;
          b.qty -= consumed;
          toConsume -= consumed;
          if (b.qty <= 0.0000001) batches.shift();
        }
        if (t.saleId) add(t.date, costConsumed);
      }
    });
  });
  return map;
}

// Same FIFO replay as computeDailyCOGSMap, but keyed by the sale (or return)
// that consumed the stock rather than by date — so cost can be attributed to
// whoever bought it. Returns positive cost for sales and negative for
// returns (stock coming back in), so callers can just subtract the value.
// Note this is material cost only: labour and overhead are period expenses
// now, so per-customer figures are gross contribution, not net profit.
function computeSaleCOGSMap(stockItems, stockTx) {
  const map = {};
  const add = (id, amount) => {
    if (!id) return;
    map[id] = (map[id] || 0) + amount;
  };
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");
  finishedGoods.forEach((item) => {
    const txForItem = stockTx
      .filter((t) => t.itemId === item.id)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    const batches = [];
    txForItem.forEach((t) => {
      if (t.type === "in") {
        batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0 });
        if (t.returnId) add(t.returnId, -Number(t.quantity) * (Number(t.unitCost) || 0));
      } else {
        let toConsume = Number(t.quantity);
        let costConsumed = 0;
        while (toConsume > 0 && batches.length > 0) {
          const b = batches[0];
          const consumed = Math.min(b.qty, toConsume);
          costConsumed += consumed * b.unitCost;
          b.qty -= consumed;
          toConsume -= consumed;
          if (b.qty <= 0.0000001) batches.shift();
        }
        if (t.saleId) add(t.saleId, costConsumed);
      }
    });
  });
  return map;
}

function computeIncomeStatement({ sales, saleReturns, transactions, stockItems, stockTx, startDate, endDate }) {
  const inRange = (date) => (!startDate || date >= startDate) && (!endDate || date <= endDate);

  // VAT charged to customers is money collected on the government's behalf,
  // never the business's own revenue — so it's backed out here regardless
  // of whether VAT tracking is even turned on (vatAmount is simply 0/absent
  // on every sale when it's off, so this is a no-op until enabled).
  const salesRevenue = sales
    .filter((s) => inRange(s.date))
    .reduce((sum, s) => sum + Number(s.cashAmount) + Number(s.creditAmount) - (Number(s.vatAmount) || 0), 0);
  const salesReturnsTotal = saleReturns
    .filter((r) => inRange(r.date))
    .reduce((sum, r) => sum + Number(r.cashRefund) + Number(r.creditReduction) - (Number(r.vatAmount) || 0), 0);
  const netSalesRevenue = salesRevenue - salesReturnsTotal;

  const otherIncomeByCategory = {};
  transactions
    .filter((t) => t.type === "income" && !t.saleId && !t.isReversal && t.category !== "Partner Capital Contribution" && inRange(t.date))
    .forEach((t) => {
      otherIncomeByCategory[t.category] = (otherIncomeByCategory[t.category] || 0) + Number(t.amount);
    });
  const otherIncome = Object.values(otherIncomeByCategory).reduce((s, v) => s + v, 0);
  const totalRevenue = netSalesRevenue + otherIncome;

  let cogs = 0;
  // Stock that leaves without being sold, consumed in production, or sent
  // back to a supplier is a write-off (expired, damaged, samples). It used
  // to vanish from inventory without ever hitting profit, which quietly
  // unbalanced the books by the cost of the lost goods. Now it's recognized
  // as a real expense at its FIFO cost, for raw materials and finished
  // goods alike.
  let writeOffCost = 0;
  stockItems.forEach((item) => {
    const txForItem = stockTx
      .filter((t) => t.itemId === item.id)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    const batches = [];
    txForItem.forEach((t) => {
      if (t.type === "in") {
        batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0 });
        if (t.returnId && inRange(t.date) && item.category === "Finished Good") {
          cogs -= Number(t.quantity) * (Number(t.unitCost) || 0);
        }
      } else {
        let toConsume = Number(t.quantity);
        let costConsumed = 0;
        while (toConsume > 0 && batches.length > 0) {
          const b = batches[0];
          const consumed = Math.min(b.qty, toConsume);
          costConsumed += consumed * b.unitCost;
          b.qty -= consumed;
          toConsume -= consumed;
          if (b.qty <= 0.0000001) batches.shift();
        }
        if (t.saleId && inRange(t.date)) {
          if (item.category === "Finished Good") cogs += costConsumed;
        } else if (!t.saleId && !t.productionId && !t.purchaseReturnId && inRange(t.date)) {
          writeOffCost += costConsumed;
        }
      }
    });
  });

  const grossProfit = totalRevenue - cogs;

  const opExByCategory = {};
  transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        !t.purchaseId &&
        !t.saleId &&
        !t.returnId &&
        !t.fixedAssetId &&
        t.category !== "VAT Payment" &&
        inRange(t.date)
    )
    .forEach((t) => {
      opExByCategory[t.category] = (opExByCategory[t.category] || 0) + Number(t.amount);
    });
  if (writeOffCost > 0.005) {
    opExByCategory["Spoilage & Write-offs"] = (opExByCategory["Spoilage & Write-offs"] || 0) + writeOffCost;
  }
  const totalOpEx = Object.values(opExByCategory).reduce((s, v) => s + v, 0);

  const netProfit = grossProfit - totalOpEx;

  return {
    salesRevenue,
    salesReturnsTotal,
    netSalesRevenue,
    otherIncomeByCategory,
    otherIncome,
    totalRevenue,
    cogs,
    grossProfit,
    opExByCategory,
    totalOpEx,
    writeOffCost,
    netProfit,
  };
}

function isMapsUrl(location) {
  return /^https?:\/\//i.test(location || "");
}

function mapsSearchLink(location) {
  if (!location) return null;
  if (isMapsUrl(location)) return location;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

function mapsEmbedLink(location) {
  if (!location || isMapsUrl(location)) return null;
  return `https://maps.google.com/maps?q=${encodeURIComponent(location)}&z=15&output=embed`;
}

function toWhatsAppNumber(phone) {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (!digits) return null;
  // If it looks like a local 10-digit number (e.g. Nepal mobile), assume Nepal's country code.
  if (digits.length <= 10) digits = "977" + digits;
  return digits;
}

function whatsAppLink(phone, text) {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// mailto: can pre-fill the recipient, subject, and body, but the protocol
// has no way to attach a file — so the flow is: Print -> "Save as PDF",
// then this button opens the email ready to send; the person attaches the
// saved PDF. A true auto-attached email would need a mail server, which
// this app deliberately doesn't have.
// Normalizes a sale to a list of lines. New sales store `lines:
// [{ itemId, quantity, unitRate }]`; sales recorded before multi-item
// billing have a single itemId/quantity pair, which this converts to a
// one-line list on the fly — so old records keep working forever without
// any stored-data migration.
function saleLines(s) {
  if (Array.isArray(s.lines) && s.lines.length > 0) return s.lines;
  if (s.itemId) {
    const total = Number(s.cashAmount) + Number(s.creditAmount);
    const qty = Number(s.quantity) || 0;
    return [{ itemId: s.itemId, quantity: qty, unitRate: qty > 0 ? total / qty : 0 }];
  }
  return [];
}

function saleLinesSummary(s, itemNameFn) {
  const lines = saleLines(s);
  if (lines.length === 0) return null;
  return lines.map((l) => `${itemNameFn(l.itemId)} × ${l.quantity}`).join(", ");
}

// Same normalization as saleLines: old single-item purchases keep working
// forever, converted to a one-line list on the fly, never migrated in
// storage.
function purchaseLines(p) {
  if (Array.isArray(p.lines) && p.lines.length > 0) return p.lines;
  if (p.itemId) {
    const total = Number(p.cashAmount) + Number(p.creditAmount);
    const qty = Number(p.quantity) || 0;
    return [{ itemId: p.itemId, quantity: qty, unitRate: qty > 0 ? total / qty : 0 }];
  }
  return [];
}

function purchaseLinesSummary(p, itemNameFn) {
  const lines = purchaseLines(p);
  if (lines.length === 0) return null;
  return lines.map((l) => `${itemNameFn(l.itemId)} × ${l.quantity}`).join(", ");
}

function emailLink(email, subject, body) {
  const addr = (email || "").trim();
  if (!addr || !addr.includes("@")) return null;
  return `mailto:${addr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function TrikutLedger({ role = "super_admin", userLabel, onLogout, onListTeam, onUpdateRole } = {}) {
  const actor = userLabel || "You";
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "super_admin" || role === "admin";
  const [transactions, setTransactions] = useState([]);
  const [capitalEntries, setCapitalEntries] = useState([]);
  const [recurringTemplates, setRecurringTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockTx, setStockTx] = useState([]);
  const [sales, setSales] = useState([]);
  const [saleReturns, setSaleReturns] = useState([]);
  const [purchaseReturns, setPurchaseReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payables, setPayables] = useState([]);
  const [productionBatches, setProductionBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!sidebarExpanded) return;
    function handleOutsideClick(e) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target)) {
        setSidebarExpanded(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [sidebarExpanded]);
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [showCapForm, setShowCapForm] = useState(false);
  const [editingCap, setEditingCap] = useState(null);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [showReceivableForm, setShowReceivableForm] = useState(null); // customerId or null
  const [editingReceivable, setEditingReceivable] = useState(null);
  const [showStockItemForm, setShowStockItemForm] = useState(false);
  const [editingStockItem, setEditingStockItem] = useState(null);
  const [showStockTxForm, setShowStockTxForm] = useState(null); // { itemId, type } or null
  const [editingStockTx, setEditingStockTx] = useState(null);
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [editingSale, setEditingSale] = useState(null);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [editingReturn, setEditingReturn] = useState(null);
  const [showPurchaseReturnForm, setShowPurchaseReturnForm] = useState(false);
  const [editingPurchaseReturn, setEditingPurchaseReturn] = useState(null);
  const [billEntry, setBillEntry] = useState(null); // { kind: 'sale'|'return', entry }
  const [statementTarget, setStatementTarget] = useState(null); // { type: 'customer'|'supplier', id } or null
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [ownership, setOwnership] = useState(null); // { Pritam: 33.34, Ashish: 33.33, Kapil: 33.33 } or null until loaded
  const [fixedAssets, setFixedAssets] = useState([]);
  const [lastBackup, setLastBackup] = useState({ json: null, excel: null });
  // City -> areas hierarchy for customer locations. Managed in-app (not
  // hardcoded) so expanding to a new city is just adding one, and each
  // city's wards/localities stay scoped under it instead of piling into one
  // flat list. Seeded with Dharan since that's where the business is based.
  const [locations, setLocations] = useState({ cities: [{ name: "Dharan", areas: [] }] });
  // Extends, never replaces, the built-in expense categories. Anything
  // added here shows up alongside the defaults everywhere a category is
  // picked (Transactions, Purchases, Recurring), so a new kind of cost
  // doesn't need to be forced into "Other".
  const [customExpenseCategories, setCustomExpenseCategories] = useState([]);
  // VAT is off by default and entirely optional. When enabled, the rate and
  // registration number apply going forward only — each sale stores its own
  // vatAmount at the rate charged that day, so changing the rate later never
  // rewrites history.
  const [vatSettings, setVatSettings] = useState({ enabled: false, rate: 13, panNumber: "" });
  // "system" follows the OS/browser's own light/dark preference, re-checked
  // live via matchMedia rather than just read once at load — so if someone
  // flips their phone into dark mode at night, the app follows without
  // needing a reload.
  const [theme, setTheme] = useState("system");
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e) => setSystemPrefersDark(e.matches);
    mq.addEventListener ? mq.addEventListener("change", handler) : mq.addListener(handler);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", handler) : mq.removeListener(handler));
  }, []);
  const effectiveTheme = theme === "system" ? (systemPrefersDark ? "dark" : "light") : theme;
  const [showFixedAssetForm, setShowFixedAssetForm] = useState(false);
  const [editingFixedAsset, setEditingFixedAsset] = useState(null);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [showPayableForm, setShowPayableForm] = useState(null); // supplierId or null
  const [editingPayable, setEditingPayable] = useState(null);
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [editingProduction, setEditingProduction] = useState(null);
  const [purchases, setPurchases] = useState([]);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [orders, setOrders] = useState([]);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [salePrefill, setSalePrefill] = useState(null); // { customerId, itemId, quantity, orderId } or null
  const [filterType, setFilterType] = useState("all");
  const [filterPartner, setFilterPartner] = useState("all");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const tx = await storage.get("transactions");
        setTransactions(tx ? JSON.parse(tx.value) : []);
      } catch {
        setTransactions([]);
      }
      try {
        const cap = await storage.get("capital-entries");
        setCapitalEntries(cap ? JSON.parse(cap.value) : []);
      } catch {
        setCapitalEntries([]);
      }
      try {
        const rec = await storage.get("recurring-templates");
        setRecurringTemplates(rec ? JSON.parse(rec.value) : []);
      } catch {
        setRecurringTemplates([]);
      }
      try {
        const cust = await storage.get("customers");
        setCustomers(cust ? JSON.parse(cust.value) : []);
      } catch {
        setCustomers([]);
      }
      try {
        const rec = await storage.get("receivables");
        setReceivables(rec ? JSON.parse(rec.value) : []);
      } catch {
        setReceivables([]);
      }
      try {
        const si = await storage.get("stock-items");
        setStockItems(si ? JSON.parse(si.value) : []);
      } catch {
        setStockItems([]);
      }
      try {
        const st = await storage.get("stock-transactions");
        setStockTx(st ? JSON.parse(st.value) : []);
      } catch {
        setStockTx([]);
      }
      try {
        const sl = await storage.get("sales");
        setSales(sl ? JSON.parse(sl.value) : []);
      } catch {
        setSales([]);
      }
      try {
        const sr = await storage.get("sale-returns");
        setSaleReturns(sr ? JSON.parse(sr.value) : []);
      } catch {
        setSaleReturns([]);
      }
      try {
        const pr = await storage.get("purchase-returns");
        setPurchaseReturns(pr ? JSON.parse(pr.value) : []);
      } catch {
        setPurchaseReturns([]);
      }
      try {
        const sup = await storage.get("suppliers");
        setSuppliers(sup ? JSON.parse(sup.value) : []);
      } catch {
        setSuppliers([]);
      }
      try {
        const pay = await storage.get("payables");
        setPayables(pay ? JSON.parse(pay.value) : []);
      } catch {
        setPayables([]);
      }
      try {
        const pb = await storage.get("production-batches");
        setProductionBatches(pb ? JSON.parse(pb.value) : []);
      } catch {
        setProductionBatches([]);
      }
      try {
        const pu = await storage.get("purchases");
        setPurchases(pu ? JSON.parse(pu.value) : []);
      } catch {
        setPurchases([]);
      }
      try {
        const ord = await storage.get("orders");
        setOrders(ord ? JSON.parse(ord.value) : []);
      } catch {
        setOrders([]);
      }
      try {
        const own = await storage.get("ownership-settings");
        setOwnership(own ? JSON.parse(own.value) : defaultOwnership());
      } catch {
        setOwnership(defaultOwnership());
      }
      try {
        const fa = await storage.get("fixed-assets");
        setFixedAssets(fa ? JSON.parse(fa.value) : []);
      } catch {
        setFixedAssets([]);
      }
      try {
        const lb = await storage.get("last-backup-info");
        setLastBackup(lb ? JSON.parse(lb.value) : { json: null, excel: null });
      } catch {
        setLastBackup({ json: null, excel: null });
      }
      try {
        const loc = await storage.get("locations");
        const parsed = loc ? JSON.parse(loc.value) : null;
        setLocations(parsed && Array.isArray(parsed.cities) ? parsed : { cities: [{ name: "Dharan", areas: [] }] });
      } catch {
        setLocations({ cities: [{ name: "Dharan", areas: [] }] });
      }
      try {
        const cats = await storage.get("custom-expense-categories");
        const parsed = cats ? JSON.parse(cats.value) : [];
        setCustomExpenseCategories(Array.isArray(parsed) ? parsed : []);
      } catch {
        setCustomExpenseCategories([]);
      }
      try {
        const vs = await storage.get("vat-settings");
        setVatSettings(vs ? JSON.parse(vs.value) : { enabled: false, rate: 13, panNumber: "" });
      } catch {
        setVatSettings({ enabled: false, rate: 13, panNumber: "" });
      }
      try {
        const th = await storage.get("theme-preference");
        const val = th ? JSON.parse(th.value) : "system";
        setTheme(["light", "dark", "system"].includes(val) ? val : "system");
      } catch {
        setTheme("system");
      }
      setLoading(false);
    })();
  }, []);

  // One-time cleanup after load: permanently remove anything that's been
  // sitting in the trash for more than TRASH_RETENTION_DAYS. This is the
  // only place soft-deleted records actually disappear from storage.
  useEffect(() => {
    if (loading) return;
    const cutoff = Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const isExpired = (item) => item.deletedAt && new Date(item.deletedAt).getTime() <= cutoff;

    if (transactions.some(isExpired)) saveTransactions(transactions.filter((t) => !isExpired(t)));
    if (capitalEntries.some(isExpired)) saveCapital(capitalEntries.filter((c) => !isExpired(c)));
    if (customers.some(isExpired)) saveCustomers(customers.filter((c) => !isExpired(c)));
    if (receivables.some(isExpired)) saveReceivables(receivables.filter((r) => !isExpired(r)));
    if (stockItems.some(isExpired)) saveStockItems(stockItems.filter((i) => !isExpired(i)));
    if (stockTx.some(isExpired)) saveStockTx(stockTx.filter((t) => !isExpired(t)));
    if (sales.some(isExpired)) saveSales(sales.filter((s) => !isExpired(s)));
    if (saleReturns.some(isExpired)) saveSaleReturns(saleReturns.filter((r) => !isExpired(r)));
    if (purchaseReturns.some(isExpired)) savePurchaseReturns(purchaseReturns.filter((r) => !isExpired(r)));
    if (suppliers.some(isExpired)) saveSuppliers(suppliers.filter((s) => !isExpired(s)));
    if (payables.some(isExpired)) savePayables(payables.filter((p) => !isExpired(p)));
    if (productionBatches.some(isExpired)) saveProductionBatches(productionBatches.filter((b) => !isExpired(b)));
    if (purchases.some(isExpired)) savePurchases(purchases.filter((p) => !isExpired(p)));
    if (orders.some(isExpired)) saveOrders(orders.filter((o) => !isExpired(o)));
    if (fixedAssets.some(isExpired)) saveFixedAssets(fixedAssets.filter((f) => !isExpired(f)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  async function saveTransactions(next) {
    setTransactions(next);
    try {
      const res = await storage.set("transactions", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveCapital(next) {
    setCapitalEntries(next);
    try {
      const res = await storage.set("capital-entries", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveRecurringTemplates(next) {
    setRecurringTemplates(next);
    try {
      const res = await storage.set("recurring-templates", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertRecurringTemplate(entry) {
    if (entry.id) {
      saveRecurringTemplates(recurringTemplates.map((r) => (r.id === entry.id ? stampUpdate({ ...r, ...entry }, actor) : r)));
    } else {
      saveRecurringTemplates([stampCreate({ ...entry, id: uid() }, actor), ...recurringTemplates]);
    }
    setShowRecurringForm(false);
    setEditingRecurring(null);
  }

  function deleteRecurringTemplate(id) {
    saveRecurringTemplates(recurringTemplates.map((r) => (r.id === id ? stampDelete(r, actor) : r)));
  }

  function restoreRecurringTemplate(id) {
    saveRecurringTemplates(recurringTemplates.map((r) => (r.id === id ? stampRestore(r) : r)));
  }

  // Rolls a due date forward exactly one month, clamped to the target
  // month's real length — a rent due on the 31st correctly lands on Feb 28
  // (or 29), not overflowing into March the way naive date math would.
  function advanceOneMonth(dateStr, dayOfMonth) {
    const d = new Date(dateStr + "T00:00:00Z");
    let year = d.getUTCFullYear();
    let month = d.getUTCMonth() + 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const day = Math.min(Number(dayOfMonth) || 1, daysInTargetMonth);
    return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
  }

  // Records the actual transaction for a due template (a real, independent
  // record — editable and deletable on its own afterward, same as any
  // manually-entered transaction) and rolls the template forward to its
  // next due date. Nothing here happens silently: this only runs when the
  // person taps "Record" on something they can see is due, never on a
  // background timer.
  function recordRecurringTransaction(template) {
    const entry = stampCreate(
      {
        id: uid(),
        type: template.type,
        date: template.nextDueDate,
        category: template.category,
        partner: template.partner,
        amount: Number(template.amount),
        method: template.method || "cash",
        recurringId: template.id,
        note: template.note ? template.note : "Recurring transaction",
      },
      actor
    );
    saveTransactions([entry, ...transactions]);
    const newNextDue = advanceOneMonth(template.nextDueDate, template.dayOfMonth);
    saveRecurringTemplates(
      recurringTemplates.map((r) => (r.id === template.id ? stampUpdate({ ...r, nextDueDate: newNextDue }, actor) : r))
    );
  }

  function upsertTransaction(entry) {
    if (entry.id) {
      saveTransactions(transactions.map((t) => (t.id === entry.id ? stampUpdate({ ...t, ...entry }, actor) : t)));
    } else {
      saveTransactions([stampCreate({ ...entry, id: uid() }, actor), ...transactions]);
    }
    setShowTxForm(false);
    setEditingTx(null);
  }

  function deleteTransaction(id) {
    saveTransactions(transactions.map((t) => (t.id === id ? stampDelete(t, actor) : t)));
  }

  function restoreTransaction(id) {
    saveTransactions(transactions.map((t) => (t.id === id ? stampRestore(t) : t)));
  }

  function upsertCapitalEntry(entry) {
    if (entry.id) {
      saveCapital(capitalEntries.map((c) => (c.id === entry.id ? stampUpdate({ ...c, ...entry }, actor) : c)));
    } else {
      saveCapital([stampCreate({ ...entry, id: uid() }, actor), ...capitalEntries]);
    }
    setShowCapForm(false);
    setEditingCap(null);
  }

  function deleteCapitalEntry(id) {
    saveCapital(capitalEntries.map((c) => (c.id === id ? stampDelete(c, actor) : c)));
  }

  function restoreCapitalEntry(id) {
    saveCapital(capitalEntries.map((c) => (c.id === id ? stampRestore(c) : c)));
  }

  async function saveCustomers(next) {
    setCustomers(next);
    try {
      const res = await storage.set("customers", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveReceivables(next) {
    setReceivables(next);
    try {
      const res = await storage.set("receivables", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveLocations(next) {
    setLocations(next);
    try {
      await storage.set("locations", JSON.stringify(next));
    } catch {
      // Non-critical: the customer still saves with its city/area text even
      // if the dropdown list itself fails to persist.
    }
  }

  async function saveCustomExpenseCategories(next) {
    setCustomExpenseCategories(next);
    try {
      await storage.set("custom-expense-categories", JSON.stringify(next));
    } catch {
      // Non-critical: worst case the new category needs re-adding.
    }
  }

  function addExpenseCategory(name) {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const exists = [...EXPENSE_CATEGORIES, ...customExpenseCategories].some((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;
    saveCustomExpenseCategories([...customExpenseCategories, trimmed]);
  }

  async function saveVatSettings(next) {
    setVatSettings(next);
    try {
      await storage.set("vat-settings", JSON.stringify(next));
    } catch {
      // Non-critical: worst case the toggle needs to be re-applied.
    }
  }

  async function saveTheme(next) {
    setTheme(next);
    try {
      await storage.set("theme-preference", JSON.stringify(next));
    } catch {
      // Non-critical: worst case it reverts to System on next load.
    }
  }

  // A real cash payment to the tax office, reducing VAT Payable. Booked as
  // an ordinary expense-type transaction (so Trash, Activity Log, and the
  // Transactions list all pick it up for free) but tagged with a category
  // computeIncomeStatement specifically excludes from Operating Expenses —
  // the cash left, but this was never revenue to begin with, so counting it
  // as an expense now would double the hit to profit.
  function recordVatPayment({ date, amount, method, partner, note }) {
    if (!(Number(amount) > 0)) return;
    const entry = stampCreate(
      {
        id: uid(),
        type: "expense",
        date,
        category: "VAT Payment",
        partner,
        amount: Number(amount),
        method: method || "cash",
        note: note || "VAT remitted",
      },
      actor
    );
    saveTransactions([entry, ...transactions]);
  }

  // Any city or area typed in as new on the customer form gets folded into
  // the managed list, so it's a dropdown choice from then on and nobody has
  // to retype (and misspell) it next time.
  function reconcileLocations(city, area) {
    const cityName = (city || "").trim();
    const areaName = (area || "").trim();
    if (!cityName) return;
    const cities = [...(locations.cities || [])];
    let idx = cities.findIndex((c) => c.name.toLowerCase() === cityName.toLowerCase());
    let changed = false;
    if (idx === -1) {
      cities.push({ name: cityName, areas: [] });
      idx = cities.length - 1;
      changed = true;
    }
    if (areaName) {
      const areas = cities[idx].areas || [];
      if (!areas.some((a) => a.toLowerCase() === areaName.toLowerCase())) {
        cities[idx] = { ...cities[idx], areas: [...areas, areaName].sort((a, b) => a.localeCompare(b)) };
        changed = true;
      }
    }
    if (changed) saveLocations({ ...locations, cities: cities.sort((a, b) => a.name.localeCompare(b.name)) });
  }

  function upsertCustomer(entry) {
    reconcileLocations(entry.city, entry.area);
    if (entry.id) {
      saveCustomers(customers.map((c) => (c.id === entry.id ? stampUpdate({ ...c, ...entry }, actor) : c)));
    } else {
      saveCustomers([stampCreate({ ...entry, id: uid() }, actor), ...customers]);
    }
    setShowCustomerForm(false);
    setEditingCustomer(null);
  }

  function deleteCustomer(id) {
    saveCustomers(customers.map((c) => (c.id === id ? stampDelete(c, actor) : c)));
    saveReceivables(receivables.map((r) => (r.customerId === id ? stampDelete(r, actor) : r)));
  }

  function restoreCustomer(id) {
    saveCustomers(customers.map((c) => (c.id === id ? stampRestore(c) : c)));
    saveReceivables(receivables.map((r) => (r.customerId === id ? stampRestore(r) : r)));
  }

  function upsertReceivable(entry) {
    if (entry.id) {
      saveReceivables(receivables.map((r) => (r.id === entry.id ? stampUpdate({ ...r, ...entry }, actor) : r)));
    } else {
      saveReceivables([stampCreate({ ...entry, id: uid() }, actor), ...receivables]);
    }
    setShowReceivableForm(null);
    setEditingReceivable(null);
  }

  function deleteReceivable(id) {
    saveReceivables(receivables.map((r) => (r.id === id ? stampDelete(r, actor) : r)));
  }

  function restoreReceivable(id) {
    saveReceivables(receivables.map((r) => (r.id === id ? stampRestore(r) : r)));
  }

  async function saveStockItems(next) {
    setStockItems(next);
    try {
      const res = await storage.set("stock-items", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveStockTx(next) {
    setStockTx(next);
    try {
      const res = await storage.set("stock-transactions", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertStockItem(entry) {
    if (entry.id) {
      saveStockItems(stockItems.map((i) => (i.id === entry.id ? stampUpdate({ ...i, ...entry }, actor) : i)));
    } else {
      saveStockItems([stampCreate({ ...entry, id: uid() }, actor), ...stockItems]);
    }
    setShowStockItemForm(false);
    setEditingStockItem(null);
  }

  function deleteStockItem(id) {
    saveStockItems(stockItems.map((i) => (i.id === id ? stampDelete(i, actor) : i)));
    saveStockTx(stockTx.map((t) => (t.itemId === id ? stampDelete(t, actor) : t)));
  }

  function restoreStockItem(id) {
    saveStockItems(stockItems.map((i) => (i.id === id ? stampRestore(i) : i)));
    saveStockTx(stockTx.map((t) => (t.itemId === id ? stampRestore(t) : t)));
  }

  function upsertStockTx(entry) {
    if (entry.id) {
      saveStockTx(stockTx.map((t) => (t.id === entry.id ? stampUpdate({ ...t, ...entry }, actor) : t)));
    } else {
      saveStockTx([...stockTx, stampCreate({ ...entry, id: uid() }, actor)]);
    }
    setShowStockTxForm(null);
    setEditingStockTx(null);
  }

  function deleteStockTx(id) {
    saveStockTx(stockTx.map((t) => (t.id === id ? stampDelete(t, actor) : t)));
  }

  function restoreStockTx(id) {
    saveStockTx(stockTx.map((t) => (t.id === id ? stampRestore(t) : t)));
  }

  async function saveSales(next) {
    setSales(next);
    try {
      const res = await storage.set("sales", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveSaleReturns(next) {
    setSaleReturns(next);
    try {
      const res = await storage.set("sale-returns", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function savePurchaseReturns(next) {
    setPurchaseReturns(next);
    try {
      const res = await storage.set("purchase-returns", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertSale(entry) {
    const saleId = entry.id || uid();
    const { date, customerId, cashAmount, method, creditAmount, partner, note, orderId } = entry;
    const lines = saleLines(entry);

    const newSales = entry.id
      ? sales.map((s) => (s.id === saleId ? stampUpdate({ ...s, ...entry }, actor) : s))
      : [stampCreate({ ...entry, id: saleId }, actor), ...sales];

    let newTransactions = transactions.filter((t) => t.saleId !== saleId);
    let newReceivables = receivables.filter((r) => r.saleId !== saleId);
    let newStockTx = stockTx.filter((t) => t.saleId !== saleId);

    if (cashAmount > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            saleId,
            type: "income",
            date,
            category: "Sales Revenue",
            partner,
            amount: cashAmount,
            method: method || "cash",
            note: note ? `Sale — ${note}` : "Sale (cash portion)",
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (creditAmount > 0 && customerId) {
      newReceivables = [
        stampCreate(
          {
            id: uid(),
            saleId,
            customerId,
            date,
            type: "charge",
            amount: creditAmount,
            note: note ? `Sale — ${note}` : "Sale (credit portion)",
          },
          actor
        ),
        ...newReceivables,
      ];
    }
    lines.forEach((l) => {
      if (!l.itemId || !(Number(l.quantity) > 0)) return;
      newStockTx = [
        ...newStockTx,
        stampCreate(
          { id: uid(), saleId, itemId: l.itemId, date, type: "out", quantity: Number(l.quantity), note: note ? `Sold — ${note}` : "Sold" },
          actor
        ),
      ];
    });

    saveSales(newSales);
    saveTransactions(newTransactions);
    saveReceivables(newReceivables);
    saveStockTx(newStockTx);

    if (orderId) {
      saveOrders(orders.map((o) => (o.id === orderId ? { ...o, status: "fulfilled", saleId } : o)));
    }
    setShowSaleForm(false);
    setSalePrefill(null);
    setEditingSale(null);
  }

  function deleteSale(id) {
    saveSales(sales.map((s) => (s.id === id ? stampDelete(s, actor) : s)));
    saveTransactions(transactions.map((t) => (t.saleId === id ? stampDelete(t, actor) : t)));
    saveReceivables(receivables.map((r) => (r.saleId === id ? stampDelete(r, actor) : r)));
    saveStockTx(stockTx.map((t) => (t.saleId === id ? stampDelete(t, actor) : t)));
  }

  function restoreSale(id) {
    saveSales(sales.map((s) => (s.id === id ? stampRestore(s) : s)));
    saveTransactions(transactions.map((t) => (t.saleId === id ? stampRestore(t) : t)));
    saveReceivables(receivables.map((r) => (r.saleId === id ? stampRestore(r) : r)));
    saveStockTx(stockTx.map((t) => (t.saleId === id ? stampRestore(t) : t)));
  }

  async function saveOrders(next) {
    setOrders(next);
    try {
      const res = await storage.set("orders", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function saveOwnership(next) {
    setOwnership(next);
    try {
      const res = await storage.set("ownership-settings", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function updateOwnershipPercent(partner, value) {
    const next = { ...(ownership || defaultOwnership()), [partner]: value };
    saveOwnership(next);
  }

  async function saveFixedAssets(next) {
    setFixedAssets(next);
    try {
      const res = await storage.set("fixed-assets", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function recordBackup(kind) {
    const next = { ...lastBackup, [kind]: nowISO() };
    setLastBackup(next);
    try {
      await storage.set("last-backup-info", JSON.stringify(next));
    } catch {
      // Non-critical — the download already succeeded either way.
    }
  }

  function upsertFixedAsset(entry) {
    const assetId = entry.id || uid();
    const { name, purchaseDate, cost, ratePercent, method, partner, note } = entry;

    const newFixedAssets = entry.id
      ? fixedAssets.map((f) => (f.id === assetId ? stampUpdate({ ...f, ...entry }, actor) : f))
      : [stampCreate({ ...entry, id: assetId }, actor), ...fixedAssets];

    // The purchase cost still needs to leave Cash/Bank/eSewa somewhere — but
    // it's capitalized, not expensed, so it's tagged with fixedAssetId and
    // excluded from Operating Expenses on the Income Statement. The cost is
    // recognized gradually instead, via depreciation.
    let newTransactions = transactions.filter((t) => t.fixedAssetId !== assetId);
    if (Number(cost) > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            fixedAssetId: assetId,
            type: "expense",
            date: purchaseDate,
            category: "Machinery & Equipment",
            partner,
            amount: Number(cost),
            method: method || "cash",
            note: note ? `Fixed asset — ${name} — ${note}` : `Fixed asset purchase — ${name}`,
          },
          actor
        ),
        ...newTransactions,
      ];
    }

    saveFixedAssets(newFixedAssets);
    saveTransactions(newTransactions);
    setShowFixedAssetForm(false);
    setEditingFixedAsset(null);
  }

  function deleteFixedAsset(id) {
    saveFixedAssets(fixedAssets.map((f) => (f.id === id ? stampDelete(f, actor) : f)));
    saveTransactions(transactions.map((t) => (t.fixedAssetId === id ? stampDelete(t, actor) : t)));
  }

  function restoreFixedAsset(id) {
    saveFixedAssets(fixedAssets.map((f) => (f.id === id ? stampRestore(f) : f)));
    saveTransactions(transactions.map((t) => (t.fixedAssetId === id ? stampRestore(t) : t)));
  }

  function upsertOrder(entry) {
    if (entry.id) {
      saveOrders(orders.map((o) => (o.id === entry.id ? stampUpdate({ ...o, ...entry }, actor) : o)));
    } else {
      saveOrders([stampCreate({ ...entry, id: uid(), status: "pending" }, actor), ...orders]);
    }
    setShowOrderForm(false);
    setEditingOrder(null);
  }

  function updateOrderStatus(id, status) {
    saveOrders(orders.map((o) => (o.id === id ? stampUpdate({ ...o, status }, actor) : o)));
  }

  function deleteOrder(id) {
    saveOrders(orders.map((o) => (o.id === id ? stampDelete(o, actor) : o)));
  }

  function restoreOrder(id) {
    saveOrders(orders.map((o) => (o.id === id ? stampRestore(o) : o)));
  }

  function fulfillOrderViaSale(order) {
    setSalePrefill({ customerId: order.customerId, itemId: order.itemId, quantity: order.quantity, orderId: order.id });
    setShowSaleForm(true);
  }

  function upsertReturn(entry) {
    const returnId = entry.id || uid();
    const { date, customerId, itemId, quantity, unitCost, cashRefund, method, creditReduction, partner, note } = entry;

    const newSaleReturns = entry.id
      ? saleReturns.map((r) => (r.id === returnId ? stampUpdate({ ...r, ...entry }, actor) : r))
      : [stampCreate({ ...entry, id: returnId }, actor), ...saleReturns];

    let newTransactions = transactions.filter((t) => t.returnId !== returnId);
    let newReceivables = receivables.filter((r) => r.returnId !== returnId);
    let newStockTx = stockTx.filter((t) => t.returnId !== returnId);

    if (cashRefund > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            returnId,
            type: "expense",
            date,
            category: "Sales Return / Refund",
            partner,
            amount: cashRefund,
            method: method || "cash",
            note: note ? `Return — ${note}` : "Sale return (cash refund)",
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (creditReduction > 0 && customerId) {
      newReceivables = [
        stampCreate(
          {
            id: uid(),
            returnId,
            customerId,
            date,
            type: "payment",
            nonCash: true,
            amount: creditReduction,
            note: note ? `Return — ${note}` : "Sale return (credit note)",
          },
          actor
        ),
        ...newReceivables,
      ];
    }
    // Only resellable goods go back into stock. An expired or damaged
    // return is waste: the customer still gets their refund/credit, but the
    // stock quantity and inventory value must NOT rise, and the cost of
    // those goods stays consumed (no COGS credit) — restocking spoiled
    // product would overstate both inventory and profit.
    if (itemId && quantity > 0 && entry.condition !== "waste") {
      newStockTx = [
        ...newStockTx,
        stampCreate(
          {
            id: uid(),
            returnId,
            itemId,
            date,
            type: "in",
            quantity,
            unitCost: unitCost || 0,
            note: note ? `Returned — ${note}` : "Restocked from return",
          },
          actor
        ),
      ];
    }

    saveSaleReturns(newSaleReturns);
    saveTransactions(newTransactions);
    saveReceivables(newReceivables);
    saveStockTx(newStockTx);
    setShowReturnForm(false);
    setEditingReturn(null);
  }

  function deleteSaleReturn(id) {
    saveSaleReturns(saleReturns.map((r) => (r.id === id ? stampDelete(r, actor) : r)));
    saveTransactions(transactions.map((t) => (t.returnId === id ? stampDelete(t, actor) : t)));
    saveReceivables(receivables.map((r) => (r.returnId === id ? stampDelete(r, actor) : r)));
    saveStockTx(stockTx.map((t) => (t.returnId === id ? stampDelete(t, actor) : t)));
  }

  function restoreSaleReturn(id) {
    saveSaleReturns(saleReturns.map((r) => (r.id === id ? stampRestore(r) : r)));
    saveTransactions(transactions.map((t) => (t.returnId === id ? stampRestore(t) : t)));
    saveReceivables(receivables.map((r) => (r.returnId === id ? stampRestore(r) : r)));
    saveStockTx(stockTx.map((t) => (t.returnId === id ? stampRestore(t) : t)));
  }

  async function saveSuppliers(next) {
    setSuppliers(next);
    try {
      const res = await storage.set("suppliers", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  async function savePayables(next) {
    setPayables(next);
    try {
      const res = await storage.set("payables", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertSupplier(entry) {
    if (entry.id) {
      saveSuppliers(suppliers.map((s) => (s.id === entry.id ? stampUpdate({ ...s, ...entry }, actor) : s)));
    } else {
      saveSuppliers([stampCreate({ ...entry, id: uid() }, actor), ...suppliers]);
    }
    setShowSupplierForm(false);
    setEditingSupplier(null);
  }

  function deleteSupplier(id) {
    saveSuppliers(suppliers.map((s) => (s.id === id ? stampDelete(s, actor) : s)));
    savePayables(payables.map((p) => (p.supplierId === id ? stampDelete(p, actor) : p)));
  }

  function restoreSupplier(id) {
    saveSuppliers(suppliers.map((s) => (s.id === id ? stampRestore(s) : s)));
    savePayables(payables.map((p) => (p.supplierId === id ? stampRestore(p) : p)));
  }

  function upsertPayable(entry) {
    if (entry.id) {
      savePayables(payables.map((p) => (p.id === entry.id ? stampUpdate({ ...p, ...entry }, actor) : p)));
    } else {
      savePayables([stampCreate({ ...entry, id: uid() }, actor), ...payables]);
    }
    setShowPayableForm(null);
    setEditingPayable(null);
  }

  function deletePayable(id) {
    savePayables(payables.map((p) => (p.id === id ? stampDelete(p, actor) : p)));
  }

  function restorePayable(id) {
    savePayables(payables.map((p) => (p.id === id ? stampRestore(p) : p)));
  }

  async function saveProductionBatches(next) {
    setProductionBatches(next);
    try {
      const res = await storage.set("production-batches", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertProduction(entry) {
    const batchId = entry.id || uid();
    const { date, inputs, outputItemId, outputQuantity, laborCost, overheadCost, method, partner, note } = entry;

    // Baseline: stock as if this batch's own stock movements don't exist yet.
    // For a new batch this is just the current stockTx list; for an edit it
    // excludes the batch's old entries so costs recompute against the true
    // "before this batch" stock levels rather than double-consuming.
    const baseStockTx = stockTx.filter((t) => t.productionId !== batchId);
    const baseStockTxForFIFO = baseStockTx.filter(notDeleted);

    // If you're editing a batch without touching its raw material inputs
    // (changing the note, labor cost, whatever), we deliberately do NOT
    // recompute the material cost from scratch. Re-running FIFO "as if this
    // batch never happened" can legitimately land on a different, even
    // zero, answer if other purchases/production/sales have consumed the
    // same raw material since this batch was first created — that's not
    // this batch's cost changing, it's just a side effect of recomputing
    // against a stock timeline that has moved on. So the original cost
    // basis is preserved unless the inputs themselves actually changed.
    const originalBatch = entry.id ? productionBatches.find((b) => b.id === entry.id) : null;
    const inputsUnchanged =
      originalBatch &&
      originalBatch.inputs?.length === inputs.length &&
      originalBatch.inputs.every(
        (orig, idx) => orig.itemId === inputs[idx].itemId && Number(orig.quantity) === Number(inputs[idx].quantity)
      );

    let totalInputCost = 0;
    const newBatchStockTx = [];
    if (inputsUnchanged) {
      totalInputCost =
        originalBatch.totalInputCost !== undefined
          ? originalBatch.totalInputCost
          : Math.max(0, (originalBatch.totalCost || 0) - (Number(originalBatch.laborCost) || 0) - (Number(originalBatch.overheadCost) || 0));
      inputs.forEach((inp) => {
        newBatchStockTx.push({
          id: uid(),
          productionId: batchId,
          itemId: inp.itemId,
          date,
          type: "out",
          quantity: Number(inp.quantity),
          note: note ? `Used in production — ${note}` : "Used in production",
        });
      });
    } else {
      inputs.forEach((inp) => {
        const batches = computeFIFOForItem(inp.itemId, baseStockTxForFIFO);
        let toConsume = Number(inp.quantity);
        let cost = 0;
        for (const b of batches) {
          if (toConsume <= 0) break;
          const consumed = Math.min(b.qty, toConsume);
          cost += consumed * b.unitCost;
          toConsume -= consumed;
        }
        totalInputCost += cost;
        newBatchStockTx.push({
          id: uid(),
          productionId: batchId,
          itemId: inp.itemId,
          date,
          type: "out",
          quantity: Number(inp.quantity),
          note: note ? `Used in production — ${note}` : "Used in production",
        });
      });
    }

    // Labor and overhead are expensed as incurred (shown under Operating
    // Expenses on the Income Statement), not capitalized into inventory —
    // so the stock valuation used for FIFO/COGS reflects raw material cost
    // only. totalCost still reports the full production cost (material +
    // labor + overhead) for your own reference, since knowing what a batch
    // truly cost to run is still useful even though it's booked separately.
    const totalCost = totalInputCost + (Number(laborCost) || 0) + (Number(overheadCost) || 0);
    const outputQty = Number(outputQuantity) || 0;
    const outputUnitCost = outputQty > 0 ? totalInputCost / outputQty : 0;
    newBatchStockTx.push({
      id: uid(),
      productionId: batchId,
      itemId: outputItemId,
      date,
      type: "in",
      quantity: outputQty,
      unitCost: outputUnitCost,
      note: note ? `Produced — ${note}` : "Produced from batch",
    });

    let newTransactions = transactions.filter((t) => t.productionId !== batchId);
    if (Number(laborCost) > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            productionId: batchId,
            type: "expense",
            date,
            category: "Labor & Wages",
            partner,
            amount: Number(laborCost),
            method: method || "cash",
            note: "Production batch labor",
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (Number(overheadCost) > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            productionId: batchId,
            type: "expense",
            date,
            category: "Production Overhead",
            partner,
            amount: Number(overheadCost),
            method: method || "cash",
            note: "Production batch overhead",
          },
          actor
        ),
        ...newTransactions,
      ];
    }

    const newProductionBatches = entry.id
      ? productionBatches.map((b) => (b.id === batchId ? stampUpdate({ ...b, ...entry, id: batchId, totalCost, totalInputCost, outputUnitCost }, actor) : b))
      : [stampCreate({ ...entry, id: batchId, totalCost, totalInputCost, outputUnitCost }, actor), ...productionBatches];

    saveStockTx([...baseStockTx, ...newBatchStockTx.map((t) => stampCreate(t, actor))]);
    saveTransactions(newTransactions);
    saveProductionBatches(newProductionBatches);
    setShowProductionForm(false);
    setEditingProduction(null);
  }

  function deleteProductionBatch(id) {
    saveProductionBatches(productionBatches.map((b) => (b.id === id ? stampDelete(b, actor) : b)));
    saveStockTx(stockTx.map((t) => (t.productionId === id ? stampDelete(t, actor) : t)));
    saveTransactions(transactions.map((t) => (t.productionId === id ? stampDelete(t, actor) : t)));
  }

  function restoreProductionBatch(id) {
    saveProductionBatches(productionBatches.map((b) => (b.id === id ? stampRestore(b) : b)));
    saveStockTx(stockTx.map((t) => (t.productionId === id ? stampRestore(t) : t)));
    saveTransactions(transactions.map((t) => (t.productionId === id ? stampRestore(t) : t)));
  }

  async function savePurchases(next) {
    setPurchases(next);
    try {
      const res = await storage.set("purchases", JSON.stringify(next));
      if (!res) setError("Couldn't save — try again.");
    } catch {
      setError("Couldn't save — try again.");
    }
  }

  function upsertPurchase(entry) {
    const purchaseId = entry.id || uid();
    const { date, supplierId, category, cashAmount, method, creditAmount, partner, note } = entry;
    const lines = purchaseLines(entry);
    const totalAmount = cashAmount + creditAmount;
    // VAT paid to a supplier is a recoverable credit against what we owe
    // the tax office, not a real cost of the raw material — so stock
    // valuation is based on the subtotal only, the same principle already
    // applied to labor and overhead staying out of inventory value. VAT is
    // one rate for the whole purchase, so the same fraction applies to
    // every line — each line's unit cost is just its rate times that
    // fraction, without needing to know the other lines' amounts.
    const vatAmount = entry.vatApplicable ? Number(entry.vatAmount) || 0 : 0;
    const vatFraction = totalAmount > 0 ? (totalAmount - vatAmount) / totalAmount : 1;

    const newPurchases = entry.id
      ? purchases.map((p) => (p.id === purchaseId ? stampUpdate({ ...p, ...entry }, actor) : p))
      : [stampCreate({ ...entry, id: purchaseId }, actor), ...purchases];

    let newTransactions = transactions.filter((t) => t.purchaseId !== purchaseId);
    let newPayables = payables.filter((p) => p.purchaseId !== purchaseId);
    let newStockTx = stockTx.filter((t) => t.purchaseId !== purchaseId);

    if (cashAmount > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            purchaseId,
            type: "expense",
            date,
            category,
            partner,
            amount: cashAmount,
            method: method || "cash",
            note: note ? `Purchase — ${note}` : "Purchase (cash portion)",
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (creditAmount > 0 && supplierId) {
      newPayables = [
        stampCreate(
          {
            id: uid(),
            purchaseId,
            supplierId,
            date,
            type: "charge",
            amount: creditAmount,
            note: note ? `Purchase — ${note}` : "Purchase (credit portion)",
          },
          actor
        ),
        ...newPayables,
      ];
    }
    lines.forEach((l) => {
      if (!l.itemId || !(Number(l.quantity) > 0)) return;
      newStockTx = [
        ...newStockTx,
        stampCreate(
          {
            id: uid(),
            purchaseId,
            itemId: l.itemId,
            date,
            type: "in",
            quantity: Number(l.quantity),
            unitCost: (Number(l.unitRate) || 0) * vatFraction,
            note: note ? `Purchased — ${note}` : "Purchased",
          },
          actor
        ),
      ];
    });

    savePurchases(newPurchases);
    saveTransactions(newTransactions);
    savePayables(newPayables);
    saveStockTx(newStockTx);
    setShowPurchaseForm(false);
    setEditingPurchase(null);
  }

  function deletePurchase(id) {
    savePurchases(purchases.map((p) => (p.id === id ? stampDelete(p, actor) : p)));
    saveTransactions(transactions.map((t) => (t.purchaseId === id ? stampDelete(t, actor) : t)));
    savePayables(payables.map((p) => (p.purchaseId === id ? stampDelete(p, actor) : p)));
    saveStockTx(stockTx.map((t) => (t.purchaseId === id ? stampDelete(t, actor) : t)));
  }

  function restorePurchase(id) {
    savePurchases(purchases.map((p) => (p.id === id ? stampRestore(p) : p)));
    saveTransactions(transactions.map((t) => (t.purchaseId === id ? stampRestore(t) : t)));
    savePayables(payables.map((p) => (p.purchaseId === id ? stampRestore(p) : p)));
    saveStockTx(stockTx.map((t) => (t.purchaseId === id ? stampRestore(t) : t)));
  }

  // Sending raw material back to a supplier — the mirror image of a Sale
  // Return: stock leaves our inventory (rather than coming back into it),
  // and money either comes back to us (cash refund) or reduces what we owe
  // (credit note against the supplier), rather than the customer-side
  // versions of those same things.
  function upsertPurchaseReturn(entry) {
    const returnId = entry.id || uid();
    const { date, supplierId, itemId, quantity, cashRefund, method, creditReduction, partner, note } = entry;
    // VAT (if applicable) is handled separately below via the VAT Payable
    // calculation, which reverses the input credit directly — it must not
    // also flow into gain/loss, or the same VAT would effectively count
    // twice.
    const vatAmount = entry.vatApplicable ? Number(entry.vatAmount) || 0 : 0;

    const baseStockTx = stockTx.filter((t) => t.purchaseReturnId !== returnId);
    const baseStockTxForFIFO = baseStockTx.filter(notDeleted);

    // Same principle as Production batches: what we're actually removing
    // from stock has a real cost (whatever we originally paid for it, via
    // FIFO), and that may not match whatever the supplier agrees to refund
    // or credit — a restocking fee, a partial refund, a negotiated amount.
    // The difference is a genuine gain or loss and needs to be recognized,
    // not silently absorbed as a Balance Sheet mismatch. And just like
    // Production, we only recompute that cost basis if the item/quantity
    // being returned actually changed on edit — not every time the form is
    // resaved — since recomputing FIFO retroactively can drift if other
    // stock activity has happened since.
    const originalReturn = entry.id ? purchaseReturns.find((r) => r.id === entry.id) : null;
    const itemUnchanged = originalReturn && originalReturn.itemId === itemId && Number(originalReturn.quantity) === Number(quantity);

    let fifoCost = 0;
    if (itemId && quantity > 0) {
      if (itemUnchanged && originalReturn.fifoCost !== undefined) {
        fifoCost = originalReturn.fifoCost;
      } else {
        const batches = computeFIFOForItem(itemId, baseStockTxForFIFO);
        let toConsume = Number(quantity);
        for (const b of batches) {
          if (toConsume <= 0) break;
          const consumed = Math.min(b.qty, toConsume);
          fifoCost += consumed * b.unitCost;
          toConsume -= consumed;
        }
      }
    }
    // FIFO cost is inherently VAT-free — that's the whole point of tracking
    // VAT as a separate credit rather than folding it into stock value — so
    // it's compared against the VAT-excluded portion of the refund, not the
    // full amount.
    const totalReturnAmount = Number(cashRefund) + Number(creditReduction) - vatAmount;
    const gainLoss = totalReturnAmount - fifoCost;

    const newPurchaseReturns = entry.id
      ? purchaseReturns.map((r) => (r.id === returnId ? stampUpdate({ ...r, ...entry, fifoCost }, actor) : r))
      : [stampCreate({ ...entry, id: returnId, fifoCost }, actor), ...purchaseReturns];

    let newTransactions = transactions.filter((t) => t.purchaseReturnId !== returnId);
    let newPayables = payables.filter((p) => p.purchaseReturnId !== returnId);
    let newStockTx = stockTx.filter((t) => t.purchaseReturnId !== returnId);

    if (cashRefund > 0) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            purchaseReturnId: returnId,
            isReversal: true,
            type: "income",
            date,
            category: "Other Income",
            partner,
            amount: cashRefund,
            method: method || "cash",
            note: note ? `Purchase return — ${note}` : "Purchase return (cash refund)",
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (creditReduction > 0 && supplierId) {
      newPayables = [
        stampCreate(
          {
            id: uid(),
            purchaseReturnId: returnId,
            supplierId,
            date,
            type: "payment",
            nonCash: true,
            amount: creditReduction,
            note: note ? `Purchase return — ${note}` : "Purchase return (credit note)",
          },
          actor
        ),
        ...newPayables,
      ];
    }
    if (Math.abs(gainLoss) > 0.5) {
      newTransactions = [
        stampCreate(
          {
            id: uid(),
            purchaseReturnId: returnId,
            // No cash moves for this entry — the actual money is the refund
            // transaction recorded alongside it. This one exists purely so
            // the Income Statement recognizes the gain/loss, so it must be
            // kept out of the cash/bank balances (nonCash), or the books
            // would drift from real cash by exactly this amount.
            nonCash: true,
            type: gainLoss > 0 ? "income" : "expense",
            date,
            category: gainLoss > 0 ? "Other Income" : "Production Overhead",
            partner,
            amount: Math.abs(gainLoss),
            note: `${gainLoss > 0 ? "Gain" : "Loss"} on purchase return — refunded/credited ${formatNPR(totalReturnAmount)} against ${formatNPR(fifoCost)} book cost`,
          },
          actor
        ),
        ...newTransactions,
      ];
    }
    if (itemId && quantity > 0) {
      newStockTx = [
        ...newStockTx,
        stampCreate(
          {
            id: uid(),
            purchaseReturnId: returnId,
            itemId,
            date,
            type: "out",
            quantity,
            note: note ? `Returned to supplier — ${note}` : "Returned to supplier",
          },
          actor
        ),
      ];
    }

    savePurchaseReturns(newPurchaseReturns);
    saveTransactions(newTransactions);
    savePayables(newPayables);
    saveStockTx(newStockTx);
    setShowPurchaseReturnForm(false);
    setEditingPurchaseReturn(null);
  }

  function deletePurchaseReturn(id) {
    savePurchaseReturns(purchaseReturns.map((r) => (r.id === id ? stampDelete(r, actor) : r)));
    saveTransactions(transactions.map((t) => (t.purchaseReturnId === id ? stampDelete(t, actor) : t)));
    savePayables(payables.map((p) => (p.purchaseReturnId === id ? stampDelete(p, actor) : p)));
    saveStockTx(stockTx.map((t) => (t.purchaseReturnId === id ? stampDelete(t, actor) : t)));
  }

  function restorePurchaseReturn(id) {
    savePurchaseReturns(purchaseReturns.map((r) => (r.id === id ? stampRestore(r) : r)));
    saveTransactions(transactions.map((t) => (t.purchaseReturnId === id ? stampRestore(t) : t)));
    savePayables(payables.map((p) => (p.purchaseReturnId === id ? stampRestore(p) : p)));
    saveStockTx(stockTx.map((t) => (t.purchaseReturnId === id ? stampRestore(t) : t)));
  }

  const activeTransactions = useMemo(() => transactions.filter(notDeleted), [transactions]);
  const activeCapitalEntries = useMemo(() => capitalEntries.filter(notDeleted), [capitalEntries]);
  // Defaults first (minus "Other", which always trails as the catch-all),
  // then whatever's been added, alphabetized so a growing list stays easy
  // to scan.
  const allExpenseCategories = useMemo(() => {
    const defaults = EXPENSE_CATEGORIES.filter((c) => c !== "Other");
    const custom = [...customExpenseCategories].sort((a, b) => a.localeCompare(b));
    return [...defaults, ...custom, "Other"];
  }, [customExpenseCategories]);
  const activeRecurringTemplates = useMemo(() => recurringTemplates.filter(notDeleted), [recurringTemplates]);
  // Templates whose next due date has arrived — surfaced for the person to
  // review and confirm, never recorded automatically in the background.
  const dueRecurringTemplates = useMemo(
    () => activeRecurringTemplates.filter((r) => r.active !== false && r.nextDueDate <= todayISO()),
    [activeRecurringTemplates]
  );
  const activeCustomers = useMemo(() => customers.filter(notDeleted), [customers]);
  const activeReceivables = useMemo(() => receivables.filter(notDeleted), [receivables]);
  const activeStockItems = useMemo(() => stockItems.filter(notDeleted), [stockItems]);
  const activeStockTx = useMemo(() => stockTx.filter(notDeleted), [stockTx]);
  const activeSales = useMemo(() => sales.filter(notDeleted), [sales]);
  const activeSaleReturns = useMemo(() => saleReturns.filter(notDeleted), [saleReturns]);
  const activePurchaseReturns = useMemo(() => purchaseReturns.filter(notDeleted), [purchaseReturns]);
  const activeSuppliers = useMemo(() => suppliers.filter(notDeleted), [suppliers]);
  const activePayables = useMemo(() => payables.filter(notDeleted), [payables]);
  const activeProductionBatches = useMemo(() => productionBatches.filter(notDeleted), [productionBatches]);
  const activePurchases = useMemo(() => purchases.filter(notDeleted), [purchases]);
  const activeOrders = useMemo(() => orders.filter(notDeleted), [orders]);
  const activeFixedAssets = useMemo(() => fixedAssets.filter(notDeleted), [fixedAssets]);

  const customerCodes = useMemo(() => buildCodeMap(customers, "CUST"), [customers]);
  // Category-prefixed so the code itself hints at what it is — FG-0003 vs
  // RM-0012 is unambiguous even before you've resolved the name, unlike a
  // single flat sequence would be.
  const stockItemCodes = useMemo(
    () => ({
      ...buildCodeMap(
        stockItems.filter((i) => i.category === "Raw Material"),
        "RM"
      ),
      ...buildCodeMap(
        stockItems.filter((i) => i.category === "Finished Good"),
        "FG"
      ),
    }),
    [stockItems]
  );
  const supplierCodes = useMemo(() => buildCodeMap(suppliers, "SUPP"), [suppliers]);
  const orderCodes = useMemo(() => buildCodeMap(orders, "ORD"), [orders]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    activeTransactions.forEach((t) => {
      if (t.nonCash) return; // e.g. purchase-return gain/loss: P&L only, no cash moved
      if (t.type === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    });
    const capitalIn = activeCapitalEntries
      .filter((c) => c.type === "contribution")
      .reduce((s, c) => s + Number(c.amount), 0);
    const capitalOut = activeCapitalEntries
      .filter((c) => c.type === "withdrawal")
      .reduce((s, c) => s + Number(c.amount), 0);
    const receivableCashIn = activeReceivables
      .filter((r) => r.type === "payment" && !r.nonCash)
      .reduce((s, r) => s + Number(r.amount), 0);
    const payableCashOut = activePayables
      .filter((p) => p.type === "payment" && !p.nonCash)
      .reduce((s, p) => s + Number(p.amount), 0);

    const byMethod = {};
    PAYMENT_METHODS.forEach((m) => (byMethod[m] = 0));
    activeTransactions.forEach((t) => {
      if (t.nonCash) return;
      const m = t.method || "cash";
      if (byMethod[m] === undefined) return;
      byMethod[m] += t.type === "income" ? Number(t.amount) : -Number(t.amount);
    });
    activeCapitalEntries.forEach((c) => {
      const m = c.method || "cash";
      if (byMethod[m] === undefined) return;
      byMethod[m] += c.type === "contribution" ? Number(c.amount) : -Number(c.amount);
    });
    activeReceivables.forEach((r) => {
      if (r.type !== "payment" || r.nonCash) return;
      const m = r.method || "cash";
      if (byMethod[m] === undefined) return;
      byMethod[m] += Number(r.amount);
    });
    activePayables.forEach((p) => {
      if (p.type !== "payment" || p.nonCash) return;
      const m = p.method || "cash";
      if (byMethod[m] === undefined) return;
      byMethod[m] -= Number(p.amount);
    });

    const cashBalance = income + capitalIn + receivableCashIn - expense - capitalOut - payableCashOut;
    return { income, expense, net: income - expense, cashBalance, capitalIn, capitalOut, byMethod };
  }, [activeTransactions, activeCapitalEntries, activeReceivables, activePayables]);

  const customerBalances = useMemo(() => {
    const map = {};
    activeCustomers.forEach((c) => (map[c.id] = { charged: 0, paid: 0 }));
    activeReceivables.forEach((r) => {
      if (!map[r.customerId]) return;
      if (r.type === "charge") map[r.customerId].charged += Number(r.amount);
      else map[r.customerId].paid += Number(r.amount);
    });
    return map;
  }, [activeCustomers, activeReceivables]);

  // Lifetime gross contribution per customer: what they've paid us minus the
  // FIFO cost of the goods they took. Shown as a small internal indicator on
  // the Customers tab only — deliberately never on a printed statement,
  // since our margin isn't the customer's business.
  const customerProfit = useMemo(() => {
    const cogsById = computeSaleCOGSMap(activeStockItems, activeStockTx);
    const map = {};
    const bump = (customerId, revenue, cogs) => {
      if (!customerId) return;
      if (!map[customerId]) map[customerId] = { revenue: 0, cogs: 0 };
      map[customerId].revenue += revenue;
      map[customerId].cogs += cogs;
    };
    // Only sales with a known cost basis count toward the margin. A sale with
    // no stock item selected (or an item that was never stocked in) has no
    // attributable cost, so including it would show revenue against zero cost
    // and push the margin toward 100% — badly misleading on an indicator you
    // might price off. Returns are always applied, so the figure errs low
    // rather than high.
    activeSales.forEach((s) => {
      const cogs = cogsById[s.id] || 0;
      if (cogs <= 0) return;
      bump(s.customerId, Number(s.cashAmount) + Number(s.creditAmount), cogs);
    });
    activeSaleReturns.forEach((r) =>
      bump(r.customerId, -(Number(r.cashRefund) + Number(r.creditReduction) - (Number(r.vatAmount) || 0)), cogsById[r.id] || 0)
    );
    const out = {};
    Object.entries(map).forEach(([customerId, m]) => {
      const profit = m.revenue - m.cogs;
      out[customerId] = {
        profit,
        revenue: m.revenue,
        // Average contribution per rupee of sales — comparable across
        // customers regardless of how much they buy.
        marginPercent: m.revenue > 0 ? (profit / m.revenue) * 100 : null,
      };
    });
    return out;
  }, [activeSales, activeSaleReturns, activeStockItems, activeStockTx]);

  const totalReceivable = useMemo(() => {
    return Object.values(customerBalances).reduce((s, b) => s + (b.charged - b.paid), 0);
  }, [customerBalances]);

  // VAT collected from customers is held on the government's behalf, not
  // ours — this is what's still owed to them: everything charged, minus
  // anything actually remitted. All-time by design, like receivables and
  // payables, since it's a running balance rather than a period figure.
  // VAT collected from customers, minus VAT already paid to suppliers on
  // our own purchases (a recoverable credit against what we owe — the
  // standard treatment for a registered business), minus VAT actually
  // remitted. All-time by design, like receivables and payables, since
  // it's a running balance rather than a period figure.
  // VAT collected from customers, minus VAT already paid to suppliers on
  // our own purchases (a recoverable credit against what we owe — the
  // standard treatment for a registered business), minus VAT actually
  // remitted — and returns reverse both sides: a sale return gives back
  // VAT we'd collected (reducing what we owe), a purchase return reverses
  // an input credit we'd claimed (increasing what we owe), since the goods
  // that credit was based on are going back. All-time by design, like
  // receivables and payables, since it's a running balance rather than a
  // period figure.
  const vatPayable = useMemo(() => {
    const collected = activeSales.reduce((s, x) => s + (Number(x.vatAmount) || 0), 0);
    const collectedReversed = activeSaleReturns.reduce((s, x) => s + (Number(x.vatAmount) || 0), 0);
    const paidOnPurchases = activePurchases.reduce((s, x) => s + (Number(x.vatAmount) || 0), 0);
    const paidReversed = activePurchaseReturns.reduce((s, x) => s + (Number(x.vatAmount) || 0), 0);
    const remitted = activeTransactions
      .filter((t) => t.category === "VAT Payment")
      .reduce((s, t) => s + Number(t.amount), 0);
    return collected - collectedReversed - (paidOnPurchases - paidReversed) - remitted;
  }, [activeSales, activeSaleReturns, activePurchases, activePurchaseReturns, activeTransactions]);

  const stockFIFO = useMemo(() => {
    const map = {};
    activeStockItems.forEach((item) => {
      const txForItem = activeStockTx
        .filter((t) => t.itemId === item.id)
        .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
      const batches = [];
      let shortfall = 0;
      txForItem.forEach((t) => {
        if (t.type === "in") {
          batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0, date: t.date });
        } else {
          let toConsume = Number(t.quantity);
          while (toConsume > 0 && batches.length > 0) {
            const b = batches[0];
            const consumed = Math.min(b.qty, toConsume);
            b.qty -= consumed;
            toConsume -= consumed;
            if (b.qty <= 0.0000001) batches.shift();
          }
          if (toConsume > 0) shortfall += toConsume;
        }
      });
      const currentQty = batches.reduce((s, b) => s + b.qty, 0);
      const currentValue = batches.reduce((s, b) => s + b.qty * b.unitCost, 0);
      map[item.id] = {
        batches,
        currentQty,
        currentValue,
        avgCost: currentQty > 0 ? currentValue / currentQty : 0,
        shortfall,
      };
    });
    return map;
  }, [activeStockItems, activeStockTx]);

  // Cost price for pricing purposes uses the FULL cost of the most recent
  // production batch (material + labor + overhead) — not the material-only
  // FIFO value carried in inventory. Those are deliberately different
  // numbers now: the Balance Sheet only capitalizes material cost, but a
  // business setting a selling price needs to know the true full cost of
  // making the thing, labor and overhead included, or risks pricing at a
  // loss without realizing it.
  // Shelf-life tracking, derived entirely from data already being entered:
  // each remaining FIFO batch knows its stock-in date, so batch expiry is
  // just that date plus the item's shelf life. One honest assumption baked
  // in: this matches reality only if physical stock is also rotated
  // oldest-first — the same assumption FIFO costing already makes.
  const expiryStatus = useMemo(() => {
    const today = todayISO();
    const map = {};
    activeStockItems.forEach((item) => {
      const shelfLife = Number(item.shelfLifeDays) || 0;
      if (shelfLife <= 0) return;
      const batches = (stockFIFO[item.id]?.batches || []).filter((b) => b.qty > 0.0000001);
      if (batches.length === 0) return;
      const detailed = batches.map((b) => {
        // All-UTC date math: parsing with a "Z" suffix and stepping via
        // setUTCDate keeps parse and serialize in the same timezone.
        // (Parsing as local then serializing via toISOString shifts the
        // date back a day anywhere east of UTC — including Nepal.)
        const expiry = new Date(b.date + "T00:00:00Z");
        expiry.setUTCDate(expiry.getUTCDate() + shelfLife);
        const expiryDate = expiry.toISOString().slice(0, 10);
        const daysLeft = daysBetween(today, expiryDate);
        return { qty: b.qty, stockedDate: b.date, expiryDate, daysLeft };
      });
      const expiredQty = detailed.filter((b) => b.daysLeft < 0).reduce((s, b) => s + b.qty, 0);
      const soonThreshold = Math.min(Math.max(3, Math.min(7, Math.round(shelfLife * 0.2))), Math.max(1, shelfLife - 1));
      const expiringSoonQty = detailed.filter((b) => b.daysLeft >= 0 && b.daysLeft <= soonThreshold).reduce((s, b) => s + b.qty, 0);
      map[item.id] = { batches: detailed, expiredQty, expiringSoonQty, soonThreshold };
    });
    return map;
  }, [activeStockItems, stockFIFO]);

  const expiryAlerts = useMemo(() => {
    return activeStockItems
      .map((item) => {
        const st = expiryStatus[item.id];
        if (!st || (st.expiredQty <= 0 && st.expiringSoonQty <= 0)) return null;
        return { item, ...st };
      })
      .filter(Boolean)
      .sort((a, b) => b.expiredQty - a.expiredQty);
  }, [activeStockItems, expiryStatus]);

  const finishedGoodPricing = useMemo(() => {
    const map = {};
    activeStockItems
      .filter((i) => i.category === "Finished Good")
      .forEach((item) => {
        const batchesForItem = activeProductionBatches
          .filter((b) => b.outputItemId === item.id && Number(b.outputQuantity) > 0)
          .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
        const mostRecent = batchesForItem[batchesForItem.length - 1];
        const fromProduction = mostRecent ? mostRecent.totalCost / Number(mostRecent.outputQuantity) : null;
        const costPrice = fromProduction !== null ? fromProduction : stockFIFO[item.id]?.avgCost || 0;
        const margin = Number(item.minMarginPercent) || 0;
        map[item.id] = {
          costPrice,
          costSource: fromProduction !== null ? "production" : "inventory",
          minSellingPrice: costPrice * (1 + margin / 100),
          marginPercent: margin,
        };
      });
    return map;
  }, [activeStockItems, activeProductionBatches, stockFIFO]);

  const totalInventoryValue = useMemo(() => {
    return Object.values(stockFIFO).reduce((s, v) => s + v.currentValue, 0);
  }, [stockFIFO]);

  const lowStockItems = useMemo(() => {
    return activeStockItems.filter((i) => i.reorderLevel > 0 && (stockFIFO[i.id]?.currentQty || 0) <= i.reorderLevel);
  }, [activeStockItems, stockFIFO]);

  const productionNeeds = useMemo(() => {
    const pending = activeOrders.filter((o) => o.status === "pending" || o.status === "in production");
    const map = {};
    pending.forEach((o) => {
      if (!o.itemId) return;
      map[o.itemId] = (map[o.itemId] || 0) + Number(o.quantity);
    });
    return Object.entries(map).map(([itemId, ordered]) => {
      const item = activeStockItems.find((i) => i.id === itemId);
      const available = stockFIFO[itemId]?.currentQty || 0;
      return { itemId, item, ordered, available, shortfall: Math.max(0, ordered - available) };
    });
  }, [activeOrders, activeStockItems, stockFIFO]);

  const openOrdersCount = useMemo(
    () => activeOrders.filter((o) => o.status === "pending" || o.status === "in production").length,
    [activeOrders]
  );

  const supplierBalances = useMemo(() => {
    const map = {};
    activeSuppliers.forEach((s) => (map[s.id] = { charged: 0, paid: 0 }));
    activePayables.forEach((p) => {
      if (!map[p.supplierId]) return;
      if (p.type === "charge") map[p.supplierId].charged += Number(p.amount);
      else map[p.supplierId].paid += Number(p.amount);
    });
    return map;
  }, [activeSuppliers, activePayables]);

  const totalPayable = useMemo(() => {
    return Object.values(supplierBalances).reduce((s, b) => s + (b.charged - b.paid), 0);
  }, [supplierBalances]);

  const partnerBalances = useMemo(() => {
    const map = {};
    PARTNERS.forEach((p) => (map[p] = { contributed: 0, withdrawn: 0 }));
    activeCapitalEntries.forEach((c) => {
      if (!map[c.partner]) return;
      if (c.type === "contribution") map[c.partner].contributed += Number(c.amount);
      else map[c.partner].withdrawn += Number(c.amount);
    });
    return map;
  }, [activeCapitalEntries]);

  // Net worth via the balance sheet, not the income statement — this way it's
  // unaffected by cash-vs-credit timing quirks: whatever cash you're holding,
  // plus what customers owe you, plus what your stock is worth, minus what
  // you owe suppliers, is the business's true worth right now.
  const businessNetWorth = useMemo(() => {
    return totals.cashBalance + totalReceivable + totalInventoryValue - totalPayable;
  }, [totals.cashBalance, totalReceivable, totalInventoryValue, totalPayable]);

  const chartData = useMemo(() => {
    const byMonth = {};
    activeTransactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { month, income: 0, expense: 0 };
      if (t.type === "income") byMonth[month].income += Number(t.amount);
      else byMonth[month].expense += Number(t.amount);
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [activeTransactions]);

  const dailySalesData = useMemo(() => {
    const byDay = {};
    activeSales.forEach((s) => {
      const total = Number(s.cashAmount) + Number(s.creditAmount);
      if (!byDay[s.date]) byDay[s.date] = { date: s.date, total: 0 };
      byDay[s.date].total += total;
    });
    activeSaleReturns.forEach((r) => {
      const total = Number(r.cashRefund) + Number(r.creditReduction);
      if (!byDay[r.date]) byDay[r.date] = { date: r.date, total: 0 };
      byDay[r.date].total -= total;
    });
    return Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [activeSales, activeSaleReturns]);

  const todaysSales = useMemo(() => {
    const today = todayISO();
    const gross = activeSales
      .filter((s) => s.date === today)
      .reduce((sum, s) => sum + Number(s.cashAmount) + Number(s.creditAmount), 0);
    const returned = activeSaleReturns
      .filter((r) => r.date === today)
      .reduce((sum, r) => sum + Number(r.cashRefund) + Number(r.creditReduction), 0);
    return gross - returned;
  }, [activeSales, activeSaleReturns]);

  const dailyProfitData = useMemo(() => {
    const cogsByDay = computeDailyCOGSMap(activeStockItems, activeStockTx);
    const byDay = {};
    activeSales.forEach((s) => {
      if (!byDay[s.date]) byDay[s.date] = { date: s.date, profit: 0 };
      byDay[s.date].profit += Number(s.cashAmount) + Number(s.creditAmount) - (Number(s.vatAmount) || 0);
    });
    activeSaleReturns.forEach((r) => {
      if (!byDay[r.date]) byDay[r.date] = { date: r.date, profit: 0 };
      byDay[r.date].profit -= Number(r.cashRefund) + Number(r.creditReduction) - (Number(r.vatAmount) || 0);
    });
    activeTransactions
      .filter((t) => !t.saleId && !t.returnId && !t.purchaseId && !t.fixedAssetId && !t.isReversal && t.category !== "VAT Payment" && t.category !== "Partner Capital Contribution")
      .forEach((t) => {
        if (!byDay[t.date]) byDay[t.date] = { date: t.date, profit: 0 };
        byDay[t.date].profit += t.type === "income" ? Number(t.amount) : -Number(t.amount);
      });
    Object.entries(cogsByDay).forEach(([date, cogs]) => {
      if (!byDay[date]) byDay[date] = { date, profit: 0 };
      byDay[date].profit -= cogs;
    });
    return Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [activeSales, activeSaleReturns, activeStockItems, activeStockTx, activeTransactions]);

  // Today's profit and the aggregate income/expense cards use the same
  // accrual engine as the Accounting tab — full sale value recognized at
  // time of sale, FIFO-matched cost of goods sold, and fixed-asset
  // depreciation — so a credit sale shows up as real profit the day it's
  // made, not only once (or never) when cash eventually changes hands.
  const todaysProfit = useMemo(() => {
    const today = todayISO();
    const stmt = computeIncomeStatement({
      sales: activeSales,
      saleReturns: activeSaleReturns,
      transactions: activeTransactions,
      stockItems: activeStockItems,
      stockTx: activeStockTx,
      startDate: today,
      endDate: today,
    });
    const depreciation = activeFixedAssets.reduce((s, f) => s + computeFixedAssetPeriodExpense(f, today, today), 0);
    return stmt.netProfit - depreciation;
  }, [activeSales, activeSaleReturns, activeTransactions, activeStockItems, activeStockTx, activeFixedAssets]);

  const accrualSummary = useMemo(() => {
    const today = todayISO();
    const stmt = computeIncomeStatement({
      sales: activeSales,
      saleReturns: activeSaleReturns,
      transactions: activeTransactions,
      stockItems: activeStockItems,
      stockTx: activeStockTx,
      startDate: null,
      endDate: today,
    });
    const depreciation = activeFixedAssets.reduce((s, f) => s + computeFixedAssetPeriodExpense(f, null, today), 0);
    return {
      totalRevenue: stmt.totalRevenue,
      totalExpenses: stmt.cogs + stmt.totalOpEx + depreciation,
      netProfit: stmt.netProfit - depreciation,
    };
  }, [activeSales, activeSaleReturns, activeTransactions, activeStockItems, activeStockTx, activeFixedAssets]);

  const categoryBreakdown = useMemo(() => {
    const map = {};
    activeTransactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [activeTransactions]);

  const filteredTx = useMemo(() => {
    return activeTransactions.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterPartner !== "all" && t.partner !== filterPartner) return false;
      if (search && !(`${t.category} ${t.note || ""}`.toLowerCase().includes(search.toLowerCase())))
        return false;
      return true;
    });
  }, [activeTransactions, filterType, filterPartner, search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--page-bg, #F6F1E4)" }}>
        <p className="pulse-attention" style={{ fontFamily: "Georgia, serif", color: "var(--ink, #2B2621)" }}>
          Opening the ledger…
        </p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      data-theme={effectiveTheme}
      style={{
        background: "var(--page-bg)",
        backgroundImage:
          "radial-gradient(rgba(var(--ink-rgb),0.035) 1px, transparent 1px), radial-gradient(rgba(var(--ink-rgb),0.025) 1px, transparent 1px)",
        backgroundSize: "3px 3px, 7px 7px",
        backgroundPosition: "0 0, 2px 3px",
        color: "var(--ink)",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <style>{`
        :root {
          --page-bg: #F6F1E4;
          --card-bg: #FFFDF8;
          --ink: #2B2621;
          --ink-rgb: 43,38,33;
          --surface-2: #F0EBDD;
          --ink-surface: #2B2621;
          --accent-gold: #C08A2E;
          --accent-red: #A63D40;
          --accent-forest: #3F5D42;
          --accent-blue: #3A5A78;
          --accent-brown: #6B4226;
          --accent-plum: #6B4C5C;
          --alert-red-bg: #F3E2E2;
          --alert-brown-bg: #F5EAD9;
          --alert-gold-bg: #F5EFDD;
          --alert-gold-text: #8B6215;
          --on-dark: #F6F1E4;
          --btn-red: #A63D40;
          --btn-forest: #3F5D42;
          --btn-brown: #6B4226;
          --btn-blue: #3A5A78;
        }
        /* Warm dark palette to match the ledger-paper character, rather
           than a generic cold blue-gray dark mode — aged paper at night,
           not a code editor. Accent colors are lightened, not just
           inverted — the originals were tuned for contrast against light
           paper and are barely legible on a dark background otherwise
           (verified: several dropped below a 1.5:1 contrast ratio, well
           under the ~4.5:1 needed for readable text). These variants keep
           the same hue and were checked to land at 5:1 or better.
           --ink-surface, --on-dark, and --btn-* deliberately do NOT flip
           with the theme. They're always paired together — a dark surface
           with light text on it (buttons, the header band) — and that
           pairing needs to stay dark+light regardless of overall theme, or
           the text goes invisible the moment the surface "helpfully"
           lightens along with the rest of the page. --accent-red/forest/
           brown DO still flip, and stay in use for on-page text/borders,
           which is a different job with the opposite requirement. */
        [data-theme="dark"] {
          color-scheme: dark;
          --page-bg: #1C1A17;
          --card-bg: #27231D;
          --ink: #ECE4D6;
          --ink-rgb: 236,228,214;
          --surface-2: #342E26;
          --ink-surface: #100E0C;
          --accent-gold: #E2B05A;
          --accent-red: #D26B6E;
          --accent-forest: #89B48D;
          --accent-blue: #779FC5;
          --accent-brown: #D39469;
          --accent-plum: #B18B9F;
          --alert-red-bg: #3A2426;
          --alert-brown-bg: #332A1E;
          --alert-gold-bg: #332C1C;
          --alert-gold-text: #E2B05A;
          --on-dark: #F6F1E4;
          --btn-red: #A63D40;
          --btn-forest: #3F5D42;
          --btn-brown: #6B4226;
          --btn-blue: #3A5A78;
        }

        .ledger-rule { border-bottom: 1px solid rgba(var(--ink-rgb),0.15); transition: background-color 150ms ease; }
        .double-underline { border-bottom: 3px double var(--ink); }
        .mono-num { font-variant-numeric: tabular-nums; font-family: 'Courier New', monospace; }
        /* Anything clickable that drills into another section: lifts slightly
           and shows a gold edge, so it reads as a doorway not just a number. */
        .drill-through { position: relative; transition: transform 140ms ease, box-shadow 140ms ease; }
        .drill-through:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(var(--ink-rgb),0.16); }
        .drill-through:active { transform: translateY(0); }
        .drill-row { cursor: pointer; border-radius: 4px; transition: background-color 140ms ease, padding-left 140ms ease; }
        .drill-row:hover { background-color: rgba(192,138,46,0.12); padding-left: 4px; }
        .margin-rule { border-left: 3px solid var(--accent-red); }

        /* Base surfaces — layered shadows simulate a light source from above,
           giving cards real lift off the page rather than a flat cutout. */
        .card-surface {
          background: linear-gradient(180deg, #FFFEFC 0%, var(--card-bg) 100%);
          border: 1px solid rgba(var(--ink-rgb),0.1);
          border-radius: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.7),
            0 1px 2px rgba(var(--ink-rgb),0.05),
            0 6px 16px rgba(var(--ink-rgb),0.08);
          transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
        }
        .card-surface:hover {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.8),
            0 2px 4px rgba(var(--ink-rgb),0.07),
            0 16px 28px rgba(var(--ink-rgb),0.13);
          border-color: rgba(var(--ink-rgb),0.16);
        }

        [data-card] {
          border-radius: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.6),
            0 1px 2px rgba(var(--ink-rgb),0.05),
            0 4px 12px rgba(var(--ink-rgb),0.07);
          transition: box-shadow 200ms ease, border-color 200ms ease;
        }

        /* Buttons — a subtle bevel (light top edge, shadow beneath) so they
           read as physical, pressable surfaces rather than flat labels. */
        button {
          border-radius: 6px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(var(--ink-rgb),0.12), 0 2px 5px rgba(var(--ink-rgb),0.08);
          transition: transform 120ms ease, box-shadow 150ms ease, filter 150ms ease, background-color 150ms ease, opacity 150ms ease;
        }
        button:hover:not(:disabled) {
          filter: brightness(1.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 4px rgba(var(--ink-rgb),0.15), 0 5px 12px rgba(var(--ink-rgb),0.12);
        }
        button:active:not(:disabled) {
          transform: translateY(1px) scale(0.97);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }
        button:disabled { cursor: not-allowed; box-shadow: none; }
        button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px var(--accent-gold);
        }

        /* Inputs */
        input, select {
          outline: none;
          border-radius: 6px;
          transition: box-shadow 150ms ease, border-color 150ms ease;
        }
        input:focus, select:focus { box-shadow: 0 0 0 3px rgba(192,138,46,0.28); border-color: var(--accent-gold); }

        /* Row hover highlight for ledger lists */
        .ledger-rule:hover { background-color: rgba(192,138,46,0.05); }

        /* Nav tabs */
        .nav-tab {
          position: relative;
          transition: color 200ms ease, background-color 200ms ease;
        }
        .nav-tab:hover { background-color: rgba(246,241,228,0.06); }
        .nav-tab .nav-underline {
          position: absolute;
          left: 12px;
          right: 12px;
          bottom: 0;
          height: 3px;
          background: var(--accent-gold);
          border-radius: 3px 3px 0 0;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 220ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        .nav-tab.active .nav-underline { transform: scaleX(1); }

        .nav-scroll { scrollbar-width: thin; scrollbar-color: rgba(246,241,228,0.35) transparent; }
        .nav-scroll::-webkit-scrollbar { height: 4px; }
        .nav-scroll::-webkit-scrollbar-thumb { background: rgba(246,241,228,0.35); border-radius: 2px; }

        /* Tab content fade-in */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .tab-content { animation: fadeInUp 260ms cubic-bezier(0.16, 1, 0.3, 1); }

        /* Modal entrance */
        @keyframes backdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes backdropOut {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes modalOut {
          from { opacity: 1; transform: translateY(0) scale(1); }
          to { opacity: 0; transform: translateY(6px) scale(0.97); }
        }
        .modal-backdrop { animation: backdropIn 180ms ease; }
        .modal-backdrop-out { animation: backdropOut 180ms ease forwards; }
        .modal-panel-out { animation: modalOut 180ms cubic-bezier(0.4, 0, 1, 1) forwards; }
        .modal-panel { animation: modalIn 220ms cubic-bezier(0.16, 1, 0.3, 1); }

        /* Alert banners slide in */
        @keyframes slideDownFade {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .alert-in { animation: slideDownFade 220ms ease; }

        /* List rows cascade in one after another, rather than snapping in */
        @keyframes rowIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .row-in { animation: rowIn 360ms cubic-bezier(0.16, 1, 0.3, 1) backwards; }

        /* A gentle pulse for things that genuinely need attention —
           low stock, overdue balances — motion as a signal, used sparingly */
        @keyframes gentlePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.55; }
        }
        .pulse-attention { animation: gentlePulse 1.8s ease-in-out infinite; }

        /* Dashboard cards settle with a tiny overshoot once their number
           finishes counting up, instead of just appearing */
        @keyframes cardPop {
          0% { transform: scale(0.97); }
          60% { transform: scale(1.015); }
          100% { transform: scale(1); }
        }
        .card-pop { animation: cardPop 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }

        /* Sidebar icons give a little bounce as their label reveals */
        @keyframes iconPop {
          0% { transform: scale(0.65) rotate(-8deg); }
          55% { transform: scale(1.18) rotate(3deg); }
          100% { transform: scale(1) rotate(0deg); }
        }
        .icon-pop { animation: iconPop 420ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards; }

        /* Active tab's indicator bar grows from the center each time it lands */
        @keyframes indicatorGrow {
          from { transform: scaleY(0); opacity: 0; }
          to { transform: scaleY(1); opacity: 1; }
        }
        .tab-indicator { animation: indicatorGrow 280ms cubic-bezier(0.34, 1.56, 0.64, 1); transform-origin: center; }

        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
        }

        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .barcode-print-area, .barcode-print-area * { visibility: visible; }
          .barcode-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .print-full-width { max-width: none !important; width: 100% !important; max-height: none !important; overflow: visible !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="flex" style={{ minHeight: "100vh" }}>
        {(() => {
          const allTabs = [
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
            { id: "insights", label: "Insights", icon: Lightbulb, partnerOnly: true },
            { id: "search", label: "Search", icon: Search },
            { id: "transactions", label: "Transactions", icon: Receipt },
            { id: "orders", label: "Orders", icon: ClipboardList, partnerOnly: true },
            { id: "sales", label: "Sales", icon: ShoppingCart },
            { id: "customers", label: "Customers", icon: Users },
            { id: "suppliers", label: "Suppliers", icon: Truck },
            { id: "stock", label: "Stock", icon: Package },
            { id: "production", label: "Production", icon: Factory },
            { id: "capital", label: "Partner Capital", icon: Wallet, partnerOnly: true },
            { id: "accounting", label: "Accounting", icon: Calculator, partnerOnly: true },
            { id: "backup", label: "Backup", icon: Download, partnerOnly: true },
            { id: "activity", label: "Activity", icon: Activity, partnerOnly: true },
            { id: "team", label: "Team", icon: ShieldCheck, superAdminOnly: true },
          ].filter((t) => (!t.partnerOnly || isAdmin) && (!t.superAdminOnly || isSuperAdmin));
          return (
            <aside
              ref={sidebarRef}
              onClick={() => setSidebarExpanded(true)}
              style={{
                width: sidebarExpanded ? 210 : 60,
                flexShrink: 0,
                background: "linear-gradient(180deg, #332F2B 0%, var(--ink-surface) 60%, #251F1B 100%)",
                position: "sticky",
                top: 0,
                height: "100vh",
                overflowY: "auto",
                overflowX: "hidden",
                zIndex: 20,
                boxShadow: "3px 0 12px rgba(0,0,0,0.2)",
                transition: "width 380ms cubic-bezier(0.34, 1.56, 0.64, 1)",
                willChange: "width",
                cursor: sidebarExpanded ? "default" : "pointer",
              }}
            >
              <div className="flex items-center justify-between" style={{ padding: "18px 21px" }}>
                <div className="flex items-center" style={{ gap: 10 }}>
                  <svg viewBox="0 0 60 40" width="26" height="18" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
                    <polygon points="4,36 19,9 34,36" fill="var(--accent-gold)" opacity="0.85" />
                    <polygon points="19,36 34,6 49,36" fill="var(--page-bg)" opacity="0.9" />
                    <polygon points="34,36 49,13 58,36" fill="var(--accent-gold)" opacity="0.7" />
                  </svg>
                  <span
                    style={{
                      fontFamily: "Georgia, serif",
                      fontSize: "0.95rem",
                      color: "var(--on-dark)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      display: "inline-block",
                      maxWidth: sidebarExpanded ? 160 : 0,
                      opacity: sidebarExpanded ? 1 : 0,
                      transition: `max-width 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity ${sidebarExpanded ? "260ms ease 100ms" : "120ms ease"}`,
                    }}
                  >
                    Trikut Snacks
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSidebarExpanded(false);
                  }}
                  style={{
                    color: "rgba(246,241,228,0.5)",
                    opacity: sidebarExpanded ? 1 : 0,
                    width: sidebarExpanded ? 24 : 0,
                    overflow: "hidden",
                    transition: `opacity ${sidebarExpanded ? "220ms ease 140ms" : "100ms ease"}, width 320ms cubic-bezier(0.16, 1, 0.3, 1)`,
                    pointerEvents: sidebarExpanded ? "auto" : "none",
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
              </div>

              {allTabs.map((t, i) => {
                const revealDelay = sidebarExpanded ? Math.min(i, 10) * 22 + 60 : 0;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    title={t.label}
                    className="row-in flex items-center w-full"
                    style={{
                      position: "relative",
                      padding: "11px 21px",
                      gap: 12,
                      background: tab === t.id ? "rgba(192,138,46,0.15)" : "transparent",
                      color: tab === t.id ? "var(--page-bg)" : "rgba(246,241,228,0.65)",
                      animationDelay: `${i * 20}ms`,
                      transition: "background-color 150ms ease",
                    }}
                  >
                    {tab === t.id && (
                      <span
                        key={tab}
                        className="tab-indicator"
                        style={{ position: "absolute", left: 0, top: 4, bottom: 4, width: 3, background: "var(--accent-gold)" }}
                      />
                    )}
                    <span key={sidebarExpanded ? "exp" : "col"} className="icon-pop" style={{ display: "flex", animationDelay: `${revealDelay}ms` }}>
                      <t.icon size={18} style={{ flexShrink: 0 }} />
                    </span>
                    <span
                      style={{
                        fontSize: "0.85rem",
                        fontWeight: tab === t.id ? 600 : 400,
                        lineHeight: 1.15,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        display: "inline-block",
                        maxWidth: sidebarExpanded ? 160 : 0,
                        opacity: sidebarExpanded ? 1 : 0,
                        transform: sidebarExpanded ? "translateX(0)" : "translateX(-6px)",
                        transition: `max-width 300ms cubic-bezier(0.16, 1, 0.3, 1) ${revealDelay}ms, opacity 220ms ease ${revealDelay}ms, transform 260ms cubic-bezier(0.16, 1, 0.3, 1) ${revealDelay}ms`,
                      }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </aside>
          );
        })()}

        <div style={{ flex: 1, minWidth: 0 }}>
      {/* Header */}
      <header
        className="margin-rule"
        style={{
          background: "linear-gradient(180deg, #332F2B 0%, var(--ink-surface) 60%, #251F1B 100%)",
          color: "var(--on-dark)",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div className="max-w-5xl mx-auto px-6 pt-3 flex items-center justify-between" style={{ fontSize: "0.72rem", opacity: 0.7 }}>
          <span>
            {userLabel && (
              <>
                {getGreeting()}, {getFirstName(userLabel)} ·{" "}
                {isSuperAdmin ? "Super Admin Account" : isAdmin ? "Admin Account" : "Staff Account"}
              </>
            )}
          </span>
          <div className="flex items-center gap-3">
            <div className="flex gap-1" title="Theme">
              {[
                { id: "light", Icon: Sun, label: "Light" },
                { id: "dark", Icon: Moon, label: "Dark" },
                { id: "system", Icon: Monitor, label: "System" },
              ].map(({ id, Icon, label }) => (
                <button
                  key={id}
                  onClick={() => saveTheme(id)}
                  title={label}
                  style={{
                    padding: "3px 5px",
                    opacity: theme === id ? 1 : 0.5,
                    background: theme === id ? "var(--surface-2)" : "transparent",
                    borderRadius: 3,
                  }}
                >
                  <Icon size={13} />
                </button>
              ))}
            </div>
            {onLogout && userLabel && (
              <button onClick={onLogout} className="underline">
                Log out
              </button>
            )}
          </div>
        </div>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 60 40" width="34" height="24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <polygon points="4,36 19,9 34,36" fill="var(--accent-gold)" opacity="0.85" />
              <polygon points="19,36 34,6 49,36" fill="var(--page-bg)" opacity="0.9" />
              <polygon points="34,36 49,13 58,36" fill="var(--accent-gold)" opacity="0.7" />
            </svg>
            <div>
              <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.6rem", letterSpacing: "0.02em" }}>
                Trikut Snacks
              </h1>
              <p style={{ fontSize: "0.8rem", opacity: 0.75, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Three Peaks, One Great Taste — Ledger
              </p>
            </div>
          </div>
          {isAdmin && (
            <div className="text-right">
              <p className="mono-num" style={{ fontSize: "1.4rem", color: totals.cashBalance >= 0 ? "#D7B872" : "#C0605F" }}>
                {formatNPR(totals.cashBalance)}
              </p>
              <p style={{ fontSize: "0.7rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                Total funds (cash + bank + eSewa)
              </p>
            </div>
          )}
        </div>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="alert-in" style={{ background: "var(--alert-red-bg)", border: "1px solid var(--accent-red)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem" }}>
            {error}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div key={tab} className="tab-content">
        {tab === "dashboard" && (
          <Dashboard
            role={isAdmin ? "partner" : "staff"}
            totals={totals}
            accrualSummary={accrualSummary}
            chartData={chartData}
            categoryBreakdown={categoryBreakdown}
            recent={transactions.slice(0, 6)}
            totalReceivable={totalReceivable}
            totalInventoryValue={totalInventoryValue}
            lowStockItems={lowStockItems}
            expiryAlerts={expiryAlerts}
            stockFIFO={stockFIFO}
            totalPayable={totalPayable}
            openOrdersCount={openOrdersCount}
            dailySalesData={dailySalesData}
            todaysSales={todaysSales}
            dailyProfitData={dailyProfitData}
            todaysProfit={todaysProfit}
            onOpenDailyReport={() => setShowDailyReport(true)}
            lastBackup={lastBackup}
            onNavigate={setTab}
          />
        )}

        {tab === "search" && (
          <SearchView
            role={isAdmin ? "partner" : "staff"}
            orders={activeOrders}
            customers={activeCustomers}
            suppliers={activeSuppliers}
            customerCodes={customerCodes}
            supplierCodes={supplierCodes}
            orderCodes={orderCodes}
            customerBalances={customerBalances}
            supplierBalances={supplierBalances}
            stockItems={stockItems}
            sales={activeSales}
            saleReturns={activeSaleReturns}
            onOpenStatement={(type, id) => setStatementTarget({ type, id })}
            onOpenBill={(entry, kind) => setBillEntry({ kind, entry })}
          />
        )}

        {tab === "transactions" && (
          <TransactionsView
            role={isAdmin ? "partner" : "staff"}
            transactions={filteredTx}
            filterType={filterType}
            setFilterType={setFilterType}
            filterPartner={filterPartner}
            setFilterPartner={setFilterPartner}
            search={search}
            setSearch={setSearch}
            onAdd={() => setShowTxForm(true)}
            onEdit={(t) => {
              setEditingTx(t);
              setShowTxForm(true);
            }}
            onDelete={deleteTransaction}
            activeRecurringTemplates={activeRecurringTemplates}
            dueRecurringTemplates={dueRecurringTemplates}
            onAddRecurring={() => {
              setEditingRecurring(null);
              setShowRecurringForm(true);
            }}
            onEditRecurring={(r) => {
              setEditingRecurring(r);
              setShowRecurringForm(true);
            }}
            onDeleteRecurring={deleteRecurringTemplate}
            onRecordRecurring={recordRecurringTransaction}
            onToggleRecurring={upsertRecurringTemplate}
          />
        )}
        {showRecurringForm && (
          <RecurringTemplateForm
            allExpenseCategories={allExpenseCategories}
            onAddCategory={addExpenseCategory}
            editEntry={editingRecurring}
            actor={actor}
            onSave={upsertRecurringTemplate}
            onClose={() => {
              setShowRecurringForm(false);
              setEditingRecurring(null);
            }}
          />
        )}

        {tab === "capital" && isAdmin && (
          <CapitalView
            partnerBalances={partnerBalances}
            capitalEntries={activeCapitalEntries}
            onAdd={() => setShowCapForm(true)}
            onEdit={(c) => {
              setEditingCap(c);
              setShowCapForm(true);
            }}
            onDelete={deleteCapitalEntry}
            businessNetWorth={businessNetWorth}
            totals={totals}
            totalReceivable={totalReceivable}
            totalInventoryValue={totalInventoryValue}
            totalPayable={totalPayable}
            ownership={ownership || defaultOwnership()}
            onUpdateOwnership={updateOwnershipPercent}
          />
        )}

        {tab === "accounting" && isAdmin && (
          <AccountingView
            activeSales={activeSales}
            activeSaleReturns={activeSaleReturns}
            activePurchases={activePurchases}
            activePurchaseReturns={activePurchaseReturns}
            activeTransactions={activeTransactions}
            activeStockItems={activeStockItems}
            activeStockTx={activeStockTx}
            totals={totals}
            totalReceivable={totalReceivable}
            totalPayable={totalPayable}
            vatPayable={vatPayable}
            vatSettings={vatSettings}
            onSaveVatSettings={saveVatSettings}
            onRecordVatPayment={recordVatPayment}
            stockFIFO={stockFIFO}
            partnerBalances={partnerBalances}
            activeCustomers={activeCustomers}
            activeSuppliers={activeSuppliers}
            activeReceivables={activeReceivables}
            activePayables={activePayables}
            customerCodes={customerCodes}
            supplierCodes={supplierCodes}
            fixedAssets={activeFixedAssets}
            onAddFixedAsset={() => setShowFixedAssetForm(true)}
            onEditFixedAsset={(f) => {
              setEditingFixedAsset(f);
              setShowFixedAssetForm(true);
            }}
            onDeleteFixedAsset={deleteFixedAsset}
          />
        )}

        {tab === "insights" && isAdmin && (
          <InsightsView
            onNavigate={setTab}
            onOpenStatement={(id) => setStatementTarget({ type: "customer", id })}
            activeSales={activeSales}
            activeSaleReturns={activeSaleReturns}
            activeStockItems={activeStockItems}
            activeStockTx={activeStockTx}
            activeProductionBatches={activeProductionBatches}
            activeCustomers={activeCustomers}
            customerCodes={customerCodes}
            finishedGoodPricing={finishedGoodPricing}
            stockFIFO={stockFIFO}
            totalReceivable={totalReceivable}
            activeReceivables={activeReceivables}
          />
        )}

        {tab === "backup" && isAdmin && (
          <div className="space-y-10">
            <BackupView
              transactions={transactions}
              capitalEntries={capitalEntries}
              recurringTemplates={recurringTemplates}
              customers={customers}
              receivables={receivables}
              stockItems={stockItems}
              stockTx={stockTx}
              sales={sales}
              saleReturns={saleReturns}
              suppliers={suppliers}
              payables={payables}
              productionBatches={productionBatches}
              purchases={purchases}
              purchaseReturns={purchaseReturns}
              orders={orders}
              fixedAssets={fixedAssets}
              locations={locations}
              ownership={ownership}
              vatSettings={vatSettings}
              customExpenseCategories={customExpenseCategories}
              lastBackup={lastBackup}
              onRecordBackup={recordBackup}
            />

            <div style={{ borderTop: "1px solid rgba(var(--ink-rgb),0.15)", paddingTop: 32 }}>
              <TrashView
                transactions={transactions}
                capitalEntries={capitalEntries}
                recurringTemplates={recurringTemplates}
                customers={customers}
                receivables={receivables}
                stockItems={stockItems}
                stockTx={stockTx}
                sales={sales}
                saleReturns={saleReturns}
                suppliers={suppliers}
                payables={payables}
                productionBatches={productionBatches}
                purchases={purchases}
                purchaseReturns={purchaseReturns}
                orders={orders}
                fixedAssets={fixedAssets}
                onRestoreTransaction={restoreTransaction}
                onRestoreCapitalEntry={restoreCapitalEntry}
                onRestoreRecurringTemplate={restoreRecurringTemplate}
                onRestoreCustomer={restoreCustomer}
                onRestoreReceivable={restoreReceivable}
                onRestoreStockItem={restoreStockItem}
                onRestoreStockTx={restoreStockTx}
                onRestoreSale={restoreSale}
                onRestoreSaleReturn={restoreSaleReturn}
                onRestoreSupplier={restoreSupplier}
                onRestorePayable={restorePayable}
                onRestoreProductionBatch={restoreProductionBatch}
                onRestorePurchase={restorePurchase}
                onRestorePurchaseReturn={restorePurchaseReturn}
                onRestoreOrder={restoreOrder}
                onRestoreFixedAsset={restoreFixedAsset}
              />
            </div>
          </div>
        )}

        {tab === "activity" && isAdmin && (
          <ActivityLogView
            transactions={transactions}
            capitalEntries={capitalEntries}
            customers={customers}
            receivables={receivables}
            stockItems={stockItems}
            stockTx={stockTx}
            sales={sales}
            saleReturns={saleReturns}
            suppliers={suppliers}
            payables={payables}
            productionBatches={productionBatches}
            purchases={purchases}
            purchaseReturns={purchaseReturns}
            orders={orders}
            fixedAssets={fixedAssets}
          />
        )}

        {tab === "team" && isSuperAdmin && (
          <TeamManagementView currentUserLabel={userLabel} onListTeam={onListTeam} onUpdateRole={onUpdateRole} />
        )}

        {tab === "customers" && (
          <CustomersView
            role={isAdmin ? "partner" : "staff"}
            customers={activeCustomers}
            customerCodes={customerCodes}
            receivables={activeReceivables}
            customerBalances={customerBalances}
            customerProfit={customerProfit}
            onAddCustomer={() => setShowCustomerForm(true)}
            onEditCustomer={(c) => {
              setEditingCustomer(c);
              setShowCustomerForm(true);
            }}
            onDeleteCustomer={deleteCustomer}
            onAddReceivable={(customerId) => setShowReceivableForm(customerId)}
            onEditReceivable={(r) => {
              setEditingReceivable(r);
              setShowReceivableForm(r.customerId);
            }}
            onDeleteReceivable={deleteReceivable}
            onOpenStatement={(id) => setStatementTarget({ type: "customer", id })}
          />
        )}

        {tab === "orders" && isAdmin && (
          <OrdersView
            orders={activeOrders}
            orderCodes={orderCodes}
            customers={activeCustomers}
            stockItems={activeStockItems}
            productionNeeds={productionNeeds}
            onAddOrder={() => setShowOrderForm(true)}
            onEditOrder={(o) => {
              setEditingOrder(o);
              setShowOrderForm(true);
            }}
            onUpdateStatus={updateOrderStatus}
            onDeleteOrder={deleteOrder}
            onFulfillViaSale={fulfillOrderViaSale}
          />
        )}

        {tab === "sales" && (
          <SalesView
            role={isAdmin ? "partner" : "staff"}
            sales={activeSales}
            saleReturns={activeSaleReturns}
            customers={activeCustomers}
            stockItems={activeStockItems}
            onAddSale={() => setShowSaleForm(true)}
            onEditSale={(s) => {
              setEditingSale(s);
              setShowSaleForm(true);
            }}
            onAddReturn={() => setShowReturnForm(true)}
            onEditReturn={(r) => {
              setEditingReturn(r);
              setShowReturnForm(true);
            }}
            onDeleteSale={deleteSale}
            onDeleteReturn={deleteSaleReturn}
            onGenerateBill={(entry, kind) => setBillEntry({ kind, entry })}
          />
        )}

        {tab === "stock" && (
          <StockView
            role={isAdmin ? "partner" : "staff"}
            stockItems={activeStockItems}
            stockItemCodes={stockItemCodes}
            stockTx={activeStockTx}
            stockFIFO={stockFIFO}
            finishedGoodPricing={finishedGoodPricing}
            expiryStatus={expiryStatus}
            onAddItem={() => setShowStockItemForm(true)}
            onEditItem={(i) => {
              setEditingStockItem(i);
              setShowStockItemForm(true);
            }}
            onDeleteItem={deleteStockItem}
            onStockIn={(itemId) => setShowStockTxForm({ itemId, type: "in" })}
            onStockOut={(itemId) => setShowStockTxForm({ itemId, type: "out" })}
            onEditTx={(t) => {
              setEditingStockTx(t);
              setShowStockTxForm({ itemId: t.itemId, type: t.type });
            }}
            onDeleteTx={deleteStockTx}
          />
        )}

        {tab === "suppliers" && (
          <SuppliersView
            role={isAdmin ? "partner" : "staff"}
            suppliers={activeSuppliers}
            supplierCodes={supplierCodes}
            payables={activePayables}
            supplierBalances={supplierBalances}
            purchases={activePurchases}
            purchaseReturns={activePurchaseReturns}
            stockItems={activeStockItems}
            onAddSupplier={() => setShowSupplierForm(true)}
            onEditSupplier={(s) => {
              setEditingSupplier(s);
              setShowSupplierForm(true);
            }}
            onDeleteSupplier={deleteSupplier}
            onAddPayable={(supplierId) => setShowPayableForm(supplierId)}
            onEditPayable={(p) => {
              setEditingPayable(p);
              setShowPayableForm(p.supplierId);
            }}
            onDeletePayable={deletePayable}
            onAddPurchase={() => setShowPurchaseForm(true)}
            onEditPurchase={(p) => {
              setEditingPurchase(p);
              setShowPurchaseForm(true);
            }}
            onDeletePurchase={deletePurchase}
            onAddPurchaseReturn={() => setShowPurchaseReturnForm(true)}
            onEditPurchaseReturn={(r) => {
              setEditingPurchaseReturn(r);
              setShowPurchaseReturnForm(true);
            }}
            onDeletePurchaseReturn={deletePurchaseReturn}
            onOpenStatement={(id) => setStatementTarget({ type: "supplier", id })}
          />
        )}

        {tab === "production" && (
          <ProductionView
            role={isAdmin ? "partner" : "staff"}
            productionBatches={activeProductionBatches}
            stockItems={activeStockItems}
            onAdd={() => setShowProductionForm(true)}
            onEdit={(b) => {
              setEditingProduction(b);
              setShowProductionForm(true);
            }}
            onDelete={deleteProductionBatch}
          />
        )}
        </div>
      </main>
        </div>
      </div>

      {showTxForm && (
        <TransactionForm
          allExpenseCategories={allExpenseCategories}
          onAddCategory={addExpenseCategory}
          editEntry={editingTx}
          actor={actor}
          onSave={upsertTransaction}
          onClose={() => {
            setShowTxForm(false);
            setEditingTx(null);
          }}
        />
      )}
      {showCapForm && (
        <CapitalForm
          editEntry={editingCap}
          actor={actor}
          onSave={upsertCapitalEntry}
          onClose={() => {
            setShowCapForm(false);
            setEditingCap(null);
          }}
        />
      )}
      {showCustomerForm && (
        <CustomerForm
          editEntry={editingCustomer}
          locations={locations}
          onSave={upsertCustomer}
          onClose={() => {
            setShowCustomerForm(false);
            setEditingCustomer(null);
          }}
        />
      )}
      {showReceivableForm && (
        <ReceivableForm
          customer={customers.find((c) => c.id === showReceivableForm)}
          editEntry={editingReceivable}
          onSave={upsertReceivable}
          onClose={() => {
            setShowReceivableForm(null);
            setEditingReceivable(null);
          }}
        />
      )}
      {showStockItemForm && (
        <StockItemForm
          editEntry={editingStockItem}
          code={editingStockItem ? stockItemCodes[editingStockItem.id] : null}
          onSave={upsertStockItem}
          onClose={() => {
            setShowStockItemForm(false);
            setEditingStockItem(null);
          }}
        />
      )}
      {showStockTxForm && (
        <StockTxForm
          item={stockItems.find((i) => i.id === showStockTxForm.itemId)}
          type={showStockTxForm.type}
          available={stockFIFO[showStockTxForm.itemId]?.currentQty || 0}
          editEntry={editingStockTx}
          onSave={upsertStockTx}
          onClose={() => {
            setShowStockTxForm(null);
            setEditingStockTx(null);
          }}
        />
      )}
      {showSaleForm && (
        <SaleForm
          customers={activeCustomers}
          customerCodes={customerCodes}
          stockItems={activeStockItems.filter((i) => i.category === "Finished Good")}
          stockItemCodes={stockItemCodes}
          stockFIFO={stockFIFO}
          finishedGoodPricing={finishedGoodPricing}
          vatSettings={vatSettings}
          prefill={salePrefill}
          editEntry={editingSale}
          actor={actor}
          onSave={upsertSale}
          onClose={() => {
            setShowSaleForm(false);
            setSalePrefill(null);
            setEditingSale(null);
          }}
        />
      )}
      {showOrderForm && (
        <OrderForm
          customers={activeCustomers}
          customerCodes={customerCodes}
          stockItems={activeStockItems.filter((i) => i.category === "Finished Good")}
          editEntry={editingOrder}
          onSave={upsertOrder}
          onClose={() => {
            setShowOrderForm(false);
            setEditingOrder(null);
          }}
        />
      )}
      {showReturnForm && (
        <ReturnForm
          customers={activeCustomers}
          customerCodes={customerCodes}
          stockItems={activeStockItems.filter((i) => i.category === "Finished Good")}
          stockItemCodes={stockItemCodes}
          stockFIFO={stockFIFO}
          vatSettings={vatSettings}
          editEntry={editingReturn}
          actor={actor}
          onSave={upsertReturn}
          onClose={() => {
            setShowReturnForm(false);
            setEditingReturn(null);
          }}
        />
      )}
      {showPurchaseReturnForm && (
        <PurchaseReturnForm
          suppliers={activeSuppliers}
          supplierCodes={supplierCodes}
          stockItems={activeStockItems.filter((i) => i.category === "Raw Material")}
          stockItemCodes={stockItemCodes}
          stockFIFO={stockFIFO}
          vatSettings={vatSettings}
          editEntry={editingPurchaseReturn}
          actor={actor}
          onSave={upsertPurchaseReturn}
          onClose={() => {
            setShowPurchaseReturnForm(false);
            setEditingPurchaseReturn(null);
          }}
        />
      )}
      {billEntry && (
        <InvoiceModal
          billEntry={billEntry}
          customers={customers}
          customerCodes={customerCodes}
          stockItems={stockItems}
          customerBalances={customerBalances}
          vatSettings={vatSettings}
          onClose={() => setBillEntry(null)}
        />
      )}
      {statementTarget && (
        <AccountStatementModal
          target={statementTarget}
          customers={customers}
          suppliers={suppliers}
          customerCodes={customerCodes}
          supplierCodes={supplierCodes}
          receivables={activeReceivables}
          payables={activePayables}
          sales={activeSales}
          saleReturns={activeSaleReturns}
          purchases={activePurchases}
          stockItems={stockItems}
          onClose={() => setStatementTarget(null)}
        />
      )}
      {showDailyReport && (
        <DailyReportModal
          transactions={activeTransactions}
          capitalEntries={activeCapitalEntries}
          receivables={activeReceivables}
          payables={activePayables}
          sales={activeSales}
          saleReturns={activeSaleReturns}
          purchases={activePurchases}
          productionBatches={activeProductionBatches}
          orders={activeOrders}
          customers={customers}
          suppliers={suppliers}
          stockItems={stockItems}
          stockTx={activeStockTx}
          fixedAssets={activeFixedAssets}
          onClose={() => setShowDailyReport(false)}
        />
      )}
      {showSupplierForm && (
        <SupplierForm
          editEntry={editingSupplier}
          onSave={upsertSupplier}
          onClose={() => {
            setShowSupplierForm(false);
            setEditingSupplier(null);
          }}
        />
      )}
      {showPayableForm && (
        <PayableForm
          supplier={suppliers.find((s) => s.id === showPayableForm)}
          editEntry={editingPayable}
          onSave={upsertPayable}
          onClose={() => {
            setShowPayableForm(null);
            setEditingPayable(null);
          }}
        />
      )}
      {showProductionForm && (
        <ProductionForm
          stockItems={activeStockItems}
          stockItemCodes={stockItemCodes}
          stockFIFO={stockFIFO}
          editEntry={editingProduction}
          actor={actor}
          onSave={upsertProduction}
          onClose={() => {
            setShowProductionForm(false);
            setEditingProduction(null);
          }}
        />
      )}
      {showPurchaseForm && (
        <PurchaseForm
          suppliers={activeSuppliers}
          supplierCodes={supplierCodes}
          stockItems={activeStockItems.filter((i) => i.category === "Raw Material")}
          stockItemCodes={stockItemCodes}
          vatSettings={vatSettings}
          allExpenseCategories={allExpenseCategories}
          onAddCategory={addExpenseCategory}
          editEntry={editingPurchase}
          actor={actor}
          onSave={upsertPurchase}
          onClose={() => {
            setShowPurchaseForm(false);
            setEditingPurchase(null);
          }}
        />
      )}
      {showFixedAssetForm && (
        <FixedAssetForm
          editEntry={editingFixedAsset}
          actor={actor}
          onSave={upsertFixedAsset}
          onClose={() => {
            setShowFixedAssetForm(false);
            setEditingFixedAsset(null);
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, tone, onClick }) {
  const colors = {
    gold: "var(--accent-gold)",
    green: "var(--accent-forest)",
    red: "var(--accent-red)",
    ink: "var(--ink)",
  };
  const animated = useCountUp(Number(value) || 0);
  return (
    <div
      key={value}
      className={`card-surface card-pop${onClick ? " drill-through" : ""}`}
      style={{ padding: "16px 18px", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
      title={onClick ? "Open the related section" : undefined}
    >
      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</p>
      <p className="mono-num" style={{ fontSize: "1.15rem", marginTop: 4, color: colors[tone] || colors.ink }}>
        {formatNPR(animated)}
      </p>
    </div>
  );
}

// Same visual treatment as Card, but for plain counts/labels rather than
// currency — record counts, day counts, that sort of thing.
function StatTile({ label, value, display, tone, onClick }) {
  const colors = { gold: "var(--accent-gold)", green: "var(--accent-forest)", red: "var(--accent-red)", ink: "var(--ink)" };
  const numeric = typeof value === "number";
  const animated = useCountUp(numeric ? value : 0);
  return (
    <div
      key={String(value)}
      className={`card-surface card-pop${onClick ? " drill-through" : ""}`}
      style={{ padding: "16px 18px", cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</p>
      <p className="mono-num" style={{ fontSize: "1.15rem", marginTop: 4, color: colors[tone] || colors.ink }}>
        {display || (numeric ? Math.round(animated) : value)}
      </p>
    </div>
  );
}

function Dashboard({ role, totals, accrualSummary, chartData, categoryBreakdown, recent, totalReceivable, totalInventoryValue, lowStockItems, expiryAlerts, stockFIFO, totalPayable, openOrdersCount, dailySalesData, todaysSales, dailyProfitData, todaysProfit, onOpenDailyReport, lastBackup, onNavigate }) {
  if (role !== "partner") {
    return (
      <div>
        <Card label="Today's Sales" value={todaysSales} tone="gold" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <p style={{ fontSize: "0.78rem", opacity: 0.65 }}>
          Today: <span className="mono-num">{todayISO()}</span>
          {formatBS(todayISO()) && <span> · {formatBS(todayISO())} BS</span>}
        </p>
        <button
          onClick={onOpenDailyReport}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <FileText size={15} /> Print Daily Report
        </button>
      </div>

      <div>
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-2">
          Funds on hand
        </p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))", gap: 12 }}>
          <Card label="Cash in Hand" value={totals.byMethod.cash} tone="gold" onClick={() => onNavigate?.("transactions")} />
          <Card label="Bank" value={totals.byMethod.bank} tone="gold" onClick={() => onNavigate?.("transactions")} />
          <Card label="eSewa" value={totals.byMethod.esewa} tone="gold" onClick={() => onNavigate?.("transactions")} />
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
        <Card label="Today's Sales" value={todaysSales} tone="gold" onClick={() => onNavigate?.("sales")} />
        <Card label="Today's Profit" value={todaysProfit} tone={todaysProfit >= 0 ? "green" : "red"} onClick={onOpenDailyReport} />
        <Card label="Total Income" value={accrualSummary.totalRevenue} tone="green" onClick={() => onNavigate?.("accounting")} />
        <Card label="Total Expenses" value={accrualSummary.totalExpenses} tone="red" onClick={() => onNavigate?.("accounting")} />
        <Card label="Net Position" value={accrualSummary.netProfit} tone={accrualSummary.netProfit >= 0 ? "green" : "red"} onClick={() => onNavigate?.("accounting")} />
        <Card label="Owed by Customers" value={totalReceivable} tone="red" onClick={() => onNavigate?.("customers")} />
        <Card label="Owed to Suppliers" value={totalPayable} tone="red" onClick={() => onNavigate?.("suppliers")} />
        <Card label="Stock on Hand (FIFO)" value={totalInventoryValue} tone="green" onClick={() => onNavigate?.("stock")} />
      </div>

      {openOrdersCount > 0 && (
        <p
          className="drill-row"
          style={{ fontSize: "0.8rem", color: "var(--ink)", opacity: 0.75, padding: "2px 0" }}
          onClick={() => onNavigate?.("orders")}
        >
          📋 <span style={{ fontWeight: 600 }}>{openOrdersCount}</span> open order{openOrdersCount > 1 ? "s" : ""} —
          check the Orders tab for the production plan.
        </p>
      )}

      {lowStockItems.length > 0 && (
        <div
          className="alert-in drill-through"
          style={{ background: "var(--alert-red-bg)", border: "1px solid var(--accent-red)", borderRadius: 8, padding: "14px 16px", cursor: "pointer" }}
          onClick={() => onNavigate?.("stock")}
        >
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-red)", marginBottom: 6 }}>
            <span className="pulse-attention">⚠</span> Low stock — {lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} need reordering
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((i) => (
              <span key={i.id} style={{ fontSize: "0.78rem", background: "var(--card-bg)", padding: "3px 8px", border: "1px solid var(--accent-red)" }}>
                {i.name}: <span className="mono-num">{stockFIFO[i.id]?.currentQty || 0}</span> {i.unit} left
              </span>
            ))}
          </div>
        </div>
      )}

      {expiryAlerts && expiryAlerts.length > 0 && (
        <div
          className="alert-in drill-through"
          style={{ background: "var(--alert-brown-bg)", border: "1px solid var(--accent-brown)", borderRadius: 8, padding: "14px 16px", cursor: "pointer" }}
          onClick={() => onNavigate?.("stock")}
        >
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--accent-brown)", marginBottom: 6 }}>
            <span className="pulse-attention">⏳</span> Shelf life — {expiryAlerts.length} item{expiryAlerts.length > 1 ? "s" : ""} expired or expiring soon
          </p>
          <div className="flex flex-wrap gap-2">
            {expiryAlerts.map((a) => (
              <span key={a.item.id} style={{ fontSize: "0.78rem", background: "var(--card-bg)", padding: "3px 8px", border: "1px solid var(--accent-brown)" }}>
                {a.item.name}:{" "}
                {a.expiredQty > 0 && (
                  <span style={{ color: "var(--accent-red)", fontWeight: 600 }}>
                    <span className="mono-num">{a.expiredQty}</span> {a.item.unit} expired
                  </span>
                )}
                {a.expiredQty > 0 && a.expiringSoonQty > 0 && ", "}
                {a.expiringSoonQty > 0 && (
                  <span style={{ color: "var(--accent-brown)" }}>
                    <span className="mono-num">{a.expiringSoonQty}</span> {a.item.unit} expiring within {a.soonThreshold}d
                  </span>
                )}
              </span>
            ))}
          </div>
          <p style={{ fontSize: "0.7rem", opacity: 0.6, marginTop: 6 }}>
            Sell or use the oldest stock first — expiry here assumes oldest-out rotation, same as FIFO costing. Record spoiled stock via Stock Out to keep counts honest.
          </p>
        </div>
      )}

      {(() => {
        const lastBackupTime = [lastBackup?.json, lastBackup?.excel].filter(Boolean).sort().pop();
        const daysSinceBackup = lastBackupTime ? daysBetween(lastBackupTime, nowISO()) : null;
        if (daysSinceBackup !== null && daysSinceBackup <= 7) return null;
        return (
          <div
            className="alert-in drill-through"
            style={{ background: "var(--alert-gold-bg)", border: "1px solid var(--accent-gold)", borderRadius: 8, padding: "12px 16px", cursor: "pointer" }}
            onClick={() => onNavigate?.("backup")}
          >
            <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--alert-gold-text)" }}>
              {daysSinceBackup === null
                ? "You haven't backed up yet — worth doing once you have some data in here."
                : `It's been ${daysSinceBackup} days since your last backup.`}{" "}
              <span style={{ fontWeight: 400, opacity: 0.75 }}>Head to the Backup tab when you get a chance.</span>
            </p>
          </div>
        );
      })()}

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Monthly cash flow
        </h2>
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "16px" }}>
          {chartData.length === 0 ? (
            <EmptyNote text="No transactions yet. Add your first entry to see cash flow here." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(var(--ink-rgb),0.1)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--ink)" }} />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink)" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12, background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.2)", color: "var(--ink)" }} labelStyle={{ color: "var(--ink)" }} />
                <Line type="monotone" dataKey="income" stroke="var(--accent-forest)" strokeWidth={2} dot={false} name="Income" />
                <Line type="monotone" dataKey="expense" stroke="var(--accent-red)" strokeWidth={2} dot={false} name="Expense" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Daily sales (last 14 days)
        </h2>
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "16px" }}>
          {dailySalesData.length === 0 ? (
            <EmptyNote text="No sales yet. Record a sale to see daily performance here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailySalesData}>
                <CartesianGrid stroke="rgba(var(--ink-rgb),0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--ink)" }}
                  tickFormatter={(d) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink)" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12, background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.2)", color: "var(--ink)" }} labelStyle={{ color: "var(--ink)" }} />
                <Bar dataKey="total" fill="var(--accent-gold)" name="Sales" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Daily profit (last 14 days)
        </h2>
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "16px" }}>
          {dailyProfitData.length === 0 ? (
            <EmptyNote text="No transactions yet. Daily profit (income minus expenses) will show here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyProfitData}>
                <CartesianGrid stroke="rgba(var(--ink-rgb),0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "var(--ink)" }}
                  tickFormatter={(d) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "var(--ink)" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12, background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.2)", color: "var(--ink)" }} labelStyle={{ color: "var(--ink)" }} />
                <Bar dataKey="profit" name="Profit" radius={[2, 2, 0, 0]}>
                  {dailyProfitData.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "var(--accent-forest)" : "var(--accent-red)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8">
        <section>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
            Expense by category
          </h2>
          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "16px" }}>
            {categoryBreakdown.length === 0 ? (
              <EmptyNote text="Expenses will break down by category here." />
            ) : (
              <div className="space-y-2">
                {categoryBreakdown.map((c) => {
                  const max = categoryBreakdown[0].amount;
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{c.category}</span>
                        <span className="mono-num">{formatNPR(c.amount)}</span>
                      </div>
                      <div style={{ background: "rgba(var(--ink-rgb),0.08)", height: 6 }}>
                        <div style={{ background: "var(--accent-gold)", height: 6, width: `${(c.amount / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
            Recent entries
          </h2>
          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
            {recent.length === 0 ? (
              <div className="p-4">
                <EmptyNote text="Nothing logged yet." />
              </div>
            ) : (
              recent.map((t, i) => (
                <div key={t.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3 text-sm" style={{ animationDelay: `${i * 30}ms` }}>
                  <div>
                    <p>{t.category}</p>
                    <p style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                      {t.date} · {t.partner}
                    </p>
                  </div>
                  <span
                    className="mono-num"
                    style={{ color: t.type === "income" ? "var(--accent-forest)" : "var(--accent-red)" }}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {formatNPR(t.amount)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function isLinkedEntry(e) {
  return !!(e.saleId || e.returnId || e.purchaseId || e.productionId || e.fixedAssetId || e.purchaseReturnId);
}

function EmptyNote({ text }) {
  return <p style={{ fontSize: "0.85rem", opacity: 0.55, fontStyle: "italic" }}>{text}</p>;
}

// A template, not a transaction — nothing gets recorded until the person
// actually taps "Record" on a due one (see the banner in TransactionsView).
// This just describes what repeats and when it's next due.
function RecurringTemplateForm({ allExpenseCategories, onAddCategory, editEntry, actor, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "expense");
  const [category, setCategory] = useState(editEntry?.category || allExpenseCategories[0]);
  const [amount, setAmount] = useState(editEntry?.amount !== undefined ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [dayOfMonth, setDayOfMonth] = useState(editEntry?.dayOfMonth ? String(editEntry.dayOfMonth) : String(new Date().getDate()));
  const [nextDueDate, setNextDueDate] = useState(editEntry?.nextDueDate || todayISO());
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    const amt = Number(amount);
    if (!(amt > 0)) return;
    const day = Math.min(Math.max(Number(dayOfMonth) || 1, 1), 31);
    onSave({
      ...(editEntry || {}),
      type,
      category,
      amount: amt,
      method,
      partner,
      dayOfMonth: day,
      nextDueDate,
      note,
      active: editEntry?.active !== false,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit recurring transaction" : "New recurring transaction"}>
      <Field label="Type">
        <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
          <option value="expense">Expense (e.g. rent, salary)</option>
          <option value="income">Income</option>
        </select>
      </Field>
      <Field label="Category">
        {type === "expense" ? (
          <ExpenseCategorySelect categories={allExpenseCategories} value={category} onChange={setCategory} onAddCategory={onAddCategory} />
        ) : (
          <input value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle} placeholder="e.g. Rental income" />
        )}
      </Field>
      <Field label="Amount (Rs.)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Day of month it's due">
        <input
          type="number"
          min="1"
          max="31"
          value={dayOfMonth}
          onChange={(e) => setDayOfMonth(e.target.value)}
          style={inputStyle}
        />
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
          If a month is shorter than this day, it lands on that month's last day instead.
        </p>
      </Field>
      <Field label="Next due date">
        <input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. Shop rent — Dharan" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save
      </button>
    </Modal>
  );
}

function TransactionsView({
  role,
  transactions,
  filterType,
  setFilterType,
  filterPartner,
  setFilterPartner,
  search,
  setSearch,
  onAdd,
  onEdit,
  onDelete,
  activeRecurringTemplates,
  dueRecurringTemplates,
  onAddRecurring,
  onEditRecurring,
  onDeleteRecurring,
  onRecordRecurring,
  onToggleRecurring,
}) {
  const [showRecurringSection, setShowRecurringSection] = useState(false);
  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #5B7C99", paddingLeft: 10 }}>
          Transactions
        </h2>
      </div>
      {dueRecurringTemplates.length > 0 && (
        <div className="alert-in" style={{ background: "var(--alert-gold-bg)", border: "1px solid var(--accent-gold)", borderRadius: 8, padding: "10px 14px", marginBottom: 16 }}>
          <p style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: 6 }}>
            {dueRecurringTemplates.length} recurring transaction{dueRecurringTemplates.length > 1 ? "s" : ""} due
          </p>
          {dueRecurringTemplates.map((r) => (
            <div key={r.id} className="flex justify-between items-center" style={{ fontSize: "0.82rem", padding: "3px 0" }}>
              <span>
                {r.category} — <span className="mono-num">{formatNPR(r.amount)}</span>
                <span style={{ opacity: 0.6 }}> · due {r.nextDueDate}</span>
              </span>
              <button
                onClick={() => onRecordRecurring(r)}
                style={{ background: "var(--btn-forest)", color: "#fff", padding: "3px 10px", fontSize: "0.75rem" }}
              >
                Record
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search size={14} style={{ position: "absolute", left: 8, top: 9, opacity: 0.5 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes/category"
              style={{
                border: "1px solid rgba(var(--ink-rgb),0.25)",
                background: "var(--card-bg)",
                padding: "6px 10px 6px 28px",
                fontSize: "0.85rem",
              }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", padding: "6px 10px", fontSize: "0.85rem" }}
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select
            value={filterPartner}
            onChange={(e) => setFilterPartner(e.target.value)}
            style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", padding: "6px 10px", fontSize: "0.85rem" }}
          >
            <option value="all">All partners</option>
            {PARTNERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add entry
        </button>
        <button
          onClick={() => setShowRecurringSection((v) => !v)}
          className="flex items-center gap-1"
          style={{ background: "var(--surface-2)", color: "var(--ink)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          Recurring ({activeRecurringTemplates.length})
        </button>
      </div>

      {showRecurringSection && (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", marginBottom: 16, padding: "14px 16px" }}>
          <div className="flex justify-between items-center mb-2">
            <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>Recurring transactions</p>
            <button onClick={() => onAddRecurring()} className="flex items-center gap-1" style={{ background: "var(--surface-2)", padding: "5px 10px", fontSize: "0.78rem" }}>
              <Plus size={13} /> Add recurring
            </button>
          </div>
          {activeRecurringTemplates.length === 0 ? (
            <p style={{ fontSize: "0.8rem", opacity: 0.6 }}>
              Nothing set up yet — rent, salaries, or any other monthly cost can be added here so it doesn't need
              retyping every month.
            </p>
          ) : (
            activeRecurringTemplates.map((r) => (
              <div key={r.id} className="ledger-rule flex justify-between items-center" style={{ padding: "6px 0" }}>
                <div>
                  <p style={{ fontSize: "0.85rem" }}>
                    {r.category} · <span className="mono-num">{formatNPR(r.amount)}</span>
                    <span style={{ opacity: 0.55 }}> · monthly on day {r.dayOfMonth}</span>
                    {r.active === false && <span style={{ opacity: 0.55 }}> · paused</span>}
                  </p>
                  <p style={{ fontSize: "0.72rem", opacity: 0.55 }}>Next due {r.nextDueDate}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => onToggleRecurring({ ...r, active: r.active === false ? true : false })} style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                    {r.active === false ? "Resume" : "Pause"}
                  </button>
                  <button onClick={() => onEditRecurring(r)} style={{ opacity: 0.4 }} title="Edit">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => onDeleteRecurring(r.id)} style={{ opacity: 0.4, display: role === "partner" ? "block" : "none" }} title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
        <div
          className="ledger-rule grid px-4 py-2"
          style={{ gridTemplateColumns: "90px 1fr 110px 90px 100px 30px 30px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}
        >
          <span>Date</span>
          <span>Category / Note</span>
          <span>Partner</span>
          <span>Type</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span></span>
          <span></span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No transactions match. Try adjusting filters or add a new entry." />
          </div>
        ) : (
          transactions.map((t, i) => (
            <div
              key={t.id}
              className="ledger-rule row-in grid px-4 py-3 items-center"
              style={{ gridTemplateColumns: "90px 1fr 110px 90px 100px 30px 30px", fontSize: "0.85rem", animationDelay: `${Math.min(i, 14) * 25}ms` }}
            >
              <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{t.date}</span>
              <span>
                {t.category}
                {t.note && <span style={{ opacity: 0.55 }}> — {t.note}</span>}
                <span style={{ fontSize: "0.68rem", opacity: 0.5, marginLeft: 6 }}>
                  · {METHOD_LABELS[t.method || "cash"]}
                </span>
              </span>
              <span style={{ fontSize: "0.8rem" }}>{t.partner}</span>
              <span style={{ fontSize: "0.78rem", color: t.type === "income" ? "var(--accent-forest)" : "var(--accent-red)" }}>
                {t.type === "income" ? "Income" : "Expense"}
              </span>
              <span className="mono-num" style={{ textAlign: "right", color: t.type === "income" ? "var(--accent-forest)" : "var(--accent-red)" }}>
                {t.type === "income" ? "+" : "−"}
                {formatNPR(t.amount)}
              </span>
              {role === "partner" && (
                <>
                  <button onClick={() => onEdit(t)} style={{ opacity: isLinkedEntry(t) ? 0.15 : 0.4 }} title={isLinkedEntry(t) ? "Edit via its Sale/Return/Purchase/Production entry" : "Edit"} disabled={isLinkedEntry(t)}>
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(t.id)} style={{ opacity: 0.4 }} title="Delete">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransactionForm({ allExpenseCategories, onAddCategory, editEntry, actor, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "expense");
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [category, setCategory] = useState(editEntry?.category || allExpenseCategories[0]);
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [amount, setAmount] = useState(editEntry?.amount ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [note, setNote] = useState(editEntry?.note || "");

  const categories = type === "income" ? INCOME_CATEGORIES : allExpenseCategories;

  function handleTypeChange(newType) {
    setType(newType);
    setCategory(newType === "income" ? INCOME_CATEGORIES[0] : allExpenseCategories[0]);
  }

  function submit() {
    if (!amount || Number(amount) <= 0) return;
    onSave({ ...(editEntry || {}), type, date, category, partner, amount: Number(amount), method, note });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit transaction" : "Add transaction"}>
      <div className="flex gap-2 mb-4">
        {["expense", "income"].map((t) => (
          <button
            key={t}
            onClick={() => handleTypeChange(t)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "0.85rem",
              background: type === t ? (t === "income" ? "var(--accent-forest)" : "var(--accent-red)") : "var(--surface-2)",
              color: type === t ? "var(--page-bg)" : "var(--ink)",
            }}
          >
            {t === "income" ? "Income" : "Expense"}
          </button>
        ))}
      </div>

      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Category">
        {type === "expense" ? (
          <ExpenseCategorySelect categories={categories} value={category} onChange={setCategory} onAddCategory={onAddCategory} />
        ) : (
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Partner">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Amount (Rs.)">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </Field>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 25kg cheese powder" />
      </Field>

      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save entry"}
      </button>
    </Modal>
  );
}

function CapitalView({
  partnerBalances,
  capitalEntries,
  onAdd,
  onEdit,
  onDelete,
  businessNetWorth,
  totals,
  totalReceivable,
  totalInventoryValue,
  totalPayable,
  ownership,
  onUpdateOwnership,
}) {
  const totalContributed = PARTNERS.reduce((s, p) => s + partnerBalances[p].contributed - partnerBalances[p].withdrawn, 0);
  const ownershipSum = PARTNERS.reduce((s, p) => s + (Number(ownership[p]) || 0), 0);

  return (
    <div>
      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "18px" }} className="mb-6">
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-1">
          Business Net Worth
        </p>
        <p className="mono-num" style={{ fontSize: "1.6rem", color: businessNetWorth >= 0 ? "var(--accent-forest)" : "var(--accent-red)" }}>
          {formatNPR(businessNetWorth)}
        </p>
        <div className="grid mt-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 10, fontSize: "0.78rem" }}>
          <div>
            <span style={{ opacity: 0.6 }}>Cash + Bank + eSewa</span>
            <p className="mono-num">{formatNPR(totals.cashBalance)}</p>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>+ Owed by customers</span>
            <p className="mono-num">{formatNPR(totalReceivable)}</p>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>+ Stock value</span>
            <p className="mono-num">{formatNPR(totalInventoryValue)}</p>
          </div>
          <div>
            <span style={{ opacity: 0.6 }}>− Owed to suppliers</span>
            <p className="mono-num">{formatNPR(totalPayable)}</p>
          </div>
        </div>
        <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 10 }}>
          Calculated from what the business currently holds and owes — cash, customer credit, stock, and supplier
          credit — not just cumulative profit, so it stays accurate regardless of timing.
        </p>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "18px" }} className="mb-6">
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-3">
          Ownership & Equity Value
        </p>
        <div className="space-y-3">
          {PARTNERS.map((p) => {
            const pct = Number(ownership[p]) || 0;
            const equityValue = (businessNetWorth * pct) / 100;
            const contributedNet = partnerBalances[p].contributed - partnerBalances[p].withdrawn;
            const contributionPct = totalContributed > 0 ? (contributedNet / totalContributed) * 100 : 0;
            return (
              <div key={p} className="flex items-center justify-between flex-wrap gap-2" style={{ fontSize: "0.85rem" }}>
                <span style={{ minWidth: 60 }}>{p}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={ownership[p]}
                    onChange={(e) => onUpdateOwnership(p, e.target.value)}
                    style={{ width: 64, border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", padding: "4px 6px", fontSize: "0.8rem", textAlign: "right" }}
                  />
                  <span style={{ opacity: 0.6 }}>% owned</span>
                </div>
                <span style={{ opacity: 0.5, fontSize: "0.75rem" }}>
                  (contributed {contributionPct.toFixed(1)}% of capital)
                </span>
                <span className="mono-num" style={{ fontWeight: 600, color: equityValue >= 0 ? "var(--accent-forest)" : "var(--accent-red)" }}>
                  {formatNPR(equityValue)}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: "0.72rem", marginTop: 10, color: Math.abs(ownershipSum - 100) > 0.01 ? "var(--accent-red)" : "var(--accent-forest)" }}>
          Ownership totals {ownershipSum.toFixed(2)}%{Math.abs(ownershipSum - 100) > 0.01 ? " — should add up to 100%" : " ✓"}
        </p>
        <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 6 }}>
          Ownership % is set by your partnership agreement, not calculated automatically — the "contributed" figure
          alongside each one is just for reference, in case actual cash put in differs from agreed shares.
        </p>
      </div>

      <div className="grid mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {PARTNERS.map((p) => {
          const bal = partnerBalances[p];
          const net = bal.contributed - bal.withdrawn;
          return (
            <div key={p} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "16px" }}>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem" }} className="mb-2">
                {p}
              </p>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ opacity: 0.6 }}>Contributed</span>
                <span className="mono-num">{formatNPR(bal.contributed)}</span>
              </div>
              <div className="flex justify-between text-sm mb-2">
                <span style={{ opacity: 0.6 }}>Withdrawn</span>
                <span className="mono-num">{formatNPR(bal.withdrawn)}</span>
              </div>
              <div className="flex justify-between text-sm double-underline pt-1">
                <span style={{ fontWeight: 600 }}>Net capital</span>
                <span className="mono-num" style={{ fontWeight: 600 }}>
                  {formatNPR(net)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center mb-3">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #2F6B5E", paddingLeft: 10 }}>Capital entries</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add capital entry
        </button>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
        {capitalEntries.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No capital contributions or withdrawals logged yet." />
          </div>
        ) : (
          capitalEntries.map((c, i) => (
            <div key={c.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3 text-sm" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
              <div>
                <p>
                  {c.partner} — {c.type === "contribution" ? "Contribution" : "Withdrawal"}
                </p>
                <p style={{ fontSize: "0.72rem", opacity: 0.6 }}>
                  {c.date}
                  {c.note && ` · ${c.note}`}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className="mono-num"
                  style={{ color: c.type === "contribution" ? "var(--accent-forest)" : "var(--accent-red)" }}
                >
                  {c.type === "contribution" ? "+" : "−"}
                  {formatNPR(c.amount)}
                </span>
                <button onClick={() => onEdit(c)} style={{ opacity: 0.4 }}>
                  <Pencil size={14} />
                </button>
                <button onClick={() => onDelete(c.id)} style={{ opacity: 0.4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CapitalForm({ editEntry, actor, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "contribution");
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [amount, setAmount] = useState(editEntry?.amount ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!amount || Number(amount) <= 0) return;
    onSave({ ...(editEntry || {}), type, date, partner, amount: Number(amount), method, note });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit capital entry" : "Add capital entry"}>
      <div className="flex gap-2 mb-4">
        {["contribution", "withdrawal"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "0.85rem",
              background: type === t ? (t === "contribution" ? "var(--accent-forest)" : "var(--accent-red)") : "var(--surface-2)",
              color: type === t ? "var(--page-bg)" : "var(--ink)",
            }}
          >
            {t === "contribution" ? "Contribution" : "Withdrawal"}
          </button>
        ))}
      </div>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Partner">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Amount (Rs.)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Method">
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save entry"}
      </button>
    </Modal>
  );
}

function CustomersView({
  role,
  customers,
  customerCodes,
  receivables,
  customerBalances,
  customerProfit,
  onAddCustomer,
  onEditCustomer,
  onDeleteCustomer,
  onAddReceivable,
  onEditReceivable,
  onDeleteReceivable,
  onOpenStatement,
}) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-blue)", paddingLeft: 10 }}>Customers & receivables</h2>
        <button
          onClick={onAddCustomer}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No customers yet. Add a customer to start tracking what they owe you." />
        </div>
      ) : (
        <div className="space-y-3">
          {customers.map((c) => {
            const bal = customerBalances[c.id] || { charged: 0, paid: 0 };
            const owed = bal.charged - bal.paid;
            const isOpen = expanded === c.id;
            const custReceivables = receivables.filter((r) => r.customerId === c.id);
            return (
              <div key={c.id} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                <div
                  className="flex justify-between items-center px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                >
                  <div>
                    <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
                      {c.name}
                      {c.location && <span style={{ fontSize: "0.75rem", marginLeft: 6 }}>📍</span>}
                      {(() => {
                        const cp = customerProfit?.[c.id];
                        if (!cp || cp.marginPercent === null) return null;
                        const m = cp.marginPercent;
                        const tone = m >= 25 ? "var(--accent-forest)" : m >= 10 ? "var(--accent-gold)" : "var(--accent-red)";
                        return (
                          <span
                            className="no-print mono-num"
                            title={`Average profit contribution: ${formatNPR(cp.profit)} on ${formatNPR(cp.revenue)} of costed product sales. Sales with no stock item are excluded. Internal only — never appears on statements or bills.`}
                            style={{
                              fontSize: "0.62rem",
                              marginLeft: 6,
                              padding: "1px 5px",
                              borderRadius: 3,
                              background: `${tone}1A`,
                              color: tone,
                              fontWeight: 600,
                              verticalAlign: "middle",
                            }}
                          >
                            {m >= 0 ? "" : "−"}{Math.abs(m).toFixed(0)}% margin
                          </span>
                        );
                      })()}
                    </p>
                    <p style={{ fontSize: "0.72rem", opacity: 0.55 }} className="mono-num">
                      {customerCodes[c.id]}
                    </p>
                    {c.proprietorName && (
                      <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>Prop: {c.proprietorName}</p>
                    )}
                    <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                      {c.phone}
                      {c.address && ` · ${c.address}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="mono-num" style={{ color: owed > 0 ? "var(--accent-red)" : "var(--accent-forest)", fontSize: "1.05rem" }}>
                        {formatNPR(owed)}
                      </p>
                      <p style={{ fontSize: "0.68rem", opacity: 0.55, textTransform: "uppercase" }}>
                        {owed > 0 ? "Owed to you" : "Settled"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStatement(c.id);
                      }}
                      style={{ opacity: 0.4 }}
                      title="Account statement"
                    >
                      <FileText size={14} />
                    </button>
                    {owed > 0 &&
                      (() => {
                        const buckets = computeAgingBuckets(custReceivables, todayISO());
                        const oldestBucket = buckets.d90 > 0 ? "90+ days" : buckets.d61 > 0 ? "61-90 days" : buckets.d31 > 0 ? "31-60 days" : "within 30 days";
                        const reminderText = [
                          `Hi ${c.name},`,
                          ``,
                          `This is a friendly reminder from Trikut Snacks that your account currently has an outstanding balance of ${formatNPR(owed)}${buckets.d31 + buckets.d61 + buckets.d90 > 0 ? ` (oldest portion ${oldestBucket})` : ""}.`,
                          ``,
                          `Please let us know when we can expect payment, or reach out if anything needs clarifying. Thank you!`,
                          ``,
                          `— Trikut Snacks`,
                        ].join("\n");
                        const waLink = c.phone ? whatsAppLink(c.phone, reminderText) : null;
                        const mailLink = !waLink && c.email ? emailLink(c.email, "Trikut Snacks — Payment Reminder", reminderText) : null;
                        const link = waLink || mailLink;
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            style={{ opacity: 0.5 }}
                            title={waLink ? "Send payment reminder via WhatsApp" : "Send payment reminder via email"}
                          >
                            {waLink ? <MessageCircle size={14} /> : <Mail size={14} />}
                          </a>
                        );
                      })()}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCustomer(c);
                      }}
                      style={{ opacity: 0.4, display: role === "partner" ? "block" : "none" }}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="ledger-rule px-4 pb-4">
                    {c.location && (
                      <div className="mb-3">
                        {mapsEmbedLink(c.location) && (
                          <iframe
                            title={`map-${c.id}`}
                            src={mapsEmbedLink(c.location)}
                            width="100%"
                            height="160"
                            style={{ border: "1px solid rgba(var(--ink-rgb),0.15)" }}
                            loading="lazy"
                          />
                        )}
                        <a
                          href={mapsSearchLink(c.location)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "0.78rem", color: "var(--accent-blue)", display: "inline-block", marginTop: 6 }}
                        >
                          📍 Open in Google Maps
                        </a>
                      </div>
                    )}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => onAddReceivable(c.id)}
                        style={{ background: "var(--btn-red)", color: "var(--on-dark)", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        + New sale on credit
                      </button>
                      {role === "partner" && (
                        <button
                          onClick={() => onDeleteCustomer(c.id)}
                          style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.78rem" }}
                        >
                          Remove customer
                        </button>
                      )}
                    </div>
                    {custReceivables.length === 0 ? (
                      <EmptyNote text="No charges or payments recorded yet." />
                    ) : (
                      custReceivables.map((r, i) => (
                        <div key={r.id} className="ledger-rule row-in flex justify-between items-center py-2 text-sm" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                          <div>
                            <span>{r.type === "charge" ? "Sale on credit" : "Payment received"}</span>
                            <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                              {" "}
                              · {r.date}
                              {r.note && ` · ${r.note}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className="mono-num"
                              style={{ color: r.type === "charge" ? "var(--accent-red)" : "var(--accent-forest)" }}
                            >
                              {r.type === "charge" ? "+" : "−"}
                              {formatNPR(r.amount)}
                            </span>
                            {!isLinkedEntry(r) && role === "partner" && (
                              <button onClick={() => onEditReceivable(r)} style={{ opacity: 0.4 }}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {role === "partner" && (
                              <button onClick={() => onDeleteReceivable(r.id)} style={{ opacity: 0.4 }}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CustomerForm({ editEntry, locations, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [proprietorName, setProprietorName] = useState(editEntry?.proprietorName || "");
  const [phone, setPhone] = useState(editEntry?.phone || "");
  const [email, setEmail] = useState(editEntry?.email || "");
  const [city, setCity] = useState(editEntry?.city || "");
  const [area, setArea] = useState(editEntry?.area || "");
  const [newCity, setNewCity] = useState("");
  const [newArea, setNewArea] = useState("");
  const [address, setAddress] = useState(editEntry?.address || "");
  const [location, setLocation] = useState(editEntry?.location || "");
  const [note, setNote] = useState(editEntry?.note || "");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocError("Location isn't available on this device/browser.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(`${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`);
        setLocating(false);
      },
      () => {
        setLocError("Couldn't get location — check permissions, or paste a Google Maps link/address instead.");
        setLocating(false);
      }
    );
  }

  const cities = locations?.cities || [];
  const effectiveCity = city === "__new__" ? newCity.trim() : city;
  const effectiveArea = area === "__new__" ? newArea.trim() : area;
  const areasForCity = cities.find((c) => c.name === effectiveCity)?.areas || [];

  function submit() {
    if (!name.trim()) return;
    onSave({
      ...(editEntry || {}),
      name: name.trim(),
      proprietorName: proprietorName.trim(),
      phone,
      email: email.trim(),
      city: effectiveCity,
      area: effectiveArea,
      address,
      location: location.trim(),
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit customer" : "Add customer"}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Himal Kirana Store" />
      </Field>
      <Field label="Proprietor name (optional)">
        <input value={proprietorName} onChange={(e) => setProprietorName(e.target.value)} style={inputStyle} placeholder="e.g. Ram Bahadur Thapa" />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Email (optional)">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. shop@example.com" />
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>Used for the "Email bill / statement" buttons.</p>
      </Field>
      <Field label="City (optional)">
        <select
          value={city}
          onChange={(e) => {
            setCity(e.target.value);
            setArea("");
            setNewArea("");
          }}
          style={inputStyle}
        >
          <option value="">Not set</option>
          {cities.map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
          <option value="__new__">+ Add a new city…</option>
        </select>
        {city === "__new__" && (
          <input
            value={newCity}
            onChange={(e) => setNewCity(e.target.value)}
            style={{ ...inputStyle, marginTop: 6 }}
            placeholder="e.g. Biratnagar"
          />
        )}
      </Field>
      {effectiveCity && (
        <Field label="Area / ward (optional)">
          <select value={area} onChange={(e) => setArea(e.target.value)} style={inputStyle}>
            <option value="">Not set</option>
            {areasForCity.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="__new__">+ Add a new area…</option>
          </select>
          {area === "__new__" && (
            <input
              value={newArea}
              onChange={(e) => setNewArea(e.target.value)}
              style={{ ...inputStyle, marginTop: 6 }}
              placeholder="e.g. Dharan-8"
            />
          )}
          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
            New cities and areas are saved to the list, so they're pickable next time.
          </p>
        </Field>
      )}
      <Field label="Street address (optional)">
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} placeholder="e.g. near Bhanu Chowk" />
      </Field>
      <Field label="Map location (optional)">
        <div className="flex gap-2">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Paste Google Maps link, or lat,lng"
          />
          <button
            type="button"
            onClick={useCurrentLocation}
            disabled={locating}
            style={{ background: "var(--surface-2)", padding: "8px 10px", fontSize: "0.78rem", whiteSpace: "nowrap" }}
          >
            {locating ? "Locating…" : "📍 Use current"}
          </button>
        </div>
        {locError && <p style={{ fontSize: "0.72rem", color: "var(--accent-red)", marginTop: 4 }}>{locError}</p>}
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save customer"}
      </button>
    </Modal>
  );
}

function ReceivableForm({ customer, editEntry, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "charge");
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [amount, setAmount] = useState(editEntry?.amount ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!amount || Number(amount) <= 0 || !customer) return;
    onSave({
      ...(editEntry || {}),
      customerId: customer.id,
      type,
      date,
      amount: Number(amount),
      ...(type === "payment" ? { method } : {}),
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit entry" : `${customer ? customer.name : "Customer"} — record entry`}>
      <div className="flex gap-2 mb-4">
        {["charge", "payment"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "0.85rem",
              background: type === t ? (t === "charge" ? "var(--accent-red)" : "var(--accent-forest)") : "var(--surface-2)",
              color: type === t ? "var(--page-bg)" : "var(--ink)",
            }}
          >
            {t === "charge" ? "Sale on credit" : "Payment received"}
          </button>
        ))}
      </div>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Amount (Rs.)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {type === "payment" && (
        <Field label="Received via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 10 cartons cheese chips" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save entry"}
      </button>
    </Modal>
  );
}

function StockView({ role, stockItems, stockItemCodes, stockTx, stockFIFO, finishedGoodPricing, expiryStatus, onAddItem, onEditItem, onDeleteItem, onStockIn, onStockOut, onEditTx, onDeleteTx }) {
  const [expanded, setExpanded] = useState(null);

  const rawMaterials = stockItems.filter((i) => i.category === "Raw Material");
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");

  const columnValue = (items) => items.reduce((s, i) => s + (stockFIFO[i.id]?.currentValue || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-gold)", paddingLeft: 10 }}>Stock (FIFO valued)</h2>
        <button
          onClick={onAddItem}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add stock item
        </button>
      </div>

      {stockItems.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No stock items yet. Add raw materials (potatoes, oil, seasoning, packaging) or finished goods (chips packets) to track quantity and FIFO cost." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          <StockColumn
            role={role}
            title="Raw Materials"
            items={rawMaterials}
            totalValue={columnValue(rawMaterials)}
            stockItemCodes={stockItemCodes}
            stockFIFO={stockFIFO}
            expiryStatus={expiryStatus}
            stockTx={stockTx}
            expanded={expanded}
            setExpanded={setExpanded}
            onStockIn={onStockIn}
            onStockOut={onStockOut}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
          />
          <StockColumn
            role={role}
            title="Finished Goods"
            items={finishedGoods}
            totalValue={columnValue(finishedGoods)}
            stockItemCodes={stockItemCodes}
            stockFIFO={stockFIFO}
            finishedGoodPricing={finishedGoodPricing}
            expiryStatus={expiryStatus}
            stockTx={stockTx}
            expanded={expanded}
            setExpanded={setExpanded}
            onStockIn={onStockIn}
            onStockOut={onStockOut}
            onEditItem={onEditItem}
            onDeleteItem={onDeleteItem}
            onEditTx={onEditTx}
            onDeleteTx={onDeleteTx}
          />
        </div>
      )}
    </div>
  );
}

function StockColumn({ role, title, items, totalValue, stockItemCodes, stockFIFO, finishedGoodPricing, expiryStatus, stockTx, expanded, setExpanded, onStockIn, onStockOut, onEditItem, onDeleteItem, onEditTx, onDeleteTx }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2 px-1">
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem" }}>{title}</h3>
        <span className="mono-num" style={{ fontSize: "0.8rem", color: "var(--accent-gold)" }}>
          {formatNPR(totalValue)}
        </span>
      </div>
      {items.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-4">
          <EmptyNote text={`No ${title.toLowerCase()} yet.`} />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <StockItemCard
              key={item.id}
              item={item}
              code={stockItemCodes?.[item.id]}
              fifo={stockFIFO[item.id] || { batches: [], currentQty: 0, currentValue: 0, avgCost: 0, shortfall: 0 }}
              pricing={finishedGoodPricing?.[item.id]}
              expiry={expiryStatus?.[item.id]}
              stockTx={stockTx}
              isOpen={expanded === item.id}
              onToggle={() => setExpanded(expanded === item.id ? null : item.id)}
              onStockIn={onStockIn}
              onStockOut={onStockOut}
              onEditItem={onEditItem}
              onDeleteItem={onDeleteItem}
              onEditTx={onEditTx}
              onDeleteTx={onDeleteTx}
              role={role}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StockItemCard({ role, item, code, fifo, pricing, expiry, stockTx, isOpen, onToggle, onStockIn, onStockOut, onEditItem, onDeleteItem, onEditTx, onDeleteTx }) {
  const [showLabel, setShowLabel] = useState(false);
  const movesSorted = stockTx
    .filter((t) => t.itemId === item.id)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  const isLow = item.reorderLevel > 0 && fifo.currentQty <= item.reorderLevel;

  return (
    <div style={{ background: "var(--card-bg)", border: isLow ? "1px solid var(--accent-red)" : "1px solid rgba(var(--ink-rgb),0.15)" }}>
      <div className="flex justify-between items-center px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
            {item.name}
            {code && (
              <span className="mono-num" style={{ fontSize: "0.72rem", opacity: 0.55, marginLeft: 6, fontWeight: 400 }}>
                {code}
              </span>
            )}
            {isLow && (
              <span style={{ fontSize: "0.65rem", background: "var(--btn-red)", color: "#fff", padding: "1px 6px", marginLeft: 6 }}>
                LOW STOCK
              </span>
            )}
            {expiry?.expiredQty > 0 && (
              <span className="pulse-attention" style={{ fontSize: "0.65rem", background: "var(--btn-red)", color: "#fff", padding: "1px 6px", marginLeft: 6 }}>
                EXPIRED
              </span>
            )}
            {!(expiry?.expiredQty > 0) && expiry?.expiringSoonQty > 0 && (
              <span style={{ fontSize: "0.65rem", background: "var(--btn-brown)", color: "#fff", padding: "1px 6px", marginLeft: 6 }}>
                EXPIRING SOON
              </span>
            )}
          </p>
          <p className="mono-num" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            {fifo.currentQty} {item.unit} on hand
          </p>
        </div>
        <div className="text-right">
          <p className="mono-num" style={{ fontSize: "0.95rem", color: "var(--accent-gold)" }}>
            {formatNPR(fifo.currentValue)}
          </p>
          <p style={{ fontSize: "0.66rem", opacity: 0.55 }}>avg {formatNPR(fifo.avgCost)}/{item.unit}</p>
        </div>
      </div>

      {isOpen && (
        <div className="ledger-rule px-4 pb-4">
          {fifo.shortfall > 0 && (
            <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginBottom: 8 }}>
              ⚠ {fifo.shortfall} {item.unit} were removed with no matching stock-in — recorded quantities may be off.
            </p>
          )}
          {code && (
            <div className="no-print" style={{ marginBottom: 10 }}>
              <button
                onClick={() => setShowLabel((v) => !v)}
                style={{ background: "var(--surface-2)", padding: "5px 10px", fontSize: "0.75rem" }}
              >
                {showLabel ? "Hide label" : "Print label"}
              </button>
            </div>
          )}
          {code && showLabel && (
            <div id={`barcode-print-${item.id}`} className="barcode-print-area" style={{ border: "1px dashed rgba(var(--ink-rgb),0.3)", marginBottom: 10 }}>
              <BarcodeLabel code={code} itemName={item.name} />
              <div className="no-print" style={{ textAlign: "center", paddingBottom: 8 }}>
                <button onClick={() => window.print()} className="flex items-center gap-1" style={{ background: "var(--ink-surface)", color: "#fff", padding: "5px 12px", fontSize: "0.75rem", margin: "0 auto" }}>
                  <Printer size={13} /> Print
                </button>
              </div>
            </div>
          )}
          {pricing && pricing.costPrice > 0 && (
            <div style={{ background: "var(--surface-2)", padding: "8px 10px", marginBottom: 10, fontSize: "0.78rem" }}>
              <div className="flex justify-between">
                <span style={{ opacity: 0.7 }}>
                  Cost to produce ({pricing.costSource === "production" ? "latest batch" : "inventory avg — no production batch yet"})
                </span>
                <span className="mono-num">{formatNPR(pricing.costPrice)}/{item.unit}</span>
              </div>
              <div className="flex justify-between" style={{ marginTop: 2 }}>
                <span style={{ opacity: 0.7 }}>Minimum selling price (+{pricing.marginPercent}% margin)</span>
                <span className="mono-num" style={{ fontWeight: 600, color: "var(--accent-forest)" }}>
                  {formatNPR(pricing.minSellingPrice)}/{item.unit}
                </span>
              </div>
            </div>
          )}
          {expiry && expiry.batches.length > 0 && (
            <div style={{ background: "var(--alert-brown-bg)", padding: "8px 10px", marginBottom: 10, fontSize: "0.78rem" }}>
              <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 4 }}>
                Shelf life by batch (oldest first)
              </p>
              {expiry.batches.map((b, i) => (
                <div key={i} className="flex justify-between" style={{ padding: "2px 0" }}>
                  <span style={{ opacity: 0.75 }}>
                    <span className="mono-num">{b.qty}</span> {item.unit} · stocked {b.stockedDate}
                  </span>
                  <span
                    className="mono-num"
                    style={{
                      fontWeight: b.daysLeft < 0 || b.daysLeft <= (expiry.soonThreshold || 7) ? 600 : 400,
                      color: b.daysLeft < 0 ? "var(--accent-red)" : b.daysLeft <= (expiry.soonThreshold || 7) ? "var(--accent-brown)" : "var(--accent-forest)",
                    }}
                  >
                    {b.daysLeft < 0 ? `expired ${Math.abs(b.daysLeft)}d ago` : `${b.daysLeft}d left`}
                  </span>
                </div>
              ))}
              {expiry.expiredQty > 0 && (
                <p style={{ fontSize: "0.7rem", color: "var(--accent-red)", marginTop: 4 }}>
                  Record spoiled stock as a Stock Out so counts and valuation stay honest.
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => onStockIn(item.id)}
              style={{ background: "var(--btn-forest)", color: "var(--on-dark)", padding: "6px 12px", fontSize: "0.78rem" }}
            >
              + Stock in
            </button>
            <button
              onClick={() => onStockOut(item.id)}
              style={{ background: "var(--btn-red)", color: "var(--on-dark)", padding: "6px 12px", fontSize: "0.78rem" }}
            >
              − Stock out
            </button>
            {role === "partner" && (
              <>
                <button
                  onClick={() => onEditItem(item)}
                  style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.78rem" }}
                >
                  Edit item
                </button>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.78rem" }}
                >
                  Remove item
                </button>
              </>
            )}
          </div>

          {fifo.batches.length > 0 && (
            <div className="mb-3">
              <p style={{ fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.55, letterSpacing: "0.05em" }} className="mb-1">
                Remaining batches (oldest first)
              </p>
              {fifo.batches.map((b, i) => (
                <div key={i} className="flex justify-between text-sm py-1" style={{ opacity: 0.85 }}>
                  <span>
                    {b.date} — {b.qty} {item.unit}
                  </span>
                  <span className="mono-num">@{formatNPR(b.unitCost)}</span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: "0.7rem", textTransform: "uppercase", opacity: 0.55, letterSpacing: "0.05em" }} className="mb-1">
            Movement history
          </p>
          {movesSorted.length === 0 ? (
            <EmptyNote text="No stock movements recorded yet." />
          ) : (
            movesSorted
              .slice()
              .reverse()
              .map((t, i) => (
                <div key={t.id} className="ledger-rule row-in flex justify-between items-center py-2 text-sm" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                  <div>
                    <span>{t.type === "in" ? "Stock in" : "Stock out"}</span>
                    <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                      {" "}
                      · {t.date}
                      {t.note && ` · ${t.note}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="mono-num" style={{ color: t.type === "in" ? "var(--accent-forest)" : "var(--accent-red)" }}>
                      {t.type === "in" ? "+" : "−"}
                      {t.quantity} {item.unit}
                      {t.type === "in" && ` @${formatNPR(t.unitCost)}`}
                    </span>
                    {!isLinkedEntry(t) && role === "partner" && (
                      <button onClick={() => onEditTx(t)} style={{ opacity: 0.4 }}>
                        <Pencil size={13} />
                      </button>
                    )}
                    {role === "partner" && (
                      <button onClick={() => onDeleteTx(t.id)} style={{ opacity: 0.4 }}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

function StockItemForm({ editEntry, code, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [category, setCategory] = useState(editEntry?.category || "Raw Material");
  const [unit, setUnit] = useState(editEntry?.unit || "kg");
  const [reorderLevel, setReorderLevel] = useState(editEntry?.reorderLevel ? String(editEntry.reorderLevel) : "");
  const [shelfLifeDays, setShelfLifeDays] = useState(editEntry?.shelfLifeDays ? String(editEntry.shelfLifeDays) : "");
  const [minMarginPercent, setMinMarginPercent] = useState(
    editEntry?.minMarginPercent !== undefined ? String(editEntry.minMarginPercent) : "20"
  );

  function submit() {
    if (!name.trim()) return;
    onSave({
      ...(editEntry || {}),
      name: name.trim(),
      category,
      unit: unit.trim() || "unit",
      reorderLevel: Number(reorderLevel) || 0,
      shelfLifeDays: Number(shelfLifeDays) || 0,
      minMarginPercent: category === "Finished Good" ? Number(minMarginPercent) || 0 : undefined,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit stock item" : "Add stock item"}>
      {editEntry && code && (
        <Field label="Item code">
          <input value={code} disabled style={{ ...readOnlyInputStyle, fontFamily: "'Courier New', monospace" }} />
          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
            Use this to enter {code.startsWith("RM") ? "purchases and production" : "sales, returns, and production"}{" "}
            without typing the name.
          </p>
        </Field>
      )}
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Potatoes, Cheese Powder, Cheese Chips 50g" />
      </Field>
      <Field label="Category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          <option value="Raw Material">Raw Material</option>
          <option value="Finished Good">Finished Good</option>
        </select>
      </Field>
      <Field label="Unit">
        <input value={unit} onChange={(e) => setUnit(e.target.value)} style={inputStyle} placeholder="e.g. kg, l, packet, carton" />
      </Field>
      <Field label="Low stock alert level (optional)">
        <input type="number" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} style={inputStyle} placeholder="e.g. 10" />
      </Field>
      <Field label="Shelf life in days (optional)">
        <input type="number" value={shelfLifeDays} onChange={(e) => setShelfLifeDays(e.target.value)} style={inputStyle} placeholder="e.g. 90" />
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
          If set, each batch's expiry is tracked from its stock-in date, and you'll get warnings when stock is
          close to expiring. Applies to raw materials and finished goods alike.
        </p>
      </Field>
      {category === "Finished Good" && (
        <Field label="Minimum margin above cost (%)">
          <input
            type="number"
            value={minMarginPercent}
            onChange={(e) => setMinMarginPercent(e.target.value)}
            style={inputStyle}
            placeholder="20"
          />
          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
            Used to suggest a minimum selling price, based on what this item actually costs to produce (material +
            labor + overhead from its most recent production batch).
          </p>
        </Field>
      )}
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save item"}
      </button>
    </Modal>
  );
}

function StockTxForm({ item, type, available, editEntry, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [unitCost, setUnitCost] = useState(editEntry?.unitCost !== undefined ? String(editEntry.unitCost) : "");
  const [reason, setReason] = useState(editEntry?.reason || "spoilage");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!item || !quantity || Number(quantity) <= 0) return;
    if (type === "in" && (!unitCost || Number(unitCost) < 0)) return;
    onSave({
      ...(editEntry || {}),
      itemId: item.id,
      type,
      date,
      quantity: Number(quantity),
      unitCost: type === "in" ? Number(unitCost) : undefined,
      reason: type === "out" ? reason : undefined,
      note,
    });
  }

  const exceedsStock = type === "out" && Number(quantity) > available;
  const WRITE_OFF_REASONS = [
    { id: "spoilage", label: "Expired / spoiled" },
    { id: "damage", label: "Damaged in handling" },
    { id: "sample", label: "Sample / personal use" },
    { id: "correction", label: "Count correction" },
  ];

  return (
    <Modal onClose={onClose} title={editEntry ? `${item ? item.name : "Item"} — edit entry` : `${item ? item.name : "Item"} — ${type === "in" ? "stock in" : "stock out"}`}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={`Quantity (${item ? item.unit : "unit"})`}>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {type === "in" && (
        <Field label={`Unit cost (Rs. per ${item ? item.unit : "unit"})`}>
          <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
      )}
      {type === "in" && Number(quantity) > 0 && Number(unitCost) > 0 && (
        <Field label="Total value (Rs.)">
          <input value={formatNPR(Number(quantity) * Number(unitCost))} disabled style={readOnlyInputStyle} />
        </Field>
      )}
      {type === "out" && (
        <>
          <Field label="Reason for removing stock">
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={inputStyle}>
              {WRITE_OFF_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <p style={{ fontSize: "0.72rem", opacity: 0.6, marginTop: 4 }}>
              Whatever the reason, the FIFO cost of this stock is written off as a "Spoilage &amp; Write-offs" expense
              on the Income Statement — so your inventory value and profit both stay correct.
            </p>
          </Field>
          <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: 8 }}>
            Available: {available} {item ? item.unit : ""}. Cost is pulled automatically from the oldest batches (FIFO).
          </p>
        </>
      )}
      {exceedsStock && (
        <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginBottom: 8 }}>
          This exceeds current stock on hand — it will still be recorded, but check your numbers.
        </p>
      )}
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder={type === "in" ? "e.g. purchased from Siliguri" : "e.g. used in production batch"} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save"}
      </button>
    </Modal>
  );
}

function SalesView({ role, sales, saleReturns, customers, stockItems, onAddSale, onEditSale, onAddReturn, onEditReturn, onDeleteSale, onDeleteReturn, onGenerateBill }) {
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Cash sale";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || null;

  const combined = [
    ...sales.map((s) => ({ ...s, kind: "sale" })),
    ...saleReturns.map((r) => ({ ...r, kind: "return" })),
  ].sort((a, b) => (a.date === b.date ? 0 : b.date.localeCompare(a.date)));

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-forest)", paddingLeft: 10 }}>Sales & returns</h2>
        <div className="flex gap-2">
          <button
            onClick={onAddSale}
            className="flex items-center gap-1"
            style={{ background: "var(--btn-forest)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record sale
          </button>
          <button
            onClick={onAddReturn}
            className="flex items-center gap-1"
            style={{ background: "var(--btn-red)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record return
          </button>
        </div>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
        <div
          className="ledger-rule grid px-4 py-2"
          style={{
            gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px 30px",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            opacity: 0.6,
          }}
        >
          <span>Date</span>
          <span>Item / note</span>
          <span>Customer</span>
          <span>Cash / Credit</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span></span>
          <span></span>
          <span></span>
        </div>

        {combined.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No sales recorded yet. Record a sale — split cash and credit however the customer paid." />
          </div>
        ) : (
          combined.map((entry, i) => {
            const isSale = entry.kind === "sale";
            const total = isSale ? Number(entry.cashAmount) + Number(entry.creditAmount) : Number(entry.cashRefund) + Number(entry.creditReduction);
            const cashPart = isSale ? entry.cashAmount : entry.cashRefund;
            const creditPart = isSale ? entry.creditAmount : entry.creditReduction;
            return (
              <div
                key={entry.id}
                className="ledger-rule row-in grid px-4 py-3 items-center"
                style={{ gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px 30px", fontSize: "0.85rem", animationDelay: `${Math.min(i, 14) * 25}ms` }}
              >
                <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{entry.date}</span>
                <span>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      textTransform: "uppercase",
                      padding: "1px 6px",
                      marginRight: 6,
                      background: isSale ? "rgba(63,93,66,0.12)" : "rgba(166,61,64,0.12)",
                      color: isSale ? "var(--accent-forest)" : "var(--accent-red)",
                    }}
                  >
                    {isSale ? "Sale" : entry.condition === "waste" ? "Return · waste" : "Return"}
                  </span>
                  {entry.kind === "sale"
                    ? saleLinesSummary(entry, itemName)
                    : itemName(entry.itemId) && `${itemName(entry.itemId)}${entry.quantity ? ` × ${entry.quantity}` : ""}`}
                  {entry.note && <span style={{ opacity: 0.55 }}> — {entry.note}</span>}
                </span>
                <span style={{ fontSize: "0.8rem" }}>{customerName(entry.customerId)}</span>
                <span style={{ fontSize: "0.75rem" }}>
                  {cashPart > 0 && (
                    <span style={{ color: "var(--accent-forest)" }}>
                      {formatNPR(cashPart)} {METHOD_LABELS[entry.method || "cash"]}
                    </span>
                  )}
                  {cashPart > 0 && creditPart > 0 && <br />}
                  {creditPart > 0 && <span style={{ color: "var(--accent-gold)" }}>{formatNPR(creditPart)} credit</span>}
                </span>
                <span className="mono-num" style={{ textAlign: "right", color: isSale ? "var(--accent-forest)" : "var(--accent-red)" }}>
                  {isSale ? "+" : "−"}
                  {formatNPR(total)}
                </span>
                <button onClick={() => onGenerateBill(entry, entry.kind)} style={{ opacity: 0.5 }} title="Print bill">
                  <Printer size={14} />
                </button>
                {role === "partner" && (
                  <>
                    <button
                      onClick={() => (isSale ? onEditSale(entry) : onEditReturn(entry))}
                      style={{ opacity: 0.4 }}
                      title="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => (isSale ? onDeleteSale(entry.id) : onDeleteReturn(entry.id))} style={{ opacity: 0.4 }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SaleForm({ customers, customerCodes, stockItems, stockItemCodes, stockFIFO, finishedGoodPricing, vatSettings, prefill, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [customerId, setCustomerId] = useState(editEntry?.customerId || prefill?.customerId || "");
  const [lines, setLines] = useState(() => {
    if (editEntry) {
      return saleLines(editEntry).map((l) => ({
        itemId: l.itemId,
        quantity: String(l.quantity),
        unitRate: l.unitRate ? String(Math.round(l.unitRate * 100) / 100) : "",
      }));
    }
    if (prefill?.itemId) return [{ itemId: prefill.itemId, quantity: String(prefill.quantity || ""), unitRate: "" }];
    return [];
  });
  const [totalAmount, setTotalAmount] = useState(
    editEntry && saleLines(editEntry).length === 0 ? String(Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) : ""
  );
  // Defaults to the global setting for a new sale; an edited sale keeps
  // whatever it was actually charged with, since the global rate may have
  // changed since — history shouldn't shift under a past bill.
  const [vatApplicable, setVatApplicable] = useState(editEntry ? !!editEntry.vatApplicable : !!vatSettings?.enabled);

  function updateLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }
  const [cashAmount, setCashAmount] = useState(editEntry?.cashAmount !== undefined ? String(editEntry.cashAmount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
  const itemsTotal = validLines.reduce((s, l) => s + Number(l.quantity) * (Number(l.unitRate) || 0), 0);
  // The rate entered — per line or as a free-form amount — is what the
  // customer actually pays, VAT already folded in if applicable, matching
  // how the price is actually set (a Rs. 20 packet stays Rs. 20 whether or
  // not it's subject to VAT). So the total is exactly what's entered; VAT
  // is extracted from inside it for the books, never added on top of it.
  const total = validLines.length > 0 ? itemsTotal : Number(totalAmount) || 0;
  const vatRate = Number(vatSettings?.rate) || 0;
  const vatAmount = vatSettings?.enabled && vatApplicable ? total * (vatRate / (100 + vatRate)) : 0;
  const subtotal = total - vatAmount;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);
  // Availability is checked per ITEM, not per line — two lines of the same
  // product must be summed before comparing against stock on hand.
  const requestedByItem = {};
  validLines.forEach((l) => {
    requestedByItem[l.itemId] = (requestedByItem[l.itemId] || 0) + Number(l.quantity);
  });
  const overSold = Object.entries(requestedByItem).filter(([id, qty]) => qty > (stockFIFO[id]?.currentQty || 0));

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !customerId) return;
    onSave({
      ...(editEntry || {}),
      date,
      customerId: customerId || null,
      // Multi-item sales store `lines`; the legacy single-item fields are
      // cleared so a record never carries two competing sources of truth.
      lines: validLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitRate: Number(l.unitRate) || 0 })),
      itemId: null,
      quantity: 0,
      cashAmount: cash,
      method,
      creditAmount: credit,
      // vatAmount and vatRate are frozen at what was actually charged, so
      // reprinting an old bill — or the global rate changing later — never
      // rewrites what a past sale said.
      vatApplicable: vatSettings?.enabled ? vatApplicable : false,
      vatAmount,
      vatRate: vatAmount > 0 ? vatRate : undefined,
      partner,
      note,
      orderId: editEntry?.orderId ?? prefill?.orderId ?? null,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit sale" : prefill?.orderId ? "Record sale — fulfilling order" : "Record sale"}>
      {prefill?.orderId && (
        <p style={{ fontSize: "0.78rem", background: "var(--surface-2)", padding: "6px 10px", marginBottom: 12 }}>
          Customer, item, and quantity are filled in from the order. Just add the amount and payment split.
        </p>
      )}
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Customer">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
          <option value="">Cash sale — no customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{customerCodes?.[c.id] ? ` — ${customerCodes[c.id]}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Items sold (optional — deducts stock)">
        {lines.map((l, idx) => {
          const pr = l.itemId ? finishedGoodPricing?.[l.itemId] : null;
          const rate = Number(l.unitRate) || 0;
          const lineTotal = (Number(l.quantity) || 0) * rate;
          // Compare against cost using the VAT-excluded portion of the rate
          // — cost and minimum price are what it took to make the thing,
          // with no VAT involved, so checking the full VAT-inclusive price
          // against them would make the margin look better than it is.
          const effectiveRate = vatSettings?.enabled && vatApplicable ? rate * (100 / (100 + vatRate)) : rate;
          return (
            <div key={idx} style={{ background: "#F6F3EA", padding: "8px 10px", marginBottom: 8, border: "1px solid rgba(var(--ink-rgb),0.12)" }}>
              <div className="flex gap-2 items-center">
                <div style={{ flex: 1 }}>
                  <ItemCodeInput
                    stockItems={stockItems}
                    stockItemCodes={stockItemCodes}
                    value={l.itemId}
                    onChange={(id) => updateLine(idx, { itemId: id })}
                    stockFIFO={stockFIFO}
                  />
                </div>
                <button onClick={() => removeLine(idx)} style={{ opacity: 0.5, flexShrink: 0 }} title="Remove this line">
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  value={l.quantity}
                  onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 0 }}
                  placeholder="Qty"
                />
                <input
                  type="number"
                  value={l.unitRate}
                  onChange={(e) => updateLine(idx, { unitRate: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 0 }}
                  placeholder="Rate (Rs.)"
                />
                <input value={formatNPR(lineTotal)} disabled style={{ ...readOnlyInputStyle, marginBottom: 0, width: 110, flexShrink: 0 }} />
              </div>
              {pr && pr.costPrice > 0 && effectiveRate > 0 && effectiveRate < pr.minSellingPrice && (
                <p style={{ fontSize: "0.7rem", color: "var(--accent-red)", marginTop: 4, fontWeight: 600 }}>
                  Below minimum {formatNPR(pr.minSellingPrice)}{effectiveRate < pr.costPrice ? " — and below cost!" : ""}
                </p>
              )}
            </div>
          );
        })}
        <button
          onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: "", unitRate: "" }])}
          className="flex items-center gap-1"
          style={{ background: "var(--surface-2)", color: "var(--ink)", padding: "6px 12px", fontSize: "0.8rem" }}
        >
          <Plus size={14} /> Add item
        </button>
        {overSold.length > 0 && (
          <p style={{ fontSize: "0.72rem", color: "var(--accent-red)", marginTop: 6 }}>
            Exceeds stock: {overSold.map(([id, qty]) => `${stockItems.find((i) => i.id === id)?.name || id} (${qty} asked, ${stockFIFO[id]?.currentQty || 0} available)`).join("; ")}
          </p>
        )}
      </Field>
      {validLines.length > 0 ? (
        <Field label="Total sale amount (Rs.)">
          <input value={formatNPR(total)} disabled style={readOnlyInputStyle} />
        </Field>
      ) : (
        <Field label="Total sale amount (Rs.)">
          <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
      )}
      {vatSettings?.enabled && (
        <>
          <Field label={`Includes VAT (${vatRate}%)`}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} />
              This sale is subject to VAT
            </label>
            <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
              The price above is what the customer pays either way — checking this just tells the books that VAT is
              already included in it, rather than adding anything extra to charge.
            </p>
          </Field>
          {vatApplicable && (
            <>
              <Field label="Of which: subtotal (Rs., excl. VAT)">
                <input value={formatNPR(subtotal)} disabled style={readOnlyInputStyle} />
              </Field>
              <Field label="Of which: VAT (Rs.)">
                <input value={formatNPR(vatAmount)} disabled style={readOnlyInputStyle} />
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Amount received now (Rs.)">
        <input
          type="number"
          value={cashAmount}
          onChange={(e) => setCashAmount(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!customerId}
        />
        {!customerId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No customer selected — full amount is treated as received now.</p>}
      </Field>
      {cash > 0 && (
        <Field label="Received via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {customerId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Received: <span className="mono-num">{formatNPR(cash)}</span> · Credit to {customers.find((c) => c.id === customerId)?.name}:{" "}
          <span className="mono-num" style={{ color: "var(--accent-gold)" }}>{formatNPR(credit)}</span>
        </p>
      )}
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save sale"}
      </button>
    </Modal>
  );
}

function ReturnForm({ customers, customerCodes, stockItems, stockItemCodes, stockFIFO, vatSettings, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [customerId, setCustomerId] = useState(editEntry?.customerId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || "");
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [unitCost, setUnitCost] = useState(editEntry?.unitCost !== undefined ? String(editEntry.unitCost) : "");
  const [condition, setCondition] = useState(editEntry?.condition || "restock");
  const [totalAmount, setTotalAmount] = useState(
    editEntry ? String(Number(editEntry.cashRefund) + Number(editEntry.creditReduction)) : ""
  );
  const [cashRefund, setCashRefund] = useState(editEntry?.cashRefund !== undefined ? String(editEntry.cashRefund) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");
  // If the original sale charged VAT, the refund should give that portion
  // back too — same inclusive-price principle as everywhere else: the
  // amount entered is exactly what's refunded, VAT is extracted from
  // inside it rather than added on top.
  const [vatApplicable, setVatApplicable] = useState(editEntry ? !!editEntry.vatApplicable : !!vatSettings?.enabled);

  const total = Number(totalAmount) || 0;
  const vatRate = Number(vatSettings?.rate) || 0;
  const vatAmount = vatSettings?.enabled && vatApplicable ? total * (vatRate / (100 + vatRate)) : 0;
  const subtotal = total - vatAmount;
  const cash = Math.min(Number(cashRefund) || 0, total);
  const credit = Math.max(total - cash, 0);

  function handleItemChange(id) {
    setItemId(id);
    if (id && stockFIFO[id]) setUnitCost(String(stockFIFO[id].avgCost.toFixed(2)));
  }

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !customerId) return;
    onSave({
      ...(editEntry || {}),
      date,
      customerId: customerId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      unitCost: itemId ? Number(unitCost) || 0 : 0,
      condition: itemId ? condition : "restock",
      cashRefund: cash,
      method,
      creditReduction: credit,
      vatApplicable: vatSettings?.enabled ? vatApplicable : false,
      vatAmount,
      vatRate: vatAmount > 0 ? vatRate : undefined,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit return" : "Record sale return"}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Customer (needed if reducing credit owed)">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
          <option value="">No customer — cash refund only</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{customerCodes?.[c.id] ? ` — ${customerCodes[c.id]}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Item returned (optional — restocks)">
        <ItemCodeInput stockItems={stockItems} stockItemCodes={stockItemCodes} value={itemId} onChange={handleItemChange} stockFIFO={stockFIFO} />
      </Field>
      {itemId && (
        <>
          <Field label="Quantity returned">
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
          </Field>
          <Field label="Condition of returned stock">
            <select value={condition} onChange={(e) => setCondition(e.target.value)} style={inputStyle}>
              <option value="restock">Good — put back into stock</option>
              <option value="waste">Expired / damaged — waste, do not restock</option>
            </select>
            {condition === "waste" && (
              <p style={{ fontSize: "0.72rem", color: "var(--accent-red)", marginTop: 4 }}>
                The customer still gets their refund or credit, but nothing returns to stock and the cost of these
                goods stays written off — your stock count, inventory value, and profit all stay honest.
              </p>
            )}
          </Field>
          {condition === "restock" && (
            <Field label="Restock unit cost (Rs.) — defaults to current average cost">
              <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} />
            </Field>
          )}
        </>
      )}
      <Field label="Total return amount (Rs.)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {vatSettings?.enabled && (
        <>
          <Field label={`Includes VAT (${vatRate}%)`}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} />
              The original sale charged VAT — refund it back too
            </label>
          </Field>
          {vatApplicable && (
            <>
              <Field label="Of which: subtotal (Rs., excl. VAT)">
                <input value={formatNPR(subtotal)} disabled style={readOnlyInputStyle} />
              </Field>
              <Field label="Of which: VAT (Rs.)">
                <input value={formatNPR(vatAmount)} disabled style={readOnlyInputStyle} />
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Amount refunded now (Rs.)">
        <input
          type="number"
          value={cashRefund}
          onChange={(e) => setCashRefund(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!customerId}
        />
        {!customerId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No customer selected — full amount is a refund now.</p>}
      </Field>
      {cash > 0 && (
        <Field label="Refunded via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {customerId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Refund: <span className="mono-num">{formatNPR(cash)}</span> · Reduces {customers.find((c) => c.id === customerId)?.name}'s balance owed by:{" "}
          <span className="mono-num" style={{ color: "var(--accent-gold)" }}>{formatNPR(credit)}</span>
        </p>
      )}
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. damaged packets" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save return"}
      </button>
    </Modal>
  );
}

function PurchaseReturnForm({ suppliers, supplierCodes, stockItems, stockItemCodes, stockFIFO, vatSettings, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [supplierId, setSupplierId] = useState(editEntry?.supplierId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || "");
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [totalAmount, setTotalAmount] = useState(
    editEntry ? String(Number(editEntry.cashRefund) + Number(editEntry.creditReduction)) : ""
  );
  const [cashRefund, setCashRefund] = useState(editEntry?.cashRefund !== undefined ? String(editEntry.cashRefund) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");
  // If the original purchase included VAT, getting the goods back means
  // reversing the input credit claimed on them too — same inclusive
  // principle as everywhere else in the app.
  const [vatApplicable, setVatApplicable] = useState(editEntry ? !!editEntry.vatApplicable : !!vatSettings?.enabled);

  const total = Number(totalAmount) || 0;
  const vatRate = Number(vatSettings?.rate) || 0;
  const vatAmount = vatSettings?.enabled && vatApplicable ? total * (vatRate / (100 + vatRate)) : 0;
  const subtotal = total - vatAmount;
  const cash = Math.min(Number(cashRefund) || 0, total);
  const credit = Math.max(total - cash, 0);
  const available = itemId ? stockFIFO[itemId]?.currentQty || 0 : null;
  const estimatedBookCost = itemId && quantity ? (stockFIFO[itemId]?.avgCost || 0) * Number(quantity) : 0;
  // Compared against the VAT-excluded portion — book cost is inherently
  // VAT-free (that's the whole point of tracking VAT as a separate credit
  // rather than folding it into stock value), so comparing it against a
  // VAT-inclusive refund would make every return look like a bigger gain
  // than it really is, by exactly the VAT amount.
  const estimatedGainLoss = subtotal - estimatedBookCost;

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !supplierId) return;
    onSave({
      ...(editEntry || {}),
      date,
      supplierId: supplierId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      cashRefund: cash,
      method,
      creditReduction: credit,
      vatApplicable: vatSettings?.enabled ? vatApplicable : false,
      vatAmount,
      vatRate: vatAmount > 0 ? vatRate : undefined,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit purchase return" : "Record purchase return"}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Supplier (needed if reducing credit owed)">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
          <option value="">No supplier — cash refund only</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{supplierCodes?.[s.id] ? ` — ${supplierCodes[s.id]}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Item sent back (optional — removes from stock)">
        <ItemCodeInput stockItems={stockItems} stockItemCodes={stockItemCodes} value={itemId} onChange={setItemId} stockFIFO={stockFIFO} />
      </Field>
      {itemId && (
        <Field label="Quantity returned">
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
          {Number(quantity) > available && (
            <p style={{ fontSize: "0.72rem", color: "var(--accent-red)", marginTop: 4 }}>Exceeds current stock ({available} available).</p>
          )}
        </Field>
      )}
      <Field label="Total return amount (Rs.)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {vatSettings?.enabled && (
        <>
          <Field label={`Includes VAT (${vatRate}%)`}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} />
              The original purchase included VAT — reverse that credit too
            </label>
          </Field>
          {vatApplicable && (
            <>
              <Field label="Of which: subtotal (Rs., excl. VAT)">
                <input value={formatNPR(subtotal)} disabled style={readOnlyInputStyle} />
              </Field>
              <Field label="Of which: VAT (Rs.)">
                <input value={formatNPR(vatAmount)} disabled style={readOnlyInputStyle} />
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Amount refunded to us now (Rs.)">
        <input
          type="number"
          value={cashRefund}
          onChange={(e) => setCashRefund(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!supplierId}
        />
        {!supplierId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No supplier selected — full amount is a refund now.</p>}
      </Field>
      {cash > 0 && (
        <Field label="Refunded via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {supplierId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Refund: <span className="mono-num">{formatNPR(cash)}</span> · Reduces what we owe {suppliers.find((s) => s.id === supplierId)?.name} by:{" "}
          <span className="mono-num" style={{ color: "var(--accent-gold)" }}>{formatNPR(credit)}</span>
        </p>
      )}
      {itemId && quantity > 0 && total > 0 && (
        <p style={{ fontSize: "0.75rem", opacity: 0.7, marginBottom: 10, background: "var(--surface-2)", padding: "8px 10px" }}>
          Estimated book cost of this stock: <span className="mono-num">{formatNPR(estimatedBookCost)}</span>
          {Math.abs(estimatedGainLoss) > 0.5 && (
            <>
              {" "}— this return will likely book a{" "}
              <span style={{ color: estimatedGainLoss > 0 ? "var(--accent-forest)" : "var(--accent-red)", fontWeight: 600 }}>
                {estimatedGainLoss > 0 ? "gain" : "loss"} of {formatNPR(Math.abs(estimatedGainLoss))}
              </span>{" "}
              on the Income Statement, since the refund differs from what this stock cost. (Estimate — the exact figure uses FIFO, not average cost.)
            </>
          )}
        </p>
      )}
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. damaged raw material" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save return"}
      </button>
    </Modal>
  );
}

function InvoiceModal({ billEntry, customers, customerCodes, stockItems, customerBalances, vatSettings, onClose }) {
  const { kind, entry } = billEntry;
  const isSale = kind === "sale";
  const customer = customers.find((c) => c.id === entry.customerId);
  const item = stockItems.find((i) => i.id === entry.itemId);
  // Sales can have several lines; returns stay single-item. Each line
  // carries its own rate so the bill shows real per-product pricing.
  const billLines = isSale
    ? saleLines(entry).map((l) => ({ ...l, item: stockItems.find((i) => i.id === l.itemId) }))
    : [];
  const total = isSale ? Number(entry.cashAmount) + Number(entry.creditAmount) : Number(entry.cashRefund) + Number(entry.creditReduction);
  // The amount and rate are whatever was actually charged/refunded at the
  // time — frozen on the record — so an old bill never changes just
  // because the current rate or PAN number does.
  const vatAmount = entry.vatApplicable ? Number(entry.vatAmount) || 0 : 0;
  const subtotal = total - vatAmount;
  const cash = isSale ? Number(entry.cashAmount) : Number(entry.cashRefund);
  const credit = isSale ? Number(entry.creditAmount) : Number(entry.creditReduction);
  const methodLabel = METHOD_LABELS[entry.method] || "Cash";
  const invoiceNo = `${isSale ? "INV" : "CRN"}-${entry.id.slice(-6).toUpperCase()}`;
  const unitPrice = item && entry.quantity ? total / entry.quantity : null;
  const outstandingBalance = customer ? customerBalances?.[customer.id] || 0 : null;

  const waText = [
    `*Trikut Snacks* — ${isSale ? "Bill" : "Credit Note"} ${invoiceNo}`,
    `Date: ${entry.date}`,
    ``,
    ...(isSale && billLines.length > 0
      ? billLines.map((l) => `${l.item?.name || "Item"} × ${l.quantity}${l.item ? ` ${l.item.unit}` : ""} @ ${formatNPR(l.unitRate)} = ${formatNPR(Number(l.quantity) * Number(l.unitRate || 0))}`)
      : [
          `${item ? `${item.name} × ${entry.quantity} ${item.unit}` : entry.note || (isSale ? "Sale" : "Return")}${
            unitPrice ? ` @ ${formatNPR(unitPrice)}` : ""
          }`,
        ]),
    ``,
    vatAmount > 0 ? `Subtotal: ${formatNPR(subtotal)}` : null,
    vatAmount > 0 ? `VAT (${entry.vatRate}%): ${formatNPR(vatAmount)}` : null,
    `Total: ${formatNPR(total)}`,
    cash > 0 ? `${isSale ? "Paid" : "Refunded"} (${methodLabel}): ${formatNPR(cash)}` : null,
    credit > 0 ? `${isSale ? "Added to credit balance" : "Credited against balance"}: ${formatNPR(credit)}` : null,
    outstandingBalance !== null ? `${outstandingBalance > 0 ? "Outstanding balance" : "Account balance"}: ${formatNPR(Math.abs(outstandingBalance))}${outstandingBalance < 0 ? " (in credit)" : ""}` : null,
    ``,
    `Thank you for your business — Trikut Snacks`,
  ].filter(Boolean).join("\n");

  const waLink = customer?.phone ? whatsAppLink(customer.phone, waText) : null;
  const billMailLink = emailLink(
    customer?.email,
    `Trikut Snacks — ${isSale ? "Bill" : "Credit Note"} ${invoiceNo}`,
    waText.replace(/\*/g, "") + "\n\n(PDF copy attached.)"
  );
  // "roller80" / "roller58" are thermal receipt-roll widths; "a4" is the
  // full-page layout. Roller is the default since that's the shop printer.
  const [paper, setPaper] = useState("roller80");
  const [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      style={{ background: "rgba(20,17,14,0.55)", zIndex: 60, backdropFilter: "blur(2px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={`${closing ? "modal-panel-out" : "modal-panel"} print-full-width`}
        style={{ background: "var(--card-bg)", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}
      >
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>
            {isSale ? "Bill preview" : "Credit note preview"}
          </span>
          <div className="flex gap-1">
            {[
              { id: "roller80", label: "80mm roll" },
              { id: "roller58", label: "58mm roll" },
              { id: "a4", label: "A4" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPaper(p.id)}
                style={{
                  background: paper === p.id ? "var(--ink)" : "var(--surface-2)",
                  color: paper === p.id ? "#fff" : "var(--ink)",
                  padding: "4px 8px",
                  fontSize: "0.7rem",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
                style={{ background: "var(--btn-forest)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <MessageCircle size={14} /> Send via WhatsApp
              </a>
            ) : (
              customer && (
                <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>Add a phone number to send via WhatsApp</span>
              )
            )}
            {billMailLink && (
              <a
                href={billMailLink}
                className="flex items-center gap-1"
                title="Opens your email app pre-filled. Use Print → Save as PDF first, then attach the saved PDF."
                style={{ background: "var(--btn-blue)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <Mail size={14} /> Email bill
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "var(--ink-surface)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={requestClose} style={{ color: "var(--ink)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {paper !== "a4" && (
          <style>{`@media print {
            @page { size: ${paper === "roller58" ? "58mm" : "80mm"} auto; margin: 3mm; }
            #invoice-print-area { width: auto !important; max-width: none !important; padding: 0 !important; }
          }`}</style>
        )}
        {paper !== "a4" ? (
          <div style={{ background: "#EFEAE0", padding: "16px 0" }}>
            <div
              id="invoice-print-area"
              style={{
                width: paper === "roller58" ? 219 : 302,
                margin: "0 auto",
                // This deliberately stays a fixed white/dark pair regardless
                // of theme — it's simulating actual thermal receipt paper,
                // which is white no matter how the app around it is themed.
                background: "#fff",
                padding: "14px 12px",
                color: "#2B2621",
                fontFamily: "Georgia, serif",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: 8 }}>
                <p style={{ fontSize: "1rem", fontWeight: 700, margin: 0, letterSpacing: "0.04em" }}>TRIKUT SNACKS</p>
                <p style={{ fontSize: "0.66rem", margin: 0, opacity: 0.75 }}>Three Peaks, One Great Taste</p>
                <p style={{ fontSize: "0.66rem", margin: 0, opacity: 0.75 }}>Dharan, Sunsari, Nepal</p>
                {vatSettings?.panNumber && <p style={{ fontSize: "0.66rem", margin: 0, opacity: 0.75 }}>PAN/VAT No. {vatSettings.panNumber}</p>}
              </div>
              <div style={{ borderTop: "1px dashed #2B2621", margin: "6px 0" }} />
              <p style={{ fontSize: "0.74rem", margin: 0, fontWeight: 700 }}>
                {isSale ? "BILL" : "CREDIT NOTE"} <span className="mono-num">{invoiceNo}</span>
              </p>
              <p style={{ fontSize: "0.7rem", margin: 0 }}>
                Date: {entry.date}{formatBS(entry.date) && ` (${formatBS(entry.date, { short: true })} BS)`}
              </p>
              <p style={{ fontSize: "0.7rem", margin: 0 }}>Handled by: {entry.partner || "—"}</p>
              <p style={{ fontSize: "0.7rem", margin: "2px 0 0" }}>
                {isSale ? "Customer" : "For"}: {customer ? customer.name : "Cash sale / walk-in"}
                {customer && customerCodes[customer.id] ? ` (${customerCodes[customer.id]})` : ""}
              </p>
              {customer?.phone && <p style={{ fontSize: "0.7rem", margin: 0 }}>{customer.phone}</p>}
              <div style={{ borderTop: "1px dashed #2B2621", margin: "6px 0" }} />
              {isSale && billLines.length > 0 ? (
                billLines.map((l, i) => (
                  <div key={i} style={{ marginBottom: 3 }}>
                    <p style={{ fontSize: "0.74rem", margin: 0, fontWeight: 600 }}>{l.item?.name || "Item"}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem" }}>
                      <span>
                        <span className="mono-num">{l.quantity}</span> {l.item?.unit || ""} × <span className="mono-num">{formatNPR(l.unitRate)}</span>
                      </span>
                      <span className="mono-num">{formatNPR(Number(l.quantity) * Number(l.unitRate || 0))}</span>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <p style={{ fontSize: "0.76rem", margin: 0, fontWeight: 600 }}>
                    {item ? item.name : entry.note || (isSale ? "Sale" : "Return")}
                  </p>
                  {item && entry.quantity ? (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginTop: 2 }}>
                      <span>
                        <span className="mono-num">{entry.quantity}</span> {item.unit} × <span className="mono-num">{unitPrice ? formatNPR(unitPrice) : "—"}</span>
                      </span>
                      <span className="mono-num">{formatNPR(total)}</span>
                    </div>
                  ) : (
                    <div style={{ textAlign: "right", fontSize: "0.72rem" }}>
                      <span className="mono-num">{formatNPR(total)}</span>
                    </div>
                  )}
                </>
              )}
              {entry.note && (item || billLines.length > 0) && <p style={{ fontSize: "0.66rem", opacity: 0.7, margin: "2px 0 0" }}>Note: {entry.note}</p>}
              <div style={{ borderTop: "1px dashed #2B2621", margin: "6px 0" }} />
              {vatAmount > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem" }}>
                    <span>Subtotal</span>
                    <span className="mono-num">{formatNPR(subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem" }}>
                    <span>VAT ({entry.vatRate}%)</span>
                    <span className="mono-num">{formatNPR(vatAmount)}</span>
                  </div>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", fontWeight: 700 }}>
                <span>Total</span>
                <span className="mono-num">{formatNPR(total)}</span>
              </div>
              {cash > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginTop: 2 }}>
                  <span>{isSale ? "Paid" : "Refunded"} ({methodLabel})</span>
                  <span className="mono-num">{formatNPR(cash)}</span>
                </div>
              )}
              {credit > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", marginTop: 2 }}>
                  <span>{isSale ? "On credit" : "Credited to account"}</span>
                  <span className="mono-num">{formatNPR(credit)}</span>
                </div>
              )}
              {customer && outstandingBalance !== null && Math.abs(outstandingBalance) > 0.5 && (
                <>
                  <div style={{ borderTop: "1px dashed #2B2621", margin: "6px 0" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem" }}>
                    <span>{outstandingBalance > 0 ? "Total outstanding" : "Account in credit"}</span>
                    <span className="mono-num">{formatNPR(Math.abs(outstandingBalance))}</span>
                  </div>
                </>
              )}
              <div style={{ borderTop: "1px dashed #2B2621", margin: "6px 0" }} />
              <p style={{ fontSize: "0.66rem", textAlign: "center", margin: "6px 0 0", opacity: 0.75 }}>Thank you for your business</p>
              <p style={{ fontSize: "0.66rem", textAlign: "center", margin: 0, opacity: 0.75 }}>Trikut Snacks</p>
            </div>
          </div>
        ) : (
        <div id="invoice-print-area" style={{ padding: "28px", color: "var(--ink)", fontFamily: "Georgia, serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, borderBottom: "2px solid var(--ink)", paddingBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: "1.4rem", margin: 0 }}>Trikut Snacks</h2>
              <p style={{ fontSize: "0.78rem", margin: "2px 0 0", opacity: 0.7 }}>Three Peaks, One Great Taste</p>
              <p style={{ fontSize: "0.78rem", margin: 0, opacity: 0.7 }}>Dharan, Sunsari, Nepal</p>
              {vatSettings?.panNumber && <p style={{ fontSize: "0.78rem", margin: 0, opacity: 0.7 }}>PAN/VAT No. {vatSettings.panNumber}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, letterSpacing: "0.03em" }}>{isSale ? "BILL" : "CREDIT NOTE"}</p>
              <p style={{ fontSize: "0.8rem", margin: "4px 0 0" }}>No: <strong>{invoiceNo}</strong></p>
              <p style={{ fontSize: "0.8rem", margin: 0 }}>Date: {entry.date}</p>
              {formatBS(entry.date) && <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>{formatBS(entry.date)} BS</p>}
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 20, fontSize: "0.85rem" }}>
            <div>
              <p style={{ margin: 0, opacity: 0.6, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.04em" }}>
                {isSale ? "Billed to" : "Credit note for"}
              </p>
              <p style={{ margin: "2px 0 0", fontWeight: 600 }}>
                {customer ? customer.name : "Cash sale / walk-in customer"}
                {customer && customerCodes[customer.id] && (
                  <span style={{ opacity: 0.6, fontWeight: 400 }}> ({customerCodes[customer.id]})</span>
                )}
              </p>
              {customer?.phone && <p style={{ margin: 0 }}>{customer.phone}</p>}
              {customer?.address && <p style={{ margin: 0 }}>{customer.address}</p>}
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ margin: 0, opacity: 0.6, textTransform: "uppercase", fontSize: "0.7rem", letterSpacing: "0.04em" }}>Handled by</p>
              <p style={{ margin: "2px 0 0", fontWeight: 600 }}>{entry.partner || "—"}</p>
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: 4 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Description</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {isSale && billLines.length > 0 ? (
                billLines.map((l, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                    <td style={{ padding: "10px 0" }}>{l.item?.name || "Item"}</td>
                    <td style={{ textAlign: "right" }}>{l.quantity} {l.item?.unit || ""}</td>
                    <td style={{ textAlign: "right" }}>{formatNPR(l.unitRate)}</td>
                    <td style={{ textAlign: "right" }}>{formatNPR(Number(l.quantity) * Number(l.unitRate || 0))}</td>
                  </tr>
                ))
              ) : (
                <tr style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                  <td style={{ padding: "10px 0" }}>{item ? item.name : entry.note || (isSale ? "Sale" : "Return")}</td>
                  <td style={{ textAlign: "right" }}>{item && entry.quantity ? `${entry.quantity} ${item.unit}` : "—"}</td>
                  <td style={{ textAlign: "right" }}>{unitPrice ? formatNPR(unitPrice) : "—"}</td>
                  <td style={{ textAlign: "right" }}>{formatNPR(total)}</td>
                </tr>
              )}
            </tbody>
          </table>

          {entry.note && (item || billLines.length > 0) && (
            <p style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: 4, marginBottom: 16 }}>Note: {entry.note}</p>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <div style={{ width: 260, fontSize: "0.85rem" }}>
              {vatAmount > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span>Subtotal</span>
                    <span className="mono-num">{formatNPR(subtotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span>VAT ({entry.vatRate}%)</span>
                    <span className="mono-num">{formatNPR(vatAmount)}</span>
                  </div>
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span>Total</span>
                <span className="mono-num">{formatNPR(total)}</span>
              </div>
              {cash > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span>{isSale ? "Paid" : "Refunded"} ({methodLabel})</span>
                  <span className="mono-num">{formatNPR(cash)}</span>
                </div>
              )}
              {credit > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                  <span>{isSale ? "Added to credit balance" : "Credited against balance"}</span>
                  <span className="mono-num">{formatNPR(credit)}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "6px 0",
                  borderTop: "3px double var(--ink)",
                  marginTop: 4,
                  fontWeight: 700,
                  fontSize: "0.92rem",
                }}
              >
                <span>{isSale ? "This bill" : "This credit note"}</span>
                <span className="mono-num">{formatNPR(total)}</span>
              </div>
              {customer && outstandingBalance !== null && Math.abs(outstandingBalance) > 0.5 && (
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", fontSize: "0.8rem", opacity: 0.75 }}>
                  <span>{outstandingBalance > 0 ? "Total outstanding on account" : "Account is in credit"}</span>
                  <span className="mono-num">{formatNPR(Math.abs(outstandingBalance))}</span>
                </div>
              )}
            </div>
          </div>

          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 32, textAlign: "center" }}>
            Thank you for your business — Trikut Snacks
          </p>
        </div>
        )}
      </div>
    </div>
  );
}

function AccountStatementModal({
  target,
  customers,
  suppliers,
  customerCodes,
  supplierCodes,
  receivables,
  payables,
  sales,
  saleReturns,
  purchases,
  stockItems,
  onClose,
}) {
  const [period, setPeriod] = useState("3m");
  const [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(todayISO());
  const isCustomer = target.type === "customer";
  const party = isCustomer
    ? customers.find((c) => c.id === target.id)
    : suppliers.find((s) => s.id === target.id);
  const partyCode = isCustomer ? customerCodes[target.id] : supplierCodes[target.id];
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  // Build a unified, chronological list of every transaction with this party —
  // sales/purchases (whether paid in full or on credit), returns, and any
  // manually-logged charge/payment not already tied to one of those. Only the
  // credit portion of each moves the running balance; cash portions are shown
  // for full visibility but settle immediately.
  let allEntries = [];
  if (isCustomer) {
    allEntries = [
      ...sales
        .filter((s) => s.customerId === target.id)
        .map((s) => {
          const total = Number(s.cashAmount) + Number(s.creditAmount);
          const cashPart = Number(s.cashAmount);
          const creditPart = Number(s.creditAmount);
          return {
            id: s.id,
            date: s.date,
            description: `Sale${saleLinesSummary(s, itemName) ? ` — ${saleLinesSummary(s, itemName)}` : ""}${s.note ? ` · ${s.note}` : ""}`,
            total,
            paidNow: cashPart,
            method: cashPart > 0 ? s.method || "cash" : null,
            debit: creditPart,
            credit: 0,
            delta: creditPart,
          };
        }),
      ...saleReturns
        .filter((r) => r.customerId === target.id)
        .map((r) => {
          const total = Number(r.cashRefund) + Number(r.creditReduction);
          const cashPart = Number(r.cashRefund);
          const creditPart = Number(r.creditReduction);
          return {
            id: r.id,
            date: r.date,
            description: `Return${r.itemId ? ` — ${itemName(r.itemId)} × ${r.quantity} ${itemUnit(r.itemId)}` : ""}${r.note ? ` · ${r.note}` : ""}`,
            total: -total,
            paidNow: -cashPart,
            method: cashPart > 0 ? r.method || "cash" : null,
            debit: 0,
            credit: creditPart,
            delta: -creditPart,
          };
        }),
      ...receivables
        .filter((r) => r.customerId === target.id && !r.saleId && !r.returnId)
        .map((r) => ({
          id: r.id,
          date: r.date,
          description: r.note || (r.type === "charge" ? "Charge" : "Payment received"),
          total: r.type === "charge" ? Number(r.amount) : -Number(r.amount),
          paidNow: r.type === "payment" ? Number(r.amount) : 0,
          method: r.type === "payment" ? r.method || "cash" : null,
          debit: r.type === "charge" ? Number(r.amount) : 0,
          credit: r.type === "payment" ? Number(r.amount) : 0,
          delta: r.type === "charge" ? Number(r.amount) : -Number(r.amount),
        })),
    ];
  } else {
    allEntries = [
      ...purchases
        .filter((p) => p.supplierId === target.id)
        .map((p) => {
          const total = Number(p.cashAmount) + Number(p.creditAmount);
          const cashPart = Number(p.cashAmount);
          const creditPart = Number(p.creditAmount);
          return {
            id: p.id,
            date: p.date,
            description: `Purchase${purchaseLinesSummary(p, itemName) ? ` — ${purchaseLinesSummary(p, itemName)}` : ""}${p.note ? ` · ${p.note}` : ""}`,
            total,
            paidNow: cashPart,
            method: cashPart > 0 ? p.method || "cash" : null,
            debit: creditPart,
            credit: 0,
            delta: creditPart,
          };
        }),
      ...payables
        .filter((p) => p.supplierId === target.id && !p.purchaseId)
        .map((p) => ({
          id: p.id,
          date: p.date,
          description: p.note || (p.type === "charge" ? "Charge" : "Payment made"),
          total: p.type === "charge" ? Number(p.amount) : -Number(p.amount),
          paidNow: p.type === "payment" ? Number(p.amount) : 0,
          method: p.type === "payment" ? p.method || "cash" : null,
          debit: p.type === "charge" ? Number(p.amount) : 0,
          credit: p.type === "payment" ? Number(p.amount) : 0,
          delta: p.type === "charge" ? Number(p.amount) : -Number(p.amount),
        })),
    ];
  }

  const sorted = [...allEntries].sort((a, b) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)
  );

  let running = 0;
  const allRows = sorted.map((e) => {
    running += e.delta;
    return { ...e, balance: running };
  });

  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const cutoff3m = threeMonthsAgo.toISOString().slice(0, 10);

  const rangeStart = period === "3m" ? cutoff3m : period === "custom" ? customFrom : null;
  const rangeEnd = period === "custom" ? customTo : null;

  const openingBalance = rangeStart
    ? allRows.filter((r) => r.date < rangeStart).reduce((s, r) => s + r.delta, 0)
    : 0;
  const rows = allRows.filter((r) => {
    if (rangeStart && r.date < rangeStart) return false;
    if (rangeEnd && r.date > rangeEnd) return false;
    return true;
  });
  // Closing balance reflects the balance as of the end of the displayed
  // period — for "Last 3 months"/"All time" that's always today (same as
  // the true current balance), but for a custom range ending in the past,
  // this correctly shows what was owed as of that end date, not today.
  const closingBalance = rows.length > 0 ? rows[rows.length - 1].balance : openingBalance;

  const totalOfTotals = rows.reduce((s, r) => s + r.total, 0);
  const totalPaidNow = rows.reduce((s, r) => s + r.paidNow, 0);

  const partyLabel = isCustomer ? "Customer" : "Supplier";
  const balanceLabel = isCustomer
    ? closingBalance > 0
      ? "Owed to you"
      : "Settled / credit"
    : closingBalance > 0
      ? "You owe"
      : "Settled / credit";

  const periodLabel =
    period === "3m" ? "Last 3 months" : period === "all" ? "All time" : `${customFrom} to ${customTo}`;

  const statementText = [
    `*Trikut Snacks* — Account Statement`,
    `${partyLabel}: ${party ? party.name : "Unknown"}`,
    `Period: ${periodLabel}`,
    ``,
    ...(rangeStart ? [`Opening balance: ${formatNPR(Math.abs(openingBalance))}`] : []),
    ...rows.map(
      (r) =>
        `${r.date}: ${r.description} — total ${formatNPR(r.total)}${r.paidNow ? `, paid ${formatNPR(r.paidNow)} (${METHOD_LABELS[r.method] || "Cash"})` : ""} — bal ${formatNPR(r.balance)}`
    ),
    ``,
    `Closing balance: ${formatNPR(Math.abs(closingBalance))} — ${balanceLabel}`,
  ].join("\n");

  const waLink = party?.phone ? whatsAppLink(party.phone, statementText) : null;
  const statementMailLink = emailLink(
    party?.email,
    `Trikut Snacks — Account Statement (${periodLabel})`,
    statementText.replace(/\*/g, "") + "\n\n(PDF copy attached.)"
  );

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }} style={{ background: "rgba(20,17,14,0.55)", zIndex: 60, backdropFilter: "blur(2px)" }}>
      <div className={closing ? "modal-panel-out" : "modal-panel"} style={{ background: "var(--card-bg)", width: "100%", maxWidth: 560, maxHeight: "90vh", borderRadius: 12, boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(20,17,14,0.32), 0 12px 24px rgba(20,17,14,0.18), 0 4px 8px rgba(20,17,14,0.1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>Account statement</span>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1">
              <button
                onClick={() => setPeriod("3m")}
                style={{
                  background: period === "3m" ? "var(--ink)" : "var(--surface-2)",
                  color: period === "3m" ? "#fff" : "var(--ink)",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                Last 3 months
              </button>
              <button
                onClick={() => setPeriod("all")}
                style={{
                  background: period === "all" ? "var(--ink)" : "var(--surface-2)",
                  color: period === "all" ? "#fff" : "var(--ink)",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                All time
              </button>
              <button
                onClick={() => setPeriod("custom")}
                style={{
                  background: period === "custom" ? "var(--ink)" : "var(--surface-2)",
                  color: period === "custom" ? "#fff" : "var(--ink)",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                Custom range
              </button>
            </div>
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
                style={{ background: "var(--btn-forest)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <MessageCircle size={14} /> Send via WhatsApp
              </a>
            ) : (
              party && <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>Add a phone number to send via WhatsApp</span>
            )}
            {statementMailLink && (
              <a
                href={statementMailLink}
                className="flex items-center gap-1"
                title="Opens your email app pre-filled. Use Print → Save as PDF first, then attach the saved PDF."
                style={{ background: "var(--btn-blue)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <Mail size={14} /> Email statement
              </a>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "var(--ink-surface)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={requestClose} style={{ color: "var(--ink)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {period === "custom" && (
          <div
            className="no-print flex items-center gap-2 px-4 py-2 flex-wrap"
            style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)", background: "var(--surface-2)" }}
          >
            <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", color: "var(--ink)", padding: "4px 8px", fontSize: "0.78rem" }}
            />
            <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", color: "var(--ink)", padding: "4px 8px", fontSize: "0.78rem" }}
            />
          </div>
        )}

        <div id="invoice-print-area" style={{ padding: "28px", color: "var(--ink)", fontFamily: "Georgia, serif", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h2>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Three Peaks, One Great Taste</p>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Dharan, Sunsari, Nepal</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>ACCOUNT STATEMENT</p>
              <p style={{ fontSize: "0.75rem", margin: 0 }}>{todayISO()}</p>
              {formatBS(todayISO()) && <p style={{ fontSize: "0.7rem", margin: 0, opacity: 0.6 }}>{formatBS(todayISO(), { short: true })} BS</p>}
              <p style={{ fontSize: "0.72rem", margin: 0, opacity: 0.6 }}>{periodLabel}</p>
            </div>
          </div>

          <div style={{ marginBottom: 20, fontSize: "0.85rem" }}>
            <p style={{ margin: 0, opacity: 0.6, textTransform: "uppercase", fontSize: "0.7rem" }}>{partyLabel}</p>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {party ? party.name : "Unknown"}
              {partyCode && <span style={{ opacity: 0.6, fontWeight: 400 }}> ({partyCode})</span>}
            </p>
            {party?.phone && <p style={{ margin: 0 }}>{party.phone}</p>}
            {party?.address && <p style={{ margin: 0 }}>{party.address}</p>}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: 16, tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--ink)" }}>
                <th style={{ textAlign: "left", padding: "6px 4px", width: 80 }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
                <th style={{ textAlign: "right", padding: "6px 4px", width: 90 }}>Total price</th>
                <th style={{ textAlign: "right", padding: "6px 4px", width: 110 }}>Payment</th>
                <th style={{ textAlign: "right", padding: "6px 4px", width: 75 }}>Remaining balance</th>
              </tr>
            </thead>
            <tbody>
              {rangeStart && (
                <tr style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.1)", fontStyle: "italic", opacity: 0.7 }}>
                  <td style={{ padding: "6px 4px" }} colSpan={4}>
                    Opening balance (before {rangeStart})
                  </td>
                  <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>
                    {formatNPR(openingBalance)}
                  </td>
                </tr>
              )}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "16px 4px", textAlign: "center", opacity: 0.55 }}>
                    No activity in this period.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.1)", background: i % 2 === 1 ? "rgba(var(--ink-rgb),0.025)" : "transparent" }}>
                    <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ padding: "6px 4px", overflowWrap: "break-word" }}>{r.description}</td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>{r.total ? formatNPR(r.total) : "—"}</td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>
                      {r.paidNow ? (
                        <>
                          {formatNPR(r.paidNow)}
                          <span className="mono-num" style={{ opacity: 0.55, fontSize: "0.7rem", display: "block" }}>({METHOD_LABELS[r.method] || "Cash"})</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600, fontSize: "0.78rem" }}>{formatNPR(r.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--ink)", fontWeight: 600 }}>
                  <td style={{ padding: "6px 4px" }} colSpan={2}>
                    Totals for this period
                  </td>
                  <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>{formatNPR(totalOfTotals)}</td>
                  <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>{formatNPR(totalPaidNow)}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}></td>
                </tr>
              </tfoot>
            )}
          </table>

          <div style={{ marginLeft: "auto", width: 260, fontSize: "0.9rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderTop: "3px double var(--ink)",
                fontWeight: 700,
              }}
            >
              <span>Closing balance</span>
              <span className="mono-num">{formatNPR(Math.abs(closingBalance))}</span>
            </div>
            <p style={{ textAlign: "right", fontSize: "0.75rem", opacity: 0.6 }}>{balanceLabel}</p>
          </div>

          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 32, textAlign: "center" }}>
            Trikut Snacks — thank you for your business
          </p>
        </div>
      </div>
    </div>
  );
}

function DailyReportModal({
  transactions,
  capitalEntries,
  receivables,
  payables,
  sales,
  saleReturns,
  purchases,
  productionBatches,
  orders,
  customers,
  suppliers,
  stockItems,
  stockTx,
  fixedAssets,
  onClose,
}) {
  const [date, setDate] = useState(todayISO());
  const [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Cash sale";
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "Cash purchase";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "—";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  const daySales = sales.filter((s) => s.date === date);
  const dayReturns = saleReturns.filter((r) => r.date === date);
  const dayPurchases = purchases.filter((p) => p.date === date);
  const dayProduction = productionBatches.filter((b) => b.date === date);
  const dayOrders = orders.filter((o) => o.date === date);
  const dayCapital = capitalEntries.filter((c) => c.date === date);
  const dayTransactions = transactions.filter((t) => t.date === date);
  const dayReceivablePayments = receivables.filter((r) => r.date === date && r.type === "payment" && !r.nonCash);
  const dayPayablePayments = payables.filter((p) => p.date === date && p.type === "payment" && !p.nonCash);
  const dayManualTransactions = dayTransactions.filter(
    (t) => !t.saleId && !t.returnId && !t.purchaseId && !t.productionId
  );

  const salesTotal = daySales.reduce((s, x) => s + Number(x.cashAmount) + Number(x.creditAmount), 0);
  const salesCash = daySales.reduce((s, x) => s + Number(x.cashAmount), 0);
  const salesCredit = daySales.reduce((s, x) => s + Number(x.creditAmount), 0);
  const returnsTotal = dayReturns.reduce((s, x) => s + Number(x.cashRefund) + Number(x.creditReduction), 0);
  const purchasesTotal = dayPurchases.reduce((s, x) => s + Number(x.cashAmount) + Number(x.creditAmount), 0);

  // Accrual basis, same engine as Accounting/Dashboard — full sale value at
  // time of sale, FIFO-matched COGS, and that day's slice of depreciation —
  // so a credit sale shows up as real profit today, not never.
  const accrualStmt = computeIncomeStatement({
    sales,
    saleReturns,
    transactions,
    stockItems,
    stockTx,
    startDate: date,
    endDate: date,
  });
  const dayDepreciation = fixedAssets.reduce((s, f) => s + computeFixedAssetPeriodExpense(f, date, date), 0);
  const dayIncome = accrualStmt.totalRevenue;
  const dayExpense = accrualStmt.cogs + accrualStmt.totalOpEx + dayDepreciation;
  const netProfit = accrualStmt.netProfit - dayDepreciation;

  // Mirrors the top-level totals.byMethod formula exactly, so this day's
  // figures reconcile with the Dashboard's overall Cash/Bank/eSewa balances —
  // including customers paying off credit or the business paying off a
  // supplier, both of which are real cash movement even though they aren't
  // "transactions" in the strict sense.
  const byMethod = { cash: 0, bank: 0, esewa: 0 };
  dayTransactions.forEach((t) => {
    const m = t.method || "cash";
    if (byMethod[m] === undefined) return;
    byMethod[m] += t.type === "income" ? Number(t.amount) : -Number(t.amount);
  });
  dayCapital.forEach((c) => {
    const m = c.method || "cash";
    if (byMethod[m] === undefined) return;
    byMethod[m] += c.type === "contribution" ? Number(c.amount) : -Number(c.amount);
  });
  dayReceivablePayments.forEach((r) => {
    const m = r.method || "cash";
    if (byMethod[m] === undefined) return;
    byMethod[m] += Number(r.amount);
  });
  dayPayablePayments.forEach((p) => {
    const m = p.method || "cash";
    if (byMethod[m] === undefined) return;
    byMethod[m] -= Number(p.amount);
  });

  const capitalIn = dayCapital.filter((c) => c.type === "contribution").reduce((s, c) => s + Number(c.amount), 0);
  const capitalOut = dayCapital.filter((c) => c.type === "withdrawal").reduce((s, c) => s + Number(c.amount), 0);

  // Breakdown by head (category) — built from the same accrual statement as
  // the totals above, so "Sales Revenue" here is the full sale value and a
  // "Cost of Goods Sold" line appears alongside the usual expense categories
  // rather than the breakdown silently summing to a different number.
  const incomeHeads = [
    ["Sales Revenue", accrualStmt.netSalesRevenue],
    ...Object.entries(accrualStmt.otherIncomeByCategory),
  ].filter(([, amt]) => amt > 0.5).sort((a, b) => b[1] - a[1]);
  const expenseHeads = [
    ["Cost of Goods Sold", accrualStmt.cogs],
    ...Object.entries(accrualStmt.opExByCategory),
    ...(dayDepreciation > 0.5 ? [["Depreciation", dayDepreciation]] : []),
  ].filter(([, amt]) => amt > 0.5).sort((a, b) => b[1] - a[1]);

  // Breakdown by payment method — in vs out, not just net
  const methodBreakdown = { cash: { in: 0, out: 0 }, bank: { in: 0, out: 0 }, esewa: { in: 0, out: 0 } };
  dayTransactions.forEach((t) => {
    const m = t.method || "cash";
    if (!methodBreakdown[m]) return;
    if (t.type === "income") methodBreakdown[m].in += Number(t.amount);
    else methodBreakdown[m].out += Number(t.amount);
  });
  dayCapital.forEach((c) => {
    const m = c.method || "cash";
    if (!methodBreakdown[m]) return;
    if (c.type === "contribution") methodBreakdown[m].in += Number(c.amount);
    else methodBreakdown[m].out += Number(c.amount);
  });

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      onClick={(e) => { if (e.target === e.currentTarget) requestClose(); }} style={{ background: "rgba(20,17,14,0.55)", zIndex: 60, backdropFilter: "blur(2px)" }}>
      <div className={closing ? "modal-panel-out" : "modal-panel"} style={{ background: "var(--card-bg)", width: "100%", maxWidth: 640, maxHeight: "90vh", borderRadius: 12, boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(20,17,14,0.32), 0 12px 24px rgba(20,17,14,0.18), 0 4px 8px rgba(20,17,14,0.1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>Daily report</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", color: "var(--ink)", padding: "5px 8px", fontSize: "0.8rem" }}
            />
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "var(--ink-surface)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={requestClose} style={{ color: "var(--ink)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div id="invoice-print-area" style={{ padding: "28px", color: "var(--ink)", fontFamily: "Georgia, serif", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h2>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Three Peaks, One Great Taste</p>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Dharan, Sunsari, Nepal</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>DAILY BUSINESS REPORT</p>
              <p style={{ fontSize: "0.75rem", margin: 0 }}>{date}</p>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
            {[
              { label: "Sales", value: salesTotal, color: "var(--accent-forest)" },
              { label: "Returns", value: returnsTotal, color: "var(--accent-red)" },
              { label: "Purchases", value: purchasesTotal, color: "var(--accent-red)" },
              { label: "Income", value: dayIncome, color: "var(--accent-forest)" },
              { label: "Expenses", value: dayExpense, color: "var(--accent-red)" },
              { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "var(--accent-forest)" : "var(--accent-red)" },
            ].map((m) => (
              <div key={m.label} style={{ border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "8px 10px" }}>
                <p style={{ fontSize: "0.65rem", textTransform: "uppercase", opacity: 0.6, margin: 0 }}>{m.label}</p>
                <p className="mono-num" style={{ fontSize: "0.95rem", margin: 0, color: m.color }}>
                  {formatNPR(m.value)}
                </p>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>
              Cash movement today
            </p>
            <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                  <th style={{ textAlign: "left", padding: "3px 4px" }}>Method</th>
                  <th style={{ textAlign: "right", padding: "3px 4px" }}>In</th>
                  <th style={{ textAlign: "right", padding: "3px 4px" }}>Out</th>
                  <th style={{ textAlign: "right", padding: "3px 4px" }}>Net</th>
                </tr>
              </thead>
              <tbody>
                {PAYMENT_METHODS.map((m) => (
                  <tr key={m}>
                    <td style={{ padding: "3px 4px" }}>{METHOD_LABELS[m]}</td>
                    <td style={{ textAlign: "right", padding: "3px 4px" }}>{formatNPR(methodBreakdown[m].in)}</td>
                    <td style={{ textAlign: "right", padding: "3px 4px" }}>{formatNPR(methodBreakdown[m].out)}</td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "3px 4px" }}>{formatNPR(byMethod[m])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1" style={{ gap: 20, marginBottom: 8 }}>
            <ReportSection title="Income by head">
              {incomeHeads.length === 0 ? (
                <ReportEmpty text="No income recorded." />
              ) : (
                incomeHeads.map(([category, amount]) => (
                  <ReportRow key={category} left={category} right={formatNPR(amount)} />
                ))
              )}
            </ReportSection>

            <ReportSection title="Expense by head">
              {expenseHeads.length === 0 ? (
                <ReportEmpty text="No expenses recorded." />
              ) : (
                expenseHeads.map(([category, amount]) => (
                  <ReportRow key={category} left={category} right={formatNPR(amount)} />
                ))
              )}
            </ReportSection>
          </div>

          <ReportSection title={`Sales (${daySales.length})`}>
            {daySales.length === 0 ? (
              <ReportEmpty text="No sales recorded." />
            ) : (
              daySales.map((s) => (
                <ReportRow
                  key={s.id}
                  left={`${customerName(s.customerId)}${saleLinesSummary(s, itemName) ? ` — ${saleLinesSummary(s, itemName)}` : ""}`}
                  right={formatNPR(Number(s.cashAmount) + Number(s.creditAmount))}
                />
              ))
            )}
          </ReportSection>

          {dayReturns.length > 0 && (
            <ReportSection title={`Returns (${dayReturns.length})`}>
              {dayReturns.map((r) => (
                <ReportRow
                  key={r.id}
                  left={`${customerName(r.customerId)}${r.itemId ? ` — ${itemName(r.itemId)} × ${r.quantity} ${itemUnit(r.itemId)}` : ""}`}
                  right={formatNPR(Number(r.cashRefund) + Number(r.creditReduction))}
                />
              ))}
            </ReportSection>
          )}

          {dayPurchases.length > 0 && (
            <ReportSection title={`Purchases (${dayPurchases.length})`}>
              {dayPurchases.map((p) => (
                <ReportRow
                  key={p.id}
                  left={`${supplierName(p.supplierId)}${purchaseLinesSummary(p, itemName) ? ` — ${purchaseLinesSummary(p, itemName)}` : ""}`}
                  right={formatNPR(Number(p.cashAmount) + Number(p.creditAmount))}
                />
              ))}
            </ReportSection>
          )}

          {dayProduction.length > 0 && (
            <ReportSection title={`Production (${dayProduction.length})`}>
              {dayProduction.map((b) => (
                <ReportRow
                  key={b.id}
                  left={`${itemName(b.outputItemId)} × ${b.outputQuantity}`}
                  right={formatNPR(b.totalCost)}
                />
              ))}
            </ReportSection>
          )}

          {dayManualTransactions.length > 0 && (
            <ReportSection title={`Other transactions (${dayManualTransactions.length})`}>
              {dayManualTransactions.map((t) => (
                <ReportRow
                  key={t.id}
                  left={`${t.category}${t.note ? ` — ${t.note}` : ""}`}
                  right={`${t.type === "income" ? "+" : "−"}${formatNPR(t.amount)}`}
                />
              ))}
            </ReportSection>
          )}

          {(capitalIn > 0 || capitalOut > 0) && (
            <ReportSection title="Partner capital">
              {dayCapital.map((c) => (
                <ReportRow
                  key={c.id}
                  left={`${c.partner} — ${c.type === "contribution" ? "Contribution" : "Withdrawal"}`}
                  right={`${c.type === "contribution" ? "+" : "−"}${formatNPR(c.amount)}`}
                />
              ))}
            </ReportSection>
          )}

          {(dayReceivablePayments.length > 0 || dayPayablePayments.length > 0) && (
            <ReportSection title="Credit collected & paid">
              {dayReceivablePayments.map((r) => (
                <ReportRow
                  key={r.id}
                  left={`Collected from ${customerName(r.customerId)}${r.note ? ` — ${r.note}` : ""}`}
                  right={`+${formatNPR(r.amount)}`}
                />
              ))}
              {dayPayablePayments.map((p) => (
                <ReportRow
                  key={p.id}
                  left={`Paid to ${supplierName(p.supplierId)}${p.note ? ` — ${p.note}` : ""}`}
                  right={`−${formatNPR(p.amount)}`}
                />
              ))}
            </ReportSection>
          )}

          {dayOrders.length > 0 && (
            <ReportSection title={`New orders placed (${dayOrders.length})`}>
              {dayOrders.map((o) => (
                <ReportRow
                  key={o.id}
                  left={`${customerName(o.customerId)} — ${itemName(o.itemId)} × ${o.quantity}`}
                  right={o.status}
                />
              ))}
            </ReportSection>
          )}

          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 24, textAlign: "center" }}>
            Generated {nowISO().slice(0, 16).replace("T", " ")} — Trikut Snacks
          </p>
        </div>
      </div>
    </div>
  );
}

function ReportSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 6, borderBottom: "1px solid rgba(var(--ink-rgb),0.15)", paddingBottom: 4 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function ReportRow({ left, right }) {
  return (
    <div className="flex justify-between" style={{ fontSize: "0.82rem", padding: "3px 0" }}>
      <span>{left}</span>
      <span className="mono-num">{right}</span>
    </div>
  );
}

function ReportEmpty({ text }) {
  return <p style={{ fontSize: "0.8rem", opacity: 0.5, fontStyle: "italic" }}>{text}</p>;
}

function SuppliersView({
  role,
  suppliers,
  supplierCodes,
  payables,
  supplierBalances,
  purchases,
  purchaseReturns,
  stockItems,
  onAddSupplier,
  onEditSupplier,
  onDeleteSupplier,
  onAddPayable,
  onEditPayable,
  onDeletePayable,
  onAddPurchase,
  onEditPurchase,
  onDeletePurchase,
  onAddPurchaseReturn,
  onEditPurchaseReturn,
  onDeletePurchaseReturn,
  onOpenStatement,
}) {
  const [expanded, setExpanded] = useState(null);
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || null;
  const combinedPurchases = [
    ...purchases.map((p) => ({ ...p, kind: "purchase" })),
    ...purchaseReturns.map((r) => ({ ...r, kind: "return" })),
  ].sort((a, b) => (a.date === b.date ? 0 : b.date.localeCompare(a.date)));

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-red)", paddingLeft: 10 }}>Purchases & returns</h2>
        <div className="flex gap-2">
          <button
            onClick={onAddPurchase}
            className="flex items-center gap-1"
            style={{ background: "var(--btn-red)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record purchase
          </button>
          <button
            onClick={onAddPurchaseReturn}
            className="flex items-center gap-1"
            style={{ background: "var(--btn-brown)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record return
          </button>
        </div>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="mb-8">
        <div
          className="ledger-rule grid px-4 py-2"
          style={{
            gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px",
            fontSize: "0.7rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            opacity: 0.6,
          }}
        >
          <span>Date</span>
          <span>Item / note</span>
          <span>Supplier</span>
          <span>Cash / Credit</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span></span>
          <span></span>
        </div>
        {combinedPurchases.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No purchases recorded yet. Record a purchase — it logs the expense, stocks in the raw material, and tracks any credit owed, all in one go." />
          </div>
        ) : (
          combinedPurchases.map((p, i) => {
            const isPurchase = p.kind === "purchase";
            const total = isPurchase ? Number(p.cashAmount) + Number(p.creditAmount) : Number(p.cashRefund) + Number(p.creditReduction);
            const cashPart = isPurchase ? p.cashAmount : p.cashRefund;
            const creditPart = isPurchase ? p.creditAmount : p.creditReduction;
            return (
              <div
                key={p.id}
                className="ledger-rule row-in grid px-4 py-3 items-center"
                style={{ gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px", fontSize: "0.85rem", animationDelay: `${Math.min(i, 14) * 25}ms` }}
              >
                <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{p.date}</span>
                <span>
                  {!isPurchase && <span style={{ color: "var(--accent-brown)", fontWeight: 600, fontSize: "0.75rem" }}>RETURN — </span>}
                  {purchaseLinesSummary(p, itemName) || "Purchase"}
                  {p.note && <span style={{ opacity: 0.55 }}> — {p.note}</span>}
                </span>
                <span style={{ fontSize: "0.8rem" }}>{p.supplierId ? supplierName(p.supplierId) : "Cash purchase"}</span>
                <span style={{ fontSize: "0.75rem" }}>
                  {cashPart > 0 && <span style={{ color: "var(--accent-red)" }}>{formatNPR(cashPart)} cash</span>}
                  {cashPart > 0 && creditPart > 0 && <br />}
                  {creditPart > 0 && <span style={{ color: "var(--accent-gold)" }}>{formatNPR(creditPart)} credit</span>}
                </span>
                <span className="mono-num" style={{ textAlign: "right", color: isPurchase ? "var(--accent-red)" : "var(--accent-forest)" }}>
                  {isPurchase ? "−" : "+"}
                  {formatNPR(total)}
                </span>
                {role === "partner" && (
                  <>
                    <button onClick={() => (isPurchase ? onEditPurchase(p) : onEditPurchaseReturn(p))} style={{ opacity: 0.4 }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => (isPurchase ? onDeletePurchase(p.id) : onDeletePurchaseReturn(p.id))} style={{ opacity: 0.4 }}>
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-red)", paddingLeft: 10 }}>Suppliers & payables</h2>
        <button
          onClick={onAddSupplier}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No suppliers yet. Add a supplier to start tracking what you owe them for raw materials." />
        </div>
      ) : (
        <div className="space-y-3">
          {suppliers.map((s) => {
            const bal = supplierBalances[s.id] || { charged: 0, paid: 0 };
            const owed = bal.charged - bal.paid;
            const isOpen = expanded === s.id;
            const supPayables = payables.filter((p) => p.supplierId === s.id);
            return (
              <div key={s.id} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                <div
                  className="flex justify-between items-center px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                >
                  <div>
                    <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>{s.name}</p>
                    <p style={{ fontSize: "0.72rem", opacity: 0.55 }} className="mono-num">
                      {supplierCodes[s.id]}
                    </p>
                    <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                      {s.phone}
                      {s.address && ` · ${s.address}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="mono-num" style={{ color: owed > 0 ? "var(--accent-red)" : "var(--accent-forest)", fontSize: "1.05rem" }}>
                        {formatNPR(owed)}
                      </p>
                      <p style={{ fontSize: "0.68rem", opacity: 0.55, textTransform: "uppercase" }}>
                        {owed > 0 ? "You owe" : "Settled"}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenStatement(s.id);
                      }}
                      style={{ opacity: 0.4 }}
                      title="Account statement"
                    >
                      <FileText size={14} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditSupplier(s);
                      }}
                      style={{ opacity: 0.4, display: role === "partner" ? "block" : "none" }}
                    >
                      <Pencil size={14} />
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="ledger-rule px-4 pb-4">
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => onAddPayable(s.id)}
                        style={{ background: "var(--btn-red)", color: "var(--on-dark)", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        + New purchase on credit
                      </button>
                      {role === "partner" && (
                        <button
                          onClick={() => onDeleteSupplier(s.id)}
                          style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.78rem" }}
                        >
                          Remove supplier
                        </button>
                      )}
                    </div>
                    {supPayables.length === 0 ? (
                      <EmptyNote text="No charges or payments recorded yet." />
                    ) : (
                      supPayables.map((p, i) => (
                        <div key={p.id} className="ledger-rule row-in flex justify-between items-center py-2 text-sm" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                          <div>
                            <span>{p.type === "charge" ? "Purchase on credit" : "Payment made"}</span>
                            <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                              {" "}
                              · {p.date}
                              {p.note && ` · ${p.note}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="mono-num" style={{ color: p.type === "charge" ? "var(--accent-red)" : "var(--accent-forest)" }}>
                              {p.type === "charge" ? "+" : "−"}
                              {formatNPR(p.amount)}
                            </span>
                            {!isLinkedEntry(p) && role === "partner" && (
                              <button onClick={() => onEditPayable(p)} style={{ opacity: 0.4 }}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {role === "partner" && (
                              <button onClick={() => onDeletePayable(p.id)} style={{ opacity: 0.4 }}>
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SupplierForm({ editEntry, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [phone, setPhone] = useState(editEntry?.phone || "");
  const [email, setEmail] = useState(editEntry?.email || "");
  const [address, setAddress] = useState(editEntry?.address || "");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!name.trim()) return;
    onSave({ ...(editEntry || {}), name: name.trim(), phone, email: email.trim(), address, note });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit supplier" : "Add supplier"}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Siliguri Cheese Traders" />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Email (optional)">
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="e.g. traders@example.com" />
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>Used for the "Email statement" button.</p>
      </Field>
      <Field label="Address (optional)">
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. supplies cheese & onion powder" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save supplier"}
      </button>
    </Modal>
  );
}

function PayableForm({ supplier, editEntry, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "charge");
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [amount, setAmount] = useState(editEntry?.amount ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!amount || Number(amount) <= 0 || !supplier) return;
    onSave({
      ...(editEntry || {}),
      supplierId: supplier.id,
      type,
      date,
      amount: Number(amount),
      ...(type === "payment" ? { method } : {}),
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit entry" : `${supplier ? supplier.name : "Supplier"} — record entry`}>
      <div className="flex gap-2 mb-4">
        {["charge", "payment"].map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            style={{
              flex: 1,
              padding: "8px",
              fontSize: "0.85rem",
              background: type === t ? (t === "charge" ? "var(--accent-red)" : "var(--accent-forest)") : "var(--surface-2)",
              color: type === t ? "var(--page-bg)" : "var(--ink)",
            }}
          >
            {t === "charge" ? "Purchase on credit" : "Payment made"}
          </button>
        ))}
      </div>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Amount (Rs.)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {type === "payment" && (
        <Field label="Paid via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 25kg cheese powder" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save entry"}
      </button>
    </Modal>
  );
}

function ProductionView({ role, productionBatches, stockItems, onAdd, onEdit, onDelete }) {
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "—";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-brown)", paddingLeft: 10 }}>Production batches</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record production
        </button>
      </div>

      {productionBatches.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No production batches yet. Record raw materials used and finished goods produced — cost flows through automatically via FIFO." />
        </div>
      ) : (
        <div className="space-y-3">
          {productionBatches.map((b) => (
            <div key={b.id} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
                    {itemName(b.outputItemId)} × {b.outputQuantity} {itemUnit(b.outputItemId)}
                  </p>
                  <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                    {b.date}
                    {b.note && ` · ${b.note}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {role === "partner" && (
                    <>
                      <button onClick={() => onEdit(b)} style={{ opacity: 0.4 }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => onDelete(b.id)} style={{ opacity: 0.4 }}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div style={{ fontSize: "0.8rem", opacity: 0.8 }} className="mb-2">
                <p style={{ fontSize: "0.68rem", textTransform: "uppercase", opacity: 0.55, letterSpacing: "0.05em" }} className="mb-1">
                  Inputs used
                </p>
                {b.inputs.map((inp, i) => (
                  <p key={i} style={{ margin: 0 }}>
                    {itemName(inp.itemId)} — {inp.quantity} {itemUnit(inp.itemId)}
                  </p>
                ))}
              </div>
              <div className="flex justify-between text-sm ledger-rule pt-2">
                <span>Total cost: <span className="mono-num">{formatNPR(b.totalCost)}</span></span>
                <span>Material unit cost: <span className="mono-num">{formatNPR(b.outputUnitCost)}/{itemUnit(b.outputItemId)}</span></span>
              </div>
              <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 4 }}>
                Labor & overhead are expensed directly (see Accounting) rather than added to stock value — total
                cost above is for your reference, not what's carried in inventory.
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionForm({ stockItems, stockItemCodes, stockFIFO, editEntry, actor, onSave, onClose }) {
  const rawMaterials = stockItems.filter((i) => i.category === "Raw Material");
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");

  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [inputs, setInputs] = useState(
    editEntry?.inputs?.length
      ? editEntry.inputs.map((inp) => ({ itemId: inp.itemId, quantity: String(inp.quantity) }))
      : [{ itemId: "", quantity: "" }]
  );
  const [outputItemId, setOutputItemId] = useState(editEntry?.outputItemId || "");
  const [outputQuantity, setOutputQuantity] = useState(editEntry?.outputQuantity ? String(editEntry.outputQuantity) : "");
  const [laborCost, setLaborCost] = useState(editEntry?.laborCost ? String(editEntry.laborCost) : "");
  const [overheadCost, setOverheadCost] = useState(editEntry?.overheadCost ? String(editEntry.overheadCost) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  function updateInput(idx, field, value) {
    setInputs(inputs.map((inp, i) => (i === idx ? { ...inp, [field]: value } : inp)));
  }

  function addInputRow() {
    setInputs([...inputs, { itemId: "", quantity: "" }]);
  }

  function removeInputRow(idx) {
    setInputs(inputs.filter((_, i) => i !== idx));
  }

  const estimatedInputCost = inputs.reduce((sum, inp) => {
    if (!inp.itemId || !inp.quantity) return sum;
    const fifo = stockFIFO[inp.itemId];
    return sum + (fifo ? fifo.avgCost * Number(inp.quantity) : 0);
  }, 0);
  const estimatedTotal = estimatedInputCost + (Number(laborCost) || 0) + (Number(overheadCost) || 0);
  const estimatedUnitCost = Number(outputQuantity) > 0 ? estimatedTotal / Number(outputQuantity) : 0;

  function submit() {
    const validInputs = inputs.filter((inp) => inp.itemId && Number(inp.quantity) > 0);
    if (validInputs.length === 0 || !outputItemId || Number(outputQuantity) <= 0) return;
    onSave({
      ...(editEntry || {}),
      date,
      inputs: validInputs.map((inp) => ({ itemId: inp.itemId, quantity: Number(inp.quantity) })),
      outputItemId,
      outputQuantity: Number(outputQuantity),
      laborCost: Number(laborCost) || 0,
      overheadCost: Number(overheadCost) || 0,
      method,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit production batch" : "Record production batch"}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>

      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, letterSpacing: "0.05em" }} className="mb-1">
        Raw materials used
      </p>
      {inputs.map((inp, idx) => (
        <div key={idx} className="flex gap-2 mb-2 items-start">
          <div style={{ flex: 2 }}>
            <ItemCodeInput
              stockItems={rawMaterials}
              stockItemCodes={stockItemCodes}
              value={inp.itemId}
              onChange={(id) => updateInput(idx, "itemId", id)}
              stockFIFO={stockFIFO}
            />
          </div>
          <input
            type="number"
            value={inp.quantity}
            onChange={(e) => updateInput(idx, "quantity", e.target.value)}
            style={{ ...inputStyle, flex: 1 }}
            placeholder="Qty"
          />
          {inputs.length > 1 && (
            <button onClick={() => removeInputRow(idx)} style={{ padding: "8px", opacity: 0.5 }}>
              <X size={14} />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addInputRow}
        style={{ fontSize: "0.78rem", color: "var(--accent-blue)", marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}
      >
        <Plus size={13} /> Add another raw material
      </button>

      <Field label="Finished good produced">
        <ItemCodeInput stockItems={finishedGoods} stockItemCodes={stockItemCodes} value={outputItemId} onChange={setOutputItemId} />
      </Field>
      <Field label="Quantity produced">
        <input type="number" value={outputQuantity} onChange={(e) => setOutputQuantity(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Labor cost (Rs., optional)">
        <input type="number" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Overhead cost (Rs., optional)">
        <input type="number" value={overheadCost} onChange={(e) => setOverheadCost(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {(Number(laborCost) > 0 || Number(overheadCost) > 0) && (
        <Field label="Paid via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {(estimatedTotal > 0 || estimatedUnitCost > 0) && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10, background: "var(--surface-2)", padding: "8px 10px" }}>
          Estimated cost: <span className="mono-num">{formatNPR(estimatedTotal)}</span> total ·{" "}
          <span className="mono-num">{formatNPR(estimatedUnitCost)}</span>/unit
        </p>
      )}

      <Field label="Run by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. cheese chips batch #4" />
      </Field>

      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save production batch"}
      </button>
    </Modal>
  );
}

function PurchaseForm({ suppliers, supplierCodes, stockItems, stockItemCodes, vatSettings, allExpenseCategories, onAddCategory, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [supplierId, setSupplierId] = useState(editEntry?.supplierId || "");
  const [lines, setLines] = useState(() => {
    if (editEntry) {
      return purchaseLines(editEntry).map((l) => ({
        itemId: l.itemId,
        quantity: String(l.quantity),
        unitRate: l.unitRate ? String(Math.round(l.unitRate * 100) / 100) : "",
      }));
    }
    return [];
  });
  const [totalAmount, setTotalAmount] = useState(
    editEntry && purchaseLines(editEntry).length === 0 ? String(Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) : ""
  );
  const [cashAmount, setCashAmount] = useState(editEntry?.cashAmount !== undefined ? String(editEntry.cashAmount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [category, setCategory] = useState(editEntry?.category || allExpenseCategories[0]);
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");
  // Defaults to the global setting for a new purchase; an edited purchase
  // keeps whatever it was actually charged with, same principle as sales.
  const [vatApplicable, setVatApplicable] = useState(editEntry ? !!editEntry.vatApplicable : !!vatSettings?.enabled);

  function updateLine(idx, patch) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removeLine(idx) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  const validLines = lines.filter((l) => l.itemId && Number(l.quantity) > 0);
  const itemsTotal = validLines.reduce((s, l) => s + Number(l.quantity) * (Number(l.unitRate) || 0), 0);
  // The rate/amount entered is what's actually paid to the supplier — VAT
  // already folded in if the invoice includes it — so the total is exactly
  // that, and VAT is extracted from inside it rather than added on top,
  // matching how sales work.
  const total = validLines.length > 0 ? itemsTotal : Number(totalAmount) || 0;
  const vatRate = Number(vatSettings?.rate) || 0;
  const vatAmount = vatSettings?.enabled && vatApplicable ? total * (vatRate / (100 + vatRate)) : 0;
  const subtotal = total - vatAmount;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !supplierId) return;
    onSave({
      ...(editEntry || {}),
      date,
      supplierId: supplierId || null,
      // Multi-item purchases store `lines`; legacy single-item fields are
      // cleared so a record never carries two competing sources of truth.
      lines: validLines.map((l) => ({ itemId: l.itemId, quantity: Number(l.quantity), unitRate: Number(l.unitRate) || 0 })),
      itemId: null,
      quantity: 0,
      cashAmount: cash,
      method,
      creditAmount: credit,
      // Frozen at what was actually paid, so a global rate change later
      // never rewrites a past purchase's real cost.
      vatApplicable: vatSettings?.enabled ? vatApplicable : false,
      vatAmount,
      vatRate: vatAmount > 0 ? vatRate : undefined,
      category,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit purchase" : "Record purchase"}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Supplier">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
          <option value="">Cash purchase — no supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}{supplierCodes?.[s.id] ? ` — ${supplierCodes[s.id]}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Items purchased (optional — stocks them in)">
        {lines.map((l, idx) => {
          const lineTotal = (Number(l.quantity) || 0) * (Number(l.unitRate) || 0);
          return (
            <div key={idx} style={{ background: "var(--surface-2)", padding: "8px 10px", marginBottom: 8, border: "1px solid rgba(var(--ink-rgb),0.12)" }}>
              <div className="flex gap-2 items-center">
                <div style={{ flex: 1 }}>
                  <ItemCodeInput
                    stockItems={stockItems}
                    stockItemCodes={stockItemCodes}
                    categoryFilter="Raw Material"
                    value={l.itemId}
                    onChange={(id) => updateLine(idx, { itemId: id })}
                  />
                </div>
                <button onClick={() => removeLine(idx)} style={{ opacity: 0.5, flexShrink: 0 }} title="Remove this line">
                  <X size={16} />
                </button>
              </div>
              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  value={l.quantity}
                  onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 0 }}
                  placeholder="Qty"
                />
                <input
                  type="number"
                  value={l.unitRate}
                  onChange={(e) => updateLine(idx, { unitRate: e.target.value })}
                  style={{ ...inputStyle, marginBottom: 0 }}
                  placeholder="Rate (Rs.)"
                />
                <input value={formatNPR(lineTotal)} disabled style={{ ...readOnlyInputStyle, marginBottom: 0, width: 110, flexShrink: 0 }} />
              </div>
            </div>
          );
        })}
        <button
          onClick={() => setLines((ls) => [...ls, { itemId: "", quantity: "", unitRate: "" }])}
          className="flex items-center gap-1"
          style={{ background: "var(--card-bg)", color: "var(--ink)", padding: "6px 12px", fontSize: "0.8rem" }}
        >
          <Plus size={14} /> Add item
        </button>
      </Field>
      <Field label="Expense category">
        <ExpenseCategorySelect categories={allExpenseCategories} value={category} onChange={setCategory} onAddCategory={onAddCategory} />
      </Field>
      {validLines.length > 0 ? (
        <Field label="Total purchase amount (Rs.)">
          <input value={formatNPR(total)} disabled style={readOnlyInputStyle} />
        </Field>
      ) : (
        <Field label="Total purchase amount (Rs.)">
          <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
      )}
      {vatSettings?.enabled && (
        <>
          <Field label={`Includes VAT (${vatRate}%)`}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" checked={vatApplicable} onChange={(e) => setVatApplicable(e.target.checked)} />
              This purchase includes VAT
            </label>
            <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>
              The amount above is what's actually paid either way. VAT inside it is tracked as a credit against
              what you owe — it doesn't add to the raw material's stock value.
            </p>
          </Field>
          {vatApplicable && (
            <>
              <Field label="Of which: subtotal (Rs., excl. VAT)">
                <input value={formatNPR(subtotal)} disabled style={readOnlyInputStyle} />
              </Field>
              <Field label="Of which: VAT (Rs.)">
                <input value={formatNPR(vatAmount)} disabled style={readOnlyInputStyle} />
              </Field>
            </>
          )}
        </>
      )}
      <Field label="Amount paid now (Rs.)">
        <input
          type="number"
          value={cashAmount}
          onChange={(e) => setCashAmount(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!supplierId}
        />
        {!supplierId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No supplier selected — full amount is treated as paid now.</p>}
      </Field>
      {cash > 0 && (
        <Field label="Paid via">
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      {supplierId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Paid: <span className="mono-num">{formatNPR(cash)}</span> · Credit owed to {suppliers.find((s) => s.id === supplierId)?.name}:{" "}
          <span className="mono-num" style={{ color: "var(--accent-gold)" }}>{formatNPR(credit)}</span>
        </p>
      )}
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save purchase"}
      </button>
    </Modal>
  );
}

function OrdersView({ orders, orderCodes, customers, stockItems, productionNeeds, onAddOrder, onEditOrder, onUpdateStatus, onDeleteOrder, onFulfillViaSale }) {
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Walk-in / unspecified";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "—";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  const statusColor = { pending: "var(--accent-gold)", "in production": "var(--accent-blue)", fulfilled: "var(--accent-forest)", cancelled: "var(--accent-red)" };

  const sorted = [...orders].sort((a, b) => (a.status === "fulfilled" || a.status === "cancelled" ? 1 : -1));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-plum)", paddingLeft: 10 }}>Orders</h2>
        <button
          onClick={onAddOrder}
          className="flex items-center gap-1"
          style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record order
        </button>
      </div>

      {productionNeeds.length > 0 && (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-4 mb-6">
          <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-2">
            Production plan — pending orders vs. stock on hand
          </p>
          <div className="space-y-2">
            {productionNeeds.map((n) => (
              <div key={n.itemId} className="flex justify-between items-center text-sm">
                <span>{n.item ? n.item.name : "Unknown item"}</span>
                <span>
                  <span className="mono-num">{n.ordered}</span> ordered · <span className="mono-num">{n.available}</span>{" "}
                  in stock
                  {n.shortfall > 0 ? (
                    <span className="mono-num" style={{ color: "var(--accent-red)", marginLeft: 8, fontWeight: 600 }}>
                      need {n.shortfall} more {n.item ? n.item.unit : ""}
                    </span>
                  ) : (
                    <span style={{ color: "var(--accent-forest)", marginLeft: 8 }}>covered</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No orders yet. Record what a customer wants and by when — pending orders feed the production plan above." />
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((o) => (
            <div key={o.id} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="mono-num" style={{ fontSize: "0.7rem", opacity: 0.5 }}>
                    {orderCodes[o.id]}
                  </p>
                  <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
                    {itemName(o.itemId)} × {o.quantity} {itemUnit(o.itemId)}
                  </p>
                  <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                    {customerName(o.customerId)} · ordered {o.date}
                    {o.dueDate && ` · due ${o.dueDate}`}
                    {o.note && ` · ${o.note}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    style={{
                      fontSize: "0.68rem",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      background: `${statusColor[o.status]}20`,
                      color: statusColor[o.status],
                    }}
                  >
                    {o.status}
                  </span>
                  {o.status !== "fulfilled" && (
                    <button onClick={() => onEditOrder(o)} style={{ opacity: 0.4 }}>
                      <Pencil size={14} />
                    </button>
                  )}
                  <button onClick={() => onDeleteOrder(o.id)} style={{ opacity: 0.4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {o.status !== "fulfilled" && o.status !== "cancelled" && (
                <div className="flex gap-2 flex-wrap ledger-rule pt-3 mt-2">
                  {o.status === "pending" && (
                    <button
                      onClick={() => onUpdateStatus(o.id, "in production")}
                      style={{ background: "var(--btn-blue)", color: "#fff", padding: "5px 10px", fontSize: "0.75rem" }}
                    >
                      Mark in production
                    </button>
                  )}
                  <button
                    onClick={() => onFulfillViaSale(o)}
                    style={{ background: "var(--btn-forest)", color: "#fff", padding: "5px 10px", fontSize: "0.75rem" }}
                  >
                    Fulfill via sale
                  </button>
                  <button
                    onClick={() => onUpdateStatus(o.id, "cancelled")}
                    style={{ background: "var(--surface-2)", padding: "5px 10px", fontSize: "0.75rem" }}
                  >
                    Cancel order
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OrderForm({ customers, customerCodes, stockItems, editEntry, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [customerId, setCustomerId] = useState(editEntry?.customerId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || "");
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [dueDate, setDueDate] = useState(editEntry?.dueDate || "");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!itemId || Number(quantity) <= 0) return;
    onSave({ ...(editEntry || {}), date, customerId: customerId || null, itemId, quantity: Number(quantity), dueDate: dueDate || null, note });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit order" : "Record order"}>
      <Field label="Order date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Customer (optional)">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
          <option value="">Walk-in / unspecified</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}{customerCodes?.[c.id] ? ` — ${customerCodes[c.id]}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Product ordered">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inputStyle}>
          <option value="">Select item</option>
          {stockItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Quantity">
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Needed by (optional)">
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. wants extra spicy" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save order"}
      </button>
    </Modal>
  );
}

function TrashView({
  transactions,
  capitalEntries,
  recurringTemplates,
  customers,
  receivables,
  stockItems,
  stockTx,
  sales,
  saleReturns,
  suppliers,
  payables,
  productionBatches,
  purchases,
  purchaseReturns,
  orders,
  fixedAssets,
  onRestoreTransaction,
  onRestoreCapitalEntry,
  onRestoreRecurringTemplate,
  onRestoreCustomer,
  onRestoreReceivable,
  onRestoreStockItem,
  onRestoreStockTx,
  onRestoreSale,
  onRestoreSaleReturn,
  onRestoreSupplier,
  onRestorePayable,
  onRestoreProductionBatch,
  onRestorePurchase,
  onRestorePurchaseReturn,
  onRestoreOrder,
  onRestoreFixedAsset,
}) {
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Unknown customer";
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "Unknown supplier";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "Unknown item";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  const rows = [
    ...transactions
      .filter(isDeleted)
      .map((t) => ({
        id: t.id,
        deletedAt: t.deletedAt,
        deletedBy: t.deletedBy,
        type: "Transaction",
        description: `${t.category} — ${formatNPR(t.amount)}`,
        onRestore: () => onRestoreTransaction(t.id),
      })),
    ...capitalEntries
      .filter(isDeleted)
      .map((c) => ({
        id: c.id,
        deletedAt: c.deletedAt,
        deletedBy: c.deletedBy,
        type: "Partner Capital",
        description: `${c.partner} — ${c.type === "contribution" ? "Contribution" : "Withdrawal"} — ${formatNPR(c.amount)}`,
        onRestore: () => onRestoreCapitalEntry(c.id),
      })),
    ...recurringTemplates
      .filter(isDeleted)
      .map((r) => ({
        id: r.id,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        type: "Recurring Transaction",
        description: `${r.category} — ${formatNPR(r.amount)} monthly`,
        onRestore: () => onRestoreRecurringTemplate(r.id),
      })),
    ...customers
      .filter(isDeleted)
      .map((c) => ({
        id: c.id,
        deletedAt: c.deletedAt,
        deletedBy: c.deletedBy,
        type: "Customer",
        description: c.name,
        onRestore: () => onRestoreCustomer(c.id),
      })),
    ...receivables
      .filter(isDeleted)
      .map((r) => ({
        id: r.id,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        type: "Receivable",
        description: `${r.type === "charge" ? "Charge" : "Payment"} — ${formatNPR(r.amount)} (${customerName(r.customerId)})`,
        onRestore: () => onRestoreReceivable(r.id),
      })),
    ...stockItems
      .filter(isDeleted)
      .map((i) => ({
        id: i.id,
        deletedAt: i.deletedAt,
        deletedBy: i.deletedBy,
        type: "Stock Item",
        description: `${i.name} (${i.category})`,
        onRestore: () => onRestoreStockItem(i.id),
      })),
    ...stockTx
      .filter(isDeleted)
      .map((t) => ({
        id: t.id,
        deletedAt: t.deletedAt,
        deletedBy: t.deletedBy,
        type: "Stock Movement",
        description: `${t.type === "in" ? "Stock in" : "Stock out"} — ${t.quantity} ${itemUnit(t.itemId)} (${itemName(t.itemId)})`,
        onRestore: () => onRestoreStockTx(t.id),
      })),
    ...sales
      .filter(isDeleted)
      .map((s) => ({
        id: s.id,
        deletedAt: s.deletedAt,
        deletedBy: s.deletedBy,
        type: "Sale",
        description: `${saleLinesSummary(s, itemName) ? `${saleLinesSummary(s, itemName)} — ` : ""}${formatNPR(Number(s.cashAmount) + Number(s.creditAmount))} (${customerName(s.customerId)})`,
        onRestore: () => onRestoreSale(s.id),
      })),
    ...saleReturns
      .filter(isDeleted)
      .map((r) => ({
        id: r.id,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        type: "Sale Return",
        description: `${r.itemId ? `${itemName(r.itemId)} × ${r.quantity} — ` : ""}${formatNPR(Number(r.cashRefund) + Number(r.creditReduction))} (${customerName(r.customerId)})`,
        onRestore: () => onRestoreSaleReturn(r.id),
      })),
    ...suppliers
      .filter(isDeleted)
      .map((s) => ({
        id: s.id,
        deletedAt: s.deletedAt,
        deletedBy: s.deletedBy,
        type: "Supplier",
        description: s.name,
        onRestore: () => onRestoreSupplier(s.id),
      })),
    ...payables
      .filter(isDeleted)
      .map((p) => ({
        id: p.id,
        deletedAt: p.deletedAt,
        deletedBy: p.deletedBy,
        type: "Payable",
        description: `${p.type === "charge" ? "Charge" : "Payment"} — ${formatNPR(p.amount)} (${supplierName(p.supplierId)})`,
        onRestore: () => onRestorePayable(p.id),
      })),
    ...productionBatches
      .filter(isDeleted)
      .map((b) => ({
        id: b.id,
        deletedAt: b.deletedAt,
        deletedBy: b.deletedBy,
        type: "Production Batch",
        description: `${itemName(b.outputItemId)} × ${b.outputQuantity}`,
        onRestore: () => onRestoreProductionBatch(b.id),
      })),
    ...purchases
      .filter(isDeleted)
      .map((p) => ({
        id: p.id,
        deletedAt: p.deletedAt,
        deletedBy: p.deletedBy,
        type: "Purchase",
        description: `${purchaseLinesSummary(p, itemName) ? `${purchaseLinesSummary(p, itemName)} — ` : ""}${formatNPR(Number(p.cashAmount) + Number(p.creditAmount))} (${p.supplierId ? supplierName(p.supplierId) : "Cash purchase"})`,
        onRestore: () => onRestorePurchase(p.id),
      })),
    ...purchaseReturns
      .filter(isDeleted)
      .map((r) => ({
        id: r.id,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        type: "Purchase Return",
        description: `${r.itemId ? `${itemName(r.itemId)} × ${r.quantity} — ` : ""}${formatNPR(Number(r.cashRefund) + Number(r.creditReduction))} (${r.supplierId ? supplierName(r.supplierId) : "Cash refund"})`,
        onRestore: () => onRestorePurchaseReturn(r.id),
      })),
    ...orders
      .filter(isDeleted)
      .map((o) => ({
        id: o.id,
        deletedAt: o.deletedAt,
        deletedBy: o.deletedBy,
        type: "Order",
        description: `${itemName(o.itemId)} × ${o.quantity} (${o.customerId ? customerName(o.customerId) : "Walk-in"})`,
        onRestore: () => onRestoreOrder(o.id),
      })),
    ...fixedAssets
      .filter(isDeleted)
      .map((f) => ({
        id: f.id,
        deletedAt: f.deletedAt,
        deletedBy: f.deletedBy,
        type: "Fixed Asset",
        description: `${f.name} — ${formatNPR(f.cost)}`,
        onRestore: () => onRestoreFixedAsset(f.id),
      })),
  ].sort((a, b) => (b.deletedAt || "").localeCompare(a.deletedAt || ""));

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #6B6560", paddingLeft: 10 }}>Recently Deleted</h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Deleted records stay here for {TRASH_RETENTION_DAYS} days before being permanently removed.
        </p>
      </div>

      {rows.length === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="Nothing in the trash right now." />
        </div>
      ) : (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
          {rows.map((r, i) => {
            const left = daysRemaining(r.deletedAt);
            return (
              <div key={`${r.type}-${r.id}`} className="ledger-rule row-in flex justify-between items-center px-4 py-3" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                <div>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      textTransform: "uppercase",
                      padding: "1px 6px",
                      marginRight: 8,
                      background: "rgba(166,61,64,0.12)",
                      color: "var(--accent-red)",
                    }}
                  >
                    {r.type}
                  </span>
                  <span style={{ fontSize: "0.88rem" }}>{r.description}</span>
                  <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                    Deleted by {r.deletedBy || "Unknown"} on {r.deletedAt ? r.deletedAt.slice(0, 10) : "—"} ·{" "}
                    {left === 0 ? "purging soon" : `${left} day${left === 1 ? "" : "s"} left`}
                  </p>
                </div>
                <button
                  onClick={r.onRestore}
                  style={{ background: "var(--btn-forest)", color: "var(--on-dark)", padding: "6px 14px", fontSize: "0.78rem", flexShrink: 0 }}
                >
                  Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchView({
  role,
  orders,
  customers,
  suppliers,
  customerCodes,
  supplierCodes,
  orderCodes,
  customerBalances,
  supplierBalances,
  stockItems,
  sales,
  saleReturns,
  onOpenStatement,
  onOpenBill,
}) {
  const [query, setQuery] = useState("");
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "—";
  const customerNameFor = (id) => customers.find((c) => c.id === id)?.name || "Cash sale";
  const invoiceNoFor = (id) => `INV-${id.slice(-6).toUpperCase()}`;
  const creditNoteNoFor = (id) => `CRN-${id.slice(-6).toUpperCase()}`;
  const q = query.trim().toLowerCase();

  const matchedOrders =
    role === "partner" && q
      ? orders.filter((o) => (orderCodes[o.id] || "").toLowerCase().includes(q))
      : [];

  const matchedSales = q ? sales.filter((s) => invoiceNoFor(s.id).toLowerCase().includes(q)) : [];
  const matchedReturns = q ? saleReturns.filter((r) => creditNoteNoFor(r.id).toLowerCase().includes(q)) : [];

  const matchedCustomers = q
    ? customers.filter(
        (c) =>
          (c.name || "").toLowerCase().includes(q) ||
          (c.proprietorName || "").toLowerCase().includes(q) ||
          (c.phone || "").toLowerCase().includes(q) ||
          (c.address || "").toLowerCase().includes(q) ||
          (customerCodes[c.id] || "").toLowerCase().includes(q)
      )
    : [];

  const matchedSuppliers = q
    ? suppliers.filter(
        (s) =>
          (s.name || "").toLowerCase().includes(q) ||
          (s.phone || "").toLowerCase().includes(q) ||
          (s.address || "").toLowerCase().includes(q) ||
          (supplierCodes[s.id] || "").toLowerCase().includes(q)
      )
    : [];

  const statusColor = { pending: "var(--accent-gold)", "in production": "var(--accent-blue)", fulfilled: "var(--accent-forest)", cancelled: "var(--accent-red)" };
  const totalMatches = matchedOrders.length + matchedSales.length + matchedReturns.length + matchedCustomers.length + matchedSuppliers.length;

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #8B6F47", paddingLeft: 10 }}>
          Search
        </h2>
      </div>
      <div className="relative mb-4">
        <Search size={15} style={{ position: "absolute", left: 10, top: 11, opacity: 0.5 }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            role === "partner"
              ? "Search order no, invoice/bill no, customer/supplier name, phone, address, or ID…"
              : "Search invoice/bill no, customer/supplier name, phone, address, or ID…"
          }
          style={{
            width: "100%",
            border: "1px solid rgba(var(--ink-rgb),0.25)",
            background: "var(--card-bg)",
            padding: "10px 12px 10px 32px",
            fontSize: "0.9rem",
          }}
          autoFocus
        />
      </div>

      {!q ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote
            text={
              role === "partner"
                ? "Start typing to search across orders, sales, returns, customers, and suppliers."
                : "Start typing to search across sales, returns, customers, and suppliers."
            }
          />
        </div>
      ) : totalMatches === 0 ? (
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="No matches found." />
        </div>
      ) : (
        <div className="space-y-6">
          {matchedOrders.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <ClipboardList size={13} /> Orders ({matchedOrders.length})
              </p>
              <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                {matchedOrders.map((o, i) => (
                  <div key={o.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                    <div>
                      <p style={{ fontSize: "0.88rem" }}>
                        <span className="mono-num" style={{ opacity: 0.6, marginRight: 8 }}>
                          {orderCodes[o.id]}
                        </span>
                        {itemName(o.itemId)} × {o.quantity}
                      </p>
                      <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                        {customers.find((c) => c.id === o.customerId)?.name || "Walk-in"} · ordered {o.date}
                        {o.dueDate && ` · due ${o.dueDate}`}
                      </p>
                    </div>
                    <span
                      style={{
                        fontSize: "0.68rem",
                        textTransform: "uppercase",
                        padding: "2px 8px",
                        background: `${statusColor[o.status]}20`,
                        color: statusColor[o.status],
                      }}
                    >
                      {o.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {matchedSales.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <ShoppingCart size={13} /> Sales ({matchedSales.length})
              </p>
              <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                {matchedSales.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpenBill(s, "sale")}
                    className="ledger-rule flex justify-between items-center px-4 py-3 w-full text-left"
                    style={{ background: "transparent" }}
                  >
                    <div>
                      <p style={{ fontSize: "0.88rem" }}>
                        <span className="mono-num" style={{ opacity: 0.6, marginRight: 8 }}>
                          {invoiceNoFor(s.id)}
                        </span>
                        {saleLinesSummary(s, itemName) || "Sale"}
                      </p>
                      <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                        {customerNameFor(s.customerId)} · {s.date}
                      </p>
                    </div>
                    <span className="mono-num" style={{ fontSize: "0.85rem", color: "var(--accent-forest)" }}>
                      {formatNPR(Number(s.cashAmount) + Number(s.creditAmount))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedReturns.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <ShoppingCart size={13} /> Returns ({matchedReturns.length})
              </p>
              <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                {matchedReturns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onOpenBill(r, "return")}
                    className="ledger-rule flex justify-between items-center px-4 py-3 w-full text-left"
                    style={{ background: "transparent" }}
                  >
                    <div>
                      <p style={{ fontSize: "0.88rem" }}>
                        <span className="mono-num" style={{ opacity: 0.6, marginRight: 8 }}>
                          {creditNoteNoFor(r.id)}
                        </span>
                        {itemName(r.itemId)}
                        {r.quantity ? ` × ${r.quantity}` : ""}
                      </p>
                      <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                        {customerNameFor(r.customerId)} · {r.date}
                      </p>
                    </div>
                    <span className="mono-num" style={{ fontSize: "0.85rem", color: "var(--accent-red)" }}>
                      {formatNPR(Number(r.cashRefund) + Number(r.creditReduction))}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedCustomers.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <Users size={13} /> Customers ({matchedCustomers.length})
              </p>
              <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                {matchedCustomers.map((c, i) => {
                  const bal = customerBalances[c.id] || { charged: 0, paid: 0 };
                  const owed = bal.charged - bal.paid;
                  return (
                    <div key={c.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                      <div>
                        <p style={{ fontSize: "0.88rem" }}>{c.name}</p>
                        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }} className="mono-num">
                          {customerCodes[c.id]}
                          {c.phone && ` · ${c.phone}`}
                          {c.address && ` · ${c.address}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="mono-num" style={{ fontSize: "0.85rem", color: owed > 0 ? "var(--accent-red)" : "var(--accent-forest)" }}>
                          {formatNPR(owed)}
                        </span>
                        <button
                          onClick={() => onOpenStatement("customer", c.id)}
                          style={{ opacity: 0.5 }}
                          title="Account statement"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {matchedSuppliers.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <Truck size={13} /> Suppliers ({matchedSuppliers.length})
              </p>
              <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
                {matchedSuppliers.map((s, i) => {
                  const bal = supplierBalances[s.id] || { charged: 0, paid: 0 };
                  const owed = bal.charged - bal.paid;
                  return (
                    <div key={s.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3" style={{ animationDelay: `${Math.min(i, 10) * 25}ms` }}>
                      <div>
                        <p style={{ fontSize: "0.88rem" }}>{s.name}</p>
                        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }} className="mono-num">
                          {supplierCodes[s.id]}
                          {s.phone && ` · ${s.phone}`}
                          {s.address && ` · ${s.address}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="mono-num" style={{ fontSize: "0.85rem", color: owed > 0 ? "var(--accent-red)" : "var(--accent-forest)" }}>
                          {formatNPR(owed)}
                        </span>
                        <button
                          onClick={() => onOpenStatement("supplier", s.id)}
                          style={{ opacity: 0.5 }}
                          title="Account statement"
                        >
                          <FileText size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Off by default and fully self-contained: toggle it on, set a rate and
// registration number, and every sale from then on carries VAT — nothing
// retroactive, nothing that breaks if it's left off entirely.
// Shows exactly who's contributing to the VAT you owe: output VAT by
// customer (what you've collected from each), input VAT by supplier (what
// you've paid each, credited back against what you owe), net of returns on
// both sides. A period view of the same numbers computeIncomeStatement and
// vatPayable track continuously.
function VatStatementModal({
  activeSales,
  activeSaleReturns,
  activePurchases,
  activePurchaseReturns,
  activeCustomers,
  activeSuppliers,
  customerCodes,
  supplierCodes,
  vatSettings,
  vatPayable,
  onClose,
}) {
  const [period, setPeriod] = useState("month");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(todayISO());
  const [closing, setClosing] = useState(false);
  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  const today = todayISO();
  const startOfMonth = today.slice(0, 7) + "-01";
  const startOfYear = today.slice(0, 4) + "-01-01";
  const rangeStart = period === "month" ? startOfMonth : period === "year" ? startOfYear : period === "custom" ? customFrom : null;
  const rangeEnd = period === "custom" ? customTo : today;
  const periodLabel =
    period === "month" ? "This month" : period === "year" ? "This year" : period === "all" ? "All time" : `${customFrom} to ${customTo}`;
  const inRange = (d) => (!rangeStart || d >= rangeStart) && d <= rangeEnd;

  const customerName = (id) => activeCustomers.find((c) => c.id === id)?.name || "Cash sale";
  const supplierName = (id) => activeSuppliers.find((s) => s.id === id)?.name || "Cash purchase";

  const outputByCustomer = useMemo(() => {
    const map = {};
    activeSales.filter((s) => s.vatApplicable && inRange(s.date)).forEach((s) => {
      const key = s.customerId || "__cash__";
      map[key] = (map[key] || 0) + (Number(s.vatAmount) || 0);
    });
    activeSaleReturns.filter((r) => r.vatApplicable && inRange(r.date)).forEach((r) => {
      const key = r.customerId || "__cash__";
      map[key] = (map[key] || 0) - (Number(r.vatAmount) || 0);
    });
    return Object.entries(map)
      .map(([id, vat]) => ({ id, name: id === "__cash__" ? "Cash sales (no customer)" : customerName(id), code: id === "__cash__" ? null : customerCodes?.[id], vat }))
      .filter((r) => Math.abs(r.vat) > 0.5)
      .sort((a, b) => b.vat - a.vat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSales, activeSaleReturns, rangeStart, rangeEnd]);

  const inputBySupplier = useMemo(() => {
    const map = {};
    activePurchases.filter((p) => p.vatApplicable && inRange(p.date)).forEach((p) => {
      const key = p.supplierId || "__cash__";
      map[key] = (map[key] || 0) + (Number(p.vatAmount) || 0);
    });
    activePurchaseReturns.filter((r) => r.vatApplicable && inRange(r.date)).forEach((r) => {
      const key = r.supplierId || "__cash__";
      map[key] = (map[key] || 0) - (Number(r.vatAmount) || 0);
    });
    return Object.entries(map)
      .map(([id, vat]) => ({ id, name: id === "__cash__" ? "Cash purchases (no supplier)" : supplierName(id), code: id === "__cash__" ? null : supplierCodes?.[id], vat }))
      .filter((r) => Math.abs(r.vat) > 0.5)
      .sort((a, b) => b.vat - a.vat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePurchases, activePurchaseReturns, rangeStart, rangeEnd]);

  const totalOutput = outputByCustomer.reduce((s, r) => s + r.vat, 0);
  const totalInput = inputBySupplier.reduce((s, r) => s + r.vat, 0);
  const netForPeriod = totalOutput - totalInput;

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      style={{ background: "rgba(20,17,14,0.55)", zIndex: 60, backdropFilter: "blur(2px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className={closing ? "modal-panel-out" : "modal-panel"} style={{ background: "var(--card-bg)", width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>
        <div className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2" style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.15)" }}>
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--ink)" }}>VAT statement</span>
          <div className="flex gap-2 items-center">
            <button onClick={() => window.print()} className="flex items-center gap-1" style={{ background: "var(--ink-surface)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}>
              <Printer size={14} /> Print
            </button>
            <button onClick={requestClose} style={{ color: "var(--ink)" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div id="invoice-print-area" style={{ padding: "24px", color: "var(--ink)", fontFamily: "Georgia, serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, borderBottom: "2px solid var(--ink)", paddingBottom: 12 }}>
            <div>
              <h2 style={{ fontSize: "1.2rem", margin: 0 }}>Trikut Snacks — VAT Statement</h2>
              {vatSettings?.panNumber && <p style={{ fontSize: "0.75rem", margin: "2px 0 0", opacity: 0.7 }}>PAN/VAT No. {vatSettings.panNumber}</p>}
            </div>
            <p style={{ fontSize: "0.78rem", margin: 0, opacity: 0.7 }}>{periodLabel}</p>
          </div>

          <div className="no-print flex gap-1 mb-4 flex-wrap">
            {[
              { id: "month", label: "This month" },
              { id: "year", label: "This year" },
              { id: "all", label: "All time" },
              { id: "custom", label: "Custom range" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{ background: period === p.id ? "var(--ink)" : "var(--surface-2)", color: period === p.id ? "#fff" : "var(--ink)", padding: "6px 10px", fontSize: "0.75rem" }}
              >
                {p.label}
              </button>
            ))}
            {period === "custom" && (
              <div className="flex items-center gap-2" style={{ marginLeft: 6 }}>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...inputStyle, width: "auto", marginBottom: 0 }} />
                <span style={{ fontSize: "0.78rem", opacity: 0.6 }}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...inputStyle, width: "auto", marginBottom: 0 }} />
              </div>
            )}
          </div>

          <p style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 6 }}>
            Output VAT — collected from customers
          </p>
          {outputByCustomer.length === 0 ? (
            <EmptyNote text="No VAT-applicable sales in this period." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: 16 }}>
              <tbody>
                {outputByCustomer.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.1)" }}>
                    <td style={{ padding: "5px 0" }}>
                      {r.name}
                      {r.code ? ` (${r.code})` : ""}
                    </td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "5px 0", fontWeight: 600 }}>{formatNPR(r.vat)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--ink)", fontWeight: 700 }}>
                  <td style={{ padding: "5px 0" }}>Total output VAT</td>
                  <td className="mono-num" style={{ textAlign: "right", padding: "5px 0" }}>{formatNPR(totalOutput)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <p style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 6 }}>
            Input VAT — paid to suppliers (credited against what you owe)
          </p>
          {inputBySupplier.length === 0 ? (
            <EmptyNote text="No VAT-applicable purchases in this period." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: 16 }}>
              <tbody>
                {inputBySupplier.map((r) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.1)" }}>
                    <td style={{ padding: "5px 0" }}>
                      {r.name}
                      {r.code ? ` (${r.code})` : ""}
                    </td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "5px 0", fontWeight: 600 }}>{formatNPR(r.vat)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: "2px solid var(--ink)", fontWeight: 700 }}>
                  <td style={{ padding: "5px 0" }}>Total input VAT</td>
                  <td className="mono-num" style={{ textAlign: "right", padding: "5px 0" }}>{formatNPR(totalInput)}</td>
                </tr>
              </tfoot>
            </table>
          )}

          <div style={{ marginLeft: "auto", width: 280, fontSize: "0.88rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
              <span>Net VAT this period (output − input)</span>
              <span className="mono-num" style={{ fontWeight: 600, color: netForPeriod >= 0 ? "var(--accent-red)" : "var(--accent-forest)" }}>{formatNPR(netForPeriod)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", borderTop: "3px double var(--ink)", marginTop: 4, fontWeight: 700 }}>
              <span>VAT Payable right now (all-time)</span>
              <span className="mono-num" style={{ color: vatPayable >= 0 ? "var(--accent-red)" : "var(--accent-forest)" }}>{formatNPR(vatPayable)}</span>
            </div>
          </div>
          <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 16 }}>
            The period figures above show who contributed to VAT during this window. "VAT Payable right now" is the
            running, all-time balance — what you'd actually owe the tax office today — not scoped to the period.
          </p>
        </div>
      </div>
    </div>
  );
}

function VatSettingsCard({ vatSettings, vatPayable, onSave, onRecordPayment, onViewStatement }) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(vatSettings?.enabled || false);
  const [rate, setRate] = useState(String(vatSettings?.rate ?? 13));
  const [panNumber, setPanNumber] = useState(vatSettings?.panNumber || "");
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState(vatPayable > 0 ? String(Math.round(vatPayable)) : "");
  const [payDate, setPayDate] = useState(todayISO());
  const [payMethod, setPayMethod] = useState("cash");
  const [payPartner, setPayPartner] = useState(PARTNERS[0]);

  function saveSettings() {
    onSave({ enabled, rate: Number(rate) || 0, panNumber: panNumber.trim() });
    setEditing(false);
  }

  function submitPayment() {
    onRecordPayment({ date: payDate, amount: Number(payAmount) || 0, method: payMethod, partner: payPartner, note: "VAT remitted" });
    setShowPayment(false);
    setPayAmount("");
  }

  return (
    <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-plum)", padding: "18px", marginBottom: 24 }}>
      <div className="flex justify-between items-center flex-wrap gap-2">
        <div>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem" }}>VAT</p>
          <p style={{ fontSize: "0.78rem", opacity: 0.65 }}>
            {vatSettings?.enabled
              ? `Enabled at ${vatSettings.rate}% on sales${vatSettings.panNumber ? ` · PAN/VAT No. ${vatSettings.panNumber}` : ""}`
              : "Off — sales and bills are unaffected until you turn this on."}
          </p>
        </div>
        <div className="flex gap-2">
          {vatSettings?.enabled && (
            <button onClick={onViewStatement} style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.8rem" }}>
              View VAT statement
            </button>
          )}
          <button onClick={() => setEditing((v) => !v)} style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.8rem" }}>
            {editing ? "Cancel" : "Settings"}
          </button>
        </div>
      </div>

      {editing && (
        <div style={{ marginTop: 14, borderTop: "1px dashed rgba(var(--ink-rgb),0.2)", paddingTop: 14 }}>
          <label className="flex items-center gap-2" style={{ fontSize: "0.85rem", marginBottom: 10 }}>
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Charge VAT on sales
          </label>
          {enabled && (
            <>
              <Field label="VAT rate (%)">
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} style={inputStyle} placeholder="13" />
              </Field>
              <Field label="PAN / VAT registration number">
                <input value={panNumber} onChange={(e) => setPanNumber(e.target.value)} style={inputStyle} placeholder="e.g. 123456789" />
                <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>Printed on bills once VAT is charged — required on a real VAT invoice.</p>
              </Field>
            </>
          )}
          <button onClick={saveSettings} style={saveBtnStyle}>
            Save
          </button>
        </div>
      )}

      {vatSettings?.enabled && (
        <div style={{ marginTop: 14, borderTop: "1px dashed rgba(var(--ink-rgb),0.2)", paddingTop: 14 }}>
          <div className="flex justify-between items-center flex-wrap gap-2">
            <p style={{ fontSize: "0.85rem" }}>
              VAT payable (collected, not yet remitted):{" "}
              <span className="mono-num" style={{ fontWeight: 600, color: vatPayable > 0 ? "var(--accent-red)" : "var(--accent-forest)" }}>
                {formatNPR(vatPayable)}
              </span>
            </p>
            <button onClick={() => setShowPayment((v) => !v)} style={{ background: "var(--surface-2)", padding: "6px 12px", fontSize: "0.8rem" }}>
              {showPayment ? "Cancel" : "Record VAT payment"}
            </button>
          </div>
          {showPayment && (
            <div style={{ marginTop: 10 }}>
              <Field label="Date">
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Amount paid (Rs.)">
                <input type="number" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} style={inputStyle} placeholder="0" />
              </Field>
              <Field label="Method">
                <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} style={inputStyle}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Paid by">
                <select value={payPartner} onChange={(e) => setPayPartner(e.target.value)} style={inputStyle}>
                  {PARTNERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <button onClick={submitPayment} style={saveBtnStyle}>
                Save payment
              </button>
            </div>
          )}
        </div>
      )}

      <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 12 }}>
        Covers VAT charged on sales and VAT paid on purchases (input credit, netted into the payable figure above).
        VAT on returns isn't tracked — a return's refund stays VAT-free even if the original sale or purchase
        charged it.
      </p>
    </div>
  );
}

function AccountingView({
  activeSales,
  activeSaleReturns,
  activePurchases,
  activePurchaseReturns,
  activeTransactions,
  activeStockItems,
  activeStockTx,
  totals,
  totalReceivable,
  totalPayable,
  vatPayable,
  vatSettings,
  onSaveVatSettings,
  onRecordVatPayment,
  stockFIFO,
  partnerBalances,
  activeCustomers,
  activeSuppliers,
  activeReceivables,
  activePayables,
  customerCodes,
  supplierCodes,
  fixedAssets,
  onAddFixedAsset,
  onEditFixedAsset,
  onDeleteFixedAsset,
}) {
  const [period, setPeriod] = useState("month");
  const [showVatStatement, setShowVatStatement] = useState(false);
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(todayISO());

  const today = todayISO();
  const startOfMonth = today.slice(0, 7) + "-01";
  const startOfYear = today.slice(0, 4) + "-01-01";

  const rangeStart = period === "month" ? startOfMonth : period === "year" ? startOfYear : period === "custom" ? customFrom : null;
  const rangeEnd = period === "custom" ? customTo : today;
  const periodLabel =
    period === "month" ? "This month" : period === "year" ? "This year" : period === "all" ? "All time" : `${customFrom} to ${customTo}`;

  const stmt = useMemo(
    () =>
      computeIncomeStatement({
        sales: activeSales,
        saleReturns: activeSaleReturns,
        transactions: activeTransactions,
        stockItems: activeStockItems,
        stockTx: activeStockTx,
        startDate: rangeStart,
        endDate: rangeEnd,
      }),
    [activeSales, activeSaleReturns, activeTransactions, activeStockItems, activeStockTx, rangeStart, rangeEnd]
  );

  const periodDepreciation = useMemo(
    () => fixedAssets.reduce((s, f) => s + computeFixedAssetPeriodExpense(f, rangeStart, rangeEnd), 0),
    [fixedAssets, rangeStart, rangeEnd]
  );
  const netProfitAfterDepreciation = stmt.netProfit - periodDepreciation;
  const grossMarginPercent = stmt.totalRevenue > 0 ? (stmt.grossProfit / stmt.totalRevenue) * 100 : 0;
  const netMarginPercent = stmt.totalRevenue > 0 ? (netProfitAfterDepreciation / stmt.totalRevenue) * 100 : 0;

  // Retained earnings: cumulative net profit from inception to today, using
  // the same accrual logic — this is what ties the Balance Sheet's equity
  // side back to the Income Statement. Cumulative depreciation is included
  // here too, since it's what keeps Fixed Assets' book value reduction on
  // the Balance Sheet matched by an equal reduction in Equity.
  const retainedEarnings = useMemo(() => {
    const allTime = computeIncomeStatement({
      sales: activeSales,
      saleReturns: activeSaleReturns,
      transactions: activeTransactions,
      stockItems: activeStockItems,
      stockTx: activeStockTx,
      startDate: null,
      endDate: today,
    }).netProfit;
    const allTimeDepreciation = fixedAssets.reduce((s, f) => s + computeFixedAssetPeriodExpense(f, null, today), 0);
    return allTime - allTimeDepreciation;
  }, [activeSales, activeSaleReturns, activeTransactions, activeStockItems, activeStockTx, fixedAssets, today]);

  const rawMaterialValue = activeStockItems
    .filter((i) => i.category === "Raw Material")
    .reduce((s, i) => s + (stockFIFO[i.id]?.currentValue || 0), 0);
  const finishedGoodsValue = activeStockItems
    .filter((i) => i.category === "Finished Good")
    .reduce((s, i) => s + (stockFIFO[i.id]?.currentValue || 0), 0);
  const netFixedAssetsValue = fixedAssets.reduce((s, f) => s + computeFixedAssetBookValue(f, today).bookValue, 0);

  const totalAssets = totals.cashBalance + totalReceivable + rawMaterialValue + finishedGoodsValue + netFixedAssetsValue;
  const totalLiabilities = totalPayable + vatPayable;
  const netCapital = PARTNERS.reduce((s, p) => s + partnerBalances[p].contributed - partnerBalances[p].withdrawn, 0);
  const totalEquity = netCapital + retainedEarnings;
  const balanceCheck = totalAssets - (totalLiabilities + totalEquity);

  const receivableAging = useMemo(() => {
    return activeCustomers
      .map((c) => {
        const buckets = computeAgingBuckets(
          activeReceivables.filter((r) => r.customerId === c.id),
          today
        );
        const total = buckets.current + buckets.d31 + buckets.d61 + buckets.d90;
        return { party: c, code: customerCodes[c.id], buckets, total };
      })
      .filter((r) => r.total > 0.5)
      .sort((a, b) => b.total - a.total);
  }, [activeCustomers, activeReceivables, customerCodes, today]);

  const payableAging = useMemo(() => {
    return activeSuppliers
      .map((s) => {
        const buckets = computeAgingBuckets(
          activePayables.filter((p) => p.supplierId === s.id),
          today
        );
        const total = buckets.current + buckets.d31 + buckets.d61 + buckets.d90;
        return { party: s, code: supplierCodes[s.id], buckets, total };
      })
      .filter((r) => r.total > 0.5)
      .sort((a, b) => b.total - a.total);
  }, [activeSuppliers, activePayables, supplierCodes, today]);

  return (
    <div>
      <div className="no-print flex justify-between items-center flex-wrap gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Accounting</h2>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="flex gap-1">
            {[
              { id: "month", label: "This month" },
              { id: "year", label: "This year" },
              { id: "all", label: "All time" },
              { id: "custom", label: "Custom" },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                style={{
                  background: period === p.id ? "var(--ink)" : "var(--surface-2)",
                  color: period === p.id ? "#fff" : "var(--ink)",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1"
            style={{ background: "var(--ink-surface)", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
          >
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {period === "custom" && (
        <div className="no-print flex items-center gap-2 flex-wrap mb-4" style={{ background: "var(--surface-2)", padding: "8px 12px" }}>
          <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>From</label>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", color: "var(--ink)", padding: "4px 8px", fontSize: "0.78rem" }} />
          <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>To</label>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ border: "1px solid rgba(var(--ink-rgb),0.25)", background: "var(--card-bg)", color: "var(--ink)", padding: "4px 8px", fontSize: "0.78rem" }} />
        </div>
      )}

      <div className="no-print mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>Fixed Assets</h3>
          <button
            onClick={onAddFixedAsset}
            className="flex items-center gap-1"
            style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "6px 12px", fontSize: "0.8rem" }}
          >
            <Plus size={14} /> Add fixed asset
          </button>
        </div>
        {fixedAssets.length === 0 ? (
          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-4">
            <EmptyNote text="No fixed assets yet — add machinery, equipment, or vehicles here to have them capitalized and depreciated instead of fully expensed at purchase." />
          </div>
        ) : (
          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
            {fixedAssets.map((f, i) => {
              const { bookValue } = computeFixedAssetBookValue(f, today);
              return (
                <div key={f.id} className="ledger-rule row-in flex justify-between items-center px-4 py-3" style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}>
                  <div>
                    <p style={{ fontSize: "0.88rem" }}>{f.name}</p>
                    <p style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                      Bought {f.purchaseDate} · {formatNPR(f.cost)} · {f.ratePercent >= 0 ? `${f.ratePercent}%/yr depreciation` : `${-f.ratePercent}%/yr appreciation`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="mono-num" style={{ fontSize: "0.85rem" }}>{formatNPR(bookValue)}</span>
                    <button onClick={() => onEditFixedAsset(f)} style={{ opacity: 0.4 }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDeleteFixedAsset(f.id)} style={{ opacity: 0.4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <VatSettingsCard
        vatSettings={vatSettings}
        vatPayable={vatPayable}
        onSave={onSaveVatSettings}
        onRecordPayment={onRecordVatPayment}
        onViewStatement={() => setShowVatStatement(true)}
      />
      {showVatStatement && (
        <VatStatementModal
          activeSales={activeSales}
          activeSaleReturns={activeSaleReturns}
          activePurchases={activePurchases}
          activePurchaseReturns={activePurchaseReturns}
          activeCustomers={activeCustomers}
          activeSuppliers={activeSuppliers}
          customerCodes={customerCodes}
          supplierCodes={supplierCodes}
          vatSettings={vatSettings}
          vatPayable={vatPayable}
          onClose={() => setShowVatStatement(false)}
        />
      )}

      <div id="invoice-print-area">
        <div className="mb-2">
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h1>
          <p style={{ fontSize: "0.75rem", opacity: 0.6, margin: 0 }}>Three Peaks, One Great Taste — Dharan, Sunsari, Nepal</p>
        </div>

        <div className="grid grid-cols-1 gap-6 mt-6">
          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-gold)", padding: "18px" }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem" }} className="mb-1">
              Income Statement
            </p>
            <p style={{ fontSize: "0.72rem", opacity: 0.6 }} className="mb-3">
              {periodLabel} ({rangeStart || "inception"} to {rangeEnd})
            </p>

            <AccountingLine label="Sales Revenue" value={stmt.salesRevenue} />
            <AccountingLine label="Less: Sales Returns" value={-stmt.salesReturnsTotal} />
            <AccountingLine label="Net Sales Revenue" value={stmt.netSalesRevenue} bold underline />

            {Object.entries(stmt.otherIncomeByCategory).map(([cat, amt]) => (
              <AccountingLine key={cat} label={cat} value={amt} indent />
            ))}
            <AccountingLine label="Total Revenue" value={stmt.totalRevenue} bold />

            <div style={{ height: 10 }} />
            <AccountingLine label="Cost of Goods Sold" value={-stmt.cogs} />
            <AccountingLine label="Gross Profit" value={stmt.grossProfit} bold underline />
            <div className="flex justify-between" style={{ fontSize: "0.8rem", padding: "3px 0", opacity: 0.75 }}>
              <span>Gross Margin</span>
              <span className="mono-num">{grossMarginPercent.toFixed(1)}%</span>
            </div>

            <div style={{ height: 10 }} />
            <p style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 4 }}>Operating Expenses</p>
            {Object.entries(stmt.opExByCategory).length === 0 ? (
              <EmptyNote text="No standalone operating expenses this period." />
            ) : (
              Object.entries(stmt.opExByCategory).map(([cat, amt]) => (
                <AccountingLine key={cat} label={cat} value={amt} indent />
              ))
            )}
            <AccountingLine label="Total Operating Expenses" value={stmt.totalOpEx} bold />

            <div style={{ height: 10 }} />
            <AccountingLine
              label={periodDepreciation >= 0 ? "Depreciation" : "Appreciation"}
              value={periodDepreciation >= 0 ? periodDepreciation : -periodDepreciation}
              indent
              color={periodDepreciation < 0 ? "var(--accent-forest)" : undefined}
            />

            <div style={{ height: 10 }} />
            <AccountingLine
              label="Net Profit"
              value={netProfitAfterDepreciation}
              bold
              doubleUnderline
              color={netProfitAfterDepreciation >= 0 ? "var(--accent-forest)" : "var(--accent-red)"}
            />
            <div className="flex justify-between" style={{ fontSize: "0.8rem", padding: "3px 0", fontWeight: 600 }}>
              <span>Net Margin</span>
              <span className="mono-num" style={{ color: netMarginPercent >= 0 ? "var(--accent-forest)" : "var(--accent-red)" }}>
                {netMarginPercent.toFixed(1)}%
              </span>
            </div>
          </div>

          <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-blue)", padding: "18px" }}>
            <p style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem" }} className="mb-1">
              Balance Sheet
            </p>
            <p style={{ fontSize: "0.72rem", opacity: 0.6 }} className="mb-3">
              As of {today}
            </p>

            <p style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 4 }}>Assets</p>
            <AccountingLine label="Cash in Hand" value={totals.byMethod.cash} indent />
            <AccountingLine label="Bank" value={totals.byMethod.bank} indent />
            <AccountingLine label="eSewa" value={totals.byMethod.esewa} indent />
            <AccountingLine label="Accounts Receivable" value={totalReceivable} indent />
            <AccountingLine label="Raw Material Inventory" value={rawMaterialValue} indent />
            <AccountingLine label="Finished Goods Inventory" value={finishedGoodsValue} indent />
            <AccountingLine label="Fixed Assets (net of depreciation)" value={netFixedAssetsValue} indent />
            <AccountingLine label="Total Assets" value={totalAssets} bold underline />

            <div style={{ height: 10 }} />
            <p style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 4 }}>Liabilities</p>
            <AccountingLine label="Accounts Payable" value={totalPayable} indent />
            {(vatSettings?.enabled || Math.abs(vatPayable) > 0.5) && (
              <AccountingLine label="VAT Payable" value={vatPayable} indent />
            )}
            <AccountingLine label="Total Liabilities" value={totalLiabilities} bold underline />

            <div style={{ height: 10 }} />
            <p style={{ fontSize: "0.78rem", opacity: 0.6, marginBottom: 4 }}>Equity</p>
            <AccountingLine label="Partner Capital (net)" value={netCapital} indent />
            <AccountingLine label="Retained Earnings" value={retainedEarnings} indent />
            <AccountingLine label="Total Equity" value={totalEquity} bold underline />

            <div style={{ height: 10 }} />
            <AccountingLine
              label="Liabilities + Equity"
              value={totalLiabilities + totalEquity}
              bold
              doubleUnderline
            />
            <p style={{ fontSize: "0.7rem", marginTop: 8, color: Math.abs(balanceCheck) < 1 ? "var(--accent-forest)" : "var(--accent-red)" }}>
              {Math.abs(balanceCheck) < 1 ? "✓ Balanced" : `⚠ Off by ${formatNPR(balanceCheck)}`}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 mt-6">
          <AgingTable title="Accounts Receivable Aging" rows={receivableAging} colorTone="var(--accent-red)" borderColor="var(--accent-forest)" />
          <AgingTable title="Accounts Payable Aging" rows={payableAging} colorTone="var(--accent-red)" borderColor="var(--accent-red)" />
        </div>

        <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 16 }}>
          Prepared on accrual basis — revenue is recognized at full sale value (cash + credit) at time of sale, and
          Cost of Goods Sold is matched using FIFO to the specific goods sold this period. This may differ from the
          cash-basis "Total Income" shown on the Dashboard, which only counts cash actually received.
        </p>
      </div>
    </div>
  );
}

function AgingTable({ title, rows, colorTone, borderColor }) {
  const totals = rows.reduce(
    (acc, r) => ({
      current: acc.current + r.buckets.current,
      d31: acc.d31 + r.buckets.d31,
      d61: acc.d61 + r.buckets.d61,
      d90: acc.d90 + r.buckets.d90,
      total: acc.total + r.total,
    }),
    { current: 0, d31: 0, d61: 0, d90: 0, total: 0 }
  );

  return (
    <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: `3px solid ${borderColor || "var(--ink)"}`, padding: "18px" }}>
      <p style={{ fontFamily: "Georgia, serif", fontSize: "1.05rem" }} className="mb-1">
        {title}
      </p>
      <p style={{ fontSize: "0.72rem", opacity: 0.6 }} className="mb-3">
        Oldest unpaid charges paid off first, aged by days outstanding
      </p>
      {rows.length === 0 ? (
        <EmptyNote text="Nothing outstanding right now." />
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.76rem" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid var(--ink)" }}>
              <th style={{ textAlign: "left", padding: "4px 2px" }}>Name</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>0-30</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>31-60</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>61-90</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>90+</th>
              <th style={{ textAlign: "right", padding: "4px 2px" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.party.id} style={{ borderBottom: "1px solid rgba(var(--ink-rgb),0.1)", background: i % 2 === 1 ? "rgba(var(--ink-rgb),0.025)" : "transparent" }}>
                <td style={{ padding: "6px 4px" }}>
                  {r.party.name}
                  {r.code && <span style={{ opacity: 0.5 }}> ({r.code})</span>}
                </td>
                <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>
                  {r.buckets.current > 0.5 ? formatNPR(r.buckets.current) : "—"}
                </td>
                <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>
                  {r.buckets.d31 > 0.5 ? formatNPR(r.buckets.d31) : "—"}
                </td>
                <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>
                  {r.buckets.d61 > 0.5 ? formatNPR(r.buckets.d61) : "—"}
                </td>
                <td
                  className="mono-num"
                  style={{ textAlign: "right", padding: "6px 4px", color: r.buckets.d90 > 0.5 ? colorTone : "inherit", fontWeight: r.buckets.d90 > 0.5 ? 600 : 400 }}
                >
                  {r.buckets.d90 > 0.5 && (
                    <span className="pulse-attention" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: colorTone, marginRight: 5 }} />
                  )}
                  {r.buckets.d90 > 0.5 ? formatNPR(r.buckets.d90) : "—"}
                </td>
                <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px", fontWeight: 600 }}>
                  {formatNPR(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--ink)", fontWeight: 600 }}>
              <td style={{ padding: "4px 2px" }}>Total</td>
              <td className="mono-num" style={{ textAlign: "right", padding: "4px 2px" }}>{formatNPR(totals.current)}</td>
              <td className="mono-num" style={{ textAlign: "right", padding: "4px 2px" }}>{formatNPR(totals.d31)}</td>
              <td className="mono-num" style={{ textAlign: "right", padding: "4px 2px" }}>{formatNPR(totals.d61)}</td>
              <td className="mono-num" style={{ textAlign: "right", padding: "4px 2px", color: totals.d90 > 0.5 ? colorTone : "inherit" }}>{formatNPR(totals.d90)}</td>
              <td className="mono-num" style={{ textAlign: "right", padding: "4px 2px" }}>{formatNPR(totals.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function AccountingLine({ label, value, bold, underline, doubleUnderline, indent, color }) {
  return (
    <div
      className="flex justify-between"
      style={{
        fontSize: "0.85rem",
        padding: "3px 0",
        paddingLeft: indent ? 12 : 0,
        borderLeft: indent ? "2px solid rgba(var(--ink-rgb),0.1)" : "none",
        fontWeight: bold ? 600 : 400,
        borderBottom: doubleUnderline ? "3px double var(--ink)" : underline ? "1px solid rgba(var(--ink-rgb),0.3)" : "none",
      }}
    >
      <span>{label}</span>
      <span className="mono-num" style={{ color: color || "inherit" }}>
        {formatNPR(value)}
      </span>
    </div>
  );
}

function FixedAssetForm({ editEntry, actor, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [purchaseDate, setPurchaseDate] = useState(editEntry?.purchaseDate || todayISO());
  const [cost, setCost] = useState(editEntry?.cost ? String(editEntry.cost) : "");
  const [ratePercent, setRatePercent] = useState(editEntry?.ratePercent !== undefined ? String(editEntry.ratePercent) : "10");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!name.trim() || !cost || Number(cost) <= 0) return;
    onSave({
      ...(editEntry || {}),
      name: name.trim(),
      purchaseDate,
      cost: Number(cost),
      ratePercent: Number(ratePercent) || 0,
      method,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit fixed asset" : "Add fixed asset"}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Chips Frying Machine" />
      </Field>
      <Field label="Purchase date">
        <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Cost (Rs.)">
        <input type="number" value={cost} onChange={(e) => setCost(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Depreciation rate (% per year — use a negative number if it appreciates instead)">
        <input type="number" value={ratePercent} onChange={(e) => setRatePercent(e.target.value)} style={inputStyle} placeholder="10" />
      </Field>
      <Field label="Paid via">
        <select value={method} onChange={(e) => setMethod(e.target.value)} style={inputStyle}>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {METHOD_LABELS[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Handled by">
        <select value={partner} onChange={(e) => setPartner(e.target.value)} style={inputStyle}>
          {PARTNERS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Entered by">
        <input value={editEntry?.createdBy || actor} disabled style={readOnlyInputStyle} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        {editEntry ? "Save changes" : "Save fixed asset"}
      </button>
    </Modal>
  );
}

function BackupView({
  transactions,
  capitalEntries,
  recurringTemplates,
  customers,
  receivables,
  stockItems,
  stockTx,
  sales,
  saleReturns,
  suppliers,
  payables,
  productionBatches,
  purchases,
  purchaseReturns,
  orders,
  fixedAssets,
  locations,
  ownership,
  vatSettings,
  customExpenseCategories,
  lastBackup,
  onRecordBackup,
}) {
  const [lastAction, setLastAction] = useState("");

  const datasets = {
    Transactions: transactions,
    "Partner Capital": capitalEntries,
    "Recurring Transactions": recurringTemplates,
    Customers: customers,
    Receivables: receivables,
    "Stock Items": stockItems,
    "Stock Movements": stockTx,
    Sales: sales,
    "Sale Returns": saleReturns,
    Suppliers: suppliers,
    Payables: payables,
    "Production Batches": productionBatches,
    Purchases: purchases,
    "Purchase Returns": purchaseReturns,
    Orders: orders,
    "Fixed Assets": fixedAssets,
  };

  const totalRecords = Object.values(datasets).reduce((s, d) => s + d.length, 0);
  const trashedRecords = Object.values(datasets).reduce((s, d) => s + d.filter(isDeleted).length, 0);

  const lastBackupTime = [lastBackup?.json, lastBackup?.excel].filter(Boolean).sort().pop();
  const daysSinceBackup = lastBackupTime ? daysBetween(lastBackupTime, nowISO()) : null;
  const backupDisplay =
    daysSinceBackup === null ? "Never" : daysSinceBackup === 0 ? "Today" : daysSinceBackup === 1 ? "Yesterday" : `${daysSinceBackup}d ago`;
  const backupTone = daysSinceBackup === null || daysSinceBackup > 14 ? "red" : daysSinceBackup > 7 ? "gold" : "green";

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function downloadJSON() {
    const payload = {
      exportedAt: nowISO(),
      business: "Trikut Snacks",
      data: datasets,
      // Settings blobs aren't per-record lists, so they live alongside
      // `data` rather than inside it — that keeps record counts and the
      // one-sheet-per-entity Excel export unchanged, while making sure a
      // restore doesn't lose the city/area list or ownership split.
      settings: { locations, ownership, vatSettings, customExpenseCategories },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(blob, `trikut-snacks-backup-${todayISO()}.json`);
    setLastAction(`Downloaded full JSON backup at ${new Date().toLocaleTimeString()}`);
    onRecordBackup?.("json");
  }

  function downloadExcel() {
    const wb = XLSX.utils.book_new();
    Object.entries(datasets).forEach(([sheetName, rows]) => {
      const flatRows = rows.map((row) => {
        const flat = {};
        Object.entries(row).forEach(([k, v]) => {
          flat[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
        });
        return flat;
      });
      const ws = XLSX.utils.json_to_sheet(flatRows.length ? flatRows : [{ note: "No records" }]);
      XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
    });
    XLSX.writeFile(wb, `trikut-snacks-backup-${todayISO()}.xlsx`);
    setLastAction(`Downloaded Excel workbook at ${new Date().toLocaleTimeString()}`);
    onRecordBackup?.("excel");
  }

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-blue)", paddingLeft: 10 }}>Backup & Export</h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Download a complete copy of everything in the app — including anything currently in Recently Deleted.
        </p>
      </div>

      <div className="grid mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
        <StatTile label="Total Records" value={totalRecords} tone="ink" />
        <StatTile label="In Trash" value={trashedRecords} tone={trashedRecords > 0 ? "gold" : "ink"} />
        <StatTile label="Last Backup" value={daysSinceBackup} display={backupDisplay} tone={backupTone} />
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-blue)", padding: "18px" }} className="mb-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={downloadJSON}
            className="flex items-center gap-2"
            style={{ background: "var(--ink-surface)", color: "var(--on-dark)", padding: "10px 16px", fontSize: "0.85rem" }}
          >
            <Download size={15} /> Download Full Backup (JSON)
          </button>
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2"
            style={{ background: "var(--btn-forest)", color: "var(--on-dark)", padding: "10px 16px", fontSize: "0.85rem" }}
          >
            <Download size={15} /> Download Excel Workbook
          </button>
        </div>
        {lastAction && <p style={{ fontSize: "0.78rem", color: "var(--accent-forest)" }}>✓ {lastAction}</p>}
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 8 }}>
          The JSON file is the true backup — everything, in the exact shape the app uses, useful if you ever need to
          hand data to someone else or rebuild from scratch — it also carries your settings (city/area list, partner ownership split). The Excel workbook is for reading and analyzing the
          numbers yourself, one sheet per section.
        </p>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "18px" }}>
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-3">
          What's in it
        </p>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
          {Object.entries(datasets).map(([name, rows], i) => (
            <div
              key={name}
              className="row-in flex justify-between items-center"
              style={{ fontSize: "0.8rem", background: "var(--page-bg)", padding: "8px 10px", borderRadius: 6, animationDelay: `${i * 20}ms` }}
            >
              <span style={{ opacity: 0.7 }}>{name}</span>
              <span className="mono-num" style={{ fontWeight: 600, color: rows.length > 0 ? "var(--accent-forest)" : "inherit", opacity: rows.length > 0 ? 1 : 0.4 }}>
                {rows.length}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: "0.72rem", opacity: 0.5, marginTop: 12 }}>
        Worth doing every so often — after a busy week, before a big change, or just on a regular schedule. The file
        saves to your device's normal downloads location.
      </p>
    </div>
  );
}

const ROLE_LABELS = { super_admin: "Super Admin", admin: "Admin", staff: "Staff" };
const ROLE_DESCRIPTIONS = {
  super_admin: "Full access, plus can manage everyone's role here.",
  admin: "Full business access — everything except managing team roles.",
  staff: "Day-to-day operations only — no Orders, Capital, Accounting, Backup, or Team.",
};

const ACTIVITY_ACTION_COLORS = { created: "var(--accent-forest)", updated: "var(--accent-blue)", deleted: "var(--accent-red)" };
const ACTIVITY_ACTION_LABELS = { created: "Created", updated: "Updated", deleted: "Deleted" };

function ActivityLogView({
  transactions,
  capitalEntries,
  customers,
  receivables,
  stockItems,
  stockTx,
  sales,
  saleReturns,
  suppliers,
  payables,
  productionBatches,
  purchases,
  purchaseReturns,
  orders,
  fixedAssets,
}) {
  const [actorFilter, setActorFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");

  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Unknown customer";
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "Unknown supplier";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "Unknown item";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  function describe(type, e) {
    switch (type) {
      case "Transaction":
        return `${e.category} — ${formatNPR(e.amount)}`;
      case "Partner Capital":
        return `${e.partner} — ${e.type === "contribution" ? "Contribution" : "Withdrawal"} — ${formatNPR(e.amount)}`;
      case "Customer":
        return e.name;
      case "Receivable":
        return `${e.type === "charge" ? "Charge" : "Payment"} — ${formatNPR(e.amount)} (${customerName(e.customerId)})`;
      case "Stock Item":
        return `${e.name} (${e.category})`;
      case "Stock Movement":
        return `${e.type === "in" ? "Stock in" : "Stock out"} — ${e.quantity} ${itemUnit(e.itemId)} (${itemName(e.itemId)})`;
      case "Sale":
        return `Sale — ${e.itemId ? `${itemName(e.itemId)} × ${e.quantity}` : "cash sale"} (${customerName(e.customerId)})`;
      case "Sale Return":
        return `Return — ${e.itemId ? `${itemName(e.itemId)} × ${e.quantity}` : ""} (${customerName(e.customerId)})`;
      case "Supplier":
        return e.name;
      case "Payable":
        return `${e.type === "charge" ? "Charge" : "Payment"} — ${formatNPR(e.amount)} (${supplierName(e.supplierId)})`;
      case "Production Batch":
        return `${itemName(e.outputItemId)} × ${e.outputQuantity}`;
      case "Purchase":
        return `Purchase — ${e.itemId ? `${itemName(e.itemId)} × ${e.quantity}` : ""} (${e.supplierId ? supplierName(e.supplierId) : "cash"})`;
      case "Purchase Return":
        return `Return — ${e.itemId ? `${itemName(e.itemId)} × ${e.quantity}` : ""} (${e.supplierId ? supplierName(e.supplierId) : "cash"})`;
      case "Order":
        return `${itemName(e.itemId)} × ${e.quantity} (${e.customerId ? customerName(e.customerId) : "Walk-in"})`;
      case "Fixed Asset":
        return `${e.name} — ${formatNPR(e.cost)}`;
      default:
        return "";
    }
  }

  const entityGroups = [
    ["Transaction", transactions],
    ["Partner Capital", capitalEntries],
    ["Customer", customers],
    ["Receivable", receivables],
    ["Stock Item", stockItems],
    ["Stock Movement", stockTx],
    ["Sale", sales],
    ["Sale Return", saleReturns],
    ["Supplier", suppliers],
    ["Payable", payables],
    ["Production Batch", productionBatches],
    ["Purchase", purchases],
    ["Purchase Return", purchaseReturns],
    ["Order", orders],
    ["Fixed Asset", fixedAssets],
  ];

  const events = useMemo(() => {
    const list = [];
    entityGroups.forEach(([type, records]) => {
      records.forEach((e) => {
        const description = describe(type, e);
        if (e.createdAt) {
          list.push({ id: `${e.id}-created`, timestamp: e.createdAt, actor: e.createdBy || "Unknown", action: "created", type, description });
        }
        if (e.updatedAt && e.updatedAt !== e.createdAt) {
          list.push({ id: `${e.id}-updated`, timestamp: e.updatedAt, actor: e.updatedBy || "Unknown", action: "updated", type, description });
        }
        if (e.deletedAt) {
          list.push({ id: `${e.id}-deleted`, timestamp: e.deletedAt, actor: e.deletedBy || "Unknown", action: "deleted", type, description });
        }
      });
    });
    return list.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, capitalEntries, customers, receivables, stockItems, stockTx, sales, saleReturns, suppliers, payables, productionBatches, purchases, purchaseReturns, orders, fixedAssets]);

  const actors = useMemo(() => Array.from(new Set(events.map((e) => e.actor))).sort(), [events]);

  const filtered = events.filter(
    (e) => (actorFilter === "all" || e.actor === actorFilter) && (actionFilter === "all" || e.action === actionFilter)
  );
  const visible = filtered.slice(0, 200);

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #4A5568", paddingLeft: 10 }}>
          Activity
        </h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Everything created, edited, or deleted across the app, newest first.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">Everyone</option>
          {actors.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">Every action</option>
          <option value="created">Created</option>
          <option value="updated">Updated</option>
          <option value="deleted">Deleted</option>
        </select>
      </div>

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
        {visible.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No activity matches this filter yet." />
          </div>
        ) : (
          visible.map((e, i) => (
            <div
              key={e.id}
              className="ledger-rule row-in flex justify-between items-center px-4 py-3 gap-3"
              style={{ animationDelay: `${Math.min(i, 14) * 20}ms` }}
            >
              <div className="flex items-center gap-3" style={{ minWidth: 0 }}>
                <span
                  style={{
                    fontSize: "0.68rem",
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    flexShrink: 0,
                    background: `${ACTIVITY_ACTION_COLORS[e.action]}20`,
                    color: ACTIVITY_ACTION_COLORS[e.action],
                  }}
                >
                  {ACTIVITY_ACTION_LABELS[e.action]}
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: "0.85rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <span style={{ opacity: 0.55 }}>{e.type}</span> — {e.description}
                  </p>
                  <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                    {e.actor} · {e.timestamp.slice(0, 16).replace("T", " ")}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      {filtered.length > 200 && (
        <p style={{ fontSize: "0.72rem", opacity: 0.5, marginTop: 10 }}>
          Showing the most recent 200 of {filtered.length} matching events.
        </p>
      )}
    </div>
  );
}

function InsightsView({
  onNavigate,
  onOpenStatement,
  activeSales,
  activeSaleReturns,
  activeStockItems,
  activeStockTx,
  activeProductionBatches,
  activeCustomers,
  customerCodes,
  finishedGoodPricing,
  stockFIFO,
  totalReceivable,
  activeReceivables,
}) {
  const [period, setPeriod] = useState("30d");
  const today = todayISO();
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [customTo, setCustomTo] = useState(today);

  const rangeStart = useMemo(() => {
    if (period === "all") return null;
    if (period === "custom") return customFrom;
    const d = new Date();
    d.setDate(d.getDate() - (period === "30d" ? 30 : 90));
    return d.toISOString().slice(0, 10);
  }, [period, customFrom]);
  const rangeEnd = period === "custom" ? customTo : today;

  const itemName = (id) => activeStockItems.find((i) => i.id === id)?.name || "Unknown item";
  const itemUnit = (id) => activeStockItems.find((i) => i.id === id)?.unit || "";
  const finishedGoods = activeStockItems.filter((i) => i.category === "Finished Good");

  const salesInRange = activeSales.filter((s) => (!rangeStart || s.date >= rangeStart) && s.date <= rangeEnd);
  const returnsInRange = activeSaleReturns.filter((r) => (!rangeStart || r.date >= rangeStart) && r.date <= rangeEnd);
  const productionInRange = activeProductionBatches.filter((b) => (!rangeStart || b.date >= rangeStart) && b.date <= rangeEnd);

  // Product performance: revenue and quantity per finished good, net of
  // returns, so a product with a lot of returns doesn't look like a top
  // seller it isn't.
  const productPerformance = useMemo(() => {
    const map = {};
    finishedGoods.forEach((i) => (map[i.id] = { itemId: i.id, revenue: 0, quantity: 0, saleCount: 0 }));
    salesInRange.forEach((s) => {
      // VAT is tracked per-sale, not per-line, so a line's share of it is
      // extracted proportionally — safe because the rate is uniform across
      // a sale's lines (one VAT rate applies to the whole transaction).
      const vatFraction = s.vatApplicable && s.vatRate ? 100 / (100 + Number(s.vatRate)) : 1;
      saleLines(s).forEach((l) => {
        if (!l.itemId || !map[l.itemId]) return;
        map[l.itemId].revenue += Number(l.quantity) * Number(l.unitRate || 0) * vatFraction;
        map[l.itemId].quantity += Number(l.quantity) || 0;
        map[l.itemId].saleCount += 1;
      });
    });
    returnsInRange.forEach((r) => {
      if (!r.itemId || !map[r.itemId]) return;
      map[r.itemId].revenue -= Number(r.cashRefund) + Number(r.creditReduction) - (Number(r.vatAmount) || 0);
      map[r.itemId].quantity -= Number(r.quantity) || 0;
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [finishedGoods, salesInRange, returnsInRange]);

  const topSellers = productPerformance.filter((p) => p.revenue > 0).slice(0, 5);
  const slowMovers = finishedGoods
    .map((i) => ({ item: i, onHand: stockFIFO[i.id]?.currentQty || 0, sold: productPerformance.find((p) => p.itemId === i.id)?.quantity || 0 }))
    .filter((r) => r.onHand > 0 && r.sold <= 0)
    .sort((a, b) => b.onHand - a.onHand)
    .slice(0, 5);

  // Overproduction: made a lot more than sold in the same window.
  const overproduction = useMemo(() => {
    const producedByItem = {};
    productionInRange.forEach((b) => {
      if (!b.outputItemId) return;
      producedByItem[b.outputItemId] = (producedByItem[b.outputItemId] || 0) + Number(b.outputQuantity || 0);
    });
    return Object.entries(producedByItem)
      .map(([itemId, produced]) => {
        const sold = productPerformance.find((p) => p.itemId === itemId)?.quantity || 0;
        return { itemId, produced, sold, surplus: produced - sold };
      })
      .filter((r) => r.produced > 0 && r.surplus > r.produced * 0.4 && r.surplus > 0)
      .sort((a, b) => b.surplus - a.surplus);
  }, [productionInRange, productPerformance]);

  // Realized margin: actual average sale price vs. cost price, using the
  // same pricing basis as the minimum-price feature — separate from list
  // price, this is what you're actually getting per unit in practice.
  const marginByProduct = useMemo(() => {
    return productPerformance
      .filter((p) => p.quantity > 0 && finishedGoodPricing?.[p.itemId]?.costPrice > 0)
      .map((p) => {
        const avgSalePrice = p.revenue / p.quantity;
        const costPrice = finishedGoodPricing[p.itemId].costPrice;
        const marginPercent = costPrice > 0 ? ((avgSalePrice - costPrice) / avgSalePrice) * 100 : 0;
        return { itemId: p.itemId, avgSalePrice, costPrice, marginPercent };
      })
      .sort((a, b) => a.marginPercent - b.marginPercent);
  }, [productPerformance, finishedGoodPricing]);

  // Customer concentration: how much of your revenue rides on a handful of
  // customers.
  const revenueByCustomer = useMemo(() => {
    const map = {};
    salesInRange.forEach((s) => {
      if (!s.customerId) return;
      map[s.customerId] = (map[s.customerId] || 0) + Number(s.cashAmount) + Number(s.creditAmount) - (Number(s.vatAmount) || 0);
    });
    returnsInRange.forEach((r) => {
      if (!r.customerId || !map[r.customerId]) return;
      map[r.customerId] -= Number(r.cashRefund) + Number(r.creditReduction) - (Number(r.vatAmount) || 0);
    });
    return Object.entries(map)
      .map(([customerId, revenue]) => ({ customerId, revenue }))
      .filter((r) => r.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [salesInRange, returnsInRange]);

  const totalCustomerRevenue = revenueByCustomer.reduce((s, r) => s + r.revenue, 0);
  const topCustomerShare = revenueByCustomer.slice(0, 3).reduce((s, r) => s + r.revenue, 0);
  const concentrationPercent = totalCustomerRevenue > 0 ? (topCustomerShare / totalCustomerRevenue) * 100 : 0;



  // Revenue grouped by the customer's address, as written. Addresses are
  // free text, so grouping is by exact (case-insensitive) match — "Dharan-5"
  // and "dharan 5" won't merge. The card is only as good as consistent
  // address entry, which is why it also shows how much revenue has no
  // address at all rather than silently dropping it.
  const { revenueByArea, revenueByCity } = useMemo(() => {
    const areaMap = {};
    const cityMap = {};
    revenueByCustomer.forEach(({ customerId, revenue }) => {
      const customer = activeCustomers.find((c) => c.id === customerId);
      const cityName = (customer?.city || "").trim();
      const areaName = (customer?.area || "").trim();
      // Customers added before city/area existed still count — fall back to
      // their free-text address so historical revenue isn't lumped into
      // "unrecorded" just because the fields are newer than the data.
      const fallback = (customer?.address || "").trim();
      const cityLabel = cityName || (fallback ? `${fallback} (no city set)` : "No location recorded");
      const areaLabel = areaName || fallback || (cityName ? `${cityName} — area not set` : "No location recorded");
      const areaKey = `${cityLabel.toLowerCase()}|${areaLabel.toLowerCase()}`;
      if (!areaMap[areaKey]) areaMap[areaKey] = { label: areaLabel, city: cityLabel, revenue: 0, customerCount: 0 };
      areaMap[areaKey].revenue += revenue;
      areaMap[areaKey].customerCount += 1;
      const cityKey = cityLabel.toLowerCase();
      if (!cityMap[cityKey]) cityMap[cityKey] = { label: cityLabel, revenue: 0, customerCount: 0 };
      cityMap[cityKey].revenue += revenue;
      cityMap[cityKey].customerCount += 1;
    });
    const sortDesc = (m) => Object.values(m).filter((x) => x.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    return { revenueByArea: sortDesc(areaMap), revenueByCity: sortDesc(cityMap) };
  }, [revenueByCustomer, activeCustomers]);

  // Going quiet: customers with an established ordering rhythm who have
  // gone noticeably longer than usual without a new order.
  // Returns marked as waste in this period: quantity and the cost written
  // off (quantity x the return's recorded unit cost). This is the spoilage
  // the shelf-life feature tries to prevent — worth watching as a number.
  const wastedReturns = useMemo(() => {
    const rows = returnsInRange.filter((r) => r.condition === "waste" && r.itemId && Number(r.quantity) > 0);
    const totalQty = rows.reduce((s, r) => s + Number(r.quantity), 0);
    const returnCost = rows.reduce((s, r) => s + Number(r.quantity) * (Number(r.unitCost) || 0), 0);

    // Stock written off directly (expired in store, damaged, samples),
    // valued at the same FIFO cost the Income Statement uses, so the two
    // figures always tell the same story.
    const tx = activeStockTx || [];
    let writeOffCost = 0;
    let writeOffQty = 0;
    let writeOffCount = 0;
    (activeStockItems || []).forEach((item) => {
      const forItem = tx
        .filter((t) => t.itemId === item.id)
        .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
      const batches = [];
      forItem.forEach((t) => {
        if (t.type === "in") {
          batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0 });
          return;
        }
        let toConsume = Number(t.quantity);
        let cost = 0;
        while (toConsume > 0 && batches.length > 0) {
          const b = batches[0];
          const used = Math.min(b.qty, toConsume);
          cost += used * b.unitCost;
          b.qty -= used;
          toConsume -= used;
          if (b.qty <= 0.0000001) batches.shift();
        }
        const isWriteOff = !t.saleId && !t.productionId && !t.purchaseReturnId;
        const inWindow = (!rangeStart || t.date >= rangeStart) && t.date <= rangeEnd;
        if (isWriteOff && inWindow) {
          writeOffCost += cost;
          writeOffQty += Number(t.quantity);
          writeOffCount += 1;
        }
      });
    });

    return {
      count: rows.length + writeOffCount,
      totalQty: totalQty + writeOffQty,
      totalCost: returnCost + writeOffCost,
      returnCost,
      writeOffCost,
    };
  }, [returnsInRange, activeStockTx, activeStockItems, rangeStart, rangeEnd]);

  const goingQuiet = useMemo(() => {
    const byCustomer = {};
    activeSales.forEach((s) => {
      if (!s.customerId || s.date > rangeEnd) return;
      if (!byCustomer[s.customerId]) byCustomer[s.customerId] = [];
      byCustomer[s.customerId].push(s.date);
    });
    const results = [];
    Object.entries(byCustomer).forEach(([customerId, dates]) => {
      const sorted = [...new Set(dates)].sort();
      if (sorted.length < 2) return;
      const gaps = [];
      for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i - 1], sorted[i]));
      const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const sinceLastOrder = daysBetween(sorted[sorted.length - 1], rangeEnd);
      if (avgGap >= 3 && sinceLastOrder > avgGap * 2 && sinceLastOrder > 14) {
        results.push({ customerId, avgGap: Math.round(avgGap), sinceLastOrder });
      }
    });
    return results.sort((a, b) => b.sinceLastOrder - a.sinceLastOrder).slice(0, 5);
  }, [activeSales, rangeEnd]);

  const customerName = (id) => activeCustomers.find((c) => c.id === id)?.name || "Unknown customer";

  // Rough weighted-average collection period, reusing the same FIFO-style
  // aging allocation as the Aging Report — bucket midpoints stand in for
  // exact per-day ages, which is precise enough for "roughly how long is
  // my money tied up" rather than a formal report.
  const avgCollectionDays = useMemo(() => {
    if (totalReceivable <= 0) return null;
    let weightedDays = 0;
    activeCustomers.forEach((c) => {
      const buckets = computeAgingBuckets(activeReceivables.filter((r) => r.customerId === c.id), rangeEnd);
      weightedDays += buckets.current * 15 + buckets.d31 * 45 + buckets.d61 * 75 + buckets.d90 * 105;
    });
    return Math.round(weightedDays / totalReceivable);
  }, [activeCustomers, activeReceivables, totalReceivable, rangeEnd]);

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid var(--accent-gold)", paddingLeft: 10 }}>
          Insights
        </h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Observations pulled from your own numbers — not just what happened, but what's worth noticing.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 items-center mb-6">
        {[
          { id: "30d", label: "Last 30 days" },
          { id: "90d", label: "Last 90 days" },
          { id: "all", label: "All time" },
          { id: "custom", label: "Custom range" },
        ].map((p) => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            style={{
              background: period === p.id ? "var(--ink)" : "var(--surface-2)",
              color: period === p.id ? "#fff" : "var(--ink)",
              padding: "6px 10px",
              fontSize: "0.75rem",
            }}
          >
            {p.label}
          </button>
        ))}
        {period === "custom" && (
          <div className="flex items-center gap-2" style={{ marginLeft: 6 }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
            <span style={{ fontSize: "0.78rem", opacity: 0.6 }}>to</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-forest)", padding: "18px", animationDelay: "0ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><TrendingUp size={16} color="var(--accent-forest)" /> Top sellers</p>
          {topSellers.length === 0 ? (
            <EmptyNote text="No sales in this period yet." />
          ) : (
            topSellers.map((p, i) => (
              <div
                key={p.itemId}
                className="flex justify-between drill-row"
                style={{ fontSize: "0.85rem", padding: "4px 0" }}
                onClick={() => onNavigate?.("stock")}
              >
                <span>{i + 1}. {itemName(p.itemId)}</span>
                <span className="mono-num" style={{ color: "var(--accent-forest)" }}>{formatNPR(p.revenue)}</span>
              </div>
            ))
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-red)", padding: "18px", animationDelay: "20ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><TrendingDown size={16} color="var(--accent-red)" /> Slow movers</p>
          {slowMovers.length === 0 ? (
            <EmptyNote text="Nothing sitting unsold right now — good sign." />
          ) : (
            slowMovers.map((r) => (
              <div
                key={r.item.id}
                className="flex justify-between drill-row"
                style={{ fontSize: "0.85rem", padding: "4px 0" }}
                onClick={() => onNavigate?.("stock")}
              >
                <span>{r.item.name}</span>
                <span className="mono-num" style={{ color: "var(--accent-red)" }}>
                  {r.onHand} {r.item.unit} on hand, 0 sold
                </span>
              </div>
            ))
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-brown)", padding: "18px", animationDelay: "40ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><Factory size={16} color="var(--accent-brown)" /> Producing more than selling</p>
          {overproduction.length === 0 ? (
            <EmptyNote text="Production is roughly keeping pace with sales." />
          ) : (
            overproduction.map((r) => (
              <div
                key={r.itemId}
                className="drill-row"
                style={{ fontSize: "0.85rem", padding: "4px 0" }}
                onClick={() => onNavigate?.("production")}
              >
                <div className="flex justify-between">
                  <span>{itemName(r.itemId)}</span>
                  <span className="mono-num" style={{ color: "var(--accent-brown)" }}>
                    +{r.surplus.toFixed(0)} {itemUnit(r.itemId)} surplus
                  </span>
                </div>
                <p style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                  Made {r.produced} {itemUnit(r.itemId)}, sold {r.sold} in this period
                </p>
              </div>
            ))
          )}
          {wastedReturns.count > 0 && (
            <p style={{ fontSize: "0.75rem", color: "var(--accent-red)", marginTop: 8, borderTop: "1px dashed rgba(var(--ink-rgb),0.2)", paddingTop: 6 }}>
              Wastage this period: <span className="mono-num">{wastedReturns.totalQty}</span> units across{" "}
              <span className="mono-num">{wastedReturns.count}</span> event{wastedReturns.count > 1 ? "s" : ""} —{" "}
              <span className="mono-num" style={{ fontWeight: 600 }}>{formatNPR(wastedReturns.totalCost)}</span> written off
              {wastedReturns.returnCost > 0 && wastedReturns.writeOffCost > 0 ? (
                <> ({formatNPR(wastedReturns.returnCost)} returned spoiled, {formatNPR(wastedReturns.writeOffCost)} expired in stock)</>
              ) : null}
              .
            </p>
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-blue)", padding: "18px", animationDelay: "60ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><Calculator size={16} color="var(--accent-blue)" /> Realized margin by product</p>
          {marginByProduct.length === 0 ? (
            <EmptyNote text="Need sales and a production batch on record to compare." />
          ) : (
            marginByProduct.slice(0, 5).map((m) => (
              <div
                key={m.itemId}
                className="flex justify-between drill-row"
                style={{ fontSize: "0.85rem", padding: "4px 0" }}
                onClick={() => onNavigate?.("stock")}
              >
                <span>{itemName(m.itemId)}</span>
                <span className="mono-num" style={{ color: m.marginPercent >= 0 ? "var(--accent-forest)" : "var(--accent-red)", fontWeight: 600 }}>
                  {m.marginPercent.toFixed(0)}%
                </span>
              </div>
            ))
          )}
          <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 6 }}>Lowest margin first — these are worth a second look.</p>
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-plum)", padding: "18px", animationDelay: "80ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><Users size={16} color="var(--accent-plum)" /> Top customers by sales</p>
          {revenueByCustomer.length === 0 ? (
            <EmptyNote text="No customer sales in this period yet." />
          ) : (
            <>
              {revenueByCustomer.slice(0, 5).map((r, i) => (
                <div
                  key={r.customerId}
                  className="flex justify-between drill-row"
                  style={{ fontSize: "0.82rem", padding: "3px 0" }}
                  onClick={() => onOpenStatement?.(r.customerId)}
                  title="Open account statement"
                >
                  <span>
                    {i + 1}. {customerName(r.customerId)}
                    {customerCodes?.[r.customerId] ? ` (${customerCodes[r.customerId]})` : ""}
                  </span>
                  <span className="mono-num" style={{ color: "var(--accent-plum)", fontWeight: 600 }}>{formatNPR(r.revenue)}</span>
                </div>
              ))}
              <p style={{ fontSize: "0.72rem", marginTop: 8, opacity: 0.7 }}>
                Top {Math.min(3, revenueByCustomer.length)} make up{" "}
                <span className="mono-num" style={{ fontWeight: 600, color: concentrationPercent > 50 ? "var(--accent-red)" : "var(--accent-forest)" }}>
                  {concentrationPercent.toFixed(0)}%
                </span>{" "}
                of revenue{concentrationPercent > 50 ? " — heavily concentrated" : ""}.
              </p>
            </>
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid #2F6B5E", padding: "18px", animationDelay: "100ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><MapPin size={16} color="#2F6B5E" /> Top selling locations</p>
          {revenueByArea.length === 0 ? (
            <EmptyNote text="No customer sales in this period yet." />
          ) : (
            <>
              {revenueByCity.length > 1 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 2 }}>By city</p>
                  {revenueByCity.slice(0, 4).map((ct) => (
                    <div key={ct.label} className="flex justify-between" style={{ fontSize: "0.85rem", padding: "3px 0", opacity: ct.label === "No location recorded" ? 0.55 : 1 }}>
                      <span>{ct.label}</span>
                      <span className="mono-num" style={{ color: "#2F6B5E", fontWeight: 600 }}>{formatNPR(ct.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
              <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 2 }}>By area</p>
              {revenueByArea.slice(0, 5).map((a) => (
                <div key={`${a.city}|${a.label}`} style={{ fontSize: "0.85rem", padding: "4px 0", opacity: a.label === "No location recorded" ? 0.55 : 1 }}>
                  <div className="flex justify-between">
                    <span>{a.label}</span>
                    <span className="mono-num" style={{ color: "#2F6B5E", fontWeight: 600 }}>{formatNPR(a.revenue)}</span>
                  </div>
                  <p style={{ fontSize: "0.72rem", opacity: 0.55 }}>
                    {revenueByCity.length > 1 && a.city !== a.label ? `${a.city} · ` : ""}
                    {a.customerCount} customer{a.customerCount > 1 ? "s" : ""}
                  </p>
                </div>
              ))}
              <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 6 }}>
                Set a customer's City and Area to have them counted here. The city roll-up appears once you're selling in more than one.
              </p>
            </>
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid #4A5568", padding: "18px", animationDelay: "120ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><Clock size={16} color="#4A5568" /> Customers going quiet</p>
          {goingQuiet.length === 0 ? (
            <EmptyNote text="No regulars have gone noticeably quiet — good sign." />
          ) : (
            goingQuiet.map((r) => (
              <div
                key={r.customerId}
                className="drill-row"
                style={{ fontSize: "0.85rem", padding: "4px 0" }}
                onClick={() => onOpenStatement?.(r.customerId)}
                title="Open account statement"
              >
                <div className="flex justify-between">
                  <span>{customerName(r.customerId)}</span>
                  <span className="mono-num" style={{ color: "var(--accent-red)" }}>{r.sinceLastOrder}d since last order</span>
                </div>
                <p style={{ fontSize: "0.72rem", opacity: 0.55 }}>Usually orders every ~{r.avgGap} days</p>
              </div>
            ))
          )}
        </div>

        <div data-card className="row-in" style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", borderTop: "3px solid var(--accent-gold)", padding: "18px", animationDelay: "140ms" }}>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }} className="mb-2 flex items-center gap-2"><Wallet size={16} color="var(--accent-gold)" /> Collections</p>
          {avgCollectionDays !== null && (
            <p className="drill-row" style={{ fontSize: "0.72rem", color: "var(--accent-blue)", padding: "2px 0", marginBottom: 2 }} onClick={() => onNavigate?.("customers")}>
              Open Customers to chase balances →
            </p>
          )}
          {avgCollectionDays === null ? (
            <EmptyNote text="No outstanding customer balances right now." />
          ) : (
            <p style={{ fontSize: "0.85rem" }}>
              Rs. {formatNPR(totalReceivable).replace("Rs. ", "")} outstanding, roughly{" "}
              <span className="mono-num" style={{ fontWeight: 600, color: avgCollectionDays > 45 ? "var(--accent-red)" : "var(--accent-forest)" }}>
                {avgCollectionDays} days
              </span>{" "}
              old on average.
            </p>
          )}
        </div>
      </div>

      <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 16 }}>
        All of this is computed live from your existing records — nothing here is tracked separately, so it's only
        as complete as the sales, production, and stock data already in the app.
      </p>
    </div>
  );
}

function TeamManagementView({ currentUserLabel, onListTeam, onUpdateRole }) {
  const [team, setTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (!onListTeam) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const members = await onListTeam();
        if (!cancelled) setTeam(members || []);
      } catch (err) {
        if (!cancelled) setError("Couldn't load the team list — try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onListTeam]);

  async function changeRole(member, newRole) {
    if (newRole === member.role) return;
    const superAdmins = (team || []).filter((m) => m.role === "super_admin");
    if (member.role === "super_admin" && newRole !== "super_admin" && superAdmins.length <= 1) {
      const ok = window.confirm(
        `${member.name || member.email} is currently the only Super Admin. Changing this leaves no one able to manage team roles unless you promote someone else first. Continue anyway?`
      );
      if (!ok) return;
    }
    setSavingId(member.id);
    setError("");
    try {
      await onUpdateRole(member.id, newRole);
      setTeam((prev) => prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m)));
    } catch (err) {
      setError("Couldn't update that role — try again.");
    } finally {
      setSavingId(null);
    }
  }

  if (!onListTeam) {
    return (
      <div>
        <div className="mb-4">
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #4A5568", paddingLeft: 10 }}>Team</h2>
          <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>Manage who has access and at what level.</p>
        </div>
        <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }} className="p-6">
          <EmptyNote text="Team management connects to your Supabase user accounts, so it's only available once this is deployed to your live site — not in this preview." />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #4A5568", paddingLeft: 10 }}>Team</h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Manage who has access and at what level. Only Super Admins can see this page.
        </p>
      </div>

      <div className="grid mb-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        {Object.entries(ROLE_LABELS).map(([key, label]) => (
          <div key={key} data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)", padding: "12px 16px" }}>
            <p style={{ fontSize: "0.85rem", fontWeight: 600 }}>{label}</p>
            <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>{ROLE_DESCRIPTIONS[key]}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="alert-in mb-4" style={{ background: "var(--alert-red-bg)", border: "1px solid var(--accent-red)", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem" }}>
          {error}
        </div>
      )}

      <div data-card style={{ background: "var(--card-bg)", border: "1px solid rgba(var(--ink-rgb),0.15)" }}>
        {loading ? (
          <div className="p-6">
            <EmptyNote text="Loading team…" />
          </div>
        ) : !team || team.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No team members found yet." />
          </div>
        ) : (
          team.map((m, i) => (
            <div
              key={m.id}
              className="ledger-rule row-in flex justify-between items-center px-4 py-3 flex-wrap gap-2"
              style={{ animationDelay: `${Math.min(i, 14) * 25}ms` }}
            >
              <div>
                <p style={{ fontSize: "0.9rem" }}>
                  {m.name || "Unnamed"}
                  {m.name === currentUserLabel && <span style={{ opacity: 0.5 }}> (you)</span>}
                </p>
                <p style={{ fontSize: "0.75rem", opacity: 0.55 }}>{m.email}</p>
              </div>
              <select
                value={m.role}
                disabled={savingId === m.id}
                onChange={(e) => changeRole(m, e.target.value)}
                style={{
                  border: "1px solid rgba(var(--ink-rgb),0.25)",
                  background: "var(--card-bg)",
                  padding: "6px 10px",
                  fontSize: "0.82rem",
                  opacity: savingId === m.id ? 0.5 : 1,
                }}
              >
                {Object.entries(ROLE_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}>
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return;
    setClosing(true);
    setTimeout(onClose, 170);
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center p-4 ${closing ? "modal-backdrop-out" : "modal-backdrop"}`}
      style={{ background: "rgba(20,17,14,0.55)", zIndex: 50, backdropFilter: "blur(2px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div
        className={closing ? "modal-panel-out" : "modal-panel"}
        style={{
          background: "var(--page-bg)",
          border: "1px solid rgba(var(--ink-rgb),0.15)",
          borderRadius: 12,
          boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(20,17,14,0.32), 0 12px 24px rgba(20,17,14,0.18), 0 4px 8px rgba(20,17,14,0.1)",
          width: "100%",
          maxWidth: 420,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex justify-between items-center px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>{title}</h3>
          <button onClick={requestClose} style={{ opacity: 0.6 }}>
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pb-5" style={{ overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  border: "1px solid rgba(var(--ink-rgb),0.25)",
  background: "var(--card-bg)",
  color: "var(--ink)",
  padding: "8px 10px",
  fontSize: "0.9rem",
};

const readOnlyInputStyle = {
  ...inputStyle,
  background: "var(--surface-2)",
  opacity: 0.7,
  cursor: "not-allowed",
};

const saveBtnStyle = {
  width: "100%",
  background: "linear-gradient(180deg, #3A342E 0%, var(--ink-surface) 55%, #221D19 100%)",
  color: "var(--on-dark)",
  padding: "11px",
  fontSize: "0.9rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  marginTop: "6px",
  textShadow: "0 1px 1px rgba(0,0,0,0.3)",
};


export default function App() {
  const { user, profile, loading, signOut, listTeam, updateRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F1E4" }}>
        <p style={{ fontFamily: "Georgia, serif", color: "#2B2621" }}>Loading…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <TrikutLedger
      role={profile?.role || "staff"}
      userLabel={profile?.name || user.email}
      onLogout={signOut}
      onListTeam={listTeam}
      onUpdateRole={updateRole}
    />
  );
}
