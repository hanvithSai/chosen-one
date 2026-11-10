import { payPalCartWritableSchema, type PayPalCartWritable } from "../commerce/cartSpec.js";
import { Router, type NextFunction, type Request, type Response } from "express";
import { agentClientFrom, requireBearerToken } from "./auth.js";
import { CartError, type CartContext, type CartService } from "../commerce/cart.js";

export interface CartRoutesOptions {
  cartService: CartService;
  /** Bearer token agents must present (stand-in for the PayPal-issued JWT in Store Sync). */
  storeApiToken: string;
}

/** Store Sync Cart API v1 routes, following @paypal/agentic-commerce-spec. */
export function cartRoutes({ cartService, storeApiToken }: CartRoutesOptions): Router {
  const router = Router();

  router.use(requireBearerToken(storeApiToken));

  const parseBody = (req: Request): PayPalCartWritable => {
    const parsed = payPalCartWritableSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      throw new CartError(400, {
        name: "INVALID_REQUEST",
        message: "Request body does not match the Cart API v1 schema.",
        details: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          issue: "INVALID_PARAMETER_VALUE",
          description: issue.message,
        })),
      });
    }
    return parsed.data as PayPalCartWritable;
  };

  const ctx = (req: Request): CartContext => ({ agentClient: agentClientFrom(req) });

  router.post("/", async (req, res) => {
    res.status(201).json(await cartService.create(parseBody(req), ctx(req)));
  });

  router.get("/:cartId", async (req, res) => {
    res.json(await cartService.get(req.params.cartId));
  });

  router.put("/:cartId", async (req, res) => {
    res.json(await cartService.update(req.params.cartId, parseBody(req), ctx(req)));
  });

  router.post("/:cartId/checkout", async (req, res) => {
    res.json(await cartService.checkout(req.params.cartId, parseBody(req), ctx(req)));
  });

  router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof CartError) {
      res.status(err.status).json(err.body);
      return;
    }
    next(err);
  });

  return router;
}
