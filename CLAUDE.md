# エモマップ

感情ワンタップ記録PWA。企画メモは `C:\Users\うんごりら\Documents\エモマップ_企画メモ.md`（決定事項・ロードマップの正はそちら）。

## 確定事項

- Phase 1 はローカルファースト: 記録は localStorage のみ、サーバーなし・費用0円。Supabase は v2（集合統計）から
- 感情マスタはデータ駆動（`app.js` の `DEFAULT_EMOTIONS` + localStorage 上書き）。設定画面から追加・削除可。ログには絵文字・ラベルのスナップショットを保存するためマスタ変更で過去記録は壊れない
- 位置は端末側で約1kmメッシュに丸めてから保存（生の緯度経度は保持しない）
- 天気は Open-Meteo（キー不要）。記録時に非同期で付与、失敗しても記録自体は成立
- ビルドツールなしの素のHTML/CSS/JS。デプロイは GitHub Pages 予定

## 構成

- `index.html` — 3画面（記録/統計/設定）+ 下部ナビ
- `app.js` — 全ロジック。localStorage キー: `emomap_emotions`, `emomap_logs`
- `sw.js` — アプリシェルのキャッシュのみ（外部APIはキャッシュしない）

## 次タスク

1. GitHub リポジトリ作成（gh CLIなし → funnnnu がWebで作成、push は Git Credential Manager 経由）+ GitHub Pages 公開
2. 実機（スマホ）でホーム画面追加・位置情報許可の動作確認
3. 週次レポート画面 / 気圧との相関表示

## リリース前チェック

- [ ] プライバシーポリシーページ（位置情報の利用目的明示）
- [ ] 公開物に個人情報が残っていないか確認
