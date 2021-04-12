# Shujinosuke

![](shujinosuke.png)

Google Apps Script で作成している Slack Bot です。

※ 2021 年４月に Heroku から GAS 環境へ移行し、開発を JavaScript ではなく TypeScript で行うように変更しました。

## 機能

- 週次定例 MTG のファシリテータ
- 新規カスタム絵文字追加の通知

## ToDo

- [ ] 複数チャンネル対応
- [ ] 設定変更と永続化
- [ ] GASプロジェクトの保管場所の指定
## 環境構築

- [clasp](https://github.com/google/clasp)をインストール
  - GAS プロジェクトの開発をローカルで行うためのツール
  - `npm install -g @google/clasp` など（詳細はリンク先参照）
- Shujinosuke の GAS プロジェクトにアクセスできるアカウントで `clasp login`
- [Shujinoske slack app](https://api.slack.com/apps/A0108T7KFV0/general)のコラボレータに招待してもらう
- このリポジトリを clone して、以下実行
  ```sh
  asdf install
  asdf reshim yarn
  yarn
  ```

## 開発

### テスト環境

- テスト環境で開発する場合は `clasp deploy` で新規デプロイを行う
  - GASはデプロイの度に新規URLが作成されるので注意
  - コードを更新することが目的の場合は、新規デプロイではなくデプロイを更新する
    - デプロイの更新をするには `clasp deploy -i <deploymentID>` を実行する

- https://api.slack.com/apps/A0108T7KFV0/event-subscriptions からGASでデプロイしたWebAppのURL を設定
  - `https://script.google.com/macros/s/<deploymentID>/exec` のような値
- https://api.slack.com/apps/A0108T7KFV0/interactive-messages にも同じ値を設定
- 適当なテストチャンネルに"Shujinosuke"アプリをインストール、もしくはすでにインストール済みのチャンネルで作業
- チャンネルで、`@Shujinosuke status`と投稿して疎通確認
- すでにクラウドにデプロイしたものがある場合、上記開発作業が完了したらデプロイ先ドメインの値に戻す

### 本番環境

- ~~GitHub リポジトリと同期しているので、GitHub に`master`ブランチを push すればデプロイされる~~
  - GASへの移行後一時的に同期は解除されている
  - 近日中にGHAを用いて同期処理を実装する予定
- ローカルでコードを変更した後手動でデプロイ
  - `yarn run deploypush` を実行　
    - ビルドからデプロイまで自動で実行される
    - [package.json](package.json)のconfigに本番環境のデプロイIDが記述されている

## 補足

### TypeScriptを使ってローカルでGASの開発を行う方法

- GASはデフォルトではファイルモジュールがサポートされていない
  - ファイルを分割していてもグローバルスコープとなる
- ファイルモジュールが必要ない場合は `clasp` を利用するとTS→JSへのコンパイルを自動で行ってくれる
- ファイルモジュールを扱うにはローカルで設定する必要があり、Shujinosukeは `webpack` を利用することで実現している
  - 関連する設定ファイルは
    - [webpack.config.js](webpack.config.js)
    - [tsconfig.json](tsconfig.json)
- `yarn run deploypush` は以下のことを行っている
  - `webpack` でビルド
  - `clasp push` でコードをGAS環境にpush
  - `clasp deploy -i <deploymentID>` でデプロイの更新
- GASプロジェクトをローカルで管理する場合、以下の２つのファイルが必要
  - [.clasp.json](.clasp.json)
    - `clasp` でpushやdeployする対象のGASプロジェクトを設定
  - [appsscript.json](appsscript.json)
    - ランタイムやタイムゾーンなど、GAS側で必要な情報の設定
    - ブラウザ上で新規プロジェクトを作成する場合は自動で作成される
      - 初期設定ではオンラインエディタ上に表示されないようになっているが変更することで表示可能

### SlackのWebClientについて

- SlackのWebClientには [@slack/web-api](https://github.com/slackapi/node-slack-sdk)という公式ツールがある
- しかしGASはNode.jsと完全な互換性はないので上記ツールを利用することができない
- 上記ツールにはTypeScriptで開発する上で便利な情報が定義されているため、これをGASでも利用できるようにした
  - リンクは[hi-se/node-slack-sdk](https://github.com/hi-se/node-slack-sdk)
  - https://gitpkg.now.sh/を利用して `yarn install` している
