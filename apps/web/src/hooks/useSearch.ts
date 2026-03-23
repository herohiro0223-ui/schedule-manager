'use client';

import { useState, useCallback } from 'react';
import { supabase, type Appointment } from '../lib/supabase';

// ひらがな・カタカナを含むかチェック
function containsKana(str: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF]/.test(str);
}

// ひらがな → カタカナ変換
function toKatakana(str: string): string {
  return str.replace(/[\u3041-\u3096]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

// カタカナ → ひらがな変換
function toHiragana(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function useSearch() {
  const [results, setResults] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  const search = useCallback(async (keyword: string) => {
    setQuery(keyword);
    if (!keyword.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);

    const trimmed = keyword.trim();
    // スペースを除去した版も用意（「さとう えみ」→「さとうえみ」）
    const noSpace = trimmed.replace(/\s+/g, '');
    const katakana = toKatakana(trimmed);
    const katakanaNoSpace = toKatakana(noSpace);
    const hiragana = toHiragana(trimmed);
    const hiraganaNoSpace = toHiragana(noSpace);

    // 検索条件を構築
    const filters = new Set<string>();

    // 元のキーワードで検索
    filters.add(`customer_name.ilike.%${trimmed}%`);
    filters.add(`title.ilike.%${trimmed}%`);
    filters.add(`staff_name.ilike.%${trimmed}%`);

    // カタカナ変換版でも検索（ひらがな入力 → カタカナ名にヒット）
    if (containsKana(trimmed)) {
      filters.add(`customer_name.ilike.%${katakana}%`);
      filters.add(`customer_name.ilike.%${katakanaNoSpace}%`);
      filters.add(`customer_name.ilike.%${hiragana}%`);
      filters.add(`customer_name.ilike.%${hiraganaNoSpace}%`);
    }

    // customer_name_kana カラムでも検索（存在すれば）
    filters.add(`customer_name_kana.ilike.%${trimmed}%`);
    if (containsKana(trimmed)) {
      filters.add(`customer_name_kana.ilike.%${hiragana}%`);
      filters.add(`customer_name_kana.ilike.%${hiraganaNoSpace}%`);
    }

    // かな辞書テーブルから漢字名を引く（テーブルが存在すれば）
    if (containsKana(trimmed)) {
      try {
        const { data: kanaMatches } = await supabase
          .from('customer_kana')
          .select('name')
          .or(`name_kana.ilike.%${hiragana}%,name_kana.ilike.%${hiraganaNoSpace}%`)
          .limit(20);

        if (kanaMatches && kanaMatches.length > 0) {
          for (const row of kanaMatches) {
            filters.add(`customer_name.ilike.%${row.name}%`);
          }
        }
      } catch {
        // テーブルが無くてもスキップ
      }
    }

    const { data, error } = await supabase
      .from('appointments')
      .select('*')
      .or([...filters].join(','))
      .order('date', { ascending: false })
      .order('start_time', { ascending: true })
      .limit(50);

    if (!error && data) {
      setResults(data);
    }
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setQuery('');
    setResults([]);
  }, []);

  return { results, loading, query, search, clear };
}
