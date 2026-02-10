"use client";

import { useState } from "react";
import {
  getSalesReport,
  getItemsReport,
  getVatReport,
  type SalesReport,
  type ItemsReport,
  type VatReport,
} from "@/lib/api";
import { formatPence, formatPercent, todayISO, thirtyDaysAgoISO } from "@/lib/utils";

type Tab = "sales" | "items" | "vat";

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>("sales");
  const [from, setFrom] = useState(thirtyDaysAgoISO());
  const [to, setTo] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [sales, setSales] = useState<SalesReport | null>(null);
  const [items, setItems] = useState<ItemsReport | null>(null);
  const [vat, setVat] = useState<VatReport | null>(null);

  async function loadReport() {
    setLoading(true);
    setError("");
    try {
      if (tab === "sales") setSales(await getSalesReport(from, to));
      else if (tab === "items") setItems(await getItemsReport(from, to));
      else setVat(await getVatReport(from, to));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "sales", label: "Sales" },
    { key: "items", label: "Items" },
    { key: "vat", label: "VAT" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Reports</h1>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            From
          </label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="mt-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          onClick={loadReport}
          disabled={loading}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Generate"}
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sales Report */}
      {tab === "sales" && sales && (
        <div>
          {/* Period totals */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Revenue</p>
              <p className="text-xl font-bold">
                {formatPence(sales.totals.totalRevenue)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Orders</p>
              <p className="text-xl font-bold">{sales.totals.totalOrders}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Gross Profit</p>
              <p className="text-xl font-bold">
                {formatPence(sales.totals.grossProfit)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Margin</p>
              <p className="text-xl font-bold">
                {formatPercent(sales.totals.marginPercent)}
              </p>
            </div>
          </div>

          {/* Daily breakdown */}
          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                  <th className="px-4 py-3 text-right font-medium">Cost</th>
                  <th className="px-4 py-3 text-right font-medium">Profit</th>
                  <th className="px-4 py-3 text-right font-medium">Margin</th>
                </tr>
              </thead>
              <tbody>
                {sales.daily.map((day) => (
                  <tr key={day.date} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{day.date}</td>
                    <td className="px-4 py-2 text-right">{day.totalOrders}</td>
                    <td className="px-4 py-2 text-right">
                      {formatPence(day.totalRevenue)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600">
                      {formatPence(day.totalCost)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPence(day.grossProfit)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPercent(day.marginPercent)}
                    </td>
                  </tr>
                ))}
                {sales.daily.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Items Report */}
      {tab === "items" && items && (
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 text-right font-medium">Qty Sold</th>
                <th className="px-4 py-3 text-right font-medium">Revenue</th>
                <th className="px-4 py-3 text-right font-medium">Cost</th>
                <th className="px-4 py-3 text-right font-medium">Profit</th>
                <th className="px-4 py-3 text-right font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {items.items.map((item) => (
                <tr
                  key={item.menuItemId}
                  className="border-t border-gray-100"
                >
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {item.name}
                  </td>
                  <td className="px-4 py-2 text-right">{item.quantitySold}</td>
                  <td className="px-4 py-2 text-right">
                    {formatPence(item.revenue)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {formatPence(item.cost)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatPence(item.grossProfit)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {formatPercent(item.marginPercent)}
                  </td>
                </tr>
              ))}
              {items.items.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    No data for this period
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VAT Report */}
      {tab === "vat" && vat && (
        <div>
          <div className="mb-4 flex gap-4">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Total Taxable</p>
              <p className="text-xl font-bold">
                {formatPence(vat.totalTaxableAmount)}
              </p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-gray-500">Total VAT</p>
              <p className="text-xl font-bold">
                {formatPence(vat.totalTaxAmount)}
              </p>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left text-gray-500">
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3 text-right font-medium">%</th>
                  <th className="px-4 py-3 text-right font-medium">
                    Taxable Amount
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    VAT Amount
                  </th>
                  <th className="px-4 py-3 text-right font-medium">Orders</th>
                </tr>
              </thead>
              <tbody>
                {vat.breakdown.map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    <td className="px-4 py-2 font-medium">{row.rateName}</td>
                    <td className="px-4 py-2 text-right">
                      {(row.rateValue * 100).toFixed(1)}%
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPence(row.taxableAmount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {formatPence(row.taxAmount)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.orderCount}
                    </td>
                  </tr>
                ))}
                {vat.breakdown.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No data for this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prompt to generate */}
      {!loading &&
        ((tab === "sales" && !sales) ||
          (tab === "items" && !items) ||
          (tab === "vat" && !vat)) && (
          <p className="text-center text-sm text-gray-500">
            Select a date range and click Generate to view the report.
          </p>
        )}
    </div>
  );
}
