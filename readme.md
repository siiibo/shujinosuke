# Shujinosuke

![shujinosuke.png](shujinosuke.png)

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

- [Shujinoske slack app](https://api.slack.com/apps/A0108T7KFV0/general)のコラボレータに招待してもらう
- このリポジトリを clone して、以下実行

  ```sh
  asdf install
  asdf reshim yarn
  yarn
  ```

- `yarn clasp login`を実行
  - Shujinosuke の GAS プロジェクトにアクセスできるアカウントで[clasp](https://github.com/google/clasp)の設定
- 完全に新しいGASプロジェクトに移行する時は初回のみ以下の操作が必要（更新の場合は不要）
  - `yarn run buildpush` を実行
  - GASエディタを開き( `clasp open` )、 `init` 関数を実行する
    - 初回の実行時はGASに権限付与する必要があるので、画面にしたがって権限を付与する
    - `init` によってSlackTokenなど必要な情報がGASプロジェクトに登録される

### GitHub Secretsの登録

- GHAでclaspを利用するためにGitHub Secretsに値を設定する
  - 2021/06/21時点では `masaya.hirose@siiibo.com` の値が登録されている
- 設定する値は以下の通り
  - clasp の設定は `~/.clasprc.json`に保存されている（Mac の場合）

| KEY           | 説明                          |
| ------------- | ----------------------------- |
| ACCESS_TOKEN  | claspの設定                   |
| CLIENT_ID     | claspの設定                   |
| CLIENT_SECRET | claspの設定                   |
| DEPLOYMENT_ID | claspの設定                   |
| EXPIRY_DATE   | claspの設定                   |
| ID_TOKEN      | claspの設定                   |
| REFRESH_TOKEN | claspの設定                   |
| SCRIPT_ID     | GASプロジェクトのスクリプトID |

## 開発

### テスト環境

- テスト環境で開発する場合は `clasp deploy` で新規デプロイを行う
  - GASはデプロイの度に新規URLが作成されるので注意
  - コードを更新することが目的の場合は、新規デプロイではなくデプロイを更新する
    - デプロイの更新をするには `clasp deploy -i <deploymentID>` を実行する
- `https://api.slack.com/apps/A0108T7KFV0/event-subscriptions` からGASでデプロイしたWebAppのURL を設定
  - `https://script.google.com/macros/s/<deploymentID>/exec` のような値
- `https://api.slack.com/apps/A0108T7KFV0/interactive-messages` にも同じ値を設定
- 適当なテストチャンネルに"Shujinosuke"アプリをインストール、もしくはすでにインストール済みのチャンネルで作業
- チャンネルで、`@Shujinosuke status`と投稿して疎通確認
- すでにクラウドにデプロイしたものがある場合、上記開発作業が完了したらデプロイ先ドメインの値に戻す

### 本番環境

- GitHub リポジトリと同期しているので、GitHub に`master`ブランチを push すればデプロイされる
- ローカルでコードを変更した後手動でデプロイ
  - `yarn run buildpush` を実行
  - `clasp deploy -i <deploymentId>` を実行

## 補足

### TypeScriptを使ってローカルでGASの開発を行う方法

- GASはデフォルトではファイルモジュールがサポートされていない
  - ファイルを分割していてもグローバルスコープとなる
- ファイルモジュールが必要ない場合は `clasp` を利用するとTS→JSへのコンパイルを自動で行ってくれる
- ファイルモジュールを扱うにはローカルで設定する必要があり、Shujinosukeは `webpack` を利用することで実現している
  - 関連する設定ファイルは
    - [webpack.config.js](webpack.config.js)
    - [tsconfig.json](tsconfig.json)
- デプロイまでの流れは以下の通り
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
  - `https://gitpkg.now.sh/`を利用して `yarn install` している
