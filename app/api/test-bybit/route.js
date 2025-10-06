// app/api/test-bybit/route.ts
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const start = Date.now();
    const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear', {
      next: { revalidate: 0 }
    });
    const elapsed = Date.now() - start;
    
    const data = await res.json();
    
    return NextResponse.json({
      success: res.ok,
      status: res.status,
      elapsed: `${elapsed}ms`,
      headers: Object.fromEntries(res.headers.entries()),
      dataPreview: data.result?.list?.slice(0, 2) // First 2 items
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      name: error.name,
      cause: error.cause
    }, { status: 500 });
  }
}