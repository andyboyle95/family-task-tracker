import { NextRequest, NextResponse } from 'next/server'
import { parseNaturalLanguage } from '@/lib/nlp'

export async function POST(request: NextRequest) {
  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

  const result = await parseNaturalLanguage(text)
  return NextResponse.json(result)
}
