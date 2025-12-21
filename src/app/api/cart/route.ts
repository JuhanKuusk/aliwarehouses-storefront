import { NextRequest, NextResponse } from "next/server";
import {
  createCart,
  getCart,
  addToCart,
  updateCart,
  removeFromCart,
} from "@/lib/shopify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cartId = searchParams.get("cartId");

  if (!cartId) {
    return NextResponse.json({ cart: null });
  }

  try {
    const cart = await getCart(cartId);
    return NextResponse.json({ cart });
  } catch (error) {
    console.error("Failed to get cart:", error);
    return NextResponse.json({ cart: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, cartId, merchandiseId, quantity, lineId } = body;

    let cart;

    switch (action) {
      case "add":
        if (cartId) {
          // Add to existing cart
          cart = await addToCart(cartId, [{ merchandiseId, quantity }]);
        } else {
          // Create new cart with item
          cart = await createCart([{ merchandiseId, quantity }]);
        }
        break;

      case "update":
        if (!cartId || !lineId) {
          return NextResponse.json(
            { error: "Missing cartId or lineId" },
            { status: 400 }
          );
        }
        cart = await updateCart(cartId, [{ id: lineId, quantity }]);
        break;

      case "remove":
        if (!cartId || !lineId) {
          return NextResponse.json(
            { error: "Missing cartId or lineId" },
            { status: 400 }
          );
        }
        cart = await removeFromCart(cartId, [lineId]);
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ cart });
  } catch (error) {
    console.error("Cart action failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cart action failed" },
      { status: 500 }
    );
  }
}
