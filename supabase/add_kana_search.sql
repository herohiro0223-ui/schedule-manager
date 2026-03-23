-- ===== 1. appointments テーブルにかなカラム追加 =====
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS customer_name_kana text;

-- ===== 2. かな辞書テーブル作成 =====
CREATE TABLE IF NOT EXISTS customer_kana (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  name_kana text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customer_kana ENABLE ROW LEVEL SECURITY;

-- ポリシーが既にあればスキップ
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_kana' AND policyname = 'Allow public read kana') THEN
    CREATE POLICY "Allow public read kana" ON customer_kana FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customer_kana' AND policyname = 'Allow service role write kana') THEN
    CREATE POLICY "Allow service role write kana" ON customer_kana FOR ALL USING (true);
  END IF;
END $$;

-- ===== 3. お客様かな辞書データ投入 =====
INSERT INTO customer_kana (name, name_kana) VALUES
  ('中澤 礼美', 'なかざわ れみ'),
  ('今野 由起子', 'こんの ゆきこ'),
  ('佐々木 香奈', 'ささき かな'),
  ('佐田 春菜', 'さた はるな'),
  ('佐藤 恵美', 'さとう えみ'),
  ('佐藤 舞', 'さとう まい'),
  ('佐藤 達雄', 'さとう たつお'),
  ('内海 来夏', 'うつみ らいか'),
  ('加藤 勢津子', 'かとう せつこ'),
  ('垂石 円華', 'たるいし まどか'),
  ('大場 唯華', 'おおば ゆいか'),
  ('大槻 弘子', 'おおつき ひろこ'),
  ('大野 麻子', 'おおの あさこ'),
  ('安田 加代子', 'やすだ かよこ'),
  ('小幡 昭', 'おばた あきら'),
  ('山本 里美', 'やまもと さとみ'),
  ('岩田 知恵', 'いわた ちえ'),
  ('嶺岸 ゆかり', 'みねぎし ゆかり'),
  ('嶺岸 久美', 'みねぎし くみ'),
  ('嶺岸 美幸', 'みねぎし みゆき'),
  ('庄子 佳恵', 'しょうじ よしえ'),
  ('戸田 美智子', 'とだ みちこ'),
  ('松浦 恵理子', 'まつうら えりこ'),
  ('橋本 菜捺子', 'はしもと ななこ'),
  ('渡辺 小雪', 'わたなべ こゆき'),
  ('秋葉 美苗子', 'あきば みなこ'),
  ('菅野 博康', 'かんの ひろやす'),
  ('菅野 詩子', 'かんの うたこ'),
  ('菊地 操子', 'きくち みさこ'),
  ('菊地 梨沙', 'きくち りさ'),
  ('菊池 悠司', 'きくち ゆうじ'),
  ('藤原 愛華', 'ふじわら あいか'),
  ('藤原 直美', 'ふじわら なおみ'),
  ('関 恵梨香', 'せき えりか'),
  ('阿部 夕奈', 'あべ ゆうな'),
  ('阿部 実香', 'あべ みか'),
  ('高橋 歩莉', 'たかはし あゆり'),
  ('高橋 泉', 'たかはし いずみ'),
  ('麻生 裕貴', 'あそう ゆうき'),
  ('齋藤 暢博', 'さいとう のぶひろ'),
  ('齋藤 美羽', 'さいとう みう'),
  ('ボロル 瑞穂', 'ぼろる みずほ')
ON CONFLICT (name) DO UPDATE SET name_kana = EXCLUDED.name_kana;
