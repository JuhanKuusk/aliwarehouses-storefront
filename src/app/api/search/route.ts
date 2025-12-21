import { NextRequest, NextResponse } from "next/server";
import { searchProducts } from "@/lib/shopify";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.trim().length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const products = await searchProducts(query, 10);
    return NextResponse.json({ products });
  } catch (error) {
    console.error("Search failed:", error);
    return NextResponse.json({ products: [], error: "Search failed" }, { status: 500 });
  }
}
