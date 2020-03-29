# Shujinosuke

![](shujinosuke.png)

[Botkit](https://botkit.ai/docs/v4)で作成している Slack Bot です。

## 機能

- 週次定例 MTG のファシリテータ

## 開発

- [Shujinoske slack app](https://api.slack.com/apps/A0108T7KFV0/general)のコラボレータに招待してもらう
- [`ngrok`](https://ngrok.com/)をインストール
  - `brew cask install ngrok`など
- このリポジトリを clone して、以下実行
  ```sh
  asdf install
  asdf reshim yarn
  yarn
  # 認証情報を上記リンクのページから取得して .env ファイルに入力
  yarn start
  ```
- `ngrok http 3000`で localhost を ngrok proxy 経由で Slack に露出
- https://api.slack.com/apps/A0108T7KFV0/event-subscriptions から ngrok proxy を設定
  - `https://<random hash>.ngrok.io/api/messages`のような値
- https://api.slack.com/apps/A0108T7KFV0/interactive-messages にも同じ値を設定
- 適当なテストチャンネルに"Shujinosuke"アプリをインストール、もしくはすでにインストール済みのチャンネルで作業
- チャンネルで、`@Shujinosuke status`と投稿して疎通確認
- すでにクラウドにデプロイしたものがある場合、上記開発作業が完了したらデプロイ先ドメインの値に戻す

## デプロイ

- [Heroku](https://dashboard.heroku.com/apps/shujinosuke)に free dyno でデプロイしている
  - アカウントは`tech@siiibo.com`。認証情報は既存メンバから取得する
  - [Heroku CLI]()をインストールすればローカルから情報の取得や設定ができる
    - ローカル開発時に`.env`に設定している認証情報は、Heroku では Config Var として設定する
  - 待ち受けポートは、自動的に Heroku によって`PORT`環境変数経由で設定される(Botkit は`PORT`環境変数に対応している)
- GitHub リポジトリと同期しているので、GitHub に`master`ブランチを push すればデプロイされる
- URL は https://shujinosuke.herokuapp.com
