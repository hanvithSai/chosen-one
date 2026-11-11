import { Card } from "./ui";

const TOOLS: [string, string][] = [
  ["search_products", "Find products for what the shopper wants"],
  ["get_product", "Full details and facts for one product"],
  ["get_store_policies", "Shipping, delivery time, returns and gift wrap"],
  ["create_cart", "A cart priced by the store, never by the agent"],
  ["checkout_cart", "Start PayPal checkout; returns a link for the human to approve"],
  ["get_order_status", "Whether the PayPal payment was captured"],
];

export function ConnectTab() {
  const origin = window.location.origin;
  const mcp = [
    `URL:     ${origin}/mcp`,
    "Header:  Authorization: Bearer <store token from the README>",
    "Header:  X-Agent-Client: my-agent   (shows up in attribution)",
  ].join("\n");
  const curl = [
    `curl -X POST ${origin}/merchant-cart \\`,
    '  -H "Authorization: Bearer <store token>" \\',
    '  -H "Content-Type: application/json" \\',
    `  -d '{"items":[{"item_id":"MB-MUG-MONSOON","quantity":1}],`,
    `       "shipping_address":{"country_code":"US","postal_code":"78701"}}'`,
  ].join("\n");
  return (
    <div className="grid gap-6">
      <Card
        title="Let any AI agent shop at Mayabazar"
        subtitle="The store speaks MCP and PayPal's Store Sync Cart API, so agents can search, build a cart and check out. The human approves the payment on PayPal."
      >
        <h3 className="text-sm font-semibold">MCP server (streamable HTTP)</h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 text-sm text-clay-50">{mcp}</pre>
        <h3 className="mt-5 text-sm font-semibold">Tools</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {TOOLS.map(([name, text]) => (
            <li key={name}>
              <code className="rounded bg-clay-50 px-1.5 py-0.5">{name}</code>{" "}
              <span className="text-stone-600">{text}</span>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-sm font-semibold">Cart API v1 (PayPal Store Sync)</h3>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-ink p-4 text-sm text-clay-50">
          {curl}
        </pre>
        <p className="mt-4 text-sm text-stone-600">
          Payments use the PayPal sandbox only, so no real money moves. The sandbox buyer login is
          in the README.
        </p>
      </Card>
    </div>
  );
}
