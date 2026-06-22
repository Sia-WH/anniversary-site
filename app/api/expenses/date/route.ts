import { NextResponse } from 'next/server'

export async function GET() {
    return NextResponse.json(
        {
            error: 'This endpoint is deprecated. Use /api/expenses/summary with an authenticated user token.',
        },
        { status: 410 }
    )
}
