import { useState, useEffect, useMemo } from "react";
import { Plus, TrendingUp, TrendingDown, Wallet, Users, X, Search, Trash2, Printer } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { storage } from "./storage";
import { useAuth, LoginScreen } from "./AuthContext";

const PARTNERS = ["Pritam", "Ashish", "Kapil"];

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

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
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
  return `${sign}₨${formatted}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
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

function TrikutLedger({ role, userLabel, onLogout }) {
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
  const [showCapForm, setShowCapForm] = useState(false);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [showReceivableForm, setShowReceivableForm] = useState(null); // customerId or null
  const [showStockItemForm, setShowStockItemForm] = useState(false);
  const [showStockTxForm, setShowStockTxForm] = useState(null); // { itemId, type } or null
  const [showSaleForm, setShowSaleForm] = useState(false);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [billEntry, setBillEntry] = useState(null); // { kind: 'sale'|'return', entry }
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [showPayableForm, setShowPayableForm] = useState(null); // supplierId or null
  const [showProductionForm, setShowProductionForm] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [showPurchaseForm, setShowPurchaseForm] = useState(false);
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
      setLoading(false);
    })();
  }, []);

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

  function addTransaction(entry) {
    saveTransactions([{ ...entry, id: uid() }, ...transactions]);
    setShowTxForm(false);
  }

  function deleteTransaction(id) {
    saveTransactions(transactions.filter((t) => t.id !== id));
  }

  function addCapitalEntry(entry) {
    saveCapital([{ ...entry, id: uid() }, ...capitalEntries]);
    setShowCapForm(false);
  }

  function deleteCapitalEntry(id) {
    saveCapital(capitalEntries.filter((c) => c.id !== id));
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

  function addCustomer(entry) {
    saveCustomers([{ ...entry, id: uid() }, ...customers]);
    setShowCustomerForm(false);
  }

  function deleteCustomer(id) {
    saveCustomers(customers.filter((c) => c.id !== id));
    saveReceivables(receivables.filter((r) => r.customerId !== id));
  }

  function addReceivable(entry) {
    saveReceivables([{ ...entry, id: uid() }, ...receivables]);
    setShowReceivableForm(null);
  }

  function deleteReceivable(id) {
    saveReceivables(receivables.filter((r) => r.id !== id));
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

  function addStockItem(entry) {
    saveStockItems([{ ...entry, id: uid() }, ...stockItems]);
    setShowStockItemForm(false);
  }

  function deleteStockItem(id) {
    saveStockItems(stockItems.filter((i) => i.id !== id));
    saveStockTx(stockTx.filter((t) => t.itemId !== id));
  }

  function addStockTx(entry) {
    saveStockTx([...stockTx, { ...entry, id: uid() }]);
    setShowStockTxForm(null);
  }

  function deleteStockTx(id) {
    saveStockTx(stockTx.filter((t) => t.id !== id));
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

  function recordSale(entry) {
    const saleId = uid();
    const { date, customerId, itemId, quantity, cashAmount, creditAmount, partner, note } = entry;

    saveSales([{ ...entry, id: saleId }, ...sales]);

    if (cashAmount > 0) {
      saveTransactions([
        {
          id: uid(),
          saleId,
          type: "income",
          date,
          category: "Sales Revenue",
          partner,
          amount: cashAmount,
          note: note ? `Sale — ${note}` : "Sale (cash portion)",
        },
        ...transactions,
      ]);
    }
    if (creditAmount > 0 && customerId) {
      saveReceivables([
        {
          id: uid(),
          saleId,
          customerId,
          date,
          type: "charge",
          amount: creditAmount,
          note: note ? `Sale — ${note}` : "Sale (credit portion)",
        },
        ...receivables,
      ]);
    }
    if (itemId && quantity > 0) {
      saveStockTx([
        ...stockTx,
        { id: uid(), saleId, itemId, date, type: "out", quantity, note: note ? `Sold — ${note}` : "Sold" },
      ]);
    }
    setShowSaleForm(false);
  }

  function deleteSale(id) {
    saveSales(sales.filter((s) => s.id !== id));
    saveTransactions(transactions.filter((t) => t.saleId !== id));
    saveReceivables(receivables.filter((r) => r.saleId !== id));
    saveStockTx(stockTx.filter((t) => t.saleId !== id));
  }

  function recordReturn(entry) {
    const returnId = uid();
    const { date, customerId, itemId, quantity, unitCost, cashRefund, creditReduction, partner, note } = entry;

    saveSaleReturns([{ ...entry, id: returnId }, ...saleReturns]);

    if (cashRefund > 0) {
      saveTransactions([
        {
          id: uid(),
          returnId,
          type: "expense",
          date,
          category: "Sales Return / Refund",
          partner,
          amount: cashRefund,
          note: note ? `Return — ${note}` : "Sale return (cash refund)",
        },
        ...transactions,
      ]);
    }
    if (creditReduction > 0 && customerId) {
      saveReceivables([
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
        ...receivables,
      ]);
    }
    if (itemId && quantity > 0) {
      saveStockTx([
        ...stockTx,
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
      ]);
    }
    setShowReturnForm(false);
  }

  function deleteSaleReturn(id) {
    saveSaleReturns(saleReturns.filter((r) => r.id !== id));
    saveTransactions(transactions.filter((t) => t.returnId !== id));
    saveReceivables(receivables.filter((r) => r.returnId !== id));
    saveStockTx(stockTx.filter((t) => t.returnId !== id));
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

  function addSupplier(entry) {
    saveSuppliers([{ ...entry, id: uid() }, ...suppliers]);
    setShowSupplierForm(false);
  }

  function deleteSupplier(id) {
    saveSuppliers(suppliers.filter((s) => s.id !== id));
    savePayables(payables.filter((p) => p.supplierId !== id));
  }

  function addPayable(entry) {
    savePayables([{ ...entry, id: uid() }, ...payables]);
    setShowPayableForm(null);
  }

  function deletePayable(id) {
    savePayables(payables.filter((p) => p.id !== id));
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

  function computeConsumptionCost(itemId, quantity) {
    const fifo = stockFIFO[itemId];
    if (!fifo) return 0;
    let toConsume = Number(quantity);
    let cost = 0;
    for (const b of fifo.batches) {
      if (toConsume <= 0) break;
      const consumed = Math.min(b.qty, toConsume);
      cost += consumed * b.unitCost;
      toConsume -= consumed;
    }
    return cost;
  }

  function recordProduction(entry) {
    const batchId = uid();
    const { date, inputs, outputItemId, outputQuantity, laborCost, overheadCost, partner, note } = entry;

    let totalInputCost = 0;
    const newStockTx = [];
    inputs.forEach((inp) => {
      totalInputCost += computeConsumptionCost(inp.itemId, inp.quantity);
      newStockTx.push({
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
    newStockTx.push({
      id: uid(),
      productionId: batchId,
      itemId: outputItemId,
      date,
      type: "in",
      quantity: outputQty,
      unitCost: outputUnitCost,
      note: note ? `Produced — ${note}` : "Produced from batch",
    });
    saveStockTx([...stockTx, ...newStockTx]);

    let newTransactions = transactions;
    if (Number(laborCost) > 0) {
      newTransactions = [
        {
          id: uid(),
          productionId: batchId,
          type: "expense",
          date,
          category: "Labor & Wages",
          partner,
          amount: Number(laborCost),
          note: "Production batch labor",
        },
        ...newTransactions,
      ];
    }
    if (Number(overheadCost) > 0) {
      newTransactions = [
        {
          id: uid(),
          productionId: batchId,
          type: "expense",
          date,
          category: "Other",
          partner,
          amount: Number(overheadCost),
          note: "Production batch overhead",
        },
        ...newTransactions,
      ];
    }
    if (newTransactions !== transactions) saveTransactions(newTransactions);

    saveProductionBatches([{ ...entry, id: batchId, totalCost, outputUnitCost }, ...productionBatches]);
    setShowProductionForm(false);
  }

  function deleteProductionBatch(id) {
    saveProductionBatches(productionBatches.filter((b) => b.id !== id));
    saveStockTx(stockTx.filter((t) => t.productionId !== id));
    saveTransactions(transactions.filter((t) => t.productionId !== id));
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

  function recordPurchase(entry) {
    const purchaseId = uid();
    const { date, supplierId, itemId, quantity, category, cashAmount, creditAmount, partner, note } = entry;
    const totalAmount = cashAmount + creditAmount;
    const unitCost = quantity > 0 ? totalAmount / quantity : 0;

    savePurchases([{ ...entry, id: purchaseId }, ...purchases]);

    if (cashAmount > 0) {
      saveTransactions([
        {
          id: uid(),
          purchaseId,
          type: "expense",
          date,
          category,
          partner,
          amount: cashAmount,
          note: note ? `Purchase — ${note}` : "Purchase (cash portion)",
        },
        ...transactions,
      ]);
    }
    if (creditAmount > 0 && supplierId) {
      savePayables([
        {
          id: uid(),
          purchaseId,
          supplierId,
          date,
          type: "charge",
          amount: creditAmount,
          note: note ? `Purchase — ${note}` : "Purchase (credit portion)",
        },
        ...payables,
      ]);
    }
    if (itemId && quantity > 0) {
      saveStockTx([
        ...stockTx,
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
      ]);
    }
    setShowPurchaseForm(false);
  }

  function deletePurchase(id) {
    savePurchases(purchases.filter((p) => p.id !== id));
    saveTransactions(transactions.filter((t) => t.purchaseId !== id));
    savePayables(payables.filter((p) => p.purchaseId !== id));
    saveStockTx(stockTx.filter((t) => t.purchaseId !== id));
  }

  const totals = useMemo(() => {
    let income = 0,
      expense = 0;
    transactions.forEach((t) => {
      if (t.type === "income") income += Number(t.amount);
      else expense += Number(t.amount);
    });
    const capitalIn = capitalEntries
      .filter((c) => c.type === "contribution")
      .reduce((s, c) => s + Number(c.amount), 0);
    const capitalOut = capitalEntries
      .filter((c) => c.type === "withdrawal")
      .reduce((s, c) => s + Number(c.amount), 0);
    const receivableCashIn = receivables
      .filter((r) => r.type === "payment" && !r.nonCash)
      .reduce((s, r) => s + Number(r.amount), 0);
    const payableCashOut = payables
      .filter((p) => p.type === "payment" && !p.nonCash)
      .reduce((s, p) => s + Number(p.amount), 0);
    const cashBalance = income + capitalIn + receivableCashIn - expense - capitalOut - payableCashOut;
    return { income, expense, net: income - expense, cashBalance, capitalIn, capitalOut };
  }, [transactions, capitalEntries, receivables, payables]);

  const customerBalances = useMemo(() => {
    const map = {};
    customers.forEach((c) => (map[c.id] = { charged: 0, paid: 0 }));
    receivables.forEach((r) => {
      if (!map[r.customerId]) return;
      if (r.type === "charge") map[r.customerId].charged += Number(r.amount);
      else map[r.customerId].paid += Number(r.amount);
    });
    return map;
  }, [customers, receivables]);

  const totalReceivable = useMemo(() => {
    return Object.values(customerBalances).reduce((s, b) => s + (b.charged - b.paid), 0);
  }, [customerBalances]);

  const stockFIFO = useMemo(() => {
    const map = {};
    stockItems.forEach((item) => {
      const txForItem = stockTx
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
  }, [stockItems, stockTx]);

  const totalInventoryValue = useMemo(() => {
    return Object.values(stockFIFO).reduce((s, v) => s + v.currentValue, 0);
  }, [stockFIFO]);

  const lowStockItems = useMemo(() => {
    return stockItems.filter((i) => i.reorderLevel > 0 && (stockFIFO[i.id]?.currentQty || 0) <= i.reorderLevel);
  }, [stockItems, stockFIFO]);

  const supplierBalances = useMemo(() => {
    const map = {};
    suppliers.forEach((s) => (map[s.id] = { charged: 0, paid: 0 }));
    payables.forEach((p) => {
      if (!map[p.supplierId]) return;
      if (p.type === "charge") map[p.supplierId].charged += Number(p.amount);
      else map[p.supplierId].paid += Number(p.amount);
    });
    return map;
  }, [suppliers, payables]);

  const totalPayable = useMemo(() => {
    return Object.values(supplierBalances).reduce((s, b) => s + (b.charged - b.paid), 0);
  }, [supplierBalances]);

  const partnerBalances = useMemo(() => {
    const map = {};
    PARTNERS.forEach((p) => (map[p] = { contributed: 0, withdrawn: 0 }));
    capitalEntries.forEach((c) => {
      if (!map[c.partner]) return;
      if (c.type === "contribution") map[c.partner].contributed += Number(c.amount);
      else map[c.partner].withdrawn += Number(c.amount);
    });
    return map;
  }, [capitalEntries]);

  const chartData = useMemo(() => {
    const byMonth = {};
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { month, income: 0, expense: 0 };
      if (t.type === "income") byMonth[month].income += Number(t.amount);
      else byMonth[month].expense += Number(t.amount);
    });
    return Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month));
  }, [transactions]);

  const categoryBreakdown = useMemo(() => {
    const map = {};
    transactions
      .filter((t) => t.type === "expense")
      .forEach((t) => {
        map[t.category] = (map[t.category] || 0) + Number(t.amount);
      });
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [transactions]);

  const filteredTx = useMemo(() => {
    return transactions.filter((t) => {
      if (filterType !== "all" && t.type !== filterType) return false;
      if (filterPartner !== "all" && t.partner !== filterPartner) return false;
      if (search && !(`${t.category} ${t.note || ""}`.toLowerCase().includes(search.toLowerCase())))
        return false;
      return true;
    });
  }, [transactions, filterType, filterPartner, search]);

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
      style={{ background: "#F6F1E4", color: "#2B2621", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}
    >
      <style>{`
        .ledger-rule { border-bottom: 1px solid rgba(43,38,33,0.15); }
        .double-underline { border-bottom: 3px double #2B2621; }
        .mono-num { font-variant-numeric: tabular-nums; font-family: 'Courier New', monospace; }
        .margin-rule { border-left: 3px solid #A63D40; }
        input, select { outline: none; }
        input:focus, select:focus { box-shadow: 0 0 0 2px #C08A2E; }
        @media print {
          body * { visibility: hidden; }
          #invoice-print-area, #invoice-print-area * { visibility: visible; }
          #invoice-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Header */}
      <header className="margin-rule" style={{ background: "#2B2621", color: "#F6F1E4" }}>
        <div className="max-w-5xl mx-auto px-6 pt-3 flex items-center justify-between" style={{ fontSize: "0.72rem", opacity: 0.7 }}>
          <span>
            {userLabel} · {role === "partner" ? "Partner" : "Staff"}
          </span>
          <button onClick={onLogout} className="underline">
            Log out
          </button>
        </div>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 style={{ fontFamily: "Georgia, serif", fontSize: "1.6rem", letterSpacing: "0.02em" }}>
              Trikut Snacks
            </h1>
            <p style={{ fontSize: "0.8rem", opacity: 0.75, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Three Peaks, One Great Taste — Ledger
            </p>
          </div>
          <div className="text-right">
            <p className="mono-num" style={{ fontSize: "1.4rem", color: totals.cashBalance >= 0 ? "#D7B872" : "#C0605F" }}>
              {formatNPR(totals.cashBalance)}
            </p>
            <p style={{ fontSize: "0.7rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Cash on hand
            </p>
          </div>
        </div>
        <nav className="max-w-5xl mx-auto px-6 flex gap-1" style={{ overflowX: "auto" }}>
          {[
            { id: "dashboard", label: "Dashboard" },
            { id: "transactions", label: "Transactions" },
            { id: "sales", label: "Sales" },
            { id: "customers", label: "Customers" },
            { id: "suppliers", label: "Suppliers" },
            { id: "stock", label: "Stock" },
            { id: "production", label: "Production" },
            { id: "capital", label: "Partner Capital", partnerOnly: true },
          ]
            .filter((t) => !t.partnerOnly || role === "partner")
            .map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  padding: "10px 16px",
                  fontSize: "0.85rem",
                  letterSpacing: "0.03em",
                  whiteSpace: "nowrap",
                  borderBottom: tab === t.id ? "3px solid #C08A2E" : "3px solid transparent",
                  color: tab === t.id ? "#F6F1E4" : "rgba(246,241,228,0.6)",
                  fontWeight: tab === t.id ? 600 : 400,
                }}
              >
                {t.label}
              </button>
            ))}
        </nav>
      </header>

      {error && (
        <div className="max-w-5xl mx-auto px-6 mt-4">
          <div style={{ background: "#F3E2E2", border: "1px solid #A63D40", padding: "8px 12px", fontSize: "0.85rem" }}>
            {error}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        {tab === "dashboard" && (
          <Dashboard
            totals={totals}
            chartData={chartData}
            categoryBreakdown={categoryBreakdown}
            recent={transactions.slice(0, 6)}
            totalReceivable={totalReceivable}
            totalInventoryValue={totalInventoryValue}
            lowStockItems={lowStockItems}
            stockFIFO={stockFIFO}
            totalPayable={totalPayable}
          />
        )}

        {tab === "transactions" && (
          <TransactionsView
            transactions={filteredTx}
            filterType={filterType}
            setFilterType={setFilterType}
            filterPartner={filterPartner}
            setFilterPartner={setFilterPartner}
            search={search}
            setSearch={setSearch}
            onAdd={() => setShowTxForm(true)}
            onDelete={deleteTransaction}
          />
        )}

        {tab === "capital" && role === "partner" && (
          <CapitalView
            partnerBalances={partnerBalances}
            capitalEntries={capitalEntries}
            onAdd={() => setShowCapForm(true)}
            onDelete={deleteCapitalEntry}
          />
        )}

        {tab === "customers" && (
          <CustomersView
            customers={customers}
            receivables={receivables}
            customerBalances={customerBalances}
            onAddCustomer={() => setShowCustomerForm(true)}
            onDeleteCustomer={deleteCustomer}
            onAddReceivable={(customerId) => setShowReceivableForm(customerId)}
            onDeleteReceivable={deleteReceivable}
          />
        )}

        {tab === "sales" && (
          <SalesView
            sales={sales}
            saleReturns={saleReturns}
            customers={customers}
            stockItems={stockItems}
            onAddSale={() => setShowSaleForm(true)}
            onAddReturn={() => setShowReturnForm(true)}
            onDeleteSale={deleteSale}
            onDeleteReturn={deleteSaleReturn}
            onGenerateBill={(entry, kind) => setBillEntry({ kind, entry })}
          />
        )}

        {tab === "stock" && (
          <StockView
            stockItems={stockItems}
            stockTx={stockTx}
            stockFIFO={stockFIFO}
            onAddItem={() => setShowStockItemForm(true)}
            onDeleteItem={deleteStockItem}
            onStockIn={(itemId) => setShowStockTxForm({ itemId, type: "in" })}
            onStockOut={(itemId) => setShowStockTxForm({ itemId, type: "out" })}
            onDeleteTx={deleteStockTx}
          />
        )}

        {tab === "suppliers" && (
          <SuppliersView
            suppliers={suppliers}
            payables={payables}
            supplierBalances={supplierBalances}
            purchases={purchases}
            stockItems={stockItems}
            onAddSupplier={() => setShowSupplierForm(true)}
            onDeleteSupplier={deleteSupplier}
            onAddPayable={(supplierId) => setShowPayableForm(supplierId)}
            onDeletePayable={deletePayable}
            onAddPurchase={() => setShowPurchaseForm(true)}
            onDeletePurchase={deletePurchase}
          />
        )}

        {tab === "production" && (
          <ProductionView
            productionBatches={productionBatches}
            stockItems={stockItems}
            onAdd={() => setShowProductionForm(true)}
            onDelete={deleteProductionBatch}
          />
        )}
      </main>

      {showTxForm && <TransactionForm onSave={addTransaction} onClose={() => setShowTxForm(false)} />}
      {showCapForm && <CapitalForm onSave={addCapitalEntry} onClose={() => setShowCapForm(false)} />}
      {showCustomerForm && <CustomerForm onSave={addCustomer} onClose={() => setShowCustomerForm(false)} />}
      {showReceivableForm && (
        <ReceivableForm
          customer={customers.find((c) => c.id === showReceivableForm)}
          onSave={addReceivable}
          onClose={() => setShowReceivableForm(null)}
        />
      )}
      {showStockItemForm && <StockItemForm onSave={addStockItem} onClose={() => setShowStockItemForm(false)} />}
      {showStockTxForm && (
        <StockTxForm
          item={stockItems.find((i) => i.id === showStockTxForm.itemId)}
          type={showStockTxForm.type}
          available={stockFIFO[showStockTxForm.itemId]?.currentQty || 0}
          onSave={addStockTx}
          onClose={() => setShowStockTxForm(null)}
        />
      )}
      {showSaleForm && (
        <SaleForm
          customers={customers}
          stockItems={stockItems.filter((i) => i.category === "Finished Good")}
          stockFIFO={stockFIFO}
          onSave={recordSale}
          onClose={() => setShowSaleForm(false)}
        />
      )}
      {showReturnForm && (
        <ReturnForm
          customers={customers}
          stockItems={stockItems.filter((i) => i.category === "Finished Good")}
          stockFIFO={stockFIFO}
          onSave={recordReturn}
          onClose={() => setShowReturnForm(false)}
        />
      )}
      {billEntry && (
        <InvoiceModal
          billEntry={billEntry}
          customers={customers}
          stockItems={stockItems}
          onClose={() => setBillEntry(null)}
        />
      )}
      {showSupplierForm && <SupplierForm onSave={addSupplier} onClose={() => setShowSupplierForm(false)} />}
      {showPayableForm && (
        <PayableForm
          supplier={suppliers.find((s) => s.id === showPayableForm)}
          onSave={addPayable}
          onClose={() => setShowPayableForm(null)}
        />
      )}
      {showProductionForm && (
        <ProductionForm
          stockItems={stockItems}
          stockFIFO={stockFIFO}
          onSave={recordProduction}
          onClose={() => setShowProductionForm(false)}
        />
      )}
      {showPurchaseForm && (
        <PurchaseForm
          suppliers={suppliers}
          stockItems={stockItems.filter((i) => i.category === "Raw Material")}
          onSave={recordPurchase}
          onClose={() => setShowPurchaseForm(false)}
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
  return (
    <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px 18px" }}>
      <p style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.6 }}>{label}</p>
      <p className="mono-num" style={{ fontSize: "1.5rem", marginTop: 4, color: colors[tone] || colors.ink }}>
        {formatNPR(value)}
      </p>
    </div>
  );
}

function Dashboard({ totals, chartData, categoryBreakdown, recent, totalReceivable, totalInventoryValue, lowStockItems, stockFIFO, totalPayable }) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
        <Card label="Total Income" value={totals.income} tone="green" />
        <Card label="Total Expenses" value={totals.expense} tone="red" />
        <Card label="Net Position" value={totals.net} tone={totals.net >= 0 ? "green" : "red"} />
        <Card label="Cash on Hand" value={totals.cashBalance} tone="gold" />
        <Card label="Owed by Customers" value={totalReceivable} tone="red" />
        <Card label="Owed to Suppliers" value={totalPayable} tone="red" />
        <Card label="Stock on Hand (FIFO)" value={totalInventoryValue} tone="green" />
      </div>

      {lowStockItems.length > 0 && (
        <div style={{ background: "#F3E2E2", border: "1px solid #A63D40", padding: "14px 16px" }}>
          <p style={{ fontSize: "0.8rem", fontWeight: 600, color: "#A63D40", marginBottom: 6 }}>
            ⚠ Low stock — {lowStockItems.length} item{lowStockItems.length > 1 ? "s" : ""} need reordering
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
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
          {chartData.length === 0 ? (
            <EmptyNote text="No transactions yet. Add your first entry to see cash flow here." />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(43,38,33,0.1)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#2B2621" }} />
                <YAxis tick={{ fontSize: 11, fill: "#2B2621" }} tickFormatter={(v) => `₨${v / 1000}k`} />
                <Tooltip formatter={(v) => formatNPR(v)} contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="income" stroke="#3F5D42" strokeWidth={2} dot={false} name="Income" />
                <Line type="monotone" dataKey="expense" stroke="#A63D40" strokeWidth={2} dot={false} name="Expense" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <div className="grid md:grid-cols-2 gap-8">
        <section>
          <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }} className="mb-3">
            Expense by category
          </h2>
          <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
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
          <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
            {recent.length === 0 ? (
              <div className="p-4">
                <EmptyNote text="Nothing logged yet." />
              </div>
            ) : (
              recent.map((t) => (
                <div key={t.id} className="ledger-rule flex justify-between items-center px-4 py-3 text-sm">
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

function EmptyNote({ text }) {
  return <p style={{ fontSize: "0.85rem", opacity: 0.55, fontStyle: "italic" }}>{text}</p>;
}

function TransactionsView({
  transactions,
  filterType,
  setFilterType,
  filterPartner,
  setFilterPartner,
  search,
  setSearch,
  onAdd,
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

      <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
        <div
          className="ledger-rule grid px-4 py-2"
          style={{ gridTemplateColumns: "90px 1fr 110px 90px 100px 30px", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", opacity: 0.6 }}
        >
          <span>Date</span>
          <span>Category / Note</span>
          <span>Partner</span>
          <span>Type</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span></span>
        </div>
        {transactions.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No transactions match. Try adjusting filters or add a new entry." />
          </div>
        ) : (
          transactions.map((t) => (
            <div
              key={t.id}
              className="ledger-rule grid px-4 py-3 items-center"
              style={{ gridTemplateColumns: "90px 1fr 110px 90px 100px 30px", fontSize: "0.85rem" }}
            >
              <span style={{ fontSize: "0.78rem", opacity: 0.7 }}>{t.date}</span>
              <span>
                {t.category}
                {t.note && <span style={{ opacity: 0.55 }}> — {t.note}</span>}
              </span>
              <span style={{ fontSize: "0.8rem" }}>{t.partner}</span>
              <span style={{ fontSize: "0.78rem", color: t.type === "income" ? "#3F5D42" : "#A63D40" }}>
                {t.type === "income" ? "Income" : "Expense"}
              </span>
              <span className="mono-num" style={{ textAlign: "right", color: t.type === "income" ? "#3F5D42" : "#A63D40" }}>
                {t.type === "income" ? "+" : "−"}
                {formatNPR(t.amount)}
              </span>
              <button onClick={() => onDelete(t.id)} style={{ opacity: 0.4 }} title="Delete">
                <Trash2 size={14} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function TransactionForm({ onSave, onClose }) {
  const [type, setType] = useState("expense");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const categories = type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  function handleTypeChange(newType) {
    setType(newType);
    setCategory(newType === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]);
  }

  function submit() {
    if (!amount || Number(amount) <= 0) return;
    onSave({ type, date, category, partner, amount: Number(amount), note });
  }

  return (
    <Modal onClose={onClose} title="Add transaction">
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
      <Field label="Amount (₨)">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          style={inputStyle}
        />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 25kg cheese powder" />
      </Field>

      <button onClick={submit} style={saveBtnStyle}>
        Save entry
      </button>
    </Modal>
  );
}

function CapitalView({ partnerBalances, capitalEntries, onAdd, onDelete }) {
  return (
    <div>
      <div className="grid md:grid-cols-3 gap-3 mb-6">
        {PARTNERS.map((p) => {
          const bal = partnerBalances[p];
          const net = bal.contributed - bal.withdrawn;
          return (
            <div key={p} style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)", padding: "16px" }}>
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

      <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
        {capitalEntries.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No capital contributions or withdrawals logged yet." />
          </div>
        ) : (
          capitalEntries.map((c) => (
            <div key={c.id} className="ledger-rule flex justify-between items-center px-4 py-3 text-sm">
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

function CapitalForm({ onSave, onClose }) {
  const [type, setType] = useState("contribution");
  const [date, setDate] = useState(todayISO());
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!amount || Number(amount) <= 0) return;
    onSave({ type, date, partner, amount: Number(amount), note });
  }

  return (
    <Modal onClose={onClose} title="Add capital entry">
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
      <Field label="Amount (₨)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save entry
      </button>
    </Modal>
  );
}

function CustomersView({
  customers,
  receivables,
  customerBalances,
  onAddCustomer,
  onDeleteCustomer,
  onAddReceivable,
  onDeleteReceivable,
}) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Customers & receivables</h2>
        <button
          onClick={onAddCustomer}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add customer
        </button>
      </div>

      {customers.length === 0 ? (
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
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
              <div key={c.id} style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
                <div
                  className="flex justify-between items-center px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                >
                  <div>
                    <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>
                      {c.name}
                      {c.location && <span style={{ fontSize: "0.75rem", marginLeft: 6 }}>📍</span>}
                    </p>
                    <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                      {c.phone}
                      {c.address && ` · ${c.address}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="mono-num" style={{ color: owed > 0 ? "#A63D40" : "#3F5D42", fontSize: "1.05rem" }}>
                        {formatNPR(owed)}
                      </p>
                      <p style={{ fontSize: "0.68rem", opacity: 0.55, textTransform: "uppercase" }}>
                        {owed > 0 ? "Owed to you" : "Settled"}
                      </p>
                    </div>
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
                      <button
                        onClick={() => onDeleteCustomer(c.id)}
                        style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        Remove customer
                      </button>
                    </div>
                    {custReceivables.length === 0 ? (
                      <EmptyNote text="No charges or payments recorded yet." />
                    ) : (
                      custReceivables.map((r) => (
                        <div key={r.id} className="ledger-rule flex justify-between items-center py-2 text-sm">
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
                            <button onClick={() => onDeleteReceivable(r.id)} style={{ opacity: 0.4 }}>
                              <Trash2 size={13} />
                            </button>
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

function CustomerForm({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
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
    onSave({ name: name.trim(), phone, address, location: location.trim(), note });
  }

  return (
    <Modal onClose={onClose} title="Add customer">
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="e.g. Himal Kirana Store" />
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
        Save customer
      </button>
    </Modal>
  );
}

function ReceivableForm({ customer, onSave, onClose }) {
  const [type, setType] = useState("charge");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!amount || Number(amount) <= 0 || !customer) return;
    onSave({ customerId: customer.id, type, date, amount: Number(amount), note });
  }

  return (
    <Modal onClose={onClose} title={`${customer ? customer.name : "Customer"} — record entry`}>
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
      <Field label="Amount (₨)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 10 cartons cheese chips" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save entry
      </button>
    </Modal>
  );
}

function StockView({ stockItems, stockTx, stockFIFO, onAddItem, onDeleteItem, onStockIn, onStockOut, onDeleteTx }) {
  const [expanded, setExpanded] = useState(null);

  const rawMaterials = stockItems.filter((i) => i.category === "Raw Material");
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");

  const columnValue = (items) => items.reduce((s, i) => s + (stockFIFO[i.id]?.currentValue || 0), 0);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Stock (FIFO valued)</h2>
        <button
          onClick={onAddItem}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add stock item
        </button>
      </div>

      {stockItems.length === 0 ? (
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No stock items yet. Add raw materials (potatoes, oil, seasoning, packaging) or finished goods (chips packets) to track quantity and FIFO cost." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-6">
          <StockColumn
            title="Raw Materials"
            items={rawMaterials}
            totalValue={columnValue(rawMaterials)}
            stockFIFO={stockFIFO}
            stockTx={stockTx}
            expanded={expanded}
            setExpanded={setExpanded}
            onStockIn={onStockIn}
            onStockOut={onStockOut}
            onDeleteItem={onDeleteItem}
            onDeleteTx={onDeleteTx}
          />
          <StockColumn
            title="Finished Goods"
            items={finishedGoods}
            totalValue={columnValue(finishedGoods)}
            stockFIFO={stockFIFO}
            stockTx={stockTx}
            expanded={expanded}
            setExpanded={setExpanded}
            onStockIn={onStockIn}
            onStockOut={onStockOut}
            onDeleteItem={onDeleteItem}
            onDeleteTx={onDeleteTx}
          />
        </div>
      )}
    </div>
  );
}

function StockColumn({ title, items, totalValue, stockFIFO, stockTx, expanded, setExpanded, onStockIn, onStockOut, onDeleteItem, onDeleteTx }) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2 px-1">
        <h3 style={{ fontFamily: "Georgia, serif", fontSize: "0.95rem" }}>{title}</h3>
        <span className="mono-num" style={{ fontSize: "0.8rem", color: "#C08A2E" }}>
          {formatNPR(totalValue)}
        </span>
      </div>
      {items.length === 0 ? (
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
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
              onDeleteItem={onDeleteItem}
              onDeleteTx={onDeleteTx}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StockItemCard({ item, fifo, stockTx, isOpen, onToggle, onStockIn, onStockOut, onDeleteItem, onDeleteTx }) {
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
            <button
              onClick={() => onDeleteItem(item.id)}
              style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
            >
              Remove item
            </button>
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
              .map((t) => (
                <div key={t.id} className="ledger-rule flex justify-between items-center py-2 text-sm">
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
                    <button onClick={() => onDeleteTx(t.id)} style={{ opacity: 0.4 }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
}

function StockItemForm({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Raw Material");
  const [unit, setUnit] = useState("kg");
  const [reorderLevel, setReorderLevel] = useState("");

  function submit() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), category, unit: unit.trim() || "unit", reorderLevel: Number(reorderLevel) || 0 });
  }

  return (
    <Modal onClose={onClose} title="Add stock item">
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
        Save item
      </button>
    </Modal>
  );
}

function StockTxForm({ item, type, available, onSave, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!item || !quantity || Number(quantity) <= 0) return;
    if (type === "in" && (!unitCost || Number(unitCost) < 0)) return;
    onSave({
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
    <Modal onClose={onClose} title={`${item ? item.name : "Item"} — ${type === "in" ? "stock in" : "stock out"}`}>
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label={`Quantity (${item ? item.unit : "unit"})`}>
        <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      {type === "in" && (
        <Field label={`Unit cost (₨ per ${item ? item.unit : "unit"})`}>
          <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} placeholder="0" />
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
        Save
      </button>
    </Modal>
  );
}

function SalesView({ sales, saleReturns, customers, stockItems, onAddSale, onAddReturn, onDeleteSale, onDeleteReturn, onGenerateBill }) {
  const customerName = (id) => customers.find((c) => c.id === id)?.name || "Cash sale";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || null;

  const combined = [
    ...sales.map((s) => ({ ...s, kind: "sale" })),
    ...saleReturns.map((r) => ({ ...r, kind: "return" })),
  ].sort((a, b) => (a.date === b.date ? 0 : b.date.localeCompare(a.date)));

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Sales & returns</h2>
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

      <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
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
          <span>Customer</span>
          <span>Cash / Credit</span>
          <span style={{ textAlign: "right" }}>Total</span>
          <span></span>
          <span></span>
        </div>

        {combined.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No sales recorded yet. Record a sale — split cash and credit however the customer paid." />
          </div>
        ) : (
          combined.map((entry) => {
            const isSale = entry.kind === "sale";
            const total = isSale ? Number(entry.cashAmount) + Number(entry.creditAmount) : Number(entry.cashRefund) + Number(entry.creditReduction);
            const cashPart = isSale ? entry.cashAmount : entry.cashRefund;
            const creditPart = isSale ? entry.creditAmount : entry.creditReduction;
            return (
              <div
                key={entry.id}
                className="ledger-rule grid px-4 py-3 items-center"
                style={{ gridTemplateColumns: "90px 1fr 130px 90px 100px 30px 30px", fontSize: "0.85rem" }}
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
                  {cashPart > 0 && <span style={{ color: "#3F5D42" }}>{formatNPR(cashPart)} cash</span>}
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
                <button onClick={() => (isSale ? onDeleteSale(entry.id) : onDeleteReturn(entry.id))} style={{ opacity: 0.4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SaleForm({ customers, stockItems, stockFIFO, onSave, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [note, setNote] = useState("");

  const total = Number(totalAmount) || 0;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);
  const available = itemId ? stockFIFO[itemId]?.currentQty || 0 : null;

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !customerId) return;
    onSave({
      date,
      customerId: customerId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      cashAmount: cash,
      creditAmount: credit,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title="Record sale">
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Customer">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
          <option value="">Cash sale — no customer</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
      <Field label="Total sale amount (₨)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Cash received now (₨)">
        <input
          type="number"
          value={cashAmount}
          onChange={(e) => setCashAmount(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!customerId}
        />
        {!customerId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No customer selected — full amount is treated as cash.</p>}
      </Field>
      {customerId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Cash: <span className="mono-num">{formatNPR(cash)}</span> · Credit to {customers.find((c) => c.id === customerId)?.name}:{" "}
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
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save sale
      </button>
    </Modal>
  );
}

function ReturnForm({ customers, stockItems, stockFIFO, onSave, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [cashRefund, setCashRefund] = useState("");
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [note, setNote] = useState("");

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
      date,
      customerId: customerId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      unitCost: itemId ? Number(unitCost) || 0 : 0,
      cashRefund: cash,
      creditReduction: credit,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title="Record sale return">
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Customer (needed if reducing credit owed)">
        <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} style={inputStyle}>
          <option value="">No customer — cash refund only</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
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
          <Field label="Restock unit cost (₨) — defaults to current average cost">
            <input type="number" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={inputStyle} />
          </Field>
        </>
      )}
      <Field label="Total return amount (₨)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Cash refunded now (₨)">
        <input
          type="number"
          value={cashRefund}
          onChange={(e) => setCashRefund(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!customerId}
        />
        {!customerId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No customer selected — full amount is a cash refund.</p>}
      </Field>
      {customerId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Cash refund: <span className="mono-num">{formatNPR(cash)}</span> · Reduces {customers.find((c) => c.id === customerId)?.name}'s balance owed by:{" "}
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
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. damaged packets" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save return
      </button>
    </Modal>
  );
}

function InvoiceModal({ billEntry, customers, stockItems, onClose }) {
  const { kind, entry } = billEntry;
  const isSale = kind === "sale";
  const customer = customers.find((c) => c.id === entry.customerId);
  const item = stockItems.find((i) => i.id === entry.itemId);
  const total = isSale ? Number(entry.cashAmount) + Number(entry.creditAmount) : Number(entry.cashRefund) + Number(entry.creditReduction);
  const cash = isSale ? Number(entry.cashAmount) : Number(entry.cashRefund);
  const credit = isSale ? Number(entry.creditAmount) : Number(entry.creditReduction);
  const invoiceNo = `${isSale ? "INV" : "CRN"}-${entry.id.slice(-6).toUpperCase()}`;
  const unitPrice = item && entry.quantity ? total / entry.quantity : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(43,38,33,0.5)", zIndex: 60 }}>
      <div style={{ background: "#fff", width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <div
          className="no-print flex justify-between items-center px-4 py-3"
          style={{ borderBottom: "1px solid rgba(43,38,33,0.15)" }}
        >
          <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "#2B2621" }}>
            {isSale ? "Bill preview" : "Credit note preview"}
          </span>
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
            <p style={{ margin: 0, fontWeight: 600 }}>{customer ? customer.name : "Cash sale / walk-in customer"}</p>
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

function SuppliersView({
  suppliers,
  payables,
  supplierBalances,
  purchases,
  stockItems,
  onAddSupplier,
  onDeleteSupplier,
  onAddPayable,
  onDeletePayable,
  onAddPurchase,
  onDeletePurchase,
}) {
  const [expanded, setExpanded] = useState(null);
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.name || "—";
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || null;

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Purchases</h2>
        <button
          onClick={onAddPurchase}
          className="flex items-center gap-1"
          style={{ background: "#A63D40", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record purchase
        </button>
      </div>

      <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="mb-8">
        <div
          className="ledger-rule grid px-4 py-2"
          style={{
            gridTemplateColumns: "90px 1fr 130px 90px 100px 30px",
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
        </div>
        {purchases.length === 0 ? (
          <div className="p-6">
            <EmptyNote text="No purchases recorded yet. Record a purchase — it logs the expense, stocks in the raw material, and tracks any credit owed, all in one go." />
          </div>
        ) : (
          purchases.map((p) => {
            const total = Number(p.cashAmount) + Number(p.creditAmount);
            return (
              <div
                key={p.id}
                className="ledger-rule grid px-4 py-3 items-center"
                style={{ gridTemplateColumns: "90px 1fr 130px 90px 100px 30px", fontSize: "0.85rem" }}
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
                <button onClick={() => onDeletePurchase(p.id)} style={{ opacity: 0.4 }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Suppliers & payables</h2>
        <button
          onClick={onAddSupplier}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Add supplier
        </button>
      </div>

      {suppliers.length === 0 ? (
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
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
              <div key={s.id} style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }}>
                <div
                  className="flex justify-between items-center px-4 py-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : s.id)}
                >
                  <div>
                    <p style={{ fontFamily: "Georgia, serif", fontSize: "1rem" }}>{s.name}</p>
                    <p style={{ fontSize: "0.75rem", opacity: 0.6 }}>
                      {s.phone}
                      {s.address && ` · ${s.address}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="mono-num" style={{ color: owed > 0 ? "#A63D40" : "#3F5D42", fontSize: "1.05rem" }}>
                      {formatNPR(owed)}
                    </p>
                    <p style={{ fontSize: "0.68rem", opacity: 0.55, textTransform: "uppercase" }}>
                      {owed > 0 ? "You owe" : "Settled"}
                    </p>
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
                      <button
                        onClick={() => onDeleteSupplier(s.id)}
                        style={{ background: "#F0EBDD", padding: "6px 12px", fontSize: "0.78rem" }}
                      >
                        Remove supplier
                      </button>
                    </div>
                    {supPayables.length === 0 ? (
                      <EmptyNote text="No charges or payments recorded yet." />
                    ) : (
                      supPayables.map((p) => (
                        <div key={p.id} className="ledger-rule flex justify-between items-center py-2 text-sm">
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
                            <button onClick={() => onDeletePayable(p.id)} style={{ opacity: 0.4 }}>
                              <Trash2 size={13} />
                            </button>
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

function SupplierForm({ onSave, onClose }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), phone, address, note });
  }

  return (
    <Modal onClose={onClose} title="Add supplier">
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
        Save supplier
      </button>
    </Modal>
  );
}

function PayableForm({ supplier, onSave, onClose }) {
  const [type, setType] = useState("charge");
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  function submit() {
    if (!amount || Number(amount) <= 0 || !supplier) return;
    onSave({ supplierId: supplier.id, type, date, amount: Number(amount), note });
  }

  return (
    <Modal onClose={onClose} title={`${supplier ? supplier.name : "Supplier"} — record entry`}>
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
      <Field label="Amount (₨)">
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. 25kg cheese powder" />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save entry
      </button>
    </Modal>
  );
}

function ProductionView({ productionBatches, stockItems, onAdd, onDelete }) {
  const itemName = (id) => stockItems.find((i) => i.id === id)?.name || "—";
  const itemUnit = (id) => stockItems.find((i) => i.id === id)?.unit || "";

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>Production batches</h2>
        <button
          onClick={onAdd}
          className="flex items-center gap-1"
          style={{ background: "#2B2621", color: "#F6F1E4", padding: "8px 14px", fontSize: "0.85rem" }}
        >
          <Plus size={15} /> Record production
        </button>
      </div>

      {productionBatches.length === 0 ? (
        <div style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-6">
          <EmptyNote text="No production batches yet. Record raw materials used and finished goods produced — cost flows through automatically via FIFO." />
        </div>
      ) : (
        <div className="space-y-3">
          {productionBatches.map((b) => (
            <div key={b.id} style={{ background: "#FFFDF8", border: "1px solid rgba(43,38,33,0.15)" }} className="p-4">
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
                <button onClick={() => onDelete(b.id)} style={{ opacity: 0.4 }}>
                  <Trash2 size={14} />
                </button>
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

function ProductionForm({ stockItems, stockFIFO, onSave, onClose }) {
  const rawMaterials = stockItems.filter((i) => i.category === "Raw Material");
  const finishedGoods = stockItems.filter((i) => i.category === "Finished Good");

  const [date, setDate] = useState(todayISO());
  const [inputs, setInputs] = useState([{ itemId: "", quantity: "" }]);
  const [outputItemId, setOutputItemId] = useState("");
  const [outputQuantity, setOutputQuantity] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [overheadCost, setOverheadCost] = useState("");
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [note, setNote] = useState("");

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
      date,
      inputs: validInputs.map((inp) => ({ itemId: inp.itemId, quantity: Number(inp.quantity) })),
      outputItemId,
      outputQuantity: Number(outputQuantity),
      laborCost: Number(laborCost) || 0,
      overheadCost: Number(overheadCost) || 0,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title="Record production batch">
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
      <Field label="Labor cost (₨, optional)">
        <input type="number" value={laborCost} onChange={(e) => setLaborCost(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Overhead cost (₨, optional)">
        <input type="number" value={overheadCost} onChange={(e) => setOverheadCost(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>

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
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} placeholder="e.g. cheese chips batch #4" />
      </Field>

      <button onClick={submit} style={saveBtnStyle}>
        Save production batch
      </button>
    </Modal>
  );
}

function PurchaseForm({ suppliers, stockItems, onSave, onClose }) {
  const [date, setDate] = useState(todayISO());
  const [supplierId, setSupplierId] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [partner, setPartner] = useState(PARTNERS[0]);
  const [note, setNote] = useState("");

  const total = Number(totalAmount) || 0;
  const cash = Math.min(Number(cashAmount) || 0, total);
  const credit = Math.max(total - cash, 0);

  function submit() {
    if (total <= 0) return;
    if (credit > 0 && !supplierId) return;
    onSave({
      date,
      supplierId: supplierId || null,
      itemId: itemId || null,
      quantity: itemId ? Number(quantity) || 0 : 0,
      cashAmount: cash,
      creditAmount: credit,
      category,
      partner,
      note,
    });
  }

  return (
    <Modal onClose={onClose} title="Record purchase">
      <Field label="Date">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} />
      </Field>
      <Field label="Supplier">
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} style={inputStyle}>
          <option value="">Cash purchase — no supplier</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
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
      <Field label="Total purchase amount (₨)">
        <input type="number" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} style={inputStyle} placeholder="0" />
      </Field>
      <Field label="Cash paid now (₨)">
        <input
          type="number"
          value={cashAmount}
          onChange={(e) => setCashAmount(e.target.value)}
          style={inputStyle}
          placeholder={total ? String(total) : "0"}
          disabled={!supplierId}
        />
        {!supplierId && <p style={{ fontSize: "0.72rem", opacity: 0.55, marginTop: 4 }}>No supplier selected — full amount is treated as cash.</p>}
      </Field>
      {supplierId && (
        <p style={{ fontSize: "0.8rem", marginBottom: 10 }}>
          Cash: <span className="mono-num">{formatNPR(cash)}</span> · Credit owed to {suppliers.find((s) => s.id === supplierId)?.name}:{" "}
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
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} />
      </Field>
      <button onClick={submit} style={saveBtnStyle}>
        Save purchase
      </button>
    </Modal>
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
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(43,38,33,0.45)", zIndex: 50 }}
    >
      <div style={{ background: "#F6F1E4", border: "1px solid rgba(43,38,33,0.2)", width: "100%", maxWidth: 420, padding: "20px" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ fontFamily: "Georgia, serif", fontSize: "1.1rem" }}>{title}</h3>
          <button onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
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

const saveBtnStyle = {
  width: "100%",
  background: "#2B2621",
  color: "#F6F1E4",
  padding: "10px",
  fontSize: "0.9rem",
  marginTop: "6px",
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
