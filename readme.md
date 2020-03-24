# Shujinosuke

![](shujinosuke.png)

[Botkit](https://botkit.ai/docs/v4)で作成している Slack Bot です。

## 機能

- 週次定例 MTG のファシリテータ

## 開発

- [`ngrok`](https://ngrok.com/)をインストール
  - `brew cask install ngrok`など
- このリポジトリを clone して、以下実行
  ```
  asdf install
  asdf reshim yarn
  yarn
  yarn start
  ```
- `ngrok http 3000`で localhost を ngrok proxy 経由で Slack に露出
- https://api.slack.com/apps/A0108T7KFV0/event-subscriptions から ngrok proxy を設定
  - `https://<random hash>.ngrok.io/api/messages`のような値
- https://api.slack.com/apps/A0108T7KFV0/interactive-messages にも同じ値を設定
- 適当なテストチャンネルに"Shujinosuke"アプリをインストール、もしくはすでにインストール済みのチャンネルで作業
- チャンネルで、`@Shujinosuke status`と投稿して疎通確認
- すでにクラウドにデプロイしたものがある場合、上記開発作業が完了したらデプロイ先ドメインの値に戻す
