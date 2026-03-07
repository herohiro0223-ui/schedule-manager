import { chromium, type Browser, type BrowserContext } from 'playwright';
import { supabase } from './supabase.js';

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
  });
}

/**
 * Supabase からセッションを読み込み、BrowserContext を作成
 */
export async function getContext(
  browser: Browser,
  sessionName: string,
  options?: { viewport?: { width: number; height: number } }
): Promise<BrowserContext> {
  const viewport = options?.viewport ?? { width: 1280, height: 800 };

  try {
    const { data } = await supabase
      .from('browser_sessions')
      .select('session_data')
      .eq('service', sessionName)
      .single();

    if (data?.session_data) {
      const context = await browser.newContext({
        storageState: data.session_data as any,
        viewport,
        locale: 'ja-JP',
      });
      console.log(`Session loaded from Supabase: ${sessionName}`);
      return context;
    }
  } catch {
    // セッションなし → 新規コンテキスト
  }

  const context = await browser.newContext({
    viewport,
    locale: 'ja-JP',
  });
  return context;
}

/**
 * セッションを Supabase に保存
 */
export async function saveSession(
  context: BrowserContext,
  sessionName: string
): Promise<void> {
  const sessionData = await context.storageState();

  const { error } = await supabase
    .from('browser_sessions')
    .upsert({
      service: sessionName,
      session_data: sessionData,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'service' });

  if (error) {
    console.error(`Session save failed: ${error.message}`);
    throw error;
  }
  console.log(`Session saved to Supabase: ${sessionName}`);
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function today(): string {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}
