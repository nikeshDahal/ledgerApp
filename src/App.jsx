import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Users, X, Search, Trash2, Printer, MessageCircle, Pencil, FileText, LayoutDashboard, Receipt, ClipboardList, ShoppingCart, Truck, Package, Factory, Calculator, Download } from "lucide-react";
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

function computeIncomeStatement({ sales, saleReturns, transactions, stockItems, stockTx, startDate, endDate }) {
  const inRange = (date) => (!startDate || date >= startDate) && (!endDate || date <= endDate);

  const salesRevenue = sales.filter((s) => inRange(s.date)).reduce((sum, s) => sum + Number(s.cashAmount) + Number(s.creditAmount), 0);
  const salesReturnsTotal = saleReturns
    .filter((r) => inRange(r.date))
    .reduce((sum, r) => sum + Number(r.cashRefund) + Number(r.creditReduction), 0);
  const netSalesRevenue = salesRevenue - salesReturnsTotal;

  const otherIncomeByCategory = {};
  transactions
    .filter((t) => t.type === "income" && !t.saleId && t.category !== "Partner Capital Contribution" && inRange(t.date))
    .forEach((t) => {
      otherIncomeByCategory[t.category] = (otherIncomeByCategory[t.category] || 0) + Number(t.amount);
    });
  const otherIncome = Object.values(otherIncomeByCategory).reduce((s, v) => s + v, 0);
  const totalRevenue = netSalesRevenue + otherIncome;

  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");
  let cogs = 0;
  finishedGoods.forEach((item) => {
    const txForItem = stockTx
      .filter((t) => t.itemId === item.id)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
    const batches = [];
    txForItem.forEach((t) => {
      if (t.type === "in") {
        batches.push({ qty: Number(t.quantity), unitCost: Number(t.unitCost) || 0 });
        if (t.returnId && inRange(t.date)) {
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
          cogs += costConsumed;
        }
      }
    });
  });

  const grossProfit = totalRevenue - cogs;

  const opExByCategory = {};
  transactions
    .filter((t) => t.type === "expense" && !t.purchaseId && !t.productionId && !t.saleId && !t.returnId && !t.fixedAssetId && inRange(t.date))
    .forEach((t) => {
      opExByCategory[t.category] = (opExByCategory[t.category] || 0) + Number(t.amount);
    });
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

function TrikutLedger({ role = "partner", userLabel, onLogout } = {}) {
  const actor = userLabel || "You";
  const [transactions, setTransactions] = useState([]);
  const [capitalEntries, setCapitalEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [receivables, setReceivables] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [stockTx, setStockTx] = useState([]);
  const [sales, setSales] = useState([]);
  const [saleReturns, setSaleReturns] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payables, setPayables] = useState([]);
  const [productionBatches, setProductionBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("dashboard");
  const [showTxForm, setShowTxForm] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [showCapForm, setShowCapForm] = useState(false);
  const [editingCap, setEditingCap] = useState(null);
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
  const [billEntry, setBillEntry] = useState(null); // { kind: 'sale'|'return', entry }
  const [statementTarget, setStatementTarget] = useState(null); // { type: 'customer'|'supplier', id } or null
  const [showDailyReport, setShowDailyReport] = useState(false);
  const [ownership, setOwnership] = useState(null); // { Pritam: 33.34, Ashish: 33.33, Kapil: 33.33 } or null until loaded
  const [fixedAssets, setFixedAssets] = useState([]);
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

  function upsertCustomer(entry) {
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

  function upsertSale(entry) {
    const saleId = entry.id || uid();
    const { date, customerId, itemId, quantity, cashAmount, method, creditAmount, partner, note, orderId } = entry;

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
    if (itemId && quantity > 0) {
      newStockTx = [
        ...newStockTx,
        stampCreate(
          { id: uid(), saleId, itemId, date, type: "out", quantity, note: note ? `Sold — ${note}` : "Sold" },
          actor
        ),
      ];
    }

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
    if (itemId && quantity > 0) {
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

    let totalInputCost = 0;
    const newBatchStockTx = [];
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

    const totalCost = totalInputCost + (Number(laborCost) || 0) + (Number(overheadCost) || 0);
    const outputQty = Number(outputQuantity) || 0;
    const outputUnitCost = outputQty > 0 ? totalCost / outputQty : 0;
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
            category: "Other",
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
      ? productionBatches.map((b) => (b.id === batchId ? stampUpdate({ ...b, ...entry, id: batchId, totalCost, outputUnitCost }, actor) : b))
      : [stampCreate({ ...entry, id: batchId, totalCost, outputUnitCost }, actor), ...productionBatches];

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
    const { date, supplierId, itemId, quantity, category, cashAmount, method, creditAmount, partner, note } = entry;
    const totalAmount = cashAmount + creditAmount;
    const unitCost = quantity > 0 ? totalAmount / quantity : 0;

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
    if (itemId && quantity > 0) {
      newStockTx = [
        ...newStockTx,
        stampCreate(
          {
            id: uid(),
            purchaseId,
            itemId,
            date,
            type: "in",
            quantity,
            unitCost,
            note: note ? `Purchased — ${note}` : "Purchased",
          },
          actor
        ),
      ];
    }

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

  const activeTransactions = useMemo(() => transactions.filter(notDeleted), [transactions]);
  const activeCapitalEntries = useMemo(() => capitalEntries.filter(notDeleted), [capitalEntries]);
  const activeCustomers = useMemo(() => customers.filter(notDeleted), [customers]);
  const activeReceivables = useMemo(() => receivables.filter(notDeleted), [receivables]);
  const activeStockItems = useMemo(() => stockItems.filter(notDeleted), [stockItems]);
  const activeStockTx = useMemo(() => stockTx.filter(notDeleted), [stockTx]);
  const activeSales = useMemo(() => sales.filter(notDeleted), [sales]);
  const activeSaleReturns = useMemo(() => saleReturns.filter(notDeleted), [saleReturns]);
  const activeSuppliers = useMemo(() => suppliers.filter(notDeleted), [suppliers]);
  const activePayables = useMemo(() => payables.filter(notDeleted), [payables]);
  const activeProductionBatches = useMemo(() => productionBatches.filter(notDeleted), [productionBatches]);
  const activePurchases = useMemo(() => purchases.filter(notDeleted), [purchases]);
  const activeOrders = useMemo(() => orders.filter(notDeleted), [orders]);
  const activeFixedAssets = useMemo(() => fixedAssets.filter(notDeleted), [fixedAssets]);

  const customerCodes = useMemo(() => buildCodeMap(customers, "CUST"), [customers]);
  const supplierCodes = useMemo(() => buildCodeMap(suppliers, "SUPP"), [suppliers]);
  const orderCodes = useMemo(() => buildCodeMap(orders, "ORD"), [orders]);

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    activeTransactions.forEach((t) => {
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

  const totalReceivable = useMemo(() => {
    return Object.values(customerBalances).reduce((s, b) => s + (b.charged - b.paid), 0);
  }, [customerBalances]);

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
    const byDay = {};
    activeTransactions.forEach((t) => {
      if (!byDay[t.date]) byDay[t.date] = { date: t.date, profit: 0 };
      byDay[t.date].profit += t.type === "income" ? Number(t.amount) : -Number(t.amount);
    });
    return Object.values(byDay)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
  }, [activeTransactions]);

  const todaysProfit = useMemo(() => {
    const today = todayISO();
    return activeTransactions
      .filter((t) => t.date === today)
      .reduce((sum, t) => sum + (t.type === "income" ? Number(t.amount) : -Number(t.amount)), 0);
  }, [activeTransactions]);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F6F1E4" }}>
        <p style={{ fontFamily: "Georgia, serif", color: "#2B2621" }}>Opening the ledger…</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#F6F1E4",
        backgroundImage:
          "radial-gradient(rgba(43,38,33,0.035) 1px, transparent 1px), radial-gradient(rgba(43,38,33,0.025) 1px, transparent 1px)",
        backgroundSize: "3px 3px, 7px 7px",
        backgroundPosition: "0 0, 2px 3px",
        color: "#2B2621",
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <style>{`
        .ledger-rule { border-bottom: 1px solid rgba(43,38,33,0.15); transition: background-color 150ms ease; }
        .double-underline { border-bottom: 3px double #2B2621; }
        .mono-num { font-variant-numeric: tabular-nums; font-family: 'Courier New', monospace; }
        .margin-rule { border-left: 3px solid #A63D40; }

        /* Base surfaces — layered shadows simulate a light source from above,
           giving cards real lift off the page rather than a flat cutout. */
        .card-surface {
          background: linear-gradient(180deg, #FFFEFC 0%, #FFFDF8 100%);
          border: 1px solid rgba(43,38,33,0.1);
          border-radius: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.7),
            0 1px 2px rgba(43,38,33,0.05),
            0 6px 16px rgba(43,38,33,0.08);
          transition: transform 200ms ease, box-shadow 200ms ease, border-color 200ms ease;
        }
        .card-surface:hover {
          transform: translateY(-3px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.8),
            0 2px 4px rgba(43,38,33,0.07),
            0 16px 28px rgba(43,38,33,0.13);
          border-color: rgba(43,38,33,0.16);
        }

        [data-card] {
          border-radius: 10px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.6),
            0 1px 2px rgba(43,38,33,0.05),
            0 4px 12px rgba(43,38,33,0.07);
          transition: box-shadow 200ms ease, border-color 200ms ease;
        }

        /* Buttons — a subtle bevel (light top edge, shadow beneath) so they
           read as physical, pressable surfaces rather than flat labels. */
        button {
          border-radius: 6px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 2px rgba(43,38,33,0.12), 0 2px 5px rgba(43,38,33,0.08);
          transition: transform 120ms ease, box-shadow 150ms ease, filter 150ms ease, background-color 150ms ease, opacity 150ms ease;
        }
        button:hover:not(:disabled) {
          filter: brightness(1.06);
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 4px rgba(43,38,33,0.15), 0 5px 12px rgba(43,38,33,0.12);
        }
        button:active:not(:disabled) {
          transform: translateY(1px) scale(0.97);
          box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
        }
        button:disabled { cursor: not-allowed; box-shadow: none; }
        button:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px #FFFDF8, 0 0 0 4px #C08A2E;
        }

        /* Inputs */
        input, select {
          outline: none;
          border-radius: 6px;
          transition: box-shadow 150ms ease, border-color 150ms ease;
        }
        input:focus, select:focus { box-shadow: 0 0 0 3px rgba(192,138,46,0.28); border-color: #C08A2E; }

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
          background: #C08A2E;
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
        @keyframes modalIn {
          from { opacity: 0; transform: translateY(10px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-backdrop { animation: backdropIn 180ms ease; }
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

        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.001ms !important; transition-duration: 0.001ms !important; }
        }

        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <header
        className="margin-rule"
        style={{
          background: "linear-gradient(180deg, #332F2B 0%, #2B2621 60%, #251F1B 100%)",
          color: "#F6F1E4",
          boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {userLabel && (
          <div className="max-w-5xl mx-auto px-6 pt-3 flex items-center justify-between" style={{ fontSize: "0.72rem", opacity: 0.7 }}>
            <span>
              {getGreeting()}, {getFirstName(userLabel)} · {role === "partner" ? "Administrator Account" : "Staff Account"}
            </span>
            {onLogout && (
              <button onClick={onLogout} className="underline">
                Log out
              </button>
            )}
          </div>
        )}
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 60 40" width="34" height="24" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
              <polygon points="4,36 19,9 34,36" fill="#C08A2E" opacity="0.85" />
              <polygon points="19,36 34,6 49,36" fill="#F6F1E4" opacity="0.9" />
              <polygon points="34,36 49,13 58,36" fill="#C08A2E" opacity="0.7" />
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
          {role === "partner" && (
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
        <nav
          className="max-w-5xl mx-auto px-6 flex gap-1 nav-scroll"
          style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}
        >
          {[
            { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
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
          ]
            .filter((t) => !t.partnerOnly || role === "partner")
            .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`nav-tab${tab === t.id ? " active" : ""}`}
              style={{
                padding: "10px 16px",
                fontSize: "0.85rem",
                letterSpacing: "0.03em",
                whiteSpace: "nowrap",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: tab === t.id ? "#F6F1E4" : "rgba(246,241,228,0.6)",
                fontWeight: tab === t.id ? 600 : 400,
              }}
            >
              <t.icon size={14} />
              {t.label}
              <span className="nav-underline" />
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div className="alert-in" style={{ background: "#F3E2E2", border: "1px solid #A63D40", borderRadius: 8, padding: "8px 12px", fontSize: "0.85rem" }}>
            {error}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div key={tab} className="tab-content">
        {tab === "dashboard" && (
          <Dashboard
            role={role}
            totals={totals}
            chartData={chartData}
            categoryBreakdown={categoryBreakdown}
            recent={transactions.slice(0, 6)}
            totalReceivable={totalReceivable}
            totalInventoryValue={totalInventoryValue}
            lowStockItems={lowStockItems}
            stockFIFO={stockFIFO}
            totalPayable={totalPayable}
            openOrdersCount={openOrdersCount}
            dailySalesData={dailySalesData}
            todaysSales={todaysSales}
            dailyProfitData={dailyProfitData}
            todaysProfit={todaysProfit}
            onOpenDailyReport={() => setShowDailyReport(true)}
          />
        )}

        {tab === "search" && (
          <SearchView
            role={role}
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
            role={role}
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
          />
        )}

        {tab === "capital" && role === "partner" && (
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

        {tab === "accounting" && role === "partner" && (
          <AccountingView
            activeSales={activeSales}
            activeSaleReturns={activeSaleReturns}
            activeTransactions={activeTransactions}
            activeStockItems={activeStockItems}
            activeStockTx={activeStockTx}
            totals={totals}
            totalReceivable={totalReceivable}
            totalPayable={totalPayable}
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

        {tab === "backup" && role === "partner" && (
          <div className="space-y-10">
            <BackupView
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
              orders={orders}
              fixedAssets={fixedAssets}
            />

            <div style={{ borderTop: "1px solid rgba(43,38,33,0.15)", paddingTop: 32 }}>
              <TrashView
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
                orders={orders}
                fixedAssets={fixedAssets}
                onRestoreTransaction={restoreTransaction}
                onRestoreCapitalEntry={restoreCapitalEntry}
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
                onRestoreOrder={restoreOrder}
                onRestoreFixedAsset={restoreFixedAsset}
              />
            </div>
          </div>
        )}

        {tab === "customers" && (
          <CustomersView
            role={role}
            customers={activeCustomers}
            customerCodes={customerCodes}
            receivables={activeReceivables}
            customerBalances={customerBalances}
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

        {tab === "orders" && role === "partner" && (
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
            role={role}
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
            role={role}
            stockItems={activeStockItems}
            stockTx={activeStockTx}
            stockFIFO={stockFIFO}
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
            role={role}
            suppliers={activeSuppliers}
            supplierCodes={supplierCodes}
            payables={activePayables}
            supplierBalances={supplierBalances}
            purchases={activePurchases}
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
            onOpenStatement={(id) => setStatementTarget({ type: "supplier", id })}
          />
        )}

        {tab === "production" && (
          <ProductionView
            role={role}
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

      {showTxForm && (
        <TransactionForm
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
          stockFIFO={stockFIFO}
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
          stockFIFO={stockFIFO}
          editEntry={editingReturn}
          actor={actor}
          onSave={upsertReturn}
          onClose={() => {
            setShowReturnForm(false);
            setEditingReturn(null);
          }}
        />
      )}
      {billEntry && (
        <InvoiceModal
          billEntry={billEntry}
          customers={customers}
          customerCodes={customerCodes}
          stockItems={stockItems}
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

function Card({ label, value, tone }) {
  const colors = {
    gold: "#C08A2E",
    green: "#3F5D42",
    red: "#A63D40",
    ink: "#2B2621",
  };
  const animated = useCountUp(Number(value) || 0);
  return (
    <div key={value} className="card-surface card-pop" style={{ padding: "16px 18px" }}>
      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</p>
      <p className="mono-num" style={{ fontSize: "1.15rem", marginTop: 4, color: colors[tone] || colors.ink }}>
        {formatNPR(animated)}
      </p>
    </div>
  );
}

function Dashboard({ role, totals, chartData, categoryBreakdown, recent, totalReceivable, totalInventoryValue, lowStockItems, stockFIFO, totalPayable, openOrdersCount, dailySalesData, todaysSales, dailyProfitData, todaysProfit, onOpenDailyReport }) {
  if (role !== "partner") {
    return (
      <div>
        <Card label="Today's Sales" value={todaysSales} tone="gold" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex justify-end">
        <button
          onClick={onOpenDailyReport}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <FileText size={15} /> Print Daily Report
        </button>
      </div>

      <div>
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-2">
          Funds on hand
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Card label="Cash in Hand" value={totals.byMethod.cash} tone="gold" />
          <Card label="Bank" value={totals.byMethod.bank} tone="gold" />
          <Card label="eSewa" value={totals.byMethod.esewa} tone="gold" />
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-8 gap-3">
        <Card label="Today's Sales" value={todaysSales} tone="gold" />
        <Card label="Today's Profit" value={todaysProfit} tone={todaysProfit >= 0 ? "green" : "red"} />
        <Card label="Total Income" value={totals.income} tone="green" />
        <Card label="Total Expenses" value={totals.expense} tone="red" />
        <Card label="Net Position" value={totals.net} tone={totals.net >= 0 ? "green" : "red"} />
        <Card label="Owed by Customers" value={totalReceivable} tone="red" />
        <Card label="Owed to Suppliers" value={totalPayable} tone="red" />
        <Card label="Stock on Hand (FIFO)" value={totalInventoryValue} tone="green" />
      </div>

      {openOrdersCount > 0 && (
        <p style={{ fontSize: "0.8rem", color: "#2B2621", opacity: 0.75 }}>
          📋 <span style={{ fontWeight: 600 }}>{openOrdersCount}</span> open order{openOrdersCount > 1 ? "s" : ""} —
          check the Orders tab for the production plan.
        </p>
      )}

      {lowStockItems.length > 0 && (
        <div className="alert-in" style={{ background: "#F3E2E2", border: "1px solid #A63D40", borderRadius: 8, padding: "14px 16px" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#A63D40", marginBottom: 6 }}>
            <span className="pulse-attention">⚠</span> Low stock — {lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} need reordering
          </p>
          <div className="flex flex-wrap gap-2">
            {lowStockItems.map((i) => (
              <span key={i.id} style={{ fontSize: "0.78rem", background: "#fff", padding: "3px 8px", border: "1px solid rgba(166,61,64,0.3)" }}>
                {i.name}: <span className="mono-num">{stockFIFO[i.id]?.currentQty || 0}</span> {i.unit} left
              </span>
            ))}
          </div>
        </div>
      )}

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Monthly cash flow
        </h2>
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
          {chartData.length === 0 ? (
            <EmptyNote text="No transactions yet. Add your first entry to see cash flow here." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(43,38,33,0.1)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#2B2621" }} />
                <YAxis tick={{ fontSize: 11, fill: "#2B2621" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="#3F5D42" strokeWidth={2} dot={false} name="Income" />
                <Line type="monotone" dataKey="expense" stroke="#A63D40" strokeWidth={2} dot={false} name="Expense" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Daily sales (last 14 days)
        </h2>
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
          {dailySalesData.length === 0 ? (
            <EmptyNote text="No sales yet. Record a sale to see daily performance here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailySalesData}>
                <CartesianGrid stroke="rgba(43,38,33,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#2B2621" }}
                  tickFormatter={(d) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#2B2621" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" fill="#C08A2E" name="Sales" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section>
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
          Daily profit (last 14 days)
        </h2>
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
          {dailyProfitData.length === 0 ? (
            <EmptyNote text="No transactions yet. Daily profit (income minus expenses) will show here." />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dailyProfitData}>
                <CartesianGrid stroke="rgba(43,38,33,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#2B2621" }}
                  tickFormatter={(d) => d.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#2B2621" }} tickFormatter={(v) => `Rs. ${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="profit" name="Profit" radius={[2, 2, 0, 0]}>
                  {dailyProfitData.map((d, i) => (
                    <Cell key={i} fill={d.profit >= 0 ? "#3F5D42" : "#A63D40"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
            Expense by category
          </h2>
          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
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
                      <div style={{ background: "rgba(43,38,33,0.08)", height: 6 }}>
                        <div style={{ background: "#C08A2E", height: 6, width: `${(c.amount / max) * 100}%` }} />
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
          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                    style={{ color: t.type === "income" ? "#3F5D42" : "#A63D40" }}
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
  return !!(e.saleId || e.returnId || e.purchaseId || e.productionId || e.fixedAssetId);
}

function EmptyNote({ text }) {
  return <p style={{ fontSize: "0.85rem", opacity: 0.55, fontStyle: "italic" }}>{text}</p>;
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
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 items-center justify-between mb-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search size={14} style={{ position: "absolute", left: 8, top: 9, opacity: 0.5 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notes/category"
              style={{
                border: "1px solid rgba(43,38,33,0.25)",
                background: "#FFFDF8",
                padding: "6px 10px 6px 28px",
                fontSize: "0.85rem",
              }}
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ border: "1px solid rgba(43,38,33,0.25)", background: "#FFFDF8", padding: "6px 10px", fontSize: "0.85rem" }}
          >
            <option value="all">All types</option>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <select
            value={filterPartner}
            onChange={(e) => setFilterPartner(e.target.value)}
            style={{ border: "1px solid rgba(43,38,33,0.25)", background: "#FFFDF8", padding: "6px 10px", fontSize: "0.85rem" }}
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
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add entry
        </button>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
              <span style={{ fontSize: "0.78rem", color: t.type === "income" ? "#3F5D42" : "#A63D40" }}>
                {t.type === "income" ? "Income" : "Expense"}
              </span>
              <span className="mono-num" style={{ textAlign: "right", color: t.type === "income" ? "#3F5D42" : "#A63D40" }}>
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

function TransactionForm({ editEntry, actor, onSave, onClose }) {
  const [type, setType] = useState(editEntry?.type || "expense");
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [category, setCategory] = useState(editEntry?.category || EXPENSE_CATEGORIES[0]);
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [amount, setAmount] = useState(editEntry?.amount ? String(editEntry.amount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [note, setNote] = useState(editEntry?.note || "");

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleTypeChange(newType) {
    setType(newType);
    setCategory(newType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
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
              background: type === t ? (t === "income" ? "#3F5D42" : "#A63D40") : "#F0EBDD",
              color: type === t ? "#F6F1E4" : "#2B2621",
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
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "18px" }} className="mb-6">
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-1">
          Business Net Worth
        </p>
        <p className="mono-num" style={{ fontSize: "1.6rem", color: businessNetWorth >= 0 ? "#3F5D42" : "#A63D40" }}>
          {formatNPR(businessNetWorth)}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3" style={{ fontSize: "0.78rem" }}>
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

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "18px" }} className="mb-6">
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
                    style={{ width: 64, border: "1px solid rgba(43,38,33,0.25)", background: "#FFFDF8", padding: "4px 6px", fontSize: "0.8rem", textAlign: "right" }}
                  />
                  <span style={{ opacity: 0.6 }}>% owned</span>
                </div>
                <span style={{ opacity: 0.5, fontSize: "0.75rem" }}>
                  (contributed {contributionPct.toFixed(1)}% of capital)
                </span>
                <span className="mono-num" style={{ fontWeight: 600, color: equityValue >= 0 ? "#3F5D42" : "#A63D40" }}>
                  {formatNPR(equityValue)}
                </span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: "0.72rem", marginTop: 10, color: Math.abs(ownershipSum - 100) > 0.01 ? "#A63D40" : "#3F5D42" }}>
          Ownership totals {ownershipSum.toFixed(2)}%{Math.abs(ownershipSum - 100) > 0.01 ? " — should add up to 100%" : " ✓"}
        </p>
        <p style={{ fontSize: "0.7rem", opacity: 0.5, marginTop: 6 }}>
          Ownership % is set by your partnership agreement, not calculated automatically — the "contributed" figure
          alongside each one is just for reference, in case actual cash put in differs from agreed shares.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {PARTNERS.map((p) => {
          const bal = partnerBalances[p];
          const net = bal.contributed - bal.withdrawn;
          return (
            <div key={p} data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Capital entries</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add capital entry
        </button>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                  style={{ color: c.type === "contribution" ? "#3F5D42" : "#A63D40" }}
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
              background: type === t ? (t === "contribution" ? "#3F5D42" : "#A63D40") : "#F0EBDD",
              color: type === t ? "#F6F1E4" : "#2B2621",
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #3A5A78", paddingLeft: 10 }}>Customers & receivables</h2>
        <button
          onClick={onAddCustomer}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
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
              <div key={c.id} data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
                <div
                  className="flex justify-between items-center px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                >
                  <div>
                    <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
                      {c.name}
                      {c.location && <span style={{ fontSize: "0.75rem", marginLeft: 6 }}>📍</span>}
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
                      <p className="mono-num" style={{ color: owed > 0 ? "#A63D40" : "#3F5D42", fontSize: "1.05rem" }}>
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
                            style={{ border: "1px solid rgba(43,38,33,0.15)" }}
                            loading="lazy"
                          />
                        )}
                        <a
                          href={mapsSearchLink(c.location)}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: "0.78rem", color: "#3A5A78", display: "inline-block", marginTop: 6 }}
                        >
                          📍 Open in Google Maps
                        </a>
                      </div>
                    )}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => onAddReceivable(c.id)}
                        style={{ background: "#A63D40", color: "#F6F1E4", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        + New sale on credit
                      </button>
                      {role === "partner" && (
                        <button
                          onClick={() => onDeleteCustomer(c.id)}
                          style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
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
                              style={{ color: r.type === "charge" ? "#A63D40" : "#3F5D42" }}
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

function CustomerForm({ editEntry, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [proprietorName, setProprietorName] = useState(editEntry?.proprietorName || "");
  const [phone, setPhone] = useState(editEntry?.phone || "");
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

  function submit() {
    if (!name.trim()) return;
    onSave({ ...(editEntry || {}), name: name.trim(), proprietorName: proprietorName.trim(), phone, address, location: location.trim(), note });
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
      <Field label="Address (optional)">
        <input value={address} onChange={(e) => setAddress(e.target.value)} style={inputStyle} placeholder="e.g. Dharan-8" />
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
            style={{ background: "#F0EBDD", padding: "8px 10px", fontSize: "0.78rem", whiteSpace: "nowrap" }}
          >
            {locating ? "Locating…" : "📍 Use current"}
          </button>
        </div>
        {locError && <p style={{ fontSize: "0.72rem", color: "#A63D40", marginTop: 4 }}>{locError}</p>}
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
              background: type === t ? (t === "charge" ? "#A63D40" : "#3F5D42") : "#F0EBDD",
              color: type === t ? "#F6F1E4" : "#2B2621",
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

function StockView({ role, stockItems, stockTx, stockFIFO, onAddItem, onEditItem, onDeleteItem, onStockIn, onStockOut, onEditTx, onDeleteTx }) {
  const [expanded, setExpanded] = useState(null);

  const rawMaterials = stockItems.filter((i) => i.category === "Raw Material");
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");

  const columnValue = (items) => items.reduce((s, i) => s + (stockFIFO[i.id]?.currentValue || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #C08A2E", paddingLeft: 10 }}>Stock (FIFO valued)</h2>
        <button
          onClick={onAddItem}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add stock item
        </button>
      </div>

      {stockItems.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No stock items yet. Add raw materials (potatoes, oil, seasoning, packaging) or finished goods (chips packets) to track quantity and FIFO cost." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <StockColumn
            role={role}
            title="Raw Materials"
            items={rawMaterials}
            totalValue={columnValue(rawMaterials)}
            stockFIFO={stockFIFO}
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
            stockFIFO={stockFIFO}
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

function StockColumn({ role, title, items, totalValue, stockFIFO, stockTx, expanded, setExpanded, onStockIn, onStockOut, onEditItem, onDeleteItem, onEditTx, onDeleteTx }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2 px-1">
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem" }}>{title}</h3>
        <span className="mono-num" style={{ fontSize: "0.8rem", color: "#C08A2E" }}>
          {formatNPR(totalValue)}
        </span>
      </div>
      {items.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
          <EmptyNote text={`No ${title.toLowerCase()} yet.`} />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <StockItemCard
              key={item.id}
              item={item}
              fifo={stockFIFO[item.id] || { batches: [], currentQty: 0, currentValue: 0, avgCost: 0, shortfall: 0 }}
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

function StockItemCard({ role, item, fifo, stockTx, isOpen, onToggle, onStockIn, onStockOut, onEditItem, onDeleteItem, onEditTx, onDeleteTx }) {
  const movesSorted = stockTx
    .filter((t) => t.itemId === item.id)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
  const isLow = item.reorderLevel > 0 && fifo.currentQty <= item.reorderLevel;

  return (
    <div style={{ background: "#FFFDF8", border: isLow ? "1px solid #A63D40" : "1px solid rgba(43,38,33,0.15)" }}>
      <div className="flex justify-between items-center px-4 py-3 cursor-pointer" onClick={onToggle}>
        <div>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
            {item.name}
            {isLow && (
              <span style={{ fontSize: "0.65rem", background: "#A63D40", color: "#fff", padding: "1px 6px", marginLeft: 6 }}>
                LOW STOCK
              </span>
            )}
          </p>
          <p className="mono-num" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            {fifo.currentQty} {item.unit} on hand
          </p>
        </div>
        <div className="text-right">
          <p className="mono-num" style={{ fontSize: "0.95rem", color: "#C08A2E" }}>
            {formatNPR(fifo.currentValue)}
          </p>
          <p style={{ fontSize: "0.66rem", opacity: 0.55 }}>avg {formatNPR(fifo.avgCost)}/{item.unit}</p>
        </div>
      </div>

      {isOpen && (
        <div className="ledger-rule px-4 pb-4">
          {fifo.shortfall > 0 && (
            <p style={{ fontSize: "0.75rem", color: "#A63D40", marginBottom: 8 }}>
              ⚠ {fifo.shortfall} {item.unit} were removed with no matching stock-in — recorded quantities may be off.
            </p>
          )}
          <div className="flex gap-2 mb-3 flex-wrap">
            <button
              onClick={() => onStockIn(item.id)}
              style={{ background: "#3F5D42", color: "#F6F1E4", padding: "6px 12px", fontSize: "0.78rem" }}
            >
              + Stock in
            </button>
            <button
              onClick={() => onStockOut(item.id)}
              style={{ background: "#A63D40", color: "#F6F1E4", padding: "6px 12px", fontSize: "0.78rem" }}
            >
              − Stock out
            </button>
            {role === "partner" && (
              <>
                <button
                  onClick={() => onEditItem(item)}
                  style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
                >
                  Edit item
                </button>
                <button
                  onClick={() => onDeleteItem(item.id)}
                  style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
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
                    <span className="mono-num" style={{ color: t.type === "in" ? "#3F5D42" : "#A63D40" }}>
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

function StockItemForm({ editEntry, onSave, onClose }) {
  const [name, setName] = useState(editEntry?.name || "");
  const [category, setCategory] = useState(editEntry?.category || "Raw Material");
  const [unit, setUnit] = useState(editEntry?.unit || "kg");
  const [reorderLevel, setReorderLevel] = useState(editEntry?.reorderLevel ? String(editEntry.reorderLevel) : "");

  function submit() {
    if (!name.trim()) return;
    onSave({ ...(editEntry || {}), name: name.trim(), category, unit: unit.trim() || "unit", reorderLevel: Number(reorderLevel) || 0 });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit stock item" : "Add stock item"}>
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
      note,
    });
  }

  const exceedsStock = type === "out" && Number(quantity) > available;

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
        <p style={{ fontSize: "0.75rem", opacity: 0.6, marginBottom: 8 }}>
          Available: {available} {item ? item.unit : ""}. Cost is pulled automatically from the oldest batches (FIFO).
        </p>
      )}
      {exceedsStock && (
        <p style={{ fontSize: "0.75rem", color: "#A63D40", marginBottom: 8 }}>
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #3F5D42", paddingLeft: 10 }}>Sales & returns</h2>
        <div className="flex gap-2">
          <button
            onClick={onAddSale}
            className="flex items-center gap-1"
            style={{ background: "#3F5D42", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record sale
          </button>
          <button
            onClick={onAddReturn}
            className="flex items-center gap-1"
            style={{ background: "#A63D40", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
          >
            <Plus size={15} /> Record return
          </button>
        </div>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                      color: isSale ? "#3F5D42" : "#A63D40",
                    }}
                  >
                    {isSale ? "Sale" : "Return"}
                  </span>
                  {itemName(entry.itemId) && `${itemName(entry.itemId)}${entry.quantity ? ` × ${entry.quantity}` : ""}`}
                  {entry.note && <span style={{ opacity: 0.55 }}> — {entry.note}</span>}
                </span>
                <span style={{ fontSize: "0.8rem" }}>{customerName(entry.customerId)}</span>
                <span style={{ fontSize: "0.75rem" }}>
                  {cashPart > 0 && (
                    <span style={{ color: "#3F5D42" }}>
                      {formatNPR(cashPart)} {METHOD_LABELS[entry.method || "cash"]}
                    </span>
                  )}
                  {cashPart > 0 && creditPart > 0 && <br />}
                  {creditPart > 0 && <span style={{ color: "#C08A2E" }}>{formatNPR(creditPart)} credit</span>}
                </span>
                <span className="mono-num" style={{ textAlign: "right", color: isSale ? "#3F5D42" : "#A63D40" }}>
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

function SaleForm({ customers, customerCodes, stockItems, stockFIFO, prefill, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [customerId, setCustomerId] = useState(editEntry?.customerId || prefill?.customerId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || prefill?.itemId || "");
  const [quantity, setQuantity] = useState(
    editEntry?.quantity ? String(editEntry.quantity) : prefill?.quantity ? String(prefill.quantity) : ""
  );
  const [unitRate, setUnitRate] = useState(() => {
    if (editEntry?.itemId && Number(editEntry.quantity) > 0) {
      return String((Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) / Number(editEntry.quantity));
    }
    return "";
  });
  const [totalAmount, setTotalAmount] = useState(
    editEntry && !editEntry.itemId ? String(Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) : ""
  );
  const [cashAmount, setCashAmount] = useState(editEntry?.cashAmount !== undefined ? String(editEntry.cashAmount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  const total = itemId && quantity ? (Number(unitRate) || 0) * (Number(quantity) || 0) : Number(totalAmount) || 0;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);
  const available = itemId ? stockFIFO[itemId]?.currentQty || 0 : null;

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !customerId) return;
    onSave({
      ...(editEntry || {}),
      date,
      customerId: customerId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      cashAmount: cash,
      method,
      creditAmount: credit,
      partner,
      note,
      orderId: editEntry?.orderId ?? prefill?.orderId ?? null,
    });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit sale" : prefill?.orderId ? "Record sale — fulfilling order" : "Record sale"}>
      {prefill?.orderId && (
        <p style={{ fontSize: "0.78rem", background: "#F0EBDD", padding: "6px 10px", marginBottom: 12 }}>
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
      <Field label="Item sold (optional — deducts stock)">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inputStyle}>
          <option value="">No stock item</option>
          {stockItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({stockFIFO[i.id]?.currentQty || 0} {i.unit} available)
            </option>
          ))}
        </select>
      </Field>
      {itemId && (
        <Field label="Quantity sold">
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
          {Number(quantity) > available && (
            <p style={{ fontSize: "0.72rem", color: "#A63D40", marginTop: 4 }}>Exceeds current stock ({available} available).</p>
          )}
        </Field>
      )}
      {itemId ? (
        <>
          <Field label="Unit rate (Rs. per unit)">
            <input type="number" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} style={inputStyle} placeholder="0" />
          </Field>
          <Field label="Total sale amount (Rs.)">
            <input value={formatNPR(total)} disabled style={readOnlyInputStyle} />
          </Field>
        </>
      ) : (
        <Field label="Total sale amount (Rs.)">
          <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
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
          <span className="mono-num" style={{ color: "#C08A2E" }}>{formatNPR(credit)}</span>
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

function ReturnForm({ customers, customerCodes, stockItems, stockFIFO, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [customerId, setCustomerId] = useState(editEntry?.customerId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || "");
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [unitCost, setUnitCost] = useState(editEntry?.unitCost !== undefined ? String(editEntry.unitCost) : "");
  const [totalAmount, setTotalAmount] = useState(
    editEntry ? String(Number(editEntry.cashRefund) + Number(editEntry.creditReduction)) : ""
  );
  const [cashRefund, setCashRefund] = useState(editEntry?.cashRefund !== undefined ? String(editEntry.cashRefund) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  const total = Number(totalAmount) || 0;
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
      cashRefund: cash,
      method,
      creditReduction: credit,
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
        <select value={itemId} onChange={(e) => handleItemChange(e.target.value)} style={inputStyle}>
          <option value="">No stock item</option>
          {stockItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </Field>
      {itemId && (
        <>
          <Field label="Quantity returned">
            <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
          </Field>
          <Field label="Restock unit cost (Rs.) — defaults to current average cost">
            <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} />
          </Field>
        </>
      )}
      <Field label="Total return amount (Rs.)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
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
          <span className="mono-num" style={{ color: "#C08A2E" }}>{formatNPR(credit)}</span>
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

function InvoiceModal({ billEntry, customers, customerCodes, stockItems, onClose }) {
  const { kind, entry } = billEntry;
  const isSale = kind === "sale";
  const customer = customers.find((c) => c.id === entry.customerId);
  const item = stockItems.find((i) => i.id === entry.itemId);
  const total = isSale ? Number(entry.cashAmount) + Number(entry.creditAmount) : Number(entry.cashRefund) + Number(entry.creditReduction);
  const cash = isSale ? Number(entry.cashAmount) : Number(entry.cashRefund);
  const credit = isSale ? Number(entry.creditAmount) : Number(entry.creditReduction);
  const invoiceNo = `${isSale ? "INV" : "CRN"}-${entry.id.slice(-6).toUpperCase()}`;
  const unitPrice = item && entry.quantity ? total / entry.quantity : null;

  const waText = [
    `*Trikut Snacks* — ${isSale ? "Bill" : "Credit Note"} ${invoiceNo}`,
    `Date: ${entry.date}`,
    ``,
    `${item ? `${item.name} × ${entry.quantity} ${item.unit}` : entry.note || (isSale ? "Sale" : "Return")}${
      unitPrice ? ` @ ${formatNPR(unitPrice)}` : ""
    }`,
    ``,
    `Total: ${formatNPR(total)}`,
    `${isSale ? "Paid (cash)" : "Refunded (cash)"}: ${formatNPR(cash)}`,
    `${isSale ? "Balance due" : "Credit adjusted"}: ${formatNPR(credit)}`,
    ``,
    `Thank you for your business — Trikut Snacks`,
  ].join("\n");

  const waLink = customer?.phone ? whatsAppLink(customer.phone, waText) : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(43,38,33,0.5)", zIndex: 60 }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#2B2621" }}>
            {isSale ? "Bill preview" : "Credit note preview"}
          </span>
          <div className="flex gap-2 items-center flex-wrap">
            {waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1"
                style={{ background: "#3F5D42", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <MessageCircle size={14} /> Send via WhatsApp
              </a>
            ) : (
              customer && (
                <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>Add a phone number to send via WhatsApp</span>
              )
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "#2B2621", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={onClose} style={{ color: "#2B2621" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div id="invoice-print-area" style={{ padding: "28px", color: "#2B2621", fontFamily: "Georgia, serif" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h2>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Three Peaks, One Great Taste</p>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Dharan, Sunsari, Nepal</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>{isSale ? "BILL" : "CREDIT NOTE"}</p>
              <p style={{ fontSize: "0.75rem", margin: 0 }}>{invoiceNo}</p>
              <p style={{ fontSize: "0.75rem", margin: 0 }}>{entry.date}</p>
            </div>
          </div>

          <div style={{ marginBottom: 20, fontSize: "0.85rem" }}>
            <p style={{ margin: 0, opacity: 0.6, textTransform: "uppercase", fontSize: "0.7rem" }}>Billed to</p>
            <p style={{ margin: 0, fontWeight: 600 }}>
              {customer ? customer.name : "Cash sale / walk-in customer"}
              {customer && customerCodes[customer.id] && (
                <span style={{ opacity: 0.6, fontWeight: 400 }}> ({customerCodes[customer.id]})</span>
              )}
            </p>
            {customer?.phone && <p style={{ margin: 0 }}>{customer.phone}</p>}
            {customer?.address && <p style={{ margin: 0 }}>{customer.address}</p>}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2B2621" }}>
                <th style={{ textAlign: "left", padding: "6px 0" }}>Description</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Qty</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Rate</th>
                <th style={{ textAlign: "right", padding: "6px 0" }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}>
                <td style={{ padding: "8px 0" }}>{item ? item.name : entry.note || (isSale ? "Sale" : "Return")}</td>
                <td style={{ textAlign: "right" }}>{item && entry.quantity ? `${entry.quantity} ${item.unit}` : "—"}</td>
                <td style={{ textAlign: "right" }}>{unitPrice ? formatNPR(unitPrice) : "—"}</td>
                <td style={{ textAlign: "right" }}>{formatNPR(total)}</td>
              </tr>
            </tbody>
          </table>

          {entry.note && item && (
            <p style={{ fontSize: "0.78rem", opacity: 0.7, marginTop: -8, marginBottom: 16 }}>Note: {entry.note}</p>
          )}

          <div style={{ marginLeft: "auto", width: 220, fontSize: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>Total</span>
              <span className="mono-num">{formatNPR(total)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
              <span>{isSale ? "Paid (cash)" : "Refunded (cash)"}</span>
              <span className="mono-num">{formatNPR(cash)}</span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "4px 0",
                borderTop: "3px double #2B2621",
                fontWeight: 700,
                marginTop: 4,
              }}
            >
              <span>{isSale ? "Balance due" : "Credit adjusted"}</span>
              <span className="mono-num">{formatNPR(credit)}</span>
            </div>
          </div>

          <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 32, textAlign: "center" }}>
            Thank you for your business — Trikut Snacks
          </p>
        </div>
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
          const base = `Sale${s.itemId ? ` — ${itemName(s.itemId)} × ${s.quantity} ${itemUnit(s.itemId)}` : ""}`;
          const paySummary =
            cashPart > 0 && creditPart > 0
              ? ` (${formatNPR(cashPart)} cash, ${formatNPR(creditPart)} credit)`
              : cashPart > 0
                ? " (paid in full)"
                : " (on credit)";
          return {
            id: s.id,
            date: s.date,
            description: `${base}${paySummary}${s.note ? ` · ${s.note}` : ""}`,
            debit: creditPart,
            credit: 0,
            delta: creditPart,
          };
        }),
      ...saleReturns
        .filter((r) => r.customerId === target.id)
        .map((r) => {
          const cashPart = Number(r.cashRefund);
          const creditPart = Number(r.creditReduction);
          const base = `Return${r.itemId ? ` — ${itemName(r.itemId)} × ${r.quantity} ${itemUnit(r.itemId)}` : ""}`;
          const paySummary =
            cashPart > 0 && creditPart > 0
              ? ` (${formatNPR(cashPart)} refunded, ${formatNPR(creditPart)} credited)`
              : cashPart > 0
                ? " (cash refund)"
                : " (credited to account)";
          return {
            id: r.id,
            date: r.date,
            description: `${base}${paySummary}${r.note ? ` · ${r.note}` : ""}`,
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
          const cashPart = Number(p.cashAmount);
          const creditPart = Number(p.creditAmount);
          const base = `Purchase${p.itemId ? ` — ${itemName(p.itemId)} × ${p.quantity} ${itemUnit(p.itemId)}` : ""}`;
          const paySummary =
            cashPart > 0 && creditPart > 0
              ? ` (${formatNPR(cashPart)} paid, ${formatNPR(creditPart)} credit)`
              : cashPart > 0
                ? " (paid in full)"
                : " (on credit)";
          return {
            id: p.id,
            date: p.date,
            description: `${base}${paySummary}${p.note ? ` · ${p.note}` : ""}`,
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

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

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
      (r) => `${r.date}: ${r.description} — bal ${formatNPR(r.balance)}`
    ),
    ``,
    `Closing balance: ${formatNPR(Math.abs(closingBalance))} — ${balanceLabel}`,
  ].join("\n");

  const waLink = party?.phone ? whatsAppLink(party.phone, statementText) : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 modal-backdrop" style={{ background: "rgba(43,38,33,0.5)", zIndex: 60, backdropFilter: "blur(2px)" }}>
      <div className="modal-panel" style={{ background: "#fff", width: "100%", maxWidth: 560, maxHeight: "90vh", borderRadius: 12, boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(43,38,33,0.32), 0 12px 24px rgba(43,38,33,0.18), 0 4px 8px rgba(43,38,33,0.1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#2B2621" }}>Account statement</span>
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex gap-1">
              <button
                onClick={() => setPeriod("3m")}
                style={{
                  background: period === "3m" ? "#2B2621" : "#F0EBDD",
                  color: period === "3m" ? "#fff" : "#2B2621",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                Last 3 months
              </button>
              <button
                onClick={() => setPeriod("all")}
                style={{
                  background: period === "all" ? "#2B2621" : "#F0EBDD",
                  color: period === "all" ? "#fff" : "#2B2621",
                  padding: "6px 10px",
                  fontSize: "0.75rem",
                }}
              >
                All time
              </button>
              <button
                onClick={() => setPeriod("custom")}
                style={{
                  background: period === "custom" ? "#2B2621" : "#F0EBDD",
                  color: period === "custom" ? "#fff" : "#2B2621",
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
                style={{ background: "#3F5D42", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                <MessageCircle size={14} /> Send via WhatsApp
              </a>
            ) : (
              party && <span style={{ fontSize: "0.72rem", opacity: 0.55 }}>Add a phone number to send via WhatsApp</span>
            )}
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "#2B2621", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={onClose} style={{ color: "#2B2621" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        {period === "custom" && (
          <div
            className="no-print flex items-center gap-2 px-4 py-2 flex-wrap"
            style={{ borderBottom: "1px solid rgba(43,38,33,0.15)", background: "#F0EBDD" }}
          >
            <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>From</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ border: "1px solid rgba(43,38,33,0.25)", padding: "4px 8px", fontSize: "0.78rem" }}
            />
            <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>To</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ border: "1px solid rgba(43,38,33,0.25)", padding: "4px 8px", fontSize: "0.78rem" }}
            />
          </div>
        )}

        <div id="invoice-print-area" style={{ padding: "28px", color: "#2B2621", fontFamily: "Georgia, serif", overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h2>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Three Peaks, One Great Taste</p>
              <p style={{ fontSize: "0.75rem", margin: 0, opacity: 0.7 }}>Dharan, Sunsari, Nepal</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.95rem", fontWeight: 700, margin: 0 }}>ACCOUNT STATEMENT</p>
              <p style={{ fontSize: "0.75rem", margin: 0 }}>{todayISO()}</p>
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

          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem", marginBottom: 16 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #2B2621" }}>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Date</th>
                <th style={{ textAlign: "left", padding: "6px 4px" }}>Description</th>
                <th style={{ textAlign: "right", padding: "6px 4px" }}>{isCustomer ? "Charged" : "Charged"}</th>
                <th style={{ textAlign: "right", padding: "6px 4px" }}>{isCustomer ? "Received" : "Paid"}</th>
                <th style={{ textAlign: "right", padding: "6px 4px" }}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rangeStart && (
                <tr style={{ borderBottom: "1px solid rgba(43,38,33,0.1)", fontStyle: "italic", opacity: 0.7 }}>
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
                  <tr key={r.id} style={{ borderBottom: "1px solid rgba(43,38,33,0.1)", background: i % 2 === 1 ? "rgba(43,38,33,0.025)" : "transparent" }}>
                    <td style={{ padding: "6px 4px", whiteSpace: "nowrap" }}>{r.date}</td>
                    <td style={{ padding: "6px 4px" }}>{r.description}</td>
                    <td style={{ textAlign: "right", padding: "6px 4px" }}>{r.debit ? formatNPR(r.debit) : "—"}</td>
                    <td style={{ textAlign: "right", padding: "6px 4px" }}>{r.credit ? formatNPR(r.credit) : "—"}</td>
                    <td className="mono-num" style={{ textAlign: "right", padding: "6px 4px" }}>{formatNPR(r.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "2px solid #2B2621", fontWeight: 600 }}>
                  <td style={{ padding: "6px 4px" }} colSpan={2}>
                    Totals
                  </td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{formatNPR(totalDebit)}</td>
                  <td style={{ textAlign: "right", padding: "6px 4px" }}>{formatNPR(totalCredit)}</td>
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
                borderTop: "3px double #2B2621",
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
  onClose,
}) {
  const [date, setDate] = useState(todayISO());
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

  const dayIncome = dayTransactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const dayExpense = dayTransactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);
  const netProfit = dayIncome - dayExpense;

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

  // Breakdown by head (category) — every income/expense category that moved today
  const incomeByCategory = {};
  const expenseByCategory = {};
  dayTransactions.forEach((t) => {
    const map = t.type === "income" ? incomeByCategory : expenseByCategory;
    map[t.category] = (map[t.category] || 0) + Number(t.amount);
  });
  const incomeHeads = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1]);
  const expenseHeads = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1]);

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
    <div className="fixed inset-0 flex items-center justify-center p-4 modal-backdrop" style={{ background: "rgba(43,38,33,0.5)", zIndex: 60, backdropFilter: "blur(2px)" }}>
      <div className="modal-panel" style={{ background: "#fff", width: "100%", maxWidth: 640, maxHeight: "90vh", borderRadius: 12, boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(43,38,33,0.32), 0 12px 24px rgba(43,38,33,0.18), 0 4px 8px rgba(43,38,33,0.1)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3 flex-wrap gap-2"
          style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#2B2621" }}>Daily report</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ border: "1px solid rgba(43,38,33,0.25)", padding: "5px 8px", fontSize: "0.8rem" }}
            />
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1"
              style={{ background: "#2B2621", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
            >
              <Printer size={14} /> Print / Save as PDF
            </button>
            <button onClick={onClose} style={{ color: "#2B2621" }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div id="invoice-print-area" style={{ padding: "28px", color: "#2B2621", fontFamily: "Georgia, serif", overflowY: "auto" }}>
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

          <div className="grid grid-cols-3" style={{ gap: 10, marginBottom: 20 }}>
            {[
              { label: "Sales", value: salesTotal, color: "#3F5D42" },
              { label: "Returns", value: returnsTotal, color: "#A63D40" },
              { label: "Purchases", value: purchasesTotal, color: "#A63D40" },
              { label: "Income", value: dayIncome, color: "#3F5D42" },
              { label: "Expenses", value: dayExpense, color: "#A63D40" },
              { label: "Net Profit", value: netProfit, color: netProfit >= 0 ? "#3F5D42" : "#A63D40" },
            ].map((m) => (
              <div key={m.label} style={{ border: "1px solid rgba(43,38,33,0.15)", padding: "8px 10px" }}>
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
                <tr style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}>
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

          <div className="grid grid-cols-2" style={{ gap: 20, marginBottom: 8 }}>
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
                  left={`${customerName(s.customerId)}${s.itemId ? ` — ${itemName(s.itemId)} × ${s.quantity} ${itemUnit(s.itemId)}` : ""}`}
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
                  left={`${supplierName(p.supplierId)}${p.itemId ? ` — ${itemName(p.itemId)} × ${p.quantity} ${itemUnit(p.itemId)}` : ""}`}
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
      <p style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 6, borderBottom: "1px solid rgba(43,38,33,0.15)", paddingBottom: 4 }}>
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
  onOpenStatement,
}) {
  const [expanded, setExpanded] = useState(null);
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || null;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #A63D40", paddingLeft: 10 }}>Purchases</h2>
        <button
          onClick={onAddPurchase}
          className="flex items-center gap-1"
          style={{ background: "#A63D40", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record purchase
        </button>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="mb-8">
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
        {purchases.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No purchases recorded yet. Record a purchase — it logs the expense, stocks in the raw material, and tracks any credit owed, all in one go." />
          </div>
        ) : (
          purchases.map((p, i) => {
            const total = Number(p.cashAmount) + Number(p.creditAmount);
            return (
              <div
                key={p.id}
                className="ledger-rule row-in grid px-4 py-3 items-center"
                style={{ gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px", fontSize: "0.85rem", animationDelay: `${Math.min(i, 14) * 25}ms` }}
              >
                <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{p.date}</span>
                <span>
                  {itemName(p.itemId) && `${itemName(p.itemId)}${p.quantity ? ` × ${p.quantity}` : ""}`}
                  {p.note && <span style={{ opacity: 0.55 }}> — {p.note}</span>}
                </span>
                <span style={{ fontSize: "0.8rem" }}>{p.supplierId ? supplierName(p.supplierId) : "Cash purchase"}</span>
                <span style={{ fontSize: "0.75rem" }}>
                  {p.cashAmount > 0 && <span style={{ color: "#A63D40" }}>{formatNPR(p.cashAmount)} cash</span>}
                  {p.cashAmount > 0 && p.creditAmount > 0 && <br />}
                  {p.creditAmount > 0 && <span style={{ color: "#C08A2E" }}>{formatNPR(p.creditAmount)} credit</span>}
                </span>
                <span className="mono-num" style={{ textAlign: "right", color: "#A63D40" }}>
                  −{formatNPR(total)}
                </span>
                {role === "partner" && (
                  <>
                    <button onClick={() => onEditPurchase(p)} style={{ opacity: 0.4 }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => onDeletePurchase(p.id)} style={{ opacity: 0.4 }}>
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #A63D40", paddingLeft: 10 }}>Suppliers & payables</h2>
        <button
          onClick={onAddSupplier}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
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
              <div key={s.id} data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                      <p className="mono-num" style={{ color: owed > 0 ? "#A63D40" : "#3F5D42", fontSize: "1.05rem" }}>
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
                        style={{ background: "#A63D40", color: "#F6F1E4", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        + New purchase on credit
                      </button>
                      {role === "partner" && (
                        <button
                          onClick={() => onDeleteSupplier(s.id)}
                          style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
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
                            <span className="mono-num" style={{ color: p.type === "charge" ? "#A63D40" : "#3F5D42" }}>
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
  const [address, setAddress] = useState(editEntry?.address || "");
  const [note, setNote] = useState(editEntry?.note || "");

  function submit() {
    if (!name.trim()) return;
    onSave({ ...(editEntry || {}), name: name.trim(), phone, address, note });
  }

  return (
    <Modal onClose={onClose} title={editEntry ? "Edit supplier" : "Add supplier"}>
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Siliguri Cheese Traders" />
      </Field>
      <Field label="Phone (optional)">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} />
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
              background: type === t ? (t === "charge" ? "#A63D40" : "#3F5D42") : "#F0EBDD",
              color: type === t ? "#F6F1E4" : "#2B2621",
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #6B4226", paddingLeft: 10 }}>Production batches</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record production
        </button>
      </div>

      {productionBatches.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No production batches yet. Record raw materials used and finished goods produced — cost flows through automatically via FIFO." />
        </div>
      ) : (
        <div className="space-y-3">
          {productionBatches.map((b) => (
            <div key={b.id} data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
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
                <span>Unit cost: <span className="mono-num">{formatNPR(b.outputUnitCost)}/{itemUnit(b.outputItemId)}</span></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductionForm({ stockItems, stockFIFO, editEntry, actor, onSave, onClose }) {
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
          <select
            value={inp.itemId}
            onChange={(e) => updateInput(idx, "itemId", e.target.value)}
            style={{ ...inputStyle, flex: 2 }}
          >
            <option value="">Select item</option>
            {rawMaterials.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({stockFIFO[i.id]?.currentQty || 0} {i.unit} available)
              </option>
            ))}
          </select>
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
        style={{ fontSize: "0.78rem", color: "#3A5A78", marginBottom: 14, display: "flex", alignItems: "center", gap: 4 }}
      >
        <Plus size={13} /> Add another raw material
      </button>

      <Field label="Finished good produced">
        <select value={outputItemId} onChange={(e) => setOutputItemId(e.target.value)} style={inputStyle}>
          <option value="">Select item</option>
          {finishedGoods.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
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
        <p style={{ fontSize: "0.8rem", marginBottom: 10, background: "#F0EBDD", padding: "8px 10px" }}>
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

function PurchaseForm({ suppliers, supplierCodes, stockItems, editEntry, actor, onSave, onClose }) {
  const [date, setDate] = useState(editEntry?.date || todayISO());
  const [supplierId, setSupplierId] = useState(editEntry?.supplierId || "");
  const [itemId, setItemId] = useState(editEntry?.itemId || "");
  const [quantity, setQuantity] = useState(editEntry?.quantity ? String(editEntry.quantity) : "");
  const [unitRate, setUnitRate] = useState(() => {
    if (editEntry?.itemId && Number(editEntry.quantity) > 0) {
      return String((Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) / Number(editEntry.quantity));
    }
    return "";
  });
  const [totalAmount, setTotalAmount] = useState(
    editEntry && !editEntry.itemId ? String(Number(editEntry.cashAmount) + Number(editEntry.creditAmount)) : ""
  );
  const [cashAmount, setCashAmount] = useState(editEntry?.cashAmount !== undefined ? String(editEntry.cashAmount) : "");
  const [method, setMethod] = useState(editEntry?.method || "cash");
  const [category, setCategory] = useState(editEntry?.category || EXPENSE_CATEGORIES[0]);
  const [partner, setPartner] = useState(editEntry?.partner || PARTNERS[0]);
  const [note, setNote] = useState(editEntry?.note || "");

  const total = itemId && quantity ? (Number(unitRate) || 0) * (Number(quantity) || 0) : Number(totalAmount) || 0;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !supplierId) return;
    onSave({
      ...(editEntry || {}),
      date,
      supplierId: supplierId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      cashAmount: cash,
      method,
      creditAmount: credit,
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
      <Field label="Raw material bought (optional — stocks it in)">
        <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inputStyle}>
          <option value="">No stock item</option>
          {stockItems.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.unit})
            </option>
          ))}
        </select>
      </Field>
      {itemId && (
        <Field label="Quantity purchased">
          <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
      )}
      <Field label="Expense category">
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      {itemId ? (
        <>
          <Field label="Unit rate (Rs. per unit)">
            <input type="number" value={unitRate} onChange={(e) => setUnitRate(e.target.value)} style={inputStyle} placeholder="0" />
          </Field>
          <Field label="Total purchase amount (Rs.)">
            <input value={formatNPR(total)} disabled style={readOnlyInputStyle} />
          </Field>
        </>
      ) : (
        <Field label="Total purchase amount (Rs.)">
          <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
        </Field>
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
          <span className="mono-num" style={{ color: "#C08A2E" }}>{formatNPR(credit)}</span>
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

  const statusColor = { pending: "#C08A2E", "in production": "#3A5A78", fulfilled: "#3F5D42", cancelled: "#A63D40" };

  const sorted = [...orders].sort((a, b) => (a.status === "fulfilled" || a.status === "cancelled" ? 1 : -1));

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem", borderLeft: "4px solid #6B4C5C", paddingLeft: 10 }}>Orders</h2>
        <button
          onClick={onAddOrder}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record order
        </button>
      </div>

      {productionNeeds.length > 0 && (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4 mb-6">
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
                    <span className="mono-num" style={{ color: "#A63D40", marginLeft: 8, fontWeight: 600 }}>
                      need {n.shortfall} more {n.item ? n.item.unit : ""}
                    </span>
                  ) : (
                    <span style={{ color: "#3F5D42", marginLeft: 8 }}>covered</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {orders.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No orders yet. Record what a customer wants and by when — pending orders feed the production plan above." />
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((o) => (
            <div key={o.id} data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
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
                      style={{ background: "#3A5A78", color: "#fff", padding: "5px 10px", fontSize: "0.75rem" }}
                    >
                      Mark in production
                    </button>
                  )}
                  <button
                    onClick={() => onFulfillViaSale(o)}
                    style={{ background: "#3F5D42", color: "#fff", padding: "5px 10px", fontSize: "0.75rem" }}
                  >
                    Fulfill via sale
                  </button>
                  <button
                    onClick={() => onUpdateStatus(o.id, "cancelled")}
                    style={{ background: "#F0EBDD", padding: "5px 10px", fontSize: "0.75rem" }}
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
  orders,
  fixedAssets,
  onRestoreTransaction,
  onRestoreCapitalEntry,
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
        description: `${s.itemId ? `${itemName(s.itemId)} × ${s.quantity} — ` : ""}${formatNPR(Number(s.cashAmount) + Number(s.creditAmount))} (${customerName(s.customerId)})`,
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
        description: `${p.itemId ? `${itemName(p.itemId)} × ${p.quantity} — ` : ""}${formatNPR(Number(p.cashAmount) + Number(p.creditAmount))} (${p.supplierId ? supplierName(p.supplierId) : "Cash purchase"})`,
        onRestore: () => onRestorePurchase(p.id),
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
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Recently Deleted</h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Deleted records stay here for {TRASH_RETENTION_DAYS} days before being permanently removed.
        </p>
      </div>

      {rows.length === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="Nothing in the trash right now." />
        </div>
      ) : (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                      color: "#A63D40",
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
                  style={{ background: "#3F5D42", color: "#F6F1E4", padding: "6px 14px", fontSize: "0.78rem", flexShrink: 0 }}
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

  const statusColor = { pending: "#C08A2E", "in production": "#3A5A78", fulfilled: "#3F5D42", cancelled: "#A63D40" };
  const totalMatches = matchedOrders.length + matchedSales.length + matchedReturns.length + matchedCustomers.length + matchedSuppliers.length;

  return (
    <div>
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
            border: "1px solid rgba(43,38,33,0.25)",
            background: "#FFFDF8",
            padding: "10px 12px 10px 32px",
            fontSize: "0.9rem",
          }}
          autoFocus
        />
      </div>

      {!q ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote
            text={
              role === "partner"
                ? "Start typing to search across orders, sales, returns, customers, and suppliers."
                : "Start typing to search across sales, returns, customers, and suppliers."
            }
          />
        </div>
      ) : totalMatches === 0 ? (
        <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No matches found." />
        </div>
      ) : (
        <div className="space-y-6">
          {matchedOrders.length > 0 && (
            <div>
              <p style={{ fontSize: "0.72rem", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }} className="flex items-center gap-1">
                <ClipboardList size={13} /> Orders ({matchedOrders.length})
              </p>
              <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
              <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                        {itemName(s.itemId)}
                        {s.quantity ? ` × ${s.quantity}` : ""}
                      </p>
                      <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 2 }}>
                        {customerNameFor(s.customerId)} · {s.date}
                      </p>
                    </div>
                    <span className="mono-num" style={{ fontSize: "0.85rem", color: "#3F5D42" }}>
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
              <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                    <span className="mono-num" style={{ fontSize: "0.85rem", color: "#A63D40" }}>
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
              <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                        <span className="mono-num" style={{ fontSize: "0.85rem", color: owed > 0 ? "#A63D40" : "#3F5D42" }}>
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
              <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
                        <span className="mono-num" style={{ fontSize: "0.85rem", color: owed > 0 ? "#A63D40" : "#3F5D42" }}>
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

function AccountingView({
  activeSales,
  activeSaleReturns,
  activeTransactions,
  activeStockItems,
  activeStockTx,
  totals,
  totalReceivable,
  totalPayable,
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
  const totalLiabilities = totalPayable;
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
                  background: period === p.id ? "#2B2621" : "#F0EBDD",
                  color: period === p.id ? "#fff" : "#2B2621",
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
            style={{ background: "#2B2621", color: "#fff", padding: "6px 12px", fontSize: "0.8rem" }}
          >
            <Printer size={14} /> Print / Save as PDF
          </button>
        </div>
      </div>

      {period === "custom" && (
        <div className="no-print flex items-center gap-2 flex-wrap mb-4" style={{ background: "#F0EBDD", padding: "8px 12px" }}>
          <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>From</label>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ border: "1px solid rgba(43,38,33,0.25)", padding: "4px 8px", fontSize: "0.78rem" }} />
          <label style={{ fontSize: "0.75rem", opacity: 0.7 }}>To</label>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ border: "1px solid rgba(43,38,33,0.25)", padding: "4px 8px", fontSize: "0.78rem" }} />
        </div>
      )}

      <div className="no-print mb-6">
        <div className="flex justify-between items-center mb-2">
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>Fixed Assets</h3>
          <button
            onClick={onAddFixedAsset}
            className="flex items-center gap-1"
            style={{ background: "#2B2621", color: "#F6F1E4", padding: "6px 12px", fontSize: "0.8rem" }}
          >
            <Plus size={14} /> Add fixed asset
          </button>
        </div>
        {fixedAssets.length === 0 ? (
          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
            <EmptyNote text="No fixed assets yet — add machinery, equipment, or vehicles here to have them capitalized and depreciated instead of fully expensed at purchase." />
          </div>
        ) : (
          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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

      <div id="invoice-print-area">
        <div className="mb-2">
          <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.3rem", margin: 0 }}>Trikut Snacks</h1>
          <p style={{ fontSize: "0.75rem", opacity: 0.6, margin: 0 }}>Three Peaks, One Great Taste — Dharan, Sunsari, Nepal</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", borderTop: "3px solid #C08A2E", padding: "18px" }}>
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
              color={periodDepreciation < 0 ? "#3F5D42" : undefined}
            />

            <div style={{ height: 10 }} />
            <AccountingLine
              label="Net Profit"
              value={netProfitAfterDepreciation}
              bold
              doubleUnderline
              color={netProfitAfterDepreciation >= 0 ? "#3F5D42" : "#A63D40"}
            />
          </div>

          <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", borderTop: "3px solid #3A5A78", padding: "18px" }}>
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
            <AccountingLine label="Accounts Payable" value={totalLiabilities} indent />
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
            <p style={{ fontSize: "0.7rem", marginTop: 8, color: Math.abs(balanceCheck) < 1 ? "#3F5D42" : "#A63D40" }}>
              {Math.abs(balanceCheck) < 1 ? "✓ Balanced" : `⚠ Off by ${formatNPR(balanceCheck)}`}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <AgingTable title="Accounts Receivable Aging" rows={receivableAging} colorTone="#A63D40" />
          <AgingTable title="Accounts Payable Aging" rows={payableAging} colorTone="#A63D40" />
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

function AgingTable({ title, rows, colorTone }) {
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
    <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "18px" }}>
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
            <tr style={{ borderBottom: "2px solid #2B2621" }}>
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
              <tr key={r.party.id} style={{ borderBottom: "1px solid rgba(43,38,33,0.1)", background: i % 2 === 1 ? "rgba(43,38,33,0.025)" : "transparent" }}>
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
            <tr style={{ borderTop: "2px solid #2B2621", fontWeight: 600 }}>
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
        borderLeft: indent ? "2px solid rgba(43,38,33,0.1)" : "none",
        fontWeight: bold ? 600 : 400,
        borderBottom: doubleUnderline ? "3px double #2B2621" : underline ? "1px solid rgba(43,38,33,0.3)" : "none",
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
  orders,
  fixedAssets,
}) {
  const [lastAction, setLastAction] = useState("");

  const datasets = {
    Transactions: transactions,
    "Partner Capital": capitalEntries,
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
    Orders: orders,
    "Fixed Assets": fixedAssets,
  };

  const totalRecords = Object.values(datasets).reduce((s, d) => s + d.length, 0);
  const trashedRecords = Object.values(datasets).reduce((s, d) => s + d.filter(isDeleted).length, 0);

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
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    triggerDownload(blob, `trikut-snacks-backup-${todayISO()}.json`);
    setLastAction(`Downloaded full JSON backup at ${new Date().toLocaleTimeString()}`);
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
  }

  return (
    <div>
      <div className="mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Backup & Export</h2>
        <p style={{ fontSize: "0.78rem", opacity: 0.6, marginTop: 2 }}>
          Download a complete copy of everything in the app — including anything currently in Recently Deleted.
        </p>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "18px" }} className="mb-6">
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={downloadJSON}
            className="flex items-center gap-2"
            style={{ background: "#2B2621", color: "#F6F1E4", padding: "10px 16px", fontSize: "0.85rem" }}
          >
            <Download size={15} /> Download Full Backup (JSON)
          </button>
          <button
            onClick={downloadExcel}
            className="flex items-center gap-2"
            style={{ background: "#3F5D42", color: "#F6F1E4", padding: "10px 16px", fontSize: "0.85rem" }}
          >
            <Download size={15} /> Download Excel Workbook
          </button>
        </div>
        {lastAction && <p style={{ fontSize: "0.78rem", color: "#3F5D42" }}>✓ {lastAction}</p>}
        <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 8 }}>
          The JSON file is the true backup — everything, in the exact shape the app uses, useful if you ever need to
          hand data to someone else or rebuild from scratch. The Excel workbook is for reading and analyzing the
          numbers yourself, one sheet per section.
        </p>
      </div>

      <div data-card style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "18px" }}>
        <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }} className="mb-3">
          What's in it — {totalRecords} records total{trashedRecords > 0 ? ` (${trashedRecords} in trash)` : ""}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Object.entries(datasets).map(([name, rows]) => (
            <div
              key={name}
              className="flex justify-between items-center"
              style={{ fontSize: "0.8rem", background: "#F6F1E4", padding: "8px 10px", borderRadius: 6 }}
            >
              <span style={{ opacity: 0.7 }}>{name}</span>
              <span className="mono-num" style={{ fontWeight: 600, color: rows.length > 0 ? "#3F5D42" : "inherit", opacity: rows.length > 0 ? 1 : 0.4 }}>
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
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4 modal-backdrop"
      style={{ background: "rgba(43,38,33,0.5)", zIndex: 50, backdropFilter: "blur(2px)" }}
    >
      <div
        className="modal-panel"
        style={{
          background: "#F6F1E4",
          border: "1px solid rgba(43,38,33,0.15)",
          borderRadius: 12,
          boxShadow: "0 2px 0 rgba(255,255,255,0.5) inset, 0 32px 70px rgba(43,38,33,0.32), 0 12px 24px rgba(43,38,33,0.18), 0 4px 8px rgba(43,38,33,0.1)",
          width: "100%",
          maxWidth: 420,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex justify-between items-center px-5 pt-5 pb-3" style={{ flexShrink: 0 }}>
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>{title}</h3>
          <button onClick={onClose} style={{ opacity: 0.6 }}>
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
  border: "1px solid rgba(43,38,33,0.25)",
  background: "#FFFDF8",
  padding: "8px 10px",
  fontSize: "0.9rem",
};

const readOnlyInputStyle = {
  ...inputStyle,
  background: "#F0EBDD",
  opacity: 0.7,
  cursor: "not-allowed",
};

const saveBtnStyle = {
  width: "100%",
  background: "linear-gradient(180deg, #3A342E 0%, #2B2621 55%, #221D19 100%)",
  color: "#F6F1E4",
  padding: "11px",
  fontSize: "0.9rem",
  fontWeight: 600,
  letterSpacing: "0.02em",
  marginTop: "6px",
  textShadow: "0 1px 1px rgba(0,0,0,0.3)",
};

export default function App() {
  const { user, profile, loading, signOut } = useAuth();

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
    />
  );
}
