"use client";

import { useEffect, useState, useCallback } from "react";
import { getOrders, getOrder, type Order, type OrderDetail } from "@/lib/api";
import { Modal } from "@/components/modal";
import { formatPence, formatDateTime } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
  refunded: "bg-yellow-100 text-yellow-700",
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(0);
  const limit = 20;

  // Order detail modal
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getOrders({
        status: statusFilter || undefined,
        limit,
        offset: page * limit,
      });
      setOrders(result.orders);
      setTotal(result.total);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { load(); }, [load]);

  async function openDetail(orderId: string) {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      setDetail(await getOrder(orderId));
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <p className="mt-1 text-sm text-gray-500">{total} total orders</p>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
          <option value="voided">Voided</option>
          <option value="refunded">Refunded</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left text-gray-500">
              <th className="px-4 py-3 font-medium">Order #</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 text-right font-medium">Subtotal</th>
              <th className="px-4 py-3 text-right font-medium">Tax</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No orders found
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => openDetail(order.id)}
                  className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900">
                    {order.orderNumber}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {formatDateTime(order.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {order.customerName || "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatPence(order.subtotal)}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {formatPence(order.taxTotal)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    {formatPence(order.total)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Page {page + 1} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-md border border-gray-300 px-3 py-1 text-sm disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      <Modal
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detail ? `Order ${detail.orderNumber}` : "Order Details"}
      >
        {detailLoading ? (
          <p className="text-gray-500">Loading...</p>
        ) : detail ? (
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Status</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                  STATUS_STYLES[detail.status] || "bg-gray-100"
                }`}
              >
                {detail.status}
              </span>
            </div>
            {detail.marginPercent !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Margin</span>
                <span className="font-medium">{detail.marginPercent}%</span>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium text-gray-700">Items</p>
              {detail.items.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between border-b border-gray-100 py-1 text-sm"
                >
                  <span>
                    {item.quantity}x {item.name}
                  </span>
                  <span className="text-gray-600">
                    {formatPence(item.total)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{formatPence(detail.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tax</span>
                <span>{formatPence(detail.taxTotal)}</span>
              </div>
              {detail.discountTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Discount</span>
                  <span className="text-red-600">
                    -{formatPence(detail.discountTotal)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-medium">
                <span>Total</span>
                <span>{formatPence(detail.total)}</span>
              </div>
            </div>

            {detail.payments.length > 0 && (
              <div className="border-t pt-3">
                <p className="mb-2 text-sm font-medium text-gray-700">
                  Payments
                </p>
                {detail.payments.map((p, i) => (
                  <div
                    key={i}
                    className="flex justify-between text-sm"
                  >
                    <span className="capitalize text-gray-600">
                      {p.paymentMethod}
                      {p.cardLast4 ? ` ****${p.cardLast4}` : ""}
                    </span>
                    <span>{formatPence(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-gray-500">Failed to load order</p>
        )}
      </Modal>
    </div>
  );
}
