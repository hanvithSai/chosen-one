import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { runTool, toolInputs, type McpToolContext, type ToolName } from "./tools.js";

const DESCRIPTIONS: Record<ToolName, string> = {
  search_products:
    "Search this shop's products by what the shopper wants. Returns SKU, title, price and a short summary.",
  get_product: "Get full details for one product by SKU, including materials, size and care facts.",
  get_store_policies:
    "Get the shop's shipping, delivery time, returns-relevant and gift-wrap policies. Check this before buying.",
  create_cart:
    "Create a priced cart for items and a delivery address. Prices, shipping and delivery dates are computed by the store.",
  checkout_cart:
    "Start PayPal checkout for a ready cart. Returns a PayPal approval link for the human shopper to approve.",
  get_order_status: "Check whether the PayPal payment for a cart was approved and captured.",
};

export function createMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({ name: "chosen-one-store", version: "0.1.0" });
  for (const name of Object.keys(toolInputs) as ToolName[]) {
    server.registerTool(
      name,
      { description: DESCRIPTIONS[name], inputSchema: toolInputs[name] },
      (async (args: unknown) => runTool(ctx, name, args)) as never,
    );
  }
  return server;
}
