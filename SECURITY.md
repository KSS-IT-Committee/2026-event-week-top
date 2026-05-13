# Security Policy

日本語の説明は英語の下にあります。

## Supported Versions

This repository hosts the live website for the 2026 Koishikawa Secondary School event week. Only the
latest commit on the `main` branch (the version currently deployed) is
supported. Older branches and historical deployments do not receive security
fixes.

| Version          | Supported          |
| ---------------- | ------------------ |
| `main` (current) | :white_check_mark: |
| Older branches   | :x:                |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security problems.**

Use one of the following private channels instead:

1. **GitHub Private Vulnerability Reporting (preferred):**
   <https://github.com/KSS-IT-Committee/2026-event-week-top/security/advisories/new>
2. **Email:** koishikawa.itcommittee@gmail.com
   - If you can, encrypt sensitive details or share them through a private
     channel after we acknowledge your report.

When reporting, please include:

- A description of the issue and its potential impact.
- Steps to reproduce (URL, request, payload, screenshots, etc.).
- The commit hash or deployment URL where you observed the issue.
- Your suggested remediation, if you have one.

### What to expect

- **Acknowledgement:** within 3 days.
- **Initial assessment:** within 5 days of acknowledgement.
- **Fix or mitigation timeline:** communicated after assessment; we aim to
  ship fixes for confirmed high-severity issues within 7 days.
- **Disclosure:** coordinated with the reporter. We will credit you in the
  advisory unless you ask to remain anonymous.

## Scope

In scope:

- Source code in this repository.
- The production deployment served from this repository.

Out of scope:

- Vulnerabilities in third-party dependencies that are already publicly
  disclosed and tracked upstream — please report those to the upstream
  project. You may still notify us so we can update.
- Issues that require physical access, social engineering of committee
  members, or rate-limited brute force.
- Denial-of-service findings that only demonstrate volumetric attacks.
- Findings on infrastructure we do not control (Vercel, GitHub, npm, etc.).

## Safe Harbor

We will not pursue or support any legal action against researchers who:

- Make a good-faith effort to comply with this policy.
- Avoid privacy violations, data destruction, and service degradation.
- Give us reasonable time to address the issue before public disclosure.

---

# セキュリティポリシー (日本語)

## サポート対象バージョン

このリポジトリは小石川中等教育学校 2026 行事週間特設サイトを
管理しています。セキュリティ修正の対象は `main` ブランチの最新コミット
（現在公開中のバージョン）のみです。過去のブランチやデプロイには修正は
適用されません。

| バージョン    | サポート           |
| ------------- | ------------------ |
| `main` (最新) | :white_check_mark: |
| それ以外      | :x:                |

## 脆弱性の報告

**公開 Issue でのセキュリティ報告はしないでください。**

以下のいずれかの非公開チャネルを利用してください。

1. **GitHub Private Vulnerability Reporting（推奨）：**
   <https://github.com/KSS-IT-Committee/2026-event-week-top/security/advisories/new>
2. **メール：** koishikawa.itcommittee@gmail.com
   - 機微な情報は、最初の受領連絡のあと別チャネルで共有していただくか、
     可能であれば暗号化してください。

報告時には以下を含めてください。

- 問題の概要と想定される影響
- 再現手順（URL、リクエスト、ペイロード、スクリーンショット等）
- 確認したコミットハッシュまたはデプロイ URL
- 修正案（あれば）

### 対応の目安

- **受領連絡：** 3 日以内
- **初期評価：** 受領後 5 日以内
- **修正・緩和策の予定：** 評価後にご連絡します。重大度の高い確認済みの
  問題は、概ね 7 日以内の修正を目標とします。
- **公開：** 報告者と調整のうえで行い、希望されない場合を除き
  Advisory にお名前を記載します。

## 対象範囲

対象内:

- 本リポジトリのソースコード
- 本リポジトリからデプロイされている本番環境

対象外:

- 既に公開・追跡されているサードパーティ依存ライブラリの脆弱性
  （上流プロジェクトへ報告してください。共有いただければアップデートします。）
- 物理アクセス、運営メンバーへのソーシャルエンジニアリング、
  単純なブルートフォースを前提とする問題
- 容量攻撃のみを示す DoS の指摘
- 当委員会が管理していないインフラ（Vercel、GitHub、npm など）

## セーフハーバー

以下を遵守する善意の研究者に対して、当委員会は法的措置を取りません。

- 本ポリシーに沿って報告を行うこと
- プライバシー侵害、データ破壊、サービス停止を避けること
- 公開前に修正のための十分な時間を確保すること
